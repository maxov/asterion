"""Tests for the saturn_rings_bjj processor."""

from pathlib import Path
from unittest.mock import patch

import numpy as np
from PIL import Image

from pipeline.processors.saturn_rings_bjj import (
    EXPECTED_SAMPLE_COUNT,
    _parse_color_file,
    _parse_scalar_file,
    saturn_rings_bjj,
)
from pipeline.sources import ExtraFile, Source

N = EXPECTED_SAMPLE_COUNT


def _make_source(**overrides: object) -> Source:
    defaults: dict[str, object] = {
        "id": "test_bjj",
        "description": "",
        "url": "",
        "sha256": "",
        "license": "",
        "attribution": "",
        "source_page": "",
        "processor": "saturn_rings_bjj",
        "output": "saturn_rings_scattering.png",
        "inner_radius_km": 74510.0,
        "outer_radius_km": 140390.0,
        "extra_outputs": ("saturn_rings_color.png",),
        "extra_files": (
            ExtraFile(name="backscattered", url="", sha256=""),
            ExtraFile(name="forwardscattered", url="", sha256=""),
            ExtraFile(name="unlitside", url="", sha256=""),
            ExtraFile(name="color", url="", sha256=""),
        ),
    }
    defaults.update(overrides)
    return Source(**defaults)  # type: ignore[arg-type]


def _write_scalar(path: Path, values: list[float]) -> None:
    """Write one float per line."""
    path.write_text("\n".join(f"{v:.6f}" for v in values) + "\n")


def _write_color_triplets(path: Path, colors: list[tuple[float, ...]]) -> None:
    """Write one 'R G B' triplet per line."""
    path.write_text(
        "\n".join(f"{r:.6f} {g:.6f} {b:.6f}" for r, g, b in colors) + "\n"
    )


def _write_color_sequential(
    path: Path, colors: list[tuple[float, ...]]
) -> None:
    """Write R, G, B on separate lines (3*N lines total)."""
    lines: list[str] = []
    for r, g, b in colors:
        lines.extend([f"{r:.6f}", f"{g:.6f}", f"{b:.6f}"])
    path.write_text("\n".join(lines) + "\n")


# --- Scalar parser tests ---


def test_parse_scalar_file(tmp_path: Path) -> None:
    values = [i / N for i in range(N)]
    p = tmp_path / "test.txt"
    _write_scalar(p, values)
    result = _parse_scalar_file(p)
    assert result.shape == (N,)
    assert abs(result[0] - 0.0) < 1e-5
    assert abs(result[-1] - (N - 1) / N) < 1e-5


def test_parse_scalar_file_wrong_count(tmp_path: Path) -> None:
    p = tmp_path / "bad.txt"
    _write_scalar(p, [0.5] * 100)
    try:
        _parse_scalar_file(p)
        assert False, "Should have raised"
    except ValueError as e:
        assert "expected 13177" in str(e).lower()


# --- Color parser tests ---


def test_parse_color_triplets(tmp_path: Path) -> None:
    colors = [(0.1, 0.2, 0.3)] * N
    p = tmp_path / "color.txt"
    _write_color_triplets(p, colors)
    result = _parse_color_file(p)
    assert result.shape == (N, 3)
    assert abs(result[0, 0] - 0.1) < 1e-5


def test_parse_color_sequential(tmp_path: Path) -> None:
    colors = [(0.4, 0.5, 0.6)] * N
    p = tmp_path / "color.txt"
    _write_color_sequential(p, colors)
    result = _parse_color_file(p)
    assert result.shape == (N, 3)
    assert abs(result[0, 0] - 0.4) < 1e-5
    assert abs(result[0, 2] - 0.6) < 1e-5


def test_parse_color_bad_count(tmp_path: Path) -> None:
    p = tmp_path / "color.txt"
    p.write_text("0.1 0.2 0.3\n" * 10)
    try:
        _parse_color_file(p)
        assert False, "Should have raised"
    except ValueError as e:
        assert "cannot parse" in str(e).lower()


# --- Full processor tests ---


def test_processor_outputs(tmp_path: Path) -> None:
    """Processor produces two images with correct dimensions and modes."""
    raw_dir = tmp_path / "raw"
    raw_dir.mkdir()

    # Write transparency (primary file)
    transparency_vals = [0.8] * N
    transparency_path = raw_dir / "test_bjj.txt"
    _write_scalar(transparency_path, transparency_vals)

    # Write extra files
    _write_scalar(raw_dir / "test_bjj_backscattered.txt", [0.5] * N)
    _write_scalar(raw_dir / "test_bjj_forwardscattered.txt", [0.3] * N)
    _write_scalar(raw_dir / "test_bjj_unlitside.txt", [0.1] * N)
    _write_color_triplets(
        raw_dir / "test_bjj_color.txt", [(0.9, 0.7, 0.5)] * N
    )

    inter = tmp_path / "inter"
    source = _make_source()

    with patch(
        "pipeline.processors.saturn_rings_bjj.raw_dir", return_value=raw_dir
    ):
        scattering_path, extra = saturn_rings_bjj(
            transparency_path, inter, source
        )

    # Check scattering output
    scattering = Image.open(scattering_path)
    assert scattering.size == (N, 1)
    assert scattering.mode == "RGBA"

    # Verify channel values at sample 0
    px = scattering.getpixel((0, 0))
    assert px[0] == round(0.5 * 255)  # R = backscattered
    assert px[1] == round(0.3 * 255)  # G = forwardscattered
    assert px[2] == round(0.1 * 255)  # B = unlitside
    assert px[3] == round(0.8 * 255)  # A = transparency

    # Check color output
    extra_paths = extra["_extra_output_paths"]
    assert len(extra_paths) == 1
    color_img = Image.open(extra_paths[0])
    assert color_img.size == (N, 1)
    assert color_img.mode == "RGB"
    cpx = color_img.getpixel((0, 0))
    assert cpx[0] == round(0.9 * 255)
    assert cpx[1] == round(0.7 * 255)
    assert cpx[2] == round(0.5 * 255)

    # Check provenance metadata
    assert extra["inner_radius_km"] == 74510.0
    assert extra["outer_radius_km"] == 140390.0
    assert extra["sample_count"] == N
    assert extra["radial_resolution_km"] == 5
    assert "channel_semantics" in extra
    assert "raw_file_hashes" in extra
    assert len(extra["raw_file_hashes"]) == 5


def test_processor_varying_values(tmp_path: Path) -> None:
    """Verify that distinct values at specific indices survive the pipeline."""
    raw_dir = tmp_path / "raw"
    raw_dir.mkdir()

    # Ramp from 0 to 1 across all samples
    ramp = [i / (N - 1) for i in range(N)]
    inv_ramp = [1.0 - v for v in ramp]

    transparency_path = raw_dir / "test_bjj.txt"
    _write_scalar(transparency_path, ramp)
    _write_scalar(raw_dir / "test_bjj_backscattered.txt", inv_ramp)
    _write_scalar(raw_dir / "test_bjj_forwardscattered.txt", ramp)
    _write_scalar(raw_dir / "test_bjj_unlitside.txt", [0.0] * N)
    _write_color_triplets(
        raw_dir / "test_bjj_color.txt",
        [(i / (N - 1), 0.0, 1.0 - i / (N - 1)) for i in range(N)],
    )

    inter = tmp_path / "inter"
    source = _make_source()

    with patch(
        "pipeline.processors.saturn_rings_bjj.raw_dir", return_value=raw_dir
    ):
        scattering_path, extra = saturn_rings_bjj(
            transparency_path, inter, source
        )

    scattering = Image.open(scattering_path)

    # First sample: backscattered=1.0, forwardscattered=0.0, transparency=0.0
    px0 = scattering.getpixel((0, 0))
    assert px0[0] == 255  # R = backscattered = 1.0
    assert px0[1] == 0  # G = forwardscattered = 0.0
    assert px0[3] == 0  # A = transparency = 0.0

    # Last sample: backscattered=0.0, forwardscattered=1.0, transparency=1.0
    px_last = scattering.getpixel((N - 1, 0))
    assert px_last[0] == 0  # R = backscattered = 0.0
    assert px_last[1] == 255  # G = forwardscattered = 1.0
    assert px_last[3] == 255  # A = transparency = 1.0

    # Middle sample
    mid = N // 2
    px_mid = scattering.getpixel((mid, 0))
    expected_mid = round(mid / (N - 1) * 255)
    assert abs(px_mid[1] - expected_mid) <= 1  # G ~ 0.5

"""Tests for the saturn_rings processor."""

from pathlib import Path
from unittest.mock import patch

import numpy as np
from PIL import Image

from pipeline.processors.saturn_rings import saturn_rings
from pipeline.sources import Source


def _make_source(**overrides: object) -> Source:
    defaults: dict[str, object] = {
        "id": "test_rings",
        "description": "",
        "url": "",
        "sha256": "",
        "license": "",
        "attribution": "",
        "source_page": "",
        "processor": "saturn_rings",
        "output": "test_rings.png",
        "max_width": 0,
        "ring_input": "combined_rgba",
        "inner_radius_km": 74510.0,
        "outer_radius_km": 140245.0,
    }
    defaults.update(overrides)
    return Source(**defaults)  # type: ignore[arg-type]


def test_combined_rgba_2d_takes_middle_row(tmp_path: Path) -> None:
    """A 2D RGBA image is collapsed to 1px height using the middle row."""
    arr = np.zeros((10, 100, 4), dtype=np.uint8)
    # Middle row (row 5) has distinct values
    arr[5, :, 0] = 200  # R
    arr[5, :, 1] = 100  # G
    arr[5, :, 2] = 50  # B
    arr[5, :, 3] = 128  # A

    img = Image.fromarray(arr, "RGBA")
    raw = tmp_path / "raw" / "test.png"
    raw.parent.mkdir()
    img.save(raw)

    inter = tmp_path / "inter"
    source = _make_source()

    out_path, extra = saturn_rings(raw, inter, source)

    result = Image.open(out_path)
    assert result.size[1] == 1  # height = 1
    assert result.size[0] == 100  # width preserved
    assert result.mode == "RGBA"

    # Verify it's the middle row
    px = result.getpixel((0, 0))
    assert px == (200, 100, 50, 128)

    assert extra["ring_input_mode"] == "combined_rgba"
    assert extra["inner_radius_km"] == 74510.0
    assert extra["outer_radius_km"] == 140245.0
    assert extra["output_width"] == 100
    assert extra["input_dimensions"] == [100, 10]


def test_combined_rgba_1d_passthrough(tmp_path: Path) -> None:
    """A 1px-high strip is kept as-is without collapsing."""
    arr = np.full((1, 50, 4), 77, dtype=np.uint8)
    img = Image.fromarray(arr, "RGBA")
    raw = tmp_path / "raw" / "test.png"
    raw.parent.mkdir()
    img.save(raw)

    inter = tmp_path / "inter"
    source = _make_source()

    out_path, extra = saturn_rings(raw, inter, source)

    result = Image.open(out_path)
    assert result.size == (50, 1)
    assert extra["output_width"] == 50


def test_color_plus_transparency(tmp_path: Path) -> None:
    """Separate color + transparency images are combined into RGBA."""
    color = Image.new("RGB", (80, 10), color=(200, 100, 50))
    trans = Image.new("L", (80, 10), color=128)

    raw_dir = tmp_path / "raw"
    raw_dir.mkdir()
    color_path = raw_dir / "test_rings.png"
    trans_path = raw_dir / "test_rings_transparency.png"
    color.save(color_path)
    trans.save(trans_path)

    inter = tmp_path / "inter"
    source = _make_source(ring_input="color_plus_transparency")

    # Patch raw_dir to point to our tmp directory
    with patch("pipeline.processors.saturn_rings.raw_dir", return_value=raw_dir):
        out_path, extra = saturn_rings(color_path, inter, source)

    result = Image.open(out_path)
    assert result.size[1] == 1  # collapsed to 1px height
    assert result.mode == "RGBA"

    px = result.getpixel((0, 0))
    assert px == (200, 100, 50, 128)

    assert extra["ring_input_mode"] == "color_plus_transparency"


def test_horizontal_resize(tmp_path: Path) -> None:
    """max_width resizes horizontally while keeping height at 1."""
    arr = np.full((1, 8000, 4), 100, dtype=np.uint8)
    img = Image.fromarray(arr, "RGBA")
    raw = tmp_path / "raw" / "test.png"
    raw.parent.mkdir()
    img.save(raw)

    inter = tmp_path / "inter"
    source = _make_source(max_width=4096)

    out_path, extra = saturn_rings(raw, inter, source)

    result = Image.open(out_path)
    assert result.size == (4096, 1)
    assert extra["output_width"] == 4096

"""Tests for the earth_clouds processor."""

from pathlib import Path
from unittest.mock import patch

import numpy as np
from PIL import Image

from pipeline.processors.earth_clouds import earth_clouds
from pipeline.sources import ExtraFile, Source


def _make_source() -> Source:
    return Source(
        id="earth_clouds_svs",
        description="test",
        url="https://example.com/clouds.jpg",
        sha256="",
        license="Public Domain",
        attribution="NASA",
        source_page="https://example.com",
        processor="earth_clouds",
        output="earth_clouds.png",
        extra_files=(
            ExtraFile(
                name="no_clouds",
                url="https://example.com/no_clouds.jpg",
                sha256="",
            ),
        ),
    )


def test_processor_builds_rgba_cloud_mask(tmp_path: Path) -> None:
    raw = tmp_path / "raw"
    raw.mkdir()

    base_rgb = np.full((2, 4, 3), 64, dtype=np.uint8)
    clouds_rgb = base_rgb.copy()
    clouds_rgb[0, 1] = [255, 255, 255]
    clouds_rgb[1, 2] = [180, 180, 180]

    clouds_path = raw / "earth_clouds_svs.jpg"
    no_clouds_path = raw / "earth_clouds_svs_no_clouds.jpg"
    Image.fromarray(clouds_rgb, "RGB").save(clouds_path, quality=100, subsampling=0)
    Image.fromarray(base_rgb, "RGB").save(no_clouds_path, quality=100, subsampling=0)

    inter = tmp_path / "inter"
    source = _make_source()

    with patch("pipeline.processors.earth_clouds.raw_dir", return_value=raw):
        out_path, extra = earth_clouds(clouds_path, inter, source)

    assert out_path.exists()
    out = Image.open(out_path).convert("RGBA")
    arr = np.asarray(out)

    assert out.size == (4, 2)
    assert np.all(arr[..., :3] == 255)
    assert arr[0, 1, 3] > 240
    assert 0 < arr[1, 2, 3] < 240
    assert arr[0, 0, 3] == 0
    assert extra["output_format"] == "png"
    assert extra["raw_file_hashes"]["with_clouds"]
    assert extra["raw_file_hashes"]["no_clouds"]


def test_mismatched_input_sizes_raise(tmp_path: Path) -> None:
    raw = tmp_path / "raw"
    raw.mkdir()

    clouds_path = raw / "earth_clouds_svs.jpg"
    no_clouds_path = raw / "earth_clouds_svs_no_clouds.jpg"
    Image.new("RGB", (8, 4), (0, 0, 0)).save(clouds_path)
    Image.new("RGB", (4, 2), (0, 0, 0)).save(no_clouds_path)

    with patch("pipeline.processors.earth_clouds.raw_dir", return_value=raw):
        try:
            earth_clouds(clouds_path, tmp_path / "inter", _make_source())
        except ValueError as exc:
            assert "size mismatch" in str(exc)
        else:
            raise AssertionError("expected ValueError for mismatched sizes")

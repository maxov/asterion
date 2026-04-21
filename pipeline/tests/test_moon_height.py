"""Tests for the moon_height processor."""

from pathlib import Path

import numpy as np
from PIL import Image

from pipeline.processors.moon_height import moon_height
from pipeline.sources import Source


def _make_source(**overrides: object) -> Source:
    defaults: dict[str, object] = {
        "id": "moon_height_test",
        "description": "",
        "url": "",
        "sha256": "",
        "license": "",
        "attribution": "",
        "source_page": "",
        "processor": "moon_height",
        "output": "moon_height.png",
        "max_width": 0,
    }
    defaults.update(overrides)
    return Source(**defaults)  # type: ignore[arg-type]


def test_quantizes_uint16_height_to_linear_8bit(tmp_path: Path) -> None:
    """The processor preserves the source's linear unsigned height encoding."""
    raw_values = np.array(
        [
            [0, 20_000, 40_000, 65_535],
            [0, 20_000, 40_000, 65_535],
        ],
        dtype=np.uint16,
    )
    raw = tmp_path / "raw" / "moon_height.tif"
    raw.parent.mkdir()
    Image.fromarray(raw_values).save(raw)

    out_path, extra = moon_height(raw, tmp_path / "inter", _make_source())

    result = np.asarray(Image.open(out_path), dtype=np.uint8)
    expected = np.array(
        [
            [0, 78, 156, 255],
            [0, 78, 156, 255],
        ],
        dtype=np.uint8,
    )

    assert result.shape == (2, 4)
    assert np.array_equal(result, expected)
    assert extra["output_format"] == "png"
    assert extra["source_encoding"] == "uint16 half-meters with +10 km offset"
    assert extra["displacement_bias_m"] == -10_000.0
    assert extra["displacement_scale_m"] == 32_767.5
    assert extra["height_reference_radius_m"] == 1_737_400.0


def test_resizes_to_max_width(tmp_path: Path) -> None:
    """The processor downsamples the height map when max_width is set."""
    raw_values = np.full((12, 24), 24_000, dtype=np.uint16)
    raw = tmp_path / "raw" / "moon_height.tif"
    raw.parent.mkdir()
    Image.fromarray(raw_values).save(raw)

    _, extra = moon_height(raw, tmp_path / "inter", _make_source(max_width=16))

    assert extra["input_dimensions"] == [24, 12]
    assert extra["output_dimensions"] == [16, 8]

"""Tests for the starfield processor."""

from pathlib import Path

import pytest
from PIL import Image

from pipeline.processors.starfield import starfield
from pipeline.sources import Source


def _make_source(**overrides: object) -> Source:
    defaults: dict[str, object] = {
        "id": "test_starfield",
        "description": "",
        "url": "",
        "sha256": "",
        "license": "",
        "attribution": "",
        "source_page": "",
        "processor": "starfield",
        "output": "milky_way.jpg",
        "max_width": 0,
        "coordinate_frame": "galactic",
    }
    defaults.update(overrides)
    return Source(**defaults)  # type: ignore[arg-type]


def test_basic_rgb_2to1(tmp_path: Path) -> None:
    """A 2:1 RGB image passes through with correct dimensions and provenance."""
    img = Image.new("RGB", (200, 100), color=(64, 64, 64))
    raw = tmp_path / "raw" / "test.jpg"
    raw.parent.mkdir()
    img.save(raw)

    inter = tmp_path / "inter"
    source = _make_source()

    out_path, extra = starfield(raw, inter, source)

    result = Image.open(out_path)
    assert result.size == (200, 100)
    assert result.mode == "RGB"
    assert out_path.suffix == ".jpg"
    assert extra["input_dimensions"] == [200, 100]
    assert extra["output_dimensions"] == [200, 100]
    assert extra["color_space"] == "sRGB"
    assert extra["projection"] == "equirectangular"
    assert extra["coordinate_frame"] == "galactic"


def test_resize_to_max_width(tmp_path: Path) -> None:
    """Images wider than max_width are resized preserving aspect ratio."""
    img = Image.new("RGB", (8192, 4096))
    raw = tmp_path / "raw" / "big.jpg"
    raw.parent.mkdir()
    img.save(raw)

    inter = tmp_path / "inter"
    source = _make_source(max_width=4096)

    out_path, extra = starfield(raw, inter, source)

    result = Image.open(out_path)
    assert result.size == (4096, 2048)
    assert extra["input_dimensions"] == [8192, 4096]
    assert extra["output_dimensions"] == [4096, 2048]


def test_no_resize_when_under_max(tmp_path: Path) -> None:
    """Images under max_width are not resized."""
    img = Image.new("RGB", (2000, 1000))
    raw = tmp_path / "raw" / "small.jpg"
    raw.parent.mkdir()
    img.save(raw)

    inter = tmp_path / "inter"
    source = _make_source(max_width=8192)

    _, extra = starfield(raw, inter, source)
    assert extra["output_dimensions"] == [2000, 1000]


def test_rgba_converted_to_rgb(tmp_path: Path) -> None:
    """RGBA input is converted to RGB."""
    img = Image.new("RGBA", (100, 50), color=(64, 64, 64, 255))
    raw = tmp_path / "raw" / "test.png"
    raw.parent.mkdir()
    img.save(raw)

    inter = tmp_path / "inter"
    source = _make_source()

    out_path, _ = starfield(raw, inter, source)

    result = Image.open(out_path)
    assert result.mode == "RGB"


def test_output_is_always_jpg(tmp_path: Path) -> None:
    """Output is always JPG regardless of input format."""
    img = Image.new("RGB", (200, 100))
    raw = tmp_path / "raw" / "test.png"
    raw.parent.mkdir()
    img.save(raw)

    inter = tmp_path / "inter"
    source = _make_source()

    out_path, _ = starfield(raw, inter, source)
    assert out_path.suffix == ".jpg"


def test_equatorial_frame_recorded(tmp_path: Path) -> None:
    """Equatorial coordinate_frame is passed through to provenance."""
    img = Image.new("RGB", (200, 100))
    raw = tmp_path / "raw" / "test.jpg"
    raw.parent.mkdir()
    img.save(raw)

    inter = tmp_path / "inter"
    source = _make_source(coordinate_frame="equatorial")

    _, extra = starfield(raw, inter, source)
    assert extra["coordinate_frame"] == "equatorial"


def test_missing_coordinate_frame_raises(tmp_path: Path) -> None:
    """Missing coordinate_frame raises ValueError."""
    img = Image.new("RGB", (200, 100))
    raw = tmp_path / "raw" / "test.jpg"
    raw.parent.mkdir()
    img.save(raw)

    inter = tmp_path / "inter"
    source = _make_source(coordinate_frame="")

    with pytest.raises(ValueError, match="coordinate_frame is required"):
        starfield(raw, inter, source)


def test_invalid_coordinate_frame_raises(tmp_path: Path) -> None:
    """Invalid coordinate_frame raises ValueError."""
    img = Image.new("RGB", (200, 100))
    raw = tmp_path / "raw" / "test.jpg"
    raw.parent.mkdir()
    img.save(raw)

    inter = tmp_path / "inter"
    source = _make_source(coordinate_frame="altazimuth")

    with pytest.raises(ValueError, match="invalid"):
        starfield(raw, inter, source)

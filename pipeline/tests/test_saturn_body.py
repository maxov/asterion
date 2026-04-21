"""Tests for the saturn_body processor."""

from pathlib import Path

from PIL import Image

from pipeline.processors.saturn_body import saturn_body
from pipeline.sources import Source


def _make_source(**overrides: object) -> Source:
    defaults: dict[str, object] = {
        "id": "test_body",
        "description": "",
        "url": "",
        "sha256": "",
        "license": "",
        "attribution": "",
        "source_page": "",
        "processor": "saturn_body",
        "output": "test.jpg",
        "max_width": 0,
    }
    defaults.update(overrides)
    return Source(**defaults)  # type: ignore[arg-type]


def test_basic_rgb_2to1(tmp_path: Path) -> None:
    """A 2:1 RGB image passes through with correct dimensions."""
    img = Image.new("RGB", (200, 100), color=(128, 64, 32))
    raw = tmp_path / "raw" / "test.jpg"
    raw.parent.mkdir()
    img.save(raw)

    inter = tmp_path / "inter"
    source = _make_source()

    out_path, extra = saturn_body(raw, inter, source)

    result = Image.open(out_path)
    assert result.size == (200, 100)
    assert result.mode == "RGB"
    assert extra["input_dimensions"] == [200, 100]
    assert extra["output_dimensions"] == [200, 100]
    assert extra["output_format"] == "jpg"
    assert extra["color_space"] == "sRGB"


def test_resize_to_max_width(tmp_path: Path) -> None:
    """Images wider than max_width are resized with correct aspect ratio."""
    img = Image.new("RGB", (8000, 4000))
    raw = tmp_path / "raw" / "big.jpg"
    raw.parent.mkdir()
    img.save(raw)

    inter = tmp_path / "inter"
    source = _make_source(max_width=4096)

    out_path, extra = saturn_body(raw, inter, source)

    result = Image.open(out_path)
    assert result.size[0] == 4096
    assert result.size[1] == 2048
    assert extra["input_dimensions"] == [8000, 4000]
    assert extra["output_dimensions"] == [4096, 2048]


def test_no_resize_when_under_max(tmp_path: Path) -> None:
    """Images under max_width are not resized."""
    img = Image.new("RGB", (2000, 1000))
    raw = tmp_path / "raw" / "small.jpg"
    raw.parent.mkdir()
    img.save(raw)

    inter = tmp_path / "inter"
    source = _make_source(max_width=4096)

    _, extra = saturn_body(raw, inter, source)
    assert extra["output_dimensions"] == [2000, 1000]


def test_rgba_converted_to_rgb(tmp_path: Path) -> None:
    """RGBA input is converted to RGB."""
    img = Image.new("RGBA", (100, 50), color=(128, 64, 32, 255))
    raw = tmp_path / "raw" / "test.png"
    raw.parent.mkdir()
    img.save(raw)

    inter = tmp_path / "inter"
    source = _make_source()

    out_path, _ = saturn_body(raw, inter, source)

    result = Image.open(out_path)
    assert result.mode == "RGB"


def test_png_output_format(tmp_path: Path) -> None:
    """Output format is PNG when source.output ends in .png."""
    img = Image.new("RGB", (200, 100))
    raw = tmp_path / "raw" / "test.jpg"
    raw.parent.mkdir()
    img.save(raw)

    inter = tmp_path / "inter"
    source = _make_source(output="test.png")

    out_path, extra = saturn_body(raw, inter, source)

    assert out_path.suffix == ".png"
    assert extra["output_format"] == "png"

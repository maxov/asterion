"""Body texture processor — validates and resizes equirectangular maps."""

from __future__ import annotations

from contextlib import contextmanager
from pathlib import Path
from typing import Any

from PIL import Image

from pipeline.sources import Source


@contextmanager
def _allow_large_trusted_images():
    """Temporarily disable Pillow's decompression-bomb guard.

    This pipeline only opens curated, explicitly configured source files, and
    several official planetary GeoTIFF basemaps exceed Pillow's default pixel
    threshold while still being legitimate inputs.
    """
    previous_limit = Image.MAX_IMAGE_PIXELS
    Image.MAX_IMAGE_PIXELS = None
    try:
        yield
    finally:
        Image.MAX_IMAGE_PIXELS = previous_limit


def body_texture(
    raw_path: Path, intermediate_dir: Path, source: Source
) -> tuple[Path, dict[str, Any]]:
    """Process an equirectangular planetary or moon body map.

    Validates 2:1 aspect ratio, converts to RGB, optionally resizes,
    and outputs as JPG (quality 95) or PNG based on source.output extension.
    """
    intermediate_dir.mkdir(parents=True, exist_ok=True)

    with _allow_large_trusted_images():
        img = Image.open(raw_path)
        input_w, input_h = img.size

        # Validate aspect ratio (warn, don't fail)
        ratio = input_w / input_h
        if abs(ratio - 2.0) > 0.01:
            print(
                f"    WARNING: expected 2:1 aspect ratio, "
                f"got {input_w}x{input_h} ({ratio:.3f}:1)"
            )

        # Convert to RGB if needed
        if img.mode != "RGB":
            img = img.convert("RGB")

        # Optional resize
        if source.max_width and input_w > source.max_width:
            new_h = round(source.max_width * input_h / input_w)
            img = img.resize((source.max_width, new_h), Image.LANCZOS)

        output_w, output_h = img.size

        # Determine output format from source.output
        out_ext = Path(source.output).suffix.lower()
        if out_ext == ".png":
            out_name = raw_path.stem + ".png"
            save_kwargs: dict[str, Any] = {}
        else:
            out_name = raw_path.stem + ".jpg"
            save_kwargs = {"quality": 95}

        out_path = intermediate_dir / out_name

        # Save clean (no metadata)
        clean = Image.new(img.mode, img.size)
        clean.paste(img)
        clean.save(out_path, **save_kwargs)

    extra = {
        "input_dimensions": [input_w, input_h],
        "output_dimensions": [output_w, output_h],
        "output_format": out_ext.lstrip("."),
        "color_space": "sRGB",
    }

    return out_path, extra


def saturn_body(
    raw_path: Path, intermediate_dir: Path, source: Source
) -> tuple[Path, dict[str, Any]]:
    """Backward-compatible alias for legacy Saturn registry entries."""
    return body_texture(raw_path, intermediate_dir, source)

"""Starfield processor — validates and re-encodes equirectangular panoramas."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from PIL import Image

from pipeline.sources import Source

_VALID_FRAMES = ("galactic", "equatorial")


def starfield(
    raw_path: Path, intermediate_dir: Path, source: Source
) -> tuple[Path, dict[str, Any]]:
    """Process an equirectangular starfield panorama.

    Validates 2:1 aspect ratio, converts to RGB, optionally resizes,
    and outputs as JPG (quality 92), stripping all metadata.
    """
    if not source.coordinate_frame:
        raise ValueError(
            f"starfield source '{source.id}': "
            f"coordinate_frame is required (one of {_VALID_FRAMES})"
        )
    if source.coordinate_frame not in _VALID_FRAMES:
        raise ValueError(
            f"starfield source '{source.id}': "
            f"coordinate_frame '{source.coordinate_frame}' invalid, "
            f"must be one of {_VALID_FRAMES}"
        )

    intermediate_dir.mkdir(parents=True, exist_ok=True)

    img = Image.open(raw_path)
    input_w, input_h = img.size

    # Validate 2:1 aspect ratio (warn, don't fail)
    ratio = input_w / input_h
    if abs(ratio - 2.0) > 0.01:
        print(
            f"    WARNING: expected 2:1 aspect ratio, "
            f"got {input_w}x{input_h} ({ratio:.3f}:1)"
        )

    # Convert to RGB if needed
    if img.mode != "RGB":
        img = img.convert("RGB")

    # Optional resize to max_width
    if source.max_width and input_w > source.max_width:
        new_h = round(source.max_width * input_h / input_w)
        img = img.resize((source.max_width, new_h), Image.LANCZOS)

    output_w, output_h = img.size

    out_path = intermediate_dir / (raw_path.stem + ".jpg")

    # Save clean (no metadata)
    clean = Image.new(img.mode, img.size)
    clean.paste(img)
    clean.save(out_path, quality=92)

    extra = {
        "input_dimensions": [input_w, input_h],
        "output_dimensions": [output_w, output_h],
        "color_space": "sRGB",
        "projection": "equirectangular",
        "coordinate_frame": source.coordinate_frame,
    }

    return out_path, extra

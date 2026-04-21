"""Moon height processor — converts LOLA uint16 displacement TIFFs to PNG."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image

from pipeline.sources import Source

_REFERENCE_RADIUS_M = 1_737_400.0
_UNSIGNED_OFFSET_HALF_METERS = 20_000
_UINT16_MAX = 65_535


def moon_height(
    raw_path: Path, intermediate_dir: Path, source: Source
) -> tuple[Path, dict[str, Any]]:
    """Process a Moon displacement TIFF into a browser-friendly grayscale PNG.

    The CGI Moon Kit publishes unsigned 16-bit TIFFs in half-meter units with a
    +10 km offset applied to keep all samples positive. This processor preserves
    that linear encoding, but quantizes it to 8-bit so the asset can be loaded
    by standard browser image decoders.
    """
    intermediate_dir.mkdir(parents=True, exist_ok=True)

    img = Image.open(raw_path)
    input_w, input_h = img.size

    ratio = input_w / input_h
    if abs(ratio - 2.0) > 0.01:
        print(
            f"    WARNING: expected 2:1 aspect ratio, "
            f"got {input_w}x{input_h} ({ratio:.3f}:1)"
        )

    height_img = img if img.mode == "I;16" else img.convert("I;16")
    if source.max_width and input_w > source.max_width:
        new_h = round(source.max_width * input_h / input_w)
        height_img = height_img.resize((source.max_width, new_h), Image.LANCZOS)

    samples_u16 = np.asarray(height_img, dtype=np.uint16)
    output_h, output_w = samples_u16.shape

    # Preserve the source's linear unsigned encoding: 0..65535 -> 0..255.
    samples_u8 = (
        (samples_u16.astype(np.uint32) * 255 + (_UINT16_MAX // 2)) // _UINT16_MAX
    ).astype(np.uint8)

    out_path = intermediate_dir / f"{raw_path.stem}.png"
    clean = Image.fromarray(samples_u8, mode="L")
    clean.save(out_path)

    source_value_min = int(samples_u16.min())
    source_value_max = int(samples_u16.max())
    displacement_bias_m = -_UNSIGNED_OFFSET_HALF_METERS * 0.5
    displacement_scale_m = _UINT16_MAX * 0.5

    extra = {
        "input_dimensions": [input_w, input_h],
        "output_dimensions": [output_w, output_h],
        "output_format": "png",
        "color_space": "data",
        "source_encoding": "uint16 half-meters with +10 km offset",
        "output_encoding": "8-bit linear grayscale preserving uint16 range",
        "height_reference_radius_m": _REFERENCE_RADIUS_M,
        "displacement_bias_m": displacement_bias_m,
        "displacement_scale_m": displacement_scale_m,
        "source_value_range": [source_value_min, source_value_max],
        "height_range_m": [
            (source_value_min - _UNSIGNED_OFFSET_HALF_METERS) * 0.5,
            (source_value_max - _UNSIGNED_OFFSET_HALF_METERS) * 0.5,
        ],
    }

    return out_path, extra

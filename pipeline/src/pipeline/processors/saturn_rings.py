"""Saturn rings processor — combines ring textures into a 1px-high RGBA strip."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image

from pipeline.paths import raw_dir
from pipeline.sources import Source


def _find_transparency_file(source: Source) -> Path:
    """Locate the transparency raw file for a source."""
    raw = raw_dir()
    candidates = list(raw.glob(f"{source.id}_transparency.*"))
    if not candidates:
        raise FileNotFoundError(
            f"{source.id}: no transparency file found in {raw}. "
            f"Expected data/raw/{source.id}_transparency.<ext>"
        )
    if len(candidates) > 1:
        raise FileNotFoundError(
            f"{source.id}: multiple transparency files found: {candidates}"
        )
    return candidates[0]


def saturn_rings(
    raw_path: Path, intermediate_dir: Path, source: Source
) -> tuple[Path, dict[str, Any]]:
    """Process Saturn ring texture(s) into a 1px-high RGBA PNG strip.

    Supports two input modes via source.ring_input:
    - combined_rgba: single RGBA image (RGB=color, A=opacity)
    - color_plus_transparency: separate RGB color + grayscale transparency images
    """
    intermediate_dir.mkdir(parents=True, exist_ok=True)

    ring_input = source.ring_input
    if not ring_input:
        raise ValueError(
            f"{source.id}: ring_input field is required for saturn_rings processor"
        )

    if ring_input == "combined_rgba":
        img = Image.open(raw_path)
        if img.mode != "RGBA":
            raise ValueError(
                f"{source.id}: expected RGBA image for combined_rgba mode, "
                f"got {img.mode}"
            )
        rgba = img

    elif ring_input == "color_plus_transparency":
        color_img = Image.open(raw_path).convert("RGB")
        trans_path = _find_transparency_file(source)
        trans_img = Image.open(trans_path).convert("L")

        # Resize transparency to match color if dimensions differ
        if color_img.size != trans_img.size:
            trans_img = trans_img.resize(color_img.size, Image.LANCZOS)

        # Combine: RGB from color, A from transparency
        rgba = Image.merge("RGBA", (*color_img.split(), trans_img))

    else:
        raise ValueError(
            f"{source.id}: unknown ring_input mode '{ring_input}'. "
            f"Expected 'combined_rgba' or 'color_plus_transparency'."
        )

    input_w, input_h = rgba.size

    # Collapse to 1D strip by taking the middle row (not averaging —
    # ring features like the Cassini Division are sharp)
    if input_h > 1:
        arr = np.array(rgba)
        mid = input_h // 2
        row = arr[mid : mid + 1, :, :]  # shape (1, W, 4)
        rgba = Image.fromarray(row, "RGBA")

    # Optional horizontal resize
    current_w = rgba.size[0]
    if source.max_width and current_w > source.max_width:
        rgba = rgba.resize((source.max_width, 1), Image.LANCZOS)

    output_w = rgba.size[0]

    out_path = intermediate_dir / (raw_path.stem + ".png")

    # Save clean (strip metadata)
    clean = Image.new("RGBA", rgba.size)
    clean.paste(rgba)
    clean.save(out_path)

    extra: dict[str, Any] = {
        "ring_input_mode": ring_input,
        "inner_radius_km": source.inner_radius_km,
        "outer_radius_km": source.outer_radius_km,
        "output_width": output_w,
        "input_dimensions": [input_w, input_h],
    }

    return out_path, extra

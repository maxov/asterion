"""Earth clouds processor — derive an RGBA cloud layer from paired NASA SVS
equirectangular maps.

Input:
- raw_path: Earth map with clouds
- extra file "no_clouds": matching Earth map without clouds

Output:
- earth_clouds.png — RGBA equirectangular cloud texture
  RGB = white
  A   = inferred cloud opacity
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image

from pipeline.hashing import sha256_file
from pipeline.paths import raw_dir
from pipeline.sources import Source


def _find_extra_file(source: Source, name: str) -> Path:
    """Locate an extra file by name in data/raw/."""
    raw = raw_dir()
    candidates = list(raw.glob(f"{source.id}_{name}.*"))
    if not candidates:
        raise FileNotFoundError(
            f"{source.id}: extra file '{name}' not found in {raw}. "
            f"Expected data/raw/{source.id}_{name}.<ext>"
        )
    if len(candidates) > 1:
        raise FileNotFoundError(
            f"{source.id}: multiple files for '{name}': {candidates}"
        )
    return candidates[0]


def _smoothstep(edge0: float, edge1: float, value: np.ndarray) -> np.ndarray:
    """Hermite smoothstep over a numpy array."""
    t = np.clip((value - edge0) / (edge1 - edge0), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def _extra_file_url(source: Source, name: str) -> str:
    """Look up the declared URL for an extra file."""
    for extra in source.extra_files:
        if extra.name == name:
            return extra.url
    return ""


def earth_clouds(
    raw_path: Path, intermediate_dir: Path, source: Source
) -> tuple[Path, dict[str, Any]]:
    """Generate an RGBA cloud texture from paired 'with clouds' / 'no clouds' maps.

    The alpha channel is estimated from the positive brightening caused by clouds,
    assuming a bright cloud layer composited over the base Earth map.
    """
    intermediate_dir.mkdir(parents=True, exist_ok=True)

    no_clouds_path = _find_extra_file(source, "no_clouds")

    clouds_img = Image.open(raw_path).convert("RGB")
    no_clouds_img = Image.open(no_clouds_path).convert("RGB")

    input_w, input_h = clouds_img.size
    no_clouds_w, no_clouds_h = no_clouds_img.size

    if (input_w, input_h) != (no_clouds_w, no_clouds_h):
        raise ValueError(
            f"{source.id}: source image size mismatch: "
            f"{input_w}x{input_h} vs {no_clouds_w}x{no_clouds_h}"
        )

    ratio = input_w / input_h
    if abs(ratio - 2.0) > 0.01:
        print(
            f"    WARNING: expected 2:1 aspect ratio, "
            f"got {input_w}x{input_h} ({ratio:.3f}:1)"
        )

    if source.max_width and input_w > source.max_width:
        new_h = round(source.max_width * input_h / input_w)
        size = (source.max_width, new_h)
        clouds_img = clouds_img.resize(size, Image.LANCZOS)
        no_clouds_img = no_clouds_img.resize(size, Image.LANCZOS)

    clouds = np.asarray(clouds_img, dtype=np.float32) / 255.0
    no_clouds = np.asarray(no_clouds_img, dtype=np.float32) / 255.0

    # Assume clouds are brighter than the underlying albedo:
    # composite = base * (1 - alpha) + cloud_color * alpha, with cloud_color
    # near white. Rearranging gives a good alpha estimate from positive deltas.
    delta = np.clip(clouds - no_clouds, 0.0, 1.0)
    denom = np.clip(1.0 - no_clouds, 1e-3, 1.0)
    alpha_estimate = np.max(delta / denom, axis=2)

    # Remove tiny JPEG/compositing differences while preserving soft cloud edges.
    alpha = _smoothstep(0.02, 0.72, alpha_estimate)
    alpha = np.power(alpha, 1.35)

    output_h, output_w = alpha.shape
    rgba = np.zeros((output_h, output_w, 4), dtype=np.uint8)
    rgba[..., :3] = 255
    rgba[..., 3] = np.round(alpha * 255).astype(np.uint8)

    out_path = intermediate_dir / source.output
    Image.fromarray(rgba, "RGBA").save(out_path)

    extra: dict[str, Any] = {
        "input_dimensions": [input_w, input_h],
        "output_dimensions": [output_w, output_h],
        "output_format": "png",
        "color_space": "sRGB",
        "alpha_derivation": (
            "Estimated cloud opacity from the positive brightening between "
            "matched NASA SVS 'with clouds' and 'no clouds' maps."
        ),
        "raw_file_hashes": {
            "with_clouds": sha256_file(raw_path),
            "no_clouds": sha256_file(no_clouds_path),
        },
        "extra_input_urls": {
            "no_clouds": _extra_file_url(source, "no_clouds"),
        },
    }

    return out_path, extra

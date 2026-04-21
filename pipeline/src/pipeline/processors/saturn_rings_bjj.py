"""Björn Jónsson Saturn rings processor — builds scattering + color textures
from raw 1D profile data.

Input: 5 text files (transparency + 4 extras: backscattered, forwardscattered,
unlitside, color), each with 13,177 samples at 5 km radial resolution spanning
74,510–140,390 km from Saturn's center.

Outputs:
  saturn_rings_scattering.png — 13177x1 RGBA
    R = backscattered brightness (0° phase)
    G = forward-scattered brightness (~139° phase)
    B = unlit-side brightness
    A = transparency (Björn's convention: 1 = no material, 0 = opaque)
    NOTE: A is the OPPOSITE of conventional alpha. The shader must know this.

  saturn_rings_color.png — 13177x1 RGB
    Per-sample ring color from Björn's color profile.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image

from pipeline.hashing import sha256_file
from pipeline.paths import raw_dir
from pipeline.sources import Source

EXPECTED_SAMPLE_COUNT = 13177


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


def _parse_scalar_file(path: Path) -> np.ndarray:
    """Parse a text file with one float per line into a 1D array."""
    text = path.read_text(encoding="utf-8")
    lines = [line.strip() for line in text.strip().splitlines() if line.strip()]
    values = np.array([float(line) for line in lines], dtype=np.float64)
    if len(values) != EXPECTED_SAMPLE_COUNT:
        raise ValueError(
            f"{path.name}: expected {EXPECTED_SAMPLE_COUNT} values, "
            f"got {len(values)}"
        )
    return values


def _parse_color_file(path: Path) -> np.ndarray:
    """Parse Björn's color file into an (N, 3) float array in [0, 1].

    Handles three common formats:
    - N lines with 3 whitespace-separated values (one triplet per line)
    - 3*N lines with 1 value each (sequential R, G, B)
    - Any layout with exactly N*3 whitespace-separated tokens
    """
    text = path.read_text(encoding="utf-8")
    lines = [line.strip() for line in text.strip().splitlines() if line.strip()]
    n = EXPECTED_SAMPLE_COUNT

    if len(lines) == n:
        # One triplet per line
        rows: list[list[float]] = []
        for line in lines:
            parts = line.split()
            if len(parts) != 3:
                raise ValueError(
                    f"{path.name}: expected 3 values per line, "
                    f"got {len(parts)}: {line!r}"
                )
            rows.append([float(p) for p in parts])
        return np.array(rows, dtype=np.float64)

    if len(lines) == n * 3:
        # One component per line (R, G, B sequential)
        flat = [float(line) for line in lines]
        return np.array(flat, dtype=np.float64).reshape(n, 3)

    # Fallback: all tokens flattened
    tokens = text.split()
    if len(tokens) == n * 3:
        flat = [float(t) for t in tokens]
        return np.array(flat, dtype=np.float64).reshape(n, 3)

    raise ValueError(
        f"Cannot parse color file {path.name}: "
        f"expected {n} triplets, got {len(lines)} lines "
        f"and {len(tokens)} total tokens"
    )


def saturn_rings_bjj(
    raw_path: Path, intermediate_dir: Path, source: Source
) -> tuple[Path, dict[str, Any]]:
    """Build scattering and color textures from Björn Jónsson's ring profiles."""
    intermediate_dir.mkdir(parents=True, exist_ok=True)

    # Locate all 5 input files
    transparency_path = raw_path
    backscattered_path = _find_extra_file(source, "backscattered")
    forwardscattered_path = _find_extra_file(source, "forwardscattered")
    unlitside_path = _find_extra_file(source, "unlitside")
    color_path = _find_extra_file(source, "color")

    # Parse
    transparency = _parse_scalar_file(transparency_path)
    backscattered = _parse_scalar_file(backscattered_path)
    forwardscattered = _parse_scalar_file(forwardscattered_path)
    unlitside = _parse_scalar_file(unlitside_path)
    color = _parse_color_file(color_path)

    # Clamp to [0, 1] for safety
    transparency = np.clip(transparency, 0.0, 1.0)
    backscattered = np.clip(backscattered, 0.0, 1.0)
    forwardscattered = np.clip(forwardscattered, 0.0, 1.0)
    unlitside = np.clip(unlitside, 0.0, 1.0)
    color = np.clip(color, 0.0, 1.0)

    n = EXPECTED_SAMPLE_COUNT

    # Build scattering image: RGBA, 13177x1
    # R=backscattered, G=forwardscattered, B=unlitside, A=transparency
    # TODO(precision): 8-bit (256 levels) is adequate for v0. Sharp features
    # (Cassini Division, Encke Gap) are defined by spatial resolution, not
    # per-sample precision. If banding appears, upgrade to 16-bit PNG via
    # numpy + Image.fromarray(..., mode='I;16') per channel.
    scattering_arr = np.zeros((1, n, 4), dtype=np.uint8)
    scattering_arr[0, :, 0] = np.round(backscattered * 255).astype(np.uint8)
    scattering_arr[0, :, 1] = np.round(forwardscattered * 255).astype(np.uint8)
    scattering_arr[0, :, 2] = np.round(unlitside * 255).astype(np.uint8)
    scattering_arr[0, :, 3] = np.round(transparency * 255).astype(np.uint8)

    scattering_img = Image.fromarray(scattering_arr, "RGBA")
    scattering_out = intermediate_dir / "saturn_rings_scattering.png"
    scattering_img.save(scattering_out)

    # Build color image: RGB, 13177x1
    color_arr = np.zeros((1, n, 3), dtype=np.uint8)
    color_arr[0, :, :] = np.round(color * 255).astype(np.uint8)

    color_img = Image.fromarray(color_arr, "RGB")
    color_out = intermediate_dir / "saturn_rings_color.png"
    color_img.save(color_out)

    # Collect hashes of all raw input files
    raw_file_hashes = {
        "transparency": sha256_file(transparency_path),
        "backscattered": sha256_file(backscattered_path),
        "forwardscattered": sha256_file(forwardscattered_path),
        "unlitside": sha256_file(unlitside_path),
        "color": sha256_file(color_path),
    }

    extra: dict[str, Any] = {
        "inner_radius_km": source.inner_radius_km,
        "outer_radius_km": source.outer_radius_km,
        "sample_count": n,
        "radial_resolution_km": 5,
        "channel_semantics": {
            "R": "backscattered brightness (0° phase angle)",
            "G": "forward-scattered brightness (~139° phase angle)",
            "B": "unlit-side brightness",
            "A": "transparency — Björn's convention: 1 = no material, "
            "0 = fully opaque (OPPOSITE of conventional alpha)",
        },
        "raw_file_hashes": raw_file_hashes,
        # Multi-output: tell the process command about the second output
        "_extra_output_paths": [color_out],
    }

    return scattering_out, extra

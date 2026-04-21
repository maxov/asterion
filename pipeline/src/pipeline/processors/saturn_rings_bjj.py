"""Björn Jónsson Saturn rings processor — builds ring textures from raw 1D
profile data.

Input: 5 text files (transparency + 4 extras: backscattered, forwardscattered,
unlitside, color), each with 13,177 samples at 5 km radial resolution spanning
74,510–140,390 km from Saturn's center.

Two output modes (controlled by source entry ``output_mode``):

  "multichannel" (default):
    saturn_rings_scattering.png — 13177x1 RGBA
      R = backscattered brightness (0° phase)
      G = forward-scattered brightness (~139° phase)
      B = unlit-side brightness
      A = transparency (Björn's convention: 1 = no material, 0 = opaque)
      NOTE: A is the OPPOSITE of conventional alpha.
    saturn_rings_color.png — 13177x1 RGB
      Per-sample ring color from Björn's color profile.

  "combined":
    saturn_rings.png — 13177x1 RGBA
      RGB = color * backscattered brightness (pre-multiplied illumination)
      A   = 1 - transparency (conventional opacity: 1 = opaque, 0 = clear)
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


def _build_multichannel(
    backscattered: np.ndarray,
    forwardscattered: np.ndarray,
    unlitside: np.ndarray,
    transparency: np.ndarray,
    color: np.ndarray,
    intermediate_dir: Path,
) -> tuple[Path, dict[str, Any]]:
    """Multichannel mode: separate scattering + color textures."""
    n = EXPECTED_SAMPLE_COUNT

    scattering_arr = np.zeros((1, n, 4), dtype=np.uint8)
    scattering_arr[0, :, 0] = np.round(backscattered * 255).astype(np.uint8)
    scattering_arr[0, :, 1] = np.round(forwardscattered * 255).astype(np.uint8)
    scattering_arr[0, :, 2] = np.round(unlitside * 255).astype(np.uint8)
    scattering_arr[0, :, 3] = np.round(transparency * 255).astype(np.uint8)

    scattering_img = Image.fromarray(scattering_arr, "RGBA")
    scattering_out = intermediate_dir / "saturn_rings_scattering.png"
    scattering_img.save(scattering_out)

    color_arr = np.zeros((1, n, 3), dtype=np.uint8)
    color_arr[0, :, :] = np.round(color * 255).astype(np.uint8)

    color_img = Image.fromarray(color_arr, "RGB")
    color_out = intermediate_dir / "saturn_rings_color.png"
    color_img.save(color_out)

    semantics: dict[str, Any] = {
        "output_mode": "multichannel",
        "channel_semantics": {
            "R": "backscattered brightness (0° phase angle)",
            "G": "forward-scattered brightness (~139° phase angle)",
            "B": "unlit-side brightness",
            "A": "transparency — Björn's convention: 1 = no material, "
            "0 = fully opaque (OPPOSITE of conventional alpha)",
        },
        "_extra_output_paths": [color_out],
    }
    return scattering_out, semantics


def _build_combined(
    backscattered: np.ndarray,
    transparency: np.ndarray,
    color: np.ndarray,
    intermediate_dir: Path,
) -> tuple[Path, dict[str, Any]]:
    """Combined mode: single RGBA texture with baked illumination."""
    n = EXPECTED_SAMPLE_COUNT

    # RGB = color * backscattered (element-wise, broadcast scalar per sample)
    rgb = color * backscattered[:, np.newaxis]
    alpha = 1.0 - transparency

    rgb = np.clip(rgb, 0.0, 1.0)
    alpha = np.clip(alpha, 0.0, 1.0)

    combined_arr = np.zeros((1, n, 4), dtype=np.uint8)
    combined_arr[0, :, 0] = np.round(rgb[:, 0] * 255).astype(np.uint8)
    combined_arr[0, :, 1] = np.round(rgb[:, 1] * 255).astype(np.uint8)
    combined_arr[0, :, 2] = np.round(rgb[:, 2] * 255).astype(np.uint8)
    combined_arr[0, :, 3] = np.round(alpha * 255).astype(np.uint8)

    combined_img = Image.fromarray(combined_arr, "RGBA")
    combined_out = intermediate_dir / "saturn_rings.png"
    combined_img.save(combined_out)

    semantics: dict[str, Any] = {
        "output_mode": "combined",
        "channel_semantics": {
            "RGB": "color * backscattered brightness (pre-multiplied illumination)",
            "A": "conventional opacity (1 = opaque, 0 = transparent)",
        },
    }
    return combined_out, semantics


def saturn_rings_bjj(
    raw_path: Path, intermediate_dir: Path, source: Source
) -> tuple[Path, dict[str, Any]]:
    """Build ring textures from Björn Jónsson's ring profiles."""
    intermediate_dir.mkdir(parents=True, exist_ok=True)

    output_mode = source.output_mode or "multichannel"

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

    if output_mode == "combined":
        out_path, mode_extra = _build_combined(
            backscattered, transparency, color, intermediate_dir
        )
    else:
        out_path, mode_extra = _build_multichannel(
            backscattered, forwardscattered, unlitside, transparency, color,
            intermediate_dir,
        )

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
        "raw_file_hashes": raw_file_hashes,
    }
    extra.update(mode_extra)

    return out_path, extra

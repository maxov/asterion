"""Canonicalizers for downloaded raw sources with volatile transport metadata."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Callable

_HORIZONS_VOLATILE_PREFIXES = (
    "Ephemeris / API_USER ",
    "EOP file        : ",
    "EOP coverage    : ",
)


def _normalize_horizons_result(result: str) -> str:
    normalized_lines: list[str] = []
    for line in result.splitlines():
        if line.startswith(_HORIZONS_VOLATILE_PREFIXES[0]):
            normalized_lines.append("Ephemeris / API_USER <normalized> / Horizons")
            continue
        if line.startswith(_HORIZONS_VOLATILE_PREFIXES[1]):
            normalized_lines.append("EOP file        : <normalized>")
            continue
        if line.startswith(_HORIZONS_VOLATILE_PREFIXES[2]):
            normalized_lines.append("EOP coverage    : <normalized>")
            continue
        normalized_lines.append(line)
    return "\n".join(normalized_lines)


def normalize_jpl_horizons_json(path: Path) -> None:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict) or not isinstance(payload.get("result"), str):
        raise ValueError("jpl_horizons_json normalizer expects a Horizons JSON payload")

    payload["result"] = _normalize_horizons_result(payload["result"])
    path.write_text(
        json.dumps(payload, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


DOWNLOAD_NORMALIZERS: dict[str, Callable[[Path], None]] = {
    "jpl_horizons_json": normalize_jpl_horizons_json,
}


def apply_download_normalizer(path: Path, name: str) -> None:
    if not name:
        return
    try:
        normalizer = DOWNLOAD_NORMALIZERS[name]
    except KeyError as exc:
        available = ", ".join(sorted(DOWNLOAD_NORMALIZERS))
        raise KeyError(
            f"unknown download normalizer '{name}'. Available: {available}"
        ) from exc
    normalizer(path)


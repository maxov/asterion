"""Helpers for locating and hashing a source's raw inputs."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from pipeline.hashing import sha256_file
from pipeline.paths import raw_dir, repo_root
from pipeline.sources import Source


@dataclass(frozen=True)
class RawInput:
    role: str
    name: str
    path: Path
    sha256: str
    url: str


def _find_one(pattern: str, missing_message: str) -> Path:
    candidates = list(raw_dir().glob(pattern))
    if not candidates:
        raise FileNotFoundError(missing_message)
    if len(candidates) > 1:
        raise FileNotFoundError(f"Multiple raw files found for pattern {pattern}: {candidates}")
    return candidates[0]


def find_primary_raw_file(source: Source) -> Path:
    """Locate the primary raw file for a source in data/raw/."""
    return _find_one(
        f"{source.id}.*",
        f"{source.id}: no raw file found in {raw_dir()}. Run 'fetch' first.",
    )


def collect_raw_inputs(source: Source) -> list[RawInput]:
    """Collect the full raw input set declared by a source entry."""
    inputs = [
        RawInput(
            role="primary",
            name="primary",
            path=find_primary_raw_file(source),
            sha256="",
            url=source.url,
        )
    ]

    if source.transparency_raw:
        transparency_path = _find_one(
            f"{source.id}_transparency.*",
            f"{source.id}: no transparency raw file found in {raw_dir()}.",
        )
        inputs.append(
            RawInput(
                role="transparency",
                name="transparency",
                path=transparency_path,
                sha256="",
                url=source.transparency_raw,
            )
        )

    for extra_file in source.extra_files:
        extra_path = _find_one(
            f"{source.id}_{extra_file.name}.*",
            f"{source.id}: missing extra raw file '{extra_file.name}' in {raw_dir()}.",
        )
        inputs.append(
            RawInput(
                role="extra",
                name=extra_file.name,
                path=extra_path,
                sha256="",
                url=extra_file.url,
            )
        )

    return [
        RawInput(
            role=raw_input.role,
            name=raw_input.name,
            path=raw_input.path,
            sha256=sha256_file(raw_input.path),
            url=raw_input.url,
        )
        for raw_input in inputs
    ]


def serialize_raw_input(raw_input: RawInput) -> dict[str, str]:
    """Convert a RawInput to a provenance-friendly JSON record."""
    return {
        "role": raw_input.role,
        "name": raw_input.name,
        "url": raw_input.url,
        "path": str(raw_input.path.relative_to(repo_root())),
        "sha256": raw_input.sha256,
    }

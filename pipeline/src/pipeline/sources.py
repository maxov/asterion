"""Load and validate the sources.toml registry."""

from __future__ import annotations

import tomllib
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from pipeline.paths import sources_toml

_REQUIRED_KEYS = {
    "id",
    "description",
    "url",
    "sha256",
    "license",
    "attribution",
    "source_page",
    "processor",
    "output",
}

_OPTIONAL_DEFAULTS: dict[str, Any] = {
    "asset_type": "textures",
    "download_normalizer": "",
    "local_only": False,
    "transparency_raw": "",
    "sha256_transparency": "",
    "max_width": 0,
    "ring_input": "",
    "inner_radius_km": 0.0,
    "outer_radius_km": 0.0,
    "expected_extension": "",
    "coordinate_frame": "",
    "output_mode": "",
}


@dataclass(frozen=True)
class ExtraFile:
    """A secondary file associated with a source (e.g., a scattering profile)."""

    name: str
    url: str
    sha256: str
    download_normalizer: str = ""


@dataclass(frozen=True)
class Source:
    id: str
    description: str
    url: str
    sha256: str
    license: str
    attribution: str
    source_page: str
    processor: str
    output: str
    # Optional fields
    asset_type: str = "textures"
    download_normalizer: str = ""
    local_only: bool = False
    transparency_raw: str = ""
    sha256_transparency: str = ""
    max_width: int = 0
    ring_input: str = ""
    inner_radius_km: float = 0.0
    outer_radius_km: float = 0.0
    expected_extension: str = ""
    coordinate_frame: str = ""
    output_mode: str = ""
    extra_files: tuple[ExtraFile, ...] = ()
    extra_outputs: tuple[str, ...] = ()
    config: dict[str, Any] = field(default_factory=dict)


def load_sources(path: Path | None = None) -> list[Source]:
    """Parse sources.toml and return a list of Source objects.

    Raises ValueError on schema violations.
    """
    path = path or sources_toml()
    text = path.read_text(encoding="utf-8")
    data = tomllib.loads(text)

    entries: list[dict[str, Any]] = data.get("source", [])
    sources: list[Source] = []

    for i, entry in enumerate(entries):
        missing = _REQUIRED_KEYS - entry.keys()
        if missing:
            raise ValueError(
                f"source entry {i} ({entry.get('id', '?')}): "
                f"missing keys: {', '.join(sorted(missing))}"
            )
        kwargs: dict[str, Any] = {k: entry[k] for k in _REQUIRED_KEYS}
        for k, default in _OPTIONAL_DEFAULTS.items():
            kwargs[k] = entry.get(k, default)

        # extra_files: list of {name, url, sha256} dicts -> tuple of ExtraFile
        raw_extra_files = entry.get("extra_files", [])
        kwargs["extra_files"] = tuple(
            ExtraFile(
                name=ef["name"],
                url=ef["url"],
                sha256=ef.get("sha256", ""),
                download_normalizer=ef.get("download_normalizer", ""),
            )
            for ef in raw_extra_files
        )

        # extra_outputs: list of strings -> tuple
        kwargs["extra_outputs"] = tuple(entry.get("extra_outputs", []))
        kwargs["config"] = dict(entry.get("config", {}))

        sources.append(Source(**kwargs))

    return sources


def find_source(sources: list[Source], source_id: str) -> Source:
    """Find a source by id. Raises KeyError if not found."""
    for s in sources:
        if s.id == source_id:
            return s
    available = ", ".join(s.id for s in sources)
    raise KeyError(f"source '{source_id}' not found. Available: {available}")

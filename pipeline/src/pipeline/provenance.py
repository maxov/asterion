"""Write provenance metadata alongside output textures."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from pipeline import __version__
from pipeline.sources import Source


def provenance_path(texture_path: Path) -> Path:
    """Return the .provenance.json path for a given texture file."""
    return texture_path.with_suffix(texture_path.suffix + ".provenance.json")


def write_provenance(
    texture_path: Path,
    source: Source,
    sha256_raw: str,
    sha256_output: str,
    extra: dict[str, Any] | None = None,
) -> Path:
    """Write a provenance JSON file next to the output texture.

    Returns the path to the written file.
    """
    out = provenance_path(texture_path)
    data: dict[str, Any] = {
        "source_id": source.id,
        "source_url": source.url,
        "source_page": source.source_page,
        "license": source.license,
        "attribution": source.attribution,
        "sha256_raw": sha256_raw,
        "sha256_output": sha256_output,
        "processor": source.processor,
        "pipeline_version": __version__,
        "processed_at": datetime.now(timezone.utc).isoformat(),
    }
    if extra:
        data.update(extra)
    out.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    return out

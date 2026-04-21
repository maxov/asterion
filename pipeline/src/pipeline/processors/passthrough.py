"""Passthrough processor — copies the raw file, stripping image metadata."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from PIL import Image

from pipeline.sources import Source


def passthrough(
    raw_path: Path, intermediate_dir: Path, source: Source
) -> tuple[Path, dict[str, Any]]:
    """Copy raw_path to intermediate_dir, stripping EXIF/metadata.

    Returns the path to the output file and empty extra provenance.
    """
    intermediate_dir.mkdir(parents=True, exist_ok=True)
    out_path = intermediate_dir / raw_path.name

    img = Image.open(raw_path)
    # Create a clean copy without metadata
    clean = Image.new(img.mode, img.size)
    clean.paste(img)
    clean.save(out_path)

    return out_path, {}

"""Extract a GLB model from a zip archive."""

from __future__ import annotations

import shutil
import zipfile
from pathlib import Path
from typing import Any

from pipeline.processors.mission_common import require_mapping, require_string
from pipeline.sources import Source


def zip_glb(
    raw_path: Path, intermediate_dir: Path, source: Source
) -> tuple[Path, dict[str, Any]]:
    """Extract a single GLB member from a zip archive."""
    config = require_mapping(source.config, label="config") if source.config else {}
    configured_member = config.get("member_path")
    member_path = (
        require_string(configured_member, label="config.member_path")
        if configured_member is not None
        else None
    )

    with zipfile.ZipFile(raw_path) as archive:
        if member_path is None:
            glb_members = [
                info.filename
                for info in archive.infolist()
                if not info.is_dir() and info.filename.lower().endswith(".glb")
            ]
            if len(glb_members) != 1:
                raise ValueError(
                    f"{source.id}: expected exactly one .glb in archive, found {glb_members}"
                )
            member_path = glb_members[0]

        try:
            member = archive.getinfo(member_path)
        except KeyError as exc:
            raise ValueError(
                f"{source.id}: archive member '{member_path}' not found in {raw_path.name}"
            ) from exc

        intermediate_dir.mkdir(parents=True, exist_ok=True)
        out_path = intermediate_dir / source.output
        with archive.open(member) as src, out_path.open("wb") as dest:
            shutil.copyfileobj(src, dest)

    return out_path, {"archive_member": member_path}


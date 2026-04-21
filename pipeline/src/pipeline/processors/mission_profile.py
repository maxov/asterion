"""Mission profile processor — normalizes declarative mission specs to JSON."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from pipeline.processors.mission_common import (
    build_mission_extra,
    normalize_mission_metadata,
    require_mapping,
    require_string,
)
from pipeline.sources import Source

def mission_profile(
    raw_path: Path, intermediate_dir: Path, source: Source
) -> tuple[Path, dict[str, Any]]:
    """Normalize a mission profile source into a frontend-friendly JSON asset."""
    del raw_path

    config = dict(source.config)
    metadata = normalize_mission_metadata(
        config,
        extra_required_keys={"parameters", "trajectory_model"},
    )
    trajectory_model = require_string(
        config["trajectory_model"], label="config.trajectory_model"
    )
    parameters = require_mapping(config["parameters"], label="config.parameters")

    asset = {
        "assetVersion": 1,
        "assetType": "mission",
        "durationSeconds": metadata.duration_seconds,
        "events": metadata.events,
        "frame": metadata.frame,
        "launchUtc": metadata.launch_utc,
        "missionId": metadata.mission_id,
        "missionName": metadata.mission_name,
        "parameters": parameters,
        "references": metadata.references,
        "streakWindowSeconds": metadata.streak_window_seconds,
        "style": metadata.style,
        "systemId": metadata.system_id,
        "trajectoryModel": trajectory_model,
    }
    if metadata.visual:
        asset["visual"] = metadata.visual

    if metadata.notes:
        asset["notes"] = metadata.notes

    intermediate_dir.mkdir(parents=True, exist_ok=True)
    out_path = intermediate_dir / source.output
    out_path.write_text(json.dumps(asset, indent=2) + "\n", encoding="utf-8")

    return out_path, build_mission_extra(metadata, trajectory_model=trajectory_model)

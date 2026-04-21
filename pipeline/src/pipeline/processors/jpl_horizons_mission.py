"""Processor for mission assets backed by JPL Horizons vector samples."""

from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from pipeline.processors.mission_common import (
    build_mission_extra,
    normalize_mission_metadata,
)
from pipeline.sources import Source

_HORIZONS_UTC_FORMAT = "A.D. %Y-%b-%d %H:%M:%S.%f"
_REFERENCE_SYSTEM_PATTERN = re.compile(r"Reference frame\s*:\s*(.+)")
_CENTER_BODY_PATTERN = re.compile(r"Center body name:\s*(.+)")
_TARGET_BODY_PATTERN = re.compile(r"Target body name:\s*(.+)")


def _parse_horizons_utc(value: str) -> datetime:
    return datetime.strptime(value, _HORIZONS_UTC_FORMAT).replace(tzinfo=timezone.utc)


def _extract_result(payload: Any) -> str:
    if not isinstance(payload, dict):
        raise ValueError("Horizons response must be a JSON object")

    result = payload.get("result")
    if not isinstance(result, str) or not result.strip():
        raise ValueError("Horizons response is missing a result payload")
    return result


def _extract_header_field(result: str, pattern: re.Pattern[str], label: str) -> str:
    match = pattern.search(result)
    if not match:
        raise ValueError(f"Horizons response is missing {label}")
    return match.group(1).strip()


def _extract_samples(result: str, launch_dt: datetime) -> list[dict[str, Any]]:
    in_rows = False
    samples: list[dict[str, Any]] = []

    for line in result.splitlines():
        stripped = line.strip()
        if stripped == "$$SOE":
            in_rows = True
            continue
        if stripped == "$$EOE":
            break
        if not in_rows or not stripped:
            continue

        parts = [part.strip() for part in stripped.split(",") if part.strip()]
        if len(parts) != 8:
            raise ValueError(f"Unexpected Horizons vector row: {line}")

        sample_dt = _parse_horizons_utc(parts[1])
        samples.append(
            {
                "position_km": [float(parts[2]), float(parts[3]), float(parts[4])],
                "t_plus_seconds": int(
                    round((sample_dt - launch_dt).total_seconds())
                ),
                "utc": sample_dt.isoformat().replace("+00:00", "Z"),
                "velocity_km_s": [
                    float(parts[5]),
                    float(parts[6]),
                    float(parts[7]),
                ],
            }
        )

    if not samples:
        raise ValueError("Horizons response did not contain any vector rows")

    return samples


def _infer_step_seconds(samples: list[dict[str, Any]]) -> int | None:
    if len(samples) < 2:
        return None
    step = samples[1]["t_plus_seconds"] - samples[0]["t_plus_seconds"]
    return step if step > 0 else None


def _build_vector_trajectory(result: str, launch_dt: datetime) -> dict[str, Any]:
    samples = _extract_samples(result, launch_dt)
    trajectory = {
        "centerBody": _extract_header_field(
            result, _CENTER_BODY_PATTERN, "center body"
        ),
        "referenceSystem": _extract_header_field(
            result,
            _REFERENCE_SYSTEM_PATTERN,
            "reference frame",
        ),
        "sampleStartUtc": samples[0]["utc"],
        "sampleStopUtc": samples[-1]["utc"],
        "samples": samples,
        "source": "jpl-horizons",
        "targetBody": _extract_header_field(
            result, _TARGET_BODY_PATTERN, "target body"
        ),
    }
    step_seconds = _infer_step_seconds(samples)
    if step_seconds is not None:
        trajectory["stepSeconds"] = step_seconds
    return trajectory


def _extra_file_path(raw_path: Path, source_id: str, extra_name: str, url: str) -> Path:
    suffix = Path(urlparse(url).path).suffix
    return raw_path.parent / f"{source_id}_{extra_name}{suffix}"


def _load_reference_bodies(
    raw_path: Path, source: Source, launch_dt: datetime
) -> dict[str, dict[str, Any]]:
    reference_bodies: dict[str, dict[str, Any]] = {}

    for extra_file in source.extra_files:
        if not extra_file.name.startswith("reference_"):
            continue

        body_id = extra_file.name.removeprefix("reference_")
        body_path = _extra_file_path(raw_path, source.id, extra_file.name, extra_file.url)
        result = _extract_result(json.loads(body_path.read_text(encoding="utf-8")))
        reference_bodies[body_id] = _build_vector_trajectory(result, launch_dt)

    return reference_bodies


def jpl_horizons_mission(
    raw_path: Path, intermediate_dir: Path, source: Source
) -> tuple[Path, dict[str, Any]]:
    """Convert a Horizons vector-table response into a mission JSON asset."""
    payload = json.loads(raw_path.read_text(encoding="utf-8"))
    result = _extract_result(payload)

    metadata = normalize_mission_metadata(config=dict(source.config))
    launch_dt = datetime.fromisoformat(metadata.launch_utc.replace("Z", "+00:00"))
    trajectory = _build_vector_trajectory(result, launch_dt)
    samples = trajectory["samples"]
    reference_bodies = _load_reference_bodies(raw_path, source, launch_dt)

    asset = {
        "assetVersion": 1,
        "assetType": "mission",
        "durationSeconds": metadata.duration_seconds,
        "events": metadata.events,
        "frame": metadata.frame,
        "launchUtc": metadata.launch_utc,
        "missionId": metadata.mission_id,
        "missionName": metadata.mission_name,
        "references": metadata.references,
        "streakWindowSeconds": metadata.streak_window_seconds,
        "style": metadata.style,
        "systemId": metadata.system_id,
        "trajectory": trajectory,
        "trajectoryModel": "sampled-vectors-v1",
    }
    if metadata.visual:
        asset["visual"] = metadata.visual
    if reference_bodies:
        asset["referenceBodies"] = reference_bodies
    if metadata.notes:
        asset["notes"] = metadata.notes

    intermediate_dir.mkdir(parents=True, exist_ok=True)
    out_path = intermediate_dir / source.output
    out_path.write_text(json.dumps(asset, indent=2) + "\n", encoding="utf-8")

    extra = build_mission_extra(metadata, trajectory_model="sampled-vectors-v1")
    extra["sample_count"] = len(samples)
    extra["trajectory_center_body"] = trajectory["centerBody"]
    extra["trajectory_target_body"] = trajectory["targetBody"]
    extra["trajectory_sample_start_utc"] = trajectory["sampleStartUtc"]
    extra["trajectory_sample_stop_utc"] = trajectory["sampleStopUtc"]
    if "stepSeconds" in trajectory:
        extra["trajectory_step_seconds"] = trajectory["stepSeconds"]
    if reference_bodies:
        extra["reference_bodies"] = sorted(reference_bodies)

    return out_path, extra

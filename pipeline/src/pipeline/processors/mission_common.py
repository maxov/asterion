"""Shared mission-asset normalization helpers."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any, Iterable

DEFAULT_STYLE = {
    "head_color": "#fff7d6",
    "head_radius_km": 260,
    "line_color": "#7ecbff",
    "line_opacity": 0.26,
    "streak_color": "#fff1b0",
    "streak_opacity": 0.95,
}

COMMON_REQUIRED_CONFIG_KEYS = {
    "launch_utc",
    "mission_id",
    "mission_name",
}


@dataclass(frozen=True)
class MissionMetadata:
    duration_seconds: int
    events: list[dict[str, Any]]
    frame: str
    launch_utc: str
    mission_id: str
    mission_name: str
    notes: str | None
    references: list[str]
    streak_window_seconds: int
    style: dict[str, Any]
    system_id: str
    visual: dict[str, Any] | None


def require_mapping(value: Any, *, label: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ValueError(f"{label} must be a TOML table/object")
    return dict(value)


def require_string(value: Any, *, label: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{label} must be a non-empty string")
    return value.strip()


def require_int(value: Any, *, label: str) -> int:
    if not isinstance(value, int):
        raise ValueError(f"{label} must be an integer")
    return value


def require_number(value: Any, *, label: str) -> float:
    if not isinstance(value, (int, float)):
        raise ValueError(f"{label} must be a number")
    return float(value)


def require_boolean(value: Any, *, label: str) -> bool:
    if not isinstance(value, bool):
        raise ValueError(f"{label} must be a boolean")
    return value


def validate_launch_utc(value: str) -> str:
    try:
        datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ValueError(f"launch_utc must be an ISO-8601 UTC timestamp: {value}") from exc
    return value


def normalize_events(config: dict[str, Any]) -> list[dict[str, Any]]:
    events = config.get("events", [])
    if not isinstance(events, list):
        raise ValueError("config.events must be an array of tables")

    normalized: list[dict[str, Any]] = []
    for i, event in enumerate(events):
        if not isinstance(event, dict):
            raise ValueError(f"config.events[{i}] must be a table/object")
        label = require_string(event.get("label"), label=f"config.events[{i}].label")
        event_id = require_string(event.get("id"), label=f"config.events[{i}].id")
        t_plus_seconds = require_int(
            event.get("t_plus_seconds"),
            label=f"config.events[{i}].t_plus_seconds",
        )
        normalized_event: dict[str, Any] = {
            "id": event_id,
            "label": label,
            "t_plus_seconds": t_plus_seconds,
        }
        note = event.get("note")
        if note:
            normalized_event["note"] = require_string(
                note,
                label=f"config.events[{i}].note",
            )
        normalized.append(normalized_event)

    return sorted(normalized, key=lambda event: event["t_plus_seconds"])


def normalize_references(config: dict[str, Any]) -> list[str]:
    references = config.get("references", [])
    if not isinstance(references, list) or not all(
        isinstance(reference, str) for reference in references
    ):
        raise ValueError("config.references must be an array of strings")
    return references


def normalize_visual(config: dict[str, Any]) -> dict[str, Any] | None:
    raw_visual = config.get("visual")
    if raw_visual is None:
        return None

    visual = require_mapping(raw_visual, label="config.visual")
    normalized: dict[str, Any] = {}

    model_asset_path = visual.get("model_asset_path")
    if model_asset_path is not None:
        normalized["model_asset_path"] = require_string(
            model_asset_path,
            label="config.visual.model_asset_path",
        )

    model_longest_dimension_m = visual.get("model_longest_dimension_m")
    if model_longest_dimension_m is not None:
        normalized["model_longest_dimension_m"] = require_number(
            model_longest_dimension_m,
            label="config.visual.model_longest_dimension_m",
        )

    model_rotation_deg = visual.get("model_rotation_deg")
    if model_rotation_deg is not None:
        if not isinstance(model_rotation_deg, list) or len(model_rotation_deg) != 3:
            raise ValueError("config.visual.model_rotation_deg must be an array of 3 numbers")
        normalized["model_rotation_deg"] = [
            require_number(
                component,
                label=f"config.visual.model_rotation_deg[{i}]",
            )
            for i, component in enumerate(model_rotation_deg)
        ]

    show_head = visual.get("show_head")
    if show_head is not None:
        normalized["show_head"] = require_boolean(
            show_head,
            label="config.visual.show_head",
        )

    return normalized or None


def normalize_mission_metadata(
    config: dict[str, Any],
    *,
    extra_required_keys: Iterable[str] = (),
) -> MissionMetadata:
    missing = (COMMON_REQUIRED_CONFIG_KEYS | set(extra_required_keys)) - config.keys()
    if missing:
        raise ValueError(
            f"config missing required keys: {', '.join(sorted(missing))}"
        )

    mission_id = require_string(config["mission_id"], label="config.mission_id")
    mission_name = require_string(config["mission_name"], label="config.mission_name")
    launch_utc = validate_launch_utc(
        require_string(config["launch_utc"], label="config.launch_utc")
    )
    events = normalize_events(config)

    duration_seconds = config.get("duration_seconds")
    if duration_seconds is None:
        duration_seconds = max(
            (event["t_plus_seconds"] for event in events),
            default=0,
        )
    duration_seconds = require_int(
        duration_seconds,
        label="config.duration_seconds",
    )

    style = DEFAULT_STYLE | require_mapping(
        config.get("style", {}),
        label="config.style",
    )
    references = normalize_references(config)

    system_id = require_string(
        config.get("system_id", "earthSystem"),
        label="config.system_id",
    )
    frame = require_string(
        config.get("frame", "earth-centered-inertial"),
        label="config.frame",
    )
    streak_window_seconds = require_int(
        config.get("streak_window_seconds", 172_800),
        label="config.streak_window_seconds",
    )

    notes = config.get("notes")
    normalized_notes = (
        require_string(notes, label="config.notes") if notes else None
    )
    visual = normalize_visual(config)

    return MissionMetadata(
        duration_seconds=duration_seconds,
        events=events,
        frame=frame,
        launch_utc=launch_utc,
        mission_id=mission_id,
        mission_name=mission_name,
        notes=normalized_notes,
        references=references,
        streak_window_seconds=streak_window_seconds,
        style=style,
        system_id=system_id,
        visual=visual,
    )


def build_mission_extra(metadata: MissionMetadata, *, trajectory_model: str) -> dict[str, Any]:
    extra: dict[str, Any] = {
        "mission_id": metadata.mission_id,
        "mission_name": metadata.mission_name,
        "trajectory_model": trajectory_model,
        "frame": metadata.frame,
        "launch_utc": metadata.launch_utc,
        "duration_seconds": metadata.duration_seconds,
        "system_id": metadata.system_id,
    }
    if metadata.references:
        extra["reference_pages"] = metadata.references
    return extra

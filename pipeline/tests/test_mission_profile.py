"""Tests for the mission_profile processor."""

from __future__ import annotations

import json
from pathlib import Path

from pipeline.processors.mission_profile import mission_profile
from pipeline.sources import Source


def test_mission_profile_writes_normalized_asset(tmp_path: Path) -> None:
    raw_path = tmp_path / "press-kit.pdf"
    raw_path.write_bytes(b"%PDF-1.4")

    source = Source(
        id="artemis_ii",
        description="Artemis II nominal mission profile",
        url="https://example.com/artemis-ii.pdf",
        sha256="abc",
        license="Public Domain",
        attribution="NASA",
        source_page="https://example.com",
        processor="mission_profile",
        output="artemis_ii.json",
        asset_type="missions",
        config={
            "mission_id": "artemis2",
            "mission_name": "Artemis II",
            "trajectory_model": "earth-moon-free-return-v1",
            "launch_utc": "2026-04-01T22:35:00Z",
            "duration_seconds": 10,
            "parameters": {"parking_orbit_count": 2},
            "visual": {
                "model_asset_path": "/models/orion_spacecraft.glb",
                "model_longest_dimension_m": 7.92,
                "show_head": False,
            },
            "events": [
                {
                    "id": "launch",
                    "label": "Launch",
                    "t_plus_seconds": 0,
                },
                {
                    "id": "splashdown",
                    "label": "Splashdown",
                    "t_plus_seconds": 10,
                },
            ],
        },
    )

    out_path, extra = mission_profile(raw_path, tmp_path / "intermediate", source)

    data = json.loads(out_path.read_text(encoding="utf-8"))
    assert data["assetType"] == "mission"
    assert data["missionId"] == "artemis2"
    assert data["trajectoryModel"] == "earth-moon-free-return-v1"
    assert data["events"][1]["id"] == "splashdown"
    assert data["style"]["line_color"] == "#7ecbff"
    assert data["visual"]["model_asset_path"] == "/models/orion_spacecraft.glb"
    assert data["visual"]["show_head"] is False
    assert extra["mission_id"] == "artemis2"

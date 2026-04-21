"""Tests for the JPL Horizons mission processor."""

from __future__ import annotations

import json
from pathlib import Path

from pipeline.processors.jpl_horizons_mission import jpl_horizons_mission
from pipeline.sources import ExtraFile, Source


def test_jpl_horizons_mission_writes_sampled_vector_asset(tmp_path: Path) -> None:
    raw_path = tmp_path / "artemis_ii_horizons.json"
    raw_path.write_text(
        json.dumps(
            {
                "result": "\n".join(
                    [
                        "Target body name: Artemis II (spacecraft) (-1024) {source: Artemis_II_merged}",
                        "Center body name: Earth (399)                     {source: DE441}",
                        "Reference frame : ICRF",
                        "$$SOE",
                        "2461132.582638889, A.D. 2026-Apr-02 01:59:00.0000, -2.0, -1.0, 0.0, 1.0, 2.0, 3.0,",
                        "2461132.586111111, A.D. 2026-Apr-02 02:04:00.0000, -3.0, -2.0, 1.0, 1.5, 2.5, 3.5,",
                        "$$EOE",
                    ]
                )
            }
        ),
        encoding="utf-8",
    )
    (tmp_path / "artemis_ii_horizons_reference_moon.json").write_text(
        json.dumps(
            {
                "result": "\n".join(
                    [
                        "Target body name: Moon (301) {source: DE441}",
                        "Center body name: Earth (399) {source: DE441}",
                        "Reference frame : ICRF",
                        "$$SOE",
                        "2461132.582638889, A.D. 2026-Apr-02 01:59:00.0000, 10.0, 20.0, 30.0, 0.1, 0.2, 0.3,",
                        "2461132.586111111, A.D. 2026-Apr-02 02:04:00.0000, 11.0, 21.0, 31.0, 0.1, 0.2, 0.3,",
                        "$$EOE",
                    ]
                )
            }
        ),
        encoding="utf-8",
    )

    source = Source(
        id="artemis_ii_horizons",
        description="Artemis II vectors from Horizons",
        url="https://ssd.jpl.nasa.gov/api/horizons.api",
        sha256="abc",
        license="Public Domain",
        attribution="NASA/JPL",
        source_page="https://ssd-api.jpl.nasa.gov/doc/horizons.html",
        processor="jpl_horizons_mission",
        output="artemis_ii.json",
        asset_type="missions",
        extra_files=(
            ExtraFile(
                name="reference_moon",
                url="https://example.com/reference_moon.json",
                sha256="def",
            ),
        ),
        config={
            "mission_id": "artemis2",
            "mission_name": "Artemis II",
            "launch_utc": "2026-04-02T01:54:00Z",
            "duration_seconds": 600,
            "visual": {
                "model_asset_path": "/models/orion_spacecraft.glb",
                "model_rotation_deg": [0, 180, 0],
            },
            "events": [
                {
                    "id": "launch",
                    "label": "Launch",
                    "t_plus_seconds": 0,
                },
                {
                    "id": "entry",
                    "label": "Entry",
                    "t_plus_seconds": 600,
                },
            ],
        },
    )

    out_path, extra = jpl_horizons_mission(raw_path, tmp_path / "intermediate", source)

    data = json.loads(out_path.read_text(encoding="utf-8"))
    assert data["assetType"] == "mission"
    assert data["trajectoryModel"] == "sampled-vectors-v1"
    assert data["trajectory"]["source"] == "jpl-horizons"
    assert data["trajectory"]["referenceSystem"] == "ICRF"
    assert data["trajectory"]["stepSeconds"] == 300
    assert data["trajectory"]["samples"][0]["t_plus_seconds"] == 300
    assert data["trajectory"]["samples"][1]["velocity_km_s"] == [1.5, 2.5, 3.5]
    assert data["referenceBodies"]["moon"]["samples"][0]["position_km"] == [10.0, 20.0, 30.0]
    assert data["visual"]["model_rotation_deg"] == [0.0, 180.0, 0.0]
    assert extra["sample_count"] == 2
    assert extra["trajectory_center_body"].startswith("Earth (399)")
    assert extra["reference_bodies"] == ["moon"]

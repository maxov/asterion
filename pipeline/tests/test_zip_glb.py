"""Tests for the zip_glb processor."""

from __future__ import annotations

import zipfile
from pathlib import Path

from pipeline.processors.zip_glb import zip_glb
from pipeline.sources import Source


def test_zip_glb_extracts_configured_member(tmp_path: Path) -> None:
    raw_path = tmp_path / "orion-spacecraft.zip"
    with zipfile.ZipFile(raw_path, "w") as archive:
        archive.writestr("source/orionspacecraft.glb", b"glb-bytes")

    source = Source(
        id="orion-spacecraft",
        description="Orion model zip",
        url="https://example.com/model",
        sha256="abc",
        license="CC BY 4.0",
        attribution="Example Author",
        source_page="https://example.com",
        processor="zip_glb",
        output="orion_spacecraft.glb",
        asset_type="models",
        config={"member_path": "source/orionspacecraft.glb"},
    )

    out_path, extra = zip_glb(raw_path, tmp_path / "intermediate", source)

    assert out_path.read_bytes() == b"glb-bytes"
    assert extra["archive_member"] == "source/orionspacecraft.glb"


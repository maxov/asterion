"""Tests for pipeline.provenance."""

import json
from pathlib import Path

from pipeline.provenance import provenance_path, write_provenance
from pipeline.sources import Source


def test_provenance_path() -> None:
    p = Path("/textures/saturn.png")
    assert provenance_path(p) == Path("/textures/saturn.png.provenance.json")


def test_provenance_path_double_ext() -> None:
    p = Path("/textures/ring.color.jpg")
    assert provenance_path(p) == Path("/textures/ring.color.jpg.provenance.json")


def test_write_provenance(tmp_path: Path) -> None:
    texture = tmp_path / "out.png"
    texture.write_bytes(b"fake")

    source = Source(
        id="test_src",
        description="A test",
        url="https://example.com/file.png",
        sha256="aaa",
        license="Public Domain",
        attribution="Test",
        source_page="https://example.com",
        processor="passthrough",
        output="out.png",
    )

    result = write_provenance(
        texture, source, sha256_raw="rawdigest", sha256_output="outdigest"
    )

    assert result.exists()
    assert result.name == "out.png.provenance.json"

    data = json.loads(result.read_text())
    assert data["source_id"] == "test_src"
    assert data["sha256_raw"] == "rawdigest"
    assert data["sha256_output"] == "outdigest"
    assert data["processor"] == "passthrough"
    assert data["pipeline_version"] == "0.1.0"
    assert "processed_at" in data

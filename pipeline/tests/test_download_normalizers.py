"""Tests for download normalization helpers."""

from __future__ import annotations

import json
from pathlib import Path

from pipeline.download_normalizers import apply_download_normalizer


def test_apply_jpl_horizons_json_normalizer(tmp_path: Path) -> None:
    path = tmp_path / "horizons.json"
    path.write_text(
        json.dumps(
            {
                "result": "\n".join(
                    [
                        "Ephemeris / API_USER Tue Apr 21 07:55:06 2026 Pasadena, USA      / Horizons",
                        "EOP file        : eop.260420.p260717",
                        "EOP coverage    : DATA-BASED 1962-JAN-20 TO 2026-APR-20. PREDICTS-> 2026-JUL-16",
                        "Reference frame : ICRF",
                    ]
                ),
                "signature": {"source": "NASA/JPL Horizons API", "version": "1.2"},
            }
        ),
        encoding="utf-8",
    )

    apply_download_normalizer(path, "jpl_horizons_json")

    payload = json.loads(path.read_text(encoding="utf-8"))
    result = payload["result"]
    assert "Tue Apr 21 07:55:06 2026" not in result
    assert "<normalized>" in result
    assert "Reference frame : ICRF" in result


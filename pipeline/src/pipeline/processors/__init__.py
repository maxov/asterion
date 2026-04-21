"""Processor registry.

Each processor is a callable:
    (raw_path: Path, intermediate_dir: Path, source: Source) -> tuple[Path, dict]

Returns (processed_file_path, extra_provenance_dict).
"""

from __future__ import annotations

from pathlib import Path
from typing import Any, Callable

from pipeline.processors.earth_clouds import earth_clouds
from pipeline.processors.jpl_horizons_mission import jpl_horizons_mission
from pipeline.processors.mission_profile import mission_profile
from pipeline.processors.moon_height import moon_height
from pipeline.processors.passthrough import passthrough
from pipeline.processors.saturn_body import saturn_body
from pipeline.processors.saturn_rings import saturn_rings
from pipeline.processors.saturn_rings_bjj import saturn_rings_bjj
from pipeline.processors.starfield import starfield
from pipeline.processors.zip_glb import zip_glb
from pipeline.sources import Source

ProcessorFn = Callable[[Path, Path, Source], tuple[Path, dict[str, Any]]]

PROCESSORS: dict[str, ProcessorFn] = {
    "earth_clouds": earth_clouds,
    "jpl_horizons_mission": jpl_horizons_mission,
    "mission_profile": mission_profile,
    "moon_height": moon_height,
    "passthrough": passthrough,
    "saturn_body": saturn_body,
    "saturn_rings": saturn_rings,
    "saturn_rings_bjj": saturn_rings_bjj,
    "starfield": starfield,
    "zip_glb": zip_glb,
}


def get_processor(name: str) -> ProcessorFn:
    """Look up a processor by name. Raises KeyError if unknown."""
    if name not in PROCESSORS:
        available = ", ".join(sorted(PROCESSORS))
        raise KeyError(f"unknown processor '{name}'. Available: {available}")
    return PROCESSORS[name]

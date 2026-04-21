"""List command — show sources and their status."""

from __future__ import annotations

from pipeline.paths import raw_dir, textures_dir
from pipeline.sources import load_sources


def run_list() -> None:
    """Print the sources table with status."""
    sources = load_sources()
    if not sources:
        print("No sources defined in sources.toml")
        return

    raw = raw_dir()
    textures = textures_dir()

    # Header
    print(
        f"{'ID':<30} {'Raw':<14} {'Output?':<10} {'SHA256?':<10} {'Processor'}"
    )
    print("-" * 86)

    for s in sources:
        has_raw = any(raw.glob(f"{s.id}.*"))
        if has_raw:
            raw_status = "local" if s.local_only else "fetched"
        else:
            raw_status = "missing"

        # Annotate with extra_files status if applicable
        if s.extra_files:
            present = sum(
                1
                for ef in s.extra_files
                if any(raw.glob(f"{s.id}_{ef.name}.*"))
            )
            total = len(s.extra_files)
            raw_status += f"+{present}/{total}"

        output_present = "yes" if (textures / s.output).exists() else "no"
        sha_recorded = "yes" if s.sha256 else "no"
        print(
            f"{s.id:<30} {raw_status:<14} {output_present:<10} "
            f"{sha_recorded:<10} {s.processor}"
        )

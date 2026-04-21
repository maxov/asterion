"""Process command — run processors and install textures."""

from __future__ import annotations

import shutil
from pathlib import Path

from pipeline.hashing import sha256_file
from pipeline.paths import intermediate_dir, raw_dir, textures_dir
from pipeline.processors import get_processor
from pipeline.provenance import write_provenance
from pipeline.sources import Source, find_source, load_sources


def _find_raw_file(source: Source) -> Path:
    """Locate the raw file for a source in data/raw/."""
    raw = raw_dir()
    candidates = list(raw.glob(f"{source.id}.*"))
    if not candidates:
        raise FileNotFoundError(
            f"{source.id}: no raw file found in {raw}. Run 'fetch' first."
        )
    if len(candidates) > 1:
        raise FileNotFoundError(
            f"{source.id}: multiple raw files found: {candidates}. "
            f"Remove duplicates."
        )
    return candidates[0]


def _process_one(source: Source) -> None:
    raw_path = _find_raw_file(source)
    sha256_raw = sha256_file(raw_path)

    processor = get_processor(source.processor)
    inter_dir = intermediate_dir() / source.id
    print(f"  {source.id}: running processor '{source.processor}'")
    processed_path, extra_provenance = processor(raw_path, inter_dir, source)

    out_dir = textures_dir()
    out_dir.mkdir(parents=True, exist_ok=True)

    # Multi-output processors stash additional intermediate paths here
    extra_output_paths: list[Path] = extra_provenance.pop(
        "_extra_output_paths", []
    )

    # Install primary output
    final_path = out_dir / source.output
    shutil.copy2(processed_path, final_path)
    sha256_output = sha256_file(final_path)

    prov_path = write_provenance(
        final_path,
        source,
        sha256_raw=sha256_raw,
        sha256_output=sha256_output,
        extra=extra_provenance,
    )
    print(f"  {source.id}: installed {final_path.name}")
    print(f"  {source.id}: provenance written to {prov_path.name}")

    # Install extra outputs
    if extra_output_paths:
        if len(extra_output_paths) != len(source.extra_outputs):
            raise ValueError(
                f"{source.id}: processor returned {len(extra_output_paths)} "
                f"extra outputs but source declares "
                f"{len(source.extra_outputs)}"
            )
        for inter_path, out_name in zip(
            extra_output_paths, source.extra_outputs, strict=True
        ):
            final = out_dir / out_name
            shutil.copy2(inter_path, final)
            sha_out = sha256_file(final)
            prov = write_provenance(
                final,
                source,
                sha256_raw=sha256_raw,
                sha256_output=sha_out,
                extra=extra_provenance,
            )
            print(f"  {source.id}: installed {final.name}")
            print(f"  {source.id}: provenance written to {prov.name}")


def run_process(source_id: str | None) -> None:
    """Run the process command."""
    sources = load_sources()
    if not sources:
        print("No sources defined in sources.toml")
        return

    if source_id:
        sources = [find_source(sources, source_id)]

    print(f"Processing {len(sources)} source(s)...")
    for source in sources:
        _process_one(source)
    print("Done.")

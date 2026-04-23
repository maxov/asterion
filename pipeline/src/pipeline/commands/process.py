"""Process command — run processors and install textures."""

from __future__ import annotations

import shutil
from pathlib import Path

from pipeline.hashing import sha256_file
from pipeline.paths import asset_dir, intermediate_dir
from pipeline.commands.install import copy_asset_to_public
from pipeline.processors import get_processor
from pipeline.provenance import write_provenance
from pipeline.raw_inputs import collect_raw_inputs, serialize_raw_input
from pipeline.sources import Source, find_source, load_sources


def _process_one(source: Source) -> None:
    raw_inputs = collect_raw_inputs(source)
    raw_path = raw_inputs[0].path
    sha256_raw = raw_inputs[0].sha256
    raw_input_records = [
        serialize_raw_input(raw_input)
        for raw_input in raw_inputs
    ]

    processor = get_processor(source.processor)
    inter_dir = intermediate_dir() / source.id
    print(f"  {source.id}: running processor '{source.processor}'")
    processed_path, extra_provenance = processor(raw_path, inter_dir, source)

    out_dir = asset_dir(source.asset_type)
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
        raw_inputs=raw_input_records,
        extra=extra_provenance,
    )
    print(f"  {source.id}: installed {final_path.name}")
    print(f"  {source.id}: provenance written to {prov_path.name}")
    copy_asset_to_public(final_path, source.asset_type)

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
                raw_inputs=raw_input_records,
                extra=extra_provenance,
            )
            print(f"  {source.id}: installed {final.name}")
            print(f"  {source.id}: provenance written to {prov.name}")
            copy_asset_to_public(final, source.asset_type)


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

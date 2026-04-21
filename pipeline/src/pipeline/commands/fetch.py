"""Fetch command — download source files to data/raw/."""

from __future__ import annotations

import sys
import time
from pathlib import Path
from urllib.parse import urlparse

import httpx
import tomli_w
import tomllib
from tqdm import tqdm

from pipeline.hashing import sha256_file
from pipeline.paths import raw_dir, sources_toml
from pipeline.sources import Source, find_source, load_sources


def _extension_from_url(url: str) -> str:
    """Extract file extension from a URL path."""
    parsed = urlparse(url)
    suffix = Path(parsed.path).suffix
    return suffix if suffix else ""


def _download(url: str, label: str, dest: Path) -> None:
    """Stream-download a URL to dest with a tqdm progress bar."""
    dest.parent.mkdir(parents=True, exist_ok=True)
    with httpx.stream("GET", url, follow_redirects=True) as resp:
        resp.raise_for_status()
        total = int(resp.headers.get("content-length", 0)) or None
        with (
            dest.open("wb") as f,
            tqdm(
                total=total,
                unit="B",
                unit_scale=True,
                desc=label,
            ) as bar,
        ):
            for chunk in resp.iter_bytes(chunk_size=1 << 16):
                f.write(chunk)
                bar.update(len(chunk))


def _record_hash(source_id: str, field: str, digest: str) -> None:
    """Update a hash field for source_id in sources.toml."""
    path = sources_toml()
    data = tomllib.loads(path.read_text(encoding="utf-8"))
    for entry in data.get("source", []):
        if entry.get("id") == source_id:
            entry[field] = digest
            break
    path.write_text(tomli_w.dumps(data), encoding="utf-8")


def _record_extra_file_hash(
    source_id: str, extra_name: str, digest: str
) -> None:
    """Update the sha256 for an extra_files entry in sources.toml."""
    path = sources_toml()
    data = tomllib.loads(path.read_text(encoding="utf-8"))
    for entry in data.get("source", []):
        if entry.get("id") == source_id:
            for ef in entry.get("extra_files", []):
                if ef.get("name") == extra_name:
                    ef["sha256"] = digest
                    break
            break
    path.write_text(tomli_w.dumps(data), encoding="utf-8")


def _verify_or_record(
    source_id: str,
    path: Path,
    expected_hash: str,
    hash_field: str,
    record: bool,
    *,
    delete_on_fail: bool = True,
) -> None:
    """Verify a file's hash or record it with --record."""
    digest = sha256_file(path)

    if record:
        print(f"  {source_id}: recording {hash_field} = {digest}")
        _record_hash(source_id, hash_field, digest)
    elif not expected_hash:
        if delete_on_fail:
            path.unlink()
        raise ValueError(
            f"{source_id}: no {hash_field} in sources.toml and --record not set. "
            f"Run with --record to populate it."
        )
    elif digest != expected_hash:
        if delete_on_fail:
            path.unlink()
        raise ValueError(
            f"{source_id}: {hash_field} mismatch!\n"
            f"  expected: {expected_hash}\n"
            f"  got:      {digest}"
        )
    else:
        print(f"  {source_id}: {hash_field} verified")


def _handle_local_only(source: Source, record: bool) -> None:
    """Handle a local_only source — no download, just verify the file exists."""
    raw = raw_dir()
    candidates = list(raw.glob(f"{source.id}.*"))

    if not candidates:
        print(f"  {source.id}: LOCAL-ONLY source — file not found!")
        print(f"    1. Visit: {source.source_page}")
        print(f"    2. Download and place at: {raw / source.id}.<ext>")
        print(f"    3. Run: uv run pipeline fetch --source {source.id} --record")
        sys.exit(1)

    if len(candidates) > 1:
        raise ValueError(
            f"{source.id}: multiple raw files found: {candidates}. "
            f"Remove duplicates."
        )

    path = candidates[0]
    digest = sha256_file(path)
    print(f"  {source.id}: local file found at {path.name}, sha256 = {digest}")

    _verify_or_record(
        source.id, path, source.sha256, "sha256", record, delete_on_fail=False
    )


def _fetch_transparency(source: Source, record: bool) -> None:
    """Fetch the transparency file if the source has one."""
    if not source.transparency_raw:
        return

    ext = _extension_from_url(source.transparency_raw)
    dest = raw_dir() / f"{source.id}_transparency{ext}"

    # Skip if already downloaded and hash matches
    if dest.exists() and source.sha256_transparency:
        existing_hash = sha256_file(dest)
        if existing_hash == source.sha256_transparency:
            print(
                f"  {source.id}: transparency already downloaded, "
                f"hash matches — skipping"
            )
            return

    print(
        f"  {source.id}: downloading transparency from {source.transparency_raw}"
    )
    _download(source.transparency_raw, f"{source.id}_transparency", dest)

    _verify_or_record(
        source.id, dest, source.sha256_transparency, "sha256_transparency", record
    )


def _fetch_extra_files(source: Source, record: bool) -> None:
    """Fetch extra_files entries for a source, with polite rate limiting."""
    if not source.extra_files:
        return

    for i, ef in enumerate(source.extra_files):
        # Polite rate limit: Björn and others host these on personal sites.
        # Sleep 1s between requests to avoid hammering small servers.
        if i > 0:
            time.sleep(1)

        ext = _extension_from_url(ef.url)
        dest = raw_dir() / f"{source.id}_{ef.name}{ext}"
        label = f"{source.id}/{ef.name}"

        # Skip if already downloaded and hash matches
        if dest.exists() and ef.sha256:
            existing_hash = sha256_file(dest)
            if existing_hash == ef.sha256:
                print(f"  {label}: already downloaded, hash matches — skipping")
                continue

        print(f"  {label}: downloading from {ef.url}")
        _download(ef.url, label, dest)

        digest = sha256_file(dest)
        if record:
            print(f"  {label}: recording sha256 = {digest}")
            _record_extra_file_hash(source.id, ef.name, digest)
        elif not ef.sha256:
            dest.unlink()
            raise ValueError(
                f"{label}: no sha256 in sources.toml and --record not set. "
                f"Run with --record to populate it."
            )
        elif digest != ef.sha256:
            dest.unlink()
            raise ValueError(
                f"{label}: sha256 mismatch!\n"
                f"  expected: {ef.sha256}\n"
                f"  got:      {digest}"
            )
        else:
            print(f"  {label}: sha256 verified")


def _fetch_one(source: Source, record: bool) -> None:
    if source.local_only:
        _handle_local_only(source, record)
        return

    ext = _extension_from_url(source.url)
    dest = raw_dir() / f"{source.id}{ext}"

    # Skip if already downloaded and hash matches
    if dest.exists() and source.sha256:
        existing_hash = sha256_file(dest)
        if existing_hash == source.sha256:
            print(f"  {source.id}: already downloaded, hash matches — skipping")
            _fetch_transparency(source, record)
            _fetch_extra_files(source, record)
            return

    print(f"  {source.id}: downloading from {source.url}")
    _download(source.url, source.id, dest)

    _verify_or_record(source.id, dest, source.sha256, "sha256", record)

    # Handle paired transparency file
    _fetch_transparency(source, record)

    # Handle extra files
    _fetch_extra_files(source, record)


def run_fetch(source_id: str | None, record: bool) -> None:
    """Run the fetch command."""
    sources = load_sources()
    if not sources:
        print("No sources defined in sources.toml")
        return

    if source_id:
        sources = [find_source(sources, source_id)]

    print(f"Fetching {len(sources)} source(s)...")
    for source in sources:
        _fetch_one(source, record=record)
    print("Done.")

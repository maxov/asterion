"""Install command — copy processed assets to public/ for Vite."""

from __future__ import annotations

import shutil
from pathlib import Path

from pipeline.paths import assets_dir, public_asset_dir


def copy_asset_to_public(path: Path, asset_type: str) -> Path:
    """Copy a processed asset into public/<asset_type>/."""
    dst_dir = public_asset_dir(asset_type)
    dst_dir.mkdir(parents=True, exist_ok=True)
    out = dst_dir / path.name
    shutil.copy2(path, out)
    print(f"  {path.name} -> public/{asset_type}/{path.name}")
    return out


def run_install() -> None:
    copied = 0
    for src_dir in sorted(
        path for path in assets_dir().iterdir() if path.is_dir()
    ):
        for path in sorted(src_dir.iterdir()):
            if path.is_dir() or path.name.endswith(".provenance.json"):
                continue
            copy_asset_to_public(path, src_dir.name)
            copied += 1

    if copied:
        print(f"Installed {copied} asset(s) to public/")
    else:
        print("No processed assets found. Run 'pipeline process' first.")

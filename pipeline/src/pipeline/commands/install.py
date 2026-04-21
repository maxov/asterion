"""Install command — copy processed assets to public/ for Vite."""

from __future__ import annotations

import shutil

from pipeline.paths import assets_dir, public_asset_dir


def run_install() -> None:
    copied = 0
    for src_dir in sorted(
        path for path in assets_dir().iterdir() if path.is_dir()
    ):
        dst_dir = public_asset_dir(src_dir.name)
        dst_dir.mkdir(parents=True, exist_ok=True)

        for path in sorted(src_dir.iterdir()):
            if path.is_dir() or path.name.endswith(".provenance.json"):
                continue
            out = dst_dir / path.name
            shutil.copy2(path, out)
            print(f"  {path.name} -> public/{src_dir.name}/{path.name}")
            copied += 1

    if copied:
        print(f"Installed {copied} asset(s) to public/")
    else:
        print("No processed assets found. Run 'pipeline process' first.")

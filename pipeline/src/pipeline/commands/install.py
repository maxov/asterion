"""Install command — copy processed textures to public/textures/ for Vite."""

from __future__ import annotations

import shutil

from pipeline.paths import repo_root, textures_dir


def run_install() -> None:
    """Copy every non-provenance file from src/assets/textures/ to public/textures/."""
    src = textures_dir()
    dst = repo_root() / "public" / "textures"
    dst.mkdir(parents=True, exist_ok=True)

    copied = 0
    for path in sorted(src.iterdir()):
        if path.suffix == ".json" or path.is_dir():
            continue
        out = dst / path.name
        shutil.copy2(path, out)
        print(f"  {path.name} -> public/textures/{path.name}")
        copied += 1

    if copied:
        print(f"Installed {copied} texture(s) to public/textures/")
    else:
        print("No textures found. Run 'pipeline process' first.")

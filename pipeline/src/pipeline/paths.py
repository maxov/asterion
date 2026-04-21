"""Centralized path resolution for the pipeline.

All paths are derived from the repo root, which is the parent of the
pipeline/ directory.
"""

from pathlib import Path

# pipeline/ lives one level below the repo root
_PIPELINE_DIR = Path(__file__).resolve().parent.parent.parent
_REPO_ROOT = _PIPELINE_DIR.parent


def repo_root() -> Path:
    return _REPO_ROOT


def pipeline_dir() -> Path:
    return _PIPELINE_DIR


def sources_toml() -> Path:
    return _PIPELINE_DIR / "sources.toml"


def raw_dir() -> Path:
    return _REPO_ROOT / "data" / "raw"


def intermediate_dir() -> Path:
    return _REPO_ROOT / "data" / "intermediate"


def assets_dir() -> Path:
    return _REPO_ROOT / "src" / "assets"


def asset_dir(asset_type: str) -> Path:
    return assets_dir() / asset_type


def public_asset_dir(asset_type: str) -> Path:
    return _REPO_ROOT / "public" / asset_type


def textures_dir() -> Path:
    return asset_dir("textures")

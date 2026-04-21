"""Tests for pipeline.sources."""

import pytest
from pathlib import Path

from pipeline.sources import Source, find_source, load_sources


_VALID_TOML = """\
[[source]]
id = "test_one"
description = "Test source one"
url = "https://example.com/one.png"
sha256 = "abc123"
license = "Public Domain"
attribution = "Test Author"
source_page = "https://example.com"
processor = "passthrough"
output = "one.png"

[[source]]
id = "test_two"
description = "Test source two"
url = "https://example.com/two.jpg"
sha256 = ""
license = "CC BY 4.0"
attribution = "Another Author"
source_page = "https://example.com/two"
processor = "passthrough"
output = "two.jpg"
"""

_MISSING_KEY_TOML = """\
[[source]]
id = "bad"
description = "Missing fields"
url = "https://example.com/bad.png"
"""


def test_load_sources_valid(tmp_path: Path) -> None:
    p = tmp_path / "sources.toml"
    p.write_text(_VALID_TOML)
    sources = load_sources(p)
    assert len(sources) == 2
    assert sources[0].id == "test_one"
    assert sources[0].sha256 == "abc123"
    assert sources[1].id == "test_two"
    assert sources[1].sha256 == ""


def test_load_sources_empty(tmp_path: Path) -> None:
    p = tmp_path / "sources.toml"
    p.write_text("")
    sources = load_sources(p)
    assert sources == []


def test_load_sources_missing_key(tmp_path: Path) -> None:
    p = tmp_path / "sources.toml"
    p.write_text(_MISSING_KEY_TOML)
    with pytest.raises(ValueError, match="missing keys"):
        load_sources(p)


def test_find_source() -> None:
    sources = [
        Source(
            id="a", description="", url="", sha256="", license="",
            attribution="", source_page="", processor="passthrough", output="a.png",
        ),
        Source(
            id="b", description="", url="", sha256="", license="",
            attribution="", source_page="", processor="passthrough", output="b.png",
        ),
    ]
    assert find_source(sources, "b").id == "b"


def test_find_source_missing() -> None:
    with pytest.raises(KeyError, match="not found"):
        find_source([], "nope")


# --- extra_files and extra_outputs ---

_EXTRA_FILES_TOML = """\
[[source]]
id = "with_extras"
description = "Source with extra files"
url = "https://example.com/main.txt"
sha256 = "abc"
license = "Public Domain"
attribution = "Test"
source_page = "https://example.com"
processor = "saturn_rings_bjj"
output = "scattering.png"
extra_outputs = ["color.png"]

[[source.extra_files]]
name = "backscattered"
url = "https://example.com/back.txt"
sha256 = "def"

[[source.extra_files]]
name = "color"
url = "https://example.com/color.txt"
sha256 = ""
"""


def test_load_extra_files(tmp_path: Path) -> None:
    p = tmp_path / "sources.toml"
    p.write_text(_EXTRA_FILES_TOML)
    sources = load_sources(p)
    assert len(sources) == 1
    s = sources[0]
    assert len(s.extra_files) == 2
    assert s.extra_files[0].name == "backscattered"
    assert s.extra_files[0].url == "https://example.com/back.txt"
    assert s.extra_files[0].sha256 == "def"
    assert s.extra_files[1].name == "color"
    assert s.extra_files[1].sha256 == ""
    assert s.extra_outputs == ("color.png",)


def test_load_no_extra_files(tmp_path: Path) -> None:
    """Sources without extra_files get empty defaults."""
    p = tmp_path / "sources.toml"
    p.write_text(_VALID_TOML)
    sources = load_sources(p)
    assert sources[0].extra_files == ()
    assert sources[0].extra_outputs == ()

"""Tests for pipeline.hashing."""

import hashlib
import tempfile
from pathlib import Path

from pipeline.hashing import sha256_bytes, sha256_file


def test_sha256_bytes_empty() -> None:
    expected = hashlib.sha256(b"").hexdigest()
    assert sha256_bytes(b"") == expected


def test_sha256_bytes_hello() -> None:
    data = b"hello world"
    expected = hashlib.sha256(data).hexdigest()
    assert sha256_bytes(data) == expected


def test_sha256_file_matches_bytes(tmp_path: Path) -> None:
    data = b"some file content\nwith newlines\n"
    p = tmp_path / "test.bin"
    p.write_bytes(data)
    assert sha256_file(p) == sha256_bytes(data)


def test_sha256_file_empty(tmp_path: Path) -> None:
    p = tmp_path / "empty"
    p.write_bytes(b"")
    assert sha256_file(p) == sha256_bytes(b"")

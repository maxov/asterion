"""SHA-256 helpers."""

import hashlib
from pathlib import Path

_CHUNK_SIZE = 1 << 16  # 64 KiB


def sha256_file(path: Path) -> str:
    """Return the lowercase hex SHA-256 digest of a file."""
    h = hashlib.sha256()
    with path.open("rb") as f:
        while chunk := f.read(_CHUNK_SIZE):
            h.update(chunk)
    return h.hexdigest()


def sha256_bytes(data: bytes) -> str:
    """Return the lowercase hex SHA-256 digest of a byte string."""
    return hashlib.sha256(data).hexdigest()

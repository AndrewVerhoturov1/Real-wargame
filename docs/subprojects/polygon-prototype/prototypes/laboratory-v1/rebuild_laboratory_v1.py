#!/usr/bin/env python3
from __future__ import annotations

import argparse
import base64
import hashlib
import lzma
import subprocess
import tempfile
from pathlib import Path

BASE_SHA256 = "78c89b784c441a87c8680134bf4aef31e0a96c6e0b2344cd1ad875f09d372e9b"
PATCH_XZ_SHA256 = "1601fcf7dee3bd52daeb60fc7bfc7026d0e178419d15c5b13322b5dfe4cc881d"
OUTPUT_SHA256 = "29e1d493fd3c4ef7633ad3850bf71ec94e3403d6a5ccb2a0658ca958d0765c02"
PART_COUNT = 8


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Rebuild accepted Polygon Laboratory v1 HTML from accepted Global Editors v1."
    )
    parser.add_argument(
        "base_global_editors_v1", type=Path, help="Path to the accepted Global Editors v1 HTML"
    )
    parser.add_argument(
        "output",
        type=Path,
        nargs="?",
        default=Path("polygon-laboratory-v1.html"),
        help="Output HTML path",
    )
    args = parser.parse_args()

    base_bytes = args.base_global_editors_v1.read_bytes()
    base_sha = sha256_bytes(base_bytes)
    if base_sha != BASE_SHA256:
        raise SystemExit(
            f"Base Global Editors v1 SHA-256 mismatch: expected {BASE_SHA256}, got {base_sha}"
        )

    root = Path(__file__).resolve().parent
    parts = sorted((root / "parts").glob("global-editors-v1-to-laboratory-v1.patch.xz.b64.part-*"))
    if len(parts) != PART_COUNT:
        raise SystemExit(f"Expected {PART_COUNT} delta parts, found {len(parts)}")

    encoded = b"".join(p.read_bytes() for p in parts)
    patch_xz = base64.b64decode(encoded, validate=True)
    patch_xz_sha = sha256_bytes(patch_xz)
    if patch_xz_sha != PATCH_XZ_SHA256:
        raise SystemExit(
            f"Compressed patch SHA-256 mismatch: expected {PATCH_XZ_SHA256}, got {patch_xz_sha}"
        )
    patch = lzma.decompress(patch_xz)

    with tempfile.TemporaryDirectory(prefix="polygon-laboratory-v1-") as td:
        work = Path(td)
        target = work / "polygon.html"
        patch_file = work / "global-editors-v1-to-laboratory-v1.patch"
        target.write_bytes(base_bytes)
        patch_file.write_bytes(patch)
        subprocess.run(
            ["git", "apply", "--no-index", "-p2", str(patch_file)],
            cwd=work,
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        result = target.read_bytes()

    result_sha = sha256_bytes(result)
    if result_sha != OUTPUT_SHA256:
        raise SystemExit(
            f"Rebuilt Laboratory v1 SHA-256 mismatch: expected {OUTPUT_SHA256}, got {result_sha}"
        )

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_bytes(result)
    print(f"OK: wrote {args.output} ({len(result)} bytes, SHA-256 {result_sha})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

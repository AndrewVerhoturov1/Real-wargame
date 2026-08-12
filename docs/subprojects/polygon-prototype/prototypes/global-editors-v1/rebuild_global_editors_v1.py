#!/usr/bin/env python3
from __future__ import annotations

import argparse
import base64
import hashlib
import lzma
import subprocess
import tempfile
from pathlib import Path

BASE_SHA256 = "eda3190c747d61b554c99072828c1f56038a48f81eff5778deceed75d9a71ca4"
PATCH_XZ_SHA256 = "253d57a6c3b61e693f04c6191e9da9b622429a64102816ca174ce9abea30974e"
OUTPUT_SHA256 = "78c89b784c441a87c8680134bf4aef31e0a96c6e0b2344cd1ad875f09d372e9b"
PART_COUNT = 7


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Rebuild accepted Polygon Global Editors v1 HTML from accepted Journal v4."
    )
    parser.add_argument("base_journal_v4", type=Path, help="Path to the accepted Journal v4 HTML")
    parser.add_argument(
        "output",
        type=Path,
        nargs="?",
        default=Path("polygon-global-editors-v1.html"),
        help="Output HTML path",
    )
    args = parser.parse_args()

    base_bytes = args.base_journal_v4.read_bytes()
    base_sha = sha256_bytes(base_bytes)
    if base_sha != BASE_SHA256:
        raise SystemExit(
            f"Base Journal v4 SHA-256 mismatch: expected {BASE_SHA256}, got {base_sha}"
        )

    root = Path(__file__).resolve().parent
    parts = sorted((root / "parts").glob("journal-v4-to-global-editors-v1.patch.xz.b64.part-*"))
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

    with tempfile.TemporaryDirectory(prefix="polygon-global-editors-v1-") as td:
        work = Path(td)
        target = work / "polygon.html"
        patch_file = work / "journal-v4-to-global-editors-v1.patch"
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
            f"Rebuilt Global Editors v1 SHA-256 mismatch: expected {OUTPUT_SHA256}, got {result_sha}"
        )

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_bytes(result)
    print(f"OK: wrote {args.output} ({len(result)} bytes, SHA-256 {result_sha})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

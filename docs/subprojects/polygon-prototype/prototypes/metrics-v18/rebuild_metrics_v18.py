#!/usr/bin/env python3
from __future__ import annotations

import argparse
import base64
import hashlib
import lzma
import shutil
import subprocess
import tempfile
from pathlib import Path

BASE_SHA256 = "0db5984d9d1f76149c31135b4a16f7e657f957c5512039853b9607353979b1d6"
PATCH_XZ_SHA256 = "56f71c833a6feedbe82f40710d147b7838f1ca64d198274c913728f69be8baca"
OUTPUT_SHA256 = "1f4aa27611fbdf5433e0b0ae630d8953d1c19091ce1e0592536d1737ffca91f8"


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Rebuild the accepted Polygon Metrics v18 HTML from accepted v44."
    )
    parser.add_argument("base_v44", type=Path, help="Path to the accepted v44 HTML")
    parser.add_argument(
        "output",
        type=Path,
        nargs="?",
        default=Path("polygon-metrics-constructor-v18-report-streamlined.html"),
        help="Output HTML path",
    )
    args = parser.parse_args()

    base_bytes = args.base_v44.read_bytes()
    base_sha = sha256_bytes(base_bytes)
    if base_sha != BASE_SHA256:
        raise SystemExit(
            f"Base v44 SHA-256 mismatch: expected {BASE_SHA256}, got {base_sha}"
        )

    root = Path(__file__).resolve().parent
    parts = sorted((root / "parts").glob("v44-to-metrics-v18.patch.xz.b64.part-*"))
    if len(parts) != 12:
        raise SystemExit(f"Expected 12 delta parts, found {len(parts)}")

    encoded = b"".join(p.read_bytes() for p in parts)
    patch_xz = base64.b64decode(encoded, validate=True)
    patch_xz_sha = sha256_bytes(patch_xz)
    if patch_xz_sha != PATCH_XZ_SHA256:
        raise SystemExit(
            f"Compressed patch SHA-256 mismatch: expected {PATCH_XZ_SHA256}, got {patch_xz_sha}"
        )
    patch = lzma.decompress(patch_xz)

    with tempfile.TemporaryDirectory(prefix="polygon-metrics-v18-") as td:
        work = Path(td)
        target = work / "polygon.html"
        patch_file = work / "v44-to-metrics-v18.patch"
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
            f"Rebuilt v18 SHA-256 mismatch: expected {OUTPUT_SHA256}, got {result_sha}"
        )

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_bytes(result)
    print(f"OK: wrote {args.output} ({len(result)} bytes, SHA-256 {result_sha})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

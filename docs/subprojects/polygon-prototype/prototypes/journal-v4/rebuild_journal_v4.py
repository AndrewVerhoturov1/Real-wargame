#!/usr/bin/env python3
from __future__ import annotations

import argparse
import base64
import hashlib
import lzma
import subprocess
import tempfile
from pathlib import Path

BASE_SHA256 = "1f4aa27611fbdf5433e0b0ae630d8953d1c19091ce1e0592536d1737ffca91f8"
PATCH_XZ_SHA256 = "50c53bd2611315d1f28afc482571f4a63a06001802081c0f6894d8de9b27ae5c"
OUTPUT_SHA256 = "eda3190c747d61b554c99072828c1f56038a48f81eff5778deceed75d9a71ca4"
PART_COUNT = 4


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Rebuild the accepted Polygon Journal v4 HTML from accepted Metrics v18."
    )
    parser.add_argument("base_metrics_v18", type=Path, help="Path to the accepted Metrics v18 HTML")
    parser.add_argument(
        "output",
        type=Path,
        nargs="?",
        default=Path("polygon-journal-v4.html"),
        help="Output HTML path",
    )
    args = parser.parse_args()

    base_bytes = args.base_metrics_v18.read_bytes()
    base_sha = sha256_bytes(base_bytes)
    if base_sha != BASE_SHA256:
        raise SystemExit(
            f"Base Metrics v18 SHA-256 mismatch: expected {BASE_SHA256}, got {base_sha}"
        )

    root = Path(__file__).resolve().parent
    parts = sorted((root / "parts").glob("metrics-v18-to-journal-v4.patch.xz.b64.part-*"))
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

    with tempfile.TemporaryDirectory(prefix="polygon-journal-v4-") as td:
        work = Path(td)
        target = work / "polygon.html"
        patch_file = work / "metrics-v18-to-journal-v4.patch"
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
            f"Rebuilt Journal v4 SHA-256 mismatch: expected {OUTPUT_SHA256}, got {result_sha}"
        )

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_bytes(result)
    print(f"OK: wrote {args.output} ({len(result)} bytes, SHA-256 {result_sha})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

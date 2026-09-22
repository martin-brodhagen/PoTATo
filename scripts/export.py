#!/usr/bin/env python3
"""Export a portable runtime bundle of the website to ./export/.

Copies only the files the browser actually loads at runtime. Excludes the
Python data pipeline (prep/, scripts/*), the Game8 scrape caches, the manual
patch files (other than manual-forme-overrides.json, which the frontend
fetches), the dead sprites/types/ and data/type-icons.json, dev docs, and
build artifacts (.cache/, __pycache__/).

The output dir is wiped and recreated on each run for determinism — stale
files from a previous schema would otherwise linger.

Usage:
    python3 scripts/export.py [OUTPUT_DIR]   # default: ./export
"""

import os
import shutil
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_OUTPUT = REPO_ROOT / "export"

# Each entry is a (source_path, dest_path) pair, both relative to the repo
# root. A string is shorthand for (string, string) — copy in place. A tuple
# lets a source land at a different dest (e.g. scripts/_headers → _headers
# so Netlify picks it up at the site root).
INCLUDE: list[tuple[str, str]] = [
    ("index.html", "index.html"),
    ("style.css", "style.css"),
    ("app.js", "app.js"),
    ("lib", "lib"),
    ("data/base", "data/base"),
    ("data/added", "data/added"),
    ("data/formats", "data/formats"),
    ("data/i18n", "data/i18n"),
    ("data/manual-forme-overrides.json", "data/manual-forme-overrides.json"),
    ("sprites/champions", "sprites/champions"),
    ("sprites/champions-48", "sprites/champions-48"),
    ("sprites/shiny", "sprites/shiny"),
    ("sprites/items", "sprites/items"),
    ("sprites/categories", "sprites/categories"),
    ("scripts/_headers", "_headers"),
]


def copy_path(src: Path, dst: Path) -> tuple[int, int]:
    """Copy a file or directory tree. Returns (file_count, byte_count)."""
    files = 0
    bytes_ = 0
    if src.is_dir():
        for root, _, names in os.walk(src):
            for name in names:
                sp = Path(root) / name
                dp = dst / sp.relative_to(src)
                dp.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(sp, dp)
                files += 1
                bytes_ += sp.stat().st_size
    else:
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dst)
        files += 1
        bytes_ += src.stat().st_size
    return files, bytes_


def main() -> int:
    output = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else DEFAULT_OUTPUT
    if output == REPO_ROOT:
        sys.exit("ERROR: refusing to export into the repo root")

    if output.exists():
        shutil.rmtree(output)
    output.mkdir(parents=True)

    total_files = 0
    total_bytes = 0
    rows = []
    for src_rel, dst_rel in INCLUDE:
        src = REPO_ROOT / src_rel
        if not src.exists():
            sys.exit(f"ERROR: missing source path: {src}")
        dst = output / dst_rel
        n_files, n_bytes = copy_path(src, dst)
        label = src_rel if src_rel == dst_rel else f"{src_rel} → {dst_rel}"
        rows.append((label, n_files, n_bytes))
        total_files += n_files
        total_bytes += n_bytes

    print(f"Exported to {output}")
    for label, n_files, n_bytes in rows:
        print(f"  {label}: {n_files} files, {n_bytes / 1024:.1f} KiB")
    print(f"Total: {total_files} files, {total_bytes / 1024 / 1024:.1f} MiB")
    return 0


if __name__ == "__main__":
    sys.exit(main())

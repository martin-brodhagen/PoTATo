#!/usr/bin/env python3
"""Orchestrator: build the shared base data, per-format whitelists, and i18n bundles.

Runs in order:
  1. `prep/base/build.py`                   — generates data/base/{...}.json
  2. `prep/items/patch_categories.py`       — overlays Game8 + manual item categories
  3. `prep/moves/patch_pp.py`               — applies manual PP mapping to moves
  4. `prep/abilities/patch_remove.py`       — removes manually-flagged abilities
  5. `prep/species/patch_cosmetic_formes.py`— re-applies cosmetic-forme synthesis to base
  6. `prep/formats/build.py`                — generates data/formats/<id>.json
  7. `prep/i18n/build.py`                   — generates data/i18n/<lang>/{...}.json
"""

import os
import runpy
import sys

HERE = os.path.dirname(os.path.abspath(__file__))


def run_module(path: str, argv: list[str] | None = None) -> None:
    """Run a script as __main__ with the given argv (sys.argv[1:])."""
    print(f"\n=== Running {path} ===", file=sys.stderr)
    saved_argv = sys.argv
    try:
        sys.argv = [path, *(argv or [])]
        runpy.run_path(path, run_name="__main__")
    finally:
        sys.argv = saved_argv


def main():
    run_module(os.path.join(HERE, "base", "build.py"))

    run_module(os.path.join(HERE, "items", "patch_categories.py"))

    run_module(os.path.join(HERE, "moves", "patch_pp.py"))

    run_module(os.path.join(HERE, "abilities", "patch_remove.py"))

    run_module(os.path.join(HERE, "species", "patch_cosmetic_formes.py"))

    formats_dir = os.path.join(HERE, "formats")
    format_ids = sorted(
        d for d in os.listdir(formats_dir)
        if os.path.isdir(os.path.join(formats_dir, d))
    )
    run_module(os.path.join(HERE, "formats", "build.py"), format_ids)

    run_module(os.path.join(HERE, "i18n", "build.py"))

    print("\nAll builds complete.", file=sys.stderr)


if __name__ == "__main__":
    main()

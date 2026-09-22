#!/usr/bin/env python3
"""Refresh ability-only base data: abilities.json.

Runs the same upstream fetch + Game8 overlay pipeline as `prep/base/build.py`,
but only emits the one file the ability widget cares about. Faster than
`npm run prep:base` when only ability data changed.

Manual patches (prep/abilities/patch_remove.py, prep/species/patch_species_abilities.py)
are NOT applied here — run `npm run prep` (the orchestrator) to overlay them.

Usage:
    python3 prep/base/fetch_abilities.py
"""

import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import build as _build  # noqa: E402


def _write(out_dir: str, name: str, data) -> None:
    path = os.path.join(out_dir, name)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=1, ensure_ascii=False)
    size_kb = os.path.getsize(path) / 1024
    count = len(data) if hasattr(data, "__len__") else "?"
    print(f"  {name}: {size_kb:.1f} KiB ({count} entries)", file=sys.stderr)


def main():
    cache = _build.Cache()

    base = _build.scrape_base(cache)
    abilities_out = _build.build_abilities(base["abilities_raw"])
    # apply_game8_descriptions also overlays moves/items, but passing empty
    # dicts for those is safe (both internal loops no-op on empty inputs).
    _build.apply_game8_descriptions({}, {}, abilities_out)

    out_dir = os.path.join(_build.REPO_ROOT, "data", "base")
    os.makedirs(out_dir, exist_ok=True)
    _write(out_dir, "abilities.json", abilities_out)

    print(f"\nDone! Generated {len(abilities_out)} abilities.", file=sys.stderr)


if __name__ == "__main__":
    main()
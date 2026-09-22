#!/usr/bin/env python3
"""Refresh item-only base data: items.json.

Runs the same upstream fetch + Game8 overlay pipeline as `prep/base/build.py`,
but only emits the one file the item widget cares about. Faster than
`npm run prep:base` when only item data changed.

Manual patches (prep/items/patch_categories.py) are NOT applied here — run
`npm run prep` (the orchestrator) or `npm run prep:items:patch` to overlay
the manual category overrides.

Usage:
    python3 prep/base/fetch_items.py
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
    mod = _build.scrape_mod(cache)
    merged = _build.apply_overrides_stage(base, mod)
    items_out = _build.build_items(merged["items"])
    # apply_game8_descriptions also overlays moves/abilities, but passing
    # empty dicts for those is safe (both internal loops no-op on empty inputs).
    _build.apply_game8_descriptions({}, items_out, {})

    out_dir = os.path.join(_build.REPO_ROOT, "data", "base")
    os.makedirs(out_dir, exist_ok=True)
    _write(out_dir, "items.json", items_out)

    print(f"\nDone! Generated {len(items_out)} items.", file=sys.stderr)


if __name__ == "__main__":
    main()
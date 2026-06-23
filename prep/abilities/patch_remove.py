#!/usr/bin/env python3
"""Remove abilities listed in data/manual-ability-removals.json.

Drops the listed ability ids from:

  - `data/base/abilities.json` — the canonical ability data.
  - `data/formats/<id>.json` — every format whitelist.

The data-loader filters each species' `abilities` array against the
per-format ability whitelist when building the per-format view
(see `lib/data-loader.js`), so any species that had a removed ability
in its `abilities` field will silently lose it in the search detail
and team builder without needing the species record itself to be
edited.

Usage:
    python3 prep/abilities/patch_remove.py
"""

import glob
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.dirname(os.path.dirname(HERE))

ABILITIES_PATH = os.path.join(REPO_ROOT, "data", "base", "abilities.json")
FORMATS_DIR = os.path.join(REPO_ROOT, "data", "formats")
MANUAL_REMOVALS_PATH = os.path.join(REPO_ROOT, "data", "manual-ability-removals.json")


def _load_json(path: str, default):
    if not os.path.isfile(path):
        return default
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def _write_json(path: str, data) -> None:
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=1, ensure_ascii=False)


def _parse_removals(raw: dict) -> list[str]:
    """Parse the list of ability ids to remove from the manual file.

    - Strips `_`-prefixed keys (used for comments).
    - Validates that every entry is a non-empty string.
    """
    if not isinstance(raw, dict):
        raise ValueError(
            f"{MANUAL_REMOVALS_PATH} must be a JSON object, got {type(raw).__name__}"
        )
    raw_remove = raw.get("remove", [])
    if not isinstance(raw_remove, list):
        raise ValueError(
            f"{MANUAL_REMOVALS_PATH}: 'remove' must be a list, got {type(raw_remove).__name__}"
        )
    out: list[str] = []
    for i, aid in enumerate(raw_remove):
        if not isinstance(aid, str) or not aid.strip():
            raise ValueError(
                f"{MANUAL_REMOVALS_PATH}: 'remove[{i}]' must be a non-empty string, got {aid!r}"
            )
        out.append(aid)
    return out


def main():
    print(f"[abilities] reading {MANUAL_REMOVALS_PATH}", file=sys.stderr)
    raw = _load_json(MANUAL_REMOVALS_PATH, {})
    to_remove = _parse_removals(raw)
    if not to_remove:
        print("  no abilities to remove — nothing to do", file=sys.stderr)
        return
    print(f"  {len(to_remove)} ability(ies) to remove: {to_remove}", file=sys.stderr)

    # 1. data/base/abilities.json
    print(f"[abilities] patching {ABILITIES_PATH}", file=sys.stderr)
    abilities = _load_json(ABILITIES_PATH, {})
    if not abilities:
        print(f"  ERROR: {ABILITIES_PATH} is missing or empty — run `npm run prep:base` first",
              file=sys.stderr)
        sys.exit(1)

    removed_from_base: list[str] = []
    for aid in to_remove:
        if aid in abilities:
            del abilities[aid]
            removed_from_base.append(aid)
        else:
            print(f"  NOTE: {aid!r} not present in {ABILITIES_PATH}", file=sys.stderr)
    print(f"  removed from base: {removed_from_base}", file=sys.stderr)

    _write_json(ABILITIES_PATH, abilities)
    size_kb = os.path.getsize(ABILITIES_PATH) / 1024
    print(f"  wrote {ABILITIES_PATH} ({size_kb:.1f} KiB)", file=sys.stderr)

    # 2. data/formats/*.json
    format_paths = sorted(glob.glob(os.path.join(FORMATS_DIR, "*.json")))
    if not format_paths:
        print(f"  WARNING: no format whitelists found in {FORMATS_DIR}", file=sys.stderr)
        return

    for path in format_paths:
        wl = _load_json(path, {})
        if not isinstance(wl, dict):
            print(f"  SKIP {path}: not a JSON object", file=sys.stderr)
            continue
        before = len(wl.get("abilities", []))
        wl["abilities"] = [a for a in wl.get("abilities", []) if a not in to_remove]
        after = len(wl["abilities"])
        if before == after:
            print(f"  {os.path.basename(path)}: no change ({before} abilities)", file=sys.stderr)
            continue
        _write_json(path, wl)
        print(f"  {os.path.basename(path)}: {before} -> {after} abilities", file=sys.stderr)


if __name__ == "__main__":
    main()

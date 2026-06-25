#!/usr/bin/env python3
"""Re-apply per-species baseSpecies / forme overrides to data/base/pokedex.json.

The base build (`prep/base/build.py`) writes `data/base/pokedex.json` from
upstream Showdown data, which encodes a single base per family (e.g.
meowsticfmega.baseSpecies = "Meowstic"). When a family has multiple
encounterable bases that share a mega stone (meowstic-M and meowstic-F
both get meowsticite), the upstream data can't tell which base the
F-mega belongs to without consulting the stone's `megaStone` mapping.
This patch lets us redirect the F-mega to its actual base (meowsticf)
without forking the upstream data.

The patch reads `data/manual-base-species.json` (a small user-edited
file of `{species_id: {baseSpecies, forme}}` entries) and applies those
overrides to the matching species in the base pokedex. Idempotent: a
species already at the desired state is left alone, and re-running
produces no further changes.

Usage:
    python3 prep/species/patch_base_species.py
"""

import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.dirname(os.path.dirname(HERE))

POKEDEX_PATH = os.path.join(REPO_ROOT, "data", "base", "pokedex.json")
MANUAL_PATH = os.path.join(REPO_ROOT, "data", "manual-base-species.json")

# Fields this script is allowed to overwrite on a pokedex entry.
PATCHABLE_FIELDS = ("baseSpecies", "forme")


def _load_json(path, default):
    if not os.path.isfile(path):
        return default
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def main():
    print(f"[species] reading {POKEDEX_PATH}", file=sys.stderr)
    pokedex = _load_json(POKEDEX_PATH, [])
    if not pokedex:
        print(f"  ERROR: {POKEDEX_PATH} is missing or empty — run `npm run prep:base` first",
              file=sys.stderr)
        sys.exit(1)
    print(f"  {len(pokedex)} species in base", file=sys.stderr)

    manual = _load_json(MANUAL_PATH, {})
    manual = {k: v for k, v in manual.items() if not k.startswith("_")}
    if not manual:
        print(f"  no entries in {MANUAL_PATH} — nothing to do", file=sys.stderr)
        return
    print(f"[species] {len(manual)} override(s) in {MANUAL_PATH}", file=sys.stderr)

    by_id = {p["id"]: p for p in pokedex}
    patched_fields = 0
    processed = 0
    missing = 0

    for sid, override in manual.items():
        sp = by_id.get(sid)
        if not sp:
            print(f"  NOTE: species {sid!r} not in base pokedex; skipping",
                  file=sys.stderr)
            missing += 1
            continue
        processed += 1
        for field in PATCHABLE_FIELDS:
            if field not in override:
                continue
            new_val = override[field]
            old_val = sp.get(field)
            if old_val == new_val:
                continue
            sp[field] = new_val
            patched_fields += 1
            print(f"  {sid}.{field}: {old_val!r} -> {new_val!r}",
                  file=sys.stderr)

    if patched_fields:
        with open(POKEDEX_PATH, "w", encoding="utf-8") as f:
            json.dump(pokedex, f, indent=1, ensure_ascii=False)
        size_kb = os.path.getsize(POKEDEX_PATH) / 1024
        print(f"[species] wrote {POKEDEX_PATH} ({size_kb:.1f} KiB)",
              file=sys.stderr)
    else:
        print(f"[species] no changes — {POKEDEX_PATH} left as-is",
              file=sys.stderr)

    print(f"[species] base-species patch: {patched_fields} field(s) patched, "
          f"{processed} entry/entries processed, {missing} skipped (missing species)",
          file=sys.stderr)


if __name__ == "__main__":
    main()

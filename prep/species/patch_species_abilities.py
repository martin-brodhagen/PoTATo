#!/usr/bin/env python3
"""Apply per-species ability overrides to data/base/pokedex.json.

Reads `data/manual-species-abilities.json` and replaces the `abilities`
field of each listed species with the supplied list. Used when upstream
Showdown's mega ability doesn't match what the Champions mod or the
format's tier table implies (e.g. Mega Golisopod listed as Emergency
Exit instead of Tough Claws, Mega Baxcalibur carrying Ice Body as a
secondary when it should be Thermal Exchange only).

The script is idempotent — applying it twice produces the same output.
Entries with species ids not in the base pokedex are skipped with a
stderr NOTE.

Usage:
    python3 prep/species/patch_species_abilities.py
"""

import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.dirname(os.path.dirname(HERE))

POKEDEX_PATH = os.path.join(REPO_ROOT, "data", "base", "pokedex.json")
MANUAL_PATH = os.path.join(REPO_ROOT, "data", "manual-species-abilities.json")

ABILITY_ID_PATH = os.path.join(REPO_ROOT, "data", "base", "abilities.json")


def _load_json(path: str, default):
    if not os.path.isfile(path):
        return default
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def _resolve_ability_id(abilities: dict, display_name: str) -> str | None:
    """Map a display name (e.g. 'Tough Claws') to its ability id (e.g. 'toughclaws').

    Uses the same normalization the data-loader applies
    (`a.toLowerCase().replace(/[\\s\\-.']/g, '')`), so a successful match
    here guarantees the id will exist in the abilities whitelist.
    """
    import re
    norm = re.sub(r"[\s\-\.']+", "", display_name.lower())
    for aid, entry in abilities.items():
        name = entry.get("name", "")
        if not name:
            continue
        if re.sub(r"[\s\-\.']+", "", name.lower()) == norm:
            return aid
    return None


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

    abilities = _load_json(ABILITY_ID_PATH, {})
    by_id = {p["id"]: p for p in pokedex}

    patched = unmatched_ability = missing_species = 0
    for sid, desired in manual.items():
        if sid not in by_id:
            print(f"  NOTE: species {sid!r} not in base pokedex; skipping",
                  file=sys.stderr)
            missing_species += 1
            continue
        for name in desired:
            aid = _resolve_ability_id(abilities, name)
            if not aid:
                print(f"  NOTE: ability {name!r} (for {sid!r}) not in base abilities",
                      file=sys.stderr)
                unmatched_ability += 1
        old = by_id[sid].get("abilities", [])
        by_id[sid]["abilities"] = list(desired)
        if old != list(desired):
            patched += 1
            print(f"  {sid}: {old} -> {list(desired)}", file=sys.stderr)

    if patched:
        with open(POKEDEX_PATH, "w", encoding="utf-8") as f:
            json.dump(pokedex, f, indent=1, ensure_ascii=False)
        size_kb = os.path.getsize(POKEDEX_PATH) / 1024
        print(f"[species] wrote {POKEDEX_PATH} ({size_kb:.1f} KiB)", file=sys.stderr)
    print(f"[species] species-abilities patch: {patched} entry/entries patched, "
          f"{unmatched_ability} unmatched ability, {missing_species} missing species",
          file=sys.stderr)


if __name__ == "__main__":
    main()

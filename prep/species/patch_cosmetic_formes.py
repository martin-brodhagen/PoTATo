#!/usr/bin/env python3
"""Re-apply cosmetic-only forme synthesis to data/base/pokedex.json.

The base build (`prep/base/build.py`) injects synthetic entries for the
cosmetic-only formes listed in `data/manual-cosmetic-formes.json` into the
upstream pokedex, so they're included when the base is built. This patch
performs the same synthesis against the existing `data/base/pokedex.json`
on disk, so editing the manual file and re-running only this script is
enough to keep the base in sync — no need to re-fetch upstream or
re-process the Champions mod.

The script is idempotent: a forme already present in the base pokedex is
left alone. Synthesis source data (types, baseStats, abilities, etc.) is
read from the base entry of each pokemon in `data/base/pokedex.json`
itself, so no network access is required.

Usage:
    python3 prep/species/patch_cosmetic_formes.py
"""

import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.dirname(os.path.dirname(HERE))

POKEDEX_PATH = os.path.join(REPO_ROOT, "data", "base", "pokedex.json")
MANUAL_PATH = os.path.join(REPO_ROOT, "data", "manual-cosmetic-formes.json")

# Fields copied from the base entry onto each synthesized cosmetic forme.
# Must match what `prep/base/build.py` synthesizes during the build.
SYNTHESIZED_FIELDS = (
    "num", "types", "baseStats", "abilities",
    "heightm", "weightkg", "gender",
)


def _cosmetic_forme_id(base_id: str, forme: str) -> str:
    """Compute the upstream-style species id for a cosmetic forme.

    Mirrors Showdown's id convention: base_id + forme-normalized
    (lowercased, spaces and dashes removed).
    """
    return base_id + forme.lower().replace(" ", "").replace("-", "")


def _load_json(path: str, default):
    if not os.path.isfile(path):
        return default
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def _abilities_to_dict(abilities) -> dict:
    """Convert a list of ability names back to the upstream-style dict.

    The base pokedex stores abilities as a list (e.g.
    `['Forecast', 'Hail Control']`), produced by `build_pokedex`. The
    synthesis expects the upstream shape (`{'0': 'Forecast', '1': '...'}`)
    so the cosmetic entries are interchangeable with the ones already
    in `data/base/pokedex.json` after a re-run.
    """
    if not isinstance(abilities, list):
        return abilities or {}
    out: dict = {}
    for i, ab in enumerate(abilities):
        if not ab:
            continue
        out[str(i)] = ab
    return out


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
    print(f"[species] {len(manual)} base(s) in {MANUAL_PATH}", file=sys.stderr)

    by_id = {p["id"]: p for p in pokedex}
    synthesized = skipped = missing_base = 0

    for base_id, formes in manual.items():
        base = by_id.get(base_id)
        if not base:
            print(f"  NOTE: base {base_id!r} not in base pokedex; skipping "
                  f"{len(formes)} forme(s)", file=sys.stderr)
            missing_base += len(formes)
            continue
        base_name = base.get("name", base_id)
        for forme in formes:
            sid = _cosmetic_forme_id(base_id, forme)
            if sid in by_id:
                skipped += 1
                continue
            new_entry = {
                "id": sid,
                "name": f"{base_name}-{forme}",
                "baseSpecies": base_name,
                "forme": forme,
                "isCosmeticForme": True,
            }
            for f in SYNTHESIZED_FIELDS:
                if f == "abilities":
                    new_entry["abilities"] = _abilities_to_dict(base.get(f))
                else:
                    new_entry[f] = base.get(f)
            pokedex.append(new_entry)
            by_id[sid] = new_entry
            synthesized += 1

    if synthesized:
        pokedex.sort(key=lambda p: p["id"])
    print(f"[species] cosmetic formes: {synthesized} synthesized, "
          f"{skipped} already present, {missing_base} skipped (missing base)",
          file=sys.stderr)

    if synthesized:
        with open(POKEDEX_PATH, "w", encoding="utf-8") as f:
            json.dump(pokedex, f, indent=1, ensure_ascii=False)
        size_kb = os.path.getsize(POKEDEX_PATH) / 1024
        print(f"[species] wrote {POKEDEX_PATH} ({size_kb:.1f} KiB)", file=sys.stderr)


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Build per-format whitelists for PoTATo.

Reads `data/base/*` (produced by `prep/base/build.py`) and a per-format
`prep/formats/<id>/config.json` (whitelists + label/version), and writes
`data/formats/<id>.json` — a small whitelist file consumed by the frontend.

The format whitelist contains:
  - id, label, version
  - species[]   legal species IDs
  - items[]     legal item IDs
  - abilities[] legal ability IDs (derived from species × species.abilities)

Per-format derived data (learnsets, moves-with-learnsets, etc.) is filtered
in the frontend from `data/base/*` at load time.

Usage:
    python3 prep/formats/build.py m-b m-a
"""

import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))

REPO_ROOT = os.path.dirname(os.path.dirname(HERE))
FORMATS_DIR = os.path.join(REPO_ROOT, "prep", "formats")
OUT_DIR = os.path.join(REPO_ROOT, "data", "formats")
BASE_DIR = os.path.join(REPO_ROOT, "data", "base")


def load_config(format_id: str) -> dict:
    path = os.path.join(FORMATS_DIR, format_id, "config.json")
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def load_base():
    """Load the shared base data. Returns dict with index, moves, items, abilities."""
    out = {}
    for name in ("pokedex", "moves", "items", "abilities"):
        path = os.path.join(BASE_DIR, f"{name}.json")
        if not os.path.isfile(path):
            raise SystemExit(f"missing {path} — run prep/base/build.py first")
        with open(path, "r", encoding="utf-8") as f:
            out[name] = json.load(f)
    return out


def whitelist_species(config: dict, pokedex: list[dict]) -> list[str]:
    base_ids = {p["id"] for p in pokedex}
    # If a flat `species` list is provided, use it directly. Otherwise
    # combine the split fields (legacy M-A style).
    if "species" in config:
        candidates = set(config["species"])
    else:
        candidates = (
            set(config.get("species_non_mega", []))
            | set(config.get("m_b_new_species", []))
            | set(config.get("species_mega", []))
            | set(config.get("m_b_new_mega", []))
            | set(config.get("species_overrides", []))
        )
    legal = sorted(candidates & base_ids)

    missing = sorted(candidates - base_ids)
    if missing:
        print(f"  NOTE: {len(missing)} whitelist species not in base pokedex (e.g. {missing[:3]})",
              file=sys.stderr)

    return legal


def whitelist_items(config: dict, items: dict) -> list[str]:
    base_ids = set(items.keys())
    # If a flat `items` list is provided, use it directly. Otherwise
    # combine the split fields.
    if "items" in config and not config.get("m_b_new_items"):
        candidates = set(config["items"])
    else:
        candidates = (
            set(config.get("items", []))
            | set(config.get("m_b_new_items", []))
        )
    legal = sorted(candidates & base_ids)

    missing = sorted(candidates - base_ids)
    if missing:
        print(f"  NOTE: {len(missing)} whitelist items not in base data (e.g. {missing[:3]})",
              file=sys.stderr)

    return legal


def whitelist_abilities(config: dict, abilities: dict, legal_species: list[str],
                        pokedex_index: dict[str, dict]) -> list[str]:
    """Derive legal ability ids from the format's species.

    Walks each species' `abilities` field, normalises the name to an id, and
    intersects with the base abilities. Optional `unique_abilities` config
    entries (e.g. eelevate, firemane) are added verbatim.
    """
    name_to_id: dict[str, str] = {}
    for aid, entry in abilities.items():
        name = entry.get("name", "")
        if name:
            key = (
                name.lower()
                .replace(" ", "")
                .replace("-", "")
                .replace(".", "")
                .replace("'", "")
            )
            name_to_id[key] = aid

    seen: set[str] = set()
    for sid in legal_species:
        species = pokedex_index.get(sid)
        if not species:
            continue
        for a in species.get("abilities", []):
            if not a:
                continue
            key = (
                a.lower()
                .replace(" ", "")
                .replace("-", "")
                .replace(".", "")
                .replace("'", "")
            )
            aid = name_to_id.get(key)
            if aid:
                seen.add(aid)

    # Pull in any explicitly named unique abilities (e.g. eelevate, firemane)
    for key in config.get("unique_abilities", {}).keys():
        aid = name_to_id.get(key)
        if aid:
            seen.add(aid)

    return sorted(seen)


def build_format(format_id: str, base: dict) -> dict:
    config = load_config(format_id)
    pokedex_list = base["pokedex"]
    pokedex_index = {p["id"]: p for p in pokedex_list}

    print(f"[{format_id}] whitelisting...", file=sys.stderr)
    species = whitelist_species(config, pokedex_list)
    items = whitelist_items(config, base["items"])
    abilities = whitelist_abilities(config, base["abilities"], species, pokedex_index)

    print(f"  {len(species)} species, {len(items)} items, {len(abilities)} abilities",
          file=sys.stderr)

    return {
        "id": config["id"],
        "label": config.get("label", config["id"]),
        "version": config.get("version", "0.0.0"),
        "species": species,
        "items": items,
        "abilities": abilities,
    }


def write_output(out: dict):
    os.makedirs(OUT_DIR, exist_ok=True)
    path = os.path.join(OUT_DIR, f"{out['id']}.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(out, f, indent=1, ensure_ascii=False)
    size_kb = os.path.getsize(path) / 1024
    print(f"  {path}: {size_kb:.1f} KiB", file=sys.stderr)


def main(argv: list[str]):
    if not argv:
        # Default: all formats
        argv = sorted(
            d for d in os.listdir(FORMATS_DIR)
            if os.path.isdir(os.path.join(FORMATS_DIR, d))
        )
        print(f"Building all formats: {argv}", file=sys.stderr)

    base = load_base()
    for fid in argv:
        out = build_format(fid, base)
        write_output(out)


if __name__ == "__main__":
    main(sys.argv[1:])

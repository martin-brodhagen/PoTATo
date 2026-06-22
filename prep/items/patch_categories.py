#!/usr/bin/env python3
"""Apply item categories from Game8 + a manual patch file to data/base/items.json.

Two layers, in order:

  1. `data/game8-categories.json` — initial categories scraped from Game8's
     Pokémon Champions items page. Keyed by display name (e.g. "King's Rock").
  2. `data/manual-item-categories.json` — human-curated corrections keyed by
     item id (e.g. "kingsrock"). Each entry FULLY REPLACES the Game8 category
     for that item, so adding an item here is unambiguous.

Items with no category from either layer get `["Other"]` as the final
fallback so the cat bar in the item search widget is never empty.

Usage:
    python3 prep/items/patch_categories.py
"""

import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.dirname(os.path.dirname(HERE))

sys.path.insert(0, os.path.join(REPO_ROOT, "prep", "_lib"))
from game8 import normalize_name as game8_normalize_name  # noqa: E402

# Mirror lib/types.js → ITEM_CATEGORIES (kept in sync manually).
VALID_CATEGORIES = {
    "Stat Boost", "Power Boost", "Defense", "Recovery", "Effect Extend",
    "Berry", "Mega Stone", "Other",
}

ITEMS_PATH = os.path.join(REPO_ROOT, "data", "base", "items.json")
GAME8_CATEGORIES_PATH = os.path.join(REPO_ROOT, "data", "game8-categories.json")
MANUAL_CATEGORIES_PATH = os.path.join(REPO_ROOT, "data", "manual-item-categories.json")


def _normalize_name(name: str) -> str:
    """Same scheme as prep/_lib/game8.py — used to map Game8 names → item ids."""
    return game8_normalize_name(name)


def _validate(cat_list: list[str], iid: str) -> list[str]:
    for c in cat_list:
        if c not in VALID_CATEGORIES:
            raise ValueError(
                f"item {iid!r} has unknown category {c!r}; "
                f"valid: {sorted(VALID_CATEGORIES)}"
            )
    return cat_list


def _load_json(path: str, default):
    if not os.path.isfile(path):
        return default
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def _additive_rules(iid: str, entry: dict) -> list[str]:
    """Compute categories that are true by construction (id, item data).

    These are ADDED to whatever Game8 / the manual patch produced, since
    Game8 uses a single-category model and our cat bar expects multiple
    tags per item so the same item can appear under e.g. "Berry" and
    "Recovery".
    """
    out: list[str] = []
    # An item with the `megaStone` field is a mega stone by definition.
    if entry.get("megaStone"):
        out.append("Mega Stone")
    # Berries are tagged by id convention (covers all type-resist and
    # healing berries — Game8 puts these under Defense/Recovery only).
    if "berry" in iid:
        out.append("Berry")
    return out


def build_categories() -> dict[str, list[str]]:
    """Return {item_id: [category, ...]} for every item in the base.

    Precedence (highest wins): manual patch > Game8 > None → "Other".
    Mechanical truths (megaStone field, "berry" in id) are ADDED to the
    result regardless of source, since they don't change between rebuilds
    and Game8's single-category model can't express them.
    """
    items = _load_json(ITEMS_PATH, {})
    g8 = _load_json(GAME8_CATEGORIES_PATH, {})
    manual_raw = _load_json(MANUAL_CATEGORIES_PATH, {})

    # Strip the comment key from the manual file (if present).
    manual = {k: v for k, v in manual_raw.items() if not k.startswith("_")}

    # Validate the manual file up front so typos surface here, not at render time.
    for iid, cats in manual.items():
        if not isinstance(cats, list):
            raise ValueError(f"manual entry {iid!r} must be a list, got {type(cats).__name__}")
        _validate(cats, iid)

    # Game8 is keyed by display name; map to item id via _normalize_name.
    g8_by_id: dict[str, str] = {}
    for display_name, cat in g8.items():
        if cat not in VALID_CATEGORIES:
            print(f"  NOTE: Game8 has unknown category {cat!r} for {display_name!r}; skipping",
                  file=sys.stderr)
            continue
        g8_by_id[_normalize_name(display_name)] = cat

    out: dict[str, list[str]] = {}
    for iid, entry in items.items():
        if iid in manual:
            base_cats = list(manual[iid])
        elif iid in g8_by_id:
            base_cats = [g8_by_id[iid]]
        else:
            base_cats = ["Other"]

        # Layer additive rules on top (multi-tag).
        merged = list(base_cats)
        for cat in _additive_rules(iid, entry):
            if cat not in merged:
                merged.append(cat)

        out[iid] = merged

    return out


def main():
    print(f"[items] reading {ITEMS_PATH}", file=sys.stderr)
    items = _load_json(ITEMS_PATH, {})
    if not items:
        print(f"  ERROR: {ITEMS_PATH} is missing or empty — run `npm run prep:base` first",
              file=sys.stderr)
        sys.exit(1)
    print(f"  {len(items)} items", file=sys.stderr)

    manual = _load_json(MANUAL_CATEGORIES_PATH, {})
    manual = {k: v for k, v in manual.items() if not k.startswith("_")}
    print(f"[items] {len(manual)} manual corrections from {MANUAL_CATEGORIES_PATH}", file=sys.stderr)

    g8 = _load_json(GAME8_CATEGORIES_PATH, {})
    print(f"[items] {len(g8)} entries from {GAME8_CATEGORIES_PATH}", file=sys.stderr)

    categories = build_categories()

    # Count distribution.
    counts: dict[str, int] = {}
    for cats in categories.values():
        # Each item contributes to every category it's in.
        for c in cats:
            counts[c] = counts.get(c, 0) + 1
    print("[items] category distribution:", file=sys.stderr)
    for cat in sorted(VALID_CATEGORIES):
        n = counts.get(cat, 0)
        print(f"  {cat}: {n}", file=sys.stderr)

    # Apply to items.json — replace the field, don't drop other keys.
    for iid, entry in items.items():
        entry["category"] = categories[iid]

    with open(ITEMS_PATH, "w", encoding="utf-8") as f:
        json.dump(items, f, indent=1, ensure_ascii=False)
    size_kb = os.path.getsize(ITEMS_PATH) / 1024
    print(f"[items] wrote {ITEMS_PATH} ({size_kb:.1f} KiB)", file=sys.stderr)


if __name__ == "__main__":
    main()

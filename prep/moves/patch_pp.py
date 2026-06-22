#!/usr/bin/env python3
"""Apply a uniform PP mapping to data/base/moves.json.

Reads `data/manual-move-pp.json`, a `{old_pp: new_pp}` map, and rewrites
the `pp` field on every move whose current value matches one of the keys.
Moves with PP values not in the map are left untouched.

Usage:
    python3 prep/moves/patch_pp.py
"""

import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.dirname(os.path.dirname(HERE))

MOVES_PATH = os.path.join(REPO_ROOT, "data", "base", "moves.json")
MANUAL_PP_PATH = os.path.join(REPO_ROOT, "data", "manual-move-pp.json")


def _load_json(path: str, default):
    if not os.path.isfile(path):
        return default
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def _parse_mapping(raw: dict) -> dict[int, int]:
    """Parse the {old_pp: new_pp} mapping from the manual file.

    - Strips `_`-prefixed keys (used for comments).
    - Validates that keys and values are non-negative integers.
    """
    out: dict[int, int] = {}
    for k, v in raw.items():
        if k.startswith("_"):
            continue
        try:
            old = int(k)
            new = int(v)
        except (TypeError, ValueError):
            raise ValueError(
                f"manual-move-pp.json entry {k!r}: {v!r} — keys and values must be integers"
            )
        if old < 0 or new < 0:
            raise ValueError(
                f"manual-move-pp.json entry {old!r} -> {new!r}: PP values must be non-negative"
            )
        out[old] = new
    return out


def main():
    print(f"[moves] reading {MOVES_PATH}", file=sys.stderr)
    moves = _load_json(MOVES_PATH, {})
    if not moves:
        print(f"  ERROR: {MOVES_PATH} is missing or empty — run `npm run prep:base` first",
              file=sys.stderr)
        sys.exit(1)
    print(f"  {len(moves)} moves", file=sys.stderr)

    raw = _load_json(MANUAL_PP_PATH, {})
    mapping = _parse_mapping(raw)
    if not mapping:
        print(f"  no PP mapping entries in {MANUAL_PP_PATH} — nothing to do",
              file=sys.stderr)
        return

    print(f"[moves] PP mapping from {MANUAL_PP_PATH}:", file=sys.stderr)
    for old, new in sorted(mapping.items()):
        print(f"  {old} -> {new}", file=sys.stderr)

    # Apply the mapping. Report per-bucket counts.
    changes: dict[tuple[int, int], int] = {}
    unaffected = 0
    for mid, entry in moves.items():
        if not isinstance(entry, dict):
            continue
        pp = entry.get("pp")
        if pp is None:
            continue
        if pp in mapping:
            new_pp = mapping[pp]
            if new_pp == pp:
                continue  # no-op
            entry["pp"] = new_pp
            changes[(pp, new_pp)] = changes.get((pp, new_pp), 0) + 1
        else:
            unaffected += 1

    print("[moves] applied:", file=sys.stderr)
    for (old, new), count in sorted(changes.items()):
        print(f"  pp {old} -> {new}: {count} moves", file=sys.stderr)
    print(f"  unaffected: {unaffected}", file=sys.stderr)

    # Idempotency check: no move should have a PP value that's both a key
    # and a value in the mapping (would cause re-application). For our
    # current mapping (5/10/15 -> 8/12/16) the values don't overlap with
    # the keys, so a re-run would no-op.
    overlap = set(mapping) & {v for v in mapping.values()}
    if overlap:
        print(f"  WARNING: mapping has overlap between keys and values: {sorted(overlap)}",
              file=sys.stderr)
        print(f"  re-running the patch will continue to apply the same changes",
              file=sys.stderr)

    with open(MOVES_PATH, "w", encoding="utf-8") as f:
        json.dump(moves, f, indent=1, ensure_ascii=False)
    size_kb = os.path.getsize(MOVES_PATH) / 1024
    print(f"[moves] wrote {MOVES_PATH} ({size_kb:.1f} KiB)", file=sys.stderr)


if __name__ == "__main__":
    main()

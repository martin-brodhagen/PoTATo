#!/usr/bin/env python3
"""Refresh move-only base data: moves.json + learnsets.json + moves-with-learnsets.json.

Runs the same upstream fetch + legality-filter pipeline as `prep/base/build.py`,
but only emits the three files the move widget cares about. Faster than
`npm run prep:base` when only move data changed.

Manual patches (prep/moves/patch_pp.py, prep/abilities/patch_remove.py, etc.)
are NOT applied here — run `npm run prep` (the orchestrator) to overlay them.

Usage:
    python3 prep/base/fetch_moves.py
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
    _build.inject_cosmetic_formes(base["pokedex"])
    mod = _build.scrape_mod(cache)
    merged = _build.apply_overrides_stage(base, mod)
    legal_species = _build.compute_legal_species(base["pokedex"], mod["formats_data"])
    legal_moves = _build.compute_legal_moves(merged["moves"])
    learnsets_out = _build.build_learnsets(
        legal_species, legal_moves,
        base["learnsets"], mod["learnsets"], base["pokedex"],
    )
    moves_out = _build.build_moves(legal_moves, merged["moves"])
    # apply_game8_descriptions processes moves internally; pass empty dicts
    # for items/abilities so it only touches moves.
    _build.apply_game8_descriptions(moves_out, {}, {})
    moves_with_learnsets_out = _build.build_moves_with_learnsets(moves_out, learnsets_out)
    # Sort keys for deterministic output. build_learnsets iterates a set
    # (non-deterministic across runs), but downstream consumers don't care
    # about key order — sorting just makes the wrapper's output reproducible.
    learnsets_out = dict(sorted(learnsets_out.items()))
    moves_with_learnsets_out = dict(sorted(moves_with_learnsets_out.items()))

    out_dir = os.path.join(_build.REPO_ROOT, "data", "base")
    os.makedirs(out_dir, exist_ok=True)
    _write(out_dir, "moves.json", moves_out)
    _write(out_dir, "learnsets.json", learnsets_out)
    _write(out_dir, "moves-with-learnsets.json", moves_with_learnsets_out)

    print(f"\nDone! Generated {len(moves_out)} moves.", file=sys.stderr)


if __name__ == "__main__":
    main()
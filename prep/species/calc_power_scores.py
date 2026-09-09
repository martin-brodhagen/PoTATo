#!/usr/bin/env python3
"""Compute and write powerScores for every entry in data/base/pokedex.json.

The base build (`prep/base/build.py`) seeds each entry with a zero-filled
`powerScores` block as a placeholder. This script overwrites those
placeholders with the real per-pokemon scores, recomputed from each
entry's stats / types / abilities.

The calculation lives in `compute_power_scores(entry)`. The current body
is a stub that returns 1 for every score — the real formula will be
supplied later; replace it when ready.

Usage:
    python3 prep/species/calc_power_scores.py
"""

import json
import os
import sys
import math

HERE = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.dirname(os.path.dirname(HERE))

POKEDEX_PATH = os.path.join(REPO_ROOT, "data", "base", "pokedex.json")
MOVES_PATH = os.path.join(REPO_ROOT, "data", "base", "moves.json")
LEARNSETS_PATH = os.path.join(REPO_ROOT, "data", "base", "learnsets.json")

# Must match `prep/base/build.py:DEFAULT_POWER_SCORES`.
POWER_SCORE_KEYS = (
    "physicalType1",
    "physicalType2",
    "specialType1",
    "specialType2",
    "physicalDefense",
    "physicalDefenseFull",
    "specialDefense",
    "specialDefenseFull",
)


# PROVISIONAL — Pokémon Champions stat offsets (HP gets +75, others +20).
# Will be re-derived from authoritative sources later.
STAT_OFFSETS = {"hp": 75}
DEFAULT_STAT_OFFSET = 20

# Full-investment scenario: 32 stat points + a +1.1 nature on offense/defense.
FULL_INVESTMENT = 32
POSITIVE_NATURE = 1.1

# Standard attacker scenario for bulk scores.
BULK_ATTACK = 200
BULK_BASE_POWER = 100

# Offensive-score modifiers.
LIFE_ORB_MULTIPLIER = 1.3
DEFAULT_STAB_MULTIPLIER = 1.5
ADAPTABILITY_STAB_MULTIPLIER = 2.0

# TODO(move-drawback-filter): the previous hardcoded EXCLUDED_OFFENSIVE_MOVES
# set (recharging / charging / lock-in / self-destruct) has been removed —
# for now, every learned offensive move is eligible, so the calculation can
# over-rely on signature moves (Hyper Beam, Frenzy Plant, Solar Beam, etc.).
#
# The intended replacement is a user-facing "drawback" filter on the pokedex
# grid that lets the user toggle which drawback buckets disqualify a move
# from the power-score calculation. Buckets to expose:
#   - "recharge-signature" — recharging signature moves (Frenzy Plant,
#     Blast Burn, Hydro Cannon, …)
#   - "recharge-generic"   — recharging generic moves (Hyper Beam, Giga Impact)
#   - "charging"           — 2-turn charge moves (Solar Beam, Solar Blade,
#     Meteor Beam, Electro Shot, Focus Punch) — upstream's `charge` signal is
#     unreliable for some signatures, may need a curated seed list
#   - "lock-in"            — multi-turn locked-in moves (Petal Dance, Outrage,
#     Thrash, Raging Fury)
#   - "self-destruct"      — Explosion, Self-Destruct, Mind Blown
#
# Wire path: a filter widget in `lib/pokemon-search-widget.js` collects the
# checked buckets, the frontend passes them to a per-pokemon power-score
# recomputation that calls into a JS port of this script (or this script
# learns to accept a `--disallow <bucket>,...` flag). Each move gets
# classified into 0+ buckets by inspecting `data/base/moves.json` fields
# (`selfdestruct`, `self.volatileStatus`, `condition`, `flags`, etc.); moves
# in a checked bucket are skipped in `select_strongest_offensive_move`.
# For now the filter is bypassed entirely.

# Always-on damage-boosting abilities. Conditional low-HP ones
# (Blaze / Overgrow / Torrent / Swarm) are deliberately excluded.
# Each entry: ability_id -> (multiplier, predicate_on_move_dict).
ALWAYS_ON_DAMAGE_ABILITIES = {
    "firemane":     (1.5, lambda m: m.get("type") == "Fire"),
    "hugepower":    (2.0, lambda m: m.get("category") == "Physical"),
    "purepower":    (2.0, lambda m: m.get("category") == "Physical"),
    "toughclaws":   (1.3, lambda m: "contact" in (m.get("flags") or [])),
    "ironfist":     (1.2, lambda m: "punch"   in (m.get("flags") or [])),
    "reckless":     (1.2, lambda m: bool(m.get("recoil"))),
    "sharpness":    (1.5, lambda m: "slicing" in (m.get("flags") or [])),
    "strongjaw":    (1.5, lambda m: "bite"    in (m.get("flags") or [])),
    "megalauncher": (1.5, lambda m: "pulse"   in (m.get("flags") or [])),
    "fairyaura":    (4/3, lambda m: m.get("type") == "Fairy"),
    "parentalbond": (1.25, lambda m: m.get("category") in ("Physical", "Special")),
    "technician":   (1.5, lambda m: (m.get("basePower") or 0) <= 60),
}

# Move-type-changing abilities. Each entry: ability_id ->
# (source, target, extra_boost). `source` is either a move type (e.g.
# "Normal") or the sentinel "sound" for Liquid Voice (any move with the
# `sound` flag). `extra_boost` is the multiplier stacked on top of STAB.
# Normal→X abilities give ×1.2 per their in-game desc; Liquid Voice gives
# no extra boost.
TYPE_CHANGING_ABILITIES = {
    "pixilate":    ("Normal",   "Fairy",    1.2),
    "aerilate":    ("Normal",   "Flying",   1.2),
    "refrigerate": ("Normal",   "Ice",      1.2),
    "galvanize":   ("Normal",   "Electric", 1.2),
    "dragonize":   ("Normal",   "Dragon",   1.2),
    "liquidvoice": ("sound",    "Water",    1.0),
}

ADAPTABILITY_ID = "adaptability"

def calc_base_damage(base_power, attack, defense):
    return math.floor( math.floor( 22 * base_power * ( attack / defense ) / 50) + 2 )

def calc_final_damage(
        base_power,
        attack,
        defense,
        range_modifier = 1,
        weather = 1,
        crit = 1,
        roll =  1,
        stab = 1,
        type_effectiveness = 1,
        burn = 1,
        other = 1
    ):
    damage = calc_base_damage(base_power, attack, defense)
    damage = math.floor(damage * range_modifier)
    damage = math.floor(damage * weather)
    damage = math.floor(damage * crit)
    damage = math.floor(damage * roll)
    damage = math.floor(damage * stab)
    damage = math.floor(damage * type_effectiveness)
    damage = math.floor(damage * burn)
    damage = math.floor(damage * other)
    return damage


def calc_effective_stat(base: int, stat_name: str,
                        investment: int = 0, nature: float = 1.0) -> int:
    """Champions effective stat: floor((base + offset + investment) * nature).

    HP ignores the nature multiplier.
    """
    offset = STAT_OFFSETS.get(stat_name, DEFAULT_STAT_OFFSET)
    if stat_name == "hp":
        return base + offset + investment
    return math.floor((base + offset + investment) * nature)


def bulk_score(effective_defense: int, effective_hp: int) -> int:
    """Bulk = HP remaining % (ceiled) after a BULK_BASE_POWER hit from BULK_ATTACK."""
    damage = calc_final_damage(BULK_BASE_POWER, BULK_ATTACK, effective_defense)
    remaining_pct = 100 - 100 * damage / effective_hp
    return math.ceil(remaining_pct)


# Module-level caches for the larger data files (loaded lazily on first use).
_MOVES: dict | None = None
_LEARNSETS: list | None = None


def _ability_id(name: str) -> str:
    return name.lower().replace(" ", "").replace("-", "").replace("'", "")


def _is_mega(entry: dict) -> bool:
    return "Mega" in str(entry.get("forme") or "")


def _effective_bp(move: dict, has_technician: bool) -> float:
    """BP scaled by multi-hit count and the Technician boost (×1.5 when
    base BP ≤ 60 and the pokemon has Technician). For `[min, max]` hit
    ranges, uses the max."""
    bp = move.get("basePower") or 0
    if has_technician and bp <= 60:
        bp *= 1.5
    hits = move.get("multihit") or 1
    if isinstance(hits, list):
        hits = max(hits)
    return bp * hits


def select_strongest_offensive_move(entry: dict, type_name: str,
                                     category: str) -> dict | None:
    """Pick the move the pokemon learns that deals the most raw damage to
    `type_name` — either natively or via a type-changing ability (Pixilate
    etc. for Normal→X, Liquid Voice for sound→Water). Strength is measured
    by effective BP (basePower × multihit count, with ×1.5 from Technician
    when BP ≤ 60). Returns the move dict or None.

    Drawback filtering (recharging / charging / lock-in / self-destruct)
    is intentionally NOT applied here for now — see the
    TODO(move-drawback-filter) block near the top of this file.
    """
    if _MOVES is None or _LEARNSETS is None:
        _load_move_data()
    sid = entry.get("id", "")
    learned = _LEARNSETS.get(sid, []) if isinstance(_LEARNSETS, dict) else []
    abilities = [_ability_id(a) for a in (entry.get("abilities") or [])]
    has_technician = "technician" in abilities
    best_ebp = -1.0
    best_move = None
    for mid in learned:
        mv = _MOVES.get(mid)
        if not isinstance(mv, dict):
            continue
        if mv.get("category") != category:
            continue
        ebp = _effective_bp(mv, has_technician)
        if mv.get("type") == type_name:
            if ebp > best_ebp:
                best_ebp = ebp
                best_move = mv
            continue
        for aid in abilities:
            if _move_converts_to(mv, aid) == type_name:
                if ebp > best_ebp:
                    best_ebp = ebp
                    best_move = mv
                break
    return best_move


def _move_converts_to(move: dict, ability_id: str) -> str | None:
    """If `ability_id` (a type-changing ability) changes `move`'s type,
    return the new type. Otherwise None."""
    rule = TYPE_CHANGING_ABILITIES.get(ability_id)
    if rule is None:
        return None
    source, target, _ = rule
    if source == "sound":
        if "sound" in (move.get("flags") or []):
            return target
    elif move.get("type") == source:
        return target
    return None


def ability_damage_modifier(pokemon_abilities: list, move: dict) -> float:
    """Multiplicative damage bonus from always-on ability effects that apply
    to `move`. Combines all matching effects (e.g. Huge Power + Tough Claws
    on a contact physical move = 2.0 × 1.3). Type-changing abilities stack
    their extra_boost on top. Returns 1.0 when no ability matches.
    Adaptability is handled separately (it adjusts STAB, not this)."""
    modifier = 1.0
    for name in pokemon_abilities or []:
        aid = _ability_id(name)
        # Type-changing ability boost (Normal→X ×1.2; sound→Water ×1.0).
        if aid in TYPE_CHANGING_ABILITIES:
            source, target, boost = TYPE_CHANGING_ABILITIES[aid]
            converted = False
            if source == "sound":
                if "sound" in (move.get("flags") or []):
                    converted = True
            elif move.get("type") == source:
                converted = True
            if converted:
                modifier *= boost
        # Other always-on damage abilities.
        rule = ALWAYS_ON_DAMAGE_ABILITIES.get(aid)
        if rule is not None:
            mult, predicate = rule
            if predicate(move):
                modifier *= mult
    return modifier


def offensive_score(entry: dict, type_name: str, category: str,
                    attack_stat_name: str) -> int:
    """Damage the pokemon's strongest qualifying `<type_name>` `<category>`
    move deals to a standard defender (200 in the relevant defense stat),
    using full investment, STAB (with Adaptability), always-on ability
    bonuses, and a Life Orb (×1.3) for non-megas. Multi-hit moves apply
    their full hit count (max for random ranges) on top. Returns 0 if the
    pokemon learns no qualifying move."""
    move = select_strongest_offensive_move(entry, type_name, category)
    if move is None:
        return 0
    base_atk = entry["baseStats"][attack_stat_name]
    eff_atk = calc_effective_stat(base_atk, attack_stat_name,
                                   investment=FULL_INVESTMENT,
                                   nature=POSITIVE_NATURE)
    has_adapt = any(_ability_id(n) == ADAPTABILITY_ID
                    for n in entry.get("abilities") or [])
    stab = ADAPTABILITY_STAB_MULTIPLIER if has_adapt else DEFAULT_STAB_MULTIPLIER
    defender_stat = 200
    dmg = calc_final_damage(move["basePower"], eff_atk, defender_stat,
                            stab=stab)
    dmg = math.floor(dmg * ability_damage_modifier(entry.get("abilities"), move))
    if not _is_mega(entry):
        dmg = math.floor(dmg * LIFE_ORB_MULTIPLIER)
    # Multi-hit: each hit deals the same damage.
    hits = move.get("multihit") or 1
    if isinstance(hits, list):
        hits = max(hits)
    if hits > 1:
        dmg *= hits
    return dmg


def compute_power_scores(entry: dict) -> dict[str, int]:
    """Compute the eight power scores for a single pokedex entry.

    Bulk scores are computed both uninvested and full-investment. Special
    offense is wired for `specialType1` only — the other three offensive
    slots stay at 1 until their formulas land.
    """
    base_stats = entry["baseStats"]

    eff_hp_no_inv = calc_effective_stat(base_stats["hp"], "hp")
    eff_def_no_inv = calc_effective_stat(base_stats["def"], "def")
    eff_spd_no_inv = calc_effective_stat(base_stats["spd"], "spd")

    eff_hp_full = calc_effective_stat(base_stats["hp"], "hp",
                                      investment=FULL_INVESTMENT)
    eff_def_full = calc_effective_stat(base_stats["def"], "def",
                                       investment=FULL_INVESTMENT,
                                       nature=POSITIVE_NATURE)
    eff_spd_full = calc_effective_stat(base_stats["spd"], "spd",
                                       investment=FULL_INVESTMENT,
                                       nature=POSITIVE_NATURE)

    scores = {key: 1 for key in POWER_SCORE_KEYS}
    scores["physicalDefense"] = bulk_score(eff_def_no_inv, eff_hp_no_inv)
    scores["physicalDefenseFull"] = bulk_score(eff_def_full, eff_hp_full)
    scores["specialDefense"] = bulk_score(eff_spd_no_inv, eff_hp_no_inv)
    scores["specialDefenseFull"] = bulk_score(eff_spd_full, eff_hp_full)
    types = entry.get("types") or []
    if types:
        scores["physicalType1"] = offensive_score(entry, types[0], "Physical", "atk")
        if len(types) > 1:
            scores["physicalType2"] = offensive_score(entry, types[1], "Physical", "atk")
        else:
            scores["physicalType2"] = 0
        scores["specialType1"] = offensive_score(entry, types[0], "Special", "spa")
        if len(types) > 1:
            scores["specialType2"] = offensive_score(entry, types[1], "Special", "spa")
        else:
            scores["specialType2"] = 0
    return scores


def _load_move_data():
    """Populate the module-level _MOVES / _LEARNSETS caches."""
    global _MOVES, _LEARNSETS
    if _MOVES is None:
        _MOVES = _load_json(MOVES_PATH, {})
    if _LEARNSETS is None:
        _LEARNSETS = _load_json(LEARNSETS_PATH, {})


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

    updated = unchanged = 0
    for entry in pokedex:
        new_scores = compute_power_scores(entry)
        if entry.get("powerScores") != new_scores:
            entry["powerScores"] = new_scores
            updated += 1
        else:
            unchanged += 1

    if updated:
        with open(POKEDEX_PATH, "w", encoding="utf-8") as f:
            json.dump(pokedex, f, indent=1, ensure_ascii=False)
        size_kb = os.path.getsize(POKEDEX_PATH) / 1024
        print(f"[species] wrote {POKEDEX_PATH} ({size_kb:.1f} KiB)",
              file=sys.stderr)
    else:
        print(f"[species] no changes — {POKEDEX_PATH} left as-is",
              file=sys.stderr)

    print(f"[species] power scores: {updated} updated, {unchanged} unchanged",
          file=sys.stderr)


if __name__ == "__main__":
    main()
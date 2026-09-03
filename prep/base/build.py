#!/usr/bin/env python3
"""Build the shared base Champions data for PoTATo.

Produces 6 JSON files in `data/base/` plus sprite maps:

  - pokedex.json              list of all Champions-legal species
  - moves.json                all legal moves (mod overrides applied)
  - items.json                all items present in the Champions mod
  - abilities.json            all abilities present in the Champions mod
  - learnsets.json            species_id -> [move_id, ...]
  - moves-with-learnsets.json move_id -> [species_id, ...]
  - sprite-map.json           (built by scripts/build-sprite-map.py)
  - shiny-sprite-map.json     (built by scripts/build-shiny-sprite-map.py)

This is format-agnostic: per-format whitelists are applied later by
`prep/formats/build.py`.

Stages:
  1.  scrape_base   Showdown JSON/JS
  2.  scrape_mod    Champions mod .ts overrides
  3.  apply_overrides
  4.  compute_legal_species   tier != "Illegal"
  5.  compute_legal_moves     isNonstandard filter
  6.  build_learnsets         mod + baseSpecies/battleOnly/mega fallbacks
  7.  build_pokedex           emit pokedex.json
  8.  build_moves             strip flags, remap target->range, effectCategories
  9.  build_items             strip unused fields (keep sprite + category)
  10. build_abilities         no pokemon[] (derived per format later)
  11. build_moves_with_learnsets
  12. apply_game8_descriptions
  13. write_outputs
"""

import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))

from _lib.cache import Cache  # noqa: E402
from _lib.game8 import normalize_name as game8_normalize_name  # noqa: E402
from _lib.game8 import scrape_all as scrape_game8  # noqa: E402
from _lib.ts_parser import (  # noqa: E402
    apply_overrides,
    fetch_js_data,
    parse_learnsets_ts,
    parse_ts_overrides,
    species_name_to_key,
)

REPO_ROOT = os.path.dirname(os.path.dirname(HERE))
GAME8_DESCRIPTIONS_PATH = os.path.join(REPO_ROOT, "data", "game8-descriptions.json")
MANUAL_COSMETIC_FORMES_PATH = os.path.join(REPO_ROOT, "data", "manual-cosmetic-formes.json")

SOURCES = {
    "showdown_base": "https://play.pokemonshowdown.com/data",
    "showdown_mod": "https://raw.githubusercontent.com/smogon/pokemon-showdown/master/data/mods/champions",
    "showdown_text": "https://raw.githubusercontent.com/smogon/pokemon-showdown/master/data/text",
}


# ---------------------------------------------------------------------------
# 1. scrape_base
# ---------------------------------------------------------------------------
def scrape_base(cache: Cache):
    print("[1/14] scrape_base", file=sys.stderr)
    base_url = SOURCES["showdown_base"]
    return {
        "pokedex": cache.fetch_json(f"{base_url}/pokedex.json"),
        "moves_raw": cache.fetch_json(f"{base_url}/moves.json"),
        "learnsets": cache.fetch_json(f"{base_url}/learnsets.json"),
        "items_raw": fetch_js_data(cache.fetch_text(f"{base_url}/items.js")),
        "abilities_raw": fetch_js_data(cache.fetch_text(f"{base_url}/abilities.js")),
    }


# ---------------------------------------------------------------------------
# 2. scrape_mod
# ---------------------------------------------------------------------------
def scrape_mod(cache: Cache):
    print("[3/14] scrape_mod", file=sys.stderr)
    mod_url = SOURCES["showdown_mod"]
    return {
        "moves": parse_ts_overrides(cache.fetch_text(f"{mod_url}/moves.ts")),
        "items": parse_ts_overrides(cache.fetch_text(f"{mod_url}/items.ts")),
        "abilities": parse_ts_overrides(cache.fetch_text(f"{mod_url}/abilities.ts")),
        "formats_data": parse_ts_overrides(cache.fetch_text(f"{mod_url}/formats-data.ts")),
        "learnsets": parse_learnsets_ts(cache.fetch_text(f"{mod_url}/learnsets.ts")),
    }


# ---------------------------------------------------------------------------
# 3. apply_overrides
# ---------------------------------------------------------------------------
def apply_overrides_stage(base: dict, mod: dict):
    print("[4/14] apply_overrides", file=sys.stderr)
    moves = dict(base["moves_raw"])
    for mid, overrides in mod["moves"].items():
        if mid in moves:
            apply_overrides(moves[mid], overrides)
        else:
            print(f"  WARNING: move {mid} not in base data", file=sys.stderr)

    items = dict(base["items_raw"])
    for iid, overrides in mod["items"].items():
        if iid in items:
            apply_overrides(items[iid], overrides)

    return {"moves": moves, "items": items}


# ---------------------------------------------------------------------------
# 3.5. inject_cosmetic_formes — synthesize entries for cosmetic-only formes
# ---------------------------------------------------------------------------
def _cosmetic_forme_id(base_id: str, forme: str) -> str:
    """Compute the upstream-style species id for a cosmetic forme.

    Mirrors Showdown's id convention: base_id + forme-normalized
    (lowercased, spaces and dashes removed). Examples:
      ('florges', 'Blue')         -> 'florgesblue'
      ('vivillon', 'High Plains') -> 'vivillonhighplains'
      ('alcremie', 'Ruby-Cream')  -> 'alcremierubycream'
      ('furfrou', 'La Reine')     -> 'furfroulareine'
    """
    return base_id + forme.lower().replace(" ", "").replace("-", "")


def inject_cosmetic_formes(pokedex: dict) -> dict[str, list[str]]:
    """Inject synthetic entries for cosmetic-only formes into the upstream pokedex.

    Reads `data/manual-cosmetic-formes.json` (mapping of base species id →
    list of forme values to enable) and adds an entry for each forme. For
    formes already present in the upstream pokedex (e.g. Vivillon patterns,
    most Alcremie flavors), missing stat-bearing fields are backfilled
    from the base so the formes have a complete profile. For formes not
    in upstream (e.g. Florges colors, Furfrou trims, Alcremie-Salted-Cream),
    a full placeholder entry is synthesized by copying the base's
    stat-bearing fields and adding the forme-specific id / name /
    baseSpecies / forme.

    Returns a dict of {synthesized_id: source_base_id} for logging. The
    pokedex is mutated in place.
    """
    if not os.path.isfile(MANUAL_COSMETIC_FORMES_PATH):
        return {}

    with open(MANUAL_COSMETIC_FORMES_PATH, "r", encoding="utf-8") as f:
        manual = json.load(f)

    synthesized: dict[str, str] = {}
    backfilled: list[str] = []
    skipped_existing_base: list[str] = []

    # Fields that a cosmetic forme should inherit from its base when
    # missing in the upstream entry. Mirrors the synthesize branch below.
    INHERIT_FIELDS = (
        "num", "types", "baseStats", "abilities",
        "heightm", "weightkg", "gender",
    )

    for raw_key, formes in manual.items():
        if raw_key.startswith("_"):
            continue
        base_id = raw_key
        base = pokedex.get(base_id)
        if not base:
            print(f"  NOTE: cosmetic base {base_id!r} not in upstream pokedex; "
                  f"skipping {len(formes)} forme(s)", file=sys.stderr)
            skipped_existing_base.append(base_id)
            continue
        base_name = base.get("name", base_id)
        for forme in formes:
            sid = _cosmetic_forme_id(base_id, forme)
            if sid in pokedex:
                # Already in upstream (e.g. vivillon patterns, mausholdfour).
                # Backfill any stat-bearing fields the upstream left null —
                # Showdown marks cosmetic formes with `isCosmeticForme: true`
                # and omits the inherited fields, but the data-loader needs
                # them so the team builder / ability views work.
                entry = pokedex[sid]
                patched = False
                if not entry.get("isCosmeticForme"):
                    entry["isCosmeticForme"] = True
                    patched = True
                for f in INHERIT_FIELDS:
                    if entry.get(f) is None and base.get(f) is not None:
                        entry[f] = base.get(f)
                        patched = True
                if patched:
                    backfilled.append(sid)
                continue
            pokedex[sid] = {
                "isCosmeticForme": True,
                "name": f"{base_name}-{forme}",
                "baseSpecies": base_name,
                "forme": forme,
            }
            for f in INHERIT_FIELDS:
                pokedex[sid][f] = base.get(f)
            synthesized[sid] = base_id

    if synthesized or backfilled:
        print(f"  cosmetic formes: {len(synthesized)} synthesized, "
              f"{len(backfilled)} backfilled from upstream entries", file=sys.stderr)
        if synthesized:
            sample = ", ".join(f"{sid} (from {synthesized[sid]})"
                              for sid in list(synthesized)[:5])
            print(f"    synthesized: {sample}{'...' if len(synthesized) > 5 else ''}",
                  file=sys.stderr)
        if backfilled:
            sample = ", ".join(backfilled[:5])
            print(f"    backfilled:  {sample}{'...' if len(backfilled) > 5 else ''}",
                  file=sys.stderr)
    return synthesized


# ---------------------------------------------------------------------------
# 4. compute_legal_species — Champions-legal set + format-config overrides
# ---------------------------------------------------------------------------
def _format_overrides() -> set[str]:
    """Scan prep/formats/*/config.json for species_overrides lists.

    These are species that are legal in a specific format but not present in
    the Champions mod's formats-data (e.g. meowsticf). The base needs to
    include them so the format whitelist can resolve them.
    """
    out: set[str] = set()
    formats_dir = os.path.join(os.path.dirname(HERE), "formats")
    if not os.path.isdir(formats_dir):
        return out
    for fid in os.listdir(formats_dir):
        cfg_path = os.path.join(formats_dir, fid, "config.json")
        if not os.path.isfile(cfg_path):
            continue
        try:
            with open(cfg_path, "r", encoding="utf-8") as f:
                cfg = json.load(f)
        except (OSError, json.JSONDecodeError):
            continue
        for pid in cfg.get("species_overrides", []):
            if pid:
                out.add(pid)
    return out


def compute_legal_species(pokedex: dict, formats_data: dict):
    print("[5/14] compute_legal_species", file=sys.stderr)
    legal: set[str] = set()
    for pid, entry in formats_data.items():
        tier = entry.get("tier", "")
        if tier != "Illegal" and pid in pokedex:
            legal.add(pid)
    overrides = _format_overrides()
    for pid in overrides:
        if pid in pokedex and pid not in legal:
            legal.add(pid)
            print(f"  + override species: {pid}", file=sys.stderr)
    print(f"  {len(legal)} legal species", file=sys.stderr)
    return legal


# ---------------------------------------------------------------------------
# 5. compute_legal_moves
# ---------------------------------------------------------------------------
def compute_legal_moves(moves: dict):
    print("[6/14] compute_legal_moves", file=sys.stderr)
    excluded = {"Past", "Unobtainable", "CAP", "LGPE", "Gigantamax", "Future"}
    legal: set[str] = set()
    for mid, entry in moves.items():
        ns = entry.get("isNonstandard")
        if ns is None or ns == "" or ns == "Custom":
            legal.add(mid)
        elif ns in excluded:
            pass
        else:
            print(f"  NOTE: {mid} has unknown isNonstandard={ns!r}", file=sys.stderr)
    print(f"  {len(legal)} legal moves", file=sys.stderr)
    return legal


# ---------------------------------------------------------------------------
# 6. build_learnsets
# ---------------------------------------------------------------------------
def build_learnsets(legal_ids: set[str], legal_moves: set[str],
                    base_learnsets: dict, mod_learnsets: dict, pokedex: dict):
    print("[7/14] build_learnsets", file=sys.stderr)
    merged = dict(base_learnsets)
    merged.update(mod_learnsets)

    out: dict[str, list[str]] = {}
    rotom_appliances = {"rotomheat", "rotomwash", "rotomfrost", "rotomfan", "rotommow"}

    for pid in legal_ids:
        ls: dict = {}

        is_appliance = pid in rotom_appliances

        if pid in merged and not is_appliance:
            ls = merged[pid].get("learnset", {})
        else:
            entry = pokedex.get(pid, {})
            base_source = None

            bo = entry.get("battleOnly", "")
            if bo:
                if isinstance(bo, list):
                    bo = bo[0]
                base_source = species_name_to_key(bo)

            if not base_source:
                bs = entry.get("baseSpecies", "")
                if bs:
                    base_source = species_name_to_key(bs)

            if base_source and base_source in merged:
                ls = merged[base_source].get("learnset", {})

            if pid.endswith("mega"):
                direct_base = re.sub(r"megax$|megay$|mega$", "", pid)
                if direct_base in merged and base_source and direct_base.startswith(base_source):
                    ls = merged[direct_base].get("learnset", {})

            if not ls and pid.endswith("mega"):
                for suffix in ("megax", "megay", "mega"):
                    base_key = pid.replace(suffix, "")
                    if base_key in merged:
                        ls = merged[base_key].get("learnset", {})
                        break

        filtered = {m: src for m, src in ls.items() if m in legal_moves}
        out[pid] = sorted(filtered.keys()) if filtered else []

    return out


# ---------------------------------------------------------------------------
# 7. build_pokedex — full Champions-legal species with moveCount
# ---------------------------------------------------------------------------
POKEDEX_FIELDS = (
    "id", "name", "num", "types", "baseStats", "powerScores", "abilities",
    "forme", "baseSpecies", "requiredItem",
    "heightm", "weightkg", "gender",
)

# Provisional power-score placeholders, injected on every entry. Upstream
# overrides win (when/if Showdown starts emitting them); otherwise each
# entry gets a fresh zeros dict.
DEFAULT_POWER_SCORES = {
    "physicalType1": 0,
    "physicalType2": 0,
    "specialType1": 0,
    "specialType2": 0,
    "physicalDefense": 0,
    "physicalDefenseFull": 0,
    "specialDefense": 0,
    "specialDefenseFull": 0,
}


def build_pokedex(legal_ids: set[str], pokedex: dict, learnsets: dict):
    print("[8/14] build_pokedex", file=sys.stderr)
    index: list[dict] = []
    for pid in sorted(legal_ids):
        entry = pokedex.get(pid)
        if not entry:
            continue
        abilities = list(entry.get("abilities", {}).values())
        forme = entry.get("forme", "") or None
        base_species = entry.get("baseSpecies", entry.get("name", ""))
        base_species = base_species if forme else None

        obj = {f: entry.get(f) for f in POKEDEX_FIELDS}
        obj["id"] = pid
        obj["name"] = entry["name"]
        obj["abilities"] = abilities
        obj["forme"] = forme
        obj["baseSpecies"] = base_species
        obj["moveCount"] = len(learnsets.get(pid, []))
        obj["powerScores"] = entry.get("powerScores") or DEFAULT_POWER_SCORES.copy()
        index.append(obj)
    return index


# ---------------------------------------------------------------------------
# 8. build_moves — strip flags, remap target→range, effectCategories
# ---------------------------------------------------------------------------
STRIP_FLAGS = {
    "snatch", "metronome", "bypasssub", "mirror", "allyanim",
    "cantusetwice", "distance", "failmefirst", "failmimic", "nonsky", "nosketch",
    "protect",
    "defrost", "failcopycat", "failencore", "failinstruct", "futuremove",
    "gravity", "minimize", "mustpressure", "noassist", "noparentalbond",
    "nosleeptalk", "recharge", "reflectable", "charge",
}
RANGE_MAP = {
    "normal": "singleTarget",
    "adjacentAlly": "singleAlly",
    "adjacentAllyOrSelf": "singleAlly",
    "allAdjacent": "allPokemon",
    "allAdjacentFoes": "allOpponents",
    "all": "entireField",
    "allySide": "usersSide",
    "foeSide": "opponentsSide",
    "any": "singleTarget",
    "randomNormal": "randomOpponent",
    "scripted": "varies",
    "allies": "allAllies",
    "allyTeam": "allAllies",
    "self": "self",
}
MANUAL_CATEGORIES = {
    "alluringvoice": ["confuse"],
    "burningjealousy": ["inflicts_status"],
    "direclaw": ["inflicts_status"],
    "triattack": ["inflicts_status"],
}


def _move_effect_categories(entry: dict, mid: str) -> list[str]:
    cats: list[str] = []
    sec = entry.get("secondary")
    if not isinstance(sec, dict):
        sec = {}
    boost = entry.get("boosts")
    sec_is_empty = isinstance(entry.get("secondary"), dict) and entry["secondary"] == {}

    st = entry.get("status")
    if st:
        cats.append("inflicts_status")
    if sec and "status" in sec:
        cats.append("inflicts_status")

    if sec and sec.get("volatileStatus") == "flinch":
        cats.append("flinch")
    if entry.get("volatileStatus") == "flinch":
        cats.append("flinch")

    if sec and sec.get("volatileStatus") == "confusion":
        cats.append("confuse")
    if entry.get("volatileStatus") == "confusion":
        cats.append("confuse")

    vs = entry.get("volatileStatus", "")
    if vs == "partiallytrapped":
        cats.append("trap")
    if vs == "trap" or (vs and "trap" in vs.lower()):
        cats.append("trap")
    sd = entry.get("shortDesc", "")
    if "prevent" in sd.lower() and "switch" in sd.lower():
        cats.append("trap")

    periodic = {"partiallytrapped", "leechseed", "saltcure", "syrupbomb", "aquaring"}
    if vs and vs in periodic:
        cats.append("periodic_effect")
    if sec and sec.get("volatileStatus", "") in periodic:
        cats.append("periodic_effect")

    if sec and "boosts" in sec and "self" not in sec:
        if any(v < 0 for v in sec["boosts"].values()):
            cats.append("stat_drop_target")
    if sec and "boosts" in sec and isinstance(sec.get("self"), dict) and "boosts" in sec["self"]:
        if any(v < 0 for v in sec["boosts"].values()):
            cats.append("stat_drop_target")
    if isinstance(boost, dict) and any(v < 0 for v in boost.values()):
        tgt = entry.get("target", "")
        if tgt not in ("self", "allySide", "adjacentAlly", "allies"):
            cats.append("stat_drop_target")
    if "selfSwitch" in entry and "lower" in sd.lower() and "target" in sd.lower():
        cats.append("stat_drop_target")
    if sec and sec.get("volatileStatus") == "syrupbomb":
        cats.append("stat_drop_target")

    if isinstance(boost, dict) and all(v > 0 for v in boost.values()):
        tgt = entry.get("target", "")
        if tgt not in ("self", ""):
            cats.append("stat_increase_target")

    s = entry.get("self")
    if isinstance(s, dict) and "boosts" in s:
        if any(v < 0 for v in s["boosts"].values()):
            cats.append("stat_drop_attacker")
    sb = entry.get("selfBoost")
    if isinstance(sb, dict) and "boosts" in sb:
        if any(v < 0 for v in sb["boosts"].values()):
            cats.append("stat_drop_attacker")

    if sec and isinstance(sec.get("self"), dict) and "boosts" in sec["self"]:
        if any(v > 0 for v in sec["self"]["boosts"].values()):
            cats.append("stat_increase_attacker")

    if isinstance(boost, dict):
        tgt = entry.get("target", "")
        if tgt == "self" and any(v > 0 for v in boost.values()):
            cats.append("self_buff")
        if tgt == "self" and any(v < 0 for v in boost.values()):
            cats.append("stat_drop_attacker")

    if "selfSwitch" in entry:
        cats.append("self_switch")
    if "forceSwitch" in entry:
        cats.append("force_switch")
    if entry.get("priority", 0) != 0:
        cats.append("priority")
    if "multihit" in entry:
        cats.append("multi_hit")
    if "recoil" in entry:
        cats.append("recoil")
    if "hasCrashDamage" in entry:
        cats.append("crash_damage")
    if "critRatio" in entry:
        cats.append("high_crit")
    if "ohko" in entry:
        cats.append("ohko")

    sc = entry.get("sideCondition", "")
    if sc in ("spikes", "stealthrock", "toxicspikes", "stickyweb"):
        cats.append("hazard_set")
    if sec_is_empty and "spik" in sd.lower():
        cats.append("hazard_set")
    if sec_is_empty and "hazard" in sd.lower():
        cats.append("hazard_set")

    name_lower = entry.get("name", "").lower()
    if name_lower in ("rapid spin", "defog", "mortal spin", "tidy up"):
        cats.append("hazard_remove")

    if "weather" in entry:
        cats.append("weather")
    if "terrain" in entry:
        cats.append("terrain")
    if sc in ("reflect", "lightscreen", "auroraveil"):
        cats.append("screen")
    if "pseudoWeather" in entry:
        cats.append("room")
    if "stallingMove" in entry:
        cats.append("protect")
    elif entry.get("volatileStatus") in ("protect", "kingsshield", "banefulbunker", "spikyshield"):
        cats.append("protect")
    if "breaksProtect" in entry:
        cats.append("protect_break")
    if "selfdestruct" in entry:
        cats.append("self_destruct")
    if "thawsTarget" in entry:
        cats.append("thaw")

    desc = entry.get("desc", "")
    if "screen" in desc.lower() and ("end" in desc.lower() or "break" in desc.lower() or "destroy" in desc.lower()):
        if "aurora" not in name_lower:
            cats.append("screen_break")

    if any(k in entry for k in ("overrideOffensiveStat", "overrideDefensiveStat",
                                "overrideOffensivePokemon", "damage")):
        cats.append("special_damage")
    if entry.get("priority") == -5 and entry.get("basePower") == 0 and entry.get("target") == "scripted":
        cats.append("special_damage")

    if "heavier" in sd.lower():
        cats.append("weight_based")

    secs = entry.get("secondaries")
    if isinstance(secs, list):
        for s in secs:
            if not isinstance(s, dict):
                continue
            if "status" in s:
                cats.append("inflicts_status")
            if s.get("volatileStatus") == "flinch":
                cats.append("flinch")
            if s.get("volatileStatus") == "confusion":
                cats.append("confuse")
            if "boosts" in s:
                if any(v < 0 for v in s["boosts"].values()):
                    cats.append("stat_drop_target")

    cats.extend(MANUAL_CATEGORIES.get(mid, []))
    return sorted(set(cats))


def build_moves(legal_moves: set[str], moves: dict):
    print("[9/14] build_moves", file=sys.stderr)
    out: dict[str, dict] = {}
    for mid in sorted(legal_moves):
        if mid in moves:
            out[mid] = dict(moves[mid])

    for mid, entry in out.items():
        raw_flags = entry.pop("flags", None)
        if isinstance(raw_flags, dict):
            entry["flags"] = sorted(k for k in raw_flags if k not in STRIP_FLAGS)
        else:
            entry["flags"] = []
        entry.pop("contestType", None)
        entry["effectCategories"] = _move_effect_categories(entry, mid)
        entry.pop("desc", None)
        if "target" in entry:
            entry["range"] = RANGE_MAP.get(entry.pop("target"), "singleTarget")
    return out


# ---------------------------------------------------------------------------
# 9. build_items — keep sprite + category
# ---------------------------------------------------------------------------
ITEM_DROP_KEYS = [
    "spritenum", "onBasePowerPriority", "num", "gen", "shortDesc", "naturalGift",
    "onAfterMoveSecondarySelfPriority", "onAfterSetStatusPriority", "onAnySwitchInPriority",
    "onDamagePriority", "onFractionalPriorityPriority", "onModifyAccuracyPriority",
    "onModifyAtkPriority", "onModifyMovePriority", "onModifySpAPriority",
    "onResidualOrder", "onResidualSubOrder",
]


def build_items(items: dict):
    print("[10/14] build_items", file=sys.stderr)
    out: dict[str, dict] = {}
    for iid, entry in items.items():
        out[iid] = dict(entry)
        # Sprite id is the item id itself; widget appends .png
        out[iid].setdefault("sprite", iid)
        for k in ITEM_DROP_KEYS:
            out[iid].pop(k, None)
    return out


# ---------------------------------------------------------------------------
# 10. build_abilities — no pokemon[]; per-format view derives it
# ---------------------------------------------------------------------------
ABILITY_CATEGORY_MAP = {
    "weather": [
        "drizzle", "drought", "sandstream", "snowwarning", "sandspit",
        "cloudnine", "forecast", "megasol", "chlorophyll", "swiftswim",
        "sandrush", "slushrush", "sandveil", "snowcloak", "sandforce",
        "solarpower", "raindish", "icebody", "hydration", "dryskin",
    ],
    "terrain": ["surgesurfer", "mimicry"],
    "stats": [
        "competitive", "defiant", "eelevate", "intimidate", "gooey", "supersweetsyrup",
        "speedboost", "moxie", "stamina", "steadfast", "justified",
        "angerpoint", "berserk", "weakarmor", "electromorphosis",
        "guts", "quickfeet", "marvelscale", "hustle",
        "contrary", "moody", "tangledfeet",
        "clearbody", "whitesmoke", "hypercutter", "bigpecks", "keeneye",
        "unaware", "opportunist", "mirrorarmor",
        "curiousmedicine", "noguard",
        "sandveil", "snowcloak", "sandforce", "chlorophyll", "swiftswim",
        "sandrush", "slushrush", "surgesurfer",
        "unburden", "illuminate", "lightmetal", "heavymetal",
    ],
    "power": [
        "adaptability", "aerilate", "analytic", "blaze", "dragonize",
        "fairyaura", "firemane", "hugepower", "ironfist", "megalauncher", "merciless",
        "minus", "overgrow", "parentalbond", "pixilate", "plus",
        "purepower", "reckless", "refrigerate", "rivalry",
        "sandforce", "sharpness", "sheerforce", "skilllink", "sniper",
        "solarpower", "strongjaw", "superluck", "supremeoverlord",
        "swarm", "technician", "torrent", "toughclaws",
        "rockhead", "compoundeyes", "hustle",
    ],
    "move_type": ["aerilate", "pixilate", "refrigerate", "dragonize", "liquidvoice"],
    "damage_reduction": [
        "filter", "friendguard", "multiscale", "shellarmor", "solidrock",
        "sturdy", "thickfat", "waterbubble", "disguise", "magicguard",
        "furcoat", "heatproof", "purifyingsalt",
    ],
    "immunity": [
        "aromaveil", "bulletproof", "corrosion", "damp", "dryskin",
        "eartheater", "eelevate", "flashfire", "flowerveil", "immunity", "insomnia",
        "leafguard", "levitate", "lightningrod", "limber", "magmaarmor",
        "motordrive", "oblivious", "overcoat", "owntempo",
        "sapsipper", "soundproof", "sweetveil", "telepathy",
        "vitalspirit", "voltabsorb", "waterabsorb", "waterbubble",
        "shielddust", "magicguard", "purifyingsalt",
    ],
    "status": [
        "cutecharm", "earlybird", "flamebody", "healer", "hydration",
        "immunity", "insomnia", "leafguard", "limber", "magmaarmor",
        "oblivious", "owntempo", "poisonpoint", "spicyspray", "static",
        "stench", "shedskin", "synchronize", "sweetveil", "vitalspirit",
        "marvelscale", "quickfeet", "guts", "poisonheal", "naturalcure",
        "tangledfeet", "steadfast", "solarpower", "poisontouch",
    ],
    "contact": [
        "aftermath", "cursedbody", "cutecharm", "flamebody", "gooey",
        "mummy", "pickpocket", "poisonpoint", "roughskin",
        "spicyspray", "static", "stench", "wanderingspirit",
        "poisontouch", "magician",
    ],
    "on_hit": [
        "aftermath", "cursedbody", "electromorphosis", "innardsout",
        "justified", "roughskin", "sandspit", "spicyspray", "stamina",
        "toxicdebris", "weakarmor",
    ],
    "priority": [
        "armortail", "galewings", "prankster", "queenlymajesty",
        "quickdraw", "stall", "innerfocus",
    ],
    "bypass": [
        "corrosion", "infiltrator", "longreach", "moldbreaker",
        "noguard", "piercingdrill", "scrappy", "shadowtag",
        "stalwart", "unaware", "unseenfist",
    ],
    "item": [
        "klutz", "magician", "pickpocket", "pickup", "stickyhold",
        "symbiosis", "unburden", "unnerve",
        "cheekpouch", "cudchew", "gluttony", "harvest", "ripen",
    ],
    "berries": ["cheekpouch", "cudchew", "gluttony", "harvest", "ripen", "unnerve"],
    "form_change": [
        "forecast", "hungerswitch", "illusion", "mimicry",
        "protean", "stancechange", "zerotohero",
    ],
    "ability_control": [
        "imposter", "magicbounce", "mirrorarmor", "mummy",
        "receiver", "synchronize", "trace", "wanderingspirit",
        "opportunist",
    ],
    "healing": [
        "cheekpouch", "healer", "hospitality", "icebody",
        "naturalcure", "poisonheal", "raindish", "regenerator",
    ],
    "field_control": ["screencleaner", "shadowtag", "toxicdebris"],
    "switch_in_out": [
        "anticipation", "competitive", "curiousmedicine", "defiant",
        "frisk", "hospitality", "imposter", "intimidate",
        "naturalcure", "opportunist", "pressure", "receiver",
        "regenerator", "screencleaner", "supersweetsyrup",
        "trace", "unnerve", "zerotohero",
        "drizzle", "drought", "sandstream", "snowwarning",
    ],
}


def _ability_categories(aid: str) -> list[str]:
    return sorted({cat for cat, ids in ABILITY_CATEGORY_MAP.items() if aid in ids})


def build_abilities(abilities_raw: dict):
    print("[11/14] build_abilities", file=sys.stderr)
    out: dict[str, dict] = {}
    for aid, entry in abilities_raw.items():
        if not isinstance(entry, dict):
            continue
        name = entry.get("name", "")
        if not name:
            continue
        out[aid] = {
            "name": name,
            "desc": entry.get("desc", ""),
            "effectCategories": _ability_categories(aid),
        }
    return out


# ---------------------------------------------------------------------------
# 11. build_moves_with_learnsets
# ---------------------------------------------------------------------------
def build_moves_with_learnsets(moves_out: dict, learnsets: dict):
    print("[12/14] build_moves_with_learnsets", file=sys.stderr)
    move_to_species: dict[str, list[str]] = {}
    for species_id, move_ids in learnsets.items():
        for move_id in move_ids:
            move_to_species.setdefault(move_id, []).append(species_id)
    for lst in move_to_species.values():
        lst.sort()

    out: dict[str, list[str]] = {}
    for mid in sorted(moves_out):
        species_list = move_to_species.get(mid, [])
        if species_list:
            out[mid] = species_list
    return out


# ---------------------------------------------------------------------------
# 12. apply_game8_descriptions
# ---------------------------------------------------------------------------
def apply_game8_descriptions(moves_out: dict, items_out: dict, abilities_out: dict):
    """Overlay Game8 in-game descriptions on top of base data.

    Drops `desc` for entities not in Game8 (frontend renders "—" when absent).
    Preserves bare em-dash (U+2014) as a valid empty description.
    """
    print("[13/14] apply_game8_descriptions", file=sys.stderr)
    game8 = scrape_game8(force=False, output_path=GAME8_DESCRIPTIONS_PATH)
    g8_moves = game8.get("moves", {})
    g8_items = game8.get("items", {})
    g8_abilities = game8.get("abilities", {})

    g8_moves_idx = {game8_normalize_name(k): v for k, v in g8_moves.items()}
    g8_items_idx = {game8_normalize_name(k): v for k, v in g8_items.items()}
    g8_abilities_idx = {game8_normalize_name(k): v for k, v in g8_abilities.items()}

    def overlay(out: dict, name_field: str, g8_idx: dict, label: str) -> tuple[int, int]:
        hit = miss = 0
        for entry in out.values():
            if not isinstance(entry, dict):
                continue
            name = entry.get(name_field, "")
            if not name:
                continue
            key = game8_normalize_name(name)
            g8 = g8_idx.get(key)
            if g8 is None:
                if "desc" in entry:
                    entry.pop("desc", None)
                miss += 1
            else:
                entry["desc"] = g8
                hit += 1
        return hit, miss

    for mid, entry in moves_out.items():
        if not isinstance(entry, dict):
            continue
        g8 = g8_moves_idx.get(mid)
        if g8 is None:
            entry.pop("desc", None)
        else:
            entry["desc"] = g8
        entry.pop("shortDesc", None)

    ab_hit, ab_miss = overlay(abilities_out, "name", g8_abilities_idx, "abilities")
    it_hit, it_miss = overlay(items_out, "name", g8_items_idx, "items")

    mv_hit = sum(1 for e in moves_out.values() if isinstance(e, dict) and "desc" in e)
    mv_miss = sum(1 for e in moves_out.values() if isinstance(e, dict) and "desc" not in e)
    print(f"  moves: {mv_hit} with desc, {mv_miss} missing", file=sys.stderr)
    print(f"  abilities: {ab_hit} with desc, {ab_miss} missing", file=sys.stderr)
    print(f"  items: {it_hit} with desc, {it_miss} missing", file=sys.stderr)


# ---------------------------------------------------------------------------
# 13. write_outputs
# ---------------------------------------------------------------------------
def write_outputs(out_dir: str, pokedex, moves_out, learnsets_out, items_out,
                  abilities_out, moves_with_learnsets_out):
    print("[14/14] write_outputs", file=sys.stderr)
    os.makedirs(out_dir, exist_ok=True)

    def write(name, data, indent=1):
        path = os.path.join(out_dir, name)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=indent, ensure_ascii=False)
        size_kb = os.path.getsize(path) / 1024
        count = len(data) if hasattr(data, "__len__") else "?"
        print(f"  {name}: {size_kb:.1f} KiB ({count} entries)", file=sys.stderr)

    write("pokedex.json", pokedex)
    write("moves.json", moves_out)
    write("moves-with-learnsets.json", moves_with_learnsets_out)
    write("learnsets.json", learnsets_out)
    write("items.json", items_out)
    write("abilities.json", abilities_out)


def main():
    cache = Cache()

    base = scrape_base(cache)
    print("[2/14] inject_cosmetic_formes", file=sys.stderr)
    inject_cosmetic_formes(base["pokedex"])
    mod = scrape_mod(cache)
    merged = apply_overrides_stage(base, mod)
    legal_species = compute_legal_species(base["pokedex"], mod["formats_data"])
    legal_moves = compute_legal_moves(merged["moves"])
    learnsets_out = build_learnsets(legal_species, legal_moves,
                                    base["learnsets"], mod["learnsets"], base["pokedex"])
    pokedex = build_pokedex(legal_species, base["pokedex"], learnsets_out)
    moves_out = build_moves(legal_moves, merged["moves"])
    items_out = build_items(merged["items"])
    abilities_out = build_abilities(base["abilities_raw"])
    apply_game8_descriptions(moves_out, items_out, abilities_out)
    moves_with_learnsets_out = build_moves_with_learnsets(moves_out, learnsets_out)

    out_dir = os.path.join(REPO_ROOT, "data", "base")
    write_outputs(out_dir, pokedex, moves_out, learnsets_out, items_out,
                  abilities_out, moves_with_learnsets_out)
    print(f"\nDone! Generated {len(pokedex)} species, {len(moves_out)} moves, "
          f"{len(items_out)} items, {len(abilities_out)} abilities.", file=sys.stderr)


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Build per-language display data for PoTATo.

Produces `data/i18n/<lang>/{pokemon,moves,items,abilities}.json` for each
language declared in `config.json`.

Sources:
  - Pokémon names: PokeAPI (translated, for 8 of 11 langs) or fall back to
    English from the format data.
  - Move/ability/item names: from the format data (English; no
    translations available for these entities).
  - Descriptions for moves/abilities/items: data/game8-descriptions.json
    (committed, scraped from game8.co's Pokémon Champions pages). Game8
    text is the authoritative in-game description; PS text files are no
    longer consulted.

Each i18n file only includes entities that appear in at least one format
listed in `config.formats` (currently just m-b), so we don't ship
translations for irrelevant Pokémon.
"""

import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))

from _lib.cache import Cache  # noqa: E402

REPO_ROOT = os.path.dirname(os.path.dirname(HERE))
GAME8_DESCRIPTIONS_PATH = os.path.join(REPO_ROOT, "data", "game8-descriptions.json")


def load_config():
    with open(os.path.join(HERE, "config.json"), "r", encoding="utf-8") as f:
        return json.load(f)


def load_base_data() -> dict:
    """Load the shared base data. Returns dict with 'pokedex', 'moves', 'items', 'abilities'."""
    base = os.path.join(REPO_ROOT, "data", "base")
    out = {}
    for name, fname in [
        ("pokedex", "pokedex.json"),
        ("moves", "moves.json"),
        ("items", "items.json"),
        ("abilities", "abilities.json"),
    ]:
        path = os.path.join(base, fname)
        if os.path.isfile(path):
            with open(path, "r", encoding="utf-8") as f:
                out[name] = json.load(f)
        else:
            out[name] = [] if name == "pokedex" else {}
    return out


def load_format_whitelist(format_id: str) -> dict:
    """Load a format whitelist file. Returns {id, label, version, species[], items[], abilities[]}."""
    path = os.path.join(REPO_ROOT, "data", "formats", f"{format_id}.json")
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def collect_entity_ids(format_ids: list[str], whitelists: dict[str, dict]) -> dict[str, set[str]]:
    """Union of entity ids across all formats in scope.

    `whitelists` is keyed by format id; each value is the whitelist dict.
    """
    pokemon: set[str] = set()
    items: set[str] = set()
    abilities: set[str] = set()
    for fid in format_ids:
        wl = whitelists.get(fid, {})
        pokemon.update(wl.get("species", []))
        items.update(wl.get("items", []))
        abilities.update(wl.get("abilities", []))
    # Moves: all base moves are in scope (we ship Game8 descs for all of them)
    return {
        "pokemon": pokemon,
        "items": items,
        "abilities": abilities,
    }


def load_game8_descriptions() -> dict:
    """Load the committed Game8 descriptions JSON. Returns
    {moves: {name: desc}, items: {...}, abilities: {...}}."""
    if not os.path.isfile(GAME8_DESCRIPTIONS_PATH):
        print(f"  WARNING: {GAME8_DESCRIPTIONS_PATH} not found, running without descs",
              file=sys.stderr)
        return {"moves": {}, "items": {}, "abilities": {}}
    with open(GAME8_DESCRIPTIONS_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def fetch_pokeapi_name(cache: Cache, species_id: int, locales: list[str]) -> str | None:
    """Fetch a Pokémon species' translated name from PokeAPI.

    `locales` is the prioritized list of PokeAPI locale codes to try
    (e.g. ['ja-Hrkt', 'ja'] for Japanese). Returns the first matching
    name, or None.

    Note: PokeAPI uses lowercase locale codes (ja-hrkt, zh-hant, etc);
    we lowercase ours before matching.
    """
    if not locales:
        return None
    locales_lower = {loc.lower() for loc in locales}
    url = f"https://pokeapi.co/api/v2/pokemon-species/{species_id}"
    try:
        data = cache.fetch_json(url)
    except Exception:
        return None
    for entry in data.get("names", []):
        lang_name = entry.get("language", {}).get("name", "").lower()
        if lang_name in locales_lower:
            return entry.get("name")
    return None


def fetch_all_pokeapi_names(cache: Cache, num_to_ids: dict[int, list[str]],
                            locale_map: dict[str, list[str]]) -> dict[str, dict[str, str]]:
    """For each (lang, locale) pair, fetch translated names keyed by species num,
    then expand to all M-B IDs sharing that num.

    Returns: {lang: {mon_id: translated_name}}.
    """
    out: dict[str, dict[str, str]] = {}
    for lang, locales in locale_map.items():
        if not locales:
            out[lang] = {}
            continue
        out[lang] = {}
        for num in num_to_ids:
            translated = fetch_pokeapi_name(cache, num, locales)
            if translated:
                for mid in num_to_ids[num]:
                    out[lang][mid] = translated
        print(f"  {lang}: {len(out[lang])} translated Pokémon names", file=sys.stderr)
    return out


def build_lang_files(lang: str, ids: dict[str, set[str]],
                     game8: dict, pokeapi_translations: dict[str, dict[str, str]],
                     base: dict, format_ids: list[str],
                     whitelists: dict[str, dict],
                     pokedex: list[dict]) -> dict[str, dict]:
    """Build the 4 entity-type dicts for a single language.

    `game8` is the loaded game8-descriptions.json. `pokeapi_translations[lang]`
    is a {mon_id: name} dict (may be empty). `base` is the shared base data
    (used for English names of moves/items/abilities).
    """
    out = {"pokemon": {}, "moves": {}, "items": {}, "abilities": {}}

    # Pokémon: translated name (or English), no desc (PokeAPI doesn't expose
    # species descriptions for Champions). Strip the forme suffix from the
    # English fallback so the name is the base species name (e.g. "Gengar"
    # not "Gengar-Mega"), matching the search detail view's display.
    for mon in pokedex:
        mid = mon["id"]
        if mid not in ids["pokemon"]:
            continue
        en_name = mon.get("baseSpecies") or mon.get("name", mid)
        translated = pokeapi_translations.get(lang, {}).get(mid, en_name)
        out["pokemon"][mid] = {"name": translated}

    en_moves: dict[str, dict] = base.get("moves", {})
    en_items: dict[str, dict] = base.get("items", {})
    en_abilities: dict[str, dict] = base.get("abilities", {})

    # Moves/Items/Abilities: English name from base data, desc from Game8
    g8_moves = game8.get("moves", {})
    g8_items = game8.get("items", {})
    g8_abilities = game8.get("abilities", {})

    # Game8 uses inconsistent capitalization ("Good As Gold" vs Showdown's
    # "Good as Gold"). Build a case-insensitive index for lookups.
    g8_moves_ci = {k.lower(): v for k, v in g8_moves.items()}
    g8_items_ci = {k.lower(): v for k, v in g8_items.items()}
    g8_abilities_ci = {k.lower(): v for k, v in g8_abilities.items()}

    legal_moves: set[str] = set()
    for fid in format_ids:
        # moves are shared across both formats currently; if a future format
        # restricts moves, add a `moves` field to the whitelist.
        legal_moves.update(en_moves.keys())
    for mid in sorted(ids.get("moves", legal_moves)):
        en = en_moves.get(mid, {})
        entry = {"name": en.get("name", mid)}
        g8_desc = g8_moves_ci.get(en.get("name", "").lower())
        if g8_desc is not None:
            entry["desc"] = g8_desc
        out["moves"][mid] = entry

    for iid in sorted(ids["items"]):
        en = en_items.get(iid, {})
        entry = {"name": en.get("name", iid)}
        g8_desc = g8_items_ci.get(en.get("name", "").lower())
        if g8_desc is not None:
            entry["desc"] = g8_desc
        out["items"][iid] = entry

    for aid in sorted(ids["abilities"]):
        en = en_abilities.get(aid, {})
        entry = {"name": en.get("name", aid)}
        g8_desc = g8_abilities_ci.get(en.get("name", "").lower())
        if g8_desc is not None:
            entry["desc"] = g8_desc
        out["abilities"][aid] = entry

    return out


def main():
    config = load_config()
    cache = Cache()
    languages = config["languages"]
    default = config["default"]
    locale_map = config.get("pokeapi_locale_map", {})

    print(f"[i18n] Loading whitelists for: {config['formats']}", file=sys.stderr)
    whitelists = {fid: load_format_whitelist(fid) for fid in config["formats"]}
    ids = collect_entity_ids(config["formats"], whitelists)
    print(f"[i18n] Entity scope: {len(ids['pokemon'])} pokemon, "
          f"{len(ids['items'])} items, {len(ids['abilities'])} abilities", file=sys.stderr)

    print("[i18n] Loading base data", file=sys.stderr)
    base = load_base_data()
    pokedex = base.get("pokedex", [])
    # Restrict the pokedex to species that appear in at least one format
    ids_pokedex = [m for m in pokedex if m["id"] in ids["pokemon"]]

    print("[i18n] Loading Game8 descriptions", file=sys.stderr)
    game8 = load_game8_descriptions()
    g8_counts = {k: len(v) for k, v in game8.items()}
    print(f"  Game8: {g8_counts}", file=sys.stderr)

    print("[i18n] Fetching PokeAPI translations", file=sys.stderr)
    # Build num → [mon_ids] map for in-scope species (many share nums)
    num_to_ids: dict[int, list[str]] = {}
    for mon in ids_pokedex:
        n = mon.get("num")
        if n is not None:
            num_to_ids.setdefault(n, []).append(mon["id"])
    pokeapi_translations = fetch_all_pokeapi_names(cache, num_to_ids, locale_map)

    out_root = os.path.join(REPO_ROOT, "data", "i18n")
    os.makedirs(out_root, exist_ok=True)

    for lang in languages:
        lang_dir = os.path.join(out_root, lang)
        os.makedirs(lang_dir, exist_ok=True)
        files = build_lang_files(lang, ids, game8, pokeapi_translations, base,
                                 config["formats"], whitelists, ids_pokedex)
        for entity, data in files.items():
            path = os.path.join(lang_dir, f"{entity}.json")
            with open(path, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=1, ensure_ascii=False)
            size_kb = os.path.getsize(path) / 1024
            print(f"  {lang}/{entity}.json: {size_kb:.1f} KiB ({len(data)} entries)", file=sys.stderr)

    print(f"\nDone! Built i18n for {len(languages)} languages.", file=sys.stderr)


if __name__ == "__main__":
    main()

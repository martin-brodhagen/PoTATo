# PoTATo Data Pipeline

The pipeline has two layers: a **shared base** that contains the full
Champions-dex data, and **per-format whitelists** that name which subset of
the base is legal in each regulation.

## Principles

- **Data lives in one place** (`data/base/`). The Showdown + Champions mod
  data, the learned-by tables, the sprite maps — all are pulled once and
  shared across every format.
- **Formats are whitelists** (`data/formats/<id>.json`). Each format
  declares which species, items, and abilities are legal; nothing else.
  Adding a new format is a config edit, not a code change.
- **The frontend derives per-format views** at load time by filtering the
  base against the whitelist. Format switches are O(1) once the base is
  loaded.
- **i18n is a separate build** that consumes both the base and the format
  whitelists to produce per-language display bundles in `data/i18n/<lang>/`.

## Layout

```
prep/
  PIPELINE.md                  ← this file
  build_mb.py                  ← orchestrator: base + formats + i18n
  base/
    build.py                   ← 13 stages: scrape → merge → legalise → emit
  formats/
    build.py                   ← applies each format's whitelist to the base
    m-a/
      config.json              ← whitelists + label + version
    m-b/
      config.json
  i18n/
    config.json                ← which languages, which formats
    build.py
  _lib/
    cache.py                   ← disk-backed HTTP cache
    ts_parser.py               ← TS/JS parser for the Champions mod
    game8.py                   ← scraper for game8.co descriptions
data/
  base/                        ← shared, format-agnostic
    pokedex.json               all Champions-legal species
    moves.json                 all legal moves
    items.json                 all items (incl. sprite + category)
    abilities.json             all abilities (no per-format pokemon[])
    learnsets.json             species_id → [move_id, ...]
    moves-with-learnsets.json  move_id → [species_id, ...]
    sprite-map.json
    shiny-sprite-map.json
  formats/                     ← whitelists only
    m-a.json                   { id, label, version, species[], items[], abilities[] }
    m-b.json
  i18n/<lang>/                 ← per-language display text
  game8-descriptions.json      ← scraped Game8 in-game descriptions
```

## Build stages

### Base (`prep/base/build.py`, 13 stages)

| # | Stage | Purpose |
|---|---|---|
| 1 | `scrape_base` | Fetch Showdown `pokedex.json`, `moves.json`, `learnsets.json`, `items.js`, `abilities.js` |
| 2 | `scrape_mod` | Fetch Champions mod `.ts` overrides |
| 3 | `apply_overrides` | Merge mod overrides onto base moves + items |
| 4 | `compute_legal_species` | `tier != "Illegal"` from `formats-data.ts` + format-config `species_overrides` |
| 5 | `compute_legal_moves` | `isNonstandard` filter (allow `None`/`""`/`"Custom"`, exclude `Past`/`Unobtainable`/`CAP`/`LGPE`/`Gigantamax`/`"Future"`) |
| 6 | `build_learnsets` | Mod merge + `baseSpecies`/`battleOnly`/mega fallbacks, filtered to legal moves × legal species |
| 7 | `build_pokedex` | Emit `pokedex.json` (14 fields including `color`) |
| 8 | `build_moves` | Strip non-Champions flags, remap `target`→`range`, assign `effectCategories` |
| 9 | `build_items` | Strip unused fields, keep `sprite` and `category` |
| 10 | `build_abilities` | Build `effectCategories`; no `pokemon[]` (derived per format) |
| 11 | `build_moves_with_learnsets` | Invert learnset map |
| 12 | `apply_game8_descriptions` | Overlay Game8 in-game descriptions on moves/items/abilities |
| 13 | `write_outputs` | Write 6 JSON files to `data/base/` |

### Format (`prep/formats/build.py`)

For each format id, the build script:

1. Reads `data/base/*`.
2. Reads `prep/formats/<id>/config.json` (whitelists + label/version).
3. Filters `pokedex` by the species whitelist.
4. Filters `items` by the items whitelist.
5. Derives `abilities` from each format species' `abilities` field
   (intersected with the base abilities); supports `unique_abilities`
   overrides for ids not in the showdown base (e.g. eelevate, firemane).
6. Writes `data/formats/<id>.json` — just the whitelist, label, version.

## Frontend integration

`lib/data-loader.js` loads the base once and caches it. On format switch it
fetches the small format whitelist and derives a per-format view in memory.
The view has the same shape widgets already consume:

- `index[]` — species with all their fields
- `items{}` — item dict (incl. `sprite`, `category`)
- `abilities{}` — ability dict + per-format `pokemon[]` (derived)
- `moves{}` — move dict with `range`, `effectCategories`
- `learnsets{}` — species → moves
- `movesWithLearnsets{}` — move → species (derived)
- `spriteMap{}`, `shinySpriteMap{}` — filtered to format species

`lib/i18n.js` walks the cache and overlays localized `name` / `desc` fields
in place, exactly as before. **No widget code changes are required.**

## Adding a new format

1. `cp -r prep/formats/m-b prep/formats/m-c`
2. Edit `prep/formats/m-c/config.json`:
   - `id`, `label`, `version`
   - `species_non_mega`, `m_b_new_species`, `species_mega`, `m_b_new_mega` (or your own split)
   - `items`, `m_b_new_items`
   - Optional: `unique_abilities` for ids not in the showdown base
   - Optional: `species_overrides` for ids not in the Champions mod
3. Add the format to `prep/i18n/config.json` under `formats`.
4. Run `npm run prep` (or `python3 prep/formats/build.py m-c` for just the format).

## Adding a new language

1. Add the language code to `prep/i18n/config.json` under `languages`.
2. Add a PokeAPI locale mapping in `pokeapi_locale_map` if available
   (e.g. `["ja-Hrkt"]` for Japanese). Empty list = fall back to English.
3. Run `npm run prep:mb:i18n`.
4. The bundle will be created at `data/i18n/<lang>/{pokemon,moves,items,abilities}.json`.
5. Add a `LOCALE_FALLBACK` entry in `lib/i18n.js` if the browser locale differs
   from the bundle code (e.g. `zh-CN` → `zh-Hans`).
6. Update `SUPPORTED` in `lib/i18n.js` if the bundle code is new.

## Verifying the build

```bash
# Unit tests
npm test

# Full rebuild (network required on first run)
npm run prep

# Build just the base
npm run prep:base

# Build a single format whitelist
npm run prep:format -- m-c
```

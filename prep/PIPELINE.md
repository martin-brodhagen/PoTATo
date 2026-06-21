# PoTATo Format Data Pipeline

This document describes the canonical stage order every format's `build.py`
follows, plus the procedure for adding a new format.

## Principles

- **One folder per format**, one `build.py` per format. Each format is fully
  self-contained and can be regenerated in isolation.
- **Stages run in a fixed order**. The order is the contract; the
  implementation is per-format.
- **Duplication is fine**. Per-format data (whitelists, effect-category
  tables, item-category rules) is intentionally not shared, so a new format
  can be cloned and edited without coupling to siblings.
- **Only the TS/JS parser is shared** (`prep/_lib/ts_parser.py`), because it
  is large enough that divergence would be painful to maintain.

## Canonical stage order

Every `prep/format-<id>/build.py` runs the following stages in order. Each
stage is a top-level function with a docstring; `main()` just calls them
sequentially.

| # | Stage function | Purpose | Output fed to next |
|---|---|---|---|
| 1 | `scrape_base()` | Fetch Showdown `pokedex.json`, `moves.json`, `learnsets.json`, `items.js`, `abilities.js` | in-memory dicts |
| 2 | `scrape_mod()` | Fetch Champions mod `.ts` overrides (`moves.ts`, `items.ts`, `abilities.ts`, `formats-data.ts`, `learnsets.ts`) | in-memory dicts |
| 3 | `scrape_descriptions()` | Fetch Game8 ability HTML page | desc map |
| 4 | `apply_overrides()` | Merge mod overrides onto base (uses `_lib.ts_parser._apply_overrides`) | merged dicts |
| 5 | `compute_legal_species()` | Intersect hardcoded format whitelist with `tier != "Illegal"`, apply format-specific overrides | `all_legal_ids: set[str]` |
| 6 | `compute_legal_moves()` | Filter moves by `isNonstandard` (allow `None`/`""`/`"Custom"`, exclude `Past`/`Unobtainable`/`CAP`/`LGPE`/`Gigantamax`/`Future`) | `legal_moves: set[str]` |
| 7 | `build_learnsets()` | Merge mod learnsets, inherit from `baseSpecies`/`battleOnly`/mega fallbacks, filter by legal moves × legal species | `learnset_out: dict[str, list[str]]` |
| 8 | `build_index()` | Emit `index.json` row per legal species | `index: list[dict]` |
| 9 | `build_moves()` | Strip non-Champions flags, remap `target`→`range`, assign `effectCategories` | `moves_out: dict` |
| 10 | `build_items()` | Filter by format whitelist, strip unused fields, attach sprite id | `items_out: dict` |
| 11 | `build_abilities()` | Resolve ability names → ids, attach `pokemon` list + `effectCategories` | `abilities_out: dict` |
| 12 | `build_moves_with_learnsets()` | Invert learnset map (move → list of species) | `moves_with_learnsets_out: dict` |
| 13 | `write_outputs()` | Write 6 JSON files to `data/format-<id>/` | on disk |

After `build.py` runs:

- `prep/patch_descriptions.py` patches `moves.json` + `moves-with-learnsets.json`
  for every `data/format-*/` directory. It is format-agnostic.
- `prep/format-<id>/polish_items.py` patches `items.json` for that format
  (item categories, sprite paths).

## Output contract

Each `data/format-<id>/` directory produces these 6 files (8 if you count
`sprite-map.json` + `shiny-sprite-map.json` from the asset scripts):

- `index.json` — species quick-lookup
- `moves.json` — move data with `range`, `effectCategories`, `flags`
- `moves-with-learnsets.json` — `move_id → [species_ids]`
- `learnsets.json` — `species_id → [move_ids]`
- `items.json` — item data with `sprite`, `category`
- `abilities.json` — ability data with `desc`, `pokemon`, `effectCategories`

## Adding a new format

1. Pick the new format id (e.g. `m-c`).
2. `cp -r prep/format-m-b prep/format-m-c`
3. Edit the constants block at the top of `prep/format-m-c/build.py`:
   - `FORMAT_ID = "m-c"`
   - `OUT = .../data/format-m-c`
   - Rename `MB_*` whitelists → `MC_*` and update their contents
4. (If the format introduces new items/abilities/moves not yet covered by the
   existing effect-category tables) update the `get_effect_categories` /
   `get_ability_categories` tables inline. The duplication is intentional —
   each format can tune its own tables without coordinating.
5. `cp prep/format-m-b/polish_items.py prep/format-m-c/polish_items.py` and
   point it at the new `data/format-m-c/items.json`.
6. Add `"prep:m-c": "python3 prep/format-m-c/build.py && python3 prep/format-m-c/polish_items.py"`
   to `package.json` and append `&& npm run prep:m-c` to the `prep` script.
7. Update `AGENTS.md` with the new dev command.
8. Run `npm run prep:m-c` and diff the output against any prior snapshot
   (the legal species/move counts should be sensible).

## Layout

```
prep/
  PIPELINE.md                  ← this file
  _lib/
    ts_parser.py               ← shared TS/JS parser
  format-m-a/
    build.py
    polish_items.py
  format-m-b/
    build.py
    polish_items.py
  patch_descriptions.py        ← format-agnostic
```

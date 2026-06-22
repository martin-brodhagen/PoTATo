# PoTATo — Pokémon Champions Teambuilder

## Dev Commands

```bash
# Run parser unit tests
npm test

# Build base + all formats + all i18n bundles (network required on first run, caches to .cache/)
npm run prep

# Build just the shared base data
npm run prep:base

# Build just the format whitelists (e.g. for one specific id)
npm run prep:format
python3 prep/formats/build.py m-c   # single format

# Build just the i18n bundles
npm run prep:mb:i18n

# Start dev server → http://localhost:8787
npm start
```

`npm run prep` runs in order: `prep/base/build.py` → `prep/formats/build.py` → `prep/i18n/build.py`. Each stage is also runnable individually.

## Data Pipeline

- **Base**: `https://play.pokemonshowdown.com/data/{pokedex,moves,learnsets}.json` + `items.js` + `abilities.js`
- **Mod overrides**: `https://raw.githubusercontent.com/smogon/pokemon-showdown/master/data/mods/champions/{moves,items,abilities,formats-data,learnsets}.ts`
- **i18n (English)**: `https://raw.githubusercontent.com/smogon/pokemon-showdown/master/data/text/{pokedex,moves,items,abilities}.ts`
- **i18n (other languages, Pokémon names only)**: `https://pokeapi.co/api/v2/pokemon-species/{id}`

`isNonstandard` is unreliable for legality filtering — use the mod's `tier` field as source of truth instead.

## Layout

```
prep/
  build_mb.py                          # orchestrator
  base/
    build.py                           # 13 stages → data/base/*.json
  formats/
    build.py                           # applies per-format whitelists
    m-a/config.json                    # whitelists + label + version
    m-b/config.json
  i18n/
    config.json                        # which languages, which formats
    build.py
  _lib/
    cache.py                           # disk-backed HTTP cache
    ts_parser.py                       # TS/JS parser
    game8.py                           # Game8 description scraper
    tests/                             # 39 unit tests
data/
  base/                                # shared, format-agnostic
    pokedex.json
    moves.json
    items.json                         # includes sprite + category
    abilities.json                     # no per-format pokemon[] (derived)
    learnsets.json
    moves-with-learnsets.json
    sprite-map.json
    shiny-sprite-map.json
  formats/                             # whitelists only
    m-a.json                           # { id, label, version, species[], items[], abilities[] }
    m-b.json
  i18n/{en,ja,de,fr,es,it,ko,zh-Hans,zh-Hant,pt-BR,ru}/{pokemon,moves,items,abilities}.json
```

The legacy M-A pipeline (`prep/prep_data.py` + `prep/patch_descriptions.py` + `scripts/prep_items.py`) is **untouched** and out of scope. It uses the older single-script approach; its outputs are no longer consumed by the frontend. It can be deleted in a follow-up once we no longer need the comparison.

## Key Constants (`lib/types.js`)

Labels here are user-facing. Keep them human-readable.

### ABILITY_EFFECT_CATEGORIES (19)
`weather`, `terrain`, `stats`, `power`, `move_type`, `damage_reduction`, `immunity`, `status`, `contact`, `on_hit`, `priority`, `bypass`, `item`, `berries`, `form_change`, `ability_control`, `healing`, `field_control`, `switch_in_out`

## Architecture Notes

- ES modules, no bundler, no build step — served by `python3 -m http.server`
- Widgets created lazily on first tab activation; destroyed/recreated on format change via `app-init.js`
- Three `PokemonSearchWidget` instances: main grid, move detail "Learned By", ability detail "Pokémon with..."
- Two `MoveSearchWidget` instances: moves tab + pokemon detail filtered list
- `lib/data-loader.js` loads the shared base once (cached) and derives per-format views in memory by filtering against `data/formats/<id>.json` whitelists
- i18n is a **post-process layer** in `lib/i18n.js` — overlays localized names/descriptions onto the loaded data cache after fetch. Existing widgets read localized values transparently.

## CSS Conventions

- Sort/filter pills share `.sort-bar-btn` with `.is-cat-btn` styling (font-size 0.68rem, font-weight 600, 6px radius, bg-surface, border-strong)
- Widget-specific column widths set via `nth-child(n)` on `.sort-bar-btn`
- Class prefixes: `.ps-*` Pokemon, `.ms-*` Moves, `.as-*` Abilities, `.is-*` Items, `.tb-*` Team builder

## Pending / Future
- [ ] Move Type Coverage tool (placeholder)
- [ ] Damage Calculator (placeholder)
- [ ] Imports feature (placeholder)
- [ ] Breadcrumb optimizations (early return on same index, bounds checking)
- [ ] Translate move/ability/item descriptions (currently English only for non-entity names)
- [ ] Delete legacy M-A pipeline (`prep/prep_data.py`, `prep/patch_descriptions.py`, `scripts/prep_items.py`)

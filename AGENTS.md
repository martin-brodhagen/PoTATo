# PoTATo — Pokémon Champions Teambuilder

## Dev Commands

```bash
npm start                                # dev server on http://localhost:8787
npm run prep                             # full data pipeline (base → patches → formats → i18n)
npm run prep:base                        # just data/base/ (slowest, network)
npm run prep:format                      # just data/formats/<id>.json (also accepts CLI args)
python3 prep/formats/build.py m-c        # single format
npm run prep:mb:i18n                     # just i18n bundles
npm run prep:mb:refresh-game8            # re-scrape game8.co (writes data/game8-descriptions.json)
npm run prep:items:patch                 # re-apply item category patches
npm run prep:moves:patch                 # re-apply move PP patches
npm run prep:abilities:patch             # re-apply ability removals
npm run prep:species:patch               # re-apply cosmetic-forme synthesis to data/base/pokedex.json
```

First run of `npm run prep:base` needs network; subsequent runs use the `.cache/` disk cache.

## Data Pipeline (in `prep/build_mb.py` order)

1. `prep/base/build.py` — fetches Showdown raw + Champions mod, applies mod overrides, builds 8 files in `data/base/`. Network required on first run.
2. `prep/items/patch_categories.py` — applies `data/manual-item-categories.json` on top of Game8 categories.
3. `prep/moves/patch_pp.py` — applies `data/manual-move-pp.json` PP mapping.
4. `prep/abilities/patch_remove.py` — applies `data/manual-ability-removals.json`.
5. `prep/formats/build.py` — reads `prep/formats/<id>/config.json` whitelists, writes `data/formats/<id>.json`.
6. `prep/i18n/build.py` — writes `data/i18n/<lang>/{pokemon,moves,items,abilities}.json` from PokeAPI + base.

`isNonstandard` is unreliable for legality — use the mod's `tier` field as the source of truth.

## Layout

```
prep/                            python data pipeline
  base/build.py                  # 14 stages → data/base/ (step 2 injects cosmetic formes)
  items/patch_categories.py      # Game8 + manual categories → data/base/items.json
  moves/patch_pp.py              # manual PP map → data/base/moves.json
  abilities/patch_remove.py      # manual ability removals → data/base/abilities.json
  species/patch_cosmetic_formes.py # re-applies cosmetic-form synthesis to data/base/pokedex.json
  formats/
    build.py                     # writes data/formats/<id>.json
    m-a/config.json              # flat {species, items} or split {species_non_mega, species_mega}
    m-b/config.json              # species_overrides bypasses the mod's tier check
  i18n/build.py                   # writes data/i18n/<lang>/*.json
  _lib/
    cache.py                     # disk-backed HTTP cache for Showdown/PokeAPI
    game8.py                     # Game8 description + category scraper
    ts_parser.py                 # brace-counting parser for Showdown's TS
  prep_data.py / patch_descriptions.py    # LEGACY M-A pipeline, out of scope, do not use
data/
  base/                          # shared, format-agnostic (8 JSONs)
  formats/<id>.json              # {id, label, version, species[], items[], abilities[]}
  i18n/<lang>/                   # 11 langs × 4 entity types
  manual-*.json                  # user-edited patches applied after the base build
  game8-descriptions.json        # cached Game8 scrape
lib/
  data-loader.js                 # loads base once, derives per-format views in memory
  i18n.js                        # post-process layer: overlays localized name/desc onto cache
  app-init.js                    # wires widgets, rebuilt on format change
  views/                         # breadcrumb, header, search-detail panels
  <widget>.js                    # one file per widget (pokemon/move/ability/item search, team builder, etc)
app.js                           # entry point, runs `initI18n` then `loadFormatData(initialFormat)`
index.html                       # no build step, served as-is
style.css                        # all styling in one file
```

## Manual Patches (the post-build override layer)

Each `data/manual-*.json` is a small, user-edited file applied as a patch after the base build. The base alone is never the source of truth.

| File | Format | What it overrides |
|---|---|---|
| `manual-item-categories.json` | `{item_id: [category, ...]}` | Per-item category tags (replaces Game8). |
| `manual-move-pp.json` | `{old_pp: new_pp}` | Uniform PP remap (5→8, 10→12, 15→16 today). |
| `manual-ability-removals.json` | `{remove: [ability_id, ...]}` | Abilities to drop from base + every format whitelist. |
| `manual-forme-overrides.json` | `{forme: {name, kind}}` + `_base: {species_id: {name, kind}}` | Display name + kind per forme. `_base` covers the base species when it IS a named forme (Male Basculegion, Disguised Mimikyu, etc.). See Forme Override System below. |
| `manual-cosmetic-formes.json` | `{base_id: [forme, ...]}` | Cosmetic-only formes to enable per base (synthesized in step 2 of the base build, idempotent re-apply in `prep/species/patch_cosmetic_formes.py`). |

To add a new kind or category of override, follow the same pattern: a JSON file in `data/`, a `prep/<area>/patch_*.py` script that reads it, and a call in `prep/build_mb.py`.

## Forme Override System

`data/manual-forme-overrides.json` controls per-forme display + visibility:

- **`name`** — display string used in the search detail header (under the pokemon name) and in forme switcher tooltips. Falls back to the raw `species.forme` value.
- **`kind`** — one of:
  - `pre-battle` (default) — visible in the search grid
  - `mega` — visible in the search grid (Mega evolutions)
  - `combat-switch` — **hidden** from the search grid (in-battle transformations: Hero, Blade, Zen, etc.)
  - `cosmetic` — **hidden** from the search grid (visual-only recolors: Antique, Original, etc.)

The hidden kinds are exported from `lib/data-loader.js` as `HIDDEN_FORME_KINDS`. The `pokemon-search-widget` filters them out of the search grid; the `search-detail-view` forme switcher still shows them (reachable via the forme button).

To add a M-B-relevant forme that should be hidden from search (e.g. Aegislash's Blade Forme in M-A): add it to `data/manual-forme-overrides.json` with `kind: "combat-switch"`, and add the species to the M-B config's `species_overrides` if it's not in the mod's tier table.

### Base Formes

When the base species is itself a named forme (Male Basculegion, Disguised Mimikyu, Shield Forme Aegislash, Midday Lycanroc, etc.), upstream Showdown leaves `species.forme` empty on the base entry, so the search detail view would otherwise show an empty forme line. Add a `_base: {species_id: {name, kind}}` section to `manual-forme-overrides.json` to fill it in. The `kind` should be `pre-battle` (these are encounterable pokemon, even when their alternative forme is `combat-switch`). Mega and regional bases are excluded — only pokemon whose alternatives are non-mega, non-regional belong here.

## Cosmetic-Only Formes

`data/manual-cosmetic-formes.json` lists cosmetic-only forme variants to enable per base species (e.g. Florges colors, Furfrou trims, Alcremie flavors, Vivillon patterns). These formes:

- Are not in upstream Showdown's `pokedex.json` (only listed in each base's `cosmeticFormes` metadata).
- Are marked `Illegal` by the Champions mod.
- Have **no competitive difference** from the base (identical stats/types/abilities).

The base build's step 2 (`inject_cosmetic_formes`) synthesizes a placeholder entry for each missing forme by copying the base's stat-bearing fields, and backfills any missing fields on in-upstream cosmetic entries (Vivillon patterns, Alcremie cream/swirl variants, etc.). Format configs then list the resulting species IDs in `species_overrides` to whitelist them; the forme switcher surfaces them in the search detail view, and the `cosmetic` kind in `manual-forme-overrides.json` hides them from the search grid.

To add a new cosmetic family: append the base id (e.g. `"unown"`) to `data/manual-cosmetic-formes.json` with the list of forme values (case-sensitive, matching `species.forme` in upstream), and add the synthesized species IDs to the format configs' `species_overrides` plus the display names to `manual-forme-overrides.json`. Re-run `npm run prep` to rebuild.

`scripts/build-sprite-map.py` and `scripts/build-shiny-sprite-map.py` look up form-specific sprites by converting `entry.forme` to a Bulbagarden sprite suffix (spaces/dashes → underscores) and matching against `Menu_CP_<dex>-<form>.png`. If a sprite file exists for a forme, it's used; otherwise the base sprite is used as fallback. Special-case overrides (e.g. `Pokeball` → `Poke_Ball`) live in `FORME_SPRITE_OVERRIDES` at the top of each sprite script.

## Architecture

- ES modules, no bundler, no build step. Served directly by `python3 -m http.server`.
- `lib/data-loader.js` loads `data/base/*` once (cached), augments each species with `formeInfo`, and filters against `data/formats/<id>.json` to build the per-format view. All `loadX(format)` helpers go through this.
- `lib/i18n.js` is a post-process layer: takes a snapshot of `name`/`desc` from the in-memory cache, then overlays translated values from `data/i18n/<lang>/*.json`. Widgets read the cache transparently.
- Widgets: three `PokemonSearchWidget` instances (main pokedex grid, move-detail "Learned By", ability-detail "Pokémon with..."), two `MoveSearchWidget` instances (moves tab, pokemon-detail filtered list). All widgets are destroyed and recreated on format switch.

## CSS Conventions

- Class prefixes: `.ps-*` Pokemon, `.ms-*` Moves, `.as-*` Abilities, `.is-*` Items, `.tb-*` Team builder. `.dc-*` Defensive Coverage. `.move-detail-*` Move/Ability/Item detail panels.
- Filter/sort pill: shared `.pill-btn` (font-size 0.68rem, font-weight 600, 6px radius, `bg-surface`, `border-strong`). Active state uses `var(--accent-gold)`. The legacy `.is-cat-btn` has the same look but isn't a single source of truth yet.
- The `.detail-forme` line under a pokemon's name in search detail is always rendered (uses `&nbsp;` for forme-less pokemon) so the type/meta block sits at a consistent vertical position.

## Pending / Future

- [ ] Move Type Coverage tool (placeholder)
- [ ] Damage Calculator (placeholder)
- [ ] Imports feature (placeholder)
- [ ] Breadcrumb optimizations (early return on same index, bounds checking)
- [ ] Translate move/ability/item descriptions beyond English (descriptions are Game8-sourced for `en`; other langs fall back to English)
- [ ] Delete legacy M-A pipeline (`prep/prep_data.py`, `prep/patch_descriptions.py`) — these are no longer consumed by the frontend, only kept for comparison

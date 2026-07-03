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
npm run prep:species:patch                 # re-apply cosmetic-forme synthesis to data/base/pokedex.json
npm run prep:species:base                  # re-apply per-species baseSpecies/forme overrides to data/base/pokedex.json

python3 scripts/export.py                 # build a portable ./export/ bundle (Netlify drag-and-drop)
python3 scripts/export.py /tmp/bundle     # custom output dir; refuses to write into repo root
```

First run of `npm run prep:base` needs network; subsequent runs use the `.cache/` disk cache.

## Deploy

Two paths, both served by Netlify:

- **Git-based** — `netlify.toml` at the repo root sets security + long-immutable cache headers (`/lib/*`, `/data/*`, `/sprites/*`); `index.html` is always `no-cache` so deploys pick up immediately.
- **Drag-and-drop** — run `python3 scripts/export.py` then upload `export/` to Netlify. The export copies only the runtime files (excludes `prep/`, `scripts/*`, `.cache/`, scrape caches, all `data/manual-*.json` except `manual-forme-overrides.json` which the frontend fetches) and writes `export/_headers` mirroring the `netlify.toml` rules. Output dir is wiped + recreated each run, so stale files from prior schemas can't linger.

## Data Pipeline (in `prep/build_mb.py` order)

1. `prep/base/build.py` — fetches Showdown raw + Champions mod, applies mod overrides, builds 8 files in `data/base/`. Network required on first run.
2. `prep/items/patch_categories.py` — overlays Game8 + `data/manual-item-categories.json`.
3. `prep/moves/patch_pp.py` — applies `data/manual-move-pp.json` PP mapping.
4. `prep/abilities/patch_remove.py` — applies `data/manual-ability-removals.json`.
5. `prep/species/patch_cosmetic_formes.py` — re-synthesizes cosmetic formes onto `data/base/pokedex.json` (no network).
6. `prep/species/patch_base_species.py` — applies `data/manual-base-species.json` redirects.
7. `prep/formats/build.py` — reads `prep/formats/<id>/config.json` whitelists, writes `data/formats/<id>.json`.
8. `prep/i18n/build.py` — writes `data/i18n/<lang>/{pokemon,moves,items,abilities}.json` from PokeAPI + base.

`isNonstandard` is unreliable for legality — use the mod's `tier` field as the source of truth. First network run populates `.cache/` (SHA-256-keyed HTTP cache, see `prep/_lib/cache.py`); later runs reuse it.

## Layout

```
prep/                            python data pipeline
  build_mb.py                    # orchestrator: runs all 8 steps above
  base/build.py                  # 13 stages → data/base/ (step 2 injects cosmetic formes)
  items/patch_categories.py      # Game8 + manual categories → data/base/items.json
  moves/patch_pp.py              # manual PP map → data/base/moves.json
  abilities/patch_remove.py      # manual ability removals → data/base/abilities.json
  species/patch_cosmetic_formes.py # re-applies cosmetic-form synthesis to data/base/pokedex.json
  species/patch_base_species.py  # re-applies per-species baseSpecies/forme redirects
  formats/
    build.py                     # writes data/formats/<id>.json
    m-a/config.json              # flat {species, items} or split {species_non_mega, species_mega}
    m-b/config.json              # species_overrides bypasses the mod's tier check
  i18n/
    build.py
    config.json                  # languages, formats, PokeAPI locale map
  _lib/
    cache.py                     # disk-backed HTTP cache (see .cache/)
    game8.py                     # Game8 description + category scraper
    ts_parser.py                 # brace-counting parser for Showdown's TS
  prep_data.py / patch_descriptions.py    # LEGACY M-A pipeline, out of scope, do not use
scripts/                          one-off asset pipelines (run manually, not via npm)
  download-sprites.py            # Bulbagarden Archives → sprites/champions/
  download-shiny-sprites.py
  download-type-icons.py         # Game8 → sprites/types/
  build-sprite-map.py            # writes data/base/sprite-map.json
  build-shiny-sprite-map.py
  export.py                      # builds portable ./export/ bundle for Netlify drag-and-drop
  _headers                       # Netlify headers file copied to export/ root during export
data/
  base/                          # shared, format-agnostic (8 JSONs)
  formats/<id>.json              # {id, label, version, species[], items[], abilities[]}
  i18n/<lang>/                   # 2 langs × 4 entity types (en, de)
  manual-*.json                  # user-edited patches applied after the base build
  game8-descriptions.json        # cached Game8 description scrape
  game8-categories.json          # cached Game8 item-category scrape
  type-icons.json                # type → sprites/types/{name}[-small].png
lib/
  data-loader.js                 # loads base once, derives per-format views in memory
  team-store.js                  # team persistence in localStorage (schema v2, with v1 migration)
                                # exports: createTeam, loadTeams, saveTeams, removeTeam, loadLastTeamId, saveLastTeamId, migrateTeamsToV2, migrateFromLegacy
  team-browser-widget.js         # left-side team CRUD UI (default left tab); renders, renames, deletes, switches to active
  i18n.js                        # post-process layer: overlays localized name/desc onto cache
  app-init.js                    # wires widgets; rebuilds Pokedex subtab widgets on format change
  app-state.js                   # in-memory state container (currentFormat, teams, currentTeamId, etc.)
  navigation-controller.js       # tab/subtab switching (TAB_REGISTRY; default leftTab = 'team-browser')
  detail-controller.js           # routes clicks → breadcrumb + search-detail
  types.js                       # TYPES, TYPE_COLORS, EFFECT_CATEGORIES, etc. (shared constants)
  <widget>.js                    # one file per widget (pokemon/move/ability/item search, team builder, etc)
  views/                         # breadcrumb / header / search-detail views
    header-view.js               # top-bar slot preview + legality warning; click preview to jump to team builder
export/                          # output of scripts/export.py — Netlify drag-and-drop bundle
  _headers                       # mirrors netlify.toml (long-cache + security headers)
app.js                           # entry point — runs initI18n, then loadFormatData('m-b')
index.html                       # served as-is, no build step
style.css                        # all styling in one file (sections marked with /* ── */)
netlify.toml                     # git-based deploy config; security + long-immutable cache headers
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
| `manual-base-species.json` | `{species_id: {baseSpecies, forme}}` | Per-species `baseSpecies` + `forme` overrides (idempotent re-apply in `prep/species/patch_base_species.py`). Use when upstream's `baseSpecies` points at the wrong base for the team-builder's model — the stone's `megaStone` mapping is the source of truth for which base a mega belongs to. |

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

## Base-Species Redirects

`data/manual-base-species.json` redirects a species' `baseSpecies` / `forme` when upstream's values are wrong for the team-builder's model. The motivating case is **Meowstic**: upstream encodes `meowsticf` as a forme of `meowstic` (the male), but the game treats both genders as separate bases that each get their own mega from `Meowsticite`. The stone's `megaStone` mapping already has both keys (`"Meowstic"` → M-Mega, `"Meowstic-F"` → F-Mega), but upstream's `meowsticfmega.baseSpecies = "Meowstic"` would point the F-mega at the wrong base. The patch sets `meowsticfmega.baseSpecies = "Meowstic-F"` and demotes `meowsticf` to its own base (with a matching `_base` entry in `manual-forme-overrides.json` for the forme-line display).

The patch is idempotent — re-running it after a fresh `npm run prep:base` is safe and re-applies the redirects.

To redirect another species: add an entry to `data/manual-base-species.json` with the species id and the desired `baseSpecies` / `forme` values (one or both fields; null means "no base / no forme"). Re-run `npm run prep:species:base` (or the full `npm run prep`) to apply.

`scripts/build-sprite-map.py` and `scripts/build-shiny-sprite-map.py` look up form-specific sprites by converting `entry.forme` to a Bulbagarden sprite suffix (spaces/dashes → underscores) and matching against `Menu_CP_<dex>-<form>.png`. If a sprite file exists for a forme, it's used; otherwise the base sprite is used as fallback. Special-case overrides (e.g. `Pokeball` → `Poke_Ball`) live in `FORME_SPRITE_OVERRIDES` at the top of each sprite script.

## Architecture

- ES modules, no bundler, no build step. Served directly by `python3 -m http.server`.
- `lib/data-loader.js` loads `data/base/*` once (cached), augments each species with `formeInfo`, and filters against `data/formats/<id>.json` to build the per-format view. All `loadX(format)` helpers go through this.
- `lib/i18n.js` is a post-process layer: takes a snapshot of `name`/`desc` from the in-memory cache, then overlays translated values from `data/i18n/<lang>/<lang>/*.json`. Widgets read the cache transparently.
- Widgets: three `PokemonSearchWidget` instances (main pokedex grid, move-detail "Learned By", ability-detail "Pokémon with..."), two `MoveSearchWidget` instances (moves tab, pokemon-detail filtered list). All widgets are destroyed and recreated on format switch.
- **Team browser** (`lib/team-browser-widget.js`) is the default left tab and the only place for team CRUD UI. It shows teams for the current global format, handles create/rename/delete via callbacks into `app-init.js`, and clicking a team (or its Edit button) makes it active and navigates to the team builder. Team persistence is per-format under `potato-teams-<format>` in localStorage (see `lib/team-store.js`).
- **Team builder + pre-battle formes**: in `applySpeciesToSlot` (`lib/team-builder-widget.js:209`), a forme with `formeInfo.kind === "pre-battle"` is treated as its own base — `slot.speciesId` is the forme's own id and `slot.formes` stays empty, so the regular form never enters the cycle. The same `kind` field drives search grid visibility (`HIDDEN_FORME_KINDS = {"combat-switch", "cosmetic"}`), so the two views stay in sync. Combat-switch, cosmetic, and mega formes keep the regular base + cycle.

## CSS Conventions

- Class prefixes: `.ps-*` Pokemon, `.ms-*` Moves, `.as-*` Abilities, `.is-*` Items, `.tb-*` Team builder, `.tbr-*` Team browser, `.dc-*` Defensive Coverage. `.move-detail-*` Move/Ability/Item detail panels.
- Filter/sort pill: shared `.pill-btn` (font-size 0.68rem, font-weight 600, 6px radius, `bg-surface`, `border-strong`). Active state uses `var(--accent-gold)`. The legacy `.is-cat-btn` has the same look but isn't a single source of truth yet.
- Team browser base slot styles (`.tbr-slot`, `.tbr-slot-sprite`) share their base rules with the header-view equivalents (`.header-slot`, `.header-slot-sprite`) via CSS selector lists — `.tbr-team-slots-grid .tbr-slot` adds the team-browser-specific size overrides on top.
- The `.detail-forme` line under a pokemon's name in search detail is always rendered (uses `&nbsp;` for forme-less pokemon) so the type/meta block sits at a consistent vertical position.

## Pending / Future

- [ ] Offensive Coverage tool (placeholder)
- [ ] Damage Calculator (placeholder)
- [ ] Breadcrumb optimizations (early return on same index, bounds checking)
- [ ] Translate move/ability/item descriptions beyond English (descriptions are Game8-sourced for `en`; other langs fall back to English)
- [ ] Delete legacy M-A pipeline (`prep/prep_data.py`, `prep/patch_descriptions.py`) — these are no longer consumed by the frontend, only kept for comparison
- [ ] Review and correct move categorization
- [ ] Review and correct ability categorization

# PoTATo — Pokémon Champions Teambuilder

## Dev Commands

```bash
# Data fetch + merge (network required on first run, caches to .cache/)
npm run prep

# Start dev server → http://localhost:8787
npm start
```

`npm run prep` runs three scripts in sequence: `prep/prep_data.py` → `prep/patch_descriptions.py` → `scripts/prep_items.py`.

## Data Pipeline

- **Base**: `https://play.pokemonshowdown.com/data/pokedex.json`
- **Mod overrides**: `https://raw.githubusercontent.com/smogon/pokemon-showdown/master/data/mods/champions/` (TS files)
- **Legality**: Hardcoded whitelists in `prep/prep_data.py`

`isNonstandard` is unreliable for legality filtering — use the mod's `tier` field as source of truth instead.

## Key Constants (`lib/types.js`)

Labels here are user-facing. Keep them human-readable.

### ABILITY_EFFECT_CATEGORIES (19)
`weather`, `terrain`, `stats`, `power`, `move_type`, `damage_reduction`, `immunity`, `status`, `contact`, `on_hit`, `priority`, `bypass`, `item`, `berries`, `form_change`, `ability_control`, `healing`, `field_control`, `switch_in_out`

## Architecture Notes

- ES modules, no bundler, no build step — served by `python3 -m http.server`
- Widgets created lazily on first tab activation; destroyed/recreated on format change via `app-init.js`
- Three `PokemonSearchWidget` instances: main grid, move detail "Learned By", ability detail "Pokémon with..."
- Two `MoveSearchWidget` instances: moves tab + pokemon detail filtered list

## CSS Conventions

- Sort/filter pills share `.sort-bar-btn` with `.is-cat-btn` styling (font-size 0.68rem, font-weight 600, 6px radius, bg-surface, border-strong)
- Widget-specific column widths set via `nth-child(n)` on `.sort-bar-btn`
- Class prefixes: `.ps-*` Pokemon, `.ms-*` Moves, `.as-*` Abilities, `.is-*` Items, `.tb-*` Team builder

## Pending / Future
- [ ] Move Type Coverage tool (placeholder)
- [ ] Damage Calculator (placeholder)
- [ ] Imports feature (placeholder)
- [ ] Breadcrumb optimizations (early return on same index, bounds checking)
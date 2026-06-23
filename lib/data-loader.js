// Loads the shared base data once, then derives per-format views by filtering
// against the format's whitelist. Per-format views are cached in `caches[format]`
// and have the same shape the widgets expect (so they don't need to change):
//
//   caches[format] = {
//     index:              [{id, name, num, types, baseStats, ...}, ...]
//     moves:              { [move_id]: {name, type, basePower, range, ...} }
//     items:              { [item_id]: {name, desc, megaStone, ...} }
//     abilities:          { [ability_id]: {name, desc, pokemon[], effectCategories} }
//     learnsets:          { [species_id]: [move_id, ...] }
//     movesWithLearnsets: { [move_id]:   [species_id, ...] }
//   }
//
// `pokemon[]` on each ability is derived from the format's species, not stored
// in the base.
//
// Source layout:
//   data/base/{pokedex,moves,items,abilities,learnsets,moves-with-learnsets}.json
//   data/base/sprite-map.json
//   data/base/shiny-sprite-map.json
//   data/manual-forme-overrides.json   (per-forme display name + kind)
//   data/formats/<id>.json     (whitelist: {id, label, version, species, items, abilities})

const DATA_URL = 'data';
const BASE_FILES = [
  'pokedex',
  'moves',
  'items',
  'abilities',
  'learnsets',
  'moves-with-learnsets',
  'sprite-map',
  'shiny-sprite-map',
];

// Forme kinds that the search widget hides from its grid (still reachable
// via the forme switcher in the search detail view).
export const HIDDEN_FORME_KINDS = new Set(["combat-switch", "cosmetic"]);

// Module-level shared base cache. Loaded once on first call to loadBase().
let baseCache = null;
let basePromise = null;

// Per-format derived views. Cached so format switches are O(1).
const caches = {};
const viewPromises = {};

// Map from kebab-case filename to the camelCase property we expose on the
// in-memory cache. Keeps the on-disk filenames the same as the legacy data
// while giving the rest of the module ergonomic accessors.
const BASE_KEYS = {
  pokedex: 'pokedex',
  moves: 'moves',
  items: 'items',
  abilities: 'abilities',
  learnsets: 'learnsets',
  'moves-with-learnsets': 'movesWithLearnsets',
  'sprite-map': 'spriteMap',
  'shiny-sprite-map': 'shinySpriteMap',
};

async function fetchJson(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Failed to fetch ${path}: ${res.status}`);
  return res.json();
}

export function loadBase() {
  if (baseCache) return Promise.resolve(baseCache);
  if (basePromise) return basePromise;
  basePromise = (async () => {
    const out = {};
    await Promise.all(
      BASE_FILES.map(async (name) => {
        const data = await fetchJson(`${DATA_URL}/base/${name}.json`);
        out[BASE_KEYS[name]] = data;
      })
    );
    out.pokedexIndex = new Map(out.pokedex.map((p) => [p.id, p]));
    out.formeOverrides = await loadFormeOverrides();
    baseCache = out;
    return out;
  })();
  return basePromise;
}

// Load the forme overrides file. Each entry is {forme: {name, kind?}}.
// `kind` defaults to "pre-battle" when missing. Returns {} if the file is
// missing — formes without an entry just use the raw `species.forme` value
// for display, and behave as "pre-battle" for filtering.
async function loadFormeOverrides() {
  try {
    const r = await fetchJson(`${DATA_URL}/manual-forme-overrides.json`);
    const out = {};
    for (const [k, v] of Object.entries(r)) {
      if (k.startsWith("_")) continue;
      out[k] = typeof v === "string" ? { name: v } : v;
    }
    return out;
  } catch (_) {
    return {};
  }
}

function formeInfoFor(species, overrides) {
  if (!species.forme) return null;
  const ov = overrides[species.forme];
  if (ov) return { name: ov.name, kind: ov.kind || "pre-battle" };
  // No override entry — fall back to the raw forme value as the display
  // name, and treat as "pre-battle" (visible in search grid by default).
  return { name: species.forme, kind: "pre-battle" };
}

export function setFormat(id) {
  if (!caches[id]) caches[id] = {};
}

// Derive a per-format cache from the shared base + a format whitelist.
// Idempotent; cached for subsequent calls.
export async function loadFormatView(formatId) {
  if (caches[formatId] && caches[formatId].index) {
    return caches[formatId];
  }
  if (viewPromises[formatId]) return viewPromises[formatId];

  viewPromises[formatId] = (async () => {
    const base = await loadBase();
    const whitelist = await fetchJson(`${DATA_URL}/formats/${formatId}.json`);

    const speciesIds = new Set(whitelist.species);
    const itemIds = new Set(whitelist.items);
    const abilityIds = new Set(whitelist.abilities);

    // Species index (preserves base order). Each species is augmented with
    // `formeInfo` (or null) from data/manual-forme-overrides.json so widgets
    // can render the display name and apply kind-based filtering without
    // re-implementing the lookup.
    const index = base.pokedex
      .filter((p) => speciesIds.has(p.id))
      .map((p) => ({ ...p, formeInfo: formeInfoFor(p, base.formeOverrides) }));

    // Items
    const items = {};
    for (const iid of itemIds) {
      const entry = base.items[iid];
      if (entry) items[iid] = entry;
    }

    // Abilities — compute pokemon[] from format species
    const abilityToSpecies = new Map();
    for (const mon of index) {
      for (const a of mon.abilities || []) {
        if (!a) continue;
        const key = a.toLowerCase().replace(/[\s\-.']/g, '');
        if (abilityIds.has(key)) {
          if (!abilityToSpecies.has(key)) abilityToSpecies.set(key, []);
          if (!abilityToSpecies.get(key).includes(mon.id)) {
            abilityToSpecies.get(key).push(mon.id);
          }
        }
      }
    }
    const abilities = {};
    for (const aid of abilityIds) {
      const entry = base.abilities[aid];
      if (!entry) continue;
      const list = abilityToSpecies.get(aid) || [];
      abilities[aid] = {
        ...entry,
        pokemon: sortedIds(list),
      };
    }

    // Learnsets — species in format × moves the species learns.
    // (Base already filters to legal Champions moves; no move filter needed
    // unless the format whitelist restricts moves, which neither M-A nor
    // M-B do today.)
    const learnsets = {};
    for (const mon of index) {
      learnsets[mon.id] = base.learnsets[mon.id] || [];
    }

    // Moves — present in base; format whitelist may restrict via whitelist.moves.
    const moveWhitelist = whitelist.moves ? new Set(whitelist.moves) : null;
    const moves = {};
    for (const [mid, entry] of Object.entries(base.moves)) {
      if (moveWhitelist && !moveWhitelist.has(mid)) continue;
      moves[mid] = entry;
    }

    // movesWithLearnsets — re-derived from per-format learnsets so it matches
    // the filtered species/moves.
    const moveToSpecies = new Map();
    for (const [sid, mids] of Object.entries(learnsets)) {
      for (const mid of mids) {
        if (!moves[mid]) continue;
        if (!moveToSpecies.has(mid)) moveToSpecies.set(mid, []);
        moveToSpecies.get(mid).push(sid);
      }
    }
    const movesWithLearnsets = {};
    for (const [mid, list] of moveToSpecies) {
      if (list.length) movesWithLearnsets[mid] = sortedIds(list);
    }

    const view = {
      id: formatId,
      label: whitelist.label || formatId,
      version: whitelist.version || '0.0.0',
      index,
      items,
      abilities,
      learnsets,
      moves,
      movesWithLearnsets,
      spriteMap: filterMap(base.spriteMap, speciesIds),
      shinySpriteMap: filterMap(base.shinySpriteMap, speciesIds),
    };
    caches[formatId] = view;
    return view;
  })();
  return viewPromises[formatId];
}

function sortedIds(arr) {
  return [...arr].sort();
}

function filterMap(map, allowedIds) {
  const out = {};
  for (const id of allowedIds) {
    if (Object.prototype.hasOwnProperty.call(map, id)) out[id] = map[id];
  }
  return out;
}

export function getCache(format) {
  return caches[format] || null;
}

export function getAllCaches() {
  return caches;
}

// Public per-format loaders — return slices of the cached view.
// All take a `format` arg (kept for backward-compat with existing widgets).

function loadSlice(format, key) {
  return loadFormatView(format).then((v) => v[key]);
}

export function loadIndex(format) {
  return loadSlice(format, 'index');
}

export function loadItems(format) {
  return loadSlice(format, 'items');
}

export function loadAbilities(format) {
  return loadSlice(format, 'abilities');
}

export function loadMoves(format) {
  return loadSlice(format, 'moves');
}

export function loadLearnsets(format) {
  return loadSlice(format, 'learnsets');
}

export function loadMovesWithLearnsets(format) {
  return loadFormatView(format).then((v) => {
    const moves = v.moves;
    const merged = {};
    for (const [mid, speciesList] of Object.entries(v.movesWithLearnsets)) {
      const move = moves[mid];
      if (move) merged[mid] = { ...move, learnedBy: speciesList };
    }
    return merged;
  });
}

export function loadSpriteMap(format) {
  return loadSlice(format, 'spriteMap');
}

export function loadShinySpriteMap(format) {
  return loadSlice(format, 'shinySpriteMap');
}

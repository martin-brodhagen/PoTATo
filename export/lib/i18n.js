// i18n loader for PoTATo.
//
// Detects the user's language from <html lang> / navigator.language,
// lazily loads `data/i18n/<lang>/{pokemon,moves,items,abilities}.json`,
// and provides a `t(type, id, field, fallback)` lookup.
//
// Layered on top of existing data: the format data files ship with
// English `name` and `desc` baked in (desc sourced from game8.co's
// Pokémon Champions pages). After loading, `applyI18n()` walks the
// in-memory cache and replaces those fields with the localized versions,
// so existing widgets read localized data without code changes.
//
// On language change, `applyI18n()` restores the original English values
// from an internal snapshot, then re-overlays with the new language.

const SUPPORTED = ["en", "de"];

const LOCALE_FALLBACK = {
  "en-US": "en", "en-GB": "en",
  "de-DE": "de", "de-AT": "de", "de-CH": "de",
};

let currentLang = "en";
const bundles = { pokemon: {}, moves: {}, items: {}, abilities: {} };

// Snapshot of the original (English) name/desc fields, keyed
// by format → entity-type → entity-id. Populated on the first call to
// applyI18n() and used to restore the cache when the language changes.
const originals = {};

function detectLang() {
  const htmlLang = document.documentElement?.lang || "";
  const navLang = (navigator.language || navigator.userLanguage || "en");
  for (const raw of [htmlLang, navLang]) {
    if (!raw) continue;
    if (LOCALE_FALLBACK[raw]) return LOCALE_FALLBACK[raw];
    const short = raw.split("-")[0].toLowerCase();
    const match = SUPPORTED.find((l) => l.toLowerCase() === short);
    if (match) return match;
  }
  return "en";
}

async function loadBundles(lang) {
  bundles.pokemon = {};
  bundles.moves = {};
  bundles.items = {};
  bundles.abilities = {};
  const tasks = ["pokemon", "moves", "items", "abilities"].map(async (type) => {
    try {
      const res = await fetch(`data/i18n/${lang}/${type}.json`);
      if (res.ok) {
        bundles[type] = await res.json();
      }
    } catch (_) {
      // Bundle is optional; fall back to embedded English from format data
    }
  });
  await Promise.all(tasks);
}

export async function initI18n() {
  currentLang = detectLang();
  await loadBundles(currentLang);
  return currentLang;
}

// Switch the active language. Fetches the new bundles, then re-applies
// the overlay to the in-memory cache. The caller is responsible for
// re-rendering any widgets whose DOM holds the previous values.
export async function setLang(lang) {
  if (!SUPPORTED.includes(lang)) return currentLang;
  currentLang = lang;
  await loadBundles(lang);
  return currentLang;
}

export function getLang() {
  return currentLang;
}

export function getSupportedLanguages() {
  return [...SUPPORTED];
}

export function t(entityType, id, field, fallback) {
  const entry = bundles[entityType]?.[id];
  if (entry && entry[field]) return entry[field];
  return fallback;
}

const NAME_FIELDS = ["name"];
const DESC_FIELDS = ["desc"];

function takeSnapshotField(entity, type, id) {
  if (!entity || typeof entity !== "object" || !id) return;
  const slot = originals[type] || (originals[type] = {});
  const entry = slot[id] || (slot[id] = {});
  for (const f of NAME_FIELDS) if (entity[f] !== undefined) entry[f] = entity[f];
  for (const f of DESC_FIELDS) if (entity[f] !== undefined) entry[f] = entity[f];
}

function takeSnapshot(caches) {
  for (const format of Object.keys(caches)) {
    const cache = caches[format];
    if (!cache) continue;
    originals[format] = {};
    if (Array.isArray(cache.index)) {
      for (const mon of cache.index) takeSnapshotField(mon, format, mon.id);
    }
    if (cache.moves && typeof cache.moves === "object") {
      for (const mid of Object.keys(cache.moves)) takeSnapshotField(cache.moves[mid], format, mid);
    }
    if (cache.movesWithLearnsets && typeof cache.movesWithLearnsets === "object") {
      for (const mid of Object.keys(cache.movesWithLearnsets)) takeSnapshotField(cache.movesWithLearnsets[mid], format, mid);
    }
    if (cache.items && typeof cache.items === "object") {
      for (const iid of Object.keys(cache.items)) takeSnapshotField(cache.items[iid], format, iid);
    }
    if (cache.abilities && typeof cache.abilities === "object") {
      for (const aid of Object.keys(cache.abilities)) takeSnapshotField(cache.abilities[aid], format, aid);
    }
  }
}

function restoreEntity(entity, type, id) {
  const orig = originals[type]?.[id];
  if (!orig || !entity) return;
  for (const f of NAME_FIELDS) {
    if (orig[f] !== undefined) entity[f] = orig[f];
  }
  for (const f of DESC_FIELDS) {
    if (orig[f] !== undefined) entity[f] = orig[f];
  }
}

function restoreFromSnapshot(caches) {
  for (const format of Object.keys(caches)) {
    const cache = caches[format];
    if (!cache) continue;
    if (Array.isArray(cache.index)) {
      for (const mon of cache.index) restoreEntity(mon, format, mon.id);
    }
    if (cache.moves && typeof cache.moves === "object") {
      for (const mid of Object.keys(cache.moves)) restoreEntity(cache.moves[mid], format, mid);
    }
    if (cache.movesWithLearnsets && typeof cache.movesWithLearnsets === "object") {
      for (const mid of Object.keys(cache.movesWithLearnsets)) restoreEntity(cache.movesWithLearnsets[mid], format, mid);
    }
    if (cache.items && typeof cache.items === "object") {
      for (const iid of Object.keys(cache.items)) restoreEntity(cache.items[iid], format, iid);
    }
    if (cache.abilities && typeof cache.abilities === "object") {
      for (const aid of Object.keys(cache.abilities)) restoreEntity(cache.abilities[aid], format, aid);
    }
  }
}

function overlay(entity, type, id) {
  if (!entity || typeof entity !== "object" || !id) return;
  const bundle = bundles[type];
  if (!bundle) return;
  const entry = bundle[id];
  if (!entry) return;
  for (const f of NAME_FIELDS) {
    if (entry[f]) entity[f] = entry[f];
  }
  for (const f of DESC_FIELDS) {
    if (entry[f]) entity[f] = entry[f];
  }
}

// Walk the data-loader's in-memory cache and overlay translations.
// On the first call, takes a snapshot of the original (English) name/desc
// values so subsequent calls can restore them when the language changes.
// `caches` is the cache map: { [format]: { index, moves, items, abilities, ... } }
export function applyI18n(caches) {
  if (!caches || typeof caches !== "object") return;
  const hasSnapshot = Object.keys(originals).length > 0;
  if (hasSnapshot) {
    restoreFromSnapshot(caches);
  } else {
    takeSnapshot(caches);
  }
  for (const format of Object.keys(caches)) {
    const cache = caches[format];
    if (!cache) continue;

    if (Array.isArray(cache.index)) {
      for (const mon of cache.index) overlay(mon, "pokemon", mon.id);
    }
    if (cache.moves && typeof cache.moves === "object") {
      for (const mid of Object.keys(cache.moves)) {
        overlay(cache.moves[mid], "moves", mid);
      }
    }
    if (cache.movesWithLearnsets && typeof cache.movesWithLearnsets === "object") {
      for (const mid of Object.keys(cache.movesWithLearnsets)) {
        overlay(cache.movesWithLearnsets[mid], "moves", mid);
      }
    }
    if (cache.items && typeof cache.items === "object") {
      for (const iid of Object.keys(cache.items)) {
        overlay(cache.items[iid], "items", iid);
      }
    }
    if (cache.abilities && typeof cache.abilities === "object") {
      for (const aid of Object.keys(cache.abilities)) {
        overlay(cache.abilities[aid], "abilities", aid);
      }
    }
  }
}

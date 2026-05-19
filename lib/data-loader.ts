import type { Species, Move, Item, FormatId, DataCache } from './types.js';

const DATA_URL = 'data';

const caches: Record<FormatId, DataCache> = { 'm-a': {}, 'm-b': {} };
const promises: Record<string, Promise<any>> = {};

export function setFormat(id: FormatId) {
  if (!caches[id]) caches[id] = {};
}

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Failed to fetch ${path}: ${res.status}`);
  return res.json();
}

function loadPromise<T>(
  format: FormatId,
  file: string,
  target: keyof DataCache,
): Promise<T> {
  const c = caches[format];
  const existing = c[target] as T | undefined;
  if (existing) return Promise.resolve(existing);

  const key = `${format}/${file}`;
  if (!promises[key]) {
    promises[key] = fetchJson<T>(`${DATA_URL}/format-${format}/${file}`).then((data) => {
      (c[target] as T) = data;
      return data;
    });
  }
  return promises[key] as Promise<T>;
}

export function loadIndex(format: FormatId): Promise<Species[]> {
  return loadPromise<Species[]>(format, 'index.json', 'index');
}

export function loadLearnsets(format: FormatId): Promise<Record<string, string[]>> {
  return loadPromise<Record<string, string[]>>(format, 'learnsets.json', 'learnsets');
}

export function loadMoves(format: FormatId): Promise<Record<string, Move>> {
  return loadPromise<Record<string, Move>>(format, 'moves.json', 'moves');
}

export function loadItems(format: FormatId): Promise<Record<string, Item>> {
  return loadPromise<Record<string, Item>>(format, 'items.json', 'items');
}

export function loadMovesWithLearnsets(format: FormatId): Promise<Record<string, Move>> {
  return loadPromise<Record<string, Move>>(format, 'moves-with-learnsets.json', 'movesWithLearnsets');
}

export function getCachedIndex(format: FormatId): Species[] | undefined {
  return caches[format]?.index as Species[] | undefined;
}

export function getCachedLearnsets(format: FormatId): Record<string, string[]> | undefined {
  return caches[format]?.learnsets;
}

export function getCachedMoves(format: FormatId): Record<string, Move> | undefined {
  return caches[format]?.moves;
}

export function getCachedMovesWithLearnsets(format: FormatId): Record<string, Move> | undefined {
  return caches[format]?.movesWithLearnsets;
}

export function getCachedItems(format: FormatId): Record<string, Item> | undefined {
  return caches[format]?.items;
}

const DATA_URL = 'data';
const caches = { 'm-a': {}, 'm-b': {}, 'm-mega': {} };
const promises = {};
export function setFormat(id) {
    if (!caches[id])
        caches[id] = {};
}
async function fetchJson(path) {
    const res = await fetch(path);
    if (!res.ok)
        throw new Error(`Failed to fetch ${path}: ${res.status}`);
    return res.json();
}
function loadPromise(format, file, target) {
    const c = caches[format];
    const existing = c[target];
    if (existing)
        return Promise.resolve(existing);
    const key = `${format}/${file}`;
    if (!promises[key]) {
        promises[key] = fetchJson(`${DATA_URL}/format-${format}/${file}`).then((data) => {
            c[target] = data;
            return data;
        });
    }
    return promises[key];
}
export function loadIndex(format) {
    return loadPromise(format, 'index.json', 'index');
}
export function loadLearnsets(format) {
    return loadPromise(format, 'learnsets.json', 'learnsets');
}
export function loadMoves(format) {
    return loadPromise(format, 'moves.json', 'moves');
}
export function loadItems(format) {
    return loadPromise(format, 'items.json', 'items');
}
export function loadMovesWithLearnsets(format) {
    const c = caches[format];
    if (c.movesWithLearnsets)
        return Promise.resolve(c.movesWithLearnsets);
    const key = `${format}/moves-with-learnsets`;
    if (!promises[key]) {
        promises[key] = (async () => {
            const [moves, learnsetMap] = await Promise.all([
                loadMoves(format),
                fetchJson(`${DATA_URL}/format-${format}/moves-with-learnsets.json`),
            ]);
            const merged = {};
            for (const [mid, speciesList] of Object.entries(learnsetMap)) {
                const move = moves[mid];
                if (move)
                    merged[mid] = { ...move, learnedBy: speciesList };
            }
            c.movesWithLearnsets = merged;
            return merged;
        })();
    }
    return promises[key];
}
export function getCachedIndex(format) {
    return caches[format]?.index;
}
export function getCachedLearnsets(format) {
    return caches[format]?.learnsets;
}
export function getCachedMoves(format) {
    return caches[format]?.moves;
}
export function getCachedMovesWithLearnsets(format) {
    return caches[format]?.movesWithLearnsets;
}
export function loadAbilities(format) {
    return loadPromise(format, 'abilities.json', 'abilities');
}
export function getCachedAbilities(format) {
    return caches[format]?.abilities;
}
export function getCachedItems(format) {
    return caches[format]?.items;
}
//# sourceMappingURL=data-loader.js.map
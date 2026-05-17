const DATA_URL = 'data';
const caches = { 'm-a': {}, 'm-b': {} };
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
export function getCachedIndex(format) {
    return caches[format]?.index;
}
export function getCachedLearnsets(format) {
    return caches[format]?.learnsets;
}
export function getCachedMoves(format) {
    return caches[format]?.moves;
}
export function getCachedItems(format) {
    return caches[format]?.items;
}
//# sourceMappingURL=data-loader.js.map
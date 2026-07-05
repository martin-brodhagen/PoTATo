let state = {
  currentFormat: "m-b",
  teams: [],
  currentTeamId: null,
  allSpecies: [],
  spriteMap: {},
  shinySpriteMap: {},
  cachedItems: null,
};

export function getState() {
  return state;
}

export function setState(updates) {
  state = { ...state, ...updates };
}

export function getCurrentTeam() {
  return state.teams.find((t) => t.id === state.currentTeamId);
}

export function getSpeciesById(id) {
  return state.allSpecies.find((s) => s.id === id);
}

export function getTeamById(id) {
  return state.teams.find((t) => t.id === id);
}

export function isTeamLegal(team) {
  // De-dupe by base-species dex number so that Aegislash-Shield and
  // Aegislash-Blade (or Charizard + Mega-Y) count as the same pokemon.
  // The base is slot.speciesId; the forme lives in slot.formes[] and is
  // the same dex entry, so we just look at slot.speciesId.
  const nums = [];
  for (const slot of team.slots) {
    if (!slot.speciesId) continue;
    const species = getSpeciesById(slot.speciesId);
    if (!species) continue;
    if (nums.includes(species.num)) return false;
    nums.push(species.num);
  }
  // Most held items are limited to one per team. Two slots sharing the
  // same item id is illegal; empty item slots are fine.
  const items = new Set();
  for (const slot of team.slots) {
    if (!slot || !slot.item) continue;
    if (items.has(slot.item)) return false;
    items.add(slot.item);
  }
  return true;
}

export function getFormat() {
  return state.currentFormat;
}

export function getAllSpecies() {
  return state.allSpecies;
}

export function getSpriteMap() {
  return state.spriteMap;
}

export function getShinySpriteMap() {
  return state.shinySpriteMap;
}

export function getCachedItems() {
  return state.cachedItems;
}

export function getTeams() {
  return state.teams;
}

export function getCurrentTeamId() {
  return state.currentTeamId;
}

export function setCurrentTeamId(id) {
  state.currentTeamId = id;
}

export function setTeams(teams) {
  state.teams = teams;
}

export function addTeam(team) {
  state.teams.push(team);
}
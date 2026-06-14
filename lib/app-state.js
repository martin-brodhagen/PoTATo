let state = {
  currentFormat: "m-a",
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
  const nums = [];
  for (const slot of team.slots) {
    if (!slot.speciesId) continue;
    const species = getSpeciesById(slot.speciesId);
    if (!species) continue;
    if (nums.includes(species.num)) return false;
    nums.push(species.num);
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

export function addTeam(team) {
  state.teams.push(team);
}

export function persistTeams(saveFn) {
  saveFn(state.teams);
}
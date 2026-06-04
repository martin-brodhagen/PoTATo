const STORAGE_KEY = 'potato-teams';

export function createEmptySlots() {
  return [
    { speciesId: null },
    { speciesId: null },
    { speciesId: null },
    { speciesId: null },
    { speciesId: null },
    { speciesId: null },
  ];
}

export function createTeam(name, format) {
  return {
    id: crypto.randomUUID(),
    name,
    format,
    slots: createEmptySlots(),
  };
}

export function loadTeams() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveTeams(teams) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(teams));
}

export function removeTeam(teams, id) {
  return teams.filter(t => t.id !== id);
}
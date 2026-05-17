import type { Team, TeamSlot, FormatId } from './types.js';

const STORAGE_KEY = 'potato-teams';

export function createEmptySlots(): [TeamSlot, TeamSlot, TeamSlot, TeamSlot, TeamSlot, TeamSlot] {
  return [
    { speciesId: null },
    { speciesId: null },
    { speciesId: null },
    { speciesId: null },
    { speciesId: null },
    { speciesId: null },
  ];
}

export function createTeam(name: string, format: FormatId): Team {
  return {
    id: crypto.randomUUID(),
    name,
    format,
    slots: createEmptySlots(),
  };
}

export function loadTeams(): Team[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveTeams(teams: Team[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(teams));
}

export function removeTeam(teams: Team[], id: string): Team[] {
  return teams.filter(t => t.id !== id);
}

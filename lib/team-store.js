const teamsKey = (format) => `potato-teams-${format}`;
const lastTeamKey = (format) => `potato-last-team-${format}`;
const LEGACY_TEAMS_KEY = 'potato-teams';
const LEGACY_LAST_TEAM_KEY = 'potato-last-team';

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

export function loadTeams(format) {
  try {
    const raw = localStorage.getItem(teamsKey(format));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveTeams(format, teams) {
  localStorage.setItem(teamsKey(format), JSON.stringify(teams));
}

export function loadLastTeamId(format) {
  return localStorage.getItem(lastTeamKey(format));
}

export function saveLastTeamId(format, id) {
  localStorage.setItem(lastTeamKey(format), id);
}

export function removeTeam(teams, id) {
  return teams.filter(t => t.id !== id);
}

export function migrateFromLegacy() {
  const old = localStorage.getItem(LEGACY_TEAMS_KEY);
  if (!old) return;
  let teams;
  try {
    teams = JSON.parse(old);
  } catch {
    localStorage.removeItem(LEGACY_TEAMS_KEY);
    return;
  }
  if (!Array.isArray(teams)) {
    localStorage.removeItem(LEGACY_TEAMS_KEY);
    return;
  }
  const oldLast = localStorage.getItem(LEGACY_LAST_TEAM_KEY);
  const byFormat = {};
  for (const t of teams) {
    const fmt = t.format || 'm-a';
    (byFormat[fmt] = byFormat[fmt] || []).push(t);
  }
  for (const [fmt, ts] of Object.entries(byFormat)) {
    if (!localStorage.getItem(teamsKey(fmt))) {
      localStorage.setItem(teamsKey(fmt), JSON.stringify(ts));
    }
    if (oldLast) {
      const match = ts.find(t => t.id === oldLast);
      if (match && !localStorage.getItem(lastTeamKey(fmt))) {
        localStorage.setItem(lastTeamKey(fmt), oldLast);
      }
    }
  }
  localStorage.removeItem(LEGACY_TEAMS_KEY);
  localStorage.removeItem(LEGACY_LAST_TEAM_KEY);
}
const teamsKey = (format) => `potato-teams-${format}`;
const lastTeamKey = (format) => `potato-last-team-${format}`;
const LEGACY_TEAMS_KEY = 'potato-teams';
const LEGACY_LAST_TEAM_KEY = 'potato-last-team';

export const CURRENT_SCHEMA_VERSION = 2;

export function createEmptySlot() {
  return {
    speciesId: null,
    name: null,
    ability: null,
    nature: 'Serious',
    item: null,
    moves: [null, null, null, null],
    stats: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
    shiny: false,
    gender: null,
    formes: [],
    activeFormeIndex: 0,
    baseAbility: null,
  };
}

export function createEmptySlots() {
  return [
    createEmptySlot(),
    createEmptySlot(),
    createEmptySlot(),
    createEmptySlot(),
    createEmptySlot(),
    createEmptySlot(),
  ];
}

export function createTeam(name, format) {
  return {
    id: crypto.randomUUID(),
    name,
    format,
    schemaVersion: CURRENT_SCHEMA_VERSION,
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

// Look up the mega species id that a stone produces for a given base species.
// Returns null if the item isn't a mega stone or doesn't match the base.
function megaSpeciesIdForStone(item, baseSpecies) {
  if (!item?.megaStone || !baseSpecies) return null;
  const baseName = baseSpecies.baseSpecies || baseSpecies.name;
  const megaName = item.megaStone[baseName];
  if (!megaName) return null;
  return { megaName, baseName };
}

function emptyStats() {
  return { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
}

// Capture the snapshot for a forme: speciesId, ability, baseStats.
function snapshotForme(formeSpecies) {
  return {
    speciesId: formeSpecies.id,
    ability: formeSpecies.abilities?.[0] || null,
    baseStats: formeSpecies.baseStats ? { ...formeSpecies.baseStats } : emptyStats(),
  };
}

// Migrate a v1 team to v2 in place. V1 had no formes[] / activeFormeIndex.
// V1 mega-stone-equipped slots get a formes[] entry pointing at the right
// mega (looked up via item.megaStone[baseName]).
//
// V1 also stored the active forme directly in slot.speciesId (e.g.
// "charizardmegay"). We detect that and reset the primary to the base.
//
// `items` and `species` are the per-format dicts from data-loader.
// Returns true if any team was migrated.
export function migrateTeamsToV2(teams, items, species) {
  if (!Array.isArray(teams) || teams.length === 0) return false;
  const speciesById = new Map((species || []).map((s) => [s.id, s]));
  let migrated = false;

  for (const team of teams) {
    if (!team || !Array.isArray(team.slots)) continue;
    if (team.schemaVersion === CURRENT_SCHEMA_VERSION) continue;

    for (const slot of team.slots) {
      if (!slot) continue;

      if (!Array.isArray(slot.formes)) slot.formes = [];
      if (typeof slot.activeFormeIndex !== 'number') slot.activeFormeIndex = 0;
      if (!slot.stats || typeof slot.stats !== 'object') slot.stats = emptyStats();
      if (!Array.isArray(slot.moves) || slot.moves.length !== 4) {
        slot.moves = [null, null, null, null];
      }
      if (typeof slot.nature !== 'string') slot.nature = 'Serious';

      // Detect a v1 slot whose speciesId is itself a forme. The new
      // model keeps the base in slot.speciesId and moves the forme to
      // slot.formes[].
      let activeFormeSpecies = null;
      if (slot.speciesId) {
        const sp = speciesById.get(slot.speciesId);
        if (sp && sp.baseSpecies) {
          activeFormeSpecies = sp;
          const base = species.find((s) => s.name === sp.baseSpecies);
          if (base) slot.speciesId = base.id;
        }
      }

      // If the slot has a mega stone equipped, look up the matching
      // mega via item.megaStone[baseName]. The base is either the new
      // slot.speciesId (after the above reset) or the original.
      const baseForMega = slot.speciesId ? speciesById.get(slot.speciesId) : null;
      if (slot.item && items && baseForMega) {
        const item = items[slot.item];
        const match = megaSpeciesIdForStone(item, baseForMega);
        if (match) {
          const megaSpecies = species.find((s) => s.name === match.megaName);
          if (megaSpecies && !slot.formes.some((f) => f.speciesId === megaSpecies.id)) {
            slot.formes.push(snapshotForme(megaSpecies));
          }
        }
      }

      // If the original speciesId was already a forme (e.g. charizardmegay),
      // make sure it's in formes[] and is the active forme.
      if (activeFormeSpecies && !slot.formes.some((f) => f.speciesId === activeFormeSpecies.id)) {
        slot.formes.push(snapshotForme(activeFormeSpecies));
      }
      if (slot.formes.length > 0 && slot.activeFormeIndex === 0) {
        // If formes got populated but no active forme was set, point at
        // the last one (this is what the user was seeing in v1).
        slot.activeFormeIndex = slot.formes.length;
      }

      // Backfill baseAbility. If the slot is on a non-base forme, the
      // current slot.ability is the forme's ability, so we can't infer
      // the base ability from it — leave null and fall back to the
      // base's first ability on first cycle. If the slot is on the base
      // (or the picked species was the base), slot.ability is the base's
      // ability and we can use it.
      if (slot.baseAbility == null) {
        const baseSp = slot.speciesId ? speciesById.get(slot.speciesId) : null;
        if (baseSp) {
          if (slot.activeFormeIndex === 0 && slot.ability) {
            slot.baseAbility = slot.ability;
          } else {
            slot.baseAbility = baseSp.abilities?.[0] || null;
          }
        }
      }
    }

    team.schemaVersion = CURRENT_SCHEMA_VERSION;
    migrated = true;
  }

  return migrated;
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

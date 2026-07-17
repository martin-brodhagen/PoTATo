import {
  loadIndex,
  loadItems,
  loadAbilities,
  loadMovesWithLearnsets,
  loadSpriteMap,
  loadShinySpriteMap,
  setFormat,
  getAllCaches,
} from "./lib/data-loader.js";
import {
  createTeam,
  loadTeams,
  saveTeams,
  loadLastTeamId,
  saveLastTeamId,
  migrateFromLegacy,
  migrateTeamsToV2,
} from "./lib/team-store.js";
import { initApp, createPokedexSubtabWidgets } from "./lib/app-init.js";
import {
  setState,
  getCurrentTeam,
  getSpeciesById,
  isTeamLegal,
  getFormat,
  getAllSpecies,
  getSpriteMap,
  getShinySpriteMap,
  getTeams,
  getCurrentTeamId,
  getCachedItems,
  setCurrentTeamId,
  setTeams,
  addTeam,
} from "./lib/app-state.js";
import { applyI18n } from "./lib/i18n.js";

const formatSelect = document.getElementById("format-select");
const headerTeam = document.getElementById("header-team");
const searchDetailContent = document.getElementById("search-detail-content");
const breadcrumbBar = document.getElementById("breadcrumb-bar");

const widgets = {
  nav: null,
  headerView: null,
  breadcrumbView: null,
  searchDetailView: null,
  detailController: null,
  pokemonWidget: null,
  teamBuilderWidget: null,
  teamBrowserWidget: null,
  defensiveCoverageWidget: null,
  offensiveCoverageWidget: null,
  movesWidget: null,
  abilitiesWidget: null,
  itemsWidget: null,
};

const FORMATS = [
  { value: "m-b", label: "Regulation M-B" },
  { value: "m-a", label: "Regulation M-A" },
];

function persist() {
  saveTeams(getFormat(), getTeams());
}

async function loadFormatData(format) {
  setState({ currentFormat: format });
  setFormat(format);

  const [index, map, shinyMap, items] = await Promise.all([
    loadIndex(format),
    loadSpriteMap(format),
    loadShinySpriteMap(format),
    loadItems(format),
  ]);
  setState({
    cachedItems: items,
    allSpecies: index,
    spriteMap: map,
    shinySpriteMap: shinyMap,
  });
}

function loadTeamsForFormat(format) {
  const teams = loadTeams(format);
  if (migrateTeamsToV2(teams, getCachedItems(), getAllSpecies())) {
    saveTeams(format, teams);
  }
  setTeams(teams);

  const savedId = loadLastTeamId(format);
  const teamId = teams.find(t => t.id === savedId) ? savedId : (teams[0]?.id ?? null);
  setCurrentTeamId(teamId);
}

async function refreshWidgetsForFormatChange(data) {
  if (widgets.movesWidget) {
    widgets.movesWidget.destroy();
    widgets.movesWidget = null;
  }
  if (widgets.abilitiesWidget) {
    widgets.abilitiesWidget.destroy();
    widgets.abilitiesWidget = null;
  }
  if (widgets.itemsWidget) {
    widgets.itemsWidget.destroy();
    widgets.itemsWidget = null;
  }
  if (widgets.searchDetailView) {
    widgets.searchDetailView.destroy();
  }

  if (widgets.pokemonWidget) {
    widgets.pokemonWidget.clear();
    widgets.pokemonWidget.setData(getAllSpecies(), getSpriteMap());
  }

  createPokedexSubtabWidgets(widgets, getFormat(), getAllSpecies(), data);

  if (widgets.teamBuilderWidget) {
    widgets.teamBuilderWidget.setData(
      getAllSpecies(),
      getSpriteMap(),
      getShinySpriteMap(),
      getFormat(),
      getCachedItems(),
    );
  }

  if (widgets.teamBrowserWidget) {
    widgets.teamBrowserWidget.setData({
      items: getCachedItems(),
      moves: data?.moves,
      abilities: data?.abilities,
    });
  }

  if (widgets.defensiveCoverageWidget) {
    widgets.defensiveCoverageWidget.opts.species = getAllSpecies();
    widgets.defensiveCoverageWidget.opts.spriteMap = getSpriteMap();
    widgets.defensiveCoverageWidget.refresh();
  }

  if (widgets.offensiveCoverageWidget) {
    widgets.offensiveCoverageWidget.opts.species = getAllSpecies();
    widgets.offensiveCoverageWidget.opts.spriteMap = getSpriteMap();
    if (data?.moves) widgets.offensiveCoverageWidget.opts.moves = data.moves;
    widgets.offensiveCoverageWidget.refresh();
  }

  widgets.headerView?.renderTeamBar();
  widgets.headerView?.renderTeamLegality();
}

async function switchFormat(format) {
  const oldFormat = getFormat();
  if (oldFormat && oldFormat !== format) {
    saveTeams(oldFormat, getTeams());
    if (getCurrentTeamId()) saveLastTeamId(oldFormat, getCurrentTeamId());
  }
  await loadFormatData(format);
  loadTeamsForFormat(format);
  ensureInitialTeam(format);
  const [moves, abilities] = await Promise.all([
    loadMovesWithLearnsets(format),
    loadAbilities(format),
  ]);
  applyI18n(getAllCaches());
  await refreshWidgetsForFormatChange({ moves, abilities, items: getCachedItems() });
  window.dispatchEvent(new Event("potato-format-change"));
}

// Re-load the move/ability data for the current format (no format switch),
// re-apply i18n, and re-render the search/detail widgets so the DOM picks
// up the new localized names/descriptions.
async function reRenderForLanguageChange() {
  const format = getFormat();
  const [moves, abilities] = await Promise.all([
    loadMovesWithLearnsets(format),
    loadAbilities(format),
  ]);
  applyI18n(getAllCaches());
  await refreshWidgetsForFormatChange({ moves, abilities, items: getCachedItems() });
}

function ensureInitialTeam(format) {
  if (getTeams().length > 0) return;
  const team = createTeam("Team 1", format);
  saveTeams(format, [team]);
  saveLastTeamId(format, team.id);
  setTeams([team]);
  setCurrentTeamId(team.id);
}

formatSelect.addEventListener("change", () => {
  switchFormat(formatSelect.value);
});

// Language dropdown removed from the header (see index.html). The i18n
// module and bundles are kept on disk for re-enable later; applyI18n
// is still called below but is a no-op when there's no active language
// switcher to drive it.

migrateFromLegacy();

const initialFormat = "m-b";

(async function main() {
  try {
    await loadFormatData(initialFormat);
    loadTeamsForFormat(initialFormat);
    ensureInitialTeam(initialFormat);

    const [moves, abilities] = await Promise.all([
      loadMovesWithLearnsets(initialFormat),
      loadAbilities(initialFormat),
    ]);

    // Overlay localized names/descriptions onto the loaded data. Existing
    // widgets read `name` / `desc` from the in-memory cache, so this
    // post-process step is transparent to them.
    applyI18n(getAllCaches());

    initApp({
      dom: { headerTeam, searchDetailContent, breadcrumbBar },
      state: { getCurrentTeam, getTeams, getSpriteMap, getSpeciesById, isTeamLegal, getFormat, getAllSpecies, getShinySpriteMap, setCurrentTeamId, getCurrentTeamId, setTeams, addTeam, formats: FORMATS },
      data: { moves, abilities, items: getCachedItems() },
      callbacks: {
        onTeamChange: () => window.dispatchEvent(new Event("potato-team-change")),
        onAddToTeam: (speciesId) => {
          const team = getCurrentTeam();
          if (!team) return;
          const species = getSpeciesById(speciesId);
          if (!species) return;
          // If adding a forme and a slot already holds the matching base,
          // upgrade that slot (overwrite primary + set partner) per the
          // design. Otherwise pick the first empty slot. If all filled,
          // do nothing — never silently overwrite a user's pokemon.
          let targetIdx = -1;
          if (species.baseSpecies) {
            const baseName = species.baseSpecies;
            const base = getAllSpecies().find((s) => s.name === baseName);
            if (base) {
              targetIdx = team.slots.findIndex((slot) => slot.speciesId === base.id);
            }
          }
          if (targetIdx === -1) {
            targetIdx = team.slots.findIndex((slot) => slot.speciesId === null);
          }
          if (targetIdx === -1) return;
          widgets.teamBuilderWidget?.fillSlot(targetIdx, speciesId);
        },
        onRemoveFromTeam: (speciesId) => {
          const team = getCurrentTeam();
          if (!team) return;
          // Find the slot. The search detail passes whatever species the
          // user is currently viewing — could be the base or a forme.
          // "Remove from Team" clears the whole slot, regardless of
          // whether the user is viewing the base or a forme. Match by
          // primary OR any forme's id so the button works for both.
          const idx = team.slots.findIndex((slot) => {
            if (slot.speciesId === speciesId) return true;
            if (Array.isArray(slot.formes)) {
              return slot.formes.some((f) => f.speciesId === speciesId);
            }
            return false;
          });
          if (idx === -1) return;
          widgets.teamBuilderWidget?.clearSlot(idx);
          persist();
          widgets.headerView?.renderTeamBar();
          if (widgets.teamBuilderWidget) widgets.teamBuilderWidget.refresh();
        },
      },
      widgets,
    });
  } catch (err) {
    // Log to console; don't pollute the search-detail panel (which is
    // for Pokémon details, not debug output) with red stack-trace text.
    console.error("Fatal error during init:", err);
  }
})();

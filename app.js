import {
  loadIndex,
  loadItems,
  setFormat,
} from "./lib/data-loader.js";
import {
  createTeam,
  loadTeams,
  saveTeams,
  loadLastTeamId,
  saveLastTeamId,
  migrateFromLegacy,
} from "./lib/team-store.js";
import { initApp } from "./lib/app-init.js";
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

const formatSelect = document.getElementById("format-select");
const teamSelect = document.getElementById("team-select");
const newTeamBtn = document.getElementById("new-team-btn");
const teamWarning = document.getElementById("team-warning");
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
  defensiveCoverageWidget: null,
  moveCoverageWidget: null,
  movesWidget: null,
  abilitiesWidget: null,
  itemsWidget: null,
};

function persist() {
  saveTeams(getFormat(), getTeams());
}

async function loadFormatData(format) {
  setState({ currentFormat: format });
  setFormat(format);

  const [index, map, shinyMap, items] = await Promise.all([
    loadIndex(format),
    fetch(`data/format-${format}/sprite-map.json`).then((r) => r.json()),
    fetch(`data/format-${format}/shiny-sprite-map.json`).then((r) => r.json()),
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
  setTeams(teams);

  const savedId = loadLastTeamId(format);
  const teamId = teams.find(t => t.id === savedId) ? savedId : (teams[0]?.id ?? null);
  setCurrentTeamId(teamId);
}

function refreshWidgetsForFormatChange() {
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

  if (widgets.teamBuilderWidget) {
    widgets.teamBuilderWidget.setData(
      getAllSpecies(),
      getSpriteMap(),
      getShinySpriteMap(),
      getFormat(),
      getCachedItems(),
    );
  }

  widgets.headerView?.renderTeamSelect();
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
  refreshWidgetsForFormatChange();
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

migrateFromLegacy();

const initialFormat = "m-b";

(async function main() {
  await loadFormatData(initialFormat);
  loadTeamsForFormat(initialFormat);
  ensureInitialTeam(initialFormat);

  teamWarning.title = "duplicate species - Team not legal for this regulation";

  initApp({
    dom: { headerTeam, searchDetailContent, breadcrumbBar, teamSelect, teamWarning },
    state: { getCurrentTeam, getTeams, getSpriteMap, getSpeciesById, isTeamLegal, getFormat, getAllSpecies, getShinySpriteMap, setCurrentTeamId, addTeam },
    callbacks: {
      onTeamChange: () => window.dispatchEvent(new Event("potato-team-change")),
      onAddToTeam: (speciesId) => {
        const team = getCurrentTeam();
        if (!team) return;
        const emptyIdx = team.slots.findIndex((slot) => slot.speciesId === null);
        if (emptyIdx === -1) return;
        widgets.teamBuilderWidget?.fillSlot(emptyIdx, speciesId);
      },
      onRemoveFromTeam: (speciesId) => {
        const team = getCurrentTeam();
        if (!team) return;
        const idx = team.slots.findIndex((slot) => slot.speciesId === speciesId);
        if (idx !== -1) {
          team.slots[idx].speciesId = null;
          team.slots[idx].item = null;
          persist();
          widgets.headerView?.renderTeamBar();
          if (widgets.teamBuilderWidget) widgets.teamBuilderWidget.refresh();
        }
      },
    },
    widgets,
  });
})();
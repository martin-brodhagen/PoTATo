import {
  loadIndex,
  loadItems,
  setFormat,
} from "./lib/data-loader.js";
import { createTeam, loadTeams, saveTeams } from "./lib/team-store.js";
import { initApp } from "./lib/app-init.js";
import {
  getState,
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
  setCurrentTeamId,
  addTeam,
  persistTeams as persistTeamsToState,
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
  persistTeamsToState(saveTeams);
}

async function loadFormat(format) {
  setState({ currentFormat: format });
  setFormat(format);
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

  if (widgets.pokemonWidget) {
    widgets.pokemonWidget.clear();
    widgets.pokemonWidget.setData(index, map);
  }

  if (widgets.teamBuilderWidget) {
    widgets.teamBuilderWidget.setData(
      index,
      map,
      getShinySpriteMap(),
      getFormat(),
      items,
    );
  }

  widgets.headerView?.renderTeamBar();
}

formatSelect.addEventListener("change", () => {
  loadFormat(formatSelect.value);
});

setState({ teams: loadTeams() });

if (getTeams().length === 0) {
  const t = createTeam("Team 1", getFormat());
  addTeam(t);
  persist();
}

teamWarning.title = "duplicate species - Team not legal for regulation M-A";

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

loadFormat("m-a");
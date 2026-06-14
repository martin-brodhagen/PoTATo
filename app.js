import {
  loadAbilities,
  loadIndex,
  loadItems,
  loadMovesWithLearnsets,
  setFormat,
} from "./lib/data-loader.js";
import { createTeam, loadTeams, saveTeams } from "./lib/team-store.js";
import { DefensiveCoverageWidget } from "./lib/defensive-coverage-widget.js";
import { MoveTypeCoverageWidget } from "./lib/move-type-coverage-widget.js";
import { TeamBuilderWidget } from "./lib/team-builder-widget.js";
import { PokemonSearchWidget } from "./lib/pokemon-search-widget.js";
import { initApp } from "./lib/app-init.js";
import { createDetailController } from "./lib/detail-controller.js";
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

function ensureTeamBuilder() {
  if (widgets.teamBuilderWidget) return;
  const container = document.getElementById("tab-content-team-builder");
  widgets.teamBuilderWidget = new TeamBuilderWidget({
    container,
    species: getAllSpecies(),
    spriteMap: getSpriteMap(),
    shinySpriteMap: getShinySpriteMap(),
    formatId: getFormat(),
    getTeam: getCurrentTeam,
    onSlotChange: () => {
      persist();
      widgets.headerView?.renderTeamWarning();
      widgets.headerView?.renderTeamBar();
      widgets.defensiveCoverageWidget?.refresh();
      window.dispatchEvent(new Event("potato-team-change"));
    },
    onPokemonClick: (species) => widgets.detailController?.showPokemonDetail(species),
  });
}

function ensureDefensiveCoverage() {
  if (widgets.defensiveCoverageWidget) return;
  widgets.defensiveCoverageWidget = new DefensiveCoverageWidget({
    container: document.getElementById("tab-content-defensive-coverage"),
    species: getAllSpecies(),
    spriteMap: getSpriteMap(),
    getTeam: getCurrentTeam,
    onKeywordClick: (type, id) => {
      if (type === "ability") {
        loadAbilities(getFormat()).then((allAbilities) => {
          const ability = allAbilities[id];
          if (ability) widgets.detailController?.showAbilityDetail(id, ability);
        });
      } else if (type === "move") {
        loadMovesWithLearnsets(getFormat()).then((allMoves) => {
          const move = allMoves[id];
          if (move) widgets.detailController?.showMoveDetail(id, move, true);
        });
      }
    },
  });
}

function ensureMoveCoverage() {
  if (widgets.moveCoverageWidget) return;
  widgets.moveCoverageWidget = new MoveTypeCoverageWidget({
    container: document.getElementById("tab-content-move-coverage"),
    species: getAllSpecies(),
    spriteMap: getSpriteMap(),
    getTeam: getCurrentTeam,
  });
}

formatSelect.addEventListener("change", () => {
  loadFormat(formatSelect.value);
});

const pokemonDataPromise = (async () => {
  const [index, map] = await Promise.all([
    loadIndex("m-a"),
    fetch("data/format-m-a/sprite-map.json").then((r) => r.json()),
  ]);
  setState({ allSpecies: index, spriteMap: map });
  return { index, map };
})();

const pokemonContainer = document.getElementById("subtab-content-pokemon");
widgets.pokemonWidget = new PokemonSearchWidget({
  container: pokemonContainer,
  formatId: getFormat(),
  onPokemonClick: (speciesId, species) => {
    widgets.breadcrumbView?.reset({ type: "pokemon", id: speciesId, name: species.name });
    widgets.detailController?.showPokemonDetail(species);
  },
});

pokemonDataPromise.then(({ index, map }) => {
  widgets.pokemonWidget.setData(index, map);
  ensureTeamBuilder();
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
    onMoveCoverageActivate: () => ensureMoveCoverage(),
    onDefensiveCoverageActivate: () => ensureDefensiveCoverage(),
  },
  widgets,
});

loadFormat("m-a");
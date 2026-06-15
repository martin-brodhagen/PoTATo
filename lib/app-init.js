import { BreadcrumbView } from "./views/breadcrumb-view.js";
import { HeaderView } from "./views/header-view.js";
import { SearchDetailView } from "./views/search-detail-view.js";
import { NavigationController } from "./navigation-controller.js";
import { createDetailController } from "./detail-controller.js";
import { createTeam, saveTeams } from "./team-store.js";
import { loadIndex, loadAbilities, loadMovesWithLearnsets } from "./data-loader.js";
import { setState } from "./app-state.js";
import { MoveSearchWidget } from "./move-search-widget.js";
import { AbilitySearchWidget } from "./ability-search-widget.js";
import { ItemSearchWidget } from "./item-search-widget.js";
import { PokemonSearchWidget } from "./pokemon-search-widget.js";
import { TeamBuilderWidget } from "./team-builder-widget.js";
import { DefensiveCoverageWidget } from "./defensive-coverage-widget.js";
import { MoveTypeCoverageWidget } from "./move-type-coverage-widget.js";

export function initApp({ dom, state, callbacks, widgets }) {
  const { headerTeam, searchDetailContent, breadcrumbBar, teamSelect, teamWarning } = dom;
  const {
    getCurrentTeam,
    getTeams,
    getSpriteMap,
    getSpeciesById,
    isTeamLegal,
    getFormat,
    getAllSpecies,
    getShinySpriteMap,
    setCurrentTeamId,
    addTeam,
  } = state;
  const { onTeamChange, onAddToTeam, onRemoveFromTeam } = callbacks;

  function persistTeams() {
    saveTeams(getTeams());
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
        persistTeams();
        widgets.headerView?.renderTeamWarning();
        widgets.headerView?.renderTeamBar();
        widgets.defensiveCoverageWidget?.refresh();
        window.dispatchEvent(new Event("potato-team-change"));
      },
      onPokemonClick: (species) => widgets.detailController?.showPokemonDetail(species, true),
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

  widgets.nav = new NavigationController({
    onActivate: {
      'defensive-coverage': () => {
        ensureDefensiveCoverage();
        widgets.defensiveCoverageWidget?.refresh();
      },
      'move-coverage': () => {
        ensureMoveCoverage();
      },
    },
  });

  widgets.headerView = new HeaderView({
    container: document.getElementById("header-team"),
    headerTeam,
    teamSelect,
    newTeamBtn: document.getElementById("new-team-btn"),
    teamWarning,
    getTeam: getCurrentTeam,
    getTeams,
    getSpriteMap,
    getSpeciesById,
    isTeamLegal,
    getCurrentFormat: getFormat,
    onSelectTeam: (id) => {
      setCurrentTeamId(id);
      localStorage.setItem("potato-last-team", id);
      if (widgets.pokemonWidget) widgets.pokemonWidget.clear();
      widgets.headerView?.renderTeamWarning();
      widgets.headerView?.renderTeamBar();
      if (widgets.teamBuilderWidget) widgets.teamBuilderWidget.refresh();
      widgets.defensiveCoverageWidget?.refresh();
      onTeamChange?.();
    },
    onNewTeam: () => {
      const count = getTeams().filter((t) => t.format === getFormat()).length + 1;
      const team = createTeam(`Team ${count}`, getFormat());
      addTeam(team);
      persistTeams();
      widgets.headerView?.renderTeamSelect();
      setCurrentTeamId(team.id);
      localStorage.setItem("potato-last-team", team.id);
      widgets.headerView?.renderTeamWarning();
      widgets.headerView?.renderTeamBar();
      onTeamChange?.();
    },
    onNavigateToBuilder: () => {
      widgets.nav?.navigate("team-builder");
    },
  });

  widgets.headerView.renderTeamSelect();

  widgets.breadcrumbView = new BreadcrumbView({
    container: breadcrumbBar,
    onNavigate: (item) => {
      if (item.type === "pokemon") {
        const species = getSpeciesById(item.id);
        if (species) widgets.detailController?.showPokemonDetail(species);
      } else if (item.type === "move") {
        loadMovesWithLearnsets(getFormat()).then((allMoves) => {
          const move = allMoves[item.id];
          if (move) widgets.detailController?.showMoveDetail(item.id, move);
        });
      } else if (item.type === "ability") {
        loadAbilities(getFormat()).then((allAbilities) => {
          const ability = allAbilities[item.id];
          if (ability) widgets.detailController?.showAbilityDetail(item.id, ability);
        });
      }
    },
  });

  widgets.searchDetailView = new SearchDetailView({
    container: searchDetailContent,
    getTeam: getCurrentTeam,
    getAllSpecies,
    getSpriteMap,
    getShinySpriteMap,
    getFormat,
    onAddToTeam,
    onRemoveFromTeam,
    loadAbilitiesModule: { loadAbilities },
    detailController: null,
  });

  widgets.detailController = createDetailController({
    breadcrumbView: widgets.breadcrumbView,
    nav: widgets.nav,
    searchDetailView: widgets.searchDetailView,
  });

  widgets.searchDetailView.opts.detailController = widgets.detailController;

  const pokemonContainer = document.getElementById("subtab-content-pokemon");
  widgets.pokemonWidget = new PokemonSearchWidget({
    container: pokemonContainer,
    formatId: getFormat(),
    onPokemonClick: (speciesId, species) => {
      widgets.breadcrumbView?.reset({ type: "pokemon", id: speciesId, name: species.name });
      widgets.detailController?.showPokemonDetail(species);
    },
  });

  (async () => {
    const [index, map] = await Promise.all([
      loadIndex("m-a"),
      fetch("data/format-m-a/sprite-map.json").then((r) => r.json()),
    ]);
    setState({ allSpecies: index, spriteMap: map });
    widgets.pokemonWidget.setData(index, map);
    ensureTeamBuilder();
  })();

  const lastTeamId = localStorage.getItem("potato-last-team");
  const initialTeam = getTeams().find((t) => t.id === lastTeamId) || getTeams()[0];
  setCurrentTeamId(initialTeam.id);
  teamSelect.value = initialTeam.id;
  widgets.headerView?.renderTeamBar();
  widgets.headerView?.renderTeamWarning();
  onTeamChange?.();

  document.querySelector('[data-subtab="moves"]')?.addEventListener("click", () => {
    if (!widgets.movesWidget) {
      const container = document.getElementById("subtab-content-moves");
      const speciesNames = {};
      for (const s of getAllSpecies()) speciesNames[s.id] = s.name;
      widgets.movesWidget = new MoveSearchWidget({
        container,
        formatId: getFormat(),
        speciesNames,
        onMoveClick: (moveId, move) => {
          widgets.detailController?.showMoveDetail(moveId, move, true);
        },
      });
    }
  });

  document.querySelector('[data-subtab="abilities"]')?.addEventListener("click", () => {
    if (!widgets.abilitiesWidget) {
      const container = document.getElementById("subtab-content-abilities");
      widgets.abilitiesWidget = new AbilitySearchWidget({
        container,
        formatId: getFormat(),
        onAbilityClick: (abilityId, ability) => {
          widgets.breadcrumbView?.reset({ type: "ability", id: abilityId, name: ability.name });
          widgets.detailController?.showAbilityDetail(abilityId, ability);
        },
      });
    }
  });

  document.querySelector('[data-subtab="items"]')?.addEventListener("click", () => {
    if (!widgets.itemsWidget) {
      const container = document.getElementById("subtab-content-items");
      widgets.itemsWidget = new ItemSearchWidget({
        container,
        formatId: getFormat(),
        onItemClick: (id, item) => widgets.detailController?.showItemDetail(id, item),
      });
    }
  });
}
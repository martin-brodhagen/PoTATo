import { BreadcrumbView } from "./views/breadcrumb-view.js";
import { HeaderView } from "./views/header-view.js";
import { SearchDetailView } from "./views/search-detail-view.js";
import { NavigationController } from "./navigation-controller.js";
import { createDetailController } from "./detail-controller.js";
import { createTeam, saveTeams, saveLastTeamId } from "./team-store.js";
import { loadAbilities, loadMovesWithLearnsets } from "./data-loader.js";
import { MoveSearchWidget } from "./move-search-widget.js";
import { AbilitySearchWidget } from "./ability-search-widget.js";
import { ItemSearchWidget } from "./item-search-widget.js";
import { PokemonSearchWidget } from "./pokemon-search-widget.js";
import { TeamBuilderWidget } from "./team-builder-widget.js";
import { DefensiveCoverageWidget } from "./defensive-coverage-widget.js";
import { OffensiveCoverageWidget } from "./offensive-coverage-widget.js";

export function initApp({ dom, state, callbacks, widgets, data }) {
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
  const { moves, abilities, items } = data || {};

  function persistTeams() {
    saveTeams(getFormat(), getTeams());
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
        widgets.offensiveCoverageWidget?.refresh();
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

  function ensureOffensiveCoverage() {
    if (widgets.offensiveCoverageWidget) return;
    widgets.offensiveCoverageWidget = new OffensiveCoverageWidget({
      container: document.getElementById("tab-content-offensive-coverage"),
      species: getAllSpecies(),
      spriteMap: getSpriteMap(),
      getTeam: getCurrentTeam,
      moves: (data || {}).moves,
      onPokemonClick: (species) => widgets.detailController?.showPokemonDetail(species, true),
    });
  }

  widgets.nav = new NavigationController({
    onActivate: {
      'defensive-coverage': () => {
        ensureDefensiveCoverage();
        widgets.defensiveCoverageWidget?.refresh();
      },
      'offensive-coverage': () => {
        ensureOffensiveCoverage();
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
      saveLastTeamId(getFormat(), id);
      if (widgets.pokemonWidget) widgets.pokemonWidget.clear();
      widgets.headerView?.renderTeamWarning();
      widgets.headerView?.renderTeamBar();
      if (widgets.teamBuilderWidget) widgets.teamBuilderWidget.refresh();
      widgets.defensiveCoverageWidget?.refresh();
      widgets.offensiveCoverageWidget?.refresh();
      onTeamChange?.();
    },
    onNewTeam: () => {
      const count = getTeams().length + 1;
      const team = createTeam(`Team ${count}`, getFormat());
      addTeam(team);
      persistTeams();
      setCurrentTeamId(team.id);
      saveLastTeamId(getFormat(), team.id);
      widgets.headerView?.renderTeamSelect();
      widgets.headerView?.renderTeamWarning();
      widgets.headerView?.renderTeamBar();
      widgets.offensiveCoverageWidget?.refresh();
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
    species: getAllSpecies(),
    spriteMap: getSpriteMap(),
    onPokemonClick: (speciesId, species) => {
      widgets.breadcrumbView?.reset({ type: "pokemon", id: speciesId, name: species.name });
      widgets.detailController?.showPokemonDetail(species);
    },
  });

  createPokedexSubtabWidgets(widgets, getFormat(), getAllSpecies(), { moves, abilities, items });

  ensureTeamBuilder();

  const lastTeamId = getCurrentTeamId();
  const initialTeam = getTeams().find((t) => t.id === lastTeamId) || getTeams()[0];
  if (initialTeam) {
    setCurrentTeamId(initialTeam.id);
    teamSelect.value = initialTeam.id;
  }
  widgets.headerView?.renderTeamBar();
  widgets.headerView?.renderTeamWarning();
  onTeamChange?.();
}

export function createPokedexSubtabWidgets(widgets, formatId, allSpecies, data = {}) {
  const speciesNames = {};
  for (const s of allSpecies) speciesNames[s.id] = s.name;

  widgets.movesWidget = new MoveSearchWidget({
    container: document.getElementById("subtab-content-moves"),
    formatId,
    speciesNames,
    moves: data.moves,
    onMoveClick: (moveId, move) => {
      widgets.detailController?.showMoveDetail(moveId, move, true);
    },
  });

  widgets.abilitiesWidget = new AbilitySearchWidget({
    container: document.getElementById("subtab-content-abilities"),
    formatId,
    abilities: data.abilities,
    onAbilityClick: (abilityId, ability) => {
      widgets.breadcrumbView?.reset({ type: "ability", id: abilityId, name: ability.name });
      widgets.detailController?.showAbilityDetail(abilityId, ability);
    },
  });

  widgets.itemsWidget = new ItemSearchWidget({
    container: document.getElementById("subtab-content-items"),
    formatId,
    items: data.items,
    onItemClick: (id, item) => widgets.detailController?.showItemDetail(id, item),
  });
}

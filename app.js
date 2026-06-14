import {
  EFFECT_CATEGORIES,
  MOVE_CLASSIFICATIONS,
  RANGE_CATEGORIES,
  ABILITY_EFFECT_CATEGORIES,
} from "./lib/types.js";
import {
  loadAbilities,
  loadIndex,
  loadItems,
  loadMovesWithLearnsets,
  setFormat,
} from "./lib/data-loader.js";
import { createTeam, loadTeams, saveTeams } from "./lib/team-store.js";
import { MoveSearchWidget } from "./lib/move-search-widget.js";
import { PokemonSearchWidget } from "./lib/pokemon-search-widget.js";
import { AbilitySearchWidget } from "./lib/ability-search-widget.js";
import { ItemSearchWidget } from "./lib/item-search-widget.js";
import { DefensiveCoverageWidget } from "./lib/defensive-coverage-widget.js";
import { MoveTypeCoverageWidget } from "./lib/move-type-coverage-widget.js";
import { TeamBuilderWidget } from "./lib/team-builder-widget.js";
import { BreadcrumbView } from "./lib/views/breadcrumb-view.js";
import { HeaderView } from "./lib/views/header-view.js";
import { SearchDetailView } from "./lib/views/search-detail-view.js";
import { NavigationController } from "./lib/navigation-controller.js";

const formatSelect = document.getElementById("format-select");
const teamSelect = document.getElementById("team-select");
const newTeamBtn = document.getElementById("new-team-btn");
const teamWarning = document.getElementById("team-warning");
const headerTeam = document.getElementById("header-team");
const searchDetailContent = document.getElementById("search-detail-content");
const breadcrumbBar = document.getElementById("breadcrumb-bar");

let currentFormat = "m-a";
let teams = [];
let currentTeamId = null;
let allSpecies = [];
let spriteMap = {};
let shinySpriteMap = {};
let pendingSlotIndex = null;
let cachedItems = null;

let movesWidget = null;
let pokemonWidget = null;
let abilitiesWidget = null;
let itemsWidget = null;
let teamBuilderWidget = null;
let searchDetailView = null;

let breadcrumbView = null;
let headerView = null;

function isTeamLegal(team) {
  const nums = [];
  for (const slot of team.slots) {
    if (!slot.speciesId) continue;
    const species = getSpeciesById(slot.speciesId);
    if (!species) continue;
    if (nums.includes(species.num)) return false;
    nums.push(species.num);
  }
  return true;
}

function getCurrentTeam() {
  return teams.find((t) => t.id === currentTeamId);
}

function getSpeciesById(id) {
  return allSpecies.find((s) => s.id === id);
}

function persist() {
  saveTeams(teams);
}

async function loadFormat(format) {
  currentFormat = format;
  setFormat(format);
  if (movesWidget) {
    movesWidget.destroy();
    movesWidget = null;
  }
  if (abilitiesWidget) {
    abilitiesWidget.destroy();
    abilitiesWidget = null;
  }
  if (itemsWidget) {
    itemsWidget.destroy();
    itemsWidget = null;
  }
  if (searchDetailView) {
    searchDetailView.destroy();
  }
  pendingSlotIndex = null;

  const [index, map, shinyMap, items] = await Promise.all([
    loadIndex(format),
    fetch(`data/format-${format}/sprite-map.json`).then((r) => r.json()),
    fetch(`data/format-${format}/shiny-sprite-map.json`).then((r) => r.json()),
    loadItems(format),
  ]);
  cachedItems = items;
  allSpecies = index;
  spriteMap = map;
  shinySpriteMap = shinyMap;

  if (pokemonWidget) {
    pokemonWidget.clear();
    pokemonWidget.setData(index, map);
  }

  if (teamBuilderWidget) {
    teamBuilderWidget.setData(
      index,
      map,
      shinySpriteMap,
      currentFormat,
      items,
    );
  }

  headerView?.renderTeamBar();
}

function fillSlot(slotIndex, speciesId, item) {
  const team = getCurrentTeam();
  if (!team) return;

  const species = getSpeciesById(speciesId);
  let finalSpeciesId = speciesId;
  let finalItem = item !== undefined ? item : null;

  if (species?.requiredItem && species.baseSpecies && !finalItem && cachedItems) {
    const baseName = species.baseSpecies;
    for (const [itemId, itemRec] of Object.entries(cachedItems)) {
      if (itemRec.megaStone && itemRec.megaStone[baseName] === species.name) {
        finalItem = itemId;
        const base = allSpecies.find((sp) => sp.name === baseName);
        if (base) finalSpeciesId = base.id;
        break;
      }
    }
  }

  team.slots[slotIndex].speciesId = finalSpeciesId;
  team.slots[slotIndex].name = getSpeciesById(finalSpeciesId)?.name || null;
  team.slots[slotIndex].ability = "0";
  team.slots[slotIndex].nature = "Serious";
  team.slots[slotIndex].moves = [null, null, null, null];
  team.slots[slotIndex].stats = {
    hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0,
  };
  team.slots[slotIndex].item = finalItem;
  persist();
  headerView?.renderTeamWarning();
  headerView?.renderTeamBar();
  if (teamBuilderWidget) teamBuilderWidget.refresh();
}

let nav = null;

function showDetail(s) {
  breadcrumbView?.push({ type: "pokemon", id: s.id, name: s.name });
  nav?.navigate("search-detail");
  searchDetailView?.showPokemonDetail(s);
}

function showMoveDetail(moveId, move, resetTrail = false) {
  if (resetTrail) {
    breadcrumbView?.reset({ type: "move", id: moveId, name: move.name });
  } else {
    breadcrumbView?.push({ type: "move", id: moveId, name: move.name });
  }
  nav?.navigate("search-detail");
  searchDetailView?.showMoveDetail(moveId, move, resetTrail);
}

function showAbilityDetail(abilityId, ability) {
  breadcrumbView?.push({ type: "ability", id: abilityId, name: ability.name });
  nav?.navigate("search-detail");
  searchDetailView?.showAbilityDetail(abilityId, ability);
}

function showItemDetail(itemId, item) {
  breadcrumbView?.reset({ type: "item", id: itemId, name: item.name });
  nav?.navigate("search-detail");
  searchDetailView?.showItemDetail(itemId, item);
}

let defensiveCoverageWidget = null;
let moveCoverageWidget = null;

function ensureTeamBuilder() {
  if (teamBuilderWidget) return;
  const container = document.getElementById("tab-content-team-builder");
  teamBuilderWidget = new TeamBuilderWidget({
    container,
    species: allSpecies,
    spriteMap,
    shinySpriteMap,
    formatId: currentFormat,
    getTeam: getCurrentTeam,
    onSlotChange: () => {
      persist();
      headerView?.renderTeamWarning();
      headerView?.renderTeamBar();
      defensiveCoverageWidget?.refresh();
      window.dispatchEvent(new Event("potato-team-change"));
    },
    onPokemonClick: (species) => showDetail(species),
  });
}

function ensureDefensiveCoverage() {
  if (defensiveCoverageWidget) return;
  defensiveCoverageWidget = new DefensiveCoverageWidget({
    container: document.getElementById("tab-content-defensive-coverage"),
    species: allSpecies,
    spriteMap,
    getTeam: getCurrentTeam,
    onKeywordClick: (type, id) => {
      if (type === "ability") {
        loadAbilities(currentFormat).then((allAbilities) => {
          const ability = allAbilities[id];
          if (ability) showAbilityDetail(id, ability);
        });
      } else if (type === "move") {
        loadMovesWithLearnsets(currentFormat).then((allMoves) => {
          const move = allMoves[id];
          if (move) showMoveDetail(id, move, true);
        });
      }
    },
  });
}

function ensureMoveCoverage() {
  if (moveCoverageWidget) return;
  moveCoverageWidget = new MoveTypeCoverageWidget({
    container: document.getElementById("tab-content-move-coverage"),
    species: allSpecies,
    spriteMap,
    getTeam: getCurrentTeam,
  });
}

formatSelect.addEventListener("change", () => {
  loadFormat(formatSelect.value);
});

document.querySelector('[data-subtab="moves"]')?.addEventListener("click", () => {
  if (!movesWidget) {
    const container = document.getElementById("subtab-content-moves");
    const speciesNames = {};
    for (const s of allSpecies) speciesNames[s.id] = s.name;
    movesWidget = new MoveSearchWidget({
      container,
      formatId: currentFormat,
      speciesNames,
      onMoveClick: (moveId, move) => {
        showMoveDetail(moveId, move, true);
      },
    });
  }
});

document.querySelector('[data-subtab="abilities"]')?.addEventListener("click", () => {
  if (!abilitiesWidget) {
    const container = document.getElementById("subtab-content-abilities");
    abilitiesWidget = new AbilitySearchWidget({
      container,
      formatId: currentFormat,
      onAbilityClick: (abilityId, ability) => {
        breadcrumbView?.reset({ type: "ability", id: abilityId, name: ability.name });
        showAbilityDetail(abilityId, ability);
      },
    });
  }
});

document.querySelector('[data-subtab="items"]')?.addEventListener("click", () => {
  if (!itemsWidget) {
    const container = document.getElementById("subtab-content-items");
    itemsWidget = new ItemSearchWidget({
      container,
      formatId: currentFormat,
      onItemClick: (id, item) => showItemDetail(id, item),
    });
  }
});

const pokemonDataPromise = (async () => {
  const [index, map] = await Promise.all([
    loadIndex("m-a"),
    fetch("data/format-m-a/sprite-map.json").then((r) => r.json()),
  ]);
  allSpecies = index;
  spriteMap = map;
  return { index, map };
})();

const pokemonContainer = document.getElementById("subtab-content-pokemon");
pokemonWidget = new PokemonSearchWidget({
  container: pokemonContainer,
  formatId: currentFormat,
  onPokemonClick: (speciesId, species) => {
    if (pendingSlotIndex !== null) {
      fillSlot(pendingSlotIndex, speciesId);
    } else {
      breadcrumbView?.reset({ type: "pokemon", id: speciesId, name: species.name });
      showDetail(species);
    }
  },
});

pokemonDataPromise.then(({ index, map }) => {
  pokemonWidget.setData(index, map);
  ensureTeamBuilder();
});

teams = loadTeams();

if (teams.length === 0) {
  const t = createTeam("Team 1", currentFormat);
  teams.push(t);
  persist();
}

teamWarning.title = "duplicate species - Team not legal for regulation M-A";

nav = new NavigationController({
  onActivate: {
    'defensive-coverage': () => {
      ensureDefensiveCoverage();
      defensiveCoverageWidget?.refresh();
    },
    'move-coverage': () => {
      ensureMoveCoverage();
    },
  },
});

headerView = new HeaderView({
  container: document.getElementById("header-team"),
  headerTeam,
  teamSelect,
  newTeamBtn,
  teamWarning,
  getTeam: () => getCurrentTeam(),
  getTeams: () => teams,
  getSpriteMap: () => spriteMap,
  getSpeciesById,
  isTeamLegal,
  getCurrentFormat: () => currentFormat,
  onSelectTeam: (id) => {
    currentTeamId = id;
    localStorage.setItem("potato-last-team", id);
    if (pokemonWidget) pokemonWidget.clear();
    headerView?.renderTeamWarning();
    headerView?.renderTeamBar();
    if (teamBuilderWidget) teamBuilderWidget.refresh();
    defensiveCoverageWidget?.refresh();
    window.dispatchEvent(new Event("potato-team-change"));
  },
  onNewTeam: () => {
    const count = teams.filter((t) => t.format === currentFormat).length + 1;
    const team = createTeam(`Team ${count}`, currentFormat);
    teams.push(team);
    persist();
    headerView?.renderTeamSelect();
    currentTeamId = team.id;
    localStorage.setItem("potato-last-team", team.id);
    headerView?.renderTeamWarning();
    headerView?.renderTeamBar();
    window.dispatchEvent(new Event("potato-team-change"));
  },
  onNavigateToBuilder: () => {
    nav?.navigate("team-builder");
  },
});

headerView.renderTeamSelect();

breadcrumbView = new BreadcrumbView({
  container: breadcrumbBar,
  onNavigate: (item) => {
    if (item.type === "pokemon") {
      const species = getSpeciesById(item.id);
      if (species) showDetail(species);
    } else if (item.type === "move") {
      loadMovesWithLearnsets(currentFormat).then((allMoves) => {
        const move = allMoves[item.id];
        if (move) showMoveDetail(item.id, move);
      });
    } else if (item.type === "ability") {
      loadAbilities(currentFormat).then((allAbilities) => {
        const ability = allAbilities[item.id];
        if (ability) showAbilityDetail(item.id, ability);
      });
    }
  },
});

searchDetailView = new SearchDetailView({
  container: searchDetailContent,
  getTeam: () => getCurrentTeam(),
  getAllSpecies: () => allSpecies,
  getSpriteMap: () => spriteMap,
  getShinySpriteMap: () => shinySpriteMap,
  getFormat: () => currentFormat,
  onAddToTeam: (speciesId) => {
    const team = getCurrentTeam();
    if (!team) return;
    const emptyIdx = team.slots.findIndex((slot) => slot.speciesId === null);
    if (emptyIdx === -1) return;
    fillSlot(emptyIdx, speciesId);
  },
  onRemoveFromTeam: (speciesId) => {
    const team = getCurrentTeam();
    if (!team) return;
    const idx = team.slots.findIndex((slot) => slot.speciesId === speciesId);
    if (idx !== -1) {
      team.slots[idx].speciesId = null;
      team.slots[idx].item = null;
      persist();
      headerView?.renderTeamBar();
      if (teamBuilderWidget) teamBuilderWidget.refresh();
    }
  },
  onShowMoveDetail: (moveId, move) => showMoveDetail(moveId, move),
  onShowAbilityDetail: (abilityId, ability) => showAbilityDetail(abilityId, ability),
  onPokemonClick: (species) => showDetail(species),
  loadAbilitiesModule: { loadAbilities },
});

const lastTeamId = localStorage.getItem("potato-last-team");
const initialTeam = teams.find((t) => t.id === lastTeamId) || teams[0];
currentTeamId = initialTeam.id;
teamSelect.value = initialTeam.id;
headerView?.renderTeamBar();
headerView?.renderTeamWarning();
window.dispatchEvent(new Event("potato-team-change"));
loadFormat("m-a");
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
import { SearchDetailView } from "./lib/views/search-detail-view.js";

const SPRITE_PATH = "sprites/champions";
const LAST_TEAM_KEY = "potato-last-team";

const formatSelect = document.getElementById("format-select");
const teamSelect = document.getElementById("team-select");
const newTeamBtn = document.getElementById("new-team-btn");
const teamWarning = document.getElementById("team-warning");
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

function getCurrentTeam() {
  return teams.find((t) => t.id === currentTeamId);
}

function getSpeciesById(id) {
  return allSpecies.find((s) => s.id === id);
}

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

function renderTeamWarning() {
  const team = getCurrentTeam();
  if (team && !isTeamLegal(team)) {
    teamWarning.classList.remove("hidden");
  } else {
    teamWarning.classList.add("hidden");
  }
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

  renderTeamBar();
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
  renderTeamWarning();
  renderTeamBar();
  if (teamBuilderWidget) teamBuilderWidget.refresh();
}

function renderTeamBar() {
  const headerTeam = document.getElementById("header-team");
  headerTeam.innerHTML = "";
  const team = getCurrentTeam();
  if (!team) {
    headerTeam.classList.add("hidden");
    return;
  }
  headerTeam.classList.remove("hidden");

  for (let i = 0; i < 6; i++) {
    const slot = team.slots[i];
    const el = document.createElement("div");
    el.className = "header-slot";

    if (slot.speciesId) {
      const species = getSpeciesById(slot.speciesId);
      el.classList.add("filled");
      if (species) {
        const spriteFile = spriteMap[species.id];
        if (spriteFile) {
          const img = document.createElement("img");
          img.className = "header-slot-sprite";
          img.src = `${SPRITE_PATH}/${spriteFile}`;
          img.alt = species.name;
          el.appendChild(img);
        }
      }
    } else {
      el.classList.add("empty");
    }

    headerTeam.appendChild(el);
  }

  headerTeam.addEventListener("click", () => {
    switchToTeamBuilder();
  });
}

function renderTeamSelect() {
  const prev = teamSelect.value;
  teamSelect.innerHTML = "";
  for (const t of teams) {
    const opt = document.createElement("option");
    opt.value = t.id;
    opt.textContent = t.name;
    teamSelect.appendChild(opt);
  }
  if (teams.some((t) => t.id === prev)) {
    teamSelect.value = prev;
  } else if (teams.length > 0) {
    teamSelect.value = teams[0].id;
  }
  currentTeamId = teamSelect.value || null;
  renderTeamWarning();
  renderTeamBar();
  window.dispatchEvent(new Event("potato-team-change"));
}

function selectTeam(id) {
  switchToTeamBuilder();
  currentTeamId = id;
  teamSelect.value = id;
  localStorage.setItem(LAST_TEAM_KEY, id);
  if (pokemonWidget) pokemonWidget.clear();
  renderTeamWarning();
  renderTeamBar();
  if (teamBuilderWidget) teamBuilderWidget.refresh();
  defensiveCoverageWidget?.refresh();
  window.dispatchEvent(new Event("potato-team-change"));
}

function handleNewTeam() {
  const count = teams.filter((t) => t.format === currentFormat).length + 1;
  const team = createTeam(`Team ${count}`, currentFormat);
  teams.push(team);
  persist();
  renderTeamSelect();
  selectTeam(team.id);
}

function isDetailTabActive() {
  const rightSection = document.querySelector(".section-right");
  const contentId = "tab-content-search-detail";
  const panel = rightSection?.querySelector(`#${contentId}`) ?? document.getElementById(contentId);
  return panel ? !panel.classList.contains("hidden") : false;
}

function switchToDetail() {
  if (isDetailTabActive()) return;
  const rightSection = document.querySelector(".section-right");
  if (window.innerWidth >= 768 && rightSection) {
    selectTab("search-detail", rightSection);
  } else {
    selectTab("search-detail");
  }
}

async function showDetail(s) {
  breadcrumbView?.push({ type: "pokemon", id: s.id, name: s.name });
  switchToDetail();
  searchDetailView?.showPokemonDetail(s);
}

function showMoveDetail(moveId, move, resetTrail = false) {
  if (resetTrail) {
    breadcrumbView?.reset({ type: "move", id: moveId, name: move.name });
  } else {
    breadcrumbView?.push({ type: "move", id: moveId, name: move.name });
  }
  switchToDetail();
  searchDetailView?.showMoveDetail(moveId, move, resetTrail);
}

function showAbilityDetail(abilityId, ability) {
  breadcrumbView?.push({ type: "ability", id: abilityId, name: ability.name });
  switchToDetail();
  searchDetailView?.showAbilityDetail(abilityId, ability);
}

function showItemDetail(itemId, item) {
  breadcrumbView?.reset({ type: "item", id: itemId, name: item.name });
  switchToDetail();
  searchDetailView?.showItemDetail(itemId, item);
}

const leftSection = document.querySelector(".section-left");

function selectTab(tabId, section) {
  const isMobile = window.innerWidth < 768;

  if (section && !isMobile) {
    section.querySelectorAll(".tab").forEach((el) => {
      el.classList.toggle("active", el.dataset.tab === tabId);
    });
    section.querySelectorAll(".tab-content").forEach((el) => {
      el.classList.toggle("hidden", el.id !== `tab-content-${tabId}`);
    });
  } else {
    document.querySelectorAll(".tab").forEach((el) => {
      el.classList.toggle("active", el.dataset.tab === tabId);
    });
    document.querySelectorAll(".tab-content").forEach((el) => {
      el.classList.toggle("hidden", el.id !== `tab-content-${tabId}`);
    });
  }

  if (isMobile) {
    const activePanel = document.getElementById(`tab-content-${tabId}`);
    const activeSection = activePanel?.closest(".section");
    document.querySelectorAll(".section").forEach((el) => {
      el.classList.toggle("hidden", el !== activeSection);
    });
  }

  if (tabId === "defensive-coverage") {
    lazyInitDefensiveCoverage();
    defensiveCoverageWidget?.refresh();
  }

  if (tabId === "move-coverage") {
    lazyInitMoveCoverage();
  }
}

function lazyInitTeamBuilder() {
  if (teamBuilderWidget) return;
  const container = document.getElementById("tab-content-team-builder");
  container.innerHTML = "";
  teamBuilderWidget = new TeamBuilderWidget({
    container,
    species: allSpecies,
    spriteMap,
    shinySpriteMap,
    formatId: currentFormat,
    getTeam: getCurrentTeam,
    onSlotChange: () => {
      persist();
      renderTeamWarning();
      renderTeamBar();
      defensiveCoverageWidget?.refresh();
      window.dispatchEvent(new Event("potato-team-change"));
    },
    onPokemonClick: (species) => showDetail(species),
  });
}

function switchToTeamBuilder() {
  lazyInitTeamBuilder();
  if (window.innerWidth >= 768 && leftSection) {
    selectTab("team-builder", leftSection);
  } else {
    selectTab("team-builder");
  }
}

let defensiveCoverageWidget = null;
let moveCoverageWidget = null;

function lazyInitDefensiveCoverage() {
  if (defensiveCoverageWidget) return;
  const container = document.getElementById("defensive-coverage-content");
  container.innerHTML = "";
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

function lazyInitMoveCoverage() {
  if (moveCoverageWidget) return;
  const container = document.getElementById("move-coverage-content");
  container.innerHTML = "";
  moveCoverageWidget = new MoveTypeCoverageWidget({
    container: document.getElementById("tab-content-move-coverage"),
    species: allSpecies,
    spriteMap,
    getTeam: getCurrentTeam,
  });
}

function selectSubTab(subTabId, container) {
  container.querySelectorAll(".sub-tab").forEach((el) => {
    el.classList.toggle("active", el.dataset.subtab === subTabId);
  });
  container.querySelectorAll(".subtab-content").forEach((el) => {
    el.classList.toggle("hidden", el.id !== `subtab-content-${subTabId}`);
  });
}

document.querySelectorAll(".sub-tab").forEach((el) => {
  el.addEventListener("click", () => {
    const subTabId = el.dataset.subtab;
    if (!subTabId) return;
    const container = el.closest(".tab-content");
    selectSubTab(subTabId, container);
  });
});

document.querySelectorAll(".tab").forEach((el) => {
  el.addEventListener("click", () => {
    const tabId = el.dataset.tab;
    if (!tabId) return;
    const section = el.closest(".section");
    selectTab(tabId, section);
  });
});

formatSelect.addEventListener("change", () => {
  loadFormat(formatSelect.value);
});

teamSelect.addEventListener("change", () => {
  selectTeam(teamSelect.value);
});

newTeamBtn.addEventListener("click", handleNewTeam);

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
});

teams = loadTeams();

if (teams.length === 0) {
  const t = createTeam("Team 1", currentFormat);
  teams.push(t);
  persist();
}

teamWarning.title = "duplicate species - Team not legal for regulation M-A";

renderTeamSelect();

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
      renderTeamBar();
      if (teamBuilderWidget) teamBuilderWidget.refresh();
    }
  },
  onShowMoveDetail: (moveId, move) => showMoveDetail(moveId, move),
  onShowAbilityDetail: (abilityId, ability) => showAbilityDetail(abilityId, ability),
  onPokemonClick: (species) => showDetail(species),
  loadAbilitiesModule: { loadAbilities },
});

const lastTeamId = localStorage.getItem(LAST_TEAM_KEY);
const initialTeam = teams.find((t) => t.id === lastTeamId) || teams[0];
selectTeam(initialTeam.id);
loadFormat("m-a");
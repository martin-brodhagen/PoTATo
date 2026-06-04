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
let detailShiny = false;
let detailSpeciesId = null;
let cachedItems = null;

let movesWidget = null;
let detailMovesWidget = null;
let pokemonWidget = null;
let moveDetailPokemonWidget = null;
let abilityDetailPokemonWidget = null;
let abilitiesWidget = null;
let itemsWidget = null;
let teamBuilderWidget = null;

let breadcrumbs = [];
let activeBreadcrumbIndex = -1;

function resetBreadcrumbs(item) {
  breadcrumbs = [item];
  activeBreadcrumbIndex = 0;
}

function updateBreadcrumbs(item) {
  const existing = breadcrumbs.findIndex((b) =>
    b.type === item.type && b.id === item.id
  );
  if (existing !== -1) {
    activeBreadcrumbIndex = existing;
  } else {
    breadcrumbs = breadcrumbs.slice(0, activeBreadcrumbIndex + 1);
    breadcrumbs.push(item);
    activeBreadcrumbIndex = breadcrumbs.length - 1;
  }
}

function navigateToBreadcrumb(index) {
  activeBreadcrumbIndex = index;
  const b = breadcrumbs[index];
  if (b.type === "pokemon") {
    const species = getSpeciesById(b.id);
    if (species) showDetail(species);
  } else if (b.type === "move") {
    loadMovesWithLearnsets(currentFormat).then((allMoves) => {
      const move = allMoves[b.id];
      if (move) showMoveDetail(b.id, move);
    });
  } else if (b.type === "ability") {
    loadAbilities(currentFormat).then((allAbilities) => {
      const ability = allAbilities[b.id];
      if (ability) showAbilityDetail(b.id, ability);
    });
  }
}

function renderBreadcrumbBar() {
  if (breadcrumbs.length === 0) {
    breadcrumbBar.innerHTML = "";
    breadcrumbBar.classList.add("hidden");
    return;
  }
  breadcrumbBar.classList.remove("hidden");
  let html = '<div class="breadcrumbs">';
  for (let i = 0; i < breadcrumbs.length; i++) {
    const b = breadcrumbs[i];
    if (i > 0) html += '<span class="breadcrumb-sep">›</span>';
    const cls = i === activeBreadcrumbIndex
      ? "breadcrumb breadcrumb-active"
      : "breadcrumb";
    html += `<span class="${cls}" data-breadcrumb-index="${i}">${b.name}</span>`;
  }
  html += "</div>";
  breadcrumbBar.innerHTML = html;
  breadcrumbBar.querySelector(".breadcrumbs")?.addEventListener("click", (e) => {
    const target = e.target.closest(".breadcrumb");
    if (!target) return;
    const index = parseInt(target.dataset.breadcrumbIndex);
    navigateToBreadcrumb(index);
  });
}

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
  if (detailMovesWidget) {
    detailMovesWidget.destroy();
    detailMovesWidget = null;
  }
  if (moveDetailPokemonWidget) {
    moveDetailPokemonWidget.destroy();
    moveDetailPokemonWidget = null;
  }
  if (abilityDetailPokemonWidget) {
    abilityDetailPokemonWidget.destroy();
    abilityDetailPokemonWidget = null;
  }
  if (abilitiesWidget) {
    abilitiesWidget.destroy();
    abilitiesWidget = null;
  }
  if (itemsWidget) {
    itemsWidget.destroy();
    itemsWidget = null;
  }
  breadcrumbs = [];
  activeBreadcrumbIndex = -1;
  renderBreadcrumbBar();
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
  if (detailMovesWidget) {
    detailMovesWidget.destroy();
    detailMovesWidget = null;
  }
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
  updateBreadcrumbs({ type: "pokemon", id: s.id, name: s.name });
  detailSpeciesId = s.id;
  detailShiny = false;
  if (detailMovesWidget) {
    detailMovesWidget.destroy();
    detailMovesWidget = null;
  }
  if (moveDetailPokemonWidget) {
    moveDetailPokemonWidget.destroy();
    moveDetailPokemonWidget = null;
  }
  if (abilityDetailPokemonWidget) {
    abilityDetailPokemonWidget.destroy();
    abilityDetailPokemonWidget = null;
  }
  switchToDetail();

  function statBarColor(val) {
    if (val <= 29) return "#c44d4d";
    if (val <= 59) return "#cc9f4a";
    if (val <= 94) return "#e5c531";
    if (val <= 134) return "#5fbb63";
    if (val <= 159) return "#4f8ed4";
    return "#ab6ac8";
  }

  const bst = Object.values(s.baseStats).reduce((a, b) => a + b, 0);
  const spriteFile = detailShiny ? shinySpriteMap[s.id] : spriteMap[s.id];
  const spritePath = detailShiny ? "sprites/shiny" : "sprites/champions";
  let html = `
    <div class="detail-top">
      <div class="stats-block">
        ${
    ["hp", "atk", "def", "spa", "spd", "spe"].map((key) => {
      const val = s.baseStats[key];
      const label = { hp: "HP", atk: "Atk", def: "Def", spa: "SpA", spd: "SpD", spe: "Spe" }[key];
      const hl = pokemonWidget && pokemonWidget.getSortBy() === key ? " stat-highlighted" : "";
      const barColor = statBarColor(val);
      return `<div class="stat-row${hl}"><span class="stat-label">${label}</span><span class="stat-val">${val}</span><span class="stat-bar-track"><span class="stat-bar-fill" style="background-color:${barColor};width:${val}px"></span></span></div>`;
    }).join("\n        ")
  }
        <div class="stat-row stat-bst"><span class="stat-label">BST</span><span class="stat-val">${bst}</span><span class="stat-bar-track"></span></div>
      </div>

      <div class="detail-header-wrap">
        <button class="add-to-team-btn" id="add-to-team-btn">Add to Team</button>
        <div class="detail-header">
          ${
    spriteFile
      ? `<img class="detail-sprite" src="${spritePath}/${spriteFile}" alt="${s.name}" style="cursor:pointer" title="Click to toggle shiny">`
      : ""
  }
          <div>
            <h2>${s.name}</h2>
            <div class="types">${
    [0, 1].map((i) => {
      const t = s.types[i];
      return `<span class="type-tag${t ? " " + t.toLowerCase() : " type-tag-empty"}">${t || ""}</span>`;
    }).join("")
  }</div>
            <div class="detail-meta">
            <span class="detail-meta-item"><span class="detail-meta-label">Height</span><span class="detail-meta-value">${s.heightm ?? "—"}m</span></span>
            <span class="detail-meta-item"><span class="detail-meta-label">Weight</span><span class="detail-meta-value">${s.weightkg ?? "—"}kg</span></span>
              <span class="detail-meta-item" title="Weight-based Base Damage of Low Kick and Grass Knot"><span class="detail-meta-label">Low Kick</span><span class="detail-meta-value">${getWeightTier(s.weightkg)} BP</span></span>
              <span class="detail-meta-item"><span class="detail-meta-label">Gender</span><span class="detail-meta-value">${formatGender(s.gender)}</span></span>
            </div>
          </div>
        </div>
        <div class="ability-buttons">${s.abilities.map((a) => `<button class="ability-btn">${a}</button>`).join("")}</div>
      </div>
    </div>`;

  function getWeightTier(kg) {
    if (kg === null) return "—";
    if (kg <= 9.9) return "20";
    if (kg <= 24.9) return "40";
    if (kg <= 49.9) return "60";
    if (kg <= 99.9) return "80";
    if (kg <= 199.9) return "100";
    return "120";
  }

  function formatGender(g) {
    if (g === null) return "♂ ♀";
    if (g === "M") return "♂";
    if (g === "F") return "♀";
    return "—";
  }

  html += `<h3 class="detail-moves-heading">Moves</h3>
    <div id="detail-moves-container"></div>`;

  searchDetailContent.innerHTML = html;
  renderBreadcrumbBar();

  const addBtn = searchDetailContent.querySelector("#add-to-team-btn");
  if (addBtn) {
    const team = getCurrentTeam();
    const baseId = s.baseSpecies
      ? (allSpecies.find((sp) => sp.name === s.baseSpecies)?.id ?? s.id)
      : s.id;
    const isInTeam = team?.slots.some(
      (slot) =>
        slot.speciesId === s.id ||
        (s.baseSpecies && slot.speciesId === baseId),
    ) ?? false;
    const hasEmptySlot = team?.slots.some((slot) => slot.speciesId === null) ?? false;

    if (isInTeam) {
      addBtn.textContent = "Remove from Team";
      addBtn.className = "add-to-team-btn remove-from-team";
    } else if (!hasEmptySlot) {
      addBtn.textContent = "Add to Team";
      addBtn.className = "add-to-team-btn add-to-team";
      addBtn.disabled = true;
      addBtn.title = "Team is full";
    } else {
      addBtn.className = "add-to-team-btn add-to-team";
    }

    addBtn.addEventListener("click", () => {
      const t = getCurrentTeam();
      if (!t) return;

      const speciesIdToCheck = s.baseSpecies
        ? (allSpecies.find((sp) => sp.name === s.baseSpecies)?.id ?? s.id)
        : s.id;
      const inTeamIdx = t.slots.findIndex(
        (slot) =>
          slot.speciesId === s.id ||
          (s.baseSpecies && slot.speciesId === speciesIdToCheck),
      );

      if (inTeamIdx !== -1) {
        t.slots[inTeamIdx].speciesId = null;
        t.slots[inTeamIdx].item = null;
        persist();
        renderTeamBar();
        if (teamBuilderWidget) teamBuilderWidget.refresh();
        refreshAddBtn();
      } else {
        const emptyIdx = t.slots.findIndex((slot) => slot.speciesId === null);
        if (emptyIdx === -1) return;
        fillSlot(emptyIdx, s.id);
        refreshAddBtn();
      }
    });
  }

  const refreshAddBtn = () => {
    const btn = searchDetailContent.querySelector("#add-to-team-btn");
    if (!btn || !detailSpeciesId) return;
    const t = getCurrentTeam();

    const detailSpecies = allSpecies.find((sp) => sp.id === detailSpeciesId);
    const baseId = detailSpecies?.baseSpecies
      ? (allSpecies.find((sp) => sp.name === detailSpecies.baseSpecies)?.id ?? detailSpeciesId)
      : detailSpeciesId;

    const isInTeam = t?.slots.some(
      (slot) =>
        slot.speciesId === detailSpeciesId ||
        (detailSpecies?.baseSpecies && slot.speciesId === baseId),
    ) ?? false;
    const hasEmptySlot = t?.slots.some((slot) => slot.speciesId === null) ?? false;
    if (isInTeam) {
      btn.textContent = "Remove from Team";
      btn.className = "add-to-team-btn remove-from-team";
      btn.disabled = false;
      btn.title = "";
    } else if (!hasEmptySlot) {
      btn.textContent = "Add to Team";
      btn.className = "add-to-team-btn add-to-team";
      btn.disabled = true;
      btn.title = "Team is full";
    } else {
      btn.textContent = "Add to Team";
      btn.className = "add-to-team-btn add-to-team";
      btn.disabled = false;
      btn.title = "";
    }
  };
  window.addEventListener("potato-team-change", refreshAddBtn);

  const detailSpriteEl = searchDetailContent.querySelector(".detail-sprite");
  if (detailSpriteEl) {
    detailSpriteEl.addEventListener("click", () => {
      detailShiny = !detailShiny;
      const newPath = detailShiny ? "sprites/shiny" : "sprites/champions";
      const newFile = detailShiny ? shinySpriteMap[s.id] : spriteMap[s.id];
      detailSpriteEl.src = `${newPath}/${newFile}`;
    });
  }

  const abilityNames = new Set(s.abilities.filter(Boolean));
  if (abilityNames.size > 0) {
    loadAbilities(currentFormat).then((allAbilities) => {
      const nameToId = {};
      for (const [id, a] of Object.entries(allAbilities)) nameToId[a.name] = id;
      searchDetailContent.querySelectorAll(".ability-btn").forEach((btn) => {
        const name = btn.textContent || "";
        const id = nameToId[name];
        if (id) {
          btn.addEventListener("click", () => showAbilityDetail(id, allAbilities[id]));
        }
      });
    });
  }

  const container = document.getElementById("detail-moves-container");
  const speciesNames = {};
  for (const sp of allSpecies) speciesNames[sp.id] = sp.name;
  detailMovesWidget = new MoveSearchWidget({
    container,
    formatId: currentFormat,
    learnsetSpecies: s.id,
    speciesNames,
    onMoveClick: (moveId, move) => showMoveDetail(moveId, move),
  });
}

function showMoveDetail(moveId, move, resetTrail = false) {
  if (resetTrail) {
    resetBreadcrumbs({ type: "move", id: moveId, name: move.name });
  } else {
    updateBreadcrumbs({ type: "move", id: moveId, name: move.name });
  }
  if (detailMovesWidget) {
    detailMovesWidget.destroy();
    detailMovesWidget = null;
  }
  if (moveDetailPokemonWidget) {
    moveDetailPokemonWidget.destroy();
    moveDetailPokemonWidget = null;
  }
  if (abilityDetailPokemonWidget) {
    abilityDetailPokemonWidget.destroy();
    abilityDetailPokemonWidget = null;
  }
  switchToDetail();

  const bpDisplay = (m) => {
    if (m.category === "Status") return "—";
    if (m.basePower !== 0) return String(m.basePower);
    if (m.name === "Night Shade" || m.name === "Seismic Toss") return "50";
    return "?";
  };

  const accDisplay = (m) => {
    if (typeof m.accuracy === "number") return m.accuracy + "%";
    return "—";
  };

  const flagLabels = (move.flags || []).map((f) =>
    MOVE_CLASSIFICATIONS[f] || f
  );
  const effectLabels = (move.effectCategories || []).map((e) =>
    EFFECT_CATEGORIES[e] || e
  );
  const rangeLabel = move.range ? (RANGE_CATEGORIES[move.range] || move.range) : "";
  const rangeHtml = rangeLabel
    ? `<div class="move-detail-stat move-detail-stat-range"><span class="move-detail-stat-label">Range</span><span class="move-detail-stat-value">${rangeLabel}</span></div>`
    : "";

  const learnedBy = move.learnedBy || [];
  const priorityHtml = move.priority !== 0
    ? `<div class="move-detail-stat"><span class="move-detail-stat-label">Priority</span><span class="move-detail-stat-value">${move.priority > 0 ? "+" + move.priority : move.priority}</span></div>`
    : "";

  const html = `
    <div class="move-detail">
      <div class="move-detail-header">
        <span class="move-detail-name">${move.name}</span>
        <span class="type-tag ${move.type.toLowerCase()}">${move.type}</span>
        <span class="move-entry-cat cat-${move.category.toLowerCase()}"><img class="cat-icon-small" src="sprites/categories/${move.category}_CP.png" alt="${move.category}"></span>
      </div>
      <div class="move-detail-stats">
        <div class="move-detail-stat"><span class="move-detail-stat-label">BP</span><span class="move-detail-stat-value">${bpDisplay(move)}</span></div>
        <div class="move-detail-stat"><span class="move-detail-stat-label">ACC</span><span class="move-detail-stat-value">${accDisplay(move)}</span></div>
        <div class="move-detail-stat"><span class="move-detail-stat-label">PP</span><span class="move-detail-stat-value">${move.pp}</span></div>
        ${rangeHtml}
        ${priorityHtml}
      </div>
      ${
    flagLabels.length > 0 || effectLabels.length > 0
      ? `<div class="move-detail-badges">${
        [...flagLabels, ...effectLabels].map((l) => `<span class="badge">${l}</span>`).join("")
      }</div>`
      : ""
  }
      ${
    move.shortDesc
      ? `<div class="move-detail-desc">${move.shortDesc}</div>`
      : ""
  }
      <div class="move-detail-learned">
        <h3 class="badge-group-label">Learned By (${learnedBy.length})</h3>
        <div id="move-detail-learned-container"></div>
      </div>
    </div>`;

  searchDetailContent.innerHTML = html;
  renderBreadcrumbBar();

  if (learnedBy.length > 0) {
    const container = document.getElementById("move-detail-learned-container");
    moveDetailPokemonWidget = new PokemonSearchWidget({
      container,
      formatId: currentFormat,
      onPokemonClick: (_speciesId, species) => showDetail(species),
      species: allSpecies,
      spriteMap,
      learnedByFilter: learnedBy,
    });
  }
}

function showAbilityDetail(abilityId, ability) {
  updateBreadcrumbs({ type: "ability", id: abilityId, name: ability.name });
  if (detailMovesWidget) {
    detailMovesWidget.destroy();
    detailMovesWidget = null;
  }
  if (moveDetailPokemonWidget) {
    moveDetailPokemonWidget.destroy();
    moveDetailPokemonWidget = null;
  }
  if (abilityDetailPokemonWidget) {
    abilityDetailPokemonWidget.destroy();
    abilityDetailPokemonWidget = null;
  }
  switchToDetail();

  const effectLabels = (ability.effectCategories || []).map((e) =>
    ABILITY_EFFECT_CATEGORIES[e] || e
  );
  const pokemonIds = ability.pokemon || [];

  const html = `
    <div class="move-detail">
      <div class="move-detail-header">
        <span class="move-detail-name">${ability.name}</span>
      </div>
      ${
    effectLabels.length > 0
      ? `<div class="move-detail-badges">${
        effectLabels.map((l) => `<span class="badge">${l}</span>`).join("")
      }</div>`
      : ""
  }
      <div class="move-detail-desc">${ability.desc}</div>
      <div class="move-detail-learned">
        <h3 class="badge-group-label">Pokémon with ${ability.name} (${pokemonIds.length})</h3>
        <div id="ability-detail-pokemon-container"></div>
      </div>
    </div>`;

  searchDetailContent.innerHTML = html;
  renderBreadcrumbBar();

  if (pokemonIds.length > 0) {
    const container = document.getElementById("ability-detail-pokemon-container");
    abilityDetailPokemonWidget = new PokemonSearchWidget({
      container,
      formatId: currentFormat,
      onPokemonClick: (_speciesId, species) => showDetail(species),
      species: allSpecies,
      spriteMap,
      learnedByFilter: pokemonIds,
    });
  }
}

function showItemDetail(itemId, item) {
  resetBreadcrumbs({ type: "item", id: itemId, name: item.name });
  if (detailMovesWidget) {
    detailMovesWidget.destroy();
    detailMovesWidget = null;
  }
  if (moveDetailPokemonWidget) {
    moveDetailPokemonWidget.destroy();
    moveDetailPokemonWidget = null;
  }
  if (abilityDetailPokemonWidget) {
    abilityDetailPokemonWidget.destroy();
    abilityDetailPokemonWidget = null;
  }
  switchToDetail();

  const categories = (item.category || []).map((c) =>
    `<span class="badge">${c}</span>`
  ).join("");

  const html = `
    <div class="move-detail">
      <div class="move-detail-header">
        <img class="item-detail-sprite" src="sprites/items/${item.sprite || itemId}.png" alt="${item.name}" onerror="this.style.display='none'">
        <span class="move-detail-name">${item.name}</span>
      </div>
      ${categories ? `<div class="move-detail-badges">${categories}</div>` : ""}
      ${
    item.shortDesc || item.desc
      ? `<div class="move-detail-desc">${item.shortDesc || item.desc}</div>`
      : ""
  }
    </div>`;

  searchDetailContent.innerHTML = html;
  renderBreadcrumbBar();
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
        resetBreadcrumbs({ type: "ability", id: abilityId, name: ability.name });
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
      resetBreadcrumbs({ type: "pokemon", id: speciesId, name: species.name });
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

const lastTeamId = localStorage.getItem(LAST_TEAM_KEY);
const initialTeam = teams.find((t) => t.id === lastTeamId) || teams[0];
selectTeam(initialTeam.id);
loadFormat("m-a");
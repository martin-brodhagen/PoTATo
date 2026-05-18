import type { Species, FormatId, Team } from './lib/types.js';
import { setFormat, loadIndex, loadLearnsets, loadMoves } from './lib/data-loader.js';
import { createTeam, loadTeams, saveTeams } from './lib/team-store.js';

const SPRITE_PATH = 'sprites/champions';

const LAST_TEAM_KEY = 'potato-last-team';

const TYPES = ['Normal','Fire','Water','Electric','Grass','Ice','Fighting','Poison','Ground','Flying','Psychic','Bug','Rock','Ghost','Dragon','Dark','Steel','Fairy'];

const TYPE_COLORS: Record<string, string> = {
  Normal: '#9099a1', Fire: '#e56c3e', Water: '#4f8ed4',
  Electric: '#e5c531', Grass: '#5fbb63', Ice: '#70cde7',
  Fighting: '#c44d4d', Poison: '#ab6ac8', Ground: '#cc9f4a',
  Flying: '#8fa8dd', Psychic: '#e26a8a', Bug: '#92bc2c',
  Rock: '#b6a14a', Ghost: '#6060b0', Dragon: '#6969cc',
  Dark: '#5a4f44', Steel: '#5a8ea2', Fairy: '#e08ee0',
};

interface FilterFlag {
  category: 'type' | 'ability' | 'move';
  id: string;
  label: string;
}

const formatSelect = document.getElementById('format-select') as HTMLSelectElement;
const teamSelect = document.getElementById('team-select') as HTMLSelectElement;
const newTeamBtn = document.getElementById('new-team-btn') as HTMLButtonElement;
const teamWarning = document.getElementById('team-warning') as HTMLSpanElement;
const teamBar = document.getElementById('team-bar') as HTMLDivElement;
const filterInput = document.getElementById('filter-input') as HTMLInputElement;
const LS_SORT_BY = 'potato_sort_by';
const LS_SORT_ASC = 'potato_sort_asc';
const sortSelect = document.getElementById('sort-select') as HTMLSelectElement;
const sortDirBtn = document.getElementById('sort-dir') as HTMLButtonElement;
const megaToggle = document.getElementById('mega-toggle') as HTMLButtonElement;
const resultCount = document.getElementById('result-count') as HTMLSpanElement;
const filterPopup = document.getElementById('filter-popup') as HTMLDivElement;
const filterBar = document.getElementById('filter-bar') as HTMLDivElement;
const filterToolbar = document.getElementById('filter-toolbar') as HTMLDivElement;
const grid = document.getElementById('pokemon-grid') as HTMLDivElement;
const searchDetailContent = document.getElementById('search-detail-content') as HTMLDivElement;

let currentFormat: FormatId = 'm-a';
let teams: Team[] = [];
let currentTeamId: string | null = null;
let allSpecies: Species[] = [];
let spriteMap: Record<string, string> = {};
let searchQuery = '';
let pendingSlotIndex: number | null = null;
let detailSpecies: Species | null = null;
let filterFlags: FilterFlag[] = [];
let filterMode: 'and' | 'or' = 'and';
let allAbilities: string[] = [];
let moveNames: Record<string, string> = {};
let showMegas = true;
let sortBy = 'dex';
let sortAsc = true;

let movesLoadedForFilter = false;
let movesLoadingForFilter = false;
let filterLearnsets: Record<string, string[]> | null = null;
let filterHighlightIndex = -1;

function getCurrentTeam(): Team | undefined {
  return teams.find(t => t.id === currentTeamId);
}

function getSpeciesById(id: string): Species | undefined {
  return allSpecies.find(s => s.id === id);
}

function isTeamLegal(team: Team): boolean {
  const nums: number[] = [];
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
    teamWarning.classList.remove('hidden');
  } else {
    teamWarning.classList.add('hidden');
  }
}

function persist() {
  saveTeams(teams);
}

async function loadFormat(format: FormatId) {
  currentFormat = format;
  setFormat(format);
  detailSpecies = null;
  clearFilter();

  const [index, map] = await Promise.all([
    loadIndex(format),
    fetch(`data/format-${format}/sprite-map.json`).then(r => r.json()),
  ]);
  allSpecies = index;
  spriteMap = map as Record<string, string>;
  buildFilterData();
  renderGrid();
  renderTeamBar();
}

function buildFilterData() {
  const abilitySet = new Set<string>();
  for (const s of allSpecies) {
    for (const v of Object.values(s.abilities)) {
      if (v) abilitySet.add(v);
    }
  }
  allAbilities = [...abilitySet].sort();
  moveNames = {};
  movesLoadedForFilter = false;
  movesLoadingForFilter = false;
}

function matchesFlag(species: Species, flag: FilterFlag): boolean {
  switch (flag.category) {
    case 'type':
      return species.types.some(t => t.toLowerCase() === flag.id);
    case 'ability':
      return Object.values(species.abilities).some(a => a.toLowerCase() === flag.id);
    case 'move':
      if (!filterLearnsets) return false;
      const moves = filterLearnsets[species.id];
      return !!moves && moves.includes(flag.id);
  }
}

function isMegaForm(species: Species): boolean {
  return species.forme !== null && species.forme.includes('Mega');
}

function matchesFlags(species: Species): boolean {
  if (!showMegas && isMegaForm(species)) {
    return false;
  }
  if (filterFlags.length > 0) {
    const results = filterFlags.map(f => matchesFlag(species, f));
    if (filterMode === 'and' ? !results.every(Boolean) : !results.some(Boolean)) {
      return false;
    }
  }
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    if (!species.id.includes(q) && !species.name.toLowerCase().includes(q)) {
      return false;
    }
  }
  return true;
}

function renderGrid() {
  grid.innerHTML = '';
  let filtered = allSpecies.filter(matchesFlags);
  const statKeys: Record<string, keyof typeof allSpecies[0]['baseStats']> = {
    hp: 'hp', atk: 'atk', def: 'def', spa: 'spa', spd: 'spd', spe: 'spe'
  };
  filtered = filtered.sort((a, b) => {
    let cmp: number;
    if (sortBy === 'alpha') {
      cmp = a.name.localeCompare(b.name);
    } else if (sortBy === 'dex') {
      cmp = a.num - b.num;
    } else {
      const key = statKeys[sortBy];
      cmp = a.baseStats[key] - b.baseStats[key];
    }
    return sortAsc ? cmp : -cmp;
  });
  resultCount.textContent = `${filtered.length} Result${filtered.length === 1 ? '' : 's'}`;
  resultCount.classList.toggle('hidden', allSpecies.length === 0);

  if (filtered.length === 0) {
    grid.innerHTML = '<div class="loading">No Pokémon match your search.</div>';
    return;
  }

  for (const s of filtered) {
    const card = document.createElement('div');
    card.className = 'pokemon-card';
    card.setAttribute('role', 'listitem');

    // Left column: sprite + info + name
    const left = document.createElement('div');
    left.className = 'card-left';

    const top = document.createElement('div');
    top.className = 'card-top';

    const spriteFile = spriteMap[s.id];
    if (spriteFile) {
      const img = document.createElement('img');
      img.className = 'card-sprite';
      img.src = `${SPRITE_PATH}/${spriteFile}`;
      img.alt = s.name;
      img.loading = 'lazy';
      top.appendChild(img);
    }

    const info = document.createElement('div');
    info.className = 'card-info';

    const typesEl = document.createElement('div');
    typesEl.className = 'types';
    for (const t of s.types) {
      const tag = document.createElement('span');
      tag.className = `type-tag ${t.toLowerCase()}`;
      tag.textContent = t;
      typesEl.appendChild(tag);
    }
    info.appendChild(typesEl);

    const abilEl = document.createElement('div');
    abilEl.className = 'abilities';
    for (const ab of Object.values(s.abilities)) {
      const span = document.createElement('span');
      span.className = 'ability-name';
      span.textContent = ab;
      abilEl.appendChild(span);
    }
    info.appendChild(abilEl);

    top.appendChild(info);
    left.appendChild(top);

    const nameEl = document.createElement('div');
    nameEl.className = 'name';
    nameEl.textContent = s.name;
    left.appendChild(nameEl);

    card.appendChild(left);

    // Vertical divider
    const div = document.createElement('div');
    div.className = 'card-divider';
    card.appendChild(div);

    // Right column: stacked base stats
    const statNames = ['HP', 'Atk', 'Def', 'SpA', 'SpD', 'Spe'] as const;
    const statKeys = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'] as const;
    const statList = document.createElement('div');
    statList.className = 'card-stats';
    for (let si = 0; si < 6; si++) {
      const val = s.baseStats[statKeys[si]];
      const entry = document.createElement('div');
      entry.className = 'stat-entry' + (statKeys[si] === sortBy ? ' stat-highlighted' : '');
      const label = document.createElement('span');
      label.className = 'stat-label';
      label.textContent = statNames[si];
      const value = document.createElement('span');
      value.className = 'stat-value';
      value.textContent = val.toString();
      entry.appendChild(label);
      entry.appendChild(value);
      statList.appendChild(entry);
    }
    card.appendChild(statList);

    card.addEventListener('click', () => {
      if (pendingSlotIndex !== null) {
        fillSlot(pendingSlotIndex, s.id);
      } else {
        showDetail(s);
      }
    });
    grid.appendChild(card);
  }
}

function clearFilter() {
  searchQuery = '';
  pendingSlotIndex = null;
  filterInput.value = '';
  filterFlags = [];
  filterMode = 'and';
  filterLearnsets = null;
  filterHighlightIndex = -1;
  filterPopup.classList.add('hidden');
  renderChips();
  updateModeButtons();
  renderGrid();
}

function applyFilter() {
  searchQuery = filterInput.value;
  updatePopup();
  renderGrid();
}

function updatePopup() {
  const text = filterInput.value.trim();
  if (text.length < 2) {
    filterPopup.classList.add('hidden');
    return;
  }

  const lower = text.toLowerCase();

  const matchingTypes = TYPES.filter(t => t.toLowerCase().includes(lower));
  const matchingAbilities = allAbilities.filter(a => a.toLowerCase().includes(lower));
  const matchingMoves: { id: string; name: string }[] = [];
  for (const [id, name] of Object.entries(moveNames)) {
    if (name.toLowerCase().includes(lower)) {
      matchingMoves.push({ id, name });
    }
  }

  const total = matchingTypes.length + matchingAbilities.length + matchingMoves.length;
  if (total === 0) {
    filterPopup.classList.add('hidden');
    return;
  }

  let html = '';
  if (matchingTypes.length > 0) {
    html += `<div class="popup-group"><div class="popup-group-label">Type</div>`;
    for (const t of matchingTypes.slice(0, 10)) {
      const dotColor = TYPE_COLORS[t] || '#888';
      html += `<div class="popup-item" data-category="type" data-id="${t.toLowerCase()}" data-label="${t}"><span class="popup-type-dot" style="background:${dotColor}"></span>${t}</div>`;
    }
    html += `</div>`;
  }
  if (matchingAbilities.length > 0) {
    html += `<div class="popup-group"><div class="popup-group-label">Ability</div>`;
    for (const a of matchingAbilities.slice(0, 10)) {
      html += `<div class="popup-item" data-category="ability" data-id="${a.toLowerCase()}" data-label="${a}">${a}</div>`;
    }
    html += `</div>`;
  }
  if (matchingMoves.length > 0) {
    html += `<div class="popup-group"><div class="popup-group-label">Move</div>`;
    for (const m of matchingMoves.slice(0, 10)) {
      html += `<div class="popup-item" data-category="move" data-id="${m.id}" data-label="${m.name}">${m.name}</div>`;
    }
    html += `</div>`;
  }

  filterPopup.innerHTML = html;
  filterHighlightIndex = -1;
  filterPopup.classList.remove('hidden');

  const rect = filterInput.getBoundingClientRect();
  const popupStyle = filterPopup.style;
  const spaceBelow = window.innerHeight - rect.bottom;
  const popupHeight = Math.min(280, spaceBelow - 8);
  popupStyle.top = (spaceBelow > 180 ? rect.bottom + 6 : rect.top - popupHeight - 6) + 'px';
  popupStyle.left = Math.max(8, rect.left) + 'px';
  popupStyle.width = Math.max(220, rect.width) + 'px';
  popupStyle.maxHeight = popupHeight + 'px';

  if (!movesLoadedForFilter && !movesLoadingForFilter) {
    movesLoadingForFilter = true;
    loadMoves(currentFormat).then(moves => {
      moveNames = {};
      for (const [id, move] of Object.entries(moves)) {
        moveNames[id] = move.name;
      }
      movesLoadedForFilter = true;
      movesLoadingForFilter = false;
      if (document.activeElement === filterInput) {
        updatePopup();
      }
    });
  }
}

function updatePopupHighlight(items: NodeListOf<HTMLElement> | HTMLElement[]) {
  items.forEach((el, i) => {
    el.classList.toggle('highlighted', i === filterHighlightIndex);
  });
  if (filterHighlightIndex >= 0 && filterHighlightIndex < items.length) {
    items[filterHighlightIndex].scrollIntoView({ block: 'nearest' });
  }
}

function addFlag(category: FilterFlag['category'], id: string, label: string) {
  filterFlags.push({ category, id, label });
  filterInput.value = '';
  searchQuery = '';
  filterPopup.classList.add('hidden');
  renderChips();
  renderGrid();
  if (category === 'move' && !filterLearnsets) {
    loadLearnsets(currentFormat).then(ls => {
      filterLearnsets = ls;
      renderGrid();
    });
  }
}

function removeFlag(index: number) {
  filterFlags.splice(index, 1);
  renderChips();
  renderGrid();
}

function renderChips() {
  filterBar.querySelectorAll('.filter-chip').forEach(el => el.remove());
  filterBar.classList.toggle('hidden', filterFlags.length === 0);
  for (let i = 0; i < filterFlags.length; i++) {
    const f = filterFlags[i];
    const chip = document.createElement('span');
    chip.className = 'filter-chip';
    chip.dataset.category = f.category;
    chip.innerHTML = `${f.label} <span class="chip-remove" data-index="${i}">×</span>`;
    chip.querySelector('.chip-remove')!.addEventListener('click', (e) => {
      e.stopPropagation();
      removeFlag(i);
    });
    filterBar.insertBefore(chip, filterToolbar);
  }
}

function updateModeButtons() {
  filterToolbar.querySelectorAll<HTMLButtonElement>('.filter-mode').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mode === filterMode);
  });
}

function startSlotSearch(slotIndex: number) {
  if (window.innerWidth >= 768) {
    selectTab('pokedex', document.querySelector<HTMLElement>('.section-left'));
  } else {
    selectTab('pokedex');
  }
  const pokedexContent = document.getElementById('tab-content-pokedex')!;
  selectSubTab('pokemon', pokedexContent);
  pendingSlotIndex = slotIndex;
  filterInput.value = '';
  searchQuery = '';
  filterInput.focus();
  renderGrid();
}

function fillSlot(slotIndex: number, speciesId: string) {
  const team = getCurrentTeam();
  if (!team) return;
  team.slots[slotIndex].speciesId = speciesId;
  persist();
  renderTeamWarning();
  clearFilter();
  renderTeamBar();
  reRenderDetail();
}

function removeFromTeam(slotIndex: number) {
  const team = getCurrentTeam();
  if (!team) return;
  team.slots[slotIndex].speciesId = null;
  persist();
  renderTeamWarning();
  renderTeamBar();
  reRenderDetail();
}

function setTeamSlot(team: Team, slotIndex: number, speciesId: string | null) {
  team.slots[slotIndex].speciesId = speciesId;
  persist();
  renderTeamWarning();
  renderTeamBar();
  reRenderDetail();
}

function reRenderDetail() {
  if (detailSpecies) showDetail(detailSpecies);
}

function renderTeamBar() {
  teamBar.innerHTML = '';
  const team = getCurrentTeam();
  if (!team) return;

  for (let i = 0; i < 6; i++) {
    const slot = team.slots[i];
    const el = document.createElement('div');
    el.className = 'team-slot';

    if (slot.speciesId) {
      const species = getSpeciesById(slot.speciesId);
      el.classList.add('filled');
      if (species) {
        el.style.borderLeftColor = getTypeColor(species.types[0]);
        const nameSpan = document.createElement('span');
        nameSpan.className = 'slot-name';
        nameSpan.textContent = species.name;
        el.appendChild(nameSpan);
      }
      el.addEventListener('click', () => {
        switchToTeamBuilder();
        if (species) showDetail(species);
      });
      el.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        removeFromTeam(i);
      });
    } else {
      el.classList.add('empty');
      el.innerHTML = '<span class="slot-plus">+</span>';
      el.addEventListener('click', () => startSlotSearch(i));
    }

    teamBar.appendChild(el);
  }
}

function getTypeColor(type: string): string {
  const map: Record<string, string> = {
    normal: '#9099a1', fire: '#e56c3e', water: '#4f8ed4',
    electric: '#e5c531', grass: '#5fbb63', ice: '#70cde7',
    fighting: '#c44d4d', poison: '#ab6ac8', ground: '#cc9f4a',
    flying: '#8fa8dd', psychic: '#e26a8a', bug: '#92bc2c',
    rock: '#b6a14a', ghost: '#6060b0', dragon: '#6969cc',
    dark: '#5a4f44', steel: '#5a8ea2', fairy: '#e08ee0',
  };
  return map[type.toLowerCase()] || '#555';
}

function renderTeamSelect() {
  const prev = teamSelect.value;
  teamSelect.innerHTML = '';
  for (const t of teams) {
    const opt = document.createElement('option');
    opt.value = t.id;
    opt.textContent = t.name;
    teamSelect.appendChild(opt);
  }
  if (teams.some(t => t.id === prev)) {
    teamSelect.value = prev;
  } else if (teams.length > 0) {
    teamSelect.value = teams[0].id;
  }
  currentTeamId = teamSelect.value || null;
  renderTeamWarning();
  renderTeamBar();
}

function selectTeam(id: string) {
  switchToTeamBuilder();
  currentTeamId = id;
  teamSelect.value = id;
  localStorage.setItem(LAST_TEAM_KEY, id);
  clearFilter();
  detailSpecies = null;
  renderTeamWarning();
  renderTeamBar();
}

function handleNewTeam() {
  const count = teams.filter(t => t.format === currentFormat).length + 1;
  const team = createTeam(`Team ${count}`, currentFormat);
  teams.push(team);
  persist();
  renderTeamSelect();
  selectTeam(team.id);
}

function switchToDetail() {
  const rightSection = document.querySelector<HTMLElement>('.section-right');
  if (window.innerWidth >= 768 && rightSection) {
    selectTab('search-detail', rightSection);
  } else {
    selectTab('search-detail');
  }
}

async function showDetail(s: Species) {
  detailSpecies = s;
  switchToDetail();

  const [learnsets, moves] = await Promise.all([
    loadLearnsets(currentFormat),
    loadMoves(currentFormat),
  ]);
  filterLearnsets = learnsets;

  const team = getCurrentTeam();

  function statBarColor(val: number): string {
    if (val <= 29) return '#c44d4d';
    if (val <= 59) return '#cc9f4a';
    if (val <= 94) return '#e5c531';
    if (val <= 134) return '#5fbb63';
    if (val <= 159) return '#4f8ed4';
    return '#ab6ac8';
  }

  const bst = Object.values(s.baseStats).reduce((a, b) => a + b, 0);
  const spriteFile = spriteMap[s.id];
  let html = `
    <div class="detail-top">
      <div class="stats-block">
        ${(['hp', 'atk', 'def', 'spa', 'spd', 'spe'] as const).map(key => {
          const val = s.baseStats[key];
          const label = { hp: 'HP', atk: 'Atk', def: 'Def', spa: 'SpA', spd: 'SpD', spe: 'Spe' }[key];
          const hl = sortBy === key ? ' stat-highlighted' : '';
          const barColor = statBarColor(val);
          return `<div class="stat-row${hl}"><span class="stat-label">${label}</span><span class="stat-val">${val}</span><span class="stat-bar-track"><span class="stat-bar-fill" style="background-color:${barColor};width:${val}px"></span></span></div>`;
        }).join('\n        ')}
        <div class="stat-row stat-bst"><span class="stat-label">BST</span><span class="stat-val">${bst}</span><span class="stat-bar-track"></span></div>
      </div>

      <div class="detail-header">
        ${spriteFile ? `<img class="detail-sprite" src="${SPRITE_PATH}/${spriteFile}" alt="${s.name}">` : ''}
        <div>
          <h2>${s.name}</h2>
          <div class="types">${s.types.map(t => `<span class="type-tag ${t.toLowerCase()}">${t}</span>`).join('')}</div>
          <div class="ability-buttons">${Object.values(s.abilities).map(a => `<button class="ability-btn">${a}</button>`).join('')}</div>
        </div>
      </div>
    </div>`;

  if (team) {
    html += `<div style="margin-top:0.6rem">
      <div style="font-size:0.8rem;color:#888;margin-bottom:0.3rem">Add to ${team.name}</div>
      <div class="overlay-slots">`;
    for (let i = 0; i < 6; i++) {
      const slot = team.slots[i];
      const existing = slot.speciesId ? getSpeciesById(slot.speciesId) : null;
      const name = existing ? existing.name : '';
      const type = existing ? existing.types[0] : '';
      const highlight = existing && existing.num === s.num ? ' highlighted' : '';
      html += `<div class="overlay-slot${highlight}" data-index="${i}" style="${type ? 'border-left-color:' + getTypeColor(type) : ''}">
        ${name || '<span class="slot-empty-label">Empty</span>'}
      </div>`;
    }
    html += `</div></div>`;
  }

  html += `
    <h3 style="margin-top:0.75rem;font-size:0.9rem">Moves (${s.moveCount})</h3>
    <div class="moves-list">`;

  const speciesMoves = learnsets[s.id] || [];
  for (const moveId of speciesMoves) {
    const move = moves[moveId];
    if (!move) continue;
    html += `<span class="move-tag" title="${move.shortDesc || ''}">${move.name}</span>`;
  }
  html += `</div>`;

  searchDetailContent.innerHTML = html;

  if (team) {
    searchDetailContent.querySelectorAll('.overlay-slot').forEach(el => {
      el.addEventListener('click', () => {
        const idx = parseInt((el as HTMLElement).dataset.index!);
        if (el.classList.contains('highlighted')) {
          removeFromTeam(idx);
        } else {
          setTeamSlot(team, idx, s.id);
        }
        showDetail(s);
      });
    });
  }
}

// ── Tab system ─────────────────────────────────────────────
const leftSection = document.querySelector<HTMLElement>('.section-left');

function selectTab(tabId: string, section?: HTMLElement | null) {
  const isMobile = window.innerWidth < 768;

  if (section && !isMobile) {
    // Desktop: scope to the given section
    section.querySelectorAll<HTMLElement>('.tab').forEach(el => {
      el.classList.toggle('active', el.dataset.tab === tabId);
    });
    section.querySelectorAll<HTMLElement>('.tab-content').forEach(el => {
      el.classList.toggle('hidden', el.id !== `tab-content-${tabId}`);
    });
  } else {
    // Mobile or programmatic: global scoping
    document.querySelectorAll<HTMLElement>('.tab').forEach(el => {
      el.classList.toggle('active', el.dataset.tab === tabId);
    });
    document.querySelectorAll<HTMLElement>('.tab-content').forEach(el => {
      el.classList.toggle('hidden', el.id !== `tab-content-${tabId}`);
    });
  }

  // On mobile: show only the section containing the active tab
  if (isMobile) {
    const activePanel = document.getElementById(`tab-content-${tabId}`);
    const activeSection = activePanel?.closest<HTMLElement>('.section');
    document.querySelectorAll<HTMLElement>('.section').forEach(el => {
      el.classList.toggle('hidden', el !== activeSection);
    });
  }
}

function switchToTeamBuilder() {
  if (window.innerWidth >= 768 && leftSection) {
    selectTab('team-builder', leftSection);
  } else {
    selectTab('team-builder');
  }
}

// ── Sub-tab system (inside Pokedex) ────────────────────────
function selectSubTab(subTabId: string, container: HTMLElement) {
  container.querySelectorAll<HTMLElement>('.sub-tab').forEach(el => {
    el.classList.toggle('active', el.dataset.subtab === subTabId);
  });
  container.querySelectorAll<HTMLElement>('.subtab-content').forEach(el => {
    el.classList.toggle('hidden', el.id !== `subtab-content-${subTabId}`);
  });
}

document.querySelectorAll<HTMLElement>('.sub-tab').forEach(el => {
  el.addEventListener('click', () => {
    const subTabId = el.dataset.subtab;
    if (!subTabId) return;
    const container = el.closest<HTMLElement>('.tab-content')!;
    selectSubTab(subTabId, container);
  });
});

// Wire up all tab click handlers
document.querySelectorAll<HTMLElement>('.tab').forEach(el => {
  el.addEventListener('click', () => {
    const tabId = el.dataset.tab;
    if (!tabId) return;
    const section = el.closest<HTMLElement>('.section');
    selectTab(tabId, section);
  });
});

// ── Events ────────────────────────────────────────────────
formatSelect.addEventListener('change', () => {
  loadFormat(formatSelect.value as FormatId);
});

teamSelect.addEventListener('change', () => {
  selectTeam(teamSelect.value);
});

newTeamBtn.addEventListener('click', handleNewTeam);

const statSortKeys = new Set(['hp', 'atk', 'def', 'spa', 'spd', 'spe']);

sortSelect.addEventListener('change', () => {
  sortBy = sortSelect.value;
  const shouldDesc = statSortKeys.has(sortBy);
  if (sortAsc === shouldDesc) {
    sortAsc = !shouldDesc;
    sortDirBtn.textContent = sortAsc ? '▲' : '▼';
  }
  localStorage.setItem(LS_SORT_BY, sortBy);
  localStorage.setItem(LS_SORT_ASC, String(sortAsc));
  renderGrid();
});

sortDirBtn.addEventListener('click', () => {
  sortAsc = !sortAsc;
  sortDirBtn.textContent = sortAsc ? '▲' : '▼';
  localStorage.setItem(LS_SORT_ASC, String(sortAsc));
  renderGrid();
});

megaToggle.addEventListener('click', () => {
  showMegas = !showMegas;
  megaToggle.classList.toggle('active', showMegas);
  renderGrid();
});

filterInput.addEventListener('input', applyFilter);
filterInput.addEventListener('keydown', (e) => {
  const popupVisible = !filterPopup.classList.contains('hidden');
  const items = popupVisible ? filterPopup.querySelectorAll<HTMLElement>('.popup-item') : [];
  const n = items.length;

  if (e.key === 'ArrowDown' && popupVisible) {
    e.preventDefault();
    filterHighlightIndex = n > 0 ? (filterHighlightIndex + 1) % n : -1;
    updatePopupHighlight(items);
  } else if (e.key === 'ArrowUp' && popupVisible) {
    e.preventDefault();
    filterHighlightIndex = n > 0 ? (filterHighlightIndex - 1 + n) % n : -1;
    updatePopupHighlight(items);
  } else if (e.key === 'Tab' && popupVisible) {
    e.preventDefault();
    if (n === 0) return;
    if (e.shiftKey) {
      filterHighlightIndex = (filterHighlightIndex - 1 + n) % n;
    } else {
      filterHighlightIndex = (filterHighlightIndex + 1) % n;
    }
    updatePopupHighlight(items);
  } else if (e.key === 'Enter' && popupVisible) {
    e.preventDefault();
    if (n === 0) return;
    const idx = filterHighlightIndex >= 0 ? filterHighlightIndex : 0;
    const item = items[idx];
    addFlag(
      item.dataset.category as FilterFlag['category'],
      item.dataset.id!,
      item.dataset.label!
    );
  } else if (e.key === 'Escape') {
    clearFilter();
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && (filterInput.value || filterFlags.length > 0)) {
    clearFilter();
  }
});

filterPopup.addEventListener('click', (e) => {
  const item = (e.target as HTMLElement).closest('.popup-item') as HTMLElement | null;
  if (!item) return;
  const cat = item.dataset.category as FilterFlag['category'];
  const id = item.dataset.id!;
  const label = item.dataset.label!;
  addFlag(cat, id, label);
  filterInput.focus();
});

document.addEventListener('click', (e) => {
  const target = e.target as HTMLElement;
  if (!target.closest('#filter-input') && !target.closest('#filter-popup')) {
    filterPopup.classList.add('hidden');
  }
});

window.addEventListener('scroll', () => {
  filterPopup.classList.add('hidden');
}, { passive: true });

window.addEventListener('resize', () => {
  filterPopup.classList.add('hidden');
}, { passive: true });

filterBar.addEventListener('click', (e) => {
  const clearBtn = (e.target as HTMLElement).closest('.filter-clear-all');
  if (clearBtn) {
    filterFlags = [];
    renderChips();
    renderGrid();
    return;
  }
});

filterToolbar.addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest('.filter-mode') as HTMLButtonElement | null;
  if (!btn) return;
  const mode = btn.dataset.mode;
  if (mode !== 'and' && mode !== 'or') return;
  filterMode = mode;
  updateModeButtons();
  renderGrid();
});

// ── Init ──────────────────────────────────────────────────
const savedSortBy = localStorage.getItem(LS_SORT_BY);
const savedSortAsc = localStorage.getItem(LS_SORT_ASC);
if (savedSortBy && ['dex', 'alpha', 'hp', 'atk', 'def', 'spa', 'spd', 'spe'].includes(savedSortBy)) {
  sortBy = savedSortBy;
  sortSelect.value = sortBy;
}
if (savedSortAsc === 'true' || savedSortAsc === 'false') {
  sortAsc = savedSortAsc === 'true';
  sortDirBtn.textContent = sortAsc ? '▲' : '▼';
}
teams = loadTeams();

if (teams.length === 0) {
  const t = createTeam('Team 1', currentFormat);
  teams.push(t);
  persist();
}

teamWarning.title = 'duplicate species - Team not legal for regulation M-A';

renderTeamSelect();

const lastTeamId = localStorage.getItem(LAST_TEAM_KEY);
const initialTeam = teams.find(t => t.id === lastTeamId) || teams[0];
selectTeam(initialTeam.id);
loadFormat('m-a');

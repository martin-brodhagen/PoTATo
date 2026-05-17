import type { Species, FormatId, Team } from './lib/types.js';
import { setFormat, loadIndex, loadLearnsets, loadMoves } from './lib/data-loader.js';
import { createTeam, loadTeams, saveTeams } from './lib/team-store.js';

const LAST_TEAM_KEY = 'potato-last-team';

const formatSelect = document.getElementById('format-select') as HTMLSelectElement;
const teamSelect = document.getElementById('team-select') as HTMLSelectElement;
const newTeamBtn = document.getElementById('new-team-btn') as HTMLButtonElement;
const teamWarning = document.getElementById('team-warning') as HTMLSpanElement;
const teamBar = document.getElementById('team-bar') as HTMLDivElement;
const filterInput = document.getElementById('filter-input') as HTMLInputElement;
const grid = document.getElementById('pokemon-grid') as HTMLDivElement;
const overlay = document.getElementById('detail-overlay') as HTMLDivElement;
const detailContent = document.getElementById('detail-content') as HTMLDivElement;

let currentFormat: FormatId = 'm-a';
let teams: Team[] = [];
let currentTeamId: string | null = null;
let allSpecies: Species[] = [];
let searchQuery = '';
let pendingSlotIndex: number | null = null;
let detailSpecies: Species | null = null;

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
  overlay.classList.add('hidden');
  detailSpecies = null;
  clearFilter();

  const index = await loadIndex(format);
  allSpecies = index;
  renderGrid();
  renderTeamBar();
}

function renderGrid() {
  grid.innerHTML = '';
  const filtered = allSpecies.filter(s => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return s.id.includes(q) || s.name.toLowerCase().includes(q);
  });

  if (filtered.length === 0) {
    grid.innerHTML = '<div class="loading">No Pokémon match your search.</div>';
    return;
  }

  for (const s of filtered) {
    const card = document.createElement('div');
    card.className = 'pokemon-card';
    card.setAttribute('role', 'listitem');

    const nameEl = document.createElement('div');
    nameEl.className = 'name';
    nameEl.textContent = s.name;
    card.appendChild(nameEl);

    const typesEl = document.createElement('div');
    typesEl.className = 'types';
    for (const t of s.types) {
      const tag = document.createElement('span');
      tag.className = `type-tag ${t.toLowerCase()}`;
      tag.textContent = t;
      typesEl.appendChild(tag);
    }
    card.appendChild(typesEl);

    const bst = Object.values(s.baseStats).reduce((a, b) => a + b, 0);
    const bstEl = document.createElement('div');
    bstEl.className = 'bst';
    const meta = [bst.toString()];
    if (s.requiredItem) meta.push(s.requiredItem);
    if (s.moveCount > 0) meta.push(`${s.moveCount} moves`);
    bstEl.textContent = meta.join(' · ');
    card.appendChild(bstEl);

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
}

function applyFilter() {
  searchQuery = filterInput.value;
  renderGrid();
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
  renderGrid();
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
  overlay.classList.add('hidden');
  detailSpecies = null;
  renderTeamWarning();
  renderTeamBar();
  renderGrid();
}

function handleNewTeam() {
  const count = teams.filter(t => t.format === currentFormat).length + 1;
  const team = createTeam(`Team ${count}`, currentFormat);
  teams.push(team);
  persist();
  renderTeamSelect();
  selectTeam(team.id);
}

async function showDetail(s: Species) {
  detailSpecies = s;
  overlay.classList.remove('hidden');

  const [learnsets, moves] = await Promise.all([
    loadLearnsets(currentFormat),
    loadMoves(currentFormat),
  ]);

  const team = getCurrentTeam();

  const bst = Object.values(s.baseStats).reduce((a, b) => a + b, 0);
  let html = `
    <button class="close" id="detail-close">&times;</button>
    <h2>${s.name}${s.requiredItem ? ' @ ' + s.requiredItem : ''}</h2>
    <div class="types">${s.types.map(t => `<span class="type-tag ${t.toLowerCase()}">${t}</span>`).join('')}</div>`;

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
    <p style="margin-top:0.5rem">BST ${bst} · ${s.moveCount} legal moves</p>
    <div class="stats-block">
      <div class="stat-row"><span class="stat-label">HP</span><span>${s.baseStats.hp}</span></div>
      <div class="stat-row"><span class="stat-label">Atk</span><span>${s.baseStats.atk}</span></div>
      <div class="stat-row"><span class="stat-label">Def</span><span>${s.baseStats.def}</span></div>
      <div class="stat-row"><span class="stat-label">SpA</span><span>${s.baseStats.spa}</span></div>
      <div class="stat-row"><span class="stat-label">SpD</span><span>${s.baseStats.spd}</span></div>
      <div class="stat-row"><span class="stat-label">Spe</span><span>${s.baseStats.spe}</span></div>
    </div>
    <div class="abilities-row">
      ${Object.entries(s.abilities).map(([k, v]) => `${k === '0' ? '' : k === 'H' ? 'HA: ' : k + ': '}${v}`).join(' · ')}
    </div>
    <h3 style="margin-top:0.75rem;font-size:0.9rem">Moves (${s.moveCount})</h3>
    <div class="moves-list">`;

  const speciesMoves = learnsets[s.id] || [];
  for (const moveId of speciesMoves) {
    const move = moves[moveId];
    if (!move) continue;
    html += `<span class="move-tag" title="${move.shortDesc || ''}">${move.name}</span>`;
  }
  html += `</div>`;

  detailContent.innerHTML = html;

  if (team) {
    document.querySelectorAll('.overlay-slot').forEach(el => {
      el.addEventListener('click', () => {
        const idx = parseInt((el as HTMLElement).dataset.index!);
        setTeamSlot(team, idx, s.id);
        showDetail(s);
      });
    });
  }

  document.getElementById('detail-close')!.addEventListener('click', () => {
    overlay.classList.add('hidden');
    detailSpecies = null;
  });
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      overlay.classList.add('hidden');
      detailSpecies = null;
    }
  });
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

filterInput.addEventListener('input', applyFilter);
filterInput.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') clearFilter();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && filterInput.value) {
    clearFilter();
    renderGrid();
  }
});

// ── Init ──────────────────────────────────────────────────
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

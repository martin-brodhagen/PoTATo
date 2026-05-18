import { setFormat, loadIndex, loadLearnsets, loadMoves } from './lib/data-loader.js';
import { createTeam, loadTeams, saveTeams } from './lib/team-store.js';
const SPRITE_PATH = 'sprites/champions';
const LAST_TEAM_KEY = 'potato-last-team';
const TYPES = ['Normal', 'Fire', 'Water', 'Electric', 'Grass', 'Ice', 'Fighting', 'Poison', 'Ground', 'Flying', 'Psychic', 'Bug', 'Rock', 'Ghost', 'Dragon', 'Dark', 'Steel', 'Fairy'];
const TYPE_COLORS = {
    Normal: '#9099a1', Fire: '#e56c3e', Water: '#4f8ed4',
    Electric: '#e5c531', Grass: '#5fbb63', Ice: '#70cde7',
    Fighting: '#c44d4d', Poison: '#ab6ac8', Ground: '#cc9f4a',
    Flying: '#8fa8dd', Psychic: '#e26a8a', Bug: '#92bc2c',
    Rock: '#b6a14a', Ghost: '#6060b0', Dragon: '#6969cc',
    Dark: '#5a4f44', Steel: '#5a8ea2', Fairy: '#e08ee0',
};
const formatSelect = document.getElementById('format-select');
const teamSelect = document.getElementById('team-select');
const newTeamBtn = document.getElementById('new-team-btn');
const teamWarning = document.getElementById('team-warning');
const teamBar = document.getElementById('team-bar');
const filterInput = document.getElementById('filter-input');
const sortSelect = document.getElementById('sort-select');
const megaToggle = document.getElementById('mega-toggle');
const resultCount = document.getElementById('result-count');
const filterPopup = document.getElementById('filter-popup');
const filterBar = document.getElementById('filter-bar');
const filterToolbar = document.getElementById('filter-toolbar');
const grid = document.getElementById('pokemon-grid');
const searchDetailContent = document.getElementById('search-detail-content');
let currentFormat = 'm-a';
let teams = [];
let currentTeamId = null;
let allSpecies = [];
let spriteMap = {};
let searchQuery = '';
let pendingSlotIndex = null;
let detailSpecies = null;
let filterFlags = [];
let filterMode = 'and';
let allAbilities = [];
let moveNames = {};
let showMegas = true;
let sortBy = 'dex';
let movesLoadedForFilter = false;
let movesLoadingForFilter = false;
let filterLearnsets = null;
let filterHighlightIndex = -1;
function getCurrentTeam() {
    return teams.find(t => t.id === currentTeamId);
}
function getSpeciesById(id) {
    return allSpecies.find(s => s.id === id);
}
function isTeamLegal(team) {
    const nums = [];
    for (const slot of team.slots) {
        if (!slot.speciesId)
            continue;
        const species = getSpeciesById(slot.speciesId);
        if (!species)
            continue;
        if (nums.includes(species.num))
            return false;
        nums.push(species.num);
    }
    return true;
}
function renderTeamWarning() {
    const team = getCurrentTeam();
    if (team && !isTeamLegal(team)) {
        teamWarning.classList.remove('hidden');
    }
    else {
        teamWarning.classList.add('hidden');
    }
}
function persist() {
    saveTeams(teams);
}
async function loadFormat(format) {
    currentFormat = format;
    setFormat(format);
    detailSpecies = null;
    clearFilter();
    const [index, map] = await Promise.all([
        loadIndex(format),
        fetch(`data/format-${format}/sprite-map.json`).then(r => r.json()),
    ]);
    allSpecies = index;
    spriteMap = map;
    buildFilterData();
    renderGrid();
    renderTeamBar();
}
function buildFilterData() {
    const abilitySet = new Set();
    for (const s of allSpecies) {
        for (const v of Object.values(s.abilities)) {
            if (v)
                abilitySet.add(v);
        }
    }
    allAbilities = [...abilitySet].sort();
    moveNames = {};
    movesLoadedForFilter = false;
    movesLoadingForFilter = false;
}
function matchesFlag(species, flag) {
    switch (flag.category) {
        case 'type':
            return species.types.some(t => t.toLowerCase() === flag.id);
        case 'ability':
            return Object.values(species.abilities).some(a => a.toLowerCase() === flag.id);
        case 'move':
            if (!filterLearnsets)
                return false;
            const moves = filterLearnsets[species.id];
            return !!moves && moves.includes(flag.id);
    }
}
function isMegaForm(species) {
    return species.forme !== null && species.forme.includes('Mega');
}
function matchesFlags(species) {
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
    if (sortBy === 'alpha') {
        filtered = filtered.sort((a, b) => a.name.localeCompare(b.name));
    }
    else {
        filtered = filtered.sort((a, b) => a.num - b.num);
    }
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
        function statColor(val) {
            if (val <= 29)
                return '#e06060';
            if (val <= 59)
                return '#d4a040';
            if (val <= 94)
                return '#c5b030';
            if (val <= 134)
                return '#5fbb63';
            return '#4f8ed4';
        }
        function lighten(hex, amount) {
            const r = parseInt(hex.slice(1, 3), 16);
            const g = parseInt(hex.slice(3, 5), 16);
            const b = parseInt(hex.slice(5, 7), 16);
            const mix = (c) => Math.min(255, Math.round(c + (255 - c) * amount));
            return `rgb(${mix(r)},${mix(g)},${mix(b)})`;
        }
        function darken(hex, amount) {
            const r = parseInt(hex.slice(1, 3), 16);
            const g = parseInt(hex.slice(3, 5), 16);
            const b = parseInt(hex.slice(5, 7), 16);
            const mix = (c) => Math.round(c * (1 - amount));
            return `rgb(${mix(r)},${mix(g)},${mix(b)})`;
        }
        const statNames = ['HP', 'Atk', 'Def', 'SpA', 'SpD', 'Spe'];
        const statKeys = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
        const statList = document.createElement('div');
        statList.className = 'card-stats';
        for (let si = 0; si < 6; si++) {
            const val = s.baseStats[statKeys[si]];
            const entry = document.createElement('div');
            entry.className = 'stat-entry';
            const label = document.createElement('span');
            label.className = 'stat-label';
            label.textContent = statNames[si];
            const value = document.createElement('span');
            value.className = 'stat-value';
            value.textContent = val.toString();
            const bar = document.createElement('div');
            bar.className = 'stat-bar';
            const capped = val > 160;
            bar.style.width = (capped ? 160 : val) + 'px';
            const color = capped ? '#a060d0' : statColor(val);
            bar.style.background = `linear-gradient(to bottom, ${lighten(color, 0.35)} 0%, ${color} 55%, ${darken(color, 0.35)} 100%)`;
            entry.appendChild(label);
            entry.appendChild(value);
            entry.appendChild(bar);
            statList.appendChild(entry);
        }
        card.appendChild(statList);
        card.addEventListener('click', () => {
            if (pendingSlotIndex !== null) {
                fillSlot(pendingSlotIndex, s.id);
            }
            else {
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
    const matchingMoves = [];
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
function updatePopupHighlight(items) {
    items.forEach((el, i) => {
        el.classList.toggle('highlighted', i === filterHighlightIndex);
    });
    if (filterHighlightIndex >= 0 && filterHighlightIndex < items.length) {
        items[filterHighlightIndex].scrollIntoView({ block: 'nearest' });
    }
}
function addFlag(category, id, label) {
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
function removeFlag(index) {
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
        chip.querySelector('.chip-remove').addEventListener('click', (e) => {
            e.stopPropagation();
            removeFlag(i);
        });
        filterBar.insertBefore(chip, filterToolbar);
    }
}
function updateModeButtons() {
    filterToolbar.querySelectorAll('.filter-mode').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mode === filterMode);
    });
}
function startSlotSearch(slotIndex) {
    if (window.innerWidth >= 768) {
        selectTab('pokedex', document.querySelector('.section-left'));
    }
    else {
        selectTab('pokedex');
    }
    const pokedexContent = document.getElementById('tab-content-pokedex');
    selectSubTab('pokemon', pokedexContent);
    pendingSlotIndex = slotIndex;
    filterInput.value = '';
    searchQuery = '';
    filterInput.focus();
    renderGrid();
}
function fillSlot(slotIndex, speciesId) {
    const team = getCurrentTeam();
    if (!team)
        return;
    team.slots[slotIndex].speciesId = speciesId;
    persist();
    renderTeamWarning();
    clearFilter();
    renderTeamBar();
    reRenderDetail();
}
function removeFromTeam(slotIndex) {
    const team = getCurrentTeam();
    if (!team)
        return;
    team.slots[slotIndex].speciesId = null;
    persist();
    renderTeamWarning();
    renderTeamBar();
    reRenderDetail();
}
function setTeamSlot(team, slotIndex, speciesId) {
    team.slots[slotIndex].speciesId = speciesId;
    persist();
    renderTeamWarning();
    renderTeamBar();
    reRenderDetail();
}
function reRenderDetail() {
    if (detailSpecies)
        showDetail(detailSpecies);
}
function renderTeamBar() {
    teamBar.innerHTML = '';
    const team = getCurrentTeam();
    if (!team)
        return;
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
                if (species)
                    showDetail(species);
            });
            el.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                removeFromTeam(i);
            });
        }
        else {
            el.classList.add('empty');
            el.innerHTML = '<span class="slot-plus">+</span>';
            el.addEventListener('click', () => startSlotSearch(i));
        }
        teamBar.appendChild(el);
    }
}
function getTypeColor(type) {
    const map = {
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
    }
    else if (teams.length > 0) {
        teamSelect.value = teams[0].id;
    }
    currentTeamId = teamSelect.value || null;
    renderTeamWarning();
    renderTeamBar();
}
function selectTeam(id) {
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
    const rightSection = document.querySelector('.section-right');
    if (window.innerWidth >= 768 && rightSection) {
        selectTab('search-detail', rightSection);
    }
    else {
        selectTab('search-detail');
    }
}
async function showDetail(s) {
    detailSpecies = s;
    switchToDetail();
    const [learnsets, moves] = await Promise.all([
        loadLearnsets(currentFormat),
        loadMoves(currentFormat),
    ]);
    filterLearnsets = learnsets;
    const team = getCurrentTeam();
    const bst = Object.values(s.baseStats).reduce((a, b) => a + b, 0);
    const spriteFile = spriteMap[s.id];
    let html = `
    <div class="detail-header">
      ${spriteFile ? `<img class="detail-sprite" src="${SPRITE_PATH}/${spriteFile}" alt="${s.name}">` : ''}
      <div>
        <h2>${s.name}</h2>
        <div class="types">${s.types.map(t => `<span class="type-tag ${t.toLowerCase()}">${t}</span>`).join('')}</div>
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
        if (!move)
            continue;
        html += `<span class="move-tag" title="${move.shortDesc || ''}">${move.name}</span>`;
    }
    html += `</div>`;
    searchDetailContent.innerHTML = html;
    if (team) {
        searchDetailContent.querySelectorAll('.overlay-slot').forEach(el => {
            el.addEventListener('click', () => {
                const idx = parseInt(el.dataset.index);
                if (el.classList.contains('highlighted')) {
                    removeFromTeam(idx);
                }
                else {
                    setTeamSlot(team, idx, s.id);
                }
                showDetail(s);
            });
        });
    }
}
// ── Tab system ─────────────────────────────────────────────
const leftSection = document.querySelector('.section-left');
function selectTab(tabId, section) {
    const isMobile = window.innerWidth < 768;
    if (section && !isMobile) {
        // Desktop: scope to the given section
        section.querySelectorAll('.tab').forEach(el => {
            el.classList.toggle('active', el.dataset.tab === tabId);
        });
        section.querySelectorAll('.tab-content').forEach(el => {
            el.classList.toggle('hidden', el.id !== `tab-content-${tabId}`);
        });
    }
    else {
        // Mobile or programmatic: global scoping
        document.querySelectorAll('.tab').forEach(el => {
            el.classList.toggle('active', el.dataset.tab === tabId);
        });
        document.querySelectorAll('.tab-content').forEach(el => {
            el.classList.toggle('hidden', el.id !== `tab-content-${tabId}`);
        });
    }
    // On mobile: show only the section containing the active tab
    if (isMobile) {
        const activePanel = document.getElementById(`tab-content-${tabId}`);
        const activeSection = activePanel?.closest('.section');
        document.querySelectorAll('.section').forEach(el => {
            el.classList.toggle('hidden', el !== activeSection);
        });
    }
}
function switchToTeamBuilder() {
    if (window.innerWidth >= 768 && leftSection) {
        selectTab('team-builder', leftSection);
    }
    else {
        selectTab('team-builder');
    }
}
// ── Sub-tab system (inside Pokedex) ────────────────────────
function selectSubTab(subTabId, container) {
    container.querySelectorAll('.sub-tab').forEach(el => {
        el.classList.toggle('active', el.dataset.subtab === subTabId);
    });
    container.querySelectorAll('.subtab-content').forEach(el => {
        el.classList.toggle('hidden', el.id !== `subtab-content-${subTabId}`);
    });
}
document.querySelectorAll('.sub-tab').forEach(el => {
    el.addEventListener('click', () => {
        const subTabId = el.dataset.subtab;
        if (!subTabId)
            return;
        const container = el.closest('.tab-content');
        selectSubTab(subTabId, container);
    });
});
// Wire up all tab click handlers
document.querySelectorAll('.tab').forEach(el => {
    el.addEventListener('click', () => {
        const tabId = el.dataset.tab;
        if (!tabId)
            return;
        const section = el.closest('.section');
        selectTab(tabId, section);
    });
});
// ── Events ────────────────────────────────────────────────
formatSelect.addEventListener('change', () => {
    loadFormat(formatSelect.value);
});
teamSelect.addEventListener('change', () => {
    selectTeam(teamSelect.value);
});
newTeamBtn.addEventListener('click', handleNewTeam);
sortSelect.addEventListener('change', () => {
    sortBy = sortSelect.value;
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
    const items = popupVisible ? filterPopup.querySelectorAll('.popup-item') : [];
    const n = items.length;
    if (e.key === 'ArrowDown' && popupVisible) {
        e.preventDefault();
        filterHighlightIndex = n > 0 ? (filterHighlightIndex + 1) % n : -1;
        updatePopupHighlight(items);
    }
    else if (e.key === 'ArrowUp' && popupVisible) {
        e.preventDefault();
        filterHighlightIndex = n > 0 ? (filterHighlightIndex - 1 + n) % n : -1;
        updatePopupHighlight(items);
    }
    else if (e.key === 'Tab' && popupVisible) {
        e.preventDefault();
        if (n === 0)
            return;
        if (e.shiftKey) {
            filterHighlightIndex = (filterHighlightIndex - 1 + n) % n;
        }
        else {
            filterHighlightIndex = (filterHighlightIndex + 1) % n;
        }
        updatePopupHighlight(items);
    }
    else if (e.key === 'Enter' && popupVisible) {
        e.preventDefault();
        if (n === 0)
            return;
        const idx = filterHighlightIndex >= 0 ? filterHighlightIndex : 0;
        const item = items[idx];
        addFlag(item.dataset.category, item.dataset.id, item.dataset.label);
    }
    else if (e.key === 'Escape') {
        clearFilter();
    }
});
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && (filterInput.value || filterFlags.length > 0)) {
        clearFilter();
    }
});
filterPopup.addEventListener('click', (e) => {
    const item = e.target.closest('.popup-item');
    if (!item)
        return;
    const cat = item.dataset.category;
    const id = item.dataset.id;
    const label = item.dataset.label;
    addFlag(cat, id, label);
    filterInput.focus();
});
document.addEventListener('click', (e) => {
    const target = e.target;
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
    const clearBtn = e.target.closest('.filter-clear-all');
    if (clearBtn) {
        filterFlags = [];
        renderChips();
        renderGrid();
        return;
    }
});
filterToolbar.addEventListener('click', (e) => {
    const btn = e.target.closest('.filter-mode');
    if (!btn)
        return;
    const mode = btn.dataset.mode;
    if (mode !== 'and' && mode !== 'or')
        return;
    filterMode = mode;
    updateModeButtons();
    renderGrid();
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
//# sourceMappingURL=app.js.map
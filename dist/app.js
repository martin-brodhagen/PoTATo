import { setFormat, loadIndex, loadLearnsets, loadMoves, loadMovesWithLearnsets } from './lib/data-loader.js';
import { createTeam, loadTeams, saveTeams } from './lib/team-store.js';
const SPRITE_PATH = 'sprites/champions';
const LAST_TEAM_KEY = 'potato-last-team';
const TYPES = ['Normal', 'Fire', 'Water', 'Electric', 'Grass', 'Ice', 'Fighting', 'Poison', 'Ground', 'Flying', 'Psychic', 'Bug', 'Rock', 'Ghost', 'Dragon', 'Dark', 'Steel', 'Fairy'];
const MOVE_CLASSIFICATIONS = {
    bite: 'Biting', bullet: 'Ball & Bomb', contact: 'Contact', dance: 'Dance',
    punch: 'Punching', pulse: 'Pulse', wind: 'Wind', slicing: 'Slicing',
    powder: 'Powder', heal: 'Healing', sound: 'Sound-Based',
};
const EFFECT_CATEGORIES = {
    inflicts_status: 'Inflicts Status Condition',
    flinch: 'Chance to Flinch',
    confuse: 'Chance to Confuse',
    trap: 'Trap',
    periodic_effect: 'Periodic Effect',
    stat_drop_target: 'Stat Drop on Target',
    stat_increase_target: 'Stat Increase on Target',
    stat_drop_attacker: 'Stat Drop on Attacker',
    stat_increase_attacker: 'Stat Increase on Attacker',
    self_buff: 'Guaranteed Self Stat Buff',
    self_switch: 'Pivoting',
    force_switch: 'Forced Switching',
    priority: 'Priority',
    multi_hit: 'Multi-Hit',
    recoil: 'Recoil',
    crash_damage: 'Crash Damage',
    high_crit: 'High Crit Ratio',
    ohko: 'OHKO',
    hazard_set: 'Hazard Setting',
    hazard_remove: 'Hazard Removal',
    weather: 'Weather Setting',
    terrain: 'Terrain Setting',
    screen: 'Screen Setting',
    room: 'Room / Field Effects',
    protect: 'Protection',
    protect_break: 'Protection-Breaking',
    self_destruct: 'Self-Destruct / Sacrifice',
    thaw: 'Thaws Target',
    screen_break: 'Screen Breaking',
    special_damage: 'Special Damage Formula',
    weight_based: 'Weight-Based Damage',
};
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
const LS_SORT_BY = 'potato_sort_by';
const LS_SORT_ASC = 'potato_sort_asc';
const LS_VIEW = 'potato_view';
const sortSelect = document.getElementById('sort-select');
const sortDirBtn = document.getElementById('sort-dir');
const megaToggle = document.getElementById('mega-toggle');
const viewToggle = document.getElementById('view-toggle');
const resultCount = document.getElementById('result-count');
const filterPopup = document.getElementById('filter-popup');
const filterBar = document.getElementById('filter-bar');
const filterToolbar = document.getElementById('filter-toolbar');
const grid = document.getElementById('pokemon-grid');
const searchDetailContent = document.getElementById('search-detail-content');
const moveSortSelect = document.getElementById('move-sort-select');
const moveSortDir = document.getElementById('move-sort-dir');
const moveFilterInput = document.getElementById('move-filter-input');
const moveResultCount = document.getElementById('move-result-count');
const movesGrid = document.getElementById('moves-grid');
const moveFilterPopup = document.getElementById('move-filter-popup');
const moveFilterBar = document.getElementById('move-filter-bar');
const moveFilterToolbar = document.getElementById('move-filter-toolbar');
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
let sortAsc = true;
let viewMode = 'card';
let movesLoadedForFilter = false;
let movesLoadingForFilter = false;
let filterLearnsets = null;
let filterHighlightIndex = -1;
// ── Moves subtab state ──────────────────────────────────
let allMoves = {};
let moveSortBy = 'alpha';
let moveSortAsc = true;
let moveSearchQuery = '';
let moveCatFilter = new Set(['Physical', 'Special', 'Status']);
let movesSubtabLoaded = false;
let moveFilterFlags = [];
let moveFilterMode = 'and';
let moveFilterHighlightIndex = -1;
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
    allMoves = {};
    movesSubtabLoaded = false;
    moveFilterFlags = [];
    moveFilterMode = 'and';
    moveClearFilter();
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
function speciesHasMoveWithFlag(speciesId, key, value) {
    if (!filterLearnsets || !allMoves)
        return false;
    const moveIds = filterLearnsets[speciesId];
    if (!moveIds)
        return false;
    return moveIds.some(mid => {
        const move = allMoves[mid];
        return move && move[key]?.includes(value);
    });
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
        case 'classification':
            return speciesHasMoveWithFlag(species.id, 'flags', flag.id);
        case 'effect':
            return speciesHasMoveWithFlag(species.id, 'effectCategories', flag.id);
        default:
            return false;
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
    const statKeys = {
        hp: 'hp', atk: 'atk', def: 'def', spa: 'spa', spd: 'spd', spe: 'spe'
    };
    filtered = filtered.sort((a, b) => {
        let cmp;
        if (sortBy === 'alpha') {
            cmp = a.name.localeCompare(b.name);
        }
        else if (sortBy === 'dex') {
            cmp = a.num - b.num;
        }
        else {
            const key = statKeys[sortBy];
            cmp = a.baseStats[key] - b.baseStats[key];
        }
        return sortAsc ? cmp : -cmp;
    });
    grid.classList.toggle('list-view', viewMode === 'list');
    resultCount.textContent = `${filtered.length} Result${filtered.length === 1 ? '' : 's'}`;
    resultCount.classList.toggle('hidden', allSpecies.length === 0);
    if (filtered.length === 0) {
        grid.innerHTML = '<div class="loading">No Pokémon match your search.</div>';
        return;
    }
    for (const s of filtered) {
        if (viewMode === 'list') {
            const item = document.createElement('div');
            item.className = 'pokemon-list-item';
            item.setAttribute('role', 'listitem');
            const spriteFile = spriteMap[s.id];
            if (spriteFile) {
                const img = document.createElement('img');
                img.className = 'list-sprite';
                img.src = `${SPRITE_PATH}/${spriteFile}`;
                img.alt = s.name;
                img.loading = 'lazy';
                item.appendChild(img);
            }
            const info = document.createElement('div');
            info.className = 'list-info';
            const infoTop = document.createElement('div');
            infoTop.className = 'list-info-top';
            const nameEl = document.createElement('span');
            nameEl.className = 'list-name';
            nameEl.textContent = s.name;
            infoTop.appendChild(nameEl);
            const typesEl = document.createElement('span');
            typesEl.className = 'list-types';
            for (let ti = 0; ti < 2; ti++) {
                const t = s.types[ti];
                const tag = document.createElement('span');
                tag.className = t ? `type-tag ${t.toLowerCase()}` : 'type-tag type-tag-empty';
                tag.textContent = t || '';
                typesEl.appendChild(tag);
            }
            infoTop.appendChild(typesEl);
            info.appendChild(infoTop);
            const infoBottom = document.createElement('div');
            infoBottom.className = 'list-info-bottom';
            const abilEl = document.createElement('span');
            abilEl.className = 'list-abilities';
            for (const key of ['0', '1', 'H']) {
                const span = document.createElement('span');
                span.className = 'list-ability' + (s.abilities[key] ? '' : ' list-ability-empty');
                span.textContent = s.abilities[key] || '-';
                abilEl.appendChild(span);
            }
            infoBottom.appendChild(abilEl);
            const statEl = document.createElement('div');
            statEl.className = 'list-stats';
            const statNames = ['HP', 'Atk', 'Def', 'SpA', 'SpD', 'Spe'];
            const statKeys = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
            for (let si = 0; si < 6; si++) {
                const entry = document.createElement('div');
                entry.className = 'list-stat-entry' + (statKeys[si] === sortBy ? ' list-stat-highlighted' : '');
                const label = document.createElement('span');
                label.className = 'list-stat-label';
                label.textContent = statNames[si];
                const value = document.createElement('span');
                value.className = 'list-stat-value';
                value.textContent = String(s.baseStats[statKeys[si]]);
                entry.appendChild(label);
                entry.appendChild(value);
                statEl.appendChild(entry);
            }
            infoBottom.appendChild(statEl);
            info.appendChild(infoBottom);
            item.appendChild(info);
            item.addEventListener('click', () => {
                if (pendingSlotIndex !== null) {
                    fillSlot(pendingSlotIndex, s.id);
                }
                else {
                    showDetail(s);
                }
            });
            grid.appendChild(item);
            continue;
        }
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
        for (let ti = 0; ti < 2; ti++) {
            const t = s.types[ti];
            const tag = document.createElement('span');
            tag.className = t ? `type-tag ${t.toLowerCase()}` : 'type-tag type-tag-empty';
            tag.textContent = t || '';
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
        // Right column: stacked base stats
        const statNames = ['HP', 'Atk', 'Def', 'SpA', 'SpD', 'Spe'];
        const statKeys = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
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
            }
            else {
                showDetail(s);
            }
        });
        grid.appendChild(card);
    }
}
function moveMatchesFlag(move, flag) {
    if (flag.category === 'type')
        return move.type.toLowerCase() === flag.id;
    if (flag.category === 'pokemon')
        return !!move.learnedBy && move.learnedBy.includes(flag.id);
    if (flag.category === 'classification')
        return !!move.flags && move.flags.includes(flag.id);
    if (flag.category === 'effect')
        return !!move.effectCategories && move.effectCategories.includes(flag.id);
    return false;
}
function moveUpdatePopup() {
    const text = moveFilterInput.value.trim();
    if (text.length < 2) {
        moveFilterPopup.classList.add('hidden');
        return;
    }
    const lower = text.toLowerCase();
    const matchingTypes = TYPES.filter(t => t.toLowerCase().includes(lower));
    const matchingPokemon = allSpecies.filter(s => s.name.toLowerCase().includes(lower) || s.id.includes(lower));
    const matchingClassifications = Object.entries(MOVE_CLASSIFICATIONS)
        .filter(([_, label]) => label.toLowerCase().includes(lower));
    const matchingEffects = Object.entries(EFFECT_CATEGORIES)
        .filter(([_, label]) => label.toLowerCase().includes(lower));
    const total = matchingTypes.length + matchingPokemon.length + matchingClassifications.length + matchingEffects.length;
    if (total === 0) {
        moveFilterPopup.classList.add('hidden');
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
    if (matchingClassifications.length > 0) {
        html += `<div class="popup-group"><div class="popup-group-label">Move Classifications</div>`;
        for (const [flagId, label] of matchingClassifications) {
            html += `<div class="popup-item" data-category="classification" data-id="${flagId}" data-label="${label}">${label}</div>`;
        }
        html += `</div>`;
    }
    if (matchingEffects.length > 0) {
        html += `<div class="popup-group"><div class="popup-group-label">Effect</div>`;
        for (const [eid, label] of matchingEffects) {
            html += `<div class="popup-item" data-category="effect" data-id="${eid}" data-label="${label}">${label}</div>`;
        }
        html += `</div>`;
    }
    if (matchingPokemon.length > 0) {
        html += `<div class="popup-group"><div class="popup-group-label">Pokémon</div>`;
        for (const s of matchingPokemon.slice(0, 15)) {
            html += `<div class="popup-item" data-category="pokemon" data-id="${s.id}" data-label="${s.name}">${s.name}</div>`;
        }
        html += `</div>`;
    }
    moveFilterPopup.innerHTML = html;
    moveFilterHighlightIndex = -1;
    moveFilterPopup.classList.remove('hidden');
    const rect = moveFilterInput.getBoundingClientRect();
    const popupStyle = moveFilterPopup.style;
    const spaceBelow = window.innerHeight - rect.bottom;
    const popupHeight = Math.min(280, spaceBelow - 8);
    popupStyle.top = (spaceBelow > 180 ? rect.bottom + 6 : rect.top - popupHeight - 6) + 'px';
    popupStyle.left = Math.max(8, rect.left) + 'px';
    popupStyle.width = Math.max(220, rect.width) + 'px';
    popupStyle.maxHeight = popupHeight + 'px';
}
function moveAddFlag(category, id, label) {
    moveFilterFlags.push({ category, id, label });
    moveFilterInput.value = '';
    moveSearchQuery = '';
    moveFilterPopup.classList.add('hidden');
    moveRenderChips();
    renderMovesGrid();
}
function moveRemoveFlag(index) {
    moveFilterFlags.splice(index, 1);
    moveRenderChips();
    renderMovesGrid();
}
function moveRenderChips() {
    moveFilterBar.querySelectorAll('.filter-chip').forEach(el => el.remove());
    moveFilterBar.classList.toggle('hidden', moveFilterFlags.length === 0);
    for (let i = 0; i < moveFilterFlags.length; i++) {
        const f = moveFilterFlags[i];
        const chip = document.createElement('span');
        chip.className = 'filter-chip';
        chip.dataset.category = f.category;
        chip.innerHTML = `${f.label} <span class="chip-remove" data-index="${i}">×</span>`;
        chip.querySelector('.chip-remove').addEventListener('click', (e) => {
            e.stopPropagation();
            moveRemoveFlag(i);
        });
        moveFilterBar.insertBefore(chip, moveFilterToolbar);
    }
}
function moveUpdateModeButtons() {
    moveFilterToolbar.querySelectorAll('.filter-mode').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mode === moveFilterMode);
    });
}
function moveClearFilter() {
    moveFilterFlags = [];
    moveFilterMode = 'and';
    moveFilterHighlightIndex = -1;
    moveFilterPopup.classList.add('hidden');
    moveRenderChips();
    moveUpdateModeButtons();
    renderMovesGrid();
}
function loadMovesSubtab() {
    if (movesSubtabLoaded)
        return;
    loadMovesWithLearnsets(currentFormat).then(moves => {
        allMoves = moves;
        movesSubtabLoaded = true;
        renderMovesGrid();
    });
}
function getBpDisplay(move) {
    if (move.category === 'Status')
        return { text: '—', title: '' };
    if (move.basePower !== 0)
        return { text: String(move.basePower), title: '' };
    // Level-based fixed damage at level 50
    if (move.name === 'Night Shade' || move.name === 'Seismic Toss')
        return { text: '50', title: '' };
    return { text: '?', title: move.shortDesc || '' };
}
function renderMovesGrid() {
    let list = Object.entries(allMoves).map(([id, m]) => ({ id, ...m }));
    list = list.filter(m => m.learnedBy && m.learnedBy.length > 0);
    if (moveFilterFlags.length > 0) {
        list = list.filter(m => {
            const results = moveFilterFlags.map(f => moveMatchesFlag(m, f));
            return moveFilterMode === 'and' ? results.every(Boolean) : results.some(Boolean);
        });
    }
    if (moveSearchQuery) {
        const q = moveSearchQuery.toLowerCase();
        list = list.filter(m => m.name.toLowerCase().includes(q) || m.id.includes(q));
    }
    if (moveCatFilter.size < 3) {
        list = list.filter(m => moveCatFilter.has(m.category));
    }
    list = list.sort((a, b) => {
        let cmp = 0;
        if (moveSortBy === 'alpha') {
            cmp = a.name.localeCompare(b.name);
        }
        else if (moveSortBy === 'bp') {
            cmp = a.basePower - b.basePower;
        }
        else if (moveSortBy === 'acc') {
            const accA = typeof a.accuracy === 'number' ? a.accuracy : (a.accuracy === true ? 101 : 0);
            const accB = typeof b.accuracy === 'number' ? b.accuracy : (b.accuracy === true ? 101 : 0);
            cmp = accA - accB;
        }
        return moveSortAsc ? cmp : -cmp;
    });
    moveResultCount.textContent = `${list.length} Result${list.length === 1 ? '' : 's'}`;
    moveResultCount.classList.toggle('hidden', false);
    movesGrid.innerHTML = '';
    if (list.length === 0) {
        movesGrid.innerHTML = '<div class="loading">No moves match your search.</div>';
        return;
    }
    for (const m of list) {
        const el = document.createElement('div');
        el.className = 'move-entry';
        const bpHL = moveSortBy === 'bp' ? ' move-entry-stat-highlighted' : '';
        const accHL = moveSortBy === 'acc' ? ' move-entry-stat-highlighted' : '';
        const bp = getBpDisplay(m);
        const bpTitle = bp.title ? ` title="${bp.title}"` : '';
        const descTitle = m.shortDesc ? ` title="${m.shortDesc}"` : '';
        el.innerHTML = `<span class="move-entry-name">${m.name}</span><span class="move-entry-type type-tag ${m.type.toLowerCase()}">${m.type}</span><span class="move-entry-cat cat-${m.category.toLowerCase()}"><img class="cat-icon-small" src="sprites/categories/${m.category}_CP.png" alt="${m.category}"></span><span class="move-entry-stat${bpHL}"><span class="move-entry-stat-label">BP</span><span class="move-entry-stat-value"${bpTitle}>${bp.text}</span></span><span class="move-entry-stat${accHL}"><span class="move-entry-stat-label">ACC</span><span class="move-entry-stat-value">${typeof m.accuracy === 'number' ? m.accuracy + '%' : m.accuracy === true ? '—' : '—'}</span></span><span class="move-entry-stat"><span class="move-entry-stat-label">PP</span><span class="move-entry-stat-value">${m.pp}</span></span><span class="move-entry-divider"></span><span class="move-entry-desc"${descTitle}>${m.shortDesc || ''}</span>`;
        movesGrid.appendChild(el);
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
    const matchingClassifications = Object.entries(MOVE_CLASSIFICATIONS)
        .filter(([_, label]) => label.toLowerCase().includes(lower));
    const matchingEffects = Object.entries(EFFECT_CATEGORIES)
        .filter(([_, label]) => label.toLowerCase().includes(lower));
    const total = matchingTypes.length + matchingAbilities.length + matchingMoves.length + matchingClassifications.length + matchingEffects.length;
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
    if (matchingClassifications.length > 0) {
        html += `<div class="popup-group"><div class="popup-group-label">Move Classification</div>`;
        for (const [flagId, label] of matchingClassifications) {
            html += `<div class="popup-item" data-category="classification" data-id="${flagId}" data-label="${label}">${label}</div>`;
        }
        html += `</div>`;
    }
    if (matchingEffects.length > 0) {
        html += `<div class="popup-group"><div class="popup-group-label">Move Effect</div>`;
        for (const [eid, label] of matchingEffects) {
            html += `<div class="popup-item" data-category="effect" data-id="${eid}" data-label="${label}">${label}</div>`;
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
        loadMovesWithLearnsets(currentFormat).then(moves => {
            allMoves = moves;
            moveNames = {};
            for (const [id, move] of Object.entries(moves)) {
                if (!move.learnedBy || move.learnedBy.length === 0)
                    continue;
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
    const needsLearnsets = !filterLearnsets && (category === 'move' || category === 'classification' || category === 'effect');
    const needsAllMoves = !movesLoadedForFilter && (category === 'classification' || category === 'effect');
    if (needsLearnsets || needsAllMoves) {
        const p = [];
        if (needsLearnsets)
            p.push(loadLearnsets(currentFormat).then(ls => { filterLearnsets = ls; }));
        if (needsAllMoves) {
            p.push(loadMovesWithLearnsets(currentFormat).then(moves => {
                allMoves = moves;
                moveNames = {};
                for (const [id, move] of Object.entries(moves)) {
                    if (!move.learnedBy || move.learnedBy.length === 0)
                        continue;
                    moveNames[id] = move.name;
                }
                movesLoadedForFilter = true;
            }));
        }
        Promise.all(p).then(() => renderGrid());
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
    function statBarColor(val) {
        if (val <= 29)
            return '#c44d4d';
        if (val <= 59)
            return '#cc9f4a';
        if (val <= 94)
            return '#e5c531';
        if (val <= 134)
            return '#5fbb63';
        if (val <= 159)
            return '#4f8ed4';
        return '#ab6ac8';
    }
    const bst = Object.values(s.baseStats).reduce((a, b) => a + b, 0);
    const spriteFile = spriteMap[s.id];
    let html = `
    <div class="detail-top">
      <div class="stats-block">
        ${['hp', 'atk', 'def', 'spa', 'spd', 'spe'].map(key => {
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
          <div class="types">${[0, 1].map(i => {
        const t = s.types[i];
        return `<span class="type-tag${t ? ' ' + t.toLowerCase() : ' type-tag-empty'}">${t || ''}</span>`;
    }).join('')}</div>
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
viewToggle.addEventListener('click', () => {
    viewMode = viewMode === 'card' ? 'list' : 'card';
    viewToggle.dataset.view = viewMode;
    viewToggle.innerHTML = viewMode === 'card'
        ? '<span class="view-icon-grid"></span>'
        : '<span class="view-icon-list"></span>';
    localStorage.setItem(LS_VIEW, viewMode);
    renderGrid();
});
// ── Moves subtab events ─────────────────────────────────
const moveStatSortKeys = new Set(['bp', 'acc']);
moveSortSelect.addEventListener('change', () => {
    moveSortBy = moveSortSelect.value;
    const shouldDesc = moveStatSortKeys.has(moveSortBy);
    if (moveSortAsc === shouldDesc) {
        moveSortAsc = !shouldDesc;
        moveSortDir.textContent = moveSortAsc ? '▲' : '▼';
    }
    renderMovesGrid();
});
moveSortDir.addEventListener('click', () => {
    moveSortAsc = !moveSortAsc;
    moveSortDir.textContent = moveSortAsc ? '▲' : '▼';
    renderMovesGrid();
});
moveFilterInput.addEventListener('input', () => {
    moveSearchQuery = moveFilterInput.value;
    moveUpdatePopup();
    renderMovesGrid();
});
moveFilterInput.addEventListener('keydown', (e) => {
    const popupVisible = !moveFilterPopup.classList.contains('hidden');
    const items = popupVisible ? moveFilterPopup.querySelectorAll('.popup-item') : [];
    const n = items.length;
    function updateHighlight() {
        items.forEach((el, i) => el.classList.toggle('highlighted', i === moveFilterHighlightIndex));
        if (moveFilterHighlightIndex >= 0 && moveFilterHighlightIndex < n)
            items[moveFilterHighlightIndex].scrollIntoView({ block: 'nearest' });
    }
    if ((e.key === 'ArrowDown' || (e.key === 'Tab' && !e.shiftKey)) && popupVisible) {
        e.preventDefault();
        moveFilterHighlightIndex = n > 0 ? (moveFilterHighlightIndex + 1) % n : -1;
        updateHighlight();
    }
    else if ((e.key === 'ArrowUp' || (e.key === 'Tab' && e.shiftKey)) && popupVisible) {
        e.preventDefault();
        moveFilterHighlightIndex = n > 0 ? (moveFilterHighlightIndex - 1 + n) % n : -1;
        updateHighlight();
    }
    else if (e.key === 'Enter' && popupVisible) {
        e.preventDefault();
        if (n === 0)
            return;
        const idx = moveFilterHighlightIndex >= 0 ? moveFilterHighlightIndex : 0;
        const item = items[idx];
        moveAddFlag(item.dataset.category, item.dataset.id, item.dataset.label);
    }
    else if (e.key === 'Escape') {
        moveClearFilter();
    }
});
document.querySelectorAll('.cat-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
        const cat = btn.dataset.cat;
        if (moveCatFilter.has(cat)) {
            if (moveCatFilter.size === 1)
                return;
            moveCatFilter.delete(cat);
            btn.classList.remove('active');
        }
        else {
            moveCatFilter.add(cat);
            btn.classList.add('active');
        }
        renderMovesGrid();
    });
});
// Load moves when the Moves subtab is shown
document.querySelector('[data-subtab="moves"]')?.addEventListener('click', () => {
    loadMovesSubtab();
});
// Move filter popup click
moveFilterPopup.addEventListener('click', (e) => {
    const item = e.target.closest('.popup-item');
    if (!item)
        return;
    moveAddFlag(item.dataset.category, item.dataset.id, item.dataset.label);
    moveFilterInput.focus();
});
// Close move filter popup when clicking outside
document.addEventListener('click', (e) => {
    const target = e.target;
    if (!target.closest('#move-filter-input') && !target.closest('#move-filter-popup')) {
        moveFilterPopup.classList.add('hidden');
    }
});
window.addEventListener('scroll', () => {
    moveFilterPopup.classList.add('hidden');
}, { passive: true });
window.addEventListener('resize', () => {
    moveFilterPopup.classList.add('hidden');
}, { passive: true });
// Move filter bar clear
moveFilterBar.addEventListener('click', (e) => {
    const clearBtn = e.target.closest('.filter-clear-all');
    if (clearBtn) {
        moveFilterFlags = [];
        moveRenderChips();
        renderMovesGrid();
        return;
    }
});
// Move filter toolbar mode
moveFilterToolbar.addEventListener('click', (e) => {
    const btn = e.target.closest('.filter-mode');
    if (!btn)
        return;
    const mode = btn.dataset.mode;
    if (mode !== 'and' && mode !== 'or')
        return;
    moveFilterMode = mode;
    moveUpdateModeButtons();
    renderMovesGrid();
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
    if (e.key === 'Escape' && (moveFilterInput.value || moveFilterFlags.length > 0)) {
        moveClearFilter();
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
const savedView = localStorage.getItem(LS_VIEW);
if (savedView === 'card' || savedView === 'list') {
    viewMode = savedView;
    viewToggle.dataset.view = viewMode;
    viewToggle.innerHTML = viewMode === 'card'
        ? '<span class="view-icon-grid"></span>'
        : '<span class="view-icon-list"></span>';
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
//# sourceMappingURL=app.js.map
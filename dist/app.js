import { setFormat, loadIndex } from './lib/data-loader.js';
import { createTeam, loadTeams, saveTeams } from './lib/team-store.js';
import { MoveSearchWidget, MOVE_CLASSIFICATIONS, EFFECT_CATEGORIES, RANGE_CATEGORIES } from './lib/move-search-widget.js';
import { PokemonSearchWidget } from './lib/pokemon-search-widget.js';
const SPRITE_PATH = 'sprites/champions';
const LAST_TEAM_KEY = 'potato-last-team';
const formatSelect = document.getElementById('format-select');
const teamSelect = document.getElementById('team-select');
const newTeamBtn = document.getElementById('new-team-btn');
const teamWarning = document.getElementById('team-warning');
const teamBar = document.getElementById('team-bar');
const searchDetailContent = document.getElementById('search-detail-content');
let currentFormat = 'm-a';
let teams = [];
let currentTeamId = null;
let allSpecies = [];
let spriteMap = {};
let pendingSlotIndex = null;
let detailSpecies = null;
let movesWidget = null;
let detailMovesWidget = null;
let pokemonWidget = null;
let moveDetailPokemonWidget = null;
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
    pendingSlotIndex = null;
    const [index, map] = await Promise.all([
        loadIndex(format),
        fetch(`data/format-${format}/sprite-map.json`).then(r => r.json()),
    ]);
    allSpecies = index;
    spriteMap = map;
    if (pokemonWidget) {
        pokemonWidget.clear();
        pokemonWidget.setData(index, map);
    }
    renderTeamBar();
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
    if (pokemonWidget) {
        pokemonWidget.clear();
        pokemonWidget.focusInput();
    }
}
function fillSlot(slotIndex, speciesId) {
    const team = getCurrentTeam();
    if (!team)
        return;
    team.slots[slotIndex].speciesId = speciesId;
    persist();
    renderTeamWarning();
    if (pokemonWidget)
        pokemonWidget.clear();
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
    if (detailMovesWidget) {
        detailMovesWidget.destroy();
        detailMovesWidget = null;
    }
    if (pokemonWidget)
        pokemonWidget.clear();
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
    if (detailMovesWidget) {
        detailMovesWidget.destroy();
        detailMovesWidget = null;
    }
    if (moveDetailPokemonWidget) {
        moveDetailPokemonWidget.destroy();
        moveDetailPokemonWidget = null;
    }
    switchToDetail();
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
        const hl = pokemonWidget && pokemonWidget.getSortBy() === key ? ' stat-highlighted' : '';
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
    <div id="detail-moves-container"></div>`;
    searchDetailContent.innerHTML = html;
    // Detail move search widget
    const container = document.getElementById('detail-moves-container');
    const speciesNames = {};
    for (const sp of allSpecies)
        speciesNames[sp.id] = sp.name;
    detailMovesWidget = new MoveSearchWidget({
        container,
        formatId: currentFormat,
        learnsetSpecies: s.id,
        speciesNames,
        onMoveClick: (moveId, move) => showMoveDetail(moveId, move),
    });
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
function showMoveDetail(_moveId, move) {
    if (detailMovesWidget) {
        detailMovesWidget.destroy();
        detailMovesWidget = null;
    }
    if (moveDetailPokemonWidget) {
        moveDetailPokemonWidget.destroy();
        moveDetailPokemonWidget = null;
    }
    detailSpecies = null;
    switchToDetail();
    const bpDisplay = (m) => {
        if (m.category === 'Status')
            return '—';
        if (m.basePower !== 0)
            return String(m.basePower);
        if (m.name === 'Night Shade' || m.name === 'Seismic Toss')
            return '50';
        return '?';
    };
    const accDisplay = (m) => {
        if (typeof m.accuracy === 'number')
            return m.accuracy + '%';
        return '—';
    };
    const flagLabels = (move.flags || []).map(f => MOVE_CLASSIFICATIONS[f] || f);
    const effectLabels = (move.effectCategories || []).map(e => EFFECT_CATEGORIES[e] || e);
    const rangeLabel = move.range ? (RANGE_CATEGORIES[move.range] || move.range) : '';
    const rangeHtml = rangeLabel ? `<div class="move-detail-stat move-detail-stat-range"><span class="move-detail-stat-label">Range</span><span class="move-detail-stat-value">${rangeLabel}</span></div>` : '';
    const learnedBy = move.learnedBy || [];
    const priorityHtml = move.priority !== 0 ? `<div class="move-detail-stat"><span class="move-detail-stat-label">Priority</span><span class="move-detail-stat-value">${move.priority > 0 ? '+' + move.priority : move.priority}</span></div>` : '';
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
      ${flagLabels.length > 0 || effectLabels.length > 0 ? `<div class="move-detail-badges">${[...flagLabels, ...effectLabels].map(l => `<span class="badge">${l}</span>`).join('')}</div>` : ''}
      ${move.shortDesc ? `<div class="move-detail-desc">${move.shortDesc}</div>` : ''}
      <div class="move-detail-learned">
        <span class="badge-group-label">Learned By (${learnedBy.length})</span>
        <div id="move-detail-learned-container"></div>
      </div>
    </div>`;
    searchDetailContent.innerHTML = html;
    if (learnedBy.length > 0) {
        const container = document.getElementById('move-detail-learned-container');
        moveDetailPokemonWidget = new PokemonSearchWidget({
            container,
            formatId: currentFormat,
            onPokemonClick: (_speciesId, species) => showDetail(species),
        });
        moveDetailPokemonWidget.setData(allSpecies, spriteMap);
        moveDetailPokemonWidget.setLearnedByFilter(learnedBy);
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
// ── Moves subtab event ──────────────────────────────────
document.querySelector('[data-subtab="moves"]')?.addEventListener('click', () => {
    if (!movesWidget) {
        const container = document.getElementById('subtab-content-moves');
        const speciesNames = {};
        for (const s of allSpecies)
            speciesNames[s.id] = s.name;
        movesWidget = new MoveSearchWidget({ container, formatId: currentFormat, speciesNames, onMoveClick: (moveId, move) => showMoveDetail(moveId, move) });
    }
});
const pokemonContainer = document.getElementById('subtab-content-pokemon');
pokemonWidget = new PokemonSearchWidget({
    container: pokemonContainer,
    formatId: currentFormat,
    onPokemonClick: (speciesId, species) => {
        if (pendingSlotIndex !== null) {
            fillSlot(pendingSlotIndex, speciesId);
        }
        else {
            showDetail(species);
        }
    },
});
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
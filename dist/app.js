import { setFormat, loadIndex, loadMovesWithLearnsets, loadAbilities } from './lib/data-loader.js';
import { createTeam, loadTeams, saveTeams } from './lib/team-store.js';
import { MoveSearchWidget, MOVE_CLASSIFICATIONS, EFFECT_CATEGORIES, RANGE_CATEGORIES } from './lib/move-search-widget.js';
import { PokemonSearchWidget } from './lib/pokemon-search-widget.js';
import { AbilitySearchWidget, ABILITY_EFFECT_CATEGORIES } from './lib/ability-search-widget.js';
const SPRITE_PATH = 'sprites/champions';
const LAST_TEAM_KEY = 'potato-last-team';
const formatSelect = document.getElementById('format-select');
const teamSelect = document.getElementById('team-select');
const newTeamBtn = document.getElementById('new-team-btn');
const teamWarning = document.getElementById('team-warning');
const searchDetailContent = document.getElementById('search-detail-content');
const breadcrumbBar = document.getElementById('breadcrumb-bar');
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
let abilityDetailPokemonWidget = null;
let abilitiesWidget = null;
let breadcrumbs = [];
let activeBreadcrumbIndex = -1;
function resetBreadcrumbs(item) {
    breadcrumbs = [item];
    activeBreadcrumbIndex = 0;
}
function updateBreadcrumbs(item) {
    const existing = breadcrumbs.findIndex(b => b.type === item.type && b.id === item.id);
    if (existing !== -1) {
        activeBreadcrumbIndex = existing;
    }
    else {
        breadcrumbs = breadcrumbs.slice(0, activeBreadcrumbIndex + 1);
        breadcrumbs.push(item);
        activeBreadcrumbIndex = breadcrumbs.length - 1;
    }
}
function navigateToBreadcrumb(index) {
    activeBreadcrumbIndex = index;
    const b = breadcrumbs[index];
    if (b.type === 'pokemon') {
        const species = getSpeciesById(b.id);
        if (species)
            showDetail(species);
    }
    else if (b.type === 'move') {
        loadMovesWithLearnsets(currentFormat).then(allMoves => {
            const move = allMoves[b.id];
            if (move)
                showMoveDetail(b.id, move);
        });
    }
    else if (b.type === 'ability') {
        loadAbilities(currentFormat).then(allAbilities => {
            const ability = allAbilities[b.id];
            if (ability)
                showAbilityDetail(b.id, ability);
        });
    }
}
function renderBreadcrumbBar() {
    if (breadcrumbs.length === 0) {
        breadcrumbBar.innerHTML = '';
        breadcrumbBar.classList.add('hidden');
        return;
    }
    breadcrumbBar.classList.remove('hidden');
    let html = '<div class="breadcrumbs">';
    for (let i = 0; i < breadcrumbs.length; i++) {
        const b = breadcrumbs[i];
        if (i > 0)
            html += '<span class="breadcrumb-sep">›</span>';
        const cls = i === activeBreadcrumbIndex ? 'breadcrumb breadcrumb-active' : 'breadcrumb';
        html += `<span class="${cls}" data-breadcrumb-index="${i}">${b.name}</span>`;
    }
    html += '</div>';
    breadcrumbBar.innerHTML = html;
    breadcrumbBar.querySelector('.breadcrumbs')?.addEventListener('click', (e) => {
        const target = e.target.closest('.breadcrumb');
        if (!target)
            return;
        const index = parseInt(target.dataset.breadcrumbIndex);
        navigateToBreadcrumb(index);
    });
}
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
    if (abilityDetailPokemonWidget) {
        abilityDetailPokemonWidget.destroy();
        abilityDetailPokemonWidget = null;
    }
    if (abilitiesWidget) {
        abilitiesWidget.destroy();
        abilitiesWidget = null;
    }
    breadcrumbs = [];
    activeBreadcrumbIndex = -1;
    renderBreadcrumbBar();
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
function reRenderDetail() {
    if (detailSpecies)
        showDetail(detailSpecies);
}
function renderTeamBar() {
    const headerTeam = document.getElementById('header-team');
    headerTeam.innerHTML = '';
    const team = getCurrentTeam();
    if (!team) {
        headerTeam.classList.add('hidden');
        return;
    }
    headerTeam.classList.remove('hidden');
    for (let i = 0; i < 6; i++) {
        const slot = team.slots[i];
        const el = document.createElement('div');
        el.className = 'header-slot';
        if (slot.speciesId) {
            const species = getSpeciesById(slot.speciesId);
            el.classList.add('filled');
            if (species) {
                const spriteFile = spriteMap[species.id];
                if (spriteFile) {
                    const img = document.createElement('img');
                    img.className = 'header-slot-sprite';
                    img.src = `${SPRITE_PATH}/${spriteFile}`;
                    img.alt = species.name;
                    el.appendChild(img);
                }
            }
        }
        else {
            el.classList.add('empty');
        }
        headerTeam.appendChild(el);
    }
    headerTeam.addEventListener('click', () => {
        switchToTeamBuilder();
    });
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
function isDetailTabActive() {
    const rightSection = document.querySelector('.section-right');
    const contentId = 'tab-content-search-detail';
    const panel = rightSection?.querySelector(`#${contentId}`) ?? document.getElementById(contentId);
    return panel ? !panel.classList.contains('hidden') : false;
}
function switchToDetail() {
    if (isDetailTabActive())
        return;
    const rightSection = document.querySelector('.section-right');
    if (window.innerWidth >= 768 && rightSection) {
        selectTab('search-detail', rightSection);
    }
    else {
        selectTab('search-detail');
    }
}
async function showDetail(s) {
    updateBreadcrumbs({ type: 'pokemon', id: s.id, name: s.name });
    detailSpecies = s;
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
    html += `
    <h3 style="margin-top:0.75rem;font-size:0.9rem">Moves (${s.moveCount})</h3>
    <div id="detail-moves-container"></div>`;
    searchDetailContent.innerHTML = html;
    renderBreadcrumbBar();
    // Wire up ability buttons → ability detail
    const abilityNames = new Set(Object.values(s.abilities).filter(Boolean));
    if (abilityNames.size > 0) {
        loadAbilities(currentFormat).then(allAbilities => {
            const nameToId = {};
            for (const [id, a] of Object.entries(allAbilities))
                nameToId[a.name] = id;
            searchDetailContent.querySelectorAll('.ability-btn').forEach(btn => {
                const name = btn.textContent || '';
                const id = nameToId[name];
                if (id) {
                    btn.addEventListener('click', () => showAbilityDetail(id, allAbilities[id]));
                }
            });
        });
    }
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
}
function showMoveDetail(moveId, move) {
    updateBreadcrumbs({ type: 'move', id: moveId, name: move.name });
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
    renderBreadcrumbBar();
    if (learnedBy.length > 0) {
        const container = document.getElementById('move-detail-learned-container');
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
    updateBreadcrumbs({ type: 'ability', id: abilityId, name: ability.name });
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
    detailSpecies = null;
    switchToDetail();
    const effectLabels = (ability.effectCategories || []).map(e => ABILITY_EFFECT_CATEGORIES[e] || e);
    const pokemonIds = ability.pokemon || [];
    const html = `
    <div class="move-detail">
      <div class="move-detail-header">
        <span class="move-detail-name">${ability.name}</span>
      </div>
      ${effectLabels.length > 0 ? `<div class="move-detail-badges">${effectLabels.map(l => `<span class="badge">${l}</span>`).join('')}</div>` : ''}
      <div class="move-detail-desc">${ability.desc}</div>
      <div class="move-detail-learned">
        <span class="badge-group-label">Pokémon with ${ability.name} (${pokemonIds.length})</span>
        <div id="ability-detail-pokemon-container"></div>
      </div>
    </div>`;
    searchDetailContent.innerHTML = html;
    renderBreadcrumbBar();
    if (pokemonIds.length > 0) {
        const container = document.getElementById('ability-detail-pokemon-container');
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
        movesWidget = new MoveSearchWidget({ container, formatId: currentFormat, speciesNames, onMoveClick: (moveId, move) => {
                resetBreadcrumbs({ type: 'move', id: moveId, name: move.name });
                showMoveDetail(moveId, move);
            } });
    }
});
document.querySelector('[data-subtab="abilities"]')?.addEventListener('click', () => {
    if (!abilitiesWidget) {
        const container = document.getElementById('subtab-content-abilities');
        abilitiesWidget = new AbilitySearchWidget({ container, formatId: currentFormat, onAbilityClick: (abilityId, ability) => {
                resetBreadcrumbs({ type: 'ability', id: abilityId, name: ability.name });
                showAbilityDetail(abilityId, ability);
            } });
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
            resetBreadcrumbs({ type: 'pokemon', id: speciesId, name: species.name });
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
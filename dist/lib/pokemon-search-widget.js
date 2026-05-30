import { loadLearnsets, loadMovesWithLearnsets, loadAbilities } from './data-loader.js';
import { TYPES, TYPE_COLORS, MOVE_CLASSIFICATIONS, EFFECT_CATEGORIES } from './move-search-widget.js';
import { ABILITY_EFFECT_CATEGORIES } from './ability-search-widget.js';
const SPRITE_PATH = 'sprites/champions';
const LS_SORT_BY = 'potato_sort_by';
const LS_SORT_ASC = 'potato_sort_asc';
export class PokemonSearchWidget {
    opts;
    allSpecies = [];
    spriteMap = {};
    searchQuery = '';
    sortBy = 'dex';
    sortAsc = true;
    showMegas = true;
    filterFlags = [];
    filterMode = 'and';
    filterHighlightIndex = -1;
    selectedIndex = -1;
    filteredForNav = [];
    allAbilities = [];
    learnedByFilter = null;
    moveNames = {};
    allMoves = {};
    movesLoadedForFilter = false;
    movesLoadingForFilter = false;
    filterLearnsets = null;
    speciesAbilityCategories = null;
    abilityCategoriesLoading = false;
    abilityCategoriesLoaded = false;
    grid;
    filterInput;
    sortSelect;
    sortDirBtn;
    megaToggle;
    resultCount;
    filterPopup;
    filterToolbar;
    constructor(opts) {
        this.opts = opts;
        this.restoreLocalStorage();
        this.buildDOM();
        this.bindEvents();
        if (opts.learnedByFilter) {
            this.learnedByFilter = new Set(opts.learnedByFilter);
        }
        if (opts.species && opts.spriteMap) {
            this.setData(opts.species, opts.spriteMap);
        }
    }
    restoreLocalStorage() {
        const savedSortBy = localStorage.getItem(LS_SORT_BY);
        if (savedSortBy && ['dex', 'alpha', 'hp', 'atk', 'def', 'spa', 'spd', 'spe'].includes(savedSortBy)) {
            this.sortBy = savedSortBy;
        }
        const savedSortAsc = localStorage.getItem(LS_SORT_ASC);
        if (savedSortAsc === 'true' || savedSortAsc === 'false') {
            this.sortAsc = savedSortAsc === 'true';
        }
    }
    buildDOM() {
        const { container } = this.opts;
        // Filter row
        const filterRow = document.createElement('div');
        filterRow.className = 'filter-row';
        const sortSelect = document.createElement('select');
        sortSelect.className = 'ps-sort-select';
        const sortOptions = [
            { value: 'dex', label: 'Dex No.' },
            { value: 'alpha', label: 'Alphabetical' },
            { value: 'hp', label: 'HP' },
            { value: 'atk', label: 'Atk' },
            { value: 'def', label: 'Def' },
            { value: 'spa', label: 'SpA' },
            { value: 'spd', label: 'SpD' },
            { value: 'spe', label: 'Spe' },
        ];
        for (const opt of sortOptions) {
            const el = document.createElement('option');
            el.value = opt.value;
            el.textContent = opt.label;
            if (opt.value === this.sortBy)
                el.selected = true;
            sortSelect.appendChild(el);
        }
        this.sortSelect = sortSelect;
        filterRow.appendChild(sortSelect);
        const sortDirBtn = document.createElement('button');
        sortDirBtn.className = 'sort-dir';
        sortDirBtn.textContent = this.sortAsc ? '▲' : '▼';
        this.sortDirBtn = sortDirBtn;
        filterRow.appendChild(sortDirBtn);
        const inputWrap = document.createElement('div');
        inputWrap.className = 'filter-input-wrap';
        const filterInput = document.createElement('input');
        filterInput.className = 'ps-filter-input';
        filterInput.type = 'text';
        filterInput.placeholder = 'Search Pokémon…';
        filterInput.autocomplete = 'off';
        this.filterInput = filterInput;
        inputWrap.appendChild(filterInput);
        const resultCount = document.createElement('span');
        resultCount.className = 'result-count hidden';
        resultCount.textContent = '0 Results';
        this.resultCount = resultCount;
        inputWrap.appendChild(resultCount);
        filterRow.appendChild(inputWrap);
        const megaToggle = document.createElement('button');
        megaToggle.className = 'ps-mega-toggle active';
        megaToggle.textContent = 'Include Megas';
        this.megaToggle = megaToggle;
        filterRow.appendChild(megaToggle);
        container.appendChild(filterRow);
        // Filter popup
        const filterPopup = document.createElement('div');
        filterPopup.className = 'ps-filter-popup filter-popup hidden';
        this.filterPopup = filterPopup;
        container.appendChild(filterPopup);
        // Filter bar
        const filterBar = document.createElement('div');
        filterBar.className = 'ps-filter-bar filter-bar hidden';
        filterBar.innerHTML = '<span class="filter-bar-label"><span class="label-text">Filters</span><button class="filter-clear-all" title="Clear all filters">×</button></span>';
        const filterToolbar = document.createElement('div');
        filterToolbar.className = 'ps-filter-toolbar filter-toolbar';
        const andBtn = document.createElement('button');
        andBtn.className = 'filter-mode active';
        andBtn.dataset.mode = 'and';
        andBtn.textContent = 'AND';
        const orBtn = document.createElement('button');
        orBtn.className = 'filter-mode';
        orBtn.dataset.mode = 'or';
        orBtn.textContent = 'OR';
        filterToolbar.appendChild(andBtn);
        filterToolbar.appendChild(orBtn);
        this.filterToolbar = filterToolbar;
        filterBar.appendChild(filterToolbar);
        container.appendChild(filterBar);
        // Grid
        const grid = document.createElement('div');
        grid.className = 'ps-pokemon-grid';
        grid.setAttribute('role', 'list');
        grid.setAttribute('tabindex', '0');
        this.grid = grid;
        container.appendChild(grid);
    }
    bindEvents() {
        const statSortKeys = new Set(['hp', 'atk', 'def', 'spa', 'spd', 'spe']);
        this.sortSelect.addEventListener('change', () => {
            this.sortBy = this.sortSelect.value;
            const shouldDesc = statSortKeys.has(this.sortBy);
            if (this.sortAsc === shouldDesc) {
                this.sortAsc = !shouldDesc;
                this.sortDirBtn.textContent = this.sortAsc ? '▲' : '▼';
            }
            localStorage.setItem(LS_SORT_BY, this.sortBy);
            localStorage.setItem(LS_SORT_ASC, String(this.sortAsc));
            this.render();
        });
        this.sortDirBtn.addEventListener('click', () => {
            this.sortAsc = !this.sortAsc;
            this.sortDirBtn.textContent = this.sortAsc ? '▲' : '▼';
            localStorage.setItem(LS_SORT_ASC, String(this.sortAsc));
            this.render();
        });
        this.megaToggle.addEventListener('click', () => {
            this.showMegas = !this.showMegas;
            this.megaToggle.classList.toggle('active', this.showMegas);
            this.render();
        });
        this.filterInput.addEventListener('input', () => {
            this.searchQuery = this.filterInput.value;
            this.updatePopup();
            this.render();
        });
        this.filterInput.addEventListener('keydown', (e) => {
            const popupVisible = !this.filterPopup.classList.contains('hidden');
            const items = popupVisible ? this.filterPopup.querySelectorAll('.popup-item') : [];
            const n = items.length;
            if (e.key === 'ArrowDown' && popupVisible) {
                e.preventDefault();
                this.filterHighlightIndex = n > 0 ? (this.filterHighlightIndex + 1) % n : -1;
                this.updatePopupHighlight(items);
            }
            else if (e.key === 'ArrowUp' && popupVisible) {
                e.preventDefault();
                this.filterHighlightIndex = n > 0 ? (this.filterHighlightIndex - 1 + n) % n : -1;
                this.updatePopupHighlight(items);
            }
            else if (e.key === 'Tab' && popupVisible) {
                e.preventDefault();
                if (n === 0)
                    return;
                if (e.shiftKey) {
                    this.filterHighlightIndex = (this.filterHighlightIndex - 1 + n) % n;
                }
                else {
                    this.filterHighlightIndex = (this.filterHighlightIndex + 1) % n;
                }
                this.updatePopupHighlight(items);
            }
            else if (e.key === 'Enter' && popupVisible) {
                e.preventDefault();
                if (n === 0)
                    return;
                const idx = this.filterHighlightIndex >= 0 ? this.filterHighlightIndex : 0;
                const item = items[idx];
                this.addFlag(item.dataset.category, item.dataset.id, item.dataset.label);
            }
            else if (e.key === 'Escape') {
                this.clear();
            }
        });
        this.filterPopup.addEventListener('click', (e) => {
            const item = e.target.closest('.popup-item');
            if (!item)
                return;
            const cat = item.dataset.category;
            const id = item.dataset.id;
            const label = item.dataset.label;
            this.addFlag(cat, id, label);
            this.filterInput.focus();
        });
        const filterBar = this.filterInput.parentElement.parentElement.nextElementSibling.nextElementSibling;
        filterBar.addEventListener('click', (e) => {
            const clearBtn = e.target.closest('.filter-clear-all');
            if (clearBtn) {
                this.filterFlags = [];
                this.renderChips();
                this.render();
                return;
            }
        });
        this.filterToolbar.addEventListener('click', (e) => {
            const btn = e.target.closest('.filter-mode');
            if (!btn)
                return;
            const mode = btn.dataset.mode;
            if (mode !== 'and' && mode !== 'or')
                return;
            this.filterMode = mode;
            this.updateModeButtons();
            this.render();
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && (this.filterInput.value || this.filterFlags.length > 0)) {
                this.clear();
            }
        });
        // List keyboard navigation (ArrowUp/Down when list items are selected)
        this.grid.addEventListener('keydown', (e) => {
            if (!this.filteredForNav.length)
                return;
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                this.selectedIndex = Math.min(this.selectedIndex + 1, this.filteredForNav.length - 1);
                this.updateListSelection();
                this.scrollSelectedIntoView();
            }
            else if (e.key === 'ArrowUp') {
                e.preventDefault();
                this.selectedIndex = Math.max(this.selectedIndex - 1, 0);
                this.updateListSelection();
                this.scrollSelectedIntoView();
            }
        });
        document.addEventListener('click', (e) => {
            const target = e.target;
            if (!target.closest('.ps-filter-input') && !target.closest('.filter-popup')) {
                this.filterPopup.classList.add('hidden');
            }
        });
        window.addEventListener('scroll', () => {
            this.filterPopup.classList.add('hidden');
        }, { passive: true });
        window.addEventListener('resize', () => {
            this.filterPopup.classList.add('hidden');
        }, { passive: true });
    }
    setData(species, spriteMap) {
        this.allSpecies = species;
        this.spriteMap = spriteMap;
        const abilitySet = new Set();
        for (const s of species) {
            for (const a of s.abilities) {
                if (a)
                    abilitySet.add(a);
            }
        }
        this.allAbilities = [...abilitySet].sort();
        this.moveNames = {};
        this.movesLoadedForFilter = false;
        this.movesLoadingForFilter = false;
        this.speciesAbilityCategories = null;
        this.abilityCategoriesLoaded = false;
        this.abilityCategoriesLoading = false;
        this.render();
    }
    clear() {
        this.searchQuery = '';
        this.filterInput.value = '';
        this.filterFlags = [];
        this.filterMode = 'and';
        this.filterLearnsets = null;
        this.filterHighlightIndex = -1;
        this.filterPopup.classList.add('hidden');
        this.renderChips();
        this.updateModeButtons();
        this.render();
    }
    focusInput() {
        this.filterInput.focus();
    }
    getSortBy() {
        return this.sortBy;
    }
    setLearnedByFilter(speciesIds) {
        this.learnedByFilter = speciesIds ? new Set(speciesIds) : null;
        this.render();
    }
    isMegaForm(species) {
        return species.forme !== null && species.forme.includes('Mega');
    }
    speciesHasMoveWithFlag(speciesId, key, value) {
        if (!this.filterLearnsets || !this.allMoves)
            return false;
        const moveIds = this.filterLearnsets[speciesId];
        if (!moveIds)
            return false;
        return moveIds.some(mid => {
            const move = this.allMoves[mid];
            return move && move[key]?.includes(value);
        });
    }
    matchesFlag(species, flag) {
        switch (flag.category) {
            case 'type':
                return species.types.some(t => t.toLowerCase() === flag.id);
            case 'ability':
                return species.abilities.some(a => a.toLowerCase() === flag.id);
            case 'move':
                if (!this.filterLearnsets)
                    return false;
                const moves = this.filterLearnsets[species.id];
                return !!moves && moves.includes(flag.id);
            case 'classification':
                return this.speciesHasMoveWithFlag(species.id, 'flags', flag.id);
            case 'effect':
                return this.speciesHasMoveWithFlag(species.id, 'effectCategories', flag.id);
            case 'ability_category':
                if (!this.speciesAbilityCategories)
                    return false;
                const cats = this.speciesAbilityCategories[species.id];
                return !!cats && cats.has(flag.id);
            default:
                return false;
        }
    }
    matchesFlags(species) {
        if (!this.showMegas && this.isMegaForm(species)) {
            return false;
        }
        if (this.filterFlags.length > 0) {
            const results = this.filterFlags.map(f => this.matchesFlag(species, f));
            if (this.filterMode === 'and' ? !results.every(Boolean) : !results.some(Boolean)) {
                return false;
            }
        }
        if (this.searchQuery) {
            const q = this.searchQuery.toLowerCase();
            if (!species.id.includes(q) && !species.name.toLowerCase().includes(q)) {
                return false;
            }
        }
        return true;
    }
    updatePopup() {
        const text = this.filterInput.value.trim();
        if (text.length < 2) {
            this.filterPopup.classList.add('hidden');
            return;
        }
        const lower = text.toLowerCase();
        const matchingTypes = TYPES.filter(t => t.toLowerCase().includes(lower));
        const matchingAbilities = this.allAbilities.filter(a => a.toLowerCase().includes(lower));
        const matchingMoves = [];
        for (const [id, name] of Object.entries(this.moveNames)) {
            if (name.toLowerCase().includes(lower)) {
                matchingMoves.push({ id, name });
            }
        }
        const matchingClassifications = Object.entries(MOVE_CLASSIFICATIONS)
            .filter(([_, label]) => label.toLowerCase().includes(lower));
        const matchingEffects = Object.entries(EFFECT_CATEGORIES)
            .filter(([_, label]) => label.toLowerCase().includes(lower));
        const matchingAbilityCats = Object.entries(ABILITY_EFFECT_CATEGORIES)
            .filter(([_, label]) => label.toLowerCase().includes(lower));
        const total = matchingTypes.length + matchingAbilities.length + matchingMoves.length + matchingClassifications.length + matchingEffects.length + matchingAbilityCats.length;
        if (total === 0) {
            this.filterPopup.classList.add('hidden');
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
        if (matchingAbilityCats.length > 0) {
            html += `<div class="popup-group"><div class="popup-group-label">Ability Effect</div>`;
            for (const [acid, label] of matchingAbilityCats) {
                html += `<div class="popup-item" data-category="ability_category" data-id="${acid}" data-label="${label}">${label}</div>`;
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
        this.filterPopup.innerHTML = html;
        this.filterHighlightIndex = -1;
        this.filterPopup.classList.remove('hidden');
        const rect = this.filterInput.getBoundingClientRect();
        const popupStyle = this.filterPopup.style;
        const spaceBelow = window.innerHeight - rect.bottom;
        const popupHeight = Math.min(280, spaceBelow - 8);
        popupStyle.top = (spaceBelow > 180 ? rect.bottom + 6 : rect.top - popupHeight - 6) + 'px';
        popupStyle.left = Math.max(8, rect.left) + 'px';
        popupStyle.width = Math.max(220, rect.width) + 'px';
        popupStyle.maxHeight = popupHeight + 'px';
        if (!this.movesLoadedForFilter && !this.movesLoadingForFilter) {
            this.movesLoadingForFilter = true;
            loadMovesWithLearnsets(this.opts.formatId).then(moves => {
                this.allMoves = moves;
                this.moveNames = {};
                for (const [id, move] of Object.entries(moves)) {
                    if (!move.learnedBy || move.learnedBy.length === 0)
                        continue;
                    this.moveNames[id] = move.name;
                }
                this.movesLoadedForFilter = true;
                this.movesLoadingForFilter = false;
                if (document.activeElement === this.filterInput) {
                    this.updatePopup();
                }
            });
        }
        if (!this.abilityCategoriesLoaded && !this.abilityCategoriesLoading) {
            this.abilityCategoriesLoading = true;
            loadAbilities(this.opts.formatId).then(abilities => {
                const map = {};
                for (const a of Object.values(abilities)) {
                    if (!a.effectCategories)
                        continue;
                    for (const sid of a.pokemon) {
                        if (!map[sid])
                            map[sid] = new Set();
                        for (const cat of a.effectCategories)
                            map[sid].add(cat);
                    }
                }
                this.speciesAbilityCategories = map;
                this.abilityCategoriesLoaded = true;
                this.abilityCategoriesLoading = false;
            });
        }
    }
    updatePopupHighlight(items) {
        items.forEach((el, i) => {
            el.classList.toggle('highlighted', i === this.filterHighlightIndex);
        });
        if (this.filterHighlightIndex >= 0 && this.filterHighlightIndex < items.length) {
            items[this.filterHighlightIndex].scrollIntoView({ block: 'nearest' });
        }
    }
    addFlag(category, id, label) {
        this.filterFlags.push({ category, id, label });
        this.filterInput.value = '';
        this.searchQuery = '';
        this.filterPopup.classList.add('hidden');
        this.renderChips();
        this.render();
        const needsLearnsets = !this.filterLearnsets && (category === 'move' || category === 'classification' || category === 'effect');
        const needsAllMoves = !this.movesLoadedForFilter && (category === 'classification' || category === 'effect');
        const needsAbilityCats = category === 'ability_category' && !this.abilityCategoriesLoaded;
        if (needsLearnsets || needsAllMoves || needsAbilityCats) {
            const p = [];
            if (needsLearnsets)
                p.push(loadLearnsets(this.opts.formatId).then(ls => { this.filterLearnsets = ls; }));
            if (needsAllMoves) {
                p.push(loadMovesWithLearnsets(this.opts.formatId).then(moves => {
                    this.allMoves = moves;
                    this.moveNames = {};
                    for (const [id, move] of Object.entries(moves)) {
                        if (!move.learnedBy || move.learnedBy.length === 0)
                            continue;
                        this.moveNames[id] = move.name;
                    }
                    this.movesLoadedForFilter = true;
                }));
            }
            if (needsAbilityCats) {
                p.push(loadAbilities(this.opts.formatId).then(abilities => {
                    const map = {};
                    for (const a of Object.values(abilities)) {
                        if (!a.effectCategories)
                            continue;
                        for (const sid of a.pokemon) {
                            if (!map[sid])
                                map[sid] = new Set();
                            for (const cat of a.effectCategories)
                                map[sid].add(cat);
                        }
                    }
                    this.speciesAbilityCategories = map;
                    this.abilityCategoriesLoaded = true;
                }));
            }
            Promise.all(p).then(() => this.render());
        }
    }
    renderChips() {
        const filterBar = this.filterInput.parentElement.parentElement.nextElementSibling.nextElementSibling;
        filterBar.querySelectorAll('.filter-chip').forEach(el => el.remove());
        filterBar.classList.toggle('hidden', this.filterFlags.length === 0);
        for (let i = 0; i < this.filterFlags.length; i++) {
            const f = this.filterFlags[i];
            const chip = document.createElement('span');
            chip.className = 'filter-chip';
            chip.dataset.category = f.category;
            chip.innerHTML = `${f.label} <span class="chip-remove" data-index="${i}">×</span>`;
            chip.querySelector('.chip-remove').addEventListener('click', (e) => {
                e.stopPropagation();
                this.filterFlags.splice(i, 1);
                this.renderChips();
                this.render();
            });
            filterBar.insertBefore(chip, this.filterToolbar);
        }
    }
    updateModeButtons() {
        this.filterToolbar.querySelectorAll('.filter-mode').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.mode === this.filterMode);
        });
    }
    updateListSelection() {
        document.querySelectorAll('.pokemon-list-item.selected').forEach(el => el.classList.remove('selected'));
        if (this.selectedIndex < 0 || this.selectedIndex >= this.filteredForNav.length)
            return;
        const items = this.grid.querySelectorAll('.pokemon-list-item');
        const item = items[this.selectedIndex];
        if (item) {
            item.classList.add('selected');
            const species = this.filteredForNav[this.selectedIndex];
            if (species)
                this.opts.onPokemonClick(species.id, species);
        }
    }
    scrollSelectedIntoView() {
        const items = this.grid.querySelectorAll('.pokemon-list-item');
        const item = items[this.selectedIndex];
        if (item)
            item.scrollIntoView({ block: 'nearest' });
    }
    destroy() {
        this.opts.container.innerHTML = '';
    }
    render() {
        this.grid.innerHTML = '';
        this.grid.classList.add('list-view');
        let speciesList = this.learnedByFilter
            ? this.allSpecies.filter(s => this.learnedByFilter.has(s.id))
            : this.allSpecies;
        let filtered = speciesList.filter(sp => this.matchesFlags(sp));
        const statKeys = {
            hp: 'hp', atk: 'atk', def: 'def', spa: 'spa', spd: 'spd', spe: 'spe'
        };
        filtered = filtered.sort((a, b) => {
            let cmp;
            if (this.sortBy === 'alpha') {
                cmp = a.name.localeCompare(b.name);
            }
            else if (this.sortBy === 'dex') {
                cmp = a.num - b.num;
            }
            else {
                const key = statKeys[this.sortBy];
                cmp = a.baseStats[key] - b.baseStats[key];
            }
            return this.sortAsc ? cmp : -cmp;
        });
        this.filteredForNav = filtered;
        this.selectedIndex = -1;
        this.resultCount.textContent = `${filtered.length} Result${filtered.length === 1 ? '' : 's'}`;
        this.resultCount.classList.toggle('hidden', speciesList.length === 0);
        if (filtered.length === 0) {
            this.grid.innerHTML = '<div class="loading">No Pokémon match your search.</div>';
            return;
        }
        for (const s of filtered) {
            const item = document.createElement('div');
            item.className = 'pokemon-list-item';
            item.setAttribute('role', 'listitem');
            const spriteFile = this.spriteMap[s.id];
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
            for (let i = 0; i < 3; i++) {
                const span = document.createElement('span');
                span.className = 'list-ability' + (s.abilities[i] ? '' : ' list-ability-empty');
                span.textContent = s.abilities[i] || '-';
                abilEl.appendChild(span);
            }
            infoBottom.appendChild(abilEl);
            const statEl = document.createElement('div');
            statEl.className = 'list-stats';
            const statNames = ['HP', 'Atk', 'Def', 'SpA', 'SpD', 'Spe'];
            const statKeysArr = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
            for (let si = 0; si < 6; si++) {
                const entry = document.createElement('div');
                entry.className = 'list-stat-entry' + (statKeysArr[si] === this.sortBy ? ' list-stat-highlighted' : '');
                const label = document.createElement('span');
                label.className = 'list-stat-label';
                label.textContent = statNames[si];
                const value = document.createElement('span');
                value.className = 'list-stat-value';
                value.textContent = String(s.baseStats[statKeysArr[si]]);
                entry.appendChild(label);
                entry.appendChild(value);
                statEl.appendChild(entry);
            }
            infoBottom.appendChild(statEl);
            info.appendChild(infoBottom);
            item.appendChild(info);
            item.addEventListener('click', () => {
                document.querySelectorAll('.pokemon-list-item.selected').forEach(el => el.classList.remove('selected'));
                item.classList.add('selected');
                this.selectedIndex = filtered.indexOf(s);
                this.opts.onPokemonClick(s.id, s);
            });
            this.grid.appendChild(item);
        }
    }
}
//# sourceMappingURL=pokemon-search-widget.js.map
import { loadLearnsets, loadMovesWithLearnsets, loadAbilities, HIDDEN_FORME_KINDS } from './data-loader.js';
import { TYPES, TYPE_COLORS, MOVE_CLASSIFICATIONS, MOVE_EFFECT_CATEGORIES } from './types.js';
import { ABILITY_EFFECT_CATEGORIES } from './types.js';
import { SortBar } from './sort-bar.js';

const SPRITE_PATH = 'sprites/champions';
const LS_SORT_BY = 'potato_sort_by';
const LS_SORT_ASC = 'potato_sort_asc';

export class PokemonSearchWidget {
  constructor(opts) {
    this.opts = opts;
    this.allSpecies = [];
    this.spriteMap = {};
    this.searchQuery = '';
    this.sortBy = 'dex';
    this.sortAsc = true;
    this.showMegas = true;
    this.statBounds = {};
    this.filterFlags = [];
    this.filterMode = 'and';
    this.filterHighlightIndex = -1;
    this.selectedIndex = -1;
    this.filteredForNav = [];
    this.allAbilities = [];
    this.learnedByFilter = null;
    this.moveNames = {};
    this.allMoves = {};
    this.movesLoadedForFilter = false;
    this.movesLoadingForFilter = false;
    this.filterLearnsets = null;
    this.speciesAbilityCategories = null;
    this.abilityCategoriesLoading = false;
    this.abilityCategoriesLoaded = false;
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
    if (savedSortBy && ['dex', 'alpha'].includes(savedSortBy)) {
      this.sortBy = savedSortBy;
    }
    const savedSortAsc = localStorage.getItem(LS_SORT_ASC);
    if (savedSortAsc === 'true' || savedSortAsc === 'false') {
      this.sortAsc = savedSortAsc === 'true';
    }
  }

  buildDOM() {
    const { container } = this.opts;

    const filterRow = document.createElement('div');
    filterRow.className = 'filter-row';

    const megaToggle = document.createElement('button');
    megaToggle.className = 'ps-mega-toggle active';
    megaToggle.textContent = 'Include Megas';
    this.megaToggle = megaToggle;
    filterRow.appendChild(megaToggle);

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

    const resetStatBtn = document.createElement('button');
    resetStatBtn.className = 'ps-mega-toggle ps-reset-btn';
    resetStatBtn.textContent = 'Reset';
    resetStatBtn.addEventListener('click', () => {
      this.searchQuery = '';
      this.filterInput.value = '';
      this.sortBy = 'dex';
      this.sortAsc = true;
      this.showMegas = true;
      this.megaToggle.classList.add('active');
      this.statBounds = {};
      this._statPopup.querySelector('.stat-range-min').value = '';
      this._statPopup.querySelector('.stat-range-max').value = '';
      this.filterFlags = [];
      this.filterMode = 'and';
      this.filterHighlightIndex = -1;
      this.selectedIndex = -1;
      this.learnedByFilter = null;
      this.moveNames = {};
      this.allMoves = {};
      this.movesLoadedForFilter = false;
      this.movesLoadingForFilter = false;
      this.filterLearnsets = null;
      this.speciesAbilityCategories = null;
      this.abilityCategoriesLoading = false;
      this.abilityCategoriesLoaded = false;
      this.sortBar.setActive('dex', 'asc');
      this.renderChips();
      this.updatePopup();
      updateStatBoundsClasses();
      this.render();
    });
    filterRow.appendChild(resetStatBtn);

    container.appendChild(filterRow);

    const filterPopup = document.createElement('div');
    filterPopup.className = 'ps-filter-popup filter-popup hidden';
    this.filterPopup = filterPopup;
    container.appendChild(filterPopup);

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

    const sortBarContainer = document.createElement('div');
    sortBarContainer.className = 'ps-sort-bar';
    container.appendChild(sortBarContainer);
    const hasStatBounds = () => ['hp','atk','def','spa','spd','spe'].some(key => {
      const b = this.statBounds[key];
      return b && (b.min !== undefined || b.max !== undefined);
    });

    const updateStatBoundsClasses = () => {
      ['hp','atk','def','spa','spd','spe'].forEach(key => {
        const btn = this.sortBar._sortButtons.get(key);
        if (btn) {
          const bounds = this.statBounds[key];
          btn.classList.toggle('bounds-active', !!(bounds && (bounds.min !== undefined || bounds.max !== undefined)));
        }
      });

      const key = this.statPopupKey;
      if (key) {
        const bounds = this.statBounds[key] || {};
        this._statPopup.querySelector('.stat-range-min').classList.toggle('bounds-active', bounds.min !== undefined);
        this._statPopup.querySelector('.stat-range-max').classList.toggle('bounds-active', bounds.max !== undefined);
      }
    };

    const showStatPopup = (key) => {
      if (!this._statPopup.classList.contains('hidden') && this.statPopupKey === key) {
        this._statPopup.classList.add('hidden');
        this.statPopupKey = null;
        return;
      }
      this.statPopupKey = key;
      updateStatBoundsClasses();
      const bounds = this.statBounds[key] || {};
      this._statPopup.querySelector('.stat-range-min').value = bounds.min !== undefined ? bounds.min : '';
      this._statPopup.querySelector('.stat-range-max').value = bounds.max !== undefined ? bounds.max : '';
      this._statPopup.querySelectorAll('.stat-dir-btn').forEach(btn => {
        btn.classList.toggle('active', key === this.sortBy && btn.dataset.dir === (this.sortAsc ? 'asc' : 'desc'));
      });
      const btn = this.sortBar._sortButtons.get(key);
      if (btn) {
        const rect = btn.getBoundingClientRect();
        const spaceBelow = window.innerHeight - rect.bottom;
        const dh = Math.min(280, spaceBelow - 8);
        this._statPopup.style.top = (spaceBelow > 180 ? rect.bottom + 4 : rect.top - dh - 4) + 'px';
        this._statPopup.style.left = Math.max(8, rect.left) + 'px';
        this._statPopup.style.maxHeight = dh + 'px';
      }
      this._statPopup.classList.remove('hidden');
      this.sortBar.setActive(key, this.sortAsc ? 'asc' : 'desc');
      this.render();
    };

    this.sortBar = new SortBar({
      container: sortBarContainer,
      options: [
        { key: 'dex', label: '#' },
        { key: 'alpha', label: 'A-Z' },
        { key: 'hp', label: 'HP', onClick: showStatPopup },
        { key: 'atk', label: 'Atk', onClick: showStatPopup },
        { key: 'def', label: 'Def', onClick: showStatPopup },
        { key: 'spa', label: 'SpA', onClick: showStatPopup },
        { key: 'spd', label: 'SpD', onClick: showStatPopup },
        { key: 'spe', label: 'Spe', onClick: showStatPopup },
      ],
      activeKey: this.sortBy,
      activeDirection: this.sortAsc ? 'asc' : 'desc',
      onChange: (key, direction) => {
        this.sortBy = key;
        this.sortAsc = direction === 'asc';
        localStorage.setItem(LS_SORT_BY, key);
        localStorage.setItem(LS_SORT_ASC, String(this.sortAsc));
        this.render();
      },
    });

    const typePill = document.createElement('button');
    typePill.className = 'sort-bar-btn ps-type-filter-btn';
    typePill.textContent = 'Type';
    this.sortBar.el.insertBefore(typePill, this.sortBar.el.children[2]);

    const typeDropdown = document.createElement('div');
    typeDropdown.className = 'ps-type-dropdown filter-popup hidden';
    let typeHtml = '<div class="popup-group">';
    for (const t of TYPES) {
      const dotColor = TYPE_COLORS[t] || '#888';
      typeHtml += `<div class="popup-item" data-type="${t.toLowerCase()}"><span class="popup-type-dot" style="background:${dotColor}"></span>${t}</div>`;
    }
    typeHtml += '</div>';
    typeDropdown.innerHTML = typeHtml;
    sortBarContainer.appendChild(typeDropdown);

    const positionTypeDropdown = () => {
      const rect = typePill.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const dh = Math.min(280, spaceBelow - 8);
      typeDropdown.style.top = (spaceBelow > 180 ? rect.bottom + 6 : rect.top - dh - 6) + 'px';
      typeDropdown.style.left = Math.max(8, rect.left) + 'px';
      typeDropdown.style.maxHeight = dh + 'px';
    };

    typePill.addEventListener('click', (e) => {
      e.stopPropagation();
      typeDropdown.classList.toggle('hidden');
      if (!typeDropdown.classList.contains('hidden')) {
        positionTypeDropdown();
      }
    });

    typeDropdown.addEventListener('click', (e) => {
      const item = e.target.closest('.popup-item');
      if (!item) return;
      const typeName = item.dataset.type;
      const label = typeName.charAt(0).toUpperCase() + typeName.slice(1);
      this.addFlag('type', typeName, label);
      typeDropdown.classList.add('hidden');
      this.filterInput.focus();
    });

    document.addEventListener('click', (e) => {
      if (!e.target.closest('.ps-type-filter-btn') && !e.target.closest('.ps-type-dropdown')) {
        typeDropdown.classList.add('hidden');
      }
    });

    window.addEventListener('scroll', () => { typeDropdown.classList.add('hidden'); }, { passive: true });
    window.addEventListener('resize', () => { typeDropdown.classList.add('hidden'); }, { passive: true });

    this._statPopup = document.createElement('div');
    this._statPopup.className = 'ps-stat-popup filter-popup hidden';
    this._statPopup.innerHTML =
      '<div class="stat-popup-section">' +
        '<button class="stat-dir-btn" data-dir="asc">▲ Ascending</button>' +
        '<button class="stat-dir-btn" data-dir="desc">▼ Descending</button>' +
      '</div>' +
      '<div class="stat-popup-section">' +
        '<label class="stat-range-label">Min <input type="number" class="stat-range-min" min="0" max="255"></label>' +
        '<label class="stat-range-label">Max <input type="number" class="stat-range-max" min="0" max="255"></label>' +
        '<button class="stat-apply-btn">Apply</button>' +
      '</div>';
    container.appendChild(this._statPopup);

    this._statPopup.addEventListener('click', (e) => {
      const dirBtn = e.target.closest('.stat-dir-btn');
      if (dirBtn) {
        const key = this.statPopupKey;
        if (key) {
          this.sortBy = key;
          this.sortAsc = dirBtn.dataset.dir === 'asc';
          this.sortBar.setActive(key, this.sortAsc ? 'asc' : 'desc');
          localStorage.setItem(LS_SORT_BY, key);
          localStorage.setItem(LS_SORT_ASC, String(this.sortAsc));
          this._statPopup.classList.add('hidden');
          this.statPopupKey = null;
          this.render();
        }
      }
    });

    const sanitizeStatRange = (input) => {
      let val = input.value;
      if (val !== '') {
        const num = parseInt(val, 10);
        if (isNaN(num)) { input.value = ''; val = ''; }
        else if (num < 0) { input.value = '0'; val = '0'; }
        else if (num > 255) { input.value = '255'; val = '255'; }
      }
      return val;
    };

    const commitStatBounds = () => {
      const key = this.statPopupKey;
      if (!key) return;
      const minVal = this._statPopup.querySelector('.stat-range-min').value;
      const maxVal = this._statPopup.querySelector('.stat-range-max').value;
      if (minVal === '' && maxVal === '') {
        delete this.statBounds[key];
      } else {
        this.statBounds[key] = {
          min: minVal !== '' ? parseInt(minVal, 10) : undefined,
          max: maxVal !== '' ? parseInt(maxVal, 10) : undefined,
        };
      }
      updateStatBoundsClasses();
      this.render();
    };

    this._statPopup.querySelector('.stat-range-min').addEventListener('input', () => {
      sanitizeStatRange(this._statPopup.querySelector('.stat-range-min'));
    });

    this._statPopup.querySelector('.stat-range-max').addEventListener('input', () => {
      sanitizeStatRange(this._statPopup.querySelector('.stat-range-max'));
    });

    this._statPopup.querySelector('.stat-apply-btn').addEventListener('click', () => {
      commitStatBounds();
      this._statPopup.classList.add('hidden');
      this.statPopupKey = null;
    });

    const closePopup = () => {
      this._statPopup.classList.add('hidden');
      this.statPopupKey = null;
    };
    this._statPopup.querySelector('.stat-range-min').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { commitStatBounds(); closePopup(); }
    });
    this._statPopup.querySelector('.stat-range-max').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { commitStatBounds(); closePopup(); }
    });

    document.addEventListener('click', (e) => {
      const statBtn = e.target.closest('.sort-bar-btn') ? e.target.closest('.sort-bar-btn').dataset.key : null;
      const isStatPill = statBtn && ['hp','atk','def','spa','spd','spe'].includes(statBtn);
      if (!e.target.closest('.ps-stat-popup') && !isStatPill) {
        this._statPopup.classList.add('hidden');
        this.statPopupKey = null;
      }
    });

    window.addEventListener('scroll', () => { this._statPopup.classList.add('hidden'); }, { passive: true });
    window.addEventListener('resize', () => { this._statPopup.classList.add('hidden'); }, { passive: true });

    const grid = document.createElement('div');
    grid.className = 'ps-pokemon-grid';
    grid.setAttribute('role', 'list');
    grid.setAttribute('tabindex', '0');
    this.grid = grid;
    container.appendChild(grid);

    updateStatBoundsClasses();
  }

  bindEvents() {
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
      } else if (e.key === 'ArrowUp' && popupVisible) {
        e.preventDefault();
        this.filterHighlightIndex = n > 0 ? (this.filterHighlightIndex - 1 + n) % n : -1;
        this.updatePopupHighlight(items);
      } else if (e.key === 'Tab' && popupVisible) {
        e.preventDefault();
        if (n === 0) return;
        if (e.shiftKey) {
          this.filterHighlightIndex = (this.filterHighlightIndex - 1 + n) % n;
        } else {
          this.filterHighlightIndex = (this.filterHighlightIndex + 1) % n;
        }
        this.updatePopupHighlight(items);
      } else if (e.key === 'Enter' && popupVisible) {
        e.preventDefault();
        if (n === 0) return;
        const idx = this.filterHighlightIndex >= 0 ? this.filterHighlightIndex : 0;
        const item = items[idx];
        this.addFlag(item.dataset.category, item.dataset.id, item.dataset.label);
      } else if (e.key === 'Escape') {
        this.clear();
      }
    });

    this.filterPopup.addEventListener('click', (e) => {
      const item = e.target.closest('.popup-item');
      if (!item) return;
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
      if (!btn) return;
      const mode = btn.dataset.mode;
      if (mode !== 'and' && mode !== 'or') return;
      this.filterMode = mode;
      this.updateModeButtons();
      this.render();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && (this.filterInput.value || this.filterFlags.length > 0)) {
        this.clear();
      }
    });

    this.grid.addEventListener('keydown', (e) => {
      if (!this.filteredForNav.length) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        this.selectedIndex = Math.min(this.selectedIndex + 1, this.filteredForNav.length - 1);
        this.updateListSelection();
        this.scrollSelectedIntoView();
      } else if (e.key === 'ArrowUp') {
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
        if (a) abilitySet.add(a);
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
    if (!this.filterLearnsets || !this.allMoves) return false;
    const moveIds = this.filterLearnsets[speciesId];
    if (!moveIds) return false;
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
        if (!this.filterLearnsets) return false;
        const moves = this.filterLearnsets[species.id];
        return !!moves && moves.includes(flag.id);
      case 'classification':
        return this.speciesHasMoveWithFlag(species.id, 'flags', flag.id);
      case 'effect':
        return this.speciesHasMoveWithFlag(species.id, 'effectCategories', flag.id);
      case 'ability_category':
        if (!this.speciesAbilityCategories) return false;
        const cats = this.speciesAbilityCategories[species.id];
        return !!cats && cats.has(flag.id);
      default:
        return false;
    }
  }

  matchesFlags(species) {
    // Hide "battle-only" / "cosmetic" formes (Hero, Blade, Zen, Antique, etc.)
    // from the search grid. They're still reachable via the forme switcher
    // in the search detail view, just not as their own search result.
    if (HIDDEN_FORME_KINDS.has(species.formeInfo?.kind)) {
      return false;
    }
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
      .filter(([, label]) => label.toLowerCase().includes(lower));
    const matchingEffects = Object.entries(MOVE_EFFECT_CATEGORIES)
      .filter(([, label]) => label.toLowerCase().includes(lower));
    const matchingAbilityCats = Object.entries(ABILITY_EFFECT_CATEGORIES)
      .filter(([, label]) => label.toLowerCase().includes(lower));

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
          if (!move.learnedBy || move.learnedBy.length === 0) continue;
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
          if (!a.effectCategories) continue;
          for (const sid of a.pokemon) {
            if (!map[sid]) map[sid] = new Set();
            for (const cat of a.effectCategories) map[sid].add(cat);
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
      if (needsLearnsets) p.push(loadLearnsets(this.opts.formatId).then(ls => { this.filterLearnsets = ls; }));
      if (needsAllMoves) {
        p.push(loadMovesWithLearnsets(this.opts.formatId).then(moves => {
          this.allMoves = moves;
          this.moveNames = {};
          for (const [id, move] of Object.entries(moves)) {
            if (!move.learnedBy || move.learnedBy.length === 0) continue;
            this.moveNames[id] = move.name;
          }
          this.movesLoadedForFilter = true;
        }));
      }
      if (needsAbilityCats) {
        p.push(loadAbilities(this.opts.formatId).then(abilities => {
          const map = {};
          for (const a of Object.values(abilities)) {
            if (!a.effectCategories) continue;
            for (const sid of a.pokemon) {
              if (!map[sid]) map[sid] = new Set();
              for (const cat of a.effectCategories) map[sid].add(cat);
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
    if (this.selectedIndex < 0 || this.selectedIndex >= this.filteredForNav.length) return;
    const items = this.grid.querySelectorAll('.pokemon-list-item');
    const item = items[this.selectedIndex];
    if (item) {
      item.classList.add('selected');
      const species = this.filteredForNav[this.selectedIndex];
      if (species) this.opts.onPokemonClick(species.id, species);
    }
  }

  scrollSelectedIntoView() {
    const items = this.grid.querySelectorAll('.pokemon-list-item');
    const item = items[this.selectedIndex];
    if (item) item.scrollIntoView({ block: 'nearest' });
  }

  destroy() {
    if (this.sortBar) this.sortBar.destroy();
    this.opts.container.innerHTML = '';
  }

  render() {
    this.grid.innerHTML = '';
    this.grid.classList.add('list-view');

    let speciesList = this.learnedByFilter
      ? this.allSpecies.filter(s => this.learnedByFilter.has(s.id))
      : this.allSpecies;
    let filtered = speciesList.filter(sp => this.matchesFlags(sp));

    if (this.statBounds && Object.values(this.statBounds).some(b => b.min !== undefined || b.max !== undefined)) {
      filtered = filtered.filter(sp => {
        for (const [key, bounds] of Object.entries(this.statBounds)) {
          if (bounds.min === undefined && bounds.max === undefined) continue;
          const val = sp.baseStats[key];
          if (bounds.min !== undefined && val < bounds.min) return false;
          if (bounds.max !== undefined && val > bounds.max) return false;
        }
        return true;
      });
    }

    const statKeys = {
      hp: 'hp', atk: 'atk', def: 'def', spa: 'spa', spd: 'spd', spe: 'spe'
    };
    filtered = filtered.sort((a, b) => {
      let cmp;
      if (this.sortBy === 'alpha') {
        cmp = a.name.localeCompare(b.name);
      } else if (this.sortBy === 'dex') {
        cmp = a.num - b.num;
      } else {
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

    let itemIdx = 0;
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
        img.loading = itemIdx < 20 ? 'eager' : 'lazy';
        item.appendChild(img);
      }
      itemIdx++;

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
      info.appendChild(statEl);

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
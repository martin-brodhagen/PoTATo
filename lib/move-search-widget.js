import { loadMovesWithLearnsets } from './data-loader.js';
import { TYPES, TYPE_COLORS, MOVE_CLASSIFICATIONS, EFFECT_CATEGORIES, RANGE_CATEGORIES } from './types.js';
import { SortBar } from './sort-bar.js';

function getBpDisplay(move) {
  if (move.category === 'Status') return { text: '—', title: '' };
  if (move.basePower !== 0) return { text: String(move.basePower), title: '' };
  if (move.name === 'Night Shade' || move.name === 'Seismic Toss') return { text: '50', title: '' };
  return { text: '?', title: move.desc || '' };
}

export class MoveSearchWidget {
  constructor(opts) {
    this.opts = opts;
    this.abort = new AbortController();
    this.moves = {};
    this.loaded = false;
    this.loading = false;
    this.sortBy = 'alpha';
    this.sortAsc = true;
    this.searchQuery = '';
    this.catFilter = new Set(['Physical', 'Special', 'Status']);
    this.filterFlags = [];
    this.filterMode = 'and';
    this.highlightIndex = -1;
    this.selectedIndex = -1;
    this.filteredForNav = [];
    this.activeMoveId = '';
    this.statBounds = {};
    this.statPopupKey = null;
    this.buildDOM();
    this.bindEvents();
    if (opts.moves) {
      this.moves = opts.moves;
      this.loaded = true;
      this.render();
    } else {
      this.loadMoves();
    }
  }

  async loadMoves() {
    if (this.loaded || this.loading) return;
    this.loading = true;
    this.grid.innerHTML = '<div class="loading">Loading moves…</div>';
    try {
      this.moves = await loadMovesWithLearnsets(this.opts.formatId);
      this.loaded = true;
    } catch {
      this.grid.innerHTML = '<div class="loading">Failed to load moves.</div>';
      return;
    } finally {
      this.loading = false;
    }
    this.render();
  }

  buildDOM() {
    const { container } = this.opts;
    container.classList.add('move-search-widget');

    const filterRow = document.createElement('div');
    filterRow.className = 'filter-row';

    const inputWrap = document.createElement('div');
    inputWrap.className = 'filter-input-wrap';

    this.filterInput = document.createElement('input');
    this.filterInput.className = 'ms-filter-input';
    this.filterInput.type = 'text';
    this.filterInput.placeholder = 'Search moves…';
    this.filterInput.autocomplete = 'off';

    this.resultCount = document.createElement('span');
    this.resultCount.className = 'ms-result-count result-count hidden';
    this.resultCount.textContent = '0 Results';

    inputWrap.appendChild(this.filterInput);
    inputWrap.appendChild(this.resultCount);

    const catPhysical = document.createElement('button');
    catPhysical.className = 'cat-toggle active';
    catPhysical.dataset.cat = 'Physical';
    catPhysical.title = 'Physical';
    catPhysical.innerHTML = '<img class="cat-icon" src="sprites/categories/Physical_CP.png" alt="Physical">';

    const catSpecial = document.createElement('button');
    catSpecial.className = 'cat-toggle active';
    catSpecial.dataset.cat = 'Special';
    catSpecial.title = 'Special';
    catSpecial.innerHTML = '<img class="cat-icon" src="sprites/categories/Special_CP.png" alt="Special">';

    const catStatus = document.createElement('button');
    catStatus.className = 'cat-toggle active';
    catStatus.dataset.cat = 'Status';
    catStatus.title = 'Status';
    catStatus.innerHTML = '<img class="cat-icon" src="sprites/categories/Status_CP.png" alt="Status">';

    filterRow.appendChild(catPhysical);
    filterRow.appendChild(catSpecial);
    filterRow.appendChild(catStatus);
    filterRow.appendChild(inputWrap);

    const resetBtn = document.createElement('button');
    resetBtn.className = 'ps-mega-toggle ps-reset-btn';
    resetBtn.textContent = 'Reset';
    resetBtn.addEventListener('click', () => {
      this.searchQuery = '';
      this.filterInput.value = '';
      this.sortBy = 'alpha';
      this.sortAsc = true;
      this.catFilter = new Set(['Physical', 'Special', 'Status']);
      this.filterFlags = [];
      this.filterMode = 'and';
      this.statBounds = {};
      this.highlightIndex = -1;
      this.selectedIndex = -1;
      this.filterPopup.classList.add('hidden');
      this.filterInput.blur();
      this.opts.container.querySelectorAll('.cat-toggle').forEach(btn => btn.classList.add('active'));
      this.sortBar.setActive('alpha', 'asc');
      this.renderChips();
      this.updateModeButtons();
      this.render();
    });
    filterRow.appendChild(resetBtn);

    this.filterPopup = document.createElement('div');
    this.filterPopup.className = 'ms-filter-popup filter-popup hidden';

    this.filterBar = document.createElement('div');
    this.filterBar.className = 'ms-filter-bar hidden';

    const barLabel = document.createElement('span');
    barLabel.className = 'filter-bar-label';
    barLabel.innerHTML =
      '<span class="label-text">Filters</span>' +
      '<button class="filter-clear-all" title="Clear all filters">×</button>';

    this.filterToolbar = document.createElement('div');
    this.filterToolbar.className = 'ms-filter-toolbar';

    const andBtn = document.createElement('button');
    andBtn.className = 'filter-mode active';
    andBtn.dataset.mode = 'and';
    andBtn.textContent = 'AND';

    const orBtn = document.createElement('button');
    orBtn.className = 'filter-mode';
    orBtn.dataset.mode = 'or';
    orBtn.textContent = 'OR';

    this.filterToolbar.appendChild(andBtn);
    this.filterToolbar.appendChild(orBtn);
    this.filterBar.appendChild(barLabel);
    this.filterBar.appendChild(this.filterToolbar);

    const sortBarContainer = document.createElement('div');
    sortBarContainer.className = 'ms-sort-bar';

    this.grid = document.createElement('div');
    this.grid.className = 'ms-grid';
    this.grid.setAttribute('role', 'list');
    this.grid.setAttribute('tabindex', '0');

    container.appendChild(filterRow);
    container.appendChild(this.filterPopup);
    container.appendChild(this.filterBar);
    container.appendChild(sortBarContainer);
    container.appendChild(this.grid);

    const hasStatBounds = () => ['bp', 'acc'].some(key => {
      const b = this.statBounds[key];
      return b && (b.min !== undefined || b.max !== undefined);
    });

    const updateSortBoundsClasses = () => {
      ['bp', 'acc'].forEach(key => {
        const btn = this.sortBar._sortButtons.get(key);
        if (btn) {
          const bounds = this.statBounds[key];
          btn.classList.toggle('bounds-active', !!(bounds && (bounds.min !== undefined || bounds.max !== undefined)));
        }
      });
    };

    const closeStatPopup = () => {
      this._statPopup.classList.add('hidden');
      this.statPopupKey = null;
    };

    const showStatPopup = (key) => {
      if (!this._statPopup.classList.contains('hidden') && this.statPopupKey === key) {
        closeStatPopup();
        return;
      }
      this.statPopupKey = key;
      updateSortBoundsClasses();
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

    const showTypeDropdown = () => {
      const dd = this._typeDropdown;
      dd.classList.toggle('hidden');
      if (!dd.classList.contains('hidden')) {
        const btn = this.sortBar._sortButtons.get('type');
        if (btn) {
          const rect = btn.getBoundingClientRect();
          const spaceBelow = window.innerHeight - rect.bottom;
          const dh = Math.min(280, spaceBelow - 8);
          dd.style.top = (spaceBelow > 180 ? rect.bottom + 6 : rect.top - dh - 6) + 'px';
          dd.style.left = Math.max(8, rect.left) + 'px';
          dd.style.maxHeight = dh + 'px';
        }
      }
    };

    const showClassDropdown = () => {
      const dd = this._classDropdown;
      dd.classList.toggle('hidden');
      if (!dd.classList.contains('hidden')) {
        const btn = this.sortBar._sortButtons.get('class');
        if (btn) {
          const rect = btn.getBoundingClientRect();
          const spaceBelow = window.innerHeight - rect.bottom;
          const dh = Math.min(280, spaceBelow - 8);
          dd.style.top = (spaceBelow > 180 ? rect.bottom + 6 : rect.top - dh - 6) + 'px';
          dd.style.left = Math.max(8, rect.left) + 'px';
          dd.style.maxHeight = dh + 'px';
        }
      }
    };

    this.sortBar = new SortBar({
      container: sortBarContainer,
      options: [
        { key: 'alpha', label: 'A-Z' },
        { key: 'type', label: 'Type', onClick: showTypeDropdown },
        { key: 'bp', label: 'BP', onClick: showStatPopup },
        { key: 'acc', label: 'ACC', onClick: showStatPopup },
        { key: 'class', label: 'Move Classification', onClick: showClassDropdown },
      ],
      activeKey: this.sortBy,
      activeDirection: this.sortAsc ? 'asc' : 'desc',
      onChange: (key, direction) => {
        this.sortBy = key;
        this.sortAsc = direction === 'asc';
        this.render();
      },
    });

    // ── Type dropdown ──
    this._typeDropdown = document.createElement('div');
    this._typeDropdown.className = 'ms-type-dropdown filter-popup hidden';
    let typeHtml = '';
    for (const t of TYPES) {
      typeHtml += `<div class="popup-item" data-type="${t.toLowerCase()}">${t}</div>`;
    }
    this._typeDropdown.innerHTML = typeHtml;
    sortBarContainer.appendChild(this._typeDropdown);

    this._typeDropdown.addEventListener('click', (e) => {
      const item = e.target.closest('.popup-item');
      if (!item) return;
      const type = item.dataset.type;
      this.filterFlags.push({ category: 'type', id: type, label: type.charAt(0).toUpperCase() + type.slice(1) });
      this._typeDropdown.classList.add('hidden');
      this.renderChips();
      this.render();
    });

    document.addEventListener('click', (e) => {
      if (!e.target.closest('.ms-type-dropdown') && !e.target.closest('.sort-bar-btn[data-key="type"]')) {
        this._typeDropdown.classList.add('hidden');
      }
    });

    window.addEventListener('scroll', () => { this._typeDropdown.classList.add('hidden'); }, { passive: true });
    window.addEventListener('resize', () => { this._typeDropdown.classList.add('hidden'); }, { passive: true });

    // ── Classification dropdown ──
    this._classDropdown = document.createElement('div');
    this._classDropdown.className = 'ms-class-dropdown filter-popup hidden';
    let classHtml = '<div class="popup-group"><div class="popup-group-label">Classification</div>';
    for (const [flagId, label] of Object.entries(MOVE_CLASSIFICATIONS)) {
      classHtml += `<div class="popup-item" data-category="classification" data-id="${flagId}" data-label="${label}">${label}</div>`;
    }
    classHtml += '</div><div class="popup-group"><div class="popup-group-label">Effect</div>';
    for (const [eid, label] of Object.entries(EFFECT_CATEGORIES)) {
      classHtml += `<div class="popup-item" data-category="effect" data-id="${eid}" data-label="${label}">${label}</div>`;
    }
    classHtml += '</div>';
    this._classDropdown.innerHTML = classHtml;
    sortBarContainer.appendChild(this._classDropdown);

    this._classDropdown.addEventListener('click', (e) => {
      const item = e.target.closest('.popup-item');
      if (!item) return;
      const category = item.dataset.category;
      const id = item.dataset.id;
      const label = item.dataset.label;
      this.filterFlags.push({ category, id, label });
      this._classDropdown.classList.add('hidden');
      this.renderChips();
      this.render();
    });

    document.addEventListener('click', (e) => {
      if (!e.target.closest('.ms-class-dropdown') && !e.target.closest('.sort-bar-btn[data-key="class"]')) {
        this._classDropdown.classList.add('hidden');
      }
    });

    window.addEventListener('scroll', () => { this._classDropdown.classList.add('hidden'); }, { passive: true });
    window.addEventListener('resize', () => { this._classDropdown.classList.add('hidden'); }, { passive: true });

    // ── Stat popup ──
    this._statPopup = document.createElement('div');
    this._statPopup.className = 'ms-stat-popup filter-popup hidden';
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
    sortBarContainer.appendChild(this._statPopup);

    this._statPopup.addEventListener('click', (e) => {
      const dirBtn = e.target.closest('.stat-dir-btn');
      if (dirBtn) {
        const key = this.statPopupKey;
        if (key) {
          this.sortBy = key;
          this.sortAsc = dirBtn.dataset.dir === 'asc';
          this.sortBar.setActive(key, this.sortAsc ? 'asc' : 'desc');
          closeStatPopup();
          this.render();
        }
      }
    });

    this._statPopup.querySelector('.stat-range-min').addEventListener('input', () => {
      const input = this._statPopup.querySelector('.stat-range-min');
      const key = this.statPopupKey;
      if (!key) return;
      let val = input.value;
      if (val !== '') {
        const num = parseInt(val, 10);
        if (isNaN(num)) { input.value = ''; val = ''; }
        else if (num < 0) { input.value = '0'; val = '0'; }
        else if (num > 255) { input.value = '255'; val = '255'; }
      }
      if (!this.statBounds[key]) this.statBounds[key] = {};
      this.statBounds[key].min = val !== '' ? parseInt(val, 10) : undefined;
      this.render();
      updateSortBoundsClasses();
    });

    this._statPopup.querySelector('.stat-range-max').addEventListener('input', () => {
      const input = this._statPopup.querySelector('.stat-range-max');
      const key = this.statPopupKey;
      if (!key) return;
      let val = input.value;
      if (val !== '') {
        const num = parseInt(val, 10);
        if (isNaN(num)) { input.value = ''; val = ''; }
        else if (num < 0) { input.value = '0'; val = '0'; }
        else if (num > 255) { input.value = '255'; val = '255'; }
      }
      if (!this.statBounds[key]) this.statBounds[key] = {};
      this.statBounds[key].max = val !== '' ? parseInt(val, 10) : undefined;
      this.render();
      updateSortBoundsClasses();
    });

    this._statPopup.querySelector('.stat-apply-btn').addEventListener('click', closeStatPopup);

    this._statPopup.querySelector('.stat-range-min').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') closeStatPopup();
    });
    this._statPopup.querySelector('.stat-range-max').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') closeStatPopup();
    });

    document.addEventListener('click', (e) => {
      const statBtn = e.target.closest('.sort-bar-btn') ? e.target.closest('.sort-bar-btn').dataset.key : null;
      const isStatPill = statBtn && ['bp', 'acc'].includes(statBtn);
      if (!e.target.closest('.ms-stat-popup') && !isStatPill) {
        closeStatPopup();
      }
    });

    window.addEventListener('scroll', () => { closeStatPopup(); }, { passive: true });
    window.addEventListener('resize', () => { closeStatPopup(); }, { passive: true });

    updateSortBoundsClasses();
  }

  bindEvents() {
    const { signal } = this.abort;

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

    this.filterInput.addEventListener('input', () => {
      this.searchQuery = this.filterInput.value;
      this.updatePopup();
      this.render();
    }, { signal });

    this.filterInput.addEventListener('keydown', (e) => {
      const popupVisible = !this.filterPopup.classList.contains('hidden');
      const items = popupVisible
        ? this.filterPopup.querySelectorAll('.popup-item')
        : [];
      const n = items.length;

      if ((e.key === 'ArrowDown' || (e.key === 'Tab' && !e.shiftKey)) && popupVisible) {
        e.preventDefault();
        this.highlightIndex = n > 0 ? (this.highlightIndex + 1) % n : -1;
        items.forEach((el, i) => el.classList.toggle('highlighted', i === this.highlightIndex));
        if (this.highlightIndex >= 0 && this.highlightIndex < n)
          items[this.highlightIndex].scrollIntoView({ block: 'nearest' });
      } else if ((e.key === 'ArrowUp' || (e.key === 'Tab' && e.shiftKey)) && popupVisible) {
        e.preventDefault();
        this.highlightIndex = n > 0 ? (this.highlightIndex - 1 + n) % n : -1;
        items.forEach((el, i) => el.classList.toggle('highlighted', i === this.highlightIndex));
        if (this.highlightIndex >= 0 && this.highlightIndex < n)
          items[this.highlightIndex].scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'Enter' && popupVisible) {
        e.preventDefault();
        if (n === 0) return;
        const idx = this.highlightIndex >= 0 ? this.highlightIndex : 0;
        const item = items[idx];
        this.addFlag(item.dataset.category, item.dataset.id, item.dataset.label);
      } else if (e.key === 'Escape') {
        this.clearFilter();
        this.filterInput.blur();
      }
    }, { signal });

    this.opts.container.querySelectorAll('.cat-toggle').forEach(btn => {
      btn.addEventListener('click', () => {
        const cat = btn.dataset.cat;
        if (this.catFilter.has(cat)) {
          this.catFilter.delete(cat);
          btn.classList.remove('active');
        } else {
          this.catFilter.add(cat);
          btn.classList.add('active');
        }
        this.render();
      }, { signal });
    });

    this.filterPopup.addEventListener('click', (e) => {
      const item = e.target.closest('.popup-item');
      if (!item) return;
      this.addFlag(item.dataset.category, item.dataset.id, item.dataset.label);
      this.filterInput.focus();
    }, { signal });

    document.addEventListener('click', (e) => {
      const target = e.target;
      if (!target.closest('.ms-filter-input') && !target.closest('.ms-filter-popup')) {
        this.filterPopup.classList.add('hidden');
      }
    }, { signal });

    window.addEventListener('scroll', () => {
      this.filterPopup.classList.add('hidden');
    }, { passive: true, signal });

    window.addEventListener('resize', () => {
      this.filterPopup.classList.add('hidden');
    }, { passive: true, signal });

    this.filterBar.addEventListener('click', (e) => {
      const clearBtn = e.target.closest('.filter-clear-all');
      if (clearBtn) {
        this.filterFlags = [];
        this.renderChips();
        this.render();
      }
    }, { signal });

    this.filterToolbar.addEventListener('click', (e) => {
      const btn = e.target.closest('.filter-mode');
      if (!btn) return;
      const mode = btn.dataset.mode;
      if (mode !== 'and' && mode !== 'or') return;
      this.filterMode = mode;
      this.updateModeButtons();
      this.render();
    }, { signal });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && (this.filterInput.value || this.filterFlags.length > 0)) {
        this.clearFilter();
      }
    }, { signal });
  }

  matchesFlag(move, flag) {
    if (flag.category === 'type') return move.type.toLowerCase() === flag.id;
    if (flag.category === 'pokemon') return !!move.learnedBy && move.learnedBy.includes(flag.id);
    if (flag.category === 'classification') return !!move.flags && move.flags.includes(flag.id);
    if (flag.category === 'effect') return !!move.effectCategories && move.effectCategories.includes(flag.id);
    if (flag.category === 'range') return move.range === flag.id;
    return false;
  }

  updatePopup() {
    const text = this.filterInput.value.trim();
    if (text.length < 2) {
      this.filterPopup.classList.add('hidden');
      return;
    }

    const lower = text.toLowerCase();

    const matchingTypes = TYPES.filter(t => t.toLowerCase().includes(lower));
    const matchingPokemon = [];
    for (const [, move] of Object.entries(this.moves)) {
      if (!move.learnedBy || move.learnedBy.length === 0) continue;
      for (const sid of move.learnedBy) {
        if (!matchingPokemon.some(p => p.id === sid)) {
          const name = this.opts.speciesNames?.[sid] || sid;
          if (name.toLowerCase().includes(lower) || sid.includes(lower)) matchingPokemon.push({ id: sid, name });
        }
      }
    }
    const matchingClassifications = Object.entries(MOVE_CLASSIFICATIONS)
      .filter(([, label]) => label.toLowerCase().includes(lower));
    const matchingEffects = Object.entries(EFFECT_CATEGORIES)
      .filter(([, label]) => label.toLowerCase().includes(lower));
    const matchingRanges = Object.entries(RANGE_CATEGORIES)
      .filter(([, label]) => label.toLowerCase().includes(lower));

    const total = matchingTypes.length + matchingPokemon.length + matchingClassifications.length + matchingEffects.length + matchingRanges.length;
    if (total === 0) {
      this.filterPopup.classList.add('hidden');
      return;
    }

    let html = '';
    if (matchingTypes.length > 0) {
      html += '<div class="popup-group"><div class="popup-group-label">Type</div>';
      for (const t of matchingTypes.slice(0, 10)) {
        const dotColor = TYPE_COLORS[t] || '#888';
        html += `<div class="popup-item" data-category="type" data-id="${t.toLowerCase()}" data-label="${t}"><span class="popup-type-dot" style="background:${dotColor}"></span>${t}</div>`;
      }
      html += '</div>';
    }
    if (matchingClassifications.length > 0) {
      html += '<div class="popup-group"><div class="popup-group-label">Move Classifications</div>';
      for (const [flagId, label] of matchingClassifications) {
        html += `<div class="popup-item" data-category="classification" data-id="${flagId}" data-label="${label}">${label}</div>`;
      }
      html += '</div>';
    }
    if (matchingEffects.length > 0) {
      html += '<div class="popup-group"><div class="popup-group-label">Effect</div>';
      for (const [eid, label] of matchingEffects) {
        html += `<div class="popup-item" data-category="effect" data-id="${eid}" data-label="${label}">${label}</div>`;
      }
      html += '</div>';
    }
    if (matchingRanges.length > 0) {
      html += '<div class="popup-group"><div class="popup-group-label">Range</div>';
      for (const [rid, label] of matchingRanges) {
        html += `<div class="popup-item" data-category="range" data-id="${rid}" data-label="${label}">${label}</div>`;
      }
      html += '</div>';
    }
    if (matchingPokemon.length > 0) {
      html += '<div class="popup-group"><div class="popup-group-label">Pokémon</div>';
      for (const s of matchingPokemon.slice(0, 15)) {
        html += `<div class="popup-item" data-category="pokemon" data-id="${s.id}" data-label="${s.name}">${s.name}</div>`;
      }
      html += '</div>';
    }

    this.filterPopup.innerHTML = html;
    this.highlightIndex = -1;
    this.filterPopup.classList.remove('hidden');

    const rect = this.filterInput.getBoundingClientRect();
    const popupStyle = this.filterPopup.style;
    const spaceBelow = window.innerHeight - rect.bottom;
    const popupHeight = Math.min(280, spaceBelow - 8);
    popupStyle.top = (spaceBelow > 180 ? rect.bottom + 6 : rect.top - popupHeight - 6) + 'px';
    popupStyle.left = Math.max(8, rect.left) + 'px';
    popupStyle.width = Math.max(220, rect.width) + 'px';
    popupStyle.maxHeight = popupHeight + 'px';
  }

  addFlag(category, id, label) {
    this.filterFlags.push({ category, id, label });
    this.filterInput.value = '';
    this.searchQuery = '';
    this.filterPopup.classList.add('hidden');
    this.renderChips();
    this.render();
  }

  removeFlag(index) {
    this.filterFlags.splice(index, 1);
    this.renderChips();
    this.render();
  }

  renderChips() {
    this.filterBar.querySelectorAll('.filter-chip').forEach(el => el.remove());
    this.filterBar.classList.toggle('hidden', this.filterFlags.length === 0);
    for (let i = 0; i < this.filterFlags.length; i++) {
      const f = this.filterFlags[i];
      const chip = document.createElement('span');
      chip.className = 'filter-chip';
      chip.dataset.category = f.category;
      chip.innerHTML = `${f.label} <span class="chip-remove" data-index="${i}">×</span>`;
      chip.querySelector('.chip-remove').addEventListener('click', (e) => {
        e.stopPropagation();
        this.removeFlag(i);
      });
      this.filterBar.insertBefore(chip, this.filterToolbar);
    }
  }

  updateModeButtons() {
    this.filterToolbar.querySelectorAll('.filter-mode').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mode === this.filterMode);
    });
  }

  clearFilter() {
    this.filterFlags = [];
    this.filterMode = 'and';
    this.highlightIndex = -1;
    this.filterPopup.classList.add('hidden');
    this.renderChips();
    this.updateModeButtons();
    this.render();
  }

  render() {
    let list = Object.entries(this.moves).map(([id, m]) => ({ id, ...m }));
    list = list.filter(m => m.learnedBy && m.learnedBy.length > 0);

    if (this.opts.learnsetSpecies) {
      list = list.filter(m => m.learnedBy.includes(this.opts.learnsetSpecies));
    }

    if (this.filterFlags.length > 0) {
      list = list.filter(m => {
        const results = this.filterFlags.map(f => this.matchesFlag(m, f));
        return this.filterMode === 'and' ? results.every(Boolean) : results.some(Boolean);
      });
    }

    if (this.searchQuery) {
      const q = this.searchQuery.toLowerCase();
      list = list.filter(m => m.name.toLowerCase().includes(q) || m.id.includes(q));
    }

    if (this.catFilter.size < 3) {
      list = list.filter(m => this.catFilter.has(m.category));
    }

    if (Object.keys(this.statBounds).length > 0) {
      list = list.filter(m => {
        for (const [key, bounds] of Object.entries(this.statBounds)) {
          if (bounds.min !== undefined || bounds.max !== undefined) {
            let val;
            if (key === 'bp') val = m.basePower;
            else if (key === 'acc') val = typeof m.accuracy === 'number' ? m.accuracy : (m.accuracy === true ? 100 : 0);
            if (bounds.min !== undefined && val < bounds.min) return false;
            if (bounds.max !== undefined && val > bounds.max) return false;
          }
        }
        return true;
      });
    }

    list = list.sort((a, b) => {
      let cmp = 0;
      if (this.sortBy === 'alpha') {
        cmp = a.name.localeCompare(b.name);
      } else if (this.sortBy === 'bp') {
        cmp = a.basePower - b.basePower;
      } else if (this.sortBy === 'acc') {
        const accA = typeof a.accuracy === 'number' ? a.accuracy : (a.accuracy === true ? 101 : 0);
        const accB = typeof b.accuracy === 'number' ? b.accuracy : (b.accuracy === true ? 101 : 0);
        cmp = accA - accB;
      } else if (this.sortBy === 'pri') {
        cmp = a.priority - b.priority;
      }
      return this.sortAsc ? cmp : -cmp;
    });

    this.filteredForNav = list;
    this.selectedIndex = -1;

    this.resultCount.textContent = `${list.length} Result${list.length === 1 ? '' : 's'}`;
    this.resultCount.classList.toggle('hidden', false);

    this.grid.innerHTML = '';
    if (list.length === 0) {
      this.grid.innerHTML = '<div class="loading">No moves match your search.</div>';
      return;
    }

    for (const m of list) {
      const el = document.createElement('div');
      el.className = 'move-entry' + (m.id === this.activeMoveId ? ' selected' : '');
      const bpHL = this.sortBy === 'bp' ? ' move-entry-stat-highlighted' : '';
      const accHL = this.sortBy === 'acc' ? ' move-entry-stat-highlighted' : '';
      const bp = getBpDisplay(m);
      const bpTitle = bp.title ? ` title="${bp.title}"` : '';
      const descTitle = m.desc ? ` title="${m.desc}"` : '';
      el.innerHTML =
        `<span class="move-entry-name">${m.name}</span>` +
        `<span class="move-entry-type type-tag ${m.type.toLowerCase()}">${m.type}</span>` +
        `<span class="move-entry-cat cat-${m.category.toLowerCase()}"><img class="cat-icon-small" src="sprites/categories/${m.category}_CP.png" alt="${m.category}"></span>` +
        `<span class="move-entry-stat${bpHL}"><span class="move-entry-stat-label">BP</span><span class="move-entry-stat-value"${bpTitle}>${bp.text}</span></span>` +
        `<span class="move-entry-stat${accHL}"><span class="move-entry-stat-label">ACC</span><span class="move-entry-stat-value">${typeof m.accuracy === 'number' ? m.accuracy + '%' : m.accuracy === true ? '—' : '—'}</span></span>` +
        `<span class="move-entry-divider"></span>` +
        `<span class="move-entry-desc"${descTitle}>${m.desc || ''}</span>`;

      if (this.opts.onMoveClick) {
        el.addEventListener('click', () => {
          this.grid.querySelector('.move-entry.selected')?.classList.remove('selected');
          el.classList.add('selected');
          this.selectedIndex = list.indexOf(m);
          this.activeMoveId = m.id;
          this.opts.onMoveClick(m.id, m);
        });
      }

      this.grid.appendChild(el);
    }
  }

  setMoves(moves) {
    this.moves = moves;
    this.loaded = true;
    this.render();
  }

  updateListSelection() {
    document.querySelectorAll('.move-entry.selected').forEach(el => el.classList.remove('selected'));
    if (this.selectedIndex < 0 || this.selectedIndex >= this.filteredForNav.length) return;
    const items = this.grid.querySelectorAll('.move-entry');
    const item = items[this.selectedIndex];
    if (item) {
      item.classList.add('selected');
      const moveData = this.filteredForNav[this.selectedIndex];
      const moveId = moveData['id'];
      const move = this.moves[moveId];
      if (move && this.opts.onMoveClick) this.opts.onMoveClick(moveId, move);
    }
  }

  scrollSelectedIntoView() {
    const items = this.grid.querySelectorAll('.move-entry');
    const item = items[this.selectedIndex];
    if (item) item.scrollIntoView({ block: 'nearest' });
  }

  destroy() {
    this.abort.abort();
    if (this.sortBar) this.sortBar.destroy();
    this.opts.container.innerHTML = '';
    this.opts.container.classList.remove('move-search-widget');
  }
}
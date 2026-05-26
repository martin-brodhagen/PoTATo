import type { Move, FilterFlag, FormatId } from './types.js';
import { loadMovesWithLearnsets } from './data-loader.js';

export const TYPES = ['Normal','Fire','Water','Electric','Grass','Ice','Fighting','Poison','Ground','Flying','Psychic','Bug','Rock','Ghost','Dragon','Dark','Steel','Fairy'];

export const TYPE_COLORS: Record<string, string> = {
  Normal: '#9099a1', Fire: '#e56c3e', Water: '#4f8ed4',
  Electric: '#e5c531', Grass: '#5fbb63', Ice: '#70cde7',
  Fighting: '#c44d4d', Poison: '#ab6ac8', Ground: '#cc9f4a',
  Flying: '#8fa8dd', Psychic: '#e26a8a', Bug: '#92bc2c',
  Rock: '#b6a14a', Ghost: '#6060b0', Dragon: '#6969cc',
  Dark: '#5a4f44', Steel: '#5a8ea2', Fairy: '#e08ee0',
};

export const MOVE_CLASSIFICATIONS: Record<string, string> = {
  bite: 'Biting', bullet: 'Ball & Bomb', contact: 'Contact', dance: 'Dance',
  punch: 'Punching', pulse: 'Pulse', wind: 'Wind', slicing: 'Slicing',
  powder: 'Powder', heal: 'Healing', sound: 'Sound-Based',
};

export const EFFECT_CATEGORIES: Record<string, string> = {
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

export const RANGE_CATEGORIES: Record<string, string> = {
  self: 'Self',
  singleTarget: 'Single Target',
  singleAlly: 'Single Ally',
  allPokemon: 'All Pokémon',
  allOpponents: 'All Opponents',
  entireField: 'Entire Field',
  usersSide: "User's Side",
  opponentsSide: "Opponent's Side",
  randomOpponent: 'Random Opponent',
  varies: 'Varies',
  allAllies: 'All Allies',
};

export interface MoveSearchWidgetOptions {
  container: HTMLElement;
  formatId: FormatId;
  speciesNames?: Record<string, string>;
  learnsetSpecies?: string;
  onMoveClick?: (moveId: string, move: Move) => void;
}

function getBpDisplay(move: Move): { text: string; title: string } {
  if (move.category === 'Status') return { text: '—', title: '' };
  if (move.basePower !== 0) return { text: String(move.basePower), title: '' };
  if (move.name === 'Night Shade' || move.name === 'Seismic Toss') return { text: '50', title: '' };
  return { text: '?', title: move.shortDesc || '' };
}

export class MoveSearchWidget {
  private opts: MoveSearchWidgetOptions;
  private abort = new AbortController();
  private moves: Record<string, Move> = {};
  private loaded = false;
  private loading = false;

  private sortBy = 'alpha';
  private sortAsc = true;
  private searchQuery = '';
  private catFilter: Set<string> = new Set(['Physical', 'Special', 'Status']);
  private filterFlags: FilterFlag[] = [];
  private filterMode: 'and' | 'or' = 'and';
  private highlightIndex = -1;
  private selectedIndex = -1;
  private filteredForNav: { id: string; [key: string]: unknown }[] = [];
  private activeMoveId = '';

  private sortSelect!: HTMLSelectElement;
  private sortDirBtn!: HTMLButtonElement;
  private filterInput!: HTMLInputElement;
  private resultCount!: HTMLSpanElement;
  private grid!: HTMLDivElement;
  private filterPopup!: HTMLDivElement;
  private filterBar!: HTMLDivElement;
  private filterToolbar!: HTMLDivElement;

  constructor(opts: MoveSearchWidgetOptions) {
    this.opts = opts;
    this.buildDOM();
    this.bindEvents();
    this.loadMoves();
  }

  private async loadMoves() {
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

  private buildDOM() {
    const { container } = this.opts;
    container.classList.add('move-search-widget');

    // Filter row
    const filterRow = document.createElement('div');
    filterRow.className = 'filter-row';

    this.sortSelect = document.createElement('select');
    this.sortSelect.className = 'ms-sort-select';
    this.sortSelect.innerHTML =
      '<option value="alpha">Alphabetical</option>' +
      '<option value="bp">Base Power</option>' +
      '<option value="acc">Accuracy</option>' +
      '<option value="pri">Priority</option>';

    this.sortDirBtn = document.createElement('button');
    this.sortDirBtn.className = 'ms-sort-dir sort-dir';
    this.sortDirBtn.textContent = '▲';

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

    filterRow.appendChild(this.sortSelect);
    filterRow.appendChild(this.sortDirBtn);
    filterRow.appendChild(inputWrap);
    filterRow.appendChild(catPhysical);
    filterRow.appendChild(catSpecial);
    filterRow.appendChild(catStatus);

    // Filter popup
    this.filterPopup = document.createElement('div');
    this.filterPopup.className = 'ms-filter-popup filter-popup hidden';

    // Filter bar
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

    // Grid
    this.grid = document.createElement('div');
    this.grid.className = 'ms-grid';
    this.grid.setAttribute('role', 'list');
    this.grid.setAttribute('tabindex', '0');

    container.appendChild(filterRow);
    container.appendChild(this.filterPopup);
    container.appendChild(this.filterBar);
    container.appendChild(this.grid);
  }

  private bindEvents() {
    const { signal } = this.abort;

    // Keyboard navigation for list
    this.grid.addEventListener('keydown', (e: KeyboardEvent) => {
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

    // Sort
    const statSortKeys = new Set(['bp', 'acc', 'pri']);
    this.sortSelect.addEventListener('change', () => {
      this.sortBy = this.sortSelect.value;
      const shouldDesc = statSortKeys.has(this.sortBy);
      if (this.sortAsc === shouldDesc) {
        this.sortAsc = !shouldDesc;
        this.sortDirBtn.textContent = this.sortAsc ? '▲' : '▼';
      }
      this.render();
    }, { signal });

    this.sortDirBtn.addEventListener('click', () => {
      this.sortAsc = !this.sortAsc;
      this.sortDirBtn.textContent = this.sortAsc ? '▲' : '▼';
      this.render();
    }, { signal });

    // Filter input
    this.filterInput.addEventListener('input', () => {
      this.searchQuery = this.filterInput.value;
      this.updatePopup();
      this.render();
    }, { signal });

    this.filterInput.addEventListener('keydown', (e: KeyboardEvent) => {
      const popupVisible = !this.filterPopup.classList.contains('hidden');
      const items = popupVisible
        ? this.filterPopup.querySelectorAll<HTMLElement>('.popup-item')
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
        this.addFlag(
          item.dataset.category as FilterFlag['category'],
          item.dataset.id!,
          item.dataset.label!,
        );
      } else if (e.key === 'Escape') {
        this.clearFilter();
        this.filterInput.blur();
      }
    }, { signal });

    // Category toggles
    this.opts.container.querySelectorAll<HTMLButtonElement>('.cat-toggle').forEach(btn => {
      btn.addEventListener('click', () => {
        const cat = btn.dataset.cat!;
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

    // Popup click (delegated)
    this.filterPopup.addEventListener('click', (e) => {
      const item = (e.target as HTMLElement).closest('.popup-item') as HTMLElement | null;
      if (!item) return;
      this.addFlag(
        item.dataset.category as FilterFlag['category'],
        item.dataset.id!,
        item.dataset.label!,
      );
      this.filterInput.focus();
    }, { signal });

    // Click outside to close popup
    document.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.ms-filter-input') && !target.closest('.ms-filter-popup')) {
        this.filterPopup.classList.add('hidden');
      }
    }, { signal });

    // Scroll/resize close popup
    window.addEventListener('scroll', () => {
      this.filterPopup.classList.add('hidden');
    }, { passive: true, signal });

    window.addEventListener('resize', () => {
      this.filterPopup.classList.add('hidden');
    }, { passive: true, signal });

    // Filter bar clear
    this.filterBar.addEventListener('click', (e) => {
      const clearBtn = (e.target as HTMLElement).closest('.filter-clear-all');
      if (clearBtn) {
        this.filterFlags = [];
        this.renderChips();
        this.render();
      }
    }, { signal });

    // Filter toolbar mode
    this.filterToolbar.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest('.filter-mode') as HTMLButtonElement | null;
      if (!btn) return;
      const mode = btn.dataset.mode;
      if (mode !== 'and' && mode !== 'or') return;
      this.filterMode = mode;
      this.updateModeButtons();
      this.render();
    }, { signal });

    // Global Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && (this.filterInput.value || this.filterFlags.length > 0)) {
        this.clearFilter();
      }
    }, { signal });
  }

  private matchesFlag(move: Move, flag: FilterFlag): boolean {
    if (flag.category === 'type') return move.type.toLowerCase() === flag.id;
    if (flag.category === 'pokemon') return !!move.learnedBy && move.learnedBy.includes(flag.id);
    if (flag.category === 'classification') return !!move.flags && move.flags.includes(flag.id);
    if (flag.category === 'effect') return !!move.effectCategories && move.effectCategories.includes(flag.id);
    if (flag.category === 'range') return move.range === flag.id;
    return false;
  }

  private updatePopup() {
    const text = this.filterInput.value.trim();
    if (text.length < 2) {
      this.filterPopup.classList.add('hidden');
      return;
    }

    const lower = text.toLowerCase();

    const matchingTypes = TYPES.filter(t => t.toLowerCase().includes(lower));
    const matchingPokemon: { id: string; name: string }[] = [];
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
      .filter(([_, label]) => label.toLowerCase().includes(lower));
    const matchingEffects = Object.entries(EFFECT_CATEGORIES)
      .filter(([_, label]) => label.toLowerCase().includes(lower));
    const matchingRanges = Object.entries(RANGE_CATEGORIES)
      .filter(([_, label]) => label.toLowerCase().includes(lower));

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

  private addFlag(category: FilterFlag['category'], id: string, label: string) {
    this.filterFlags.push({ category, id, label });
    this.filterInput.value = '';
    this.searchQuery = '';
    this.filterPopup.classList.add('hidden');
    this.renderChips();
    this.render();
  }

  private removeFlag(index: number) {
    this.filterFlags.splice(index, 1);
    this.renderChips();
    this.render();
  }

  private renderChips() {
    this.filterBar.querySelectorAll('.filter-chip').forEach(el => el.remove());
    this.filterBar.classList.toggle('hidden', this.filterFlags.length === 0);
    for (let i = 0; i < this.filterFlags.length; i++) {
      const f = this.filterFlags[i];
      const chip = document.createElement('span');
      chip.className = 'filter-chip';
      chip.dataset.category = f.category;
      chip.innerHTML = `${f.label} <span class="chip-remove" data-index="${i}">×</span>`;
      chip.querySelector('.chip-remove')!.addEventListener('click', (e) => {
        e.stopPropagation();
        this.removeFlag(i);
      });
      this.filterBar.insertBefore(chip, this.filterToolbar);
    }
  }

  private updateModeButtons() {
    this.filterToolbar.querySelectorAll<HTMLButtonElement>('.filter-mode').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mode === this.filterMode);
    });
  }

  private clearFilter() {
    this.filterFlags = [];
    this.filterMode = 'and';
    this.highlightIndex = -1;
    this.filterPopup.classList.add('hidden');
    this.renderChips();
    this.updateModeButtons();
    this.render();
  }

  private render() {
    let list = Object.entries(this.moves).map(([id, m]) => ({ id, ...m }));
    list = list.filter(m => m.learnedBy && m.learnedBy.length > 0);

    if (this.opts.learnsetSpecies) {
      list = list.filter(m => m.learnedBy!.includes(this.opts.learnsetSpecies!));
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
      const priHL = this.sortBy === 'pri' ? ' move-entry-stat-highlighted' : '';
      const bp = getBpDisplay(m);
      const bpTitle = bp.title ? ` title="${bp.title}"` : '';
      const descTitle = m.shortDesc ? ` title="${m.shortDesc}"` : '';
      const priHtml = `<span class="move-entry-stat${priHL}"><span class="move-entry-stat-label">Pri</span><span class="move-entry-stat-value">${m.priority !== 0 ? (m.priority > 0 ? '+' + m.priority : m.priority) : '—'}</span></span>`;
      el.innerHTML =
        `<span class="move-entry-name">${m.name}</span>` +
        `<span class="move-entry-type type-tag ${m.type.toLowerCase()}">${m.type}</span>` +
        `<span class="move-entry-cat cat-${m.category.toLowerCase()}"><img class="cat-icon-small" src="sprites/categories/${m.category}_CP.png" alt="${m.category}"></span>` +
        `<span class="move-entry-stat${bpHL}"><span class="move-entry-stat-label">BP</span><span class="move-entry-stat-value"${bpTitle}>${bp.text}</span></span>` +
        `<span class="move-entry-stat${accHL}"><span class="move-entry-stat-label">ACC</span><span class="move-entry-stat-value">${typeof m.accuracy === 'number' ? m.accuracy + '%' : m.accuracy === true ? '—' : '—'}</span></span>` +
        `<span class="move-entry-stat"><span class="move-entry-stat-label">PP</span><span class="move-entry-stat-value">${m.pp}</span></span>` +
        priHtml +
        `<span class="move-entry-divider"></span>` +
        `<span class="move-entry-desc"${descTitle}>${m.shortDesc || ''}</span>`;

      if (this.opts.onMoveClick) {
        el.addEventListener('click', () => {
          this.grid.querySelector('.move-entry.selected')?.classList.remove('selected');
          el.classList.add('selected');
          this.selectedIndex = list.indexOf(m);
          this.activeMoveId = m.id;
          this.opts.onMoveClick!(m.id, m);
        });
      }

      this.grid.appendChild(el);
    }
  }

  setMoves(moves: Record<string, Move>) {
    this.moves = moves;
    this.loaded = true;
    this.render();
  }

  private updateListSelection() {
    document.querySelectorAll('.move-entry.selected').forEach(el => el.classList.remove('selected'));
    if (this.selectedIndex < 0 || this.selectedIndex >= this.filteredForNav.length) return;
    const items = this.grid.querySelectorAll('.move-entry');
    const item = items[this.selectedIndex] as HTMLElement;
    if (item) {
      item.classList.add('selected');
      const moveData = this.filteredForNav[this.selectedIndex];
      const moveId = moveData['id'] as string;
      const move = this.moves[moveId];
      if (move && this.opts.onMoveClick) this.opts.onMoveClick(moveId, move);
    }
  }

  private scrollSelectedIntoView() {
    const items = this.grid.querySelectorAll('.move-entry');
    const item = items[this.selectedIndex] as HTMLElement;
    if (item) item.scrollIntoView({ block: 'nearest' });
  }

  destroy() {
    this.abort.abort();
    this.opts.container.innerHTML = '';
    this.opts.container.classList.remove('move-search-widget');
  }
}

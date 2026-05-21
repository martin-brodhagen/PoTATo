import type { Species, FormatId, FilterFlag, Move } from './types.js';
import { loadLearnsets, loadMovesWithLearnsets, loadAbilities } from './data-loader.js';
import { TYPES, TYPE_COLORS, MOVE_CLASSIFICATIONS, EFFECT_CATEGORIES } from './move-search-widget.js';
import { ABILITY_EFFECT_CATEGORIES } from './ability-search-widget.js';

const SPRITE_PATH = 'sprites/champions';
const LS_SORT_BY = 'potato_sort_by';
const LS_SORT_ASC = 'potato_sort_asc';
const LS_VIEW = 'potato_view';

export interface PokemonSearchWidgetOptions {
  container: HTMLElement;
  formatId: FormatId;
  onPokemonClick: (speciesId: string, species: Species) => void;
  species?: Species[];
  spriteMap?: Record<string, string>;
  learnedByFilter?: string[];
}

export class PokemonSearchWidget {
  private opts: PokemonSearchWidgetOptions;
  private allSpecies: Species[] = [];
  private spriteMap: Record<string, string> = {};

  private searchQuery = '';
  private sortBy = 'dex';
  private sortAsc = true;
  private viewMode: 'card' | 'list' = 'card';
  private showMegas = true;
  private filterFlags: FilterFlag[] = [];
  private filterMode: 'and' | 'or' = 'and';
  private filterHighlightIndex = -1;
  private allAbilities: string[] = [];
  private learnedByFilter: Set<string> | null = null;
  private moveNames: Record<string, string> = {};
  private allMoves: Record<string, Move> = {};
  private movesLoadedForFilter = false;
  private movesLoadingForFilter = false;
  private filterLearnsets: Record<string, string[]> | null = null;
  private speciesAbilityCategories: Record<string, Set<string>> | null = null;
  private abilityCategoriesLoading = false;
  private abilityCategoriesLoaded = false;

  private grid!: HTMLDivElement;
  private filterInput!: HTMLInputElement;
  private sortSelect!: HTMLSelectElement;
  private sortDirBtn!: HTMLButtonElement;
  private megaToggle!: HTMLButtonElement;
  private viewToggle!: HTMLButtonElement;
  private resultCount!: HTMLSpanElement;
  private filterPopup!: HTMLDivElement;
  private filterToolbar!: HTMLDivElement;

  constructor(opts: PokemonSearchWidgetOptions) {
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

  private restoreLocalStorage() {
    const savedSortBy = localStorage.getItem(LS_SORT_BY);
    if (savedSortBy && ['dex', 'alpha', 'hp', 'atk', 'def', 'spa', 'spd', 'spe'].includes(savedSortBy)) {
      this.sortBy = savedSortBy;
    }
    const savedSortAsc = localStorage.getItem(LS_SORT_ASC);
    if (savedSortAsc === 'true' || savedSortAsc === 'false') {
      this.sortAsc = savedSortAsc === 'true';
    }
    const savedView = localStorage.getItem(LS_VIEW);
    if (savedView === 'card' || savedView === 'list') {
      this.viewMode = savedView;
    }
  }

  private buildDOM() {
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
      if (opt.value === this.sortBy) el.selected = true;
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

    const viewToggle = document.createElement('button');
    viewToggle.className = 'ps-view-toggle view-toggle';
    viewToggle.dataset.view = this.viewMode;
    viewToggle.innerHTML = this.viewMode === 'card'
      ? '<span class="view-icon-grid"></span>'
      : '<span class="view-icon-list"></span>';
    this.viewToggle = viewToggle;
    filterRow.appendChild(viewToggle);

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
    this.grid = grid;
    container.appendChild(grid);
  }

  private bindEvents() {
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

    this.viewToggle.addEventListener('click', () => {
      this.viewMode = this.viewMode === 'card' ? 'list' : 'card';
      this.viewToggle.dataset.view = this.viewMode;
      this.viewToggle.innerHTML = this.viewMode === 'card'
        ? '<span class="view-icon-grid"></span>'
        : '<span class="view-icon-list"></span>';
      localStorage.setItem(LS_VIEW, this.viewMode);
      this.render();
    });

    this.filterInput.addEventListener('input', () => {
      this.searchQuery = this.filterInput.value;
      this.updatePopup();
      this.render();
    });

    this.filterInput.addEventListener('keydown', (e) => {
      const popupVisible = !this.filterPopup.classList.contains('hidden');
      const items = popupVisible ? this.filterPopup.querySelectorAll<HTMLElement>('.popup-item') : [];
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
        this.addFlag(
          item.dataset.category as FilterFlag['category'],
          item.dataset.id!,
          item.dataset.label!
        );
      } else if (e.key === 'Escape') {
        this.clear();
      }
    });

    this.filterPopup.addEventListener('click', (e) => {
      const item = (e.target as HTMLElement).closest('.popup-item') as HTMLElement | null;
      if (!item) return;
      const cat = item.dataset.category as FilterFlag['category'];
      const id = item.dataset.id!;
      const label = item.dataset.label!;
      this.addFlag(cat, id, label);
      this.filterInput.focus();
    });

    const filterBar = this.filterInput.parentElement!.parentElement!.nextElementSibling!.nextElementSibling as HTMLElement;
    filterBar.addEventListener('click', (e) => {
      const clearBtn = (e.target as HTMLElement).closest('.filter-clear-all');
      if (clearBtn) {
        this.filterFlags = [];
        this.renderChips();
        this.render();
        return;
      }
    });

    this.filterToolbar.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest('.filter-mode') as HTMLButtonElement | null;
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

    document.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
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

  setData(species: Species[], spriteMap: Record<string, string>) {
    this.allSpecies = species;
    this.spriteMap = spriteMap;

    const abilitySet = new Set<string>();
    for (const s of species) {
      for (const v of Object.values(s.abilities)) {
        if (v) abilitySet.add(v);
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

  getSortBy(): string {
    return this.sortBy;
  }

  setLearnedByFilter(speciesIds: string[] | null) {
    this.learnedByFilter = speciesIds ? new Set(speciesIds) : null;
    this.render();
  }

  private isMegaForm(species: Species): boolean {
    return species.forme !== null && species.forme.includes('Mega');
  }

  private speciesHasMoveWithFlag(speciesId: string, key: 'flags' | 'effectCategories', value: string): boolean {
    if (!this.filterLearnsets || !this.allMoves) return false;
    const moveIds = this.filterLearnsets[speciesId];
    if (!moveIds) return false;
    return moveIds.some(mid => {
      const move = this.allMoves[mid];
      return move && move[key]?.includes(value);
    });
  }

  private matchesFlag(species: Species, flag: FilterFlag): boolean {
    switch (flag.category) {
      case 'type':
        return species.types.some(t => t.toLowerCase() === flag.id);
      case 'ability':
        return Object.values(species.abilities).some(a => a.toLowerCase() === flag.id);
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

  private matchesFlags(species: Species): boolean {
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

  private updatePopup() {
    const text = this.filterInput.value.trim();
    if (text.length < 2) {
      this.filterPopup.classList.add('hidden');
      return;
    }

    const lower = text.toLowerCase();

    const matchingTypes = TYPES.filter(t => t.toLowerCase().includes(lower));
    const matchingAbilities = this.allAbilities.filter(a => a.toLowerCase().includes(lower));
    const matchingMoves: { id: string; name: string }[] = [];
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
        const map: Record<string, Set<string>> = {};
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

  private updatePopupHighlight(items: NodeListOf<HTMLElement> | HTMLElement[]) {
    items.forEach((el, i) => {
      el.classList.toggle('highlighted', i === this.filterHighlightIndex);
    });
    if (this.filterHighlightIndex >= 0 && this.filterHighlightIndex < items.length) {
      items[this.filterHighlightIndex].scrollIntoView({ block: 'nearest' });
    }
  }

  private addFlag(category: FilterFlag['category'], id: string, label: string) {
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
      const p: Promise<any>[] = [];
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
          const map: Record<string, Set<string>> = {};
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

  private renderChips() {
    const filterBar = this.filterInput.parentElement!.parentElement!.nextElementSibling!.nextElementSibling as HTMLElement;
    filterBar.querySelectorAll('.filter-chip').forEach(el => el.remove());
    filterBar.classList.toggle('hidden', this.filterFlags.length === 0);
    for (let i = 0; i < this.filterFlags.length; i++) {
      const f = this.filterFlags[i];
      const chip = document.createElement('span');
      chip.className = 'filter-chip';
      chip.dataset.category = f.category;
      chip.innerHTML = `${f.label} <span class="chip-remove" data-index="${i}">×</span>`;
      chip.querySelector('.chip-remove')!.addEventListener('click', (e) => {
        e.stopPropagation();
        this.filterFlags.splice(i, 1);
        this.renderChips();
        this.render();
      });
      filterBar.insertBefore(chip, this.filterToolbar);
    }
  }

  private updateModeButtons() {
    this.filterToolbar.querySelectorAll<HTMLButtonElement>('.filter-mode').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mode === this.filterMode);
    });
  }

  destroy() {
    this.opts.container.innerHTML = '';
  }

  private render() {
    this.grid.innerHTML = '';
    this.grid.classList.toggle('list-view', this.viewMode === 'list');

    let speciesList = this.learnedByFilter
      ? this.allSpecies.filter(s => this.learnedByFilter!.has(s.id))
      : this.allSpecies;
    let filtered = speciesList.filter(sp => this.matchesFlags(sp));
    const statKeys: Record<string, keyof Species['baseStats']> = {
      hp: 'hp', atk: 'atk', def: 'def', spa: 'spa', spd: 'spd', spe: 'spe'
    };
    filtered = filtered.sort((a, b) => {
      let cmp: number;
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

    this.resultCount.textContent = `${filtered.length} Result${filtered.length === 1 ? '' : 's'}`;
    this.resultCount.classList.toggle('hidden', speciesList.length === 0);

    if (filtered.length === 0) {
      this.grid.innerHTML = '<div class="loading">No Pokémon match your search.</div>';
      return;
    }

    for (const s of filtered) {
      if (this.viewMode === 'list') {
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
        for (const key of ['0', '1', 'H'] as const) {
          const span = document.createElement('span');
          span.className = 'list-ability' + (s.abilities[key] ? '' : ' list-ability-empty');
          span.textContent = s.abilities[key] || '-';
          abilEl.appendChild(span);
        }
        infoBottom.appendChild(abilEl);

        const statEl = document.createElement('div');
        statEl.className = 'list-stats';
        const statNames = ['HP', 'Atk', 'Def', 'SpA', 'SpD', 'Spe'] as const;
        const statKeysArr = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'] as const;
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
          document.querySelectorAll('.pokemon-list-item.selected, .pokemon-card.selected').forEach(el => el.classList.remove('selected'));
          item.classList.add('selected');
          this.opts.onPokemonClick(s.id, s);
        });
        this.grid.appendChild(item);
        continue;
      }

      const card = document.createElement('div');
      card.className = 'pokemon-card';
      card.setAttribute('role', 'listitem');

      const left = document.createElement('div');
      left.className = 'card-left';

      const top = document.createElement('div');
      top.className = 'card-top';

      const spriteFile = this.spriteMap[s.id];
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

      const statNames = ['HP', 'Atk', 'Def', 'SpA', 'SpD', 'Spe'] as const;
      const statKeysArr = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'] as const;
      const statList = document.createElement('div');
      statList.className = 'card-stats';
      for (let si = 0; si < 6; si++) {
        const val = s.baseStats[statKeysArr[si]];
        const entry = document.createElement('div');
        entry.className = 'stat-entry' + (statKeysArr[si] === this.sortBy ? ' stat-highlighted' : '');
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
        document.querySelectorAll('.pokemon-list-item.selected, .pokemon-card.selected').forEach(el => el.classList.remove('selected'));
        card.classList.add('selected');
        this.opts.onPokemonClick(s.id, s);
      });
      this.grid.appendChild(card);
    }
  }
}

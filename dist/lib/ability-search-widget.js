import { loadAbilities } from './data-loader.js';
export const ABILITY_EFFECT_CATEGORIES = {
    weather: 'Weather',
    terrain: 'Terrain',
    stats: 'Stats',
    power: 'Power Boost',
    move_type: 'Move Type',
    damage_reduction: 'Damage Reduction',
    immunity: 'Immunity',
    status: 'Status',
    contact: 'Contact',
    on_hit: 'On Hit',
    priority: 'Priority',
    bypass: 'Bypass',
    item: 'Item',
    berries: 'Berries',
    form_change: 'Form Change',
    ability_control: 'Ability Control',
    healing: 'Healing',
    field_control: 'Field Control',
    switch_in_out: 'Switch In/Out',
};
export class AbilitySearchWidget {
    opts;
    abort = new AbortController();
    abilities = {};
    loaded = false;
    loading = false;
    searchQuery = '';
    highlightIndex = -1;
    selectedIndex = -1;
    filteredForNav = [];
    filterFlags = [];
    filterMode = 'and';
    sortAsc = true;
    filterInput;
    resultCount;
    grid;
    filterPopup;
    filterBar;
    filterToolbar;
    sortSelect;
    sortDirBtn;
    constructor(opts) {
        this.opts = opts;
        this.buildDOM();
        this.bindEvents();
        this.load();
    }
    async load() {
        if (this.loaded || this.loading)
            return;
        this.loading = true;
        this.grid.innerHTML = '<div class="loading">Loading abilities…</div>';
        try {
            this.abilities = await loadAbilities(this.opts.formatId);
            this.loaded = true;
        }
        catch {
            this.grid.innerHTML = '<div class="loading">Failed to load abilities.</div>';
            return;
        }
        finally {
            this.loading = false;
        }
        this.render();
    }
    buildDOM() {
        const { container } = this.opts;
        container.classList.add('ability-search-widget');
        const filterRow = document.createElement('div');
        filterRow.className = 'filter-row';
        this.sortSelect = document.createElement('select');
        this.sortSelect.className = 'as-sort-select';
        this.sortSelect.innerHTML = '<option value="alpha">Alphabetical</option>';
        this.sortDirBtn = document.createElement('button');
        this.sortDirBtn.className = 'as-sort-dir sort-dir';
        this.sortDirBtn.textContent = '▲';
        const inputWrap = document.createElement('div');
        inputWrap.className = 'filter-input-wrap';
        this.filterInput = document.createElement('input');
        this.filterInput.className = 'as-filter-input';
        this.filterInput.type = 'text';
        this.filterInput.placeholder = 'Search abilities…';
        this.filterInput.autocomplete = 'off';
        this.resultCount = document.createElement('span');
        this.resultCount.className = 'as-result-count result-count hidden';
        this.resultCount.textContent = '0 Results';
        inputWrap.appendChild(this.filterInput);
        inputWrap.appendChild(this.resultCount);
        filterRow.appendChild(this.sortSelect);
        filterRow.appendChild(this.sortDirBtn);
        filterRow.appendChild(inputWrap);
        container.appendChild(filterRow);
        this.filterPopup = document.createElement('div');
        this.filterPopup.className = 'as-filter-popup filter-popup hidden';
        container.appendChild(this.filterPopup);
        this.filterBar = document.createElement('div');
        this.filterBar.className = 'as-filter-bar hidden';
        this.filterBar.innerHTML = '<span class="filter-bar-label"><span class="label-text">Filters</span><button class="filter-clear-all" title="Clear all filters">×</button></span>';
        this.filterToolbar = document.createElement('div');
        this.filterToolbar.className = 'as-filter-toolbar';
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
        this.filterBar.appendChild(this.filterToolbar);
        container.appendChild(this.filterBar);
        this.grid = document.createElement('div');
        this.grid.className = 'as-grid';
        this.grid.setAttribute('role', 'list');
        this.grid.setAttribute('tabindex', '0');
        container.appendChild(this.grid);
    }
    bindEvents() {
        const { signal } = this.abort;
        // Keyboard navigation for list
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
        this.sortSelect.addEventListener('change', () => {
            this.render();
        }, { signal });
        this.sortDirBtn.addEventListener('click', () => {
            this.sortAsc = !this.sortAsc;
            this.sortDirBtn.textContent = this.sortAsc ? '▲' : '▼';
            this.render();
        }, { signal });
        this.filterInput.addEventListener('input', () => {
            this.searchQuery = this.filterInput.value;
            this.updatePopup();
            this.render();
        }, { signal });
        this.filterInput.addEventListener('keydown', (e) => {
            const popupVisible = !this.filterPopup.classList.contains('hidden');
            const items = popupVisible ? this.filterPopup.querySelectorAll('.popup-item') : [];
            const n = items.length;
            if ((e.key === 'ArrowDown' || (e.key === 'Tab' && !e.shiftKey)) && popupVisible) {
                e.preventDefault();
                this.highlightIndex = n > 0 ? (this.highlightIndex + 1) % n : -1;
                items.forEach((el, i) => el.classList.toggle('highlighted', i === this.highlightIndex));
                if (this.highlightIndex >= 0 && this.highlightIndex < n)
                    items[this.highlightIndex].scrollIntoView({ block: 'nearest' });
            }
            else if ((e.key === 'ArrowUp' || (e.key === 'Tab' && e.shiftKey)) && popupVisible) {
                e.preventDefault();
                this.highlightIndex = n > 0 ? (this.highlightIndex - 1 + n) % n : -1;
                items.forEach((el, i) => el.classList.toggle('highlighted', i === this.highlightIndex));
                if (this.highlightIndex >= 0 && this.highlightIndex < n)
                    items[this.highlightIndex].scrollIntoView({ block: 'nearest' });
            }
            else if (e.key === 'Enter' && popupVisible) {
                e.preventDefault();
                if (n === 0)
                    return;
                const idx = this.highlightIndex >= 0 ? this.highlightIndex : 0;
                const item = items[idx];
                this.addFlag(item.dataset.category, item.dataset.id, item.dataset.label);
            }
            else if (e.key === 'Escape') {
                this.clearFilter();
                this.filterInput.blur();
            }
        }, { signal });
        this.filterPopup.addEventListener('click', (e) => {
            const item = e.target.closest('.popup-item');
            if (!item)
                return;
            this.addFlag(item.dataset.category, item.dataset.id, item.dataset.label);
            this.filterInput.focus();
        }, { signal });
        document.addEventListener('click', (e) => {
            const target = e.target;
            if (!target.closest('.as-filter-input') && !target.closest('.as-filter-popup')) {
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
            if (!btn)
                return;
            const mode = btn.dataset.mode;
            if (mode !== 'and' && mode !== 'or')
                return;
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
    updatePopup() {
        const text = this.filterInput.value.trim();
        if (text.length < 2) {
            this.filterPopup.classList.add('hidden');
            return;
        }
        const lower = text.toLowerCase();
        const matching = Object.entries(ABILITY_EFFECT_CATEGORIES)
            .filter(([_, label]) => label.toLowerCase().includes(lower));
        if (matching.length === 0) {
            this.filterPopup.classList.add('hidden');
            return;
        }
        let html = '';
        for (const [flagId, label] of matching) {
            html += `<div class="popup-item" data-category="effect" data-id="${flagId}" data-label="${label}">${label}</div>`;
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
        if (this.filterFlags.some(f => f.category === category && f.id === id))
            return;
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
        let list = Object.entries(this.abilities).map(([id, a]) => ({ id, ...a }));
        if (this.filterFlags.length > 0) {
            list = list.filter(item => {
                const cats = item.effectCategories || [];
                const results = this.filterFlags.map(f => cats.includes(f.id));
                return this.filterMode === 'and' ? results.every(Boolean) : results.some(Boolean);
            });
        }
        if (this.searchQuery) {
            const q = this.searchQuery.toLowerCase();
            list = list.filter(a => a.name.toLowerCase().includes(q) || a.id.includes(q));
        }
        const sortVal = this.sortSelect.value;
        if (sortVal === 'alpha') {
            list.sort((a, b) => a.name.localeCompare(b.name));
        }
        if (!this.sortAsc)
            list.reverse();
        this.filteredForNav = list;
        this.selectedIndex = -1;
        this.resultCount.textContent = `${list.length} Result${list.length === 1 ? '' : 's'}`;
        this.resultCount.classList.toggle('hidden', false);
        this.grid.innerHTML = '';
        if (list.length === 0) {
            this.grid.innerHTML = '<div class="loading">No abilities match your search.</div>';
            return;
        }
        for (const a of list) {
            const el = document.createElement('div');
            el.className = 'ability-entry';
            el.dataset.abilityId = a.id;
            el.innerHTML =
                `<span class="ability-entry-name">${a.name}</span>` +
                    `<span class="ability-entry-divider"></span>` +
                    `<span class="ability-entry-desc">${a.desc || ''}</span>`;
            el.addEventListener('click', () => {
                this.grid.querySelector('.ability-entry.selected')?.classList.remove('selected');
                el.classList.add('selected');
                this.selectedIndex = list.indexOf(a);
                const ability = this.abilities[a.id];
                if (ability)
                    this.opts.onAbilityClick?.(a.id, ability);
            });
            this.grid.appendChild(el);
        }
    }
    updateListSelection() {
        document.querySelectorAll('.ability-entry.selected').forEach(el => el.classList.remove('selected'));
        if (this.selectedIndex < 0 || this.selectedIndex >= this.filteredForNav.length)
            return;
        const items = this.grid.querySelectorAll('.ability-entry');
        const item = items[this.selectedIndex];
        if (item) {
            item.classList.add('selected');
            const abilityData = this.filteredForNav[this.selectedIndex];
            const abilityId = abilityData['id'];
            const ability = this.abilities[abilityId];
            if (ability)
                this.opts.onAbilityClick?.(abilityId, ability);
        }
    }
    scrollSelectedIntoView() {
        const items = this.grid.querySelectorAll('.ability-entry');
        const item = items[this.selectedIndex];
        if (item)
            item.scrollIntoView({ block: 'nearest' });
    }
    destroy() {
        this.abort.abort();
        this.opts.container.innerHTML = '';
        this.opts.container.classList.remove('ability-search-widget');
    }
}
//# sourceMappingURL=ability-search-widget.js.map
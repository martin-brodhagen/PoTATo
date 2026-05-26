import { loadItems } from './data-loader.js';
const ITEM_SPRITE_PATH = 'sprites/items';
export const ITEM_CATEGORIES = ['Stat Boost', 'Power Boost', 'Defense', 'Recovery', 'Mega Stone', 'Other'];
export class ItemSearchWidget {
    opts;
    abort = new AbortController();
    items = {};
    loaded = false;
    loading = false;
    searchQuery = '';
    sortBy = 'alpha';
    sortAsc = true;
    catFilter = null;
    filterInput;
    sortSelect;
    sortDirBtn;
    resultCount;
    grid;
    catButtons = new Map();
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
        this.grid.innerHTML = '<div class="loading">Loading items…</div>';
        try {
            this.items = await loadItems(this.opts.formatId);
            this.loaded = true;
        }
        catch {
            this.grid.innerHTML = '<div class="loading">Failed to load items.</div>';
            return;
        }
        finally {
            this.loading = false;
        }
        this.render();
    }
    buildDOM() {
        const { container } = this.opts;
        container.classList.add('item-search-widget');
        // Sort row
        const sortRow = document.createElement('div');
        sortRow.className = 'filter-row';
        const sortSelect = document.createElement('select');
        sortSelect.className = 'is-sort-select';
        sortSelect.innerHTML = '<option value="alpha">Alphabetical</option>';
        this.sortSelect = sortSelect;
        const sortDirBtn = document.createElement('button');
        sortDirBtn.className = 'is-sort-dir sort-dir';
        sortDirBtn.textContent = '▲';
        this.sortDirBtn = sortDirBtn;
        const inputWrap = document.createElement('div');
        inputWrap.className = 'filter-input-wrap';
        this.filterInput = document.createElement('input');
        this.filterInput.className = 'is-filter-input';
        this.filterInput.type = 'text';
        this.filterInput.placeholder = 'Search items…';
        this.filterInput.autocomplete = 'off';
        this.resultCount = document.createElement('span');
        this.resultCount.className = 'is-result-count result-count hidden';
        this.resultCount.textContent = '0 Results';
        inputWrap.appendChild(this.filterInput);
        inputWrap.appendChild(this.resultCount);
        sortRow.appendChild(sortSelect);
        sortRow.appendChild(sortDirBtn);
        sortRow.appendChild(inputWrap);
        container.appendChild(sortRow);
        // Category buttons
        const catBar = document.createElement('div');
        catBar.className = 'is-cat-bar';
        for (const cat of ITEM_CATEGORIES) {
            const btn = document.createElement('button');
            btn.className = 'is-cat-btn';
            btn.textContent = cat;
            btn.dataset.cat = cat;
            this.catButtons.set(cat, btn);
            catBar.appendChild(btn);
        }
        container.appendChild(catBar);
        this.grid = document.createElement('div');
        this.grid.className = 'is-grid';
        this.grid.setAttribute('role', 'list');
        container.appendChild(this.grid);
    }
    bindEvents() {
        const { signal } = this.abort;
        this.sortSelect.addEventListener('change', () => {
            this.sortBy = this.sortSelect.value;
            this.render();
        }, { signal });
        this.sortDirBtn.addEventListener('click', () => {
            this.sortAsc = !this.sortAsc;
            this.sortDirBtn.textContent = this.sortAsc ? '▲' : '▼';
            this.render();
        }, { signal });
        this.filterInput.addEventListener('input', () => {
            this.searchQuery = this.filterInput.value;
            this.render();
        }, { signal });
        this.catButtons.forEach((btn, cat) => {
            btn.addEventListener('click', () => {
                if (this.catFilter === cat) {
                    this.catFilter = null;
                    btn.classList.remove('active');
                }
                else {
                    this.catButtons.forEach(b => b.classList.remove('active'));
                    this.catFilter = cat;
                    btn.classList.add('active');
                }
                this.render();
            }, { signal });
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.filterInput.value) {
                this.filterInput.value = '';
                this.searchQuery = '';
                this.render();
            }
        }, { signal });
        window.addEventListener('scroll', () => { }, { passive: true, signal });
        window.addEventListener('resize', () => { }, { passive: true, signal });
    }
    render() {
        let list = Object.entries(this.items).map(([id, item]) => ({ id, ...item }));
        if (this.catFilter) {
            list = list.filter(item => item.category === this.catFilter);
        }
        if (this.searchQuery) {
            const q = this.searchQuery.toLowerCase();
            list = list.filter(item => item.name.toLowerCase().includes(q) || item.id.includes(q));
        }
        list.sort((a, b) => {
            let cmp = 0;
            if (this.sortBy === 'alpha') {
                cmp = a.name.localeCompare(b.name);
            }
            return this.sortAsc ? cmp : -cmp;
        });
        this.resultCount.textContent = `${list.length} Result${list.length === 1 ? '' : 's'}`;
        this.resultCount.classList.toggle('hidden', false);
        this.grid.innerHTML = '';
        if (list.length === 0) {
            this.grid.innerHTML = '<div class="loading">No items match your search.</div>';
            return;
        }
        for (const item of list) {
            const el = document.createElement('div');
            el.className = 'item-entry';
            el.dataset.itemId = item.id;
            const spriteHtml = item.sprite
                ? `<img class="item-entry-sprite" src="${ITEM_SPRITE_PATH}/${item.sprite}.png" alt="${item.name}">`
                : '';
            el.innerHTML =
                spriteHtml +
                    `<span class="item-entry-name">${item.name}</span>` +
                    `<span class="item-entry-divider"></span>` +
                    `<span class="item-entry-desc">${item.shortDesc || item.desc || ''}</span>`;
            el.addEventListener('click', () => {
                this.grid.querySelector('.item-entry.selected')?.classList.remove('selected');
                el.classList.add('selected');
                const i = this.items[item.id];
                if (i)
                    this.opts.onItemClick?.(item.id, i);
            });
            this.grid.appendChild(el);
        }
    }
    destroy() {
        this.abort.abort();
        this.opts.container.innerHTML = '';
        this.opts.container.classList.remove('item-search-widget');
    }
}
//# sourceMappingURL=item-search-widget.js.map
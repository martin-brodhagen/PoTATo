import { loadItems } from './data-loader.js';
import { ITEM_CATEGORIES } from './types.js';
import { SortBar } from './sort-bar.js';

const ITEM_SPRITE_PATH = 'sprites/items';

export class ItemSearchWidget {
  constructor(opts) {
    this.opts = opts;
    this.abort = new AbortController();
    this.items = {};
    this.loaded = false;
    this.loading = false;
    this.searchQuery = '';
    this.sortBy = 'alpha';
    this.sortAsc = true;
    this.catFilter = null;
    this.selectedIndex = -1;
    this.filteredForNav = [];
    this.buildDOM();
    this.bindEvents();
    this.load();
  }

  async load() {
    if (this.loaded || this.loading) return;
    this.loading = true;
    this.grid.innerHTML = '<div class="loading">Loading items…</div>';
    try {
      this.items = await loadItems(this.opts.formatId);
      this.loaded = true;
    } catch {
      this.grid.innerHTML = '<div class="loading">Failed to load items.</div>';
      return;
    } finally {
      this.loading = false;
    }
    this.render();
  }

  buildDOM() {
    const { container } = this.opts;
    container.classList.add('item-search-widget');

    const sortRow = document.createElement('div');
    sortRow.className = 'filter-row';

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
    sortRow.appendChild(inputWrap);
    container.appendChild(sortRow);

    const catBar = document.createElement('div');
    catBar.className = 'is-cat-bar';
    this.catButtons = new Map();
    for (const cat of ITEM_CATEGORIES) {
      const btn = document.createElement('button');
      btn.className = 'is-cat-btn';
      btn.textContent = cat;
      btn.dataset.cat = cat;
      this.catButtons.set(cat, btn);
      catBar.appendChild(btn);
    }
    container.appendChild(catBar);

    const sortBarContainer = document.createElement('div');
    container.appendChild(sortBarContainer);

    this.grid = document.createElement('div');
    this.grid.className = 'is-grid';
    this.grid.setAttribute('role', 'list');
    this.grid.setAttribute('tabindex', '0');
    container.appendChild(this.grid);

    this.sortBar = new SortBar({
      container: sortBarContainer,
      options: [{ key: 'alpha', label: 'A-Z' }],
      activeKey: this.sortBy,
      activeDirection: this.sortAsc ? 'asc' : 'desc',
      onChange: (key, direction) => {
        this.sortBy = key;
        this.sortAsc = direction === 'asc';
        this.render();
      },
    });
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
      this.render();
    }, { signal });

    this.catButtons.forEach((btn, cat) => {
      btn.addEventListener('click', () => {
        if (this.catFilter === cat) {
          this.catFilter = null;
          btn.classList.remove('active');
        } else {
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

    window.addEventListener('scroll', () => {}, { passive: true, signal });
    window.addEventListener('resize', () => {}, { passive: true, signal });
  }

  render() {
    let list = Object.entries(this.items).map(([id, item]) => ({ id, ...item }));

    if (this.catFilter) {
      list = list.filter(item => (item.category || []).includes(this.catFilter));
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

    this.filteredForNav = list;
    this.selectedIndex = -1;

    for (const item of list) {
      const el = document.createElement('div');
      el.className = 'item-entry';
      el.dataset.itemId = item.id;
      el.setAttribute('tabindex', '-1');
      const spriteHtml = item.sprite
        ? `<img class="item-entry-sprite" src="${ITEM_SPRITE_PATH}/${item.sprite}.png" alt="${item.name}">`
        : '';
      el.innerHTML =
        spriteHtml +
        `<span class="item-entry-name">${item.name}</span>` +
        `<span class="item-entry-divider"></span>` +
        `<span class="item-entry-desc">${item.shortDesc || item.desc || ''}</span>`;
      el.addEventListener('click', () => {
        this.selectedIndex = list.indexOf(item);
        this.updateListSelection();
      });
      this.grid.appendChild(el);
    }
  }

  updateListSelection() {
    this.grid.querySelectorAll('.item-entry.selected').forEach(el => el.classList.remove('selected'));
    const items = this.grid.querySelectorAll('.item-entry');
    const item = items[this.selectedIndex];
    if (item) {
      item.classList.add('selected');
      item.focus();
      const entry = this.filteredForNav[this.selectedIndex];
      if (entry) {
        const i = this.items[entry.id];
        if (i) this.opts.onItemClick?.(entry.id, i);
      }
    }
  }

  scrollSelectedIntoView() {
    const items = this.grid.querySelectorAll('.item-entry');
    const item = items[this.selectedIndex];
    if (item) item.scrollIntoView({ block: 'nearest' });
  }

  destroy() {
    this.abort.abort();
    if (this.sortBar) this.sortBar.destroy();
    this.opts.container.innerHTML = '';
    this.opts.container.classList.remove('item-search-widget');
  }
}
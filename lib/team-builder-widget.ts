import type { Species, FormatId, Team, TeamSlot, Move, Item } from './types.js';
import { loadLearnsets, loadMoves, loadItems } from './data-loader.js';

const SPRITE_PATH = 'sprites/champions';
const STAT_NAMES = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'] as const;
const STAT_LABELS: Record<string, string> = { hp: 'HP', atk: 'Atk', def: 'Def', spa: 'SpA', spd: 'SpD', spe: 'Spe' };
const ABILITY_KEYS = ['0', '1', 'H'] as const;
const NATURE_DATA: { name: string; up: string; down: string }[] = [
  { name: 'Adamant', up: 'Atk', down: 'SpA' },
  { name: 'Bashful', up: 'SpA', down: 'SpA' },
  { name: 'Bold', up: 'Def', down: 'Atk' },
  { name: 'Brave', up: 'Atk', down: 'Spe' },
  { name: 'Calm', up: 'SpD', down: 'Atk' },
  { name: 'Careful', up: 'SpD', down: 'SpA' },
  { name: 'Docile', up: 'Def', down: 'Def' },
  { name: 'Gentle', up: 'SpD', down: 'Def' },
  { name: 'Hardy', up: 'Atk', down: 'Atk' },
  { name: 'Hasty', up: 'Spe', down: 'Def' },
  { name: 'Impish', up: 'Def', down: 'SpA' },
  { name: 'Jolly', up: 'Spe', down: 'SpA' },
  { name: 'Lax', up: 'Def', down: 'SpD' },
  { name: 'Lonely', up: 'Atk', down: 'Def' },
  { name: 'Mild', up: 'SpA', down: 'Def' },
  { name: 'Modest', up: 'SpA', down: 'Atk' },
  { name: 'Naive', up: 'Spe', down: 'SpD' },
  { name: 'Naughty', up: 'Atk', down: 'SpD' },
  { name: 'Quiet', up: 'SpA', down: 'Spe' },
  { name: 'Quirky', up: 'SpD', down: 'SpD' },
  { name: 'Rash', up: 'SpA', down: 'SpD' },
  { name: 'Relaxed', up: 'Def', down: 'Spe' },
  { name: 'Sassy', up: 'SpD', down: 'Spe' },
  { name: 'Serious', up: 'Spe', down: 'Spe' },
  { name: 'Timid', up: 'Spe', down: 'Atk' },
].sort((a, b) => a.name.localeCompare(b.name));

export interface TeamBuilderWidgetOptions {
  container: HTMLElement;
  species: Species[];
  spriteMap: Record<string, string>;
  formatId: FormatId;
  getTeam: () => Team | undefined;
  onSlotChange: () => void;
  onPokemonClick: (species: Species) => void;
}

export class TeamBuilderWidget {
  private opts: TeamBuilderWidgetOptions;
  private learnsets: Record<string, string[]> | null = null;
  private moves: Record<string, Move> | null = null;
  private items: Record<string, Item> | null = null;
  private loadingData = false;
  private baseToMega: Record<string, string> = {}; // base species name → mega species ID
  private isMegaId: Set<string> = new Set();        // species IDs that are mega forms

  private slotsContainer!: HTMLDivElement;
  private searchPopup!: HTMLDivElement;
  private itemSearchPopup!: HTMLDivElement;
  private moveSearchPopup!: HTMLDivElement;

  constructor(opts: TeamBuilderWidgetOptions) {
    this.opts = opts;
    this.buildDOM();
    this.render();
  }

  private buildDOM() {
    const { container } = this.opts;
    container.classList.add('team-builder');
    container.innerHTML = '';

    this.slotsContainer = document.createElement('div');
    this.slotsContainer.className = 'tb-slots';

    this.searchPopup = document.createElement('div');
    this.searchPopup.className = 'tb-search-popup filter-popup hidden';

    this.itemSearchPopup = document.createElement('div');
    this.itemSearchPopup.className = 'tb-item-search-popup filter-popup hidden';

    this.moveSearchPopup = document.createElement('div');
    this.moveSearchPopup.className = 'tb-move-search-popup filter-popup hidden';

    container.appendChild(this.slotsContainer);
    container.appendChild(this.searchPopup);
    container.appendChild(this.itemSearchPopup);
    container.appendChild(this.moveSearchPopup);

    this.bindGlobalEvents();
  }

  private bindGlobalEvents() {
    document.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      if (!t.closest('.tb-slot') && !t.closest('.tb-search-popup') && !t.closest('.tb-item-search-popup') && !t.closest('.tb-move-search-popup')) {
        this.closePopups();
      }
    });

    window.addEventListener('scroll', () => this.closePopups(), { passive: true });
    window.addEventListener('resize', () => this.closePopups(), { passive: true });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.closePopups();
      }
    });
  }

  private closePopups() {
    const results = this.searchPopup.querySelector('.tb-search-results');
    if (results) results.innerHTML = '';
    this.moveSearchPopup.innerHTML = '';
    this.itemSearchPopup.innerHTML = '';
    this.searchPopup.classList.add('hidden');
    this.moveSearchPopup.classList.add('hidden');
    this.itemSearchPopup.classList.add('hidden');
  }

  setData(species: Species[], spriteMap: Record<string, string>, formatId?: FormatId) {
    this.opts.species = species;
    this.opts.spriteMap = spriteMap;
    if (formatId) this.opts.formatId = formatId;
    this.learnsets = null;
    this.moves = null;
    this.items = null;
    this.closePopups();

    // Build mega form maps
    this.baseToMega = {};
    this.isMegaId = new Set();
    for (const s of species) {
      if (s.requiredItem) {
        this.isMegaId.add(s.id);
        if (s.baseSpecies && !this.baseToMega[s.baseSpecies]) {
          this.baseToMega[s.baseSpecies] = s.id;
        }
      }
    }

    this.render();
  }

  refresh() {
    const team = this.opts.getTeam();
    if (!team) { this.render(); return; }
    this.render();
  }

  private loadDataIfNeeded(): Promise<void> {
    if (this.loadingData) return Promise.resolve();
    if (this.learnsets) return Promise.resolve();

    this.loadingData = true;
    return Promise.all([
      loadLearnsets(this.opts.formatId).then(ls => { this.learnsets = ls; }),
      loadMoves(this.opts.formatId).then(m => { this.moves = m; }),
      loadItems(this.opts.formatId).then(its => { this.items = its; }),
    ]).then(() => { this.loadingData = false; this.render(); });
  }

  render(): Promise<void> {
    const team = this.opts.getTeam();
    this.slotsContainer.innerHTML = '';

    if (!team) {
      this.slotsContainer.innerHTML = '<div class="placeholder">Select a team first</div>';
      return Promise.resolve();
    }

    if (!this.learnsets) {
      return this.loadDataIfNeeded();
    }

    for (let i = 0; i < 6; i++) {
      const slot = team.slots[i];
      const el = document.createElement('div');
      el.className = 'tb-slot';
      el.dataset.slotIndex = String(i);

      const species = slot.speciesId ? this.opts.species.find(s => s.id === slot.speciesId) || null : null;
      this.renderSlot(el, i, slot, species);

      this.slotsContainer.appendChild(el);
    }
    return Promise.resolve();
  }

  private renderSlot(el: HTMLElement, index: number, slot: TeamSlot, species: Species | null) {
    const isFilled = species !== null;

    // Build ability options (default to first ability if empty)
    let abilityOpts = '';
    if (isFilled) {
      let selectedAbilityKey = slot.ability || '0';
      if (!['0', '1', 'H'].includes(selectedAbilityKey)) selectedAbilityKey = '0';
      for (const key of ABILITY_KEYS) {
        const name = species.abilities[key];
        if (!name) continue;
        const sel = key === selectedAbilityKey ? ' selected' : '';
        abilityOpts += `<option value="${key}"${sel}>${name}</option>`;
      }
    }

    // Build nature options
    const maxNameLen = Math.max(...NATURE_DATA.map(n => n.name.length));
    let natureOpts = '';
    const selectedNature = isFilled && slot.nature && NATURE_DATA.some(n => n.name === slot.nature) ? slot.nature : 'Serious';
    for (const n of NATURE_DATA) {
      const sel = n.name === selectedNature ? ' selected' : '';
      const effect = n.up === n.down ? '—' : `+${n.up} -${n.down}`;
      const padLen = maxNameLen - n.name.length;
      const pad = '&nbsp;'.repeat(padLen);
      natureOpts += `<option value="${n.name}"${sel}>${n.name}${pad} (${effect})</option>`;
    }

    // Name area with gender select
    const spriteFile = isFilled ? this.opts.spriteMap[species.id] : undefined;
    const spriteHtml = spriteFile ? `<img class="tb-sprite" src="${SPRITE_PATH}/${spriteFile}">` : '';
    const nameValue = isFilled ? species.name : '';
    const selectedGender = (isFilled && slot.gender) ? slot.gender : 'Neutral';
    const nameHtml = `<input type="text" class="tb-name-input" placeholder="Pokémon name…" autocomplete="off" value="${nameValue}">`;
    const genderHtml = `
      <select class="tb-gender-select">
        <option value="Male"${selectedGender === 'Male' ? ' selected' : ''}>Male ♂</option>
        <option value="Neutral"${selectedGender === 'Neutral' ? ' selected' : ''}>—</option>
        <option value="Female"${selectedGender === 'Female' ? ' selected' : ''}>Female ♀</option>
      </select>`;

    const itemValue = isFilled && slot.item && this.items?.[slot.item] ? this.items[slot.item].name : (slot.item || '');

    // Check if the slot's item is a mega stone matching this species line
    let showMegaCheckbox = false;
    let isMegaActive = false;
    if (isFilled && slot.item && this.items) {
      const item = this.items[slot.item];
      if (item?.megaStone) {
        const baseName = species.baseSpecies || species.name;
        const megaName = item.megaStone[baseName];
        if (megaName && (species.name === baseName || species.name === megaName)) {
          showMegaCheckbox = true;
          isMegaActive = this.isMegaId.has(species.id);
        }
      }
    }
    const sectionLeftHtml = `
      <div class="tb-section tb-section-left">
        <div class="tb-left-top">
          ${nameHtml}
          <button class="tb-slot-remove" title="Remove">×</button>
          ${genderHtml}
        </div>
        <div class="tb-left-bottom">
          <div class="tb-left-sprite">${spriteHtml}</div>
          <div class="tb-left-selectors">
            <div class="tb-ability-row">
              <span class="tb-section-label">Ability</span>
              <select class="tb-ability-select"${isFilled ? '' : ' disabled'}>${abilityOpts}</select>
            </div>
            <div class="tb-nature-row">
              <span class="tb-section-label">Nature</span>
              <select class="tb-nature-select">${natureOpts}</select>
            </div>
            <div class="tb-item-row">
              <span class="tb-section-label">Item</span>
              <div class="tb-item-input-wrap">
                <input type="text" class="tb-item-input" placeholder="None" autocomplete="off" value="${itemValue}">
                <input type="checkbox" class="tb-mega-checkbox" ${showMegaCheckbox ? '' : 'disabled'} ${isMegaActive ? 'checked' : ''}>
              </div>
            </div>
          </div>
        </div>
      </div>`;

    // Moves section — always text inputs
    let movesHtml = '';
    const moveSlots = slot.moves || [null, null, null, null];
    for (let mi = 0; mi < 4; mi++) {
      const moveId = moveSlots[mi];
      const moveRec = moveId && isFilled ? this.moves?.[moveId] : undefined;
      const moveName = moveRec ? moveRec.name : '';
      movesHtml += `<div class="tb-move-slot" data-move-index="${mi}">`;
      movesHtml += `<input type="text" class="tb-move-input" placeholder="Move ${mi + 1}…" autocomplete="off" value="${moveName}">`;
      movesHtml += `</div>`;
    }
    const section3Html = `<div class="tb-section tb-section-moves">${movesHtml}</div>`;

    // Stats section
    let statsHtml = '';
    if (isFilled) {
      for (const statName of STAT_NAMES) {
        const baseVal = species.baseStats[statName];
        const allocated = slot.stats?.[statName] || 0;
        const total = baseVal + allocated;
        statsHtml += `
          <div class="tb-stat-row" data-stat="${statName}">
            <span class="tb-stat-label">${STAT_LABELS[statName]}</span>
            <input type="number" class="tb-stat-input" value="${allocated}" min="0" max="32">
            <input type="range" class="tb-stat-slider" value="${allocated}" min="0" max="32" style="--slider-pct: ${(allocated / 32) * 100}%">
            <span class="tb-stat-total">${total}</span>
          </div>`;
      }
    } else {
      for (const statName of STAT_NAMES) {
        statsHtml += `
          <div class="tb-stat-row" data-stat="${statName}">
            <span class="tb-stat-label">${STAT_LABELS[statName]}</span>
            <input type="number" class="tb-stat-input" value="0" min="0" max="32" disabled>
            <input type="range" class="tb-stat-slider" value="0" min="0" max="32" disabled>
            <span class="tb-stat-total">0</span>
          </div>`;
      }
    }
    const section4Html = `<div class="tb-section tb-section-stats">${statsHtml}</div>`;

    el.innerHTML = `
      <div class="tb-filled-content">
        ${sectionLeftHtml}
        ${section3Html}
        ${section4Html}
      </div>`;

    // ── Wire up events ───────────────────────────────

    // Remove button
    el.querySelector('.tb-slot-remove')!.addEventListener('click', (e) => {
      e.stopPropagation();
      this.clearSlot(index);
    });

    if (isFilled) {
      // Ability selector
      el.querySelector('.tb-ability-select')!.addEventListener('change', (e) => {
        const team = this.opts.getTeam();
        if (!team) return;
        team.slots[index].ability = (e.target as HTMLSelectElement).value;
        this.opts.onSlotChange();
      });

      // Nature selector
      el.querySelector('.tb-nature-select')!.addEventListener('change', (e) => {
        const team = this.opts.getTeam();
        if (!team) return;
        team.slots[index].nature = (e.target as HTMLSelectElement).value;
        this.opts.onSlotChange();
      });

      // Stat inputs
      el.querySelectorAll('.tb-stat-row').forEach(row => {
        const statName = (row as HTMLElement).dataset.stat!;
        const numInput = row.querySelector('.tb-stat-input') as HTMLInputElement;
        const slider = row.querySelector('.tb-stat-slider') as HTMLInputElement;
        const totalEl = row.querySelector('.tb-stat-total') as HTMLSpanElement;
        const baseVal = species.baseStats[statName as keyof typeof species.baseStats] || 0;

        const updateStat = (val: number) => {
          val = Math.max(0, Math.min(32, Math.round(val)));
          numInput.value = String(val);
          slider.value = String(val);
          slider.style.setProperty('--slider-pct', `${(val / 32) * 100}%`);
          totalEl.textContent = String(baseVal + val);
          const team = this.opts.getTeam();
          if (!team) return;
          if (!team.slots[index].stats) team.slots[index].stats = {};
          team.slots[index].stats![statName] = val;
          this.opts.onSlotChange();
        };

        numInput.addEventListener('input', () => updateStat(parseInt(numInput.value) || 0));
        slider.addEventListener('input', () => updateStat(parseInt(slider.value) || 0));
      });

    }

    // Move inputs (always present)
    el.querySelectorAll('.tb-move-slot').forEach(moveSlotEl => {
      const mi = parseInt((moveSlotEl as HTMLElement).dataset.moveIndex!);
      const input = moveSlotEl.querySelector('.tb-move-input') as HTMLInputElement;
      if (!input) return;
      this.setupMoveSearch(input, index, mi);
    });

    // Species name input (always present — filled or empty)
    const nameInput = el.querySelector('.tb-name-input') as HTMLInputElement;
    if (nameInput) {
      this.setupSpeciesSearch(nameInput, index);
    }

    // Gender selector (always works)
    el.querySelector('.tb-gender-select')!.addEventListener('change', (e) => {
      const team = this.opts.getTeam();
      if (!team) return;
      team.slots[index].gender = (e.target as HTMLSelectElement).value;
      this.opts.onSlotChange();
    });

    // Nature selector (always works)
    el.querySelector('.tb-nature-select')!.addEventListener('change', (e) => {
      const team = this.opts.getTeam();
      if (!team) return;
      team.slots[index].nature = (e.target as HTMLSelectElement).value;
      this.opts.onSlotChange();
    });

    // Item input (always present)
    const itemInput = el.querySelector('.tb-item-input') as HTMLInputElement;
    if (itemInput) {
      this.setupItemSearch(itemInput, index);
    }

    // Mega checkbox: swap between base and mega form (item stays unchanged)
    const megaCheckbox = el.querySelector('.tb-mega-checkbox') as HTMLInputElement;
    if (megaCheckbox) {
      megaCheckbox.addEventListener('change', () => {
        const team = this.opts.getTeam();
        if (!team) return;
        const slot = team.slots[index];
        const currentSpecies = this.opts.species.find(s => s.id === slot.speciesId);
        if (!currentSpecies) return;

        let newSpeciesId: string | null = null;
        if (megaCheckbox.checked) {
          newSpeciesId = this.baseToMega[currentSpecies.name] || null;
          if (!newSpeciesId && currentSpecies.baseSpecies) {
            newSpeciesId = this.baseToMega[currentSpecies.baseSpecies] || null;
          }
        } else {
          const baseName = currentSpecies.baseSpecies;
          if (baseName) {
            const base = this.opts.species.find(s => s.name === baseName);
            if (base) newSpeciesId = base.id;
          }
        }

        if (newSpeciesId && newSpeciesId !== slot.speciesId) {
          const newSpecies = this.opts.species.find(s => s.id === newSpeciesId);
          if (!newSpecies) return;

          // Preserve moves, stats, nature, gender, item; reset ability
          slot.speciesId = newSpeciesId;
          slot.ability = '0';
          slot.nature = slot.nature;
          slot.gender = slot.gender;
          slot.moves = slot.moves;
          slot.stats = slot.stats;

          this.opts.onSlotChange();
          this.render();
        }
      });
    }
  }

  private setupSpeciesSearch(input: HTMLInputElement, index: number) {
    this.loadDataIfNeeded();
    const popup = this.searchPopup;
    let highlightedIdx = -1;

    const popupResults = popup.querySelector<HTMLElement>('.tb-search-results');
    if (!popupResults) {
      const div = document.createElement('div');
      div.className = 'tb-search-results';
      popup.appendChild(div);
    }

    const updateHighlight = () => {
      popup.querySelectorAll('.tb-search-item').forEach((item, i) => {
        item.classList.toggle('highlighted', i === highlightedIdx);
      });
      const highlighted = popup.querySelector<HTMLElement>('.tb-search-item.highlighted');
      if (highlighted) {
        highlighted.scrollIntoView({ block: 'nearest' });
      }
    };

    const selectHighlighted = () => {
      const items = popup.querySelectorAll<HTMLElement>('.tb-search-item');
      const target = highlightedIdx >= 0 && highlightedIdx < items.length ? items[highlightedIdx] : items[0];
      if (target) target.click();
    };

    input.addEventListener('input', () => {
      const text = input.value.trim().toLowerCase();
      const resultsContainer = popup.querySelector('.tb-search-results')!;
      highlightedIdx = -1;

      if (text.length < 1) {
        resultsContainer.innerHTML = '';
        popup.classList.add('hidden');
        return;
      }

      const matches = this.opts.species.filter(s =>
        s.id.includes(text) || s.name.toLowerCase().includes(text)
      ).slice(0, 20);

      if (matches.length === 0) {
        resultsContainer.innerHTML = '';
        popup.classList.add('hidden');
        return;
      }

      let html = '';
      for (const s of matches) {
        const spriteFile = this.opts.spriteMap[s.id];
        const spriteHtml = spriteFile ? `<img class="tb-search-sprite" src="${SPRITE_PATH}/${spriteFile}">` : '';
        html += `<div class="tb-search-item" data-species-id="${s.id}">${spriteHtml}<span>${s.name}</span></div>`;
      }
      resultsContainer.innerHTML = html;
      popup.classList.remove('hidden');

      // Position popup below input
      const rect = input.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const popupHeight = Math.min(280, spaceBelow - 8);
      popup.style.top = (spaceBelow > 60 ? rect.bottom + 4 : rect.top - popupHeight - 4) + 'px';
      popup.style.left = Math.max(8, rect.left) + 'px';
      popup.style.width = Math.max(220, rect.width) + 'px';
      popup.style.maxHeight = popupHeight + 'px';
      popup.style.minWidth = '';

      popup.querySelectorAll('.tb-search-item').forEach(item => {
        item.addEventListener('click', () => {
          const speciesId = (item as HTMLElement).dataset.speciesId!;
          this.selectSpecies(index, speciesId);
        });
      });
    });

    input.addEventListener('keydown', (e) => {
      const items = popup.querySelectorAll<HTMLElement>('.tb-search-item');
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        highlightedIdx = Math.min(highlightedIdx + 1, items.length - 1);
        updateHighlight();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        highlightedIdx = Math.max(highlightedIdx - 1, 0);
        updateHighlight();
      } else if (e.key === 'Tab') {
        if (items.length > 0) {
          e.preventDefault();
          highlightedIdx = Math.min(highlightedIdx + 1, items.length - 1);
          updateHighlight();
        }
      } else if (e.key === 'Enter') {
        e.preventDefault();
        selectHighlighted();
      } else if (e.key === 'Escape') {
        popup.classList.add('hidden');
      }
    });

    input.addEventListener('blur', () => {
      setTimeout(() => {
        if (!popup.matches(':hover')) {
          popup.classList.add('hidden');
        }
      }, 150);
    });
  }

  private selectSpecies(slotIndex: number, speciesId: string) {
    const team = this.opts.getTeam();
    if (!team) return;
    const slot = team.slots[slotIndex];

    const species = this.opts.species.find(s => s.id === speciesId);
    if (!species) return;

    slot.speciesId = speciesId;
    slot.ability = '0';
    slot.nature = 'Serious';
    slot.gender = 'Neutral';
    slot.moves = [null, null, null, null];
    slot.stats = {};
    for (const k of STAT_NAMES) slot.stats[k] = 0;

    // Auto-fill mega stone if species is a mega form (except Meganium)
    slot.item = null;
    const results = this.searchPopup.querySelector('.tb-search-results');
    if (results) results.innerHTML = '';
    if (this.items && species.id !== 'meganiummega') {
      for (const [itemId, item] of Object.entries(this.items)) {
        if (item.megaStone) {
          for (const megaName of Object.values(item.megaStone)) {
            if (megaName === species.name) {
              slot.item = itemId;
              break;
            }
          }
        }
        if (slot.item) break;
      }
    }

    this.closePopups();
    this.opts.onSlotChange();
    this.render();

    // Preload data for move search
    this.loadDataIfNeeded();
  }

  private setupMoveSearch(input: HTMLInputElement, slotIndex: number, moveIndex: number) {
    this.loadDataIfNeeded();
    const popup = this.moveSearchPopup;
    let highlightedIdx = -1;

    const updateHighlight = () => {
      popup.querySelectorAll('.tb-search-item').forEach((item, i) => {
        item.classList.toggle('highlighted', i === highlightedIdx);
      });
      const highlighted = popup.querySelector<HTMLElement>('.tb-search-item.highlighted');
      if (highlighted) highlighted.scrollIntoView({ block: 'nearest' });
    };

    const selectHighlighted = () => {
      const items = popup.querySelectorAll<HTMLElement>('.tb-search-item');
      const target = highlightedIdx >= 0 && highlightedIdx < items.length ? items[highlightedIdx] : items[0];
      if (target) target.click();
    };

    input.addEventListener('input', () => {
      const text = input.value.trim().toLowerCase();
      highlightedIdx = -1;

      if (text.length < 1 || !this.moves) {
        popup.classList.add('hidden');
        return;
      }

      const team = this.opts.getTeam();
      const slot = team?.slots[slotIndex];
      const speciesId = slot?.speciesId;

      let moveIds: string[];
      if (speciesId && this.learnsets?.[speciesId]) {
        moveIds = this.learnsets[speciesId].filter(mid => {
          const move = this.moves![mid];
          return move && (move.name.toLowerCase().includes(text) || mid.includes(text));
        });
      } else {
        moveIds = Object.keys(this.moves).filter(mid => {
          const move = this.moves![mid];
          return move.name.toLowerCase().includes(text) || mid.includes(text);
        });
      }
      moveIds = moveIds.slice(0, 20);

      if (moveIds.length === 0) {
        popup.classList.add('hidden');
        return;
      }

      let html = '';
      for (const mid of moveIds) {
        const move = this.moves[mid];
        if (!move) continue;
        const typeClass = move.type.toLowerCase();
        html += `<div class="tb-search-item" data-move-id="${mid}">
          <span class="move-entry-type type-tag ${typeClass}">${move.type}</span>
          <span>${move.name}</span>
          <span class="move-entry-cat cat-${move.category.toLowerCase()}"><img class="cat-icon-small" src="sprites/categories/${move.category}_CP.png"></span>
        </div>`;
      }
      popup.innerHTML = html;
      popup.classList.remove('hidden');

      const rect = input.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const popupHeight = Math.min(280, spaceBelow - 8);
      popup.style.top = (spaceBelow > 60 ? rect.bottom + 4 : rect.top - popupHeight - 4) + 'px';
      popup.style.left = Math.max(8, rect.left) + 'px';
      popup.style.width = Math.max(300, rect.width) + 'px';
      popup.style.maxHeight = popupHeight + 'px';
      popup.style.minWidth = '';

      popup.querySelectorAll('.tb-search-item').forEach(item => {
        item.addEventListener('click', () => {
          const moveId = (item as HTMLElement).dataset.moveId!;
          this.selectMove(slotIndex, moveIndex, moveId);
        });
      });
    });

    input.addEventListener('keydown', (e) => {
      const items = popup.querySelectorAll<HTMLElement>('.tb-search-item');
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        highlightedIdx = Math.min(highlightedIdx + 1, items.length - 1);
        updateHighlight();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        highlightedIdx = Math.max(highlightedIdx - 1, 0);
        updateHighlight();
      } else if (e.key === 'Tab') {
        if (items.length > 0) {
          e.preventDefault();
          highlightedIdx = Math.min(highlightedIdx + 1, items.length - 1);
          updateHighlight();
        }
      } else if (e.key === 'Enter') {
        e.preventDefault();
        selectHighlighted();
      } else if (e.key === 'Escape') {
        popup.classList.add('hidden');
      }
    });

    input.addEventListener('blur', () => {
      setTimeout(() => {
        if (!popup.matches(':hover')) {
          popup.classList.add('hidden');
        }
      }, 150);
    });
  }

  private selectMove(slotIndex: number, moveIndex: number, moveId: string) {
    const team = this.opts.getTeam();
    if (!team) return;
    const slot = team.slots[slotIndex];
    if (!slot.moves) slot.moves = [null, null, null, null];
    slot.moves[moveIndex] = moveId;
    this.closePopups();
    this.opts.onSlotChange();
    this.render();
  }

  private setupItemSearch(input: HTMLInputElement, index: number) {
    this.loadDataIfNeeded();
    const popup = this.itemSearchPopup;
    let highlightedIdx = -1;

    const updateHighlight = () => {
      popup.querySelectorAll('.tb-search-item').forEach((item, i) => {
        item.classList.toggle('highlighted', i === highlightedIdx);
      });
      const highlighted = popup.querySelector<HTMLElement>('.tb-search-item.highlighted');
      if (highlighted) highlighted.scrollIntoView({ block: 'nearest' });
    };

    const selectHighlighted = () => {
      const items = popup.querySelectorAll<HTMLElement>('.tb-search-item');
      const target = highlightedIdx >= 0 && highlightedIdx < items.length ? items[highlightedIdx] : items[0];
      if (target) target.click();
    };

    input.addEventListener('input', () => {
      const text = input.value.trim().toLowerCase();
      highlightedIdx = -1;

      if (text.length < 1 || !this.items) {
        popup.classList.add('hidden');
        return;
      }

      // When typing "mega" and a species is set, prioritise matching mega stone
      const team = this.opts.getTeam();
      const slot = team?.slots[index];
      const speciesId = slot?.speciesId;
      const species = speciesId ? this.opts.species.find(s => s.id === speciesId) : null;
      let megaStoneItems = [] as [string, Item][];
      if (text.includes('mega') && species && this.items) {
        const speciesName = species.baseSpecies || species.name;
        megaStoneItems = Object.entries(this.items)
          .filter(([, item]) => item.megaStone && item.megaStone[speciesName]);
      }

      const matches = megaStoneItems.length > 0
        ? megaStoneItems
        : Object.entries(this.items)
            .filter(([id, item]) => item.name.toLowerCase().includes(text) || id.includes(text))
            .slice(0, 20);

      if (matches.length === 0) {
        popup.classList.add('hidden');
        return;
      }

      let html = '';
      for (const [id, item] of matches) {
        html += `<div class="tb-search-item" data-item-id="${id}"><span>${item.name}</span></div>`;
      }
      popup.innerHTML = html;
      popup.classList.remove('hidden');

      const rect = input.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const popupHeight = Math.min(280, spaceBelow - 8);
      popup.style.top = (spaceBelow > 60 ? rect.bottom + 4 : rect.top - popupHeight - 4) + 'px';
      popup.style.left = Math.max(8, rect.left) + 'px';
      popup.style.width = Math.max(220, rect.width) + 'px';
      popup.style.maxHeight = popupHeight + 'px';
      popup.style.minWidth = '';

      popup.querySelectorAll('.tb-search-item').forEach(item => {
        item.addEventListener('click', () => {
          const itemId = (item as HTMLElement).dataset.itemId!;
          this.selectItem(index, itemId);
        });
      });
    });

    input.addEventListener('keydown', (e) => {
      const items = popup.querySelectorAll<HTMLElement>('.tb-search-item');
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        highlightedIdx = Math.min(highlightedIdx + 1, items.length - 1);
        updateHighlight();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        highlightedIdx = Math.max(highlightedIdx - 1, 0);
        updateHighlight();
      } else if (e.key === 'Tab') {
        if (items.length > 0) {
          e.preventDefault();
          highlightedIdx = Math.min(highlightedIdx + 1, items.length - 1);
          updateHighlight();
        }
      } else if (e.key === 'Enter') {
        e.preventDefault();
        selectHighlighted();
      } else if (e.key === 'Escape') {
        popup.classList.add('hidden');
      }
    });

    input.addEventListener('blur', () => {
      setTimeout(() => {
        if (!popup.matches(':hover')) {
          popup.classList.add('hidden');
        }
      }, 150);
    });
  }

  private selectItem(slotIndex: number, itemId: string) {
    const team = this.opts.getTeam();
    if (!team) return;
    const slot = team.slots[slotIndex];
    const species = slot.speciesId ? this.opts.species.find(s => s.id === slot.speciesId) : null;

    // If changing item away from mega stone while in mega form, revert to base
    if (species && this.isMegaId.has(species.id) && this.items) {
      const item = this.items[itemId];
      const speciesBase = species.baseSpecies;
      if (speciesBase && (!item?.megaStone || item.megaStone[speciesBase] !== species.name)) {
        const base = this.opts.species.find(s => s.name === speciesBase);
        if (base) {
          slot.speciesId = base.id;
          slot.ability = '0';
        }
      }
    }

    slot.item = itemId;
    this.closePopups();
    this.opts.onSlotChange();
    this.render();
  }

  clearSlot(index: number) {
    const team = this.opts.getTeam();
    if (!team) return;
    team.slots[index] = { speciesId: null };
    this.closePopups();
    this.opts.onSlotChange();
    this.render();
  }

  destroy() {
    this.opts.container.classList.remove('team-builder');
    this.opts.container.innerHTML = '';
  }
}

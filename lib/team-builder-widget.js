import { loadLearnsets, loadMoves, loadItems } from './data-loader.js';
import { createEmptySlot } from './team-store.js';
import { CHAMPIONS_SPRITE_PATH, CHAMPIONS_SPRITE_PATH_SMALL } from './sprite-paths.js';

const SPRITE_PATH = CHAMPIONS_SPRITE_PATH;
const SPRITE_PATH_SMALL = CHAMPIONS_SPRITE_PATH_SMALL;
const SHINY_SPRITE_PATH = 'sprites/shiny';
const ITEM_SPRITE_PATH = 'sprites/items';
const STAT_NAMES = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
const STAT_LABELS = { hp: 'HP', atk: 'Atk', def: 'Def', spa: 'SpA', spd: 'SpD', spe: 'Spe' };

function isPreBattleForme(species) {
  return species?.formeInfo?.kind === 'pre-battle';
}

const NATURE_DATA = [
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

function computeStat(baseVal, allocated, statName, natureRec) {
  const label = STAT_LABELS[statName];
  const isHp = statName === 'hp';
  const natureMod = natureRec && natureRec.up !== natureRec.down && !isHp
    ? (natureRec.up === label ? 1.1 : natureRec.down === label ? 0.9 : 1)
    : 1;
  const total = Math.floor((baseVal + allocated + (isHp ? 75 : 20)) * (isHp ? 1 : natureMod));
  const natureClass = natureMod === 1.1 ? ' tb-stat-boosted' : natureMod === 0.9 ? ' tb-stat-hindered' : '';
  return { total, natureMod, natureClass };
}

export class TeamBuilderWidget {
  constructor(opts) {
    this.opts = opts;
    this.learnsets = null;
    this.moves = null;
    this.items = null;
    this.loadingData = false;
    this.buildDOM();
    if (opts.species && opts.spriteMap) {
      this.setData(opts.species, opts.spriteMap, opts.shinySpriteMap, opts.formatId, opts.items);
    } else {
      this.render();
    }
  }

  // Helpers -----------------------------------------------------------------

  // Resolve the base species for a slot. baseSpecies = the encounterable
  // forme (Shield Aegislash, Disguised Mimikyu, etc.) or the species itself
  // when it has no `baseSpecies` field.
  getBaseSpecies(slot) {
    if (!slot?.speciesId) return null;
    return this.opts.species.find((s) => s.id === slot.speciesId) || null;
  }

  // Resolve the currently active forme for a slot. Returns the species
  // object corresponding to slot.formes[activeFormeIndex-1] when an alt
  // forme is active, else the base species.
  getActiveSpecies(slot) {
    const base = this.getBaseSpecies(slot);
    if (!base) return null;
    if (!slot.formes || slot.formes.length === 0) return base;
    const idx = slot.activeFormeIndex;
    if (!idx || idx < 1 || idx > slot.formes.length) return base;
    const activeForme = slot.formes[idx - 1];
    if (!activeForme) return base;
    return this.opts.species.find((s) => s.id === activeForme.speciesId) || base;
  }

  // Ensure slot.formes / activeFormeIndex exist and are valid for the
  // current format. Drops entries whose speciesId isn't in the per-format
  // species list. Clamps activeFormeIndex.
  normalizeFormes(slot) {
    if (!slot) return;
    if (!Array.isArray(slot.formes)) slot.formes = [];
    const speciesIds = new Set(this.opts.species.map((s) => s.id));
    slot.formes = slot.formes.filter((f) => f && speciesIds.has(f.speciesId));
    if (slot.formes.length === 0) {
      slot.activeFormeIndex = 0;
    } else if (slot.activeFormeIndex < 0 || slot.activeFormeIndex > slot.formes.length) {
      slot.activeFormeIndex = 0;
    }
  }

  // Mega auto-attach helpers ------------------------------------------------

  // Find the mega species id that a given mega stone produces for a given
  // base species. Returns the species object or null.
  findMegaForBaseAndItem(baseSpecies, item) {
    if (!baseSpecies || !item?.megaStone) return null;
    const baseName = baseSpecies.baseSpecies || baseSpecies.name;
    const megaName = item.megaStone[baseName];
    if (!megaName) return null;
    return this.opts.species.find((s) => s.name === megaName) || null;
  }

  // Look up the mega species in the slot's formes[] that matches the
  // equipped item (i.e. is the "active" mega for that stone). Returns
  // {forme, index} or null.
  findAttachedMega(slot) {
    if (!slot?.formes || !slot.item || !this.items) return null;
    const base = this.getBaseSpecies(slot);
    if (!base) return null;
    const item = this.items[slot.item];
    const megaSpecies = this.findMegaForBaseAndItem(base, item);
    if (!megaSpecies) return null;
    const idx = slot.formes.findIndex((f) => f.speciesId === megaSpecies.id);
    if (idx < 0) return null;
    return { forme: slot.formes[idx], index: idx, species: megaSpecies };
  }

  // Build/update the slot's formes[] based on the currently equipped item.
  // - A slot can have AT MOST ONE mega forme (the one matching the equipped
  //   stone). When the stone changes, the old mega is dropped and the new
  //   one is added.
  // - Non-mega formes (combat-switch, cosmetic) are preserved across item
  //   changes.
  // - activeFormeIndex is clamped to a valid value at the end.
  // Returns true if anything changed.
  syncFormesToItem(slot) {
    if (!slot || !slot.speciesId) return false;
    const base = this.getBaseSpecies(slot);
    if (!base) return false;
    const items = this.items || {};
    const newItem = slot.item ? items[slot.item] : null;
    const newMega = this.findMegaForBaseAndItem(base, newItem);
    let changed = false;

    // A forme counts as a "mega" if its species has a requiredItem (i.e.
    // it's only reachable via a stone). Drop ALL existing megas from the
    // slot — we'll re-add the right one below.
    if (slot.formes && slot.formes.length > 0) {
      const filtered = slot.formes.filter((f) => {
        const sp = this.opts.species.find((s) => s.id === f.speciesId);
        return !sp?.requiredItem;
      });
      if (filtered.length !== slot.formes.length) changed = true;
      slot.formes = filtered;
    }

    // Push the new mega if applicable.
    if (newMega) {
      const snapshot = {
        speciesId: newMega.id,
        ability: newMega.abilities?.[0] || null,
        baseStats: newMega.baseStats ? { ...newMega.baseStats } : { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
      };
      slot.formes.push(snapshot);
      slot.activeFormeIndex = slot.formes.length; // point at the new mega
      changed = true;
    }

    // Clamp activeFormeIndex.
    if (slot.formes.length === 0) {
      if (slot.activeFormeIndex !== 0) { slot.activeFormeIndex = 0; changed = true; }
    } else if (slot.activeFormeIndex < 0 || slot.activeFormeIndex > slot.formes.length) {
      slot.activeFormeIndex = 0;
      changed = true;
    }

    return changed;
  }

  // Return the list of all alt-formes of a given base species (every
  // species sharing the same `baseSpecies || name`, excluding the base
  // itself). Includes mega, combat-switch, and cosmetic kinds.
  getAltFormes(baseSpecies) {
    if (!baseSpecies) return [];
    const baseKey = baseSpecies.baseSpecies || baseSpecies.name;
    return this.opts.species.filter((s) => {
      const sBase = s.baseSpecies || s.name;
      return sBase === baseKey && s.id !== baseSpecies.id;
    });
  }

  // Apply a species selection to a slot. Resets the slot's combat config
  // and recomputes the primary + formes[] + activeFormeIndex.
  //
  // For a base pokemon with combat-switch or cosmetic alts (Aegislash,
  // Castform, Mimikyu, Vivillon, etc.), all those alts are pre-populated
  // into slot.formes[] so the user can immediately cycle through them.
  // Megas are NOT pre-populated — they are auto-attached when a stone is
  // equipped, so a fresh Charizard has no formes until a stone is picked.
  applySpeciesToSlot(slot, species) {
    if (!slot || !species) return;

    if (isPreBattleForme(species)) {
      slot.speciesId = species.id;
      slot.name = species.name;
      slot.nature = 'Serious';
      slot.gender = species.gender === 'M' ? 'Male' : species.gender === 'F' ? 'Female' : 'Male';
      slot.moves = [null, null, null, null];
      slot.stats = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
      slot.shiny = slot.shiny || false;
      slot.item = null;
      slot.formes = [];
      slot.activeFormeIndex = 0;
      slot.baseAbility = species.abilities?.[0] || null;
      slot.ability = slot.baseAbility;
      return;
    }

    const baseSpecies = species.baseSpecies
      ? this.opts.species.find((s) => s.name === species.baseSpecies) || null
      : species;
    const isForme = !!species.baseSpecies;

    slot.speciesId = baseSpecies ? baseSpecies.id : species.id;
    slot.name = species.name;
    slot.nature = 'Serious';
    slot.gender = species.gender === 'M' ? 'Male' : species.gender === 'F' ? 'Female' : 'Male';
    slot.moves = [null, null, null, null];
    slot.stats = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
    slot.shiny = slot.shiny || false;
    slot.item = null;
    slot.formes = [];
    slot.activeFormeIndex = 0;
    // The base ability is the ability shown when the slot is on its
    // primary forme. It survives forme cycles so picking e.g. Sheer Force
    // on Feraligatr, cycling to Mega, and cycling back keeps Sheer Force.
    slot.baseAbility = baseSpecies?.abilities?.[0] || null;
    slot.ability = isForme
      ? (species.abilities?.[0] || null)
      : slot.baseAbility;

    // Pre-populate formes[] with combat-switch and cosmetic alts of the
    // base, plus the picked forme (if any) so it's in the cycle too.
    if (baseSpecies) {
      const alts = this.getAltFormes(baseSpecies);
      const picked = isForme ? species : null;
      const entries = [];
      const seen = new Set();
      if (picked) {
        entries.push(picked);
        seen.add(picked.id);
      }
      for (const a of alts) {
        if (seen.has(a.id)) continue;
        const kind = a.formeInfo?.kind;
        if (kind === 'combat-switch' || kind === 'cosmetic') {
          entries.push(a);
          seen.add(a.id);
        }
      }
      // Sort: picked forme first (if any), then combat-switch, then
      // cosmetic, then alphabetical by formeInfo.name.
      const kindOrder = { 'combat-switch': 0, cosmetic: 1 };
      const pickedId = picked?.id;
      entries.sort((a, b) => {
        if (pickedId) {
          if (a.id === pickedId) return -1;
          if (b.id === pickedId) return 1;
        }
        const ka = kindOrder[a.formeInfo?.kind] ?? 99;
        const kb = kindOrder[b.formeInfo?.kind] ?? 99;
        if (ka !== kb) return ka - kb;
        return (a.formeInfo?.name || a.name).localeCompare(b.formeInfo?.name || b.name);
      });
      for (const altSpecies of entries) {
        slot.formes.push({
          speciesId: altSpecies.id,
          ability: altSpecies.abilities?.[0] || null,
          baseStats: altSpecies.baseStats ? { ...altSpecies.baseStats } : { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
        });
      }
      if (picked) {
        const idx = slot.formes.findIndex((f) => f.speciesId === picked.id);
        if (idx >= 0) slot.activeFormeIndex = idx + 1;
      }
    }

    // Auto-attach a mega stone for the active forme if it's a mega and
    // the user hasn't already picked an item via the item input.
    if (this.items && species.requiredItem && baseSpecies) {
      const baseName = baseSpecies.baseSpecies || baseSpecies.name;
      for (const [itemId, item] of Object.entries(this.items)) {
        if (item.megaStone && item.megaStone[baseName] === species.name) {
          slot.item = itemId;
          break;
        }
      }
    }
  }

  buildDOM() {
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

  bindGlobalEvents() {
    document.addEventListener('click', (e) => {
      const t = e.target;
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

  closePopups() {
    const results = this.searchPopup.querySelector('.tb-search-results');
    if (results) results.innerHTML = '';
    this.moveSearchPopup.innerHTML = '';
    this.itemSearchPopup.innerHTML = '';
    this.searchPopup.classList.add('hidden');
    this.moveSearchPopup.classList.add('hidden');
    this.itemSearchPopup.classList.add('hidden');
  }

  setData(species, spriteMap, shinySpriteMap, formatId, items) {
    this.opts.species = species;
    this.opts.spriteMap = spriteMap;
    this.opts.shinySpriteMap = shinySpriteMap;
    if (formatId) this.opts.formatId = formatId;
    if (items) this.items = items;
    this.learnsets = null;
    this.moves = null;
    this.closePopups();

    // Validate the current team's slots against the new format:
    // drop formes that aren't in the species list, and clamp
    // activeFormeIndex.
    const team = this.opts.getTeam?.();
    if (team?.slots) {
      for (const slot of team.slots) this.normalizeFormes(slot);
    }

    this.render();
  }

  refresh() {
    const team = this.opts.getTeam();
    if (!team) { this.render(); return; }
    this.render();
  }

  loadDataIfNeeded() {
    if (this.loadingData) return Promise.resolve();
    if (this.learnsets) return Promise.resolve();

    this.loadingData = true;
    return Promise.all([
      loadLearnsets(this.opts.formatId).then(ls => { this.learnsets = ls; }),
      loadMoves(this.opts.formatId).then(m => { this.moves = m; }),
      loadItems(this.opts.formatId).then(its => { this.items = its; }),
    ]).then(() => { this.loadingData = false; this.render(); });
  }

  static FOCUS_SELECTORS = [
    '.tb-ability-select', '.tb-nature-select', '.tb-item-input',
    '.tb-move-slot[data-move-index="0"] .tb-move-input',
    '.tb-move-slot[data-move-index="1"] .tb-move-input',
    '.tb-move-slot[data-move-index="2"] .tb-move-input',
    '.tb-move-slot[data-move-index="3"] .tb-move-input',
    '.tb-stat-row[data-stat="hp"] .tb-stat-input',
    '.tb-stat-row[data-stat="atk"] .tb-stat-input',
    '.tb-stat-row[data-stat="def"] .tb-stat-input',
    '.tb-stat-row[data-stat="spa"] .tb-stat-input',
    '.tb-stat-row[data-stat="spd"] .tb-stat-input',
    '.tb-stat-row[data-stat="spe"] .tb-stat-input',
  ];

  focusNextInSlot(slotIndex, currentEl) {
    const slotEl = this.slotsContainer.querySelector(`[data-slot-index="${slotIndex}"]`);
    if (!slotEl) return;
    const all = TeamBuilderWidget.FOCUS_SELECTORS.map(s => slotEl.querySelector(s)).filter(Boolean);
    const idx = all.indexOf(currentEl);
    if (idx < 0) return;
    if (idx < all.length - 1) {
      const next = all[idx + 1];
      next.focus();
      if (next.tagName === 'SELECT') setTimeout(() => next.click(), 0);
      return;
    }
    const nextSlot = this.slotsContainer.querySelector(`[data-slot-index="${slotIndex + 1}"]`);
    if (nextSlot) {
      const nameInput = nextSlot.querySelector('.tb-name-input');
      nameInput?.focus();
    }
  }

  render() {
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

  renderSlot(el, index, slot, species) {
    const isFilled = species !== null;
    const activeSpecies = isFilled ? (this.getActiveSpecies(slot) || species) : null;
    const isAltFormeActive = isFilled && activeSpecies && activeSpecies.id !== species.id;

    let abilityOpts = '';
    if (isFilled) {
      const activeAbilities = activeSpecies.abilities || [];
      const selectedAbilityName = slot.ability || activeAbilities[0] || '';
      for (let i = 0; i < activeAbilities.length; i++) {
        const name = activeAbilities[i];
        if (!name) continue;
        const sel = name === selectedAbilityName ? ' selected' : '';
        abilityOpts += `<option value="${name}"${sel}>${name}</option>`;
      }
    }

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

    const spriteFile = isFilled ? this.opts.spriteMap[activeSpecies.id] : undefined;
    const shinySpriteFile = isFilled ? this.opts.shinySpriteMap[activeSpecies.id] : undefined;
    const activeSpriteFile = slot.shiny ? shinySpriteFile : spriteFile;
    const itemRec = isFilled && slot.item && this.items?.[slot.item] ? this.items[slot.item] : null;
    const itemSprite = itemRec?.sprite || null;
    let spriteHtml;
    if (activeSpriteFile) {
      const spritePath = slot.shiny ? SHINY_SPRITE_PATH : SPRITE_PATH;
      spriteHtml = `<div class="tb-sprite-wrap"><img class="tb-sprite" src="${spritePath}/${activeSpriteFile}">`;
      if (itemSprite) {
        spriteHtml += `<img class="tb-item-overlay" src="${ITEM_SPRITE_PATH}/${itemSprite}.png">`;
      }
      spriteHtml += `</div>`;
    } else {
      spriteHtml = '';
    }
    const nameValue = isFilled ? (slot.name || activeSpecies.name) : '';
    const shinyChecked = slot.shiny ? 'checked' : '';
    const shinyActive = slot.shiny ? 'active' : '';
    const nameHtml = `<input type="text" class="tb-name-input" placeholder="Pokémon name…" autocomplete="off" value="${nameValue}">`;

    function genderOption(value, label, current) {
      return `<option value="${value}"${current === value ? ' selected' : ''}>${label}</option>`;
    }

    let genderHtml;
    if (!isFilled) {
      genderHtml = `<select class="tb-gender-select" disabled>
        ${genderOption('Male', 'Male ♂', 'Neutral')}
        ${genderOption('Neutral', '—', 'Neutral')}
        ${genderOption('Female', 'Female ♀', 'Neutral')}
      </select>`;
    } else {
      const sg = species.gender;
      const currentGender = (isFilled && slot.gender) ? slot.gender : 'Male';
      if (sg === null) {
        genderHtml = `<select class="tb-gender-select">
          ${genderOption('Male', 'Male ♂', currentGender)}
          ${genderOption('Female', 'Female ♀', currentGender)}
        </select>`;
      } else if (sg === 'M') {
        genderHtml = `<select class="tb-gender-select" disabled>
          ${genderOption('Male', 'Male ♂', 'Male')}
        </select>`;
      } else if (sg === 'F') {
        genderHtml = `<select class="tb-gender-select" disabled>
          ${genderOption('Female', 'Female ♀', 'Female')}
        </select>`;
      } else {
        genderHtml = `<select class="tb-gender-select" disabled>
          ${genderOption('Neutral', '—', 'Neutral')}
        </select>`;
      }
    }

    const itemValue = isFilled && slot.item && this.items?.[slot.item] ? this.items[slot.item].name : (slot.item || '');

    // Cycle-button label = name of the currently active forme.
    // 0 = base; 1..N = formes[i-1].
    const hasFormes = isFilled && Array.isArray(slot.formes) && slot.formes.length > 0;
    const activeIdx = isFilled ? (slot.activeFormeIndex || 0) : 0;
    // Tooltip text (still tracks the active forme name), but the button
    // label is a constant "Form" so the visible text doesn't churn as the
    // user cycles.
    let cycleTitle = isFilled ? 'Cycle through formes (current: base' : 'Cycle through formes';
    if (isFilled && activeIdx > 0 && slot.formes[activeIdx - 1]) {
      const activeFormeEntry = slot.formes[activeIdx - 1];
      const activeFormeSpecies = this.opts.species.find((s) => s.id === activeFormeEntry.speciesId);
      const activeName = activeFormeSpecies?.formeInfo?.name
        || activeFormeSpecies?.forme
        || activeFormeSpecies?.name
        || `Forme ${activeIdx}`;
      cycleTitle = `Cycle through formes (current: ${activeName})`;
    }
    const cycleDisabled = !hasFormes;

    let typesHtml = '';
    if (isFilled && activeSpecies.types) {
      typesHtml = `<div class="tb-types-row">
        ${activeSpecies.types.map(t => `<span class="type-tag ${t.toLowerCase()}">${t}</span>`).join('')}
      </div>`;
    } else {
      typesHtml = `<div class="tb-types-row"></div>`;
    }

    const sectionLeftHtml = `
      <div class="tb-section tb-section-left">
        <div class="tb-left-top">
          ${nameHtml}
          <button class="tb-slot-remove" title="Remove">×</button>
          ${genderHtml}
          <label class="tb-shiny-toggle ${shinyActive}" title="Shiny">
            <input type="checkbox" class="tb-shiny-checkbox"${shinyChecked}>
            <span>✨</span>
          </label>
        </div>
        <div class="tb-left-bottom">
          <div class="tb-left-sprite">${spriteHtml}</div>
          <div class="tb-left-selectors">
            ${typesHtml}
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
                <button type="button" class="tb-cycle-btn pill-btn${isAltFormeActive ? ' active' : ''}"
                        ${cycleDisabled && !isAltFormeActive ? 'disabled' : ''}
                        title="${cycleTitle}">Form</button>
              </div>
            </div>
          </div>
        </div>
      </div>`;

    let movesHtml = '';
    const moveSlots = slot.moves || [null, null, null, null];
    for (let mi = 0; mi < 4; mi++) {
      const moveId = moveSlots[mi];
      const moveRec = moveId && isFilled ? this.moves?.[moveId] : undefined;
      const moveName = moveRec ? moveRec.name : '';
      const typeTag = moveRec ? `<span class="type-tag ${moveRec.type.toLowerCase()} tb-move-type-tag">${moveRec.type}</span>` : '';
      const clearBtn = moveId
        ? `<button type="button" class="tb-move-clear" title="Clear move" aria-label="Clear move">×</button>`
        : '';
      movesHtml += `<div class="tb-move-slot" data-move-index="${mi}">`;
      movesHtml += `${typeTag}<div class="tb-move-input-wrap">`;
      movesHtml += `<input type="text" class="tb-move-input${moveRec ? ' has-type' : ''}" placeholder="Move ${mi + 1}…" autocomplete="off" value="${moveName}">`;
      movesHtml += clearBtn;
      movesHtml += `</div></div>`;
    }
    const section3Html = `<div class="tb-section tb-section-moves">${movesHtml}</div>`;

    let statsHtml = '';
    if (isFilled) {
      const totalAllocated = STAT_NAMES.reduce((s, n) => s + (slot.stats?.[n] || 0), 0);
      const full = totalAllocated >= 66;
      for (const statName of STAT_NAMES) {
        const baseVal = activeSpecies.baseStats[statName];
        const allocated = slot.stats?.[statName] || 0;
        const pct = (allocated / 32) * 100;
        const natureRec = NATURE_DATA.find(n => n.name === selectedNature);
        const label = STAT_LABELS[statName];
        const { total, natureClass } = computeStat(baseVal, allocated, statName, natureRec);
        statsHtml += `
          <div class="tb-stat-row" data-stat="${statName}">
            <span class="tb-stat-label">${label}</span>
            <span class="tb-stat-base">${baseVal}</span>
            <input type="text" class="tb-stat-input" value="${allocated}" inputmode="numeric" maxlength="2">
            <input type="range" class="tb-stat-slider${full ? ' full' : ''}" value="${allocated}" min="0" max="32" tabindex="-1" style="--slider-pct: ${pct}%">
            <span class="tb-stat-total${natureClass}">${total}</span>
          </div>`;
      }
    } else {
      for (const statName of STAT_NAMES) {
        statsHtml += `
          <div class="tb-stat-row" data-stat="${statName}">
            <span class="tb-stat-label">${STAT_LABELS[statName]}</span>
            <span class="tb-stat-base">0</span>
            <input type="text" class="tb-stat-input" value="0" inputmode="numeric" disabled>
            <input type="range" class="tb-stat-slider" value="0" min="0" max="0" tabindex="-1" disabled>
            <span class="tb-stat-total">0</span>
          </div>`;
      }
    }
    const remaining = isFilled ? 66 - STAT_NAMES.reduce((s, n) => s + (slot.stats?.[n] || 0), 0) : 66;
    const remainingClass = remaining === 0 ? ' tb-stat-remaining-empty' : '';
    statsHtml += `<div class="tb-stat-remaining${remainingClass}"><span></span><span></span><span>${isFilled ? remaining : '—'}</span></div>`;
    const section4Html = `<div class="tb-section tb-section-stats">${statsHtml}</div>`;

    el.innerHTML = `
      <div class="tb-filled-content">
        ${sectionLeftHtml}
        ${section3Html}
        ${section4Html}
      </div>`;

    el.querySelector('.tb-slot-remove').addEventListener('click', (e) => {
      e.stopPropagation();
      this.clearSlot(index);
    });

    if (isFilled) {
      const spriteEl = el.querySelector('.tb-sprite');
      if (spriteEl) {
        spriteEl.style.cursor = 'pointer';
        spriteEl.addEventListener('click', () => {
          this.opts.onPokemonClick?.(species);
        });
      }

      el.querySelector('.tb-ability-select').addEventListener('change', (e) => {
        const team = this.opts.getTeam();
        if (!team) return;
        const slot = team.slots[index];
        slot.ability = e.target.value;
        // If the slot is on its base forme, this ability change is the
        // user's choice for the base. Persist it so cycling to a Mega
        // and back keeps the same ability.
        if ((slot.activeFormeIndex || 0) === 0) {
          slot.baseAbility = e.target.value;
        }
        this.opts.onSlotChange();
        this.focusNextInSlot(index, e.target);
      });

      el.querySelector('.tb-nature-select').addEventListener('change', (e) => {
        const team = this.opts.getTeam();
        if (!team) return;
        const natureName = e.target.value;
        team.slots[index].nature = natureName;
        const natureRec = NATURE_DATA.find(n => n.name === natureName);
        const slot = team.slots[index];
        const active = this.getActiveSpecies(slot) || species;
        el.querySelectorAll('.tb-stat-row').forEach(row => {
          const sn = row.dataset.stat;
          const allocated = slot.stats?.[sn] || 0;
          const baseVal = active.baseStats[sn] || 0;
          const { total, natureMod } = computeStat(baseVal, allocated, sn, natureRec);
          const totalEl = row.querySelector('.tb-stat-total');
          totalEl.textContent = String(total);
          totalEl.classList.toggle('tb-stat-boosted', natureMod === 1.1);
          totalEl.classList.toggle('tb-stat-hindered', natureMod === 0.9);
        });
        this.opts.onSlotChange();
        this.focusNextInSlot(index, e.target);
      });

      el.querySelectorAll('.tb-stat-row').forEach(row => {
        const statName = row.dataset.stat;
        const numInput = row.querySelector('.tb-stat-input');
        const slider = row.querySelector('.tb-stat-slider');
        const totalEl = row.querySelector('.tb-stat-total');
        const baseVal = activeSpecies.baseStats[statName] || 0;
        const sliderEls = el.querySelectorAll('.tb-stat-slider');

        const allocatedTotal = () => {
          const team = this.opts.getTeam();
          if (!team) return 0;
          const st = team.slots[index].stats;
          if (!st) return 0;
          return Object.values(st).reduce((a, b) => a + b, 0);
        };

        const updateStat = (val) => {
          const team = this.opts.getTeam();
          if (!team) return;
          const otherTotal = allocatedTotal() - (team.slots[index].stats?.[statName] || 0);
          const effectiveMax = Math.min(32, 66 - otherTotal);
          val = Math.max(0, Math.min(effectiveMax, Math.round(val)));
          if (team.slots[index].stats?.[statName] === val && parseInt(slider.value) === val) return;
          numInput.value = String(val);
          slider.value = String(val);
          slider.style.setProperty('--slider-pct', `${(val / 32) * 100}%`);
          const natureEl = el.querySelector('.tb-nature-select');
          const natureName = natureEl?.value || 'Serious';
          const natureRec = NATURE_DATA.find(n => n.name === natureName);
          const { total, natureMod } = computeStat(baseVal, val, statName, natureRec);
          totalEl.textContent = String(total);
          totalEl.classList.toggle('tb-stat-boosted', natureMod === 1.1);
          totalEl.classList.toggle('tb-stat-hindered', natureMod === 0.9);
          if (!team.slots[index].stats) team.slots[index].stats = {};
          team.slots[index].stats[statName] = val;
          const newTotal = allocatedTotal();
          sliderEls.forEach(s => s.classList.toggle('full', newTotal >= 66));
          const remaining = 66 - newTotal;
          const remainingVal = el.querySelector('.tb-stat-remaining > span:nth-child(3)');
          if (remainingVal) {
            remainingVal.textContent = String(remaining);
            remainingVal.parentElement.className = 'tb-stat-remaining' + (remaining === 0 ? ' tb-stat-remaining-empty' : '');
          }
          this.opts.onSlotChange();
        };

        numInput.addEventListener('input', () => {
          numInput.value = numInput.value.replace(/\D/g, '');
          updateStat(parseInt(numInput.value) || 0);
        });
        numInput.addEventListener('focus', () => numInput.setSelectionRange(numInput.value.length, numInput.value.length));
        numInput.addEventListener('blur', () => updateStat(parseInt(numInput.value) || 0));
        slider.addEventListener('input', () => updateStat(parseInt(slider.value) || 0));
        numInput.addEventListener('keydown', (e) => {
          if (e.key === 'ArrowLeft') {
            e.preventDefault();
            updateStat(parseInt(numInput.value) - 1);
          } else if (e.key === 'ArrowRight') {
            e.preventDefault();
            updateStat(parseInt(numInput.value) + 1);
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            const rows = [...el.querySelectorAll('.tb-stat-row')];
            const idx = rows.indexOf(row);
            if (idx > 0) {
              const prev = rows[idx - 1].querySelector('.tb-stat-input');
              prev?.focus();
            }
          } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            const rows = [...el.querySelectorAll('.tb-stat-row')];
            const idx = rows.indexOf(row);
            if (idx < rows.length - 1) {
              const next = rows[idx + 1].querySelector('.tb-stat-input');
              next?.focus();
            }
          } else if (e.key === 'Enter' || e.key === 'Tab') {
            e.preventDefault();
            this.focusNextInSlot(index, numInput);
          }
        });
      });

    } else {
      el.querySelector('.tb-nature-select').addEventListener('change', (e) => {
        const team = this.opts.getTeam();
        if (!team) return;
        team.slots[index].nature = e.target.value;
        this.opts.onSlotChange();
      });
    }

    el.querySelectorAll('.tb-move-slot').forEach(moveSlotEl => {
      const mi = parseInt(moveSlotEl.dataset.moveIndex);
      const input = moveSlotEl.querySelector('.tb-move-input');
      if (!input) return;
      this.setupMoveSearch(input, index, mi);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && this.moveSearchPopup.classList.contains('hidden')) {
          e.preventDefault();
          this.focusNextInSlot(index, input);
        }
      });
      const clearBtn = moveSlotEl.querySelector('.tb-move-clear');
      if (clearBtn) {
        clearBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          e.preventDefault();
          this.clearMove(index, mi);
          input.focus();
        });
      }
    });

    const nameInput = el.querySelector('.tb-name-input');
    if (nameInput) {
      this.setupSpeciesSearch(nameInput, index);
      nameInput.addEventListener('change', () => {
        const team = this.opts.getTeam();
        if (!team) return;
        team.slots[index].name = nameInput.value || null;
        this.opts.onSlotChange();
      });
      nameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && isFilled && this.searchPopup.classList.contains('hidden')) {
          e.preventDefault();
          this.focusNextInSlot(index, nameInput);
        }
      });
    }

    el.querySelector('.tb-gender-select').addEventListener('change', (e) => {
      const team = this.opts.getTeam();
      if (!team) return;
      team.slots[index].gender = e.target.value;
      this.opts.onSlotChange();
    });

    const shinyCheckbox = el.querySelector('.tb-shiny-checkbox');
    if (shinyCheckbox) {
      shinyCheckbox.addEventListener('change', () => {
        const team = this.opts.getTeam();
        if (!team) return;
        team.slots[index].shiny = shinyCheckbox.checked;
        const label = shinyCheckbox.parentElement;
        label.classList.toggle('active', shinyCheckbox.checked);
        if (shinyCheckbox.checked) {
          label.style.borderColor = '#f0c060';
        } else {
          label.style.borderColor = '#3a3a4a';
        }
        this.opts.onSlotChange();
        this.render();
      });
    }

    const itemInput = el.querySelector('.tb-item-input');
    if (itemInput) {
      this.setupItemSearch(itemInput, index);
      itemInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && this.itemSearchPopup.classList.contains('hidden')) {
          e.preventDefault();
          this.focusNextInSlot(index, itemInput);
        }
      });
    }

    const cycleBtn = el.querySelector('.tb-cycle-btn');
    if (cycleBtn) {
      cycleBtn.addEventListener('click', () => {
        const team = this.opts.getTeam();
        if (!team) return;
        const slot = team.slots[index];
        if (!slot || !Array.isArray(slot.formes)) return;
        const total = slot.formes.length;
        if (total === 0) return; // nothing to cycle
        const current = slot.activeFormeIndex || 0;
        // Cycle: 0 -> 1 -> ... -> N -> 0. activeFormeIndex of 0 = base.
        const next = current >= total ? 0 : current + 1;
        slot.activeFormeIndex = next;
        // Update ability to match the newly active forme. When cycling
        // back to the base, restore the persisted baseAbility (set when
        // the user last picked an ability for the base) so custom
        // choices like Sheer Force survive Mega toggles.
        if (next === 0) {
          const base = this.getBaseSpecies(slot);
          slot.ability = slot.baseAbility ?? base?.abilities?.[0] ?? null;
        } else {
          const active = this.getActiveSpecies(slot);
          if (active) slot.ability = active.abilities?.[0] || null;
        }
        this.opts.onSlotChange();
        this.render();
      });
    }
  }

  setupSpeciesSearch(input, index) {
    this.loadDataIfNeeded();
    const popup = this.searchPopup;
    let highlightedIdx = -1;

    const popupResults = popup.querySelector('.tb-search-results');
    if (!popupResults) {
      const div = document.createElement('div');
      div.className = 'tb-search-results';
      popup.appendChild(div);
    }

    const updateHighlight = () => {
      popup.querySelectorAll('.tb-search-item').forEach((item, i) => {
        item.classList.toggle('highlighted', i === highlightedIdx);
      });
      const highlighted = popup.querySelector('.tb-search-item.highlighted');
      if (highlighted) highlighted.scrollIntoView({ block: 'nearest' });
    };

    const selectHighlighted = () => {
      const items = popup.querySelectorAll('.tb-search-item');
      const target = highlightedIdx >= 0 && highlightedIdx < items.length ? items[highlightedIdx] : items[0];
      if (target) target.click();
    };

    input.addEventListener('input', () => {
      const text = input.value.trim().toLowerCase();
      const resultsContainer = popup.querySelector('.tb-search-results');
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
        const spriteHtml = spriteFile ? `<img class="tb-search-sprite" src="${SPRITE_PATH_SMALL}/${spriteFile}">` : '';
        html += `<div class="tb-search-item" data-species-id="${s.id}">${spriteHtml}<span>${s.name}</span></div>`;
      }
      resultsContainer.innerHTML = html;
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
          const speciesId = item.dataset.speciesId;
          this.selectSpecies(index, speciesId);
        });
      });
    });

    input.addEventListener('keydown', (e) => {
      const items = popup.querySelectorAll('.tb-search-item');
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

  fillSlot(slotIndex, speciesId, item) {
    const team = this.opts.getTeam();
    if (!team) return;

    const species = this.opts.species.find(s => s.id === speciesId);
    if (!species) return;

    const slot = team.slots[slotIndex];
    this.applySpeciesToSlot(slot, species);

    // Optional explicit item override (caller passes the item id).
    if (item) {
      slot.item = item;
      this.syncFormesToItem(slot);
    }

    this.closePopups();
    this.opts.onSlotChange();
    this.render();
  }

  selectSpecies(slotIndex, speciesId) {
    const team = this.opts.getTeam();
    if (!team) return;
    const slot = team.slots[slotIndex];

    const species = this.opts.species.find(s => s.id === speciesId);
    if (!species) return;

    this.applySpeciesToSlot(slot, species);

    const results = this.searchPopup.querySelector('.tb-search-results');
    if (results) results.innerHTML = '';

    this.closePopups();
    this.opts.onSlotChange();
    this.render();

    const slotEl = this.slotsContainer.querySelector(`[data-slot-index="${slotIndex}"]`);
    const abilitySelect = slotEl?.querySelector('.tb-ability-select');
    if (abilitySelect) {
      abilitySelect.focus();
      setTimeout(() => abilitySelect.click(), 0);
    }

    this.loadDataIfNeeded();
  }

  setupMoveSearch(input, slotIndex, moveIndex) {
    this.loadDataIfNeeded();
    const popup = this.moveSearchPopup;
    let highlightedIdx = -1;

    const updateHighlight = () => {
      popup.querySelectorAll('.tb-search-item').forEach((item, i) => {
        item.classList.toggle('highlighted', i === highlightedIdx);
      });
      const highlighted = popup.querySelector('.tb-search-item.highlighted');
      if (highlighted) highlighted.scrollIntoView({ block: 'nearest' });
    };

    const selectHighlighted = () => {
      const items = popup.querySelectorAll('.tb-search-item');
      const target = highlightedIdx >= 0 && highlightedIdx < items.length ? items[highlightedIdx] : items[0];
      if (target) target.click();
    };

    input.addEventListener('input', () => {
      const text = input.value.trim().toLowerCase();
      highlightedIdx = -1;

      if (!this.moves) return;

      const team = this.opts.getTeam();
      const slot = team?.slots[slotIndex];

      // If the input no longer matches the stored move's name (empty,
      // partial, or edited), clear the slot's move and hide the type
      // badge + clear button. The badge only shows next to a valid,
      // committed move.
      if (slot?.moves?.[moveIndex]) {
        const storedMove = this.moves[slot.moves[moveIndex]];
        const storedName = storedMove?.name || '';
        if (input.value.trim() !== storedName) {
          slot.moves[moveIndex] = null;
          const moveSlot = input.closest('.tb-move-slot');
          if (moveSlot) {
            const typeTag = moveSlot.querySelector('.tb-move-type-tag');
            if (typeTag) typeTag.remove();
            const clearBtn = moveSlot.querySelector('.tb-move-clear');
            if (clearBtn) clearBtn.remove();
            input.classList.remove('has-type');
          }
          this.opts.onSlotChange();
        }
      }

      if (text.length < 1) {
        popup.classList.add('hidden');
        return;
      }

      const speciesId = slot?.speciesId;

      let moveIds;
      if (speciesId && this.learnsets?.[speciesId]) {
        moveIds = this.learnsets[speciesId].filter(mid => {
          const move = this.moves[mid];
          return move && (move.name.toLowerCase().includes(text) || mid.includes(text));
        });
      } else {
        moveIds = Object.keys(this.moves).filter(mid => {
          const move = this.moves[mid];
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
        </div>`;
      }
      popup.innerHTML = html;
      popup.classList.remove('hidden');

      const rect = input.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const popupHeight = Math.min(280, spaceBelow - 8);
      const isBottomSlot = slotIndex >= 4;
      if (isBottomSlot) {
        popup.style.top = '';
        popup.style.bottom = (window.innerHeight - rect.top + 4) + 'px';
        popup.style.maxHeight = 'none';
      } else {
        popup.style.bottom = '';
        popup.style.top = (spaceBelow > 60 ? rect.bottom + 4 : rect.top - popupHeight - 4) + 'px';
        popup.style.maxHeight = popupHeight + 'px';
      }
      popup.style.left = Math.max(8, rect.left) + 'px';
      popup.style.width = Math.max(300, rect.width) + 'px';
      popup.style.minWidth = '';

      popup.querySelectorAll('.tb-search-item').forEach(item => {
        item.addEventListener('click', () => {
          const moveId = item.dataset.moveId;
          this.selectMove(slotIndex, moveIndex, moveId);
        });
      });
    });

    input.addEventListener('keydown', (e) => {
      const items = popup.querySelectorAll('.tb-search-item');
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

  selectMove(slotIndex, moveIndex, moveId) {
    const team = this.opts.getTeam();
    if (!team) return;
    const slot = team.slots[slotIndex];
    if (!slot.moves) slot.moves = [null, null, null, null];
    slot.moves[moveIndex] = moveId;
    this.closePopups();
    this.opts.onSlotChange();
    this.render();

    const slotEl = this.slotsContainer.querySelector(`[data-slot-index="${slotIndex}"]`);
    if (moveIndex < 3) {
      const nextMove = slotEl?.querySelector(`.tb-move-slot[data-move-index="${moveIndex + 1}"] .tb-move-input`);
      nextMove?.focus();
    } else {
      const firstStat = slotEl?.querySelector('.tb-stat-row[data-stat="hp"] .tb-stat-input');
      firstStat?.focus();
    }
  }

  clearMove(slotIndex, moveIndex) {
    const team = this.opts.getTeam();
    if (!team) return;
    const slot = team.slots[slotIndex];
    if (!slot || !slot.moves) return;
    slot.moves[moveIndex] = null;
    this.closePopups();
    this.opts.onSlotChange();
    this.render();
  }

  setupItemSearch(input, index) {
    this.loadDataIfNeeded();
    const popup = this.itemSearchPopup;
    let highlightedIdx = -1;

    const updateHighlight = () => {
      popup.querySelectorAll('.tb-search-item').forEach((item, i) => {
        item.classList.toggle('highlighted', i === highlightedIdx);
      });
      const highlighted = popup.querySelector('.tb-search-item.highlighted');
      if (highlighted) highlighted.scrollIntoView({ block: 'nearest' });
    };

    const selectHighlighted = () => {
      const items = popup.querySelectorAll('.tb-search-item');
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

      const team = this.opts.getTeam();
      const slot = team?.slots[index];
      const speciesId = slot?.speciesId;
      const species = speciesId ? this.opts.species.find(s => s.id === speciesId) : null;
      let megaStoneItems = [];
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
      const isBottomSlot = index >= 4;
      if (isBottomSlot) {
        popup.style.top = '';
        popup.style.bottom = (window.innerHeight - rect.top + 4) + 'px';
        popup.style.maxHeight = 'none';
      } else {
        popup.style.bottom = '';
        popup.style.top = (spaceBelow > 60 ? rect.bottom + 4 : rect.top - popupHeight - 4) + 'px';
        popup.style.maxHeight = popupHeight + 'px';
      }
      popup.style.left = Math.max(8, rect.left) + 'px';
      popup.style.width = Math.max(220, rect.width) + 'px';
      popup.style.minWidth = '';

      popup.querySelectorAll('.tb-search-item').forEach(item => {
        item.addEventListener('click', () => {
          const itemId = item.dataset.itemId;
          this.selectItem(index, itemId);
        });
      });
    });

    input.addEventListener('keydown', (e) => {
      const items = popup.querySelectorAll('.tb-search-item');
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

  selectItem(slotIndex, itemId) {
    const team = this.opts.getTeam();
    if (!team) return;
    const slot = team.slots[slotIndex];
    const base = this.getBaseSpecies(slot);

    slot.item = itemId || null;

    // Sync formes[] to the new item: drop the old mega (if any) and
    // attach the new mega (if it's a stone for this base). The slot's
    // ability is intentionally left alone — the user can change it via
    // the ability dropdown if they want a different one for the new
    // forme.
    if (base) {
      this.syncFormesToItem(slot);
    }

    this.closePopups();
    this.opts.onSlotChange();
    this.render();

    const slotEl = this.slotsContainer.querySelector(`[data-slot-index="${slotIndex}"]`);
    const firstMove = slotEl?.querySelector('.tb-move-slot[data-move-index="0"] .tb-move-input');
    firstMove?.focus();
  }

  clearSlot(index) {
    const team = this.opts.getTeam();
    if (!team) return;
    team.slots[index] = createEmptySlot();
    this.closePopups();
    this.opts.onSlotChange();
    this.render();
  }

  destroy() {
    this.opts.container.classList.remove('team-builder');
    this.opts.container.innerHTML = '';
  }
}
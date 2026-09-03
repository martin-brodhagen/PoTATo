import { loadTeams, createEmptySlot, isTeamEmpty } from './team-store.js';
import { CHAMPIONS_SPRITE_PATH_SMALL } from './sprite-paths.js';

const SPRITE_PATH = CHAMPIONS_SPRITE_PATH_SMALL;

// ── Showdown import ────────────────────────────────────────────────────────

const KNOWN_NATURES = new Set([
  'Adamant', 'Bashful', 'Bold', 'Brave', 'Calm', 'Careful', 'Docile',
  'Gentle', 'Hardy', 'Hasty', 'Impish', 'Jolly', 'Lax', 'Lonely',
  'Mild', 'Modest', 'Naive', 'Naughty', 'Quiet', 'Quirky', 'Rash',
  'Relaxed', 'Sassy', 'Serious', 'Timid',
]);

const EV_STAT_LABELS = { HP: 'hp', Atk: 'atk', Def: 'def', SpA: 'spa', SpD: 'spd', Spe: 'spe' };

const POKEPASTE_URL_RE = /^(?:https?:\/\/)?pokepast\.es\/([a-z0-9]+)\/?$/i;

// If the textarea content is a pokepast.es URL, return the paste id; else
// null. Used to short-circuit the parser and fetch the raw text instead.
function pokepasteIdFromText(text) {
  if (!text) return null;
  const trimmed = text.trim();
  const m = trimmed.match(POKEPASTE_URL_RE);
  return m ? m[1] : null;
}

async function fetchPokepasteJson(id) {
  const res = await fetch(`https://pokepast.es/${id}/json`, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`pokepast.es responded ${res.status}`);
  const data = await res.json();
  return {
    text: typeof data.paste === 'string' ? data.paste : '',
    title: typeof data.title === 'string' ? data.title : '',
    author: typeof data.author === 'string' ? data.author : '',
  };
}

// Compose a suggested team name from a pokepast.es paste's title. The
// author isn't included — the paste text already names the author, so
// the title alone is unambiguous. Returns null when the title is blank
// so the caller keeps the existing team name.
function pokepasteTeamName({ title }) {
  const t = (title || '').trim();
  return t || null;
}

// Parse a Showdown-format team string into an array of raw slot data
// objects. No lookups are performed here — `buildImportedSlots` does them.
function parseShowdownText(text) {
  if (!text) return [];
  const trimmed = text.replace(/^\s+|\s+$/g, '');
  if (!trimmed) return [];
  const blocks = trimmed.split(/\n\s*\n/);
  const out = [];
  for (const block of blocks) {
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) {
      out.push({ speciesName: null });
      continue;
    }

    const firstLine = lines[0];
    let left = firstLine;
    let itemName = null;
    const atIdx = firstLine.indexOf(' @ ');
    if (atIdx >= 0) {
      left = firstLine.slice(0, atIdx);
      itemName = firstLine.slice(atIdx + 3).trim() || null;
    }

    let gender = null;
    const genderMatch = left.match(/\s*\(([MF])\)\s*$/);
    if (genderMatch) {
      gender = genderMatch[1] === 'M' ? 'Male' : 'Female';
      left = left.slice(0, genderMatch.index).trim();
    }

    let speciesName = left;
    let nickname = null;
    const parenMatch = left.match(/^(.+?)\s*\(([^()]+)\)\s*$/);
    if (parenMatch) {
      nickname = parenMatch[1].trim() || null;
      speciesName = parenMatch[2].trim();
    }

    let abilityName = null;
    let shiny = false;
    const evs = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
    let nature = null;
    const moveNames = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (/^Ability:/i.test(line)) {
        abilityName = line.slice(line.indexOf(':') + 1).trim() || null;
      } else if (/^Shiny:/i.test(line)) {
        shiny = /^Shiny:\s*Yes/i.test(line);
      } else if (/^EVs:/i.test(line)) {
        const rest = line.slice(line.indexOf(':') + 1);
        for (const seg of rest.split('/')) {
          const m = seg.trim().match(/^(\d+)\s+(\w+)$/);
          if (!m) continue;
          const statKey = EV_STAT_LABELS[m[2]];
          if (statKey) evs[statKey] = parseInt(m[1], 10) || 0;
        }
      } else if (/^IVs:/i.test(line)) {
        // ignore — Champions has fixed IVs
      } else if (line.endsWith(' Nature')) {
        const candidate = line.slice(0, -' Nature'.length).trim();
        if (KNOWN_NATURES.has(candidate)) nature = candidate;
      } else if (line.startsWith('- ')) {
        moveNames.push(line.slice(2).trim());
      } else if (KNOWN_NATURES.has(line)) {
        nature = line;
      }
    }

    out.push({
      speciesName: speciesName || null,
      nickname,
      itemName,
      gender,
      abilityName,
      shiny,
      evs,
      nature,
      moveNames,
    });
  }
  return out;
}

function findSpeciesByName(name, allSpecies) {
  if (!name) return null;
  const lower = name.trim().toLowerCase();
  const direct = allSpecies.find((s) => s.name && s.name.toLowerCase() === lower);
  if (direct) return direct;
  // Showdown's male-gendered species are stored as the un-suffixed base
  // (e.g. "Basculegion" = male, "Basculegion-F" = female). Accept the
  // community shorthand "Basculegion-M" by falling back to the base name.
  if (lower.endsWith("-m")) {
    const base = lower.slice(0, -2);
    return allSpecies.find((s) => s.name && s.name.toLowerCase() === base) || null;
  }
  return null;
}

function findIdByName(name, dict) {
  if (!name) return null;
  const lower = name.trim().toLowerCase();
  for (const [id, entry] of Object.entries(dict || {})) {
    if (entry && entry.name && entry.name.toLowerCase() === lower) return id;
  }
  return null;
}

function isPreBattleForme(species) {
  return species?.formeInfo?.kind === 'pre-battle';
}

function emptyStats() {
  return { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
}

function snapshotForme(formeSpecies) {
  return {
    speciesId: formeSpecies.id,
    ability: formeSpecies.abilities?.[0] || null,
    baseStats: formeSpecies.baseStats ? { ...formeSpecies.baseStats } : emptyStats(),
  };
}

// Pre-populate a slot's formes[] with combat-switch + cosmetic alts of its
// base species, plus the picked forme (if any) so it's in the cycle too.
// Mirrors the logic in TeamBuilderWidget.applySpeciesToSlot.
function prePopulateFormes(slot, pickedSpecies, baseSpecies, allSpecies) {
  if (!baseSpecies) return;
  const baseKey = baseSpecies.baseSpecies || baseSpecies.name;
  const alts = allSpecies.filter((s) => {
    const sBase = s.baseSpecies || s.name;
    return sBase === baseKey && s.id !== baseSpecies.id;
  });
  const entries = [];
  const seen = new Set();
  if (pickedSpecies && pickedSpecies.id !== baseSpecies.id) {
    entries.push(pickedSpecies);
    seen.add(pickedSpecies.id);
  }
  for (const a of alts) {
    if (seen.has(a.id)) continue;
    const kind = a.formeInfo?.kind;
    if (kind === 'combat-switch' || kind === 'cosmetic') {
      entries.push(a);
      seen.add(a.id);
    }
  }
  const kindOrder = { 'combat-switch': 0, cosmetic: 1 };
  const pickedId = pickedSpecies && pickedSpecies.id !== baseSpecies.id ? pickedSpecies.id : null;
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
    slot.formes.push(snapshotForme(altSpecies));
  }
  if (pickedId) {
    const idx = slot.formes.findIndex((f) => f.speciesId === pickedId);
    if (idx >= 0) slot.activeFormeIndex = idx + 1;
  }
}

// Build a slot object from a parsed Showdown block. Unknown species
// produce an empty slot; unknown items/abilities/moves leave the
// corresponding field empty.
function buildSlot(parsed, ctx) {
  const { allSpecies, items, moves } = ctx;
  if (!parsed || !parsed.speciesName) return createEmptySlot();

  const sp = findSpeciesByName(parsed.speciesName, allSpecies);
  if (!sp) return createEmptySlot();

  const isForme = !!sp.baseSpecies;
  const baseSpecies = isForme
    ? (allSpecies.find((s) => s.name === sp.baseSpecies) || sp)
    : sp;
  const isPreBattle = isPreBattleForme(sp);

  const slot = createEmptySlot();
  slot.speciesId = isPreBattle ? sp.id : baseSpecies.id;
  slot.name = parsed.nickname || sp.name;
  slot.shiny = !!parsed.shiny;
  slot.gender = sp.gender === 'M' ? 'Male' : sp.gender === 'F' ? 'Female' : 'Male';
  slot.nature = 'Serious';
  slot.item = null;
  slot.moves = [null, null, null, null];
  slot.stats = emptyStats();

  if (isPreBattle) {
    slot.baseAbility = sp.abilities?.[0] || null;
    slot.ability = slot.baseAbility;
  } else {
    slot.baseAbility = baseSpecies.abilities?.[0] || null;
    slot.ability = isForme ? (sp.abilities?.[0] || null) : slot.baseAbility;
    prePopulateFormes(slot, isForme ? sp : null, baseSpecies, allSpecies);
  }

  // Item: if a known stone for this base is equipped, attach the matching
  // mega to formes[] and point activeFormeIndex at it.
  if (parsed.itemName) {
    const itemId = findIdByName(parsed.itemName, items);
    if (itemId) {
      slot.item = itemId;
      const item = items[itemId];
      if (item?.megaStone && baseSpecies) {
        const baseName = baseSpecies.baseSpecies || baseSpecies.name;
        const megaName = item.megaStone[baseName];
        if (megaName) {
          const megaSpecies = allSpecies.find((s) => s.name === megaName);
          if (megaSpecies && !slot.formes.some((f) => f.speciesId === megaSpecies.id)) {
            slot.formes.push(snapshotForme(megaSpecies));
            slot.activeFormeIndex = slot.formes.length;
          }
        }
      }
    }
  }

  // Ability: only set when it's in the species' ability list.
  if (parsed.abilityName) {
    const validSet = new Set((sp.abilities || []).filter(Boolean).map((a) => a.toLowerCase()));
    if (validSet.has(parsed.abilityName.toLowerCase())) {
      slot.ability = parsed.abilityName;
      if (isPreBattle || !isForme) slot.baseAbility = parsed.abilityName;
    }
  }

  // Moves: skip unknown ones (leave the slot null).
  for (let i = 0; i < 4; i++) {
    const moveName = parsed.moveNames?.[i];
    if (!moveName) continue;
    const moveId = findIdByName(moveName, moves);
    if (moveId) slot.moves[i] = moveId;
  }

  if (parsed.evs) {
    slot.stats = {
      hp: parsed.evs.hp || 0,
      atk: parsed.evs.atk || 0,
      def: parsed.evs.def || 0,
      spa: parsed.evs.spa || 0,
      spd: parsed.evs.spd || 0,
      spe: parsed.evs.spe || 0,
    };
  }

  if (parsed.nature && KNOWN_NATURES.has(parsed.nature)) {
    slot.nature = parsed.nature;
  }

  // Gender: respect the species' lock if it has one.
  if (parsed.gender) {
    if (sp.gender === null) {
      slot.gender = parsed.gender;
    } else if (
      (sp.gender === 'M' && parsed.gender === 'Male') ||
      (sp.gender === 'F' && parsed.gender === 'Female')
    ) {
      slot.gender = parsed.gender;
    }
  }

  return slot;
}

// Build a 6-slot team from parsed Showdown blocks. Always returns 6
// slots; missing/empty blocks produce empty slots.
export function buildImportedSlots(parsedSlots, ctx) {
  const out = [];
  for (let i = 0; i < 6; i++) {
    const parsed = parsedSlots[i] || null;
    out.push(buildSlot(parsed, ctx));
  }
  return out;
}

export class TeamBrowserWidget {
  constructor(opts) {
    this.opts = opts;
    this.getFormat = opts.getFormat;
    this.getCurrentTeamId = opts.getCurrentTeamId;
    this.getSpriteMap = opts.getSpriteMap;
    this.getSpeciesById = opts.getSpeciesById;
    this.getAllSpecies = opts.getAllSpecies;
    this.onRenameTeam = opts.onRenameTeam;
    this.onSelectTeam = opts.onSelectTeam;
    this.onDeleteTeam = opts.onDeleteTeam;
    this.onCreateTeam = opts.onCreateTeam;
    this.onDuplicateTeam = opts.onDuplicateTeam;
    this.onImportTeam = opts.onImportTeam;
    this.isTeamLegal = opts.isTeamLegal;
    this._openPanel = null;
    this._items = opts.items || {};
    this._abilities = opts.abilities || {};
    this._moves = opts.moves || {};
    this._onFormatChange = () => this.render();
    this._onTeamsChange = () => this.render();
    this._onClick = (e) => {
      if (e.target.closest('[data-action="new-team"]')) {
        if (this._teamById && Array.from(this._teamById.values()).some(isTeamEmpty)) return;
        if (this.onCreateTeam) this.onCreateTeam();
        return;
      }
      const item = e.target.closest('.tbr-team-item');
      if (!item) return;
      const teamId = item.dataset.teamId;
      if (!teamId) return;
      const editAction = e.target.closest('[data-action="edit"]');
      if (editAction) {
        const team = this._teamById.get(teamId);
        if (team && this.onSelectTeam) this.onSelectTeam(team);
        return;
      }
      if (e.target.closest('.tbr-team-delete')) {
        const team = this._teamById.get(teamId);
        if (team && this.onDeleteTeam) this.onDeleteTeam(team);
        return;
      }
      if (e.target.closest('[data-action="duplicate"]')) {
        const team = this._teamById.get(teamId);
        if (!team || isTeamEmpty(team)) return;
        if (team && this.onDuplicateTeam) this.onDuplicateTeam(team);
        return;
      }
      if (e.target.closest('[data-action="import"]')) {
        this._togglePanel(teamId, 'import');
        return;
      }
      if (e.target.closest('[data-action="export"]')) {
        this._togglePanel(teamId, 'export');
        return;
      }
      if (e.target.closest('[data-action="import-ok"]')) {
        const item = e.target.closest('.tbr-team-item');
        const teamId = item?.dataset.teamId;
        const ta = item?.querySelector('.tbr-import-export-textarea');
        const okBtn = e.target.closest('[data-action="import-ok"]');
        const text = ta ? ta.value : '';
        if (!teamId || !this.onImportTeam) {
          this._closePanel();
          return;
        }
        const pasteId = pokepasteIdFromText(text);
        if (pasteId) {
          if (okBtn) {
            okBtn.disabled = true;
            okBtn.textContent = 'Loading…';
          }
          fetchPokepasteJson(pasteId)
            .then((paste) => this._importText(teamId, paste.text, pokepasteTeamName(paste)))
            .catch((err) => {
              console.error('Pokepaste fetch failed:', err);
              alert(`Could not load paste from pokepast.es (${err.message || 'network error'}).`);
              if (okBtn) {
                okBtn.disabled = false;
                okBtn.textContent = 'OK';
              }
              return null;
            })
            .then((didImport) => {
              if (didImport !== null) this._closePanel();
            });
        } else {
          this._importText(teamId, text);
          this._closePanel();
        }
        return;
      }
      if (e.target.closest('.tbr-team-name')) return;
      if (e.target.closest('.tbr-import-export-panel')) return;
      const team = this._teamById.get(teamId);
      if (team && this.onSelectTeam) this.onSelectTeam(team);
    };
    this._onNameChange = (e) => {
      const input = e.target.closest('.tbr-team-name');
      if (!input) return;
      const item = input.closest('.tbr-team-item');
      if (!item) return;
      const teamId = item.dataset.teamId;
      const team = this._teamById.get(teamId);
      if (team && this.onRenameTeam) this.onRenameTeam(team, input.value);
    };
    this.opts.container.addEventListener("change", this._onNameChange);
    this.opts.container.addEventListener("click", this._onClick);
    window.addEventListener("potato-format-change", this._onFormatChange);
    window.addEventListener("potato-team-change", this._onTeamsChange);
    this.render();
  }

  render() {
    const globalFormat = this.getFormat ? this.getFormat() : null;
    const currentTeamId = this.getCurrentTeamId ? this.getCurrentTeamId() : null;
    const teams = globalFormat ? loadTeams(globalFormat) : [];
    this._teamById = new Map(teams.map((t) => [t.id, t]));
    this._teamFormatLabel = (this.opts.formats || []).find(
      (f) => f.value === globalFormat,
    )?.label.replace(/^Regulation\s+/, "") || globalFormat || "";

    const teamsHtml = teams.length === 0
      ? '<li class="tbr-team-empty">No teams saved for this format</li>'
      : teams.map((t) => this._renderTeamItem(t, t.id === currentTeamId, this.isTeamLegal ? this.isTeamLegal(t) : true)).join("");

    this.opts.container.innerHTML = `
      <div class="tbr-new-team">
        <button type="button" class="tbr-action-btn" data-action="new-team">New Team</button>
      </div>
      <ul class="tbr-team-list">${teamsHtml}</ul>
    `;

    if (this._openPanel && this._teamById.has(this._openPanel.teamId)) {
      this._applyPanelDom();
    } else {
      this._openPanel = null;
    }
  }

  _importText(teamId, text, name) {
    const parsed = parseShowdownText(text);
    const slots = buildImportedSlots(parsed, {
      allSpecies: this.getAllSpecies ? this.getAllSpecies() : [],
      items: this._items,
      moves: this._moves,
    });
    this.onImportTeam(teamId, slots, name || null);
  }

  _togglePanel(teamId, type) {
    const sameOpen = this._openPanel
      && this._openPanel.teamId === teamId
      && this._openPanel.type === type;
    this._closePanel();
    if (sameOpen) return;
    this._openPanel = { teamId, type };
    this._applyPanelDom({ select: true });
  }

  _closePanel() {
    if (!this._openPanel) return;
    const { teamId } = this._openPanel;
    this._openPanel = null;
    const item = this.opts.container.querySelector(`.tbr-team-item[data-team-id="${teamId}"]`);
    if (!item) return;
    item.querySelectorAll('.tbr-team-action.active').forEach((b) => b.classList.remove('active'));
    const panel = item.querySelector('.tbr-import-export-panel');
    if (panel) panel.remove();
  }

  _applyPanelDom({ select = false } = {}) {
    if (!this._openPanel) return;
    const { teamId, type } = this._openPanel;
    const item = this.opts.container.querySelector(`.tbr-team-item[data-team-id="${teamId}"]`);
    if (!item) { this._openPanel = null; return; }
    const existing = item.querySelector('.tbr-import-export-panel');
    if (existing) {
      this._updatePanelValue(existing);
      return;
    }
    const btn = item.querySelector(`.tbr-team-action[data-action="${type}"]`);
    if (btn) btn.classList.add('active');
    const team = this._teamById.get(teamId);
    const panel = document.createElement('div');
    panel.className = 'tbr-import-export-panel';
    const ta = document.createElement('textarea');
    ta.className = 'tbr-import-export-textarea';
    ta.rows = 10;
    ta.spellcheck = false;
    ta.placeholder = type === 'import' ? 'Paste Showdown-format team or pokepast.es URL…' : '';
    panel.appendChild(ta);
    if (type === 'import') {
      const ok = document.createElement('button');
      ok.type = 'button';
      ok.className = 'tbr-import-export-ok';
      ok.textContent = 'OK';
      ok.dataset.action = 'import-ok';
      panel.appendChild(ok);
    }
    item.appendChild(panel);
    this._updatePanelValue(panel);
    if (type === 'import') {
      requestAnimationFrame(() => ta.focus());
    } else if (type === 'export' && select) {
      requestAnimationFrame(() => ta.select());
    }
  }

  _updatePanelValue(panel) {
    if (!this._openPanel) return;
    const { teamId, type } = this._openPanel;
    const team = this._teamById.get(teamId);
    const ta = panel.querySelector('textarea');
    if (!ta) return;
    ta.value = type === 'export' && team ? this._buildShowdownExport(team) : '';
  }

  _buildShowdownExport(team) {
    if (!team || !Array.isArray(team.slots)) return '';
    const STAT_ORDER = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
    const STAT_LABELS = { hp: 'HP', atk: 'Atk', def: 'Def', spa: 'SpA', spd: 'SpD', spe: 'Spe' };
    const blocks = [];
    for (const slot of team.slots) {
      if (!slot || !slot.speciesId) continue;
      let activeSpecies = this.getSpeciesById ? this.getSpeciesById(slot.speciesId) : null;
      if (!activeSpecies) continue;
      if (slot.activeFormeIndex > 0 && Array.isArray(slot.formes)) {
        const forme = slot.formes[slot.activeFormeIndex - 1];
        if (forme) {
          const formeSpecies = this.getSpeciesById ? this.getSpeciesById(forme.speciesId) : null;
          if (formeSpecies) activeSpecies = formeSpecies;
        }
      }
      const lines = [];
      let name = activeSpecies.name || activeSpecies.id;
      if (slot.gender === 'Male') name += ' (M)';
      else if (slot.gender === 'Female') name += ' (F)';
      if (slot.item) {
        const item = this._items[slot.item];
        lines.push(`${name} @ ${item ? item.name : slot.item}`);
      } else {
        lines.push(name);
      }
      if (slot.ability) {
        const ability = this._abilities[slot.ability];
        lines.push(`Ability: ${ability ? ability.name : slot.ability}`);
      }
      if (slot.shiny) {
        lines.push('Shiny: Yes');
      }
      if (slot.stats && typeof slot.stats === 'object') {
        const evParts = [];
        for (const stat of STAT_ORDER) {
          const v = slot.stats[stat] || 0;
          if (v > 0) evParts.push(`${v} ${STAT_LABELS[stat]}`);
        }
        if (evParts.length > 0) {
          lines.push(`EVs: ${evParts.join(' / ')}`);
        }
      }
      if (slot.nature) {
        lines.push(`${slot.nature} Nature`);
      }
      if (Array.isArray(slot.moves)) {
        for (const moveId of slot.moves) {
          if (!moveId) continue;
          const move = this._moves[moveId];
          lines.push(`- ${move ? move.name : moveId}`);
        }
      }
      blocks.push(lines.join('\n'));
    }
    return blocks.join('\n\n');
  }

  setData({ items, abilities, moves } = {}) {
    this._items = items || this._items;
    this._abilities = abilities || this._abilities;
    this._moves = moves || this._moves;
    if (this._openPanel) {
      const { teamId } = this._openPanel;
      const item = this.opts.container.querySelector(`.tbr-team-item[data-team-id="${teamId}"]`);
      const panel = item ? item.querySelector('.tbr-import-export-panel') : null;
      if (panel) this._updatePanelValue(panel);
    }
  }

  _renderTeamItem(team, isActive = false, isLegal = true) {
    const spriteMap = this.getSpriteMap ? this.getSpriteMap() : {};
    const slotsHtml = [];
    for (let i = 0; i < 6; i++) {
      const slot = team.slots[i];
      if (slot && slot.speciesId) {
        const base = this.getSpeciesById ? this.getSpeciesById(slot.speciesId) : null;
        let activeId = slot.speciesId;
        if (base && Array.isArray(slot.formes) && slot.formes.length > 0) {
          const idx = slot.activeFormeIndex || 0;
          if (idx > 0 && idx <= slot.formes.length) {
            activeId = slot.formes[idx - 1].speciesId;
          }
        }
        const active = (this.getSpeciesById ? this.getSpeciesById(activeId) : null) || base;
        const spriteFile = active ? spriteMap[active.id] : null;
        if (spriteFile) {
          slotsHtml.push(
            `<div class="tbr-slot filled" title="${active.name}"><img class="tbr-slot-sprite" src="${SPRITE_PATH}/${spriteFile}" alt="${active.name}"></div>`,
          );
        } else {
          slotsHtml.push(`<div class="tbr-slot filled" title="${slot.speciesId}"></div>`);
        }
      } else {
        slotsHtml.push('<div class="tbr-slot empty"></div>');
      }
    }
    return `<li class="tbr-team-item${isActive ? " active" : ""}" data-team-id="${team.id}">
      <div class="tbr-team-header">
        <span class="tbr-team-format ${isLegal ? "legal" : "illegal"}" title="${isLegal ? "Legal team" : "Illegal team — duplicate species or item"}">${this._escapeAttr(this._teamFormatLabel)}</span>
        <input type="text" class="tbr-team-name" value="${this._escapeAttr(team.name)}" placeholder="Team name">
        <button type="button" class="tbr-team-delete" title="Delete team" aria-label="Delete team">×</button>
      </div>
      <div class="tbr-team-slots">
        <div class="tbr-team-slots-grid">${slotsHtml.join('')}</div>
        <div class="tbr-team-actions">
          <button type="button" class="tbr-team-action" data-action="duplicate"${isTeamEmpty(team) ? " disabled" : ""}>Duplicate</button>
          <button type="button" class="tbr-team-action" data-action="import">Import</button>
          <button type="button" class="tbr-team-action" data-action="export">Export</button>
          <button type="button" class="tbr-team-action" data-action="edit">Edit</button>
        </div>
      </div>
    </li>`;
  }

  _escapeAttr(s) {
    return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  destroy() {
    this._openPanel = null;
    this.opts.container.removeEventListener("change", this._onNameChange);
    this.opts.container.removeEventListener("click", this._onClick);
    window.removeEventListener("potato-team-change", this._onTeamsChange);
    window.removeEventListener("potato-format-change", this._onFormatChange);
    this.opts.container.innerHTML = "";
  }
}

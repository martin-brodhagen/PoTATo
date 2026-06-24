import { TYPES } from './types.js';
import { getOffensiveEffectiveness, computeDefenderEffects, normalizeAbilityId } from './defensive-coverage-widget.js';

const COSMETIC_KIND = 'cosmetic';

const SECTIONS = [
  'Immune',
  '1/4 effective',
  '1/2 effective',
  'Neutral',
  'only 1 supereffective attacker',
];

const EXCLUDED_MOVE_IDS = new Set([
  'counter', 'mirrorcoat', 'metalburst', 'comeuppance',
  'seismictoss', 'nightshade', 'dragonrage', 'sonicboom', 'superfang', 'endeavor',
  'fissure', 'sheercold', 'guillotine', 'horndrill',
]);

const TYPE_CHANGE_ABILITIES = {
  pixilate: { from: 'Normal', to: 'Fairy' },
  refrigerate: { from: 'Normal', to: 'Ice' },
  aerilate: { from: 'Normal', to: 'Flying' },
  galvanize: { from: 'Normal', to: 'Electric' },
  dragonize: { from: 'Normal', to: 'Dragon' },
};

// Weather-setting abilities → the type Weather Ball becomes when the
// bearer is on the field. Used to approximate the in-battle type flip
// based on which weather the ability would summon.
const WEATHER_BALL_TYPES = {
  drought: 'Fire',     // harsh sunlight
  drizzle: 'Water',    // rain
  sandstream: 'Rock',  // sandstorm
  snowwarning: 'Ice',  // snow / hail
};

// Resolve the effective attacking type of a move given the bearer's
// ability. Handles Normalize, the "ate" family, Liquid Voice (sound
// moves → Water), and a weather-ability approximation for Weather Ball.
function effectiveMoveType(move, ability) {
  if (!move || !move.type) return null;
  if (ability === 'normalize') return 'Normal';
  if (move.id === 'weatherball' && WEATHER_BALL_TYPES[ability]) {
    return WEATHER_BALL_TYPES[ability];
  }
  let type = move.type;
  if (ability && TYPE_CHANGE_ABILITIES[ability]?.from === type) {
    type = TYPE_CHANGE_ABILITIES[ability].to;
  }
  if (ability === 'liquidvoice' && move.flags?.includes('sound')) {
    type = 'Water';
  }
  return type;
}

function bucketFor(mult) {
  if (mult === 0) return 'Immune';
  if (mult === 0.25) return '1/4 effective';
  if (mult === 0.5) return '1/2 effective';
  if (mult === 1) return 'Neutral';
  return 'only 1 supereffective attacker';
}

export class OffensiveCoverageWidget {
  constructor(opts) {
    this.opts = opts;
    this.abort = new AbortController();
    this.activeTypes = new Set();
    this.activeTeamMembers = new Set();
    this.speciesById = new Map(opts.species.map((s) => [s.id, s]));
    this.movesById = opts.moves || {};
    this.cells = this.buildCells();
    // Tracks the last team id we rendered for. A change here signals a
    // team switch (or format switch) → full re-render.
    this.lastTeamId = null;
    // Snapshot of {slotIndex: {speciesId}} for ALL slots — drives the
    // team list (left side) updates.
    this.teamListSnapshot = null;
    // Snapshot of {slotIndex: {speciesId, moves}} for the slots that are
    // currently activeTeamMembers — drives the coverage grid (right side)
    // recomputation.
    this.activeSnapshot = null;
    this.buildDOM();
  }

  // Resolve the active species id for a slot (base or selected forme).
  getActiveSpeciesId(slot) {
    const baseSp = slot.speciesId ? this.speciesById.get(slot.speciesId) : null;
    if (baseSp && Array.isArray(slot.formes) && slot.formes.length > 0) {
      const idx = slot.activeFormeIndex || 0;
      if (idx > 0 && idx <= slot.formes.length) {
        return slot.formes[idx - 1].speciesId;
      }
    }
    return baseSp?.id || null;
  }

  // Snapshot for the team list (left side): just the active species of
  // every slot, since the list only shows sprites.
  computeTeamListState(team) {
    const state = new Map();
    if (!team) return state;
    for (let i = 0; i < team.slots.length; i++) {
      const slot = team.slots[i];
      state.set(i, { speciesId: this.getActiveSpeciesId(slot) });
    }
    return state;
  }

  // Snapshot for the coverage grid (right side): only slots that are
  // activeTeamMembers contribute, and both species and moves are tracked.
  computeActiveState(team) {
    const state = new Map();
    if (!team) return state;
    for (let i = 0; i < team.slots.length; i++) {
      const slot = team.slots[i];
      const speciesId = this.getActiveSpeciesId(slot);
      if (speciesId && this.activeTeamMembers.has(speciesId)) {
        state.set(i, {
          speciesId,
          moves: (slot.moves || []).slice(),
        });
      }
    }
    return state;
  }

  statesEqualSimple(a, b) {
    if (a === b) return true;
    if (!a || !b) return false;
    if (a.size !== b.size) return false;
    for (const [key, val] of a) {
      const other = b.get(key);
      if (!other) return false;
      if (other.speciesId !== val.speciesId) return false;
    }
    return true;
  }

  statesEqual(a, b) {
    if (a === b) return true;
    if (!a || !b) return false;
    if (a.size !== b.size) return false;
    for (const [key, val] of a) {
      const other = b.get(key);
      if (!other) return false;
      if (other.speciesId !== val.speciesId) return false;
      if (other.moves.length !== val.moves.length) return false;
      for (let i = 0; i < val.moves.length; i++) {
        if (other.moves[i] !== val.moves[i]) return false;
      }
    }
    return true;
  }

  getAttackers() {
    const attackers = [];
    attackers.push({ types: new Set(this.activeTypes), ability: null });
    const team = this.opts.getTeam();
    if (team) {
      for (const slot of team.slots) {
        // Use the active forme (e.g. Mega-Y) when set, else the base.
        const speciesId = this.getActiveSpeciesId(slot);
        const species = speciesId ? this.speciesById.get(speciesId) : null;
        if (!species) continue;
        if (!this.activeTeamMembers.has(species.id)) continue;
        const ability = normalizeAbilityId(slot.ability)
          || normalizeAbilityId(species.abilities?.[0])
          || null;
        const types = new Set();
        for (const moveId of (slot.moves || [])) {
          if (!moveId) continue;
          if (EXCLUDED_MOVE_IDS.has(moveId)) continue;
          const move = this.movesById[moveId];
          if (!move || move.category === 'Status' || !move.type) continue;
          const effectiveType = effectiveMoveType(move, ability);
          if (effectiveType) types.add(effectiveType);
        }
        if (types.size > 0) {
          attackers.push({ types, ability });
        }
      }
    }
    return attackers;
  }

  buildCells() {
    const cells = new Map();
    for (const sp of this.opts.species) {
      if (sp.formeInfo?.kind === COSMETIC_KIND) continue;
      const spriteFile = this.opts.spriteMap[sp.id];
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'oc-pokemon-btn';
      btn.dataset.speciesId = sp.id;
      btn.title = sp.name;
      btn.setAttribute('aria-label', sp.name);
      if (spriteFile) {
        const img = document.createElement('img');
        img.className = 'oc-pokemon-sprite';
        img.src = `sprites/champions/${spriteFile}`;
        img.alt = sp.name;
        img.loading = 'lazy';
        btn.appendChild(img);
      } else {
        const missing = document.createElement('span');
        missing.className = 'oc-pokemon-sprite-missing';
        btn.appendChild(missing);
      }
      btn.addEventListener('click', () => {
        this.opts.onPokemonClick?.(sp);
      });
      cells.set(sp.id, btn);
    }
    return cells;
  }

  renderTeam() {
    const team = this.opts.getTeam();
    const wrapper = this.opts.container.querySelector('#offensive-coverage-content');
    const teamList = wrapper.querySelector('.oc-team-list');
    if (!teamList) return;

    teamList.innerHTML = '';
    if (!team) {
      teamList.innerHTML = '<div class="oc-team-slot oc-team-slot-empty">No team</div>';
      return;
    }

    for (const slot of team.slots) {
      const speciesId = this.getActiveSpeciesId(slot);
      const sp = speciesId ? this.speciesById.get(speciesId) : null;

      const row = document.createElement('div');
      row.className = 'oc-team-slot';

      if (!sp) {
        row.classList.add('oc-team-slot-empty');
        row.textContent = 'Empty';
        teamList.appendChild(row);
        continue;
      }

      if (this.activeTeamMembers.has(speciesId)) {
        row.classList.add('oc-team-slot-active');
      }

      const spriteFile = this.opts.spriteMap[sp.id];
      const spriteHtml = spriteFile
        ? `<img class="oc-team-sprite" src="sprites/champions/${spriteFile}" alt="${sp.name}">`
        : '';
      row.innerHTML = `<div class="oc-team-sprite-wrap">${spriteHtml}</div>`;
      row.addEventListener('click', () => {
        if (this.activeTeamMembers.has(speciesId)) {
          this.activeTeamMembers.delete(speciesId);
          row.classList.remove('oc-team-slot-active');
        } else {
          this.activeTeamMembers.add(speciesId);
          row.classList.add('oc-team-slot-active');
        }
        this.recomputeBuckets();
      });
      teamList.appendChild(row);
    }
  }

  buildTypeToggles() {
    return `
      <div class="oc-type-toggles" role="group" aria-label="Offensive coverage types">
        ${TYPES.map(t => `
          <button type="button"
                  class="oc-type-toggle type-tag ${t.toLowerCase()}"
                  data-type="${t}"
                  aria-pressed="false">${t}</button>
        `).join('')}
      </div>
    `;
  }

  buildPokemonGrid() {
    const sectionsHtml = SECTIONS.map((label) => `
      <section class="oc-pokemon-section" data-section="${label}">
        <header class="oc-pokemon-section-header">
          <span class="oc-pokemon-section-label">${label}</span>
          <span class="oc-pokemon-section-count">0 total</span>
        </header>
        <div class="oc-pokemon-section-grid"></div>
      </section>
    `).join('');

    return `<div class="oc-pokemon-grid">${sectionsHtml}</div>`;
  }

  recomputeBuckets() {
    const wrapper = this.opts.container.querySelector('#offensive-coverage-content');
    if (!wrapper) return;
    const bodies = {};
    const counts = {};
    for (const section of wrapper.querySelectorAll('.oc-pokemon-section')) {
      const label = section.dataset.section;
      bodies[label] = section.querySelector('.oc-pokemon-section-grid');
      counts[label] = 0;
    }
    const attackers = this.getAttackers();
    for (const [speciesId, node] of this.cells) {
      const species = this.speciesById.get(speciesId);
      if (!species) {
        if (node.parentNode) node.parentNode.removeChild(node);
        continue;
      }
      const defenderEffects = computeDefenderEffects(species.abilities || []);
      let seAttackerCount = 0;
      let max = 0;
      for (const atk of attackers) {
        let atkMax = 0;
        for (const atkType of atk.types) {
          const m = getOffensiveEffectiveness(atk.ability, atkType, species, defenderEffects);
          if (m > atkMax) atkMax = m;
        }
        if (atkMax > max) max = atkMax;
        if (atkMax >= 2) seAttackerCount++;
      }
      if (seAttackerCount >= 2) {
        if (node.parentNode) node.parentNode.removeChild(node);
        continue;
      }
      const label = seAttackerCount === 1
        ? 'only 1 supereffective attacker'
        : bucketFor(max);
      bodies[label].appendChild(node);
      counts[label]++;
    }
    for (const section of wrapper.querySelectorAll('.oc-pokemon-section')) {
      const countEl = section.querySelector('.oc-pokemon-section-count');
      if (countEl) countEl.textContent = `${counts[section.dataset.section]} total`;
    }
  }

  buildDOM() {
    const wrapper = this.opts.container.querySelector('#offensive-coverage-content');
    wrapper.innerHTML = `
      <div class="oc-layout">
        <div class="oc-team-list"></div>
        <div class="oc-main">
          ${this.buildTypeToggles()}
          ${this.buildPokemonGrid()}
        </div>
      </div>
    `;
    this.bindTypeToggles();
    this.recomputeBuckets();
    this.renderTeam();
  }

  // Selective refresh: the team list (left) updates whenever a slot's
  // active species changes (including inactive slots), but the coverage
  // grid (right) only recomputes when species or moves change on an
  // active OC slot. Stat / nature / item / ability changes are
  // no-ops on both sides.
  refresh() {
    const team = this.opts.getTeam();
    const teamId = team?.id ?? null;

    // Team switch (or first call, or format switch) → full re-render.
    if (teamId !== this.lastTeamId) {
      this.lastTeamId = teamId;
      this.teamListSnapshot = null;
      this.activeSnapshot = null;
      this.speciesById = new Map(this.opts.species.map((s) => [s.id, s]));
      this.movesById = this.opts.moves || {};
      this.cells = this.buildCells();
      const wrapper = this.opts.container.querySelector('#offensive-coverage-content');
      if (wrapper) {
        for (const body of wrapper.querySelectorAll('.oc-pokemon-section-grid')) {
          body.innerHTML = '';
        }
      }
      this.teamListSnapshot = this.computeTeamListState(team);
      this.activeSnapshot = this.computeActiveState(team);
      this.renderTeam();
      this.recomputeBuckets();
      return;
    }

    // Same team — check each side independently.
    const currentTeamList = this.computeTeamListState(team);
    const currentActive = this.computeActiveState(team);

    const teamListChanged = !this.statesEqualSimple(this.teamListSnapshot, currentTeamList);
    const activeChanged = !this.statesEqual(this.activeSnapshot, currentActive);

    if (!teamListChanged && !activeChanged) return;

    if (teamListChanged) {
      this.teamListSnapshot = currentTeamList;
      this.renderTeam();
    }
    if (activeChanged) {
      this.activeSnapshot = currentActive;
      this.recomputeBuckets();
    }
  }

  bindTypeToggles() {
    const wrapper = this.opts.container.querySelector('#offensive-coverage-content');
    const bar = wrapper.querySelector('.oc-type-toggles');
    if (!bar) return;
    bar.addEventListener('click', (e) => {
      const btn = e.target.closest('.oc-type-toggle');
      if (!btn) return;
      const type = btn.dataset.type;
      if (!type) return;
      if (this.activeTypes.has(type)) {
        this.activeTypes.delete(type);
        btn.classList.remove('active');
        btn.setAttribute('aria-pressed', 'false');
      } else {
        this.activeTypes.add(type);
        btn.classList.add('active');
        btn.setAttribute('aria-pressed', 'true');
      }
      this.recomputeBuckets();
    }, { signal: this.abort.signal });
  }

  destroy() {
    this.abort.abort();
  }
}

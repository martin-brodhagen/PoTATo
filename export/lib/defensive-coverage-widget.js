import { CHAMPIONS_SPRITE_PATH, CHAMPIONS_SPRITE_PATH_SMALL } from './sprite-paths.js';

const TYPE_IMMUNITY_ABILITIES = {
  levitate: "Ground",
  flashfire: "Fire",
  sapsipper: "Grass",
  waterabsorb: "Water",
  voltabsorb: "Electric",
  dryskin: "Water",
  eartheater: "Ground",
  lightningrod: "Electric",
  motordrive: "Electric",
  eelevate: "Ground",
};

const TYPE_HALVING_ABILITIES = {
  thickfat: { Fire: 0.5, Ice: 0.5 },
  waterbubble: { Fire: 0.5 },
  heatproof: { Fire: 0.5 },
  purifyingsalt: { Ghost: 0.5 },
};

const TYPE_DOUBLING_ABILITIES = {
  fluffy: { Fire: 2 },
};

const FILTER_ABILITIES = {
  filter: [
    "Normal", "Fighting", "Flying", "Poison", "Ground", "Rock", "Bug",
    "Ghost", "Steel", "Fire", "Water", "Grass", "Electric", "Psychic",
    "Ice", "Dragon", "Dark", "Fairy",
  ],
  solidrock: [
    "Normal", "Fighting", "Flying", "Poison", "Ground", "Rock", "Bug",
    "Ghost", "Steel", "Fire", "Water", "Grass", "Electric", "Psychic",
    "Ice", "Dragon", "Dark", "Fairy",
  ],
};

const TYPES = [
  "Normal", "Fire", "Water", "Electric", "Grass", "Ice", "Fighting",
  "Poison", "Ground", "Flying", "Psychic", "Bug", "Rock", "Ghost",
  "Dragon", "Dark", "Steel", "Fairy",
];

const DEFENSIVE_CHART = {
  Normal: {
    Normal: 1, Fire: 1, Water: 1, Electric: 1, Grass: 1, Ice: 1,
    Fighting: 1, Poison: 1, Ground: 1, Flying: 1, Psychic: 1, Bug: 1,
    Rock: 0.5, Ghost: 0, Dragon: 1, Dark: 1, Steel: 0.5, Fairy: 1,
  },
  Fire: {
    Normal: 1, Fire: 0.5, Water: 0.5, Electric: 1, Grass: 2, Ice: 2,
    Fighting: 1, Poison: 1, Ground: 1, Flying: 1, Psychic: 1, Bug: 2,
    Rock: 0.5, Ghost: 1, Dragon: 0.5, Dark: 1, Steel: 2, Fairy: 1,
  },
  Water: {
    Normal: 1, Fire: 2, Water: 0.5, Electric: 1, Grass: 0.5, Ice: 1,
    Fighting: 1, Poison: 1, Ground: 2, Flying: 1, Psychic: 1, Bug: 1,
    Rock: 2, Ghost: 1, Dragon: 0.5, Dark: 1, Steel: 1, Fairy: 1,
  },
  Electric: {
    Normal: 1, Fire: 1, Water: 2, Electric: 0.5, Grass: 0.5, Ice: 1,
    Fighting: 1, Poison: 1, Ground: 0, Flying: 2, Psychic: 1, Bug: 1,
    Rock: 1, Ghost: 1, Dragon: 0.5, Dark: 1, Steel: 1, Fairy: 1,
  },
  Grass: {
    Normal: 1, Fire: 0.5, Water: 2, Electric: 1, Grass: 0.5, Ice: 1,
    Fighting: 1, Poison: 0.5, Ground: 2, Flying: 0.5, Psychic: 1,
    Bug: 0.5, Rock: 2, Ghost: 1, Dragon: 0.5, Dark: 1, Steel: 0.5, Fairy: 1,
  },
  Ice: {
    Normal: 1, Fire: 0.5, Water: 0.5, Electric: 1, Grass: 2, Ice: 0.5,
    Fighting: 1, Poison: 1, Ground: 2, Flying: 2, Psychic: 1, Bug: 1,
    Rock: 1, Ghost: 1, Dragon: 2, Dark: 1, Steel: 0.5, Fairy: 1,
  },
  Fighting: {
    Normal: 2, Fire: 1, Water: 1, Electric: 1, Grass: 1, Ice: 2,
    Fighting: 1, Poison: 0.5, Ground: 1, Flying: 0.5, Psychic: 0.5,
    Bug: 0.5, Rock: 2, Ghost: 0, Dragon: 1, Dark: 2, Steel: 2, Fairy: 0.5,
  },
  Poison: {
    Normal: 1, Fire: 1, Water: 1, Electric: 1, Grass: 2, Ice: 1,
    Fighting: 1, Poison: 0.5, Ground: 0.5, Flying: 1, Psychic: 1,
    Bug: 1, Rock: 0.5, Ghost: 0.5, Dragon: 1, Dark: 1, Steel: 0, Fairy: 2,
  },
  Ground: {
    Normal: 1, Fire: 2, Water: 1, Electric: 2, Grass: 0.5, Ice: 1,
    Fighting: 1, Poison: 2, Ground: 1, Flying: 0, Psychic: 1, Bug: 0.5,
    Rock: 2, Ghost: 1, Dragon: 1, Dark: 1, Steel: 2, Fairy: 1,
  },
  Flying: {
    Normal: 1, Fire: 1, Water: 1, Electric: 0.5, Grass: 2, Ice: 1,
    Fighting: 2, Poison: 1, Ground: 1, Flying: 1, Psychic: 1, Bug: 2,
    Rock: 0.5, Ghost: 1, Dragon: 1, Dark: 1, Steel: 0.5, Fairy: 1,
  },
  Psychic: {
    Normal: 1, Fire: 1, Water: 1, Electric: 1, Grass: 1, Ice: 1,
    Fighting: 2, Poison: 2, Ground: 1, Flying: 1, Psychic: 0.5, Bug: 1,
    Rock: 1, Ghost: 1, Dragon: 1, Dark: 0, Steel: 0.5, Fairy: 1,
  },
  Bug: {
    Normal: 1, Fire: 0.5, Water: 1, Electric: 1, Grass: 2, Ice: 1,
    Fighting: 0.5, Poison: 0.5, Ground: 1, Flying: 0.5, Psychic: 2,
    Bug: 1, Rock: 1, Ghost: 0.5, Dragon: 1, Dark: 2, Steel: 0.5, Fairy: 0.5,
  },
  Rock: {
    Normal: 1, Fire: 2, Water: 1, Electric: 1, Grass: 1, Ice: 2,
    Fighting: 0.5, Poison: 1, Ground: 0.5, Flying: 2, Psychic: 1,
    Bug: 2, Rock: 1, Ghost: 1, Dragon: 1, Dark: 1, Steel: 0.5, Fairy: 1,
  },
  Ghost: {
    Normal: 0, Fire: 1, Water: 1, Electric: 1, Grass: 1, Ice: 1,
    Fighting: 1, Poison: 1, Ground: 1, Flying: 1, Psychic: 2, Bug: 1,
    Rock: 1, Ghost: 2, Dragon: 1, Dark: 0.5, Steel: 1, Fairy: 1,
  },
  Dragon: {
    Normal: 1, Fire: 1, Water: 1, Electric: 1, Grass: 1, Ice: 1,
    Fighting: 1, Poison: 1, Ground: 1, Flying: 1, Psychic: 1, Bug: 1,
    Rock: 1, Ghost: 1, Dragon: 2, Dark: 1, Steel: 0.5, Fairy: 0,
  },
  Dark: {
    Normal: 1, Fire: 1, Water: 1, Electric: 1, Grass: 1, Ice: 1,
    Fighting: 0.5, Poison: 1, Ground: 1, Flying: 1, Psychic: 2, Bug: 1,
    Rock: 1, Ghost: 2, Dragon: 1, Dark: 0.5, Steel: 1, Fairy: 0.5,
  },
  Steel: {
    Normal: 1, Fire: 0.5, Water: 0.5, Electric: 0.5, Grass: 1, Ice: 2,
    Fighting: 1, Poison: 1, Ground: 1, Flying: 1, Psychic: 1, Bug: 1,
    Rock: 2, Ghost: 1, Dragon: 1, Dark: 1, Steel: 0.5, Fairy: 2,
  },
  Fairy: {
    Normal: 1, Fire: 0.5, Water: 1, Electric: 1, Grass: 1, Ice: 1,
    Fighting: 2, Poison: 0.5, Ground: 1, Flying: 1, Psychic: 1, Bug: 1,
    Rock: 1, Ghost: 1, Dragon: 2, Dark: 2, Steel: 0.5, Fairy: 1,
  },
};

function getSpeciesDef(species, atkType, abilityId) {
  if (abilityId && TYPE_IMMUNITY_ABILITIES[abilityId] === atkType) {
    return 0;
  }
  let total = 1;
  if (abilityId && TYPE_HALVING_ABILITIES[abilityId]?.[atkType]) {
    total *= 0.5;
  }
  if (abilityId && TYPE_DOUBLING_ABILITIES[abilityId]?.[atkType]) {
    total *= 2;
  }
  for (const defType of species.types) {
    if (!defType) continue;
    const m = DEFENSIVE_CHART[atkType]?.[defType] ?? 1;
    total *= m;
  }
  if (abilityId && FILTER_ABILITIES[abilityId]?.includes(atkType)) {
    if (total === 4) total = 3;
    else if (total === 2) total = 1.5;
  }
  return total;
}

const BREAKER_ABILITIES = new Set(['moldbreaker', 'teravolt', 'turboblaze']);

function normalizeAbilityId(name) {
  if (!name) return null;
  return name.toLowerCase().replace(/[^a-z]/g, '');
}

function computeDefenderEffects(abilities) {
  const immunity = new Set();
  const halving = new Set();
  const doubling = new Set();
  let hasFilter = false;
  for (const ab of abilities) {
    const abId = normalizeAbilityId(ab);
    if (!abId) continue;
    if (TYPE_IMMUNITY_ABILITIES[abId]) immunity.add(TYPE_IMMUNITY_ABILITIES[abId]);
    if (TYPE_HALVING_ABILITIES[abId]) {
      for (const t of Object.keys(TYPE_HALVING_ABILITIES[abId])) halving.add(t);
    }
    if (TYPE_DOUBLING_ABILITIES[abId]) {
      for (const t of Object.keys(TYPE_DOUBLING_ABILITIES[abId])) doubling.add(t);
    }
    if (FILTER_ABILITIES[abId]) hasFilter = true;
  }
  return { immunity, halving, doubling, hasFilter };
}

function getOffensiveEffectiveness(attackerAbility, atkType, defender, defenderEffects) {
  const bypass = attackerAbility && BREAKER_ABILITIES.has(attackerAbility);

  if (!bypass && defenderEffects.immunity.has(atkType)) {
    return 0;
  }

  let total = 1;
  if (defenderEffects.halving.has(atkType)) total *= 0.5;
  if (defenderEffects.doubling.has(atkType)) total *= 2;

  const hasScrappy = attackerAbility === 'scrappy' && (atkType === 'Normal' || atkType === 'Fighting');
  for (const defType of defender.types) {
    if (!defType) continue;
    let m = DEFENSIVE_CHART[atkType]?.[defType] ?? 1;
    if (m === 0 && defType === 'Ghost' && hasScrappy) {
      m = 1;
    }
    total *= m;
  }

  if (defenderEffects.hasFilter) {
    if (total === 4) total = 3;
    else if (total === 2) total = 1.5;
  }

  return total;
}

export { getSpeciesDef, getOffensiveEffectiveness, computeDefenderEffects, normalizeAbilityId };

const emptySlot = { speciesId: null, species: null, ability: null };

export class DefensiveCoverageWidget {
  constructor(opts) {
    this.opts = opts;
    this.abort = new AbortController();
    this.dcSlots = [
      { ...emptySlot },
      { ...emptySlot },
      { ...emptySlot },
      { ...emptySlot },
      { ...emptySlot },
      { ...emptySlot },
    ];
    this.highlightedIdx = -1;
    this.buildDOM();
  }

  buildDOM() {
    const wrapper = this.opts.container.querySelector("#defensive-coverage-content");
    wrapper.innerHTML =
      `<div class="dc-main">${this.buildTable()}</div><div class="dc-info">${this.buildInfoSection()}</div>`;
    this.searchPopup = document.createElement("div");
    this.searchPopup.className = "dc-search-popup filter-popup hidden";
    this.searchResults = document.createElement("div");
    this.searchResults.className = "dc-search-results";
    this.searchPopup.appendChild(this.searchResults);
    wrapper.appendChild(this.searchPopup);

    this.bindSearchPopupEvents();
    this.bindTableEvents();
    this.bindInfoEvents();
  }

  buildInfoSection() {
    return `
      <div class="dc-info-title">Notes</div>
      <div class="dc-info-content">
        <p>An attacker with the <span class="dc-keyword" data-type="ability" data-id="moldbreaker"><strong>Mold Breaker</strong></span> Ability ignores Abilities that give the defender a type immunity like <span class="dc-keyword" data-type="ability" data-id="flashfire"><strong>Flash Fire</strong></span>
        or a Damage Reduction like <span class="dc-keyword" data-type="ability" data-id="thickfat"><strong>Thick Fat</strong></span>. An attacker with <span class="dc-keyword" data-type="ability" data-id="scrappy"><strong>Scrappy</strong></span> can use Normal and Fighting type moves to hit Ghost types. <span class="dc-keyword" data-type="move" data-id="gravity"><strong>Gravity</strong></span> removes Ground immunity for 5 Turns.
        Moves like <span class="dc-keyword" data-type="move" data-id="worryseed"><strong>Worry Seed</strong></span> or <span class="dc-keyword" data-type="move" data-id="smackdown"><strong>Smack Down</strong></span> can also have an effect on the effectiveness of moves by removing defensive abilities or adding a certain Status to a Pokemon that makes it vulnerable. </p>
      </div>`;
  }

  bindInfoEvents() {
    const wrapper = this.opts.container.querySelector("#defensive-coverage-content");
    wrapper.addEventListener("click", (e) => {
      const kw = e.target.closest(".dc-keyword");
      if (!kw) return;
      const type = kw.dataset.type;
      const id = kw.dataset.id;
      if (type && id && this.opts.onKeywordClick) {
        this.opts.onKeywordClick(type, id);
      }
    });
  }

  bindSearchPopupEvents() {
    document.addEventListener("click", (e) => {
      const t = e.target;
      if (!t.closest(".dc-table-name") && !t.closest(".dc-search-popup")) {
        this.searchPopup.classList.add("hidden");
      }
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") this.searchPopup.classList.add("hidden");
      if (this.searchPopup.classList.contains("hidden")) return;
      const items = this.searchResults.querySelectorAll(".dc-search-item");
      if (items.length === 0) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        this.highlightedIdx = Math.min(this.highlightedIdx + 1, items.length - 1);
        this.updateSearchHighlight();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        this.highlightedIdx = Math.max(this.highlightedIdx - 1, 0);
        this.updateSearchHighlight();
      } else if (e.key === "Enter") {
        e.preventDefault();
        const target = this.highlightedIdx >= 0 && this.highlightedIdx < items.length ? items[this.highlightedIdx] : items[0];
        if (target) target.click();
      }
    });
  }

  bindTableEvents() {
    const wrapper = this.opts.container.querySelector("#defensive-coverage-content");

    wrapper.addEventListener("input", (e) => {
      const target = e.target;
      if (!target.classList.contains("dc-table-name")) return;
      const slotIndex = parseInt(target.dataset.slotIndex || "-1");
      if (slotIndex < 0) return;
      this.setupSpeciesSearch(target, slotIndex);
    });

    wrapper.addEventListener("change", (e) => {
      const target = e.target;
      if (!target.classList.contains("dc-table-ability")) return;
      const slotIndex = parseInt(target.dataset.slotIndex || "-1");
      if (slotIndex < 0) return;
      const slot = this.dcSlots[slotIndex];
      if (!slot?.species) return;
      slot.ability = target.value;
      const main = wrapper.querySelector(".dc-main");
      if (main) main.innerHTML = this.buildTable();
    });
  }

  setupSpeciesSearch(input, slotIndex) {
    this.highlightedIdx = -1;
    const text = input.value.trim().toLowerCase();

    if (text.length < 1) {
      this.searchResults.innerHTML = "";
      this.searchPopup.classList.add("hidden");
      return;
    }

    const matches = this.opts.species.filter(s =>
      s.id.includes(text) || s.name.toLowerCase().includes(text)
    ).slice(0, 20);

    if (matches.length === 0) {
      this.searchResults.innerHTML = "";
      this.searchPopup.classList.add("hidden");
      return;
    }

    let html = "";
    for (const s of matches) {
      const spriteFile = this.opts.spriteMap[s.id];
      const spriteHtml = spriteFile ? `<img class="dc-search-sprite" src="${CHAMPIONS_SPRITE_PATH_SMALL}/${spriteFile}">` : "";
      html += `<div class="dc-search-item" data-species-id="${s.id}">${spriteHtml}<span>${s.name}</span></div>`;
    }
    this.searchResults.innerHTML = html;
    this.searchPopup.classList.remove("hidden");

    const rect = input.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const popupHeight = Math.min(280, spaceBelow - 8);
    this.searchPopup.style.top = (spaceBelow > 60 ? rect.bottom + 4 : rect.top - popupHeight - 4) + "px";
    this.searchPopup.style.left = Math.max(8, rect.left) + "px";
    this.searchPopup.style.width = Math.max(220, rect.width) + "px";
    this.searchPopup.style.maxHeight = popupHeight + "px";

    this.searchResults.querySelectorAll(".dc-search-item").forEach((item) => {
      item.addEventListener("click", () => {
        const speciesId = item.dataset.speciesId;
        this.selectSpecies(slotIndex, speciesId);
      });
    });

    input.addEventListener("blur", () => {
      setTimeout(() => {
        if (!this.searchPopup.matches(":hover")) {
          this.searchPopup.classList.add("hidden");
        }
      }, 150);
    });
  }

  updateSearchHighlight() {
    this.searchResults.querySelectorAll(".dc-search-item").forEach((item, i) => {
      item.classList.toggle("highlighted", i === this.highlightedIdx);
    });
    const highlighted = this.searchResults.querySelector(".dc-search-item.highlighted");
    if (highlighted) highlighted.scrollIntoView({ block: "nearest" });
  }

  selectSpecies(slotIndex, speciesId) {
    const species = this.opts.species.find(s => s.id === speciesId);
    if (!species) return;
    this.dcSlots[slotIndex] = {
      speciesId,
      species,
      ability: species.abilities[0] || null,
    };
    this.searchPopup.classList.add("hidden");
    this.buildDOM();
  }

  refresh() {
    const team = this.opts.getTeam();
    if (team) {
      for (let i = 0; i < 6; i++) {
        const slot = team.slots[i];
        const baseSp = slot.speciesId
          ? this.opts.species.find(s => s.id === slot.speciesId) ?? null
          : null;
        // Use the active forme (e.g. Mega-Y) for types/ability when set.
        let sp = baseSp;
        if (baseSp && Array.isArray(slot.formes) && slot.formes.length > 0) {
          const idx = slot.activeFormeIndex || 0;
          if (idx > 0 && idx <= slot.formes.length) {
            const active = this.opts.species.find(s => s.id === slot.formes[idx - 1].speciesId);
            if (active) sp = active;
          }
        }
        this.dcSlots[i] = {
          speciesId: sp?.id ?? null,
          species: sp,
          ability: slot.ability ?? (sp?.abilities[0] ?? null),
        };
      }
    }
    this.buildDOM();
  }

  buildTable() {
    let html =
      `<div class="dc-type-table-wrap"><table class="dc-type-table"><colgroup><col class="dc-table-col"><col class="dc-table-col"><col class="dc-table-col"><col class="dc-table-col"><col class="dc-table-col"><col class="dc-table-col"></colgroup><thead><tr><th class="dc-move-type-label">Move<br>Type</th>`;

    for (let i = 0; i < 6; i++) {
      const slot = this.dcSlots[i];
      const sp = slot?.species ?? null;

      if (sp) {
        const spriteFile = this.opts.spriteMap[sp.id];
        const spriteHtml = spriteFile ? `<img class="dc-table-sprite" src="${CHAMPIONS_SPRITE_PATH}/${spriteFile}" alt="${sp.name}">` : "";
        const type1 = sp.types[0] || "";
        const type2 = sp.types[1] || "";
        const typesHtml = `<span class="type-tag ${type1.toLowerCase()}">${type1}</span><span class="type-tag ${type2.toLowerCase()}">${type2}</span>`;
        const abilityValues = sp.abilities;
        const selectedAbilityName = slot?.ability || abilityValues[0] || "";
        const abilityId = selectedAbilityName.toLowerCase().replace(/[^a-z]/g, "");
        const abilityOptions = abilityValues.map(a =>
          `<option value="${a}" ${selectedAbilityName === a ? "selected" : ""}>${a}</option>`
        ).join("");
        const abilityHtml = abilityValues.length > 0
          ? `<select class="dc-table-ability" data-slot-index="${i}">${abilityOptions}</select>`
          : "";

        html += `<th class="dc-table-col-header" data-ability-id="${abilityId}"><div class="dc-table-sprite-wrap"><input class="dc-table-name" type="text" data-slot-index="${i}" value="${sp.baseSpecies ?? sp.name}" placeholder="Add Pokémon…">${spriteHtml}<div class="dc-table-types">${typesHtml}</div><div class="dc-table-ability-wrap">${abilityHtml}</div></div></th>`;
      } else {
        html += `<th class="dc-table-col-header"><div class="dc-table-sprite-wrap"><input class="dc-table-name" type="text" data-slot-index="${i}" placeholder="Add Pokémon…"><img class="dc-table-sprite" src="sprites/champions/empty_slot.png" alt="Empty"><div class="dc-table-types"><span class="type-tag dc-type-empty">EMPTY</span><span class="type-tag dc-type-empty">EMPTY</span></div><div class="dc-table-ability-wrap"></div></div></th>`;
      }
    }

    html += `<th>Weak<br>Total</th><th>Resist<br>Total</th></tr></thead><tbody>`;

    for (const atkType of TYPES) {
      let weak = 0;
      let strong = 0;

      html += `<tr><td><span class="type-tag ${atkType.toLowerCase()}">${atkType}</span></td>`;

      for (let slotIdx = 0; slotIdx < 6; slotIdx++) {
        const slot = this.dcSlots[slotIdx];
        const sp = slot?.species ?? null;
        if (!sp) {
          html += `<td class="matchup-cell">—</td>`;
          continue;
        }
        const slotAbility = slot?.ability;
        const abilityId = slotAbility ? slotAbility.toLowerCase().replace(/[^a-z]/g, "") : undefined;
        const m = getSpeciesDef(sp, atkType, abilityId);
        const cls = m >= 4 ? "x4" : m >= 3 ? "x3" : m >= 2 ? "x2" : m === 1.5 ? "x15" : m === 0 ? "x0" : m <= 0.25 ? "x025" : m <= 0.5 ? "x05" : "x1";
        const label = m >= 4 ? "4×" : m >= 3 ? "3×" : m >= 2 ? "2×" : m === 1.5 ? "1.5×" : m === 0 ? "immune" : m <= 0.25 ? "0.25×" : m <= 0.5 ? "0.5×" : "";
        const isFilter = cls === "x15" || cls === "x3";
        html += `<td class="matchup-cell ${cls}${isFilter ? " atk-" + atkType.toLowerCase() : ""}">${label}</td>`;
        if (m >= 2) weak++;
        if (m <= 0.5) strong++;
      }

      const weakCls = weak >= 1 ? `weak-${weak}` : "";
      const strongCls = strong >= 1 ? `strong-${strong}` : "";
      html += `<td class="matchup-cell ${weakCls}">${weak > 0 ? weak : ""}</td>`;
      html += `<td class="matchup-cell ${strongCls}">${strong > 0 ? strong : ""}</td>`;
      html += `</tr>`;
    }

    html += `</tbody></table></div>`;
    return html;
  }

  destroy() {
    this.abort.abort();
  }
}
import { MoveSearchWidget } from "../move-search-widget.js";
import { PokemonSearchWidget } from "../pokemon-search-widget.js";
import { MOVE_CLASSIFICATIONS, MOVE_EFFECT_CATEGORIES, RANGE_CATEGORIES, ABILITY_EFFECT_CATEGORIES } from "../types.js";
import { CHAMPIONS_SPRITE_PATH_SMALL } from "../sprite-paths.js";

function statBarColor(val) {
  if (val <= 30) return "#c44d4d";
  if (val <= 59) return "#cc9f4a";
  if (val <= 94) return "#e5c531";
  if (val <= 134) return "#5fbb63";
  if (val <= 159) return "#4f8ed4";
  return "#ab6ac8";
}

function getWeightTier(kg) {
  if (kg === null) return "—";
  if (kg <= 9.9) return "20";
  if (kg <= 24.9) return "40";
  if (kg <= 49.9) return "60";
  if (kg <= 99.9) return "80";
  if (kg <= 199.9) return "100";
  return "120";
}

function formatGender(g) {
  if (g === null) return "♂ ♀";
  if (g === "M") return "♂";
  if (g === "F") return "♀";
  return "—";
}

function bpDisplay(m) {
  if (m.category === "Status") return "—";
  if (m.basePower !== 0) return String(m.basePower);
  if (m.name === "Night Shade" || m.name === "Seismic Toss") return "50";
  return "?";
}

function accDisplay(m) {
  if (typeof m.accuracy === "number") return m.accuracy + "%";
  return "—";
}

export class SearchDetailView {
  constructor(opts) {
    this.opts = opts;
    this.detailShiny = false;
    this.detailMovesWidget = null;
    this.moveDetailPokemonWidget = null;
    this.abilityDetailPokemonWidget = null;

    window.addEventListener("potato-team-change", () => this.refreshAddToTeamButton());
  }

  get container() {
    return this.opts.container;
  }

  getTeam() {
    return this.opts.getTeam?.();
  }

  getAllSpecies() {
    return this.opts.getAllSpecies?.() ?? [];
  }

  getSpriteMap() {
    return this.opts.getSpriteMap?.() ?? {};
  }

  getShinySpriteMap() {
    return this.opts.getShinySpriteMap?.() ?? {};
  }

  getFormat() {
    return this.opts.getFormat?.() ?? "m-a";
  }

  destroyChildWidgets() {
    if (this.detailMovesWidget) {
      this.detailMovesWidget.destroy();
      this.detailMovesWidget = null;
    }
    if (this.moveDetailPokemonWidget) {
      this.moveDetailPokemonWidget.destroy();
      this.moveDetailPokemonWidget = null;
    }
    if (this.abilityDetailPokemonWidget) {
      this.abilityDetailPokemonWidget.destroy();
      this.abilityDetailPokemonWidget = null;
    }
  }

  async showPokemonDetail(species) {
    this.destroyChildWidgets();
    this.detailShiny = false;

    const allSpecies = this.getAllSpecies();
    const spriteMap = this.getSpriteMap();
    const shinySpriteMap = this.getShinySpriteMap();

    const bst = Object.values(species.baseStats).reduce((a, b) => a + b, 0);
    const spriteFile = this.detailShiny ? shinySpriteMap[species.id] : spriteMap[species.id];
    const spritePath = this.detailShiny ? "sprites/shiny" : "sprites/champions";

    // Show the base name without the forme suffix. e.g. "Abomasnow-Mega" →
    // name "Abomasnow" + forme display name below. The forme line is always
    // rendered (with &nbsp; when no forme) so the type/meta block sits at
    // a consistent vertical position across all pokemon. Forme display
    // name comes from data/manual-forme-overrides.json (so "Hero" → "Hero
    // Form" rather than the raw forme value).
    const displayName = species.baseSpecies || species.name;
    const formeText = species.formeInfo?.name || "\u00a0";
    const formeHtml = `<div class="detail-forme">${formeText}</div>`;

    // Find all other formes of this pokemon (same base identity). Used
    // to render the formes switcher below the base stats.
    const baseIdentity = species.baseSpecies || species.name;
    const formes = allSpecies.filter((s) => {
      const sBase = s.baseSpecies || s.name;
      return sBase === baseIdentity;
    });
    let formesSectionHtml = "";
    if (formes.length > 1) {
      const formeButtons = formes.map((f) => {
        const isActive = f.id === species.id;
        const formeName = f.formeInfo?.name ?? f.forme ?? "Base";
        const fSprite = spriteMap[f.id];
        const spriteHtml = fSprite
          ? `<img class="forme-sprite" src="${CHAMPIONS_SPRITE_PATH_SMALL}/${fSprite}" alt="${f.name}">`
          : `<div class="forme-sprite forme-sprite-empty"></div>`;
        return `<button class="forme-btn pill-btn${isActive ? " active" : ""}" data-species-id="${f.id}" title="${f.name} — ${formeName}">${spriteHtml}</button>`;
      }).join("");
      formesSectionHtml = `
        <div class="formes-section">
          <div class="formes-label">Formes</div>
          <div class="formes-buttons">${formeButtons}</div>
        </div>`;
    }

    let html = `
      <div class="detail-top">
        <div class="stats-column">
          <div class="stats-block">
            ${
      ["hp", "atk", "def", "spa", "spd", "spe"].map((key) => {
        const val = species.baseStats[key];
        const label = { hp: "HP", atk: "Atk", def: "Def", spa: "SpA", spd: "SpD", spe: "Spe" }[key];
        const barColor = statBarColor(val);
        return `<div class="stat-row"><span class="stat-label">${label}</span><span class="stat-val">${val}</span><span class="stat-bar-track"><span class="stat-bar-fill" style="background-color:${barColor};width:${val}px"></span></span></div>`;
      }).join("\n          ")
    }
            <div class="stat-row stat-bst"><span class="stat-label">BST</span><span class="stat-val">${bst}</span><span class="stat-bar-track"></span></div>
          </div>
          ${formesSectionHtml}
        </div>

        <div class="detail-header-wrap">
          <button class="add-to-team-btn" id="add-to-team-btn">Add to Team</button>
          <div class="detail-header">
            ${
      spriteFile
        ? `<img class="detail-sprite" src="${spritePath}/${spriteFile}" alt="${displayName}" style="cursor:pointer" title="Click to toggle shiny">`
        : ""
    }
            <div>
              <h2>${displayName}</h2>
              ${formeHtml}
              <div class="types">${
      [0, 1].map((i) => {
        const t = species.types[i];
        return `<span class="type-tag${t ? " " + t.toLowerCase() : " type-tag-empty"}">${t || ""}</span>`;
      }).join("")
    }</div>
              <div class="detail-meta">
              <span class="detail-meta-item"><span class="detail-meta-label">Height</span><span class="detail-meta-value">${species.heightm ?? "—"}m</span></span>
              <span class="detail-meta-item"><span class="detail-meta-label">Weight</span><span class="detail-meta-value">${species.weightkg ?? "—"}kg</span></span>
                <span class="detail-meta-item" title="Weight-based Base Damage of Low Kick and Grass Knot"><span class="detail-meta-label">Low Kick</span><span class="detail-meta-value">${getWeightTier(species.weightkg)} BP</span></span>
                <span class="detail-meta-item"><span class="detail-meta-label">Gender</span><span class="detail-meta-value">${formatGender(species.gender)}</span></span>
              </div>
            </div>
          </div>
          <div class="ability-buttons">${species.abilities.map((a) => `<button class="ability-btn">${a}</button>`).join("")}</div>
        </div>
      </div>`;

    html += `<h3 class="detail-moves-heading">Moves</h3>
      <div id="detail-moves-container"></div>`;

    this.container.innerHTML = html;
    this.refreshAddToTeamButton();

    const addBtn = this.container.querySelector("#add-to-team-btn");
    if (addBtn) {
      addBtn.addEventListener("click", () => {
        const team = this.getTeam();
        if (!team) return;

        const baseId = species.baseSpecies
          ? (allSpecies.find((sp) => sp.name === species.baseSpecies)?.id ?? species.id)
          : species.id;
        const inTeamIdx = team.slots.findIndex(
          (slot) =>
            slot.speciesId === species.id ||
            (species.baseSpecies && slot.speciesId === baseId),
        );

        if (inTeamIdx !== -1) {
          this.opts.onRemoveFromTeam?.(species.id);
          this.refreshAddToTeamButton();
        } else {
          this.opts.onAddToTeam?.(species.id);
          this.refreshAddToTeamButton();
        }
      });
    }

    const detailSpriteEl = this.container.querySelector(".detail-sprite");
    if (detailSpriteEl) {
      detailSpriteEl.addEventListener("click", () => {
        this.detailShiny = !this.detailShiny;
        const newPath = this.detailShiny ? "sprites/shiny" : "sprites/champions";
        const newFile = this.detailShiny ? shinySpriteMap[species.id] : spriteMap[species.id];
        detailSpriteEl.src = `${newPath}/${newFile}`;
      });
    }

    // Forme button → switch the detail view in place without touching
    // the breadcrumb trail.
    this.container.querySelectorAll(".forme-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.speciesId;
        const target = allSpecies.find((s) => s.id === id);
        if (target && target.id !== species.id) {
          this.showPokemonDetail(target);
        }
      });
    });

    const { loadAbilities } = this.opts.loadAbilitiesModule ?? {};
    const abilityNames = new Set(species.abilities.filter(Boolean));
    if (abilityNames.size > 0 && loadAbilities) {
      loadAbilities(this.getFormat()).then((allAbilities) => {
        const nameToId = {};
        for (const [id, a] of Object.entries(allAbilities)) nameToId[a.name] = id;
        this.container.querySelectorAll(".ability-btn").forEach((btn) => {
          const name = btn.textContent || "";
          const id = nameToId[name];
          if (id) {
            btn.addEventListener("click", () => {
              const ability = allAbilities[id];
              if (ability) this.opts.detailController?.showAbilityDetail(id, ability);
            });
          }
        });
      });
    }

    const container = this.container.querySelector("#detail-moves-container");
    const speciesNames = {};
    for (const sp of allSpecies) speciesNames[sp.id] = sp.name;
    this.detailMovesWidget = new MoveSearchWidget({
      container,
      formatId: this.getFormat(),
      learnsetSpecies: species.id,
      speciesNames,
      onMoveClick: (moveId, move) => {
        this.opts.detailController?.showMoveDetail(moveId, move);
      },
    });
  }

  showMoveDetail(moveId, move, resetTrail = false) {
    this.destroyChildWidgets();

    const learnedBy = move.learnedBy || [];
    const flagLabels = (move.flags || []).map((f) =>
      MOVE_CLASSIFICATIONS[f] || f
    );
    const effectLabels = (move.effectCategories || []).map((e) =>
      MOVE_EFFECT_CATEGORIES[e] || e
    );
    const rangeLabel = move.range ? (RANGE_CATEGORIES[move.range] || move.range) : "";
    const rangeHtml = rangeLabel
      ? `<div class="move-detail-stat move-detail-stat-range"><span class="move-detail-stat-label">Range</span><span class="move-detail-stat-value">${rangeLabel}</span></div>`
      : "";
    const priorityHtml = move.priority !== 0
      ? `<div class="move-detail-stat"><span class="move-detail-stat-label">Priority</span><span class="move-detail-stat-value">${move.priority > 0 ? "+" + move.priority : move.priority}</span></div>`
      : "";

    const html = `
      <div class="move-detail">
        <div class="move-detail-header">
          <span class="move-detail-name">${move.name}</span>
          <span class="type-tag ${move.type.toLowerCase()}">${move.type}</span>
          <span class="move-entry-cat cat-${move.category.toLowerCase()}"><img class="cat-icon-small" src="sprites/categories/${move.category}_CP.png" alt="${move.category}"></span>
        </div>
        <div class="move-detail-stats">
          <div class="move-detail-stat"><span class="move-detail-stat-label">BP</span><span class="move-detail-stat-value">${bpDisplay(move)}</span></div>
          <div class="move-detail-stat"><span class="move-detail-stat-label">ACC</span><span class="move-detail-stat-value">${accDisplay(move)}</span></div>
          <div class="move-detail-stat"><span class="move-detail-stat-label">PP</span><span class="move-detail-stat-value">${move.pp}</span></div>
          ${rangeHtml}
          ${priorityHtml}
        </div>
        ${
      flagLabels.length > 0 || effectLabels.length > 0
        ? `<div class="move-detail-badges">${
          [...flagLabels, ...effectLabels].map((l) => `<span class="badge">${l}</span>`).join("")
        }</div>`
        : ""
    }
        ${
      move.desc
        ? `<div class="move-detail-desc">${move.desc}</div>`
        : ""
    }
        <div class="move-detail-learned">
          <h3 class="badge-group-label">Learned By (${learnedBy.length})</h3>
          <div id="move-detail-learned-container"></div>
        </div>
      </div>`;

    this.container.innerHTML = html;

    if (learnedBy.length > 0) {
      const container = this.container.querySelector("#move-detail-learned-container");
      const allSpecies = this.getAllSpecies();
      const spriteMap = this.getSpriteMap();
      this.moveDetailPokemonWidget = new PokemonSearchWidget({
        container,
        formatId: this.getFormat(),
        onPokemonClick: (_speciesId, species) => {
          this.opts.detailController?.showPokemonDetail(species);
        },
        species: allSpecies,
        spriteMap,
        learnedByFilter: learnedBy,
      });
    }
  }

  showAbilityDetail(abilityId, ability) {
    this.destroyChildWidgets();

    const effectLabels = (ability.effectCategories || []).map((e) =>
      ABILITY_EFFECT_CATEGORIES[e] || e
    );
    const pokemonIds = ability.pokemon || [];

    const html = `
      <div class="move-detail">
        <div class="move-detail-header">
          <span class="move-detail-name">${ability.name}</span>
        </div>
        ${
      effectLabels.length > 0
        ? `<div class="move-detail-badges">${
          effectLabels.map((l) => `<span class="badge">${l}</span>`).join("")
        }</div>`
        : ""
    }
        <div class="move-detail-desc">${ability.desc}</div>
        <div class="move-detail-learned">
          <h3 class="badge-group-label">Pokémon with ${ability.name} (${pokemonIds.length})</h3>
          <div id="ability-detail-pokemon-container"></div>
        </div>
      </div>`;

    this.container.innerHTML = html;

    if (pokemonIds.length > 0) {
      const container = this.container.querySelector("#ability-detail-pokemon-container");
      const allSpecies = this.getAllSpecies();
      const spriteMap = this.getSpriteMap();
      this.abilityDetailPokemonWidget = new PokemonSearchWidget({
        container,
        formatId: this.getFormat(),
        onPokemonClick: (_speciesId, species) => {
          this.opts.detailController?.showPokemonDetail(species);
        },
        species: allSpecies,
        spriteMap,
        learnedByFilter: pokemonIds,
      });
    }
  }

  showItemDetail(itemId, item) {
    this.destroyChildWidgets();

    const categories = (item.category || []).map((c) =>
      `<span class="badge">${c}</span>`
    ).join("");

    const html = `
      <div class="move-detail">
        <div class="move-detail-header">
          <img class="item-detail-sprite" src="sprites/items/${item.sprite || itemId}.png" alt="${item.name}" onerror="this.style.display='none'">
          <span class="move-detail-name">${item.name}</span>
        </div>
        ${categories ? `<div class="move-detail-badges">${categories}</div>` : ""}
        ${
      item.desc
        ? `<div class="move-detail-desc">${item.desc}</div>`
        : ""
    }
      </div>`;

    this.container.innerHTML = html;
  }

  refreshAddToTeamButton() {
    const btn = this.container.querySelector("#add-to-team-btn");
    if (!btn) return;

    const team = this.getTeam();
    const allSpecies = this.getAllSpecies();

    const detailSpriteEl = this.container.querySelector(".detail-sprite");
    if (!detailSpriteEl) return;

    const src = detailSpriteEl.src;
    const shinyPath = "sprites/shiny/";
    const isShiny = src.includes(shinyPath);
    const spriteMap = isShiny ? this.getShinySpriteMap() : this.getSpriteMap();

    let speciesId = null;
    for (const [id, file] of Object.entries(spriteMap)) {
      if (src.endsWith(file)) {
        speciesId = id;
        break;
      }
    }

    if (!speciesId) return;

    const species = allSpecies.find((s) => s.id === speciesId);
    if (!species) return;

    const baseId = species.baseSpecies
      ? (allSpecies.find((sp) => sp.name === species.baseSpecies)?.id ?? species.id)
      : species.id;

    const isInTeam = team?.slots.some(
      (slot) =>
        slot.speciesId === species.id ||
        (species.baseSpecies && slot.speciesId === baseId),
    ) ?? false;
    const hasEmptySlot = team?.slots.some((slot) => slot.speciesId === null) ?? false;

    if (isInTeam) {
      btn.textContent = "Remove from Team";
      btn.className = "add-to-team-btn remove-from-team";
      btn.disabled = false;
      btn.title = "";
    } else if (!hasEmptySlot) {
      btn.textContent = "Add to Team";
      btn.className = "add-to-team-btn add-to-team";
      btn.disabled = true;
      btn.title = "Team is full";
    } else {
      btn.textContent = "Add to Team";
      btn.className = "add-to-team-btn add-to-team";
      btn.disabled = false;
      btn.title = "";
    }
  }

  destroy() {
    this.destroyChildWidgets();
    this.container.innerHTML = '<div class="placeholder">Click a Pokémon to see details</div>';
    window.removeEventListener("potato-team-change", this.refreshAddToTeamButton);
  }
}
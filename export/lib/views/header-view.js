export class HeaderView {
  constructor({
    headerTeam,
    teamWarning,
    getTeam,
    getSpriteMap,
    getSpeciesById,
    isTeamLegal,
    onNavigateToBuilder,
  }) {
    this.headerTeam = headerTeam;
    this.teamWarning = teamWarning;
    this.getTeam = getTeam;
    this.getSpriteMap = getSpriteMap;
    this.getSpeciesById = getSpeciesById;
    this.isTeamLegal = isTeamLegal;
    this.onNavigateToBuilder = onNavigateToBuilder;

    this._init();
  }

  _init() {
    this.headerTeam.addEventListener("click", () => {
      this.onNavigateToBuilder();
    });
  }

  renderTeamBar() {
    this.headerTeam.innerHTML = "";
    const team = this.getTeam();
    if (!team) {
      this.headerTeam.classList.add("hidden");
      return;
    }
    this.headerTeam.classList.remove("hidden");
    const spriteMap = this.getSpriteMap();

    for (let i = 0; i < 6; i++) {
      const slot = team.slots[i];
      const el = document.createElement("div");
      el.className = "header-slot";

      if (slot.speciesId) {
        const base = this.getSpeciesById(slot.speciesId);
        // Show the active forme (e.g. Mega-Y) instead of the base when
        // a forme is active for this slot.
        let activeId = slot.speciesId;
        if (base && Array.isArray(slot.formes) && slot.formes.length > 0) {
          const idx = slot.activeFormeIndex || 0;
          if (idx > 0 && idx <= slot.formes.length) {
            activeId = slot.formes[idx - 1].speciesId;
          }
        }
        const active = this.getSpeciesById(activeId) || base;
        el.classList.add("filled");
        if (active) {
          const spriteFile = spriteMap[active.id];
          if (spriteFile) {
            const img = document.createElement("img");
            img.className = "header-slot-sprite";
            img.src = `sprites/champions/${spriteFile}`;
            img.alt = active.name;
            el.appendChild(img);
          }
        }
      } else {
        el.classList.add("empty");
      }

      this.headerTeam.appendChild(el);
    }
  }

  renderTeamWarning() {
    const team = this.getTeam();
    if (team && !this.isTeamLegal(team)) {
      this.teamWarning.classList.remove("hidden");
    } else {
      this.teamWarning.classList.add("hidden");
    }
  }

  destroy() {
    this.headerTeam.removeEventListener("click", this._onHeaderTeamClick);
  }
}

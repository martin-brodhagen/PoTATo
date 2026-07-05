export class HeaderView {
  constructor({
    headerTeam,
    getTeam,
    getSpriteMap,
    getSpeciesById,
    isTeamLegal,
    onNavigateToBuilder,
    onCreateTeam,
  }) {
    this.headerTeam = headerTeam;
    this.getTeam = getTeam;
    this.getSpriteMap = getSpriteMap;
    this.getSpeciesById = getSpeciesById;
    this.isTeamLegal = isTeamLegal;
    this.onNavigateToBuilder = onNavigateToBuilder;
    this.onCreateTeam = onCreateTeam;

    this._init();
  }

  _init() {
    this.headerTeam.addEventListener("click", () => {
      if (!this.getTeam() && this.onCreateTeam) this.onCreateTeam();
      this.onNavigateToBuilder();
    });
  }

  renderTeamBar() {
    this.headerTeam.innerHTML = "";
    this.headerTeam.classList.remove("hidden");
    const team = this.getTeam();
    const spriteMap = this.getSpriteMap();

    for (let i = 0; i < 6; i++) {
      const slot = team?.slots[i];
      const el = document.createElement("div");
      el.className = "header-slot";

      if (slot?.speciesId) {
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

  renderTeamLegality() {
    const team = this.getTeam();
    if (team && !this.isTeamLegal(team)) {
      this.headerTeam.classList.add("illegal");
      this.headerTeam.title = "Illegal team — duplicate species or item";
    } else {
      this.headerTeam.classList.remove("illegal");
      this.headerTeam.removeAttribute("title");
    }
  }

  destroy() {
    this.headerTeam.removeEventListener("click", this._onHeaderTeamClick);
  }
}

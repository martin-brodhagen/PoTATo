export class HeaderView {
  constructor({
    container,
    headerTeam,
    teamSelect,
    newTeamBtn,
    teamWarning,
    getTeam,
    getTeams,
    getSpriteMap,
    getSpeciesById,
    isTeamLegal,
    getCurrentFormat,
    onSelectTeam,
    onNewTeam,
    onNavigateToBuilder,
  }) {
    this.container = container;
    this.headerTeam = headerTeam;
    this.teamSelect = teamSelect;
    this.newTeamBtn = newTeamBtn;
    this.teamWarning = teamWarning;
    this.getTeam = getTeam;
    this.getTeams = getTeams;
    this.getSpriteMap = getSpriteMap;
    this.getSpeciesById = getSpeciesById;
    this.isTeamLegal = isTeamLegal;
    this.getCurrentFormat = getCurrentFormat;
    this.onSelectTeam = onSelectTeam;
    this.onNewTeam = onNewTeam;
    this.onNavigateToBuilder = onNavigateToBuilder;

    this._boundListeners = [];

    this._init();
  }

  _init() {
    this.teamSelect.addEventListener("change", () => {
      this.onSelectTeam(this.teamSelect.value);
    });

    this.newTeamBtn.addEventListener("click", () => {
      this.onNewTeam();
    });

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
        const species = this.getSpeciesById(slot.speciesId);
        el.classList.add("filled");
        if (species) {
          const spriteFile = spriteMap[species.id];
          if (spriteFile) {
            const img = document.createElement("img");
            img.className = "header-slot-sprite";
            img.src = `sprites/champions/${spriteFile}`;
            img.alt = species.name;
            el.appendChild(img);
          }
        }
      } else {
        el.classList.add("empty");
      }

      this.headerTeam.appendChild(el);
    }
  }

  renderTeamSelect() {
    const prev = this.teamSelect.value;
    this.teamSelect.innerHTML = "";
    const teams = this.getTeams();
    for (const t of teams) {
      const opt = document.createElement("option");
      opt.value = t.id;
      opt.textContent = t.name;
      this.teamSelect.appendChild(opt);
    }
    if (teams.some((t) => t.id === prev)) {
      this.teamSelect.value = prev;
    } else if (teams.length > 0) {
      this.teamSelect.value = teams[0].id;
    }
    this.renderTeamWarning();
    this.renderTeamBar();
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
    this.teamSelect.removeEventListener("change", this._onTeamSelect);
    this.newTeamBtn.removeEventListener("click", this._onNewTeam);
    this.headerTeam.removeEventListener("click", this._onHeaderTeamClick);
  }
}
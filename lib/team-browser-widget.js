import { loadTeams } from './team-store.js';

const SPRITE_PATH = 'sprites/champions';

export class TeamBrowserWidget {
  constructor(opts) {
    this.opts = opts;
    this.getFormat = opts.getFormat;
    this.getCurrentTeamId = opts.getCurrentTeamId;
    this.getSpriteMap = opts.getSpriteMap;
    this.getSpeciesById = opts.getSpeciesById;
    this.onRenameTeam = opts.onRenameTeam;
    this.onSelectTeam = opts.onSelectTeam;
    this.onDeleteTeam = opts.onDeleteTeam;
    this.onCreateTeam = opts.onCreateTeam;
    this.onDuplicateTeam = opts.onDuplicateTeam;
    this._onFormatChange = () => this.render();
    this._onTeamsChange = () => this.render();
    this._onClick = (e) => {
      if (e.target.closest('[data-action="new-team"]')) {
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
        if (team && this.onDuplicateTeam) this.onDuplicateTeam(team);
        return;
      }
      if (e.target.closest('.tbr-team-name')) return;
      if (e.target.closest('.tbr-action-btn')) return;
      if (e.target.closest('[data-action="import"]')) return;
      if (e.target.closest('[data-action="export"]')) return;
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
    )?.label || globalFormat || "";

    const teamsHtml = teams.length === 0
      ? '<li class="tbr-team-empty">No teams saved for this format</li>'
      : teams.map((t) => this._renderTeamItem(t, t.id === currentTeamId)).join("");

    this.opts.container.innerHTML = `
      <div class="tbr-actions">
        <button type="button" class="tbr-action-btn" data-action="new-team">New Team</button>
        <button type="button" class="tbr-action-btn" data-action="import">Import</button>
      </div>
      <ul class="tbr-team-list">${teamsHtml}</ul>
    `;
  }

  _renderTeamItem(team, isActive = false) {
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
        <span class="tbr-team-format" title="Team format">${this._escapeAttr(this._teamFormatLabel)}</span>
        <input type="text" class="tbr-team-name" value="${this._escapeAttr(team.name)}" placeholder="Team name">
        <button type="button" class="tbr-team-delete" title="Delete team" aria-label="Delete team">×</button>
      </div>
      <div class="tbr-team-slots">
        <div class="tbr-team-slots-grid">${slotsHtml.join('')}</div>
        <div class="tbr-team-actions">
          <button type="button" class="tbr-team-action" data-action="duplicate">Duplicate</button>
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
    this.opts.container.removeEventListener("change", this._onNameChange);
    this.opts.container.removeEventListener("click", this._onClick);
    window.removeEventListener("potato-team-change", this._onTeamsChange);
    window.removeEventListener("potato-format-change", this._onFormatChange);
    this.opts.container.innerHTML = "";
  }
}

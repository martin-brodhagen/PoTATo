export class MoveTypeCoverageWidget {
  constructor(opts) {
    this.opts = opts;
    this.abort = new AbortController();
    this.buildDOM();
  }

  renderTeam() {
    const team = this.opts.getTeam();
    const wrapper = this.opts.container.querySelector('#move-coverage-content');
    const teamList = wrapper.querySelector('.mc-team-list');
    if (!teamList) return;

    teamList.innerHTML = '';
    if (!team) {
      teamList.innerHTML = '<div class="dc-slot-empty">No team selected</div>';
      return;
    }

    for (const slot of team.slots) {
      const speciesId = slot.speciesId;
      const sp = this.opts.species.find(s => s.id === speciesId) || null;

      const row = document.createElement('div');
      row.className = 'dc-team-slot';

      if (!sp) {
        row.innerHTML = '<div class="dc-slot-empty">Empty</div>';
        teamList.appendChild(row);
        continue;
      }

      const spriteFile = this.opts.spriteMap[sp.id];
      const spriteHtml = spriteFile
        ? `<img class="dc-sprite" src="sprites/champions/${spriteFile}" alt="${sp.name}">`
        : '';
      const typesHtml = sp.types.map(t =>
        `<span class="type-tag ${(t || '').toLowerCase()}">${t || ''}</span>`
      ).join('');
      const ability = slot.ability || sp.abilities[0] || '';

      row.innerHTML = `
        <div class="dc-sprite-wrap">${spriteHtml}</div>
        <div class="dc-info">
          <span class="dc-name">${sp.name}</span>
          <span class="dc-ability">${ability}</span>
          <div class="dc-types">${typesHtml}</div>
        </div>
      `;
      teamList.appendChild(row);
    }
  }

  buildDOM() {
    const wrapper = this.opts.container.querySelector('#move-coverage-content');
    wrapper.innerHTML = `
      <div class="mc-layout">
        <div class="mc-team-list"></div>
        <div class="dc-main">
          <div class="placeholder">Move Type Coverage coming soon</div>
        </div>
      </div>
    `;
    this.renderTeam();
  }

  destroy() {
    this.abort.abort();
  }
}
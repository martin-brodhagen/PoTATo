import type { Species } from './types.js';

export interface DefensiveCoverageOptions {
  container: HTMLElement;
  species: Species[];
  spriteMap: Record<string, string>;
  getTeam: () => { slots: { speciesId: string | null; ability?: string | null }[] } | undefined;
}

export class DefensiveCoverageWidget {
  private opts: DefensiveCoverageOptions;
  private abort = new AbortController();

  constructor(opts: DefensiveCoverageOptions) {
    this.opts = opts;
    this.buildDOM();
  }

  private renderTeam() {
    const team = this.opts.getTeam();
    const wrapper = this.opts.container.querySelector('#defensive-coverage-content') as HTMLElement;
    const teamList = wrapper.querySelector('.dc-team-list') as HTMLElement;
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
      const ability = slot.ability || Object.values(sp.abilities)[0] || '';

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

  private buildDOM() {
    const wrapper = this.opts.container.querySelector('#defensive-coverage-content') as HTMLElement;
    wrapper.innerHTML = `
      <div class="dc-layout">
        <div class="dc-team-list"></div>
        <div class="dc-main">
          <div class="placeholder">Select a Pokémon to see its defensive coverage</div>
        </div>
      </div>
    `;
    this.renderTeam();
  }

  destroy() {
    this.abort.abort();
  }
}
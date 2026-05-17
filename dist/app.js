import { setFormat, loadIndex, loadLearnsets, loadMoves } from './lib/data-loader.js';
const formatSelect = document.getElementById('format-select');
const grid = document.getElementById('pokemon-grid');
const overlay = document.getElementById('detail-overlay');
const detailContent = document.getElementById('detail-content');
let currentFormat = 'm-a';
async function loadFormat(format) {
    currentFormat = format;
    setFormat(format);
    grid.innerHTML = '<div class="loading">Loading Pokémon…</div>';
    overlay.classList.add('hidden');
    const index = await loadIndex(format);
    renderGrid(index);
}
function renderGrid(species) {
    grid.innerHTML = '';
    for (const s of species) {
        const card = document.createElement('div');
        card.className = 'pokemon-card';
        card.setAttribute('role', 'listitem');
        const nameEl = document.createElement('div');
        nameEl.className = 'name';
        nameEl.textContent = s.name;
        card.appendChild(nameEl);
        const typesEl = document.createElement('div');
        typesEl.className = 'types';
        for (const t of s.types) {
            const tag = document.createElement('span');
            tag.className = `type-tag ${t.toLowerCase()}`;
            tag.textContent = t;
            typesEl.appendChild(tag);
        }
        card.appendChild(typesEl);
        const bst = Object.values(s.baseStats).reduce((a, b) => a + b, 0);
        const bstEl = document.createElement('div');
        bstEl.className = 'bst';
        const meta = [bst.toString()];
        if (s.requiredItem)
            meta.push(s.requiredItem);
        if (s.moveCount > 0)
            meta.push(`${s.moveCount} moves`);
        bstEl.textContent = meta.join(' · ');
        card.appendChild(bstEl);
        card.addEventListener('click', () => showDetail(s));
        grid.appendChild(card);
    }
}
async function showDetail(s) {
    overlay.classList.remove('hidden');
    const [learnsets, moves] = await Promise.all([
        loadLearnsets(currentFormat),
        loadMoves(currentFormat),
    ]);
    const bst = Object.values(s.baseStats).reduce((a, b) => a + b, 0);
    let html = `
    <button class="close" id="detail-close">&times;</button>
    <h2>${s.name}${s.requiredItem ? ' @ ' + s.requiredItem : ''}</h2>
    <div class="types">${s.types.map(t => `<span class="type-tag ${t.toLowerCase()}">${t}</span>`).join('')}</div>
    <p>BST ${bst} · ${s.moveCount} legal moves</p>
    <div style="margin-top:0.5rem">
      <div class="stat-row"><span class="stat-label">HP</span><span>${s.baseStats.hp}</span></div>
      <div class="stat-row"><span class="stat-label">Atk</span><span>${s.baseStats.atk}</span></div>
      <div class="stat-row"><span class="stat-label">Def</span><span>${s.baseStats.def}</span></div>
      <div class="stat-row"><span class="stat-label">SpA</span><span>${s.baseStats.spa}</span></div>
      <div class="stat-row"><span class="stat-label">SpD</span><span>${s.baseStats.spd}</span></div>
      <div class="stat-row"><span class="stat-label">Spe</span><span>${s.baseStats.spe}</span></div>
    </div>
    <div style="margin-top:0.5rem;font-size:0.85rem;color:#888">
      ${Object.entries(s.abilities).map(([k, v]) => `${k === '0' ? '' : k === 'H' ? 'HA: ' : k + ': '}${v}`).join(' · ')}
    </div>
    <h3 style="margin-top:0.75rem;font-size:0.9rem">Moves (${s.moveCount})</h3>
    <div class="moves-list">`;
    const speciesMoves = learnsets[s.id] || [];
    for (const moveId of speciesMoves) {
        const move = moves[moveId];
        if (!move)
            continue;
        html += `<span class="move-tag" title="${move.shortDesc || ''}">${move.name}</span>`;
    }
    html += `</div>`;
    detailContent.innerHTML = html;
    document.getElementById('detail-close').addEventListener('click', () => {
        overlay.classList.add('hidden');
    });
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay)
            overlay.classList.add('hidden');
    });
}
formatSelect.addEventListener('change', () => {
    loadFormat(formatSelect.value);
});
loadFormat('m-a');
//# sourceMappingURL=app.js.map
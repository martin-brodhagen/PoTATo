"""Generate a custom Mega-only format from Regulation M-A data.

Includes:
- All 60 Mega forms and their 57 base species (Floette base excluded, no data)
- Ditto
- Only damaging moves (Physical + Special categories)
- All items from M-A
"""

import json, os, sys

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")
SRC_FMT = "format-m-a"
DST_FMT = "format-m-mega"

def load_json(path):
    with open(path) as f:
        return json.load(f)

def write_json(path, data, indent=None):
    with open(path, 'w') as f:
        json.dump(data, f, indent=indent, ensure_ascii=False)

def species_name_to_key(name: str) -> str:
    return name.lower().replace('-', '').replace(' ', '').replace("'", '').replace('.', '')

# ── Load source data ──────────────────────────────────────
src_dir = os.path.join(DATA_DIR, SRC_FMT)
index     = load_json(os.path.join(src_dir, "index.json"))
learnsets = load_json(os.path.join(src_dir, "learnsets.json"))
moves     = load_json(os.path.join(src_dir, "moves.json"))
mvls      = load_json(os.path.join(src_dir, "moves-with-learnsets.json"))
items     = load_json(os.path.join(src_dir, "items.json"))
sprite_map = load_json(os.path.join(src_dir, "sprite-map.json"))

# ── Determine included species ────────────────────────────
megas = [s for s in index if s.get('forme') and 'Mega' in s['forme']]
mega_ids = {s['id'] for s in megas}

base_ids = set()
for s in megas:
    bs = s.get('baseSpecies')
    if bs:
        key = species_name_to_key(bs)
        base_ids.add(key)

# Only include base species that actually exist in M-A index
index_ids = {s['id'] for s in index}
existing_bases = base_ids & index_ids

include_ids = mega_ids | existing_bases | {'ditto'}

# ── Build filtered index ──────────────────────────────────
index_out = [s for s in index if s['id'] in include_ids]
# Sort: dex order
index_out.sort(key=lambda s: (s['num'], s['id']))

print(f"Mega forms: {len(mega_ids)}", file=sys.stderr)
print(f"Base species in M-A: {len(existing_bases)}", file=sys.stderr)
print(f"Total species: {len(index_out)}", file=sys.stderr)

# ── Determine damaging move IDs ───────────────────────────
damaging_ids = {mid for mid, m in moves.items()
                if m.get('category') in ('Physical', 'Special')}
print(f"Damaging moves: {len(damaging_ids)}", file=sys.stderr)

# ── Filter learnsets ──────────────────────────────────────
learnset_out = {}
for pid in include_ids:
    raw = learnsets.get(pid, [])
    filtered = [m for m in raw if m in damaging_ids]
    learnset_out[pid] = filtered

# Update moveCount in index
id_to_count = {pid: len(moves) for pid, moves in learnset_out.items()}
for s in index_out:
    s['moveCount'] = id_to_count.get(s['id'], 0)

# ── Filter moves ──────────────────────────────────────────
# Remove moves that no one learns in this format
learned_moves: set[str] = set()
for move_ids in learnset_out.values():
    learned_moves.update(move_ids)

moves_out = {}
for mid in sorted(damaging_ids & learned_moves):
    moves_out[mid] = moves[mid]

# ── Filter moves-with-learnsets ───────────────────────────
mvls_out = {}
# Invert learnset_out
move_to_species: dict[str, list[str]] = {}
for pid, move_ids in learnset_out.items():
    for mid in move_ids:
        if mid not in move_to_species:
            move_to_species[mid] = []
        move_to_species[mid].append(pid)

for mid in sorted(move_to_species):
    mvls_out[mid] = move_to_species[mid]

print(f"Moves output: {len(moves_out)}", file=sys.stderr)
print(f"Moves-with-learnsets: {len(mvls_out)}", file=sys.stderr)
print(f"Items: {len(items)}", file=sys.stderr)

# ── Filter sprite map ─────────────────────────────────────
sprite_map_out = {pid: sprite_map[pid] for pid in include_ids if pid in sprite_map}
print(f"Sprites mapped: {len(sprite_map_out)}", file=sys.stderr)

# ── Write output ──────────────────────────────────────────
dst_dir = os.path.join(DATA_DIR, DST_FMT)
os.makedirs(dst_dir, exist_ok=True)

write_json(os.path.join(dst_dir, "index.json"), index_out, indent=1)
write_json(os.path.join(dst_dir, "moves.json"), moves_out, indent=1)
write_json(os.path.join(dst_dir, "moves-with-learnsets.json"), mvls_out, indent=1)
write_json(os.path.join(dst_dir, "learnsets.json"), learnset_out)
write_json(os.path.join(dst_dir, "items.json"), items)
write_json(os.path.join(dst_dir, "sprite-map.json"), sprite_map_out, indent=1)

print(f"\nDone! Written to {dst_dir}/", file=sys.stderr)

"""Build sprite-map.json: species ID → sprite filename mapping.

Reads index.json and the downloaded sprite filenames, then creates
a mapping from each species ID (e.g. "venusaurmega") to its
Bulbagarden Champions menu sprite filename.
"""

import json, os, re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
INDEX = ROOT / "data" / "base" / "pokedex.json"
SPRITE_DIR = ROOT / "sprites" / "champions"
OUT = ROOT / "data" / "base" / "sprite-map.json"

# Load index
with open(INDEX) as f:
    index = json.load(f)

# Group index entries by dex number
by_num: dict[int, list[dict]] = {}
for entry in index:
    num = entry.get("num")
    if num is None:
        continue
    by_num.setdefault(num, []).append(entry)

# Load available sprite filenames
sprite_files = set(f.name for f in SPRITE_DIR.glob("*.png"))

# Mapping from species ID to sprite filename
sprite_map: dict[str, str] = {}

# Build lookup: (dex_number, form_suffix) → filename
num_form_to_file: dict[tuple[int, str | None], str] = {}
for fname in sprite_files:
    # Parse "Menu_CP_0003-Mega.png" → (3, "Mega") or "Menu_CP_0003.png" → (3, None)
    m = re.match(r"Menu_CP_(\d{4})(?:-(.+))?\.png$", fname)
    if m:
        num = int(m.group(1))
        form = m.group(2) or None
        num_form_to_file[(num, form)] = fname

# Known form mappings: (our_id_pattern, bulbagarden_suffix)
# We match our species IDs (which are lowercase merged) against these patterns
FORM_MAP: list[tuple[re.Pattern, str]] = [
    # Order matters: more specific first
    (re.compile(r"^(\w+)megax$"),    "Mega_X"),
    (re.compile(r"^(\w+)megay$"),    "Mega_Y"),
    (re.compile(r"^(\w+)alola$"),    "Alola"),
    (re.compile(r"^(\w+)galar$"),    "Galar"),
    (re.compile(r"^(\w+)hisui$"),    "Hisui"),
    (re.compile(r"^(\w+)mega$"),     "Mega"),
    (re.compile(r"^(\w+)eternal$"),  "Eternal"),
    (re.compile(r"^(\w+)blade$"),    "Blade"),
    (re.compile(r"^(\w+)female$"),   "Female"),
    (re.compile(r"^(\w+)hero$"),     "Hero"),
    (re.compile(r"^(\w+)hangry$"),   "Hangry"),
    (re.compile(r"^(\w+)dusk$"),     "Dusk"),
    (re.compile(r"^(\w+)midnight$"), "Midnight"),
    (re.compile(r"^(\w+)large$"),    "Large"),
    (re.compile(r"^(\w+)small$"),    "Small"),
    (re.compile(r"^(\w+)super$"),    "Jumbo"),
    (re.compile(r"^(\w+)three$"),    "Three"),
    # Rotom appliances
    (re.compile(r"^(\w+)heat$"),     "Heat"),
    (re.compile(r"^(\w+)wash$"),     "Wash"),
    (re.compile(r"^(\w+)frost$"),    "Frost"),
    (re.compile(r"^(\w+)fan$"),      "Fan"),
    (re.compile(r"^(\w+)mow$"),      "Mow"),
    # Tauros Paldean
    (re.compile(r"^(\w+)paldeacombat$"), "Paldea_Combat"),
    (re.compile(r"^(\w+)paldeablaze$"),  "Paldea_Blaze"),
    (re.compile(r"^(\w+)paldeaaqua$"),   "Paldea_Aqua"),
    # Basculin
    (re.compile(r"^(\w+)f$"),       "Female"),
    # Vivillon - the actual sprite filenames have patterns but we skip those
    # Alcremie - similarly complex patterns
    # Furfrou - complex patterns (Dandy, Debutante, etc.)
    # Indeedee, Meowstic, Oinkologne - female forms
    (re.compile(r"^indeedee$"), None),  # skip indeedee-female, just use base
    (re.compile(r"^meowstic$"), None),  # skip meowstic-female
]

def find_sprite(species_id: str, dex_num: int) -> str | None:
    """Find sprite filename for a given species."""

    # 1. Try direct base form lookup first
    base_file = num_form_to_file.get((dex_num, None))
    if base_file and species_id == [e["id"] for e in by_num.get(dex_num, []) if e["id"] == species_id][0:1]:
        pass  # will check below

    # Find which form suffix this species ID maps to
    for pattern, suffix in FORM_MAP:
        m = pattern.match(species_id)
        if m:
            if suffix is None:
                # This is a base form that might also have a Female variant
                file = num_form_to_file.get((dex_num, None))
                if file:
                    return file
                # If no base form, try with no suffix
                return None
            file = num_form_to_file.get((dex_num, suffix))
            # Also try spaces (e.g. "Paldea_Aqua" vs "Paldea Aqua")
            if not file and " " not in suffix:
                file = num_form_to_file.get((dex_num, suffix.replace("_", " ")))
            if not file and "_" in suffix:
                file = num_form_to_file.get((dex_num, suffix.replace("_", " ")))
            return file

    # 2. Check for exact match in the base form
    file = num_form_to_file.get((dex_num, None))
    if file:
        return file

    return None

# Build the mapping
for entry in index:
    sid = entry["id"]
    num = entry["num"]

    # Try the pattern matcher
    file = find_sprite(sid, num)

    # Fallback: any file for this dex number
    if not file:
        # Try matching by form name from the entry
        forme = entry.get("forme", "")
        if forme:
            # Convert forme to Bulbagarden style
            bg_form = forme.replace("Mega ", "Mega_").replace(" ", "_")
            file = num_form_to_file.get((num, bg_form))
            if not file and bg_form.endswith("_X"):
                file = num_form_to_file.get((num, "Mega_X"))
            elif not file and bg_form.endswith("_Y"):
                file = num_form_to_file.get((num, "Mega_Y"))

    if not file:
        # Last resort: grab any file for this dex number
        for (n, f), fn in num_form_to_file.items():
            if n == num:
                file = fn
                break

    if file:
        sprite_map[sid] = file
    else:
        print(f"WARNING: no sprite for {sid} (#{num})", file=sys.stderr)

# Special cases: handle Meowstic-Female, Indeedee-Female etc. 
# These use the base sprite (no separate file)

# Write output
with open(OUT, "w") as f:
    json.dump(sprite_map, f, indent=1)

print(f"Wrote {OUT}", file=sys.stderr)
print(f"  {len(sprite_map)}/{len(index)} species mapped", file=sys.stderr)
missing = [e["id"] for e in index if e["id"] not in sprite_map]
if missing:
    print(f"  Missing: {', '.join(missing)}", file=sys.stderr)

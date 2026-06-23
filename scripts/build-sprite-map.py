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
    # Indeedee, Meowstic, Oinkologne - female forms
    (re.compile(r"^indeedee$"), None),  # skip indeedee-female, just use base
    (re.compile(r"^meowstic$"), None),  # skip meowstic-female
    # Cosmetic / combat-switch formes with sprite-specific file naming
    # inconsistencies. The form-specific lookup below handles most cases
    # via `entry.forme`; these patterns catch the rest.
]

# Special cases: forme value → sprite form suffix override. Used when the
# forme value (as listed in upstream pokedex.json) does not match the
# sprite file naming by simple space/dash replacement.
FORME_SPRITE_OVERRIDES = {
    # Vivillon-Pokeball: forme='Pokeball' but sprite is 'Poke_Ball.png'
    "Pokeball": "Poke_Ball",
}


# Special cases: species id → (dex_number, form_suffix) override. Used
# when the sprite file naming doesn't match the convention (e.g. the
# "base" form is named after a forme in the sprite directory, and the
# unnamed sprite belongs to a different forme).
SPECIES_SPRITE_OVERRIDES: dict[str, tuple[int, str | None]] = {
    # Maushold: in Bulbagarden's Champions sprite set, the unnamed
    # `Menu_CP_0925.png` is the Family of Four variant, while the
    # three-segment base is `Menu_CP_0925-Three.png`. Showdown lists
    # the Three form as the base (baseForme: "Three"), so swap them.
    "maushold": (925, "Three"),
    "mausholdfour": (925, None),
}


def forme_to_sprite_form(forme: str) -> str:
    """Convert a forme value to a Bulbagarden sprite form suffix.

    The sprite filenames use underscores for spaces/dashes (e.g.
    'Menu_CP_0666-High_Plains.png'). Most formes match this rule
    directly; see FORME_SPRITE_OVERRIDES for the exceptions.
    """
    if forme in FORME_SPRITE_OVERRIDES:
        return FORME_SPRITE_OVERRIDES[forme]
    return forme.replace(" ", "_").replace("-", "_")


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
    file = None

    # 0. Try the species-specific override (e.g. Maushold's swapped
    # base/forme sprites — see SPECIES_SPRITE_OVERRIDES).
    override = SPECIES_SPRITE_OVERRIDES.get(sid)
    if override is not None:
        file = num_form_to_file.get(override)

    # 1. Try the form-specific sprite first, using entry.forme to derive
    # the sprite suffix. This is how the cosmetic recolors (Florges
    # colors, Furfrou trims, Alcremie flavors, Vivillon patterns, ...)
    # and the per-form combat-switch sprites (Castform weather,
    # Aegislash Blade, Lycanroc Dusk/Midnight, etc.) are picked up
    # when they have a form-specific sprite file.
    forme = entry.get("forme", "")
    if forme:
        sprite_form = forme_to_sprite_form(forme)
        file = num_form_to_file.get((num, sprite_form))
        if not file and sprite_form.endswith("_X"):
            file = num_form_to_file.get((num, "Mega_X"))
        elif not file and sprite_form.endswith("_Y"):
            file = num_form_to_file.get((num, "Mega_Y"))

    # 2. Try the pattern matcher (handles Mega / Alola / Hisui / ... forms
    # whose sprite id pattern doesn't match `entry.forme` exactly).
    if not file:
        file = find_sprite(sid, num)

    # 3. Last resort: grab any file for this dex number.
    if not file:
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

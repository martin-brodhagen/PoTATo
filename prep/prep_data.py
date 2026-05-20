"""Pre-process Pokémon data for PoTATo.

1. Fetch base JSON from play.pokemonshowdown.com/data/
2. Fetch mod TS overrides from GitHub
3. Fetch Regulation M-A whitelist from GitHub formats-data
4. Merge base + mod → format-specific JSON files
"""

import json, re, urllib.request, os, sys, time

SHOWDOWN = "https://play.pokemonshowdown.com/data"
GITHUB_RAW = "https://raw.githubusercontent.com/smogon/pokemon-showdown/master"
MOD_DIR = f"{GITHUB_RAW}/data/mods/champions"
OUT = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")

FETCH_CACHE = {}

def fetch(url, cache=True):
    if cache and url in FETCH_CACHE:
        return FETCH_CACHE[url]
    print(f"  fetching {url}", file=sys.stderr)
    req = urllib.request.Request(url, headers={"User-Agent": "PoTATo/0.1"})
    data = urllib.request.urlopen(req, timeout=30).read()
    if cache:
        FETCH_CACHE[url] = data
    return data

def fetch_json(url):
    return json.loads(fetch(url))

def fetch_text(url):
    return fetch(url).decode("utf-8")

# ---------------------------------------------------------------------------
# 1. Fetch base data
# ---------------------------------------------------------------------------
print("Fetching base data from Showdown...", file=sys.stderr)
pokedex   = fetch_json(f"{SHOWDOWN}/pokedex.json")
moves_raw = fetch_json(f"{SHOWDOWN}/moves.json")

# learnsets is huge; only pull when needed
print("Fetching learnsets...", file=sys.stderr)
learnsets = fetch_json(f"{SHOWDOWN}/learnsets.json")

def fetch_js_data(url):
    """Parse a Showdown .js data file like items.js into a Python dict.
    Format: exports.BattleItems = {key:{...},key:{...},...};"""
    text = fetch_text(url)
    # Strip exports.Xxx = prefix and trailing ;
    text = re.sub(r'^exports\.\w+\s*=\s*', '', text)
    text = text.rstrip().rstrip(';').strip()
    # Quote unquoted JS object keys
    text = re.sub(r'(?<=[{,])\s*([a-zA-Z_$][a-zA-Z0-9_$]*)(?=\s*:)', r'"\1"', text)
    # Replace JS true/false/null
    text = re.sub(r':\s*true(?=[,}])', ':true', text)
    text = re.sub(r':\s*false(?=[,}])', ':false', text)
    text = re.sub(r':\s*null(?=[,}])', ':null', text)
    return json.loads(text)

items_raw = fetch_js_data(f"{SHOWDOWN}/items.js")

# ---------------------------------------------------------------------------
# 2. Fetch overrides from mod files
# ---------------------------------------------------------------------------
print("Fetching Champions mod overrides...", file=sys.stderr)

def _skip_string(text, i):
    """Skip past a string literal at position i (i points to the opening quote).
    Handles backslash escapes. Returns new position (past closing quote)."""
    quote = text[i]
    i += 1
    while i < len(text):
        if text[i] == '\\':
            i += 2
            continue
        if text[i] == quote:
            return i + 1
        i += 1
    return i

def _skip_line_comment(text, i):
    """Skip past a // comment starting at position i."""
    end = text.find('\n', i)
    return len(text) if end == -1 else end + 1

def _find_brace_end(text, start):
    """Find matching closing brace from position start (which is after '{').
    Returns position past the matching '}'. Handles strings, comments, nested braces."""
    depth = 1
    i = start
    while i < len(text) and depth > 0:
        c = text[i]
        if c == '"' or c == "'":
            i = _skip_string(text, i)
        elif c == '/' and i + 1 < len(text) and text[i + 1] == '/':
            i = _skip_line_comment(text, i)
        elif c == '{':
            depth += 1
            i += 1
        elif c == '}':
            depth -= 1
            i += 1
        else:
            i += 1
    return i

def _parse_ts_value(text):
    """Parse a single TS value. Returns Python value."""
    text = text.strip()
    if not text:
        return None
    
    if text[0] == '{':
        end = _find_brace_end(text, 1)
        inner = text[1:end - 1]
        return _parse_ts_obj(inner)
    
    if text[0] == '[':
        depth = 1
        i = 1
        while i < len(text) and depth > 0:
            c = text[i]
            if c == '"' or c == "'":
                i = _skip_string(text, i)
            elif c == '/':
                if i + 1 < len(text) and text[i + 1] == '/':
                    i = _skip_line_comment(text, i)
                else:
                    i += 1
            elif c == '[':
                depth += 1
                i += 1
            elif c == ']':
                depth -= 1
                i += 1
            else:
                i += 1
        inner = text[1:i - 1]
        items = _split_top_level(inner, ',')
        return [_parse_ts_value(item) for item in items if item.strip()]
    
    # Scalars
    text_stripped = text.rstrip(',')
    if text_stripped == 'true':
        return True
    if text_stripped == 'false':
        return False
    if text_stripped in ('null', 'undefined'):
        return None
    
    if text_stripped.startswith('"') or text_stripped.startswith("'"):
        raw = text_stripped[1:]
        result = []
        quote = text_stripped[0]
        i = 0
        while i < len(raw) and raw[i] != quote:
            if raw[i] == '\\':
                i += 1
                if i < len(raw):
                    result.append(raw[i])
                    i += 1
            else:
                result.append(raw[i])
                i += 1
        return ''.join(result)
    
    try:
        if '.' in text_stripped:
            return float(text_stripped)
        return int(text_stripped)
    except ValueError:
        pass
    
    # Identifier (function name, enum, etc.) — discard by returning None
    return None

def _split_top_level(text, sep=','):
    """Split text by separator, respecting braces, brackets, strings, and // comments."""
    parts = []
    depth_brace = 0
    depth_bracket = 0
    start = 0
    i = 0
    while i < len(text):
        c = text[i]
        if c == '"' or c == "'":
            i = _skip_string(text, i)
        elif c == '/':
            if i + 1 < len(text) and text[i + 1] == '/':
                i = _skip_line_comment(text, i)
            else:
                i += 1
        elif c == '{':
            depth_brace += 1
            i += 1
        elif c == '}':
            depth_brace -= 1
            i += 1
        elif c == '[':
            depth_bracket += 1
            i += 1
        elif c == ']':
            depth_bracket -= 1
            i += 1
        elif c == sep and depth_brace == 0 and depth_bracket == 0:
            parts.append(text[start:i])
            start = i + 1
            i += 1
        else:
            i += 1
    remaining = text[start:].strip()
    if remaining:
        parts.append(remaining)
    return parts

def _parse_ts_obj(text):
    """Parse key: value pairs from a TS object body (no outer braces)."""
    props = {}
    entries = _split_top_level(text, ',')
    for entry in entries:
        entry = entry.strip()
        if not entry or entry.startswith('//'):
            continue
        m = re.match(r'([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:\s*', entry)
        if not m:
            continue
        key = m.group(1)
        if key == 'inherit':
            continue
        val_text = entry[m.end():]
        val = _parse_ts_value(val_text)
        props[key] = val
    return props

def parse_ts_overrides(url):
    """Parse a TypeScript file with {inherit:true} entries.
    
    Uses brace-depth matching to correctly handle nested objects, arrays,
    strings with escapes, and single-line comments.
    
    Returns a dict of key → {prop: value}
    """
    text = fetch_text(url)
    # Remove the `export const ... = {` wrapper
    m = re.search(r'=\s*\{', text)
    if m:
        text = text[m.end():]
    # Remove trailing `};` and anything after
    text = re.sub(r'\}\s*;\s*$', '', text.rstrip())
    text = re.sub(r'\}\s*$', '', text.rstrip())
    
    result = {}
    pos = 0
    while pos < len(text):
        m = re.compile(r'\s*([a-z0-9_]+)\s*:\s*\{').search(text, pos)
        if not m:
            break
        key = m.group(1)
        body_start = m.end()
        end = _find_brace_end(text, body_start)
        body_raw = text[body_start:end - 1]
        result[key] = _parse_ts_obj(body_raw)
        pos = end
        # Skip trailing whitespace/comma
        while pos < len(text) and text[pos] in ' \t\n\r,':
            pos += 1
    return result

move_overrides = parse_ts_overrides(f"{MOD_DIR}/moves.ts")
item_overrides = parse_ts_overrides(f"{MOD_DIR}/items.ts")
ability_overrides = parse_ts_overrides(f"{MOD_DIR}/abilities.ts")
mod_formats_data = parse_ts_overrides(f"{MOD_DIR}/formats-data.ts")

def parse_learnsets_ts(url):
    """Parse a nested learnset file where entries have {learnset:{move:[sources]}} structure.
    
    Strategy: count brace depth rather than using non-greedy regex.
    """
    text = fetch_text(url)
    # Strip export wrapper
    m = re.search(r'=\s*\{', text)
    if m:
        text = text[m.end():]
    text = re.sub(r'\}\s*;\s*$', '', text.rstrip())
    
    result = {}
    pos = 0
    while pos < len(text):
        m = re.compile(r'\s*([a-z0-9_]+)\s*:\s*\{').search(text, pos)
        if not m:
            break
        key = m.group(1)
        pos = m.end()
        # Find matching closing brace for outer block
        depth = 1
        while pos < len(text) and depth > 0:
            if text[pos] == '{':
                depth += 1
            elif text[pos] == '}':
                depth -= 1
            pos += 1
        body = text[m.end():pos-1]
        
        # Extract learnset: { ... } from body
        lsm = re.search(r'learnset\s*:\s*\{', body)
        if lsm:
            ls_start = lsm.end()
            ls_pos, ls_depth = ls_start, 1
            while ls_pos < len(body) and ls_depth > 0:
                if body[ls_pos] == '{':
                    ls_depth += 1
                elif body[ls_pos] == '}':
                    ls_depth -= 1
                ls_pos += 1
            ls_body = body[ls_start:ls_pos-1]
            learnset = {}
            for line in ls_body.split('\n'):
                line = line.strip()
                if not line or line.startswith('//'):
                    continue
                pm = re.compile(r'''([a-z0-9_]+)\s*:\s*(\[.*?\])\s*,?\s*$''').match(line)
                if pm:
                    move, val = pm.group(1), pm.group(2)
                    try:
                        learnset[move] = json.loads(val)
                    except json.JSONDecodeError:
                        learnset[move] = val
            result[key] = {"learnset": learnset}
        
        # Skip trailing whitespace/comma
        while pos < len(text) and text[pos] in ' \t\n\r,':
            pos += 1
    return result

mod_learnsets = parse_learnsets_ts(f"{MOD_DIR}/learnsets.ts")

# ---------------------------------------------------------------------------
# 3. Apply overrides to base data
# ---------------------------------------------------------------------------
print("Applying overrides...", file=sys.stderr)

def _apply_overrides(base: dict, overrides: dict) -> None:
    """Apply overrides dict to base, deleting keys for None values (TS null/undefined)."""
    for k, v in overrides.items():
        if v is None:
            base.pop(k, None)
        else:
            base[k] = v

moves = dict(moves_raw)
for mid, overrides in move_overrides.items():
    if mid in moves:
        _apply_overrides(moves[mid], overrides)
    else:
        print(f"  WARNING: move {mid} not in base data", file=sys.stderr)

items = dict(items_raw)
for iid, overrides in item_overrides.items():
    if iid in items:
        _apply_overrides(items[iid], overrides)

abilities = {}  # We'll extract from pokedex data later

# ---------------------------------------------------------------------------
# 4. Determine M-A legal species: mod data + corrected whitelist
# ---------------------------------------------------------------------------
print("Determining legal species...", file=sys.stderr)

# Champions legality: mod's formats-data.ts assigns tiers
#   tier: "Illegal" → unavailable in Champions
#   tier: "UU" / "OU" / "Uber" / "NFE" / "(OU)" etc → available
champions_legal: set[str] = set()
for pid, entry in mod_formats_data.items():
    tier = entry.get('tier', '')
    if tier != "Illegal":
        if pid in pokedex:
            champions_legal.add(pid)
        else:
            print(f"  WARNING: {pid} in mod data but not in base pokedex", file=sys.stderr)

# M-A whitelist: Regulation M-A specific species (subset of Champions)
# Fixed version of previously curated list — removed patrat/floette (base),
# added arcaninehisui, ninetalesalola, meowsticf
MA_SPECIES_NONMEGA: set[str] = {
    "abomasnow","absol","aegislash","aerodactyl","aggron","alakazam","alcremie",
    "altaria","ampharos","appletun","araquanid","arbok","arcanine","arcaninehisui",
    "archaludon","ariados","armarouge","aromatisse","audino","aurorus","avalugg","avalugghisui",
    "azumarill","banette","basculegion","basculegionf","bastiodon","beartic","beedrill","bellibolt","blastoise",
    "camerupt","castform","ceruledge","chandelure","charizard","chesnaught","chimecho",
    "clawitzer","clefable","cofagrigus","conkeldurr","corviknight","crabominable",
    "decidueye","decidueyehisui","dedenne","delphox","diggersby","ditto","dragapult","dragonite",
    "drampa","emboar","emolga","empoleon","espathra","espeon","excadrill","farigiraf",
    "feraligatr","flapple","flareon","floetteeternal","florges","forretress","froslass",
    "furfrou","gallade","garbodor","garchomp","gardevoir","garganacl","gengar",
    "glaceon","glalie","glimmora","gliscor","golurk","goodra","goodrahisui","gourgeist","gourgeistlarge","gourgeistsmall","gourgeistsuper","greninja",
    "gyarados","hatterene","hawlucha","heliolisk","heracross","hippowdon","houndoom",
    "hydrapple","hydreigon","incineroar","infernape","jolteon","kangaskhan","kingambit",
    "kleavor","klefki","kommoo","krookodile","leafeon","liepard","lopunny","lucario",
    "luxray","lycanroc","lycanrocdusk","lycanrocmidnight","machamp","mamoswine","manectric","maushold","medicham",
    "meganium","meowscarada","meowstic","meowsticf","milotic","mimikyu","morpeko","mrrime",
    "mudsdale","ninetales","ninetalesalola","noivern","oranguru","orthworm","palafin","pangoro",
    "passimian","pelipper","pidgeot","pikachu","pinsir","politoed",
    "polteageist","primarina","quaquaval","raichu","raichualola","rampardos","reuniclus","rhyperior",
    "roserade","rotom","runerigus","sableye","salazzle","samurott","samurotthisui","sandaconda",
    "scizor","scovillain","serperior","sharpedo","simipour","simisage","simisear",
    "sinistcha","skarmory","skeledirge","slowbro","slowbrogalar","slowking","slowkinggalar","slurpuff","sneasler",
    "snorlax","spiritomb","starmie","steelix","stunfisk","stunfiskgalar","sylveon","talonflame",
    "tauros","taurospaldeacombat","taurospaldeablaze","taurospaldeaaqua","tinkaton","torkoal","torterra","toucannon","toxapex","toxicroak",
    "trevenant","tsareena","typhlosion","typhlosionhisui","tyranitar","tyrantrum","umbreon",
    "vanilluxe","vaporeon","venusaur","victreebel","vivillon","volcarona","watchog","weavile",
    "whimsicott","wyrdeer","zoroark","zoroarkhisui",
    # Rotom appliances
    "rotomheat","rotomwash","rotomfrost","rotomfan","rotommow",
}

MA_SPECIES_MEGA: set[str] = {
    "venusaurmega","charizardmegax","charizardmegay","blastoisemega",
    "beedrillmega","pidgeotmega","clefablemega","alakazammega",
    "victreebelmega","slowbromega","gengarmega","kangaskhanmega",
    "starmiemega","pinsirmega","gyaradosmega","aerodactylmega",
    "dragonitemega","meganiummega","feraligatrmega","ampharosmega",
    "steelixmega","scizormega","heracrossmega","skarmorymega",
    "houndoommega","tyranitarmega","gardevoirmega","sableyemega",
    "aggronmega","medichammega","manectricmega","sharpedomega",
    "cameruptmega","altariamega","banettemega","chimechomega",
    "absolmega","glaliemega","lopunnymega","garchompmega",
    "lucariomega","abomasnowmega","gallademega","froslassmega",
    "emboarmega","excadrillmega","audinomega","chandeluremega",
    "golurkmega","chesnaughtmega","delphoxmega","greninjamega",
    "floettemega","meowsticfmega","meowsticmmega","hawluchamega","crabominablemega",
    "drampamega","scovillainmega","glimmoramega",
}

# M-A overrides: species legal in M-A but NOT in Champions mod data
MA_OVERRIDES: set[str] = {
    "meowsticf",  # Meowstic-F: standard SV gender form, no mod entry
}

# Build final M-A set: whitelist ∩ Champions-legal, plus overrides
all_legal_ids = (MA_SPECIES_NONMEGA | MA_SPECIES_MEGA | MA_OVERRIDES) & champions_legal | MA_OVERRIDES

# Validate: warn about whitelist species not in Champions mod data (may indicate outdated whitelist)
for pid in sorted(MA_SPECIES_NONMEGA | MA_SPECIES_MEGA):
    if pid not in champions_legal:
        print(f"  NOTE: whitelist species {pid} not in Champions mod data", file=sys.stderr)

# Validate: warn about Champions species not in M-A whitelist (potential omissions)
whitelist_all = MA_SPECIES_NONMEGA | MA_SPECIES_MEGA
for pid in sorted(champions_legal):
    if pid not in whitelist_all:
        print(f"  NOTE: mod species {pid} not in M-A whitelist", file=sys.stderr)

mega_count = sum(1 for p in all_legal_ids if 'Mega' in (pokedex.get(p, {}).get('forme') or ''))
print(f"  {len(all_legal_ids)} total species ({len(all_legal_ids) - mega_count} non-Mega, {mega_count} Mega)", file=sys.stderr)

# ---------------------------------------------------------------------------
# 5. Determine legal moves from isNonstandard field
#     Include: isNonstandard is None/unset, "", or "Custom"
#     Exclude: "Past", "Unobtainable", "CAP", "LGPE", "Gigantamax", "Future"
# ---------------------------------------------------------------------------
print("Determining legal moves...", file=sys.stderr)
legal_moves: set[str] = set()
excluded_ns = {'Past', 'Unobtainable', 'CAP', 'LGPE', 'Gigantamax', 'Future'}
for mid, entry in moves.items():
    ns = entry.get('isNonstandard')
    if ns is None or ns == '' or ns == 'Custom':
        legal_moves.add(mid)
    elif ns in excluded_ns:
        pass  # intentionally excluded
    else:
        print(f"  NOTE: {mid} has unknown isNonstandard={ns!r}", file=sys.stderr)
print(f"  {len(legal_moves)} legal moves", file=sys.stderr)

# ---------------------------------------------------------------------------
# 6. Filter learnsets to M-A Pokémon × M-A moves
# ---------------------------------------------------------------------------
print("Filtering learnsets...", file=sys.stderr)

# Merge Champions mod learnsets on top of base Showdown data
# Mod entries fully replace base entries for covered species
merged_learnsets = dict(learnsets)
merged_learnsets.update(mod_learnsets)

def species_name_to_key(name: str) -> str:
    return name.lower().replace('-', '').replace(' ', '').replace("'", '').replace('.', '')

learnset_out: dict[str, list[str]] = {}
for pid in all_legal_ids:
    ls: dict[str, list[str]] = {}

    # 1. Try direct learnset lookup by pid (checks merged: mod first, then base)
    if pid in merged_learnsets:
        ls = merged_learnsets[pid].get('learnset', {})
    else:
        entry = pokedex.get(pid, {})
        base_source = None

        # 2a. battleOnly: some forms (e.g. floettemega) can only be obtained
        # by transforming from another species in battle — inherit from that
        bo = entry.get('battleOnly', '')
        if bo:
            if isinstance(bo, list):
                bo = bo[0]
            base_source = species_name_to_key(bo)

        # 2b. baseSpecies inheritance (handles regionals, size variants, megas)
        if not base_source:
            bs = entry.get('baseSpecies', '')
            if bs:
                base_source = species_name_to_key(bs)

        if base_source and base_source in merged_learnsets:
            ls = merged_learnsets[base_source].get('learnset', {})

        # 3. Gender-specific override: for megas with a gender marker in the
        # form name (e.g. meowsticfmega), prefer the gender-specific base.
        # Only triggers when direct_base is MORE specific than current source
        # (e.g. "meowsticf" starts with "meowstic"; "floette" does NOT start
        # with "floetteeternal" so it won't override the battleOnly source).
        if pid.endswith('mega'):
            direct_base = re.sub(r'megax$|megay$|mega$', '', pid)
            if direct_base in merged_learnsets and base_source and direct_base.startswith(base_source):
                ls = merged_learnsets[direct_base].get('learnset', {})

        # 4. Fallback: strip suffixes for megas (if no baseSpecies match)
        if not ls and pid.endswith('mega'):
            for suffix in ('megax', 'megay', 'mega'):
                base_key = pid.replace(suffix, '')
                if base_key in merged_learnsets:
                    ls = merged_learnsets[base_key].get('learnset', {})
                    break

    filtered = {move: sources for move, sources in ls.items() if move in legal_moves}
    if filtered:
        learnset_out[pid] = sorted(filtered.keys())
    else:
        learnset_out[pid] = []

# ---------------------------------------------------------------------------
# 7. Build index.json (quick-lookup list for the browser)
# ---------------------------------------------------------------------------
print("Building index...", file=sys.stderr)

index = []
for pid in sorted(all_legal_ids):
    entry = pokedex.get(pid)
    if not entry:
        continue

    forme = entry.get('forme', '')
    required_item = entry.get('requiredItem', None)
    base_species = entry.get('baseSpecies', entry.get('name', ''))

    # Normalize abilities to always include 0 and H at minimum
    abilities = dict(entry.get('abilities', {}))

    obj = {
        "id": pid,
        "name": entry['name'],
        "num": entry.get('num'),
        "types": entry.get('types', []),
        "baseStats": entry.get('baseStats', {}),
        "abilities": abilities,
        "forme": forme or None,
        "baseSpecies": base_species if forme else None,
        "requiredItem": required_item,
        "heightm": entry.get('heightm'),
        "weightkg": entry.get('weightkg'),
        "color": entry.get('color'),
    }

    # Add learnset size
    if pid in learnset_out:
        obj["moveCount"] = len(learnset_out[pid])
    else:
        obj["moveCount"] = 0

    index.append(obj)

# ---------------------------------------------------------------------------
# 8. Build moves.json — legal moves with overrides baked in
# ---------------------------------------------------------------------------
print("Building moves list...", file=sys.stderr)

moves_out = {}
for mid in sorted(legal_moves):
    if mid in moves:
        moves_out[mid] = moves[mid]

# Assign effect categories for searchability
def get_effect_categories(entry: dict, mid: str) -> list[str]:
    cats: list[str] = []
    sec = entry.get('secondary')
    if not isinstance(sec, dict):
        sec = {}
    boost = entry.get('boosts')
    sec_is_empty = isinstance(entry.get('secondary'), dict) and entry['secondary'] == {}

    # --- Status Condition ---
    # Top-level status (Glare, Hypnosis, Spore, etc.)
    st = entry.get('status')
    if st:
        cats.append('inflicts_status')
    # Secondary status (Flamethrower burn, Body Slam para, etc.)
    if sec and 'status' in sec:
        cats.append('inflicts_status')

    # --- Flinch ---
    if sec and sec.get('volatileStatus') == 'flinch':
        cats.append('flinch')
    if entry.get('volatileStatus') == 'flinch':
        cats.append('flinch')

    # --- Confuse ---
    if sec and sec.get('volatileStatus') == 'confusion':
        cats.append('confuse')
    if entry.get('volatileStatus') == 'confusion':
        cats.append('confuse')

    # --- Trap ---
    vs = entry.get('volatileStatus', '')
    if vs == 'partiallytrapped':
        cats.append('trap')
    if vs == 'trap' or (vs and 'trap' in vs.lower()):
        cats.append('trap')
    sd = entry.get('shortDesc', '')
    if 'prevent' in sd.lower() and 'switch' in sd.lower():
        cats.append('trap')
    # Spirit Shackle has empty secondary, detect via shortDesc
    if sec_is_empty and ('prevent' in sd.lower() or 'trap' in sd.lower()):
        # already added above
        pass

    # --- Periodic Effect ---
    PERIODIC_VOLATILE = {'partiallytrapped', 'leechseed', 'saltcure', 'syrupbomb', 'aquaring'}
    if vs and vs in PERIODIC_VOLATILE:
        cats.append('periodic_effect')
    if sec and sec.get('volatileStatus', '') in PERIODIC_VOLATILE:
        cats.append('periodic_effect')

    # --- Stat Drop on Target (via secondary or top-level boosts) ---
    if sec and 'boosts' in sec and 'self' not in sec:
        if any(v < 0 for v in sec['boosts'].values()):
            cats.append('stat_drop_target')
    # Secondary with self.boosts that also debuffs target
    if sec and 'boosts' in sec and isinstance(sec.get('self'), dict) and 'boosts' in sec['self']:
        if any(v < 0 for v in sec['boosts'].values()):
            cats.append('stat_drop_target')
    # Top-level boosts lowering target stats (Noble Roar, Tearful Look)
    if isinstance(boost, dict) and any(v < 0 for v in boost.values()):
        tgt = entry.get('target', '')
        if tgt not in ('self', 'allySide', 'adjacentAlly', 'allies'):
            cats.append('stat_drop_target')
    # Self-switching moves that lower target stats (Parting Shot) — encoded in shortDesc
    if 'selfSwitch' in entry and 'lower' in sd.lower() and 'target' in sd.lower():
        cats.append('stat_drop_target')
    # Volatile status that causes stat drops over time (Syrup Bomb)
    if sec and sec.get('volatileStatus') == 'syrupbomb':
        cats.append('stat_drop_target')

    # --- Stat Increase on Target (guaranteed, non-self) ---
    if isinstance(boost, dict) and all(v > 0 for v in boost.values()):
        tgt = entry.get('target', '')
        if tgt not in ('self', ''):
            cats.append('stat_increase_target')

    # --- Stat Drop on Attacker ---
    s = entry.get('self')
    if isinstance(s, dict) and 'boosts' in s:
        if any(v < 0 for v in s['boosts'].values()):
            cats.append('stat_drop_attacker')
    self_boost = entry.get('selfBoost')
    if isinstance(self_boost, dict) and 'boosts' in self_boost:
        if any(v < 0 for v in self_boost['boosts'].values()):
            cats.append('stat_drop_attacker')

    # --- Stat Increase on Attacker (via secondary) ---
    if sec and isinstance(sec.get('self'), dict) and 'boosts' in sec['self']:
        if any(v > 0 for v in sec['self']['boosts'].values()):
            cats.append('stat_increase_attacker')

    # --- Guaranteed Self Stat Buff ---
    if isinstance(boost, dict):
        tgt = entry.get('target', '')
        if tgt == 'self' and any(v > 0 for v in boost.values()):
            cats.append('self_buff')
        # Ally-targeting boosts (Coaching, Aromatic Mist, Howl) are NOT self_buff
        # Mixed boosts (e.g. Shell Smash: +Atk/SpA/Spe -Def/SpD)
        if tgt == 'self' and any(v < 0 for v in boost.values()):
            cats.append('stat_drop_attacker')

    # --- Self-Switching ---
    if 'selfSwitch' in entry:
        cats.append('self_switch')

    # --- Forced Switching ---
    if 'forceSwitch' in entry:
        cats.append('force_switch')

    # --- Priority ---
    priority = entry.get('priority', 0)
    if priority != 0:
        cats.append('priority')

    # --- Multi-Hit ---
    if 'multihit' in entry:
        cats.append('multi_hit')

    # --- Recoil ---
    if 'recoil' in entry:
        cats.append('recoil')

    # --- Crash Damage ---
    if 'hasCrashDamage' in entry:
        cats.append('crash_damage')

    # --- High Crit Ratio ---
    if 'critRatio' in entry:
        cats.append('high_crit')

    # --- OHKO ---
    if 'ohko' in entry:
        cats.append('ohko')

    # --- Hazard Setting ---
    sc = entry.get('sideCondition', '')
    if sc in ('spikes', 'stealthrock', 'toxicspikes', 'stickyweb'):
        cats.append('hazard_set')
    # Ceaseless Edge: empty secondary indicating hazard set
    if sec_is_empty and 'spik' in sd.lower():
        cats.append('hazard_set')
    # Stone Axe if present
    if sec_is_empty and 'hazard' in sd.lower():
        cats.append('hazard_set')

    # --- Hazard Removal ---
    name_lower = entry.get('name', '').lower()
    if name_lower in ('rapid spin', 'defog', 'mortal spin', 'tidy up'):
        cats.append('hazard_remove')

    # --- Weather Setting ---
    if 'weather' in entry:
        cats.append('weather')

    # --- Terrain Setting ---
    if 'terrain' in entry:
        cats.append('terrain')

    # --- Screen Setting ---
    if sc in ('reflect', 'lightscreen', 'auroraveil'):
        cats.append('screen')
    # Also Safeguard which is a pseudo-screen? No, it prevents status.
    # Keep it as screen_setting only for Reflect/Light Screen/Aurora Veil

    # --- Room / Field Effects ---
    if 'pseudoWeather' in entry:
        cats.append('room')

    # --- Protection ---
    if 'stallingMove' in entry:
        cats.append('protect')
    elif entry.get('volatileStatus') in ('protect', 'kingsshield', 'banefulbunker', 'spikyshield'):
        cats.append('protect')

    # --- Protection-Breaking ---
    if 'breaksProtect' in entry:
        cats.append('protect_break')

    # --- Self-Destruct / Sacrifice ---
    if 'selfdestruct' in entry:
        cats.append('self_destruct')

    # --- Thaws Target ---
    if 'thawsTarget' in entry:
        cats.append('thaw')

    # --- Screen Breaking ---
    desc = entry.get('desc', '')
    if 'screen' in desc.lower() and ('end' in desc.lower() or 'break' in desc.lower() or 'destroy' in desc.lower()):
        # Exclude Aurora Veil (which sets screens, not breaks them)
        if 'aurora' not in name_lower:
            cats.append('screen_break')

    # --- Special Damage Formula ---
    if any(k in entry for k in ('overrideOffensiveStat', 'overrideDefensiveStat',
                                'overrideOffensivePokemon', 'damage')):
        cats.append('special_damage')
    # Counter and Mirror Coat use scripted target with basePower=0, priority=-5
    if entry.get('priority') == -5 and entry.get('basePower') == 0 and entry.get('target') == 'scripted':
        cats.append('special_damage')

    # --- Weight-Based Damage ---
    if 'heavier' in sd.lower():
        cats.append('weight_based')

    # --- Secondaries (plural array) — used by Fang moves (Fire Fang, Ice Fang, etc.) ---
    secondaries = entry.get('secondaries')
    if isinstance(secondaries, list):
        for s in secondaries:
            if not isinstance(s, dict):
                continue
            if 'status' in s:
                cats.append('inflicts_status')
            if s.get('volatileStatus') == 'flinch':
                cats.append('flinch')
            if s.get('volatileStatus') == 'confusion':
                cats.append('confuse')
            if 'boosts' in s:
                if any(v < 0 for v in s['boosts'].values()):
                    cats.append('stat_drop_target')

    # --- Manual overrides for scripted/text-only effects ---
    MANUAL_CATEGORIES = {
        'alluringvoice': ['confuse'],
        'burningjealousy': ['inflicts_status'],
        'direclaw': ['inflicts_status'],
        'triattack': ['inflicts_status'],
    }
    cats.extend(MANUAL_CATEGORIES.get(mid, []))

    return sorted(set(cats))

EFFECT_CATEGORY_LABELS = {
    'inflicts_status': 'Inflicts Status Condition',
    'flinch': 'Chance to Flinch',
    'confuse': 'Chance to Confuse',
    'trap': 'Trap',
    'periodic_effect': 'Periodic Effect',
    'stat_drop_target': 'Chance of Stat Drop on Target',
    'stat_increase_target': 'Stat Increase on Target',
    'stat_drop_attacker': 'Stat Drop on Attacker',
    'stat_increase_attacker': 'Chance of Stat Increase on Attacker',
    'self_buff': 'Guaranteed Self Stat Buff',
    'self_switch': 'Pivoting',
    'force_switch': 'Forced Switching',
    'priority': 'Priority',
    'multi_hit': 'Multi-Hit',
    'recoil': 'Recoil',
    'crash_damage': 'Crash Damage',
    'high_crit': 'High Crit Ratio',
    'ohko': 'OHKO',
    'hazard_set': 'Hazard Setting',
    'hazard_remove': 'Hazard Removal',
    'weather': 'Weather Setting',
    'terrain': 'Terrain Setting',
    'screen': 'Screen Setting',
    'room': 'Room / Field Effects',
    'protect': 'Protection',
    'protect_break': 'Protection-Breaking',
    'self_destruct': 'Self-Destruct / Sacrifice',
    'thaw': 'Thaws Target',
    'screen_break': 'Screen Breaking',
    'special_damage': 'Special Damage Formula',
    'weight_based': 'Weight-Based Damage',
}

# Strip removed/irrelevant flags (no longer used in Champions)
STRIP_FLAGS = {'snatch', 'metronome', 'bypasssub', 'mirror', 'allyanim',
               'cantusetwice', 'distance', 'failmefirst', 'failmimic', 'nonsky', 'nosketch'}
for mid, entry in moves_out.items():
    raw_flags = entry.pop('flags', None)
    if isinstance(raw_flags, dict):
        entry['flags'] = sorted(k for k in raw_flags if k not in STRIP_FLAGS)
    else:
        entry['flags'] = []
    entry.pop('contestType', None)
    entry['effectCategories'] = get_effect_categories(entry, mid)

# ---------------------------------------------------------------------------
# 9. Build items.json (117 items, no filtering needed beyond MA)
# ---------------------------------------------------------------------------
MA_LEGAL_ITEMS = {
    "abomasite","absolite","aerodactylite","aggronite","alakazite","altarianite",
    "ampharosite","aspearberry","audinite","babiriberry","banettite","beedrillite",
    "blackbelt","blackglasses","blastoisinite","brightpowder","cameruptite",
    "chandelurite","charcoal","charizarditex","charizarditey","chartiberry",
    "cheriberry","chesnaughtite","chestoberry","chilanberry","chimechite",
    "choicescarf","chopleberry","clefablite","cobaberry","colburberry",
    "crabominite","delphoxite","dragonfang","dragoninite","drampanite",
    "emboarite","excadrite","fairyfeather","focusband","focussash","feraligite",
    "floettite","froslassite","galladite","garchompite","gardevoirite","gengarite",
    "glalitite","glimmoranite","golurkite",    "greninjite","gyaradosite",
    "habanberry","hardstone","hawluchanite","heracronite","houndoominite",
    "kangaskhanite","kasibberry","kebiaberry","kingsrock","leftovers",
    "leppaberry","lightball","lopunnite","lucarionite","lumberry","magnet",
    "manectite","medichamite","meganiumite","mentalherb","meowsticite",
    "metalcoat","miracleseed","mysticwater","nevermeltice",
    "occaberry","oranberry","passhoberry","payapaberry","pechaberry",
    "persimberry","pidgeotite","pinsirite","poisonbarb","quickclaw","rawstberry",
    "rindoberry","roseliberry","sablenite","scizorite",    "scopelens","scovillainite",
    "sharpbeak","sharpedonite","shellbell","shucaberry","silkscarf","silverpowder",
    "sitrusberry","skarmorite","slowbronite","softsand","spelltag","starminite",
    "steelixite","tangaberry","twistedspoon","tyranitarite","venusaurite",
    "victreebelite","wacanberry","whiteherb","yacheberry",
}

items_out = {}
for iid in MA_LEGAL_ITEMS:
    if iid in items:
        items_out[iid] = items[iid]
    else:
        print(f"  WARNING: item {iid} not in base data", file=sys.stderr)

# ---------------------------------------------------------------------------
# 10. Build moves-with-learnsets.json — moves enriched with learnedBy list
# ---------------------------------------------------------------------------
print("Building moves-with-learnsets...", file=sys.stderr)

# Invert learnset_out: move_id → list of species_ids that learn it
move_to_species: dict[str, list[str]] = {}
for species_id, move_ids in learnset_out.items():
    for move_id in move_ids:
        if move_id not in move_to_species:
            move_to_species[move_id] = []
        move_to_species[move_id].append(species_id)

# Sort species lists for consistency
for lst in move_to_species.values():
    lst.sort()

# Only include moves with at least one learner — drop unlearnable moves
moves_with_learnsets_out = {}
for mid in sorted(moves_out):
    species_list = move_to_species.get(mid, [])
    if species_list:
        moves_with_learnsets_out[mid] = species_list

# ---------------------------------------------------------------------------
# 11. Write output
# ---------------------------------------------------------------------------
print("Writing output files...", file=sys.stderr)

fmt_dir = os.path.join(OUT, "format-m-a")
os.makedirs(fmt_dir, exist_ok=True)

def write_json(filename, data, indent=None):
    path = os.path.join(fmt_dir, filename)
    with open(path, 'w') as f:
        json.dump(data, f, indent=indent, ensure_ascii=False)
    size_kb = os.path.getsize(path) / 1024
    print(f"  {filename}: {size_kb:.1f} KiB ({len(data)} entries)", file=sys.stderr)

write_json("index.json", index, indent=1)
write_json("moves.json", moves_out, indent=1)
write_json("moves-with-learnsets.json", moves_with_learnsets_out, indent=1)
write_json("learnsets.json", learnset_out)
write_json("items.json", items_out)

print(f"\nDone! Generated {len(index)} battle forms, {len(moves_out)} moves, {len(items_out)} items, {len(learnset_out)} learnsets, {len(moves_with_learnsets_out)} moves-with-learnsets.", file=sys.stderr)

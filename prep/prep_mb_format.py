"""Generate Regulation M-B as an independent format.

M-B has its own complete whitelists (independent of M-A).
This script fetches source data from Showdown + the Champions mod
and builds M-B from scratch.

Whitelists defined here are the full set for M-B (M-A's roster plus
the 22 new Pokemon, 16 new Megas, 31 new items, 9 new abilities,
and 6 new moves introduced in Version 1.1.0 / Regulation M-B).
"""

import json
import os
import re
import sys
import urllib.request

# === Source URLs (same as prep_data.py) ===
SHOWDOWN = "https://play.pokemonshowdown.com/data"
GITHUB_RAW = "https://raw.githubusercontent.com/smogon/pokemon-showdown/master"
MOD_DIR = f"{GITHUB_RAW}/data/mods/champions"
OUT = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "format-m-b")

# === M-B complete whitelists ===

# 145 M-A non-mega species + 22 M-B additions = 167 base species
MB_SPECIES_NONMEGA = {
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
    "rotomheat","rotomwash","rotomfrost","rotomfan","rotommow",
    # M-B additions (22 new base species)
    "vileplume", "qwilfish", "sceptile", "blaziken", "swampert",
    "mawile", "metagross", "staraptor", "musharna", "scolipede",
    "scrafty", "eelektross", "pyroar", "malamar", "barbaracle",
    "dragalge", "grimmsnarl", "falinks", "overqwil", "houndstone",
    "annihilape", "gholdengo",
}

# 60 M-A mega forms + 16 M-B additions = 76 mega forms
MB_SPECIES_MEGA = {
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
    # M-B additions (16 new mega forms)
    "raichumegax", "raichumegay", "sceptilemega", "blazikenmega",
    "swampertmega", "mawilemega", "metagrossmega", "staraptormega",
    "scolipedemega", "scraftymega", "eelektrossmega", "pyroarmega",
    "malamarmega", "barbaraclemega", "dragalgemega", "falinksmega",
}

# 117 M-A items + 31 M-B additions = 148 items
MB_LEGAL_ITEMS = {
    "abomasite","absolite","aerodactylite","aggronite","alakazite","altarianite",
    "ampharosite","aspearberry","audinite","babiriberry","banettite","beedrillite",
    "blackbelt","blackglasses","blastoisinite","brightpowder","cameruptite",
    "chandelurite","charcoal","charizarditex","charizarditey","chartiberry",
    "cheriberry","chesnaughtite","chestoberry","chilanberry","chimechite",
    "choicescarf","chopleberry","clefablite","cobaberry","colburberry",
    "crabominite","delphoxite","dragonfang","dragoninite","drampanite",
    "emboarite","excadrite","fairyfeather","focusband","focussash","feraligite",
    "floettite","froslassite","galladite","garchompite","gardevoirite","gengarite",
    "glalitite","glimmoranite","golurkite","greninjite","gyaradosite",
    "habanberry","hardstone","hawluchanite","heracronite","houndoominite",
    "kangaskhanite","kasibberry","kebiaberry","kingsrock","leftovers",
    "leppaberry","lightball","lopunnite","lucarionite","lumberry","magnet",
    "manectite","medichamite","meganiumite","mentalherb","meowsticite",
    "metalcoat","miracleseed","mysticwater","nevermeltice",
    "occaberry","oranberry","passhoberry","payapaberry","pechaberry",
    "persimberry","pidgeotite","pinsirite","poisonbarb","quickclaw","rawstberry",
    "rindoberry","roseliberry","sablenite","scizorite","scopelens","scovillainite",
    "sharpbeak","sharpedonite","shellbell","shucaberry","silkscarf","silverpowder",
    "sitrusberry","skarmorite","slowbronite","softsand","spelltag","starminite",
    "steelixite","tangaberry","twistedspoon","tyranitarite","venusaurite",
    "victreebelite","wacanberry","whiteherb","yacheberry",
    # M-B additions: 16 new Mega Stones
    "barbaracite", "blazikenite", "dragalgite", "eelektrossite",
    "falinksite", "malamarite", "mawilite", "metagrossite",
    "pyroarite", "raichunitex", "raichunitey", "sceptilite",
    "scolipite", "scraftinite", "staraptite", "swampertite",
    # M-B additions: 15 new held items
    "bigroot", "damprock", "expertbelt", "heatrock", "icyrock",
    "ironball", "lifeorb", "lightclay", "metronome", "muscleband",
    "shedshell", "smoothrock", "widelens", "wiseglasses", "zoomlens",
}

# 9 new abilities introduced in M-B
MB_NEW_ABILITIES = {
    "battlearmor", "effectspore", "electricsurge", "eelevate",
    "fluffy", "forewarn", "firemane", "goodasgold", "suctioncups",
}

# 6 new moves introduced in M-B
MB_NEW_MOVES = {
    "barbbarrage", "makeitrain", "noretreat", "ragefist",
    "spiritbreak", "topsyturvy",
}

# Hardcoded data for the 2 M-B unique abilities (not in base Showdown)
MB_UNIQUE_ABILITIES = {
    "eelevate": {
        "name": "Eelevate",
        "desc": "The Pokemon floats off the ground, making it immune to Ground-type moves, as well as the Spikes, Toxic Spikes, and Sticky Web statuses. When the Pokemon knocks out a target with an attack, its highest stat is boosted by 1 stage.",
        "pokemon": ["eelektrossmega"],
        "effectCategories": ["immunity", "stats"],
    },
    "firemane": {
        "name": "Fire Mane",
        "desc": "Boosts the power of the Pokemon's Fire-type moves by 50%.",
        "pokemon": ["pyroarmega"],
        "effectCategories": ["power"],
    },
}

# === Fetch helpers ===
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

# === JS/TS parsing helpers (same logic as prep_data.py) ===
def _skip_string(text, i):
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
    end = text.find('\n', i)
    return len(text) if end == -1 else end + 1

def _find_brace_end(text, start):
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
    return None

def _split_top_level(text, sep=','):
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
    text = fetch_text(url)
    m = re.search(r'=\s*\{', text)
    if m:
        text = text[m.end():]
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
        while pos < len(text) and text[pos] in ' \t\n\r,':
            pos += 1
    return result

def parse_learnsets_ts(url):
    text = fetch_text(url)
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
        depth = 1
        while pos < len(text) and depth > 0:
            if text[pos] == '{':
                depth += 1
            elif text[pos] == '}':
                depth -= 1
            pos += 1
        body = text[m.end():pos-1]

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

        while pos < len(text) and text[pos] in ' \t\n\r,':
            pos += 1
    return result

def fetch_js_data(url):
    text = fetch_text(url)
    text = re.sub(r'^exports\.\w+\s*=\s*', '', text)
    text = text.rstrip().rstrip(';').strip()
    text = re.sub(r'(?<=[{,])\s*([a-zA-Z_$][a-zA-Z0-9_$]*)(?=\s*:)', r'"\1"', text)
    text = re.sub(r':\s*true(?=[,}])', ':true', text)
    text = re.sub(r':\s*false(?=[,}])', ':false', text)
    text = re.sub(r':\s*null(?=[,}])', ':null', text)
    return json.loads(text)

def _apply_overrides(base, overrides):
    for k, v in overrides.items():
        if v is None:
            base.pop(k, None)
        else:
            base[k] = v

def species_name_to_key(name):
    return name.lower().replace('-', '').replace(' ', '').replace("'", '').replace('.', '')

# === Move effect category assignment (mirrors prep_data.py) ===
STRIP_FLAGS = {'snatch', 'metronome', 'bypasssub', 'mirror', 'allyanim',
               'cantusetwice', 'distance', 'failmefirst', 'failmimic', 'nonsky', 'nosketch',
               'protect',
               'defrost', 'failcopycat', 'failencore', 'failinstruct', 'futuremove',
               'gravity', 'minimize', 'mustpressure', 'noassist', 'noparentalbond',
               'nosleeptalk', 'recharge', 'reflectable', 'charge'}

RANGE_MAP = {
    'normal': 'singleTarget',
    'adjacentAlly': 'singleAlly',
    'adjacentAllyOrSelf': 'singleAlly',
    'allAdjacent': 'allPokemon',
    'allAdjacentFoes': 'allOpponents',
    'all': 'entireField',
    'allySide': 'usersSide',
    'foeSide': 'opponentsSide',
    'any': 'singleTarget',
    'randomNormal': 'randomOpponent',
    'scripted': 'varies',
    'allies': 'allAllies',
    'allyTeam': 'allAllies',
    'self': 'self',
}

MANUAL_MOVE_CATEGORIES = {
    'alluringvoice': ['confuse'],
    'burningjealousy': ['inflicts_status'],
    'direclaw': ['inflicts_status'],
    'triattack': ['inflicts_status'],
}

def get_effect_categories(entry, mid):
    cats = []
    sec = entry.get('secondary')
    if not isinstance(sec, dict):
        sec = {}
    boost = entry.get('boosts')
    sec_is_empty = isinstance(entry.get('secondary'), dict) and entry['secondary'] == {}

    st = entry.get('status')
    if st:
        cats.append('inflicts_status')
    if sec and 'status' in sec:
        cats.append('inflicts_status')

    if sec and sec.get('volatileStatus') == 'flinch':
        cats.append('flinch')
    if entry.get('volatileStatus') == 'flinch':
        cats.append('flinch')

    if sec and sec.get('volatileStatus') == 'confusion':
        cats.append('confuse')
    if entry.get('volatileStatus') == 'confusion':
        cats.append('confuse')

    vs = entry.get('volatileStatus', '')
    if vs == 'partiallytrapped':
        cats.append('trap')
    if vs == 'trap' or (vs and 'trap' in vs.lower()):
        cats.append('trap')
    sd = entry.get('shortDesc', '')
    if 'prevent' in sd.lower() and 'switch' in sd.lower():
        cats.append('trap')

    PERIODIC_VOLATILE = {'partiallytrapped', 'leechseed', 'saltcure', 'syrupbomb', 'aquaring'}
    if vs and vs in PERIODIC_VOLATILE:
        cats.append('periodic_effect')
    if sec and sec.get('volatileStatus', '') in PERIODIC_VOLATILE:
        cats.append('periodic_effect')

    if sec and 'boosts' in sec and 'self' not in sec:
        if any(v < 0 for v in sec['boosts'].values()):
            cats.append('stat_drop_target')
    if sec and 'boosts' in sec and isinstance(sec.get('self'), dict) and 'boosts' in sec['self']:
        if any(v < 0 for v in sec['boosts'].values()):
            cats.append('stat_drop_target')
    if isinstance(boost, dict) and any(v < 0 for v in boost.values()):
        tgt = entry.get('target', '')
        if tgt not in ('self', 'allySide', 'adjacentAlly', 'allies'):
            cats.append('stat_drop_target')
    if 'selfSwitch' in entry and 'lower' in sd.lower() and 'target' in sd.lower():
        cats.append('stat_drop_target')
    if sec and sec.get('volatileStatus') == 'syrupbomb':
        cats.append('stat_drop_target')

    if isinstance(boost, dict) and all(v > 0 for v in boost.values()):
        tgt = entry.get('target', '')
        if tgt not in ('self', ''):
            cats.append('stat_increase_target')

    s = entry.get('self')
    if isinstance(s, dict) and 'boosts' in s:
        if any(v < 0 for v in s['boosts'].values()):
            cats.append('stat_drop_attacker')
    self_boost = entry.get('selfBoost')
    if isinstance(self_boost, dict) and 'boosts' in self_boost:
        if any(v < 0 for v in self_boost['boosts'].values()):
            cats.append('stat_drop_attacker')

    if sec and isinstance(sec.get('self'), dict) and 'boosts' in sec['self']:
        if any(v > 0 for v in sec['self']['boosts'].values()):
            cats.append('stat_increase_attacker')

    if isinstance(boost, dict):
        tgt = entry.get('target', '')
        if tgt == 'self' and any(v > 0 for v in boost.values()):
            cats.append('self_buff')
        if tgt == 'self' and any(v < 0 for v in boost.values()):
            cats.append('stat_drop_attacker')

    if 'selfSwitch' in entry:
        cats.append('self_switch')
    if 'forceSwitch' in entry:
        cats.append('force_switch')

    if entry.get('priority', 0) != 0:
        cats.append('priority')

    if 'multihit' in entry:
        cats.append('multi_hit')

    if 'recoil' in entry:
        cats.append('recoil')
    if 'hasCrashDamage' in entry:
        cats.append('crash_damage')
    if 'critRatio' in entry:
        cats.append('high_crit')
    if 'ohko' in entry:
        cats.append('ohko')

    sc = entry.get('sideCondition', '')
    if sc in ('spikes', 'stealthrock', 'toxicspikes', 'stickyweb'):
        cats.append('hazard_set')
    if sec_is_empty and 'spik' in sd.lower():
        cats.append('hazard_set')
    if sec_is_empty and 'hazard' in sd.lower():
        cats.append('hazard_set')

    name_lower = entry.get('name', '').lower()
    if name_lower in ('rapid spin', 'defog', 'mortal spin', 'tidy up'):
        cats.append('hazard_remove')

    if 'weather' in entry:
        cats.append('weather')
    if 'terrain' in entry:
        cats.append('terrain')
    if sc in ('reflect', 'lightscreen', 'auroraveil'):
        cats.append('screen')

    if 'pseudoWeather' in entry:
        cats.append('room')

    if 'stallingMove' in entry:
        cats.append('protect')
    elif entry.get('volatileStatus') in ('protect', 'kingsshield', 'banefulbunker', 'spikyshield'):
        cats.append('protect')
    if 'breaksProtect' in entry:
        cats.append('protect_break')
    if 'selfdestruct' in entry:
        cats.append('self_destruct')
    if 'thawsTarget' in entry:
        cats.append('thaw')

    desc = entry.get('desc', '')
    if 'screen' in desc.lower() and ('end' in desc.lower() or 'break' in desc.lower() or 'destroy' in desc.lower()):
        if 'aurora' not in name_lower:
            cats.append('screen_break')

    if any(k in entry for k in ('overrideOffensiveStat', 'overrideDefensiveStat',
                                'overrideOffensivePokemon', 'damage')):
        cats.append('special_damage')
    if entry.get('priority') == -5 and entry.get('basePower') == 0 and entry.get('target') == 'scripted':
        cats.append('special_damage')

    if 'heavier' in sd.lower():
        cats.append('weight_based')

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

    cats.extend(MANUAL_MOVE_CATEGORIES.get(mid, []))
    return sorted(set(cats))

# === Ability effect category assignment (mirrors prep_data.py) ===
def get_ability_categories(aid):
    cats = []

    if aid in ('drizzle', 'drought', 'sandstream', 'snowwarning', 'sandspit',
               'cloudnine', 'forecast', 'megasol', 'chlorophyll', 'swiftswim',
               'sandrush', 'slushrush', 'sandveil', 'snowcloak', 'sandforce',
               'solarpower', 'raindish', 'icebody', 'hydration', 'dryskin'):
        cats.append('weather')

    if aid in ('surgesurfer', 'mimicry'):
        cats.append('terrain')

    if aid in ('competitive', 'defiant', 'intimidate', 'gooey', 'supersweetsyrup',
               'speedboost', 'moxie', 'stamina', 'steadfast', 'justified',
               'angerpoint', 'berserk', 'weakarmor', 'electromorphosis',
               'guts', 'quickfeet', 'marvelscale', 'hustle',
               'contrary', 'moody', 'tangledfeet',
               'clearbody', 'whitesmoke', 'hypercutter', 'bigpecks', 'keeneye',
               'unaware', 'opportunist', 'mirrorarmor',
               'curiousmedicine', 'noguard',
               'sandveil', 'snowcloak', 'sandforce', 'chlorophyll', 'swiftswim',
               'sandrush', 'slushrush', 'surgesurfer',
               'unburden', 'illuminate', 'lightmetal', 'heavymetal'):
        cats.append('stats')

    if aid in ('adaptability', 'aerilate', 'analytic', 'blaze', 'dragonize',
               'fairyaura', 'hugepower', 'ironfist', 'megalauncher', 'merciless',
               'minus', 'overgrow', 'parentalbond', 'pixilate', 'plus',
               'purepower', 'reckless', 'refrigerate', 'rivalry',
               'sandforce', 'sharpness', 'sheerforce', 'skilllink', 'sniper',
               'solarpower', 'strongjaw', 'superluck', 'supremeoverlord',
               'swarm', 'technician', 'torrent', 'toughclaws',
               'rockhead', 'compoundeyes', 'hustle'):
        cats.append('power')

    if aid in ('aerilate', 'pixilate', 'refrigerate', 'dragonize', 'liquidvoice'):
        cats.append('move_type')

    if aid in ('filter', 'friendguard', 'multiscale', 'shellarmor', 'solidrock',
               'sturdy', 'thickfat', 'waterbubble', 'disguise', 'magicguard',
               'furcoat', 'heatproof', 'purifyingsalt'):
        cats.append('damage_reduction')

    if aid in ('aromaveil', 'bulletproof', 'corrosion', 'damp', 'dryskin',
               'eartheater', 'flashfire', 'flowerveil', 'immunity', 'insomnia',
               'leafguard', 'levitate', 'lightningrod', 'limber', 'magmaarmor',
               'motordrive', 'oblivious', 'overcoat', 'owntempo',
               'sapsipper', 'soundproof', 'sweetveil', 'telepathy',
               'vitalspirit', 'voltabsorb', 'waterabsorb', 'waterbubble',
               'shielddust', 'magicguard', 'purifyingsalt'):
        cats.append('immunity')

    if aid in ('cutecharm', 'earlybird', 'flamebody', 'healer', 'hydration',
               'immunity', 'insomnia', 'leafguard', 'limber', 'magmaarmor',
               'oblivious', 'owntempo', 'poisonpoint', 'spicyspray', 'static',
               'stench', 'shedskin', 'synchronize', 'sweetveil', 'vitalspirit',
               'marvelscale', 'quickfeet', 'guts', 'poisonheal', 'naturalcure',
               'tangledfeet', 'steadfast', 'solarpower', 'poisontouch'):
        cats.append('status')

    if aid in ('aftermath', 'cursedbody', 'cutecharm', 'flamebody', 'gooey',
               'mummy', 'pickpocket', 'poisonpoint', 'roughskin',
               'spicyspray', 'static', 'stench', 'wanderingspirit',
               'poisontouch', 'magician'):
        cats.append('contact')

    if aid in ('aftermath', 'cursedbody', 'electromorphosis', 'innardsout',
               'justified', 'roughskin', 'sandspit', 'spicyspray', 'stamina',
               'toxicdebris', 'weakarmor'):
        cats.append('on_hit')

    if aid in ('armortail', 'galewings', 'prankster', 'queenlymajesty',
               'quickdraw', 'stall', 'innerfocus'):
        cats.append('priority')

    if aid in ('corrosion', 'infiltrator', 'longreach', 'moldbreaker',
               'noguard', 'piercingdrill', 'scrappy', 'shadowtag',
               'stalwart', 'unaware', 'unseenfist'):
        cats.append('bypass')

    if aid in ('klutz', 'magician', 'pickpocket', 'pickup', 'stickyhold',
               'symbiosis', 'unburden', 'unnerve',
               'cheekpouch', 'cudchew', 'gluttony', 'harvest', 'ripen'):
        cats.append('item')

    if aid in ('cheekpouch', 'cudchew', 'gluttony', 'harvest', 'ripen', 'unnerve'):
        cats.append('berries')

    if aid in ('forecast', 'hungerswitch', 'illusion', 'mimicry',
               'protean', 'stancechange', 'zerotohero'):
        cats.append('form_change')

    if aid in ('imposter', 'magicbounce', 'mirrorarmor', 'mummy',
               'receiver', 'synchronize', 'trace', 'wanderingspirit',
               'opportunist'):
        cats.append('ability_control')

    if aid in ('cheekpouch', 'healer', 'hospitality', 'icebody',
               'naturalcure', 'poisonheal', 'raindish', 'regenerator'):
        cats.append('healing')

    if aid in ('screencleaner', 'shadowtag', 'toxicdebris'):
        cats.append('field_control')

    if aid in ('anticipation', 'competitive', 'curiousmedicine', 'defiant',
               'frisk', 'hospitality', 'imposter', 'intimidate',
               'naturalcure', 'opportunist', 'pressure', 'receiver',
               'regenerator', 'screencleaner', 'supersweetsyrup',
               'trace', 'unnerve', 'zerotohero',
               'drizzle', 'drought', 'sandstream', 'snowwarning'):
        cats.append('switch_in_out')

    return sorted(set(cats))

# === Main build ===
def main():
    os.makedirs(OUT, exist_ok=True)

    print("Fetching base data from Showdown...", file=sys.stderr)
    pokedex = fetch_json(f"{SHOWDOWN}/pokedex.json")
    moves_raw = fetch_json(f"{SHOWDOWN}/moves.json")
    print("Fetching learnsets...", file=sys.stderr)
    base_learnsets = fetch_json(f"{SHOWDOWN}/learnsets.json")
    items_raw = fetch_js_data(f"{SHOWDOWN}/items.js")

    print("Fetching Champions mod overrides...", file=sys.stderr)
    move_overrides = parse_ts_overrides(f"{MOD_DIR}/moves.ts")
    item_overrides = parse_ts_overrides(f"{MOD_DIR}/items.ts")
    ability_overrides = parse_ts_overrides(f"{MOD_DIR}/abilities.ts")
    mod_formats_data = parse_ts_overrides(f"{MOD_DIR}/formats-data.ts")
    mod_learnsets = parse_learnsets_ts(f"{MOD_DIR}/learnsets.ts")

    print("Applying overrides...", file=sys.stderr)
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

    # Determine legal species
    print("Determining legal species...", file=sys.stderr)
    champions_legal = set()
    for pid, entry in mod_formats_data.items():
        tier = entry.get('tier', '')
        if tier != "Illegal":
            if pid in pokedex:
                champions_legal.add(pid)
            else:
                print(f"  WARNING: {pid} in mod data but not in base pokedex", file=sys.stderr)

    MB_OVERRIDES = set()
    all_legal_ids = (MB_SPECIES_NONMEGA | MB_SPECIES_MEGA | MB_OVERRIDES) & champions_legal | MB_OVERRIDES

    for pid in sorted(MB_SPECIES_NONMEGA | MB_SPECIES_MEGA):
        if pid not in champions_legal:
            print(f"  NOTE: whitelist species {pid} not in Champions mod data", file=sys.stderr)
    whitelist_all = MB_SPECIES_NONMEGA | MB_SPECIES_MEGA
    for pid in sorted(champions_legal):
        if pid not in whitelist_all:
            print(f"  NOTE: mod species {pid} not in M-B whitelist", file=sys.stderr)

    mega_count = sum(1 for p in all_legal_ids if 'Mega' in (pokedex.get(p, {}).get('forme') or ''))
    print(f"  {len(all_legal_ids)} total species ({len(all_legal_ids) - mega_count} non-Mega, {mega_count} Mega)", file=sys.stderr)

    # Determine legal moves
    print("Determining legal moves...", file=sys.stderr)
    legal_moves = set()
    excluded_ns = {'Past', 'Unobtainable', 'CAP', 'LGPE', 'Gigantamax', 'Future'}
    for mid, entry in moves.items():
        ns = entry.get('isNonstandard')
        if ns is None or ns == '' or ns == 'Custom':
            legal_moves.add(mid)
        elif ns in excluded_ns:
            pass
        else:
            print(f"  NOTE: {mid} has unknown isNonstandard={ns!r}", file=sys.stderr)
    print(f"  {len(legal_moves)} legal moves", file=sys.stderr)

    # Filter learnsets
    print("Filtering learnsets...", file=sys.stderr)
    merged_learnsets = dict(base_learnsets)
    merged_learnsets.update(mod_learnsets)

    learnset_out = {}
    for pid in all_legal_ids:
        ls = {}
        is_rotom_appliance = pid in {'rotomheat', 'rotomwash', 'rotomfrost', 'rotomfan', 'rotommow'}

        if pid in merged_learnsets and not is_rotom_appliance:
            ls = merged_learnsets[pid].get('learnset', {})
        else:
            entry = pokedex.get(pid, {})
            base_source = None

            bo = entry.get('battleOnly', '')
            if bo:
                if isinstance(bo, list):
                    bo = bo[0]
                base_source = species_name_to_key(bo)

            if not base_source:
                bs = entry.get('baseSpecies', '')
                if bs:
                    base_source = species_name_to_key(bs)

            if base_source and base_source in merged_learnsets:
                ls = merged_learnsets[base_source].get('learnset', {})

            if pid.endswith('mega'):
                direct_base = re.sub(r'megax$|megay$|mega$', '', pid)
                if direct_base in merged_learnsets and base_source and direct_base.startswith(base_source):
                    ls = merged_learnsets[direct_base].get('learnset', {})

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

    # Build index
    print("Building index...", file=sys.stderr)
    index = []
    for pid in sorted(all_legal_ids):
        entry = pokedex.get(pid)
        if not entry:
            continue
        forme = entry.get('forme', '')
        required_item = entry.get('requiredItem', None)
        base_species = entry.get('baseSpecies', entry.get('name', ''))
        abilities = list(entry.get('abilities', {}).values())
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
            "gender": entry.get('gender'),
        }
        if pid in learnset_out:
            obj["moveCount"] = len(learnset_out[pid])
        else:
            obj["moveCount"] = 0
        index.append(obj)

    # Build moves
    print("Building moves list...", file=sys.stderr)
    moves_out = {}
    for mid in sorted(legal_moves):
        if mid in moves:
            moves_out[mid] = moves[mid]

    for mid, entry in moves_out.items():
        raw_flags = entry.pop('flags', None)
        if isinstance(raw_flags, dict):
            entry['flags'] = sorted(k for k in raw_flags if k not in STRIP_FLAGS)
        else:
            entry['flags'] = []
        entry.pop('contestType', None)
        entry['effectCategories'] = get_effect_categories(entry, mid)
        entry.pop('desc', None)
        if 'target' in entry:
            entry['range'] = RANGE_MAP.get(entry.pop('target'), 'singleTarget')

    # Build items
    print("Building items list...", file=sys.stderr)
    items_out = {}
    for iid in MB_LEGAL_ITEMS:
        if iid in items:
            items_out[iid] = items[iid]
        else:
            print(f"  WARNING: item {iid} not in base data", file=sys.stderr)

    for iid in items_out:
        items_out[iid]['sprite'] = iid

    for iid in items_out:
        for key in ['spritenum', 'onBasePowerPriority', 'num', 'gen', 'shortDesc', 'naturalGift',
                    'onAfterMoveSecondarySelfPriority', 'onAfterSetStatusPriority', 'onAnySwitchInPriority',
                    'onDamagePriority', 'onFractionalPriorityPriority', 'onModifyAccuracyPriority',
                    'onModifyAtkPriority', 'onModifyMovePriority', 'onModifySpAPriority',
                    'onResidualOrder', 'onResidualSubOrder']:
            items_out[iid].pop(key, None)

    # Build moves-with-learnsets
    print("Building moves-with-learnsets...", file=sys.stderr)
    move_to_species = {}
    for species_id, move_ids in learnset_out.items():
        for move_id in move_ids:
            if move_id not in move_to_species:
                move_to_species[move_id] = []
            move_to_species[move_id].append(species_id)
    for lst in move_to_species.values():
        lst.sort()

    moves_with_learnsets_out = {}
    for mid in sorted(moves_out):
        species_list = move_to_species.get(mid, [])
        if species_list:
            moves_with_learnsets_out[mid] = species_list

    # Build abilities
    print("Building abilities list...", file=sys.stderr)
    try:
        abilities_raw = fetch_js_data(f"{SHOWDOWN}/abilities.js")
    except Exception as e:
        print(f"  WARNING: could not fetch abilities data: {e}", file=sys.stderr)
        abilities_raw = {}

    ability_name_to_id = {}
    for aid, entry in abilities_raw.items():
        name = entry.get('name', '')
        if name:
            key = name.lower().replace(' ', '').replace('-', '').replace('.', '').replace("'", '')
            ability_name_to_id[key] = aid

    # Build ability-to-species mapping from M-B index
    ability_to_species = {}
    for s in index:
        for a in s['abilities']:
            if a:
                akey = a.lower().replace(' ', '').replace('-', '').replace('.', '').replace("'", '')
                if akey not in ability_to_species:
                    ability_to_species[akey] = []
                if s['id'] not in ability_to_species[akey]:
                    ability_to_species[akey].append(s['id'])

    abilities_out = {}
    # First, add all M-B abilities that exist in base Showdown
    for akey in MB_NEW_ABILITIES:
        if akey in MB_UNIQUE_ABILITIES:
            continue
        aid = ability_name_to_id.get(akey)
        if aid and aid in abilities_raw:
            entry = abilities_raw[aid]
            abilities_out[aid] = {
                'name': entry['name'],
                'desc': entry.get('desc', ''),
                'pokemon': sorted(ability_to_species.get(akey, [])),
                'effectCategories': get_ability_categories(aid),
            }
        else:
            print(f"  WARNING: M-B ability '{akey}' not found in base data", file=sys.stderr)

    # Add the unique hardcoded M-B abilities
    for aid, info in MB_UNIQUE_ABILITIES.items():
        abilities_out[aid] = {
            'name': info['name'],
            'desc': info['desc'],
            'pokemon': info['pokemon'],
            'effectCategories': info['effectCategories'],
        }

    # Write output
    print("Writing output files...", file=sys.stderr)
    def write_json(filename, data, indent=None):
        path = os.path.join(OUT, filename)
        with open(path, 'w') as f:
            json.dump(data, f, indent=indent, ensure_ascii=False)
        size_kb = os.path.getsize(path) / 1024
        print(f"  {filename}: {size_kb:.1f} KiB ({len(data)} entries)", file=sys.stderr)

    write_json("index.json", index, indent=1)
    write_json("moves.json", moves_out, indent=1)
    write_json("moves-with-learnsets.json", moves_with_learnsets_out, indent=1)
    write_json("learnsets.json", learnset_out)
    write_json("items.json", items_out)
    write_json("abilities.json", abilities_out)

    # Build a placeholder sprite-map.json: empty object (UI handles missing sprites gracefully)
    sprite_map_path = os.path.join(OUT, "sprite-map.json")
    with open(sprite_map_path, 'w') as f:
        json.dump({}, f, indent=1)
    print(f"  sprite-map.json: 0 entries (placeholder; run scripts/build-sprite-map.py for real sprites)", file=sys.stderr)

    print(f"\nDone! Generated {len(index)} battle forms, {len(moves_out)} moves, {len(items_out)} items, {len(learnset_out)} learnsets, {len(moves_with_learnsets_out)} moves-with-learnsets, {len(abilities_out)} abilities.", file=sys.stderr)

if __name__ == "__main__":
    main()

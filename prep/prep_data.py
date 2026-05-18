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

def parse_ts_overrides(url):
    """Parse a TypeScript file with {inherit:true} entries.
    
    Expected format:
        key: { inherit: true, prop: value, ... },
    
    Returns a dict of key → {prop: value}
    """
    text = fetch_text(url)
    # Remove the `export const ... = {` wrapper
    m = re.search(r'=\s*\{', text)
    if m:
        text = text[m.end():]
    # Remove trailing `};` or `}` and anything after
    text = re.sub(r'\}\s*;\s*$', '', text.rstrip())
    # Remove trailing `}` after all entries
    text = re.sub(r'\}\s*$', '', text.rstrip())
    
    result = {}
    # Match: key: { content },
    pattern = re.compile(r'''
        ^\s*
        ([a-z0-9_]+)\s*:\s*\{      # key: {
        (.*?)                         # body (non-greedy)
        \}\s*,?\s*$                 # },
    ''', re.MULTILINE | re.DOTALL | re.VERBOSE)
    
    for m in pattern.finditer(text):
        key = m.group(1)
        body = m.group(2).strip()
        props = {}
        for line in body.split('\n'):
            line = line.strip()
            if not line or line.startswith('//'):
                continue
            # Match key: value,
            pm = re.match(r'''([a-zA-Z0-9_]+)\s*:\s*(.+?)\s*,?\s*$''', line)
            if pm:
                pk = pm.group(1)
                pv = pm.group(2).strip()
                if pk == 'inherit' and pv == 'true':
                    continue
                # Try to parse as JSON-like value
                try:
                    props[pk] = json.loads(pv)
                except json.JSONDecodeError:
                    props[pk] = pv
        result[key] = props
    return result

move_overrides = parse_ts_overrides(f"{MOD_DIR}/moves.ts")
item_overrides = parse_ts_overrides(f"{MOD_DIR}/items.ts")
ability_overrides = parse_ts_overrides(f"{MOD_DIR}/abilities.ts")
mod_formats_data = parse_ts_overrides(f"{MOD_DIR}/formats-data.ts")

# ---------------------------------------------------------------------------
# 3. Apply overrides to base data
# ---------------------------------------------------------------------------
print("Applying overrides...", file=sys.stderr)

moves = dict(moves_raw)
for mid, overrides in move_overrides.items():
    if mid in moves:
        moves[mid].update(overrides)
    else:
        print(f"  WARNING: move {mid} not in base data", file=sys.stderr)

items = dict(items_raw)
for iid, overrides in item_overrides.items():
    if iid in items:
        items[iid].update(overrides)

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

# Defined below as MA_LEGAL_MOVES (full list)
MA_LEGAL_MOVES = {
    "acidarmor","acidspray","acrobatics","acupressure","aerialace","afteryou",
    "agility","aircutter","airslash","alluringvoice","allyswitch","amnesia",
    "ancientpower","appleacid","aquacutter","aquaring","aquastep","armorcannon",
    "aromaticmist","assurance","attract","aurasphere","aurawheel","auroraveil",
    "avalanche","axekick","babydolleyes","banefulbunker","batonpass","beakblast",
    "beatup","belch","bellydrum","bind","bite","bitterblade","bittermalice",
    "blastburn","blazekick","blizzard","block","bodypress","bodyslam","bonerush",
    "bounce","bravebird","breakingswipe","brickbreak","bugbite","bugbuzz",
    "bulkup","bulldoze","bulletseed","burnup","burningjealousy","calmmind",
    "ceaselessedge","charge","chargebeam","charm","chillingwater","chillyreception",
    "circlethrow","clangingscales","clangoroussoul","clearsmog","closecombat",
    "coaching","coil","comeuppance","confuseray","copycat","corrosivegas",
    "cosmicpower","cottonguard","cottonspore","counter","covet","crabhammer",
    "crosschop","crosspoison","crunch","crushclaw","darkpulse","darkestlariat",
    "decorate","defog","destinybond","detect","dig","direclaw","disable",
    "discharge","dive","doublehit","doubleshock","doubleteam","doubleedge",
    "dracometeor","dragoncheer","dragonclaw","dancedance","dragondance","dragondarts",
    "dragonpulse","dragonrush","dragontail","drainpunch","drainingkiss","drillrun",
    "dualwingbeat","dynamicpunch","earthpower","earthquake","eerieimpulse",
    "eeriespell","electricterrain","electrify","electroball","electroshot",
    "electroweb","encore","endeavor","endure","energyball","entrainment",
    "eruption","expandingforce","explosion","extrasensory","facade","fairylock",
    "fakeout","faketears","featherdance","feint","fellstinger","ficklebeam",
    "fierydance","finalgambit","fireblast","firefang","firelash","firepunch",
    "firespin","firstimpression","fissure","flail","flamecharge","flamethrower",
    "flareblitz","flashcannon","flatter","fling","flipturn","flowertrick","fly",
    "flyingpress","focusblast","focusenergy","focuspunch","followme",
    "forestscurse","foulplay","freezedry","frenzyplant","frostbreath","futuresight",
    "gastroacid","gigadrain","gigaimpact","gigatonhammer","glare","grassknot",
    "grassyglide","grassyterrain","gravapple","gravity","growth","guardsplit",
    "guardswap","guillotine","gunkshot","gyroball","hammerarm","hardpress",
    "haze","headsmash","headlongrush","healbell","healpulse","healingwish",
    "heatcrash","heatwave","heavyslam","helpinghand","hex","highjumpkick",
    "hornleech","howl","hurricane","hydropump","hyperbeam","hypnosis","icebeam",
    "icefang","icehammer","icepunch","icespinner","iciclecrash","iciclespear",
    "icywind","imprison","infernalparade","inferno","infestation","ingrain",
    "instruct","irondefense","ironhead","irontail","kingsshield","knockoff",
    "kowtowcleave","lashout","lastresort","lastrespects","lavalplume","leafblade",
    "leafstorm","leechlife","leechseed","lifedew","lightofruin","lightscreen",
    "liquidation","lockon","lowkick","lowsweep","lumacrash","lunge","magicpowder",
    "magicroom","magentrise","magneticflux","matchagotcha","meanlook","memento",
    "metalburst","metalsound","meteorbeam","meteormash","milkdrink","minimize",
    "mirrorcoat","mistyexplosion","mistyterrain","moonblast","moonlight",
    "morningsun","mortalspin","mountaingale","mudshot","mudslap","muddywater",
    "mysticalfire","nastyplot","nightdaze","nightshade","nightslash","nobleroar",
    "nuzzle","outrage","overheat","painplit","paraboliccharge","partingshot",
    "payback","perishsong","petaldance","phantomforce","pinmissile","playrough",
    "pluck","poisonfang","poisonjab","poisonpowder","pollenpuff","poltergeist",
    "populationbomb","pounce","powershift","powersplit","powerswap","powertrick",
    "powertrip","protect","psychup","psychic","psychicfangs","psychicnoise",
    "psychicterrain","psychocut","psyshieldbash","psyshock","quash","quickguard",
    "quiverdance","ragepowder","ragingbull","ragingfury","raindance","rapidspin",
    "razorshell","recover","recycle","reflect","reflecttype","rest","reversal",
    "revivalblessing","risingvoltage","roar","rockblast","rockpolish","rockslide",
    "rocktomb","rockwrecker","roleplay","roost","round","sacredsword","safeguard",
    "saltcure","sandtomb","sandstorm","scald","scaleshot","scaryface",
    "scorchingsands","screech","seismictoss","selfdestruct","shadowball",
    "shadowclaw","shadowpunch","shedtail","sheercold","shellsidearm","shellsmash",
    "shelter","simplebeam","sing","skillskip","skillswap","kittersmack","skyattack",
    "slackoff","sleeppowder","sleeptalk","sludgebomb","sludgewave","smackdown",
    "smartsrike","snaptrap","snarl","snore","snowscape","soak","softboiled",
    "solarbeam","solarblade","sparklingaria","speedswap","spicyextract","spikes",
    "spikyshield","spiritshackle","spitup","spite","spore","stealthrock",
    "steelbeam","steelroller","steelwing","stickyweb","stockpile","stompingtantrum",
    "stoneaxe","stoneedge","storedpower","stormthrow","strengthsap","stringshot",
    "strugglebug","stuffcheeks","stunspore","substitute","suckerpunch","sunnyday",
    "superfang","supercellslam","superpower","surf","swagger","swallow","sweetkiss",
    "sweetscent","switcheroo","swordsdance","synthesis","syrupbomb","tailslap",
    "tailwind","taunt","tearfullook","teatime","teeterdance","temperflare",
    "terrainpulse","thief","thrash","throatchop","thunder","thunderbolt",
    "thundercage","thunderclap","thunderfang","thunderouskick","thunderpunch",
    "thundershock","thunderwave","tickle","tidyup","topsyturvy","torchsong",
    "torment","toxic","toxicspikes","toxicthread","trailblaze","transform",
    "triattack","trick","trickortreat","trickroom","triplearrows","tripleaxel",
    "tripledive","triplekick","tropkick","twinbeam","upperhand","uproar","uturn",
    "vacuumwave","venoshock","victorydance","voltswitch","volttackle","waterfall",
    "waterpulse","watershuriken","waterspout","wavecrash","weatherball",
    "whirlpool","whirlwind","wickedblow","wideguard","wildboltstorm","wildcharge",
    "willowisp","wingattack","wish","wonderroom","woodhammer","workup",
    "worryseed","wrap","xscissor","yawn","zapcannon","zenheadbutt",
    "zingzap","bodypress","scaleshot",
}

# Plus all moves from Champions mod that are not marked Past
for mid, entry in moves.items():
    ns = entry.get('isNonstandard', '')
    if ns not in (None, '', 'Past'):
        pass
    # Don't filter by nonstandard here; we use the explicit list

# ---------------------------------------------------------------------------
# 6. Filter learnsets to M-A Pokémon × M-A moves
# ---------------------------------------------------------------------------
print("Filtering learnsets...", file=sys.stderr)

def species_name_to_key(name: str) -> str:
    return name.lower().replace('-', '').replace(' ', '').replace("'", '').replace('.', '')

learnset_out: dict[str, list[str]] = {}
for pid in all_legal_ids:
    ls: dict[str, list[str]] = {}

    # 1. Try direct learnset lookup by pid
    if pid in learnsets:
        ls = learnsets[pid].get('learnset', {})
    else:
        # 2. Try baseSpecies inheritance (handles regionals, size variants, megas, etc.)
        entry = pokedex.get(pid, {})
        bs = entry.get('baseSpecies', '')
        if bs:
            base_key = species_name_to_key(bs)
            if base_key in learnsets:
                ls = learnsets[base_key].get('learnset', {})

        # 3. Fallback: strip suffixes for megas
        if not ls and pid.endswith('mega'):
            for suffix in ('megax', 'megay', 'mega'):
                base_key = pid.replace(suffix, '')
                if base_key in learnsets:
                    ls = learnsets[base_key].get('learnset', {})
                    break

    filtered = {move: sources for move, sources in ls.items() if move in MA_LEGAL_MOVES}
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
# 8. Build moves.json — 467 legal moves with overrides baked in
# ---------------------------------------------------------------------------
print("Building moves list...", file=sys.stderr)

moves_out = {}
for mid in sorted(MA_LEGAL_MOVES):
    if mid in moves:
        moves_out[mid] = moves[mid]

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
# 10. Write output
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
write_json("moves.json", moves_out)
write_json("learnsets.json", learnset_out)
write_json("items.json", items_out)

print(f"\nDone! Generated {len(index)} battle forms, {len(moves_out)} moves, {len(items_out)} items, {len(learnset_out)} learnsets.", file=sys.stderr)

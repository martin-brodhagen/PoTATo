#!/usr/bin/env python3
"""Finalize items.json: patch descriptions/sprites, categorize, strip non-display fields.

Data fetched from Game8 (cached persistently).
"""

import json
import re
import sys
import urllib.request
from pathlib import Path

ROOT = Path('/home/martin/Projects/PoTATo')
sys.path.insert(0, str(ROOT / 'prep'))
from cache import CacheManager, parse_refresh_args

ITEMS_JSON = ROOT / 'data/format-m-a/items.json'
SPRITES_DIR = ROOT / 'sprites/items'
GAME8_ITEMS_URL = "https://game8.co/games/Pokemon-Champions/archives/588871"
HTML_FILE = Path('/home/martin/.local/share/opencode/tool-output/tool_e50ecf3f9001lhmWvLd64uGSvb')


def item_id_from_name(name: str) -> str:
    return name.lower().replace(" ", "").replace("'", "").replace("-", "")


def fetch_game8_items_html(cache: CacheManager) -> tuple[dict[str, dict], dict[str, str]]:
    """Returns (sprite_map, desc_map) from Game8, using cache or HTML_FILE fallback."""
    try:
        html = cache.fetch_text(GAME8_ITEMS_URL)
    except Exception:
        if HTML_FILE.exists():
            html = HTML_FILE.read_text(encoding='utf-8')
        else:
            return {}, {}

    sprite_map: dict[str, dict] = {}
    desc_map: dict[str, str] = {}

    tables = re.findall(r'<table[^>]*>(.*?)</table>', html, re.DOTALL)
    if len(tables) >= 2:
        tbody = re.search(r'<tbody>(.*?)</tbody>', tables[1], re.DOTALL)
        if tbody:
            rows = re.findall(r'<tr[^>]*>(.*?)</tr>', tbody.group(1), re.DOTALL)
            for row in rows:
                name_m = re.search(r"<img[^>]*alt='([^']+)'[^>]*data-src='([^']+)'", row)
                if not name_m:
                    continue
                name = name_m.group(1).strip()
                sprite_url = name_m.group(2)
                iid = item_id_from_name(name)
                sprite_map[iid] = {'name': name, 'sprite': sprite_url}

                desc_m = re.search(r'<hr class="a-table__line">\s*(.+?)\s*$', row, re.DOTALL)
                if desc_m:
                    desc = re.sub(r'<[^>]+>', '', desc_m.group(1)).strip()
                    desc_map[iid] = desc

    return sprite_map, desc_map


def download_sprites(game8_data: dict[str, dict]) -> tuple[int, int]:
    SPRITES_DIR.mkdir(parents=True, exist_ok=True)
    downloaded = skipped = 0
    for iid, item in game8_data.items():
        url = item.get('sprite', '')
        if not url:
            continue
        fp = SPRITES_DIR / f'{iid}.png'
        if fp.exists():
            skipped += 1
            continue
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
            data = urllib.request.urlopen(req, timeout=10).read()
            fp.write_bytes(data)
            downloaded += 1
        except Exception as e:
            print(f"  WARNING: failed to download {iid}: {e}", flush=True)
    return downloaded, skipped


def main():
    refresh_modes = parse_refresh_args()
    cache = CacheManager(refresh_modes)

    items = json.loads(ITEMS_JSON.read_text())
    print(f"Loaded {len(items)} items")

    print("Fetching Game8 item sprites and data...")
    sprite_map, desc_map = fetch_game8_items_html(cache)
    if not sprite_map:
        print("  WARNING: no HTML cache, skipping sprite/descs patch")
        game8_data = {}
        desc_map = {}
    else:
        game8_data = sprite_map
        print(f"  Using HTML cache: {len(game8_data)} items with descriptions")

    if game8_data:
        downloaded, skipped = download_sprites(sprite_map)
        print(f"  Sprites: {downloaded} downloaded, {skipped} already exist")

        patched = 0
        for iid, item in list(items.items()):
            if iid in game8_data:
                item['sprite'] = iid
                if iid in desc_map:
                    item['shortDesc'] = desc_map[iid]
                patched += 1
        print(f"  Patched sprite paths for {patched} items")
        if desc_map:
            print(f"  Patched descriptions for {sum(1 for iid in desc_map if iid in items)} items")
    else:
        for item in items.values():
            if not item.get('sprite'):
                item['sprite'] = item.get('id', '')

    for item in items.values():
        item.setdefault('category', [])

    def add_cat(item, cat):
        if cat not in item['category']:
            item['category'].append(cat)

    for _, item in items.items():
        if item.get('megaStone'):
            add_cat(item, 'Mega Stone')

    for iid, item in items.items():
        if 'berry' in iid:
            add_cat(item, 'Berry')

    for _, item in items.items():
        short = item.get('shortDesc', '')
        desc = item.get('desc', '')
        combined = (short + ' ' + desc).lower()
        if '1.2x power' in desc.lower() or 'by 20%' in short.lower() or 'boosts the power' in short.lower():
            add_cat(item, 'Power Boost')

    for iid, item in items.items():
        if iid in ('whiteherb', 'choicescarf', 'lightball'):
            add_cat(item, 'Stat Boost')

    for iid, item in items.items():
        if iid in ('focusband', 'focussash'):
            add_cat(item, 'Defense')

    for iid, item in items.items():
        short = item.get('shortDesc', '')
        desc = item.get('desc', '')
        combined = (short + ' ' + desc).lower()
        if 'halves damage taken' in desc.lower() or 'halves the damage taken' in desc.lower() or 'supereffective' in short.lower():
            add_cat(item, 'Defense')

    for iid, item in items.items():
        if iid in ('leftovers', 'shellbell', 'mentalherb'):
            add_cat(item, 'Recovery')

    for iid, item in items.items():
        short = item.get('shortDesc', '')
        desc = item.get('desc', '')
        combined = (short + ' ' + desc).lower()
        if 'cures' in combined or 'wakes up' in combined or 'cured' in combined:
            add_cat(item, 'Recovery')
        if 'restores' in combined and ('hp' in combined or 'heal' in combined or 'pp' in combined):
            add_cat(item, 'Recovery')

    for _, item in items.items():
        if not item['category']:
            add_cat(item, 'Other')

    ITEMS_JSON.write_text(json.dumps(items, indent=2, ensure_ascii=False))
    print(f"Done! {len(items)} items")


if __name__ == '__main__':
    main()

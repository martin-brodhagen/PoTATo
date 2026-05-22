#!/usr/bin/env python3
"""Classify items into Game8's official categories: Defense, Recovery, Power Boost, Other, Stat Boost, Mega Stone."""

import json
from pathlib import Path

ITEMS_FILE = Path('/home/martin/Projects/PoTATo/data/format-m-a/items.json')
items = json.loads(ITEMS_FILE.read_text())

TYPE_RESIST_BERRY_IDS = {
    'roseli', 'chilan', 'babiri', 'haban', 'chartiberry', 'tangaberry',
    'payapa', 'kebiaberry', 'chopleberry', 'rindoberry', 'occaberry',
    'wacanberry', 'colburberry', 'kasibberry', 'cobaberry', 'yacheberry',
    'passhoberry', 'shucaberry',
}

def categorize_item(item):
    key = item.get('id', '')
    # Mega Stone
    if item.get('megaStone'):
        return 'Mega Stone'

    desc = item.get('shortDesc', '').lower()
    name = item.get('name', '').lower()

    # Type-resist berries → Defense
    if key in TYPE_RESIST_BERRY_IDS or 'berry' in name and 'halves the damage' in desc:
        return 'Defense'

    # Recovery: Leftovers, Black Sludge, Sitrus Berry, Oran Berry (restore HP)
    if item.get('onResidualOrder') is not None:
        return 'Recovery'
    if key in {'oranberry', 'sitrusberry'}:
        return 'Recovery'
    if 'restores' in desc and ('hp' in desc or 'heal' in desc):
        return 'Recovery'

    # Defense: Focus Sash, Fling-based volatileStatus
    if item.get('onDamagePriority') is not None or item.get('onDamage') is not None:
        return 'Defense'
    if item.get('fling', {}).get('volatileStatus'):
        return 'Defense'

    # Power Boost: items that boost damage output
    if (item.get('onBasePowerPriority') is not None or
        item.get('onBasePower') is not None or
        item.get('basePower') is not None):
        return 'Power Boost'

    # Stat Boost: choice items + lum berry + stat modifiers
    if (item.get('isChoice') or
        'choicescarf' in item.get('sprite', '') or
        'choiceSpecs' in item.get('sprite', '') or
        'choiceband' in item.get('sprite', '')):
        return 'Stat Boost'
    if key == 'lumberry':
        return 'Stat Boost'
    if any(kw in desc for kw in ['stat', 'boost', 'raises', 'lowers', 'increases', 'decreases']):
        return 'Stat Boost'

    return 'Other'

for key, item in items.items():
    cat = categorize_item(item)
    item['category'] = cat

with open(ITEMS_FILE, 'w') as f:
    json.dump(items, f, indent=2, ensure_ascii=False)

print(f"Categorized {len(items)} items")
for c in sorted(set(i['category'] for i in items.values())):
    print(f"  {c}: {sum(1 for i in items.values() if i['category'] == c)}")
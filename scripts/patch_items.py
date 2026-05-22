#!/usr/bin/env python3
"""
Patch items.json with shortDesc from Game8 and add sprite field.
Also downloads item sprites to sprites/items/
"""

import os
import re
import json
import urllib.request
import urllib.error
from pathlib import Path

HTML_FILE = Path("/home/martin/.local/share/opencode/tool-output/tool_e50ecf3f9001lhmWvLd64uGSvb")
ITEMS_JSON = Path("/home/martin/Projects/PoTATo/data/format-m-a/items.json")
SPRITES_DIR = Path("/home/martin/Projects/PoTATo/sprites/items")

def parse_items_from_html(html_content: str) -> list[dict]:
    """Parse item rows from the HTML table."""
    items = []

    rows = re.findall(
        r'<tr>\s*<td class="center">(<a[^>]*>.*?</a>)</td>\s*<td class="center">(.*?)</td>\s*<td>(.*?)</td>\s*</tr>',
        html_content,
        re.DOTALL
    )

    for name_td, type_td, effect_td in rows:
        name_match = re.search(r'alt=\'([^\']+)\'[^>]*data-src=\'([^\']+)\'', name_td)
        if not name_match:
            continue

        item_name = name_match.group(1).strip()
        sprite_url = name_match.group(2)

        type_match = re.search(r'<a[^>]*>([^<]+)</a>', type_td)
        item_type = type_match.group(1).strip() if type_match else type_td.strip()

        hr_match = re.search(r'<hr class="a-table__line">\s*(.+?)\s*$', effect_td, re.DOTALL)
        description = hr_match.group(1).strip() if hr_match else ""
        description = re.sub(r'<[^>]+>', '', description).strip()

        items.append({
            "name": item_name,
            "sprite": sprite_url,
            "type": item_type,
            "description": description
        })

    return items

def item_id_from_name(name: str) -> str:
    """Convert item name to item ID (lowercase, no spaces)."""
    return name.lower().replace(" ", "").replace("'", "").replace("-", "").replace("'", "")

def download_sprites(items: list[dict], sprites_dir: Path) -> tuple[int, int]:
    """Download item sprites. Returns (downloaded, skipped)."""
    sprites_dir.mkdir(parents=True, exist_ok=True)

    downloaded = 0
    skipped = 0

    for item in items:
        url = item["sprite"]
        item_name = item["name"]
        item_id = item_id_from_name(item_name)

        filename = f"{item_id}.png"
        filepath = sprites_dir / filename

        if filepath.exists():
            skipped += 1
            continue

        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=10) as response:
                data = response.read()
            with open(filepath, "wb") as f:
                f.write(data)
            downloaded += 1
            print(f"  Downloaded: {item_name} -> {filename}")
        except Exception as e:
            print(f"  Failed to download {item_name}: {e}")
            skipped += 1

    return downloaded, skipped

def patch_items_json(items: list[dict], items_json_path: Path) -> int:
    """Update items.json with shortDesc and sprite fields."""
    with open(items_json_path, "r", encoding="utf-8") as f:
        items_data = json.load(f)

    updated = 0

    for item in items:
        item_id = item_id_from_name(item["name"])

        if item_id in items_data:
            items_data[item_id]["shortDesc"] = item["description"]
            items_data[item_id]["sprite"] = f"sprites/items/{item_id}.png"
            updated += 1
        else:
            print(f"  Warning: item '{item['name']}' (id: {item_id}) not found in items.json")

    with open(items_json_path, "w", encoding="utf-8") as f:
        json.dump(items_data, f, indent=2)

    return updated

def main():
    print("Reading HTML file...")
    with open(HTML_FILE, "r", encoding="utf-8") as f:
        html_content = f.read()

    print("Parsing item rows...")
    items = parse_items_from_html(html_content)
    print(f"  Found {len(items)} items in HTML table")

    print("\nDownloading sprites...")
    downloaded, skipped = download_sprites(items, SPRITES_DIR)
    print(f"  Downloaded: {downloaded}, Skipped (already exist): {skipped}")

    print("\nPatching items.json...")
    updated = patch_items_json(items, ITEMS_JSON)
    print(f"  Updated {updated} items in items.json")

    print("\nDone!")
    print(f"  Total items processed: {len(items)}")
    print(f"  Sprites downloaded: {downloaded}")
    print(f"  Sprites skipped: {skipped}")
    print(f"  Items.json entries updated: {updated}")

if __name__ == "__main__":
    main()
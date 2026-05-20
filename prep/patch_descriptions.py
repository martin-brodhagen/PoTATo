"""Patch move descriptions with text from Game8's move list page.

Scrapes https://game8.co/games/Pokemon-Champions/archives/590397
and replaces the shortDesc field in moves.json and moves-with-learnsets.json
for all format directories under data/.
"""

import json, os, re, urllib.request, sys

GAME8_URL = "https://game8.co/games/Pokemon-Champions/archives/590397"
DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")

def fetch_html(url):
    req = urllib.request.Request(url, headers={"User-Agent": "PoTATo/0.1"})
    return urllib.request.urlopen(req, timeout=30).read().decode("utf-8")

def parse_game8_table(html):
    """Parse the Game8 move table and return dict {move_name: description_text}."""
    tables = re.findall(r"<table[^>]*>(.*?)</table>", html, re.DOTALL)
    if len(tables) < 2:
        print("ERROR: could not find move table", file=sys.stderr)
        return {}

    tbody_match = re.search(r"<tbody>(.*?)</tbody>", tables[1], re.DOTALL)
    if not tbody_match:
        print("ERROR: no tbody in move table", file=sys.stderr)
        return {}

    rows = re.findall(r"<tr[^>]*>(.*?)</tr>", tbody_match.group(1), re.DOTALL)
    result = {}
    i = 0
    while i < len(rows):
        name_match = re.search(
            r"<td[^>]*rowspan[^>]*>.*?<a[^>]*>(.*?)</a>", rows[i]
        )
        if name_match:
            name = name_match.group(1).strip()
            if i + 1 < len(rows):
                desc_match = re.search(
                    r"<td[^>]*colspan[^>]*>(.*?)</td>", rows[i + 1], re.DOTALL
                )
                if desc_match:
                    desc = re.sub(r"<[^>]+>", "", desc_match.group(1)).strip()
                    if desc and desc != "\u2014" and desc != "\u2014":
                        result[name] = desc
            i += 2
        else:
            i += 1
    return result

def patch_file(path, game8_map, stats):
    """Replace shortDesc in a JSON file using game8 description map."""
    with open(path) as f:
        data = json.load(f)

    changed = 0
    unchanged = 0
    not_found = 0

    if isinstance(data, dict):
        iterable = data.items()
    else:
        iterable = [(None, item) for item in data]

    for key, entry in iterable:
        if not isinstance(entry, dict):
            continue
        name = entry.get("name", "")
        if not name:
            continue
        g8_desc = game8_map.get(name)
        if g8_desc:
            if entry.get("shortDesc") != g8_desc:
                entry["shortDesc"] = g8_desc
                changed += 1
            else:
                unchanged += 1
        else:
            not_found += 1

    with open(path, "w") as f:
        json.dump(data, f, indent=1, ensure_ascii=False)

    return changed, unchanged, not_found


def main():
    print("Fetching Game8 move list...", file=sys.stderr)
    html = fetch_html(GAME8_URL)

    print("Parsing table...", file=sys.stderr)
    game8_map = parse_game8_table(html)
    print(f"  Found {len(game8_map)} move descriptions", file=sys.stderr)

    # Detect format directories
    fmt_dirs = sorted(
        d for d in os.listdir(DATA_DIR)
        if os.path.isdir(os.path.join(DATA_DIR, d)) and d.startswith("format-")
    )
    print(f"  Format directories: {fmt_dirs}", file=sys.stderr)

    total_changed = 0
    for fmt_dir in fmt_dirs:
        dir_path = os.path.join(DATA_DIR, fmt_dir)
        for fname in ("moves.json", "moves-with-learnsets.json"):
            path = os.path.join(dir_path, fname)
            if not os.path.exists(path):
                continue
            changed, unchanged, not_found = patch_file(path, game8_map, {})
            total_changed += changed
            print(
                f"  {fmt_dir}/{fname}: {changed} changed, "
                f"{unchanged} unchanged, {not_found} not in Game8",
                file=sys.stderr,
            )

    print(f"\nDone! {total_changed} descriptions updated.", file=sys.stderr)


if __name__ == "__main__":
    main()

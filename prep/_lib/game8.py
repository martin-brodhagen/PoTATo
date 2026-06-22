"""Game8 scraper for PoTATo.

Downloads three pages from game8.co's Pokémon Champions section and
parses the in-game descriptions for moves, items, and abilities.

URLs (verified 2026-06-21):
  moves:     https://game8.co/games/Pokemon-Champions/archives/590397
  abilities: https://game8.co/games/Pokemon-Champions/archives/590403
  items:     https://game8.co/games/Pokemon-Champions/archives/588871

Output: data/game8-descriptions.json with shape:
    {
      "moves":     { "Thunderbolt": "Has a 10% chance...", "—": "<valid empty>" },
      "items":     { "Light Ball":  "If held by a Pikachu..." },
      "abilities": { "Static":     "30% chance..." }
    }

A bare "—" (U+2014) is preserved as-is — it's Game8's convention for
"no description" (e.g. status moves that purely change stats). Move/item
names that Game8 doesn't list are simply absent from the output dict.

Caching: the parsed JSON is committed to data/game8-descriptions.json.
The scraper only re-fetches when that file is absent (or when invoked
with --refresh / after `npm run prep:mb:refresh-game8`).
"""

import json
import os
import re
import sys
import urllib.error
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.dirname(os.path.dirname(HERE))
DEFAULT_OUTPUT = os.path.join(REPO_ROOT, "data", "game8-descriptions.json")

USER_AGENT = "PoTATo/0.1 (data prep)"

URL_MOVES = "https://game8.co/games/Pokemon-Champions/archives/590397"
URL_ABILITIES = "https://game8.co/games/Pokemon-Champions/archives/590403"
URL_ITEMS = "https://game8.co/games/Pokemon-Champions/archives/588871"

EM_DASH = "\u2014"


def _fetch(url: str, timeout: int = 30) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read().decode("utf-8")


def normalize_name(name: str) -> str:
    """Lowercase, strip non-alphanumeric — used to key into the M-B data."""
    return (
        name.lower()
        .replace("-", "")
        .replace(" ", "")
        .replace("'", "")
        .replace(".", "")
        .replace("\u2019", "")
    )


def _strip_html(text: str) -> str:
    """Strip tags and collapse whitespace."""
    text = re.sub(r"<br\s*/?>", " ", text)
    text = re.sub(r"<[^>]+>", "", text)
    text = text.replace("\u00a0", " ")
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def parse_moves(html: str) -> dict[str, str]:
    """Parse the Moves list page. Two-row pattern: name, then description.
    The page has many tables (search filter, etc.); the move data is the
    one whose rows contain `rowspan=2` cells with move names."""
    tables = re.findall(r"<table[^>]*>(.*?)</table>", html, re.DOTALL)
    out: dict[str, str] = {}
    for t in tables:
        tbody = re.search(r"<tbody>(.*?)</tbody>", t, re.DOTALL)
        if not tbody:
            continue
        rows = re.findall(r"<tr[^>]*>(.*?)</tr>", tbody.group(1), re.DOTALL)
        for i, row in enumerate(rows):
            m = re.search(r"<td[^>]*rowspan=2[^>]*>\s*<a[^>]*>([^<]+)</a>", row)
            if m and i + 1 < len(rows):
                name = m.group(1).strip()
                desc = _strip_html(rows[i + 1])
                if desc:
                    out[name] = desc
        if out:
            return out
    return out


def parse_abilities(html: str) -> dict[str, str]:
    """Parse the Abilities list page. The page has many tables; the data
    tables have rows shaped `<Name> | <Description>` (2 cells, name in
    cell 0, desc in cell 1)."""
    tables = re.findall(r"<table[^>]*>(.*?)</table>", html, re.DOTALL)
    out: dict[str, str] = {}
    for t in tables:
        rows = re.findall(r"<tr[^>]*>(.*?)</tr>", t, re.DOTALL)
        if len(rows) < 2:
            continue
        # The first row is the header "|Ability| |Effect|" — skip it
        # Data rows have exactly 2 cells (name, desc)
        for row in rows[1:]:
            cells = re.findall(r"<td[^>]*>(.*?)</td>", row, re.DOTALL)
            if len(cells) != 2:
                continue
            name = _strip_html(cells[0])
            desc = _strip_html(cells[1])
            if not name or not desc:
                continue
            out[name] = desc
    return out


def parse_items(html: str) -> dict[str, str]:
    """Parse the Items list page. Description is the text after
    `<hr class="a-table__line">` within the same cell. Multiple tables
    exist on the page; the data table is the one with item rows."""
    tables = re.findall(r"<table[^>]*>(.*?)</table>", html, re.DOTALL)
    out: dict[str, str] = {}
    for t in tables:
        tbody = re.search(r"<tbody>(.*?)</tbody>", t, re.DOTALL)
        if not tbody:
            continue
        rows = re.findall(r"<tr[^>]*>(.*?)</tr>", tbody.group(1), re.DOTALL)
        for row in rows:
            # The alt attribute can contain apostrophes (e.g. "King's Rock"),
            # so match the value lazily up to the next `'` followed by space.
            name_m = re.search(r"alt='(.*?)'\s", row)
            if not name_m:
                continue
            name = name_m.group(1).strip()
            # Find description after the hr line marker
            parts = re.split(r'<hr\s+class="a-table__line">\s*', row, maxsplit=1)
            if len(parts) < 2:
                continue
            desc = _strip_html(parts[1])
            if desc:
                out[name] = desc
        if out:
            return out
    return out


def parse_item_categories(html: str) -> dict[str, str]:
    """Parse the Items list page for the per-row category column.

    Each item row has shape:
      <td>name+img</td> <td>category link</td> <td>description</td>

    Returns {item_name: category}. Categories are from a fixed set
    (Defense, Effect Extend, Mega Stone, Other, Power Boost, Recovery,
    Stat Boost).
    """
    tables = re.findall(r"<table[^>]*>(.*?)</table>", html, re.DOTALL)
    out: dict[str, str] = {}
    for t in tables:
        tbody = re.search(r"<tbody>(.*?)</tbody>", t, re.DOTALL)
        if not tbody:
            continue
        rows = re.findall(r"<tr[^>]*>(.*?)</tr>", tbody.group(1), re.DOTALL)
        for row in rows:
            name_m = re.search(r"alt='(.*?)'\s", row)
            if not name_m:
                continue
            name = name_m.group(1).strip()
            cells = re.findall(r"<td[^>]*>(.*?)</td>", row, re.DOTALL)
            if len(cells) < 2:
                continue
            cat_m = re.search(r"<a[^>]*>([^<]+)</a>", cells[1])
            if not cat_m:
                continue
            cat = _strip_html(cat_m.group(1))
            if cat:
                out[name] = cat
        if out:
            return out
    return out


# Default output file for the categories cache.
CATEGORIES_OUTPUT = os.path.join(REPO_ROOT, "data", "game8-categories.json")


def scrape_item_categories(force: bool = False,
                          output_path: str = CATEGORIES_OUTPUT) -> dict[str, str]:
    """Scrape Game8 item categories. Cached to `output_path` (committed).

    Returns {item_name: category}.
    """
    if not force and os.path.isfile(output_path):
        with open(output_path, "r", encoding="utf-8") as f:
            return json.load(f)

    print("[game8] fetching item categories", file=sys.stderr)
    categories = parse_item_categories(_fetch(URL_ITEMS))
    print(f"  {len(categories)} items with categories", file=sys.stderr)

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(categories, f, indent=1, ensure_ascii=False)
    size_kb = os.path.getsize(output_path) / 1024
    print(f"[game8] wrote {output_path} ({size_kb:.1f} KiB)", file=sys.stderr)
    return categories


def scrape_all(force: bool = False, output_path: str = DEFAULT_OUTPUT) -> dict:
    """Scrape all three Game8 pages. If `output_path` exists and not force,
    return the cached JSON instead of re-fetching."""
    if not force and os.path.isfile(output_path):
        with open(output_path, "r", encoding="utf-8") as f:
            return json.load(f)

    print("[game8] fetching moves", file=sys.stderr)
    moves = parse_moves(_fetch(URL_MOVES))
    print(f"  {len(moves)} moves", file=sys.stderr)

    print("[game8] fetching abilities", file=sys.stderr)
    abilities = parse_abilities(_fetch(URL_ABILITIES))
    print(f"  {len(abilities)} abilities", file=sys.stderr)

    print("[game8] fetching items", file=sys.stderr)
    items = parse_items(_fetch(URL_ITEMS))
    print(f"  {len(items)} items", file=sys.stderr)

    out = {"moves": moves, "items": items, "abilities": abilities}

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(out, f, indent=1, ensure_ascii=False)
    size_kb = os.path.getsize(output_path) / 1024
    print(f"[game8] wrote {output_path} ({size_kb:.1f} KiB)", file=sys.stderr)

    return out


def main():
    import argparse
    p = argparse.ArgumentParser(description="Scrape Game8 descriptions + categories")
    p.add_argument("--refresh", action="store_true", help="Re-scrape even if cache exists")
    p.add_argument("--output", default=DEFAULT_OUTPUT, help="Output JSON path for descriptions")
    p.add_argument("--categories-output", default=CATEGORIES_OUTPUT, help="Output JSON path for item categories")
    args = p.parse_args()
    scrape_all(force=args.refresh, output_path=args.output)
    scrape_item_categories(force=args.refresh, output_path=args.categories_output)


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Download Pokémon Champions item bag sprites from Bulbagarden Archives.

Bulbagarden ships Champions item bag sprites inside the general `Category:Bag sprites`
(there is no dedicated Champions item category). The naming convention is:

    Bag <ItemName> CP Sprite.png          (CP = Champions)

This script walks `Bag *` files via the MediaWiki allpages API, filters for `CP`
entries, maps each Bulbagarden display name to its Showdown item id, and saves
the result to `sprites/items/<id>.png`. Existing files are kept (cached).

Existing items in `sprites/items/` that don't appear on Bulbagarden are left
untouched — Bulbagarden doesn't have every Champions item ripped yet, and the
upstream Showdown items.js is the canonical source for the sprite field on
`data/base/items.json`. This script just fills in the gaps where Bulbagarden
has a Champions bag sprite and we don't have one locally yet.

Usage:
    python3 scripts/download-item-sprites.py
"""

import hashlib
import json
import re
import sys
import time
import unicodedata
import urllib.request
from pathlib import Path
from urllib.parse import quote

API = "https://archives.bulbagarden.net/w/api.php"
BASE = "https://archives.bulbagarden.net/media/upload"
HERE = Path(__file__).resolve().parent.parent
ITEMS_JSON = HERE / "data" / "base" / "items.json"
OUT = HERE / "sprites" / "items"

CP_PATTERN = re.compile(r"^Bag (.+?) CP Sprite\.png$")


def api_call(params: dict) -> dict:
    params["format"] = "json"
    qs = "&".join(f"{k}={urllib.request.quote(str(v), safe='')}" for k, v in params.items())
    url = f"{API}?{qs}"
    req = urllib.request.Request(url, headers={"User-Agent": "PoTATo/0.1"})
    return json.loads(urllib.request.urlopen(req, timeout=30).read())


def get_all_cp_filenames() -> list[str]:
    """Walk all `Bag *` files via allpages pagination, filter for CP entries."""
    cp_files = []
    apcontinue = None
    pages = 0
    while True:
        params = {
            "action": "query",
            "list": "allpages",
            "apprefix": "Bag ",
            "apnamespace": "6",  # File namespace
            "aplimit": "500",
        }
        if apcontinue:
            params["apcontinue"] = apcontinue
        data = api_call(params)
        for page in data.get("query", {}).get("allpages", []):
            title = page["title"]  # "File:Bag Foo CP Sprite.png"
            fname = title.split(":", 1)[1] if ":" in title else title
            if CP_PATTERN.match(fname):
                cp_files.append(fname)
        pages += 1
        if "continue" in data and "apcontinue" in data["continue"]:
            apcontinue = data["continue"]["apcontinue"]
            # Be polite to Bulbagarden
            time.sleep(0.3)
        else:
            break
    print(f"  Walked {pages} allpages page(s), found {len(cp_files)} CP sprites.",
          file=sys.stderr)
    return cp_files


def sprite_url(filename: str) -> str:
    wiki_name = filename.replace(" ", "_")
    md5 = hashlib.md5(wiki_name.encode("utf-8")).hexdigest()
    url_path = quote(wiki_name, safe="/")
    return f"{BASE}/{md5[0]}/{md5[:2]}/{url_path}"


def showdown_name_to_id(name: str) -> str:
    """Convert a Showdown display name to a Showdown item id.

    Bulbagarden uses spaces in display names, e.g. "Bag Choice Scarf CP Sprite.png"
    captures bulb_name = "Choice Scarf". Showdown's id derivation: lowercase, strip
    spaces, dashes, apostrophes, periods, and diacritics. Diacritics are dropped
    because `data/base/items.json` keys are ASCII (e.g. `pokeball`, not `pokéball`).
    """
    nfkd = unicodedata.normalize("NFKD", name)
    ascii_name = nfkd.encode("ascii", "ignore").decode("ascii")
    return ascii_name.lower().replace(" ", "").replace("-", "").replace("'", "").replace(".", "")


# Bulbagarden has Champions-exclusive items that aren't held items and aren't
# relevant to PoTATo's teambuilder (Type Affinity Tickets, Ball Guaranteed
# Tickets, coupons, currencies). These never reach `data/base/items.json`
# because upstream Showdown doesn't ship them — and even if it did, PoTATo
# only renders held items. Skip them quietly by default; `--verbose` shows
# the full list.
IGNORED_SUFFIXES = (
    "guaranteedticket",
    "typeaffinityticket",
    "teammateticket",
    "trainingticket",
)


def is_ignored_champions_exclusive(bulb_name: str) -> bool:
    """Return True for Bulbagarden CP sprites that PoTATo intentionally ignores."""
    cid = showdown_name_to_id(bulb_name)
    if cid in ("quickcoupon", "vp"):
        return True
    return cid.endswith(IGNORED_SUFFIXES)


def main():
    import argparse
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--verbose", action="store_true",
                        help="List all unmatched Bulbagarden filenames, "
                             "including intentionally-ignored Champions-only items")
    args = parser.parse_args()

    if not ITEMS_JSON.is_file():
        sys.exit(f"ERROR: missing {ITEMS_JSON} — run `npm run prep:base` first")
    with open(ITEMS_JSON) as f:
        items = json.load(f)

    print("Fetching CP sprite list from Bulbagarden Archives...", file=sys.stderr)
    cp_files = get_all_cp_filenames()
    print(f"Found {len(cp_files)} CP sprites to consider.", file=sys.stderr)

    OUT.mkdir(parents=True, exist_ok=True)

    downloaded = cached = unmatched = ignored = failed = 0
    for fname in cp_files:
        m = CP_PATTERN.match(fname)
        bulb_name = m.group(1)  # e.g. "Choice Scarf" (already has spaces)
        # Showdown item ids are lowercase no-space; same id derivation rules.
        candidate_id = showdown_name_to_id(bulb_name)
        iid = candidate_id if candidate_id in items else None

        if iid is None:
            if is_ignored_champions_exclusive(bulb_name):
                ignored += 1
                if args.verbose:
                    print(f"  IGNORED: {fname!r} → id={candidate_id!r} "
                          f"(Champions-only, not a held item)",
                          file=sys.stderr)
                continue
            unmatched += 1
            print(f"  UNMATCHED: {fname!r} → id={candidate_id!r} (not in items.json)",
                  file=sys.stderr)
            continue

        local_path = OUT / f"{iid}.png"
        if local_path.exists() and local_path.stat().st_size > 0:
            cached += 1
            continue

        url = sprite_url(fname)
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "PoTATo/0.1"})
            data = urllib.request.urlopen(req, timeout=30).read()
        except Exception as e:
            failed += 1
            print(f"  FAIL {fname}: {e}", file=sys.stderr)
            continue

        with open(local_path, "wb") as f:
            f.write(data)
        downloaded += 1
        print(f"  [{downloaded + cached + unmatched + ignored + failed}/{len(cp_files)}] "
              f"{bulb_name!r} → {iid}.png", file=sys.stderr)

    print(f"\nDone! {downloaded} downloaded, {cached} cached, "
          f"{ignored} ignored (Champions-only, not a held item; "
          f"use --verbose to list), "
          f"{unmatched} unmatched (no Showdown item), {failed} failed.", file=sys.stderr)
    total = sum(1 for _ in OUT.glob("*.png"))
    print(f"Total item sprites in {OUT}: {total}", file=sys.stderr)


if __name__ == "__main__":
    main()
"""Download Pokémon Champions menu sprites from Bulbagarden Archives.

Queries the MediaWiki API for all files in Category:Champions_menu_sprites,
computes download URLs via MD5 hash, and saves them locally.
"""

import hashlib, json, os, sys, time, urllib.request
from pathlib import Path

API = "https://archives.bulbagarden.net/w/api.php"
BASE = "https://archives.bulbagarden.net/media/upload"
OUT = Path(__file__).resolve().parent.parent / "sprites" / "champions"
OUT.mkdir(parents=True, exist_ok=True)

def api_call(params):
    params["format"] = "json"
    qs = "&".join(f"{k}={urllib.request.quote(str(v), safe='')}" for k, v in params.items())
    url = f"{API}?{qs}"
    req = urllib.request.Request(url, headers={"User-Agent": "PoTATo/0.1"})
    return json.loads(urllib.request.urlopen(req, timeout=30).read())

def get_all_filenames():
    filenames = []
    cmcontinue = None
    while True:
        params = {
            "action": "query",
            "list": "categorymembers",
            "cmtitle": "Category:Champions_menu_sprites",
            "cmlimit": "500",
            "cmtype": "file",
        }
        if cmcontinue:
            params["cmcontinue"] = cmcontinue
        data = api_call(params)
        for member in data["query"]["categorymembers"]:
            title = member["title"]
            # "File:Menu CP 0003-Mega.png" -> "Menu CP 0003-Mega.png"
            name = title.split(":", 1)[1] if ":" in title else title
            filenames.append(name)
        if "continue" in data and "cmcontinue" in data["continue"]:
            cmcontinue = data["continue"]["cmcontinue"]
        else:
            break
    return filenames

def sprite_url(filename):
    # MediaWiki internally converts spaces to underscores for storage
    wiki_name = filename.replace(" ", "_")
    # Use UTF-8 encoding for MD5 (supports accented chars like "Poké")
    md5 = hashlib.md5(wiki_name.encode("utf-8")).hexdigest()
    # URL path uses underscores, non-ASCII gets percent-encoded
    from urllib.parse import quote
    url_path = quote(wiki_name, safe="/")
    return f"{BASE}/{md5[0]}/{md5[:2]}/{url_path}"

def download_sprite(filename):
    url = sprite_url(filename)
    local_name = filename.replace(" ", "_").encode("ascii", "replace").decode("ascii")
    local_path = OUT / local_name
    if local_path.exists() and local_path.stat().st_size > 0:
        return False
    req = urllib.request.Request(url, headers={"User-Agent": "PoTATo/0.1"})
    try:
        data = urllib.request.urlopen(req, timeout=30).read()
    except Exception as e:
        print(f"  FAIL {filename}: {e}", file=sys.stderr)
        return False
    with open(local_path, "wb") as f:
        f.write(data)
    return True

def main():
    print("Fetching sprite list from Bulbagarden Archives...", file=sys.stderr)
    filenames = get_all_filenames()
    print(f"Found {len(filenames)} sprites.", file=sys.stderr)

    downloaded = 0
    cached = 0
    for i, name in enumerate(filenames, 1):
        is_new = download_sprite(name)
        if is_new:
            downloaded += 1
            print(f"  [{i}/{len(filenames)}] {name}", file=sys.stderr)
        else:
            cached += 1
        # Be polite
        if i % 25 == 0:
            time.sleep(0.5)

    print(f"\nDone! {downloaded} downloaded, {cached} cached.", file=sys.stderr)
    total = sum(1 for _ in OUT.glob("*.png"))
    print(f"Total sprites in {OUT}: {total}", file=sys.stderr)

if __name__ == "__main__":
    main()

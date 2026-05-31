"""
Persistent forever cache with fine-grained refresh control.

Usage:
    cache = CacheManager()                           # reads/writes prep/.cache/
    data = cache.fetch(url)                         # from cache if present, else fetch+cache
    data = cache.fetch(url, use_cache=False)        # always fetch fresh

Refresh modes (set via --refresh flag):
    base         → don't use cache for Showdown URLs
    mod          → don't use cache for GitHub mod URLs
    descriptions → don't use cache for Game8 URLs (moves/abilities/items)
    all          → bypass cache entirely
    (combinable: --refresh=base,mod,descriptions)
"""

import argparse
import base64
import hashlib
import json
import sys
import urllib.request
from pathlib import Path


class CacheManager:
    CACHE_DIR = Path(__file__).parent / ".cache"

    SHOWDOWN_RE = staticmethod(lambda url: url.startswith("https://play.pokemonshowdown.com/"))
    GITHUB_RE = staticmethod(lambda url: url.startswith("https://raw.githubusercontent.com/smogon/pokemon-showdown/"))
    DESCRIPTIONS_RE = staticmethod(lambda url: url.startswith("https://game8.co/"))

    def __init__(self, refresh_modes: set[str] | None = None):
        self.refresh_modes = refresh_modes or set()

    def _cache_path(self, url: str) -> Path:
        h = hashlib.md5(url.encode()).hexdigest()[:16]
        return self.CACHE_DIR / f"{h}.json"

    def _should_skip_cache(self, url: str) -> bool:
        if "all" in self.refresh_modes:
            return True
        if "base" in self.refresh_modes and self.SHOWDOWN_RE(url):
            return True
        if "mod" in self.refresh_modes and self.GITHUB_RE(url):
            return True
        if "descriptions" in self.refresh_modes and self.DESCRIPTIONS_RE(url):
            return True
        return False

    def get(self, url: str) -> bytes | None:
        path = self._cache_path(url)
        if path.exists():
            entry = json.loads(path.read_text())
            return base64.b64decode(entry["data"])
        return None

    def set(self, url: str, data: bytes) -> None:
        self.CACHE_DIR.mkdir(parents=True, exist_ok=True)
        entry = {"url": url, "data": base64.b64encode(data).decode()}
        self._cache_path(url).write_text(json.dumps(entry))

    def fetch(self, url: str, use_cache: bool = True) -> bytes:
        """Return bytes: from cache if present and not skipped, else fetch and cache."""
        if use_cache and not self._should_skip_cache(url):
            cached = self.get(url)
            if cached is not None:
                return cached
        data = self._raw_fetch(url)
        self.set(url, data)
        return data

    def fetch_text(self, url: str) -> str:
        return self.fetch(url).decode("utf-8")

    def fetch_json(self, url: str):
        return json.loads(self.fetch(url))

    @staticmethod
    def _raw_fetch(url: str) -> bytes:
        print(f"  fetching {url}", file=sys.stderr)
        req = urllib.request.Request(url, headers={"User-Agent": "PoTATo/0.1"})
        return urllib.request.urlopen(req, timeout=30).read()


def parse_refresh_args() -> set[str]:
    parser = argparse.ArgumentParser(add_help=False)
    parser.add_argument("--refresh", default="")
    args, _ = parser.parse_known_args()
    if "--help" in sys.argv or "-h" in sys.argv:
        print("  --refresh=base,mod,descriptions,all  Bypass cache for specific data sources")
        print("  (combinable, e.g. --refresh=base,mod)")
        raise SystemExit(0)
    modes = set()
    if args.refresh:
        for m in args.refresh.split(","):
            m = m.strip()
            if m:
                modes.add(m)
    return modes

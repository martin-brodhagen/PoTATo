"""Disk-backed HTTP cache for the PoTATo data pipeline.

Caches raw HTTP responses to `.cache/<sha256(url)>` (binary file, raw bytes).
A JSON index at `.cache/index.json` maps URL → {sha256, fetched_at, etag?}.

Usage:
    cache = Cache()                       # defaults to .cache/ relative to project root
    data = cache.fetch_text(url)          # str
    data = cache.fetch_json(url)          # parsed dict/list
    data = cache.fetch_bytes(url)         # raw bytes
"""

import hashlib
import json
import os
import time
import urllib.error
import urllib.request

USER_AGENT = "PoTATo/0.1 (data prep)"
DEFAULT_ROOT = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), ".cache")


class FetchError(Exception):
    """Raised when a URL cannot be fetched and is not in the cache."""


class Cache:
    def __init__(self, root: str = DEFAULT_ROOT, *, offline: bool = False, timeout: int = 30):
        self.root = root
        self.offline = offline
        self.timeout = timeout
        self.index_path = os.path.join(root, "index.json")
        self._index: dict[str, dict] = {}
        self._load_index()

    def _load_index(self) -> None:
        if os.path.isfile(self.index_path):
            try:
                with open(self.index_path, "r", encoding="utf-8") as f:
                    self._index = json.load(f)
            except (OSError, json.JSONDecodeError):
                self._index = {}

    def _save_index(self) -> None:
        os.makedirs(self.root, exist_ok=True)
        tmp = self.index_path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(self._index, f, indent=2, sort_keys=True)
        os.replace(tmp, self.index_path)

    @staticmethod
    def _key(url: str) -> str:
        return hashlib.sha256(url.encode("utf-8")).hexdigest()

    def _path(self, url: str) -> str:
        return os.path.join(self.root, self._key(url))

    def has(self, url: str) -> bool:
        return os.path.isfile(self._path(url))

    def _read_cached(self, url: str) -> bytes:
        path = self._path(url)
        with open(path, "rb") as f:
            return f.read()

    def _write_cached(self, url: str, data: bytes) -> None:
        os.makedirs(self.root, exist_ok=True)
        path = self._path(url)
        tmp = path + ".tmp"
        with open(tmp, "wb") as f:
            f.write(data)
        os.replace(tmp, path)
        self._index[url] = {
            "sha256": self._key(url),
            "fetched_at": int(time.time()),
            "bytes": len(data),
        }
        self._save_index()

    def _download(self, url: str) -> bytes:
        req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                return resp.read()
        except (urllib.error.URLError, TimeoutError, OSError) as e:
            raise FetchError(f"failed to fetch {url}: {e}") from e

    def fetch_bytes(self, url: str, *, force: bool = False) -> bytes:
        if not force and self.has(url):
            return self._read_cached(url)
        if self.offline:
            raise FetchError(f"offline mode and {url} not in cache")
        data = self._download(url)
        self._write_cached(url, data)
        return data

    def fetch_text(self, url: str, *, force: bool = False, encoding: str = "utf-8") -> str:
        return self.fetch_bytes(url, force=force).decode(encoding)

    def fetch_json(self, url: str, *, force: bool = False) -> object:
        return json.loads(self.fetch_text(url, force=force))

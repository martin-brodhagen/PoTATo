"""Download type icons from Game8 for Pokémon Champions."""

import os
import urllib.request
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "sprites" / "types"
OUT.mkdir(parents=True, exist_ok=True)

TYPES = {
    "Bug": "https://img.game8.co/4299208/a065bb62f3556baf6ee0acb186a3c0be.png/show",
    "Dark": "https://img.game8.co/4299204/0ebf8a5dcc1aa92030ef30c8da5ca8a0.png/show",
    "Dragon": "https://img.game8.co/4299207/4552afff10f96323a65e691ae3b5c52c.png/show",
    "Electric": "https://img.game8.co/4299205/47a778155c5ec36f330af5927234cacd.png/show",
    "Fairy": "https://img.game8.co/4299203/4c0a92576fdca782899c7af7a0d1f9ca.png/show",
    "Fighting": "https://img.game8.co/4299217/b61c2e9511a5f234f388c1f1dd0a0176.png/show",
    "Fire": "https://img.game8.co/4299210/207f584c5f15b7ffd2cba1534c8bed02.png/show",
    "Flying": "https://img.game8.co/4299211/8c3e8a839b48ce0c10356c87bbacdab0.png/show",
    "Ghost": "https://img.game8.co/4299206/9172cad952298c879369a48d69761641.png/show",
    "Grass": "https://img.game8.co/4299209/2b132728e31ee55bfdf2136dba0b71e3.png/show",
    "Ground": "https://img.game8.co/4299216/53dbfb25d20a20589d94b322ad35239d.png/show",
    "Ice": "https://img.game8.co/4299215/01d181584bcc8d4e2175bddf77eb6d1f.png/show",
    "Normal": "https://img.game8.co/4299219/c9ee4eb16979a60a83907e19ce79be05.png/show",
    "Poison": "https://img.game8.co/4299214/2d8cfc503b4593b6ecd69633cb599efa.png/show",
    "Psychic": "https://img.game8.co/4299218/752353cecad81a103ccb3c373562d639.png/show",
    "Rock": "https://img.game8.co/4299220/267b34ea25e6b484ee952f2d58a11a2c.png/show",
    "Steel": "https://img.game8.co/4299213/05911fa4c3887a4d35857bb8665b3616.png/show",
    "Water": "https://img.game8.co/4299212/b3812ae2196faefc57e06e9402b4f654.png/show",
}

for type_name, url in TYPES.items():
    out_path = OUT / f"{type_name.lower()}.png"
    if out_path.exists():
        print(f"  Cached: {type_name}")
        continue
    req = urllib.request.Request(url, headers={"User-Agent": "PoTATo/0.1"})
    try:
        data = urllib.request.urlopen(req, timeout=30).read()
        with open(out_path, "wb") as f:
            f.write(data)
        print(f"  Downloaded: {type_name}")
    except Exception as e:
        print(f"  FAIL {type_name}: {e}")

total = sum(1 for _ in OUT.glob("*.png"))
print(f"Total type icons: {total}")
from pathlib import Path

from PIL import Image

SRC = Path("sprites/champions")
DST = Path("sprites/champions-48")
SIZE = (48, 48)

DST.mkdir(parents=True, exist_ok=True)

count = 0
for src_path in sorted(SRC.glob("*.png")):
    with Image.open(src_path) as img:
        resized = img.resize(SIZE, Image.LANCZOS)
        dst_path = DST / src_path.name
        resized.save(dst_path, format="PNG", optimize=True)
        count += 1

print(f"resized {count} sprites -> {DST}/")

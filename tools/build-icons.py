#!/usr/bin/env python3
"""Generate the Heart2Heart Kenya icon set from the master logo.

  icons/logo.png            full lockup (hearts + wordmark), for the welcome screen
  icons/icon-*.png          hearts-only crop, for favicon / app / apple-touch
  icons/icon-maskable-*.png hearts on padded peach, safe for rounded/adaptive masks

Run: python tools/build-icons.py
"""
from PIL import Image
from pathlib import Path

SRC = Path(__file__).resolve().parent / "logo-master.png"
OUT = Path(__file__).resolve().parent.parent / "icons"
OUT.mkdir(exist_ok=True)

master = Image.open(SRC).convert("RGB")   # 2000 x 2000

# Full lockup for the app (downscaled).
master.resize((1024, 1024), Image.LANCZOS).save(OUT / "logo.png", optimize=True)

# Hearts bounding box (detected): x 592-1360, y 588-1120; wordmark starts ~y1202.
# Square framed on the hearts, clamped to clear the wordmark.
BOX = (581, 390, 1371, 1180)           # 790 x 790
hearts = master.crop(BOX)

# Background peach, sampled from clear edges, for maskable padding.
def emit(img, name, size):
    img.resize((size, size), Image.LANCZOS).save(OUT / name, optimize=True)

emit(hearts, "icon-192.png", 192)
emit(hearts, "icon-512.png", 512)
emit(hearts, "icon-180.png", 180)     # apple-touch
emit(hearts, "favicon-64.png", 64)    # browser tab

# Maskable: hearts sit in the central ~62% so rounded/adaptive masks never clip
# them. Pad with the crop's own top-edge colour so the seam disappears.
top = hearts.crop((0, 0, hearts.width, 3))
n = top.width * top.height
fill = tuple(sum(c)//n for c in zip(*list(top.getdata())))
side = round(hearts.width / 0.62)
canvas = Image.new("RGB", (side, side), fill)
canvas.paste(hearts, ((side - hearts.width)//2, (side - hearts.height)//2))
emit(canvas, "icon-maskable-192.png", 192)
emit(canvas, "icon-maskable-512.png", 512)
print("fill", fill, "-> icons written")

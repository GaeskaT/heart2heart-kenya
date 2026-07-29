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

# ---- Transparent hearts mark (for the welcome hero, which floats it on teal) ----
from PIL import ImageDraw, ImageFilter
from collections import deque

def transparent_hearts():
    W, H = hearts.size
    KEY = (0, 255, 0)
    work = hearts.copy()
    seeds = []
    for t in range(0, W, 32): seeds += [(t, 0), (t, H-1), (t, H-2), (t, H-3)]
    for t in range(0, H, 32): seeds += [(0, t), (1, t), (W-1, t), (W-2, t)]
    seeds += [(135,593),(120,560),(150,620),(110,600),(165,640),(95,585),
              (200,690),(300,700),(90,520)]   # shadow / light-bloom pockets
    for s in seeds:
        try: ImageDraw.floodfill(work, s, KEY, thresh=66)
        except Exception: pass
    wp = work.load()
    op = [[wp[x, y] != KEY for x in range(W)] for y in range(H)]  # opaque?

    # Keep only the largest connected blob (drops detached specks).
    seen = [[False]*W for _ in range(H)]; best = []
    for y in range(H):
        for x in range(W):
            if op[y][x] and not seen[y][x]:
                comp = []; dq = deque([(x, y)]); seen[y][x] = True
                while dq:
                    cx, cy = dq.popleft(); comp.append((cx, cy))
                    for dx, dy in ((1,0),(-1,0),(0,1),(0,-1)):
                        nx, ny = cx+dx, cy+dy
                        if 0<=nx<W and 0<=ny<H and op[ny][nx] and not seen[ny][nx]:
                            seen[ny][nx] = True; dq.append((nx, ny))
                if len(comp) > len(best): best = comp
    keep = set(best)

    # Peel the thin bottom tail (a single contiguous run < 80px): that's the
    # shadow-blended junction below the hearts' real tips, not vivid heart.
    for y in range(H-1, -1, -1):
        xs = [x for x in range(W) if (x, y) in keep]
        if not xs: continue
        contiguous = (xs[-1] - xs[0] + 1) == len(xs)
        if contiguous and (xs[-1] - xs[0] + 1) < 80:
            for x in xs: keep.discard((x, y))
        else:
            break

    mask = Image.new("L", (W, H), 0); mp = mask.load()
    for (x, y) in keep: mp[x, y] = 255
    mask = mask.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.8))
    out = hearts.convert("RGBA"); out.putalpha(mask)
    out.save(OUT / "logo-hearts.png", optimize=True)

transparent_hearts()
print("fill", fill, "-> icons written")

#!/usr/bin/env python3
"""Generate the HeartWise Connections icon set from the master logo.

  icons/logo-hero.png       transparent gold heart + wordmark, for the welcome hero
  icons/icon-*.png          gold-heart-on-black square, for favicon / app / apple-touch
  icons/icon-maskable-*.png same heart padded with black for rounded/adaptive masks

Run: python tools/build-icons.py   (needs Pillow)
"""
from PIL import Image, ImageFilter
from pathlib import Path

SRC = Path(__file__).resolve().parent / "logo-master.jpg"
OUT = Path(__file__).resolve().parent.parent / "icons"
OUT.mkdir(exist_ok=True)

master = Image.open(SRC).convert("RGB")   # 1536 x 1024, gold logo on black

def luminance_alpha(rgb, floor=22, scale=11):
    """Gold-on-black -> alpha from brightness, so black drops out cleanly."""
    g = rgb.convert("L")
    return g.point(lambda v: 0 if v < floor else min(255, (v - floor) * scale))

# ---- Transparent gold lockup (heart + wordmark) for the hero ----
lock = master.crop((355, 240, 1065, 672))          # heart + "HeartWise Connections"
lock_rgba = lock.convert("RGBA")
lock_rgba.putalpha(luminance_alpha(lock))
lock_rgba.save(OUT / "logo-hero.png", optimize=True)

# ---- Gold heart on black, square, for the app icons ----
# Heart bbox (detected): x 624-906, y 253-489; wordmark starts ~y524.
# Square framed on the heart, clamped to clear the wordmark.
heart = master.crop((615, 208, 915, 508))     # 300 x 300, gold heart on black

def emit(img, name, size):
    img.resize((size, size), Image.LANCZOS).save(OUT / name, optimize=True)

emit(heart, "icon-192.png", 192)
emit(heart, "icon-512.png", 512)
emit(heart, "icon-180.png", 180)     # apple-touch
emit(heart, "favicon-64.png", 64)    # browser tab

# Maskable: pad the heart into the central ~62% on black so masks don't clip it.
side = round(heart.width / 0.62)
canvas = Image.new("RGB", (side, side), (0, 0, 0))
canvas.paste(heart, ((side - heart.width)//2, (side - heart.height)//2))
emit(canvas, "icon-maskable-192.png", 192)
emit(canvas, "icon-maskable-512.png", 512)
print("icons written to", OUT)

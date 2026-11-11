#!/usr/bin/env python3
"""Builds splat-gallery/img/splats.png from the Kenney Splat Pack (CC0): its 36 white splat
shapes at 128 px, in a 12 × 3 grid. The game tints each one to the paint's colour as it lands.
The pack lives in the private assets repo; pass its folder:
  python3 scripts/splat-gallery/build-splats.py "<games-private>/kenney-all-in-1/2D assets/Splat Pack"
"""
import os
import sys

from PIL import Image

src = sys.argv[1] if len(sys.argv) > 1 else None
if not src:
    sys.exit('usage: build-splats.py <Splat Pack folder>')
CELL, COLS, N = 128, 12, 36
sheet = Image.new('LA', (CELL * COLS, CELL * (N // COLS)), (255, 0))
for i in range(N):
    im = Image.open(os.path.join(src, 'PNG', 'Double (512px)', f'splat{i:02d}.png')).convert('RGBA')
    alpha = im.getchannel('A').resize((CELL, CELL), Image.LANCZOS)
    cell = Image.merge('LA', (Image.new('L', (CELL, CELL), 255), alpha))
    sheet.paste(cell, ((i % COLS) * CELL, (i // COLS) * CELL))
out = os.path.join(os.path.dirname(__file__), '..', '..', 'splat-gallery', 'img', 'splats.png')
sheet.save(out, optimize=True)
print('wrote', os.path.relpath(out), f'{N} splats')

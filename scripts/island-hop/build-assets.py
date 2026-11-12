#!/usr/bin/env python3
"""Build Island Hop's sprite atlas and sounds from the Kenney packs in meirmsn/games-private.

Run once when the art or sounds change, with the asset repo checked out:
    python3 scripts/island-hop/build-assets.py /path/to/games-private
Needs Pillow and ffmpeg. Writes island-hop/img/atlas.png, island-hop/atlas.js and
island-hop/sounds/*.mp3.

Every pack is scaled to one grid: the Isometric Tiles packs (Base, Buildings, City, Vehicles) at
their own size (132 px tiles, 2:1), Isometric Nature from its 180 px tile to 132, and Isometric
Watercraft so the motorboat spans about 1.5 tiles. Each sprite is cropped to its pixels; its anchor
(ax, ay) is the point that stands on the grid, as a fraction of the cropped size: a tile block's
top-face centre, a tree's or boat's foot.
"""
import json
import os
import subprocess
import sys

from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')
OUT = os.path.join(ROOT, 'island-hop')

if len(sys.argv) != 2:
    sys.exit('usage: build-assets.py /path/to/games-private')
K = os.path.join(sys.argv[1], 'kenney-all-in-1')
TWOD = os.path.join(K, '2D assets')
BASE = os.path.join(TWOD, 'Isometric Tiles Base', 'PNG', 'landscapeTiles_%s.png')
BLD = os.path.join(TWOD, 'Isometric Tiles Buildings', 'PNG', 'buildingTiles_%s.png')
CITY = os.path.join(TWOD, 'Isometric Tiles City', 'PNG', 'cityTiles_%s.png')
VEH = os.path.join(TWOD, 'Isometric Tiles Vehicles', 'PNG', '%s', '%s_%s.png')
NATURE = os.path.join(TWOD, 'Isometric Nature', 'PNG', 'naturePack_%s_%d.png')
CRAFT = os.path.join(TWOD, 'Isometric Watercraft', 'PNG', 'watercraftPack_%03d_%d.png')
AUDIO = os.path.join(K, 'Audio')

# name: (path, scale, anchor) with anchor 'tile' (the block's top-face centre: 66 px right, 33 px
# down from the uncropped image's top-left at scale 1) or a foot as a fraction of the cropped size.
sprites = {}

# Tiles Base: blocks drawn at their own size. Water is a thinner block (83 px) than land (99 px),
# so land stands 16 px above it.
sprites['water'] = (BASE % '066', 1, 'tile')
sprites['grass'] = (BASE % '067', 1, 'tile')
sprites['sand'] = (BASE % '059', 1, 'tile')
# Roads by which edges connect: bit 1 = -y, 2 = +x, 4 = +y, 8 = -x (shared/iso.js grid terms).
ROADS = {0: '081', 10: '074', 5: '082', 2: '105', 8: '112', 4: '111', 1: '117', 6: '114', 12: '119',
         9: '122', 3: '118', 14: '080', 11: '095', 7: '087', 13: '088', 15: '090'}
for mask, n in ROADS.items():
    sprites['road%d' % mask] = (BASE % n, 1, 'tile')
# Tiles City: paving for car parks and plazas, a fountain and a planter.
sprites['paving'] = (CITY % '066', 1, 'tile')
sprites['fountain'] = (CITY % '043', 1, 'tile')
sprites['planter'] = (CITY % '067', 1, 'tile')
# Tiles Buildings: whole buildings on their own block, one tile each.
BUILDINGS = ['001', '002', '003', '004', '009', '010', '011', '012', '014', '017', '018', '019', '020', '021',
             '022', '025', '026', '027', '028', '029', '030', '033', '034', '035', '036', '037', '040', '041',
             '042', '046']
for n in BUILDINGS:
    sprites['bld' + n] = (BLD % n, 1, 'tile')
# Tiles Vehicles: the 8 flat headings (the ramp frames are unused), named by screen direction, at
# twice their size, so a car is about half a tile long.
CARDIRS = ['NW', 'N', 'NE', 'E', 'SE', 'S', 'SW', 'W']  # frame k: up-left, then clockwise
for folder, stem in [('Taxi', 'taxi'), ('Police', 'police'), ('Ambulance', 'ambulance'), ('Garbage', 'garbage')]:
    for k, d in enumerate(CARDIRS):
        sprites['%s%d' % (stem, k)] = (VEH % (folder, stem, d), 2, 0.72)  # about half a tile long
# Isometric Nature: trees and rocks, from its 180 px tile to 132.
NS = 132 / 180
TREES = ['061', '167', '062', '065', '068', '070', '084', '088', '139', '148', '159', '163']
ROCKS = ['007', '010', '015', '133', '152', '170', '045']
for n in TREES:
    sprites['tree' + n] = (NATURE % (n, 0), NS, 0.96)
for n in ROCKS:
    sprites['rock' + n] = (NATURE % (n, 0), NS, 0.8)
# Isometric Watercraft: all 29 at 8 headings (frame k: up-left, then clockwise), one scale.
for b in range(1, 30):
    for k in range(8):
        sprites['craft%d_%d' % (b, k)] = (CRAFT % (b, k), 0.72, 0.7)

images = {}
for name, (path, scale, anchor) in sprites.items():
    im = Image.open(path).convert('RGBA')
    box = im.getbbox()
    crop = im.crop(box)
    if anchor == 'tile':
        # The top face's centre: 33 px down on a water block; on a land block (99 px or taller,
        # buildings standing on theirs) 66 px above the bottom, where its block's face is.
        face = im.height - 66 if im.height >= 95 else 33
        ax = (66 - box[0]) / crop.width
        ay = (face - box[1]) / crop.height
    else:
        ax, ay = 0.5, anchor
    w, h = max(1, round(crop.width * scale)), max(1, round(crop.height * scale))
    images[name] = (crop.resize((w, h), Image.LANCZOS) if scale != 1 else crop, ax, ay)

# Shelf packing, tallest first.
order = sorted(images, key=lambda n: -images[n][0].height)
W = 2048
x = y = shelf = 0
placed = {}
for name in order:
    im = images[name][0]
    if x + im.width + 2 > W:
        x, y, shelf = 0, y + shelf + 2, 0
    placed[name] = (x, y)
    x += im.width + 2
    shelf = max(shelf, im.height)
H = y + shelf
atlas = Image.new('RGBA', (W, H), (0, 0, 0, 0))
table = {}
for name, (px, py) in placed.items():
    im, ax, ay = images[name]
    atlas.paste(im, (px, py))
    table[name] = [px, py, im.width, im.height, round(ax, 3), round(ay, 3)]
os.makedirs(os.path.join(OUT, 'img'), exist_ok=True)
# Flat art keeps its look in a 256-colour palette, at a third of the size.
atlas.quantize(256, method=Image.Quantize.FASTOCTREE).save(os.path.join(OUT, 'img', 'atlas.png'), optimize=True)
with open(os.path.join(OUT, 'atlas.js'), 'w') as f:
    f.write('// Generated by scripts/island-hop/build-assets.py: name -> [x, y, w, h, anchorX, anchorY].\n')
    f.write('// Art by Kenney (CC0): Isometric Tiles Base, Buildings, City and Vehicles, Isometric Nature\n')
    f.write('// and Isometric Watercraft.\n')
    f.write('export const ATLAS = ' + json.dumps(table, separators=(',', ':')) + ';\n')
print('atlas %dx%d, %d sprites' % (W, H, len(table)))

# Sounds: MP3, because Safari doesn't play OGG.
os.makedirs(os.path.join(OUT, 'sounds'), exist_ok=True)


def mp3(dst, args):
    out = os.path.join(OUT, 'sounds', dst + '.mp3')
    subprocess.run(['ffmpeg', '-v', 'error', '-y', *args, '-ac', '1', '-ar', '44100', '-b:a', '64k', out], check=True)


def take(dst, src, extra=None):
    mp3(dst, ['-i', os.path.join(AUDIO, src), *(['-af', extra] if extra else [])])


take('step', 'Impact Sounds/Audio/footstep_concrete_000.ogg', 'volume=0.7')
take('door', 'RPG Audio/Audio/doorClose_1.ogg')
take('creak', 'RPG Audio/Audio/creak1.ogg')
take('bump', 'Impact Sounds/Audio/impactWood_heavy_001.ogg')
take('chime', 'Impact Sounds/Audio/impactBell_heavy_000.ogg', 'volume=0.6')
take('jingle', 'Music Jingles/Audio (Steeldrum)/jingles-steel_10.ogg')
take('nope', 'Interface Sounds/Audio/error_004.ogg', 'volume=0.6')
# The sea: brown noise, low-passed, swelling like waves; 12 s, faded at both ends to loop without a click.
mp3(
    'sea',
    [
        '-f', 'lavfi', '-i', 'anoisesrc=color=brown:amplitude=0.6:duration=12:seed=7',
        '-af',
        'lowpass=f=700,highpass=f=60,volume=0.9,'
        "volume='0.55+0.45*sin(2*PI*t/6)':eval=frame,"
        'afade=t=in:d=0.05,afade=t=out:st=11.95:d=0.05',
    ],
)
# Ashore: a light breeze, airier than the sea (pink noise, band-passed, swelling slowly); 12 s, faded
# at both ends to loop.
mp3(
    'land',
    [
        '-f', 'lavfi', '-i', 'anoisesrc=color=pink:amplitude=0.35:duration=12:seed=11',
        '-af',
        'highpass=f=300,lowpass=f=2400,volume=0.6,'
        "volume='0.45+0.35*sin(2*PI*t/8)+0.2*sin(2*PI*t/3)':eval=frame,"
        'afade=t=in:d=0.05,afade=t=out:st=11.95:d=0.05',
    ],
)
# An outboard's hum: a low buzzing square, warmed; 2 s to loop (its pitch follows the boat's speed).
mp3(
    'engine',
    [
        '-f', 'lavfi', '-i', "aevalsrc='0.35*sgn(sin(2*PI*55*t))+0.2*sin(2*PI*110*t)':d=2",
        '-af', 'lowpass=f=500,volume=0.7,afade=t=in:d=0.02,afade=t=out:st=1.98:d=0.02',
    ],
)
# A car engine: lower and smoother than the boat's.
mp3(
    'motor',
    [
        '-f', 'lavfi', '-i', "aevalsrc='0.3*sin(2*PI*42*t)+0.2*sgn(sin(2*PI*84*t))':d=2",
        '-af', 'lowpass=f=350,volume=0.8,afade=t=in:d=0.02,afade=t=out:st=1.98:d=0.02',
    ],
)
print('sounds written')

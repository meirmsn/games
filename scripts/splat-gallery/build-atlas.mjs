// Builds splat-gallery/img/atlas.png and splat-gallery/atlas.js from the Kenney Shooting
// Gallery pack's vector file. The pack lives in the private assets repo; pass its Vector folder:
//   node scripts/splat-gallery/build-atlas.mjs "<games-private>/kenney-all-in-1/2D assets/Shooting Gallery/Vector"
// The pack's PNGs are 1x (a 128 px target), which blur on a phone at pixel ratio 2, so the one SVG
// that holds every sprite is rasterised in Chromium at SCALE x and each sprite is cropped from it.
// The rectangles below are where each sprite sits in the SVG (found once by matching the PNGs'
// sizes and layout); they are in SVG units, the same as the 1x PNG sizes.
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const src = process.argv[2];
if (!src) throw new Error('usage: build-atlas.mjs <Shooting Gallery/Vector folder>');
const out = new URL('../../splat-gallery/', import.meta.url).pathname;
const SCALE = 2;

// name: [x, y, w, h] in the SVG, and whether it tiles (tiles keep their edges for seamless repeats).
const RECTS = {
  target_red1: [13, 163, 142, 142],
  target_red2: [163, 163, 142, 142],
  target_red3: [313, 163, 142, 142],
  target_colored: [613, 163, 142, 142],
  target_back: [763, 163, 142, 142],
  duck_yellow: [925, 253, 114, 109],
  duck_brown: [1045, 253, 114, 109],
  duck_white: [1165, 253, 114, 109],
  duck_target_yellow: [925, 373, 114, 109],
  duck_target_brown: [1045, 373, 114, 109],
  duck_target_white: [1165, 373, 114, 109],
  duck_back: [1285, 133, 114, 109],
  stick_metal: [69, 328, 30, 124],
  stick_wood: [189, 328, 30, 124],
  stick_wood_fixed: [309, 328, 30, 124],
  stick_metal_broken: [417, 393, 14, 59],
  stick_wood_broken: [497, 393, 14, 59],
  shot_hole: [65, 473, 20, 20],
  shot_hole_tin: [25, 473, 20, 20],
  tree_pine: [1429, 20, 119, 255],
  tree_oak: [1561, 31, 143, 244],
  cloud1: [1715, 191, 134, 82],
  cloud2: [1860, 187, 142, 84],
  water1: [1334, 296, 132, 224, 'x'],
  water2: [1486, 298, 132, 223, 'x'],
  grass1: [1637, 321, 132, 200, 'x'],
  grass2: [1789, 305, 132, 216, 'x'],
  rifle: [1970, 321, 142, 319],
  curtain: [309, 598, 131, 426],
  curtain_straight: [309, 498, 256, 79, 'x'],
  curtain_top: [405, 818, 200, 63],
  curtain_rope: [459, 599, 40, 21],
  shell: [25, 606, 22, 44],
  shell_empty: [105, 606, 22, 44],
  bg_wood: [630, 819, 256, 254, 'xy'],
  bg_blue: [906, 819, 256, 254, 'xy'],
  bg_red: [1182, 819, 256, 254, 'xy'],
  bg_green: [1458, 819, 256, 254, 'xy'],
};

const svg = readFileSync(join(src, 'vector_shootingGallery.svg'), 'utf8');
const browser = await chromium.launch();
const page = await browser.newPage();
const result = await page.evaluate(
  async ({ svg, RECTS, SCALE }) => {
    const sized = svg.replace('<svg ', '<svg width="2260" height="1100" viewBox="0 0 2260 1100" ');
    const img = new Image();
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(sized);
    await img.decode();
    const full = document.createElement('canvas');
    full.width = 2260 * SCALE;
    full.height = 1100 * SCALE;
    full.getContext('2d').drawImage(img, 0, 0, full.width, full.height);
    const PAD = 2;
    const items = Object.entries(RECTS).map(([name, [x, y, w, h, tile = '']]) => ({
      name,
      tile,
      sx: x * SCALE,
      sy: y * SCALE,
      w: w * SCALE,
      h: h * SCALE,
    }));
    // A tile is trimmed by a pixel on its tiling sides, so the anti-aliased edge doesn't show as a seam.
    for (const it of items) {
      if (it.tile.includes('x')) {
        it.sx += 1;
        it.w -= 2;
      }
      if (it.tile.includes('y')) {
        it.sy += 1;
        it.h -= 2;
      }
    }
    const W = 2048;
    const order = [...items].sort((a, b) => b.h - a.h);
    let x = 0,
      y = 0,
      rowH = 0;
    for (const it of order) {
      if (x + it.w + PAD * 2 > W) {
        x = 0;
        y += rowH;
        rowH = 0;
      }
      it.ax = x + PAD;
      it.ay = y + PAD;
      x += it.w + PAD * 2;
      rowH = Math.max(rowH, it.h + PAD * 2);
    }
    const H = y + rowH;
    const atlas = document.createElement('canvas');
    atlas.width = W;
    atlas.height = H;
    const ag = atlas.getContext('2d');
    const frames = {};
    for (const it of items) {
      if (it.tile) {
        // Edge pixels repeated into the padding, so scaled tiles don't show seams.
        ag.drawImage(full, it.sx, it.sy, it.w, 1, it.ax, it.ay - PAD, it.w, PAD);
        ag.drawImage(full, it.sx, it.sy + it.h - 1, it.w, 1, it.ax, it.ay + it.h, it.w, PAD);
        ag.drawImage(full, it.sx, it.sy, 1, it.h, it.ax - PAD, it.ay, PAD, it.h);
        ag.drawImage(full, it.sx + it.w - 1, it.sy, 1, it.h, it.ax + it.w, it.ay, PAD, it.h);
      }
      ag.drawImage(full, it.sx, it.sy, it.w, it.h, it.ax, it.ay, it.w, it.h);
      frames[it.name] = [it.ax, it.ay, it.w, it.h];
    }
    return { png: atlas.toDataURL('image/png'), frames, W, H };
  },
  { svg, RECTS, SCALE }
);
await browser.close();

mkdirSync(join(out, 'img'), { recursive: true });
writeFileSync(join(out, 'img/atlas.png'), Buffer.from(result.png.split(',')[1], 'base64'));
const lines = Object.entries(result.frames).map(([k, v]) => `  ${k}: [${v.join(', ')}],`);
writeFileSync(
  join(out, 'atlas.js'),
  '// Generated by scripts/splat-gallery/build-atlas.mjs from the Kenney Shooting Gallery pack (CC0).\n' +
    `// Do not edit. name: [x, y, w, h] in img/atlas.png, drawn at ${SCALE}x the pack's 1x size.\n` +
    `export const ATLAS_SCALE = ${SCALE};\n` +
    'export const FRAMES = {\n' +
    lines.join('\n') +
    '\n};\n'
);
console.log(`atlas ${result.W}x${result.H}, ${Object.keys(result.frames).length} frames`);

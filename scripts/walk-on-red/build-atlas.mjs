// Builds walk-on-red/atlas.js (the frame list) and copies walk-on-red/img/vehicles.png from Kenney's
// Pixel Vehicle Pack (CC0), from the private asset repo:
//   node scripts/walk-on-red/build-atlas.mjs "<path to>/Pixel Vehicle Pack"
import { readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';

const pack = process.argv[2];
if (!pack) {
  console.error('usage: node scripts/walk-on-red/build-atlas.mjs "<path to Pixel Vehicle Pack>"');
  process.exit(2);
}
const root = new URL('../../walk-on-red/', import.meta.url).pathname;
const xml = readFileSync(join(pack, 'Spritesheet/spritesheet_complete.xml'), 'utf8');
const lines = [
  "// Frames of walk-on-red/img/vehicles.png, Kenney's Pixel Vehicle Pack spritesheet (CC0), from its",
  '// spritesheet_complete.xml: name -> [x, y, width, height]. Vehicles face right.',
  '// Made by scripts/walk-on-red/build-atlas.mjs.',
  'export const FRAMES = {',
];
for (const m of xml.matchAll(/<SubTexture name="([^"]+)\.png" x="(\d+)" y="(\d+)" width="(\d+)" height="(\d+)"\/>/g)) {
  lines.push(`  ${m[1]}: [${m[2]}, ${m[3]}, ${m[4]}, ${m[5]}],`);
}
lines.push('};', '');
writeFileSync(join(root, 'atlas.js'), lines.join('\n'));
copyFileSync(join(pack, 'Spritesheet/spritesheet_complete.png'), join(root, 'img/vehicles.png'));
console.log(`atlas: ${lines.length - 6} frames`);

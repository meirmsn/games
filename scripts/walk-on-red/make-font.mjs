// Builds walk-on-red/fonts/pixel.otf from the game's pixel alphabet (walk-on-red/pixel-font.js), so
// the page's own text (cards, banners, HUD) looks like the street's. Each '1' becomes a square;
// lower case uses the upper-case glyphs. Run after changing the alphabet:
//   npm install --no-save opentype.js@1.3.4
//   node scripts/walk-on-red/make-font.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import opentype from 'opentype.js';
import { GLYPHS, STAR, STAR_OPEN } from '../../walk-on-red/pixel-font.js';

const PX = 125; // font units per pixel: 1000 units per em, so a pixel is 1/8 em
const TOP = 5; // the glyphs stand on the baseline, 5 pixels tall

function glyph(name, unicode, rows, width) {
  const path = new opentype.Path();
  rows.forEach((row, j) =>
    [...row].forEach((b, i) => {
      if (b !== '1') return;
      const x = i * PX;
      const y = (TOP - j) * PX; // font y goes up
      path.moveTo(x, y);
      path.lineTo(x, y - PX);
      path.lineTo(x + PX, y - PX);
      path.lineTo(x + PX, y);
      path.close();
    })
  );
  return new opentype.Glyph({ name, unicode, advanceWidth: (width + 1) * PX, path });
}

const rowsOf = (bits) => [0, 1, 2, 3, 4].map((j) => bits.slice(j * 3, j * 3 + 3));
const glyphs = [new opentype.Glyph({ name: '.notdef', advanceWidth: 4 * PX, path: new opentype.Path() }), new opentype.Glyph({ name: 'space', unicode: 32, advanceWidth: 4 * PX, path: new opentype.Path() })];
for (const [ch, bits] of Object.entries(GLYPHS)) {
  const code = ch.codePointAt(0);
  glyphs.push(glyph(`u${code.toString(16)}`, code, rowsOf(bits), 3));
  const lower = ch.toLowerCase();
  if (lower !== ch) glyphs.push(glyph(`u${lower.codePointAt(0).toString(16)}`, lower.codePointAt(0), rowsOf(bits), 3));
}
glyphs.push(glyph('star', 0x2605, STAR, 5));
glyphs.push(glyph('staropen', 0x2606, STAR_OPEN, 5));

const font = new opentype.Font({
  familyName: 'Walk on Red Pixel',
  styleName: 'Regular',
  unitsPerEm: 1000,
  ascender: 6 * PX,
  descender: -2 * PX,
  glyphs,
});
const out = new URL('../../walk-on-red/fonts/pixel.otf', import.meta.url).pathname;
mkdirSync(new URL('../../walk-on-red/fonts/', import.meta.url).pathname, { recursive: true });
writeFileSync(out, Buffer.from(font.toArrayBuffer()));
console.log(`font: ${out} (${glyphs.length} glyphs)`);

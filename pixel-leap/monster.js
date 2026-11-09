// The player's monster, built from the Monster Builder Pack.
//
// A monster is six choices (body shape, colour, eyes, mouth, arms, legs), kept as a six-letter code
// for the URL (#m=…) and localStorage. It is drawn two ways, by the world's rule:
//   - drawVector(): the smooth parts, with swinging arms and legs (the Candy world, the builder)
//   - bake(): pose frames at a pixel world's resolution, with binary alpha and a 1-px outline,
//     the eyes and mouth enlarged so the face still reads at 28 px tall (the Meadow)
import { MONSTER } from './monster-atlas.js';

export const SHAPES = ['A', 'B', 'C', 'D', 'E', 'F'];
export const COLOURS = ['green', 'blue', 'red', 'yellow', 'white', 'dark'];
// Each eye option is a sprite and how many of them.
export const EYES = [
  ['eye_human', 2], ['eye_cute_light', 1], ['eye_yellow', 3], ['eye_human_blue', 2],
  ['eye_psycho_light', 1], ['eye_red', 2], ['eye_cute_dark', 2], ['eye_angry_green', 2],
  ['eye_blue', 1], ['eye_human_red', 3], ['eye_closed_happy', 2], ['eye_psycho_dark', 1],
];
export const MOUTHS = [
  'mouthA', 'mouthB', 'mouthC', 'mouthD', 'mouthE', 'mouthF', 'mouthG', 'mouthH', 'mouthI',
  'mouthJ', 'mouth_closed_fangs', 'mouth_closed_happy', 'mouth_closed_teeth',
];
export const LIMBS = ['A', 'B', 'C', 'D', 'E'];
export const PARTS = [
  { key: 'shape', label: 'Body', n: SHAPES.length },
  { key: 'colour', label: 'Colour', n: COLOURS.length },
  { key: 'eyes', label: 'Eyes', n: EYES.length },
  { key: 'mouth', label: 'Mouth', n: MOUTHS.length },
  { key: 'arms', label: 'Arms', n: LIMBS.length },
  { key: 'legs', label: 'Legs', n: LIMBS.length },
];

const LETTERS = 'abcdefghijklmnopqrstuvwxyz';
// The monster's height in tiles, feet to the top of its head: the same in every world.
export const HEIGHT = 1.55;

export function randomMonster(rnd = Math.random) {
  const m = {};
  for (const p of PARTS) m[p.key] = Math.floor(rnd() * p.n);
  return m;
}

export function encode(m) {
  return PARTS.map((p) => LETTERS[m[p.key]]).join('');
}

// A code that isn't six valid letters gives null, so the caller can fall back to a random monster.
export function decode(code) {
  if (typeof code !== 'string' || code.length !== PARTS.length) return null;
  const m = {};
  for (let i = 0; i < PARTS.length; i++) {
    const v = LETTERS.indexOf(code[i].toLowerCase());
    if (v < 0 || v >= PARTS[i].n) return null;
    m[PARTS[i].key] = v;
  }
  return m;
}

function frame(name) {
  return MONSTER[name];
}

// The layout of a monster, in the atlas's pixels, with its feet at y = 0 and its middle at x = 0.
function layout(m) {
  const col = COLOURS[m.colour];
  const body = frame(`body_${col}${SHAPES[m.shape]}`);
  const arm = frame(`arm_${col}${LIMBS[m.arms]}`);
  const leg = frame(`leg_${col}${LIMBS[m.legs]}`);
  const [, , bw, bh] = body;
  const legShow = Math.min(leg[3] * 0.5, 80); // the legs tuck up behind the body
  const total = bh + legShow;
  return { col, body, arm, leg, bw, bh, legShow, total, bodyTop: -total, bodyBottom: -legShow };
}

// Draws one sprite from the atlas, its pivot (px, py as fractions of its size) at (x, y).
function part(ctx, img, f, x, y, { px = 0.5, py = 0.5, rot = 0, flip = false, s = 1 } = {}) {
  ctx.save();
  ctx.translate(x, y);
  if (rot) ctx.rotate(rot);
  ctx.scale(flip ? -s : s, s);
  ctx.drawImage(img, f[0], f[1], f[2], f[3], -f[2] * px, -f[3] * py, f[2], f[3]);
  ctx.restore();
}

// pose: { run (0..1 phase), air (-1 rising … 1 falling), squash (0 none, + squashed, - stretched),
// look (−1 left, 1 right), ears (the prize), blink, wiggle }
// scale: device pixels per atlas pixel. faceBoost: how much larger the eyes and mouth are drawn.
export function drawVector(ctx, img, m, x, y, scale, pose = {}, faceBoost = 1) {
  const L = layout(m);
  const { run = 0, moving = 0, air = 0, squash = 0, look = 1, ears = false, wiggle = 0, blink = 0 } = pose;
  ctx.save();
  ctx.translate(x, y);
  const sx = scale * (1 + squash * 0.18);
  const sy = scale * (1 - squash * 0.18);
  ctx.scale(look < 0 ? -sx : sx, sy);
  if (wiggle) ctx.rotate(Math.sin(wiggle * 30) * wiggle * 0.25);
  const swing = Math.sin(run * Math.PI * 2) * moving;
  const inAir = air !== 0;
  // Legs, behind the body.
  const hipY = L.bodyBottom - 6;
  const legSpread = Math.min(L.bw * 0.22, 40);
  const legRot = inAir ? 0.35 * Math.sign(air || 1) : swing * 0.55;
  const lift = inAir ? Math.min(L.legShow * 0.35, 20) : 0;
  const legTop = hipY - (L.leg[3] - L.legShow) + 6;
  part(ctx, img, L.leg, -legSpread, legTop - lift, { px: 0.5, py: 0, rot: legRot });
  part(ctx, img, L.leg, legSpread, legTop - lift * 0.4, { px: 0.5, py: 0, rot: -legRot * 0.9 });
  // Arms, behind the body: they swing opposite the legs, and fly up in the air.
  const shoulderY = L.bodyTop + L.bh * 0.5;
  const armX = L.bw * 0.42;
  const armRot = inAir ? 2.2 - air * 0.5 : 0.25 + swing * 0.5;
  part(ctx, img, L.arm, -armX, shoulderY, { px: 0.5, py: 0.08, rot: armRot, flip: true });
  part(ctx, img, L.arm, armX, shoulderY, { px: 0.5, py: 0.08, rot: -armRot + (inAir ? 0 : swing), });
  // The prize: big round ears on top of the head.
  if (ears) {
    const ear = frame(`detail_${L.col}_ear_round`);
    part(ctx, img, ear, -L.bw * 0.3, L.bodyTop + 14, { px: 0.5, py: 0.9, rot: -0.35 - air * 0.2 });
    part(ctx, img, ear, L.bw * 0.3, L.bodyTop + 14, { px: 0.5, py: 0.9, rot: 0.35 + air * 0.2, flip: true });
  }
  part(ctx, img, L.body, 0, L.bodyBottom, { px: 0.5, py: 1 });
  // The face, looking a little ahead.
  const [eyeName, count] = EYES[m.eyes];
  const eye = frame(eyeName);
  const fb = faceBoost;
  const faceX = L.bw * 0.08;
  const eyeY = L.bodyTop + L.bh * 0.36;
  const eyeS = (Math.min(1, (L.bw * 0.78) / (eye[2] * count)) || 1) * fb;
  const gap = eye[2] * eyeS * 0.98;
  for (let i = 0; i < count; i++) {
    const ex = faceX + (i - (count - 1) / 2) * gap;
    const ey = eyeY - (count === 3 && i === 1 ? eye[3] * eyeS * 0.35 : 0);
    if (blink > 0) {
      ctx.save();
      ctx.translate(ex, ey);
      ctx.scale(1, 0.12);
      part(ctx, img, eye, 0, 0, { s: eyeS });
      ctx.restore();
    } else part(ctx, img, eye, ex, ey, { s: eyeS });
  }
  const mouth = frame(MOUTHS[m.mouth]);
  const mouthS = Math.min(fb, (L.bw * 0.7) / mouth[2]);
  part(ctx, img, mouth, faceX, L.bodyTop + L.bh * 0.68, { s: mouthS });
  ctx.restore();
}

// The atlas scale that makes a monster HEIGHT tiles tall at `pxPerTile`.
export function scaleFor(m, pxPerTile) {
  return (HEIGHT * pxPerTile) / layout(m).total;
}

// The poses a pixel world bakes: standing (2, a breath), running (4), rising, falling, landing.
export const POSES = {
  stand0: { run: 0, moving: 0 },
  stand1: { run: 0, moving: 0, squash: 0.18 },
  run0: { run: 0.0, moving: 1 },
  run1: { run: 0.25, moving: 1, squash: 0.08 },
  run2: { run: 0.5, moving: 1 },
  run3: { run: 0.75, moving: 1, squash: 0.08 },
  rise: { air: -1, squash: -0.25 },
  fall: { air: 1 },
  land: { squash: 0.45 },
};

// Bakes every pose at `pxPerTile` (e.g. 18): each frame is a small canvas with the monster's feet at
// the bottom middle. Alpha is made binary and a 1-px outline in `outline` is added, the way the
// pack's own characters are drawn. Returns { frames, w, h, footX, footY }.
export function bake(img, m, pxPerTile, { outline = '#262338', ears = false, faceBoost = 1.4 } = {}) {
  const s = scaleFor(m, pxPerTile);
  const w = Math.ceil(pxPerTile * 2.6);
  const h = Math.ceil(pxPerTile * 2.4);
  const footX = Math.floor(w / 2);
  const footY = h - 2;
  const [or, og, ob] = hex(outline);
  const frames = {};
  for (const [name, pose] of Object.entries(POSES)) {
    const c = makeCanvas(w, h);
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    drawVector(g, img, m, footX, footY + 1, s, { ...pose, ears }, faceBoost);
    const data = g.getImageData(0, 0, w, h);
    const d = data.data;
    const solid = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) {
      const a = d[i * 4 + 3];
      if (a >= 110) {
        solid[i] = 1;
        // Undo the premultiplied fringe and make the pixel opaque.
        const k = 255 / a;
        d[i * 4] = Math.min(255, d[i * 4] * (a < 250 ? k * 0.92 : 1));
        d[i * 4 + 1] = Math.min(255, d[i * 4 + 1] * (a < 250 ? k * 0.92 : 1));
        d[i * 4 + 2] = Math.min(255, d[i * 4 + 2] * (a < 250 ? k * 0.92 : 1));
        d[i * 4 + 3] = 255;
      } else d[i * 4 + 3] = 0;
    }
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (solid[i]) continue;
        const n =
          (x > 0 && solid[i - 1]) || (x < w - 1 && solid[i + 1]) || (y > 0 && solid[i - w]) || (y < h - 1 && solid[i + w]);
        if (n) {
          d[i * 4] = or;
          d[i * 4 + 1] = og;
          d[i * 4 + 2] = ob;
          d[i * 4 + 3] = 255;
        }
      }
    }
    g.putImageData(data, 0, 0);
    frames[name] = c;
  }
  return { frames, w, h, footX, footY };
}

function hex(c) {
  const v = parseInt(c.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

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
  if (pose.noFace) {
    ctx.restore();
    return;
  }
  // The face, looking a little ahead.
  const [eyeName, count] = EYES[m.eyes];
  const eye = frame(eyeName);
  const fb = faceBoost;
  const faceX = L.bw * 0.08;
  const eyeY = L.bodyTop + L.bh * 0.36;
  const eyeS = (Math.min(1, (L.bw * (count === 3 ? 0.95 : 0.78)) / (eye[2] * count)) || 1) * fb;
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
// oneBit ({ ink, dark }): a two-colour world, drawn like the pack's own characters: a solid ink
// body with its dark features (pupils, mouth) cut out; the outline is the dark of the world.
// fixed (a list of '#rrggbb'): a world with a fixed palette (Pico's 16): every pixel of the baked
// monster is mapped to its nearest colour in that list.
export function bake(img, m, pxPerTile, { outline = '#262338', ears = false, faceBoost = 1.4, oneBit = null, fixed = null } = {}) {
  const s = scaleFor(m, pxPerTile);
  const w = Math.ceil(pxPerTile * 4);
  const h = Math.ceil(pxPerTile * 3.6);
  const footX = Math.floor(w / 2);
  const footY = h - 2;
  const [or, og, ob] = hex(outline);
  const pal = palette(img, m, s, ears, faceBoost, hex(outline));
  const two = oneBit ? [hex(oneBit.ink), hex(oneBit.dark)] : null;
  const toTwo = (col) => {
    if (col === pal[1]) return two[0]; // the body's main colour
    const lum = col[0] * 0.3 + col[1] * 0.59 + col[2] * 0.11;
    return lum > 150 ? two[0] : two[1];
  };
  const face = pixelFaceColours(img, m, pal, hex(outline), two);
  const fillIdx = pal.length > 1 ? 1 : 0; // the body's colour (a dark body is the outline's)
  const frames = {};
  for (const [name, pose] of Object.entries(POSES)) {
    const c = makeCanvas(w, h);
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    // The body, arms and legs only: the face is drawn afterwards, pixel by pixel.
    drawVector(g, img, m, footX, footY, s, { ...pose, ears, noFace: true }, faceBoost);
    const data = g.getImageData(0, 0, w, h);
    const d = data.data;
    const solid = new Uint8Array(w * h);
    const idx = new Int8Array(w * h).fill(-1); // each pixel's palette entry
    for (let i = 0; i < w * h; i++) {
      const a = d[i * 4 + 3];
      if (a >= 110) {
        solid[i] = 1;
        // Opaque, and snapped to the monster's own short palette: no in-between shades.
        idx[i] = nearestIndex(pal, d[i * 4], d[i * 4 + 1], d[i * 4 + 2]);
      }
    }
    // Smooth out lone pixels: a pixel whose colour almost none of its neighbours share takes the
    // colour most of them have. Shapes stay whole and uniform instead of speckled.
    for (let pass = 0; pass < 2; pass++) {
      const next = idx.slice();
      for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          const i = y * w + x;
          if (idx[i] < 0) continue;
          const tally = new Map();
          let same = 0;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (!dx && !dy) continue;
              const v = idx[i + dy * w + dx];
              if (v < 0) continue;
              if (v === idx[i]) same++;
              tally.set(v, (tally.get(v) || 0) + 1);
            }
          }
          if (same > 1) continue;
          let best = -1;
          let bn = 0;
          for (const [v, n] of tally) if (n > bn) [best, bn] = [v, n];
          if (bn >= 4) next[i] = best;
        }
      }
      idx.set(next);
    }
    // Fill the gaps inside the silhouette (between an arm and the body, say), which would otherwise
    // be outlined into little hollow loops: thin slits first, then any hole not open to the outside.
    for (let pass = 0; pass < 2; pass++) {
      const next = idx.slice();
      for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          const i = y * w + x;
          if (idx[i] >= 0) continue;
          const l = idx[i - 1];
          const r = idx[i + 1];
          const u = idx[i - w];
          const dn = idx[i + w];
          if (l >= 0 && r >= 0) next[i] = l === r ? l : fillIdx;
          else if (u >= 0 && dn >= 0) next[i] = u === dn ? u : fillIdx;
        }
      }
      idx.set(next);
    }
    const outside = new Uint8Array(w * h);
    const stack = [];
    for (let x = 0; x < w; x++) stack.push(x, (h - 1) * w + x);
    for (let y = 0; y < h; y++) stack.push(y * w, y * w + w - 1);
    while (stack.length) {
      const i = stack.pop();
      if (outside[i] || idx[i] >= 0) continue;
      outside[i] = 1;
      const x = i % w;
      if (x > 0) stack.push(i - 1);
      if (x < w - 1) stack.push(i + 1);
      if (i >= w) stack.push(i - w);
      if (i < w * (h - 1)) stack.push(i + w);
    }
    for (let i = 0; i < w * h; i++) if (idx[i] < 0 && !outside[i]) idx[i] = fillIdx;
    for (let i = 0; i < w * h; i++) solid[i] = idx[i] >= 0 ? 1 : 0;
    for (let i = 0; i < w * h; i++) {
      if (idx[i] < 0) {
        d[i * 4 + 3] = 0;
        continue;
      }
      const col = pal[idx[i]];
      const [r, g2, b] = two ? toTwo(col) : col;
      d[i * 4] = r;
      d[i * 4 + 1] = g2;
      d[i * 4 + 2] = b;
      d[i * 4 + 3] = 255;
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
    // The face, drawn as pixel art: clean eyes and a clean mouth, sized to the body.
    pixelFace(d, w, h, m, s, pose, footX, footY, face, solid);
    if (fixed) {
      const fx = fixed.map(hex);
      for (let i = 0; i < w * h; i++) {
        if (!d[i * 4 + 3]) continue;
        const [r, g2, b] = nearest(fx, d[i * 4], d[i * 4 + 1], d[i * 4 + 2]);
        d[i * 4] = r;
        d[i * 4 + 1] = g2;
        d[i * 4 + 2] = b;
      }
    }
    g.putImageData(data, 0, 0);
    frames[name] = c;
  }
  return { frames, w, h, footX, footY };
}

// The colours of the pixel face: the eyes' own colour (white, red, yellow…), the outline's dark for
// pupils and mouths, white teeth and a pink tongue; any that would vanish into the body change.
function pixelFaceColours(img, m, pal, outline, two) {
  if (two) return { sclera: two[1], pupil: two[0], dark: two[1], tooth: two[0], tongue: null, ring: false };
  const [eyeName] = EYES[m.eyes];
  const f = MONSTER[eyeName];
  const c = makeCanvas(f[2], f[3]);
  const g = c.getContext('2d');
  g.drawImage(img, f[0], f[1], f[2], f[3], 0, 0, f[2], f[3]);
  const d = g.getImageData(0, 0, f[2], f[3]).data;
  const counts = new Map();
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 250) continue;
    const lum = d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11;
    if (lum < 70) continue; // the pupil
    const key = ((d[i] >> 4) << 8) | ((d[i + 1] >> 4) << 4) | (d[i + 2] >> 4);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  let sclera = [255, 255, 255];
  let top = 0;
  for (const [k, n] of counts) {
    if (n > top) {
      top = n;
      sclera = [((k >> 8) & 15) * 17, ((k >> 4) & 15) * 17, (k & 15) * 17];
    }
  }
  const body = pal[1] || pal[0];
  const near = (a, b) => dist2(a, b) < MIN_APART * MIN_APART;
  // Every face colour snaps to a palette colour it's close to, so no two near colours sit together.
  const snap = (col, among) => among.find((p) => near(p, col)) || col;
  sclera = snap(sclera, pal.slice(1));
  // An eye the body's own colour is ringed in dark, so it still reads.
  const ring = sclera === body;
  const tooth = snap([255, 255, 255], [body, sclera, ...pal.slice(1)]);
  const pink = [232, 80, 106];
  const tongue = [body, sclera, tooth, ...pal.slice(1)].some((p) => near(p, pink)) ? null : pink;
  return { sclera, pupil: outline, dark: outline, tooth, tongue, ring };
}

function pixelFace(d, w, h, m, s, pose, footX, footY, fc, solid) {
  const L = layout(m);
  const sq = pose.squash || 0;
  const sx = s * (1 + sq * 0.18);
  const sy = s * (1 - sq * 0.18);
  const bodyW = L.bw * sx;
  const cx = footX + L.bw * 0.08 * sx;
  // The face stays inside the body: never on its outline or past it.
  const set = (x, y, col) => {
    if (!col || x < 0 || y < 0 || x >= w || y >= h || !solid[y * w + x]) return;
    const i = (y * w + x) * 4;
    d[i] = col[0];
    d[i + 1] = col[1];
    d[i + 2] = col[2];
    d[i + 3] = 255;
  };
  const [eyeName, count] = EYES[m.eyes];
  const ew = Math.max(3, Math.min(count === 1 ? 10 : count === 2 ? 7 : 5, Math.round(bodyW * (count === 1 ? 0.5 : count === 2 ? 0.36 : 0.28))));
  const eh = Math.max(3, ew - (ew > 4 ? 1 : 0));
  const eyeCy = Math.round(footY + (L.bodyTop + L.bh * 0.36) * sy);
  const gap = ew + 1;
  const closed = /closed/.test(eyeName);
  const angry = /angry/.test(eyeName);
  const inside = (x, y) => {
    const nx = (x + 0.5 - ew / 2) / (ew / 2);
    const ny = (y + 0.5 - eh / 2) / (eh / 2);
    return nx * nx + ny * ny <= 1.2;
  };
  for (let k = 0; k < count; k++) {
    const ex = Math.round(cx + (k - (count - 1) / 2) * gap - ew / 2);
    const ey = eyeCy - Math.round(eh / 2) - (count === 3 && k === 1 ? Math.ceil(eh / 2) : 0);
    if (closed) {
      // A happy arch: ^
      for (let x = 0; x < ew; x++) {
        const t = Math.abs(x + 0.5 - ew / 2) / (ew / 2);
        set(ex + x, ey + Math.round(eh / 2 - 1 + t * (eh / 2)), fc.dark);
      }
      continue;
    }
    if (fc.ring) {
      for (let y = -1; y <= eh; y++) {
        for (let x = -1; x <= ew; x++) {
          if (inside(x, y)) continue;
          if (inside(x - 1, y) || inside(x + 1, y) || inside(x, y - 1) || inside(x, y + 1)) set(ex + x, ey + y, fc.dark);
        }
      }
    }
    for (let y = 0; y < eh; y++) for (let x = 0; x < ew; x++) if (inside(x, y)) set(ex + x, ey + y, fc.sclera);
    // The pupil looks ahead (frames face right; they're flipped to look left).
    const p = ew >= 7 ? 3 : ew >= 4 ? 2 : 1;
    const px = ex + Math.min(ew - p, Math.round(ew / 2 - p / 2 + (ew >= 5 ? 1 : 0)));
    const py = ey + Math.round(eh / 2 - p / 2);
    for (let y = 0; y < p; y++) for (let x = 0; x < p; x++) set(px + x, py + y, fc.pupil);
    if (p >= 3) set(px, py, fc.sclera); // a glint
    if (angry) {
      // A brow, sloping down towards the middle of the face.
      const inner = k < (count - 1) / 2 ? ew - 1 : 0;
      for (let x = 0; x < ew; x++) {
        const drop = Math.round((1 - Math.abs(x - inner) / Math.max(1, ew - 1)) * 1);
        set(ex + x, ey - 2 + drop, fc.dark);
      }
    }
  }
  // The mouth.
  const mouthName = MOUTHS[m.mouth];
  const mw = Math.max(5, Math.min(9, Math.round(bodyW * 0.42)));
  const mx = Math.round(cx - mw / 2);
  const my = Math.round(footY + (L.bodyTop + L.bh * 0.68) * sy);
  if (mouthName === 'mouth_closed_happy') {
    for (let x = 0; x < mw; x++) set(mx + x, my + (x === 0 || x === mw - 1 ? 0 : 1), fc.dark);
    for (let x = 2; x < mw - 2; x++) set(mx + x, my + 2, fc.dark);
  } else if (mouthName === 'mouth_closed_fangs') {
    for (let x = 0; x < mw; x++) set(mx + x, my, fc.dark);
    set(mx + 1, my + 1, fc.tooth);
    set(mx + mw - 2, my + 1, fc.tooth);
  } else if (mouthName === 'mouth_closed_teeth') {
    for (let x = 0; x < mw; x++) {
      set(mx + x, my, fc.dark);
      set(mx + x, my + 1, x === 0 || x === mw - 1 ? fc.dark : fc.tooth);
      set(mx + x, my + 2, fc.dark);
    }
  } else {
    // An open mouth: a rounded dark shape, with a tongue or a tooth.
    const mh = mw >= 5 ? 3 : 2;
    const n = MOUTHS.indexOf(mouthName);
    for (let y = 0; y < mh; y++) {
      for (let x = 0; x < mw; x++) {
        const corner = (y === 0 || y === mh - 1) && (x === 0 || x === mw - 1);
        if (corner && y === mh - 1) continue;
        if (corner && y === 0 && mh > 2) continue;
        set(mx + x, my + y, fc.dark);
      }
    }
    if (n % 2 === 0 && fc.tongue) for (let x = 2; x < mw - 2; x++) set(mx + x, my + mh - 1, fc.tongue);
    else set(mx + 1 + (n % 3), my, fc.tooth);
  }
}

// The monster's palette: the flat colours its parts are drawn in. The parts are drawn large, where
// anti-aliased edges are a tiny share of the pixels; colours are merged when close, and only those
// covering a real share of the monster are kept (at most 8), so blends at the edges never become
// colours of their own.
export const MIN_APART = 150; // how far apart (weighted RGB) any two palette colours must be
export function palette(img, m, s, ears, faceBoost, outline = [38, 35, 56]) {
  const big = 6;
  const w = Math.ceil((s * big * 1000) / 2.4) || 1;
  const c = makeCanvas(Math.min(900, w), Math.min(900, w));
  const g = c.getContext('2d');
  const scale = scaleFor(m, c.height / 2.3);
  drawVector(g, img, m, c.width / 2, c.height - 4, scale, { ears }, faceBoost);
  drawVector(g, img, m, c.width / 2, c.height - 4, scale, { ears, air: -1 }, faceBoost);
  const d = g.getImageData(0, 0, c.width, c.height).data;
  const counts = new Map();
  let total = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 250) continue;
    total++;
    const key = ((d[i] >> 2) << 12) | ((d[i + 1] >> 2) << 6) | (d[i + 2] >> 2);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const pal = [];
  for (const [key, n] of sorted) {
    const col = [((key >> 12) & 63) * 4 + 2, ((key >> 6) & 63) * 4 + 2, (key & 63) * 4 + 2];
    const near = pal.find((p) => dist2(p.col, col) < 34 * 34);
    if (near) near.n += n;
    else pal.push({ col, n });
  }
  const body = pal.filter((p) => p.n >= total * 0.004).slice(0, 4).map((p) => p.col);
  // No two colours may be near each other: the outline first, then the body's main colour, then
  // the face's (sclera, iris, pupil, mouth), then the body's shades. A colour too close to one
  // already in merges into it, so near-blacks become the outline and white and light grey one white.
  const face = faceColours(img, m);
  const chosen = [outline];
  for (const col of [body[0], ...face, ...body.slice(1)]) {
    if (!col || chosen.length >= 9) continue;
    if (chosen.every((p) => dist2(p, col) >= MIN_APART * MIN_APART)) chosen.push(col);
  }
  return chosen;
}

function faceColours(img, m) {
  const [eyeName] = EYES[m.eyes];
  const parts = [MONSTER[eyeName], MONSTER[MOUTHS[m.mouth]]];
  const counts = [];
  for (const f of parts) {
    const c = makeCanvas(f[2], f[3]);
    const g = c.getContext('2d');
    g.drawImage(img, f[0], f[1], f[2], f[3], 0, 0, f[2], f[3]);
    const d = g.getImageData(0, 0, f[2], f[3]).data;
    const map = new Map();
    let total = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 250) continue;
      total++;
      const key = ((d[i] >> 3) << 10) | ((d[i + 1] >> 3) << 5) | (d[i + 2] >> 3);
      map.set(key, (map.get(key) || 0) + 1);
    }
    const pal = [];
    for (const [key, n] of [...map.entries()].sort((a, b) => b[1] - a[1])) {
      const col = [((key >> 10) & 31) * 8 + 4, ((key >> 5) & 31) * 8 + 4, (key & 31) * 8 + 4];
      const near = pal.find((p) => dist2(p.col, col) < 30 * 30);
      if (near) near.n += n;
      else pal.push({ col, n });
    }
    for (const p of pal) if (p.n >= total * 0.05) counts.push(p.col);
  }
  return counts.slice(0, 5);
}
function dist2(a, b) {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return dr * dr * 2 + dg * dg * 3 + db * db;
}
function nearestIndex(pal, r, g, b) {
  let best = 0;
  let bd = Infinity;
  for (let i = 0; i < pal.length; i++) {
    const dd = dist2(pal[i], [r, g, b]);
    if (dd < bd) {
      bd = dd;
      best = i;
    }
  }
  return best;
}
function nearest(pal, r, g, b) {
  let best = pal[0];
  let bd = Infinity;
  for (const p of pal) {
    const dd = dist2(p, [r, g, b]);
    if (dd < bd) {
      bd = dd;
      best = p;
    }
  }
  return best;
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

// Line art (Scribble's rule): a picture redrawn as a pen drawing on paper. Its shape is filled with
// the paper's colour and traced with an ink line `r` px thick; its dark parts and the edges between
// its colours (eyes, mouth, a slime's face) are drawn in the same ink; nothing else keeps colour.
// boil (0, 1 or 2) picks one of three slightly different wobbles of the line, so drawn in turn the
// line boils like a hand-drawn cartoon's.
export const BOILS = 3;
export function toLineArt(src, { ink = '#1b1b1f', paper = '#fbf8ef', r = 5, boil = 0 } = {}) {
  const w = src.width;
  const h = src.height;
  const d = src.getContext('2d').getImageData(0, 0, w, h).data;
  const inside = new Uint8Array(w * h);
  const lum = new Float32Array(w * h);
  const wob = 0.55 + r * 0.09;
  for (let y = 0; y < h; y++) {
    const dx = Math.round(wob * Math.sin(y * 0.19 + boil * 2.3));
    for (let x = 0; x < w; x++) {
      const dy = Math.round(wob * Math.sin(x * 0.23 + boil * 1.7 + 1));
      const sx = Math.min(w - 1, Math.max(0, x + dx));
      const sy = Math.min(h - 1, Math.max(0, y + dy));
      const k = (sy * w + sx) * 4;
      const i = y * w + x;
      inside[i] = d[k + 3] >= 110 ? 1 : 0;
      lum[i] = d[k] * 0.3 + d[k + 1] * 0.59 + d[k + 2] * 0.11;
    }
  }
  // Erode the shape by r (a min filter, rows then columns): what's inside but not in the eroded
  // shape is the outline.
  const er1 = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let ok = 1;
      for (let k = -r; k <= r && ok; k++) {
        const xx = x + k;
        if (xx < 0 || xx >= w || !inside[y * w + xx]) ok = 0;
      }
      er1[y * w + x] = ok;
    }
  }
  const out = makeCanvas(w, h);
  const og = out.getContext('2d');
  const img = og.createImageData(w, h);
  const o = img.data;
  const [ir, ig, ib] = hex(ink);
  const [pr, pg, pb] = hex(paper);
  const feat = (i, x, y) => lum[i] < 45 || (x + 1 < w && inside[i + 1] && Math.abs(lum[i] - lum[i + 1]) > 55) || (y + 1 < h && inside[i + w] && Math.abs(lum[i] - lum[i + w]) > 55);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!inside[i]) continue;
      let eroded = 1;
      for (let k = -r; k <= r && eroded; k++) {
        const yy = y + k;
        if (yy < 0 || yy >= h || !er1[yy * w + x]) eroded = 0;
      }
      // A feature line: dark, or an edge between colours, thickened by a pixel.
      const line = !eroded || feat(i, x, y) || (x > 0 && inside[i - 1] && feat(i - 1, x - 1, y)) || (y > 0 && inside[i - w] && feat(i - w, x, y - 1));
      const q = i * 4;
      o[q] = line ? ir : pr;
      o[q + 1] = line ? ig : pg;
      o[q + 2] = line ? ib : pb;
      o[q + 3] = 255;
    }
  }
  og.putImageData(img, 0, 0);
  return out;
}
// The monster as Scribble draws it: each pose (POSES) at pxPerTile, in BOILS wobbles, made when
// first asked for. Returns { frame(name, boil), w, h, footX, footY }.
export function lineArt(img, m, pxPerTile, { ears = false, ink, paper } = {}) {
  const s = scaleFor(m, pxPerTile);
  const w = Math.ceil(pxPerTile * 4);
  const h = Math.ceil(pxPerTile * 3.6);
  const footX = Math.floor(w / 2);
  const footY = h - 2;
  const r = Math.max(2, Math.round(pxPerTile / 14));
  const made = {};
  const frame = (name, boil) => {
    const key = `${name}:${boil}`;
    if (!made[key]) {
      const c = makeCanvas(w, h);
      const g = c.getContext('2d');
      drawVector(g, img, m, footX, footY, s, { ...(POSES[name] || POSES.stand0), ears }, 1.15);
      made[key] = toLineArt(c, { ink, paper, r, boil });
    }
    return made[key];
  };
  return { frame, w, h, footX, footY };
}

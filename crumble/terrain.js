// Crumble's ground: terrain that blows apart.
//
// Two copies of the same shape, kept in step:
//   - a canvas the ground is painted on once, then carved with 'destination-out' circles, and drawn
//     with one drawImage a frame (so a crater costs nothing after it's made);
//   - a Uint8Array mask at world resolution (1 cell = 1 world unit) that physics reads:
//     0 air, 1 ground, 2 steel (girders: never carved).
// A carve updates both in one call, touching only the cells inside the circle.

export const AIR = 0;
export const GROUND = 1;
export const STEEL = 2;

// A small seeded random generator (mulberry32), so a battlefield's seed makes the same hills.
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createTerrain(w, h, { scale = 1 } = {}) {
  const mask = new Uint8Array(w * h);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);

  const t = {
    w,
    h,
    mask,
    canvas,
    ctx,
    scale,
    carves: 0,
    // Is (x, y) solid? Outside the world: the sides and the top are air, below the bottom is solid.
    solid(x, y) {
      x |= 0;
      y |= 0;
      if (x < 0 || x >= w || y < 0) return false;
      if (y >= h) return true;
      return mask[y * w + x] !== AIR;
    },
    at(x, y) {
      x |= 0;
      y |= 0;
      if (x < 0 || x >= w || y < 0 || y >= h) return AIR;
      return mask[y * w + x];
    },
    // The first solid cell at or below y in column x (h if none).
    surfaceBelow(x, y) {
      x |= 0;
      if (x < 0 || x >= w) return h + 100;
      let yy = Math.max(0, y | 0);
      while (yy < h && mask[yy * w + x] === AIR) yy++;
      return yy;
    },
    // The top surface of column x, from the sky down.
    top(x) {
      return t.surfaceBelow(x, 0);
    },
    // Blow a round hole: ground inside the circle becomes air; steel stays. Paints a scorched rim
    // on the ground that is left, then cuts the hole in the canvas. Returns the cells removed.
    carve(cx, cy, r, { scorch = 'rgba(40,24,12,0.55)' } = {}) {
      t.carves++;
      let removed = 0;
      const r2 = r * r;
      const y0 = Math.max(0, Math.floor(cy - r));
      const y1 = Math.min(h - 1, Math.ceil(cy + r));
      for (let y = y0; y <= y1; y++) {
        const dy = y - cy;
        const span = Math.sqrt(Math.max(0, r2 - dy * dy));
        const x0 = Math.max(0, Math.floor(cx - span));
        const x1 = Math.min(w - 1, Math.ceil(cx + span));
        const row = y * w;
        for (let x = x0; x <= x1; x++) {
          if (mask[row + x] === GROUND) {
            mask[row + x] = AIR;
            removed++;
          }
        }
      }
      if (removed > 0) {
        ctx.save();
        if (scorch) {
          ctx.globalCompositeOperation = 'source-atop';
          ctx.fillStyle = scorch;
          ctx.beginPath();
          ctx.arc(cx, cy, r + 6, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalCompositeOperation = 'destination-out';
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        // Steel showed through the hole? Paint it back (it's drawn into the ground canvas).
        if (t.steel.length) t.redrawSteel(cx, cy, r + 8);
      }
      return removed;
    },
    steel: [], // girders: {x, y, w, h}
    steelPainter: null, // (ctx, girder) => void
    addSteel(g) {
      t.steel.push(g);
      for (let y = Math.max(0, g.y | 0); y < Math.min(h, (g.y + g.h) | 0); y++) {
        for (let x = Math.max(0, g.x | 0); x < Math.min(w, (g.x + g.w) | 0); x++) mask[y * w + x] = STEEL;
      }
      if (t.steelPainter) t.steelPainter(ctx, g);
    },
    redrawSteel(cx, cy, r) {
      if (!t.steelPainter) return;
      for (const g of t.steel) {
        if (cx + r < g.x || cx - r > g.x + g.w || cy + r < g.y || cy - r > g.y + g.h) continue;
        t.steelPainter(ctx, g);
      }
    },
    // Fill the mask from a height map (heights[x] = the ground's top at column x).
    fillFromHeights(heights) {
      mask.fill(AIR);
      for (let x = 0; x < w; x++) {
        const top = Math.max(0, Math.min(h, Math.round(heights[x])));
        for (let y = top; y < h; y++) mask[y * w + x] = GROUND;
      }
    },
    // Count solid cells (tests).
    count() {
      let n = 0;
      for (let i = 0; i < mask.length; i++) if (mask[i]) n++;
      return n;
    },
  };
  return t;
}

// Heights for a battlefield's hill: a sum of soft waves, cliffs into the sea at both ends, a level
// pad where each tank starts, and an optional valley in the middle and slope down to the right.
// mirror: the broad shape is the same on both sides, before a little noise that isn't.
// bumps: [{ x, h, w }] raise (h > 0, a ridge) or cut (h < 0, a valley or a channel below the sea)
// the ground at x (fractions of the world's width), h as a fraction of its height, w its half-width.
export function makeHeights(w, h, { seed = 1, base = 0.6, rough = 1, mirror = true, pads = [], valley = 0, slope = 0, shore = 70, bumps = [] } = {}) {
  const r = rng(seed);
  const heights = new Float32Array(w);
  const waves = [];
  for (let i = 0; i < 4; i++) {
    waves.push({ f: (1 + i * 1.3 + r() * 0.9) / w, p: r() * Math.PI * 2, a: (h * 0.07 * rough) / (1 + i * 0.8) });
  }
  const broad = (x) => {
    let y = h * base;
    for (const wv of waves) y -= Math.sin(x * wv.f * Math.PI * 2 + wv.p) * wv.a;
    if (valley) {
      const d = (x - w / 2) / (w * 0.1);
      y += valley * h * Math.exp(-d * d * 2);
    }
    for (const b of bumps) {
      const d = (x - w * b.x) / (w * (b.w || 0.1));
      y -= b.h * h * Math.exp(-d * d * 2);
    }
    return y;
  };
  for (let x = 0; x < w; x++) {
    const xb = mirror && x >= w / 2 ? w - 1 - x : x;
    heights[x] = broad(xb) + slope * h * (x / w - 0.5);
  }
  // Small noise that isn't mirrored, so the two sides don't look stamped.
  const n1 = r() * 10, n2 = r() * 10;
  for (let x = 0; x < w; x++) heights[x] += Math.sin(x * 0.031 + n1) * 2.5 + Math.sin(x * 0.083 + n2) * 1.5;
  // Pads: level ground where a tank starts.
  for (const p of pads) {
    const y = heights[Math.round(p)];
    for (let x = Math.max(0, Math.round(p - 70)); x < Math.min(w, p + 70); x++) {
      const d = Math.abs(x - p) / 70;
      const k = d < 0.5 ? 1 : 1 - (d - 0.5) / 0.5;
      heights[x] = heights[x] * (1 - k) + y * k;
    }
  }
  // Cliffs down into the sea at both ends.
  for (let x = 0; x < w; x++) {
    const e = Math.min(x, w - 1 - x);
    if (e < shore) {
      const k = 1 - e / shore;
      heights[x] = heights[x] * (1 - k * k) + h * 1.05 * k * k;
    }
  }
  for (let x = 0; x < w; x++) heights[x] = Math.max(h * 0.18, Math.min(h * 1.05, heights[x]));
  return heights;
}

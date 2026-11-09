// One explosion effect for every game: a flash, a shock ring, fire puffs, smoke that drifts with the
// wind, sparks and debris. Pooled (no garbage while it runs), driven by delta time (the same at 60
// and 120 Hz), and drawn on any 2D canvas context in the game's own coordinates.
//
//   import { createExplosions, loadExplosionArt } from '../shared/explosion.js';
//   const boom = createExplosions({ art: loadExplosionArt() });   // art is optional
//   boom.burst(x, y, { radius: 40, wind: 20, debris: '#c9a46a' });
//   // each frame:
//   boom.update(dt);           // dt in seconds
//   boom.draw(ctx);            // after the world, before the HUD
//   const s = boom.shake();    // 0..1, how hard to shake the camera now (it decays on its own)
//
// Without art (or before it loads) the puffs are drawn as soft circles, so it works anywhere,
// including in tests with no DOM. The art is Kenney's Explosion Pack (CC0), kept in shared/explosion/.

const ART = {
  yellow: 'explosion/yellow.png',
  orange: 'explosion/orange.png',
  red: 'explosion/red.png',
  grey: 'explosion/grey.png',
};

// Load the puff images (browser only). Each is usable once it has loaded; until then, circles.
export function loadExplosionArt() {
  const art = {};
  if (typeof Image === 'undefined') return art;
  for (const [k, file] of Object.entries(ART)) {
    const img = new Image();
    img.src = new URL(file, import.meta.url).href;
    art[k] = img;
  }
  return art;
}

const KIND = { flash: 0, ring: 1, fire: 2, smoke: 3, spark: 4, debris: 5 };
const FALLBACK = ['#fff6d0', '#ffffff', '#ffb43a', '#8a8a8a', '#ffe08a', '#8b6a44'];
const FIRE_ART = ['yellow', 'orange', 'red'];

export function createExplosions({ art = {}, max = 400, random = Math.random } = {}) {
  // The pool: every particle is made once. When it's full, the oldest particle is reused.
  const pool = [];
  for (let i = 0; i < max; i++) {
    pool.push({ alive: false, kind: 0, x: 0, y: 0, vx: 0, vy: 0, age: 0, life: 1, size: 1, grow: 0, rot: 0, spin: 0, drag: 0, g: 0, wind: 0, art: '', color: '' });
  }
  let next = 0;
  let live = 0;
  let shake = 0;

  function take() {
    // Look for a free slot from `next`; if none, overwrite the one at `next` (the oldest-ish).
    for (let n = 0; n < max; n++) {
      const p = pool[(next + n) % max];
      if (!p.alive) {
        next = (next + n + 1) % max;
        live++;
        return p;
      }
    }
    const p = pool[next];
    next = (next + 1) % max;
    return p;
  }

  function spawn(kind, x, y, o) {
    const p = take();
    p.alive = true;
    p.kind = kind;
    p.x = x;
    p.y = y;
    p.vx = o.vx || 0;
    p.vy = o.vy || 0;
    p.age = 0;
    p.life = o.life;
    p.size = o.size;
    p.grow = o.grow || 0;
    p.rot = random() * Math.PI * 2;
    p.spin = (random() - 0.5) * (o.spin || 0);
    p.drag = o.drag || 0;
    p.g = o.g || 0;
    p.wind = o.wind || 0;
    p.art = o.art || '';
    p.color = o.color || FALLBACK[kind];
    return p;
  }

  const api = {
    // Set off an explosion at (x, y). radius is the blast's size in the game's units; wind (units/s²)
    // pushes the smoke; debris is the colour of what's thrown up (none if falsy); power scales the
    // shake (0..1, default from radius).
    burst(x, y, { radius = 40, wind = 0, debris = '#8b6a44', gravity = 600, power } = {}) {
      const r = radius;
      const amount = Math.max(0.4, Math.min(2, r / 40));
      spawn(KIND.flash, x, y, { life: 0.12, size: r * 1.6 });
      spawn(KIND.ring, x, y, { life: 0.32, size: r * 0.3, grow: r * 4.2 });
      const fires = Math.round(7 * amount);
      for (let i = 0; i < fires; i++) {
        const a = random() * Math.PI * 2;
        const s = r * (0.8 + random() * 1.6);
        spawn(KIND.fire, x + Math.cos(a) * r * 0.2, y + Math.sin(a) * r * 0.2, {
          vx: Math.cos(a) * s,
          vy: Math.sin(a) * s - r * 0.6,
          life: 0.35 + random() * 0.3,
          size: r * (0.45 + random() * 0.35),
          grow: r * 0.9,
          drag: 4,
          spin: 3,
          art: FIRE_ART[i % 3],
        });
      }
      const smokes = Math.round(6 * amount);
      for (let i = 0; i < smokes; i++) {
        const a = random() * Math.PI * 2;
        spawn(KIND.smoke, x + Math.cos(a) * r * 0.4, y + Math.sin(a) * r * 0.3, {
          vx: Math.cos(a) * r * 0.5,
          vy: -r * (0.4 + random() * 0.6),
          life: 1.1 + random() * 0.9,
          size: r * (0.5 + random() * 0.4),
          grow: r * 0.8,
          drag: 1.5,
          spin: 1,
          wind,
          art: 'grey',
        });
      }
      const sparks = Math.round(10 * amount);
      for (let i = 0; i < sparks; i++) {
        const a = -Math.PI * random();
        const s = r * (4 + random() * 5);
        spawn(KIND.spark, x, y, { vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.3 + random() * 0.35, size: 2 + random() * 2, drag: 2.5, g: gravity });
      }
      if (debris) {
        const bits = Math.round(14 * amount);
        for (let i = 0; i < bits; i++) {
          const a = -Math.PI * (0.1 + random() * 0.8);
          const s = r * (2.5 + random() * 5);
          spawn(KIND.debris, x + (random() - 0.5) * r, y, {
            vx: Math.cos(a) * s,
            vy: Math.sin(a) * s,
            life: 0.7 + random() * 0.6,
            size: 2 + random() * r * 0.09,
            drag: 0.6,
            g: gravity,
            spin: 10,
            color: debris,
          });
        }
      }
      shake = Math.min(1, shake + (power ?? Math.min(1, r / 60)));
    },

    update(dt) {
      if (!(dt > 0)) return;
      dt = Math.min(dt, 0.1); // a long pause (a hidden tab) doesn't fling particles off
      shake = Math.max(0, shake - dt * 3.2);
      for (let i = 0; i < max; i++) {
        const p = pool[i];
        if (!p.alive) continue;
        p.age += dt;
        if (p.age >= p.life) {
          p.alive = false;
          live--;
          continue;
        }
        // Exact exponential drag, so the motion doesn't depend on the step size.
        const k = p.drag ? Math.exp(-p.drag * dt) : 1;
        const kk = p.drag ? (1 - k) / p.drag : dt;
        p.x += p.vx * kk + p.wind * dt * p.age; // smoke leans further downwind as it ages
        p.y += p.vy * kk + 0.5 * p.g * dt * dt;
        p.vx *= k;
        p.vy = p.vy * k + p.g * dt;
        p.rot += p.spin * dt;
      }
    },

    draw(ctx) {
      if (!live) return;
      ctx.save();
      // Smoke under fire under sparks: three passes.
      for (const pass of [KIND.smoke, KIND.fire, KIND.debris, KIND.spark, KIND.ring, KIND.flash]) {
        for (let i = 0; i < max; i++) {
          const p = pool[i];
          if (!p.alive || p.kind !== pass) continue;
          const t = p.age / p.life;
          const size = p.size + p.grow * t;
          switch (pass) {
            case KIND.flash:
              ctx.globalAlpha = 0.9 * (1 - t);
              ctx.fillStyle = p.color;
              ctx.beginPath();
              ctx.arc(p.x, p.y, size * (0.6 + 0.4 * t), 0, Math.PI * 2);
              ctx.fill();
              break;
            case KIND.ring:
              ctx.globalAlpha = 0.7 * (1 - t);
              ctx.strokeStyle = p.color;
              ctx.lineWidth = Math.max(1, 6 * (1 - t));
              ctx.beginPath();
              ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
              ctx.stroke();
              break;
            case KIND.fire:
            case KIND.smoke: {
              const a = pass === KIND.fire ? 1 - t * t : 0.55 * (1 - t) * Math.min(1, t * 6 + 0.2);
              ctx.globalAlpha = a;
              const img = art[p.art];
              if (img && img.complete && img.naturalWidth) {
                ctx.save();
                ctx.translate(p.x, p.y);
                ctx.rotate(p.rot);
                ctx.drawImage(img, -size / 2, -size / 2, size, size);
                ctx.restore();
              } else {
                ctx.fillStyle = pass === KIND.fire ? ['#ffd23f', '#ff9b2e', '#f0532b'][Math.floor(p.rot * 10) % 3] : p.color;
                ctx.beginPath();
                ctx.arc(p.x, p.y, size / 2, 0, Math.PI * 2);
                ctx.fill();
              }
              break;
            }
            case KIND.spark:
              ctx.globalAlpha = 1 - t;
              ctx.strokeStyle = p.color;
              ctx.lineWidth = p.size;
              ctx.beginPath();
              ctx.moveTo(p.x, p.y);
              ctx.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03);
              ctx.stroke();
              break;
            case KIND.debris:
              ctx.globalAlpha = Math.min(1, (1 - t) * 3);
              ctx.fillStyle = p.color;
              ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
              break;
          }
        }
      }
      ctx.restore();
    },

    // How hard to shake now, 0..1. It decays on its own over about a third of a second.
    shake() {
      return shake;
    },
    get count() {
      return live;
    },
    clear() {
      for (const p of pool) p.alive = false;
      live = 0;
      shake = 0;
    },
    // For tests: the particles that are alive now.
    particles() {
      return pool.filter((p) => p.alive);
    },
  };
  return api;
}

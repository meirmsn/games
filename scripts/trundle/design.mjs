// Trundle's room designer: places a room's three stars and finds its recorded solution.
//
//   node scripts/trundle/design.mjs <room 1-6> [samples=6000] [min=4] [lo=0.03]
//   node scripts/trundle/design.mjs <room 1-6> --stars '[{"x":4.5,"y":4.4},…]'
//
// It runs the game's own sim.js headless. First it searches part placements from the room's tray
// (random, then perturbing every win found) and keeps the winning runs. Then it picks three star
// spots that few winning runs pass together (at least `min` of them; each spot passed by between
// `lo` and 75% of wins), that neither kick passes with no parts, at least 2 units apart, with one
// near the demo kick's path. With --stars it keeps the stars given. Last, it picks the three-star
// layout that most often still takes all three when one part moves a step or turns 15°, and prints
// the stars and that solution for rooms.js.
import { readFileSync } from 'node:fs';

const matter = { exports: {} };
new Function('module', 'exports', readFileSync(new URL('../../trundle/matter.min.js', import.meta.url), 'utf8'))(matter, matter.exports);
globalThis.Matter = matter.exports;
const sim = await import('../../trundle/sim.js');
const { ROOMS } = await import('../../trundle/rooms.js');

const args = process.argv.slice(2);
const ri = +args[0] - 1;
if (!(ri >= 0 && ri < ROOMS.length)) {
  console.error('usage: node scripts/trundle/design.mjs <room 1-6> [samples] [min] [lo] | --stars <json>');
  process.exit(2);
}
const given = args[1] === '--stars' ? JSON.parse(args[2]) : null;
const N = given ? 6000 : +(args[1] || 6000);
const MINN = +(args[2] || 4);
const LO = +(args[3] || 0.03);
const room = { ...ROOMS[ri], stars: [] };

let seed = 7 + ri;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const q = (v, s) => Math.round(v / s) * s;
const keyOf = (l, k) => k + '|' + l.map((p) => `${p.type}${p.x},${p.y},${p.a}`).join(';');
const near = (trail, x, y) => {
  let d = 99;
  for (let i = 0; i < trail.length; i += 2) d = Math.min(d, Math.hypot(trail[i] - x, trail[i + 1] - y));
  return d;
};

// 1. Winning runs.
const wins = new Map();
function tryLayout(layout, kick) {
  const k = keyOf(layout, kick);
  if (wins.has(k)) return;
  for (let i = 0; i < layout.length; i++)
    if (sim.overlaps(room, layout[i], layout.filter((_, j) => j !== i))) return;
  const r = sim.runToEnd(room, layout, { kick });
  if (r.result === 'won') wins.set(k, { layout, kick, trail: r.trail });
}
for (let i = 0; i < N; i++) {
  const layout = room.tray.map((type) => ({ type, x: q(0.5 + rnd() * 9, 0.25), y: q(1 + rnd() * 14.5, 0.25), a: q(rnd() * 360, 15) % 360 }));
  tryLayout(layout, rnd() < 0.5 ? 'soft' : 'hard');
}
const perturb = (l) =>
  l.map((p) => (rnd() < 0.6 ? { ...p, x: q(p.x + (rnd() - 0.5) * 2, 0.25), y: q(p.y + (rnd() - 0.5) * 2, 0.25), a: (q(p.a + (rnd() - 0.5) * 60, 15) + 360) % 360 } : p));
for (let pass = 0; pass < 2; pass++)
  for (const w of [...wins.values()])
    for (let j = 0; j < 12; j++) tryLayout(perturb(w.layout), rnd() < 0.8 ? w.kick : w.kick === 'soft' ? 'hard' : 'soft');
const W = [...wins.values()];
console.log(`room ${ri + 1}: ${W.length} winning layouts`);

// 2. The stars.
let stars = given;
if (!stars) {
  const blk = sim.blockers(room);
  const demoS = sim.runToEnd(room, [], { kick: 'soft' }).trail;
  const demoH = sim.runToEnd(room, [], { kick: 'hard' }).trail;
  const cands = [];
  for (let y = 1; y <= 15; y += 0.5)
    for (let x = 0.5; x <= 9.5; x += 0.5) {
      const c = Matter.Bodies.circle(x * sim.S, y * sim.S, 0.45 * sim.S, { isStatic: true });
      if (Matter.Query.collides(c, blk).length) continue;
      if (Math.hypot(x - room.exit.x, y - room.exit.y) < 1.5 || Math.hypot(x - room.ball.x, y - room.ball.y) < 1.5) continue;
      cands.push({ x, y, demo: near(demoS, x, y), hard: near(demoH, x, y) });
    }
  const touches = W.map((w) => new Set(cands.map((c, i) => (near(w.trail, c.x, c.y) < 0.5 ? i : -1)).filter((i) => i >= 0)));
  const freq = cands.map((_, i) => touches.filter((s) => s.has(i)).length / W.length);
  const pool = cands.map((_, i) => i).filter((i) => freq[i] >= LO && freq[i] <= 0.75 && cands[i].demo > 0.75 && cands[i].hard > 0.75);
  const dist = (a, b) => Math.hypot(cands[a].x - cands[b].x, cands[a].y - cands[b].y);
  let best = null;
  for (let a = 0; a < pool.length; a++)
    for (let b = a + 1; b < pool.length; b++) {
      const [A, B] = [pool[a], pool[b]];
      if (dist(A, B) < 2) continue;
      const ab = touches.filter((s) => s.has(A) && s.has(B));
      if (ab.length < MINN) continue;
      for (let c = b + 1; c < pool.length; c++) {
        const C = pool[c];
        if (dist(A, C) < 2 || dist(B, C) < 2) continue;
        const n = ab.filter((s) => s.has(C)).length;
        if (n < MINN) continue;
        const glint = Math.min(cands[A].demo, cands[B].demo, cands[C].demo) < 1.6;
        const score = (glint ? 0 : 10) + Math.abs(Math.log(n / W.length / 0.04)) - Math.min(dist(A, B), dist(A, C), dist(B, C)) * 0.15;
        if (!best || score < best.score) best = { score, idx: [A, B, C], n };
      }
    }
  if (!best) {
    console.log('no star triple: try a lower min or lo, or place the stars with --stars');
    process.exit(1);
  }
  stars = best.idx.map((i) => ({ x: cands[i].x, y: cands[i].y }));
  console.log(`stars taken together by ${best.n} of ${W.length} wins`);
}

// 3. The most robust three-star solution.
const room3 = { ...room, stars };
let sol = null;
for (const w of W) {
  const r0 = sim.runToEnd(room3, w.layout, { kick: w.kick });
  if (r0.result !== 'won' || r0.stars.size < 3) continue;
  let ok = 0;
  let tot = 0;
  for (let i = 0; i < w.layout.length; i++)
    for (const [dx, dy, da] of [[0.25, 0, 0], [-0.25, 0, 0], [0, 0.25, 0], [0, -0.25, 0], [0, 0, 15], [0, 0, -15]]) {
      const l = w.layout.map((p, j) => (j === i ? { ...p, x: p.x + dx, y: p.y + dy, a: (p.a + da + 360) % 360 } : p));
      const r = sim.runToEnd(room3, l, { kick: w.kick });
      tot++;
      if (r.result === 'won') ok += r.stars.size === 3 ? 1 : 0.3;
    }
  if (!sol || ok / tot > sol.robust) sol = { kick: w.kick, layout: w.layout, robust: ok / tot };
  if (sol.robust === 1) break;
}
if (!sol) {
  console.log('no winning layout takes all three stars');
  process.exit(1);
}
console.log('stars:', JSON.stringify(stars));
console.log('solution:', JSON.stringify({ kick: sol.kick, layout: sol.layout }), `robustness ${sol.robust.toFixed(2)}`);

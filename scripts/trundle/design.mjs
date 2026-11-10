// Trundle's room designer: places a room's three stars and finds its recorded solution.
//
//   node scripts/trundle/design.mjs <room 1-8> [samples=3000] [min=4] [lo=0.03]
//   node scripts/trundle/design.mjs <room 1-8> --stars '[{"x":4.5,"y":4.4},…]' [samples]
//
// It runs the game's own sim.js headless. A candidate is a starting layout of the room's tray (no
// moves during the attempt) plus, in a room where Trundle drives, a simple way of tapping him: turn
// him around whenever he passes a chosen x going right, and another going left. It searches
// candidates (at most 3 taps on Trundle per attempt, the two x's at least 2.5 units apart, so a
// person could do it; random, then perturbing every win) and keeps the winning attempts with their edit
// logs. Then it picks three star spots that few winning attempts pass together (at least `min`;
// each spot passed in between `lo` and 75% of wins), that the attempt with nothing placed doesn't
// pass, at least 2 units apart. With --stars it keeps the stars given. Last, it picks the
// three-star candidate that most often still wins with all three when one part moves a step or
// turns 15°, and prints the stars and that solution for rooms.js.
import { readFileSync } from 'node:fs';

const matter = { exports: {} };
new Function('module', 'exports', readFileSync(new URL('../../trundle/matter.min.js', import.meta.url), 'utf8'))(matter, matter.exports);
globalThis.Matter = matter.exports;
const sim = await import('../../trundle/sim.js');
const { ROOMS } = await import('../../trundle/rooms.js');

const args = process.argv.slice(2);
const ri = +args[0] - 1;
if (!(ri >= 0 && ri < ROOMS.length)) {
  console.error('usage: node scripts/trundle/design.mjs <room 1-8> [samples] [min] [lo] | --stars <json> [samples]');
  process.exit(2);
}
const given = args[1] === '--stars' ? JSON.parse(args[2]) : null;
const N = given ? +(args[3] || 3000) : +(args[1] || 3000);
const MINN = +(args[2] || 4);
const LO = +(args[3] || 0.03);
const room = { ...ROOMS[ri], stars: [] };
const g = room.girder;
const drives = room.trundle.speed > 0 && g.x2 > g.x1;

let seed = 11 + ri;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const q = (v, s) => Math.round(v / s) * s;
const near = (trail, x, y) => {
  let d = 99;
  for (let i = 0; i < trail.length; i += 2) d = Math.min(d, Math.hypot(trail[i] - x, trail[i + 1] - y));
  return d;
};

// Run a candidate: its layout from the start, and Trundle turned around at its two x's.
const MAX_TURNS = 3;
function attempt(room, cand) {
  const att = sim.createAttempt(room, cand.layout);
  let turns = 0;
  while (!att.result) {
    const tr = att.trundle;
    if (turns < MAX_TURNS) {
      if (cand.right != null && tr.dir === 1 && tr.x >= cand.right) att.edit({ op: 'turn' }), turns++;
      else if (cand.left != null && tr.dir === -1 && tr.x <= cand.left) att.edit({ op: 'turn' }), turns++;
    }
    att.step();
  }
  return att;
}
const trailsOf = (att) => att.balls.map((b) => b.trail);

const key = (c) => `${c.right}|${c.left}|` + c.layout.map((p) => `${p.type}${p.x},${p.y},${p.a}`).join(';');
const wins = new Map();
function tryCand(c) {
  const k = key(c);
  if (wins.has(k)) return;
  for (let i = 0; i < c.layout.length; i++)
    if (sim.overlaps(room, c.layout[i], c.layout.filter((_, j) => j !== i))) return;
  const att = attempt(room, c);
  if (att.result === 'won') wins.set(k, { ...c, trails: trailsOf(att), inCount: att.inCount, log: att.log });
}
const randTurn = () => (drives && rnd() < 0.6 ? q(g.x1 + rnd() * (g.x2 - g.x1), 0.25) : null);
for (let i = 0; i < N; i++) {
  const layout = room.tray.map((type, j) => ({ id: j + 1, type, x: q(0.5 + rnd() * 9, 0.25), y: q(3 + rnd() * 12.5, 0.25), a: q(rnd() * 360, 15) % 360 }));
  let right = randTurn();
  let left = randTurn();
  if (right != null && left != null && left >= right) [left, right] = [right, left];
  if (right != null && left != null && right - left < 2.5) left = null;
  tryCand({ layout, right, left });
}
const perturb = (c) => ({
  ...c,
  layout: c.layout.map((p) => (rnd() < 0.6 ? { ...p, x: q(p.x + (rnd() - 0.5) * 2, 0.25), y: q(p.y + (rnd() - 0.5) * 2, 0.25), a: (q(p.a + (rnd() - 0.5) * 60, 15) + 360) % 360 } : p)),
});
for (let pass = 0; pass < 2; pass++) for (const w of [...wins.values()]) for (let j = 0; j < 8; j++) tryCand(perturb(w));
const W = [...wins.values()];
console.log(`room ${ri + 1}: ${W.length} winning candidates`);
if (!W.length) process.exit(1);

// The stars.
let stars = given;
if (!stars) {
  const blk = sim.blockers(room);
  const none = trailsOf(attempt(room, { layout: [], right: null, left: null }));
  const cands = [];
  for (let y = 3.5; y <= 13.5; y += 0.5)
    for (let x = 1; x <= 9; x += 0.5) {
      const c = Matter.Bodies.circle(x * sim.S, y * sim.S, 0.45 * sim.S, { isStatic: true });
      if (Matter.Query.collides(c, blk).length) continue;
      if (room.exits.some((e) => Math.hypot(x - e.x, y - e.y) < 1.5)) continue;
      if (none.some((t) => near(t, x, y) < 0.75)) continue;
      cands.push({ x, y });
    }
  const touches = W.map((w) => new Set(cands.map((c, i) => (w.trails.some((t) => near(t, c.x, c.y) < 0.5) ? i : -1)).filter((i) => i >= 0)));
  const freq = cands.map((_, i) => touches.filter((s) => s.has(i)).length / W.length);
  const pool = cands.map((_, i) => i).filter((i) => freq[i] >= LO && freq[i] <= 0.75);
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
        const score = Math.abs(Math.log(n / W.length / 0.06)) - Math.min(dist(A, B), dist(A, C), dist(B, C)) * 0.15;
        if (!best || score < best.score) best = { score, idx: [A, B, C], n };
      }
    }
  if (!best) {
    console.log('no star triple: try a lower min or lo, or place the stars with --stars');
    process.exit(1);
  }
  stars = best.idx.map((i) => cands[i]);
  console.log(`stars taken together by ${best.n} of ${W.length} winning candidates`);
}

// The most robust three-star solution.
const room3 = { ...room, stars };
let sol = null;
for (const w of W) {
  const a0 = attempt(room3, w);
  if (a0.result !== 'won' || a0.stars.size < 3) continue;
  let ok = 0;
  let tot = 0;
  for (let i = 0; i < w.layout.length; i++)
    for (const [dx, dy, da] of [[0.25, 0, 0], [-0.25, 0, 0], [0, 0.25, 0], [0, -0.25, 0], [0, 0, 15], [0, 0, -15]]) {
      const l = w.layout.map((p, j) => (j === i ? { ...p, x: p.x + dx, y: p.y + dy, a: (p.a + da + 360) % 360 } : p));
      const a = attempt(room3, { ...w, layout: l });
      tot++;
      if (a.result === 'won') ok += a.stars.size === 3 ? 1 : 0.3;
    }
  if (!sol || ok / tot > sol.robust) sol = { layout: w.layout, log: a0.log, robust: ok / tot, inCount: a0.inCount };
  if (sol.robust === 1) break;
}
if (!sol) {
  console.log('no winning candidate takes all three stars');
  process.exit(1);
}
console.log('stars:', JSON.stringify(stars));
console.log('solution:', JSON.stringify({ layout: sol.layout, log: sol.log }), `in ${sol.inCount} of ${room.balls}, robustness ${sol.robust.toFixed(2)}`);

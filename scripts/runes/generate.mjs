// Level generator for Runes: builds boards around a line, then keeps the ones worth a designer's
// look. The chosen ones are copied by hand into runes/levels.js.
//   node scripts/runes/generate.mjs <w> <h> <runes> [tries] [seed] [decoys%]
//   e.g. node scripts/runes/generate.mjs 5 6 RRK 4000 7 30
// How a board is built: a random self-avoiding walk is the intended line. Runes go on cells of it,
// in the order given. A rise makes its later neighbours on the line start as water; a spark does the
// same for the run of line cells straight ahead of it; a sink gets decoy stones beside it (stones it
// will sink, which tempt the line before it fires). Cells off the line are water. The intended line
// is replayed by the rules; then the board is kept if it has 1–3 solutions, every rune is needed
// (as a plain stone instead, the board has none), and a greedy line fails. Scored by how many
// 4-step starts lead nowhere, and by length.
import * as R from '../../runes/rules.js';
import { report, draw } from './lab.mjs';

const main = import.meta.url === `file://${process.argv[1]}`;
const [w, h, runes = '', tries = '3000', seed0 = '1', decoyPct = '40'] = process.argv.slice(2);
const W = +w;
const H = +h;
let seed = +seed0;
// mulberry32: small, fast, and good enough to give every try a different board.
function rnd() {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = (a) => a[Math.floor(rnd() * a.length)];
const idx = (x, y) => y * W + x;
const nb = (c) =>
  R.DIRS.map(([dx, dy]) => [(c % W) + dx, ((c / W) | 0) + dy])
    .filter(([x, y]) => x >= 0 && y >= 0 && x < W && y < H)
    .map(([x, y]) => idx(x, y));

// A random self-avoiding walk, preferring to hug what it has already visited so it fills space.
function walk() {
  const start = Math.floor(rnd() * W * H);
  const path = [start];
  const on = new Set(path);
  // Stop somewhere between FILL and MAXFILL of the board, so bigger boards keep some water.
  const lo = +(process.env.FILL || 0.55);
  const hi = +(process.env.MAXFILL || 1);
  const cap = Math.floor(W * H * (lo + rnd() * (hi - lo))) + 1;
  while (path.length < cap) {
    const opts = nb(path[path.length - 1]).filter((c) => !on.has(c));
    if (!opts.length) break;
    const weight = (c) => 1 + nb(c).filter((n) => on.has(n)).length * 1.5;
    let total = opts.reduce((a, c) => a + weight(c), 0);
    let r = rnd() * total;
    let next = opts[0];
    for (const c of opts) if ((r -= weight(c)) <= 0) {
      next = c;
      break;
    }
    path.push(next);
    on.add(next);
  }
  return path;
}

function build() {
  const path = walk();
  if (path.length < Math.max(8, W * H * +(process.env.FILL || 0.55))) return null;
  const pos = new Map(path.map((c, i) => [c, i]));
  const g = new Array(W * H).fill('.');
  for (const c of path) g[c] = 'o';
  g[path[0]] = 'S';
  g[path[path.length - 1]] = 'G';
  for (const r of runes) {
    const i = 2 + Math.floor(rnd() * (path.length - 4));
    const c = path[i];
    if (g[c] !== 'o') return null;
    g[c] = r;
    if (r === 'R') {
      const later = nb(c).filter((n) => pos.get(n) > i + 1 && g[n] === 'o');
      if (!later.length) return null;
      for (const n of later) if (rnd() < 0.8) g[n] = '.';
    } else if (r === 'Z') {
      const d = R.dirOf({ w: W }, path[i - 1], c);
      let n = c;
      const run = [];
      for (;;) {
        const x = (n % W) + R.DIRS[d][0];
        const y = ((n / W) | 0) + R.DIRS[d][1];
        if (x < 0 || y < 0 || x >= W || y >= H) break;
        n = idx(x, y);
        if (!(pos.get(n) > i) || g[n] !== 'o') break;
        run.push(n);
      }
      if (!run.length) return null;
      const len = 1 + Math.floor(rnd() * run.length);
      for (const n of run.slice(0, len)) g[n] = '.';
    } else if (r === 'K') {
      // It fires as the line leaves it: a later line stone beside it (other than the next) drowns.
      if (nb(c).some((n) => pos.get(n) > i + 1 && g[n] === 'o')) return null;
      const off = nb(c).filter((n) => g[n] === '.');
      if (!off.length) return null;
      for (const n of off) if (rnd() * 100 < +decoyPct || n === off[0]) g[n] = 'o';
    }
  }
  let rows = [];
  for (let y = 0; y < H; y++) rows.push(g.slice(y * W, y * W + W).join(''));
  // Trim rows and columns of nothing but water from the edges.
  while (rows.length && /^\.+$/.test(rows[0])) rows.shift();
  while (rows.length && /^\.+$/.test(rows[rows.length - 1])) rows.pop();
  const col = (x) => rows.every((r) => r[x] === '.');
  while (col(0)) rows = rows.map((r) => r.slice(1));
  while (col(rows[0].length - 1)) rows = rows.map((r) => r.slice(0, -1));
  // Replay the intended line: it must be a solution.
  const L = R.parse(rows);
  const s = R.newState(L);
  const ox = Math.min(...path.map((c) => c % W));
  const oy = Math.min(...path.map((c) => (c / W) | 0));
  for (const c of path.slice(1)) if (!R.step(s, (((c / W) | 0) - oy) * L.w + (c % W) - ox)) return null;
  return R.solved(s) ? rows : null;
}

// Does every rune matter? Returns '' if so, or why not. A rune matters when
//  - it constrains: a rise's board with its effect already applied (and the rune a plain stone) has
//    more solutions than the real one; a sink's board with the sink a plain stone has none, and
//  - it is two-sided: some line that could still finish dies by entering it (too early, or from the
//    wrong side), so when and how to fire it is a real choice.
export function runesMatter(rows, count) {
  const L = R.parse(rows);
  const runes = L.kind.map((k, i) => (R.isRune(k) ? i : -1)).filter((i) => i >= 0);
  if (!runes.length) return '';
  // Each rise constrains: with its water neighbours already stones (and it a plain stone), the
  // board has more solutions. Each sink is needed: as a plain stone, the board has none.
  const at = (i) => [i % L.w, (i / L.w) | 0];
  for (const i of runes) {
    const g = rows.map((r) => r.split(''));
    const [x, y] = at(i);
    g[y][x] = 'o';
    if (L.kind[i] === 'rise') {
      for (const [dx, dy] of R.DIRS) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < L.w && ny < L.h && g[ny][nx] === '.') g[ny][nx] = 'o';
      }
    }
    const res = R.solve(R.parse(g.map((r) => r.join(''))), { max: count + 1, limit: 1e6 });
    if (res.cut) return 'cut';
    const n = res.solutions.length;
    if (L.kind[i] === 'rise' && n <= count) return 'static';
    if (L.kind[i] === 'sink' && n > 0) return 'not needed';
  }
  // Two-sided: explore every state, and note each rune entered from a live state into a dead one.
  const s = R.newState(L);
  const memo = new Map();
  const twoSided = new Set();
  let nodes = 0;
  const key = () => R.head(s) + ':' + s.lit.join('') + s.up.map((u) => (u ? 1 : 0)).join('');
  function live() {
    if (++nodes > 4e5) throw new Error('too big');
    if (R.head(s) === L.gate) return R.left(s) === 0;
    const k = key();
    if (memo.has(k)) return memo.get(k);
    let any = false;
    const dead = [];
    for (const m of R.moves(s)) {
      R.step(s, m);
      const ok = live();
      R.back(s);
      if (ok) any = true;
      else if (R.isRune(L.kind[m])) dead.push(m);
    }
    if (any) for (const m of dead) twoSided.add(m);
    memo.set(k, any);
    return any;
  }
  try {
    live();
  } catch {
    return 'too big';
  }
  for (const i of runes) if (!twoSided.has(i)) return 'one-sided';
  return '';
}

const kept = [];
const seen = new Set();
const reasons = {};
const note = (r) => (reasons[r] = (reasons[r] || 0) + 1);
for (let t = 0; main && t < +tries; t++) {
  const rows = build();
  if (!rows) continue;
  const key = rows.join('/');
  if (seen.has(key)) continue;
  seen.add(key);
  const L = R.parse(rows);
  const r = R.solve(L, { max: 4, limit: 3e5 });
  if (r.cut || r.solutions.length < 1 || r.solutions.length > 3) {
    note(r.cut ? 'cut' : r.solutions.length ? 'many solutions' : 'none');
    continue;
  }
  const why = runesMatter(rows, r.solutions.length);
  if (why) {
    note(why);
    continue;
  }
  const { out } = report(rows);
  if (runes && out.greedy === 'SOLVES') {
    note('greedy');
    continue;
  }
  const [dead, all] = out.traps.split('/').map(Number);
  const len = r.solutions[0].length;
  // Water gives a board its shape: a little is welcome, a flat field of stones is dull.
  const water = rows.join('').split('.').length - 1;
  const score =
    (dead / all) * 10 + len / 4 - r.solutions.length + Math.min(all, 12) / 3 + Math.min(water / rows.join("").length, 0.35) * 20;
  kept.push({ rows, score: +score.toFixed(2), out, sol: r.solutions[0], L });
}
kept.sort((a, b) => b.score - a.score);
for (const k of kept.slice(0, +(process.env.SHOW || 4))) {
  console.log(JSON.stringify(k.rows), k.score, JSON.stringify(k.out));
  console.log(draw(k.L, k.sol) + '\n');
}
if (main) console.log(`kept ${kept.length} of ${seen.size}`, JSON.stringify(reasons));

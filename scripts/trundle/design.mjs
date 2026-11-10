// Trundle's room designer: finds a room's recorded solution (its taps) and checks the room.
//
//   node scripts/trundle/design.mjs <room 1-8>
//
// It runs the game's own sim.js headless and plays a ball at a time, keeping the best few tap logs
// so far (a beam). Before each ball drops it tries every combination of plank states (set by taps
// 0.4 s before the drop), plus at most one extra tap on one plank while the ball is falling (to
// find flicks), and keeps the choices that put the most balls in their cups, lose the fewest and
// take the star.
// It prints what an attempt with no taps does, then the solution's result, stars and tap log for
// rooms.js.
import { readFileSync } from 'node:fs';

const matter = { exports: {} };
new Function('module', 'exports', readFileSync(new URL('../../trundle/matter.min.js', import.meta.url), 'utf8'))(matter, matter.exports);
globalThis.Matter = matter.exports;
const sim = await import('../../trundle/sim.js');
const { ROOMS } = await import('../../trundle/rooms.js');

const ri = +process.argv[2] - 1;
if (!(ri >= 0 && ri < ROOMS.length)) {
  console.error('usage: node scripts/trundle/design.mjs <room 1-8>');
  process.exit(2);
}
const room = ROOMS[ri];
const n = room.planks.length;

const none = sim.replay(room, []);
console.log(`room ${ri + 1} "${room.name}": no taps: ${none.result}, ${none.inCount()} of ${none.need()} in`);

// The plank states each attempt starts from.
const start = room.planks.map((p) => (p.up ? 1 : 0));
const dropStep = (k) => sim.FIRST_DROP + k * sim.DROP_EVERY;

function stateAt(log, steps) {
  const st = start.slice();
  for (const e of log) if (e.s < steps) st[e.i] = 1 - st[e.i];
  return st;
}

// Score an attempt after ball k: balls in their cups, the star, few taps.
function score(att, k, log) {
  let v = 0;
  for (const b of att.balls) if (b.n <= k && b.state === 'in') v += 10;
  v -= att.lostCount * 3;
  if (att.gotStar) v += 12; // worth a ball: losing one for the star is a fair trade
  return v - log.length * 0.05;
}

const BEAM = 4;
let beam = [[]];
for (let k = 0; k < room.balls.length; k++) {
  const d = dropStep(k);
  const at = Math.max(0, d - 48);
  const next = [];
  const seen = new Set();
  for (const log of beam) {
    const st = stateAt(log, at);
    for (let mask = 0; mask < 1 << n; mask++) {
      const pre = [];
      for (let i = 0; i < n; i++) if (((mask >> i) & 1) !== st[i]) pre.push({ s: at, op: 'flip', i });
      const extras = [null];
      for (let i = 0; i < n; i++) for (const tau of [40, 70, 100, 130, 160, 200, 240, 280]) extras.push({ s: d + tau, op: 'flip', i });
      for (const x of extras) {
        const cand = [...log, ...pre, ...(x ? [x] : [])].sort((a, b) => a.s - b.s);
        const key = JSON.stringify(cand);
        if (seen.has(key)) continue;
        seen.add(key);
        const att = sim.replay(room, cand, {}, d + 650); // long enough for a flicked ball to land
        next.push({ v: score(att, k, cand) + (att.result === 'won' ? 50 : 0), cand });
      }
    }
  }
  next.sort((a, b) => b.v - a.v);
  beam = next.slice(0, BEAM).map((c) => c.cand);
}
let log = beam[0];
let bestStars = -1;
for (const l of beam) {
  const a = sim.replay(room, l);
  if (a.starCount() > bestStars) (bestStars = a.starCount()), (log = l);
}
const att = sim.replay(room, log);
console.log(`solution: ${att.result}, ${att.inCount()} of ${att.need()} in, ${att.lostCount} lost, star ${att.gotStar}, stars ${att.starCount()}`);
console.log('log:', JSON.stringify(log.map(({ s, i }) => ({ s, op: 'flip', i }))));

// Measure Orbit's legs headless, with the game's own physics. The probe circles its planet and
// leaves along its orbit when the boosters fire, so a release is where it is on the orbit (`at`),
// the booster power, and which way it circles. This measures how often a release catches the next
// ring (with and without the brake), whether a parking ring ever touches another body, and lays
// each leg's mote line and gold route. tests/orbit-levels.test.mjs pins the results.
//
//   node scripts/orbit/solve.mjs            every system's rates
//   node scripts/orbit/solve.mjs 1          one system (0-based)
//   node scripts/orbit/solve.mjs 1 lay      lay system 1's mote lines and gold routes, chained leg
//                                           to leg, as JSON to paste into orbit/levels.js
import { SYSTEMS } from '../../orbit/levels.js';
import { fly, park, positions, arrivalDir, SKIM, CATCH_WIDTH, FIELD, DT, bodyAt } from '../../orbit/physics.js';

// Leg start times to sample: just 0, or across a full moon period when moons move.
export function startTimes(sys, n = 12) {
  const periods = sys.bodies.filter((b) => b.orbit).map((b) => b.orbit.period);
  if (!periods.length) return [0];
  const p = Math.max(...periods);
  return Array.from({ length: n }, (_, i) => (i * p) / n);
}

function rng(seed) {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

// Which way the probe can be circling at a leg's start: a system starts it one way (the game's
// START_DIR); after a catch it circles the way it arrived, which can be either.
export const START_DIR = -1;
export const dirsFor = (legIndex) => (legIndex === 0 ? [START_DIR] : [-1, 1]);

export const BRAKES = [0.4, 0.7, 1, 1.3, 1.6, 2, 2.4, 2.8, 3.3, 3.8, 4.4, 5];
export const POWER_MIN = 0; // a blind release: any point on the orbit, any power on the bar

// The share of blind releases that are caught. With brake: true, a release counts if braking at
// some moment (a player watching the ring) makes it caught.
export function rate(sys, legIndex, { samples = 1200, seed = 7, t0s = startTimes(sys), brake = false, dirs = dirsFor(legIndex) } = {}) {
  const rnd = rng(seed);
  let ok = 0;
  const ages = [];
  for (let k = 0; k < samples; k++) {
    const t0 = t0s[k % t0s.length];
    const dir = dirs[k % dirs.length];
    const at = rnd() * 2 * Math.PI;
    const power = POWER_MIN + rnd() * (1 - POWER_MIN);
    let f = fly(sys, legIndex, at, power, t0, { dir });
    if (f.result !== 'captured' && brake && sys.brake) {
      for (const bt of BRAKES) {
        if (bt > f.age) break;
        f = fly(sys, legIndex, at, power, t0, { dir, brakeAt: bt });
        if (f.result === 'captured') break;
      }
    }
    if (f.result === 'captured') {
      ok++;
      ages.push(f.age);
    }
  }
  ages.sort((x, y) => x - y);
  rate.lastMedianAge = ages.length ? ages[ages.length >> 1] : 0;
  return ok / samples;
}

// The timing window: at the best power (in steps of `pstep`) and circling direction, how many
// degrees of the orbit release into a catch, at leg time t0. With brake: true a release counts if
// some brake moment catches it. This is what a player learns: when to fire, at what power.
export function window(sys, legIndex, { t0 = 0, brake = false, dirs = dirsFor(legIndex), pstep = 0.05, astep = 2 } = {}) {
  let best = { deg: 0, power: 0, dir: dirs[0] };
  for (const dir of dirs) {
    for (let p = 0; p <= 1.0001; p += pstep) {
      let deg = 0;
      for (let d = 0; d < 360; d += astep) {
        const at = (d * Math.PI) / 180;
        let f = fly(sys, legIndex, at, p, t0, { dir });
        if (f.result !== 'captured' && brake && sys.brake) {
          for (const bt of BRAKES) {
            if (bt > f.age) break;
            f = fly(sys, legIndex, at, p, t0, { dir, brakeAt: bt });
            if (f.result === 'captured') break;
          }
        }
        if (f.result === 'captured') deg += astep;
      }
      if (deg > best.deg) best = { deg, power: p, dir };
    }
  }
  return best;
}

// The rate at each start time separately (for moon legs: does waiting matter?).
export function rateByStart(sys, legIndex, opts = {}) {
  return startTimes(sys).map((t0) => rate(sys, legIndex, { ...opts, samples: 400, t0s: [t0] }));
}

// Does any body's surface, or the target's band, ever reach the probe's parking ring on a leg?
export function parkingClear(sys) {
  const problems = [];
  const ts = startTimes(sys, 48).concat([0.37, 1.9, 5.3]);
  sys.legs.forEach((leg, li) => {
    const pr = park(sys, leg.from).r;
    for (const t of ts) {
      const pos = positions(sys.bodies, t);
      const fx = pos[leg.from * 2];
      const fy = pos[leg.from * 2 + 1];
      sys.bodies.forEach((b, i) => {
        if (i === leg.from) return;
        const d = Math.hypot(pos[i * 2] - fx, pos[i * 2 + 1] - fy);
        const reach = i === leg.to ? b.ring + CATCH_WIDTH * 1.2 : b.r;
        if (Math.abs(d - pr) < reach) problems.push(`leg ${li + 1}: body ${i} meets the parking ring at t=${t.toFixed(1)}`);
      });
    }
  });
  return [...new Set(problems)];
}

// A captured release of the given kind, for laying a mote line on it: 'close' passes nearest a body
// (other than the two ends) without touching; 'wide' strays farthest from the straight line between
// the planets. Searched over the whole orbit and the power range, without a brake first, then with.
export function route(sys, legIndex, kind, { t0 = 0, dir = START_DIR } = {}) {
  const leg = sys.legs[legIndex];
  const a = bodyAt(sys.bodies, leg.from, t0);
  const b = bodyAt(sys.bodies, leg.to, t0);
  const direct = Math.atan2(b.y - a.y, b.x - a.x);
  let best = null;
  for (const brakes of [[-1], sys.brake ? BRAKES : []]) {
    for (let deg = 0; deg < 360; deg += 1) {
      const at = (deg * Math.PI) / 180;
      for (let p = POWER_MIN; p <= 1.0001; p += 0.02) {
        for (const brakeAt of brakes) {
          const trail = [];
          const f = fly(sys, legIndex, at, p, t0, { trail, brakeAt, dir });
          if (f.result !== 'captured') continue;
          let inside = true;
          for (let k = 0; k < trail.length; k += 2) {
            if (trail[k] < 50 || trail[k] > FIELD.w - 50 || trail[k + 1] < 60 || trail[k + 1] > FIELD.h - 50) inside = false;
          }
          if (!inside) continue;
          let score = 0;
          if (kind === 'close') {
            let near = Infinity;
            for (let k = 0; k < trail.length; k += 2) {
              sys.bodies.forEach((bd, i) => {
                if (i === leg.from) return;
                const q = bodyAt(sys.bodies, i, t0 + (k / 2 + 1) * 4 * DT); // trail points are every 4 steps
                near = Math.min(near, Math.hypot(trail[k] - q.x, trail[k + 1] - q.y) / bd.r);
              });
            }
            score = near < SKIM ? -near : -99;
          } else {
            const ux = Math.cos(direct);
            const uy = Math.sin(direct);
            for (let k = 0; k < trail.length; k += 2) {
              score = Math.max(score, Math.abs((trail[k] - a.x) * uy - (trail[k + 1] - a.y) * ux));
            }
          }
          if (!best || score > best.score) best = { score, trail, at, power: p, brakeAt, dir, t0, arrives: arrivalDir(f, sys) };
        }
      }
    }
    if (best) break;
  }
  return best;
}

// Lay a system's mote lines and gold routes leg by leg: each leg's gold route starts circling the
// way the previous one arrived, so the routes chain into one gold run.
export const PLANS = [
  ['wide', 'close', 'wide', 'wide'],
  ['close', 'wide', 'close', 'wide'],
  ['wide', 'close', 'close', 'wide'],
];
export function lay(si) {
  const sys = SYSTEMS[si];
  let dir = START_DIR;
  const motes = [];
  const gold = [];
  sys.legs.forEach((_, li) => {
    const kind = PLANS[si][li];
    const count = li === sys.legs.length - 1 ? 7 : 5;
    let r = null;
    for (const t0 of startTimes(sys, 4)) {
      r = route(sys, li, kind, { t0, dir });
      if (r) break;
    }
    if (!r) throw new Error(`system ${si + 1} leg ${li + 1}: no captured route circling ${dir}`);
    const n = r.trail.length / 2;
    for (let k = 1; k <= count; k++) {
      const i = Math.floor(n * (0.15 + (0.65 * (k - 1)) / (count - 1)));
      motes.push({ line: kind, leg: li, x: Math.round(r.trail[i * 2]), y: Math.round(r.trail[i * 2 + 1]) });
    }
    const g = { at: +r.at.toFixed(4), power: +r.power.toFixed(2), dir };
    if (r.brakeAt >= 0) g.brakeAt = r.brakeAt;
    if (r.t0) g.t0 = +r.t0.toFixed(3);
    gold.push(g);
    dir = r.arrives;
  });
  return { motes, gold };
}

function pct(x) {
  return `${Math.round(x * 100)}%`.padStart(4);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [si, cmd] = process.argv.slice(2);
  if (cmd === 'lay') {
    console.log(JSON.stringify(lay(Number(si))));
    process.exit(0);
  }
  const only = si !== undefined ? [Number(si)] : SYSTEMS.map((_, i) => i);
  for (const i of only) {
    const sys = SYSTEMS[i];
    console.log(`== ${i + 1} ${sys.name}`);
    for (let l = 0; l < sys.legs.length; l++) {
      const r0 = rate(sys, l);
      const age = rate.lastMedianAge;
      const rb = sys.brake ? rate(sys, l, { brake: true }) : null;
      const byStart = sys.bodies.some((b) => b.orbit) ? rateByStart(sys, l).map((x) => Math.round(x * 100)) : null;
      const w = window(sys, l);
      console.log(
        `leg ${l + 1}: window ${String(w.deg).padStart(3)}° at power ${w.power.toFixed(2)}, ${pct(r0)} of blind releases caught (median ${age.toFixed(1)} s)${rb !== null ? `, ${pct(rb)} with the brake` : ''}` +
          (byStart ? `  by start time ${byStart.join(' ')}` : '')
      );
    }
    const pc = parkingClear(sys);
    if (pc.length) console.log('  parking:', pc.slice(0, 4).join('; '));
  }
}

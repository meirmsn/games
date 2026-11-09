// Measure Orbit's legs headless, with the game's own physics: how many roughly aimed flicks
// capture (with and without the brake), how many motes one captured flight can take, and whether
// a parking ring ever touches another body. tests/orbit-levels.test.mjs pins the results.
//
//   node scripts/orbit/solve.mjs            every system
//   node scripts/orbit/solve.mjs 1          one system (0-based)
//   node scripts/orbit/solve.mjs 1 2 close  print a mote line along a close route of leg 2
//                                           (or 'wide'), to paste into orbit/levels.js
import { SYSTEMS } from '../../orbit/levels.js';
import { fly, bodyAt, park, positions, SKIM, CATCH_WIDTH, FIELD, DT } from '../../orbit/physics.js';

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

// One roughly aimed flick: within 35° of the straight line to the target, power above a quarter.
function flick(sys, legIndex, rnd, t0) {
  const leg = sys.legs[legIndex];
  const a = bodyAt(sys.bodies, leg.from, t0);
  const b = bodyAt(sys.bodies, leg.to, t0);
  const direct = Math.atan2(b.y - a.y, b.x - a.x);
  return { angle: direct + (rnd() - 0.5) * ((70 * Math.PI) / 180), power: 0.25 + rnd() * 0.75 };
}

const BRAKES = [0.4, 0.7, 1, 1.3, 1.6, 2, 2.4, 2.8, 3.3, 3.8, 4.4, 5];

// Capture rate over roughly aimed flicks; with brake: true, a flick counts if some brake moment
// (a player watching the ring) makes it capture.
export function rate(sys, legIndex, { samples = 1200, seed = 7, t0s = startTimes(sys), brake = false } = {}) {
  const rnd = rng(seed);
  let ok = 0;
  const ages = [];
  for (let k = 0; k < samples; k++) {
    const t0 = t0s[k % t0s.length];
    const { angle, power } = flick(sys, legIndex, rnd, t0);
    let f = fly(sys, legIndex, angle, power, t0);
    if (f.result !== 'captured' && brake && sys.brake) {
      for (const bt of BRAKES) {
        if (bt > f.age) break;
        f = fly(sys, legIndex, angle, power, t0, { brakeAt: bt });
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

// The rate at each start time separately (for moon legs: does waiting matter?).
export function rateByStart(sys, legIndex, opts = {}) {
  return startTimes(sys).map((t0) => rate(sys, legIndex, { ...opts, samples: 400, t0s: [t0] }));
}

// The most motes of this leg that one captured flight takes, searching a fine grid of aims (and
// brake moments, start times).
export function bestMotes(sys, legIndex, { t0s = startTimes(sys, 6) } = {}) {
  const leg = sys.legs[legIndex];
  let best = 0;
  let route = null;
  for (const t0 of t0s) {
    const a = bodyAt(sys.bodies, leg.from, t0);
    const b = bodyAt(sys.bodies, leg.to, t0);
    const direct = Math.atan2(b.y - a.y, b.x - a.x);
    for (let da = -80; da <= 80; da += 2) {
      for (let p = 0.2; p <= 1.0001; p += 0.025) {
        const tries = sys.brake ? [-1, ...BRAKES] : [-1];
        for (const bt of tries) {
          const f = fly(sys, legIndex, direct + (da * Math.PI) / 180, p, t0, { brakeAt: bt });
          if (f.result === 'captured' && f.caught.length > best) {
            best = f.caught.length;
            route = { t0, angle: direct + (da * Math.PI) / 180, power: p, brakeAt: bt };
          }
        }
      }
    }
  }
  return { best, total: (sys.motes || []).filter((m) => m.leg === legIndex).length, route };
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

// A captured route of the given kind, for laying a mote line on it: 'close' passes nearest a body
// (other than the two ends) without touching; 'wide' strays farthest from the straight line.
export function route(sys, legIndex, kind, t0 = 0) {
  const leg = sys.legs[legIndex];
  const a = bodyAt(sys.bodies, leg.from, t0);
  const b = bodyAt(sys.bodies, leg.to, t0);
  const direct = Math.atan2(b.y - a.y, b.x - a.x);
  let best = null;
  // without a brake first; a leg that can't be caught without one tries brake moments too
  for (const brakes of [[-1], sys.brake ? BRAKES : []]) {
    for (let da = -80; da <= 80; da += 1) {
      for (let p = 0.2; p <= 1.0001; p += 0.02) {
        for (const brakeAt of brakes) {
          const trail = [];
          const f = fly(sys, legIndex, direct + (da * Math.PI) / 180, p, t0, { trail, brakeAt });
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
          if (!best || score > best.score) best = { score, trail, angle: direct + (da * Math.PI) / 180, power: p, brakeAt };
        }
      }
    }
    if (best) break;
  }
  return best;
}

function pct(x) {
  return `${Math.round(x * 100)}%`.padStart(4);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [si, li, kind, count = '5'] = process.argv.slice(2);
  if (kind) {
    const sys = SYSTEMS[Number(si)];
    const r = route(sys, Number(li) - 1, kind);
    if (!r) {
      console.log('no captured route');
      process.exit(1);
    }
    // motes spread along the middle of the route
    const n = r.trail.length / 2;
    const c = Number(count);
    const out = [];
    for (let k = 1; k <= c; k++) {
      const i = Math.floor(n * (0.15 + (0.65 * (k - 1)) / (c - 1)));
      out.push(`{ leg: ${Number(li) - 1}, x: ${Math.round(r.trail[i * 2])}, y: ${Math.round(r.trail[i * 2 + 1])} }`);
    }
    console.log(`// ${kind} route: angle ${r.angle.toFixed(3)}, power ${r.power.toFixed(2)}, brakeAt ${r.brakeAt}, score ${r.score.toFixed(2)}`);
    console.log(out.join(',\n'));
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
      const m = process.env.FAST ? { best: '-', total: '-' } : bestMotes(sys, l);
      const byStart = sys.bodies.some((b) => b.orbit) ? rateByStart(sys, l).map((x) => Math.round(x * 100)) : null;
      console.log(
        `leg ${l + 1}: ${pct(r0)} capture (median ${age.toFixed(1)} s)${rb !== null ? `, ${pct(rb)} with the brake` : ''}, best flight ${m.best}/${m.total} motes` +
          (byStart ? `  by start time ${byStart.join(' ')}` : '')
      );
    }
    const pc = parkingClear(sys);
    if (pc.length) console.log('  parking:', pc.slice(0, 4).join('; '));
  }
}

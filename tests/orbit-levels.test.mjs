// Orbit's tuning, measured headless with the game's own physics (orbit/physics.js) over the
// systems in orbit/levels.js. scripts/orbit/solve.mjs prints the same numbers while tuning.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SYSTEMS } from '../orbit/levels.js';
import { fly, launch, step, preview, DT, MAX_FLIGHT, catchLimit, ASSIST_BAND, CATCH_WIDTH } from '../orbit/physics.js';
import { rate, rateByStart, parkingClear } from '../scripts/orbit/solve.mjs';

const SAMPLES = 900;
const withBrake = (sys) => Boolean(sys.brake);

test('orbit AC-12: System 1 leg 1 catches at least 60% of roughly aimed flicks, and every leg can be caught', () => {
  assert.ok(rate(SYSTEMS[0], 0, { samples: SAMPLES, t0s: [0] }) >= 0.6);
  for (const sys of SYSTEMS) {
    sys.legs.forEach((_, l) => {
      const r = rate(sys, l, { samples: 300, brake: withBrake(sys) });
      assert.ok(r > 0.1, `${sys.name} leg ${l + 1}: ${r}`);
    });
  }
});

test('orbit AC-12: waves, not a ramp: leg 3 is harder than leg 2, and leg 4 the easiest of legs 2-4', () => {
  for (const sys of SYSTEMS) {
    const r = sys.legs.map((_, l) => rate(sys, l, { samples: SAMPLES, brake: withBrake(sys) }));
    assert.ok(r[2] < r[1], `${sys.name}: leg 3 ${r[2]} vs leg 2 ${r[1]}`);
    assert.ok(r[3] > r[1] && r[3] > r[2], `${sys.name}: leg 4 ${r[3]} vs ${r[1]}, ${r[2]}`);
  }
});

test('orbit AC-12: System 2 leg 1 needs the brake (under 20% without, at least 40% with)', () => {
  const sys = SYSTEMS[1];
  assert.ok(rate(sys, 0, { samples: SAMPLES }) < 0.2);
  assert.ok(rate(sys, 0, { samples: SAMPLES, brake: true }) >= 0.4);
});

test('orbit AC-12: on System 3, waiting for the moon matters (best start time at least twice the worst)', () => {
  const sys = SYSTEMS[2];
  const leg = sys.legs.findIndex((l) => sys.bodies[l.to].orbit);
  const r = rateByStart(sys, leg, { brake: true });
  assert.ok(Math.max(...r) >= 2 * Math.min(...r), r.join(' '));
});

test('orbit AC-12: every leg has a gold route that catches every mote of its leg', () => {
  for (const sys of SYSTEMS) {
    sys.legs.forEach((leg, l) => {
      const total = sys.motes.filter((m) => m.leg === l).length;
      assert.ok(total >= 5, `${sys.name} leg ${l + 1} has motes`);
      const f = fly(sys, l, leg.gold.angle, leg.gold.power, 0, { brakeAt: leg.gold.brakeAt ?? -1 });
      assert.equal(f.result, 'captured', `${sys.name} leg ${l + 1}`);
      assert.equal(f.caught.length, total, `${sys.name} leg ${l + 1} motes`);
    });
  }
});

test('orbit AC-12: a typical captured flight is an arc, not a hop (median 0.7-2.5 s)', () => {
  for (const sys of SYSTEMS) {
    sys.legs.forEach((_, l) => {
      rate(sys, l, { samples: 600, brake: withBrake(sys) });
      const m = rate.lastMedianAge;
      assert.ok(m >= 0.7 && m <= 2.5, `${sys.name} leg ${l + 1}: ${m}`);
    });
  }
});

test('orbit AC-5: no body, nor the target band, ever meets the parking ring', () => {
  for (const sys of SYSTEMS) assert.deepEqual(parkingClear(sys), [], sys.name);
});

test('orbit AC-11: System 1 has planets only and no brake, System 2 the brake and a big planet, System 3 moons; each its own look', () => {
  const [a, b, c] = SYSTEMS;
  assert.equal(a.brake, false);
  assert.ok(a.bodies.every((x) => !x.orbit));
  assert.equal(b.brake, true);
  assert.ok(b.bodies.every((x) => !x.orbit));
  const biggest = Math.max(...b.bodies.map((x) => x.r));
  assert.ok(biggest >= 1.5 * Math.max(...a.bodies.map((x) => x.r)), 'a big planet to swing around');
  assert.ok(c.bodies.some((x) => x.orbit), 'moons');
  assert.equal(new Set(SYSTEMS.map((s) => s.nebula)).size, 3);
  const imgs = SYSTEMS.map((s) => s.bodies.map((x) => x.img).join());
  assert.equal(new Set(imgs).size, 3);
});

test('orbit AC-4: inside the band under the limit is caught (inside the ring too); over the limit flies through', () => {
  const sys = SYSTEMS[0];
  const leg = sys.legs[0];
  const tb = sys.bodies[leg.to];
  const f = launch(sys, 0, 0, 0.5, 0);
  const limit = catchLimit(sys, leg.to, 0);
  for (const [dist, speed, want] of [
    [tb.ring + CATCH_WIDTH - 4, limit * 0.9, 'captured'],
    [tb.ring * 0.6, limit * 0.9, 'captured'],
    [tb.ring + 4, limit * 1.2, null],
  ]) {
    Object.assign(f, { x: tb.x + dist, y: tb.y, vx: 0, vy: -speed, result: null, fastPass: false, age: 0 });
    step(f, sys);
    assert.equal(f.result, want, `${dist} at ${speed}`);
  }
  assert.equal(f.fastPass, true);
});

test('orbit AC-5: hitting a body, swinging away, looping round another body or 8 s all fail the flight', () => {
  const sys = SYSTEMS[0];
  const b = sys.bodies[2];
  const hit = launch(sys, 0, 0, 0.5, 0);
  Object.assign(hit, { x: b.x + b.r + 2, y: b.y, vx: -400, vy: 0 });
  while (!hit.result) step(hit, sys);
  assert.deepEqual([hit.result, hit.why], ['crashed', 'hit']);
  // straight out of the field
  const away = fly(sys, 0, Math.PI / 2, 1, 0);
  assert.deepEqual([away.result, away.why], ['lost', 'away']);
  // circling a body that isn't the target: one loop and it's over (the others' pull switched off,
  // so the orbit stays a clean circle; the speed is circular for the softened gravity)
  const alone = structuredClone(sys);
  alone.bodies.forEach((x, i) => i !== 2 && (x.mu = 0));
  const c = alone.bodies[2];
  const r = 150;
  const v = Math.sqrt((c.mu * r * r) / (r * r + 400) ** 1.5);
  const loop = launch(alone, 0, 0, 0.5, 0);
  Object.assign(loop, { x: c.x + r, y: c.y, vx: 0, vy: -v });
  while (!loop.result) step(loop, alone);
  assert.deepEqual([loop.result, loop.why], ['lost', 'stuck']);
  const period = (2 * Math.PI * r) / v;
  assert.ok(Math.abs(loop.age - period) < 0.1, `after one loop: ${loop.age} of ${period}`);
  // the clock
  const slow = launch(sys, 0, 0, 0.5, 0);
  Object.assign(slow, { x: 60, y: 60, vx: 0, vy: 0, age: MAX_FLIGHT - DT / 2 });
  const saved = sys.bodies.map((x) => x.mu);
  sys.bodies.forEach((x) => (x.mu = 0));
  step(slow, sys);
  step(slow, sys);
  sys.bodies.forEach((x, i) => (x.mu = saved[i]));
  assert.deepEqual([slow.result, slow.why], ['lost', 'time']);
});

test('orbit AC-5: circling the planet a moon target goes round is not a failure', () => {
  // System 3's moon leg with only the moon's planet pulling and the moon's band out of reach, so
  // nothing but the loop rule could end the flight before 8 s
  const sys = structuredClone(SYSTEMS[2]);
  const li = sys.legs.findIndex((l) => sys.bodies[l.to].orbit);
  const moon = sys.bodies[sys.legs[li].to];
  sys.bodies.forEach((x, i) => i !== moon.orbit.around && (x.mu = 0));
  moon.ring = 1;
  const p = sys.bodies[moon.orbit.around];
  const r = 200;
  const v = Math.sqrt((p.mu * r * r) / (r * r + 400) ** 1.5);
  const period = (2 * Math.PI * r) / v;
  assert.ok(period * 1.5 < 7.5, 'a loop and a half fits in the flight time');
  const f = launch(sys, li, 0, 0.5, 0);
  Object.assign(f, { x: p.x + r, y: p.y, vx: 0, vy: -v });
  while (!f.result && f.age < period * 1.5) step(f, sys);
  assert.equal(f.result, null, `${f.result} ${f.why} at ${f.age} of a ${period} s loop`);
});

test('orbit AC-8: the preview lies on the real flight and stops by 1.3 s', () => {
  const sys = SYSTEMS[1];
  const pts = preview(sys, 1, -1.7, 0.5, 0);
  const trail = [];
  fly(sys, 1, -1.7, 0.5, 0, { trail });
  // every preview point is on (within a step of) the flight's path
  for (let k = 0; k < pts.length; k += 2) {
    let near = Infinity;
    for (let j = 0; j < trail.length; j += 2) near = Math.min(near, Math.hypot(pts[k] - trail[j], pts[k + 1] - trail[j + 1]));
    assert.ok(near < 12, `point ${k / 2} is ${near} from the flight`);
  }
  const f = launch(sys, 1, -1.7, 0.5, 0);
  let n = 0;
  while (!f.result && f.age < 1.3) {
    step(f, sys);
    n++;
  }
  assert.ok(pts.length / 2 <= Math.ceil(n / 3) + 2);
});

test('orbit AC-9: the assist widens the band by 15% and the limit by 25% at most', () => {
  const sys = SYSTEMS[0];
  const to = sys.legs[0].to;
  assert.ok(Math.abs(catchLimit(sys, to, 1) / catchLimit(sys, to, 0) - 1.25) < 1e-9);
  assert.equal(ASSIST_BAND, 0.15);
});

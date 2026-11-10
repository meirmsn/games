// Unit tests for the shared explosion effect (shared/explosion.js). No browser: the module runs in
// plain Node, drawn on a recording fake context.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createExplosions } from '../shared/explosion.js';

function seeded(seed = 7) {
  let a = seed;
  return () => {
    a = (a * 1664525 + 1013904223) >>> 0;
    return a / 4294967296;
  };
}

function fakeCtx() {
  const calls = {};
  const handler = {
    get(target, key) {
      if (key in target) return target[key];
      return (...args) => {
        calls[key] = (calls[key] || 0) + 1;
      };
    },
    set(target, key, value) {
      target[key] = value;
      return true;
    },
  };
  return { ctx: new Proxy({}, handler), calls };
}

const run = (fx, seconds, dt) => {
  for (let t = 0; t < seconds - 1e-9; t += dt) fx.update(dt);
};

test('crumble AC-14: a burst makes flash, fire, smoke, sparks and debris, then all of it dies away', () => {
  const fx = createExplosions({ random: seeded() });
  fx.burst(100, 100, { radius: 40 });
  const kinds = new Set(fx.particles().map((p) => p.kind));
  assert.equal(kinds.size, 6, 'six kinds of particle');
  assert.ok(fx.count > 30);
  run(fx, 0.5, 1 / 60);
  assert.ok(fx.count > 0, 'smoke is still there after half a second');
  run(fx, 2.6, 1 / 60);
  assert.equal(fx.count, 0, 'all gone after about three seconds');
});

test('crumble AC-14: it is the same at 60 and 120 Hz (delta time)', () => {
  const a = createExplosions({ random: seeded(3) });
  const b = createExplosions({ random: seeded(3) });
  a.burst(0, 0, { radius: 50, wind: 30 });
  b.burst(0, 0, { radius: 50, wind: 30 });
  run(a, 0.5, 1 / 60);
  run(b, 0.5, 1 / 120);
  const pa = a.particles();
  const pb = b.particles();
  assert.equal(pa.length, pb.length);
  for (let i = 0; i < pa.length; i++) {
    assert.ok(Math.abs(pa[i].x - pb[i].x) < 3, `x close (${pa[i].x} vs ${pb[i].x})`);
    assert.ok(Math.abs(pa[i].y - pb[i].y) < 3, `y close (${pa[i].y} vs ${pb[i].y})`);
  }
});

test('crumble AC-14: the pool is capped, so many bursts never grow it', () => {
  const fx = createExplosions({ max: 120, random: seeded() });
  for (let i = 0; i < 50; i++) fx.burst(i * 10, 0, { radius: 60 });
  assert.ok(fx.count <= 120);
  // The latest burst's flash is in, even though the pool was full.
  assert.ok(fx.particles().some((p) => p.kind === 0 && p.x === 490));
});

test('crumble AC-14: smoke drifts with the wind', () => {
  const fx = createExplosions({ random: seeded() });
  fx.burst(0, 0, { radius: 40, wind: 80, debris: null });
  run(fx, 1, 1 / 60);
  const smoke = fx.particles().filter((p) => p.kind === 3);
  assert.ok(smoke.length > 0);
  const mean = smoke.reduce((s, p) => s + p.x, 0) / smoke.length;
  assert.ok(mean > 15, `smoke leans downwind (mean x ${mean.toFixed(1)})`);
});

test('crumble AC-14: shake rises with the blast and decays on its own; draw works with no art', () => {
  const fx = createExplosions({ random: seeded() });
  assert.equal(fx.shake(), 0);
  fx.burst(0, 0, { radius: 30 });
  const small = fx.shake();
  fx.clear();
  fx.burst(0, 0, { radius: 60 });
  assert.ok(fx.shake() > small, 'a bigger blast shakes more');
  const { ctx, calls } = fakeCtx();
  fx.draw(ctx);
  assert.ok(calls.arc > 0 && calls.fillRect > 0 && calls.stroke > 0, 'circles, debris and sparks drawn');
  run(fx, 0.6, 1 / 60);
  assert.equal(fx.shake(), 0);
  // A huge dt (a hidden tab) doesn't explode the numbers.
  fx.burst(0, 0, {});
  fx.update(30);
  for (const p of fx.particles()) assert.ok(Number.isFinite(p.x) && Math.abs(p.x) < 1000);
});

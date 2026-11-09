// End-to-end tests for Orbit. Run: scripts/check-slow.sh.
// The game exposes window.__orbit: its state, and update(dt), which advances the game without
// drawing, so a test can set up a situation and check what the rules do with it. Setting
// manual = true stops the page's own frames from advancing it.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import { FAKE_AUDIO } from './fake-audio.mjs';

// Its own port range: the test files run in parallel.
const PORT = 9300 + Math.floor(Math.random() * 100);
const BASE = `http://127.0.0.1:${PORT}/`;
let server;
let browser;

before(async () => {
  server = spawn('python3', ['-m', 'http.server', '--bind', '127.0.0.1', String(PORT)], {
    cwd: new URL('..', import.meta.url).pathname,
    stdio: 'ignore',
  });
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(BASE)).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  browser = await chromium.launch();
});

after(async () => {
  await browser?.close();
  server?.kill();
});

async function open({ hash = '', viewport = { width: 390, height: 844 }, init = [], hasTouch = true } = {}) {
  const context = await browser.newContext({ viewport, hasTouch });
  for (const fn of init) await context.addInitScript(fn);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(BASE + 'orbit/' + hash);
  await page.waitForFunction(() => window.__orbit && 'ready' in document.body.dataset);
  return { context, page, errors };
}

// Take the clock: the page's frames only draw from now on.
const manual = (page) => page.evaluate(() => (window.__orbit.manual = true));
const frames = (page, n, dt = 1 / 60) =>
  page.evaluate(
    ([n, dt]) => {
      for (let i = 0; i < n; i++) window.__orbit.update(dt);
    },
    [n, dt]
  );
const state = (page) =>
  page.evaluate(() => {
    const g = window.__orbit.game;
    return { mode: g.mode, sys: g.sys, leg: g.leg, clock: g.clock, legStart: g.legStart, launches: g.launches, fails: g.fails, legFails: g.legFails, taken: g.taken.size, skims: g.skims, paused: g.paused };
  });
// Run frames until the flight is over (caught, or rewound to the leg's start).
const settle = (page) =>
  page.evaluate(() => {
    const o = window.__orbit;
    for (let i = 0; i < 60 * 20 && o.game.mode !== 'idle' && o.game.mode !== 'done'; i++) o.update(1 / 60);
    return o.game.mode;
  });
// Fly a leg's stored gold route (power in the game's terms: past the drag's dead zone).
const flyGold = (page) =>
  page.evaluate(() => {
    const o = window.__orbit;
    const g = o.game;
    const gold = g.level.legs[g.leg].gold;
    g.clock = g.legStart; // the routes are timed from the leg's start
    o.fire(gold.angle, 0.06 + gold.power * 0.94);
    for (let i = 0; i < 240 * 12 && g.mode === 'fly'; i++) {
      if (gold.brakeAt !== undefined && g.flight && g.flight.brakeLeft && g.flight.age >= gold.brakeAt) o.tap();
      o.update(1 / 240);
    }
    for (let i = 0; i < 120 && g.mode === 'capture'; i++) o.update(1 / 60);
    return g.lastResult;
  });
// A canvas pointer event at CSS px (x, y).
const pointer = (page, type, x, y, id = 1) =>
  page.evaluate(
    ([type, x, y, id]) =>
      document.querySelector('#space').dispatchEvent(
        new PointerEvent(type, { pointerId: id, clientX: x, clientY: y, bubbles: true, isPrimary: id === 1, pointerType: 'touch' })
      ),
    [type, x, y, id]
  );

test('orbit AC-1: System 1 is alive before any touch: planets turn, the probe circles, the ring is drawn', async () => {
  const { context, page, errors } = await open();
  const s = await state(page);
  assert.deepEqual([s.sys, s.leg, s.mode], [0, 0, 'idle']);
  const a = await page.evaluate(() => window.__orbit.probeWorld());
  await page.waitForTimeout(500);
  const b = await page.evaluate(() => window.__orbit.probeWorld());
  assert.ok(Math.hypot(a.x - b.x, a.y - b.y) > 5, 'the probe circles');
  // the planets and the target ring are on the canvas
  const lit = await page.evaluate(() => {
    const o = window.__orbit;
    const c = document.querySelector('#space');
    const ctx = c.getContext('2d');
    const dpr = c.width / innerWidth;
    const px = (wx, wy) => ctx.getImageData(Math.round((o.view.x + wx * o.view.s) * dpr), Math.round((o.view.y + wy * o.view.s) * dpr), 1, 1).data;
    const target = o.game.level.bodies[o.game.level.legs[0].to];
    const planet = px(target.x, target.y);
    // the ring's dashes: some point on the ring is lit
    let ring = 0;
    for (let k = 0; k < 64; k++) {
      const a = (k / 64) * Math.PI * 2;
      const d = px(target.x + Math.cos(a) * target.ring, target.y + Math.sin(a) * target.ring);
      ring = Math.max(ring, d[2]);
    }
    return { planet: planet[0] + planet[1] + planet[2], ring };
  });
  assert.ok(lit.planet > 120, 'the planet is drawn');
  assert.ok(lit.ring > 120, 'the ring is drawn');
  assert.deepEqual(errors, []);
  await context.close();
});

test('orbit AC-2: drag back and release launches opposite the drag, from the point facing the aim, with power from the drag length', async () => {
  const { context, page } = await open();
  await manual(page);
  const full = await page.evaluate(() => 0.35 * 1000 * window.__orbit.view.s);
  // drag down (and a little left) by half of full power: the probe goes up (and a little right)
  await pointer(page, 'pointerdown', 200, 400);
  await pointer(page, 'pointermove', 200 - full * 0.1, 400 + full * 0.5);
  assert.equal((await state(page)).mode, 'aim');
  await pointer(page, 'pointerup', 200 - full * 0.1, 400 + full * 0.5);
  const l = await page.evaluate(() => {
    const o = window.__orbit;
    const b = o.game.level.bodies[o.game.level.legs[0].from];
    return { ...o.game.lastLaunch, bx: b.x, by: b.y, ring: b.ring, mode: o.game.mode };
  });
  assert.equal(l.mode, 'fly');
  assert.ok(Math.abs(l.angle - Math.atan2(-0.5, 0.1)) < 0.01, 'opposite the drag');
  assert.ok(Math.abs(Math.hypot(0.1, 0.5) - l.power) < 0.02, 'power is the drag over full power');
  const ux = Math.cos(l.angle);
  const uy = Math.sin(l.angle);
  assert.ok(Math.hypot(l.x - (l.bx + ux * l.ring), l.y - (l.by + uy * l.ring)) < 1, 'from the point facing the aim');
  assert.ok((l.vx * ux + l.vy * uy) > 0, 'flying along the aim');
  await settle(page);

  const before = (await state(page)).launches;
  // inside the dead zone: nothing
  await pointer(page, 'pointerdown', 200, 400);
  await pointer(page, 'pointermove', 203, 402);
  await pointer(page, 'pointerup', 203, 402);
  // dragged out, then back to the start: nothing
  await pointer(page, 'pointerdown', 200, 400);
  await pointer(page, 'pointermove', 200, 400 + full * 0.6);
  await pointer(page, 'pointermove', 201, 401);
  await pointer(page, 'pointerup', 201, 401);
  // starting in the bottom edge strip: ignored
  await pointer(page, 'pointerdown', 200, 844 - 10);
  assert.equal((await state(page)).mode, 'idle');
  await pointer(page, 'pointermove', 200, 600);
  await pointer(page, 'pointerup', 200, 600);
  assert.equal((await state(page)).launches, before, 'nothing launched');
  // a second finger doesn't change the aim
  await pointer(page, 'pointerdown', 200, 400, 1);
  await pointer(page, 'pointermove', 200, 400 + full * 0.5, 1);
  const aim1 = await page.evaluate(() => window.__orbit.input.angle);
  await pointer(page, 'pointerdown', 300, 300, 2);
  await pointer(page, 'pointermove', 100, 100, 2);
  assert.equal(await page.evaluate(() => window.__orbit.input.angle), aim1);
  await context.close();
});

test('orbit AC-3: the same aim gives the same flight at 60 Hz and 120 Hz, brake included', async () => {
  const { context, page } = await open({ hash: '#s2' });
  await manual(page);
  const run = (hz) =>
    page.evaluate((hz) => {
      const o = window.__orbit;
      o.startSystem(1);
      o.game.braked = true; // no slow-motion lesson in the way
      o.fire(0.25, 0.5);
      let frame = 0;
      while (o.game.mode === 'fly' && frame < hz * 20) {
        if (frame === hz / 2) o.tap(); // brake at 0.5 s
        o.update(1 / hz);
        frame++;
      }
      return o.game.lastResult;
    }, hz);
  const a = await run(60);
  const b = await run(120);
  assert.equal(a.result, b.result);
  assert.ok(Math.hypot(a.x - b.x, a.y - b.y) < 1e-6, `${a.x},${a.y} vs ${b.x},${b.y}`);
  assert.ok(Math.abs(a.age - b.age) < 1e-6);
  await context.close();
});

test('orbit AC-4: a capture parks the probe on the ring and the next leg begins', async () => {
  const { context, page } = await open();
  await manual(page);
  const r = await flyGold(page);
  assert.equal(r.result, 'captured');
  const s = await state(page);
  assert.deepEqual([s.leg, s.mode], [1, 'idle']);
  const parked = await page.evaluate(() => {
    const o = window.__orbit;
    const b = o.game.level.bodies[o.game.level.legs[0].to];
    const p = o.probeWorld();
    return { d: Math.hypot(p.x - b.x, p.y - b.y), ring: b.ring, from: o.game.level.legs[1].from, was: o.game.level.legs[0].to };
  });
  assert.ok(Math.abs(parked.d - parked.ring) < 1, 'on the ring');
  assert.equal(parked.from, parked.was, 'that planet starts the next leg');
  await context.close();
});

test('orbit AC-5: a failed flight rewinds within 1 s, with a ghost, and no lives lost; R in flight counts as a failure', async () => {
  const { context, page } = await open();
  await manual(page);
  // straight down into the bottom of the field: lost
  await page.evaluate(() => window.__orbit.fire(Math.PI / 2, 0.9));
  const timing = await page.evaluate(() => {
    const o = window.__orbit;
    let t = 0;
    while (o.game.mode === 'fly') {
      o.update(1 / 60);
    }
    while (o.game.mode !== 'idle') {
      o.update(1 / 60);
      t += 1 / 60;
    }
    return { t, clock: o.game.clock, legStart: o.game.legStart };
  });
  assert.ok(timing.t <= 1, `back at the start in ${timing.t} s`);
  assert.equal(timing.clock, timing.legStart);
  let s = await state(page);
  assert.equal(s.fails, 1);
  assert.ok(await page.evaluate(() => window.__orbit.game.ghost && window.__orbit.game.ghost.pts.length > 4), 'a ghost trail');
  // R in flight
  await page.evaluate(() => window.__orbit.fire(-1.5, 0.5));
  await frames(page, 10);
  await page.keyboard.press('r');
  await frames(page, 60);
  s = await state(page);
  assert.deepEqual([s.launches, s.fails, s.mode], [2, 2, 'idle']);
  assert.equal(await page.locator('[data-screen="done"]').isHidden(), true, 'no game over');
  await context.close();
});

test('orbit AC-5: on a moon system, a rewind puts the moons back where they were', async () => {
  const { context, page } = await open({ hash: '#s3' });
  await manual(page);
  await frames(page, 90); // the moon moves while the probe waits
  const moon = () => page.evaluate(() => window.__orbit.game.clock);
  const t0 = await moon();
  await page.evaluate(() => window.__orbit.fire(Math.PI / 2, 0.9));
  await settle(page);
  const s = await state(page);
  assert.equal(s.fails, 1);
  assert.equal(s.clock, s.legStart, 'the leg clock is back at the start');
  assert.ok(t0 > s.legStart);
  await context.close();
});

test('orbit AC-6: motes caught on a failed flight stay caught; skims are counted apart', async () => {
  const { context, page } = await open();
  await manual(page);
  const r = await page.evaluate(() => {
    const o = window.__orbit;
    const g = o.game;
    o.fire(-1.5, 0.5);
    o.update(1 / 60);
    // put the probe on a mote of this leg, then fly it into a planet
    const m = g.level.motes.find((x) => x.leg === 0);
    Object.assign(g.flight, { x: m.x, y: m.y, vx: 0, vy: 0 });
    o.update(1 / 240);
    const caught = g.taken.size;
    const b = g.level.bodies[2];
    Object.assign(g.flight, { x: b.x + b.r * 1.2, y: b.y, vx: -300, vy: 0 });
    for (let i = 0; i < 200 && g.mode === 'fly'; i++) o.update(1 / 240);
    for (let i = 0; i < 120; i++) o.update(1 / 60);
    return { caught, after: g.taken.size, skims: g.skims, fails: g.fails, why: g.lastResult.why };
  });
  assert.equal(r.caught, 1);
  assert.equal(r.why, 'hit');
  assert.equal(r.after, 1, 'the mote stays caught');
  assert.equal(r.skims, 1, 'passing through the glow was a skim');
  await context.close();
});

test('orbit AC-7: from System 2 a touch in flight brakes once, by 35%; System 1 has no brake', async () => {
  const { context, page } = await open();
  await manual(page);
  const speeds = (sys) =>
    page.evaluate((sys) => {
      const o = window.__orbit;
      o.startSystem(sys);
      o.game.braked = true;
      o.fire(-1.4, 0.6);
      o.update(1 / 60);
      const f = o.game.flight;
      const sp = () => Math.hypot(f.vx, f.vy); // the targets here sit still
      const a = sp();
      o.tap();
      const b = sp();
      o.tap();
      const c = sp();
      return [a, b, c];
    }, sys);
  const [a1, b1] = await speeds(0);
  assert.equal(a1, b1, 'no brake in System 1');
  const [a2, b2, c2] = await speeds(1);
  assert.ok(Math.abs(b2 / a2 - 0.65) < 1e-9);
  assert.equal(b2, c2, 'once per flight');
  await context.close();
});

test('orbit AC-8: the preview is amber where the probe is over the limit and cool under it', async () => {
  const { context, page } = await open({ hash: '#s2' });
  await manual(page);
  const r = await page.evaluate(() => {
    const o = window.__orbit;
    const p = 0.06 + 0.25 * 0.94;
    const cols = o.previewColours(-0.2, p); // past the big planet: it speeds up
    return { first: cols[0], last: cols[cols.length - 1], n: cols.length, pts: o.previewFor(-0.2, p).length / 2 };
  });
  assert.equal(r.first, true, 'slow at the start: cool');
  assert.equal(r.last, false, 'fast past the big planet: amber');
  assert.equal(r.n, r.pts, 'a colour per point');
  await context.close();
});

test('orbit AC-9: the hidden assist grows with misses, never changes the drawn ring, and resets on a capture', async () => {
  const { context, page } = await open();
  await manual(page);
  const steps = await page.evaluate(() => {
    const o = window.__orbit;
    return [0, 2, 3, 4, 5, 9].map((n) => {
      o.game.legFails = n;
      return Math.round(o.assistNow() * 1000) / 1000;
    });
  });
  assert.deepEqual(steps, [0, 0, 0.333, 0.667, 1, 1]);
  // with 3 misses, a probe 4% outside the drawn band is caught; with 2 it isn't
  const caught = (n) =>
    page.evaluate((n) => {
      const o = window.__orbit;
      const g = o.game;
      o.startSystem(0);
      g.legFails = n;
      o.fire(-1.5, 0.5);
      const b = g.level.bodies[g.level.legs[0].to];
      const ringBefore = b.ring;
      Object.assign(g.flight, { x: b.x + b.ring * 1.04 + 26, y: b.y, vx: 300, vy: 0 }); // heading out
      o.update(1 / 240);
      const res = g.mode;
      for (let i = 0; i < 400 && g.mode !== 'idle'; i++) o.update(1 / 60);
      return { res, ring: b.ring === ringBefore, legFails: g.legFails };
    }, n);
  const two = await caught(2);
  assert.notEqual(two.res, 'capture');
  const three = await caught(3);
  assert.equal(three.res, 'capture');
  assert.ok(three.ring, 'the drawn ring is the same');
  assert.equal(three.legFails, 0, 'reset by the capture');
  await context.close();
});

test('orbit AC-10: the end card shows motes, launches, skims, medal and badge; the best shows on the intro next time', async () => {
  const { context, page } = await open();
  await manual(page);
  for (let i = 0; i < 4; i++) assert.equal((await flyGold(page)).result, 'captured');
  assert.equal((await state(page)).mode, 'done');
  const card = page.locator('[data-screen="done"]');
  assert.equal(await card.isVisible(), true);
  assert.equal(await page.locator('[data-done-dust]').textContent(), '22 / 22');
  assert.equal(await page.locator('[data-done-launches]').textContent(), '4 / 6');
  assert.equal(await page.locator('[data-medal]').getAttribute('data-kind'), 'gold');
  assert.equal(await page.locator('[data-badge]').isVisible(), true);
  assert.match(await card.textContent(), /Skims/);
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('orbit.best'))[0]), 3);
  // the medal rules
  const m = await page.evaluate(() => {
    const f = window.__orbit.medalFor;
    return [f(20, 22, 6, 6), f(20, 22, 7, 6), f(16, 22, 12, 6), f(16, 22, 13, 6), f(3, 22, 30, 6)];
  });
  assert.deepEqual(m, [3, 2, 2, 1, 1]);
  await page.click('[data-retry]');
  assert.match(await page.locator('[data-intro-best]').textContent(), /gold/);
  await context.close();
});

test('orbit AC-10: with localStorage throwing, the game plays and shows its cards', async () => {
  const { context, page, errors } = await open({
    init: [
      () => {
        Storage.prototype.getItem = () => {
          throw new Error('blocked');
        };
        Storage.prototype.setItem = () => {
          throw new Error('blocked');
        };
      },
    ],
  });
  await manual(page);
  for (let i = 0; i < 4; i++) await flyGold(page);
  assert.equal(await page.locator('[data-screen="done"]').isVisible(), true);
  assert.deepEqual(errors, []);
  await context.close();
});

test('orbit AC-13: hiding the page in flight undoes the flight; a capture in progress completes', async () => {
  const { context, page } = await open();
  await manual(page);
  const hide = () =>
    page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
  const show = () =>
    page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
      document.dispatchEvent(new Event('visibilitychange'));
    });
  await page.evaluate(() => {
    const o = window.__orbit;
    o.fire(-1.5, 0.5);
    o.update(1 / 60);
    const m = o.game.level.motes.find((x) => x.leg === 0);
    Object.assign(o.game.flight, { x: m.x, y: m.y, vx: 0, vy: -10 });
    o.update(1 / 240);
  });
  await hide();
  let s = await state(page);
  assert.deepEqual([s.mode, s.launches, s.fails, s.taken, s.paused], ['idle', 0, 0, 1, true]);
  assert.equal(s.clock, s.legStart);
  await show();
  assert.equal(await page.locator('[data-resume]').isVisible(), true, 'waits for a touch');
  await frames(page, 30);
  assert.equal((await state(page)).clock, s.legStart, 'nothing moves until then');
  await page.click('[data-resume]');
  assert.equal((await state(page)).paused, false);
  // a capture in progress completes
  await page.evaluate(() => {
    const o = window.__orbit;
    const g = o.game;
    o.fire(-1.5, 0.5);
    const b = g.level.bodies[g.level.legs[0].to];
    Object.assign(g.flight, { x: b.x + b.ring, y: b.y, vx: 0, vy: -10 });
    o.update(1 / 240);
  });
  assert.equal((await state(page)).mode, 'capture');
  await hide();
  s = await state(page);
  assert.deepEqual([s.leg, s.mode], [1, 'idle']);
  await context.close();
});

test('orbit AC-14: arrows aim, Space launches and brakes, R rewinds; a cancelled pointer or a resize launches nothing', async () => {
  const { context, page } = await open({ hash: '#s2', hasTouch: false });
  await manual(page);
  await page.evaluate(() => (window.__orbit.game.braked = true));
  await page.keyboard.press('ArrowLeft');
  let r = await page.evaluate(() => ({ mode: window.__orbit.game.mode, kb: window.__orbit.input.keyboard, a: window.__orbit.input.angle, p: window.__orbit.input.power }));
  assert.deepEqual([r.mode, r.kb], ['aim', true]);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowUp');
  const r2 = await page.evaluate(() => ({ a: window.__orbit.input.angle, p: window.__orbit.input.power }));
  assert.ok(Math.abs(r2.a - r.a - (1 * Math.PI) / 180) < 1e-9, 'right turns the aim, half a degree a press');
  assert.ok(Math.abs(r2.p - r.p - 0.01) < 1e-9, 'up adds power');
  await page.keyboard.press(' ');
  assert.equal((await state(page)).mode, 'fly');
  await page.keyboard.press(' ');
  assert.equal(await page.evaluate(() => window.__orbit.game.flight.brakeLeft), 0, 'Space brakes in flight');
  await page.keyboard.press('r');
  await frames(page, 60);
  r = await state(page);
  assert.deepEqual([r.mode, r.launches, r.fails], ['idle', 1, 1]);
  // a cancelled pointer
  await pointer(page, 'pointerdown', 200, 400);
  await pointer(page, 'pointermove', 200, 500);
  await pointer(page, 'pointercancel', 200, 500);
  assert.equal((await state(page)).mode, 'idle');
  // a resize mid-drag
  await pointer(page, 'pointerdown', 200, 400, 3);
  await pointer(page, 'pointermove', 200, 500, 3);
  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForFunction(() => window.__orbit.game.mode === 'idle');
  await pointer(page, 'pointerup', 200, 500, 3);
  assert.equal((await state(page)).launches, 1, 'nothing launched');
  await context.close();
});

test('orbit AC-15: the URL starts a system; anything else starts System 1; a new hash loads its system', async () => {
  for (const [hash, sys] of [['#s2', 1], ['#s3', 2], ['#s9', 0], ['#x', 0], ['', 0]]) {
    const { context, page } = await open({ hash });
    assert.equal((await state(page)).sys, sys, hash);
    await context.close();
  }
  const { context, page } = await open();
  await page.evaluate(() => (location.hash = '#s3'));
  await page.waitForFunction(() => window.__orbit.game.sys === 2);
  assert.equal(await page.locator('[data-intro-name]').textContent(), 'Moons');
  await context.close();
});

test('orbit AC-17: after one visit that plays only System 1, Orbit opens offline at #s3 with its planets, nebula and sounds', async () => {
  const { context, page } = await open({ init: [FAKE_AUDIO] });
  await page.evaluate(() => navigator.serviceWorker.register('../sw.js'));
  await page.evaluate(() => Promise.race([navigator.serviceWorker.ready, new Promise((r) => setTimeout(r, 10000))]));
  await page.reload(); // controlled now: this load caches the game's files
  await page.waitForFunction(() => window.__orbit && 'ready' in document.body.dataset);
  await page.waitForLoadState('networkidle');
  await context.setOffline(true);
  await page.goto(BASE + 'orbit/#s3');
  await page.waitForFunction(() => window.__orbit && 'ready' in document.body.dataset);
  const r = await page.evaluate(() => {
    const o = window.__orbit;
    const imgs = o.game.level.bodies.map((b) => o.images[`planet${b.img}`].naturalWidth);
    return { sys: o.game.sys, imgs, nebula: o.images[`nebula-${o.game.level.nebula}`].naturalWidth, decoded: window.__decoded };
  });
  assert.equal(r.sys, 2);
  assert.ok(r.imgs.every((w) => w > 0), 'planets');
  assert.ok(r.nebula > 0, 'nebula');
  assert.equal(r.decoded, 11, 'every sound (and the back button)');
  await context.close();
});

test('orbit AC-18: each event plays its sound, and nothing plays while muted', async () => {
  const run = async (muted) => {
    const init = [FAKE_AUDIO];
    if (muted) init.push(() => localStorage.setItem('sound', 'off'));
    const { context, page } = await open({ hash: '#s2', init });
    await manual(page);
    await page.waitForFunction(() => window.__decoded >= 11);
    await page.mouse.click(5, 300); // unlock audio
    await page.evaluate(() => (window.__orbit.game.braked = true));
    await page.evaluate(() => {
      const o = window.__orbit;
      o.fire(-1.5, 0.5);
      o.tap(); // brake
    });
    await settle(page); // a crash or a loss
    await flyGold(page); // a capture, with motes
    // the drone loops on silently while muted (the shared sound's loops do); count everything else
    const drone = (await (await fetch(BASE + 'orbit/sounds/drone.mp3')).arrayBuffer()).byteLength;
    const r = await page.evaluate((drone) => ({ heard: [...window.__orbit.heard], played: window.__played.filter((p) => p.bytes !== drone).length }), drone);
    await context.close();
    return r;
  };
  const on = await run(false);
  for (const name of ['launch', 'brake', 'capture', 'mote']) assert.ok(on.heard.includes(name), name);
  assert.ok(on.heard.includes('crash') || on.heard.includes('lost'), 'crash or lost');
  assert.ok(on.played >= on.heard.length, 'they played');
  const off = await run(true);
  assert.ok(off.heard.length > 3);
  assert.equal(off.played, 0, 'muted: nothing played');
});

test('orbit AC-18: a crash plays the thud and a loss the falling blip', async () => {
  const { context, page } = await open();
  await manual(page);
  await page.evaluate(() => {
    const o = window.__orbit;
    o.fire(-1.5, 0.5);
    const b = o.game.level.bodies[2];
    Object.assign(o.game.flight, { x: b.x + b.r + 1, y: b.y, vx: -200, vy: 0 });
  });
  await settle(page);
  await page.evaluate(() => window.__orbit.fire(Math.PI / 2, 0.9));
  await settle(page);
  const heard = await page.evaluate(() => window.__orbit.heard);
  assert.ok(heard.includes('crash') && heard.includes('lost'));
  await context.close();
});

test('orbit AC-19: on System 2 leg 1, until the first brake, a fast approach slows time to 0.4x for 0.6 s', async () => {
  const { context, page } = await open({ hash: '#s2' });
  await manual(page);
  const r = await page.evaluate(() => {
    const o = window.__orbit;
    const g = o.game;
    g.braked = false;
    o.fire(-1.5, 0.5);
    const b = g.level.bodies[g.level.legs[0].to];
    Object.assign(g.flight, { x: b.x - b.ring * 1.8, y: b.y - 40, vx: 900, vy: 0 });
    o.update(1 / 240);
    const slow = g.slowmo;
    const age0 = g.flight.age;
    o.update(0.1);
    const ran = g.flight ? g.flight.age - age0 : null;
    return { slow, ran };
  });
  assert.ok(Math.abs(r.slow - 0.6) < 0.01, `slow motion for 0.6 s (${r.slow})`);
  assert.ok(Math.abs(r.ran - 0.04) < 0.006, `0.4x: ${r.ran}`);
  // once braked, never again
  const again = await page.evaluate(() => {
    const o = window.__orbit;
    const g = o.game;
    for (let i = 0; i < 200 && g.mode !== 'idle'; i++) o.update(1 / 60);
    g.braked = true;
    o.fire(-1.5, 0.5);
    const b = g.level.bodies[g.level.legs[0].to];
    Object.assign(g.flight, { x: b.x - b.ring * 1.8, y: b.y - 40, vx: 900, vy: 0 });
    g.slowmo = 0;
    o.update(1 / 240);
    return g.slowmo;
  });
  assert.equal(again, 0);
  await context.close();
});

test('orbit AC-20: the probe dims over the last 2 s before its time runs out', async () => {
  const { context, page } = await open();
  await manual(page);
  const r = await page.evaluate(() => {
    const o = window.__orbit;
    o.fire(-1.5, 0.5);
    const f = o.game.flight;
    const at = (age) => {
      f.age = age;
      return o.timeoutDim();
    };
    return [at(1), at(5.9), at(7), at(7.9)];
  });
  assert.equal(r[0], 1);
  assert.equal(r[1], 1);
  assert.ok(r[2] < 0.6 && r[2] > 0.4);
  assert.ok(r[3] < 0.2);
  await context.close();
});

test('orbit AC-21: the field and buttons fit 360x640 and 390x844 without scrolling, clear of the buttons', async () => {
  for (const viewport of [{ width: 360, height: 640 }, { width: 390, height: 844 }, { width: 1280, height: 800 }]) {
    const { context, page } = await open({ viewport });
    const r = await page.evaluate(() => {
      const v = window.__orbit.view;
      const back = document.querySelector('.shell-back').getBoundingClientRect();
      const mute = document.querySelector('.mute').getBoundingClientRect();
      return {
        top: v.y,
        left: v.x,
        right: v.x + 1000 * v.s,
        bottom: v.y + 1800 * v.s,
        backBottom: back.bottom,
        muteBottom: mute.bottom,
        buttons: [back.width, back.height, mute.width, mute.height],
        scroll: document.scrollingElement.scrollHeight - innerHeight + (document.scrollingElement.scrollWidth - innerWidth),
        w: innerWidth,
        h: innerHeight,
      };
    });
    assert.ok(r.top >= Math.max(r.backBottom, r.muteBottom), `${viewport.width}: below the buttons`);
    assert.ok(r.left >= 0 && r.right <= r.w && r.bottom <= r.h, `${viewport.width}: on screen`);
    assert.ok(r.buttons.every((x) => x >= 44));
    assert.equal(r.scroll, 0);
    await context.close();
  }
});

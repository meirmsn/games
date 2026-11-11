// clock-checked (specs/slow-tests-orbit-reef-runes.md)
// End-to-end tests for Orbit. Run: scripts/check-slow.sh.
// The game exposes window.__orbit: its state, and update(dt), which advances the game without
// drawing, so a test can set up a situation and check what the rules do with it. Setting
// manual = true stops the page's own frames from advancing it. open() sets it before the first frame
// (window.__orbitManual), so every test starts from the state its system starts in, however long the
// page took to load; only a test that checks the page's own frames opens it { live: true }.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launch, waitFor, realFrames } from './clock.mjs';
import { registerWorker, cachedAll } from './offline.mjs';
import { serve } from './serve.mjs';
import { simulateInsets, touchDrag, PORTRAIT_INSETS } from './insets.mjs';
import { FAKE_AUDIO } from './fake-audio.mjs';

let BASE; // set in before(), from tests/serve.mjs
let server;
let browser;

before(async () => {
  server = await serve();
  BASE = server.base;
  browser = await launch();
});

after(async () => {
  await browser?.close();
  server?.close();
});

async function open({ hash = '', viewport = { width: 390, height: 844 }, init = [], hasTouch = true, live = false } = {}) {
  const context = await browser.newContext({ viewport, hasTouch });
  if (!live) await context.addInitScript(() => (window.__orbitManual = true));
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
    g.clock = gold.t0 ?? g.legStart; // where the moons are (static systems don't mind)
    g.park.dir = gold.dir;
    o.fire(gold.power, gold.at);
    for (let i = 0; i < 240 * 12 && g.mode === 'fly'; i++) o.update(1 / 240);
    for (let i = 0; i < 180 && g.mode === 'capture'; i++) o.update(1 / 60);
    return g.lastResult;
  });
// A pointer event on the booster bar, at `share` of the way along its track.
const barPointer = (page, type, share, id = 1) =>
  page.evaluate(
    ([type, share, id]) => {
      const track = document.querySelector('[data-boost-track]').getBoundingClientRect();
      const x = track.left + share * track.width;
      const y = track.top + track.height / 2;
      document.querySelector('[data-boost]').dispatchEvent(
        new PointerEvent(type, { pointerId: id, clientX: x, clientY: y, bubbles: true, isPrimary: id === 1, pointerType: 'touch' })
      );
    },
    [type, share, id]
  );
// A canvas pointer event at CSS px (x, y).
const pointer = (page, type, x, y, id = 1) =>
  page.evaluate(
    ([type, x, y, id]) =>
      document.querySelector('#space').dispatchEvent(
        new PointerEvent(type, { pointerId: id, clientX: x, clientY: y, bubbles: true, isPrimary: id === 1, pointerType: 'touch' })
      ),
    [type, x, y, id]
  );

test('orbit AC-1, slow-tests-orbit-reef-runes AC-2: System 1 is alive before any touch: planets turn, the probe circles, the ring is drawn', async () => {
  const { context, page, errors } = await open({ live: true });
  const s = await state(page);
  assert.deepEqual([s.sys, s.leg, s.mode], [0, 0, 'idle']);
  const a = await page.evaluate(() => window.__orbit.probeWorld());
  // On the page's own frames, however few a busy machine runs in a given time.
  await waitFor(
    page,
    (a) => {
      const b = window.__orbit.probeWorld();
      return Math.hypot(a.x - b.x, a.y - b.y) > 5;
    },
    a,
    { what: 'the probe circles more than 5 units on its own' }
  );
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
  assert.ok(lit.ring > 40, 'the ring is drawn (a thin, faint line)');
  assert.deepEqual(errors, []);
  await context.close();
});

test('orbit AC-2: the bar sets the power, and a tap anywhere fires from where the probe is, along its orbit', async () => {
  const { context, page } = await open();
  await manual(page);
  const power = () => page.evaluate(() => window.__orbit.input.power);
  // a tap on the bar sets the power at that point; a drag along it moves it
  await barPointer(page, 'pointerdown', 0.7);
  await barPointer(page, 'pointerup', 0.7);
  assert.ok(Math.abs((await power()) - 0.7) < 0.01, 'a tap on the bar');
  await barPointer(page, 'pointerdown', 0.7);
  await barPointer(page, 'pointermove', 0.5);
  await barPointer(page, 'pointermove', 0.3);
  await barPointer(page, 'pointerup', 0.3);
  assert.ok(Math.abs((await power()) - 0.3) < 0.01, 'a drag along the bar');
  // a second finger on the bar doesn't move it
  await barPointer(page, 'pointerdown', 0.3, 1);
  await barPointer(page, 'pointerdown', 0.9, 2);
  await barPointer(page, 'pointermove', 0.9, 2);
  await barPointer(page, 'pointerup', 0.3, 1);
  assert.ok(Math.abs((await power()) - 0.3) < 0.01, 'a second finger is ignored');
  let s = await state(page);
  assert.deepEqual([s.mode, s.launches], ['idle', 0], 'the bar launches nothing');
  // a touch in the bottom edge strip is the phone's, not a launch
  await pointer(page, 'pointerdown', 200, 844 - 10);
  assert.equal((await state(page)).mode, 'idle');
  // a tap anywhere else fires: from where the probe is now, the way it's moving, at the bar's power
  const before = await page.evaluate(() => {
    const o = window.__orbit;
    return { at: o.orbitAngle(), p: o.probeWorld(), dir: o.game.park.dir };
  });
  await pointer(page, 'pointerdown', 200, 400);
  await pointer(page, 'pointerup', 200, 400);
  const l = await page.evaluate(() => {
    const o = window.__orbit;
    const b = o.game.level.bodies[o.game.level.legs[0].from];
    return { ...o.game.lastLaunch, bx: b.x, by: b.y, ring: b.ring, mu: b.mu, mode: o.game.mode };
  });
  assert.equal(l.mode, 'fly');
  assert.ok(Math.abs(l.at - before.at) < 1e-9 && Math.hypot(l.x - before.p.x, l.y - before.p.y) < 1e-6, 'from where the probe was');
  const tx = -Math.sin(l.at) * before.dir;
  const ty = Math.cos(l.at) * before.dir;
  const speed = Math.hypot(l.vx, l.vy);
  assert.ok((l.vx * tx + l.vy * ty) / speed > 0.9999, 'along the orbit, the way it was going');
  const escape = Math.sqrt((2 * l.mu) / l.ring);
  assert.ok(Math.abs(speed - (escape * 1.02 + 420 * 0.3)) < 1e-6, 'escape speed plus the bar');
  await context.close();
});

test('orbit AC-3: the same aim gives the same flight at 60 Hz and 120 Hz', async () => {
  const { context, page } = await open({ hash: '#s2' });
  await manual(page);
  const run = (hz) =>
    page.evaluate((hz) => {
      const o = window.__orbit;
      o.startSystem(1);
      o.fire(0.25, 0.5);
      let frame = 0;
      while (o.game.mode === 'fly' && frame < hz * 20) {
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
  // the catch eases in: the next leg's flight, followed frame by frame, never turns sharply
  const turn = await page.evaluate(() => {
    const o = window.__orbit;
    const g = o.game;
    const gd = g.level.legs[g.leg].gold;
    g.clock = gd.t0 ?? g.legStart;
    g.park.dir = gd.dir;
    o.fire(gd.power, gd.at);
    const pts = [];
    for (let i = 0; i < 60 * 20 && (g.mode === 'fly' || g.mode === 'capture'); i++) {
      o.update(1 / 60);
      const q = o.probeWorld();
      if (q) pts.push(q);
    }
    let worst = 0;
    for (let i = 2; i < pts.length; i++) {
      const h1 = Math.atan2(pts[i - 1].y - pts[i - 2].y, pts[i - 1].x - pts[i - 2].x);
      const h2 = Math.atan2(pts[i].y - pts[i - 1].y, pts[i].x - pts[i - 1].x);
      let d = Math.abs(h2 - h1);
      if (d > Math.PI) d = 2 * Math.PI - d;
      worst = Math.max(worst, d);
    }
    return { worst: (worst * 180) / Math.PI, leg: g.leg };
  });
  assert.equal(turn.leg, 2, 'the second leg was caught too');
  assert.ok(turn.worst < 3.5, `no sudden turn: at most ${turn.worst.toFixed(1)} degrees between frames (3 rad/s is 2.9)`);
  assert.equal(parked.from, parked.was, 'that planet starts the next leg');
  await context.close();
});

test('orbit AC-5: a failed flight rewinds within 1 s, with a ghost, and spends one probe; R in flight counts as a failure', async () => {
  const { context, page } = await open();
  await manual(page);
  // from the left of the first planet, circling as it starts, the probe heads down out of the field
  await page.evaluate(() => window.__orbit.fire(1, Math.PI));
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
  await page.evaluate(() => window.__orbit.fire(0.5));
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
  await page.evaluate(() => window.__orbit.fire(1, Math.PI));
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
    o.fire(0.5);
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

test('orbit AC-7: there is no brake: a touch or Space in flight changes nothing, in every system', async () => {
  const { context, page } = await open({ hasTouch: false });
  await manual(page);
  for (const sys of [0, 1, 2]) {
    const r = await page.evaluate((sys) => {
      const o = window.__orbit;
      o.startSystem(sys);
      o.fire(0.6);
      o.update(1 / 60);
      const f = o.game.flight;
      const a = [f.vx, f.vy];
      o.tap();
      window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));
      return { a, b: [f.vx, f.vy], mode: o.game.mode, launches: o.game.launches, label: document.querySelector('.boost-label').textContent };
    }, sys);
    assert.deepEqual(r.b, r.a, `system ${sys + 1}: the speed is untouched`);
    assert.deepEqual([r.mode, r.launches, r.label], ['fly', 1, 'Boost'], `system ${sys + 1}`);
  }
  await context.close();
});
test('orbit AC-8: the probe is a small ship pointing the way it moves, with no line ahead of it and no path previewed', async () => {
  const { context, page } = await open();
  await manual(page);
  const r = await page.evaluate(() => {
    const o = window.__orbit;
    const g = o.game;
    document.querySelector('[data-screen="intro"]').hidden = true;
    // put the probe on the left of its planet: circling as it starts, it moves straight down
    g.park.phase = Math.PI - (g.park.dir * 2 * Math.PI * (g.clock - g.legStart)) / g.park.period;
    o.setPower(1);
    o.draw();
    const c = document.querySelector('#space');
    const ctx = c.getContext('2d');
    const dpr = c.width / innerWidth;
    const p = o.launchPoint();
    const lit = (dy) => {
      const d = ctx.getImageData(Math.round((o.view.x + p.x * o.view.s) * dpr), Math.round((o.view.y + p.y * o.view.s + dy) * dpr), 1, 1).data;
      return d[0] + d[1] + d[2];
    };
    const parked = o.probeHeading();
    const ship = lit(0);
    const ahead = [16, 24, 32, 40].map(lit);
    o.fire(0.5);
    for (let i = 0; i < 20; i++) o.update(1 / 60);
    const f = g.flight;
    return {
      parked,
      ship,
      ahead,
      flying: o.probeHeading(),
      velocity: Math.atan2(f.vy, f.vx),
      hasPreview: typeof o.previewFor === 'function' || typeof o.previewColours === 'function',
    };
  });
  assert.ok(Math.abs(r.parked - Math.PI / 2) < 1e-6 || Math.abs(r.parked + (3 * Math.PI) / 2) < 1e-6, `parked, it points along its orbit (${r.parked})`);
  assert.ok(r.ship > 300, `the ship is drawn (${r.ship})`);
  assert.ok(r.ahead.every((v) => v < 120), `no line ahead of it at full power (${r.ahead})`);
  assert.ok(Math.abs(Math.atan2(Math.sin(r.flying - r.velocity), Math.cos(r.flying - r.velocity))) < 1e-9, 'in flight, it points along its velocity');
  assert.equal(r.hasPreview, false);
  await context.close();
});

test('orbit AC-23: the booster bar is a tall strip filled in zone colours, slate, green, orange and red, with no knob', async () => {
  const { context, page } = await open();
  const r = await page.evaluate(() => {
    const o = window.__orbit;
    const out = {};
    for (const p of [0.1, 0.5, 0.8, 0.95]) {
      o.setPower(p);
      out[p] = getComputedStyle(document.querySelector('[data-boost-value]')).color;
    }
    const fill = document.querySelector('.boost-fill').getBoundingClientRect();
    return {
      colours: out,
      zones: [0.1, 0.5, 0.8, 0.95].map(o.zoneColour),
      knob: document.querySelectorAll('.boost-knob, [class*="thumb"]').length,
      fillHeight: fill.height,
    };
  });
  assert.deepEqual(r.zones, ['#9fb3cf', '#4fd18b', '#ffa64d', '#ff5a4f'], 'slate, green, orange, red');
  const rgb = (hex) => `rgb(${parseInt(hex.slice(1, 3), 16)}, ${parseInt(hex.slice(3, 5), 16)}, ${parseInt(hex.slice(5, 7), 16)})`;
  assert.deepEqual(Object.values(r.colours), r.zones.map(rgb), 'the percentage takes its zone colour');
  assert.equal(r.knob, 0, 'no slider knob');
  assert.ok(r.fillHeight >= 16, `tall enough to see the colour (${r.fillHeight})`);
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
  // a probe `out` of the ring's radius beyond the drawn band, moving along the ring
  const caught = (n, out = 0.04) =>
    page.evaluate(([n, out]) => {
      const o = window.__orbit;
      const g = o.game;
      o.startSystem(0);
      g.legFails = n;
      o.fire(0.5);
      const b = g.level.bodies[g.level.legs[0].to];
      const ringBefore = b.ring;
      Object.assign(g.flight, { x: b.x + b.ring * (1 + out) + 26, y: b.y, vx: 0, vy: -60 }); // along the ring
      o.update(1 / 240);
      const res = g.mode;
      for (let i = 0; i < 400 && g.mode !== 'idle'; i++) o.update(1 / 60);
      return { res, ring: b.ring === ringBefore, legFails: g.legFails };
    }, [n, out]);
  const two = await caught(2);
  assert.notEqual(two.res, 'capture');
  const three = await caught(3);
  assert.equal(three.res, 'capture');
  assert.ok(three.ring, 'the drawn ring is the same');
  assert.equal(three.legFails, 0, 'reset by the capture');
  // the band keeps growing: 9% out is caught at 4 misses (10%) but not 3 (5%); 14% at 5 (15%) but not 4
  assert.notEqual((await caught(3, 0.09)).res, 'capture');
  assert.equal((await caught(4, 0.09)).res, 'capture');
  assert.notEqual((await caught(4, 0.14)).res, 'capture');
  assert.equal((await caught(5, 0.14)).res, 'capture');
  await context.close();
});

test('orbit AC-10: the end card shows motes, launches, slingshots, skims, medal and badge; the best shows on the intro next time', async () => {
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
  assert.equal(await page.locator('[data-done-slings]').textContent(), String(await page.evaluate(() => window.__orbit.game.slings)));
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('orbit.best'))[0]), 3);
  // the medal rules
  const m = await page.evaluate(() => {
    const f = window.__orbit.medalFor;
    // a slingshot counts as 3 motes: 14 motes and 2 slingshots make 20 of 22
    return [f(20, 22, 6, 6), f(20, 22, 7, 6), f(16, 22, 12, 6), f(16, 22, 13, 6), f(3, 22, 30, 6), f(14, 22, 6, 6, 2), f(14, 22, 6, 6, 1), f(22, 22, 6, 6, 9)];
  });
  assert.deepEqual(m, [3, 2, 2, 1, 1, 3, 2, 3]);
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

test('orbit AC-1 AC-10 AC-13: each state shows only its own card, as in the spec\'s state table', async () => {
  const { context, page } = await open();
  await manual(page);
  const cards = () =>
    page.evaluate(() => {
      const shown = (sel) => {
        const el = document.querySelector(sel);
        return !el.hidden && !el.classList.contains('fade');
      };
      return { mode: window.__orbit.game.mode, intro: shown('[data-screen="intro"]'), done: shown('[data-screen="done"]'), resume: shown('[data-resume]') };
    });
  const probe = () => page.evaluate(() => window.__orbit.probeWorld());
  const moved = async (dt) => {
    const a = await probe();
    await page.evaluate((dt) => window.__orbit.update(dt), dt);
    const b = await probe();
    return Math.hypot(a.x - b.x, a.y - b.y);
  };
  // System intro: the intro card, the probe circling
  assert.deepEqual(await cards(), { mode: 'idle', intro: true, done: false, resume: false });
  assert.ok((await moved(0.3)) > 5, 'the probe circles');
  // Setting the power on the bar: the first touch fades the intro, and the probe keeps circling
  await barPointer(page, 'pointerdown', 0.4);
  await barPointer(page, 'pointermove', 0.45);
  assert.deepEqual(await cards(), { mode: 'idle', intro: false, done: false, resume: false });
  assert.ok((await moved(0.3)) > 5, 'still circling while the power is set');
  await barPointer(page, 'pointerup', 0.45);
  await page.waitForFunction(() => document.querySelector('[data-screen="intro"]').hidden);
  // Flying: a tap fires
  await pointer(page, 'pointerdown', 200, 480);
  assert.deepEqual(await cards(), { mode: 'fly', intro: false, done: false, resume: false });
  assert.ok((await moved(0.1)) > 5, 'the probe flies');
  assert.ok(await page.evaluate(() => window.__orbit.game.trail.length > 0), 'with its trail');
  // Rewinding (after a failed flight)
  await page.evaluate(() => {
    const o = window.__orbit;
    const b = o.game.level.bodies[2];
    Object.assign(o.game.flight, { x: b.x + b.r + 1, y: b.y, vx: -200, vy: 0 });
    for (let i = 0; i < 20 && o.game.mode === 'fly'; i++) o.update(1 / 240);
  });
  assert.deepEqual(await cards(), { mode: 'rewind', intro: false, done: false, resume: false });
  assert.ok(await page.evaluate(() => window.__orbit.game.ghost.pts.length > 2), 'the ghost trail shows');
  await settle(page);
  let s = await state(page);
  assert.equal(s.clock, s.legStart, "back at the leg's start");
  assert.ok(await page.evaluate(() => window.__orbit.game.ghost !== null), 'the ghost stays until the next launch');
  // Captured (spiral in)
  await page.evaluate(() => {
    const o = window.__orbit;
    const g = o.game;
    o.fire(0.5);
    const b = g.level.bodies[g.level.legs[g.leg].to];
    Object.assign(g.flight, { x: b.x + b.ring + 15, y: b.y, vx: 0, vy: -150 }); // along the ring
    o.update(1 / 240);
  });
  assert.deepEqual(await cards(), { mode: 'capture', intro: false, done: false, resume: false });
  const spiral = await page.evaluate(() => {
    const o = window.__orbit;
    const g = o.game;
    const b = g.level.bodies[g.level.legs[g.leg].to];
    const d = () => {
      const p = o.probeWorld();
      return Math.hypot(p.x - b.x, p.y - b.y);
    };
    const a = o.probeWorld();
    const d0 = Math.abs(d() - b.ring);
    o.update(0.2);
    const p = o.probeWorld();
    return { d0, d1: Math.abs(d() - b.ring), moved: Math.hypot(p.x - a.x, p.y - a.y) };
  });
  assert.ok(spiral.moved > 5 && spiral.d1 <= spiral.d0 + 1e-6, 'spiralling into the ring');
  await settle(page);
  // Paused (page hidden, then back): only the resume button
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  assert.deepEqual(await cards(), { mode: 'idle', intro: false, done: false, resume: true });
  s = await state(page);
  assert.equal(s.clock, s.legStart, "at the leg's start, waiting");
  await page.click('[data-resume]');
  // System done: only the end card
  for (let i = 0; i < 4 && (await state(page)).mode !== 'done'; i++) await flyGold(page);
  assert.deepEqual(await cards(), { mode: 'done', intro: false, done: true, resume: false });
  const parked = await page.evaluate(() => {
    const o = window.__orbit;
    const g = o.game;
    const b = g.level.bodies[g.level.legs[g.level.legs.length - 1].to];
    const p = o.probeWorld();
    return Math.abs(Math.hypot(p.x - b.x, p.y - b.y) - b.ring);
  });
  assert.ok(parked < 1, 'parked on the last planet');
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
    o.fire(0.5);
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
    o.fire(0.5);
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

test('orbit AC-14: arrow keys set the power, Space fires, R rewinds; a cancelled drag on the bar stops it', async () => {
  const { context, page } = await open({ hash: '#s2', hasTouch: false });
  await manual(page);
  await page.evaluate(() => window.__orbit.setPower(0.5));
  const power = () => page.evaluate(() => window.__orbit.input.power);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowLeft');
  assert.ok(Math.abs((await power()) - 0.52) < 1e-9, 'a tap nudges the power by 2%');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowDown');
  assert.ok(Math.abs((await power()) - 0.52) < 1e-9, 'up and down do the same');
  assert.equal((await state(page)).mode, 'idle', 'setting the power fires nothing');
  // holding a key slides the power smoothly, across most of the bar in about a second
  const held = await page.evaluate(() => {
    const o = window.__orbit;
    const p0 = o.input.power;
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
    for (let i = 0; i < 60; i++) o.update(1 / 60);
    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowLeft' }));
    return p0 - o.input.power;
  });
  assert.ok(held > 0.35, `a one-second hold slides the power a long way (${held})`);
  await page.keyboard.press(' ');
  assert.equal((await state(page)).mode, 'fly', 'Space fires');
  await page.keyboard.press('r');
  await frames(page, 60);
  const r = await state(page);
  assert.deepEqual([r.mode, r.launches, r.fails], ['idle', 1, 1]);
  // a cancelled drag on the bar: later moves don't change the power, and nothing launches
  await barPointer(page, 'pointerdown', 0.2);
  await barPointer(page, 'pointercancel', 0.2);
  await barPointer(page, 'pointermove', 0.9);
  assert.ok(Math.abs((await power()) - 0.2) < 0.01);
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

test('orbit AC-17, slow-tests-orbit-reef-runes AC-3, slow-tests-orbit-reef-runes AC-4: after one visit that plays only System 1, Orbit opens offline at #s3 with its planets, nebula and sounds', async () => {
  const { context, page } = await open({ init: [FAKE_AUDIO] });
  await registerWorker(page);
  await page.reload(); // controlled now: this load caches the game's files
  await page.waitForFunction(() => window.__orbit && 'ready' in document.body.dataset);
  await cachedAll(page);
  await context.setOffline(true);
  await page.goto(BASE + 'orbit/#s3');
  await page.waitForFunction(() => window.__orbit && 'ready' in document.body.dataset);
  // `ready` waits for the images; the sounds decode on their own.
  await waitFor(page, () => window.__decoded >= 11, null, { what: 'every sound decoded offline' });
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
    await page.evaluate(() => window.__orbit.fire(0.5));
    await settle(page); // a crash or a loss
    await flyGold(page); // a capture, with motes
    // a slingshot: System 2's bold release, on its own leg
    await page.evaluate(() => {
      const o = window.__orbit;
      const g = o.game;
      const b = g.level.bold;
      g.leg = b.leg;
      g.legStart = 0;
      g.clock = 0;
      g.parkBody = g.level.legs[b.leg].from;
      g.park = { r: g.level.bodies[g.parkBody].ring, period: 7, phase: 0, dir: b.dir };
      o.fire(b.power, b.at);
      for (let i = 0; i < 240 * 10 && g.mode === 'fly'; i++) o.update(1 / 240);
    });
    // the drone loops on silently while muted (the shared sound's loops do); count everything else
    const drone = (await (await fetch(BASE + 'orbit/sounds/drone.mp3')).arrayBuffer()).byteLength;
    const r = await page.evaluate((drone) => ({ heard: [...window.__orbit.heard], played: window.__played.filter((p) => p.bytes !== drone).length }), drone);
    await context.close();
    return r;
  };
  const on = await run(false);
  for (const name of ['launch', 'sling', 'capture', 'mote']) assert.ok(on.heard.includes(name), name);
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
    o.fire(0.5);
    const b = o.game.level.bodies[2];
    Object.assign(o.game.flight, { x: b.x + b.r + 1, y: b.y, vx: -200, vy: 0 });
  });
  await settle(page);
  await page.evaluate(() => window.__orbit.fire(1, Math.PI));
  await settle(page);
  const heard = await page.evaluate(() => window.__orbit.heard);
  assert.ok(heard.includes('crash') && heard.includes('lost'));
  await context.close();
});

// Put the probe on a system's bold leg and fly its stored slingshot release, frame by frame,
// noting what shows during the swing; with failAfter, rewind by hand once the swing has counted.
const flyBold = (page, sys, { failAfter = -1 } = {}) =>
  page.evaluate(
    ([sys, failAfter]) => {
      const o = window.__orbit;
      o.startSystem(sys);
      const g = o.game;
      const b = g.level.bold;
      g.leg = b.leg;
      g.legStart = 0;
      g.clock = 0;
      g.parkBody = g.level.legs[b.leg].from;
      g.park = { r: g.level.bodies[g.parkBody].ring, period: 7, phase: 0, dir: b.dir };
      o.fire(b.power, b.at);
      const seen = { arc: false, label: false, hudDuring: null, slings: 0 };
      for (let i = 0; i < 240 * 10 && g.mode === 'fly'; i++) {
        o.update(1 / 240);
        const f = g.flight;
        if (f && f.slingIn.some((inZone, k) => inZone && Math.abs(f.sling[k]) > (40 * Math.PI) / 180)) seen.arc = true;
        if (g.slingFx.length && !seen.label) {
          seen.label = true;
          seen.hudDuring = g.slings; // not banked yet
        }
        if (failAfter >= 0 && seen.label && f && f.age > failAfter) {
          o.rewindByHand();
          break;
        }
      }
      for (let i = 0; i < 600 && g.mode !== 'idle' && g.mode !== 'done'; i++) o.update(1 / 60);
      seen.slings = g.slings;
      seen.hud = document.querySelector('[data-slings]').textContent;
      seen.hudShown = !document.querySelector('.slings').hidden;
      seen.heard = [...o.heard];
      seen.result = g.lastResult.result;
      return seen;
    },
    [sys, failAfter]
  );

test('orbit AC-19: a slingshot shows as it happens, a gold arc and "Slingshot!", and is banked only when the probe is caught', async () => {
  const { context, page } = await open();
  await manual(page);
  for (const sys of [0, 1, 2]) {
    const r = await flyBold(page, sys);
    assert.equal(r.result, 'captured', `system ${sys + 1}`);
    assert.ok(r.arc, `system ${sys + 1}: the swing is drawn as it happens`);
    assert.ok(r.label, `system ${sys + 1}: "Slingshot!" shows`);
    assert.equal(r.hudDuring, 0, 'not banked mid-flight');
    assert.ok(r.heard.includes('sling'));
    assert.ok(r.slings >= 1 && r.hud === String(r.slings) && r.hudShown, `system ${sys + 1}: banked on the catch`);
  }
  // the same swing, then a failed flight: nothing banked, and the counter stays hidden
  const failed = await flyBold(page, 1, { failAfter: 0 });
  assert.equal(failed.label, true);
  assert.equal(failed.slings, 0, 'a failed flight banks no slingshot');
  assert.equal(failed.hudShown, false);
  await context.close();
});
test('orbit AC-20: the probe dims over the last 2 s before its time runs out', async () => {
  const { context, page } = await open();
  await manual(page);
  const r = await page.evaluate(() => {
    const o = window.__orbit;
    o.fire(0.5);
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

test('orbit AC-29: stardust shows at three brightnesses: this jump full, the next a little brighter than the rest, later ones dim', async () => {
  const { context, page, errors } = await open({ hash: '#s2' });
  await manual(page);
  const r = await page.evaluate(() => {
    const o = window.__orbit;
    const g = o.game;
    const looks = () => {
      const by = {};
      g.level.motes.forEach((m, i) => {
        const l = o.moteLook(i);
        const k = l ? `${l.alpha}/${l.scale}` : 'hidden';
        (by[m.leg] ??= new Set()).add(k);
      });
      return Object.fromEntries(Object.entries(by).map(([leg, set]) => [leg, [...set]]));
    };
    const legs = g.level.legs.length;
    const out = { legs, first: looks() };
    // a mote of this jump, once caught, is not drawn
    const i0 = g.level.motes.findIndex((m) => m.leg === 0);
    g.taken.add(i0);
    out.caught = o.moteLook(i0);
    g.taken.delete(i0);
    // while a capture steers in, the jump being flown is still the current one
    g.mode = 'capture';
    out.capture = looks();
    g.mode = 'idle';
    g.leg = 1;
    out.second = looks();
    g.leg = legs - 1;
    out.last = looks();
    g.mode = 'done';
    out.done = looks();
    o.draw();
    return out;
  });
  assert.equal(r.legs, 4);
  assert.deepEqual(r.first, { 0: ['0.95/1'], 1: ['0.5/0.85'], 2: ['0.3/0.75'], 3: ['0.3/0.75'] });
  assert.equal(r.caught, null);
  assert.deepEqual(r.capture, r.first);
  assert.deepEqual(r.second, { 0: ['hidden'], 1: ['0.95/1'], 2: ['0.5/0.85'], 3: ['0.3/0.75'] });
  assert.deepEqual(r.last, { 0: ['hidden'], 1: ['hidden'], 2: ['hidden'], 3: ['0.95/1'] });
  assert.deepEqual(r.done, { 0: ['0.3/0.75'], 1: ['0.3/0.75'], 2: ['0.3/0.75'], 3: ['0.3/0.75'] });
  assert.deepEqual(errors, []);
  await context.close();
});

// The race behind orbit AC-22's flake: the game's frames run while the page loads, before a test takes
// the clock. With window.__orbitManual set before the first frame, real frames only draw.
test('ci-flakes AC-5: with the flag set before the first frame, real frames add no idle time and show no hint', async () => {
  const { context, page } = await open({ init: [() => (window.__orbitManual = true)] });
  // About 1.5 s of the page's own frames, as on a slow load (a busy machine runs fewer; any number works).
  await page.evaluate(
    () =>
      new Promise((done) => {
        let k = 0;
        const tick = () => (++k >= 90 ? done() : requestAnimationFrame(tick));
        requestAnimationFrame(tick);
      })
  );
  const r = await page.evaluate(() => ({ manual: window.__orbit.manual, idle: window.__orbit.game.idleAge, hint: !document.querySelector('[data-hint]').hidden }));
  assert.deepEqual(r, { manual: true, idle: 0, hint: false });
  await context.close();
});

// The drift behind the tests that take the clock after load: until a test sets manual, the page's own
// frames move the game (the probe, the moons' clock, the idle time). open() takes it from the first frame.
test("slow-tests-orbit-reef-runes AC-1: after open(), the page's own frames leave the game as its system starts", async () => {
  const { context, page } = await open();
  await realFrames(page, 90); // about 1.5 s of frames, as on a slow load (any number works)
  const r = await page.evaluate(() => {
    const g = window.__orbit.game;
    return { manual: window.__orbit.manual, idle: g.idleAge, atStart: g.clock === g.legStart, mode: g.mode };
  });
  assert.deepEqual(r, { manual: true, idle: 0, atStart: true, mode: 'idle' });
  await context.close();
});

test('orbit AC-22, ci-flakes AC-3: on the first level the hint to fire shows after 4 s untouched, and never again once fired', async () => {
  // The test owns the clock from the first frame: real frames never add to the 4 s of idling, however
  // slowly the page loads (the init script runs again on the reload below).
  const { context, page } = await open({ init: [() => (window.__orbitManual = true)] });
  await manual(page);
  const hint = () => page.evaluate(() => !document.querySelector('[data-hint]').hidden);
  await frames(page, 60 * 3);
  assert.equal(await hint(), false, 'not before 4 s');
  await frames(page, 75);
  assert.equal(await hint(), true, 'after 4 s untouched');
  assert.match(await page.locator('[data-hint]').textContent(), /fire the boosters/);
  await pointer(page, 'pointerdown', 200, 400);
  assert.equal(await hint(), false, 'firing hides it');
  await settle(page);
  await frames(page, 60 * 6);
  assert.equal(await hint(), false, 'not back on this leg');
  // a new visit in the same browser: it's gone for good
  await page.reload();
  await page.waitForFunction(() => window.__orbit && 'ready' in document.body.dataset);
  await manual(page);
  await frames(page, 60 * 6);
  assert.equal(await hint(), false, 'not on a later visit');
  await context.close();
});

test('orbit AC-25: a system has 10 probes, counted down by the booster bar; when they are spent a card says so, and Try again restarts the system', async () => {
  const { context, page } = await open();
  await manual(page);
  const probes = () => page.locator('[data-probes]').textContent();
  assert.equal(await probes(), '10');
  assert.equal((await page.locator('.probes').innerText()).replace(/\s+/g, ' ').trim().toUpperCase(), 'PROBES 10', 'a plain countdown');
  // right above the bar, not up in the top bar
  const where = await page.evaluate(() => {
    const p = document.querySelector('.probes').getBoundingClientRect();
    const bar = document.querySelector('[data-boost]').getBoundingClientRect();
    return { gap: bar.top - p.bottom, inHud: Boolean(document.querySelector('[data-hud] [data-probes]')) };
  });
  assert.ok(where.gap >= 0 && where.gap <= 12, `just above the bar (${where.gap})`);
  assert.equal(where.inHud, false);
  await page.evaluate(() => window.__orbit.fire(1, Math.PI));
  await settle(page);
  assert.equal(await probes(), '9');
  assert.equal(await page.locator('.probes').getAttribute('aria-label'), '9 probes left');
  for (let i = 1; i < 10; i++) {
    // from the left of the first planet at full power: down and out of the field, a failed flight
    await page.evaluate(() => window.__orbit.fire(1, Math.PI));
    await settle(page);
  }
  let s = await state(page);
  assert.deepEqual([s.launches, s.fails, s.mode], [10, 10, 'out']);
  assert.equal(await probes(), '0');
  assert.equal(await page.locator('[data-screen="out"]').isVisible(), true, 'the out-of-probes card');
  assert.match(await page.locator('[data-out-text]').textContent(), /10 probes/);
  // the state table's row: only the out card, and the probe back at the leg's start
  const row = await page.evaluate(() => {
    const o = window.__orbit;
    const g = o.game;
    const shown = (sel) => {
      const el = document.querySelector(sel);
      return !el.hidden && !el.classList.contains('fade');
    };
    const p = o.probeWorld();
    const b = g.level.bodies[g.level.legs[g.leg].from];
    return { intro: shown('[data-screen="intro"]'), done: shown('[data-screen="done"]'), atStart: g.clock === g.legStart, onRing: Math.abs(Math.hypot(p.x - b.x, p.y - b.y) - b.ring) < 1e-6 };
  });
  assert.deepEqual(row, { intro: false, done: false, atStart: true, onRing: true });
  await page.evaluate(() => window.__orbit.fire(0.5));
  assert.equal((await state(page)).mode, 'out', 'no eleventh launch');
  await page.click('[data-out-retry]');
  s = await state(page);
  assert.deepEqual([s.sys, s.leg, s.launches, s.mode], [0, 0, 0, 'idle']);
  assert.equal(await probes(), '10');
  assert.equal(await page.locator('[data-screen="out"]').isHidden(), true);
  // the 10th probe caught with jumps still to go: no probe left to fly them, so the card shows too
  await page.evaluate(() => (window.__orbit.game.launches = 9));
  assert.equal((await flyGold(page)).result, 'captured');
  s = await state(page);
  assert.deepEqual([s.leg, s.launches, s.mode], [1, 10, 'out']);
  assert.equal(await page.locator('[data-screen="out"]').isVisible(), true, 'out of probes after a catch');
  // but a 10th probe that finishes the system ends it with the end card, not the out card
  await page.click('[data-out-retry]');
  await page.evaluate(() => (window.__orbit.game.launches = 6));
  for (let i = 0; i < 4; i++) await flyGold(page);
  s = await state(page);
  assert.deepEqual([s.launches, s.mode], [10, 'done']);
  assert.equal(await page.locator('[data-screen="out"]').isHidden(), true);
  await context.close();
});

test('orbit AC-26: crossing a ring uncaught says why by the ring', async () => {
  const { context, page } = await open({ hash: '#s2' });
  await manual(page);
  const r = await page.evaluate(() => {
    const o = window.__orbit;
    const g = o.game;
    o.fire(0.5);
    const b = g.level.bodies[g.level.legs[0].to];
    // in the band, along the ring, far over its limit
    Object.assign(g.flight, { x: b.x + b.ring, y: b.y, vx: 0, vy: -900 });
    o.update(1 / 240);
    return { miss: g.miss && g.miss.text, hint: !document.querySelector('[data-hint]').hidden };
  });
  assert.equal(r.miss, 'Too fast');
  assert.equal(r.hint, false, 'no hint line: the ring says it');
  // too steep: in the band, slow enough, but heading into the planet
  const steep = await page.evaluate(() => {
    const o = window.__orbit;
    const g = o.game;
    o.startSystem(0);
    o.fire(0.5);
    const b = g.level.bodies[g.level.legs[0].to];
    Object.assign(g.flight, { x: b.x + b.ring, y: b.y, vx: -150, vy: -40 });
    o.update(1 / 240);
    return g.miss && g.miss.text;
  });
  assert.equal(steep, 'Too steep');
  // too close: slow, along the ring, but so near the planet and drifting in that settling would touch it
  const close = await page.evaluate(() => {
    const o = window.__orbit;
    const g = o.game;
    o.startSystem(0);
    o.fire(0.5);
    const b = g.level.bodies[g.level.legs[0].to];
    Object.assign(g.flight, { x: b.x + b.r + 9, y: b.y, vx: -80, vy: -200 });
    o.update(1 / 240);
    return g.miss && g.miss.text;
  });
  assert.equal(close, 'Too close');
  await context.close();
});

test('orbit AC-27: the top bar says what it counts: the system by number and name, the jump of the system, and stardust', async () => {
  const { context, page } = await open({ hash: '#s2' });
  await manual(page);
  const hud = () => page.evaluate(() => document.querySelector('[data-hud]').innerText.replace(/\s+/g, ' ').trim());
  let t = await hud();
  assert.match(t, /System 2 · Slingshot/i);
  assert.match(t, /Jump 1 of 4/i);
  assert.match(t, /Stardust ?0 ?\/ ?22/i);
  assert.doesNotMatch(t, /Slingshots/i, 'no slingshot count until one is earned');
  await flyGold(page);
  t = await hud();
  assert.match(t, /Jump 2 of 4/i);
  await context.close();
});

test('orbit AC-28: Back asks before leaving; Space while it asks fires nothing; Stay keeps the game', async () => {
  const { context, page } = await open({ hasTouch: false });
  await page.locator('.shell-back').click();
  const ask = page.locator('dialog.shell-leave');
  await ask.waitFor({ state: 'visible' });
  assert.match(await ask.textContent(), /Your progress on this level will be lost\./);
  // Space presses the focused Stay: the question closes and nothing launches behind it
  await page.keyboard.press(' ');
  await ask.waitFor({ state: 'hidden' });
  assert.equal((await state(page)).launches, 0, 'no launch behind the dialog');
  assert.match(page.url(), /\/orbit\//);
  // and clicking Stay keeps the game too
  await page.locator('.shell-back').click();
  await ask.waitFor({ state: 'visible' });
  await page.locator('[data-shell-stay]').click();
  await ask.waitFor({ state: 'hidden' });
  assert.match(page.url(), /\/orbit\//);
  await context.close();
});

test('edge-gestures AC-4: with iPhone insets, the booster bar sits half as high as #27 put it, its probes and hint above it, and a slide on it sets the power', async () => {
  const { context, page } = await open();
  const cdp = await simulateInsets(context, page, PORTRAIT_INSETS, () => window.__orbit && 'ready' in document.body.dataset);
  const r = await page.evaluate(() => {
    const box = (sel) => {
      const b = document.querySelector(sel);
      const was = b.hidden;
      b.hidden = false; // the hint shows on the first level only; measure it anyway
      const r = b.getBoundingClientRect();
      b.hidden = was;
      return { top: r.top, bottom: r.bottom, left: r.left, right: r.right };
    };
    return { bar: box('[data-boost]'), probes: box('.probes'), hint: box('[data-hint]'), fieldBottom: window.__orbit.view.y + 1800 * window.__orbit.view.s };
  });
  // #27 put the bar's foot 40 px above the safe area, 74 px above the screen's edge; now half that.
  const foot = (PORTRAIT_INSETS.bottom + 40) / 2;
  assert.ok(Math.abs(844 - r.bar.bottom - foot) < 0.5, `the bar's foot is ${844 - r.bar.bottom} px above the edge, want ${foot}`);
  assert.ok(r.probes.bottom <= r.bar.top + 0.5 && r.probes.top >= r.fieldBottom - 1, `the probes sit between the field and the bar: ${JSON.stringify(r)}`);
  assert.ok(r.hint.bottom <= r.probes.top + 0.5, `the hint sits above the probes: ${JSON.stringify(r)}`);
  // The field takes the room: it reaches 37 px lower than with the bar 40 px above the safe area.
  assert.ok(r.fieldBottom >= r.probes.top - 30, `the field runs down to the probes: ${JSON.stringify(r)}`);
  // A slow slide that starts low on the bar, inside the bottom strip, still sets the power.
  const power = () => page.evaluate(() => window.__orbit.input.power);
  const before = await power();
  await touchDrag(cdp, r.bar.left + (r.bar.right - r.bar.left) * 0.5, r.bar.bottom - 6, 40, 0);
  assert.notEqual(await power(), before, 'a slide from the bar\'s low edge sets the power');
  // A slide that starts on the bar inside the left-edge strip is the phone's back swipe: it sets nothing.
  const now = await power();
  assert.ok(r.bar.left < 20, `the bar reaches into the left strip (${r.bar.left})`);
  await touchDrag(cdp, (r.bar.left + 20) / 2, (r.bar.top + r.bar.bottom) / 2, 120, 0);
  assert.equal(await power(), now, 'a slide from the left strip sets nothing');
  await context.close();
});

test('orbit AC-21: the field and buttons fit 360x640 and 390x844 without scrolling, clear of the buttons', async () => {
  for (const viewport of [{ width: 360, height: 640 }, { width: 390, height: 844 }, { width: 1280, height: 800 }]) {
    const { context, page } = await open({ viewport });
    const r = await page.evaluate(() => {
      const v = window.__orbit.view;
      const back = document.querySelector('.shell-back').getBoundingClientRect();
      const mute = document.querySelector('.mute').getBoundingClientRect();
      const bar = document.querySelector('[data-boost]').getBoundingClientRect();
      const probes = document.querySelector('.probes').getBoundingClientRect();
      const hud = document.querySelector('[data-hud]').getBoundingClientRect();
      return {
        probes: { top: probes.top, left: probes.left, right: probes.right },
        hud: (() => {
          // with the slingshot count showing and three-digit numbers, the widest the row gets
          document.querySelector('.slings').hidden = false;
          document.querySelector('[data-slings]').textContent = '12';
          document.querySelector('[data-dust]').textContent = '22';
          const row = document.querySelector('.hud-row');
          const kids = [...row.children].map((k) => k.getBoundingClientRect());
          const overlap = kids.length > 1 && kids[0].right > kids[1].left;
          const r = row.getBoundingClientRect();
          return { left: Math.min(r.left, ...kids.map((k) => k.left)), right: Math.max(r.right, ...kids.map((k) => k.right)), overlap, rowFits: row.scrollWidth <= row.clientWidth + 1 };
        })(),
        top: v.y,
        left: v.x,
        right: v.x + 1000 * v.s,
        bottom: v.y + 1800 * v.s,
        backBottom: back.bottom,
        backRight: back.right,
        muteLeft: mute.left,
        muteBottom: mute.bottom,
        bar: { top: bar.top, bottom: bar.bottom, left: bar.left, right: bar.right, height: bar.height },
        buttons: [back.width, back.height, mute.width, mute.height],
        scroll: document.scrollingElement.scrollHeight - innerHeight + (document.scrollingElement.scrollWidth - innerWidth),
        w: innerWidth,
        h: innerHeight,
      };
    });
    assert.ok(r.top >= Math.max(r.backBottom, r.muteBottom), `${viewport.width}: below the buttons`);
    assert.ok(r.left >= 0 && r.right <= r.w && r.bottom <= r.h, `${viewport.width}: on screen`);
    assert.ok(r.buttons.every((x) => x >= 44));
    assert.ok(r.bar.top >= r.bottom, `${viewport.width}: the booster bar sits below the field`);
    // edge-gestures (the owner, 2026-11-10) replaces "above the bottom edge strip": the bar's foot sits at
    // half the gesture strip's height above the edge, (inset + 40) / 2, here 20 px.
    assert.ok(Math.abs(r.h - r.bar.bottom - 20) < 0.5 && r.bar.left >= 0 && r.bar.right <= r.w, `${viewport.width}: the bar is on screen, its foot 20 px above the edge (${r.h - r.bar.bottom})`);
    assert.ok(r.bar.height >= 44, 'the bar is easy to hit');
    assert.ok(r.probes.top >= r.bottom - 1 && r.probes.left >= 0 && r.probes.right <= r.w, `${viewport.width}: the probes left sit between the field and the bar`);
    assert.ok(r.hud.left >= 0 && r.hud.right <= r.w && r.hud.rowFits && !r.hud.overlap, `${viewport.width}: the top bar fits, slingshots and all (${JSON.stringify(r.hud)})`);
    assert.ok(r.hud.right <= r.muteLeft && r.hud.left >= r.backRight, `${viewport.width}: the top bar sits between the buttons (${JSON.stringify([r.backRight, r.hud.left, r.hud.right, r.muteLeft])})`);
    assert.equal(r.scroll, 0);
    await context.close();
  }
});

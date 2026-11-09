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
    g.clock = gold.t0 ?? g.legStart; // where the moons are (static systems don't mind)
    g.park.dir = gold.dir;
    o.fire(gold.power, gold.at);
    for (let i = 0; i < 240 * 12 && g.mode === 'fly'; i++) {
      if (gold.brakeAt !== undefined && g.flight && g.flight.brakeLeft && g.flight.age >= gold.brakeAt) o.tap();
      o.update(1 / 240);
    }
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
  assert.ok(turn.worst < 6, `no sudden turn: at most ${turn.worst.toFixed(1)} degrees between frames`);
  assert.equal(parked.from, parked.was, 'that planet starts the next leg');
  await context.close();
});

test('orbit AC-5: a failed flight rewinds within 1 s, with a ghost, and no lives lost; R in flight counts as a failure', async () => {
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

test('orbit AC-7: from System 2 a touch in flight brakes once, by 35%; System 1 has no brake', async () => {
  const { context, page } = await open();
  await manual(page);
  const speeds = (sys) =>
    page.evaluate((sys) => {
      const o = window.__orbit;
      o.startSystem(sys);
      o.game.braked = true;
      o.fire(0.6);
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

test('orbit AC-8: the circling probe shows only a short line the way it would leave, longer with more power; no path is previewed', async () => {
  const { context, page } = await open();
  await manual(page);
  const r = await page.evaluate(() => {
    const o = window.__orbit;
    const g = o.game;
    document.querySelector('[data-screen="intro"]').hidden = true;
    // put the probe on the left of its planet: circling as it starts, it would leave straight down
    g.park.phase = Math.PI - (g.park.dir * 2 * Math.PI * (g.clock - g.legStart)) / g.park.period;
    const c = document.querySelector('#space');
    const ctx = c.getContext('2d');
    const dpr = c.width / innerWidth;
    const lit = (len, power) => {
      o.setPower(power);
      o.draw();
      const p = o.launchPoint();
      const x = o.view.x + p.x * o.view.s;
      const y = o.view.y + p.y * o.view.s + len;
      const d = ctx.getImageData(Math.round(x * dpr), Math.round(y * dpr), 1, 1).data;
      return d[0] + d[1] + d[2];
    };
    return {
      shortNear: lit(10, 0.1),
      shortFar: lit(40, 0.1),
      longFar: lit(40, 1),
      beyond: lit(70, 1),
      hasPreview: typeof o.previewFor === 'function' || typeof o.previewColours === 'function',
    };
  });
  assert.ok(r.shortNear > 200, `the heading line is drawn (${r.shortNear})`);
  assert.ok(r.shortFar < 100, `low power draws a short line (${r.shortFar})`);
  assert.ok(r.longFar > 200, `full power draws a longer one (${r.longFar})`);
  assert.ok(r.beyond < 100, `nothing past its end (${r.beyond})`);
  assert.equal(r.hasPreview, false);
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

test('orbit AC-14: arrow keys set the power, Space fires and brakes, R rewinds; a cancelled drag on the bar stops it', async () => {
  const { context, page } = await open({ hash: '#s2', hasTouch: false });
  await manual(page);
  await page.evaluate(() => {
    window.__orbit.game.braked = true;
    window.__orbit.setPower(0.5);
  });
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
  await page.keyboard.press(' ');
  assert.equal(await page.evaluate(() => window.__orbit.game.flight.brakeLeft), 0, 'Space brakes in flight');
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
      o.fire(0.5);
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

test('orbit AC-19: on System 2 leg 1, until the first brake, a fast approach slows time to 0.4x for 0.6 s', async () => {
  const { context, page } = await open({ hash: '#s2' });
  await manual(page);
  const r = await page.evaluate(() => {
    const o = window.__orbit;
    const g = o.game;
    g.braked = false;
    o.fire(0.5);
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
    o.fire(0.5);
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

test('orbit AC-22: on the first level the hint to fire shows after 4 s untouched, and never again once fired', async () => {
  const { context, page } = await open();
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

test('orbit AC-21: the field and buttons fit 360x640 and 390x844 without scrolling, clear of the buttons', async () => {
  for (const viewport of [{ width: 360, height: 640 }, { width: 390, height: 844 }, { width: 1280, height: 800 }]) {
    const { context, page } = await open({ viewport });
    const r = await page.evaluate(() => {
      const v = window.__orbit.view;
      const back = document.querySelector('.shell-back').getBoundingClientRect();
      const mute = document.querySelector('.mute').getBoundingClientRect();
      const bar = document.querySelector('[data-boost]').getBoundingClientRect();
      return {
        top: v.y,
        left: v.x,
        right: v.x + 1000 * v.s,
        bottom: v.y + 1800 * v.s,
        backBottom: back.bottom,
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
    assert.ok(r.bar.bottom <= r.h - 24 && r.bar.left >= 0 && r.bar.right <= r.w, `${viewport.width}: the bar is on screen, above the edge strip`);
    assert.ok(r.bar.height >= 44, 'the bar is easy to hit');
    assert.equal(r.scroll, 0);
    await context.close();
  }
});

// End-to-end tests for Shooting Gallery (specs/shooting-gallery.md). Run: scripts/check-slow.sh.
// The game exposes window.__gallery: its state, step() to advance the simulation without drawing,
// makeTarget() to place a target, and the aim. A test that sets `manual` owns the clock: the page's
// frames only draw.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import { FAKE_AUDIO } from './fake-audio.mjs';

// Its own port range: the test files run in parallel, and a shared range can collide.
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

const PORTRAIT = { width: 390, height: 844 };
const LANDSCAPE = { width: 844, height: 390 };

async function open(opts = {}) {
  const context = await browser.newContext({ viewport: PORTRAIT, ...opts });
  await context.addInitScript(FAKE_AUDIO);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(BASE + 'shooting-gallery/');
  await page.waitForFunction(() => window.__gallery);
  return { context, page, errors };
}

// Start a run at `round` with an empty booth that the test fills: nothing spawns, no frenzy comes,
// the assist is off, and the test owns the clock.
async function ready(page, round = 1, { assist = 0 } = {}) {
  await page.evaluate(
    ({ round, assist }) => {
      const g = window.__gallery;
      g.manual = true;
      g.startRun({ seed: 1 });
      if (round !== 1) g.startRound(round);
      g.clear();
      const G = g.game;
      G.mode = 'play';
      G.banner = null;
      G.assist = assist;
      G.lastFire = -1;
      G.frenzyTimes = [];
      G.rock = 0; // targets hold still, so a test aims exactly (AC-25 tests the rocking)
      G.spawn = { movers: g.L.lanes.map(() => 999), pop: 999, drop: 999, gold: [] };
      // A pull aimed at the middle lane, so a bare fire() has somewhere to go.
      g.aimAt(g.stage().SW / 2, g.L.lanes[Math.floor(g.L.n / 2)].line);
    },
    { round, assist }
  );
}

// Place a still target and return what a shot needs: its id, centre and size.
async function place(page, kind, opts = {}) {
  return page.evaluate(
    ({ kind, opts }) => {
      const g = window.__gallery;
      const t = g.makeTarget(kind, { x: g.stage().SW / 2, turn: false, speed: 0, ...opts });
      const [w, h] = g.dims(t);
      return { id: t.id, x: t.x, y: t.y, w, h, lane: t.lane, face: t.face };
    },
    { kind, opts }
  );
}

// Pull to land at x on a lane's line, let go, and let the ball land. Returns what it landed on.
const shoot = (page, x, lane, { wait = true } = {}) =>
  page.evaluate(
    ({ x, lane, wait }) => {
      const g = window.__gallery;
      g.aimAt(x, g.L.lanes[lane].line);
      g.game.lastFire = -1;
      g.game.lastLand = null;
      const b = g.fire();
      if (!b) return null;
      if (!wait) return { fired: true };
      for (let i = 0; i < 40 && !g.game.lastLand; i++) g.step(1 / 60);
      return g.game.lastLand;
    },
    { x, lane, wait }
  );
const state = (page) =>
  page.evaluate(() => {
    const g = window.__gallery.game;
    return { mode: g.mode, score: g.score, pips: g.pips, bonus: g.bonus, round: g.round, assist: g.assist, hopper: g.hopper, time: g.time, frenzy: g.frenzy };
  });
const steps = (page, seconds) =>
  page.evaluate((s) => {
    for (let t = 0; t < s - 1e-9; t += 1 / 60) window.__gallery.step(1 / 60);
  }, seconds);
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

test('shooting-gallery AC-1: the booth moves behind the start card; Start begins round 1 with the slingshot, no gun and no crosshair', async () => {
  const { context, page, errors } = await open();
  assert.ok(await page.locator('[data-screen="start"]').isVisible());
  const before = await page.evaluate(() => window.__gallery.targets().map((t) => [t.id, t.x]));
  assert.ok(before.length > 0, 'targets are in the lanes');
  await page.waitForTimeout(1000);
  const after = await page.evaluate(() => Object.fromEntries(window.__gallery.targets().map((t) => [t.id, t.x])));
  assert.ok(before.some(([id, x]) => after[id] !== undefined && Math.abs(after[id] - x) > 10), 'a target moved in a second');
  await page.click('[data-play]');
  const s = await page.evaluate(() => {
    const g = window.__gallery;
    const hb = g.hudBounds();
    return {
      round: g.game.round, time: g.game.time, quota: g.game.cfg.quota, hopper: g.game.hopper, n: g.L.n,
      slingOnCounter: hb.sling.y > hb.counterTop,
      noGun: !('muzzle' in g) && !('cross' in g) && !('crosshair' in g),
    };
  });
  assert.deepEqual(s, { round: 1, time: 30, quota: 7, hopper: 6, n: 5, slingOnCounter: true, noGun: true });
  assert.ok(await page.locator('[data-screen="start"]').isHidden());
  assert.deepEqual(errors, []);
  await context.close();
});

test('shooting-gallery AC-2: a pull lands the ball by a separable, linear rule at any height; the pouch follows the pull', async () => {
  const { context, page } = await open();
  await ready(page);
  const r = await page.evaluate(() => {
    const g = window.__gallery;
    const { SW } = g.stage();
    const P = g.pullRange();
    const L = g.L;
    const at = (px, py) => {
      g.setPull(px, py);
      return g.aimPoint();
    };
    return {
      P,
      SW,
      C: L.C,
      T: L.T,
      left: at(P.x, 0).x, // pulling right sends it left
      right: at(-P.x / 2, 0).x,
      top: at(0, P.y).y,
      mid: at(0, P.y / 2).y,
      // Sideways and down are separate: the same x at any height.
      xAtTop: at(P.x / 2, P.y).x,
      xAtLow: at(P.x / 2, P.y / 4).x,
      clamped: (g.setPull(P.x * 3, P.y * 3), [g.aim.px, g.aim.py]),
      pouchMoves: (() => {
        g.setPull(0, 0);
        const a = g.pouch();
        g.setPull(30, 60);
        const b = g.pouch();
        return b.x > a.x && b.y > a.y;
      })(),
    };
  });
  assert.ok(near(r.left, r.SW / 2 - 0.47 * r.SW));
  assert.ok(near(r.right, r.SW / 2 + 0.47 * r.SW / 2));
  assert.ok(near(r.top, r.T));
  assert.ok(near(r.mid, r.C - (r.C - r.T) / 2), 'any height, not lane steps');
  assert.ok(near(r.xAtTop, r.xAtLow));
  assert.deepEqual(r.clamped, [r.P.x, r.P.y]);
  assert.ok(r.pouchMoves);
  assert.deepEqual([r.P.x, r.P.y], [80, 140]);
  await context.close();
});

test('shooting-gallery AC-3: on touch, a pull from the counter stretches the slingshot and letting go fires; a short pull or a touch on the lanes does nothing', async () => {
  const { context, page } = await open({ hasTouch: true });
  await ready(page);
  const cdp = await context.newCDPSession(page);
  const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points });
  const pad = await page.evaluate(() => window.__gallery.hudBounds().counterTop + 20);
  const k = await page.evaluate(() => window.__gallery.stage().k);
  // Pull 30 px left and 60 px down from where the finger lands, then let go.
  await touch('touchStart', [{ x: 200, y: pad, id: 1 }]);
  for (let i = 1; i <= 6; i++) await touch('touchMove', [{ x: 200 - i * 5, y: pad + i * 10, id: 1 }]);
  await page.waitForTimeout(50); // the last move arrives with the next frame
  const held = await page.evaluate(() => ({ px: window.__gallery.aim.px, py: window.__gallery.aim.py, active: window.__gallery.aim.active, balls: window.__gallery.balls().length }));
  assert.ok(near(held.px, -30 / k, 0.01) && near(held.py, 60 / k, 0.01), `the pull follows the finger: ${JSON.stringify(held)}`);
  assert.deepEqual([held.active, held.balls], [true, 0], 'nothing flies while held');
  const target = await page.evaluate(({ px, py }) => window.__gallery.aimPoint(px, py), held);
  await touch('touchEnd', []);
  const b = await page.evaluate(() => window.__gallery.balls().map((x) => ({ x1: x.x1, y1: x.y1 })));
  assert.equal(b.length, 1, 'letting go fires');
  assert.ok(near(b[0].x1, target.x, 0.01) && near(b[0].y1, target.y, 0.01));
  // A short pull fires nothing.
  await page.evaluate(() => (window.__gallery.game.lastFire = -1));
  await touch('touchStart', [{ x: 200, y: pad, id: 2 }]);
  await touch('touchMove', [{ x: 203, y: pad + 4, id: 2 }]);
  await touch('touchEnd', []);
  assert.equal(await page.evaluate(() => window.__gallery.balls().length), 1, 'a short pull is no shot');
  // A pull starting on the lanes does nothing.
  await touch('touchStart', [{ x: 200, y: 300, id: 3 }]);
  await touch('touchMove', [{ x: 160, y: 400, id: 3 }]);
  assert.equal(await page.evaluate(() => window.__gallery.aim.active), false);
  await touch('touchEnd', []);
  assert.equal(await page.evaluate(() => window.__gallery.balls().length), 1, 'the lanes are not for touching');
  await context.close();
});

test('shooting-gallery AC-4: the mouse pulls and releases the slingshot; the arrow keys set a pull that stays, and Space lets go', async () => {
  const { context, page } = await open({ viewport: { width: 1024, height: 700 } });
  await ready(page);
  const k = await page.evaluate(() => window.__gallery.stage().k);
  await page.mouse.move(500, 300);
  await page.mouse.down();
  await page.mouse.move(530, 340, { steps: 5 });
  await page.waitForTimeout(50);
  const held = await page.evaluate(() => ({ px: window.__gallery.aim.px, py: window.__gallery.aim.py }));
  assert.ok(near(held.px, 30 / k, 0.01) && near(held.py, 40 / k, 0.01), JSON.stringify(held));
  await page.mouse.up();
  assert.equal(await page.evaluate(() => window.__gallery.balls().length), 1, 'letting go fires');
  // The keyboard: Left and Up move the kept pull; Space lets go, and the pull stays for the next.
  await page.keyboard.down('ArrowLeft');
  await page.keyboard.down('ArrowUp');
  await steps(page, 0.5);
  await page.keyboard.up('ArrowLeft');
  await page.keyboard.up('ArrowUp');
  const kb = await page.evaluate(() => ({ kx: window.__gallery.aim.kx, ky: window.__gallery.aim.ky }));
  const maxY = await page.evaluate(() => window.__gallery.pullRange().y);
  assert.ok(near(kb.kx, 30, 1) && near(kb.ky, Math.min(85, maxY), 1), `the arrows moved the pull: ${JSON.stringify(kb)}`);
  await page.evaluate(() => {
    window.__gallery.game.lastFire = -1;
    window.__gallery.heard.length = 0;
  });
  await page.keyboard.press('Space');
  await page.evaluate(() => (window.__gallery.game.lastFire = -1));
  await page.keyboard.press('Space');
  const r = await page.evaluate(() => ({ shots: window.__gallery.heard.filter((n) => n === 'twang').length, kx: window.__gallery.aim.kx, ky: window.__gallery.aim.ky }));
  assert.equal(r.shots, 2, 'Space fires, twice with the same pull');
  assert.deepEqual([r.kx, r.ky], [kb.kx, kb.ky], 'the pull stayed');
  await context.close();
});

test('shooting-gallery AC-5: the ball flies 0.18 s just above the counter up to 0.45 s at the top, and is judged when it lands', async () => {
  const { context, page } = await open();
  await ready(page);
  const times = await page.evaluate(() => [window.__gallery.flightTime(window.__gallery.L.C), window.__gallery.flightTime(window.__gallery.L.T)]);
  assert.ok(near(times[0], 0.18) && near(times[1], 0.45), `${times}`);
  // A still target is hit; one moving fast across is gone by the time the ball lands.
  const still = await place(page, 'target', { lane: 3, x: 200, face: 'target_red1' });
  assert.equal((await shoot(page, still.x + still.w * 0.38, 3)).what, 'body');
  const fast = await place(page, 'target', { lane: 3, x: 200, speed: 300, face: 'target_red1' });
  const r = await shoot(page, fast.x, 3);
  assert.notEqual(r.id, fast.id, 'the fast target moved away before the ball landed');
  await context.close();
});

test('shooting-gallery AC-6: hits score 10 a pip, 1 near to 3 far; a bullseye doubles and returns a ball; the gold duck scores 100 and refills', async () => {
  const { context, page } = await open();
  await ready(page);
  const s0 = await state(page);
  const far = await place(page, 'target', { lane: 0, x: 200, face: 'target_red1' });
  assert.equal((await shoot(page, far.x + far.w * 0.38, 0)).what, 'body');
  let s = await state(page);
  assert.deepEqual([s.score - s0.score, s.pips], [30, 3]);
  const nearT = await place(page, 'duck', { lane: 4, x: 200, face: 'duck_yellow' });
  assert.equal((await shoot(page, nearT.x, 4)).what, 'body');
  s = await state(page);
  assert.deepEqual([s.score - s0.score, s.pips], [40, 4]);
  // Below the quota still, so no bonus multiplies the next hits.
  await page.evaluate(() => {
    window.__gallery.game.pips = 0;
    window.__gallery.game.bonus = false;
  });
  const mid = await place(page, 'target', { lane: 2, x: 200, face: 'target_colored' });
  const h0 = (await state(page)).hopper;
  assert.equal((await shoot(page, mid.x, 2)).what, 'bull');
  s = await state(page);
  assert.deepEqual([s.score - s0.score, s.hopper], [80, h0], 'a bullseye: 20 × 2, and the ball comes back');
  // The gold duck: 100 points, 2 pips and a full hopper.
  await page.evaluate(() => (window.__gallery.game.hopper = 2));
  const gold = await place(page, 'gold', { lane: 4, x: 200 });
  assert.ok(['body', 'bull'].includes((await shoot(page, gold.x, 4)).what));
  s = await state(page);
  assert.equal(s.hopper, 6);
  assert.ok(s.score - s0.score >= 180, 'the gold duck scored 100');
  // A miss scores nothing.
  const s2 = await state(page);
  const miss = await shoot(page, 60, 0);
  assert.ok(['wall', 'strip', 'curtain'].includes(miss.what));
  assert.equal((await state(page)).score, s2.score);
  await context.close();
});

test('shooting-gallery AC-7: each shot is the next colour; splats land on targets or stay on the scenery, settling to 80% after 1 s, 70 at most', async () => {
  const { context, page } = await open();
  await ready(page);
  const colours = await page.evaluate(() => {
    const g = window.__gallery;
    const out = [];
    for (let i = 0; i < 3; i++) {
      g.game.lastFire = -1;
      out.push(g.fire().colour);
    }
    return { out, palette: g.PALETTE.slice(0, 3) };
  });
  assert.deepEqual(colours.out, colours.palette);
  await steps(page, 0.5);
  const t = await place(page, 'target', { lane: 3, x: 200, face: 'target_red1' });
  await shoot(page, t.x + t.w * 0.38, 3);
  assert.equal(await page.evaluate((id) => window.__gallery.targets().find((x) => x.id === id).splats.length, t.id), 1, 'the splat is on the target');
  const p = await page.evaluate(() => {
    const g = window.__gallery;
    g.paint().length = 0;
    g.game.lastFire = -1;
    g.aimAt(g.stage().SW * 0.15, g.L.lanes[0].line);
    g.fire();
    for (let i = 0; i < 40; i++) g.step(1 / 60);
    const fresh = g.paintAlpha(g.paint()[0]);
    for (let i = 0; i < 90; i++) g.step(1 / 60);
    return { n: g.paint().length, fresh, settled: g.paintAlpha(g.paint()[0]) };
  });
  assert.deepEqual([p.n, p.fresh], [1, 1]);
  assert.ok(near(p.settled, 0.8, 0.01), `settled at ${p.settled}`);
  const kept = await page.evaluate(() => {
    const g = window.__gallery;
    for (let i = 0; i < 80; i++) {
      g.game.lastFire = -1;
      g.game.hopper = 6;
      g.aimAt(g.stage().SW * (0.06 + (i % 20) * 0.045), g.L.lanes[i % 5].line);
      g.fire();
      for (let j = 0; j < 30; j++) g.step(1 / 60);
    }
    for (let j = 0; j < 60; j++) g.step(1 / 60);
    return g.paint().length;
  });
  assert.ok(kept <= 70, `${kept} splats kept`);
  await context.close();
});

test('shooting-gallery AC-8: the frontmost thing takes the shot: a strip before its targets, a hidden pop-up is safe, a back blocks', async () => {
  const { context, page } = await open();
  await ready(page, 4);
  const r = await page.evaluate(() => {
    const g = window.__gallery;
    const lane = g.L.lanes[2];
    const out = {};
    // Just under the strip's crest, a target standing behind it is covered.
    const t = g.makeTarget('target', { lane: 2, x: 200, speed: 0, turn: false, face: 'target_colored' });
    const y = g.stripY(lane, 200) + 3;
    out.strip = g.resolve(200, y).what;
    out.above = g.resolve(200, lane.line).what;
    // A pop-up still behind its strip can't be hit.
    g.clear();
    const pop = g.makeTarget('pop', { lane: 1, x: 200, speed: 0, turn: false });
    const r1 = g.resolve(200, pop.y);
    out.pop = r1.t ? r1.t.kind : r1.what;
    // A turned mover in front of a drop-down in the same lane: its back takes the shot.
    g.clear();
    g.makeTarget('drop', { lane: 3, x: 200, up: true, turn: false });
    g.makeTarget('target', { lane: 3, x: 200, speed: 0, turn: true, turnT: 3.0 });
    const r2 = g.resolve(200, g.L.lanes[3].line);
    out.back = [r2.what, r2.t && r2.t.kind];
    return out;
  });
  assert.equal(r.strip, 'strip');
  assert.equal(r.above, 'bull');
  assert.notEqual(r.pop, 'pop');
  assert.deepEqual(r.back, ['back', 'target']);
  await context.close();
});

test('shooting-gallery AC-9: the hopper holds 6, spends one a shot, refills one every 0.6 s; an empty hopper fires nothing', async () => {
  const { context, page } = await open();
  await ready(page);
  const r = await page.evaluate(() => {
    const g = window.__gallery;
    const fired = [];
    for (let i = 0; i < 7; i++) {
      g.game.lastFire = -1;
      fired.push(!!g.fire());
    }
    const empty = g.game.hopper;
    g.step(0.61);
    const one = g.game.hopper;
    for (let i = 0; i < 200; i++) g.step(1 / 60);
    return { fired, empty, one, full: g.game.hopper };
  });
  assert.deepEqual(r.fired, [true, true, true, true, true, true, false]);
  assert.deepEqual([r.empty, r.one, r.full], [0, 1, 6]);
  await context.close();
});

test('shooting-gallery AC-10: when the time runs out, a met quota goes on to the next round and an unmet one ends the run', async () => {
  const { context, page } = await open();
  await ready(page);
  await page.evaluate(() => {
    window.__gallery.game.pips = window.__gallery.game.cfg.quota;
    window.__gallery.game.time = 0.01;
  });
  await steps(page, 0.05);
  assert.equal((await state(page)).mode, 'won');
  await steps(page, 1.7);
  let s = await state(page);
  assert.deepEqual([s.round, s.mode, s.time], [2, 'intro', 30]);
  await ready(page);
  await page.evaluate(() => {
    window.__gallery.game.pips = window.__gallery.game.cfg.quota - 1;
    window.__gallery.game.score = 120;
    window.__gallery.game.time = 0.01;
  });
  await steps(page, 0.05);
  assert.equal((await state(page)).mode, 'lost');
  await steps(page, 1.6);
  assert.ok(await page.locator('[data-screen="over"]').isVisible());
  assert.equal(await page.locator('[data-over-title]').textContent(), 'Out of time');
  assert.equal(await page.locator('[data-final-score]').textContent(), '120');
  assert.match(await page.locator('[data-final-detail]').textContent(), /Round 1/);
  assert.match(await page.locator('[data-final-best]').textContent(), /best/i);
  await page.click('[data-again]');
  s = await state(page);
  assert.deepEqual([s.mode, s.round, s.score, s.hopper], ['intro', 1, 0, 6]);
  await context.close();
});

test('shooting-gallery AC-11: the bonus pays by depth (×1 near, ×2 middle, ×3 far and gold); closing time doubles; never more than ×8', async () => {
  const { context, page } = await open();
  await ready(page, 2);
  const m = await page.evaluate(() => {
    const g = window.__gallery;
    g.game.bonus = true;
    const mk = (kind, lane) => g.makeTarget(kind, { lane, speed: 0, turn: false });
    const r = [mk('duck', 4), mk('target', 2), mk('target', 0), mk('gold', 4)].map((t) => g.multiplier(t, false));
    g.startRound(6);
    g.game.bonus = true;
    const far = mk('target', 0);
    return { r, closingFar: g.multiplier(far, false), capped: g.multiplier(far, true) };
  });
  assert.deepEqual(m.r, [1, 2, 3, 3]);
  assert.equal(m.closingFar, 6);
  assert.equal(m.capped, 8, '2 × 3 × 2 = 12, capped at 8');
  await context.close();
});

test('shooting-gallery AC-12: hitting the frenzy target starts the frenzy: the galop, faster targets, free shots for points only, the timer stopped; none comes without it', async () => {
  const { context, page } = await open();
  await ready(page, 2, { assist: 0.5 });
  // Without the target, no frenzy comes.
  await steps(page, 20);
  assert.equal((await state(page)).frenzy, 0);
  // A frenzy lasts 7 s: still on at 6.5 s, over by 7.1 s.
  await page.evaluate(() => window.__gallery.startFrenzy());
  await steps(page, 6.5);
  assert.ok((await state(page)).frenzy > 0, 'still on at 6.5 s');
  await steps(page, 0.6);
  assert.equal((await state(page)).frenzy, 0, 'over by 7.1 s');
  await page.evaluate(() => window.__gallery.clear());
  await page.evaluate(() => (window.__gallery.game.time = 25));
  const ft = await page.evaluate(() => {
    const t = window.__gallery.launchFrenzyTarget();
    t.speed = 0;
    t.x = 200;
    return { lane: t.lane, x: t.x, w: window.__gallery.dims(t)[0] };
  });
  assert.equal((await shoot(page, ft.x + ft.w * 0.3, ft.lane)).kind, 'frenzy');
  let s = await state(page);
  assert.ok(s.frenzy > 0);
  assert.equal(await page.evaluate(() => window.__gallery.music()), 'frenzy');
  const t0 = s.time;
  const before = await page.evaluate(() => window.__gallery.targets().length);
  const mover = await place(page, 'target', { lane: 2, x: 100, speed: 50, dir: 1, face: 'target_red1' });
  await steps(page, 1);
  const moved = await page.evaluate((id) => window.__gallery.targets().find((t) => t.id === id).x, mover.id);
  assert.ok(near(moved - 100, 80, 1), `moved ${moved - 100} in a second at 1.6×`);
  s = await state(page);
  assert.ok(near(s.time, t0), 'the timer stopped');
  assert.ok((await page.evaluate(() => window.__gallery.targets().length)) > before + 2, 'targets sprang up');
  // A shot in the frenzy is free, scores double, gives no pips and doesn't move the assist.
  await page.evaluate(() => {
    const g = window.__gallery;
    g.clear();
    g.game.hopper = 3;
    g.game.pips = 0;
  });
  const t = await place(page, 'target', { lane: 0, x: 200, face: 'target_red1' });
  const s1 = await state(page);
  assert.equal((await shoot(page, t.x + t.w * 0.38, 0)).what, 'body');
  s = await state(page);
  assert.deepEqual([s.score - s1.score, s.pips, s.assist], [60, 0, 0.5]);
  assert.ok(s.hopper >= 3, 'the shot was free');
  await shoot(page, 60, 0);
  await shoot(page, 60, 0);
  assert.equal((await state(page)).assist, 0.5, 'frenzy misses leave the assist');
  await steps(page, 7);
  s = await state(page);
  assert.equal(s.frenzy, 0);
  assert.equal(await page.evaluate(() => window.__gallery.music()), 'music', 'the waltz is back');
  assert.ok(s.time < t0, 'the timer runs again');
  await context.close();
});

test('shooting-gallery AC-13: rounds bring in their elements as in the table', async () => {
  const { context, page } = await open();
  const seen = await page.evaluate(() => {
    const g = window.__gallery;
    g.manual = true;
    const out = [];
    for (let n = 1; n <= 6; n++) {
      g.startRun({ seed: 4 + n });
      if (n > 1) g.startRound(n);
      g.game.frenzyTimes = [];
      g.game.mode = 'play';
      const kinds = new Set();
      const lanes = { drop: new Set(), mover: new Set() };
      let turning = false;
      for (let i = 0; i < 60 * 28; i++) {
        g.step(1 / 60);
        g.game.time = 30;
        for (const t of g.targets()) {
          kinds.add(t.kind);
          if (t.kind === 'drop') lanes.drop.add(t.lane);
          if (t.kind === 'duck' || t.kind === 'target') lanes.mover.add(t.lane);
          if (t.turn) turning = true;
        }
      }
      out.push({ kinds: [...kinds].sort(), drop: [...lanes.drop].sort(), mover: [...lanes.mover].sort(), turning, double: !!g.ROUNDS[n].double });
    }
    return out;
  });
  assert.deepEqual(seen[0].mover, [0, 1, 2, 3, 4], 'round 1: movers in every lane');
  assert.ok(!seen[0].kinds.includes('pop') && !seen[0].kinds.includes('drop'));
  assert.ok(seen[1].kinds.includes('pop') && !seen[1].kinds.includes('drop'), 'round 2: pop-ups');
  assert.ok(seen[2].kinds.includes('drop'), 'round 3: drop-downs');
  assert.ok(seen[2].drop.every((i) => i >= 2), `drop-downs only in the front three lanes: ${seen[2].drop}`);
  assert.ok(!seen[2].turning && seen[3].turning, 'round 4: turnabouts');
  assert.ok(seen[4].kinds.includes('gold'), 'round 5: gold ducks');
  assert.ok(seen[5].double && ['pop', 'drop', 'duck', 'target'].every((k) => seen[5].kinds.includes(k)) && seen[5].turning);
  await context.close();
});

test('shooting-gallery AC-14: the layout follows the screen; turning mid-run freezes play under a veil; turning back resumes; Restart starts over in the new layout', async () => {
  const { context, page } = await open({ viewport: LANDSCAPE });
  assert.deepEqual(await page.evaluate(() => [window.__gallery.stage().orient, window.__gallery.L.n]), ['landscape', 3]);
  // On the start card, the booth just lays itself out again.
  await page.setViewportSize(PORTRAIT);
  await page.waitForTimeout(100);
  assert.deepEqual(await page.evaluate(() => [window.__gallery.stage().orient, window.__gallery.L.n]), ['portrait', 5]);
  assert.ok(await page.locator('[data-screen="turned"]').isHidden());
  await page.click('[data-play]');
  await page.evaluate(() => (window.__gallery.game.assist = 0.42));
  await page.waitForTimeout(1400);
  // Turned mid-run: the veil, play frozen.
  await page.setViewportSize(LANDSCAPE);
  await page.waitForTimeout(600);
  assert.ok(await page.locator('[data-screen="turned"]').isVisible());
  assert.equal(await page.locator('[data-turned-text]').textContent(), 'Restart in landscape?');
  const t0 = await page.evaluate(() => window.__gallery.game.T);
  await page.waitForTimeout(400);
  assert.equal(await page.evaluate(() => window.__gallery.game.T), t0, 'frozen under the veil');
  // Turned back: play goes on after the count-in, in the same 5-lane run.
  await page.setViewportSize(PORTRAIT);
  await page.waitForTimeout(150);
  assert.ok(await page.locator('[data-screen="turned"]').isHidden());
  assert.ok(await page.evaluate(() => window.__gallery.game.resumeT > 0));
  await page.waitForTimeout(1300);
  assert.ok((await page.evaluate(() => window.__gallery.game.T)) > t0, 'play goes on');
  assert.equal(await page.evaluate(() => window.__gallery.L.n), 5);
  // Turned again, and Restart: a new run in landscape, the assist as it was.
  await page.setViewportSize(LANDSCAPE);
  await page.waitForTimeout(600);
  await page.click('[data-restart]');
  const r = await page.evaluate(() => ({ n: window.__gallery.L.n, orient: window.__gallery.stage().orient, round: window.__gallery.game.round, score: window.__gallery.game.score, assist: window.__gallery.game.assist }));
  assert.deepEqual(r, { n: 3, orient: 'landscape', round: 1, score: 0, assist: 0.3 });
  assert.ok(await page.locator('[data-screen="turned"]').isHidden());
  // Each layout keeps its own best.
  const best = await page.evaluate(() => Object.keys(window.__gallery.memory.best).sort());
  assert.deepEqual(best, ['landscape', 'portrait']);
  await context.close();
});

const hide = (page) =>
  page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });

test('shooting-gallery AC-15: hiding the page pauses a round; the resuming tap never fires and play waits out the count-in', async () => {
  const { context, page } = await open({ hasTouch: true });
  await hide(page);
  assert.ok(await page.locator('[data-screen="pause"]').isHidden(), 'no pause card on the start card');
  await page.click('[data-play]');
  await page.waitForTimeout(1500);
  await hide(page);
  assert.ok(await page.locator('[data-screen="pause"]').isVisible());
  const t0 = await page.evaluate(() => window.__gallery.game.T);
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => window.__gallery.game.T), t0, 'nothing moves while paused');
  const hopper = (await state(page)).hopper;
  await page.locator('[data-screen="pause"]').tap();
  assert.ok(await page.locator('[data-screen="pause"]').isHidden());
  assert.equal((await state(page)).hopper, hopper, 'the resuming tap does not fire');
  await page.waitForTimeout(500);
  assert.equal(await page.evaluate(() => window.__gallery.game.T), t0, 'frozen through the count-in');
  await page.waitForTimeout(800);
  assert.ok((await page.evaluate(() => window.__gallery.game.T)) > t0, 'and then it goes on');
  await context.close();
});

test('shooting-gallery AC-16: the assist grows only the body, starts at 0.3, rises after misses and an early lost run, falls with hits, and is off in round 6', async () => {
  const { context, page } = await open();
  assert.equal(await page.evaluate(() => window.__gallery.memory.assist), 0.3, 'a new player');
  await ready(page, 2, { assist: 1 });
  const r = await page.evaluate(() => {
    const g = window.__gallery;
    const t = g.makeTarget('target', { lane: 2, x: 200, speed: 0, turn: false, face: 'target_colored' });
    const [w] = g.dims(t);
    const R = (w / 2) * 0.97;
    const at = (dx) => g.resolve(200 + dx, t.y).what;
    const out = { grown: at(R * 1.1), bullEdge: at((w / 2) * 0.366 * 1.08) };
    g.game.assist = 0;
    out.plain = at(R * 1.1);
    return out;
  });
  assert.deepEqual([r.grown, r.bullEdge], ['body', 'body']);
  assert.ok(['wall', 'strip'].includes(r.plain), `without the assist it's a miss: ${r.plain}`);
  await page.evaluate(() => (window.__gallery.game.assist = 0));
  await shoot(page, 60, 0);
  await shoot(page, 60, 0);
  assert.ok(near((await state(page)).assist, 0.2));
  const t = await place(page, 'target', { lane: 3, x: 200, face: 'target_red1' });
  await shoot(page, t.x + t.w * 0.38, 3);
  assert.ok(near((await state(page)).assist, 0.15));
  await ready(page, 6, { assist: 1 });
  assert.equal(await page.evaluate(() => window.__gallery.assistNow()), 0);
  await ready(page, 2, { assist: 0.1 });
  await page.evaluate(() => (window.__gallery.game.time = 0.01));
  await steps(page, 0.05);
  assert.ok(near((await state(page)).assist, 0.4), 'a run lost in round 2');
  await context.close();
});

test('shooting-gallery AC-17: the best score is kept across reloads', async () => {
  const { context, page } = await open();
  await ready(page);
  await page.evaluate(() => {
    const g = window.__gallery.game;
    g.score = 1234;
    g.time = 0.01;
  });
  await steps(page, 1.7);
  await page.reload();
  await page.waitForFunction(() => window.__gallery);
  assert.equal(await page.evaluate(() => window.__gallery.memory.best.portrait), 1234);
  assert.match(await page.locator('[data-best]').textContent(), /1,234/);
  await context.close();
});

test('shooting-gallery AC-18: each state shows only its own card, banner and HUD', async () => {
  const { context, page } = await open();
  const ui = () => page.evaluate(() => window.__gallery.ui());
  const row = (u) => [u.start, u.over, u.pause, u.turned, u.banner, u.hud, u.pips, u.timer];
  assert.deepEqual(row(await ui()), [true, false, false, false, null, false, 'hidden', 'hidden'], 'start');
  await page.click('[data-play]');
  await page.evaluate(() => (window.__gallery.manual = true));
  let u = await ui();
  assert.deepEqual(row(u), [false, false, false, false, 'Round 1', true, 'shown', 'running'], 'round intro');
  assert.equal(u.bannerSub, 'Warm-up');
  await steps(page, 1.4);
  assert.deepEqual(row(await ui()), [false, false, false, false, null, true, 'shown', 'running'], 'playing');
  await page.evaluate(() => window.__gallery.pause());
  assert.deepEqual(row(await ui()), [false, false, true, false, null, true, 'shown', 'running'], 'paused');
  await page.evaluate(() => window.__gallery.resume());
  assert.deepEqual(row(await ui()), [false, false, false, false, 'Ready…', true, 'shown', 'running'], 'resuming');
  await page.evaluate(() => (window.__gallery.game.resumeT = 0));
  // The bonus.
  await page.evaluate(() => (window.__gallery.game.pips = window.__gallery.game.cfg.quota - 1));
  await page.evaluate(() => window.__gallery.clear());
  const t = await place(page, 'duck', { lane: 4, x: 200, face: 'duck_yellow' });
  await shoot(page, t.x, 4);
  u = await ui();
  assert.deepEqual(row(u), [false, false, false, false, 'Bonus!', true, 'gold', 'running'], 'bonus');
  assert.ok(u.pill.top >= u.pill.counterTop, `the Bonus pill sits on the counter, clear of every lane: ${JSON.stringify(u.pill)}`);
  // Round won: the tally.
  await page.evaluate(() => (window.__gallery.game.time = 0.01));
  await steps(page, 0.05);
  u = await ui();
  assert.deepEqual([u.banner, u.pips], ['Round cleared', 'gold']);
  assert.match(u.bannerSub, /^\+\d+ points$/);
  // A frenzy: its pill, the timer stopped.
  await steps(page, 3);
  await page.evaluate(() => {
    const g = window.__gallery;
    g.game.mode = 'play';
    g.game.banner = null;
    g.startFrenzy();
  });
  await steps(page, 0.1);
  u = await ui();
  assert.deepEqual(row(u), [false, false, false, false, 'Frenzy!', true, 'shown', 'stopped'], 'frenzy');
  assert.ok(u.pill.top >= u.pill.counterTop, 'the Frenzy pill sits on the counter');
  assert.ok(['yellow', 'dark'].includes(u.timerColour), `the stopped timer flashes yellow and dark: ${u.timerColour}`);
  // Over.
  await page.evaluate(() => {
    const g = window.__gallery.game;
    g.frenzy = 0;
    g.time = 0.01;
  });
  await steps(page, 0.05);
  assert.equal((await ui()).pips, 'flash', 'the missing pips flash');
  await steps(page, 1.6);
  assert.deepEqual(row(await ui()), [false, true, false, false, null, true, 'shown', 'running'], 'over');
  await context.close();
  // Turned: only the veil.
  const L = await open({ viewport: PORTRAIT });
  await L.page.click('[data-play]');
  await L.page.waitForTimeout(300);
  await L.page.setViewportSize(LANDSCAPE);
  await L.page.waitForTimeout(600);
  const v = await L.page.evaluate(() => window.__gallery.ui());
  assert.deepEqual([v.start, v.over, v.pause, v.turned, v.banner, v.hud, v.greyed], [false, false, false, true, null, true, true], 'turned: the HUD shown, greyed');
  await L.context.close();
});

test('shooting-gallery AC-19: a shot, a splat, a hit, a bullseye, an empty hopper, a round start, the quota, the frenzy target and the time running out have their sounds', async () => {
  const { context, page } = await open();
  await page.click('[data-play]');
  assert.ok(await page.evaluate(() => window.__gallery.heard.includes('round')));
  await ready(page);
  const heard = () => page.evaluate(() => window.__gallery.heard.slice());
  const clearHeard = () => page.evaluate(() => (window.__gallery.heard.length = 0));
  await clearHeard();
  const t = await place(page, 'target', { lane: 3, x: 200, face: 'target_red1' });
  await shoot(page, t.x + t.w * 0.38, 3);
  let h = await heard();
  assert.equal(h[0], 'twang');
  assert.ok(h.includes('splat') || h.includes('splat2'), `a wet splat: ${h}`);
  assert.ok(h.includes('hit'));
  await clearHeard();
  const b = await place(page, 'target', { lane: 0, x: 200, face: 'target_colored' });
  await shoot(page, b.x, 0);
  h = await heard();
  assert.ok(h.includes('ding') && h.includes('tin'), `${h}`);
  await clearHeard();
  await shoot(page, 60, 0);
  assert.ok((await heard()).includes('plip'), 'a miss lands with a plip');
  await page.evaluate(() => (window.__gallery.game.hopper = 0));
  await clearHeard();
  await page.evaluate(() => {
    window.__gallery.game.lastFire = -1;
    window.__gallery.fire();
  });
  assert.deepEqual(await heard(), ['dry']);
  await page.evaluate(() => (window.__gallery.game.hopper = 6));
  await page.evaluate(() => (window.__gallery.game.pips = window.__gallery.game.cfg.quota - 1));
  const q = await place(page, 'duck', { lane: 4, x: 200, face: 'duck_yellow' });
  await clearHeard();
  await shoot(page, q.x, 4);
  assert.ok((await heard()).includes('quota'));
  // The frenzy target.
  const ft = await page.evaluate(() => {
    const t = window.__gallery.launchFrenzyTarget();
    t.speed = 0;
    t.x = 200;
    return { lane: t.lane };
  });
  await clearHeard();
  await shoot(page, 200, ft.lane);
  assert.ok((await heard()).includes('frenzyhit'));
  await ready(page);
  await clearHeard();
  await page.evaluate(() => (window.__gallery.game.time = 0.01));
  await steps(page, 0.05);
  assert.ok((await heard()).includes('lost'));
  assert.ok(await page.evaluate(() => window.__played.length > 0), 'played through the audio context');
  await context.close();
});

test('shooting-gallery AC-21: the gallery plays offline once it has been played', async () => {
  const context = await browser.newContext({ viewport: PORTRAIT });
  const page = await context.newPage();
  await page.goto(BASE + 'shooting-gallery/');
  await page.evaluate(() => navigator.serviceWorker.register('../sw.js'));
  await page.evaluate(() => Promise.race([navigator.serviceWorker.ready, new Promise((r) => setTimeout(r, 10000))]));
  await page.reload(); // controlled now: this load caches the game's files
  await page.waitForFunction(() => window.__gallery);
  await page.waitForLoadState('networkidle');
  await context.setOffline(true);
  await page.reload();
  await page.waitForFunction(() => window.__gallery);
  await page.click('[data-play]');
  assert.equal(await page.evaluate(() => window.__gallery.game.mode), 'intro');
  await context.close();
});

test('shooting-gallery AC-22: at 390×844, 360×640 and 844×390 everything fits, the timer’s digits beat the score’s, far targets are at least 44 px, and the counter holds no target', async () => {
  for (const viewport of [PORTRAIT, { width: 360, height: 640 }, LANDSCAPE]) {
    const { context, page } = await open({ viewport });
    await page.click('[data-play]');
    const m = await page.evaluate(() => {
      const g = window.__gallery;
      const { k } = g.stage();
      const far = g.makeTarget('target', { lane: 0, x: 200, speed: 0 });
      const lowest = Math.max(
        ...g.L.lanes.map((l) => {
          const d = g.makeTarget('duck', { lane: l.i, speed: 0 });
          return l.line + g.dims(d)[1] / 2;
        })
      );
      const hb = g.hudBounds();
      return {
        far: g.dims(far)[0] * k,
        lowest: g.toClient(0, lowest).y,
        hb,
        n: g.L.n,
        scrollW: document.documentElement.scrollWidth,
        scrollH: document.documentElement.scrollHeight,
      };
    });
    const where = `${viewport.width}×${viewport.height}`;
    assert.equal(m.n, viewport.width > viewport.height ? 3 : 5, where);
    assert.ok(m.far >= 44, `far targets ${m.far} px at ${where}`);
    for (const key of ['hopper', 'sling', 'slingFoot']) {
      assert.ok(m.hb[key].x <= viewport.width && m.hb[key].y <= viewport.height, `${key} fits at ${where}`);
    }
    const tb = m.hb.timerBadge;
    assert.ok(tb.x >= 0 && tb.y >= 0 && tb.x + tb.w <= viewport.width && tb.y + tb.h <= m.hb.boothTop + 4, `the timer badge fits at the top at ${where}`);
    assert.ok(tb.x >= 56, `the timer sits beside the back button at ${where}`);
    assert.ok(tb.font > m.hb.scoreFont, `the timer's digits are larger than the score's at ${where}`);
    assert.ok(m.hb.sling.y > m.hb.counterTop, `the slingshot is on the counter at ${where}`);
    assert.ok(m.lowest <= m.hb.counterTop + 1, `no target on the counter at ${where}: ${m.lowest} vs ${m.hb.counterTop}`);
    assert.ok(m.scrollW <= viewport.width && m.scrollH <= viewport.height, 'no scrolling');
    await context.close();
  }
});

test('shooting-gallery AC-23: the timer counts whole seconds in bulbs; a chime at half time, a rung hand bell at 10 s, a climbing bell at 5 s and a klaxon at 3, 2 and 1, warming to yellow, orange and red; in a frenzy it flashes yellow and dark', async () => {
  const { context, page } = await open();
  await ready(page);
  const ui = () => page.evaluate(() => window.__gallery.ui());
  await page.evaluate(() => {
    window.__gallery.game.time = 15.05;
    window.__gallery.heard.length = 0;
  });
  let u = await ui();
  assert.deepEqual([u.timerText, u.timerColour], ['16', 'plain']);
  // In bulbs: 1 lights segments b and c, 6 lights six, three bulbs a segment, out of 42.
  assert.deepEqual(await page.evaluate(() => window.__gallery.timerBulbs()), { digits: [1, 6], lit: 24, of: 42 });
  await steps(page, 0.1);
  assert.ok(await page.evaluate(() => window.__gallery.heard.includes('chime')), 'a chime at half time');
  assert.ok(await page.evaluate(() => window.__gallery.game.pulse > 0.5), 'the badge swells');
  await page.evaluate(() => {
    window.__gallery.game.time = 10.05;
    window.__gallery.heard.length = 0;
  });
  await steps(page, 0.1);
  u = await ui();
  assert.deepEqual([u.timerText, u.timerColour], ['10', 'yellow']);
  assert.deepEqual(await page.evaluate(() => window.__gallery.heard), ['alert10'], 'the alarm bell at 10 s, and nothing else');
  await page.evaluate(() => {
    window.__gallery.game.time = 5.05;
    window.__gallery.heard.length = 0;
    window.__gallery.game.pulse = 0;
  });
  await steps(page, 0.1);
  assert.deepEqual(await page.evaluate(() => window.__gallery.heard), ['alert5'], 'the bell at 5 s');
  assert.ok(await page.evaluate(() => window.__gallery.game.pulse > 0.5), 'the board swells at 5 s');
  await page.evaluate(() => (window.__gallery.game.time = 4.5));
  assert.equal((await ui()).timerColour, 'orange');
  await page.evaluate(() => {
    window.__gallery.game.time = 3.05;
    window.__gallery.heard.length = 0;
  });
  await steps(page, 2.1);
  u = await ui();
  assert.equal(u.timerColour, 'red');
  assert.deepEqual(await page.evaluate(() => window.__gallery.heard.filter((n) => n === 'alarm')), ['alarm', 'alarm', 'alarm'], 'a klaxon at 3, 2 and 1 s');
  // The half-time chime, the 10 s bell, the 5 s bell and the klaxon are four different sounds.
  const files = await page.evaluate(async () => {
    const names = ['chime', 'alert10', 'alert5', 'alarm'];
    const sizes = await Promise.all(names.map((n) => fetch(`sounds/${n}.mp3`).then((r) => r.arrayBuffer()).then((b) => b.byteLength)));
    return sizes;
  });
  assert.equal(new Set(files).size, 4, `four distinct sound files: ${files}`);
  // In a frenzy the stopped timer's bulbs flash yellow and dark, never pink.
  const seen = await page.evaluate(() => {
    const g = window.__gallery;
    g.game.time = 20;
    g.startFrenzy();
    const out = new Set();
    for (let i = 0; i < 60; i++) {
      g.step(1 / 60);
      out.add(g.timerColour());
    }
    return [...out].sort();
  });
  assert.deepEqual(seen, ['dark', 'yellow']);
  await context.close();
});

test('shooting-gallery AC-24: a frenzy target comes 5–9 s in and again 17–22 s if missed; easy in round 1, harder in round 2, hard from round 3', async () => {
  const { context, page } = await open();
  const r = await page.evaluate(() => {
    const g = window.__gallery;
    g.manual = true;
    const out = [];
    for (let n = 1; n <= 6; n++) {
      g.startRun({ seed: 40 + n });
      if (n > 1) g.startRound(n);
      const times = g.game.frenzyTimes.slice();
      g.clear();
      g.game.mode = 'play';
      g.game.spawn = { movers: g.L.lanes.map(() => 999), pop: 999, drop: 999, gold: [] };
      let first = null;
      let second = null;
      let target = null;
      for (let i = 0; i < 60 * 24; i++) {
        g.step(1 / 60);
        g.game.time = 30;
        const t = g.targets().find((x) => x.kind === 'frenzy');
        if (t && first === null) {
          first = g.game.elapsed;
          target = { lane: t.lane, motion: t.motion, speed: t.speed, big: t.big, upFor: t.upFor };
          t.state = 'gone'; // missed
        } else if (t && first !== null && second === null && g.game.elapsed > first + 1) {
          second = g.game.elapsed;
          t.state = 'gone';
        }
      }
      out.push({ times, first, second, target, laneSpeed: g.ROUNDS[n].vFar });
    }
    return { out, n: window.__gallery.L.n };
  });
  for (const [i, x] of r.out.entries()) {
    assert.ok(x.times[0] >= 5 && x.times[0] <= 9 && x.times[1] >= 17 && x.times[1] <= 22, `round ${i + 1}: ${x.times}`);
    assert.ok(x.first !== null && Math.abs(x.first - x.times[0]) < 0.05, `round ${i + 1} first at ${x.first}`);
    assert.ok(x.second !== null && Math.abs(x.second - x.times[1]) < 0.05, `round ${i + 1} again at ${x.second}`);
  }
  const [r1, r2, r3] = r.out.map((x) => x.target);
  assert.deepEqual([r1.lane, r1.motion, r1.upFor, r1.big], [r.n - 1, 'pop', 3.5, 1.15], 'round 1: big, rising in the nearest lane for 3.5 s');
  assert.deepEqual([r2.lane, r2.motion], [2, 'mover'], 'round 2: crossing a middle lane');
  assert.deepEqual([r3.lane, r3.motion], [0, 'mover'], 'from round 3: crossing the farthest lane');
  assert.ok(near(r3.speed, r.out[2].laneSpeed * 1.8, 0.01), 'at 1.8× its speed');
  for (const x of r.out.slice(3)) assert.equal(x.target.lane, 0);
  await context.close();
});

test('shooting-gallery AC-25: every target stands on a stick and rocks about its foot; a shot is judged where it is drawn', async () => {
  const { context, page } = await open();
  await ready(page);
  const r = await page.evaluate(() => {
    const g = window.__gallery;
    g.game.rock = 1;
    const t = g.makeTarget('target', { lane: 2, x: 200, speed: 0, turn: false, face: 'target_red1' });
    const d = g.makeTarget('duck', { lane: 3, x: 120, speed: 0, turn: false, face: 'duck_yellow' });
    const lane = g.L.lanes[2];
    const pv = g.pivotOf(t);
    // Rocking: the angle changes over time, a few degrees at most, each target at its own pace.
    const angles = [];
    const duckAngles = [];
    for (let i = 0; i < 240; i++) {
      g.step(1 / 60);
      angles.push(g.rockAngle(t));
      duckAngles.push(g.rockAngle(d));
    }
    const max = Math.max(...angles.map(Math.abs)) * (180 / Math.PI);
    const duckMax = Math.max(...duckAngles.map(Math.abs)) * (180 / Math.PI);
    // Freeze it well tilted, then shoot at where its centre is drawn and where it would be upright.
    while (Math.abs(g.rockAngle(t)) < 0.05) g.step(1 / 60);
    const a = g.rockAngle(t);
    const drawnX = pv.x + (t.x - pv.x) * Math.cos(a) - (t.y - pv.y) * Math.sin(a);
    const drawnY = pv.y + (t.x - pv.x) * Math.sin(a) + (t.y - pv.y) * Math.cos(a);
    const atDrawn = g.resolve(drawnX, drawnY);
    return {
      max,
      duckMax,
      pivotBelowStrip: pv.y > lane.strip,
      atDrawn: [atDrawn.what, atDrawn.t && atDrawn.t.id === t.id],
      differ: angles.some((x, i) => Math.abs(x - duckAngles[i]) > 1e-3),
      // A drop-down swings about its rope's top, 3° at most.
      drop: (() => {
        const dd = g.makeTarget('drop', { lane: 3, x: 300, up: true, turn: false });
        let m = 0;
        for (let i = 0; i < 240; i++) {
          g.step(1 / 60);
          m = Math.max(m, Math.abs(g.rockAngle(dd)));
        }
        return { max: m * (180 / Math.PI), pivotY: g.pivotOf(dd).y, top: g.L.top };
      })(),
      // A rocked pop-up is hit where it's drawn too.
      pop: (() => {
        const pp = g.makeTarget('pop', { lane: 4, x: 120, up: true, upFor: 99, turn: false, face: 'target_colored' });
        while (Math.abs(g.rockAngle(pp)) < 0.05) g.step(1 / 60);
        const a2 = g.rockAngle(pp);
        const q = g.pivotOf(pp);
        const x = q.x + (pp.x - q.x) * Math.cos(a2) - (pp.y - q.y) * Math.sin(a2);
        const y = q.y + (pp.x - q.x) * Math.sin(a2) + (pp.y - q.y) * Math.cos(a2);
        const hit = g.resolve(x, y);
        return [hit.what, hit.t && hit.t.id === pp.id];
      })(),
    };
  });
  assert.ok(r.max > 2 && r.max <= 4.01, `targets rock up to 4°: ${r.max}`);
  assert.ok(r.duckMax > 2 && r.duckMax <= 5.01, `ducks up to 5°: ${r.duckMax}`);
  assert.ok(r.pivotBelowStrip, 'the stick runs down behind the strip');
  assert.ok(r.differ, 'each at its own pace');
  assert.deepEqual(r.atDrawn, ['bull', true], 'the drawn centre is the bullseye');
  assert.ok(r.drop.max > 1.5 && r.drop.max <= 3.01, `a drop-down swings up to 3°: ${r.drop.max}`);
  assert.equal(r.drop.pivotY, r.drop.top + 30, 'about its rope’s top');
  assert.deepEqual(r.pop, ['bull', true], 'a rocked pop-up is hit where it is drawn');
  await context.close();
});

test('shooting-gallery AC-26: the ruler shows how far a pull reaches and a dotted arc covers only the first fifth of the flight', async () => {
  const { context, page } = await open();
  await ready(page);
  const r = await page.evaluate(() => {
    const g = window.__gallery;
    const P = g.pullRange();
    const box = g.rulerBox();
    const out = { box, notches: g.notchYs(), onCounter: box.top > g.L.C };
    out.idle = g.sliderY();
    g.aim.active = true;
    out.slider = [0, 0.5, 1].map((f) => {
      g.setPull(0, P.y * f);
      return g.sliderY();
    });
    // The slider sits on a lane's notch when the pull lands on that lane's line.
    g.aimAt(200, g.L.lanes[1].line);
    out.onNotch = Math.abs(g.sliderY() - g.notchYs()[1]);
    // The arc, as drawn, from the pouch toward the landing point.
    g.setPull(30, P.y * 0.8);
    const p = g.pouch();
    const a = g.aimPoint();
    const pts = g.arcPoints();
    const last = pts[pts.length - 1];
    out.arc = { n: pts.length, share: Math.abs(last.x - p.x) / Math.abs(a.x - p.x), shareY: (p.y - last.y) / (p.y - a.y), gap: Math.hypot(a.x - last.x, a.y - last.y), full: Math.hypot(a.x - p.x, a.y - p.y) };
    return out;
  });
  assert.ok(r.onCounter, 'the ruler is on the counter');
  assert.equal(r.idle, r.box.bottom, 'at rest the slider is at the bottom');
  assert.deepEqual(r.slider.map((y) => Math.round(y * 100) / 100), [r.box.bottom, (r.box.bottom + r.box.top) / 2, r.box.top].map((y) => Math.round(y * 100) / 100));
  assert.equal(r.notches.length, 5);
  assert.ok(r.onNotch < 1e-6, 'a pull onto a lane puts the slider on its notch');
  assert.equal(r.arc.n, 6);
  assert.ok(near(r.arc.share, 0.2, 1e-6), `the arc ends a fifth of the way across: ${r.arc.share}`);
  assert.ok(r.arc.shareY > 0.15 && r.arc.shareY < 0.45, `and a little over a fifth of the way up, the ball's arc: ${r.arc.shareY}`);
  assert.ok(r.arc.gap > r.arc.full * 0.7, 'it stops well short of the landing point');
  await context.close();
});

test('shooting-gallery AC-27: in every lane a length of stick shows between a target and its strip', async () => {
  for (const viewport of [PORTRAIT, LANDSCAPE]) {
    const { context, page } = await open({ viewport });
    await ready(page);
    const gaps = await page.evaluate(() => {
      const g = window.__gallery;
      return g.L.lanes.map((lane) => {
        const t = g.makeTarget('target', { lane: lane.i, speed: 0, turn: false });
        const d = g.makeTarget('duck', { lane: lane.i, speed: 0, turn: false });
        const D = g.dims(t)[1];
        const bottom = Math.max(lane.line + D / 2, lane.line + g.dims(d)[1] / 2);
        return (lane.strip - bottom) / D;
      });
    });
    assert.ok(gaps.every((x) => x >= 0.2), `stick showing, as shares of the target's size, at ${viewport.width}: ${gaps.map((x) => x.toFixed(2))}`);
    await context.close();
  }
});

test('shooting-gallery AC-28: a frenzy lights a chasing marquee of big bulbs along the top and sides', async () => {
  const { context, page } = await open();
  await ready(page, 2);
  const r = await page.evaluate(() => {
    const g = window.__gallery;
    const before = g.ui().marquee;
    g.startFrenzy();
    g.step(0.5);
    const a = g.marqueeBulbs();
    const during = g.ui().marquee;
    g.step(0.12);
    const b = g.marqueeBulbs();
    const { SW } = g.stage();
    const out = {
      before,
      during,
      n: a.length,
      top: a.filter((x) => x.y === a[0].y).length,
      left: a.filter((x) => x.x < 10).length,
      right: a.filter((x) => x.x > SW - 10).length,
      litShare: a.filter((x) => x.lit).length / a.length,
      chased: a.some((x, i) => x.lit !== b[i].lit),
      ratio: g.MARQUEE_R / g.timerBulbRadius(),
    };
    g.step(7);
    out.after = g.ui().marquee;
    return out;
  });
  assert.deepEqual([r.before, r.during, r.after], [false, true, false]);
  assert.ok(r.top >= 8 && r.left >= 4 && r.right >= 4, JSON.stringify(r));
  assert.ok(r.litShare > 0.55 && r.litShare < 0.75, 'two in three lit');
  assert.ok(r.chased, 'the pattern chases along');
  assert.ok(r.ratio >= 3, `bulbs ${r.ratio.toFixed(1)} times the timer's`);
  await context.close();
});

test('shooting-gallery AC-29: the cards are wooden signs, and the 10 s chime is the loudest', async () => {
  const { context, page } = await open();
  const bg = (sel) => page.locator(sel).evaluate((el) => getComputedStyle(el).backgroundImage);
  assert.match(await bg('[data-screen="start"]'), /wood\.png/);
  assert.match(await bg('[data-screen="over"]'), /wood\.png/);
  assert.match(await bg('[data-screen="pause"] .card-like'), /wood\.png/);
  assert.match(await bg('[data-screen="turned"] .card-like'), /wood\.png/);
  await ready(page);
  const gains = await page.evaluate(() => {
    const g = window.__gallery;
    g.game.time = 15.02;
    g.step(0.05);
    g.game.time = 10.02;
    g.step(0.05);
    return { chime: g.heardOpts.chime.gain, warn: g.heardOpts.alert10.gain };
  });
  assert.ok(gains.warn > gains.chime, `the 10 s ring is louder: ${JSON.stringify(gains)}`);
  // And louder than every other sound the game plays: a hit, a bullseye, a miss, the quota, the
  // frenzy target and the time running out.
  const all = await page.evaluate(() => {
    const g = window.__gallery;
    const t = g.makeTarget('target', { lane: 2, x: 200, speed: 0, turn: false, face: 'target_colored' });
    g.aimAt(t.x, t.y);
    g.game.lastFire = -1;
    g.fire();
    for (let i = 0; i < 40; i++) g.step(1 / 60);
    g.aimAt(40, g.L.lanes[0].line);
    g.game.lastFire = -1;
    g.fire();
    for (let i = 0; i < 40; i++) g.step(1 / 60);
    g.game.pips = g.game.cfg.quota - 1;
    const u = g.makeTarget('duck', { lane: 4, x: 200, speed: 0, turn: false, face: 'duck_yellow' });
    g.aimAt(u.x, u.y);
    g.game.lastFire = -1;
    g.fire();
    for (let i = 0; i < 30; i++) g.step(1 / 60);
    const f = g.launchFrenzyTarget();
    f.speed = 0;
    f.x = 260;
    g.aimAt(260, f.y);
    g.game.lastFire = -1;
    g.fire();
    for (let i = 0; i < 40; i++) g.step(1 / 60);
    g.game.frenzy = 0;
    g.game.time = 0.01;
    g.step(0.05);
    return Object.fromEntries(Object.entries(g.heardOpts).map(([k, v]) => [k, v.gain]));
  });
  const others = Object.entries(all).filter(([k]) => k !== 'alert10');
  assert.ok(others.length >= 8, `sounds compared: ${Object.keys(all)}`);
  for (const [name, gain] of others) assert.ok(all.alert10 > gain, `the 10 s bell is louder than ${name}: ${all.alert10} vs ${gain}`);
  await context.close();
});

test('shooting-gallery AC-30: a hit target is pulled straight down with its stick, at once and gathering speed, out of sight behind its strip within 0.45 s', async () => {
  const { context, page } = await open();
  await ready(page);
  const t = await place(page, 'target', { lane: 2, x: 200, face: 'target_red1' });
  assert.equal((await shoot(page, t.x + t.w * 0.38, 2)).what, 'body');
  const r = await page.evaluate(async (id) => {
    const g = window.__gallery;
    const tg = g.targets().find((x) => x.id === id);
    const lane = g.L.lanes[tg.lane];
    const [, h] = g.dims(tg);
    const poses = [];
    for (let a = 0; a <= 0.4001; a += 0.04) {
      tg.anim = a;
      const k = g.knockPose(tg);
      poses.push({ a, sy: k.sy, dy: k.dy, top: tg.y - h / 2 + k.dy });
    }
    tg.anim = 0.2;
    // Its stick is still drawn while it goes down.
    await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
    return { poses, strip: lane.strip, poles: g.polesDrawn(), state: tg.state };
  }, t.id);
  assert.equal(r.state, 'knocked');
  assert.ok(r.poses.every((p) => p.sy === 1), 'it is not folded back: it keeps its shape');
  // Each step until it is hidden moves farther than the one before: no pause, no slowing to a stop.
  const shown = r.poses.filter((p) => p.top < r.strip);
  for (let i = 1; i < shown.length; i++) {
    const was = shown[i - 1].dy - (shown[i - 2]?.dy ?? 0);
    assert.ok(shown[i].dy - shown[i - 1].dy >= was - 1e-9 && shown[i].dy > shown[i - 1].dy, `it gathers speed while in view: ${JSON.stringify(shown.map((p) => p.dy.toFixed(1)))}`);
  }
  assert.ok(r.poses[1].dy > 2, 'it starts moving at once');
  assert.ok(r.poses.find((p) => Math.abs(p.a - 0.4) < 1e-6).top >= r.strip, 'it is out of sight by 0.4 s');
  assert.ok(r.poses.find((p) => Math.abs(p.a - 0.2) < 1e-6).top < r.strip, 'but not in a flash: still partly in view at 0.2 s');
  assert.equal(r.poles, 1, 'its stick is drawn as it goes down');
  // A hit drop-down is pulled straight up behind the valance.
  const drop = await page.evaluate(() => {
    const g = window.__gallery;
    const d = g.makeTarget('drop', { lane: 3, x: 300, up: true, turn: false });
    d.state = 'knocked';
    d.anim = 0.4;
    const k = g.knockPose(d);
    const [, h] = g.dims(d);
    return { bottom: d.y + h / 2 + k.dy, valance: g.L.top + 30 };
  });
  assert.ok(drop.bottom <= drop.valance, `a drop-down is pulled up out of sight: ${JSON.stringify(drop)}`);
  // By 0.45 s after the hit the target is gone from the booth.
  const t2 = await place(page, 'target', { lane: 1, x: 120, face: 'target_red1' });
  await shoot(page, t2.x + t2.w * 0.38, 1);
  await steps(page, 0.45);
  assert.equal(await page.evaluate((id) => window.__gallery.targets().some((x) => x.id === id), t2.id), false, 'gone within 0.45 s');
  await context.close();
});

test('shooting-gallery AC-31: paint on the water or grass shows only below its crest, never hanging in the air above the edge', async () => {
  const { context, page } = await open();
  await ready(page);
  const r = await page.evaluate(async () => {
    const g = window.__gallery;
    const out = [];
    for (const lane of g.L.lanes) {
      for (let x = 40; x < g.stage().SW - 40; x += 23) {
        const crest = g.stripY(lane, x);
        out.push({ lane: lane.i, x, above: g.paintShowsAt(lane.i, x, crest - 3), below: g.paintShowsAt(lane.i, x, crest + 3) });
      }
    }
    // A shot just under a crest lands on the strip: the pixels just above the crest stay as they
    // were, and those just below take the paint.
    const lane = g.L.lanes[2];
    const x = 150;
    const cv = document.querySelector('#booth');
    const c = cv.getContext('2d');
    const { k, ox, oy } = g.stage();
    const dpr = cv.width / innerWidth;
    const px = (ux, uy) => Array.from(c.getImageData(Math.round((ux * k + ox) * dpr), Math.round((uy * k + oy) * dpr), 1, 1).data);
    const spots = [];
    for (let dx = -8; dx <= 8; dx += 2) {
      const crest = g.stripY(lane, x + dx);
      spots.push([x + dx, crest - 3], [x + dx, crest + 3]);
    }
    const frame = () => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
    await frame();
    const before = spots.map(([a, b]) => px(a, b));
    g.aimAt(x, g.stripY(lane, x) + 2);
    g.game.lastLand = null;
    g.fire();
    for (let i = 0; i < 40 && !g.game.lastLand; i++) g.step(1 / 60);
    await frame();
    const after = spots.map(([a, b]) => px(a, b));
    const same = (i) => before[i].every((v, j) => Math.abs(v - after[i][j]) <= 2);
    const aboveKept = spots.filter((_, i) => i % 2 === 0 && !same(i)).length;
    const belowPainted = spots.filter((_, i) => i % 2 === 1 && !same(i)).length;
    return { out, landed: g.game.lastLand, clipped: g.paintClipped(), lanes: g.L.n, aboveKept, belowPainted };
  });
  assert.equal(r.landed.what, 'strip');
  assert.equal(r.aboveKept, 0, 'no paint is drawn above the crest');
  assert.ok(r.belowPainted >= 5, `the paint shows below it: ${r.belowPainted} of 9`);
  assert.ok(r.out.every((p) => !p.above && p.below), `clipped at the crest: ${JSON.stringify(r.out.filter((p) => p.above || !p.below))}`);
  assert.equal(r.clipped, r.lanes, 'every lane’s paint is drawn clipped to its strip');
  await context.close();
});

test('shooting-gallery AC-32: a target’s stick stays in the background: its tones are soft, far less contrasting than the target', async () => {
  const { context, page } = await open();
  await ready(page);
  const r = await page.evaluate(async () => {
    const g = window.__gallery;
    const lane = g.L.lanes[2];
    const t = g.makeTarget('target', { lane: 2, x: 200, speed: 0, turn: false, face: 'target_red1' });
    const [w, h] = g.dims(t);
    await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
    const cv = document.querySelector('#booth');
    const c = cv.getContext('2d');
    const { k, ox, oy } = g.stage();
    const dpr = cv.width / innerWidth;
    const lum = (ux, uy) => {
      const d = c.getImageData(Math.round((ux * k + ox) * dpr), Math.round((uy * k + oy) * dpr), 1, 1).data;
      return 0.2126 * d[0] + 0.7152 * d[1] + 0.0722 * d[2];
    };
    const range = (xs, y) => {
      const v = xs.map((x) => lum(x, y));
      return Math.max(...v) - Math.min(...v);
    };
    const sw = g.stickWidth(lane);
    const y = (t.y + h / 2 + g.stripY(lane, t.x)) / 2;
    const stickXs = [];
    for (let x = t.x - sw / 2; x <= t.x + sw / 2 + 1e-9; x += sw / 12) stickXs.push(x);
    const faceXs = [];
    for (let x = t.x - w * 0.45; x <= t.x + w * 0.45; x += w / 40) faceXs.push(x);
    return { stick: range(stickXs, y), face: range(faceXs, t.y) };
  });
  assert.ok(r.stick < 70, `the stick’s tones are soft: a range of ${r.stick.toFixed(0)}`);
  assert.ok(r.stick < r.face * 0.4, `far less contrasting than the target: ${r.stick.toFixed(0)} vs ${r.face.toFixed(0)}`);
  await context.close();
});

test('shooting-gallery AC-33: the score, the signs and the cards are lettered in Rye, a fairground woodtype, with worn paint', async () => {
  const { context, page } = await open();
  await page.evaluate(() => document.fonts.load('20px Rye'));
  const css = await page.evaluate(() => {
    const cs = (sel) => getComputedStyle(document.querySelector(sel));
    return {
      loaded: document.fonts.check('20px Rye'),
      h2: cs('[data-over-title]').fontFamily,
      play: cs('[data-play]').fontFamily,
      h2Paint: cs('[data-over-title]').backgroundImage,
      scorePaint: cs('.score-line').backgroundImage,
      clip: cs('.score-line').backgroundClip,
    };
  });
  assert.ok(css.loaded, 'Rye loads from the game’s own folder');
  assert.match(css.h2, /^"?Rye/);
  assert.match(css.play, /^"?Rye/);
  assert.match(css.h2Paint, /wear-gold\.png/);
  assert.match(css.scorePaint, /wear-cream\.png/);
  assert.equal(css.clip, 'text');
  await ready(page);
  // On the canvas: the score's sign is lettered in Rye, and its paint is chipped (some of the
  // letters' pixels are see-through).
  const r = await page.evaluate(async () => {
    const g = window.__gallery;
    g.game.score = 480;
    await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
    return { font: g.SIGN_FONT, worn: g.signsWorn(), chipped: g.chipped('480', 26) };
  });
  assert.match(r.font, /^"Rye"/);
  assert.ok(r.worn >= 3, `the score, the round and the quota are painted: ${r.worn}`);
  assert.ok(r.chipped > 0.02 && r.chipped < 0.4, `the lettering is worn in specks: ${r.chipped}`);
  await context.close();
});

test('shooting-gallery AC-34: no pink lights in a frenzy or on its target, which wears a ring of marquee bulbs; the alarms stand out without blaring; the quota’s brass and the paintballs are textured', async () => {
  const { context, page } = await open();
  await ready(page);
  const r = await page.evaluate(async () => {
    const g = window.__gallery;
    g.game.pips = 3;
    g.game.hopper = 4;
    g.game.lastFire = -1;
    g.fire();
    g.step(0.05);
    await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
    const drawn = { paintballs: g.paintballsDrawn(), brass: g.brassDrawn() };
    // The marquee's colours: warm white, yellow and orange, none of them pink.
    const hues = g.MARQUEE_COLOURS.map((c) => {
      const n = parseInt(c.slice(1), 16);
      const [R, G, B] = [n >> 16, (n >> 8) & 255, n & 255];
      return { c, pinkish: R > 200 && B > 120 && G < 160 };
    });
    // The alarms: how loud each file is, against the half-time chime.
    const ac = new OfflineAudioContext(1, 44100, 44100);
    const loud = {};
    for (const n of ['chime', 'alert10', 'alert5', 'alarm']) {
      const buf = await fetch(`sounds/${n}.mp3`).then((x) => x.arrayBuffer());
      const d = (await ac.decodeAudioData(buf)).getChannelData(0);
      let sum = 0;
      let count = 0;
      for (const v of d) {
        if (Math.abs(v) > 1e-3) {
          sum += v * v;
          count++;
        }
      }
      loud[n] = Math.sqrt(sum / count);
    }
    return { drawn, hues, loud };
  });
  assert.ok(r.drawn.paintballs >= 5, `the hopper's balls, the pouch's and the flying one are drawn as paintballs: ${r.drawn.paintballs}`);
  assert.ok(r.drawn.brass >= 1, 'the quota is a textured brass bar');
  assert.deepEqual(r.hues.filter((h) => h.pinkish), [], 'no pink in the marquee');
  for (const n of ['alert10', 'alert5', 'alarm']) {
    const ratio = r.loud[n] / r.loud.chime;
    assert.ok(ratio > 1.1 && ratio < 2.5, `${n} stands out from the half-time chime without blaring: ${ratio.toFixed(2)}× its level`);
  }
  // The alarm gains stay modest: the 10 s bell only a little above the rest.
  const gains = await page.evaluate(() => {
    const g = window.__gallery;
    g.game.time = 10.02;
    g.step(0.05);
    g.game.time = 5.02;
    g.step(0.05);
    g.game.time = 3.02;
    g.step(0.05);
    return { alert10: g.heardOpts.alert10.gain, alert5: g.heardOpts.alert5.gain, alarm: g.heardOpts.alarm.gain };
  });
  for (const [n, v] of Object.entries(gains)) assert.ok(v <= 1.2, `${n} is played quietly: ${v}`);
  // On screen, in a frenzy: the marquee's bulbs, the glowing edges and the banner hold no pink.
  const pink = await page.evaluate(async () => {
    const g = window.__gallery;
    const frame = () => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
    const cv = document.querySelector('#booth');
    const c = cv.getContext('2d');
    const { k, ox, oy, SW, SH } = g.stage();
    const dpr = cv.width / innerWidth;
    const at = (x, y) => Array.from(c.getImageData(Math.round((x * k + ox) * dpr), Math.round((y * k + oy) * dpr), 1, 1).data);
    // The edges' glow: how far towards magenta (blue over green) the edges lean, before and in a frenzy.
    // (Along the counter's bottom edge, where no bulb stands.)
    const edge = [];
    for (let x = 6; x < SW - 6; x += 8) edge.push([x, SH - 6], [x, SH - 16]);
    const lean = () => edge.reduce((n, p) => {
      const [, gr, b] = at(...p);
      return n + (b - gr);
    }, 0) / edge.length;
    g.game.time = 20;
    await frame();
    const before = lean();
    g.startFrenzy();
    g.game.spawn.frenzy = 999;
    g.step(0.5);
    await frame();
    const during = lean();
    const spots = g.marqueeBulbs().map((b) => [b.x, b.y]);
    const isPink = ([r, gr, b]) => r > 190 && b > 130 && b > gr + 20;
    const bad = spots.filter((p) => isPink(at(...p)));
    // The Frenzy banner's lettering, across its pill (its bounds are in CSS px).
    const pb = g.ui().pill;
    let banner = 0;
    for (let x = pb.left + 4; x < pb.right - 4; x += 1) {
      for (let y = pb.top + 4; y < pb.bottom - 4; y += 2) {
        banner++;
        const d = Array.from(c.getImageData(Math.round(x * dpr), Math.round(y * dpr), 1, 1).data);
        if (isPink(d)) bad.push(['banner', x, y]);
      }
    }
    return { checked: spots.length + banner, pink: bad, before, during };
  });
  assert.ok(pink.checked > 40, `pixels checked: ${pink.checked}`);
  assert.deepEqual(pink.pink, [], 'no pink in the frenzy’s lights');
  // The frenzy target wears a ring of little marquee bulbs round its rim, chasing, and no pink glow.
  const ring = await page.evaluate(async () => {
    const g = window.__gallery;
    g.game.frenzy = 0;
    g.clear();
    const t = g.launchFrenzyTarget();
    t.speed = 0;
    t.x = 200;
    for (let i = 0; i < 90; i++) g.step(1 / 60);
    t.speed = 0;
    const [w] = g.dims(t);
    const bulbs = g.frenzyRing(t);
    await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
    const cv = document.querySelector('#booth');
    const c = cv.getContext('2d');
    const { k, ox, oy } = g.stage();
    const dpr = cv.width / innerWidth;
    let pinkPx = 0;
    let seen = 0;
    for (let a = 0; a < Math.PI * 2; a += 0.1) {
      for (const f of [0.3, 0.4, 0.47]) {
        const x = t.x + Math.cos(a) * w * f;
        const y = t.y + Math.sin(a) * w * f;
        const [r, gr, b] = c.getImageData(Math.round((x * k + ox) * dpr), Math.round((y * k + oy) * dpr), 1, 1).data;
        seen++;
        if (r > gr + 40 && b > gr + 10) pinkPx++; // magenta: red and blue over green, even blended
      }
    }
    const lit = (s) => {
      g.game.T = s;
      return bulbs.filter((b) => (b.i + Math.floor(g.game.T * 9)) % 3 !== 0).map((b) => b.i).join();
    };
    return {
      n: bulbs.length,
      dist: bulbs.map((b) => Math.hypot(b.x, b.y) / w),
      size: bulbs[0].r / g.MARQUEE_R,
      pinkPx,
      seen,
      chases: lit(10) !== lit(10.12),
    };
  });
  assert.ok(ring.n >= 12, `a ring of bulbs: ${ring.n}`);
  assert.ok(ring.dist.every((d) => d > 0.5 && d < 0.7), 'round its rim');
  assert.ok(ring.size > 0.2 && ring.size < 0.7, `smaller than the frenzy marquee's bulbs, not specks: ${ring.size.toFixed(2)}`);
  assert.ok(ring.chases, 'its lit bulbs chase round');
  assert.equal(ring.pinkPx, 0, `no pink glow on it (${ring.seen} pixels looked at)`);
  assert.ok(pink.during <= pink.before + 2, `the frenzy’s glow at the edges is warm, not pink: blue over green ${pink.before.toFixed(1)} → ${pink.during.toFixed(1)}`);
  await context.close();
});

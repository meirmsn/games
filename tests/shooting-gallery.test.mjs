// End-to-end tests for Shooting Gallery (specs/shooting-gallery.md). Run: scripts/check-slow.sh.
// The game exposes window.__gallery: its state, step() to advance the simulation without drawing,
// makeTarget() to place a target, and fire() to shoot at a point in the booth's units. A test that
// sets `manual` owns the clock: the page's frames only draw.
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

async function open(opts = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, ...opts });
  await context.addInitScript(FAKE_AUDIO);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(BASE + 'shooting-gallery/');
  await page.waitForFunction(() => window.__gallery);
  return { context, page, errors };
}

// Start a run at `round` with an empty booth that the test fills; the parade never runs out (a
// far-off item stays in the queue), the assist is off, and the test owns the clock.
async function ready(page, round = 1, { assist = 0 } = {}) {
  await page.evaluate(
    ({ round, assist }) => {
      const g = window.__gallery;
      g.manual = true;
      g.startRun({ seed: 1, order: ['turn', 'wind'] });
      if (round !== 1) g.startRound(round);
      g.clear();
      g.game.queue.push({ at: 9999, kind: 'duck' });
      g.game.mode = 'play';
      g.game.banner = null;
      g.game.assist = assist;
      g.game.lastFire = -1;
    },
    { round, assist }
  );
}

// Place a target in the booth's middle and return what a shot needs: its id, centre and size.
async function place(page, kind, opts = {}) {
  return page.evaluate(
    ({ kind, opts }) => {
      const g = window.__gallery;
      const t = g.makeTarget(kind, { x: g.stage().SW / 2, turn: false, ...opts });
      const [w, h] = g.dims(t);
      return { id: t.id, x: t.x, y: t.y, w, h, face: t.face };
    },
    { kind, opts }
  );
}

const shoot = (page, x, y) =>
  page.evaluate(
    ({ x, y }) => {
      const g = window.__gallery;
      g.game.lastFire = -1;
      const r = g.fire(x, y);
      return r && { what: r.what, on: r.on };
    },
    { x, y }
  );
const state = (page) =>
  page.evaluate(() => {
    const g = window.__gallery.game;
    return { mode: g.mode, score: g.score, shells: g.shells, pips: g.pips, bonus: g.bonus, speedMul: g.speedMul, round: g.round, assist: g.assist };
  });
const steps = (page, seconds) =>
  page.evaluate((s) => {
    for (let t = 0; t < s; t += 1 / 60) window.__gallery.step(1 / 60);
  }, seconds);

test('shooting-gallery AC-1: the booth moves behind the start card; Start begins round 1', async () => {
  const { context, page, errors } = await open();
  assert.ok(await page.locator('[data-screen="start"]').isVisible());
  const before = await page.evaluate(() => window.__gallery.targets().filter((t) => t.kind === 'duck').map((t) => [t.id, t.x]));
  assert.ok(before.length > 0, 'ducks are on the rail');
  await page.waitForTimeout(1000);
  const after = await page.evaluate(() => Object.fromEntries(window.__gallery.targets().map((t) => [t.id, t.x])));
  assert.ok(before.some(([id, x]) => after[id] !== undefined && Math.abs(after[id] - x) > 10), 'a duck moved in a second');
  await page.click('[data-play]');
  const s = await state(page);
  assert.equal(s.round, 1);
  assert.equal(s.shells, 8);
  assert.equal(await page.evaluate(() => window.__gallery.game.cfg.quota), 6);
  const inBooth = await page.evaluate(() => {
    const g = window.__gallery;
    return g.cross.x > 0 && g.cross.x < g.stage().SW && g.cross.y > g.L.T && g.cross.y < g.L.C;
  });
  assert.ok(inBooth, 'the crosshair is in the booth');
  assert.ok(await page.locator('[data-screen="start"]').isHidden());
  assert.deepEqual(errors, []);
  await context.close();
});

test('shooting-gallery AC-2: a shot spends a shell; hits score points and pips by kind; a miss scores nothing', async () => {
  const { context, page } = await open();
  await ready(page, 3);
  const s0 = await state(page);
  // A miss on the backdrop, above the small targets.
  const L = await page.evaluate(() => window.__gallery.L);
  assert.equal((await shoot(page, 200, L.T + 20)).what, 'miss');
  let s = await state(page);
  assert.equal(s.shells, s0.shells - 1);
  assert.equal(s.score, s0.score);
  // A small target's body (off-centre, outside the bullseye): 30 points, 3 pips.
  const tin = await place(page, 'tin', { face: 'target_red1' });
  assert.equal((await shoot(page, tin.x + tin.w * 0.38, tin.y)).what, 'body');
  s = await state(page);
  assert.deepEqual([s.score - s0.score, s.pips], [30, 3]);
  // A plain duck's body: 20 points, 2 pips.
  const duck = await place(page, 'duck', { face: 'duck_yellow' });
  assert.equal((await shoot(page, duck.x, duck.y)).what, 'body');
  s = await state(page);
  assert.deepEqual([s.score - s0.score, s.pips], [50, 5]);
  // A pop-up's body: 10 points, 1 pip.
  const pop = await place(page, 'pop', { up: true, upFor: 99, face: 'target_red3' });
  assert.equal((await shoot(page, pop.x + pop.w * 0.38, pop.y)).what, 'body');
  s = await state(page);
  assert.deepEqual([s.score - s0.score, s.pips, s.shells], [60, 6, s0.shells - 4]);
  await context.close();
});

test('shooting-gallery AC-3: a bullseye scores double and returns the shell; a stick snaps for triple and a pip more', async () => {
  const { context, page } = await open();
  await ready(page, 3);
  const s0 = await state(page);
  const tin = await place(page, 'tin', { face: 'target_colored' });
  assert.equal((await shoot(page, tin.x + 2, tin.y - 2)).what, 'bull');
  let s = await state(page);
  assert.deepEqual([s.score - s0.score, s.pips, s.shells], [60, 3, s0.shells], 'double points, shell back');
  // A duck's painted target is its bullseye.
  const duck = await place(page, 'duck', { face: 'duck_target_brown' });
  const bull = await page.evaluate(({ duck }) => {
    const B = window.__gallery.DUCK_BULL;
    return { x: duck.x + (B.u - 0.5) * duck.w, y: duck.y + (B.v - 0.5) * duck.h };
  }, { duck });
  assert.equal((await shoot(page, bull.x, bull.y)).what, 'bull');
  s = await state(page);
  assert.deepEqual([s.score - s0.score, s.pips, s.shells], [100, 5, s0.shells]);
  // The stick under a small target: snapped, 3 × 30 points, 3 + 1 pips, the shell spent.
  const tin2 = await place(page, 'tin', { face: 'target_red2' });
  assert.equal((await shoot(page, tin2.x, tin2.y + tin2.w / 2 + 8)).what, 'stick');
  s = await state(page);
  assert.deepEqual([s.score - s0.score, s.pips, s.shells], [190, 9, s0.shells - 1]);
  assert.equal(await page.evaluate((id) => window.__gallery.targets().find((t) => t.id === id).state, tin2.id), 'snapped');
  // With the assist growing the body over the top of the stick, the stick still wins.
  await page.evaluate(() => (window.__gallery.game.assist = 1));
  const tin3 = await place(page, 'tin', { face: 'target_red2' });
  assert.equal((await shoot(page, tin3.x, tin3.y + (tin3.w / 2) * 1.05)).what, 'stick');
  await context.close();
});

test('shooting-gallery AC-4: the frontmost thing takes the shot: a hidden pop-up is safe, water is a miss', async () => {
  const { context, page } = await open();
  await ready(page, 3);
  const s0 = await state(page);
  const pop = await place(page, 'pop', { face: 'target_colored' }); // down, behind the front water
  assert.equal((await shoot(page, pop.x, pop.y)).what, 'water');
  assert.equal(await page.evaluate((id) => window.__gallery.targets().find((t) => t.id === id).state, pop.id), 'live');
  const L = await page.evaluate(() => window.__gallery.L);
  assert.equal((await shoot(page, 120, L.frontY + 50)).what, 'water');
  // A duck standing behind a raised pop-up can't be hit through it.
  const duck = await place(page, 'duck', { face: 'duck_yellow' });
  const front = await place(page, 'pop', { up: true, upFor: 99, face: 'target_red3' });
  const r = await page.evaluate(({ x, y }) => {
    const g = window.__gallery;
    const hit = g.resolve(x, y, g.snapshot());
    return hit.p ? hit.p.t.kind : hit.what;
  }, { x: duck.x, y: Math.max(duck.y, front.y - front.w * 0.3) });
  assert.equal(r, 'pop');
  const s = await state(page);
  assert.equal(s.score, s0.score);
  await context.close();
});

test('shooting-gallery AC-5: the quota starts the bonus: faster, double points, no shells back; the last shell wins at once', async () => {
  const { context, page } = await open();
  await ready(page, 3);
  await page.evaluate(() => (window.__gallery.game.pips = window.__gallery.game.cfg.quota - 1));
  const tin = await place(page, 'tin', { face: 'target_red1' });
  await shoot(page, tin.x + tin.w * 0.38, tin.y);
  let s = await state(page);
  assert.equal(s.bonus, true);
  assert.equal(s.speedMul, 1.5);
  // A target now moves 1.5 times as far in the same time.
  const mover = await place(page, 'duck', { speed: 60, x: 150 });
  await steps(page, 1);
  const moved = await page.evaluate((id) => window.__gallery.targets().find((t) => t.id === id).x, mover.id);
  assert.ok(Math.abs(moved - 150 - 90) < 3, `moved ${moved - 150}`);
  // A bullseye in the bonus: 30 × 2 × 2, and the shell stays spent.
  const s1 = await state(page);
  const tin2 = await place(page, 'tin', { face: 'target_colored' });
  assert.equal((await shoot(page, tin2.x, tin2.y)).what, 'bull');
  s = await state(page);
  assert.deepEqual([s.score - s1.score, s.shells], [120, s1.shells - 1]);
  // The gold duck gives no shells in the bonus.
  const gold = await place(page, 'gold', { x: 100 });
  assert.equal((await shoot(page, gold.x, gold.y)).what, 'body');
  const s2 = await state(page);
  assert.equal(s2.shells, s.shells - 1);
  assert.equal(s2.score - s.score, 200, 'gold duck 100 × 2 (bonus)');
  // Meeting the quota with the last shell wins the round at once.
  await ready(page, 2);
  await page.evaluate(() => {
    const g = window.__gallery.game;
    g.shells = 1;
    g.pips = g.cfg.quota - 1;
  });
  const t3 = await place(page, 'tin', { face: 'target_red1' });
  await shoot(page, t3.x + t3.w * 0.38, t3.y);
  s = await state(page);
  assert.equal(s.mode, 'won');
  assert.equal(s.bonus, false);
  await context.close();
});

test('shooting-gallery AC-6: an empty tray or a parade gone by loses; a last-shell bullseye plays on; Play again restarts', async () => {
  const { context, page } = await open();
  // The last shell is a bullseye: the tray refills and play goes on.
  await ready(page, 1);
  await page.evaluate(() => (window.__gallery.game.shells = 1));
  const duck = await place(page, 'duck', { face: 'duck_target_yellow' });
  const bull = await page.evaluate(({ duck }) => {
    const B = window.__gallery.DUCK_BULL;
    return { x: duck.x + (B.u - 0.5) * duck.w, y: duck.y + (B.v - 0.5) * duck.h };
  }, { duck });
  assert.equal((await shoot(page, bull.x, bull.y)).what, 'bull');
  let s = await state(page);
  assert.deepEqual([s.mode, s.shells], ['play', 1]);
  // The last shell misses with the quota unmet: lost, then the over card.
  await shoot(page, 200, (await page.evaluate(() => window.__gallery.L.T)) + 20);
  s = await state(page);
  assert.equal(s.mode, 'lost');
  await steps(page, 1.6);
  assert.ok(await page.locator('[data-screen="over"]').isVisible());
  assert.equal(await page.locator('[data-over-title]').textContent(), 'Out of shells');
  assert.equal(await page.locator('[data-final-score]').textContent(), String(s.score));
  assert.match(await page.locator('[data-final-detail]').textContent(), /Round 1/);
  assert.match(await page.locator('[data-final-best]').textContent(), /best/i);
  await page.click('[data-again]');
  s = await state(page);
  assert.deepEqual([s.mode, s.shells, s.round, s.score], ['intro', 8, 1, 0]);
  // The parade goes by with the quota unmet: lost too.
  await ready(page, 1);
  await page.evaluate(() => (window.__gallery.game.queue.length = 0));
  await steps(page, 0.1);
  s = await state(page);
  assert.equal(s.mode, 'lost');
  await steps(page, 1.6);
  assert.equal(await page.locator('[data-over-title]').textContent(), 'They got away');
  await context.close();
});

// Win the current round by meeting its quota with the parade over, and step into the next.
async function winRound(page) {
  await page.evaluate(() => {
    const g = window.__gallery;
    g.clear();
    if (!g.game.cfg.free) g.game.pips = g.game.cfg.quota;
    else g.game.clock = 99;
  });
  await steps(page, 0.1);
  assert.equal((await state(page)).mode, 'won');
  await steps(page, 2.1);
}

test('shooting-gallery AC-7: a won round carries its shells plus 4, capped at 10, paying 50 for each one over; free rounds leave the tray', async () => {
  const { context, page } = await open();
  await ready(page, 1);
  await page.evaluate(() => (window.__gallery.game.shells = 3));
  await winRound(page);
  let s = await state(page);
  assert.deepEqual([s.round, s.shells], [2, 7]);
  await ready(page, 1);
  await page.evaluate(() => (window.__gallery.game.shells = 9));
  const before = (await state(page)).score;
  await winRound(page);
  s = await state(page);
  assert.deepEqual([s.round, s.shells, s.score - before], [2, 10, 150]);
  // A round never starts with fewer than 6, however few were carried.
  await ready(page, 1);
  await page.evaluate(() => (window.__gallery.game.shells = 0));
  await winRound(page);
  assert.equal((await state(page)).shells, 6);
  // Into the free round and out of it: the tray is untouched both ways.
  await ready(page, 3);
  await page.evaluate(() => (window.__gallery.game.shells = 5));
  await winRound(page);
  s = await state(page);
  assert.deepEqual([s.round, s.shells], [4, 5]);
  await page.evaluate(() => (window.__gallery.game.mode = 'play'));
  await shoot(page, 200, (await page.evaluate(() => window.__gallery.L.T)) + 20);
  assert.equal((await state(page)).shells, 5, 'a free shot costs nothing');
  await winRound(page);
  s = await state(page);
  assert.deepEqual([s.round, s.shells], [5, 9]);
  await context.close();
});

test('shooting-gallery AC-8: each round brings its elements in, as in the table', async () => {
  const { context, page } = await open();
  const plan = await page.evaluate(() => {
    const g = window.__gallery;
    const kinds = (n) => {
      g.startRun({ seed: 2 });
      g.startRound(n);
      const c = g.game.cfg;
      return { kinds: [...new Set(g.game.queue.map((q) => q.kind).concat(g.targets().filter((t) => t.state === 'live' && !g.game.attract).map((t) => t.kind)))].sort(), free: !!c.free, turn: !!c.turn, wind: !!c.wind, double: !!c.double, name: c.name };
    };
    return [1, 2, 3, 4, 5, 6, 7, 8].map(kinds);
  });
  assert.deepEqual(plan[0].kinds, ['duck']);
  assert.ok(plan[1].kinds.includes('tin') && !plan[1].kinds.includes('pop'));
  assert.ok(plan[2].kinds.includes('pop') && plan[2].kinds.includes('gold'));
  assert.ok(plan[3].free && plan[6].free, 'free rounds at 4 and 7');
  assert.ok(!plan[0].free && !plan[1].free && !plan[2].free && !plan[4].free && !plan[5].free && !plan[7].free);
  assert.deepEqual([plan[4].turn || plan[5].turn, plan[4].wind || plan[5].wind, plan[4].turn && plan[4].wind], [true, true, false]);
  assert.deepEqual([plan[7].turn, plan[7].wind, plan[7].double, plan[7].name], [true, true, true, 'Closing time']);
  // The order of rounds 5 and 6 follows the run's seed: both orders happen.
  const orders = await page.evaluate(() => {
    const g = window.__gallery;
    const seen = new Set();
    for (let seed = 1; seed < 40; seed++) {
      g.startRun({ seed });
      seen.add(g.game.plan[5].key);
    }
    return [...seen].sort();
  });
  assert.deepEqual(orders, ['turn', 'wind']);
  await context.close();
});

test('shooting-gallery AC-9: in Turnabouts a hit on a back, or mid-turn, scores nothing and spends the shell; its stick still snaps', async () => {
  const { context, page } = await open();
  await ready(page, 5);
  const s0 = await state(page);
  const back = await place(page, 'tin', { turn: true, turnT: 3.0, face: 'target_colored' });
  assert.equal((await shoot(page, back.x, back.y)).what, 'back');
  const turning = await place(page, 'duck', { turn: true, turnT: 2.3, face: 'duck_yellow', x: 150 });
  assert.equal((await shoot(page, turning.x, turning.y)).what, 'back');
  let s = await state(page);
  assert.deepEqual([s.score, s.shells, s.pips], [s0.score, s0.shells - 2, 0]);
  const back2 = await place(page, 'tin', { turn: true, turnT: 3.0, face: 'target_red1', x: 260 });
  assert.equal((await shoot(page, back2.x, back2.y + back2.w / 2 + 8)).what, 'stick');
  await context.close();
});

test('shooting-gallery AC-10: finishing round 8 is closing time, paying 60 for each shell left', async () => {
  const { context, page } = await open();
  await ready(page, 8);
  await page.evaluate(() => (window.__gallery.game.shells = 4));
  const before = (await state(page)).score;
  await winRound(page);
  const s = await state(page);
  assert.equal(s.mode, 'over');
  assert.equal(s.score - before, 240);
  assert.equal(await page.locator('[data-over-title]').textContent(), 'Closing time!');
  await context.close();
});

test('shooting-gallery AC-11: on touch, a drag aims at 1.5× and its lift never fires; a tap fires; a long hold does not; a second finger fires', async () => {
  const { context, page } = await open({ hasTouch: true });
  await ready(page, 1);
  await page.evaluate(() => (window.__gallery.game.queue.push({ at: 9999, kind: 'duck' }), 0));
  const cdp = await context.newCDPSession(page);
  const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points });
  const k = await page.evaluate(() => window.__gallery.stage().k);
  const c0 = await page.evaluate(() => ({ ...window.__gallery.cross }));
  // Drag 40 px right: the crosshair moves 60 px, and lifting doesn't fire.
  await touch('touchStart', [{ x: 200, y: 760, id: 1 }]);
  for (let i = 1; i <= 8; i++) await touch('touchMove', [{ x: 200 + i * 5, y: 760, id: 1 }]);
  await touch('touchEnd', []);
  const c1 = await page.evaluate(() => ({ ...window.__gallery.cross }));
  assert.ok(Math.abs((c1.x - c0.x) * k - 60) < 1.5, `moved ${(c1.x - c0.x) * k} px`);
  assert.equal((await state(page)).shells, 8, 'a drag never fires');
  // A tap fires.
  await touch('touchStart', [{ x: 120, y: 760, id: 2 }]);
  await touch('touchEnd', []);
  assert.equal((await state(page)).shells, 7, 'a tap fires');
  // A still hold over 250 ms fires nothing.
  await touch('touchStart', [{ x: 120, y: 760, id: 3 }]);
  await page.waitForTimeout(320);
  await touch('touchEnd', []);
  assert.equal((await state(page)).shells, 7, 'a long hold does not fire');
  // A second finger fires at once while the first is down; the first's lift then doesn't.
  await page.evaluate(() => (window.__gallery.game.lastFire = -1));
  await touch('touchStart', [{ x: 120, y: 760, id: 4 }]);
  await touch('touchStart', [{ x: 120, y: 760, id: 4 }, { x: 300, y: 760, id: 5 }]);
  assert.equal((await state(page)).shells, 6, 'the second finger fired');
  await page.evaluate(() => (window.__gallery.game.lastFire = -1));
  await touch('touchEnd', [{ x: 120, y: 760, id: 4 }]);
  await touch('touchEnd', []);
  assert.equal((await state(page)).shells, 6, 'and the first finger did not');
  await context.close();
});

test('shooting-gallery AC-12: a tap is judged where the targets were at touch-down', async () => {
  const { context, page } = await open({ hasTouch: true });
  await ready(page, 3);
  const tin = await place(page, 'tin', { speed: 300, face: 'target_colored', x: 200 });
  await page.evaluate(({ tin }) => {
    const g = window.__gallery;
    g.cross.x = tin.x;
    g.cross.y = tin.y;
    g.step(1 / 60); // the moment of touch-down is in the history
  }, { tin });
  const cdp = await context.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 200, y: 780, id: 1 }] });
  // The booth moves on before the finger lifts: the target is 50 units away by then.
  await page.evaluate(() => {
    for (let i = 0; i < 10; i++) window.__gallery.step(1 / 60);
  });
  const now = await page.evaluate((id) => window.__gallery.targets().find((t) => t.id === id).x, tin.id);
  assert.ok(now - tin.x > 40, 'the target moved away before the lift');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  assert.equal(await page.evaluate((id) => window.__gallery.targets().find((t) => t.id === id).state, tin.id), 'knocked');
  await context.close();
});

test('shooting-gallery AC-13: the mouse aims and clicks to fire; the arrow keys aim and Space fires', async () => {
  const { context, page } = await open();
  await ready(page, 3);
  const tin = await place(page, 'tin', { face: 'target_red1', x: 200 });
  const at = await page.evaluate(({ x, y }) => window.__gallery.toClient(x, y), { x: tin.x + tin.w * 0.38, y: tin.y });
  await page.mouse.move(at.x, at.y);
  const c = await page.evaluate(() => ({ ...window.__gallery.cross }));
  assert.ok(Math.abs(c.x - (tin.x + tin.w * 0.38)) < 1 && Math.abs(c.y - tin.y) < 1, 'the crosshair follows the mouse');
  await page.mouse.down();
  await page.mouse.up();
  assert.equal(await page.evaluate((id) => window.__gallery.targets().find((t) => t.id === id).state, tin.id), 'knocked');
  const x0 = c.x;
  await page.keyboard.down('ArrowLeft');
  await steps(page, 0.3);
  await page.keyboard.up('ArrowLeft');
  const x1 = await page.evaluate(() => window.__gallery.cross.x);
  assert.ok(x1 < x0 - 30, `the left arrow moved the crosshair from ${x0} to ${x1}`);
  const shells = (await state(page)).shells;
  await page.evaluate(() => (window.__gallery.game.lastFire = -1));
  await page.keyboard.press('Space');
  assert.equal((await state(page)).shells, shells - 1, 'Space fires');
  await context.close();
});

const hide = (page) =>
  page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });

test('shooting-gallery AC-14: hiding the page pauses play; the resuming tap never fires and play waits out the count-in', async () => {
  const { context, page } = await open({ hasTouch: true });
  // On the start card no pause card shows.
  await hide(page);
  assert.ok(await page.locator('[data-screen="pause"]').isHidden());
  await page.click('[data-play]');
  // Hidden during the round intro: the intro resumes where it was.
  await page.evaluate(() => (window.__gallery.manual = true));
  await page.evaluate(() => window.__gallery.step(0.5));
  await page.evaluate(() => (window.__gallery.manual = false));
  await hide(page);
  const introT = await page.evaluate(() => window.__gallery.game.modeT);
  assert.ok(await page.locator('[data-screen="pause"]').isVisible());
  await page.waitForTimeout(400);
  assert.equal(await page.evaluate(() => window.__gallery.game.modeT), introT, 'nothing moves while paused');
  const shells = (await state(page)).shells;
  await page.locator('[data-screen="pause"]').tap();
  assert.ok(await page.locator('[data-screen="pause"]').isHidden());
  assert.equal((await state(page)).shells, shells, 'the resuming tap does not fire');
  await page.waitForTimeout(500);
  assert.equal(await page.evaluate(() => window.__gallery.game.modeT), introT, 'frozen through the count-in');
  await page.waitForTimeout(700);
  const t = await page.evaluate(() => window.__gallery.game.modeT);
  assert.ok(t > introT && t < introT + 0.5, `the intro carries on from ${introT}: ${t}`);
  await context.close();
});

test('shooting-gallery AC-15: the assist grows only the body, starts at 0.3, rises after misses and a lost early run, falls with hits, and is off in round 8', async () => {
  const { context, page } = await open();
  assert.equal(await page.evaluate(() => window.__gallery.memory.assist), 0.3, 'a new player');
  await page.click('[data-play]');
  assert.equal((await state(page)).assist, 0.3);
  // The body grows by up to 15%; the bullseye doesn't.
  await ready(page, 3, { assist: 1 });
  const tin = await place(page, 'tin', { face: 'target_colored', x: 200 });
  const R = (tin.w / 2) * 0.97;
  const fx = (f) => shoot(page, tin.x + R * f, tin.y);
  assert.equal((await page.evaluate(({ x, y }) => window.__gallery.resolve(x, y, window.__gallery.snapshot()).what, { x: tin.x + R * 1.1, y: tin.y })), 'body');
  const bullR = (tin.w / 2) * 0.366;
  assert.equal((await page.evaluate(({ x, y }) => window.__gallery.resolve(x, y, window.__gallery.snapshot()).what, { x: tin.x + bullR * 1.08, y: tin.y })), 'body');
  await page.evaluate(() => (window.__gallery.game.assist = 0));
  assert.equal((await page.evaluate(({ x, y }) => window.__gallery.resolve(x, y, window.__gallery.snapshot()).what, { x: tin.x + R * 1.1, y: tin.y })), 'miss');
  // Two misses in a row raise it by 0.2; a hit lowers it by 0.05.
  const sky = (await page.evaluate(() => window.__gallery.L.T)) + 20;
  await shoot(page, 200, sky);
  await shoot(page, 200, sky);
  assert.ok(Math.abs((await state(page)).assist - 0.2) < 1e-9);
  await fx(0.6);
  assert.ok(Math.abs((await state(page)).assist - 0.15) < 1e-9);
  // Free-round shots don't count.
  await ready(page, 4, { assist: 0.5 });
  await shoot(page, 200, sky);
  await shoot(page, 200, sky);
  assert.equal((await state(page)).assist, 0.5);
  // Off in round 8.
  await ready(page, 8, { assist: 1 });
  assert.equal(await page.evaluate(() => window.__gallery.assistNow()), 0);
  // A run lost in round 1 or 2 raises it by 0.3.
  await ready(page, 2, { assist: 0.1 });
  await page.evaluate(() => (window.__gallery.game.shells = 1));
  await shoot(page, 200, sky);
  assert.ok(Math.abs((await state(page)).assist - 0.4) < 1e-9);
  await context.close();
});

test('shooting-gallery AC-16: the best score is kept across reloads', async () => {
  const { context, page } = await open();
  await ready(page, 1);
  await page.evaluate(() => {
    const g = window.__gallery.game;
    g.score = 1234;
    g.shells = 1;
  });
  await shoot(page, 200, (await page.evaluate(() => window.__gallery.L.T)) + 20);
  await steps(page, 1.6);
  await page.reload();
  await page.waitForFunction(() => window.__gallery);
  assert.equal(await page.evaluate(() => window.__gallery.memory.best), 1234);
  assert.match(await page.locator('[data-best]').textContent(), /1,234/);
  await context.close();
});

test('shooting-gallery AC-17: each state shows only its own card and HUD', async () => {
  const { context, page } = await open();
  const ui = () => page.evaluate(() => window.__gallery.ui());
  assert.deepEqual(await ui(), { start: true, over: false, pause: false, banner: null, hud: false });
  await page.click('[data-play]');
  await page.evaluate(() => (window.__gallery.manual = true));
  let u = await ui();
  assert.deepEqual([u.start, u.over, u.pause, u.banner, u.hud], [false, false, false, 'Round 1', true], 'the round intro');
  await steps(page, 1.4);
  u = await ui();
  assert.deepEqual([u.start, u.over, u.pause, u.banner, u.hud], [false, false, false, null, true], 'playing');
  await page.evaluate(() => window.__gallery.pause());
  u = await ui();
  assert.deepEqual([u.start, u.over, u.pause, u.hud], [false, false, true, true], 'paused');
  await page.evaluate(() => window.__gallery.resume());
  assert.equal((await ui()).banner, 'Ready…', 'the count-in');
  await page.evaluate(() => (window.__gallery.game.resumeT = 0));
  await page.evaluate(() => (window.__gallery.game.pips = 6));
  await page.evaluate(() => (window.__gallery.game.queue.push({ at: 9999, kind: 'duck' }), 0));
  await steps(page, 0.05);
  assert.equal((await ui()).banner, 'Bonus!');
  await page.evaluate(() => {
    const g = window.__gallery;
    g.clear();
  });
  await steps(page, 0.05);
  assert.equal((await ui()).banner, 'Round cleared');
  await page.evaluate(() => {
    const g = window.__gallery.game;
    g.shells = 0;
  });
  await steps(page, 2);
  await page.evaluate(() => {
    const g = window.__gallery.game;
    g.shells = 0;
  });
  await steps(page, 3.5);
  u = await ui();
  assert.deepEqual([u.start, u.over, u.pause, u.hud], [false, true, false, false], 'over');
  await context.close();
});

test('shooting-gallery AC-18: a shot, a hit, a bullseye, a stick, a round start, the quota and a lost round each have their sound', async () => {
  const { context, page } = await open();
  await page.click('[data-play]');
  assert.ok(await page.evaluate(() => window.__gallery.heard.includes('round')));
  await ready(page, 3);
  const heard = () => page.evaluate(() => window.__gallery.heard.slice());
  const clearHeard = () => page.evaluate(() => (window.__gallery.heard.length = 0));
  await clearHeard();
  const tin = await place(page, 'tin', { face: 'target_red1', x: 200 });
  await shoot(page, tin.x + tin.w * 0.38, tin.y);
  assert.deepEqual(await heard(), ['shot', 'tin']);
  await clearHeard();
  const tin2 = await place(page, 'tin', { face: 'target_colored', x: 200 });
  await shoot(page, tin2.x, tin2.y);
  assert.deepEqual(await heard(), ['shot', 'tin', 'ding']);
  await clearHeard();
  const tin3 = await place(page, 'tin', { face: 'target_colored', x: 200 });
  await shoot(page, tin3.x, tin3.y + tin3.w / 2 + 8);
  assert.deepEqual(await heard(), ['shot', 'snap']);
  await clearHeard();
  await page.evaluate(() => (window.__gallery.game.pips = 11));
  const tin4 = await place(page, 'tin', { face: 'target_red1', x: 200 });
  await shoot(page, tin4.x + tin4.w * 0.38, tin4.y);
  assert.ok((await heard()).includes('quota'));
  await ready(page, 1);
  await page.evaluate(() => (window.__gallery.game.shells = 1));
  await clearHeard();
  await shoot(page, 200, (await page.evaluate(() => window.__gallery.L.T)) + 20);
  assert.deepEqual(await heard(), ['shot', 'miss', 'lost']);
  // The sounds are really played through the audio context, not only listed.
  assert.ok(await page.evaluate(() => window.__played.length > 0));
  await context.close();
});

test('shooting-gallery AC-19: the gallery plays offline once it has been played', async () => {
  const context = await browser.newContext();
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

test('shooting-gallery AC-21: at 390×844 and 360×640 the booth, tray and pips fit without scrolling, and small targets are at least 44 px', async () => {
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 360, height: 640 },
  ]) {
    const { context, page } = await open({ viewport });
    await page.click('[data-play]');
    const m = await page.evaluate(() => {
      const g = window.__gallery;
      const { k } = g.stage();
      const t = g.makeTarget('tin', { x: 200 });
      const [w] = g.dims(t);
      return {
        tin: w * k,
        trayBottom: (g.L.C + 70 + 16) * k,
        pips: (g.L.C + 46) * k,
        boothTop: g.L.T * k,
        scrollW: document.documentElement.scrollWidth,
        scrollH: document.documentElement.scrollHeight,
      };
    });
    assert.ok(m.tin >= 44, `small targets ${m.tin} px at ${viewport.width}`);
    assert.ok(m.trayBottom <= viewport.height, `the tray fits at ${viewport.width}×${viewport.height}`);
    assert.ok(m.pips < m.trayBottom && m.boothTop > 0);
    assert.ok(m.scrollW <= viewport.width && m.scrollH <= viewport.height, 'no scrolling');
    await context.close();
  }
});

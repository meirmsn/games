// End-to-end tests for Trundle. Run: scripts/check-slow.sh.
// The game exposes window.__trundle: with manual set, the page's frames only draw, and frame(ms)
// advances the game exactly as one display frame of that length would.
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

async function open(hash = '#1-1', opts = {}, init = null) {
  const { viewport = { width: 390, height: 844 }, ...rest } = opts;
  const context = await browser.newContext({ viewport, ...rest });
  if (init) await context.addInitScript(init);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(BASE + 'trundle/' + hash);
  await page.waitForFunction(() => window.__trundle);
  return { context, page, errors };
}

// Take the clock: from here the page's frames only draw.
const manual = (page) => page.evaluate(() => (window.__trundle.manual = true));

// Advance frames of `ms` until the attempt is over (or n frames).
async function runOut(page, ms = 1000 / 60, n = 6000) {
  return page.evaluate(
    ([ms, n]) => {
      const T = window.__trundle;
      let i = 0;
      while (T.G.mode === 'run' && i++ < n) T.frame(ms);
      return T.G.mode;
    },
    [ms, n]
  );
}

// In the page: play room i's recorded solution (its layout, then its edits at their steps) through
// the page's own frame loop, frames of ms(f) milliseconds. Returns what happened.
const PLAY = `(i, ms, trace) => {
  const T = window.__trundle;
  T.openRoom(i);
  T.G.fails[i] = 0;
  const sol = T.ROOMS[i].solution;
  T.setLayout(sol.layout);
  const att = T.G.att;
  let li = 0;
  const step = att.step;
  const poses = [];
  let vmax = 0;
  att.step = () => {
    while (li < sol.log.length && sol.log[li].s === att.steps) {
      const { s, ...e } = sol.log[li++];
      att.edit(e);
    }
    step();
    for (const b of att.balls) {
      if (b.state !== 'live') continue;
      vmax = Math.max(vmax, b.body.speed * 60 / 50);
      if (trace) poses.push(b.n + ':' + b.body.position.x.toFixed(6) + ',' + b.body.position.y.toFixed(6));
    }
  };
  let f = 0;
  while (T.G.mode === 'run' && f < 20000) T.frame(ms(f++));
  return { mode: T.G.mode, result: att.result, stars: att.stars.size, inCount: att.inCount, quota: att.quota, exitR: att.exitR, poses: poses.join(';'), vmax, att };
}`;

async function solve(page, i) {
  return page.evaluate(
    ([i, PLAY]) => {
      const r = eval(PLAY)(i, () => 1000 / 60, false);
      return { mode: r.mode, stars: r.stars, inCount: r.inCount };
    },
    [i, PLAY]
  );
}

test('trundle AC-1: the landing page shows 8 tiles, Trundle playable and linking to its game', async () => {
  const context = await browser.newContext({ viewport: { width: 1024, height: 700 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(BASE);
  assert.equal(await page.locator('.tiles > li').count(), 8);
  const tile = page.locator('.tile', { has: page.locator('h2', { hasText: 'Trundle' }) });
  assert.equal(await tile.evaluate((el) => el.tagName), 'A');
  assert.equal(await tile.getAttribute('href'), 'trundle/');
  assert.equal(await tile.evaluate((el) => el.classList.contains('is-soon')), false);
  await tile.click();
  await page.waitForFunction(() => window.__trundle);
  assert.deepEqual(errors, []);
  await context.close();
});

test('trundle AC-2: a room opens running: Trundle drops a ball within 1.5 s and another every 3 s, before any touch', async () => {
  const { context, page, errors } = await open('#1-2');
  await manual(page);
  const r = await page.evaluate(() => {
    const T = window.__trundle;
    T.openRoom(1); // room 2: Trundle patrols
    const att = T.G.att;
    const at = (s) => {
      while (att.t < s) T.frame(1000 / 60);
      return { dropped: att.dropped, x: att.trundle.x };
    };
    return { mode: T.G.mode, t0: at(0.01), t15: at(1.5), t40: at(4.0), t46: at(4.6), t70: at(7.1), parts: T.G.layout.length };
  });
  assert.equal(r.mode, 'run');
  assert.equal(r.parts, 0);
  assert.equal(r.t0.dropped, 0);
  assert.equal(r.t15.dropped, 1, 'the first ball within 1.5 s');
  assert.equal(r.t40.dropped, 1);
  assert.equal(r.t46.dropped, 2, 'the next 3 s later');
  assert.equal(r.t70.dropped, 3);
  assert.notEqual(r.t15.x, r.t40.x, 'Trundle drives');
  assert.deepEqual(errors, []);
  await context.close();
});

test('trundle AC-3: parts drag from the tray, snap, move relatively, turn, go back and refuse overlaps, while balls fall', async () => {
  const { context, page, errors } = await open('#1-1');
  await manual(page);
  const tray = await page.locator('.part').first().boundingBox();
  const at = (x, y) => page.evaluate(([x, y]) => window.__trundle.toScreen(x, y), [x, y]);
  const layout = () => page.evaluate(() => window.__trundle.G.layout.map(({ x, y, a }) => ({ x, y, a })));
  const k = (await page.evaluate(() => window.__trundle.view())).k;
  assert.equal(await page.evaluate(() => window.__trundle.G.mode), 'run', 'balls are falling');

  // from the tray (a mouse carries the part at the pointer)
  let t = await at(4.3, 6.1);
  await page.mouse.move(tray.x + 28, tray.y + 28);
  await page.mouse.down();
  await page.mouse.move(t.x, t.y, { steps: 8 });
  await page.mouse.up();
  let l = await layout();
  assert.equal(l.length, 1);
  assert.deepEqual(l[0], { x: 4.25, y: 6, a: 0 }, 'snapped to 0.25 units');

  // a placed part moves by the pointer's movement, wherever it was grabbed
  const grab = await at(4.9, 6.1);
  await page.mouse.move(grab.x, grab.y);
  await page.mouse.down();
  await page.mouse.move(grab.x - 1 * k, grab.y + 0.5 * k, { steps: 6 });
  await page.mouse.up();
  l = await layout();
  assert.deepEqual([l[0].x, l[0].y], [3.25, 6.5]);

  // turn buttons
  await page.click('[data-turn="15"]');
  assert.equal((await layout())[0].a, 15);
  await page.click('[data-turn="-15"]');
  await page.click('[data-turn="-15"]');
  assert.equal((await layout())[0].a, 345);

  // every edit reached the running attempt
  const log = await page.evaluate(() => {
    window.__trundle.frame(1000 / 60);
    return window.__trundle.G.att.log.map((e) => e.op);
  });
  assert.ok(log.filter((o) => o === 'set').length >= 4, `edits logged: ${log}`);

  // a drop onto a fixed block is refused: it goes back where it was
  const from = await at(3.25, 6.5);
  const onto = await at(8, 9.3);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(onto.x, onto.y, { steps: 6 });
  await page.mouse.up();
  l = await layout();
  assert.deepEqual([l[0].x, l[0].y], [3.25, 6.5], 'refused, back where it was');

  // a turn into a fixed block is refused
  const spot = await page.evaluate(() => {
    const T = window.__trundle;
    for (let y = 4; y < 12; y += 0.25)
      for (let x = 1; x < 9; x += 0.25) {
        const p = { id: 1, type: 'plank', x, y, a: 0 };
        if (!T.SIM.overlaps(T.G.room, p) && T.SIM.overlaps(T.G.room, { ...p, a: 90 })) return p;
      }
  });
  await page.evaluate((p) => {
    const T = window.__trundle;
    T.setLayout([p]);
    T.G.sel = T.G.layout[0];
    T.turn(90);
  }, spot);
  assert.equal((await layout())[0].a, 0, 'turning into a fixed part is refused');

  // a drag stays inside the board, and dropped on the bottom bar, the part goes back to the tray
  await page.evaluate(() => window.__trundle.setLayout([{ id: 1, type: 'plank', x: 4, y: 6, a: 0 }]));
  const p0 = await at(4, 6);
  await page.mouse.move(p0.x, p0.y);
  await page.mouse.down();
  await page.mouse.move(p0.x + 30 * k, p0.y, { steps: 6 });
  const mid = await page.evaluate(() => window.__trundle.G.drag.part.x);
  assert.ok(mid <= 9.75, 'clamped inside the board');
  const bar = await page.locator('[data-bar]').boundingBox();
  await page.mouse.move(bar.x + bar.width / 2, bar.y + bar.height / 2, { steps: 4 });
  await page.mouse.up();
  assert.equal((await layout()).length, 0);
  assert.equal(await page.locator('.part .count').first().textContent(), '1');
  assert.deepEqual(errors, []);
  await context.close();
});

test('trundle AC-3: a second finger moves nothing, and the first finger carries on', async () => {
  const { context, page } = await open('#1-1', { hasTouch: true });
  await manual(page);
  await page.evaluate(() => window.__trundle.setLayout([{ id: 1, type: 'plank', x: 4, y: 6, a: 0 }]));
  const r = await page.evaluate(() => {
    const T = window.__trundle;
    const c = document.getElementById('board');
    const { k } = T.view();
    const s = T.toScreen(4, 6);
    const ev = (type, id, x, y, target = c) =>
      target.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', clientX: x, clientY: y, bubbles: true, isPrimary: id === 1 }));
    ev('pointerdown', 1, s.x, s.y);
    ev('pointermove', 1, s.x, s.y + k, window);
    ev('pointerdown', 2, s.x + 3 * k, s.y + 3 * k);
    ev('pointermove', 2, s.x + 6 * k, s.y + 6 * k, window);
    const during = T.G.drag.part.y;
    ev('pointermove', 1, s.x, s.y + 2 * k, window);
    ev('pointerup', 2, s.x + 6 * k, s.y + 6 * k, window);
    ev('pointerup', 1, s.x, s.y + 2 * k, window);
    return { during, after: T.G.layout[0].y, n: T.G.layout.length };
  });
  assert.equal(r.during, 7, 'the second finger did not move it');
  assert.equal(r.after, 8, "the first finger's drag carried on");
  assert.equal(r.n, 1);
  await context.close();
});

test('trundle AC-4: a held part lets balls through; a part let go on a ball stays a ghost until it passes; no ball beats its cap', async () => {
  const { context, page } = await open('#1-1');
  await manual(page);
  const r = await page.evaluate(() => {
    const T = window.__trundle;
    T.setLayout([]);
    const att = T.G.att;
    while (!att.balls.length) T.frame(1000 / 60);
    for (let i = 0; i < 12; i++) T.frame(1000 / 60);
    const b = att.balls[0].body;
    const at = { x: b.position.x / 50, y: b.position.y / 50 };
    // let go right on the falling ball
    att.edit({ op: 'set', id: 7, type: 'plank', x: at.x, y: at.y + 0.2, a: 0 });
    T.frame(1000 / 120);
    const p = att.parts.get(7);
    const ghostOnBall = { ghost: p.ghost, solid: !!p.body };
    let n = 0;
    while (p.ghost && n++ < 600) T.frame(1000 / 60);
    const later = { ghost: p.ghost, solid: !!p.body, ballBelow: b.position.y / 50 > at.y + 0.5 };
    // picked up: held, a ghost the balls pass through
    att.edit({ op: 'lift', id: 7 });
    T.frame(1000 / 120);
    const held = { ghost: p.ghost, held: p.held, solid: !!p.body };
    return { ghostOnBall, later, held };
  });
  assert.deepEqual(r.ghostOnBall, { ghost: true, solid: false }, 'a ghost while it overlaps the ball');
  assert.equal(r.later.ghost, false, 'solid once the ball has passed');
  assert.equal(r.later.solid, true);
  assert.ok(r.later.ballBelow, 'the ball fell on through, not launched');
  assert.deepEqual(r.held, { ghost: true, held: true, solid: false });
  const speeds = await page.evaluate((PLAY) => [0, 3, 7].map((i) => eval(PLAY)(i, () => 1000 / 60, false).vmax), PLAY);
  for (const v of speeds) assert.ok(v <= 18.01, `top speed ${v}`);
  await context.close();
});

test('trundle AC-5: tapping Trundle turns him around, and the next ball drops where he now is', async () => {
  const { context, page } = await open('#1-1');
  await manual(page);
  await page.evaluate(() => {
    const T = window.__trundle;
    T.openRoom(1);
    while (T.G.att.t < 2) T.frame(1000 / 60);
  });
  const before = await page.evaluate(() => ({ dir: window.__trundle.G.att.trundle.dir, x: window.__trundle.G.att.trundle.x }));
  const s = await page.evaluate(([x, y]) => window.__trundle.toScreen(x, y), [before.x, 1.0]);
  await page.mouse.click(s.x, s.y);
  const r = await page.evaluate(() => {
    const T = window.__trundle;
    const att = T.G.att;
    T.frame(1000 / 120);
    const dir = att.trundle.dir;
    const dropped = att.dropped;
    let drop = null;
    const step = att.step;
    att.step = () => {
      step();
      const d = att.events.find((e) => e.type === 'drop');
      if (d && !drop) drop = { x: d.x, tx: att.trundle.x };
    };
    while (att.dropped === dropped) T.frame(1000 / 60);
    // the same attempt without the turn
    const plain = T.replay(T.ROOMS[1], [], []);
    const plainX = plain.balls[dropped] ? null : null;
    void plainX;
    const noTurn = T.SIM.createAttempt(T.ROOMS[1], []);
    while (noTurn.dropped <= dropped) noTurn.step();
    return { dir, log: att.log.filter((e) => e.op === 'turn').length, drop, noTurnX: noTurn.balls[dropped].body.position.x / 50 };
  });
  assert.equal(r.dir, -before.dir, 'he turned around');
  assert.equal(r.log, 1, 'the turn is logged');
  assert.ok(Math.abs(r.drop.x - r.drop.tx) < 0.05, 'the ball drops where he is');
  assert.ok(Math.abs(r.drop.x - r.noTurnX) > 1, `it drops somewhere else than without the turn (${r.drop.x} vs ${r.noTurnX})`);
  await context.close();
});

test('trundle AC-6: every recorded solution reaches its quota with all three stars, step for step the same at 60 Hz, 120 Hz and uneven frames; with nothing placed every room fails', async () => {
  const { context, page } = await open('#1-1');
  await manual(page);
  const r = await page.evaluate((PLAY) => {
    const T = window.__trundle;
    let seed = 5;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const jitter = Array.from({ length: 20000 }, () => 7 + rnd() * 33);
    const plans = { hz60: () => 1000 / 60, hz120: () => 1000 / 120, uneven: (f) => jitter[f] };
    const out = [];
    for (let i = 0; i < T.ROOMS.length; i++) {
      const traces = {};
      for (const [name, ms] of Object.entries(plans)) {
        const x = eval(PLAY)(i, ms, true);
        traces[name] = { poses: x.poses, result: x.result, stars: x.stars, inCount: x.inCount, quota: x.quota, exitR: x.exitR };
      }
      out.push({ i, traces, none: T.replay(T.ROOMS[i], [], []).result });
    }
    return out;
  }, PLAY);
  for (const { i, traces, none } of r) {
    const t = traces.hz60;
    assert.equal(t.result, 'won', `room ${i + 1} solution wins`);
    assert.ok(t.inCount >= t.quota, `room ${i + 1}: ${t.inCount} in, quota ${t.quota}`);
    assert.equal(t.stars, 3, `room ${i + 1} solution takes 3 stars`);
    assert.equal(t.exitR, 0.5, 'no assist');
    assert.ok(t.poses.length > 1000);
    assert.equal(traces.hz120.poses, t.poses, `room ${i + 1}: 120 Hz is step for step the same`);
    assert.equal(traces.uneven.poses, t.poses, `room ${i + 1}: uneven frames are step for step the same`);
    assert.equal(none, 'failed', `room ${i + 1}: nothing placed fails`);
  }
  await context.close();
});

test('trundle AC-7: the counter shows each ball; reaching the quota completes the room; out of reach, Try again, parts kept', async () => {
  const { context, page, errors } = await open('#1-1');
  await manual(page);
  await page.evaluate(() => window.__trundle.setLayout([{ id: 1, type: 'plank', x: 6, y: 13, a: 0 }])); // catches nothing
  assert.equal(await page.locator('[data-balls] .b').count(), 6, 'room 1 drops 6 balls');
  assert.equal(await runOut(page), 'failed');
  const failed = await page.evaluate(() => ({
    lost: document.querySelectorAll('[data-balls] .b.lost').length,
    card: document.querySelector('[data-card="failed"]').checkVisibility(),
    text: document.querySelector('[data-failed-count]').textContent,
    layout: window.__trundle.G.layout.length,
    robot: window.__trundle.G.robot.state,
    dropped: window.__trundle.G.att.dropped,
  }));
  assert.ok(failed.lost >= 4, 'lost balls are marked');
  assert.ok(failed.dropped < 6, 'it ended as soon as the quota was out of reach');
  assert.equal(failed.card, true);
  assert.equal(failed.text, '0 of 3 in');
  assert.equal(failed.layout, 1, 'the parts stay');
  assert.equal(failed.robot, 'wince');
  await page.click('[data-retry]');
  assert.equal(await page.evaluate(() => window.__trundle.G.mode), 'run');
  const won = await solve(page, 0);
  assert.equal(won.mode, 'done');
  const s = await page.evaluate(() => ({ robot: window.__trundle.G.robot.state, best: window.__trundle.loadRoom(0).best, ins: document.querySelectorAll('[data-balls] .b.in').length }));
  assert.equal(s.robot, 'cheer');
  assert.equal(s.best.stars, 3);
  assert.equal(s.ins, won.inCount);
  await page.waitForSelector('[data-card="done"]:not([hidden])');
  assert.equal(await page.locator('[data-done-stars] img.got').count(), 3);
  assert.equal(await page.locator('[data-room-stars] img[src$="img/star.png"]').count(), 3);
  // the rooms list covers the card rather than stacking on it, and closing it brings the card back
  await page.click('[data-rooms]');
  assert.equal(await page.locator('[data-card="done"]').isVisible(), false);
  await page.click('[data-close-rooms]');
  assert.equal(await page.locator('[data-card="done"]').isVisible(), true);
  assert.deepEqual(errors, []);
  await context.close();
});

test('trundle states: each state shows only its own bar, counter and cards, as in the state table', async () => {
  const { context, page, errors } = await open('#1-1');
  await manual(page);
  const look = () =>
    page.evaluate(() => ({
      mode: window.__trundle.G.mode,
      bar: document.querySelector('[data-bar]').checkVisibility(),
      balls: document.querySelector('[data-balls]').checkVisibility(),
      done: document.querySelector('[data-card="done"]').checkVisibility(),
      failed: document.querySelector('[data-card="failed"]').checkVisibility(),
      floor: document.querySelector('[data-card="floor"]').checkVisibility(),
      rooms: document.querySelector('[data-card="rooms"]').checkVisibility(),
      // the list's second shadow is the wash that dims the board behind it
      dim: getComputedStyle(document.querySelector('[data-card="rooms"]')).boxShadow.split('rgba').length > 2,
      floorRun: document.querySelector('[data-floor-run]').checkVisibility(),
    }));
  const only = (v, want) => {
    for (const [key, val] of Object.entries(want)) assert.equal(v[key], val, `${v.mode}: ${key}`);
  };
  only(await look(), { mode: 'run', bar: true, balls: true, done: false, failed: false, floor: false, rooms: false });
  // rooms list, over a running attempt: it waits, the bar hides, the board dims
  await page.click('[data-rooms]');
  only(await look(), { bar: false, done: false, failed: false, floor: false, rooms: true, dim: true, floorRun: false });
  assert.equal(await page.evaluate(() => window.__trundle.G.paused), true, 'the attempt waits');
  await page.click('[data-close-rooms]');
  await page.click('[data-paused]');
  only(await look(), { mode: 'run', bar: true, rooms: false });
  // failed
  await runOut(page);
  only(await look(), { mode: 'failed', bar: true, balls: true, done: false, failed: true, floor: false });
  // room done
  await solve(page, 0);
  await page.waitForSelector('[data-card="done"]:not([hidden])');
  only(await look(), { mode: 'done', bar: false, balls: true, done: true, failed: false, floor: false, rooms: false });
  // floor run: no counter, no card until its end, then the floor card
  for (const i of [1, 2, 3, 4, 5, 6, 7]) await solve(page, i);
  await page.waitForFunction(() => window.__trundle.G.mode === 'floor', null, { timeout: 4000 });
  only(await look(), { mode: 'floor', bar: false, balls: false, done: false, failed: false, floor: false, rooms: false });
  await page.evaluate(() => {
    const T = window.__trundle;
    let n = 0;
    while (!T.G.floor.end && n++ < 20000) T.frame(1000 / 60);
  });
  only(await look(), { mode: 'floor', bar: false, done: false, floor: true, rooms: false });
  await page.click('[data-floor-rooms]');
  only(await look(), { rooms: true, dim: true, floorRun: true });
  assert.deepEqual(errors, []);
  await context.close();
});

test('trundle AC-8: each room brings its new thing: the patrol, the wedge, the flap, the crate, the key and two exits', async () => {
  const { context, page } = await open('#1-1');
  await manual(page);
  const r = await page.evaluate((PLAY) => {
    const T = window.__trundle;
    const watch = (i, fn) => {
      const x = eval(PLAY)(i, () => 1000 / 60, false);
      return { result: x.result, v: fn(x.att) };
    };
    T.openRoom(3);
    const wedgeInTray = !!document.querySelector('.part[data-part="wedge"]');
    const xs = [];
    T.openRoom(1);
    for (let f = 0; f < 240; f++) {
      T.frame(1000 / 60);
      xs.push(T.G.att.trundle.x);
    }
    // the flap's widest swing over the solution
    let flapMax = 0;
    T.openRoom(4);
    const sol5 = T.ROOMS[4].solution;
    const a5 = T.SIM.createAttempt(T.ROOMS[4], sol5.layout);
    let li = 0;
    while (!a5.result) {
      while (li < sol5.log.length && sol5.log[li].s === a5.steps) {
        const { s, ...e } = sol5.log[li++];
        a5.edit(e);
      }
      a5.step();
      flapMax = Math.max(flapMax, Math.abs(a5.flap.angle));
    }
    const room6 = T.ROOMS[5];
    const crate = watch(5, (att) => Math.hypot(att.crate.position.x / 50 - room6.exits[0].x, att.crate.position.y / 50 - room6.exits[0].y));
    // the key: touched before the first ball goes in
    const sol7 = T.ROOMS[6].solution;
    const a7 = T.SIM.createAttempt(T.ROOMS[6], sol7.layout);
    let keyAt = -1;
    let exitAt = -1;
    li = 0;
    while (!a7.result) {
      while (li < sol7.log.length && sol7.log[li].s === a7.steps) {
        const { s, ...e } = sol7.log[li++];
        a7.edit(e);
      }
      a7.step();
      for (const e of a7.events) {
        if (e.type === 'key' && keyAt < 0) keyAt = a7.steps;
        if (e.type === 'exit' && exitAt < 0) exitAt = a7.steps;
      }
    }
    // without the key the exit stays shut: room 1's winning layout, with a key it never touches
    const r1 = T.ROOMS[0];
    const locked = T.replay({ ...r1, key: { x: 9.5, y: 0.5 } }, r1.solution.layout, r1.solution.log);
    // room 8: two exits; balls dropped straight onto each count
    const r8 = T.ROOMS[7];
    const both = r8.exits.map((e) => {
      const room = { ...r8, girder: { x1: e.x, x2: e.x, y: r8.girder.y }, trundle: { x: e.x, dir: 1, speed: 0 }, fixed: [], flap: null, stars: [] };
      const a = T.SIM.createAttempt(room, []);
      while (!a.result && a.dropped < 2) a.step();
      while (!a.result && a.balls.some((b) => b.state === 'live')) a.step();
      return a.inCount;
    });
    return { wedgeInTray, moved: Math.max(...xs) - Math.min(...xs), flapMax, crate, keyAt, exitAt, locked: locked.result, lockedIn: locked.inCount, both };
  }, PLAY);
  assert.ok(r.moved > 2, `room 2's Trundle patrols (${r.moved} units)`);
  assert.ok(r.wedgeInTray, 'room 4 has a wedge in its tray');
  assert.ok(r.flapMax > 0.5, `the flap swings when hit (${r.flapMax} rad)`);
  assert.equal(r.crate.result, 'won');
  assert.ok(r.crate.v > 0.8, 'the crate was knocked off the exit');
  assert.ok(r.keyAt > 0 && r.exitAt > r.keyAt, 'the key is touched before the exit takes a ball');
  assert.equal(r.locked, 'failed', 'a locked exit lets the balls roll past');
  assert.equal(r.lockedIn, 0);
  assert.deepEqual(r.both.map((n) => n > 0), [true, true], 'both exits count');
  await context.close();
});

test('trundle AC-9: solving room 8 plays the floor run, each room replayed in order, faster than life; the rooms list plays it again after a reload', async () => {
  const { context, page, errors } = await open('#1-1');
  await manual(page);
  for (const i of [0, 1, 2, 3, 4, 5, 6]) assert.equal((await solve(page, i)).mode, 'done');
  await page.waitForTimeout(300);
  await solve(page, 7);
  await page.waitForFunction(() => window.__trundle.G.mode === 'floor', null, { timeout: 4000 });
  const r = await page.evaluate(() => {
    const T = window.__trundle;
    const cams = [];
    const seen = [];
    let n = 0;
    let first = null;
    while (!T.G.floor.end && n++ < 20000) {
      T.frame(1000 / 60);
      const F = T.G.floor;
      if (F.phase === 'play' && seen.at(-1) !== F.si) seen.push(F.si);
      if (F.phase === 'play' && F.si === 0 && F.att && first === null && F.att.steps > 0) first = { steps: F.att.steps, frames: n };
      if (n % 60 === 0) cams.push(F.camY);
    }
    return { end: T.G.floor.end, seen, cams, first, frames: n };
  });
  assert.equal(r.end, true);
  assert.deepEqual(r.seen, [0, 1, 2, 3, 4, 5, 6, 7], 'every room, in order');
  assert.ok(r.cams.at(-1) > r.cams[0] + 100, 'the camera moves down the rooms');
  // eight attempts of about 30 s each, three times faster than life, take well under 2 minutes
  assert.ok(r.frames < 120 * 60, `the floor run took ${r.frames} frames`);
  await page.waitForSelector('[data-card="floor"]:not([hidden])');
  assert.equal(await page.locator('[data-floor-stars]').textContent(), '24');
  await page.reload();
  await page.waitForFunction(() => window.__trundle);
  await page.click('[data-rooms]');
  await page.click('[data-floor-run]');
  assert.equal(await page.evaluate(() => window.__trundle.G.mode), 'floor');
  assert.deepEqual(errors, []);
  await context.close();
});

test('trundle AC-10: rooms unlock one by one; progress is kept; fewer stars keep the best; the hash opens a room reached', async () => {
  const { context, page, errors } = await open('#1-1');
  await manual(page);
  await page.click('[data-rooms]');
  assert.equal(await page.locator('.room-grid button').count(), 8);
  assert.equal(await page.locator('.room-grid button:disabled').count(), 7, 'only room 1 is open on a fresh browser');
  await page.click('[data-close-rooms]');
  assert.equal((await solve(page, 0)).mode, 'done');
  await page.click('[data-rooms]');
  assert.equal(await page.locator('.room-grid button:disabled').count(), 6, 'solving room 1 opens room 2');
  await page.click('.room-grid button:nth-child(2)');
  assert.equal(await page.evaluate(() => window.__trundle.G.ri), 1);
  // a win with fewer stars keeps the best
  const worse = await page.evaluate(() => {
    const T = window.__trundle;
    const sol = T.ROOMS[0].solution;
    // find a winning layout near the solution that takes fewer than 3 stars
    for (let dy = -1; dy <= 2; dy += 0.25)
      for (let dx = -1; dx <= 1; dx += 0.25) {
        const l = sol.layout.map((p) => ({ ...p, x: p.x + dx, y: p.y + dy }));
        const a = T.replay(T.ROOMS[0], l, []);
        if (a.result === 'won' && a.stars.size < 3) {
          T.openRoom(0);
          T.setLayout(l);
          let n = 0;
          while (T.G.mode === 'run' && n++ < 6000) T.frame(1000 / 60);
          return { stars: T.G.lastStars, best: T.loadRoom(0).best.stars, layout: l };
        }
      }
  });
  assert.ok(worse, 'found a weaker win');
  assert.ok(worse.stars < 3);
  assert.equal(worse.best, 3);
  // kept after a reload, with the last layout
  await page.goto(BASE + 'trundle/#1-1');
  await page.reload();
  await page.waitForFunction(() => window.__trundle);
  const kept = await page.evaluate(() => ({ best: window.__trundle.loadRoom(0).best.stars, layout: window.__trundle.G.layout }));
  assert.equal(kept.best, 3);
  assert.deepEqual(kept.layout, worse.layout);
  // room 2 is the furthest reached: a link to a locked room, a bad one or none opens it
  for (const [h, ri] of [['#1-1', 0], ['#1-2', 1], ['#1-4', 1], ['#1-9', 1], ['#x', 1], ['', 1]]) {
    await page.goto(BASE + 'trundle/' + h);
    await page.reload();
    await page.waitForFunction(() => window.__trundle);
    assert.equal(await page.evaluate(() => window.__trundle.G.ri), ri, h);
  }
  assert.deepEqual(errors, []);
  await context.close();
});

test('trundle AC-10: with storage blocked or a room unreadable the game still plays', async () => {
  const blocked = await open('#1-1', {}, () => {
    const no = () => {
      throw new Error('blocked');
    };
    Object.defineProperty(window, 'localStorage', { get: no });
  });
  await manual(blocked.page);
  assert.equal((await solve(blocked.page, 0)).mode, 'done');
  assert.equal(await blocked.page.evaluate(() => window.__trundle.loadRoom(0).best.stars), 3, 'kept until the page reloads');
  assert.deepEqual(blocked.errors, []);
  await blocked.context.close();

  const { context, page, errors } = await open('#1-1', {}, () => {
    if (!sessionStorage.getItem('seeded')) {
      sessionStorage.setItem('seeded', '1');
      localStorage.setItem('trundle-v2-room-2', '{bad json');
      localStorage.setItem('trundle-v2-room-3', JSON.stringify({ layout: [{ id: 4, type: 'plank', x: 3, y: 9, a: 15 }], best: null }));
    }
  });
  await manual(page);
  await page.evaluate(() => window.__trundle.openRoom(1));
  assert.deepEqual(await page.evaluate(() => window.__trundle.G.layout), [], 'the unreadable room starts fresh');
  await page.evaluate(() => window.__trundle.openRoom(2));
  assert.deepEqual(await page.evaluate(() => window.__trundle.G.layout), [{ id: 4, type: 'plank', x: 3, y: 9, a: 15 }], 'the other rooms are untouched');
  assert.deepEqual(errors, []);
  await context.close();
});

test('trundle AC-11: hiding the page pauses an attempt or the floor run; it stays paused when shown again and resumes on a tap', async () => {
  const { context, page } = await open('#1-1');
  await manual(page);
  const setHidden = (h) =>
    page.evaluate((h) => {
      Object.defineProperty(document, 'hidden', { value: h, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    }, h);
  for (const what of ['run', 'floor']) {
    if (what === 'floor') {
      for (let i = 0; i < 8; i++) await solve(page, i);
      await page.evaluate(() => window.__trundle.startFloorRun());
    }
    await page.evaluate(() => window.__trundle.frame(100));
    await setHidden(true);
    await setHidden(false);
    const snap = () => page.evaluate(() => [window.__trundle.G.paused, window.__trundle.G.stepsTotal, window.__trundle.G.att && window.__trundle.G.att.steps, window.__trundle.G.floor && window.__trundle.G.floor.att && window.__trundle.G.floor.att.steps, window.__trundle.G.floor && window.__trundle.G.floor.phaseT]);
    const before = await snap();
    assert.equal(before[0], true, `${what}: paused`);
    await page.evaluate(() => window.__trundle.frame(500));
    assert.deepEqual(await snap(), before, `${what}: nothing moves while paused`);
    assert.ok(await page.locator('[data-paused]').isVisible());
    await page.click('[data-paused]');
    assert.equal(await page.evaluate(() => window.__trundle.G.paused), false, `${what}: a tap resumes`);
  }
  await context.close();
});

test('trundle AC-12: from the 4th failed attempt the exit takes a ball from 5% further per failed attempt, up to 20%, and is normal again once done', async () => {
  const { context, page } = await open('#1-1');
  await manual(page);
  const r = await page.evaluate(() => {
    const T = window.__trundle;
    const radii = [];
    T.setLayout([]);
    for (let m = 0; m < 9; m++) {
      radii.push(T.G.att.exitR);
      let n = 0;
      while (T.G.mode === 'run' && n++ < 6000) T.frame(1000 / 60);
      T.restart();
    }
    // a restart mid-attempt is not a failure
    const before = T.G.fails[0];
    T.frame(1000);
    T.restart();
    const afterRestart = T.G.fails[0];
    return { radii, before, afterRestart };
  });
  const want = [0.5, 0.5, 0.5, 0.5, 0.525, 0.55, 0.575, 0.6, 0.6];
  r.radii.forEach((v, i) => assert.ok(Math.abs(v - want[i]) < 1e-9, `attempt ${i + 1}: ${v} vs ${want[i]}`));
  assert.equal(r.afterRestart, r.before);
  const done = await solve(page, 0);
  assert.equal(done.mode, 'done');
  const after = await page.evaluate(() => {
    const T = window.__trundle;
    T.openRoom(0);
    return { r: T.G.att.exitR, fails: T.G.fails[0] };
  });
  assert.deepEqual(after, { r: 0.5, fails: 0 });
  await context.close();
});

for (const [w, h] of [
  [360, 640],
  [390, 844],
  [1280, 720],
]) {
  test(`trundle AC-13: at ${w}×${h} the board and the bar fit, the board keeps its shape, and every button is at least 44 px`, async () => {
    const { context, page } = await open('#1-1', { viewport: { width: w, height: h } });
    await manual(page);
    await page.evaluate(() => window.__trundle.openRoom(7));
    const r = await page.evaluate(() => {
      const { k, bx, by } = window.__trundle.view();
      const bar = document.querySelector('[data-bar]').getBoundingClientRect();
      const balls = document.querySelector('[data-balls]').getBoundingClientRect();
      const btns = [...document.querySelectorAll('button')].filter((b) => b.offsetParent !== null).map((b) => b.getBoundingClientRect());
      const back = document.querySelector('.shell-back').getBoundingClientRect();
      return {
        board: { l: bx, t: by, r: bx + 10 * k, b: by + 16 * k },
        bar: { t: bar.top, b: bar.bottom },
        balls: balls.bottom,
        small: btns.filter((b) => b.width < 44 || b.height < 44).length,
        n: btns.length,
        back: back.width,
        scroll: document.scrollingElement.scrollHeight - innerHeight,
      };
    });
    assert.ok(r.board.l >= 16 && r.board.r <= w - 16, 'clear of the side edges');
    assert.ok(r.board.t >= r.balls && r.board.b <= r.bar.t, 'between the ball counter and the bottom bar');
    assert.ok(r.bar.b <= h, 'the bar is on screen');
    assert.ok(Math.abs((r.board.b - r.board.t) / (r.board.r - r.board.l) - 1.6) < 0.01, 'portrait 10 × 16');
    assert.ok(r.n >= 5);
    assert.equal(r.small, 0, 'no button under 44 px');
    assert.ok(r.back >= 44);
    assert.ok(r.scroll <= 0, 'no scrolling');
    await context.close();
  });
}

test('trundle AC-14: a ball at top speed lands on a plank instead of passing through it', async () => {
  const { context, page } = await open('#1-1');
  await manual(page);
  const r = await page.evaluate(() => {
    const { SIM } = window.__trundle;
    const out = [];
    for (const x of [4.2, 5, 5.8]) {
      const room = { girder: { x1: 5, x2: 5, y: 1 }, trundle: { x: 5, dir: 1, speed: 0 }, balls: 1, quota: 1, fixed: [], exits: [{ x: 9, y: 15.5 }], stars: [] };
      const att = SIM.createAttempt(room, [{ id: 1, type: 'plank', x, y: 14, a: 0 }]);
      while (!att.balls.length) att.step();
      window.Matter.Body.setVelocity(att.balls[0].body, { x: 0, y: (SIM.VMAX * SIM.S) / 60 });
      let lowest = 0;
      for (let i = 0; i < 240 && !att.result; i++) {
        att.step();
        if (att.balls[0].state === 'live') lowest = Math.max(lowest, att.balls[0].body.position.y / SIM.S);
      }
      out.push(lowest);
    }
    return out;
  });
  for (const y of r) assert.ok(y < 14, `the ball stayed above the plank (lowest ${y})`);
  await context.close();
});

test('trundle AC-15: once the game has been opened at room 1, room 8 plays offline', async () => {
  const { context, page } = await open('#1-1');
  await page.evaluate(() => navigator.serviceWorker.register('../sw.js'));
  await page.evaluate(() => Promise.race([navigator.serviceWorker.ready, new Promise((r) => setTimeout(r, 10000))]));
  await page.reload(); // controlled now: this load caches the game's files
  await page.waitForFunction(() => window.__trundle);
  await page.waitForLoadState('networkidle');
  await context.setOffline(true);
  await page.reload();
  await page.waitForFunction(() => window.__trundle);
  await manual(page);
  assert.equal((await solve(page, 7)).mode, 'done');
  const files = await page.evaluate(() =>
    Promise.all(['img/crate.png', 'img/key.png', 'img/hole_large_end_locked.png', 'img/block_corner.png', 'sounds/pop.mp3'].map((u) => fetch(u).then((r) => r.ok)))
  );
  assert.deepEqual(files, [true, true, true, true, true]);
  await context.close();
});

test('trundle AC-16: drops, hits, stars, the exit and lost balls play sounds; a resting contact does not repeat; nothing plays muted', async () => {
  const { context, page } = await open('#1-1', {}, FAKE_AUDIO);
  await manual(page);
  await page.mouse.click(5, 300); // unlock audio
  await page.waitForFunction(() => window.__decoded >= 16);
  const sizes = await page.evaluate(async () => {
    const out = {};
    for (const n of ['kick', 'star', 'exit', 'plank', 'pop']) out[n] = (await (await fetch(`sounds/${n}.mp3`)).arrayBuffer()).byteLength;
    return out;
  });
  const played = await page.evaluate((PLAY) => {
    window.__played.length = 0;
    const r = eval(PLAY)(0, () => 1000 / 60, false);
    return { bytes: window.__played.map((p) => p.bytes), lost: r.att.lostCount, dropped: r.att.dropped };
  }, PLAY);
  const count = (n) => played.bytes.filter((b) => b === sizes[n]).length;
  assert.equal(count('kick'), played.dropped, 'a drop sound per ball');
  assert.equal(count('star'), 3);
  assert.ok(count('exit') >= 3);
  assert.ok(count('plank') >= 1, 'a ball hitting the plank sounds');
  assert.equal(count('pop'), played.lost, 'a pop per lost ball');
  // a ball resting on a ledge does not re-trigger its sound every step
  const rest = await page.evaluate(() => {
    const { SIM } = window.__trundle;
    const room = { girder: { x1: 5, x2: 5, y: 1 }, trundle: { x: 5, dir: 1, speed: 0 }, balls: 1, quota: 1, fixed: [{ x: 5, y: 4.3, w: 10, h: 0.6 }], exits: [{ x: 99, y: 3 }], stars: [] };
    const att = SIM.createAttempt(room, []);
    let hits = 0;
    for (let i = 0; i < 600 && !att.result; i++) {
      att.step();
      hits += att.events.filter((e) => e.type === 'hit').length;
    }
    return hits;
  });
  assert.ok(rest <= 3, `a resting ball made ${rest} hit sounds`);
  await page.click('[data-mute]');
  const muted = await page.evaluate(() => {
    window.__played.length = 0;
    const T = window.__trundle;
    T.openRoom(0);
    let n = 0;
    while (T.G.mode === 'run' && n++ < 6000) T.frame(1000 / 60);
    return window.__played.length;
  });
  assert.equal(muted, 0);
  await context.close();
});

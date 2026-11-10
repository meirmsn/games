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

// In the page: play room i's recorded taps (each at its step) through the page's own frame loop,
// frames of ms(f) milliseconds. Returns what happened.
const PLAY = `(i, ms, trace) => {
  const T = window.__trundle;
  T.openRoom(i);
  T.G.fails[i] = 0;
  T.restart();
  const sol = T.ROOMS[i].solution;
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
  return { mode: T.G.mode, result: att.result, stars: att.starCount(), filled: att.filled.slice(), need: att.need(), lost: att.lostCount, star: att.gotStar, cupW: att.cupW, poses: poses.join(';'), vmax, att };
}`;

async function solve(page, i) {
  return page.evaluate(
    ([i, PLAY]) => {
      const r = eval(PLAY)(i, () => 1000 / 60, false);
      return { mode: r.mode, stars: r.stars };
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

test('trundle AC-2: a room opens running: a ball within 1 s, another every 2.5 s, and room 1’s first, untouched, is lost', async () => {
  const { context, page, errors } = await open('#1-1');
  await manual(page);
  const r = await page.evaluate(() => {
    const T = window.__trundle;
    T.restart();
    const att = T.G.att;
    const at = (s) => {
      while (att.t < s) T.frame(1000 / 60);
      return att.dropped;
    };
    const d = { t0: at(0.01), t1: at(1.0), t3: at(3.0), t35: at(3.6), t6: at(6.1) };
    return { mode: T.G.mode, d, firstLost: att.balls[0].state };
  });
  assert.equal(r.mode, 'run');
  assert.deepEqual(r.d, { t0: 0, t1: 1, t3: 1, t35: 2, t6: 3 });
  assert.equal(r.firstLost, 'lost', 'the plank starts the wrong way');
  assert.deepEqual(errors, []);
  await context.close();
});

test('trundle AC-3: a tap on or near a plank flips it; a tap elsewhere flips nothing; keys flip planks too', async () => {
  const { context, page } = await open('#1-1', { hasTouch: true });
  await manual(page);
  const state = () => page.evaluate(() => window.__trundle.G.att.planks.map((p) => p.state));
  const at = (x, y) => page.evaluate(([x, y]) => window.__trundle.toScreen(x, y), [x, y]);
  const step = () => page.evaluate(() => window.__trundle.frame(200));
  await page.evaluate(() => window.__trundle.openRoom(1)); // room 2: two planks
  assert.deepEqual(await state(), [0, 0]);
  let p = await at(2.6, 4.6); // on plank 1's bolt
  await page.mouse.click(p.x, p.y);
  await step();
  assert.deepEqual(await state(), [1, 0]);
  const k = (await page.evaluate(() => window.__trundle.view())).k;
  p = await at(6.4, 8.4);
  await page.mouse.click(p.x, p.y + 35); // 35 px below plank 2: still near enough
  await step();
  assert.deepEqual(await state(), [1, 1]);
  p = await at(8.5, 14);
  await page.mouse.click(p.x, p.y); // nowhere near a plank
  await step();
  assert.deepEqual(await state(), [1, 1]);
  assert.ok(k > 0);
  await page.keyboard.press('1');
  await step();
  assert.deepEqual(await state(), [0, 1]);
  const angles = await page.evaluate(() => {
    const T = window.__trundle;
    for (let i = 0; i < 20; i++) T.frame(1000 / 60);
    return T.G.att.planks.map((p) => p.angle);
  });
  const rooms = await page.evaluate(() => window.__trundle.ROOMS[1].planks.map((p) => [p.a0, p.a1]));
  assert.deepEqual(angles, [rooms[0][0], rooms[1][1]], 'each plank sits at the angle its state names');
  await context.close();
});

test('trundle AC-4: a ball resting on a plank is thrown when the plank flips under it, the same way every time', async () => {
  const { context, page } = await open('#1-1');
  await manual(page);
  const r = await page.evaluate(() => {
    const { SIM } = window.__trundle;
    const room = { girder: { x1: 1.9, x2: 1.9, y: 1.6 }, trundle: { x: 1.9, dir: 1, speed: 0 }, balls: 'r', fixed: [], cups: [{ x: 9, y: 15, color: 'r', need: 1 }], planks: [{ x: 3, y: 7, a0: 0, a1: 35 }] };
    const throwAt = (s) => {
      const a = SIM.createAttempt(room, { probe: true });
      let rest = null;
      let peak = Infinity;
      while (!a.result && a.steps < 900) {
        if (a.steps === s) {
          rest = { x: a.balls[0].body.position.x / 50, y: a.balls[0].body.position.y / 50, v: a.balls[0].body.speed };
          a.edit({ op: 'flip', i: 0 });
        }
        a.step();
        if (a.steps > s && a.balls[0].state === 'live') peak = Math.min(peak, a.balls[0].body.position.y / 50);
      }
      const b = a.balls[0];
      return { rest, peak, end: b.trail.slice(-2).join(','), state: b.state };
    };
    return [throwAt(260), throwAt(260)];
  });
  assert.ok(r[0].rest.v < 0.2, 'the ball was resting on the plank');
  assert.ok(r[0].peak < r[0].rest.y - 2, `thrown up (peak ${r[0].peak} from ${r[0].rest.y})`);
  assert.equal(r[0].end, r[1].end, 'the same landing every time');
  await context.close();
});

test('trundle AC-5: a ball in a cup of its colour fills a slot; in the other colour’s cup it is lost', async () => {
  const { context, page } = await open('#1-1');
  await manual(page);
  const r = await page.evaluate(() => {
    const { SIM } = window.__trundle;
    const drop = (color, cup) => {
      const room = { girder: { x1: 5, x2: 5, y: 1.6 }, trundle: { x: 5, dir: 1, speed: 0 }, balls: color, fixed: [], planks: [], cups: [{ x: 5, y: 12, color: cup, need: 1 }] };
      const a = SIM.createAttempt(room, { probe: true });
      while (!a.result) a.step();
      return { filled: a.filled[0], lost: a.lostCount, why: (a.balls[0] || {}).state };
    };
    return { same: drop('r', 'r'), other: drop('b', 'r') };
  });
  assert.deepEqual(r.same, { filled: 1, lost: 0, why: 'in' });
  assert.deepEqual(r.other, { filled: 0, lost: 1, why: 'lost' });
  await context.close();
});

test('trundle AC-6: every room’s recorded taps fill every cup with all three stars, step for step the same at 60 Hz, 120 Hz and uneven frames; with no taps every room fails', async () => {
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
        traces[name] = { poses: x.poses, result: x.result, stars: x.stars, cupW: x.cupW };
      }
      out.push({ i, traces, none: T.replay(T.ROOMS[i], []).result });
    }
    return out;
  }, PLAY);
  for (const { i, traces, none } of r) {
    const t = traces.hz60;
    assert.equal(t.result, 'won', `room ${i + 1}'s taps fill every cup`);
    assert.equal(t.stars, 3, `room ${i + 1}'s taps take 3 stars`);
    assert.equal(t.cupW, 0.65, 'no assist');
    assert.ok(t.poses.length > 500);
    assert.equal(traces.hz120.poses, t.poses, `room ${i + 1}: 120 Hz is step for step the same`);
    assert.equal(traces.uneven.poses, t.poses, `room ${i + 1}: uneven frames are step for step the same`);
    assert.equal(none, 'failed', `room ${i + 1}: no taps fails`);
  }
  await context.close();
});

test('trundle AC-7: every slot full ends the room with the stars and why; a cup out of reach ends the attempt with Retry', async () => {
  const { context, page, errors } = await open('#1-1');
  await manual(page);
  assert.equal(await runOut(page), 'failed', 'no taps: out of balls');
  assert.equal(await page.locator('[data-card="failed"]').isVisible(), true);
  assert.equal(await page.locator('[data-failed-count]').textContent(), '0 of 3 in');
  await page.click('[data-retry]');
  assert.equal(await page.evaluate(() => window.__trundle.G.mode), 'run');
  const won = await solve(page, 0);
  assert.equal(won.mode, 'done');
  assert.equal(await page.evaluate(() => window.__trundle.G.robot.state), 'cheer');
  assert.equal(await page.evaluate(() => window.__trundle.loadRoom(0).best.stars), 3);
  await page.waitForSelector('[data-card="done"]:not([hidden])');
  assert.equal(await page.locator('[data-done-stars] img.got').count(), 3);
  assert.equal(await page.locator('[data-done-why]').textContent(), 'No balls wasted · Star caught');
  assert.equal(await page.locator('[data-room-stars] img[src$="img/star.png"]').count(), 3);
  // the rooms list covers the card, and closing it brings the card back
  await page.click('[data-rooms]');
  assert.equal(await page.locator('[data-card="done"]').isVisible(), false);
  await page.click('[data-close-rooms]');
  assert.equal(await page.locator('[data-card="done"]').isVisible(), true);
  assert.deepEqual(errors, []);
  await context.close();
});

test('trundle states: each state shows only its own cards, as in the state table', async () => {
  const { context, page, errors } = await open('#1-1');
  await manual(page);
  const look = () =>
    page.evaluate(() => ({
      mode: window.__trundle.G.mode,
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
  only(await look(), { mode: 'run', done: false, failed: false, floor: false, rooms: false });
  await page.click('[data-rooms]');
  only(await look(), { done: false, failed: false, floor: false, rooms: true, dim: true, floorRun: false });
  assert.equal(await page.locator('.room-grid button:disabled svg.lock').count(), 7, 'a padlock on each room not reached');
  assert.equal(await page.evaluate(() => window.__trundle.G.paused), true, 'the attempt waits');
  await page.click('[data-close-rooms]');
  await page.click('[data-paused]');
  only(await look(), { mode: 'run', rooms: false });
  await runOut(page);
  only(await look(), { mode: 'failed', done: false, failed: true, floor: false });
  // the board keeps the balls' trails: one recorded for every ball dropped
  const lens = await page.evaluate(() => window.__trundle.G.att.balls.map((b) => b.trail.length));
  assert.ok(lens.length > 0 && lens.every((n) => n > 10), 'every ball has a trail');
  await solve(page, 0);
  await page.waitForSelector('[data-card="done"]:not([hidden])');
  only(await look(), { mode: 'done', done: true, failed: false, floor: false, rooms: false });
  for (const i of [1, 2, 3, 4, 5, 6, 7]) await solve(page, i);
  await page.waitForFunction(() => window.__trundle.G.mode === 'floor', null, { timeout: 4000 });
  only(await look(), { mode: 'floor', done: false, failed: false, floor: false, rooms: false });
  await page.evaluate(() => {
    const T = window.__trundle;
    let n = 0;
    while (!T.G.floor.end && n++ < 20000) T.frame(1000 / 60);
  });
  only(await look(), { mode: 'floor', done: false, floor: true, rooms: false });
  await page.click('[data-floor-rooms]');
  only(await look(), { rooms: true, dim: true, floorRun: true });
  assert.deepEqual(errors, []);
  await context.close();
});

test('trundle AC-8: each room brings its new thing: two planks, a patrol, two colours, the flick, the flap, the crate and the key', async () => {
  const { context, page } = await open('#1-1');
  await manual(page);
  const r = await page.evaluate((PLAY) => {
    const T = window.__trundle;
    const R = T.ROOMS;
    const xs = [];
    T.openRoom(2);
    for (let f = 0; f < 240; f++) {
      T.frame(1000 / 60);
      xs.push(T.G.att.trundle.x);
    }
    const colours = new Set(R[3].balls);
    // room 5: the solution's balls reach the cup by a flick
    const flick = eval(PLAY)(4, () => 1000 / 60, false);
    const flicks = flick.att.log.length;
    // room 6: the steep route opens the flap, the gentle one doesn't
    const r6 = R[5];
    const route = (up) => T.SIM.replay({ ...r6, planks: r6.planks.map((p) => ({ ...p, up })) }, [], { probe: true }).filled[0];
    // room 7: the crate falls into the gap below its plank
    const crate = eval(PLAY)(6, () => 1000 / 60, false);
    const crateY = crate.att.crate.position.y / 50;
    // room 8: the locked cup takes no ball before the key
    const sol8 = R[7].solution;
    const a8 = T.SIM.createAttempt(R[7]);
    let li = 0;
    let keyAt = -1;
    let blueIn = -1;
    while (!a8.result) {
      while (li < sol8.log.length && sol8.log[li].s === a8.steps) {
        const { s, ...e } = sol8.log[li++];
        a8.edit(e);
      }
      a8.step();
      for (const e of a8.events) {
        if (e.type === 'key' && keyAt < 0) keyAt = a8.steps;
        if (e.type === 'cup' && e.cup === 1 && blueIn < 0) blueIn = a8.steps;
      }
    }
    return { planks2: R[1].planks.length, moved: Math.max(...xs) - Math.min(...xs), colours: colours.size, cups4: R[3].cups.length, flick: flick.result, flicks, gentle: route(false), steep: route(true), crate: crate.result, crateY, keyAt, blueIn };
  }, PLAY);
  assert.equal(r.planks2, 2, 'room 2 has two planks');
  assert.ok(r.moved > 2, `room 3's Trundle patrols (${r.moved} units)`);
  assert.equal(r.colours, 2, 'room 4 drops red and blue');
  assert.equal(r.cups4, 2);
  assert.equal(r.flick, 'won', 'room 5: flicked balls land in the cup');
  assert.equal(r.gentle, 0, 'room 6: the gentle route stays shut out by the flap');
  assert.ok(r.steep >= 3, 'room 6: the steep route opens it');
  assert.equal(r.crate, 'won');
  assert.ok(r.crateY > 16, 'room 7: the crate fell into the gap');
  assert.ok(r.keyAt > 0 && r.blueIn > r.keyAt, 'room 8: the blue cup opens only after the key');
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
    while (!T.G.floor.end && n++ < 20000) {
      T.frame(1000 / 60);
      const F = T.G.floor;
      if (F.phase === 'play' && seen.at(-1) !== F.si) seen.push(F.si);
      if (n % 60 === 0) cams.push(F.camY);
    }
    const won = T.G.floor.segs.map((s) => s.final && s.final.result);
    return { end: T.G.floor.end, seen, cams, frames: n, won };
  });
  assert.equal(r.end, true);
  assert.deepEqual(r.seen, [0, 1, 2, 3, 4, 5, 6, 7], 'every room, in order');
  assert.deepEqual(r.won, Array(8).fill('won'), 'each replay wins again');
  assert.ok(r.cams.at(-1) > r.cams[0] + 100, 'the camera moves down the rooms');
  assert.ok(r.frames < 75 * 60, `faster than life: ${r.frames} frames`);
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
  await page.click('[data-paused]');
  assert.equal((await solve(page, 0)).mode, 'done');
  await page.click('[data-rooms]');
  assert.equal(await page.locator('.room-grid button:disabled').count(), 6, 'solving room 1 opens room 2');
  await page.click('.room-grid button:nth-child(2)');
  assert.equal(await page.evaluate(() => window.__trundle.G.ri), 1);
  // a win with fewer stars keeps the best: room 1 with one late tap, which wastes balls
  const worse = await page.evaluate(() => {
    const T = window.__trundle;
    T.openRoom(0);
    T.restart();
    const att = T.G.att;
    for (let s = 0; s < 4000 && T.G.mode === 'run'; s++) {
      if (att.steps === 700) T.flip(0);
      T.frame(1000 / 120);
    }
    return { mode: T.G.mode, stars: att.starCount(), best: T.loadRoom(0).best.stars };
  });
  assert.equal(worse.mode, 'done');
  assert.ok(worse.stars < 3, `a weaker win: ${worse.stars} stars`);
  assert.equal(worse.best, 3);
  // kept after a reload; room 2 is the furthest reached: a link to a locked room, a bad one or none opens it
  for (const [h, ri] of [['#1-1', 0], ['#1-2', 1], ['#1-4', 1], ['#1-9', 1], ['#x', 1], ['', 1]]) {
    await page.goto(BASE + 'trundle/' + h);
    await page.reload();
    await page.waitForFunction(() => window.__trundle);
    assert.equal(await page.evaluate(() => window.__trundle.G.ri), ri, h);
  }
  assert.equal(await page.evaluate(() => window.__trundle.loadRoom(0).best.stars), 3, 'kept after a reload');
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
      localStorage.setItem('trundle-v3-room-1', '{bad json');
      localStorage.setItem('trundle-v3-room-2', JSON.stringify({ best: { stars: 2, log: [{ s: 40, op: 'flip', i: 0 }] } }));
    }
  });
  await manual(page);
  const r = await page.evaluate(() => ({ r1: window.__trundle.loadRoom(0), r2: window.__trundle.loadRoom(1).best.stars, mode: window.__trundle.G.mode }));
  assert.equal(r.r1, null, 'the unreadable room starts fresh');
  assert.equal(r.r2, 2, 'the other rooms are untouched');
  assert.equal(r.mode, 'run');
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
    const snap = () =>
      page.evaluate(() => {
        const G = window.__trundle.G;
        return [G.paused, G.stepsTotal, G.att && G.att.steps, G.floor && G.floor.att && G.floor.att.steps, G.floor && G.floor.phaseT];
      });
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

test('trundle AC-12: from the 4th failed attempt the cups are 5% wider per failed attempt, up to 20%, and normal again once done', async () => {
  const { context, page } = await open('#1-1');
  await manual(page);
  const r = await page.evaluate(() => {
    const T = window.__trundle;
    const widths = [];
    T.restart();
    for (let m = 0; m < 9; m++) {
      widths.push(T.G.att.cupW);
      let n = 0;
      while (T.G.mode === 'run' && n++ < 6000) T.frame(1000 / 60);
      T.restart();
    }
    const before = T.G.fails[0];
    T.frame(1000);
    T.restart(); // a retry mid-attempt is not a failure
    return { widths, before, after: T.G.fails[0] };
  });
  const want = [0.65, 0.65, 0.65, 0.65, 0.6825, 0.715, 0.7475, 0.78, 0.78];
  r.widths.forEach((v, i) => assert.ok(Math.abs(v - want[i]) < 1e-9, `attempt ${i + 1}: ${v} vs ${want[i]}`));
  assert.equal(r.after, r.before);
  assert.equal((await solve(page, 0)).mode, 'done');
  const after = await page.evaluate(() => {
    const T = window.__trundle;
    T.openRoom(0);
    return { w: T.G.att.cupW, fails: T.G.fails[0] };
  });
  assert.deepEqual(after, { w: 0.65, fails: 0 });
  await context.close();
});

for (const [w, h] of [
  [360, 640],
  [390, 844],
  [1280, 720],
]) {
  test(`trundle AC-13: at ${w}×${h} the board fits under the top bar, keeps its shape, and every button is at least 44 px`, async () => {
    const { context, page } = await open('#1-1', { viewport: { width: w, height: h } });
    await manual(page);
    await page.evaluate(() => window.__trundle.openRoom(7));
    const r = await page.evaluate(() => {
      const { k, bx, by } = window.__trundle.view();
      const btns = [...document.querySelectorAll('button')].filter((b) => b.offsetParent !== null).map((b) => b.getBoundingClientRect());
      return {
        board: { l: bx, t: by, r: bx + 10 * k, b: by + 16 * k },
        top: document.querySelector('.top').getBoundingClientRect().bottom,
        small: btns.filter((b) => b.width < 44 || b.height < 44).length,
        n: btns.length,
        back: document.querySelector('.shell-back').getBoundingClientRect().width,
        scroll: document.scrollingElement.scrollHeight - innerHeight,
      };
    });
    assert.ok(r.board.l >= 16 && r.board.r <= w - 16, 'clear of the side edges');
    assert.ok(r.board.t >= r.top && r.board.b <= h - 8, 'under the top bar, on screen');
    assert.ok(Math.abs((r.board.b - r.board.t) / (r.board.r - r.board.l) - 1.6) < 0.01, 'portrait 10 × 16');
    assert.ok(r.n >= 2);
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
      const room = { girder: { x1: 5, x2: 5, y: 1 }, trundle: { x: 5, dir: 1, speed: 0 }, balls: 'r', fixed: [], cups: [{ x: 9, y: 15.5, color: 'r', need: 1 }], planks: [{ x, y: 14, a0: 0, a1: 20 }] };
      const att = SIM.createAttempt(room, { probe: true });
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
    Promise.all(['img/crate.png', 'img/key.png', 'img/hole_large_end_locked.png', 'img/ball_blue_large.png', 'sounds/pop.mp3'].map((u) => fetch(u).then((r) => r.ok)))
  );
  assert.deepEqual(files, [true, true, true, true, true]);
  await context.close();
});

test('trundle AC-16: flips, drops, hits, cups, lost balls and the star play sounds; a resting contact does not repeat; nothing plays muted', async () => {
  const { context, page } = await open('#1-1', {}, FAKE_AUDIO);
  await manual(page);
  await page.mouse.click(5, 300); // unlock audio
  await page.waitForFunction(() => window.__decoded >= 16);
  const sizes = await page.evaluate(async () => {
    const out = {};
    for (const n of ['turn', 'kick', 'star', 'exit', 'pop', 'metal', 'plank']) out[n] = (await (await fetch(`sounds/${n}.mp3`)).arrayBuffer()).byteLength;
    return out;
  });
  const played = await page.evaluate((PLAY) => {
    window.__played.length = 0;
    const r = eval(PLAY)(0, () => 1000 / 60, false);
    return { bytes: window.__played.map((p) => p.bytes), lost: r.att.lostCount, dropped: r.att.dropped, flips: r.att.log.length, filled: r.filled[0] };
  }, PLAY);
  const count = (n) => played.bytes.filter((b) => b === sizes[n]).length;
  assert.equal(count('turn'), played.flips, 'a clack per flip');
  assert.equal(count('kick'), played.dropped, 'a drop sound per ball');
  assert.equal(count('star'), 1);
  assert.equal(count('exit'), played.filled, 'a sound per ball in the cup');
  assert.equal(count('pop'), played.lost, 'a pop per lost ball');
  assert.ok(count('metal') + count('plank') >= 1, 'hits sound');
  const rest = await page.evaluate(() => {
    const { SIM } = window.__trundle;
    const room = { girder: { x1: 5, x2: 5, y: 1 }, trundle: { x: 5, dir: 1, speed: 0 }, balls: 'r', fixed: [{ x: 5, y: 4.3, w: 10, h: 0.6 }], cups: [{ x: 99, y: 3, color: 'r', need: 1 }], planks: [] };
    const att = SIM.createAttempt(room, { probe: true });
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

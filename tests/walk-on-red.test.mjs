// End-to-end tests for Gotta Go! (walk-on-red/). Run: scripts/check-slow.sh.
// The game exposes window.__walkOnRed (its state, put() to place the player, and a step(dt) that
// advances the simulation), so these tests set up a situation and check what the rules do with it.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { serve } from './serve.mjs';
import { launch } from './clock.mjs';
import { simulateInsets, touchDrag, PORTRAIT_INSETS } from './insets.mjs';

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

async function open(opts = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, ...opts });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(BASE + 'walk-on-red/');
  await page.waitForFunction(() => window.__walkOnRed);
  return { context, page, errors };
}

// Start a level with an empty road; the test owns the clock from here.
async function startEmpty(page, level = 0) {
  await page.evaluate((level) => {
    const t = window.__walkOnRed;
    t.seed(7);
    t.startGame(level);
    t.manual = true;
    t.clearTraffic();
  }, level);
}

const run = (page, seconds) =>
  page.evaluate((seconds) => {
    for (let i = 0; i < Math.round(seconds * 60); i++) window.__walkOnRed.step(1 / 60);
  }, seconds);

// A hop from input, then long enough for it to land.
const hop = async (page, dir) => {
  await page.evaluate((dir) => window.__walkOnRed.move(dir), dir);
  await run(page, 0.15);
};

// Play the last level to its end: he crosses an empty road and the run ends.
const finishRun = (page, score = 0) =>
  page.evaluate((score) => {
    const t = window.__walkOnRed;
    t.startGame(t.LEVELS.length - 1);
    t.manual = true;
    t.clearTraffic();
    t.game.score = score;
    t.put(0);
    for (let i = 0; i < 60 * 30 && t.game.mode !== 'over'; i++) t.step(1 / 60);
    return t.game.score;
  }, score);

// A car right on a column of a lane, standing still.
const carOn = (page, row, col) =>
  page.evaluate(
    ({ row, col }) => {
      const t = window.__walkOnRed;
      const v = t.spawnVehicle(row, 'sedan');
      const want = t.colX(col);
      v.s = v.dir === 1 ? want + v.w / 2 + t.ENTRY : t.PLAY_W + t.ENTRY - (want - v.w / 2);
      v.speed = 0;
      v.v = 0;
    },
    { row, col }
  );

// A car stands on his column in the lane just ahead of the near kerb, he hops into it, and it goes.
const hitOnce = (page) =>
  page.evaluate(() => {
    const t = window.__walkOnRed;
    const row = t.layout().bottom - 1;
    t.put(row);
    const v = t.spawnVehicle(row, 'sedan');
    const want = t.colX(t.player.col);
    v.s = v.dir === 1 ? want + v.w / 2 + t.ENTRY : t.PLAY_W + t.ENTRY - (want - v.w / 2);
    v.speed = 0;
    v.v = 0;
    t.step(1 / 60);
    const down = t.player.down > 0;
    t.vehicles().length = 0;
    return down;
  });

// The HUD is synced on each drawn frame, so this waits for one first.
const hearts = (page) =>
  page.evaluate(async () => {
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const el = document.querySelector('[data-lives]');
    return {
      full: el.querySelectorAll('svg:not(.lost)').length,
      lost: el.querySelectorAll('svg.lost').length,
      label: el.getAttribute('aria-label'),
      shown: !document.querySelector('[data-hud]').hidden,
    };
  });

test('walk-on-red AC-1: traffic drives behind the start card; Start begins level 1 alone with 30 s of red', async () => {
  const { context, page, errors } = await open();
  await page.waitForTimeout(500);
  const s = await page.evaluate(() => {
    const t = window.__walkOnRed;
    return {
      mode: t.game.mode,
      start: !document.querySelector('[data-screen="start"]').hidden,
      vehicles: t.vehicles().length,
      waiting: t.people().length,
      s0: t.vehicles().map((v) => v.s),
    };
  });
  assert.equal(s.mode, 'title');
  assert.ok(s.start);
  assert.ok(s.vehicles >= 3, 'traffic is driving');
  assert.ok(s.waiting >= 4, 'people wait at the kerb');
  await page.waitForTimeout(300);
  const moved = await page.evaluate(() => window.__walkOnRed.vehicles().map((v) => v.s));
  assert.ok(moved.some((v, i) => s.s0[i] !== undefined && v !== s.s0[i]), 'the vehicles move');
  await page.click('[data-play]');
  const after = await page.evaluate(() => {
    const t = window.__walkOnRed;
    return { mode: t.game.mode, level: t.game.level, name: t.LEVELS[t.game.level].name, red: Math.ceil(t.game.red), copiers: t.copiers().length, row: t.player.row, bottom: t.layout().bottom };
  });
  assert.deepEqual(after, { mode: 'play', level: 0, name: 'Quiet Street', red: 30, copiers: 0, row: after.bottom, bottom: after.bottom });
  assert.deepEqual(errors, []);
  await context.close();
});

test('edge-gestures AC-8: with iPhone insets, a swipe that starts in an edge strip hops nowhere; a tap there still hops up', async () => {
  const { context, page } = await open();
  const cdp = await simulateInsets(context, page, PORTRAIT_INSETS, () => window.__walkOnRed);
  await startEmpty(page, 1);
  await page.evaluate(() => (window.__walkOnRed.manual = false));
  const at = () => page.evaluate(() => [window.__walkOnRed.player.col, window.__walkOnRed.player.row]);
  const settle = () => page.waitForTimeout(200);
  // One step up first, so a swipe down has somewhere to go.
  await touchDrag(cdp, 195, 400, 0, 0, { n: 1 });
  await settle();
  const start = await at();
  const strip = 844 - PORTRAIT_INSETS.bottom - 20;
  for (const [x, y, dx, dy, what] of [
    [195, strip, 90, 0, 'right, from the bottom strip'],
    [195, strip, 0, -90, 'up, from the bottom strip'],
    [195, strip, 0, 30, 'down, from the bottom strip'],
    [8, 400, 90, 0, 'right, from the left strip'],
    [195, PORTRAIT_INSETS.top + 10, 0, 90, 'down, from the top strip'],
  ]) {
    await touchDrag(cdp, x, y, dx, dy, { n: 4 });
    await settle();
    assert.deepEqual(await at(), start, `a swipe ${what} hops nowhere`);
  }
  await touchDrag(cdp, 195, strip, 0, 0, { n: 1 });
  await settle();
  assert.deepEqual(await at(), [start[0], start[1] - 1], 'a tap in the bottom strip still hops up');
  // The same swipe from the safe area hops.
  await touchDrag(cdp, 195, 400, 90, 0, { n: 4 });
  await settle();
  assert.deepEqual(await at(), [start[0] + 1, start[1] - 1], 'a swipe from the safe area hops right');
  await context.close();
});

test('walk-on-red AC-2: a tap hops forward, swipes hop back and sideways, keys too; the zebra’s edges and the kerbs stop him; one finger only', async () => {
  const { context, page } = await open();
  await startEmpty(page, 1);
  await page.evaluate(() => (window.__walkOnRed.manual = false));
  const at = () => page.evaluate(() => [window.__walkOnRed.player.col, window.__walkOnRed.player.row]);
  const b = await page.evaluate(() => window.__walkOnRed.layout().bottom);
  const col = await page.evaluate(() => window.__walkOnRed.PCOL);
  await page.mouse.click(195, 300);
  await page.waitForTimeout(200);
  assert.deepEqual(await at(), [col, b - 1], 'a tap hops forward');
  const swipe = async (dx, dy) => {
    await page.mouse.move(195, 400);
    await page.mouse.down();
    await page.mouse.move(195 + dx, 400 + dy, { steps: 4 });
    await page.mouse.up();
    await page.waitForTimeout(200);
  };
  await swipe(0, 80);
  assert.deepEqual(await at(), [col, b], 'a swipe down hops back');
  await swipe(90, 0);
  assert.deepEqual(await at(), [col + 1, b], 'a swipe right hops right');
  await swipe(-90, 0);
  assert.deepEqual(await at(), [col, b], 'a swipe left hops left');
  await page.keyboard.press('ArrowUp');
  await page.waitForTimeout(200);
  await page.keyboard.press('w');
  await page.waitForTimeout(200);
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(200);
  await page.keyboard.press(' ');
  await page.waitForTimeout(200);
  assert.deepEqual(await at(), [col, b - 2]);
  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(200);
  await page.keyboard.press('d');
  await page.waitForTimeout(200);
  await page.keyboard.press('d');
  await page.waitForTimeout(200);
  assert.deepEqual(await at(), [col + 1, b - 2], 'left and right keys');
  // The zebra's edges.
  const [c0, c1] = await page.evaluate(() => [window.__walkOnRed.CROSS_C0, window.__walkOnRed.CROSS_C1]);
  await page.evaluate((c1) => {
    const t = window.__walkOnRed;
    t.put(t.layout().bottom);
    t.player.col = c1;
  }, c1);
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(200);
  assert.equal((await at())[0], c1, 'not past the zebra’s right edge');
  await page.evaluate((c0) => (window.__walkOnRed.player.col = c0), c0);
  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(200);
  assert.equal((await at())[0], c0, 'not past its left edge');
  // The kerb: no hop below the near kerb.
  await page.evaluate(() => window.__walkOnRed.put(window.__walkOnRed.layout().bottom));
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(200);
  assert.deepEqual(await at(), [c0, b]);
  // A second finger while the first is down does nothing.
  const two = await page.evaluate(() => {
    const t = window.__walkOnRed;
    const c = document.getElementById('street');
    const ev = (type, id, y) => c.dispatchEvent(new PointerEvent(type, { pointerId: id, clientX: 150, clientY: y, bubbles: true, isPrimary: id === 1 }));
    ev('pointerdown', 1, 300);
    ev('pointerdown', 2, 300);
    ev('pointerup', 2, 300);
    const mid = t.player.row;
    ev('pointerup', 1, 300);
    return { mid, end: t.player.row };
  });
  assert.equal(two.mid, b, 'the second finger did nothing');
  assert.equal(two.end, b - 1, 'the first finger tapped');
  await context.close();
});

test('walk-on-red AC-3: the car lights go green, yellow at 4.5 s, red at 2 s, and on red no car crosses its stop line', async () => {
  const { context, page } = await open();
  await startEmpty(page, 1);
  const r = await page.evaluate(() => {
    const t = window.__walkOnRed;
    const lights = [];
    for (const red of [10, 4.6, 4.4, 2.1, 1.9]) {
      t.game.red = red;
      lights.push(t.carLight());
    }
    // Red: a car coming up to the crossing stops at its line and stays there.
    t.game.red = 1.5;
    const lane = t.layout().lanes[0];
    const v = t.spawnVehicle(lane.row, 'sedan');
    // 15 art px short of its stop line, coming at 25 px/s.
    const stopX = v.dir === 1 ? t.CROSS_C0 * 12 - 3 : (t.CROSS_C1 + 1) * 12 + 3;
    v.s = (v.dir === 1 ? stopX + t.ENTRY : t.PLAY_W + t.ENTRY - stopX) - 15;
    v.speed = 25;
    v.v = 25;
    const crossed = () => {
      const x = t.xOf(v);
      const x0 = t.CROSS_C0 * 12;
      const x1 = (t.CROSS_C1 + 1) * 12;
      return x < x1 && x + v.w > x0;
    };
    let onCrossing = false;
    for (let i = 0; i < 60 * 1.4; i++) {
      t.step(1 / 60);
      onCrossing = onCrossing || crossed();
    }
    return { lights, onCrossing, stopped: v.v < 0.5 };
  });
  assert.deepEqual(r.lights, ['green', 'green', 'yellow', 'yellow', 'red']);
  assert.equal(r.onCrossing, false, 'no car crosses its stop line on red');
  assert.ok(r.stopped, 'it waits at the line');
  await context.close();
});

test('walk-on-red AC-4: the walk light turns green only once the crossing is clear; then everyone crosses and no car enters', async () => {
  const { context, page } = await open();
  await startEmpty(page, 1);
  const r = await page.evaluate(() => {
    const t = window.__walkOnRed;
    // He's across; the walk light runs out, with a slow van on the crossing.
    t.put(0);
    for (let i = 0; i < 60 * 30 && !(t.game.stage === 'ff' && t.game.red < 0.4); i++) t.step(1 / 60);
    const lane = t.layout().lanes[0];
    const v = t.spawnVehicle(lane.row, 'van');
    const want = t.colX(5);
    v.s = v.dir === 1 ? want + v.w / 2 + t.ENTRY : t.PLAY_W + t.ENTRY - (want - v.w / 2);
    v.speed = 6;
    v.v = 6;
    let waited = false;
    for (let i = 0; i < 60 * 12 && t.game.mode !== 'green'; i++) {
      t.step(1 / 60);
      if (t.game.stage === 'clear' && !t.crossingClear()) waited = true;
    }
    const clearAtGreen = t.crossingClear();
    const mode = t.game.mode;
    // During green, no vehicle enters the crossing.
    const inside = () => t.vehicles().filter((u) => { const x = t.xOf(u); return x < (t.CROSS_C1 + 1) * 12 && x + u.w > t.CROSS_C0 * 12; }).length;
    const t1 = t.game.time;
    t.step(1 / 60);
    const rate = (t.game.time - t1) * 60;
    let entered = inside();
    for (let i = 0; i < 60 * 3 && t.game.mode === 'green'; i++) {
      t.step(1 / 60);
      entered += inside();
    }
    const everyone = t.people().every((p) => p.state === 'walk' || p.state === 'across');
    const crossedRow0 = t.people().filter((p) => p.state === 'walk').every((p) => p.walkRow === 0);
    for (let i = 0; i < 60 * 3; i++) t.step(1 / 60);
    return { waited, mode, clearAtGreen, entered, everyone, crossedRow0, rate, ff: t.FF, after: t.game.mode };
  });
  assert.ok(r.waited, 'waited for the crossing to clear');
  assert.equal(r.mode, 'green');
  assert.ok(r.clearAtGreen, 'green only once the crossing is clear');
  assert.equal(r.entered, 0, 'no car enters the crossing on green');
  assert.ok(r.everyone && r.crossedRow0, 'everyone crossed');
  assert.ok(Math.abs(r.rate - 1) < 0.01, `green runs at normal speed: ${r.rate}`);
  assert.ok(['tally', 'play'].includes(r.after));
  await context.close();
});

test('walk-on-red AC-5: across, the door shuts and it flushes, the game fast-forwards by its own rules into points, and a table shows the score', async () => {
  const { context, page } = await open();
  await startEmpty(page, 10);
  const r = await page.evaluate(() => {
    const t = window.__walkOnRed;
    const run = (s) => { for (let i = 0; i < Math.round(s * 60); i++) t.step(1 / 60); };
    for (let row = t.layout().bottom - 1; row > 0; row--) {
      t.move('up');
      run(0.5);
    }
    t.move('up');
    for (let i = 0; i < 60 && t.game.mode !== 'finish'; i++) t.step(1 / 60);
    const secs = t.game.closedSecs;
    const mode = t.game.mode;
    // In the loo: the door shuts, a flush, then the chime; the walk light holds his seconds.
    t.heard.length = 0;
    const t0 = t.game.time;
    const walkIn = t.player.inDur;
    run(walkIn + t.DOOR_T - 0.05);
    const door = { stage: t.game.stage, red: t.game.red, sounds: t.heard.map((h) => h.name), took: t.game.time - t0 };
    run(0.1);
    // Fast-forward: one frame is FF frames of the game; the points count up as the seconds drain.
    const ff = t.game.stage;
    const t1 = t.game.time;
    t.step(1 / 60);
    const rate = (t.game.time - t1) * 60;
    const counts = [];
    const lights = new Set();
    let took = t.DOOR_T;
    for (let i = 0; i < 60 * 30 && t.game.mode !== 'green'; i++) {
      t.step(1 / 60);
      if (t.game.mode === 'finish' && t.game.stage !== 'relief') {
        counts.push(t.game.levelScore);
        lights.add(t.carLight());
      }
      if (['finish', 'wait'].includes(t.game.mode) && t.game.stage !== 'relief') took += 1 / 60;
    }
    const across = t.copiers().filter((p) => p.state === 'across').length;
    const rising = counts.length > 5 && counts.every((c, i) => i === 0 || c >= counts[i - 1]) && counts[counts.length - 1] > counts[0];
    const rows = [...document.querySelectorAll('[data-tally] tr')].map((tr) => [...tr.cells].map((td) => td.textContent));
    const tableShown = !document.querySelector('[data-banner]').hidden && !document.querySelector('[data-tally]').hidden && t.drawn.result.length === 3;
    return { doorT: t.DOOR_T + walkIn, ffRate: t.FF, mode, secs, door, ff, rate, lights: [...lights], across, score: t.game.results[t.game.level].score, banner: document.querySelector('[data-banner-name]').textContent, rising, took, rows, tableShown };
  });
  assert.equal(r.mode, 'finish');
  assert.ok(r.secs > 20, `seconds fixed on arrival: ${r.secs}`);
  assert.equal(r.door.stage, 'door');
  assert.equal(r.door.red, r.secs, 'the walk light holds his seconds in the loo');
  assert.ok(Math.abs(r.door.took - (r.doorT - 0.05)) < 0.05, 'real time in the loo');
  const flush = r.door.sounds.indexOf('flush');
  assert.ok(flush >= 0 && r.door.sounds.indexOf('cheer') > flush, `the flush, then the chime: ${r.door.sounds}`);
  assert.equal(r.ff, 'ff');
  assert.equal(r.ffRate, 20);
  assert.ok(Math.abs(r.rate - 20) < 0.01, `the game runs 20 times over: ${r.rate}`);
  assert.deepEqual(r.lights, ['green', 'yellow', 'red'], 'the car lights change as usual, fast');
  assert.equal(r.across, 2, 'both copiers made it on an empty road');
  assert.equal(r.score, r.secs * 4, 'the seconds, × 2 more for the copiers, and once more for the one relieved too');
  assert.ok(r.tableShown, 'the score table shows over the green light');
  assert.deepEqual(r.rows, [
    [`${r.secs} s left`, String(r.secs)],
    ['2 people followed you on red', `+${2 * r.secs}`],
    ['1 person relieved too', `+${r.secs}`],
  ]);
  assert.equal(r.banner, `+${r.score}`);
  assert.ok(r.rising, 'the points count up as the seconds drain');
  assert.ok(r.took < 6, `no waiting out the seconds in real time: ${r.took.toFixed(1)} s from across to the end of the fast-forward`);
  // A copier still in the road during the fast-forward can be hit, and their share goes with them.
  const h = await page.evaluate(() => {
    const t = window.__walkOnRed;
    t.seed(3);
    t.startGame(10);
    t.manual = true;
    t.clearTraffic();
    t.put(t.layout().bottom - 2);
    for (let i = 0; i < 60 * 0.2; i++) t.step(1 / 60);
    t.put(0);
    // He is across; a follower still on the way, in the road, can be hit.
    let p = null;
    for (let i = 0; i < 60 * 3 && !p; i++) {
      t.step(1 / 60);
      p = t.copiers().find((q) => q.state === 'go' && t.layout().rows[q.row] === 'L');
    }
    if (!p) return { none: true };
    const v = t.spawnVehicle(p.row, 'bus');
    const want = t.colX(p.col);
    v.s = v.dir === 1 ? want + v.w / 2 + t.ENTRY : t.PLAY_W + t.ENTRY - (want - v.w / 2);
    v.speed = 0;
    v.v = 0;
    t.step(1 / 60);
    const hit = p.state;
    t.vehicles().length = 0; // gone before the next one walks the same footsteps
    for (let i = 0; i < 60 * 15 && t.game.mode !== 'green'; i++) t.step(1 / 60);
    const across = t.copiers().filter((q) => q.state === 'across').length;
    const greenScore = t.game.results[t.game.level].score;
    for (let i = 0; i < 60 * 6 && t.game.mode !== 'tally'; i++) t.step(1 / 60);
    return { hit, across, relieved: t.game.relieved, score: greenScore, after: t.game.results[t.game.level].score, secs: t.game.closedSecs };
  });
  assert.ok(!h.none, 'a copier was still in the road');
  assert.equal(h.hit, 'down', 'hit on the way, after he is across');
  assert.equal(h.across, 1);
  assert.equal(h.score, h.secs * (2 + h.relieved), 'the hit copier’s share is gone');
  assert.equal(h.after, h.score, 'crossing on green afterwards adds nothing');
  await context.close();
});

test('walk-on-red AC-6: if the walk light turns green before he is across, the level scores 0 and starts again', async () => {
  const { context, page } = await open();
  await startEmpty(page, 3);
  await page.evaluate(() => (window.__walkOnRed.game.red = 0.05));
  await run(page, 0.1);
  let s = await page.evaluate(() => ({ failed: window.__walkOnRed.game.failed, score: window.__walkOnRed.game.levelScore }));
  assert.deepEqual(s, { failed: true, score: 0 });
  await page.evaluate(() => {
    const t = window.__walkOnRed;
    for (let i = 0; i < 60 * 15 && t.game.mode !== 'tally'; i++) t.step(1 / 60);
  });
  s = await page.evaluate(() => ({ mode: window.__walkOnRed.game.mode, banner: document.querySelector('[data-banner-name]').textContent, total: window.__walkOnRed.game.score }));
  assert.equal(s.mode, 'tally');
  assert.equal(s.banner, 'Try again');
  assert.equal(s.total, 0);
  await run(page, 2.4);
  s = await page.evaluate(() => ({ mode: window.__walkOnRed.game.mode, level: window.__walkOnRed.game.level, red: Math.ceil(window.__walkOnRed.game.red) }));
  assert.deepEqual(s, { mode: 'play', level: 3, red: 30 }, 'the same level again');
  await context.close();
});

test('walk-on-red AC-7: followers stick to him as he steps off and walk his exact path, a lag apart; they catch up when he stops, wait while he is down, and start again with him', async () => {
  const { context, page } = await open();
  await startEmpty(page, 10);
  const r = await page.evaluate(() => {
    const t = window.__walkOnRed;
    const run = (s, each) => { for (let i = 0; i < Math.round(s * 60); i++) { t.step(1 / 60); if (each) each(); } };
    const b = t.layout().bottom;
    const [a, c] = t.copiers();
    const before = [a.state, c.state];
    // His path: up, right, up, up (onto the island), a hop every 0.3 s.
    const seen = [[], []];
    const note = () => [a, c].forEach((p, i) => { const k = `${p.row}:${p.col}`; if (seen[i][seen[i].length - 1] !== k) seen[i].push(k); });
    t.move('up');
    t.step(1 / 60);
    const joined = [a.state, c.state];
    const bang = t.popups().filter((pp) => pp.text === '!').length;
    run(0.3, note);
    t.move('right');
    run(0.3, note);
    t.move('up');
    run(0.3, note);
    t.move('up');
    run(2, note);
    const path = [`${b}:${t.PCOL}`, `${b - 1}:${t.PCOL}`, `${b - 1}:${t.PCOL + 1}`, `${b - 2}:${t.PCOL + 1}`, `${b - 3}:${t.PCOL + 1}`];
    const caught = [a, c].every((p) => p.row === t.player.row && p.col === t.player.col);
    // Hit in the next lane, with the first follower a step behind him in the road.
    const m = t.player.row;
    t.move('up');
    run(0.3);
    t.move('up');
    run(0.25);
    const at = [a.row, c.row];
    const v = t.spawnVehicle(t.player.row, 'sedan');
    const want = t.colX(t.player.col);
    v.s = v.dir === 1 ? want + v.w / 2 + t.ENTRY : t.PLAY_W + t.ENTRY - (want - v.w / 2);
    v.speed = 0;
    v.v = 0;
    t.step(1 / 60);
    const down = t.player.down > 0;
    t.vehicles().length = 0;
    const frozen = [a.row, c.row];
    run(1);
    const still = [a.row, c.row];
    run(2);
    const back = { rows: [a.row, c.row, t.player.row], states: [a.state, c.state], home: [a.col === a.homeCol, c.col === c.homeCol], col: t.player.col };
    t.move('up');
    t.step(1 / 60);
    const again = [a.state, c.state];
    return { b, before, joined, bang, seen, path, caught, m, at, down, frozen, still, back, again, pcol: t.PCOL };
  });
  assert.deepEqual(r.before, ['wait', 'wait']);
  assert.deepEqual(r.joined, ['go', 'go'], 'they stick to him as he steps off');
  assert.equal(r.bang, 2, 'a "!" over each');
  for (const s of r.seen) {
    const from = s.indexOf(r.path[0]);
    assert.ok(from >= 0, `onto his starting cell: ${s}`);
    assert.deepEqual(s.slice(from), r.path, 'his exact path');
  }
  assert.ok(r.caught, 'when he stops they catch up to his cell');
  assert.ok(r.down);
  assert.ok(r.at[0] < r.m, `the first follower was in the road behind him: ${r.at}`);
  assert.deepEqual(r.still, r.frozen, 'they wait while he is down');
  assert.deepEqual(r.back, { rows: [r.b, r.b, r.b], states: ['wait', 'wait'], home: [true, true], col: r.pcol }, 'all back at the start');
  assert.deepEqual(r.again, ['go', 'go'], 'and they stick to him again as he sets off');
  await context.close();
});

test('walk-on-red AC-8: a follower hit by a car tumbles and is gone, and no longer counts', async () => {
  const { context, page } = await open();
  await startEmpty(page, 7);
  const r = await page.evaluate(() => {
    const t = window.__walkOnRed;
    const run = (s) => { for (let i = 0; i < Math.round(s * 60); i++) t.step(1 / 60); };
    const p = t.copiers()[0];
    p.state = 'go';
    p.row = t.layout().bottom - 1;
    p.hopT = 99;
    t.put(t.layout().bottom - 2);
    const v = t.spawnVehicle(p.row, 'sedan');
    const want = t.colX(p.col);
    v.s = v.dir === 1 ? want + v.w / 2 + t.ENTRY : t.PLAY_W + t.ENTRY - (want - v.w / 2);
    v.speed = 0;
    v.v = 0;
    t.step(1 / 60);
    const hit = p.state;
    t.vehicles().length = 0;
    run(1.2);
    return { hit, after: p.state, mode: t.game.mode, row: p.row, b: t.layout().bottom, lives: t.game.lives };
  });
  assert.equal(r.hit, 'down');
  assert.equal(r.lives, 3, 'a follower hit costs no life');
  assert.equal(r.after, 'gone', 'gone, not back to the crowd');
  assert.equal(r.mode, 'play', 'the level carries on');
  await context.close();
});

test('walk-on-red AC-9: a hit with a life to spare knocks the player down and sends him back to the start, one life fewer', async () => {
  const { context, page } = await open();
  await startEmpty(page, 2);
  const m = await page.evaluate(() => {
    const t = window.__walkOnRed;
    const m = t.layout().rows.indexOf('M');
    t.put(m);
    t.move('up');
    for (let i = 0; i < 10; i++) t.step(1 / 60);
    return m;
  });
  await carOn(page, m - 1, await page.evaluate(() => window.__walkOnRed.PCOL));
  await run(page, 0.05);
  assert.ok(await page.evaluate(() => window.__walkOnRed.player.down > 0));
  await page.evaluate(() => (window.__walkOnRed.vehicles().length = 0));
  await run(page, 1.3);
  const back = await page.evaluate(() => {
    const t = window.__walkOnRed;
    return [t.player.row, t.player.col, t.player.down, t.game.mode, t.layout().bottom, t.PCOL, t.game.lives];
  });
  assert.deepEqual(back.slice(0, 4), [back[4], back[5], 0, 'play'], 'on the near kerb, at his starting column');
  assert.equal(back[6], 2, 'one life fewer');
  await context.close();
});

test('walk-on-red AC-10: the 21 levels: nobody follows until level 8, then one, two, three', async () => {
  const { context, page } = await open();
  const levels = await page.evaluate(() =>
    window.__walkOnRed.LEVELS.map((l) => ({
      copiers: l.copiers,
      medians: l.rows.filter((r) => r === 'M').length,
      sirens: !!l.sirens,
      buses: l.lanes.some((ln) => ln.set.includes('bus') && ln.set.includes('truck')),
    }))
  );
  assert.equal(levels.length, 21);
  assert.deepEqual(levels.map((l) => l.copiers), [0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3]);
  assert.deepEqual(levels.slice(0, 2).map((l) => l.medians), [0, 0], 'no island on the first two');
  assert.ok(levels.slice(2).every((l) => l.medians >= 1), 'an island from level 3');
  assert.equal(levels.findIndex((l) => l.sirens), 3, 'sirens from level 4');
  assert.equal(levels.findIndex((l) => l.buses), 4, 'buses and trucks from level 5');
  await context.close();
});

test('walk-on-red AC-11: a siren warns 2.5 s ahead', async () => {
  const { context, page } = await open();
  await startEmpty(page, 3);
  const r = await page.evaluate(() => {
    const t = window.__walkOnRed;
    t.game.sirenIn = 0.01;
    t.heard.length = 0;
    let at = 0;
    let flashing = false;
    for (let i = 0; i < 60 * 2.4; i++) {
      t.step(1 / 60);
      flashing = flashing || !!t.game.siren;
      if (!at && t.vehicles().some((v) => v.siren)) at = (i + 1) / 60;
    }
    for (let i = 0; i < 60 * 1; i++) {
      t.step(1 / 60);
      if (!at && t.vehicles().some((v) => v.siren)) at = 2.4 + (i + 1) / 60;
    }
    return { warned: t.heard.some((h) => h.name === 'siren'), flashing, at };
  });
  assert.ok(r.warned && r.flashing);
  assert.ok(r.at >= 2.45, `the siren came after ${r.at} s`);
  // A car with the emergency vehicle coming up behind it pulls aside, and back once it has passed.
  const aside = await page.evaluate(() => {
    const t = window.__walkOnRed;
    t.clearTraffic();
    const lane = t.layout().lanes[0].row;
    const car = t.spawnVehicle(lane, 'sedan', 200);
    car.speed = 10;
    car.v = 10;
    const siren = t.spawnVehicle(lane, 'ambulance', 150);
    siren.siren = true;
    siren.speed = 50;
    siren.v = 50;
    for (let i = 0; i < 30; i++) t.step(1 / 60);
    const during = car.yo;
    for (let i = 0; i < 60 * 4; i++) t.step(1 / 60);
    return { during, after: car.yo };
  });
  assert.ok(aside.during <= -3, `pulled aside: ${aside.during}`);
  assert.ok(Math.abs(aside.after) < 0.5, `back in its lane: ${aside.after}`);
  await context.close();
});

test('walk-on-red AC-12: after level 21 the run ends with the total, the stars and the best', async () => {
  const { context, page } = await open();
  const total = await finishRun(page, 300);
  const s = await page.evaluate(() => ({
    mode: window.__walkOnRed.game.mode,
    over: !document.querySelector('[data-screen="over"]').hidden,
    score: document.querySelector('[data-final-score]').textContent,
    detail: document.querySelector('[data-final-detail]').textContent,
    title: document.querySelector('[data-over-title]').textContent,
  }));
  assert.equal(s.mode, 'over');
  assert.ok(s.over);
  assert.equal(s.title, 'Across!');
  assert.ok(total > 300);
  assert.equal(s.score, String(total));
  assert.match(s.detail, new RegExp(`of 63 stars · Best: ${total}`));
  await page.click('[data-again]');
  assert.equal(await page.evaluate(() => window.__walkOnRed.game.mode), 'title');
  assert.ok(await page.evaluate(() => !document.querySelector('[data-screen="start"]').hidden));
  await context.close();
});

test('walk-on-red AC-13: the hidden assist rises with a hit, falls with a copier across, and slows traffic', async () => {
  const { context, page } = await open();
  const first = await page.evaluate(() => {
    window.__walkOnRed.startGame(0);
    return window.__walkOnRed.game.assist;
  });
  assert.equal(first, 0.4);
  await startEmpty(page, 2);
  const r = await page.evaluate(() => {
    const t = window.__walkOnRed;
    t.game.assist = 0.5;
    t.put(t.layout().bottom - 1);
    const v = t.spawnVehicle(t.layout().bottom - 1, 'sedan');
    const want = t.colX(t.PCOL);
    v.s = v.dir === 1 ? want + v.w / 2 + t.ENTRY : t.PLAY_W + t.ENTRY - (want - v.w / 2);
    t.step(1 / 60);
    const afterHit = t.game.assist;
    t.vehicles().length = 0;
    for (let i = 0; i < 90; i++) t.step(1 / 60);
    // A follower across.
    t.startGame(7);
    t.manual = true;
    t.clearTraffic();
    t.game.assist = 0.5;
    t.put(t.layout().bottom - 2);
    for (let i = 0; i < 60 * 1; i++) t.step(1 / 60);
    t.put(0);
    for (let i = 0; i < 60 * 6 && !t.copiers().some((p) => p.state === 'across'); i++) t.step(1 / 60);
    const afterAcross = t.game.assist;
    const dist = (a) => {
      t.startGame(1);
      t.manual = true;
      t.clearTraffic();
      t.game.assist = a;
      const u = t.spawnVehicle(t.layout().lanes[0].row, 'sedan', 0);
      u.speed = 20;
      u.v = 20;
      for (let i = 0; i < 60; i++) t.step(1 / 60);
      return u.s;
    };
    return { afterHit, afterAcross, slow: dist(1), fast: dist(0) };
  });
  assert.equal(r.afterHit, 0.75);
  assert.ok(Math.abs(r.afterAcross - 0.47) < 1e-9, `after a copier across: ${r.afterAcross}`);
  assert.ok(r.slow < r.fast * 0.8, `slower with the assist: ${r.slow} vs ${r.fast}`);
  const next = await page.evaluate(() => {
    const t = window.__walkOnRed;
    t.startGame(t.LEVELS.length - 1);
    t.manual = true;
    t.clearTraffic();
    t.put(0);
    t.game.assist = 1;
    for (let i = 0; i < 60 * 30 && t.game.mode !== 'over'; i++) t.step(1 / 60);
    const last = t.saved.assist;
    t.startGame(0);
    return { last, next: t.game.assist };
  });
  assert.ok(next.last > 0.8, `the run ended with a high assist: ${next.last}`);
  assert.ok(Math.abs(next.next - Math.min(0.7, 0.6 * next.last)) < 1e-9, `next run: ${next.next}`);
  await context.close();
});

test('walk-on-red AC-14: hiding the page pauses; the resuming tap doesn’t hop and nothing hits for 0.5 s', async () => {
  const { context, page } = await open();
  await startEmpty(page, 1);
  await page.evaluate(() => {
    const t = window.__walkOnRed;
    t.manual = false;
    t.put(t.layout().bottom - 1);
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  const r0 = await page.evaluate(() => window.__walkOnRed.game.red);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForTimeout(400);
  const s = await page.evaluate(() => ({
    paused: window.__walkOnRed.game.paused,
    card: !document.querySelector('[data-screen="paused"]').hidden,
    red: window.__walkOnRed.game.red,
  }));
  assert.equal(s.paused, true);
  assert.ok(s.card);
  assert.equal(s.red, r0, 'frozen until a tap');
  const r = await page.evaluate(() => {
    const t = window.__walkOnRed;
    t.manual = true;
    const c = document.getElementById('street');
    c.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 5, clientX: 100, clientY: 300, bubbles: true }));
    c.dispatchEvent(new PointerEvent('pointerup', { pointerId: 5, clientX: 100, clientY: 300, bubbles: true }));
    const row = t.player.row;
    const lane = t.layout().bottom - 1;
    const v = t.spawnVehicle(lane, 'sedan');
    const want = t.colX(t.PCOL);
    v.s = v.dir === 1 ? want + v.w / 2 + t.ENTRY : t.PLAY_W + t.ENTRY - (want - v.w / 2);
    v.speed = 0;
    v.v = 0;
    for (let i = 0; i < 24; i++) t.step(1 / 60);
    const during = t.player.down > 0;
    for (let i = 0; i < 12; i++) t.step(1 / 60);
    return { paused: t.game.paused, row, lane, during, afterwards: t.player.down > 0 };
  });
  assert.equal(r.paused, false);
  assert.equal(r.row, r.lane, 'the tap that resumed did not hop');
  assert.equal(r.during, false);
  assert.equal(r.afterwards, true);
  // It pauses during the green light too.
  const later = await page.evaluate(() => {
    const t = window.__walkOnRed;
    t.startGame(0);
    t.manual = true;
    t.clearTraffic();
    t.game.red = 0.01;
    for (let i = 0; i < 60 * 5 && t.game.mode !== 'green'; i++) t.step(1 / 60);
    const mode = t.game.mode;
    t.pause();
    const paused = t.game.paused;
    const phase = t.game.phaseT;
    for (let i = 0; i < 60; i++) t.step(1 / 60);
    return { mode, paused, frozen: t.game.phaseT === phase };
  });
  assert.deepEqual(later, { mode: 'green', paused: true, frozen: true });
  await context.close();
});

test('walk-on-red AC-15: the best total and the best stars per level are kept and shown on the start card', async () => {
  const { context, page } = await open();
  await page.evaluate(() => localStorage.setItem('walk-on-red', JSON.stringify({ best: 120, stars: [3, 2, 1], assist: 0.2 })));
  await page.reload();
  await page.waitForFunction(() => window.__walkOnRed);
  const shown = await page.evaluate(() => {
    const el = document.querySelector('[data-best]');
    return { hidden: el.hidden, text: el.textContent };
  });
  assert.deepEqual(shown, { hidden: false, text: 'Best 120 · 6 ★' });
  // A level with a better result raises its stars; a worse one leaves them.
  const saved = await page.evaluate(() => {
    const t = window.__walkOnRed;
    t.startGame(3);
    t.manual = true;
    t.clearTraffic();
    t.put(0);
    for (let i = 0; i < 60 * 40 && t.game.mode !== 'tally'; i++) t.step(1 / 60);
    return JSON.parse(localStorage.getItem('walk-on-red'));
  });
  assert.ok(saved.stars[3] >= 1, `level 4 stars: ${saved.stars[3]}`);
  assert.deepEqual(saved.stars.slice(0, 3), [3, 2, 1]);
  await context.close();
});

test('walk-on-red AC-16: each state shows only its own card, HUD and banner', async () => {
  const { context, page } = await open();
  const shown = () =>
    page.evaluate(() => {
      const vis = (sel) => !document.querySelector(sel).hidden;
      return {
        start: vis('[data-screen="start"]'),
        paused: vis('[data-screen="paused"]'),
        over: vis('[data-screen="over"]'),
        hud: vis('[data-hud]'),
        banner: vis('[data-banner]') ? document.querySelector('[data-banner-name]').textContent : null,
      };
    });
  const until = (mode) =>
    page.evaluate((mode) => {
      const t = window.__walkOnRed;
      for (let i = 0; i < 60 * 20 && t.game.mode !== mode; i++) t.step(1 / 60);
      return t.game.mode;
    }, mode);
  assert.deepEqual(await shown(), { start: true, paused: false, over: false, hud: false, banner: null });
  await startEmpty(page, 0);
  assert.deepEqual(await shown(), { start: false, paused: false, over: false, hud: true, banner: 'Quiet Street' }, 'the level’s name just after Start');
  await page.waitForTimeout(1800);
  assert.equal((await shown()).banner, null, 'then it goes');
  // Paused while playing.
  await page.evaluate(() => window.__walkOnRed.pause());
  assert.deepEqual(await shown(), { start: false, paused: true, over: false, hud: true, banner: null });
  await page.evaluate(() => window.__walkOnRed.resume());
  await page.evaluate(() => window.__walkOnRed.put(0));
  // In the loo, then the fast-forward: the HUD, no card, no banner.
  const stage = (st) =>
    page.evaluate((st) => {
      const t = window.__walkOnRed;
      for (let i = 0; i < 60 * 5 && t.game.stage !== st; i++) t.step(1 / 60);
      return t.game.mode === 'finish' && t.game.stage;
    }, st);
  const across = { start: false, paused: false, over: false, hud: true, banner: null };
  assert.equal(await stage('door'), 'door');
  assert.deepEqual(await shown(), across, 'in the loo');
  assert.equal(await stage('ff'), 'ff');
  assert.deepEqual(await shown(), across, 'fast-forward');
  assert.equal(await until('green'), 'green');
  await page.waitForTimeout(100);
  const green = await shown();
  assert.match(green.banner, /^\+\d+$/, 'the score table over the green light');
  assert.deepEqual({ ...green, banner: null }, { start: false, paused: false, over: false, hud: true, banner: null });
  assert.equal(await page.evaluate(() => document.querySelector('[data-clock]')), null, 'no clock in the HUD');
  assert.equal(await until('tally'), 'tally');
  const tally = await shown();
  assert.match(tally.banner, /^\+\d+$/, 'the tally');
  // Paused during the tally: the paused card, the banner as it was.
  await page.evaluate(() => window.__walkOnRed.pause());
  assert.deepEqual(await shown(), { ...tally, paused: true });
  await page.evaluate(() => window.__walkOnRed.resume());
  await finishRun(page);
  assert.deepEqual(await shown(), { start: false, paused: false, over: true, hud: false, banner: null });
  await context.close();
});

test('walk-on-red AC-17: the game works offline once it has been played', async () => {
  const { context, page } = await open();
  await page.evaluate(() => navigator.serviceWorker.register('../sw.js'));
  await page.evaluate(() => Promise.race([navigator.serviceWorker.ready, new Promise((r) => setTimeout(r, 10000))]));
  await page.reload();
  await page.waitForFunction(() => window.__walkOnRed);
  await page.waitForLoadState('networkidle');
  await context.setOffline(true);
  await page.reload();
  await page.waitForFunction(() => window.__walkOnRed);
  await page.click('[data-play]');
  assert.equal(await page.evaluate(() => window.__walkOnRed.game.mode), 'play');
  await context.close();
});

test('walk-on-red AC-18: the view is the crossing edge to edge on every screen, one width, it fits, and a turn only rescales', async () => {
  for (const [w, h, minPerson] of [
    [390, 844, 36],
    [360, 640, 36],
    [844, 390, 0],
    [1280, 720, 0],
  ]) {
    const { context, page } = await open({ viewport: { width: w, height: h } });
    const before = await page.evaluate(() => window.__walkOnRed.view.width);
    for (const level of [0, 7]) {
      const v = await page.evaluate((level) => {
        const t = window.__walkOnRed;
        t.startGame(level);
        const edges = [t.view.x0, t.view.x0 + t.view.lw];
        return { ...t.view, edges, crossing: [t.CROSS_C0 * 12, (t.CROSS_C1 + 1) * 12], scrollW: document.documentElement.scrollWidth, scrollH: document.documentElement.scrollHeight };
      }, level);
      assert.deepEqual(v.edges, v.crossing, `${w}×${h}: the view is the crossing, edge to edge`);
      assert.ok(Math.abs(v.width - before) < 0.5, `${w}×${h}: the width stays ${before} (now ${v.width})`);
      assert.ok(v.top >= 0 && v.bottom <= h + 0.5, `${w}×${h} level ${level}: ${v.top}–${v.bottom}`);
      assert.ok(v.person >= minPerson, `${w}×${h}: a person is ${v.person} px`);
      assert.ok(v.scrollW <= w && v.scrollH <= h, 'no scrolling');
    }
    await context.close();
  }
  {
    // Desktop: the same upright view, centred, with plain background either side.
    const { context, page } = await open({ viewport: { width: 1280, height: 720 } });
    const w0 = await page.evaluate(() => window.__walkOnRed.view.width);
    await page.click('[data-play]');
    await page.waitForTimeout(300);
    const d = await page.evaluate(() => {
      const t = window.__walkOnRed;
      const c = document.getElementById('street');
      const g = c.getContext('2d');
      const k = c.width / window.innerWidth;
      const at = (x, y) => Array.from(g.getImageData(Math.round(x * k), Math.round(y * k), 1, 1).data.slice(0, 3));
      const mid = (t.view.top + t.view.bottom) / 2;
      return { ...t.view, side: [at(8, mid), at(window.innerWidth - 8, mid)], inside: at(t.view.left + 4, mid) };
    });
    assert.ok(Math.abs(d.width - w0) < 0.5, 'Start keeps the width');
    assert.ok(d.width < 720, `upright, not wide: ${d.width} px`);
    assert.ok(Math.abs(d.left - (1280 - d.width) / 2) < 1, `centred: ${d.left}`);
    assert.deepEqual(d.side, [[43, 47, 58], [43, 47, 58]], 'plain background either side');
    assert.notDeepEqual(d.inside, [43, 47, 58], 'the street itself');
    await context.close();
  }
  const { context, page } = await open();
  await page.evaluate(() => {
    const t = window.__walkOnRed;
    t.seed(5);
    t.startGame(2);
    t.manual = true;
    t.put(3);
  });
  const state = () =>
    page.evaluate(() => {
      const t = window.__walkOnRed;
      return JSON.stringify({ p: [t.player.col, t.player.row], c: t.copiers().map((p) => [p.col, p.row, p.state]), v: t.vehicles().map((v) => [v.lane, Math.round(v.s * 1000)]), r: t.game.red, s: t.game.score, mode: t.game.mode, paused: t.game.paused });
    });
  const before = await state();
  for (const [w, h] of [[414, 896], [896, 414], [390, 844]]) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(100);
    assert.equal(await state(), before, `turned to ${w}×${h}: nothing changed`);
  }
  await context.close();
});

test('walk-on-red AC-19: hops, followers sticking and arriving, hits, the green light and the end have their sounds', async () => {
  const { context, page } = await open();
  await startEmpty(page, 14);
  const r = await page.evaluate(() => {
    const t = window.__walkOnRed;
    const names = () => t.heard.map((h) => h.name);
    const run = (s) => { for (let i = 0; i < Math.round(s * 60); i++) t.step(1 / 60); };
    t.heard.length = 0;
    t.move('up');
    run(0.2);
    const hop = names();
    const setOff = hop;
    t.heard.length = 0;
    t.put(0);
    for (let i = 0; i < 60 * 30 && t.game.mode !== 'tally'; i++) t.step(1 / 60);
    const arrive = t.heard.filter((h) => h.name === 'arrive').map((h) => h.rate);
    const green = names();
    const loo = names().filter((n) => n === 'flush' || n === 'cheer');
    t.startGame(1);
    t.manual = true;
    t.clearTraffic();
    t.heard.length = 0;
    t.put(t.layout().bottom - 1);
    const v = t.spawnVehicle(t.layout().bottom - 1, 'sedan');
    const want = t.colX(t.PCOL);
    v.s = v.dir === 1 ? want + v.w / 2 + t.ENTRY : t.PLAY_W + t.ENTRY - (want - v.w / 2);
    t.step(1 / 60);
    const hit = names();
    return { hop, setOff, arrive, green, loo, hit };
  });
  assert.ok(r.hop.some((n) => n === 'step' || n === 'step2'), 'a footstep');
  assert.ok(r.setOff.includes('join'), 'the pluck as followers stick to him');
  assert.ok(r.arrive.length >= 3, `the chime as each copier arrives (${r.arrive})`);
  for (let i = 1; i < 3; i++) assert.ok(r.arrive[i] > r.arrive[i - 1], `each chime higher: ${r.arrive}`);
  assert.ok(r.green.includes('street') && r.green.includes('walk'), 'the green light');
  assert.deepEqual(r.loo.slice(0, 2), ['flush', 'cheer'], 'into the loo: the flush, then the chime');
  assert.ok(r.hit.includes('hit') && r.hit.includes('horn'));
  await page.evaluate(() => (window.__walkOnRed.heard.length = 0));
  await finishRun(page);
  assert.ok(await page.evaluate(() => window.__walkOnRed.heard.some((h) => h.name === 'over')), 'the closing jingle');
  await context.close();
});

test('walk-on-red AC-20: what the level is worth while playing, ×2 as a follower arrives, nothing about points on the start card; the walk light counts down', async () => {
  const { context, page } = await open();
  await startEmpty(page, 7);
  await page.evaluate(() => (window.__walkOnRed.manual = false));
  await page.waitForTimeout(200);
  const label = await page.evaluate(() => {
    const t = window.__walkOnRed;
    return { text: t.drawn.payout, clear: t.drawn.payoutClear, red: Math.ceil(t.game.red), countdown: t.drawn.countdown };
  });
  assert.equal(label.text, `${label.red} s × 1 person = ${label.red}`);
  assert.ok(label.clear, 'clear of the porta-potty, whatever the font');
  assert.equal(label.countdown, label.red, 'the walk light’s countdown matches');
  // A copier arriving shows the new multiplier.
  const popup = await page.evaluate(() => {
    const t = window.__walkOnRed;
    t.manual = true;
    t.put(0);
    for (let i = 0; i < 60 * 10 && !t.popups().some((pp) => pp.text.startsWith('×')); i++) t.step(1 / 60);
    return t.popups().map((pp) => pp.text);
  });
  assert.ok(popup.includes('×2'), `the first copier across shows ×2: ${popup}`);
  // The start card says nothing about points: the first level's table teaches it.
  await page.evaluate(() => window.__walkOnRed.showStart());
  assert.doesNotMatch(await page.locator('[data-screen="start"]').textContent(), /points/i);
  await context.close();
});

test('walk-on-red AC-22: a car coming close to him honks, deep for big vehicles and high for small ones', async () => {
  const { context, page } = await open();
  await startEmpty(page, 1);
  const r = await page.evaluate(() => {
    const t = window.__walkOnRed;
    const lane = t.layout().bottom - 1;
    t.put(lane);
    t.game.grace = 0;
    const honkFor = (name) => {
      t.vehicles().length = 0;
      t.heard.length = 0;
      const v = t.spawnVehicle(lane, name);
      const x = t.colX(t.player.col);
      // Its front 8 art px from him, coming at 20 px/s.
      if (v.dir === 1) v.s = x - 2.5 - 8 + v.w * 0.1 + t.ENTRY;
      else v.s = t.PLAY_W + t.ENTRY - (x + 2.5 + 8 - v.w * 0.1);
      v.speed = 20;
      v.v = 20;
      t.step(1 / 60);
      const h = t.heard.filter((e) => e.name === 'horn');
      t.vehicles().length = 0;
      return h.length ? h[0].rate : 0;
    };
    return { bus: honkFor('bus'), sedan: honkFor('sedan'), sports: honkFor('sports_red') };
  });
  assert.ok(r.bus > 0 && r.sedan > 0 && r.sports > 0, `each honked: ${JSON.stringify(r)}`);
  assert.ok(r.bus < r.sedan && r.sedan < r.sports, `deep to high: ${JSON.stringify(r)}`);
  await context.close();
});


test('walk-on-red AC-23: every level starts with traffic and a car passing in front of him; from level 2 every lane is busy and tapping straight up gets him hit', async () => {
  const { context, page } = await open();
  const r = await page.evaluate(() => {
    const t = window.__walkOnRed;
    const out = [];
    for (let level = 0; level < t.LEVELS.length; level++) {
      let hits = 0;
      let empty = 0;
      const cars = [];
      const inFront = [];
      for (const seed of [1, 2, 3, 4]) {
        t.seed(seed);
        t.startGame(level);
        t.manual = true;
        t.game.assist = 0;
        t.game.lives = 99; // this measures how often he's hit, not how far 3 lives get him
        cars.push(t.vehicles().length);
        // A car in the first lane right across his column.
        const x = t.colX(t.PCOL);
        inFront.push(t.vehicles().some((v) => v.lane === t.layout().bottom - 1 && t.xOf(v) < x + 12 && t.xOf(v) + v.w > x - 12));
        // A lane with no vehicle anywhere on it at the start.
        empty += t.layout().lanes.filter((ln) => !t.vehicles().some((v) => v.lane === ln.row && !v.siren)).length;
        let was = false;
        for (let i = 0; i < 60 * 20 && t.game.mode === 'play'; i++) {
          t.step(1 / 60);
          if (t.player.down > 0) {
            if (!was) hits++;
            was = true;
          } else was = false;
          if (i % 9 === 0) t.move('up');
        }
      }
      out.push({ level: level + 1, hits, empty, cars, inFront });
    }
    return out;
  });
  for (const l of r) assert.deepEqual(l.inFront, [true, true, true, true], `level ${l.level}: a car passing in front of him`);
  assert.ok(r[0].cars.every((n) => n >= 2), `level 1 has traffic too: ${r[0].cars}`);
  for (const l of r.slice(1)) {
    assert.equal(l.empty, 0, `level ${l.level}: every lane has traffic at the start`);
    assert.ok(l.hits >= 4, `level ${l.level}: tapping straight up, ${l.hits} hits in 4 tries`);
  }
  await context.close();
});

test('walk-on-red AC-24: from level 10 the last follower needs the loo too: only they and he hop from foot to foot; across, they go in after him, for a bonus', async () => {
  const { context, page } = await open();
  const r = await page.evaluate(() => {
    const t = window.__walkOnRed;
    const urgentBy = [];
    for (let level = 0; level < t.LEVELS.length; level++) {
      t.seed(1);
      t.startGame(level);
      urgentBy.push(t.copiers().filter((p) => p.urgent).length);
    }
    t.seed(2);
    t.startGame(10);
    t.manual = true;
    t.clearTraffic();
    const [calm, urgent] = t.copiers();
    // Standing still for 4 s: he hops from foot to foot, the urgent copier too, the other never.
    const moved = (p) => {
      const xs = new Set();
      for (let i = 0; i < 60 * 4; i++) {
        t.step(1 / 60);
        xs.add(t.jiggle(p));
      }
      return xs.size > 1;
    };
    const wiggles = { calm: moved(calm), urgent: moved(urgent) };
    t.put(t.layout().bottom - 2);
    for (let i = 0; i < 60; i++) t.step(1 / 60);
    t.put(0);
    let stages = [];
    let outBeforeIn = null;
    t.heard.length = 0;
    for (let i = 0; i < 60 * 20 && t.game.mode !== 'green'; i++) {
      t.step(1 / 60);
      if (!stages.includes(t.game.stage)) stages.push(t.game.stage);
      if (t.game.stage === 'relief' && outBeforeIn === null && urgent.inLoo) outBeforeIn = !t.player.inside;
    }
    const flushes = t.heard.filter((h) => h.name === 'flush').length;
    return { urgentBy, wiggles, stages, outBeforeIn, inLoo: urgent.inLoo, relieved: t.game.relieved, flushes, score: t.game.results[10].score, secs: t.game.closedSecs };
  });
  assert.deepEqual(r.urgentBy, [0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], 'one from level 10');
  assert.deepEqual(r.wiggles, { calm: false, urgent: true }, 'only the copier who needs it hops from foot to foot');
  assert.ok(r.stages.includes('relief'), `stages: ${r.stages}`);
  assert.equal(r.outBeforeIn, true, 'he steps out before they go in');
  assert.ok(r.inLoo && r.relieved === 1);
  assert.equal(r.flushes, 2, 'his flush, then theirs');
  assert.equal(r.score, r.secs * 4, 'the seconds once more for them');
  await context.close();
});

test('walk-on-red AC-25: the page is 8-bit too: the game’s pixel font, square boxes, no blur', async () => {
  const { context, page } = await open();
  await page.evaluate(() => document.fonts.ready);
  const r = await page.evaluate(() => {
    window.__walkOnRed.startGame(0);
    window.__walkOnRed.pause();
    const look = (sel) => {
      const cs = getComputedStyle(document.querySelector(sel));
      return { font: cs.fontFamily.includes('Kenney Mini Square'), radius: cs.borderTopLeftRadius, blur: cs.backdropFilter };
    };
    return {
      loaded: document.fonts.check('16px "Kenney Mini Square"'),
      start: look('[data-screen="start"]'),
      paused: look('[data-screen="paused"]'),
      banner: look('[data-banner]'),
      hud: look('[data-hud]'),
      play: look('[data-play]'),
      mute: look('[data-mute]'),
      back: look('.shell-back'),
    };
  });
  assert.ok(r.loaded, 'the pixel font loads');
  // The HUD's bar keeps one width whatever the score.
  const widths = await page.evaluate(async () => {
    const t = window.__walkOnRed;
    t.resume();
    t.manual = true;
    const out = [];
    for (const score of [0, 7, 88, 1111, 88888]) {
      t.game.score = score;
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      out.push([document.querySelector('[data-score]').textContent, document.querySelector('.quota').getBoundingClientRect().width]);
    }
    return out;
  });
  assert.deepEqual(widths.map((w) => w[0]), ['0', '7', '88', '1111', '88888'], 'the score shows');
  assert.ok(widths.every((w) => w[1] === widths[0][1] && w[1] > 0), `the bar keeps its width: ${JSON.stringify(widths)}`);
  for (const [what, l] of Object.entries(r)) {
    if (what === 'loaded') continue;
    assert.deepEqual(l, { font: true, radius: '0px', blur: 'none' }, what);
  }
  await context.close();
});

test('walk-on-red AC-26: the game is called Gotta Go!, and nothing the player sees says Walk on Red', async () => {
  const { context, page, errors } = await open();
  assert.equal(await page.title(), 'Gotta Go!');
  assert.equal((await page.locator('[data-screen="start"] h1').textContent()).trim(), 'Gotta Go!');
  const seen = await page.evaluate(() => document.title + ' ' + document.body.innerText + ' ' + document.querySelector('meta[name="description"]').content);
  assert.ok(!/walk on red/i.test(seen), 'no "Walk on Red" left');
  assert.deepEqual(errors, []);
  await context.close();
});

test('walk-on-red AC-28: a run has 3 lives in the HUD; a hit empties one, a follower hit or running out of time none; the next level keeps them; a new run has 3', async () => {
  const { context, page } = await open();
  await startEmpty(page, 2);
  assert.deepEqual(await hearts(page), { full: 3, lost: 0, label: '3 lives left', shown: true });
  assert.ok(await hitOnce(page));
  await run(page, 0.1);
  assert.deepEqual(await hearts(page), { full: 2, lost: 1, label: '2 lives left', shown: true }, 'a hit empties one');
  await run(page, 1.3);
  assert.equal(await page.evaluate(() => window.__walkOnRed.game.mode), 'play');
  // Too slow: the level again, no life lost.
  await page.evaluate(() => (window.__walkOnRed.game.red = 0.05));
  await page.evaluate(() => {
    const t = window.__walkOnRed;
    for (let i = 0; i < 60 * 30 && !(t.game.mode === 'play' && t.game.red > 20); i++) t.step(1 / 60);
  });
  assert.deepEqual(await page.evaluate(() => [window.__walkOnRed.game.mode, window.__walkOnRed.game.level, window.__walkOnRed.game.lives]), ['play', 2, 2], 'too slow costs no life');
  // Across: the next level keeps the lives left.
  await page.evaluate(() => {
    const t = window.__walkOnRed;
    t.clearTraffic();
    t.put(0);
    for (let i = 0; i < 60 * 30 && t.game.level === 2; i++) t.step(1 / 60);
  });
  assert.deepEqual(await page.evaluate(() => [window.__walkOnRed.game.level, window.__walkOnRed.game.lives]), [3, 2], 'the next level keeps them');
  await run(page, 0.1);
  assert.equal((await hearts(page)).full, 2);
  // A new run: 3 again.
  await startEmpty(page, 0);
  await run(page, 0.1);
  assert.deepEqual(await hearts(page), { full: 3, lost: 0, label: '3 lives left', shown: true }, 'a new run has 3');
  // The hearts fit at 360 px and the HUD keeps one width.
  await page.setViewportSize({ width: 360, height: 640 });
  await run(page, 0.1);
  const fit = await page.evaluate(() => {
    const hud = document.querySelector('[data-hud]').getBoundingClientRect();
    const l = document.querySelector('[data-lives]').getBoundingClientRect();
    return { inside: l.left >= hud.left && l.right <= hud.right, scroll: document.documentElement.scrollWidth <= innerWidth };
  });
  assert.deepEqual(fit, { inside: true, scroll: true });
  await context.close();
});

test('walk-on-red AC-29: the third hit stops the level, he stays down, then Game over shows the total, stars and best; Play again leads to a new run with 3 lives', async () => {
  const { context, page } = await open();
  await page.evaluate(() => (window.__walkOnRed.saved.best = 0));
  await startEmpty(page, 4);
  await page.evaluate(() => {
    const t = window.__walkOnRed;
    t.game.score = 120;
    t.game.results = [{ score: 40, stars: 2 }, { score: 40, stars: 2 }, { score: 40, stars: 1 }, { score: 0, stars: 0 }];
  });
  for (let i = 0; i < 2; i++) {
    assert.ok(await hitOnce(page));
    await run(page, 1.3);
  }
  assert.equal(await page.evaluate(() => window.__walkOnRed.game.lives), 1);
  // The last hit with under 1.2 s on the walk light: the hit wins, the light doesn't turn green.
  await page.evaluate(() => (window.__walkOnRed.game.red = 0.5));
  assert.ok(await hitOnce(page));
  const out = await page.evaluate(() => {
    const t = window.__walkOnRed;
    const row = t.player.row;
    const red = t.game.red;
    for (let i = 0; i < 60; i++) t.step(1 / 60);
    return { mode: t.game.mode, red: t.game.red, redBefore: red, row, rowNow: t.player.row, down: t.player.down > 0, lives: t.game.lives };
  });
  assert.equal(out.mode, 'out');
  assert.equal(out.red, out.redBefore, 'the walk light stops');
  assert.deepEqual([out.rowNow, out.down, out.lives], [out.row, true, 0], 'he stays down where he was hit');
  const cards = () =>
    page.evaluate(() => {
      const vis = (sel) => !document.querySelector(sel).hidden;
      return { start: vis('[data-screen="start"]'), paused: vis('[data-screen="paused"]'), over: vis('[data-screen="over"]'), hud: vis('[data-hud]') };
    });
  assert.deepEqual(await cards(), { start: false, paused: false, over: false, hud: true }, 'down on the last life: no card yet, the HUD stays');
  // Hidden during those 1.2 s: paused like any other moment, and the run ends only after the tap.
  await page.evaluate(() => window.__walkOnRed.pause());
  await run(page, 3);
  assert.deepEqual(await cards(), { start: false, paused: true, over: false, hud: true }, 'paused, not over');
  assert.deepEqual(await page.evaluate(() => [window.__walkOnRed.game.mode, window.__walkOnRed.game.red]), ['out', out.red], 'nothing advances while paused');
  await page.evaluate(() => window.__walkOnRed.resume());
  await run(page, 0.3);
  const s = await page.evaluate(() => {
    const t = window.__walkOnRed;
    return {
      mode: t.game.mode,
      over: !document.querySelector('[data-screen="over"]').hidden,
      title: document.querySelector('[data-over-title]').textContent,
      score: document.querySelector('[data-final-score]').textContent,
      detail: document.querySelector('[data-final-detail]').textContent,
      hud: !document.querySelector('[data-hud]').hidden,
      best: t.saved.best,
      jingle: t.heard.filter((h) => h.name === 'over').pop(),
      row: t.player.row,
      start: t.layout().bottom,
    };
  });
  assert.equal(s.mode, 'over');
  assert.ok(s.over);
  assert.equal(s.title, 'Game over');
  assert.equal(s.score, '120');
  assert.equal(s.detail, '5 of 63 stars · Best: 120');
  assert.equal(s.best, 120, 'the best counts the run');
  assert.ok(!s.hud);
  assert.ok(s.jingle && s.jingle.rate < 1, 'the closing jingle, lower');
  assert.notEqual(s.row, s.start, 'no return to the start');
  await page.click('[data-again]');
  assert.ok(await page.evaluate(() => !document.querySelector('[data-screen="start"]').hidden), 'the start card');
  await page.click('[data-play]');
  const again = await page.evaluate(() => [window.__walkOnRed.game.mode, window.__walkOnRed.game.level, window.__walkOnRed.game.lives]);
  assert.deepEqual(again, ['play', 0, 3]);
  await run(page, 0.1);
  assert.equal((await hearts(page)).full, 3);
  await context.close();
});

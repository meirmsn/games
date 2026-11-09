// End-to-end tests for Walk on Red. Run: scripts/check-slow.sh.
// The game exposes window.__walkOnRed (its state, put() to place the player, and a step(dt) that
// advances the simulation), so these tests set up a situation and check what the rules do with it.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

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
    t.startGame(7);
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

test('walk-on-red AC-2: a tap hops forward, swipes hop back and sideways, keys too; the street’s edges stop him; one finger only', async () => {
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
  // The street's sides.
  await page.evaluate(() => {
    const t = window.__walkOnRed;
    t.put(t.layout().bottom);
    t.player.col = 0;
  });
  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(200);
  assert.equal((await at())[0], 0, 'not past the left side');
  // The street's edge: no hop below the near kerb.
  await page.evaluate(() => window.__walkOnRed.put(window.__walkOnRed.layout().bottom));
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(200);
  assert.deepEqual(await at(), [0, b]);
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
    // A slow van parked on the crossing as the walk light reaches 0.
    t.put(0);
    for (let i = 0; i < 10; i++) t.step(1 / 60); // he's across: the light runs out
    const lane = t.layout().lanes[0];
    const v = t.spawnVehicle(lane.row, 'van');
    const want = t.colX(5);
    v.s = v.dir === 1 ? want + v.w / 2 + t.ENTRY : t.PLAY_W + t.ENTRY - (want - v.w / 2);
    v.speed = 6;
    v.v = 6;
    let waited = false;
    for (let i = 0; i < 60 * 12 && t.game.mode !== 'green'; i++) {
      t.step(1 / 60);
      if (t.game.stage === 'red' && !t.crossingClear()) waited = true;
    }
    const clearAtGreen = t.crossingClear();
    const mode = t.game.mode;
    // During green, no vehicle enters the crossing.
    const inside = () => t.vehicles().filter((u) => { const x = t.xOf(u); return x < (t.CROSS_C1 + 1) * 12 && x + u.w > t.CROSS_C0 * 12; }).length;
    let entered = 0;
    for (let i = 0; i < 60 * 3; i++) {
      t.step(1 / 60);
      entered += inside();
    }
    const everyone = t.people().every((p) => p.state === 'walk' || p.state === 'across');
    const crossedRow0 = t.people().filter((p) => p.state === 'walk').every((p) => p.walkRow === 0);
    for (let i = 0; i < 60 * 3; i++) t.step(1 / 60);
    return { waited, mode, clearAtGreen, entered, everyone, crossedRow0, after: t.game.mode };
  });
  assert.ok(r.waited, 'waited for the crossing to clear');
  assert.equal(r.mode, 'green');
  assert.ok(r.clearAtGreen, 'green only once the crossing is clear');
  assert.equal(r.entered, 0, 'no car enters the crossing on green');
  assert.ok(r.everyone && r.crossedRow0, 'everyone crossed');
  assert.ok(['tally', 'play'].includes(r.after));
  await context.close();
});

test('walk-on-red AC-5: reaching the far kerb fixes the seconds; the level scores them × (1 + copiers across)', async () => {
  const { context, page } = await open();
  await startEmpty(page, 4);
  const r = await page.evaluate(() => {
    const t = window.__walkOnRed;
    const run = (s) => { for (let i = 0; i < Math.round(s * 60); i++) t.step(1 / 60); };
    for (let row = t.layout().bottom - 1; row >= 0; row--) {
      t.move('up');
      run(0.5);
    }
    const secs = t.game.closedSecs;
    const mode = t.game.mode;
    // Copiers still on the way finish fast, then the seconds count up into points.
    const counts = [];
    let took = 0;
    for (let i = 0; i < 60 * 30 && t.game.mode !== 'tally'; i++) {
      t.step(1 / 60);
      if (t.game.mode === 'finish' && t.game.stage === 'count') counts.push(t.game.levelScore);
      if (t.game.mode === 'finish' || t.game.mode === 'wait') took += 1 / 60;
    }
    const across = t.copiers().filter((p) => p.state === 'across').length;
    const rising = counts.length > 5 && counts.every((c, i) => i === 0 || c >= counts[i - 1]) && counts[counts.length - 1] > counts[0];
    return { mode, secs, across, score: t.game.levelScore, banner: document.querySelector('[data-banner-name]').textContent, rising, took };
  });
  assert.equal(r.mode, 'finish');
  assert.ok(r.secs > 20, `seconds fixed on arrival: ${r.secs}`);
  assert.equal(r.across, 2, 'both copiers made it on an empty road');
  assert.equal(r.score, r.secs * 3);
  assert.equal(r.banner, `+${r.score}`);
  assert.ok(r.rising, 'the points count up as the seconds drain');
  assert.ok(r.took < 8, `no waiting out the seconds in real time: ${r.took.toFixed(1)} s from across to green`);
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
  assert.deepEqual(s, { mode: 'play', level: 3, red: 28 }, 'the same level again');
  await context.close();
});

test('walk-on-red AC-7: copiers set off once he is two rows out, one after another, never pass him, and look before leaving safe ground', async () => {
  const { context, page } = await open();
  await startEmpty(page, 4);
  const r = await page.evaluate(() => {
    const t = window.__walkOnRed;
    const run = (s) => { for (let i = 0; i < Math.round(s * 60); i++) t.step(1 / 60); };
    const b = t.layout().bottom;
    const [a, c] = t.copiers();
    t.move('up');
    run(1);
    const oneOut = [a.state, c.state];
    t.move('up');
    run(0.05);
    const twoOut = [a.state, c.state];
    run(1);
    const staggered = [a.state, c.state];
    run(3);
    // He stands two rows out: they come up behind him but never past him.
    const never = [a.row, c.row].every((r) => r > t.player.row);
    const cols = [a.col, c.col];
    // On the island, a car about to reach the next lane holds a copier back.
    t.startGame(4);
    t.manual = true;
    t.clearTraffic();
    const m = t.layout().rows.indexOf('M');
    t.put(m - 1);
    const p = t.copiers()[0];
    p.state = 'go';
    p.row = m;
    p.hopT = 0;
    const v = t.spawnVehicle(m - 1, 'sedan');
    const x = t.colX(p.col);
    v.speed = 20;
    v.v = 20;
    if (v.dir === 1) v.s = x - 3.5 - 10 + v.w * 0.1 + t.ENTRY + 0.0 + v.w * 0.0 + 0;
    else v.s = t.PLAY_W + t.ENTRY - (x + 3.5 + 10 - v.w * 0.1);
    run(0.3);
    const held = p.row === m;
    return { oneOut, twoOut, staggered, never, cols, b, held };
  });
  assert.deepEqual(r.oneOut, ['wait', 'wait']);
  assert.deepEqual(r.twoOut, ['go', 'wait'], 'the first sets off when he is two rows out');
  assert.deepEqual(r.staggered, ['go', 'go'], 'then the next');
  assert.ok(r.never, 'never past him');
  assert.ok(!r.cols.includes(5), 'their own columns');
  assert.ok(r.held, 'waits on the island while a car is coming');
  await context.close();
});

test('walk-on-red AC-8: a copier hit by a car goes back to the crowd and no longer counts', async () => {
  const { context, page } = await open();
  await startEmpty(page, 2);
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
    return { hit, after: p.state, mode: t.game.mode, row: p.row, b: t.layout().bottom };
  });
  assert.equal(r.hit, 'down');
  assert.equal(r.after, 'home');
  assert.equal(r.row, r.b, 'back with the crowd');
  assert.equal(r.mode, 'play', 'the level carries on');
  await context.close();
});

test('walk-on-red AC-9: a hit knocks the player down and back to his last safe strip', async () => {
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
  const back = await page.evaluate(() => [window.__walkOnRed.player.row, window.__walkOnRed.player.down, window.__walkOnRed.game.mode]);
  assert.deepEqual(back, [m, 0, 'play']);
  await context.close();
});

test('walk-on-red AC-10: the eight levels bring their things in order', async () => {
  const { context, page } = await open();
  const levels = await page.evaluate(() =>
    window.__walkOnRed.LEVELS.map((l) => ({
      copiers: l.copiers,
      medians: l.rows.filter((r) => r === 'M').length,
      sirens: !!l.sirens,
      buses: l.lanes.some((ln) => ln.set.includes('bus') && ln.set.includes('truck')),
    }))
  );
  assert.equal(levels.length, 8);
  assert.deepEqual(levels.map((l) => l.copiers), [0, 0, 1, 1, 2, 2, 3, 3]);
  assert.deepEqual(levels.map((l) => l.medians), [0, 0, 1, 1, 1, 1, 1, 2]);
  assert.deepEqual(levels.map((l) => l.sirens), [false, false, false, false, false, true, false, true]);
  assert.equal(levels.findIndex((l) => l.buses), 3, 'buses and trucks from level 4');
  await context.close();
});

test('walk-on-red AC-11: a siren warns 2.5 s ahead', async () => {
  const { context, page } = await open();
  await startEmpty(page, 5);
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
  await context.close();
});

test('walk-on-red AC-12: after level 8 the run ends with the total, the stars and the best', async () => {
  const { context, page } = await open();
  const total = await finishRun(page, 300);
  const s = await page.evaluate(() => ({
    mode: window.__walkOnRed.game.mode,
    over: !document.querySelector('[data-screen="over"]').hidden,
    score: document.querySelector('[data-final-score]').textContent,
    detail: document.querySelector('[data-final-detail]').textContent,
  }));
  assert.equal(s.mode, 'over');
  assert.ok(s.over);
  assert.ok(total > 300);
  assert.equal(s.score, String(total));
  assert.match(s.detail, new RegExp(`of 24 stars · Best: ${total}`));
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
    // A copier across.
    t.startGame(2);
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
    t.startGame(7);
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
    for (let i = 0; i < 40; i++) t.step(1 / 60);
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
  assert.equal(await until('green'), 'green');
  await page.waitForTimeout(100);
  assert.deepEqual(await shown(), { start: false, paused: false, over: false, hud: true, banner: null });
  assert.equal(await page.evaluate(() => document.querySelector('[data-clock]').textContent), 'GO');
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

test('walk-on-red AC-18: the street takes the screen’s shape at load, keeps one width, fits, and a turn mid-game asks to turn back or start over', async () => {
  for (const [w, h, minPerson, cols] of [
    [390, 844, 36, 12],
    [360, 640, 36, 12],
    [844, 390, 0, 30],
  ]) {
    const { context, page } = await open({ viewport: { width: w, height: h } });
    const before = await page.evaluate(() => window.__walkOnRed.view.width);
    for (const level of [0, 7]) {
      const v = await page.evaluate((level) => {
        const t = window.__walkOnRed;
        t.startGame(level);
        return { ...t.view, cols: t.COLS, scrollW: document.documentElement.scrollWidth, scrollH: document.documentElement.scrollHeight };
      }, level);
      assert.equal(v.cols, cols, `${w}×${h}: ${v.cols} columns`);
      assert.ok(Math.abs(v.width - before) < 0.5, `${w}×${h}: the width stays ${before} (now ${v.width})`);
      assert.ok(v.top >= 0 && v.bottom <= h + 0.5, `${w}×${h} level ${level}: ${v.top}–${v.bottom}`);
      assert.ok(v.person >= minPerson, `${w}×${h}: a person is ${v.person} px`);
      assert.ok(v.scrollW <= w && v.scrollH <= h, 'no scrolling');
    }
    await context.close();
  }
  {
    // Desktop: a wide street, centred, with plain background either side.
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
      return { ...t.view, cols: t.COLS, side: [at(8, mid), at(window.innerWidth - 8, mid)], inside: at(t.view.left + 4, mid) };
    });
    assert.ok(d.cols > 12, `a wide street: ${d.cols} columns`);
    assert.ok(Math.abs(d.width - w0) < 0.5, 'Start keeps the width');
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
      return JSON.stringify({ p: [t.player.col, t.player.row], c: t.copiers().map((p) => [p.col, p.row, p.state]), v: t.vehicles().map((v) => [v.lane, Math.round(v.s * 1000)]), r: t.game.red, s: t.game.score });
    });
  const before = await state();
  // A resize in the same shape changes nothing.
  await page.setViewportSize({ width: 414, height: 896 });
  await page.waitForTimeout(100);
  assert.equal(await state(), before);
  // Turned sideways mid-game: paused, asking to turn back or start over.
  await page.setViewportSize({ width: 896, height: 414 });
  await page.waitForTimeout(100);
  const cards = () =>
    page.evaluate(() => {
      const vis = (sel) => !document.querySelector(sel).hidden;
      return { start: vis('[data-screen="start"]'), paused: vis('[data-screen="paused"]'), over: vis('[data-screen="over"]'), rotate: vis('[data-screen="rotate"]'), hud: vis('[data-hud]'), banner: vis('[data-banner]') };
    });
  const bannerBefore = await page.evaluate(() => !document.querySelector('[data-banner]').hidden);
  let r = await page.evaluate(() => ({ paused: window.__walkOnRed.game.paused, rotate: !document.querySelector('[data-screen="rotate"]').hidden }));
  assert.deepEqual(r, { paused: true, rotate: true });
  assert.deepEqual(await cards(), { start: false, paused: false, over: false, rotate: true, hud: true, banner: bannerBefore }, 'the state table’s row for a turned device');
  assert.equal(await state(), before, 'nothing changed');
  // Turned back: the rotate card goes, the paused card waits for a tap.
  await page.setViewportSize({ width: 414, height: 896 });
  await page.waitForTimeout(100);
  r = await page.evaluate(() => ({ rotate: !document.querySelector('[data-screen="rotate"]').hidden, paused: !document.querySelector('[data-screen="paused"]').hidden }));
  assert.deepEqual(r, { rotate: false, paused: true });
  // Or start over in the new shape.
  await page.setViewportSize({ width: 896, height: 414 });
  await page.waitForTimeout(100);
  await page.click('[data-restart]');
  r = await page.evaluate(() => ({ mode: window.__walkOnRed.game.mode, level: window.__walkOnRed.game.level, cols: window.__walkOnRed.COLS, orient: window.__walkOnRed.ORIENT }));
  assert.deepEqual(r, { mode: 'play', level: 0, cols: r.cols, orient: 'landscape' });
  assert.ok(r.cols > 12);
  await context.close();
});

test('walk-on-red AC-19: hops, copiers setting off and arriving, hits, the green light and the end have their sounds', async () => {
  const { context, page } = await open();
  await startEmpty(page, 6);
  const r = await page.evaluate(() => {
    const t = window.__walkOnRed;
    const names = () => t.heard.map((h) => h.name);
    const run = (s) => { for (let i = 0; i < Math.round(s * 60); i++) t.step(1 / 60); };
    t.heard.length = 0;
    t.move('up');
    run(0.2);
    const hop = names();
    t.heard.length = 0;
    t.move('up');
    run(0.3);
    const setOff = names();
    t.heard.length = 0;
    t.put(0);
    for (let i = 0; i < 60 * 30 && t.game.mode !== 'tally'; i++) t.step(1 / 60);
    const arrive = t.heard.filter((h) => h.name === 'arrive').map((h) => h.rate);
    const green = names();
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
    return { hop, setOff, arrive, green, hit };
  });
  assert.ok(r.hop.some((n) => n === 'step' || n === 'step2'), 'a footstep');
  assert.ok(r.setOff.includes('join'), 'the pluck as a copier sets off');
  assert.ok(r.arrive.length >= 3, `the chime as each copier arrives (${r.arrive})`);
  for (let i = 1; i < 3; i++) assert.ok(r.arrive[i] > r.arrive[i - 1], `each chime higher: ${r.arrive}`);
  assert.ok(r.green.includes('street') && r.green.includes('walk'), 'the green light');
  assert.ok(r.hit.includes('hit') && r.hit.includes('horn'));
  await page.evaluate(() => (window.__walkOnRed.heard.length = 0));
  await finishRun(page);
  assert.ok(await page.evaluate(() => window.__walkOnRed.heard.some((h) => h.name === 'over')), 'the closing jingle');
  await context.close();
});

test('walk-on-red AC-20: what the level is worth shows above the far kerb, and the walk light counts down', async () => {
  const { context, page } = await open();
  await startEmpty(page, 3);
  await page.evaluate(() => (window.__walkOnRed.manual = false));
  await page.waitForTimeout(200);
  const label = await page.evaluate(() => {
    const t = window.__walkOnRed;
    return { text: t.drawn.payout, red: Math.ceil(t.game.red), countdown: t.drawn.countdown };
  });
  assert.equal(label.text, `${label.red} s × 1 = ${label.red}`);
  assert.equal(label.countdown, label.red, 'the walk light’s countdown matches');
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


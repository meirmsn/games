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

test('walk-on-red AC-2: a tap hops forward, a swipe down back, sideways does nothing; keys too; one finger only', async () => {
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
  assert.deepEqual(await at(), [col, b], 'sideways does nothing');
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
  assert.deepEqual(await at(), [col, b - 2], 'no sideways key');
  // The street's edge: no hop below the near kerb.
  await page.evaluate(() => window.__walkOnRed.put(window.__walkOnRed.layout().bottom));
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(200);
  assert.deepEqual(await at(), [col, b]);
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

test('walk-on-red AC-3: a copier moves to the next strip only after the player has stood on it 0.6 s', async () => {
  const { context, page } = await open();
  await startEmpty(page, 2);
  const r = await page.evaluate(() => {
    const t = window.__walkOnRed;
    const m = t.layout().rows.indexOf('M');
    const b = t.layout().bottom;
    const cop = t.copiers()[0];
    const run = (s) => { for (let i = 0; i < Math.round(s * 60); i++) t.step(1 / 60); };
    // Straight through the median without stopping: the copier stays.
    for (let row = b - 1; row >= 0; row--) {
      t.move('up');
      run(0.15);
    }
    run(3);
    const passedThrough = { row: cop.row, state: cop.state, mode: t.game.mode };
    // Again, stopping on the median: after 0.5 s nothing; after 0.6 s they follow.
    t.startGame(2);
    t.manual = true;
    t.clearTraffic();
    const c2 = t.copiers()[0];
    t.put(m);
    run(0.5);
    const early = t.proven().has(m);
    run(0.2);
    const proven = t.proven().has(m);
    run(3);
    return { passedThrough, b, early, proven, followed: [c2.row, c2.state], m };
  });
  assert.equal(r.passedThrough.row, r.b, 'left on the kerb');
  assert.equal(r.passedThrough.state, 'walk', 'and crossed only on the green light');
  assert.equal(r.early, false);
  assert.equal(r.proven, true);
  assert.deepEqual(r.followed, [r.m, 'wait'], 'followed to the median');
  await context.close();
});

test('walk-on-red AC-4: copiers wait for a gap, get the cars held after 6 s, and are never hit', async () => {
  const { context, page } = await open();
  await startEmpty(page, 2);
  const r = await page.evaluate(() => {
    const t = window.__walkOnRed;
    const m = t.layout().rows.indexOf('M');
    const b = t.layout().bottom;
    const cop = t.copiers()[0];
    const run = (s) => { for (let i = 0; i < Math.round(s * 60); i++) t.step(1 / 60); };
    // A car parked across the copier's way in the first lane: no gap.
    const v = t.spawnVehicle(b - 1, 'bus');
    const want = t.colX(cop.col);
    v.s = v.dir === 1 ? want + v.w / 2 + t.ENTRY : t.PLAY_W + t.ENTRY - (want - v.w / 2);
    v.speed = 0;
    v.v = 0;
    t.put(m);
    run(0.6 + 0.45 + 3);
    const waiting = cop.state;
    const ln = t.layout().lanes.find((l) => l.row === b - 1);
    const noHoldYet = ln.holdCol == null;
    run(3.2);
    const held = { col: ln.holdCol, light: ln.light, me: cop.col };
    // The parked bus drives off; a new car comes and must stop for the hold.
    v.speed = 30;
    v.v = 30;
    run(4);
    return { waiting, noHoldYet, held, after: [cop.row, cop.state], m };
  });
  assert.equal(r.waiting, 'wait', 'no gap, no crossing');
  assert.ok(r.noHoldYet, 'no hold before 6 s');
  assert.equal(r.held.col, r.held.me, 'the lane is held at their column');
  assert.equal(r.held.light, 'hold');
  assert.deepEqual(r.after, [r.m, 'wait'], 'across to the median once the way is clear');
  // Over many seeds with real traffic, no copier is ever overlapped by a car.
  const hits = await page.evaluate(() => {
    const t = window.__walkOnRed;
    let overlaps = 0;
    let crossings = 0;
    for (let seed = 1; seed <= 6; seed++) {
      t.seed(seed);
      t.startGame(7);
      t.manual = true;
      t.game.grace = 1e9;
      const rows = t.layout().rows;
      const safeRows = rows.map((k, i) => (k !== 'L' ? i : -1)).filter((i) => i > 0 && i < rows.length - 1);
      for (const s of [...safeRows].reverse()) {
        t.put(s);
        for (let i = 0; i < 60 * 8; i++) {
          t.step(1 / 60);
          for (const p of t.copiers()) {
            if (p.state !== 'cross') continue;
            crossings++;
            const x = t.colX(p.col);
            for (const v of t.vehicles()) {
              if (v.lane !== p.row) continue;
              const x0 = t.xOf(v) + v.w * 0.1;
              const x1 = t.xOf(v) + v.w * 0.9;
              if (x0 < x + 2.5 && x1 > x - 2.5) overlaps++;
            }
          }
        }
      }
    }
    return { overlaps, crossings };
  });
  assert.ok(hits.crossings > 100, `copiers crossed (${hits.crossings} frames)`);
  assert.equal(hits.overlaps, 0, 'no copier is ever hit');
  await context.close();
});

test('walk-on-red AC-5: a hit knocks the player down, back to his last safe strip, and costs one copier', async () => {
  const { context, page } = await open();
  await startEmpty(page, 4);
  await page.evaluate(() => {
    const t = window.__walkOnRed;
    t.put(t.layout().bottom - 1);
  });
  const col = await page.evaluate(() => window.__walkOnRed.PCOL);
  await carOn(page, await page.evaluate(() => window.__walkOnRed.layout().bottom - 1), col);
  await run(page, 0.05);
  const hit = await page.evaluate(() => {
    const t = window.__walkOnRed;
    return { down: t.player.down > 0, home: t.copiers().filter((p) => p.state === 'home').length, mode: t.game.mode };
  });
  assert.deepEqual(hit, { down: true, home: 1, mode: 'play' });
  await page.evaluate(() => (window.__walkOnRed.vehicles().length = 0));
  await run(page, 1.3);
  const back = await page.evaluate(() => [window.__walkOnRed.player.row, window.__walkOnRed.player.down]);
  assert.deepEqual(back, [await page.evaluate(() => window.__walkOnRed.layout().bottom), 0]);
  await context.close();
});

test('walk-on-red AC-6: the level closes on the far kerb, scoring (1 + copiers across) × seconds left', async () => {
  const { context, page } = await open();
  await startEmpty(page, 6);
  const r = await page.evaluate(() => {
    const t = window.__walkOnRed;
    const run = (s) => { for (let i = 0; i < Math.round(s * 60); i++) t.step(1 / 60); };
    const m = t.layout().rows.indexOf('M');
    t.put(m);
    run(5);
    const onMedian = t.copiers().filter((p) => p.row === m).length;
    t.put(0);
    let closedAt = null;
    for (let i = 0; i < 60 * 8 && t.game.mode === 'play'; i++) {
      t.step(1 / 60);
      if (t.game.mode !== 'play') closedAt = t.game.red;
    }
    const across = t.copiers().filter((p) => p.state === 'across');
    return { onMedian, mode: t.game.mode, levelScore: t.game.levelScore, closedAt, weights: across.map((p) => p.weight), grandpa: across.some((p) => p.kind === 'grandpa') };
  });
  assert.equal(r.onMedian, 3, 'two copiers and the grandpa came to the median');
  assert.equal(r.mode, 'green');
  assert.ok(r.grandpa);
  const n = r.weights.reduce((a, b) => a + b, 0);
  assert.equal(n, 4, 'two copiers + the grandpa counting 2');
  assert.equal(r.levelScore, (1 + n) * Math.ceil(r.closedAt - 1e-9));
  await context.close();
});

test('walk-on-red AC-7: red running out scores 0; green stops the cars, everyone crosses, the tally, the next level', async () => {
  const { context, page } = await open();
  await page.evaluate(() => {
    const t = window.__walkOnRed;
    t.seed(3);
    t.startGame(2);
    t.manual = true;
    t.game.red = 0.05;
  });
  await run(page, 0.1);
  let s = await page.evaluate(() => ({ mode: window.__walkOnRed.game.mode, score: window.__walkOnRed.game.levelScore }));
  assert.deepEqual(s, { mode: 'green', score: 0 });
  await run(page, 0.5);
  // No car enters the street on green, and the people still here walk across.
  const g = await page.evaluate(() => {
    const t = window.__walkOnRed;
    const inside = () => t.vehicles().filter((v) => { const x = t.xOf(v); return x + v.w > 0 && x < t.PLAY_W; }).map((v) => v.id);
    const before = new Set(inside());
    for (let i = 0; i < 60 * 2.5; i++) t.step(1 / 60);
    const entered = inside().filter((id) => !before.has(id));
    return { entered: entered.length, player: t.player.row, walked: t.people().every((p) => p.state === 'walk' || p.state === 'across'), mode: t.game.mode };
  });
  assert.equal(g.entered, 0, 'cars stop before the street');
  assert.equal(g.player, 0, 'the player crossed too');
  assert.ok(g.walked);
  await run(page, 1);
  s = await page.evaluate(() => ({ mode: window.__walkOnRed.game.mode, banner: !document.querySelector('[data-banner]').hidden, text: document.querySelector('[data-banner-name]').textContent }));
  assert.deepEqual(s, { mode: 'tally', banner: true, text: '+0' });
  await run(page, 2.4);
  s = await page.evaluate(() => ({ mode: window.__walkOnRed.game.mode, level: window.__walkOnRed.game.level }));
  assert.deepEqual(s, { mode: 'play', level: 3 });
  await context.close();
});

test('walk-on-red AC-8: the eight levels bring their things in order', async () => {
  const { context, page } = await open();
  const levels = await page.evaluate(() =>
    window.__walkOnRed.LEVELS.map((l) => ({
      copiers: l.copiers,
      grandpa: !!l.grandpa,
      medians: l.rows.filter((r) => r === 'M').length,
      sirens: !!l.sirens,
      buses: l.lanes.some((ln) => ln.set.includes('bus') && ln.set.includes('truck')),
    }))
  );
  assert.equal(levels.length, 8);
  assert.deepEqual(levels.map((l) => l.copiers), [0, 0, 1, 2, 3, 3, 2, 4]);
  assert.deepEqual(levels.map((l) => l.grandpa), [false, false, false, false, false, false, true, false]);
  assert.deepEqual(levels.map((l) => l.medians), [0, 0, 1, 1, 1, 1, 1, 2]);
  assert.deepEqual(levels.map((l) => l.sirens), [false, false, false, false, false, true, false, true]);
  assert.equal(levels.findIndex((l) => l.buses), 3, 'buses and trucks from level 4');
  await context.close();
});

test('walk-on-red AC-9: a siren warns 2.5 s ahead, and no copier sets off while it is coming', async () => {
  const { context, page } = await open();
  await startEmpty(page, 5);
  const r = await page.evaluate(() => {
    const t = window.__walkOnRed;
    const m = t.layout().rows.indexOf('M');
    t.put(m);
    for (let i = 0; i < 60 * 0.7; i++) t.step(1 / 60); // proven, glancing
    t.game.sirenIn = 0.01;
    t.heard.length = 0;
    let setOff = 0;
    let at = 0;
    for (let i = 0; i < 60 * 2.4; i++) {
      t.step(1 / 60);
      setOff += t.copiers().filter((p) => p.state === 'cross').length;
      if (!at && t.vehicles().some((v) => v.siren)) at = (i + 1) / 60;
    }
    for (let i = 0; i < 60 * 1; i++) {
      t.step(1 / 60);
      if (!at && t.vehicles().some((v) => v.siren)) at = 2.4 + (i + 1) / 60;
    }
    return { warned: t.heard.some((h) => h.name === 'siren'), setOff, at };
  });
  assert.ok(r.warned);
  assert.equal(r.setOff, 0, 'nobody steps out while the siren is coming');
  assert.ok(r.at >= 2.45, `the siren came after ${r.at} s`);
  await context.close();
});

test('walk-on-red AC-10: after level 8 the run ends with the total, the stars and the best', async () => {
  const { context, page } = await open();
  await page.evaluate(() => {
    const t = window.__walkOnRed;
    t.startGame(7);
    t.manual = true;
    t.game.score = 300;
    t.game.red = 0.01;
  });
  await run(page, 0.1 + 3.7 + 2.3);
  const s = await page.evaluate(() => ({
    mode: window.__walkOnRed.game.mode,
    over: !document.querySelector('[data-screen="over"]').hidden,
    score: document.querySelector('[data-final-score]').textContent,
    detail: document.querySelector('[data-final-detail]').textContent,
  }));
  assert.equal(s.mode, 'over');
  assert.ok(s.over);
  assert.equal(s.score, '300');
  assert.match(s.detail, /of 24 stars · Best: 300/);
  await page.click('[data-again]');
  assert.equal(await page.evaluate(() => window.__walkOnRed.game.mode), 'title');
  assert.ok(await page.evaluate(() => !document.querySelector('[data-screen="start"]').hidden));
  await context.close();
});

test('walk-on-red AC-11: lanes come in platoons and lulls, shown by their lights, neighbours out of step', async () => {
  const { context, page } = await open();
  const r = await page.evaluate(() => {
    const t = window.__walkOnRed;
    t.seed(3);
    t.startGame(1);
    t.manual = true;
    const lanes = t.layout().lanes;
    const neighbours = lanes.slice(1).every((ln, i) => ln.phase !== lanes[i].phase);
    const seen = lanes.map(() => ({ on: 0, off: 0, wrong: 0, spawnsInLull: 0 }));
    const known = new Set(t.vehicles().map((v) => v.id));
    for (let i = 0; i < 60 * 25; i++) {
      t.step(1 / 60);
      if (t.game.mode !== 'play') break;
      lanes.forEach((ln, k) => {
        seen[k][ln.phase]++;
        if ((ln.phase === 'on') !== (ln.light === 'green') && ln.light !== 'siren' && ln.light !== 'hold') seen[k].wrong++;
      });
      for (const v of t.vehicles()) {
        if (known.has(v.id)) continue;
        known.add(v.id);
        const ln = lanes.find((l) => l.row === v.lane);
        if (ln.phase !== 'on') seen[lanes.indexOf(ln)].spawnsInLull++;
      }
    }
    return { neighbours, seen };
  });
  assert.ok(r.neighbours);
  for (const s of r.seen) {
    assert.ok(s.on > 0 && s.off > 0, 'each lane has platoons and lulls');
    assert.equal(s.wrong, 0);
    assert.equal(s.spawnsInLull, 0);
  }
  await context.close();
});

test('walk-on-red AC-12: the hidden assist rises with a hit, falls with a copier across, and slows traffic', async () => {
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
    t.put(t.layout().rows.indexOf('M'));
    for (let i = 0; i < 60 * 3; i++) t.step(1 / 60);
    t.put(0);
    for (let i = 0; i < 60 * 3 && !t.copiers().some((p) => p.state === 'across'); i++) t.step(1 / 60);
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
    t.game.assist = 1;
    t.game.red = 0.01;
    for (let i = 0; i < 60 * 6.2; i++) t.step(1 / 60);
    t.startGame(0);
    return t.game.assist;
  });
  assert.ok(Math.abs(next - 0.6) < 1e-9, `next run: ${next}`);
  await context.close();
});

test('walk-on-red AC-13: hiding the page pauses; the resuming tap doesn’t hop and nothing hits for 0.5 s', async () => {
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
  // It pauses during the green light and the tally too.
  const later = await page.evaluate(() => {
    const t = window.__walkOnRed;
    t.startGame(0);
    t.manual = true;
    t.game.red = 0.01;
    t.step(1 / 60);
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

test('walk-on-red AC-14: the best total and the best stars per level are kept and shown on the start card', async () => {
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
    for (let i = 0; i < 60 * 7; i++) t.step(1 / 60);
    return JSON.parse(localStorage.getItem('walk-on-red'));
  });
  assert.ok(saved.stars[3] >= 1, `level 4 stars: ${saved.stars[3]}`);
  assert.deepEqual(saved.stars.slice(0, 3), [3, 2, 1]);
  await context.close();
});

test('walk-on-red AC-15: each state shows only its own card and HUD', async () => {
  const { context, page } = await open();
  const shown = () =>
    page.evaluate(() => {
      const vis = (sel) => !document.querySelector(sel).hidden;
      return { start: vis('[data-screen="start"]'), paused: vis('[data-screen="paused"]'), over: vis('[data-screen="over"]'), hud: vis('[data-hud]') };
    });
  assert.deepEqual(await shown(), { start: true, paused: false, over: false, hud: false });
  await startEmpty(page, 0);
  assert.deepEqual(await shown(), { start: false, paused: false, over: false, hud: true });
  await page.evaluate(() => window.__walkOnRed.put(0));
  await run(page, 0.8);
  assert.equal(await page.evaluate(() => window.__walkOnRed.game.mode), 'green');
  await page.waitForTimeout(100);
  assert.deepEqual(await shown(), { start: false, paused: false, over: false, hud: true });
  assert.equal(await page.evaluate(() => document.querySelector('[data-clock]').textContent), 'GO');
  await run(page, 3.8);
  assert.equal(await page.evaluate(() => window.__walkOnRed.game.mode), 'tally');
  assert.ok(await page.evaluate(() => !document.querySelector('[data-banner]').hidden), 'the tally');
  await run(page, 2.4);
  await page.evaluate(() => window.__walkOnRed.pause());
  assert.deepEqual(await shown(), { start: false, paused: true, over: false, hud: true });
  await page.evaluate(() => {
    const t = window.__walkOnRed;
    t.resume();
    t.startGame(7);
    t.manual = true;
    t.game.red = 0.01;
    for (let i = 0; i < 60 * 6.2; i++) t.step(1 / 60);
  });
  assert.deepEqual(await shown(), { start: false, paused: false, over: true, hud: false });
  await context.close();
});

test('walk-on-red AC-16: the game works offline once it has been played', async () => {
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

test('walk-on-red AC-17: the street fits on phones and in landscape, only the street shows on desktop, and a resize changes nothing', async () => {
  for (const [w, h, minPerson] of [
    [390, 844, 36],
    [360, 640, 36],
    [844, 390, 0],
  ]) {
    const { context, page } = await open({ viewport: { width: w, height: h } });
    for (const level of [0, 7]) {
      const v = await page.evaluate((level) => {
        const t = window.__walkOnRed;
        t.startGame(level);
        return { ...t.view, scrollW: document.documentElement.scrollWidth, scrollH: document.documentElement.scrollHeight };
      }, level);
      assert.ok(v.top >= 0 && v.bottom <= h + 0.5, `${w}×${h} level ${level}: ${v.top}–${v.bottom}`);
      assert.ok(v.person >= minPerson, `${w}×${h}: a person is ${v.person} px`);
      assert.ok(v.scrollW <= w && v.scrollH <= h, 'no scrolling');
    }
    await context.close();
  }
  {
    const { context, page } = await open({ viewport: { width: 1280, height: 720 } });
    await page.evaluate(() => window.__walkOnRed.startGame(7));
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
    assert.ok(Math.abs(d.width - 144 * d.scale) < 0.5);
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
  await page.setViewportSize({ width: 800, height: 600 });
  await page.waitForTimeout(100);
  assert.equal(await state(), before);
  await context.close();
});

test('walk-on-red AC-18: hops, copiers setting off and arriving, hits, the green light and the end have their sounds', async () => {
  const { context, page } = await open();
  await startEmpty(page, 2);
  const r = await page.evaluate(() => {
    const t = window.__walkOnRed;
    const names = () => t.heard.map((h) => h.name);
    const run = (s) => { for (let i = 0; i < Math.round(s * 60); i++) t.step(1 / 60); };
    t.heard.length = 0;
    t.move('up');
    run(0.2);
    const hop = names();
    t.heard.length = 0;
    t.put(t.layout().rows.indexOf('M'));
    run(2.5);
    const setOff = names();
    t.heard.length = 0;
    t.put(0);
    run(3);
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
    t.startGame(7);
    t.manual = true;
    t.heard.length = 0;
    t.game.red = 0.01;
    run(6.2);
    return { hop, setOff, arrive, green, hit, end: names() };
  });
  assert.ok(r.hop.some((n) => n === 'step' || n === 'step2'), 'a footstep');
  assert.ok(r.setOff.includes('join'), 'the pluck as a copier sets off');
  assert.ok(r.arrive.length >= 1, 'the chime as a copier arrives');
  assert.ok(r.green.includes('street') && r.green.includes('walk'), 'the green light');
  assert.ok(r.hit.includes('hit') && r.hit.includes('horn'));
  assert.ok(r.end.includes('over'));
  await context.close();
});

test('walk-on-red AC-19: the level’s score so far shows at the far kerb', async () => {
  const { context, page } = await open();
  await startEmpty(page, 3);
  await page.evaluate(() => (window.__walkOnRed.manual = false));
  await page.waitForTimeout(200);
  const label = await page.evaluate(() => {
    const t = window.__walkOnRed;
    return { text: t.drawn.payout, red: Math.ceil(t.game.red) };
  });
  assert.equal(label.text, `×1 · ${label.red} s = ${label.red}`);
  await context.close();
});

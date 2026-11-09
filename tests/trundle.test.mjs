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

// Advance frames of `ms` until the run is over (or n frames).
async function runOut(page, ms = 1000 / 60, n = 2000) {
  return page.evaluate(
    ([ms, n]) => {
      const T = window.__trundle;
      let i = 0;
      while ((T.G.mode === 'run' || T.G.mode === 'demo') && i++ < n) T.frame(ms);
      return T.G.mode;
    },
    [ms, n]
  );
}

// Solve room i (0-based) with its recorded solution; returns the stars taken.
async function solve(page, i) {
  return page.evaluate((i) => {
    const T = window.__trundle;
    T.openRoom(i);
    const s = T.ROOMS[i].solution;
    T.setLayout(s.layout, s.kick);
    T.go();
    let n = 0;
    while (T.G.mode === 'run' && n++ < 2000) T.frame(1000 / 60);
    return T.G.mode === 'done' ? T.G.lastStars : -1;
  }, i);
}

test('trundle AC-2: a fresh room opens with the demo kick, which misses and leaves its trail', async () => {
  const { context, page, errors } = await open('#1-1');
  await manual(page);
  const s = await page.evaluate(() => ({ mode: window.__trundle.G.mode, parts: window.__trundle.G.layout.length }));
  assert.equal(s.mode, 'demo', 'the ball is already running before any touch');
  assert.equal(s.parts, 0);
  assert.equal(await runOut(page), 'edit', 'the demo ends by itself, without reaching the exit');
  const after = await page.evaluate(() => ({ trail: window.__trundle.G.trail.length, misses: window.__trundle.G.misses[0] }));
  assert.ok(after.trail > 20, 'its trail stays on the board');
  assert.equal(after.misses, 0, 'the demo is not a miss');

  // a room with a saved layout opens still, with that layout
  await page.evaluate(() => {
    window.__trundle.openRoom(1);
    window.__trundle.setLayout([{ type: 'plank', x: 6, y: 9, a: 30 }]);
    window.__trundle.openRoom(0);
    window.__trundle.openRoom(1);
  });
  const r2 = await page.evaluate(() => ({ mode: window.__trundle.G.mode, layout: window.__trundle.G.layout }));
  assert.equal(r2.mode, 'edit');
  assert.deepEqual(r2.layout, [{ type: 'plank', x: 6, y: 9, a: 30 }]);
  assert.deepEqual(errors, []);
  await context.close();
});

test('trundle AC-3: parts drag from the tray, snap, move relatively, turn, go back, and refuse overlaps', async () => {
  const { context, page, errors } = await open('#1-1');
  await manual(page);
  await runOut(page);
  const tray = await page.locator('.part').first().boundingBox();
  const at = (x, y) => page.evaluate(([x, y]) => window.__trundle.toScreen(x, y), [x, y]);
  const layout = () => page.evaluate(() => window.__trundle.G.layout);

  // from the tray (a mouse carries the part at the pointer)
  let t = await at(5.3, 6.1);
  await page.mouse.move(tray.x + 28, tray.y + 28);
  await page.mouse.down();
  await page.mouse.move(t.x, t.y, { steps: 8 });
  await page.mouse.up();
  let l = await layout();
  assert.equal(l.length, 1);
  assert.deepEqual([l[0].x, l[0].y, l[0].a], [5.25, 6, 0], 'snapped to 0.25 units');

  // a placed part moves by the pointer's movement, wherever it was grabbed
  const grab = await at(5.9, 6.1);
  const k = (await page.evaluate(() => window.__trundle.view())).k;
  await page.mouse.move(grab.x, grab.y);
  await page.mouse.down();
  await page.mouse.move(grab.x - 1 * k, grab.y + 0.5 * k, { steps: 6 });
  await page.mouse.up();
  l = await layout();
  assert.deepEqual([l[0].x, l[0].y], [4.25, 6.5]);

  // turn buttons
  await page.click('[data-turn="15"]');
  assert.equal((await layout())[0].a, 15);
  await page.click('[data-turn="-15"]');
  await page.click('[data-turn="-15"]');
  assert.equal((await layout())[0].a, 345);

  // a drop onto a fixed block is refused: it goes back where it was
  const from = await at(4.25, 6.5);
  const onto = await at(8.5, 6.9);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(onto.x, onto.y, { steps: 6 });
  await page.mouse.up();
  l = await layout();
  assert.deepEqual([l[0].x, l[0].y], [4.25, 6.5], 'refused, back where it was');

  // a turn into a fixed block is refused
  const spot = await page.evaluate(() => {
    const T = window.__trundle;
    for (let y = 3; y < 9; y += 0.25)
      for (let x = 1; x < 9; x += 0.25) {
        const p = { type: 'plank', x, y, a: 0 };
        if (!T.SIM.overlaps(T.G.room, p) && T.SIM.overlaps(T.G.room, { ...p, a: 90 })) return p;
      }
  });
  await page.evaluate((p) => window.__trundle.setLayout([p]), spot);
  await page.evaluate(() => (window.__trundle.G.sel = window.__trundle.G.layout[0]));
  await page.evaluate(() => window.__trundle.turn(90));
  assert.equal((await layout())[0].a, 0, 'turning into a fixed part is refused');
  await page.evaluate(() => window.__trundle.setLayout([{ type: 'plank', x: 5.25, y: 5.2, a: 0 }]));

  // a drag stays inside the board
  const p0 = await at(5.25, 5.2);
  await page.mouse.move(p0.x, p0.y);
  await page.mouse.down();
  await page.mouse.move(p0.x + 30 * k, p0.y, { steps: 6 });
  const mid = await page.evaluate(() => window.__trundle.G.drag.part.x);
  assert.ok(mid <= 9.75, 'clamped inside the board');
  // and dropped on the bottom bar, it goes back to the tray
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
  await runOut(page);
  await page.evaluate(() => window.__trundle.setLayout([{ type: 'plank', x: 5.25, y: 6, a: 0 }]));
  const r = await page.evaluate(() => {
    const T = window.__trundle;
    const c = document.getElementById('board');
    const { k } = T.view();
    const s = T.toScreen(5.25, 6);
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

test('trundle AC-4: reaching the exit completes the room; Trundle cheers; its stars are kept as the best', async () => {
  const { context, page, errors } = await open('#1-1');
  await manual(page);
  await runOut(page);
  const stars = await solve(page, 0);
  assert.equal(stars, 3);
  const s = await page.evaluate(() => ({ robot: window.__trundle.G.robot.state, best: window.__trundle.loadRoom(0).best.stars }));
  assert.equal(s.robot, 'cheer');
  assert.equal(s.best, 3);
  await page.waitForSelector('[data-card="done"]:not([hidden])');
  assert.equal(await page.locator('[data-done-stars] img.got').count(), 3);
  assert.equal(await page.locator('[data-room-stars] img[src$="img/star.png"]').count(), 3);
  assert.deepEqual(errors, []);
  await context.close();
});

test('trundle AC-5: a miss ends on its own within 1 s of the ball resting or leaving; the trail and marker stay until Go', async () => {
  const { context, page } = await open('#1-1');
  await manual(page);
  await runOut(page);
  const r = await page.evaluate(() => {
    const T = window.__trundle;
    T.go(); // no parts: the ball falls through the gap
    let endT = null;
    let lastT = 0;
    let n = 0;
    while (T.G.mode === 'run' && n++ < 2000) {
      if (T.G.run.ending && endT === null) endT = T.G.run.t;
      lastT = T.G.run.t;
      T.frame(1000 / 60);
    }
    return { endT, lastT, mode: T.G.mode, marker: !!T.G.marker, trail: T.G.trail.length, robot: T.G.robot.state };
  });
  assert.equal(r.mode, 'edit');
  assert.ok(r.endT !== null && r.lastT - r.endT <= 1, `ended ${r.lastT - r.endT} s after the ball was lost`);
  assert.ok(r.lastT <= 12);
  assert.ok(r.marker, 'the near-miss marker shows');
  assert.ok(r.trail > 20, 'the trail stays');
  assert.equal(r.robot, 'wince');
  // the next Go clears the marker
  const m = await page.evaluate(() => {
    window.__trundle.go();
    return !!window.__trundle.G.marker;
  });
  assert.equal(m, false);
  await context.close();
});

test('trundle AC-6: every recorded solution takes all three stars, step for step the same at 60 Hz, 120 Hz and uneven frames; with no parts every room misses', async () => {
  const { context, page } = await open('#1-1');
  await manual(page);
  await runOut(page);
  const r = await page.evaluate(() => {
    const T = window.__trundle;
    let seed = 5;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const jitter = Array.from({ length: 4000 }, () => 7 + rnd() * 33);
    const plans = { hz60: () => 1000 / 60, hz120: () => 1000 / 120, uneven: (i) => jitter[i] };
    const out = [];
    for (let i = 0; i < T.ROOMS.length; i++) {
      const traces = {};
      for (const [name, ms] of Object.entries(plans)) {
        T.openRoom(i);
        T.G.misses[i] = 0;
        const s = T.ROOMS[i].solution;
        T.setLayout(s.layout, s.kick);
        T.go();
        const run = T.G.run;
        const poses = [];
        const step = run.step;
        run.step = () => {
          step();
          poses.push(run.ball.position.x.toFixed(6) + ',' + run.ball.position.y.toFixed(6));
        };
        let f = 0;
        while (T.G.mode === 'run' && f < 4000) T.frame(ms(f++));
        traces[name] = { poses: poses.join(';'), result: run.result, stars: run.stars.size, exitR: run.exitR };
      }
      // no parts, the demo's soft kick
      T.openRoom(i);
      T.setLayout([], 'soft');
      T.startRun(true);
      const demo = T.G.run;
      let f = 0;
      while (T.G.mode === 'demo' && f++ < 4000) T.frame(1000 / 60);
      out.push({ i, traces, demo: demo.result });
    }
    return out;
  });
  for (const { i, traces, demo } of r) {
    assert.equal(traces.hz60.result, 'won', `room ${i + 1} solution wins`);
    assert.equal(traces.hz60.stars, 3, `room ${i + 1} solution takes 3 stars`);
    assert.equal(traces.hz60.exitR, 0.5, 'no assist');
    assert.equal(traces.hz120.poses, traces.hz60.poses, `room ${i + 1}: 120 Hz is step for step the same`);
    assert.equal(traces.uneven.poses, traces.hz60.poses, `room ${i + 1}: uneven frames are step for step the same`);
    assert.equal(demo, 'missed', `room ${i + 1}: no parts misses`);
  }
  await context.close();
});

test('trundle AC-7: tapping Trundle switches the kick; the hard kick launches the ball faster', async () => {
  const { context, page } = await open('#1-1');
  await manual(page);
  await runOut(page);
  const robot = await page.evaluate(() => window.__trundle.toScreen(0.9, 4.5));
  await page.mouse.click(robot.x, robot.y);
  assert.equal(await page.evaluate(() => window.__trundle.G.kick), 'hard');
  const speeds = await page.evaluate(() => {
    const T = window.__trundle;
    const v = {};
    for (const kick of ['soft', 'hard']) {
      T.setLayout([], kick);
      T.go();
      T.frame(1000 / 60);
      v[kick] = T.G.run.ball.velocity.x;
      T.go(); // stop
    }
    return v;
  });
  assert.ok(speeds.hard > speeds.soft * 1.5, `hard ${speeds.hard} vs soft ${speeds.soft}`);
  await page.mouse.click(robot.x, robot.y);
  assert.equal(await page.evaluate(() => window.__trundle.G.kick), 'soft');
  await context.close();
});

test('trundle AC-8: each room brings its new thing: the wedge, the flap, the crate and the key', async () => {
  const { context, page } = await open('#1-3');
  await manual(page);
  await runOut(page);
  assert.ok(await page.locator('.part[data-part="wedge"]').count(), 'room 3 has a wedge in its tray');
  const r = await page.evaluate(() => {
    const T = window.__trundle;
    const watch = (i, fn) => {
      T.openRoom(i);
      const s = T.ROOMS[i].solution;
      T.setLayout(s.layout, s.kick);
      T.go();
      const run = T.G.run;
      let v = 0;
      let n = 0;
      while (T.G.mode === 'run' && n++ < 2000) {
        T.frame(1000 / 60);
        v = Math.max(v, fn(run));
      }
      return { v, result: run.result, end: fn(run) };
    };
    const flap = watch(3, (run) => Math.abs(run.flap.angle));
    const room5 = T.ROOMS[4];
    const crate = watch(4, (run) => Math.hypot(run.crate.position.x / 50 - room5.exit.x, run.crate.position.y / 50 - room5.exit.y));
    let keyAt = -1;
    let exitAt = -1;
    T.openRoom(5);
    const s = T.ROOMS[5].solution;
    T.setLayout(s.layout, s.kick);
    T.go();
    const run = T.G.run;
    const step = run.step;
    run.step = () => {
      step();
      for (const e of run.events) {
        if (e.type === 'key' && keyAt < 0) keyAt = run.steps;
        if (e.type === 'exit') exitAt = run.steps;
      }
    };
    let n = 0;
    while (T.G.mode === 'run' && n++ < 2000) T.frame(1000 / 60);
    // Without the key the exit stays shut: room 1's winning layout, with a key it never touches.
    const r1 = { ...T.ROOMS[0], key: { x: 0.6, y: 15 } };
    const locked = T.SIM.runToEnd(r1, T.ROOMS[0].solution.layout, { kick: T.ROOMS[0].solution.kick });
    const unlocked = T.SIM.runToEnd(T.ROOMS[0], T.ROOMS[0].solution.layout, { kick: T.ROOMS[0].solution.kick });
    return { flap, crate, keyAt, exitAt, locked: locked.result, unlocked: unlocked.result };
  });
  assert.ok(r.flap.v > 0.5, `the flap swings when hit (${r.flap.v} rad)`);
  assert.equal(r.flap.result, 'won');
  assert.ok(r.crate.end > 0.8, 'the crate was knocked off the exit');
  assert.equal(r.crate.result, 'won');
  assert.ok(r.keyAt > 0 && r.exitAt > r.keyAt, 'the key is touched before the exit takes the ball');
  assert.equal(r.unlocked, 'won');
  assert.equal(r.locked, 'missed', 'a locked exit lets the ball roll past');
  await context.close();
});

test('trundle AC-9: solving the last unsolved room, in any order, plays the floor run without stepping the physics; the rooms list plays it again after a reload', async () => {
  const { context, page, errors } = await open('#1-6');
  await manual(page);
  await runOut(page);
  for (const i of [5, 0, 1, 2, 3]) assert.equal(await solve(page, i), 3);
  assert.equal(await page.evaluate(() => window.__trundle.G.mode), 'done');
  await page.waitForTimeout(300);
  await solve(page, 4); // the last unsolved room
  await page.waitForFunction(() => window.__trundle.G.mode === 'floor', null, { timeout: 4000 });
  const r = await page.evaluate(() => {
    const T = window.__trundle;
    const steps = T.G.stepsTotal;
    const cams = [];
    const seen = new Set();
    let n = 0;
    while (!T.G.floor.end && n++ < 6000) {
      T.frame(1000 / 60);
      seen.add(T.G.floor.si);
      if (n % 60 === 0) cams.push(T.G.floor.camY);
    }
    return { steps0: steps, steps1: T.G.stepsTotal, end: T.G.floor.end, rooms: [...seen], cams, run: !!T.G.run };
  });
  assert.equal(r.end, true);
  assert.equal(r.steps1, r.steps0, 'no physics step during the floor run');
  assert.equal(r.run, false);
  assert.deepEqual(r.rooms, [0, 1, 2, 3, 4, 5], 'every room, in order');
  assert.ok(r.cams.at(-1) > r.cams[0] + 60, 'the camera follows the ball down');
  await page.waitForSelector('[data-card="floor"]:not([hidden])');
  assert.equal(await page.locator('[data-floor-stars]').textContent(), '18');
  // after a reload, from the rooms list
  await page.reload();
  await page.waitForFunction(() => window.__trundle);
  await page.click('[data-rooms]');
  await page.click('[data-floor-run]');
  assert.equal(await page.evaluate(() => window.__trundle.G.mode), 'floor');
  assert.deepEqual(errors, []);
  await context.close();
});

test('trundle AC-10: rooms open on a fresh browser; progress is kept; fewer stars keep the best; the hash opens a room', async () => {
  const { context, page, errors } = await open('#1-1');
  await manual(page);
  await page.click('[data-rooms]');
  assert.equal(await page.locator('.room-grid button').count(), 6);
  assert.equal(await page.locator('.room-grid button:disabled').count(), 0, 'every room is open');
  await page.click('.room-grid button:nth-child(4)');
  assert.equal(await page.evaluate(() => window.__trundle.G.ri), 3);
  await runOut(page);
  assert.equal(await solve(page, 0), 3);
  // a worse solve keeps the best
  const worse = await page.evaluate(() => {
    const T = window.__trundle;
    T.openRoom(0);
    T.setLayout([{ type: 'plank', x: 5.25, y: 6, a: 0 }], 'soft');
    T.go();
    let n = 0;
    while (T.G.mode === 'run' && n++ < 2000) T.frame(1000 / 60);
    return { stars: T.G.lastStars, best: T.loadRoom(0).best.stars };
  });
  assert.ok(worse.stars < 3);
  assert.equal(worse.best, 3);
  // kept after a reload, with the last layout
  await page.goto(BASE + 'trundle/#1-1');
  await page.reload();
  await page.waitForFunction(() => window.__trundle);
  const kept = await page.evaluate(() => ({ best: window.__trundle.loadRoom(0).best.stars, layout: window.__trundle.G.layout, mode: window.__trundle.G.mode }));
  assert.equal(kept.best, 3);
  assert.deepEqual(kept.layout, [{ type: 'plank', x: 5.25, y: 6, a: 0 }]);
  assert.equal(kept.mode, 'edit');
  // hashes
  for (const [h, ri] of [['#1-4', 3], ['#1-9', 0], ['#x', 0], ['#2-1', 0]]) {
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
  await runOut(blocked.page);
  assert.equal(await solve(blocked.page, 0), 3);
  assert.equal(await blocked.page.evaluate(() => window.__trundle.loadRoom(0).best.stars), 3, 'kept until the page reloads');
  assert.deepEqual(blocked.errors, []);
  await blocked.context.close();

  const { context, page, errors } = await open('#1-1', {}, () => {
    if (!sessionStorage.getItem('seeded')) {
      sessionStorage.setItem('seeded', '1');
      localStorage.setItem('trundle-v1-room-2', '{bad json');
      localStorage.setItem('trundle-v1-room-3', JSON.stringify({ layout: [{ type: 'wedge', x: 3, y: 9, a: 15 }], kick: 'hard', best: null }));
    }
  });
  await manual(page);
  await page.evaluate(() => window.__trundle.openRoom(1));
  assert.equal(await page.evaluate(() => window.__trundle.G.mode), 'demo', 'the unreadable room starts fresh');
  await page.evaluate(() => window.__trundle.openRoom(2));
  const r3 = await page.evaluate(() => ({ layout: window.__trundle.G.layout, kick: window.__trundle.G.kick }));
  assert.deepEqual(r3.layout, [{ type: 'wedge', x: 3, y: 9, a: 15 }], 'the other rooms are untouched');
  assert.equal(r3.kick, 'hard');
  assert.deepEqual(errors, []);
  await context.close();
});

test('trundle AC-11: hiding the page pauses a run; it stays paused when shown again and resumes on a tap', async () => {
  const { context, page } = await open('#1-1');
  await manual(page);
  await runOut(page);
  const setHidden = (h) =>
    page.evaluate((h) => {
      Object.defineProperty(document, 'hidden', { value: h, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    }, h);
  for (const start of ['run', 'demo', 'floor']) {
    await page.evaluate((start) => {
      const T = window.__trundle;
      T.openRoom(0);
      T.setLayout([], 'soft'); // ends the demo kick
      if (start === 'run') T.go();
      else if (start === 'demo') T.startRun(true);
      else {
        for (let i = 0; i < 6; i++) T.G.misses[i] = 0;
      }
      T.frame(100);
    }, start);
    if (start === 'floor') {
      for (let i = 0; i < 6; i++) await solve(page, i);
      await page.evaluate(() => window.__trundle.startFloorRun());
    }
    await setHidden(true);
    await setHidden(false);
    const before = await page.evaluate(() => [window.__trundle.G.paused, window.__trundle.G.stepsTotal, window.__trundle.G.floor && window.__trundle.G.floor.phaseT]);
    assert.equal(before[0], true, `${start}: paused`);
    await page.evaluate(() => window.__trundle.frame(500));
    const still = await page.evaluate(() => [window.__trundle.G.stepsTotal, window.__trundle.G.floor && window.__trundle.G.floor.phaseT]);
    assert.deepEqual(still, before.slice(1), `${start}: nothing moves while paused`);
    assert.ok(await page.locator('[data-paused]').isVisible());
    await page.click('[data-paused]');
    assert.equal(await page.evaluate(() => window.__trundle.G.paused), false, `${start}: a tap resumes`);
  }
  await context.close();
});

test('trundle AC-12: the exit takes the ball from 5% further away a miss from the 4th miss, up to 20%, and is normal again once done', async () => {
  const { context, page } = await open('#1-1');
  await manual(page);
  await runOut(page);
  const r = await page.evaluate(() => {
    const T = window.__trundle;
    const radii = [];
    T.setLayout([], 'soft');
    for (let m = 0; m < 9; m++) {
      T.go();
      radii.push(T.G.run.exitR);
      let n = 0;
      while (T.G.mode === 'run' && n++ < 2000) T.frame(1000 / 60);
    }
    // a stopped run is not a miss
    const missesBefore = T.G.misses[0];
    T.go();
    T.go();
    const afterStop = T.G.misses[0];
    T.setLayout(T.ROOMS[0].solution.layout, T.ROOMS[0].solution.kick);
    T.go();
    let n = 0;
    while (T.G.mode === 'run' && n++ < 2000) T.frame(1000 / 60);
    T.openRoom(0);
    T.go();
    return { radii, missesBefore, afterStop, after: T.G.run.exitR, misses: T.G.misses[0] };
  });
  const want = [0.5, 0.5, 0.5, 0.5, 0.525, 0.55, 0.575, 0.6, 0.6];
  r.radii.forEach((v, i) => assert.ok(Math.abs(v - want[i]) < 1e-9, `run ${i + 1}: ${v} vs ${want[i]}`));
  assert.equal(r.afterStop, r.missesBefore);
  assert.equal(r.misses, 0);
  assert.equal(r.after, 0.5);
  await context.close();
});

for (const [w, h] of [
  [360, 640],
  [390, 844],
  [1280, 720],
]) {
  test(`trundle AC-13: at ${w}×${h} the board and the bar fit, the board keeps its shape, and every button is at least 44 px`, async () => {
    const { context, page } = await open('#1-6', { viewport: { width: w, height: h } });
    await manual(page);
    await runOut(page);
    const r = await page.evaluate(() => {
      const { k, bx, by } = window.__trundle.view();
      const bar = document.querySelector('[data-bar]').getBoundingClientRect();
      const btns = [...document.querySelectorAll('button')].filter((b) => b.offsetParent !== null).map((b) => b.getBoundingClientRect());
      const back = document.querySelector('.shell-back').getBoundingClientRect();
      return {
        board: { l: bx, t: by, r: bx + 10 * k, b: by + 16 * k },
        bar: { t: bar.top, b: bar.bottom },
        top: document.querySelector('.top').getBoundingClientRect().bottom,
        small: btns.filter((b) => b.width < 44 || b.height < 44).length,
        n: btns.length,
        back: back.width,
        scroll: document.scrollingElement.scrollHeight - innerHeight,
      };
    });
    assert.ok(r.board.l >= 16 && r.board.r <= w - 16, 'clear of the side edges');
    assert.ok(r.board.t >= r.top && r.board.b <= r.bar.t, 'between the top bar and the bottom bar');
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
    const room = { robot: { x: 0.9, y: 1.5, dir: 1 }, ball: { x: 5, y: 0.5 }, fixed: [], exit: { x: 9, y: 15.5 }, stars: [] };
    const out = [];
    for (const x of [4.2, 5, 5.8]) {
      const run = SIM.createRun(room, [{ type: 'plank', x, y: 14, a: 0 }], { kick: 'soft' });
      run.ball.velocity.x = 0; // straight down, as fast as a ball can go
      window.Matter.Body.setVelocity(run.ball, { x: 0, y: (SIM.VMAX * SIM.S) / 60 });
      let lowest = 0;
      for (let i = 0; i < 240; i++) {
        run.step();
        lowest = Math.max(lowest, run.pose().y);
        if (run.result) break;
      }
      out.push(lowest);
    }
    return out;
  });
  for (const y of r) assert.ok(y < 14, `the ball stayed above the plank (lowest ${y})`);
  await context.close();
});

test('trundle AC-15: once the game has been opened at room 1, room 6 plays offline', async () => {
  const { context, page } = await open('#1-1');
  await page.evaluate(() => navigator.serviceWorker.register('../sw.js'));
  await page.evaluate(() => Promise.race([navigator.serviceWorker.ready, new Promise((r) => setTimeout(r, 10000))]));
  await page.reload(); // controlled now: this load caches the game's files
  await page.waitForFunction(() => window.__trundle);
  await page.waitForLoadState('networkidle');
  await context.setOffline(true);
  await page.goto(BASE + 'trundle/#1-6');
  await page.reload();
  await page.waitForFunction(() => window.__trundle);
  await manual(page);
  await runOut(page);
  assert.equal(await solve(page, 5), 3);
  const imgs = await page.evaluate(() =>
    Promise.all(['img/crate.png', 'img/key.png', 'img/hole_large_end_locked.png', 'img/block_corner.png'].map((u) => fetch(u).then((r) => r.ok)))
  );
  assert.deepEqual(imgs, [true, true, true, true]);
  await context.close();
});

test('trundle AC-16: hits, stars, the exit and the kick play sounds; a resting contact does not repeat; nothing plays muted', async () => {
  const { context, page } = await open('#1-1', {}, FAKE_AUDIO);
  await manual(page);
  await page.mouse.click(5, 300); // unlock audio
  await page.waitForFunction(() => window.__decoded >= 15);
  const sizes = await page.evaluate(async () => {
    const out = {};
    for (const n of ['kick', 'star', 'exit', 'plank', 'metal']) out[n] = (await (await fetch(`sounds/${n}.mp3`)).arrayBuffer()).byteLength;
    return out;
  });
  await runOut(page);
  const played = await page.evaluate(() => {
    const T = window.__trundle;
    T.openRoom(0);
    T.setLayout(T.ROOMS[0].solution.layout, T.ROOMS[0].solution.kick);
    window.__played.length = 0;
    T.go();
    let n = 0;
    while (T.G.mode === 'run' && n++ < 2000) T.frame(1000 / 60);
    return window.__played.map((p) => p.bytes);
  });
  const count = (n) => played.filter((b) => b === sizes[n]).length;
  assert.equal(count('kick'), 1);
  assert.equal(count('star'), 3);
  assert.equal(count('exit'), 1);
  assert.ok(count('plank') >= 1, 'the ball hitting the plank sounds');
  // a ball resting on a ledge does not re-trigger its sound every step
  const rest = await page.evaluate(() => {
    const { SIM } = window.__trundle;
    const room = { robot: { x: 0.9, y: 4, dir: 1 }, ball: { x: 5, y: 3.7 }, fixed: [{ x: 5, y: 4.3, w: 10, h: 0.6 }], exit: { x: 99, y: 3 }, stars: [] };
    const run = SIM.createRun(room, [], { kick: 'soft' });
    window.Matter.Body.setVelocity(run.ball, { x: 0, y: 3 });
    let hits = 0;
    for (let i = 0; i < 240; i++) {
      run.step();
      hits += run.events.filter((e) => e.type === 'hit').length;
    }
    return hits;
  });
  assert.ok(rest <= 2, `a resting ball made ${rest} hit sounds`);
  // muted: nothing
  await page.click('[data-mute]');
  const muted = await page.evaluate(() => {
    window.__played.length = 0;
    const T = window.__trundle;
    T.openRoom(0);
    T.go();
    let n = 0;
    while (T.G.mode === 'run' && n++ < 2000) T.frame(1000 / 60);
    return window.__played.length;
  });
  assert.equal(muted, 0);
  await context.close();
});

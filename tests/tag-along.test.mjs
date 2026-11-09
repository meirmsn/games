// End-to-end tests for Tag Along. Run: scripts/check-slow.sh.
// The game exposes window.__tagAlong (its state, form() to set up a line, and a step(dt) that
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
  await page.goto(BASE + 'tag-along/');
  await page.waitForFunction(() => window.__tagAlong);
  return { context, page, errors };
}

// Start a run on a street with an empty road; the test owns the clock from here.
async function startEmpty(page, street = 0) {
  await page.evaluate((street) => {
    const t = window.__tagAlong;
    t.seed(7);
    t.startGame(street);
    t.manual = true;
    t.clearTraffic();
    t.people().length = 0;
    t.game.spawnIn = [999, 999];
    t.game.medianIn = 999;
  }, street);
}

const run = (page, seconds) =>
  page.evaluate((seconds) => {
    for (let i = 0; i < Math.round(seconds * 60); i++) window.__tagAlong.step(1 / 60);
  }, seconds);

// A step from input, then long enough for its tween.
const move = async (page, dir) => {
  await page.evaluate((dir) => window.__tagAlong.move(dir), dir);
  await run(page, 0.15);
};

const cells = (page) =>
  page.evaluate(() => {
    const t = window.__tagAlong;
    return { leader: [t.leader.col, t.leader.row], line: t.line().map((p) => [p.col, p.row]) };
  });

test('tag-along AC-1: traffic drives behind the start card; Start begins street 1 with 45 s', async () => {
  const { context, page, errors } = await open();
  await page.waitForTimeout(500);
  const s = await page.evaluate(() => {
    const t = window.__tagAlong;
    return {
      mode: t.game.mode,
      start: !document.querySelector('[data-screen="start"]').hidden,
      vehicles: t.vehicles().length,
      waiting: t.people().filter((p) => p.kind === 'waiting').length,
      s0: t.vehicles().map((v) => v.s),
    };
  });
  assert.equal(s.mode, 'title');
  assert.ok(s.start, 'the start card shows');
  assert.ok(s.vehicles >= 3, 'traffic is driving');
  assert.ok(s.waiting >= 3, 'people wait on the kerbs');
  await page.waitForTimeout(300);
  const moved = await page.evaluate(() => window.__tagAlong.vehicles().map((v) => v.s));
  assert.ok(moved.some((v, i) => s.s0[i] !== undefined && v !== s.s0[i]), 'the vehicles move');
  await page.click('[data-play]');
  const after = await page.evaluate(() => ({ mode: window.__tagAlong.game.mode, street: window.__tagAlong.game.street, clock: window.__tagAlong.game.clock }));
  assert.deepEqual(after, { mode: 'play', street: 0, clock: 45 });
  assert.deepEqual(errors, []);
  await context.close();
});

test('tag-along AC-2: each follower steps into the cell ahead; nobody moves while the leader waits', async () => {
  const { context, page } = await open();
  await startEmpty(page);
  await page.evaluate(() => window.__tagAlong.form([[5, 2], [5, 3], [5, 4]], { tail: [4, 4] }));
  await move(page, 'right');
  assert.deepEqual(await cells(page), { leader: [6, 2], line: [[5, 2], [5, 3]] });
  await move(page, 'up');
  assert.deepEqual(await cells(page), { leader: [6, 1], line: [[6, 2], [5, 2]] });
  await run(page, 3);
  assert.deepEqual(await cells(page), { leader: [6, 1], line: [[6, 2], [5, 2]] }, 'no step, no move');
  await context.close();
});

test('tag-along AC-3: the line and the edges block the leader; a boxed-in leader swaps with follower 1', async () => {
  const { context, page } = await open();
  await startEmpty(page);
  await page.evaluate(() => window.__tagAlong.form([[0, 2], [0, 3], [1, 3]]));
  await move(page, 'left');
  assert.deepEqual((await cells(page)).leader, [0, 2], 'the edge');
  await move(page, 'down');
  assert.deepEqual((await cells(page)).leader, [0, 2], 'its own line');
  // Boxed in: the corner, follower 1 to the right, follower 2 above.
  await page.evaluate(() => window.__tagAlong.form([[0, 4], [1, 4], [0, 3], [0, 2]]));
  await move(page, 'right');
  assert.deepEqual(await cells(page), { leader: [1, 4], line: [[0, 4], [0, 3], [0, 2]] });
  await context.close();
});

test('tag-along AC-4: someone waiting joins only when the cell the tail adds is safe', async () => {
  const { context, page } = await open();
  await startEmpty(page);
  const joined = await page.evaluate(() => {
    const t = window.__tagAlong;
    const bottom = t.layout().bottom;
    // The leader in lane 2, the tail's next cell in lane 3: no join.
    t.form([[5, 2], [5, 3]], { tail: [5, 3 + 0] });
    t.history()[2] = { col: 6, row: 3 };
    const p = t.spawnWaiting(bottom, 6);
    p.tw = 1;
    p.kind = 'pending';
    for (let i = 0; i < 30; i++) t.step(1 / 60);
    const inLane = t.line().length;
    // The tail's next cell on the kerb: they join, onto it.
    t.history()[2] = { col: 6, row: bottom };
    for (let i = 0; i < 30; i++) t.step(1 / 60);
    const onKerb = t.line().length;
    const last = t.line()[t.line().length - 1];
    // Someone walking back after a knock can't be asked.
    t.form([[3, bottom]]);
    const q = t.spawnWaiting(bottom, 4);
    q.tw = 1;
    q.kind = 'back';
    q.down = 0.5;
    for (let i = 0; i < 10; i++) t.step(1 / 60);
    return { inLane, onKerb, last: [last.col, last.row], bottom, qKind: q.kind, line: t.line().length };
  });
  assert.equal(joined.inLane, 1, 'no join while the tail would add a lane cell');
  assert.equal(joined.onKerb, 2);
  assert.deepEqual(joined.last, [6, joined.bottom]);
  assert.equal(joined.qKind, 'back');
  assert.equal(joined.line, 0);
  await context.close();
});

test('tag-along AC-5: arrivals score 1, 2, 3 … in a crossing and add 0.5 + 0.5 × n seconds', async () => {
  const { context, page } = await open();
  await startEmpty(page);
  await page.evaluate(() => {
    const t = window.__tagAlong;
    t.form([[5, 1], [5, 2], [5, 3]], { dest: 0 });
    t.leader.heading = 0;
    t.leader.from = t.layout().bottom;
    t.game.crossing = 0;
  });
  await move(page, 'up'); // leader on the kerb
  let s = await page.evaluate(() => ({ score: window.__tagAlong.game.score }));
  assert.deepEqual(s, { score: 0 });
  await move(page, 'right'); // follower 1 arrives
  s = await page.evaluate(() => ({ score: window.__tagAlong.game.score, line: window.__tagAlong.line().length }));
  assert.deepEqual(s, { score: 1, line: 1 });
  const c1 = await page.evaluate(() => window.__tagAlong.game.clock);
  await move(page, 'right'); // follower 2 arrives: +2, +1 s
  const s2 = await page.evaluate(() => ({ score: window.__tagAlong.game.score, clock: window.__tagAlong.game.clock, line: window.__tagAlong.line().length }));
  assert.equal(s2.score, 3);
  assert.equal(s2.line, 0);
  assert.ok(Math.abs(s2.clock - (c1 + 1.5 - 0.15)) < 0.02, `clock ${s2.clock} vs ${c1}`);
  // Stepping from the kerb into a lane starts a new crossing.
  await move(page, 'down');
  assert.equal(await page.evaluate(() => window.__tagAlong.game.crossing), 0);
  // The median doesn't reset it.
  await startEmpty(page, 1);
  const median = await page.evaluate(() => {
    const t = window.__tagAlong;
    const m = t.layout().rows.indexOf('M');
    t.form([[5, m]]);
    t.game.crossing = 3;
    t.move('up');
    return t.game.crossing;
  });
  assert.equal(median, 3);
  await context.close();
});

test('tag-along AC-6: a hit follower goes back and the rest keep their cells; a hit leader scatters the line', async () => {
  const { context, page } = await open();
  await startEmpty(page);
  const r = await page.evaluate(() => {
    const t = window.__tagAlong;
    const [, f2] = t.form([[5, 1], [5, 2], [5, 3], [5, 4]], { dest: 0 });
    // A car right on follower 2, in lane 3.
    const v = t.spawnVehicle(3, 'sedan');
    v.s = 1e9; // placed below
    const want = t.colX(5);
    v.s = v.dir === 1 ? want + v.w / 2 + t.ENTRY : t.PLAY_W + t.ENTRY - (want - v.w / 2);
    t.step(1 / 60);
    const out = { f2: f2.kind, line: t.line().map((p) => [p.col, p.row]) };
    // A person walking back can't be hit again.
    for (let i = 0; i < 60; i++) t.step(1 / 60);
    out.back = f2.kind;
    return out;
  });
  assert.equal(r.f2, 'back');
  assert.deepEqual(r.line, [[5, 2], [5, 4]], 'the others keep their cells');
  assert.notEqual(r.back, 'follower');
  const l = await page.evaluate(() => {
    const t = window.__tagAlong;
    t.vehicles().length = 0;
    t.form([[5, 2], [5, 3], [5, 4]], { dest: 0 });
    t.leader.from = t.layout().bottom;
    const v = t.spawnVehicle(2, 'sedan');
    const want = t.colX(5);
    v.s = v.dir === 1 ? want + v.w / 2 + t.ENTRY : t.PLAY_W + t.ENTRY - (want - v.w / 2);
    t.step(1 / 60);
    const out = { down: t.leader.down > 0, line: t.line().length, kinds: t.people().filter((p) => p.kind === 'back').length };
    t.vehicles().length = 0;
    for (let i = 0; i < 100; i++) t.step(1 / 60);
    out.row = t.leader.row;
    out.bottom = t.layout().bottom;
    return out;
  });
  assert.equal(l.down, true);
  assert.equal(l.line, 0);
  assert.ok(l.kinds >= 2);
  assert.equal(l.row, l.bottom, 'back on the kerb it last left');
  await context.close();
});

test('tag-along AC-7: a close call adds 0.3 s, once per vehicle and person, at most 1 s a crossing', async () => {
  const { context, page } = await open();
  await startEmpty(page);
  const r = await page.evaluate(() => {
    const t = window.__tagAlong;
    t.form([[5, 2]]);
    const c0 = t.game.clock;
    const passBy = () => {
      // A car just past the leader, 2 art px clear of it.
      const v = t.spawnVehicle(2, 'sedan');
      const x = t.colX(5) + 2.5 + 2;
      // Its box starts at x (boxes are 10% in from the art at each end).
      if (v.dir === 1) v.s = x - v.w * 0.1 + v.w + t.ENTRY;
      else v.s = t.PLAY_W + t.ENTRY - (t.colX(5) - 2.5 - 2 - v.w * 0.9);
      for (let i = 0; i < 20; i++) t.step(1 / 60);
      return v;
    };
    passBy();
    const one = t.game.clock - c0;
    for (let i = 0; i < 6; i++) passBy();
    return { one, total: t.game.clock - c0 };
  });
  assert.ok(Math.abs(r.one - 0.3) < 1e-6, `one close call: ${r.one}`);
  assert.ok(Math.abs(r.total - 1) < 1e-6, `capped: ${r.total}`);
  await context.close();
});

test('tag-along AC-8: the clock runs down and the run ends at zero with the game-over card', async () => {
  const { context, page } = await open();
  await startEmpty(page);
  await move(page, 'left');
  const c0 = await page.evaluate(() => window.__tagAlong.game.clock);
  await run(page, 2);
  const c1 = await page.evaluate(() => window.__tagAlong.game.clock);
  assert.ok(Math.abs(c0 - c1 - 2) < 0.05, 'real time');
  await page.evaluate(() => {
    window.__tagAlong.game.clock = 1;
    window.__tagAlong.game.score = 17;
  });
  await run(page, 1.2);
  const s = await page.evaluate(() => ({
    mode: window.__tagAlong.game.mode,
    over: !document.querySelector('[data-screen="over"]').hidden,
    score: document.querySelector('[data-final-score]').textContent,
    detail: document.querySelector('[data-final-detail]').textContent,
  }));
  assert.equal(s.mode, 'over');
  assert.ok(s.over);
  assert.equal(s.score, '17');
  assert.match(s.detail, /Maple Street/);
  await page.click('[data-again]');
  assert.equal(await page.evaluate(() => window.__tagAlong.game.mode), 'title');
  assert.ok(await page.evaluate(() => !document.querySelector('[data-screen="start"]').hidden));
  await context.close();
});

test('tag-along AC-9: lanes come in platoons and lulls, shown by their lights, neighbours out of step', async () => {
  const { context, page } = await open();
  const r = await page.evaluate(() => {
    const t = window.__tagAlong;
    t.seed(3);
    t.startGame(1);
    t.manual = true;
    // Just set up, neighbours start in different phases.
    t.setupStreet(1);
    const lanes = t.layout().lanes;
    const neighbours = lanes.slice(1).every((ln, i) => ln.phase !== t.layout().lanes[i].phase);
    const seen = t.layout().lanes.map(() => ({ on: 0, off: 0, wrong: 0, spawnsInLull: 0 }));
    const known = new Set(t.vehicles().map((v) => v.id));
    for (let i = 0; i < 60 * 40; i++) {
      t.step(1 / 60);
      t.layout().lanes.forEach((ln, k) => {
        seen[k][ln.phase]++;
        if ((ln.phase === 'on') !== (ln.light === 'green') && ln.light !== 'siren') seen[k].wrong++;
      });
      for (const v of t.vehicles()) {
        if (known.has(v.id)) continue;
        known.add(v.id);
        const ln = t.layout().lanes.find((l) => l.row === v.lane);
        if (ln.phase !== 'on') seen[t.layout().lanes.indexOf(ln)].spawnsInLull++;
      }
    }
    return { neighbours, seen };
  });
  assert.ok(r.neighbours, 'no two neighbouring lanes start in the same phase');
  for (const s of r.seen) {
    assert.ok(s.on > 0 && s.off > 0, 'each lane has platoons and lulls');
    assert.equal(s.wrong, 0, 'the light matches the phase');
    assert.equal(s.spawnsInLull, 0, 'nothing enters in a lull');
  }
  await context.close();
});

// Bring one follower onto the far kerb: one arrival.
const arriveOne = (page) =>
  page.evaluate(() => {
    const t = window.__tagAlong;
    t.form([[4, 0], [4, 1]], { dest: 0 });
    t.leader.heading = t.layout().bottom;
    t.leader.from = 0;
    t.move('right');
  });

test('tag-along AC-10: meeting the quota changes the street once the line is off the road', async () => {
  const { context, page } = await open();
  await startEmpty(page);
  await page.evaluate(() => {
    window.__tagAlong.game.arrived = 7;
    window.__tagAlong.game.score = 50;
  });
  await arriveOne(page);
  await run(page, 0.1);
  let s = await page.evaluate(() => ({ mode: window.__tagAlong.game.mode, clock: window.__tagAlong.game.clock }));
  assert.equal(s.mode, 'change');
  await run(page, 0.8);
  const mid = await page.evaluate(() => window.__tagAlong.game.clock);
  assert.ok(Math.abs(mid - s.clock) < 1e-9, 'the clock stops during the change');
  await run(page, 1.05);
  const added = await page.evaluate(() => window.__tagAlong.game.clock);
  assert.ok(Math.abs(added - s.clock - 10) < 1e-9, `the new street adds 10 s: ${added - s.clock}`);
  await run(page, 0.3);
  s = await page.evaluate(() => ({ mode: window.__tagAlong.game.mode, street: window.__tagAlong.game.street, score: window.__tagAlong.game.score }));
  assert.deepEqual(s, { mode: 'play', street: 1, score: 51 });
  // Quotas, and a pending change waits while someone is still in a lane.
  const quotas = await page.evaluate(() => window.__tagAlong.STREETS.map((s) => s.quota));
  assert.deepEqual(quotas, [8, 10, 12, 14, 16]);
  await startEmpty(page);
  const waits = await page.evaluate(() => {
    const t = window.__tagAlong;
    t.game.arrived = 7;
    t.form([[4, 0], [4, 1], [4, 2]], { dest: 0 });
    t.line()[1].dest = t.layout().bottom; // not arriving here
    t.leader.heading = t.layout().bottom;
    t.move('right');
    for (let i = 0; i < 10; i++) t.step(1 / 60);
    return t.game.mode;
  });
  assert.equal(waits, 'play', 'someone is still in a lane');
  // Downtown repeats, 4% faster each round.
  await startEmpty(page, 4);
  await page.evaluate(() => (window.__tagAlong.game.arrived = 15));
  await arriveOne(page);
  await run(page, 2.3);
  s = await page.evaluate(() => ({ street: window.__tagAlong.game.street, round: window.__tagAlong.game.round }));
  assert.deepEqual(s, { street: 4, round: 1 });
  const speeds = await page.evaluate(() => {
    const t = window.__tagAlong;
    t.manual = true;
    t.clearTraffic();
    t.game.assist = 0;
    const lane = t.layout().lanes[0];
    const v = t.spawnVehicle(lane.row, 'sedan', 0);
    v.speed = 20;
    for (let i = 0; i < 60; i++) t.step(1 / 60);
    return v.s;
  });
  assert.ok(Math.abs(speeds - 20.8) < 0.3, `4% faster: ${speeds}`);
  await context.close();
});

test('tag-along AC-11: the median, the crosswalk and the sirens come on their streets', async () => {
  const { context, page } = await open();
  const rules = await page.evaluate(() =>
    window.__tagAlong.STREETS.map((s) => ({ median: s.rows.includes('M'), crosswalk: !!s.crosswalk, sirens: !!s.sirens }))
  );
  assert.deepEqual(rules.map((r) => r.median), [false, true, false, false, true]);
  assert.deepEqual(rules.map((r) => r.crosswalk), [false, false, true, false, true]);
  assert.deepEqual(rules.map((r) => r.sirens), [false, false, false, true, true]);
  // The walk light stops cars before the crosswalk.
  await startEmpty(page, 2);
  const cw = await page.evaluate(() => {
    const t = window.__tagAlong;
    const w = t.game.walk;
    w.phase = 'walk';
    w.t = 0;
    const lane = t.layout().lanes[0];
    const v = t.spawnVehicle(lane.row, 'sedan', 80);
    for (let i = 0; i < 60 * 3.9; i++) t.step(1 / 60);
    const x = t.xOf(v);
    const x0 = t.colX(w.col) - 6;
    const x1 = t.colX(w.col) + 6;
    const clear = x + v.w <= x0 + 0.01 || x >= x1 - 0.01;
    // Walk ends with a person on the crosswalk in this lane: the car waits, at most 2 s.
    t.form([[w.col, lane.row]]);
    t.game.grace = 99; // nobody hittable: just watching the car
    for (let i = 0; i < 60 * 0.5; i++) t.step(1 / 60);
    const s1 = v.s;
    for (let i = 0; i < 60 * 1.2; i++) t.step(1 / 60);
    const waited = v.s - s1 < 0.5;
    for (let i = 0; i < 60 * 2; i++) t.step(1 / 60);
    return { clear, waited, goes: v.s - s1 > 5, phase: w.phase };
  });
  assert.ok(cw.clear, 'stopped before the crosswalk');
  assert.ok(cw.waited, 'waits for the person on it');
  assert.ok(cw.goes, 'then goes, after at most 2 s');
  // Sirens warn 2.5 s before they come.
  await startEmpty(page, 3);
  const sr = await page.evaluate(() => {
    const t = window.__tagAlong;
    t.game.sirenIn = 0.01;
    t.heard.length = 0;
    t.step(1 / 60);
    t.step(1 / 60);
    const warned = !!t.game.siren && t.heard.some((h) => h.name === 'siren');
    let at = 0;
    for (let i = 0; i < 60 * 4; i++) {
      t.step(1 / 60);
      if (!at && t.vehicles().some((v) => v.siren)) at = (i + 1) / 60;
    }
    return { warned, at };
  });
  assert.ok(sr.warned);
  assert.ok(sr.at >= 2.45, `the siren came after ${sr.at} s`);
  await context.close();
});

test('tag-along AC-12: taps, holds, swipes and keys step; a second finger does nothing', async () => {
  const { context, page } = await open();
  await startEmpty(page);
  await page.evaluate(() => {
    window.__tagAlong.manual = false;
    window.__tagAlong.form([[5, window.__tagAlong.layout().bottom]]);
  });
  const leader = () => page.evaluate(() => [window.__tagAlong.leader.col, window.__tagAlong.leader.row]);
  const bottom = await page.evaluate(() => window.__tagAlong.layout().bottom);
  // Tap: from the kerb into the road.
  await page.mouse.click(195, 300);
  await page.waitForTimeout(150);
  assert.deepEqual(await leader(), [5, bottom - 1]);
  // Swipe right.
  await page.mouse.move(150, 300);
  await page.mouse.down();
  await page.mouse.move(230, 305, { steps: 4 });
  await page.mouse.up();
  await page.waitForTimeout(150);
  assert.deepEqual(await leader(), [6, bottom - 1]);
  // Keys.
  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(120);
  await page.keyboard.press('d');
  await page.waitForTimeout(120);
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(120);
  assert.deepEqual(await leader(), [6, bottom]);
  await page.keyboard.press(' ');
  await page.waitForTimeout(120);
  assert.deepEqual(await leader(), [6, bottom - 1], 'Space steps forward');
  // Hold: steps repeat.
  await page.evaluate(() => window.__tagAlong.clearTraffic());
  await page.mouse.move(195, 300);
  await page.mouse.down();
  await page.waitForTimeout(600);
  await page.mouse.up();
  const held = await leader();
  assert.ok(held[1] <= bottom - 3, `held: ${held}`);
  // A second finger while the first is down does nothing.
  const two = await page.evaluate(() => {
    const t = window.__tagAlong;
    t.form([[5, t.layout().bottom]]);
    t.leader.heading = 0;
    const c = document.getElementById('street');
    const ev = (type, id, x) => c.dispatchEvent(new PointerEvent(type, { pointerId: id, clientX: x, clientY: 300, bubbles: true, isPrimary: id === 1 }));
    ev('pointerdown', 1, 100);
    ev('pointerdown', 2, 200);
    ev('pointerup', 2, 300);
    const mid = [t.leader.col, t.leader.row];
    ev('pointerup', 1, 100);
    return { mid, end: [t.leader.col, t.leader.row] };
  });
  assert.deepEqual(two.mid, [5, bottom], 'the second finger did nothing');
  assert.deepEqual(two.end, [5, bottom - 1], 'the first finger tapped');
  // Forward along the kerb while some of the line is still in the road.
  const along = await page.evaluate(() => {
    const t = window.__tagAlong;
    t.manual = true;
    t.form([[5, 0], [5, 1], [5, 2]], { dest: 0 });
    t.line()[0].dest = t.layout().bottom; // stays in line on this kerb
    t.leader.heading = t.layout().bottom;
    const onKerb = t.forwardDir();
    t.form([[5, 2], [5, 3]]);
    t.leader.heading = 0;
    const inRoad = t.forwardDir();
    t.form([[5, 0]]);
    t.leader.heading = t.layout().bottom;
    return { onKerb, inRoad, empty: t.forwardDir() };
  });
  assert.ok(['left', 'right'].includes(along.onKerb));
  assert.equal(along.inRoad, 'up');
  assert.equal(along.empty, 'down');
  await context.close();
});

test('tag-along AC-13: the hidden assist rises with a hit, falls with an arrival, and slows traffic', async () => {
  const { context, page } = await open();
  const first = await page.evaluate(() => {
    window.__tagAlong.startGame(0);
    return window.__tagAlong.game.assist;
  });
  assert.equal(first, 0.4);
  await startEmpty(page);
  const r = await page.evaluate(() => {
    const t = window.__tagAlong;
    t.game.assist = 0.5;
    t.form([[5, 2]]);
    const v = t.spawnVehicle(2, 'sedan');
    const want = t.colX(5);
    v.s = v.dir === 1 ? want + v.w / 2 + t.ENTRY : t.PLAY_W + t.ENTRY - (want - v.w / 2);
    t.step(1 / 60);
    const afterHit = t.game.assist;
    t.vehicles().length = 0;
    for (let i = 0; i < 100; i++) t.step(1 / 60);
    t.form([[4, 0], [4, 1]], { dest: 0 });
    t.move('right');
    const afterArrival = t.game.assist;
    const dist = (a) => {
      t.vehicles().length = 0;
      t.game.assist = a;
      const u = t.spawnVehicle(t.layout().lanes[0].row, 'sedan', 0);
      u.speed = 20;
      u.v = 20;
      for (let i = 0; i < 60; i++) t.step(1 / 60);
      return u.s;
    };
    return { afterHit, afterArrival, slow: dist(1), fast: dist(0) };
  });
  assert.equal(r.afterHit, 0.75);
  assert.ok(Math.abs(r.afterArrival - 0.72) < 1e-9);
  assert.ok(r.slow < r.fast * 0.8, `slower with the assist: ${r.slow} vs ${r.fast}`);
  // The next run keeps 60% of it.
  const next = await page.evaluate(() => {
    const t = window.__tagAlong;
    t.game.assist = 1;
    t.game.clock = 0.01;
    t.game.clockRunning = true;
    t.step(1 / 60);
    t.startGame(0);
    return t.game.assist;
  });
  assert.ok(Math.abs(next - 0.6) < 1e-9, `next run: ${next}`);
  await context.close();
});

test('tag-along AC-14: hiding the page pauses; the resuming tap doesn’t step and nobody is hit for 0.5 s', async () => {
  const { context, page } = await open();
  await startEmpty(page);
  await page.evaluate(() => {
    const t = window.__tagAlong;
    t.manual = false;
    t.form([[5, 2]]);
    t.game.clockRunning = true;
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  const c0 = await page.evaluate(() => window.__tagAlong.game.clock);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForTimeout(400);
  const s = await page.evaluate(() => ({
    paused: window.__tagAlong.game.paused,
    card: !document.querySelector('[data-screen="paused"]').hidden,
    clock: window.__tagAlong.game.clock,
  }));
  assert.equal(s.paused, true);
  assert.ok(s.card, 'the paused card shows');
  assert.equal(s.clock, c0, 'frozen until a tap');
  const r = await page.evaluate(() => {
    const t = window.__tagAlong;
    t.manual = true;
    const c = document.getElementById('street');
    c.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 5, clientX: 100, clientY: 300, bubbles: true }));
    c.dispatchEvent(new PointerEvent('pointerup', { pointerId: 5, clientX: 100, clientY: 300, bubbles: true }));
    const leader = [t.leader.col, t.leader.row];
    // A car right on the leader during the next 0.5 s: no hit.
    const v = t.spawnVehicle(2, 'sedan');
    const want = t.colX(5);
    v.s = v.dir === 1 ? want + v.w / 2 + t.ENTRY : t.PLAY_W + t.ENTRY - (want - v.w / 2);
    v.speed = 0;
    v.v = 0;
    for (let i = 0; i < 24; i++) t.step(1 / 60);
    const during = t.leader.down > 0;
    for (let i = 0; i < 12; i++) t.step(1 / 60);
    return { paused: t.game.paused, leader, during, afterwards: t.leader.down > 0 };
  });
  assert.equal(r.paused, false);
  assert.deepEqual(r.leader, [5, 2], 'the tap that resumed did not step');
  assert.equal(r.during, false);
  assert.equal(r.afterwards, true);
  await context.close();
});

test('tag-along AC-15: the best and the furthest street are kept; chips start a run there', async () => {
  const { context, page } = await open();
  await page.evaluate(() => localStorage.setItem('tag-along', JSON.stringify({ best: 12, reached: 2, assist: 0.2 })));
  await page.reload();
  await page.waitForFunction(() => window.__tagAlong);
  const chips = await page.locator('[data-chips] .chip').allTextContents();
  assert.deepEqual(chips, ['2 · Market Avenue', '3 · School Run']);
  await page.locator('[data-chips] .chip').nth(1).click();
  assert.equal(await page.evaluate(() => window.__tagAlong.game.street), 2);
  await page.evaluate(() => {
    const t = window.__tagAlong;
    t.manual = true;
    t.game.score = 40;
    t.game.clock = 0.01;
    t.game.clockRunning = true;
    t.step(1 / 60);
  });
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('tag-along')));
  assert.equal(saved.best, 40);
  assert.equal(saved.reached, 2);
  await context.close();
});

test('tag-along AC-16: each state shows only its own card and HUD', async () => {
  const { context, page } = await open();
  const shown = () =>
    page.evaluate(() => {
      const vis = (sel) => !document.querySelector(sel).hidden;
      return {
        start: vis('[data-screen="start"]'),
        paused: vis('[data-screen="paused"]'),
        over: vis('[data-screen="over"]'),
        hud: vis('[data-hud]'),
      };
    });
  assert.deepEqual(await shown(), { start: true, paused: false, over: false, hud: false });
  await startEmpty(page);
  assert.deepEqual(await shown(), { start: false, paused: false, over: false, hud: true });
  await page.evaluate(() => (window.__tagAlong.game.arrived = 7));
  await arriveOne(page);
  await run(page, 0.5);
  assert.equal(await page.evaluate(() => window.__tagAlong.game.mode), 'change');
  assert.deepEqual(await shown(), { start: false, paused: false, over: false, hud: true });
  assert.ok(await page.evaluate(() => !document.querySelector('[data-banner]').hidden), 'the new street’s name');
  await run(page, 2);
  await page.evaluate(() => window.__tagAlong.pause());
  assert.deepEqual(await shown(), { start: false, paused: true, over: false, hud: true });
  await page.evaluate(() => {
    const t = window.__tagAlong;
    t.resume();
    t.game.clock = 0.01;
    t.game.clockRunning = true;
    t.game.grace = 0;
    t.step(1 / 60);
  });
  assert.deepEqual(await shown(), { start: false, paused: false, over: true, hud: false });
  await context.close();
});

test('tag-along AC-17: the game works offline once it has been played', async () => {
  const { context, page } = await open();
  await page.evaluate(() => navigator.serviceWorker.register('../sw.js'));
  await page.evaluate(() => Promise.race([navigator.serviceWorker.ready, new Promise((r) => setTimeout(r, 10000))]));
  await page.reload(); // controlled now: this load caches the game's files
  await page.waitForFunction(() => window.__tagAlong);
  await page.waitForLoadState('networkidle');
  await context.setOffline(true);
  await page.reload();
  await page.waitForFunction(() => window.__tagAlong);
  await page.click('[data-play]');
  assert.equal(await page.evaluate(() => window.__tagAlong.game.mode), 'play');
  await context.close();
});

test('tag-along AC-18: the whole street fits on phones and in landscape; a resize changes nothing', async () => {
  for (const [w, h, minPerson] of [
    [390, 844, 36],
    [360, 640, 36],
    [844, 390, 0],
  ]) {
    const { context, page } = await open({ viewport: { width: w, height: h } });
    for (const street of [0, 4]) {
      const v = await page.evaluate((street) => {
        const t = window.__tagAlong;
        t.startGame(street);
        return {
          ...t.view,
          scrollW: document.documentElement.scrollWidth,
          scrollH: document.documentElement.scrollHeight,
        };
      }, street);
      assert.ok(v.top >= 0 && v.bottom <= h + 0.5, `${w}×${h} street ${street}: ${v.top}–${v.bottom}`);
      assert.ok(v.person >= minPerson, `${w}×${h}: a person is ${v.person} px`);
      assert.ok(v.scrollW <= w && v.scrollH <= h, 'no scrolling');
    }
    await context.close();
  }
  const { context, page } = await open();
  await page.evaluate(() => {
    const t = window.__tagAlong;
    t.seed(5);
    t.startGame(1);
    t.manual = true;
    t.form([[5, 2], [5, 3]]);
  });
  const state = () =>
    page.evaluate(() => {
      const t = window.__tagAlong;
      return JSON.stringify({ l: [t.leader.col, t.leader.row], line: t.line().map((p) => [p.col, p.row]), v: t.vehicles().map((v) => [v.lane, Math.round(v.s * 1000)]), c: t.game.clock, s: t.game.score });
    });
  const before = await state();
  await page.setViewportSize({ width: 800, height: 600 });
  await page.waitForTimeout(100);
  assert.equal(await state(), before);
  await context.close();
});

test('tag-along AC-20: steps, joins, arrivals, hits and the end each have their sound', async () => {
  const { context, page } = await open();
  await startEmpty(page);
  const r = await page.evaluate(() => {
    const t = window.__tagAlong;
    const bottom = t.layout().bottom;
    t.heard.length = 0;
    t.form([[5, bottom]]);
    const p = t.spawnWaiting(bottom, 6);
    p.tw = 1;
    t.step(1 / 60); // a frame with the leader beside them: they're asked
    t.move('up');
    for (let i = 0; i < 10; i++) t.step(1 / 60);
    const names = () => t.heard.map((h) => h.name);
    const stepJoin = names();
    t.heard.length = 0;
    t.form([[4, 0], [4, 1], [4, 2]], { dest: 0 });
    t.leader.heading = bottom;
    t.game.crossing = 0;
    t.move('right');
    for (let i = 0; i < 10; i++) t.step(1 / 60);
    t.move('right');
    const arrivals = t.heard.filter((h) => h.name === 'arrive').map((h) => h.rate);
    t.heard.length = 0;
    t.form([[5, 2]]);
    const v = t.spawnVehicle(2, 'sedan');
    const want = t.colX(5);
    v.s = v.dir === 1 ? want + v.w / 2 + t.ENTRY : t.PLAY_W + t.ENTRY - (want - v.w / 2);
    t.step(1 / 60);
    const hit = names();
    t.heard.length = 0;
    t.game.clock = 0.01;
    t.game.clockRunning = true;
    t.step(1 / 60);
    return { stepJoin, arrivals, hit, end: names() };
  });
  assert.ok(r.stepJoin.some((n) => n === 'step' || n === 'step2'), 'a footstep');
  assert.ok(r.stepJoin.includes('join'), 'the pluck');
  assert.equal(r.arrivals.length, 2);
  assert.ok(r.arrivals[1] > r.arrivals[0], 'each arrival higher');
  assert.ok(r.hit.includes('hit') && r.hit.includes('horn'));
  assert.ok(r.end.includes('over'));
  await context.close();
});

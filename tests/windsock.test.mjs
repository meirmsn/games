// End-to-end tests for Windsock (specs/windsock.md). Run: scripts/check-slow.sh.
// The game exposes window.__windsock: its state, and run(seconds) that advances the simulation on
// its fixed step without waiting for frames, so a test can set up a situation and check the rules.
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

async function open({ day = 7, viewport = { width: 390, height: 844 }, init, ...opts } = {}) {
  const context = await browser.newContext({ viewport, hasTouch: true, ...opts });
  if (init) await context.addInitScript(init);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(`${BASE}windsock/#day=${day}`);
  await page.waitForFunction(() => window.__windsock);
  return { context, page, errors };
}

// Start a shift at `hour` with an empty sky and no arrivals; the test owns the clock.
async function startEmpty(page, hour = 0) {
  await page.evaluate((hour) => {
    const W = window.__windsock;
    W.manual = true;
    W.beginShift(0);
    if (hour) W.beginHour(hour, false);
    W.st.planes.length = 0;
    W.schedule.length = 0;
  }, hour);
}

const shown = (page, sel) => page.locator(sel).evaluate((el) => !el.hidden && getComputedStyle(el).display !== 'none');

// Dispatch pointer events on the canvas, as a finger (touch) or a mouse.
async function pointer(page, type, x, y, { id = 1, kind = 'touch' } = {}) {
  await page.evaluate(
    ([type, x, y, id, kind]) => {
      document.getElementById('field').dispatchEvent(
        new PointerEvent(type, { pointerId: id, pointerType: kind, clientX: x, clientY: y, bubbles: true, isPrimary: id === 1, button: 0 })
      );
    },
    [type, x, y, id, kind]
  );
}

test('windsock AC-2: the field moves behind the start card before any touch, with the HUD hidden', async () => {
  const { context, page, errors } = await open({ day: 42 });
  await page.waitForTimeout(300);
  const before = await page.evaluate(() => ({ planes: window.__windsock.st.planes.map((p) => [p.x, p.y]), clouds: window.__windsock.clouds() }));
  await page.waitForTimeout(700);
  const after = await page.evaluate(() => ({ planes: window.__windsock.st.planes.map((p) => [p.x, p.y]), clouds: window.__windsock.clouds() }));
  assert.ok(before.planes.length >= 2, 'planes in the sky');
  assert.ok(after.planes.every((p, i) => Math.hypot(p[0] - before.planes[i][0], p[1] - before.planes[i][1]) > 3), 'every plane moved');
  assert.ok(after.clouds.some((c, i) => c.x !== before.clouds[i].x || c.y !== before.clouds[i].y), 'clouds drift');
  assert.ok(await shown(page, '[data-screen="start"]'));
  assert.equal(await page.locator('[data-day]').textContent(), 'Day 42');
  assert.equal(await shown(page, '[data-hud]'), false);
  assert.deepEqual(errors, []);
  await context.close();
});

test('windsock AC-3: a touch draws 44 px above the finger, a mouse under the pointer, and a touch picks the nearest plane', async () => {
  const { context, page } = await open();
  await startEmpty(page);
  const ids = await page.evaluate(() => {
    const W = window.__windsock;
    return [W.addPlane('prop', 60, 200, 0), W.addPlane('prop', 72, 200, 0)];
  });
  const a = await page.evaluate(() => window.__windsock.toScreen({ x: 60, y: 200 }));
  const b = await page.evaluate(() => window.__windsock.toScreen({ x: 72, y: 200 }));
  // A touch a little left of the first plane picks it, not the other.
  await pointer(page, 'pointerdown', a.x - 6, a.y);
  assert.equal(await page.evaluate(() => window.__windsock.drawing?.plane.id), ids[0]);
  for (let i = 1; i <= 10; i++) await pointer(page, 'pointermove', a.x - 6, a.y - i * 4);
  const fingerY = a.y - 40;
  const head = await page.evaluate(() => window.__windsock.drawing.headCss);
  assert.ok(Math.abs(fingerY - head.y - 44) <= 2, `head ${fingerY - head.y} px above the finger`);
  await pointer(page, 'pointerup', a.x - 6, fingerY);
  // The mouse draws under the pointer.
  await pointer(page, 'pointerdown', b.x, b.y, { kind: 'mouse' });
  assert.equal(await page.evaluate(() => window.__windsock.drawing?.plane.id), ids[1]);
  for (let i = 1; i <= 10; i++) await pointer(page, 'pointermove', b.x + i * 4, b.y, { kind: 'mouse' });
  const mh = await page.evaluate(() => window.__windsock.drawing.headCss);
  assert.ok(Math.abs(mh.y - b.y) < 0.5 && Math.abs(mh.x - (b.x + 40)) < 0.5);
  await pointer(page, 'pointerup', b.x + 40, b.y, { kind: 'mouse' });
  // A touch farther than 22 px from every plane grabs nothing.
  await pointer(page, 'pointerdown', a.x - 30, a.y + 30);
  assert.equal(await page.evaluate(() => window.__windsock.drawing), null);
  await context.close();
});

test('windsock AC-4: a line into a live ring snaps, and the plane lands and is counted', async () => {
  const { context, page } = await open();
  await startEmpty(page);
  const r = await page.evaluate(() => {
    const W = window.__windsock;
    const live = W.liveEnds(W.st.wind).main;
    const end = W.ENDS[live];
    const start = { x: 40, y: end.ring.y + (end.dir.y > 0 ? -20 : 20) };
    const id = W.addPlane('prop', start.x, start.y, 0);
    const snapped = W.extendLine(W.plane(id), end.ring);
    const states = new Set();
    for (let i = 0; i < 200 && W.plane(id); i++) {
      W.run(0.1);
      if (W.plane(id)) states.add(W.plane(id).state);
    }
    return { snapped, live, states: [...states], gone: !W.plane(id), score: W.st.score, landed: W.st.landed };
  });
  assert.equal(r.snapped, r.live);
  assert.ok(r.states.includes('final') && r.states.includes('roll'), r.states.join());
  assert.ok(r.gone, 'the plane rolled out and left the runway');
  assert.equal(r.landed, 1);
  assert.equal(r.score, 10);
  await context.close();
});

test('windsock AC-5: the live ends face into the wind, and a line to a dead end does not snap', async () => {
  const { context, page } = await open();
  await startEmpty(page, 2); // the strip is open
  const r = await page.evaluate(() => {
    const W = window.__windsock;
    const out = [];
    for (let dir = 0; dir < 4; dir++) {
      W.st.wind = dir;
      const live = W.liveEnds(dir);
      const dead = { main: live.main === 'S' ? 'N' : 'S', strip: live.strip === 'W' ? 'E' : 'W' };
      const p = W.plane(W.addPlane('prop', 90, 200, 0));
      p.x = W.ENDS[dead.main].ring.x + 30;
      p.y = W.ENDS[dead.main].ring.y;
      const deadSnap = W.extendLine(p, W.ENDS[dead.main].ring);
      const q = W.plane(W.addPlane('prop', 90, 200, 0));
      q.x = W.ENDS[dead.strip].ring.x;
      q.y = W.ENDS[dead.strip].ring.y + 30;
      const deadStrip = W.extendLine(q, W.ENDS[dead.strip].ring);
      W.st.planes.length = 0;
      out.push({ dir, live, deadSnap, deadStrip, liveOk: W.isLive(live.main) && W.isLive(live.strip) });
    }
    return out;
  });
  // From NE and NW (the north side) the long runway lands northward, from its south end;
  // from NE and SE (the east side) the strip lands eastward, from its west end.
  assert.deepEqual(
    r.map((x) => x.live),
    [
      { main: 'S', strip: 'W' },
      { main: 'N', strip: 'W' },
      { main: 'N', strip: 'E' },
      { main: 'S', strip: 'E' },
    ]
  );
  for (const x of r) {
    assert.equal(x.deadSnap, null, `dead long-runway end refused for wind ${x.dir}`);
    assert.equal(x.deadStrip, null, `dead strip end refused for wind ${x.dir}`);
    assert.ok(x.liveOk);
  }
  await context.close();
});

test('windsock AC-6: the strip refuses everything before 08:00 and heavies always; heavies arrive from 09:00', async () => {
  const { context, page } = await open();
  await startEmpty(page);
  const r = await page.evaluate(() => {
    const W = window.__windsock;
    const prop = W.makePlane('prop', 0, 0, 0);
    const heavy = W.makePlane('heavy', 0, 0, 0);
    const out = {};
    for (const hour of [0, 1, 2, 3, 4]) {
      W.beginHour(hour, false);
      const strip = W.liveEnds(W.st.wind).strip;
      const main = W.liveEnds(W.st.wind).main;
      out[hour] = { prop: W.canSnap(prop, strip), heavy: W.canSnap(heavy, strip), heavyMain: W.canSnap(heavy, main) };
    }
    const heaviesBy = [0, 1, 2, 3, 4].map((h) => [1, 2, 3, 4, 5, 6, 7, 8].some((d) => W.buildSchedule(d, h).some((a) => a.type === 'heavy')));
    return { out, heaviesBy };
  });
  assert.equal(r.out[0].prop, false);
  assert.equal(r.out[1].prop, false);
  for (const h of [2, 3, 4]) assert.equal(r.out[h].prop, true);
  for (const h of [0, 1, 2, 3, 4]) {
    assert.equal(r.out[h].heavy, false);
    assert.equal(r.out[h].heavyMain, true);
  }
  assert.deepEqual(r.heaviesBy, [false, false, false, true, true]);
  await context.close();
});

test('windsock AC-7: a swing warns 5 s ahead, turns the wind, drops lines to dead ends, and lulls arrivals', async () => {
  const { context, page } = await open({ init: FAKE_AUDIO });
  await startEmpty(page, 2);
  const r = await page.evaluate(() => {
    const W = window.__windsock;
    const st = W.st;
    const from = st.wind;
    const to = W.swingTarget(W.day, 2, from);
    const live = W.liveEnds(from);
    const after = W.liveEnds(to);
    // A plane lined up for each live end, far out; and one already past its ring.
    const lines = {};
    for (const end of [live.main, live.strip]) {
      const E = W.ENDS[end];
      const p = W.plane(W.addPlane('prop', E.ring.x - E.dir.x * 0 + (E.runway === 'main' ? 40 : 0), E.ring.y + (E.runway === 'strip' ? 60 : 0), 0));
      p.fuel = 999;
      lines[end] = { id: p.id, snapped: W.extendLine(p, E.ring) };
    }
    W.heard.length = 0;
    W.run(W.SWING_AT - W.WARN - 0.2);
    const before = { warn: !!st.warn };
    W.run(0.4);
    const warned = { warn: !!st.warn, gust: W.heard.includes('gust'), soon: Object.keys(W.ENDS).filter((id) => W.soonLive(id)) };
    W.run(W.WARN);
    const swung = { wind: st.wind, gone: {} };
    for (const end of Object.keys(lines)) {
      const p = W.plane(lines[end].id);
      swung.gone[end] = p ? { ring: p.ring, hold: p.hold, state: p.state } : 'landed';
    }
    // Arrivals in each hour with a swing leave the lull clear.
    const lull = [];
    for (let d = 1; d < 20; d++) for (let h = 1; h < 5; h++) for (const a of W.buildSchedule(d, h)) if (a.at >= W.SWING_AT && a.at < W.SWING_AT + W.LULL) lull.push([d, h, a.at]);
    return { from, to, live, after, before, warned, swung, lines, lull };
  });
  assert.equal(r.before.warn, false);
  assert.equal(r.warned.warn, true);
  assert.ok(r.warned.gust, 'the gust sounds');
  const soonExpected = [r.after.main, r.after.strip].filter((e) => e !== r.live.main && e !== r.live.strip);
  assert.deepEqual(r.warned.soon.sort(), soonExpected.sort(), 'the soon-live ends are marked');
  assert.equal(r.swung.wind, r.to);
  const turn = (r.to - r.from + 4) % 4;
  assert.ok(turn === 1 || turn === 2 || turn === 3, 'a 90° or 180° turn');
  for (const end of Object.keys(r.lines)) {
    const s = r.swung.gone[end];
    const stillLive = end === r.after.main || end === r.after.strip;
    if (s === 'landed' || s.state !== 'fly') continue;
    if (stillLive) assert.equal(s.ring, end, `the line to still-live ${end} is kept`);
    else assert.deepEqual([s.ring, s.hold], [null, true], `the line to dead ${end} is dropped and the plane circles`);
  }
  assert.deepEqual(r.lull, []);
  await context.close();
});

test('windsock AC-7: a plane past its ring still lands through the swing', async () => {
  const { context, page } = await open();
  await startEmpty(page, 1);
  const r = await page.evaluate(() => {
    const W = window.__windsock;
    const end = W.ENDS[W.liveEnds(W.st.wind).main];
    W.run(W.SWING_AT - 1.2);
    const p = W.plane(W.addPlane('prop', end.ring.x, end.ring.y - end.dir.y * 14, Math.atan2(end.dir.y, end.dir.x)));
    W.extendLine(p, end.ring);
    W.run(0.9);
    const stateAtSwing = p.state;
    W.run(12);
    return { stateAtSwing, landed: W.st.landed };
  });
  assert.equal(r.stateAtSwing, 'final');
  assert.equal(r.landed, 1);
  await context.close();
});

test('windsock AC-8: a plane without a line drifts downwind; a plane on a line stays on it', async () => {
  const { context, page } = await open();
  await startEmpty(page);
  const r = await page.evaluate(() => {
    const W = window.__windsock;
    const blow = W.blowVec(W.st.wind);
    const free = W.plane(W.addPlane('prop', 90, 200, -Math.PI / 2));
    free.fuel = 999;
    const x0 = free.x;
    W.run(1);
    // Heading north, its sideways motion is the wind's.
    const side = free.x - x0;
    W.st.planes.length = 0;
    const p = W.plane(W.addPlane('prop', 30, 290, -Math.PI / 2));
    p.fuel = 999;
    W.extendLine(p, { x: 30, y: 40 });
    let worst = 0;
    for (let i = 0; i < 120; i++) {
      W.run(0.1);
      if (p.path.length) worst = Math.max(worst, Math.abs(p.x - 30));
    }
    return { side, expected: blow.x * 5, worst };
  });
  assert.ok(Math.sign(r.side) === Math.sign(r.expected) && Math.abs(r.side - r.expected) < 0.6, `drift ${r.side} vs ${r.expected}`);
  assert.ok(r.worst <= 2, `stayed within ${r.worst} art px of its line`);
  await context.close();
});

test('windsock AC-9: a collision in the air ends play and names the hour; Retry restores that hour; New shift starts over', async () => {
  const { context, page } = await open();
  await startEmpty(page, 2);
  await page.evaluate(() => {
    const W = window.__windsock;
    W.st.score = 70;
    W.st.planes.push(W.makePlane('prop', 30, 300, 0));
    W.beginHour(2, false); // snapshot: score 70, one plane, this wind
    W.st.score = 150;
    W.st.wind = (W.st.wind + 1) % 4;
    W.addPlane('prop', 80, 100, 0);
    W.addPlane('prop', 104, 100, Math.PI);
    W.run(2);
  });
  assert.equal(await page.evaluate(() => window.__windsock.mode), 'crashing');
  await page.evaluate(() => window.__windsock.advance(1.5));
  assert.equal(await page.evaluate(() => window.__windsock.mode), 'crash');
  assert.ok(await shown(page, '[data-screen="crash"]'));
  assert.equal(await page.locator('[data-retry]').textContent(), 'Retry 08:00');
  const snap = await page.evaluate(() => window.__windsock.snapshot);
  await page.click('[data-retry]');
  const back = await page.evaluate(() => {
    const st = window.__windsock.st;
    return { mode: window.__windsock.mode, score: st.score, wind: st.wind, hour: st.hour, planes: st.planes.map((p) => [p.id, p.x, p.y, p.fuel]) };
  });
  assert.equal(back.mode, 'play');
  assert.equal(back.score, 70);
  assert.equal(back.wind, snap.wind);
  assert.equal(back.hour, 2);
  assert.deepEqual(
    back.planes,
    snap.planes.map((p) => [p.id, p.x, p.y, p.fuel])
  );
  // New shift starts at 06:00.
  await page.evaluate(() => {
    const W = window.__windsock;
    W.addPlane('prop', 80, 100, 0);
    W.addPlane('prop', 104, 100, Math.PI);
    W.run(2);
    W.advance(1.5);
  });
  await page.click('[data-new]');
  assert.deepEqual(await page.evaluate(() => [window.__windsock.mode, window.__windsock.st.hour, window.__windsock.st.score]), ['play', 0, 0]);
  await context.close();
});

test('windsock AC-9: a plane in the air over one on the ground does not collide; two on the ground do', async () => {
  const { context, page } = await open();
  await startEmpty(page, 3);
  const r = await page.evaluate(() => {
    const W = window.__windsock;
    W.st.wind = 1; // from SE: live ends N and W
    const a = W.addPlane('prop', 0, 0, 0);
    W.land(a, 'W');
    W.plane(a).roll.d = 30;
    const over = W.addPlane('prop', 0, 0, Math.PI / 2);
    W.run(0.05);
    Object.assign(W.plane(over), { x: W.plane(a).x, y: W.plane(a).y - 2 });
    W.plane(over).fuel = 999;
    W.run(0.2);
    const airGround = W.mode;
    W.plane(over).x = -999;
    // A heavy rolling down the long runway meets the prop rolling across at the crossing.
    const b = W.addPlane('heavy', 0, 0, 0);
    W.land(b, 'N');
    W.plane(a).roll.d = 40;
    W.plane(b).roll.d = 74;
    W.run(0.1);
    return { airGround, groundGround: W.mode };
  });
  assert.equal(r.airGround, 'play');
  assert.equal(r.groundGround, 'crashing');
  await context.close();
});

test('windsock AC-10: planes about to touch are marked in conflict; air and ground never are', async () => {
  const { context, page } = await open();
  await startEmpty(page, 3);
  const r = await page.evaluate(() => {
    const W = window.__windsock;
    const a = W.plane(W.addPlane('prop', 40, 230, 0));
    const b = W.plane(W.addPlane('prop', 80, 230, Math.PI));
    const c = W.plane(W.addPlane('prop', 40, 290, 0));
    for (const p of [a, b, c]) p.fuel = 999;
    W.run(0.02);
    const pair = [a.conflict, b.conflict, c.conflict];
    W.st.planes.length = 0;
    W.st.wind = 1;
    const g = W.addPlane('prop', 0, 0, 0);
    W.land(g, 'W');
    const air = W.plane(W.addPlane('prop', 70, 135, Math.PI / 2));
    air.fuel = 999;
    W.run(0.02);
    return { pair, airGround: [W.plane(g).conflict, air.conflict] };
  });
  assert.deepEqual(r.pair, [true, true, false]);
  assert.deepEqual(r.airGround, [false, false]);
  await context.close();
});

test('windsock AC-11: an empty plane diverts, scores nothing, and collides with nothing', async () => {
  const { context, page } = await open();
  await startEmpty(page);
  const r = await page.evaluate(() => {
    const W = window.__windsock;
    const p = W.plane(W.addPlane('prop', 90, 200, 0));
    const fuel0 = p.fuel;
    W.run(1);
    const drained = fuel0 - p.fuel;
    p.fuel = 0.01;
    W.run(0.05);
    const state = p.state;
    const q = W.plane(W.addPlane('prop', p.x + 4, p.y, Math.PI));
    q.fuel = 999;
    W.run(0.5);
    return { drained, state, diverted: W.st.diverted, score: W.st.score, mode: W.mode, path: p.path.length };
  });
  assert.ok(Math.abs(r.drained - 1) < 0.02);
  assert.equal(r.state, 'divert');
  assert.equal(r.diverted, 1);
  assert.equal(r.score, 0);
  assert.equal(r.mode, 'play');
  assert.equal(r.path, 0);
  await context.close();
});

test('windsock AC-12: landings within 6 s build a streak, capped at ×5; a longer gap resets it', async () => {
  const { context, page } = await open();
  await startEmpty(page);
  const scores = await page.evaluate(() => {
    const W = window.__windsock;
    W.st.wind = 1;
    const gains = [];
    const landOne = () => {
      const before = W.st.score;
      const id = W.addPlane('prop', 0, 0, 0);
      W.land(id, 'N');
      gains.push(W.st.score - before);
    };
    for (let i = 0; i < 6; i++) {
      landOne();
      W.run(3);
    }
    W.run(4); // 7 s since the last landing
    landOne();
    return gains;
  });
  assert.deepEqual(scores, [10, 20, 30, 40, 50, 50, 10]);
  await context.close();
});

test('windsock AC-13: the shift runs five hours, swinging in each from 07:00, then shows the done card', async () => {
  const { context, page } = await open();
  await startEmpty(page);
  const r = await page.evaluate(() => {
    const W = window.__windsock;
    const winds = [];
    const swings = [0, 0, 0, 0, 0];
    let last = W.st.wind;
    let guard = 0;
    while (W.mode === 'play' && guard++ < 2000) {
      W.st.planes.length = 0; // nobody to land: just the clock and the wind
      const h = W.st.hour;
      W.run(0.25);
      if (W.st.wind !== last) {
        swings[h]++;
        last = W.st.wind;
      }
      winds.push(W.st.wind);
    }
    return { mode: W.mode, swings, hour: W.st.hour };
  });
  assert.equal(r.mode, 'done');
  assert.deepEqual(r.swings, [0, 1, 1, 1, 1]);
  assert.ok(await shown(page, '[data-screen="done"]'));
  const detail = await page.locator('[data-final-detail]').textContent();
  assert.match(detail, /0 landed · 0 diverted/);
  await context.close();
});

test('windsock AC-14: the same day gives the same traffic and wind; another day differs; Another day changes it', async () => {
  const a = await open({ day: 7 });
  const b = await open({ day: 7 });
  const c = await open({ day: 8 });
  const read = (page) =>
    page.evaluate(() => {
      const W = window.__windsock;
      W.manual = true;
      W.beginShift(0);
      return { wind: W.st.wind, hours: [0, 1, 2, 3, 4].map((h) => W.buildSchedule(W.day, h).map((x) => [x.at, x.type, x.side, x.along])) };
    });
  const [ra, rb, rc] = [await read(a.page), await read(b.page), await read(c.page)];
  assert.deepEqual(ra, rb);
  assert.notDeepEqual(ra.hours, rc.hours);
  // Another day, from the done card.
  await a.page.evaluate(() => window.__windsock.showStart());
  await a.page.evaluate(() => {
    const W = window.__windsock;
    W.beginShift(0);
  });
  await a.page.evaluate(() => {
    const W = window.__windsock;
    while (W.mode === 'play') {
      W.st.planes.length = 0;
      W.run(1);
    }
  });
  await a.page.click('[data-another]');
  await a.page.waitForFunction(() => window.__windsock.day !== 7);
  assert.match(await a.page.locator('[data-day]').textContent(), /^Day \d+$/);
  for (const x of [a, b, c]) await x.context.close();
});

async function finishShift(page, from = 0, score = 0) {
  await page.evaluate(
    ([from, score]) => {
      const W = window.__windsock;
      W.manual = true;
      W.beginShift(from);
      W.st.score = score;
      while (W.mode === 'play') {
        W.st.planes.length = 0;
        W.run(1);
      }
    },
    [from, score]
  );
}

test('windsock AC-15: a full shift keeps the day’s best and unlocks the 09:00 start; blocked storage still plays', async () => {
  const { context, page } = await open({ day: 12 });
  assert.equal(await shown(page, '[data-play9]'), false);
  await finishShift(page, 0, 123);
  assert.match(await page.locator('[data-final-detail]').textContent(), /best today 123/);
  assert.equal((await page.evaluate(() => window.__windsock.memory())).best[12], 123);
  await page.click('[data-again]');
  assert.equal(await page.locator('[data-best-start]').textContent(), 'Best today: 123');
  assert.ok(await shown(page, '[data-play9]'));
  await page.click('[data-play9]');
  assert.equal(await page.evaluate(() => window.__windsock.st.hour), 3);
  assert.equal(await page.locator('[data-clock]').textContent(), '09:00');
  // A shift from 09:00 doesn't count toward the best.
  await finishShift(page, 3, 999);
  assert.equal((await page.evaluate(() => window.__windsock.memory())).best[12], 123);
  await context.close();

  const blocked = await open({
    init: () => {
      Object.defineProperty(window, 'localStorage', {
        get() {
          throw new Error('blocked');
        },
      });
    },
  });
  await blocked.page.click('[data-play]');
  await finishShift(blocked.page, 0, 10);
  assert.ok(await shown(blocked.page, '[data-screen="done"]'));
  assert.deepEqual(blocked.errors, []);
  await blocked.context.close();
});

test('windsock AC-16: every arrival shows its arrow at least 3 s ahead', async () => {
  const { context, page } = await open();
  const r = await page.evaluate(() => {
    const W = window.__windsock;
    W.manual = true;
    W.beginShift(0);
    W.beginHour(4, false);
    W.st.planes.length = 0;
    const leads = [];
    const seen = new Set();
    for (let i = 0; i < 160 && W.mode === 'play'; i++) {
      W.run(0.25);
      for (const p of W.st.planes) {
        if (p.enteredAt === undefined || seen.has(p.id)) continue;
        seen.add(p.id);
        leads.push(p.enteredAt - p.arrowAt);
      }
      // Keep the sky moving off: planes leave once they're in, so the cap doesn't hold arrivals.
      for (const p of W.st.planes) if (W.st.t - (p.enteredAt ?? 0) > 6) p.gone = true;
    }
    return { leads };
  });
  assert.ok(r.leads.length >= 5, `${r.leads.length} arrivals`);
  for (const lead of r.leads) assert.ok(lead >= 3 - 1e-6, `arrow ${lead} s ahead`);
  await context.close();
});

test('windsock AC-16: no arrival enters on a course within separation of another in its first 4 s', async () => {
  const { context, page } = await open();
  const r = await page.evaluate(() => {
    const W = window.__windsock;
    W.manual = true;
    W.beginShift(0);
    W.beginHour(4, false);
    W.st.planes.length = 0;
    // One arrival due at 3.5 s, and a plane flying straight at its way in just before then.
    W.schedule.splice(1);
    const a = W.schedule[0];
    a.at = 3.5;
    W.run(3.3);
    const e = W.entryPoint(a);
    const dir = Math.atan2(a.aim.y - e.y, a.aim.x - e.x);
    const blocker = W.plane(W.addPlane('prop', e.x + Math.cos(dir) * 40, e.y + Math.sin(dir) * 40, dir + Math.PI));
    blocker.fuel = 999;
    W.run(0.6);
    const enteredWhileBlocked = W.st.planes.some((p) => p !== blocker);
    const arrowStill = a.shown && !a.done;
    blocker.gone = true;
    W.run(3);
    const enteredAfter = W.st.planes.some((p) => p.enteredAt !== undefined);
    return { enteredWhileBlocked, arrowStill, enteredAfter };
  });
  assert.equal(r.enteredWhileBlocked, false);
  assert.ok(r.arrowStill, 'its arrow stays up while it waits');
  assert.ok(r.enteredAfter, 'it comes in once the way is clear');
  await context.close();
});

test('windsock AC-17: each retry stretches the hour’s arrival gaps by 8%, up to 25%', async () => {
  const { context, page } = await open();
  const r = await page.evaluate(() => {
    const W = window.__windsock;
    W.manual = true;
    W.beginShift(0);
    const gaps = (list) => list.slice(1, 4).map((a, i) => a.at - list[i].at);
    const base = gaps(W.buildSchedule(W.day, 0, 0));
    const out = [];
    for (let k = 1; k <= 5; k++) {
      W.addPlane('prop', 80, 100, 0);
      W.addPlane('prop', 104, 100, Math.PI);
      W.run(2);
      W.advance(1.5);
      W.retryHour();
      out.push({ retries: W.retries, ratio: gaps(W.schedule)[0] / base[0] });
    }
    return out;
  });
  assert.deepEqual(
    r.map((x) => x.retries),
    [1, 2, 3, 4, 5]
  );
  const want = [1.08, 1.16, 1.24, 1.25, 1.25];
  r.forEach((x, i) => assert.ok(Math.abs(x.ratio - want[i]) < 1e-6, `retry ${i + 1}: ×${x.ratio}`));
  await context.close();
});

test('windsock AC-18: hiding the page pauses play until Resume is tapped', async () => {
  const { context, page } = await open();
  await page.click('[data-play]');
  const setHidden = (hidden) =>
    page.evaluate((hidden) => {
      Object.defineProperty(document, 'hidden', { value: hidden, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    }, hidden);
  await setHidden(true);
  await setHidden(false);
  assert.equal(await page.evaluate(() => window.__windsock.paused), true);
  assert.ok(await shown(page, '[data-screen="paused"]'));
  const a = await page.evaluate(() => [window.__windsock.st.t, window.__windsock.st.planes.map((p) => [p.x, p.y])]);
  await page.waitForTimeout(500);
  const b = await page.evaluate(() => [window.__windsock.st.t, window.__windsock.st.planes.map((p) => [p.x, p.y])]);
  assert.deepEqual(a, b, 'nothing moves while paused');
  await page.click('[data-resume]');
  await page.waitForTimeout(300);
  assert.ok((await page.evaluate(() => window.__windsock.st.t)) > a[0], 'play resumes');
  assert.equal(await shown(page, '[data-screen="paused"]'), false);
  await context.close();
});

for (const [w, h] of [
  [360, 640],
  [390, 844],
]) {
  test(`windsock AC-19: at ${w}×${h} the whole field and its four rings fit below the HUD, with no scrolling`, async () => {
    const { context, page } = await open({ viewport: { width: w, height: h } });
    const r = await page.evaluate(() => {
      const W = window.__windsock;
      const v = W.view();
      const rings = Object.values(W.ENDS).map((e) => {
        const p = W.toScreen(e.ring);
        const r = 11 * v.S;
        return [p.x - r, p.y - r, p.x + r, p.y + r];
      });
      const tl = W.toScreen({ x: 0, y: 0 });
      const br = W.toScreen({ x: W.FW, y: W.FH });
      const hud = document.querySelector('.mute').getBoundingClientRect().bottom;
      return { rings, tl, br, hud, sw: document.documentElement.scrollWidth, sh: document.documentElement.scrollHeight, iw: innerWidth, ih: innerHeight };
    });
    assert.ok(r.tl.y >= r.hud, 'the field starts below the HUD');
    assert.ok(r.tl.x >= 0 && r.br.x <= w && r.br.y <= h, 'the field fits');
    for (const [x0, y0, x1, y1] of r.rings) assert.ok(x0 >= 0 && x1 <= w && y0 >= r.hud && y1 <= h);
    assert.equal(r.sw, r.iw);
    assert.equal(r.sh, r.ih);
    await context.close();
  });
}

test('windsock AC-19: the same play at 60 Hz and 120 Hz ends the same', async () => {
  const { context, page } = await open();
  const runAt = (hz) =>
    page.evaluate((hz) => {
      const W = window.__windsock;
      W.manual = true;
      W.beginShift(0);
      const live = W.ENDS[W.liveEnds(W.st.wind).main];
      W.extendLine(W.st.planes[0], live.ring);
      W.run(20, hz);
      return { landed: W.st.landed, score: W.st.score, planes: W.st.planes.map((p) => [p.id, p.x, p.y]) };
    }, hz);
  const a = await runAt(60);
  const b = await runAt(120);
  assert.equal(a.landed, b.landed);
  assert.equal(a.score, b.score);
  assert.deepEqual(
    a.planes.map((p) => p[0]),
    b.planes.map((p) => p[0])
  );
  a.planes.forEach((p, i) => assert.ok(Math.hypot(p[1] - b.planes[i][1], p[2] - b.planes[i][2]) <= 0.5, `plane ${p[0]}`));
  assert.ok(a.landed >= 1);
  await context.close();
});

test('windsock AC-20: a landing plays the touchdown sound, and the mute button mutes the site', async () => {
  const { context, page } = await open({ init: FAKE_AUDIO });
  await page.click('[data-play]'); // unlocks the audio
  await page.waitForFunction(() => window.__decoded >= 14);
  await startEmpty(page);
  const land = () =>
    page.evaluate(() => {
      const W = window.__windsock;
      const before = window.__played.length;
      W.heard.length = 0;
      W.land(W.addPlane('prop', 0, 0, 0), W.liveEnds(W.st.wind).main);
      return { played: window.__played.length - before, heard: W.heard.slice() };
    });
  const a = await land();
  assert.ok(a.heard.includes('land'));
  assert.ok(a.played >= 1);
  await page.click('[data-mute]');
  assert.equal(await page.locator('[data-mute]').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.evaluate(() => localStorage.getItem('sound')), 'off');
  const b = await land();
  assert.equal(b.played, 0);
  await context.close();
});

test('windsock AC-21: a second finger draws nothing while the first is drawing', async () => {
  const { context, page } = await open();
  await startEmpty(page);
  const [a, b] = await page.evaluate(() => {
    const W = window.__windsock;
    const ids = [W.addPlane('prop', 50, 200, 0), W.addPlane('prop', 130, 200, 0)];
    return ids.map((id) => ({ id, ...W.toScreen(W.plane(id)) }));
  });
  await pointer(page, 'pointerdown', a.x, a.y, { id: 1 });
  await pointer(page, 'pointermove', a.x, a.y - 20, { id: 1 });
  await pointer(page, 'pointerdown', b.x, b.y, { id: 2 });
  for (let i = 1; i <= 8; i++) await pointer(page, 'pointermove', b.x + i * 5, b.y, { id: 2 });
  const r = await page.evaluate(([a, b]) => {
    const W = window.__windsock;
    return { drawing: W.drawing.plane.id, bPath: W.plane(b).path.length, aPath: W.plane(a).path.length };
  }, [a.id, b.id]);
  assert.equal(r.drawing, a.id);
  assert.equal(r.bPath, 0);
  assert.ok(r.aPath > 0);
  await pointer(page, 'pointermove', a.x, a.y - 40, { id: 1 });
  assert.ok((await page.evaluate((id) => window.__windsock.plane(id).path.length, a.id)) > r.aPath, 'the first finger still draws');
  await context.close();
});

test('windsock AC-22: each state shows only its own card and HUD', async () => {
  const { context, page } = await open();
  const cards = ['start', 'crash', 'done', 'paused'];
  const look = async () => {
    const out = {};
    for (const c of cards) out[c] = await shown(page, `[data-screen="${c}"]`);
    out.hud = await shown(page, '[data-hud]');
    return out;
  };
  assert.deepEqual(await look(), { start: true, crash: false, done: false, paused: false, hud: false });
  await page.click('[data-play]');
  assert.deepEqual(await look(), { start: false, crash: false, done: false, paused: false, hud: true });
  await page.evaluate(() => {
    const W = window.__windsock;
    W.manual = true;
    W.st.planes.length = 0;
    W.addPlane('prop', 80, 100, 0);
    W.addPlane('prop', 104, 100, Math.PI);
    W.run(2);
  });
  assert.equal(await page.evaluate(() => window.__windsock.mode), 'crashing');
  assert.deepEqual(await look(), { start: false, crash: false, done: false, paused: false, hud: true });
  await page.evaluate(() => window.__windsock.advance(1.5));
  assert.deepEqual(await look(), { start: false, crash: true, done: false, paused: false, hud: true });
  await page.click('[data-retry]');
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  assert.deepEqual(await look(), { start: false, crash: false, done: false, paused: true, hud: true });
  await page.click('[data-resume]');
  await finishShift(page);
  assert.deepEqual(await look(), { start: false, crash: false, done: true, paused: false, hud: true });
  await context.close();
});

test('windsock AC-23: the UI is 8-bit: a pixel font, no rounding, blur or soft shadows, and marks with no smooth edges', async () => {
  const { context, page } = await open();
  await page.evaluate(() => document.fonts.ready);
  const r = await page.evaluate(() => {
    const els = ['[data-screen="start"]', '[data-play]', '.mute', '.shell-back'].map((s) => document.querySelector(s));
    document.querySelector('[data-hud]').hidden = false;
    els.push(document.querySelector('[data-hud]'));
    return {
      styles: els.map((el) => {
        const cs = getComputedStyle(el);
        return { radius: cs.borderTopLeftRadius, backdrop: cs.backdropFilter, shadow: cs.boxShadow, font: el.textContent.trim() ? cs.fontFamily : 'Kenney Mini Square (icon only)' };
      }),
      fontLoaded: document.fonts.check('16px "Kenney Mini Square"'),
      rendering: getComputedStyle(document.getElementById('field')).imageRendering,
    };
  });
  assert.ok(r.fontLoaded, 'the pixel font loads');
  for (const s of r.styles) {
    assert.equal(s.radius, '0px');
    assert.ok(s.backdrop === 'none' || !s.backdrop);
    assert.ok(s.font.includes('Kenney Mini Square'));
    // Only hard inset bevels: every shadow has no blur.
    for (const part of s.shadow === 'none' ? [] : s.shadow.split(/,(?![^(]*\))/)) {
      const lengths = part.replace(/rgba?\([^)]*\)/, '').trim().split(/\s+/).filter((t) => t.endsWith('px'));
      assert.equal(lengths[2], '0px', `no blur in "${part.trim()}"`);
    }
  }
  assert.equal(r.rendering, 'pixelated');
  // A live scene with every kind of mark: lines, a live and a soon-live end in the warning, an
  // arrival's arrow, fuel arcs, a conflict, the drawing head, the closed strip's crosses and points.
  const scene = await page.evaluate(() => {
    const W = window.__windsock;
    W.manual = true;
    W.beginShift(0);
    W.beginHour(2, false);
    W.st.planes.length = 0;
    const live = W.liveEnds(W.st.wind);
    const a = W.plane(W.addPlane('prop', 40, 230, 0.3));
    W.extendLine(a, { x: 70, y: 200 });
    W.extendLine(a, W.ENDS[live.main].ring);
    W.schedule.length = 0;
    W.run(W.SWING_AT - W.WARN + 1);
    W.land(W.addPlane('prop', 0, 0, 0), live.main);
    W.schedule.push({ at: W.st.t + 2, type: 'prop', side: 0, along: 0.3, aim: { x: 90, y: 150 }, livery: 0, fuel: 1, shown: false, delay: 0 });
    for (const p of W.st.planes) p.fuel = 999;
    W.addPlane('prop', 120, 80, 0);
    W.addPlane('prop', 150, 80, Math.PI);
    W.run(0.02);
    const out = { warn: !!W.st.warn, arrows: W.schedule.filter((x) => x.shown && !x.done).length, conflict: W.st.planes.some((p) => p.conflict) };
    out.probe = W.marksAlphaProbe();
    W.beginHour(0, false); // the strip's closed crosses
    out.closed = W.marksAlphaProbe();
    return out;
  });
  assert.ok(scene.warn && scene.conflict, 'the scene has a warning and a conflict');
  for (const probe of [scene.probe, scene.closed]) {
    assert.ok(probe.drawn > 300, `${probe.drawn} mark pixels drawn`);
    for (const a of probe.alphas) assert.ok(probe.allowed.includes(a), `alpha ${a} is one of the flat values ${probe.allowed}`);
  }
  await context.close();
});

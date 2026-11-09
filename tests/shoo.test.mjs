// End-to-end tests for Shoo! (specs/shoo.md). Run: scripts/check-slow.sh.
// The game exposes window.__shoo: its state, and run(seconds) that advances the simulation on its
// fixed step without waiting for frames, so a test can set up a situation and check the rules.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import { FAKE_AUDIO } from './fake-audio.mjs';

// Its own port range: the test files run in parallel.
const PORT = 9500 + Math.floor(Math.random() * 100);
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

async function open({ viewport = { width: 390, height: 844 }, init, hash = '', ...opts } = {}) {
  const context = await browser.newContext({ viewport, hasTouch: true, ...opts });
  if (init) await context.addInitScript(init);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(`${BASE}shoo/${hash}`);
  await page.waitForFunction(() => window.__shoo);
  return { context, page, errors };
}

// Start a shift at `hour` with no birds, planes or landings; the test owns the clock.
async function startEmpty(page, hour = 1) {
  await page.evaluate((hour) => {
    const W = window.__shoo;
    W.manual = true;
    W.beginShift(hour);
    W.st.birds.length = 0;
    W.st.planes.length = 0;
    W.st.landings.length = 0;
    W.st.hold.length = 0;
    W.st.nextFlock = 9999;
  }, hour);
}

const shown = (page, sel) => page.locator(sel).evaluate((el) => !el.hidden && getComputedStyle(el).display !== 'none');

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

test('shoo AC-2: the airfield is alive behind the start card before any touch, with the HUD hidden', async () => {
  const { context, page, errors } = await open();
  await page.waitForTimeout(300);
  const a = await page.evaluate(() => ({ birds: window.__shoo.st.birds.map((b) => [b.x, b.y]), simTime: window.__shoo.st.simTime }));
  await page.waitForTimeout(1500);
  const b = await page.evaluate(() => ({ birds: window.__shoo.st.birds.map((b) => [b.x, b.y]), planes: window.__shoo.st.planes.length, simTime: window.__shoo.st.simTime }));
  assert.ok(a.birds.length >= 6, `${a.birds.length} birds`);
  assert.ok(b.birds.some((p, i) => Math.hypot(p[0] - a.birds[i][0], p[1] - a.birds[i][1]) > 1), 'birds move');
  assert.ok(b.planes >= 1, 'a plane comes in');
  assert.ok(b.simTime > a.simTime);
  assert.ok(await shown(page, '[data-screen="start"]'));
  assert.equal(await shown(page, '[data-hud]'), false);
  assert.deepEqual(errors, []);
  await context.close();
});

test('shoo AC-3: the reticle sits 64 px above a finger, at a mouse pointer, moves with keys, and a second finger does nothing', async () => {
  const { context, page } = await open();
  await page.click('[data-play]');
  await startEmpty(page);
  const c = await page.evaluate(() => window.__shoo.toScreen({ x: 90, y: 200 }));
  await pointer(page, 'pointerdown', c.x, c.y);
  const sc = () => page.evaluate(() => ({ ...window.__shoo.toScreen(window.__shoo.scarer), active: window.__shoo.scarer.active, speed: window.__shoo.scarer.speed, fx: window.__shoo.scarer.x, fy: window.__shoo.scarer.y }));
  let s = await sc();
  assert.ok(Math.abs(c.y - s.y - 64) <= 2 && Math.abs(c.x - s.x) <= 1, `reticle ${c.y - s.y} px above`);
  assert.ok(s.active);
  // The jump to the finger is never a fast scare.
  await page.evaluate(() => window.__shoo.run(0.05));
  assert.ok((await sc()).speed < (await page.evaluate(() => window.__shoo.FAST)));
  await pointer(page, 'pointermove', c.x + 30, c.y);
  s = await sc();
  assert.ok(Math.abs(s.x - (c.x + 30)) <= 1, 'it follows the finger');
  // A second finger moves nothing.
  await pointer(page, 'pointerdown', c.x - 100, c.y + 100, { id: 2 });
  await pointer(page, 'pointermove', c.x - 120, c.y + 120, { id: 2 });
  const s2 = await sc();
  assert.deepEqual([s2.fx, s2.fy], [s.fx, s.fy]);
  // Far off the field, it stays inside.
  await pointer(page, 'pointermove', -500, -500);
  s = await sc();
  assert.ok(s.fx >= 0 && s.fy >= 0);
  await pointer(page, 'pointerup', -500, -500);
  assert.equal((await sc()).active, false, 'scares only while held');
  // A mouse: at the pointer.
  await pointer(page, 'pointerdown', c.x, c.y, { kind: 'mouse' });
  s = await sc();
  assert.ok(Math.abs(s.y - c.y) <= 1 && Math.abs(s.x - c.x) <= 1);
  await pointer(page, 'pointerup', c.x, c.y, { kind: 'mouse' });
  // Keys: 50 art px/s, 140 with Shift.
  const keyRun = async (shift) => {
    const x0 = (await sc()).fx;
    if (shift) await page.keyboard.down('Shift');
    await page.keyboard.down('ArrowRight');
    await page.evaluate(() => window.__shoo.run(0.5));
    const x1 = (await sc()).fx;
    const active = (await sc()).active;
    await page.keyboard.up('ArrowRight');
    if (shift) await page.keyboard.up('Shift');
    await page.evaluate(() => window.__shoo.run(0.02));
    return { moved: x1 - x0, active };
  };
  await page.evaluate(() => {
    window.__shoo.scarer.x = 40;
  });
  const slow = await keyRun(false);
  assert.ok(Math.abs(slow.moved - 25) < 1, `keys moved ${slow.moved}`);
  assert.ok(slow.active);
  const fast = await keyRun(true);
  assert.ok(Math.abs(fast.moved - 70) < 1, `shift-keys moved ${fast.moved}`);
  assert.equal((await sc()).active, false);
  await context.close();
});

// Hold the scarer at a point (slow), or sweep it fast along x, in simulation steps.
const holdAt = (page, x, y, seconds) =>
  page.evaluate(
    ([x, y, seconds]) => {
      const W = window.__shoo;
      Object.assign(W.scarer, { active: true, kind: 'pointer', held: 1, trail: [], x, y });
      W.run(seconds);
      W.scarer.active = false;
      W.scarer.kind = null;
    },
    [x, y, seconds]
  );

test('shoo AC-4: a slow scarer walks ground birds away, and they stay on the ground', async () => {
  const { context, page } = await open();
  await page.click('[data-play]');
  await startEmpty(page);
  await page.evaluate(() => {
    for (let i = 0; i < 5; i++) window.__shoo.makeBird(['gull', 'goose', 'starling', 'gull', 'gull'][i], 85 + (i % 3) * 4, 150 + Math.floor(i / 3) * 4, 7);
  });
  const before = await page.evaluate(() => window.__shoo.st.birds.map((b) => Math.hypot(b.x - 100, b.y - 152)));
  await holdAt(page, 100, 152, 1);
  const after = await page.evaluate(() => window.__shoo.st.birds.map((b) => ({ d: Math.hypot(b.x - 100, b.y - 152), state: b.state })));
  after.forEach((b, i) => {
    assert.equal(b.state, 'ground');
    assert.ok(b.d > before[i] + 3, `bird ${i} walked off: ${before[i].toFixed(1)} → ${b.d.toFixed(1)}`);
  });
  await context.close();
});

test('shoo AC-5: a fast scarer makes gulls and starlings fly off and land 2–4 s later; geese never fly', async () => {
  const { context, page } = await open();
  await page.click('[data-play]');
  await startEmpty(page);
  const r = await page.evaluate(() => {
    const W = window.__shoo;
    // Mid-field, flushed upward, so the flights end inside the field.
    const ids = ['gull', 'starling', 'goose'].map((sp, i) => W.makeBird(sp, 84 + i * 6, 210, 100 + i).id);
    Object.assign(W.scarer, { active: true, kind: 'pointer', held: 1, trail: [], x: 90, y: 232 });
    const durs = {};
    for (let i = 0; i < 30; i++) {
      W.scarer.y -= 2.5; // 300 art px/s: fast
      W.run(W.STEP);
      for (const b of W.st.birds) if (b.state === 'fly' && !durs[b.id]) durs[b.id] = { dur: b.fl.dur, spot: [b.fl.tx, b.fl.ty] };
    }
    W.scarer.active = false;
    W.scarer.kind = null;
    const goose = W.st.birds.find((b) => b.id === ids[2]);
    const gooseState = goose.state;
    // Run until they've landed.
    let landedAt = {};
    for (let t = 0; t < 5; t += 0.05) {
      W.run(0.05);
      for (const b of W.st.birds) if (durs[b.id] && b.state === 'ground' && !landedAt[b.id]) landedAt[b.id] = { t, at: [b.x, b.y] };
    }
    return { ids, durs, gooseState, landedAt };
  });
  const [gull, starling, goose] = r.ids;
  for (const id of [gull, starling]) {
    assert.ok(r.durs[id], `bird ${id} flew`);
    assert.ok(r.durs[id].dur >= 2 && r.durs[id].dur <= 4);
    assert.ok(r.landedAt[id], 'it landed');
    assert.ok(Math.hypot(r.landedAt[id].at[0] - r.durs[id].spot[0], r.landedAt[id].at[1] - r.durs[id].spot[1]) < 0.5, 'where its shadow said');
  }
  assert.equal(r.durs[goose], undefined, 'the goose never flew');
  assert.equal(r.gooseState, 'ground');
  await context.close();
});

test('shoo AC-5: a bird flushed toward the field’s edge leaves for good; flocks respect the hour’s cap', async () => {
  const { context, page } = await open();
  await page.click('[data-play]');
  await startEmpty(page, 0);
  const r = await page.evaluate(() => {
    const W = window.__shoo;
    const b = W.makeBird('starling', W.FW - 20, 150, 77);
    Object.assign(W.scarer, { active: true, kind: 'pointer', held: 1, trail: [], x: W.FW - 50, y: 150 });
    for (let i = 0; i < 20; i++) {
      W.scarer.x += 2.5;
      W.run(W.STEP);
    }
    W.scarer.active = false;
    W.scarer.kind = null;
    const leaving = b.leaving === true;
    W.run(3);
    const gone = !W.st.birds.includes(b);
    // The 06:00 cap: 14 birds.
    W.st.birds.length = 0;
    for (let i = 0; i < 30; i++) W.arriveFlock('gull');
    return { leaving, gone, count: W.st.birds.length, cap: W.HOURS[0].maxBirds };
  });
  assert.ok(r.leaving && r.gone, 'it flew off and is gone');
  assert.ok(r.count <= r.cap, `${r.count} birds, cap ${r.cap}`);
  await context.close();
});

test('shoo AC-6: birds the player did not move never come onto a runway about to decide; decisions are 4 s apart', async () => {
  const { context, page } = await open();
  await page.click('[data-play]');
  await startEmpty(page);
  const r = await page.evaluate(() => {
    const W = window.__shoo;
    const A = W.RUNWAYS.A;
    W.addLanding('A', 4.5); // decides in 1.5 s
    W.run(0.01);
    const bad = [];
    // Panicked birds next to A, scared toward it from the far side.
    for (let i = 0; i < 40; i++) {
      const b = W.makeBird(i % 2 ? 'gull' : 'starling', A.x - 14, 80 + i * 4, 500 + i);
      W.takeOff(b, { x: A.x - 40, y: b.y });
      if (W.onRunway(A, { x: b.fl.tx, y: b.fl.ty })) bad.push(['flight', b.id]);
    }
    // Arriving flocks.
    for (let i = 0; i < 15; i++) W.arriveFlock(['gull', 'goose', 'starling'][i % 3]);
    for (const b of W.st.birds) if (b.state === 'fly' && W.onRunway(A, { x: b.fl.tx, y: b.fl.ty })) bad.push(['arrival', b.id]);
    // An idle bird drifting toward A while its decision is near.
    W.st.birds.length = 0;
    const idle = W.makeBird('gull', A.x - A.w / 2 - 3, 150, 900);
    idle.calm = 5;
    W.run(1.4);
    if (W.onRunway(A, idle)) bad.push(['drift', idle.x]);
    // Decision spacing across the whole shift's schedule.
    let minGap = Infinity;
    for (let seed = 1; seed <= 20; seed++) {
      W.beginShift(0);
      for (let h = 0; h < 4; h++) {
        W.st.seed = seed * 97 + h;
        W.st.landings.length = 0;
        W.beginHour(h, false);
        const d = W.st.landings.map((l) => l.at - W.DECIDE).sort((a, b) => a - b);
        for (let i = 1; i < d.length; i++) minGap = Math.min(minGap, d[i] - d[i - 1]);
      }
    }
    return { bad, minGap };
  });
  assert.deepEqual(r.bad, []);
  assert.ok(r.minGap >= 4 - 1e-6, `decisions ${r.minGap} s apart`);
  await context.close();
});

test('shoo AC-7: at the decision a bird on the runway sends the plane round; a clear runway lands it; a countdown shows first', async () => {
  const { context, page } = await open();
  await page.click('[data-play]');
  await startEmpty(page);
  const r = await page.evaluate(() => {
    const W = window.__shoo;
    const A = W.RUNWAYS.A;
    W.addLanding('A', 8);
    W.run(0.5); // the plane appears (9 s approach)
    const counts = W.countdowns().map((c) => c.left);
    const bird = W.makeBird('goose', A.x, 150, 1);
    W.run(5);
    const blocked = { state: W.st.planes[0]?.state, hold: W.st.hold.length, goarounds: W.st.goarounds, score: W.st.score, streak: W.st.streak };
    // A clear runway.
    W.st.birds.length = 0;
    W.st.planes.length = 0;
    W.st.hold.length = 0;
    W.addLanding('B', 6);
    W.run(3.1);
    const clear = { cleared: W.st.planes[0]?.cleared, score: W.st.score, streak: W.st.streak, clean: W.st.clean };
    void bird;
    return { counts, blocked, clear };
  });
  assert.ok(r.counts.length === 1 && r.counts[0] >= 4, `countdown ${r.counts}`);
  assert.equal(r.blocked.state, 'around');
  assert.equal(r.blocked.hold, 1);
  assert.equal(r.blocked.goarounds, 1);
  assert.equal(r.blocked.score, 0);
  assert.equal(r.clear.cleared, true);
  assert.equal(r.clear.score, 10);
  assert.equal(r.clear.streak, 1);
  assert.equal(r.clear.clean, 1);
  await context.close();
});

test('shoo AC-8: a held plane comes back 15 s later; a fourth in the hold ends the hour; Retry restores it; New shift restarts', async () => {
  const { context, page } = await open();
  await page.click('[data-play]');
  await startEmpty(page, 2);
  const back = await page.evaluate(() => {
    const W = window.__shoo;
    const A = W.RUNWAYS.A;
    const wentAt = W.st.simTime + 5 - W.DECIDE; // its decision
    W.addLanding('A', 5);
    W.makeBird('goose', A.x, 150, 1);
    W.run(2.1);
    W.st.birds.length = 0;
    let cameAt = null;
    for (let t = 0; t < 30 && cameAt === null; t += 0.1) {
      W.run(0.1);
      const p = W.st.planes.find((p) => p.state === 'approach');
      if (p) cameAt = { touch: p.touch, rw: p.rw };
    }
    return { wentAt, cameAt };
  });
  assert.equal(back.cameAt.rw, 'A');
  assert.ok(back.cameAt.touch - back.wentAt >= 15 - 0.05, `back after ${back.cameAt.touch - back.wentAt} s`);
  // Fill the hold.
  const snap = await page.evaluate(() => {
    const W = window.__shoo;
    W.beginHour(2, false);
    W.st.score = 70;
    const snap = JSON.parse(JSON.stringify(W.snapshot));
    W.st.planes.length = 0;
    W.st.landings.length = 0;
    for (let i = 0; i < 3; i++) W.st.hold.push({ id: 900 + i, rw: 'B', kind: 'prop', back: W.st.simTime + 60 });
    W.makeBird('goose', W.RUNWAYS.A.x, 150, 1);
    W.addLanding('A', 4);
    W.run(1.2);
    return snap;
  });
  assert.equal(await page.evaluate(() => window.__shoo.mode), 'full');
  assert.ok(await shown(page, '[data-screen="full"]'));
  assert.equal(await page.locator('[data-retry]').textContent(), 'Retry 08:00');
  await page.click('[data-retry]');
  const after = await page.evaluate(() => {
    const st = window.__shoo.st;
    return { mode: window.__shoo.mode, hour: st.hour, score: st.score, birds: st.birds.map((b) => [b.id, b.x, b.y, b.state]), hold: st.hold.length };
  });
  assert.equal(after.mode, 'play');
  assert.equal(after.hour, 2);
  assert.equal(after.score, snap.score);
  assert.equal(after.hold, snap.hold.length);
  assert.deepEqual(
    after.birds,
    snap.birds.map((b) => [b.id, b.x, b.y, b.state])
  );
  await page.evaluate(() => {
    const W = window.__shoo;
    for (let i = 0; i < 3; i++) W.st.hold.push({ id: 900 + i, rw: 'B', kind: 'prop', back: W.st.simTime + 60 });
    W.makeBird('goose', W.RUNWAYS.A.x, 150, 1);
    W.addLanding('A', 4);
    W.run(1.2);
  });
  await page.click('[data-new]');
  assert.deepEqual(await page.evaluate(() => [window.__shoo.mode, window.__shoo.st.hour, window.__shoo.st.score]), ['play', 0, 0]);
  await context.close();
});

test('shoo AC-9: clean landings score 10 × the streak, capped at ×5; a go-around resets it', async () => {
  const { context, page } = await open();
  await page.click('[data-play]');
  await startEmpty(page);
  const gains = await page.evaluate(() => {
    const W = window.__shoo;
    const gains = [];
    let last = 0;
    const land = (rw, blocked) => {
      W.st.birds.length = 0;
      if (blocked) W.makeBird('goose', W.RUNWAYS[rw].x, 150, 1);
      W.addLanding(rw, 3.5);
      W.run(0.6);
      gains.push(W.st.score - last);
      last = W.st.score;
      W.run(5);
      W.st.planes.length = 0;
    };
    for (let i = 0; i < 6; i++) land(i % 2 ? 'B' : 'A', false);
    land('A', true);
    W.st.hold.length = 0;
    land('B', false);
    return gains;
  });
  assert.deepEqual(gains, [10, 20, 30, 40, 50, 50, 0, 10]);
  await context.close();
});

test('shoo AC-10: four hours bring the second runway, geese, then starlings and heavies; the done card sums it up', async () => {
  const { context, page } = await open();
  await page.click('[data-play]');
  const r = await page.evaluate(() => {
    const W = window.__shoo;
    W.manual = true;
    W.beginShift(0);
    const byHour = [0, 1, 2, 3].map(() => ({ runways: new Set(), species: new Set(), heavy: false }));
    let guard = 0;
    while (W.mode === 'play' && guard++ < 4000) {
      const h = W.st.hour;
      for (const b of W.st.birds) byHour[h].species.add(b.sp);
      for (const p of W.st.planes) {
        byHour[h].runways.add(p.rw);
        if (p.kind === 'heavy') byHour[h].heavy = true;
      }
      W.st.birds.length = 0; // a perfect shoo: every landing is clean
      W.run(0.25);
    }
    return {
      mode: W.mode,
      byHour: byHour.map((x) => ({ runways: [...x.runways].sort(), species: [...x.species].sort(), heavy: x.heavy })),
      clean: W.st.clean,
      score: W.st.score,
    };
  });
  assert.equal(r.mode, 'done');
  assert.deepEqual(r.byHour[0].runways, ['A']);
  assert.deepEqual(r.byHour[1].runways, ['A', 'B']);
  assert.ok(!r.byHour[0].species.includes('goose') && !r.byHour[1].species.includes('goose'));
  assert.ok(r.byHour[2].species.includes('goose'), 'geese at 08:00');
  assert.ok(!r.byHour[2].species.includes('starling'));
  assert.ok(r.byHour[3].species.includes('starling'), 'starlings at 09:00');
  assert.ok(!r.byHour[0].heavy && !r.byHour[1].heavy && !r.byHour[2].heavy && r.byHour[3].heavy, 'heavies only at 09:00');
  assert.ok(await shown(page, '[data-screen="done"]'));
  assert.equal(await page.locator('[data-final-score]').textContent(), String(r.score));
  assert.match(await page.locator('[data-final-detail]').textContent(), new RegExp(`^${r.clean} clean landings · 0 go-arounds · best streak \\d+$`));
  await context.close();
});

test('shoo AC-11: an idle bird drifts toward the nearest open runway, no faster than the pull', async () => {
  const { context, page } = await open();
  await page.click('[data-play]');
  await startEmpty(page);
  const r = await page.evaluate(() => {
    const W = window.__shoo;
    const b = W.makeBird('gull', 30, 150, 1);
    b.calm = 5;
    const x0 = b.x;
    W.run(4);
    return { dx: b.x - x0, pull: W.PULL };
  });
  assert.ok(r.dx > 0, 'toward runway A');
  assert.ok(r.dx / 4 <= r.pull + 0.05, `${r.dx / 4} px/s`);
  await context.close();
});

test('shoo AC-12: birds get out of a rolling plane’s way, and none is ever inside a moving plane', async () => {
  const { context, page } = await open();
  await page.click('[data-play]');
  await startEmpty(page);
  const r = await page.evaluate(() => {
    const W = window.__shoo;
    const A = W.RUNWAYS.A;
    W.addLanding('A', 4);
    W.run(1.2); // decided: cleared
    // Birds wander onto the runway after the decision, in the plane's path.
    for (let i = 0; i < 6; i++) W.makeBird(['gull', 'goose', 'starling'][i % 3], A.x + (i % 2 ? 3 : -3), 90 + i * 18, 40 + i);
    let hits = 0;
    for (let t = 0; t < 8; t += W.STEP) {
      W.run(W.STEP);
      for (const p of W.st.planes) {
        if (p.state !== 'roll' && !(p.state === 'approach' && p.alt < 0.2)) continue;
        for (const b of W.st.birds) if (b.state === 'ground' && Math.abs(b.x - p.x) < 8 && Math.abs(b.y - p.y) < 8) hits++;
      }
    }
    return { hits, landed: W.st.clean };
  });
  assert.equal(r.landed, 1);
  assert.equal(r.hits, 0);
  await context.close();
});

async function finishShift(page, from = 0, score = 0) {
  await page.evaluate(
    ([from, score]) => {
      const W = window.__shoo;
      W.manual = true;
      W.beginShift(from);
      W.st.score = score;
      while (W.mode === 'play') {
        W.st.birds.length = 0;
        W.run(1);
      }
    },
    [from, score]
  );
}

test('shoo AC-13: the best score, streak and furthest hour are kept; From and #hour start later; blocked storage plays', async () => {
  const { context, page } = await open();
  assert.equal(await shown(page, '[data-from]'), false);
  await page.click('[data-play]');
  await finishShift(page, 0, 0);
  const mem = await page.evaluate(() => window.__shoo.memory());
  const st = await page.evaluate(() => ({ score: window.__shoo.st.score, best: window.__shoo.st.bestStreak }));
  assert.equal(mem.best, st.score);
  assert.equal(mem.bestStreak, st.best);
  assert.equal(mem.hour, 3);
  await page.click('[data-again]');
  assert.ok(await shown(page, '[data-from]'));
  assert.equal(await page.locator('[data-from]').textContent(), 'From 09:00');
  await page.click('[data-from]');
  assert.equal(await page.evaluate(() => window.__shoo.st.hour), 3);
  await context.close();

  const h = await open({ hash: '#hour=2' });
  assert.deepEqual(await h.page.evaluate(() => [window.__shoo.mode, window.__shoo.st.hour]), ['play', 1]);
  await h.context.close();

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
  await finishShift(blocked.page, 2, 10);
  assert.ok(await shown(blocked.page, '[data-screen="done"]'));
  assert.deepEqual(blocked.errors, []);
  await blocked.context.close();
});

test('shoo AC-14: each retry multiplies the hour’s landing gaps by 1 + min(0.08 × retries, 0.25)', async () => {
  const { context, page } = await open();
  await page.click('[data-play]');
  const r = await page.evaluate(() => {
    const W = window.__shoo;
    W.manual = true;
    W.beginShift(1);
    const base = W.st.rawGaps.slice();
    const out = [];
    for (let k = 1; k <= 5; k++) {
      for (let i = 0; i < 3; i++) W.st.hold.push({ id: 900 + i, rw: 'B', kind: 'prop', back: W.st.simTime + 60 });
      W.makeBird('goose', W.RUNWAYS.A.x, 150, 1);
      W.st.landings.push({ at: W.st.simTime + 3.2, rw: 'A', kind: 'prop' });
      W.run(0.5);
      W.retryHour();
      out.push({ retries: W.retries, ratio: W.st.rawGaps[0] / base[0], ratio2: W.st.rawGaps[1] / base[1] });
    }
    return out;
  });
  const want = [1.08, 1.16, 1.24, 1.25, 1.25];
  r.forEach((x, i) => {
    assert.equal(x.retries, i + 1);
    assert.ok(Math.abs(x.ratio - want[i]) < 1e-9 && Math.abs(x.ratio2 - want[i]) < 1e-9, `retry ${i + 1}: ×${x.ratio}`);
  });
  await context.close();
});

test('shoo AC-15: hiding the page pauses play; Resume restarts it with no decision less than 3 s away', async () => {
  const { context, page } = await open();
  await page.click('[data-play]');
  await page.evaluate(() => {
    const W = window.__shoo;
    W.st.landings.length = 0;
    W.addLanding('A', 4); // decides in 1 s
  });
  const setHidden = (hidden) =>
    page.evaluate((hidden) => {
      Object.defineProperty(document, 'hidden', { value: hidden, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    }, hidden);
  await page.waitForTimeout(100);
  await setHidden(true);
  await setHidden(false);
  assert.equal(await page.evaluate(() => window.__shoo.paused), true);
  assert.ok(await shown(page, '[data-screen="paused"]'));
  const a = await page.evaluate(() => [window.__shoo.st.simTime, window.__shoo.st.birds.map((b) => [b.x, b.y])]);
  await page.waitForTimeout(400);
  const b = await page.evaluate(() => [window.__shoo.st.simTime, window.__shoo.st.birds.map((b) => [b.x, b.y])]);
  assert.deepEqual(a, b, 'nothing moves while paused');
  await page.click('[data-resume]');
  const left = await page.evaluate(() => {
    const W = window.__shoo;
    const p = W.st.planes.find((p) => p.state === 'approach' && !p.decided);
    return p ? p.touch - W.DECIDE - W.st.simTime : null;
  });
  assert.ok(left === null || left >= 3 - 0.1, `decision ${left} s away`);
  await page.waitForTimeout(200);
  assert.ok((await page.evaluate(() => window.__shoo.st.simTime)) > a[0]);
  // A refresh or closed tab asks first during a shift, and not on the start card.
  const asks = () =>
    page.evaluate(() => {
      const e = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(e);
      return e.defaultPrevented;
    });
  assert.equal(await asks(), true, 'mid-shift');
  await page.evaluate(() => window.__shoo.showStart());
  assert.equal(await asks(), false, 'on the start card');
  await context.close();
});

for (const [w, h] of [
  [360, 640],
  [390, 844],
]) {
  test(`shoo AC-16: at ${w}×${h} the field and both runways fit below the HUD, with no scrolling`, async () => {
    const { context, page } = await open({ viewport: { width: w, height: h } });
    const r = await page.evaluate(() => {
      const W = window.__shoo;
      const tl = W.toScreen({ x: 0, y: 0 });
      const br = W.toScreen({ x: W.FW, y: W.FH });
      const hud = document.querySelector('.mute').getBoundingClientRect().bottom;
      return { tl, br, hud, sw: document.documentElement.scrollWidth, sh: document.documentElement.scrollHeight, iw: innerWidth, ih: innerHeight };
    });
    assert.ok(r.tl.y >= r.hud);
    assert.ok(r.tl.x >= 0 && r.br.x <= w + 0.5 && r.br.y <= h + 0.5);
    assert.equal(r.sw, r.iw);
    assert.equal(r.sh, r.ih);
    await context.close();
  });
}

test('shoo AC-16: the same 20 s of play at 60 Hz and 120 Hz ends the same', async () => {
  const { context, page } = await open();
  await page.click('[data-play]');
  const runAt = (hz) =>
    page.evaluate((hz) => {
      const W = window.__shoo;
      W.manual = true;
      W.beginShift(0);
      W.st.seed = 12345;
      W.st.birds.length = 0;
      W.st.landings.length = 0;
      for (let i = 0; i < 12; i++) W.makeBird('gull', 30 + i * 9, 120 + (i % 4) * 10, 1 + (i % 3));
      W.addLanding('A', 6);
      Object.assign(W.scarer, { active: true, kind: 'pointer', held: 1, trail: [], x: 60, y: 130 });
      W.run(20, hz);
      W.scarer.active = false;
      W.scarer.kind = null;
      return { score: W.st.score, birds: W.st.birds.map((b) => [b.id, b.x, b.y]), planes: W.st.planes.map((p) => [p.id, p.x, p.y]) };
    }, hz);
  const a = await runAt(60);
  const b = await runAt(120);
  assert.equal(a.score, b.score);
  assert.equal(a.birds.length, b.birds.length);
  a.birds.forEach((p, i) => assert.ok(Math.hypot(p[1] - b.birds[i][1], p[2] - b.birds[i][2]) <= 0.5, `bird ${p[0]}`));
  a.planes.forEach((p, i) => assert.ok(Math.hypot(p[1] - b.planes[i][1], p[2] - b.planes[i][2]) <= 0.5, `plane ${p[0]}`));
  await context.close();
});

test('shoo AC-17: a clean landing plays the landing sound, and the mute button mutes the site', async () => {
  const { context, page } = await open({ init: FAKE_AUDIO });
  await page.click('[data-play]');
  await page.waitForFunction(() => window.__decoded >= 12);
  await startEmpty(page);
  const land = () =>
    page.evaluate(() => {
      const W = window.__shoo;
      const before = window.__played.length;
      W.heard.length = 0;
      W.st.planes.length = 0;
      W.addLanding('A', 3.5);
      W.run(4);
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

test('shoo AC-18: each state shows only its own card and HUD', async () => {
  const { context, page } = await open();
  const cards = ['start', 'full', 'done', 'paused'];
  const look = async () => {
    const out = {};
    for (const c of cards) out[c] = await shown(page, `[data-screen="${c}"]`);
    out.hud = await shown(page, '[data-hud]');
    return out;
  };
  assert.deepEqual(await look(), { start: true, full: false, done: false, paused: false, hud: false });
  await page.click('[data-play]');
  assert.deepEqual(await look(), { start: false, full: false, done: false, paused: false, hud: true });
  assert.equal(await page.locator('[data-hold] i').count(), 3);
  await page.evaluate(() => {
    const W = window.__shoo;
    W.manual = true;
    for (let i = 0; i < 3; i++) W.st.hold.push({ id: 900 + i, rw: 'B', kind: 'prop', back: W.st.simTime + 60 });
    W.st.landings.length = 0;
    W.makeBird('goose', W.RUNWAYS.A.x, 150, 1);
    W.addLanding('A', 4);
    W.run(1.2);
  });
  assert.deepEqual(await look(), { start: false, full: true, done: false, paused: false, hud: true });
  await page.click('[data-retry]');
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  assert.deepEqual(await look(), { start: false, full: false, done: false, paused: true, hud: true });
  await page.click('[data-resume]');
  await finishShift(page);
  assert.deepEqual(await look(), { start: false, full: false, done: true, paused: false, hud: true });
  await context.close();
});

test('shoo AC-19: the UI is 8-bit: a pixel font, no rounding, blur or soft shadows, and marks with no smooth edges', async () => {
  const { context, page } = await open();
  await page.evaluate(() => document.fonts.ready);
  const r = await page.evaluate(() => {
    const els = ['[data-screen="start"]', '[data-play]', '.mute', '.shell-back', '.shell-leave', '[data-shell-stay]', '[data-shell-leave]'].map((s) => document.querySelector(s));
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
    for (const part of s.shadow === 'none' ? [] : s.shadow.split(/,(?![^(]*\))/)) {
      const lengths = part.replace(/rgba?\([^)]*\)/, '').trim().split(/\s+/).filter((t) => t.endsWith('px'));
      assert.equal(lengths[2], '0px', `no blur in "${part.trim()}"`);
    }
  }
  assert.equal(r.rendering, 'pixelated');
  // A live scene with every kind of mark: birds on the ground and in flight with their landing
  // shadows, a plane's countdown, threshold lights, the reticle and its reach, points.
  await page.click('[data-play]');
  const probe = await page.evaluate(() => {
    const W = window.__shoo;
    W.manual = true;
    W.beginHour(3, false);
    for (let i = 0; i < 9; i++) W.makeBird(['gull', 'goose', 'starling'][i % 3], 70 + (i % 3) * 8, 120 + Math.floor(i / 3) * 8, 300 + i);
    W.addLanding('A', 6);
    W.addLanding('B', 1.5);
    Object.assign(W.scarer, { active: true, kind: 'pointer', held: 1, trail: [], x: 60, y: 125 });
    for (let i = 0; i < 20; i++) {
      W.scarer.x += 2.5;
      W.run(W.STEP);
    }
    W.run(0.2);
    const flying = W.st.birds.filter((b) => b.state === 'fly').length;
    return { ...W.marksAlphaProbe(), flying, countdowns: W.countdowns().length };
  });
  assert.ok(probe.flying > 0 && probe.countdowns > 0, 'the scene has birds in flight and a countdown');
  assert.ok(probe.drawn > 200, `${probe.drawn} mark pixels`);
  for (const a of probe.alphas) assert.ok(probe.allowed.includes(a), `alpha ${a} is one of ${probe.allowed}`);
  await context.close();
});

test('shoo AC-20: with 150 birds, the median frame (its steps and its drawing) takes under 8 ms', async () => {
  const { context, page } = await open();
  await page.click('[data-play]');
  const median = await page.evaluate(() => {
    const W = window.__shoo;
    W.manual = true;
    W.st.birds.length = 0;
    for (let i = 0; i < 150; i++) W.makeBird(['gull', 'goose', 'starling'][i % 3], 25 + (i % 15) * 10, 40 + Math.floor(i / 15) * 22, 1 + Math.floor(i / 10));
    Object.assign(W.scarer, { active: true, kind: 'pointer', held: 1, trail: [], x: 90, y: 150 });
    const times = [];
    for (let i = 0; i < 100; i++) {
      W.scarer.x = 40 + (i % 50) * 2;
      const t0 = performance.now();
      W.run(1 / 60, 60);
      W.draw();
      times.push(performance.now() - t0);
    }
    times.sort((a, b) => a - b);
    return times[50];
  });
  assert.ok(median < 8, `median frame ${median.toFixed(2)} ms`);
  await context.close();
});

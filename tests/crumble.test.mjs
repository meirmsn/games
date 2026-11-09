// End-to-end tests for Crumble. Run: scripts/check-slow.sh.
// The game exposes window.__crumble (its state, and a step() that advances the simulation without
// drawing), so these tests can set up a situation and check what the rules do with it.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { statSync } from 'node:fs';
import { chromium } from 'playwright';
import { FAKE_AUDIO } from './fake-audio.mjs';

// Its own port range: the test files run in parallel, and a shared range can collide.
const PORT = 9300 + Math.floor(Math.random() * 100);
const BASE = `http://127.0.0.1:${PORT}/`;
const ROOT = new URL('..', import.meta.url).pathname;
let server;
let browser;

before(async () => {
  server = spawn('python3', ['-m', 'http.server', '--bind', '127.0.0.1', String(PORT)], { cwd: ROOT, stdio: 'ignore' });
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

async function open({ path = 'crumble/', audio = false, ...opts } = {}) {
  const context = await browser.newContext({ viewport: { width: 844, height: 390 }, ...opts });
  if (audio) await context.addInitScript(FAKE_AUDIO);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(BASE + path);
  await page.waitForFunction(() => window.__crumble);
  return { context, page, errors };
}

// Start a battle on battlefield `field` (0-based) with the test owning the clock, on the player's turn.
async function battle(page, field = 0, { taught = true } = {}) {
  await page.evaluate(
    ({ field, taught }) => {
      const c = window.__crumble;
      c.manual = true;
      c.store.taught = taught;
      c.game.attempt[field] = 0; // the first attempt: the player starts
      c.startBattle(field);
    },
    { field, taught }
  );
  assert.equal(await page.evaluate(() => window.__crumble.game.phase), 'aim');
}

const steps = (page, seconds) =>
  page.evaluate((s) => {
    for (let t = 0; t < s; t += 1 / 60) window.__crumble.step(1 / 60);
  }, seconds);

// Step until the game is on the next turn's aim (or the battle ended), at most `max` seconds. A turn
// that is waiting already (the CPU's) is played first.
const settle = (page, max = 12) =>
  page.evaluate((max) => {
    const c = window.__crumble;
    const from = c.game.phase;
    let t = 0;
    if (from === 'cpu') for (; t < max && c.game.phase === 'cpu'; t += 1 / 60) c.step(1 / 60);
    for (; t < max; t += 1 / 60) {
      c.step(1 / 60);
      if (c.game.mode !== 'battle' || c.game.phase === 'aim' || c.game.phase === 'cpu') return t;
    }
    return max;
  }, max);

// Real touch through the DevTools protocol, so the page sees pointerType "touch".
async function touch(page) {
  const cdp = await page.context().newCDPSession(page);
  const send = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([x, y, id]) => ({ x, y, id })) });
  return {
    async drag(from, to, n = 8) {
      await send('touchStart', [[...from, 1]]);
      for (let i = 1; i <= n; i++) await send('touchMove', [[from[0] + ((to[0] - from[0]) * i) / n, from[1] + ((to[1] - from[1]) * i) / n, 1]]);
      await page.waitForTimeout(60);
      await send('touchEnd', []);
      await page.waitForTimeout(30);
    },
    send,
  };
}

const shots = (page) => page.evaluate(() => window.__crumble.game.shots);

test('crumble AC-1: the shore moves behind the start card; Start begins on the player turn with the ghost hand', async () => {
  const { context, page, errors } = await open();
  assert.equal(await page.isVisible('[data-screen="start"]'), true);
  assert.equal(await page.isVisible('[data-hud-top]'), false);
  const t0 = await page.evaluate(() => window.__crumble.game.time);
  await page.waitForFunction(() => window.__crumble.terrain.carves > 0, null, { timeout: 6000 });
  assert.ok((await page.evaluate(() => window.__crumble.game.time)) > t0, 'the water and the demo move');
  await page.click('[data-play]');
  const s = await page.evaluate(() => ({ mode: window.__crumble.game.mode, phase: window.__crumble.game.phase, turn: window.__crumble.game.turn, taught: window.__crumble.store.taught }));
  assert.deepEqual(s, { mode: 'battle', phase: 'aim', turn: 0, taught: false }, 'the ghost hand shows until the first aiming touch');
  assert.equal(await page.isVisible('[data-screen="start"]'), false);
  const tc = await touch(page);
  await tc.send('touchStart', [[600, 150, 1]]);
  await tc.send('touchEnd', []);
  assert.equal(await page.evaluate(() => window.__crumble.store.taught), true);
  await page.reload();
  await page.waitForFunction(() => window.__crumble);
  assert.equal(await page.evaluate(() => window.__crumble.store.taught), true, 'still hidden after a reload');
  assert.deepEqual(errors, []);
  await context.close();
});

test('crumble AC-2: pull back and let go aims and fires; HUD starts, second fingers and short pulls do not', async () => {
  const { context, page } = await open({ hasTouch: true });
  await battle(page, 0);
  const tc = await touch(page);
  // Pull from (600,150) down-left to (500,220): the shot goes up-right, at full power (122 px > 120).
  await tc.send('touchStart', [[600, 150, 1]]);
  for (let i = 1; i <= 6; i++) await tc.send('touchMove', [[600 - (100 * i) / 6, 150 + (70 * i) / 6, 1]]);
  await page.waitForTimeout(60); // pointer events arrive with the next frame
  const mid = await page.evaluate(() => ({ aim: window.__crumble.tanks[0].aim, power: window.__crumble.tanks[0].power, shown: window.__crumble.aim.shown, phase: window.__crumble.game.phase }));
  assert.ok(Math.abs(mid.aim - Math.atan2(70, 100)) < 0.02, `aims opposite the pull (${mid.aim})`);
  assert.equal(mid.power, 1, 'capped at full power');
  assert.equal(mid.shown, true, 'the arc preview and power band show');
  assert.equal(mid.phase, 'aim', 'nothing fires before the release');
  await tc.send('touchEnd', []);
  assert.equal(await shots(page), 1, 'the release fires');
  await settle(page);
  await settle(page); // the CPU's answer
  assert.equal(await page.evaluate(() => window.__crumble.game.phase), 'aim');
  const before = await shots(page);

  // A short pull: nothing.
  await tc.drag([600, 150], [594, 154]);
  assert.equal(await shots(page), before, 'a pull shorter than the dead zone cancels');
  // A drag that starts on the HUD: nothing.
  const btn = await page.locator('[data-weapon="shell"]').boundingBox();
  await tc.drag([btn.x + btn.width / 2, btn.y + btn.height / 2], [btn.x - 120, btn.y - 80]);
  assert.equal(await shots(page), before, 'a drag from the HUD never aims');
  // A second finger: ignored while the first owns the aim.
  await tc.send('touchStart', [[600, 150, 1]]);
  await tc.send('touchStart', [[600, 150, 1], [300, 100, 2]]);
  await tc.send('touchMove', [[600, 150, 1], [200, 200, 2]]);
  await tc.send('touchEnd', [[600, 150, 1]]);
  await tc.send('touchEnd', []);
  assert.equal(await shots(page), before, 'the second finger fired nothing');
  // A drag that ends over the HUD still fires.
  await tc.drag([btn.x - 150, btn.y - 120], [btn.x + btn.width / 2, btn.y + btn.height / 2]);
  assert.equal(await shots(page), before + 1, 'a drag ending over the HUD fires');
  await context.close();
});

test('crumble AC-3: a Shell carves a crater from the mask and the drawn ground; shots leave the world; tanks settle', async () => {
  const { context, page } = await open();
  await battle(page, 0);
  const r = await page.evaluate(() => {
    const c = window.__crumble;
    const x = 700;
    const y = c.terrain.top(x) + 12;
    const cells = c.terrain.count();
    const fxBefore = c.fx.count;
    c.detonate(x, y);
    const s = c.terrain.scale;
    const px = c.terrain.ctx.getImageData(Math.round(x * s), Math.round(y * s), 1, 1).data[3];
    return { removed: cells - c.terrain.count(), air: c.terrain.at(x, y), alpha: px, fx: c.fx.count - fxBefore, r: c.TUNING.shellRadius };
  });
  assert.ok(Math.abs(r.removed - Math.PI * r.r * r.r) < Math.PI * r.r * r.r * 0.6, `a round crater (${r.removed} cells)`);
  assert.equal(r.air, 0, 'the mask is air at the centre');
  assert.equal(r.alpha, 0, 'the drawn ground is transparent at the centre');
  assert.ok(r.fx > 20, 'the shared explosion went off');

  // A tank whose ground goes settles onto the ground under its track ends, tilted to match.
  const fall = await page.evaluate(() => {
    const c = window.__crumble;
    const t = c.tanks[1];
    const y0 = t.y;
    c.terrain.carve(t.x + 34, t.y + 6, 30);
    for (let i = 0; i < 120; i++) c.step(1 / 60);
    const l = c.terrain.surfaceBelow(t.x - 31, t.y - 6);
    const rr = c.terrain.surfaceBelow(t.x + 31, t.y - 6);
    return { dy: t.y - y0, tilt: t.tilt, l: l - t.y, r: rr - t.y, falling: t.falling };
  });
  assert.ok(fall.dy > 2, `it dropped (${fall.dy})`);
  assert.ok(fall.tilt > 0.1, `tilted toward the hole (${fall.tilt})`);
  assert.equal(fall.falling, false);
  assert.ok(Math.min(fall.l, fall.r) < 4, 'one track end rests on the ground');

  // A shot that leaves past the side ends the shot, and the turn passes.
  const left = await page.evaluate(() => {
    const c = window.__crumble;
    c.fire(0, 'shell', Math.PI - 0.35, 1);
    let t = 0;
    while (c.game.phase === 'flight' && t < 10) {
      c.step(1 / 60);
      t += 1 / 60;
    }
    return { t, x: c.game.projectile ? c.game.projectile.x : null, phase: c.game.phase };
  });
  assert.equal(left.phase, 'settle');
  assert.ok(left.t < 3);
  await settle(page);
  assert.equal(await page.evaluate(() => window.__crumble.game.turn), 1, 'the CPU is next');
  // A shot that flies 8 s ends too.
  await settle(page);
  const long = await page.evaluate(() => {
    const c = window.__crumble;
    const g = c.TUNING.gravity;
    c.TUNING.gravity = 5;
    c.fire(0, 'shell', Math.PI / 2, 0.4);
    let t = 0;
    while (c.game.phase === 'flight' && t < 12) {
      c.step(1 / 60);
      t += 1 / 60;
    }
    c.TUNING.gravity = g;
    return { t, phase: c.game.phase };
  });
  assert.equal(long.phase, 'settle');
  assert.ok(long.t > 7.5 && long.t < 8.6, `ended at 8 s (${long.t})`);
  await context.close();
});

test('crumble AC-4: Shell damage by distance, the direct-hit bonus, your own blast, and falls', async () => {
  const { context, page } = await open();
  await battle(page, 0);
  const r = await page.evaluate(() => {
    const c = window.__crumble;
    const [p, e] = c.tanks;
    const out = {};
    // A direct hit at the centre: 30 + 15.
    c.detonate(e.x, e.y - 24, { direct: e });
    out.direct = 100 - e.armour;
    out.text = c.game.texts.at(-1).text;
    // Half the reach away (radius 36 + 28 = 64; 32 away): 15.
    e.armour = 100;
    c.detonate(e.x + 32, e.y - 24);
    out.half = 100 - e.armour;
    // Your own blast hurts you.
    c.detonate(p.x + 20, p.y - 24);
    out.own = 100 - p.armour;
    // A fall of more than 30 units costs 0.5 a unit beyond.
    p.armour = 100;
    for (let i = 0; i < 120; i++) c.step(1 / 60);
    const y0 = p.y;
    c.terrain.carve(p.x, p.y + 50, 64, { scorch: null });
    for (let i = 0; i < 240; i++) c.step(1 / 60);
    out.fell = p.y - y0;
    out.fallLoss = 100 - p.armour;
    return out;
  });
  assert.equal(r.direct, 45);
  assert.equal(r.text, '−45', 'the hit tank shows what it lost');
  assert.equal(r.half, 15);
  assert.ok(r.own > 0, 'own blast');
  assert.ok(r.fell > 40, `it fell (${r.fell})`);
  assert.ok(Math.abs(r.fallLoss - Math.round((r.fell - 30) * 0.5)) <= 1, `fall damage ${r.fallLoss} for ${r.fell}`);
  await context.close();
});

test('crumble AC-5: the Auger drills a wide shaft, does no damage, drops a tank 2+ notches; 2 charges; not on Battlefield 1', async () => {
  const { context, page } = await open();
  await battle(page, 0);
  assert.equal(await page.isVisible('[data-weapon="auger"]'), false, 'no Auger on Battlefield 1');
  await battle(page, 1);
  assert.equal(await page.isVisible('[data-weapon="auger"]'), true);
  assert.equal(await page.textContent('[data-charges]'), '2');
  const r = await page.evaluate(() => {
    const c = window.__crumble;
    const e = c.tanks[1];
    for (let i = 0; i < 60; i++) c.step(1 / 60);
    const y0 = e.y;
    const top = c.terrain.top(e.x);
    c.drillAt(e.x);
    for (let i = 0; i < 240 && c.game.phase === 'flight'; i++) c.step(1 / 60);
    for (let i = 0; i < 90; i++) c.step(1 / 60); // it lands
    const { r: half, depth } = c.augerShaft();
    let width = 0;
    const y = Math.round(top + depth / 2);
    for (let x = Math.round(e.x - 80); x < e.x + 80; x++) if (c.terrain.at(x, y) === 0) width++;
    return { drop: e.y - y0, notch: c.game.notch, armour: e.armour, width, tankW: 77, half };
  });
  assert.ok(r.width >= 1.3 * r.tankW - 2, `the shaft is ${r.width} wide`);
  assert.equal(r.armour, 100, 'no damage');
  assert.ok(r.drop >= 2 * r.notch, `dropped ${r.drop} (a notch is ${r.notch})`);
  // Charges: two shots, then the button does nothing.
  await settle(page);
  await settle(page);
  for (let i = 0; i < 2; i++) {
    await page.evaluate(() => window.__crumble.startTurn(0));
    await page.click('[data-weapon="auger"]');
    assert.equal(await page.evaluate(() => window.__crumble.game.weapon), 'auger');
    await page.evaluate(() => window.__crumble.fire(0, window.__crumble.game.weapon, Math.PI - 0.3, 1));
    await settle(page);
  }
  await page.evaluate(() => {
    const c = window.__crumble;
    c.game.phase = 'aim';
    c.startTurn(0);
  });
  assert.equal(await page.textContent('[data-charges]'), '0');
  await page.click('[data-weapon="auger"]', { force: true });
  assert.equal(await page.evaluate(() => window.__crumble.game.weapon), 'shell', 'an empty Auger does nothing');
  await context.close();
});

test('crumble AC-6: the tide rises every 3 shots, hurts hulls under water, warns, stops, and a draw replays', async () => {
  const { context, page } = await open();
  await battle(page, 1);
  const out = async () => {
    await page.evaluate(() => window.__crumble.fire(window.__crumble.game.turn, 'shell', window.__crumble.game.turn ? 0.3 : Math.PI - 0.3, 1));
  };
  const w0 = await page.evaluate(() => window.__crumble.game.waterY);
  await out();
  await settle(page);
  assert.equal(await page.locator('[data-pips] i.on').count(), 1, 'one pip after one shot');
  // Make the next rise cover the player's hull.
  const warn = await page.evaluate(() => {
    const c = window.__crumble;
    c.game.waterY = c.hullY(c.tanks[0]) + c.game.notch * 0.5;
    return c.threatened(c.tanks[0]);
  });
  assert.equal(warn, true, 'marked: the next notch covers it');
  const wBefore = await page.evaluate(() => window.__crumble.game.waterY);
  // The CPU's turn is next; let it fire (the second shot), then a third.
  await page.evaluate(() => (window.__crumble.tanks[0].armour = 100));
  await settle(page); // CPU fires and its shot settles
  const a2 = await page.evaluate(() => window.__crumble.tanks[0].armour);
  await out();
  await settle(page, 15);
  const r = await page.evaluate(() => ({ water: window.__crumble.game.waterY, notch: window.__crumble.game.notch, armour: window.__crumble.tanks[0].armour }));
  assert.ok(Math.abs(wBefore - r.water - r.notch) < 1, `rose one notch (${wBefore} → ${r.water})`);
  assert.equal(a2 - r.armour >= 30, true, `the hull under water lost 30 (${a2} → ${r.armour})`);
  assert.ok(w0 > r.water);

  // Battlefield 1: the tide stops 2 notches below both hulls. Elsewhere: 1 notch above the higher.
  const stops = await page.evaluate(() => {
    const c = window.__crumble;
    const res = [];
    for (const f of [0, 2]) {
      c.setupBattle(f, { seed: 77 });
      const h = c.tanks.map(c.hullY);
      res.push({ f, min: c.game.waterMin, notch: c.game.notch, low: Math.max(...h), high: Math.min(...h) });
    }
    return res;
  });
  assert.ok(stops[0].min >= stops[0].low + 2 * stops[0].notch - 0.5, 'Battlefield 1 stops 2 notches below');
  assert.ok(Math.abs(stops[1].min - (stops[1].high - stops[1].notch)) < 0.5, 'Breakwater stops 1 notch above the higher hull');

  // Both out at the same rise: a draw, replayed on the same hill with the other side starting.
  const draw = await page.evaluate(() => {
    const c = window.__crumble;
    c.game.attempt[2] = 0;
    c.startBattle(2);
    const seed = c.game.seed;
    const starter = c.game.starter;
    for (const t of c.tanks) t.armour = 20;
    c.game.waterY = Math.max(...c.tanks.map(c.hullY)) + c.game.notch * 0.6;
    c.game.waterMin = 0;
    c.game.shots = 2;
    c.fire(c.game.turn, 'shell', c.game.turn ? 0.3 : Math.PI - 0.3, 1);
    for (let t = 0; t < 10 && c.game.mode === 'battle' && !(c.game.phase === 'aim' || c.game.phase === 'cpu'); t += 1 / 60) c.step(1 / 60);
    return { mode: c.game.mode, seed: c.game.seed === seed, starter: c.game.starter !== starter, armour: c.tanks.map((t) => t.armour) };
  });
  assert.deepEqual(draw, { mode: 'battle', seed: true, starter: true, armour: [100, 100] });
  await context.close();
});

test('crumble AC-7: girders on Breakwater are never carved, and a shell bursts on one', async () => {
  const { context, page } = await open();
  await battle(page, 2);
  const r = await page.evaluate(() => {
    const c = window.__crumble;
    const g = c.terrain.steel[0];
    const cx = g.x + g.w / 2;
    const cy = g.y + 20;
    c.detonate(cx, cy);
    const still = c.terrain.at(cx, cy);
    const carves = c.terrain.carves;
    c.shoot(g.x - 30, cy, 600, 0);
    let t = 0;
    while (c.game.phase === 'flight' && t < 2) {
      c.step(1 / 120);
      t += 1 / 120;
    }
    return { steel: c.terrain.steel.length, still, burst: c.terrain.carves - carves, after: c.terrain.at(cx, cy), t };
  });
  assert.equal(r.steel, 2);
  assert.equal(r.still, 2, 'still steel after a blast on it');
  assert.equal(r.burst, 1, 'the shell burst on the girder');
  assert.ok(r.t < 0.2, 'right away');
  assert.equal(r.after, 2);
  for (const f of [0, 1]) {
    await battle(page, f);
    assert.equal(await page.evaluate(() => window.__crumble.terrain.steel.length), 0);
  }
  await context.close();
});

test('crumble AC-8: the CPU fires fast, the assist widens its aim and is kept, and it never digs on Battlefield 1', async () => {
  const { context, page } = await open();
  await battle(page, 0);
  const fired = await page.evaluate(() => {
    const c = window.__crumble;
    c.startTurn(1);
    let t = 0;
    while (c.game.phase === 'cpu' && t < 2) {
      c.step(1 / 60);
      t += 1 / 60;
    }
    return { t, phase: c.game.phase };
  });
  assert.equal(fired.phase, 'flight');
  assert.ok(fired.t <= 1, `fired after ${fired.t.toFixed(2)} s`);
  // On Battlefield 1 the CPU never uses the Auger, even with the player by the water.
  const b1 = await page.evaluate(() => {
    const c = window.__crumble;
    c.game.waterY = c.hullY(c.tanks[0]) + 4;
    return c.plan(c.tanks[1], c.tanks[0]).weapon;
  });
  assert.equal(b1, 'shell');

  await battle(page, 2);
  const rates = await page.evaluate(() => {
    const c = window.__crumble;
    c.game.wind = 30;
    c.tanks[1].shotsFired = 3;
    const rate = (assist) => {
      let near = 0;
      for (let i = 0; i < 40; i++) {
        c.setCpuRandom(1000 + i);
        const p = c.plan(c.tanks[1], c.tanks[0], { assist, weapon: 'shell' });
        const hit = c.simulate(c.tanks[1], p.angle, p.power);
        const t = c.tanks[0];
        if (Math.hypot(hit.x - t.x, hit.y - (t.y - 24)) < 60) near++;
      }
      return near / 40;
    };
    return { sharp: rate(0), loose: rate(1) };
  });
  assert.ok(rates.sharp - rates.loose >= 0.15, `assist 0 lands near ${rates.sharp}, assist 1 ${rates.loose}`);

  // Every candidate blocked: it still fires within 1 s.
  const blocked = await page.evaluate(() => {
    const c = window.__crumble;
    const e = c.tanks[1];
    c.terrain.addSteel({ x: e.x - 70, y: e.y - 120, w: 140, h: 30 });
    c.terrain.addSteel({ x: e.x - 90, y: e.y - 120, w: 20, h: 110 });
    c.startTurn(1);
    let t = 0;
    while (c.game.phase === 'cpu' && t < 2) {
      c.step(1 / 60);
      t += 1 / 60;
    }
    return { t, phase: c.game.phase };
  });
  assert.equal(blocked.phase, 'flight');
  assert.ok(blocked.t <= 1);

  // A loss raises the assist and a win lowers it; it's kept across reloads.
  const lose = await page.evaluate(() => {
    const c = window.__crumble;
    c.store.assist = 0.3;
    c.startBattle(0);
    c.tanks[0].armour = 0;
    c.game.phase = 'settle';
    c.game.timer = 1;
    for (let i = 0; i < 180; i++) c.step(1 / 60);
    return c.store.assist;
  });
  assert.ok(Math.abs(lose - 0.65) < 1e-9, `after a loss ${lose}`);
  await page.reload();
  await page.waitForFunction(() => window.__crumble);
  assert.ok(Math.abs((await page.evaluate(() => window.__crumble.store.assist)) - 0.65) < 1e-9, 'kept across a reload');
  const win = await page.evaluate(() => {
    const c = window.__crumble;
    c.manual = true;
    c.startBattle(0);
    c.tanks[1].armour = 0;
    c.game.phase = 'settle';
    c.game.timer = 1;
    for (let i = 0; i < 180; i++) c.step(1 / 60);
    return c.store.assist;
  });
  assert.ok(Math.abs(win - 0.45) < 1e-9, `after a win ${win}`);
  await context.close();
});

test('crumble AC-9: winning gives stars and the next battlefield; losing offers the same hill or a new one; progress is kept', async () => {
  const { context, page } = await open();
  await battle(page, 0);
  const end = (mine, theirs) =>
    page.evaluate(
      ({ mine, theirs }) => {
        const c = window.__crumble;
        c.tanks[0].armour = mine;
        c.tanks[1].armour = theirs;
        c.game.phase = 'settle';
        c.game.timer = 1;
        for (let i = 0; i < 180; i++) c.step(1 / 60);
        return c.game.outcome;
      },
      { mine, theirs }
    );
  assert.equal((await end(60, 0)).stars, 3);
  assert.equal(await page.isVisible('[data-result-next]'), true);
  assert.equal(await page.isVisible('[data-result-new]'), false);
  await page.waitForTimeout(100);
  assert.equal(await page.locator('[data-result-stars] i.on').count(), 3);
  await battle(page, 0);
  assert.equal((await end(30, 0)).stars, 2);
  await battle(page, 0);
  assert.equal((await end(29, 0)).stars, 1);
  const kept = await page.evaluate(() => ({ reached: window.__crumble.store.reached, stars: window.__crumble.store.stars[0] }));
  assert.deepEqual(kept, { reached: 2, stars: 3 });

  // A loss: Again replays the same hill; New hill deals a different one.
  await battle(page, 0);
  const seed = await page.evaluate(() => window.__crumble.game.seed);
  const heights = await page.evaluate(() => Array.from(window.__crumble.heights).filter((_, i) => i % 7 === 0));
  assert.equal((await end(0, 50)).win, false);
  assert.equal(await page.isVisible('[data-result-again]'), true);
  assert.equal(await page.isVisible('[data-result-new]'), true);
  await page.click('[data-result-again]');
  assert.equal(await page.evaluate(() => window.__crumble.game.seed), seed);
  assert.deepEqual(await page.evaluate(() => Array.from(window.__crumble.heights).filter((_, i) => i % 7 === 0)), heights, 'the same hill');
  await end(0, 50);
  await page.click('[data-result-new]');
  assert.notEqual(await page.evaluate(() => window.__crumble.game.seed), seed, 'a new hill');

  // Kept across reloads, and #2 opens Battlefield 2 once reached.
  await page.goto(BASE + 'crumble/#2');
  await page.reload();
  await page.waitForFunction(() => window.__crumble);
  assert.equal(await page.textContent('[data-pick-name]'), 'Windy Point');
  assert.equal(await page.locator('[data-pick-stars] i.on').count(), 0);
  await page.click('[data-prev]');
  assert.equal(await page.locator('[data-pick-stars] i.on').count(), 3);
  await page.goto(BASE + 'crumble/#3');
  await page.reload();
  await page.waitForFunction(() => window.__crumble);
  assert.equal(await page.textContent('[data-pick-name]'), 'Windy Point', 'not reached: #3 stays at the furthest');
  await context.close();
});

test('crumble AC-10: wind is calm on Battlefield 1, changes between rounds elsewhere, shows, and pushes shells', async () => {
  const { context, page } = await open();
  await battle(page, 0);
  const calm = await page.evaluate(() => {
    const c = window.__crumble;
    const winds = [];
    for (let i = 0; i < 6; i++) {
      c.game.shots = i;
      c.startTurn(i % 2);
      winds.push(c.game.wind);
    }
    return winds;
  });
  assert.deepEqual(calm, [0, 0, 0, 0, 0, 0]);
  await battle(page, 1);
  const winds = await page.evaluate(() => {
    const c = window.__crumble;
    const rounds = [];
    for (let r = 0; r < 6; r++) {
      c.game.shots = r * 2;
      c.startTurn(0);
      const a = c.game.wind;
      c.game.shots = r * 2 + 1;
      c.startTurn(1);
      rounds.push([a, c.game.wind]);
    }
    c.game.phase = 'aim';
    return rounds;
  });
  for (const [a, b] of winds) assert.equal(a, b, 'holds within a round');
  assert.ok(new Set(winds.map((w) => w[0])).size > 1, 'changes between rounds');
  const shown = await page.evaluate(() => {
    const c = window.__crumble;
    c.game.wind = 40;
    c.game.shots = 1;
    c.startTurn(0);
    return document.querySelector('[data-wind]').getAttribute('aria-label');
  });
  assert.match(shown, /right/);
  const push = await page.evaluate(() => {
    const c = window.__crumble;
    const t = c.tanks[0];
    return { right: c.simulate(t, 1.2, 0.8, 60).x, still: c.simulate(t, 1.2, 0.8, 0).x, left: c.simulate(t, 1.2, 0.8, -60).x };
  });
  assert.ok(push.right > push.still && push.still > push.left, JSON.stringify(push));
  await context.close();
});

test('crumble AC-11: each battlefield looks its own; girders only on Breakwater; mirrored hills; a low CPU on Battlefield 2', async () => {
  const { context, page } = await open();
  const r = await page.evaluate(() => {
    const c = window.__crumble;
    const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    const skies = c.FIELDS.map((f) => rgb(f.sky[0]));
    let minDist = Infinity;
    for (let i = 0; i < skies.length; i++)
      for (let j = i + 1; j < skies.length; j++) minDist = Math.min(minDist, Math.hypot(...skies[i].map((v, k) => v - skies[j][k])));
    const fields = [];
    for (let f = 0; f < 3; f++) {
      for (const seed of [11, 12, 13]) {
        c.setupBattle(f, { seed });
        let mirror = 0;
        for (let x = 0; x < c.W / 2; x++) mirror = Math.max(mirror, Math.abs(c.heights[x] - c.heights[c.W - 1 - x]));
        fields.push({ f, steel: c.terrain.steel.length, mirror, low: c.hullY(c.tanks[1]) - c.hullY(c.tanks[0]) });
      }
    }
    return { minDist, fields };
  });
  assert.ok(r.minDist >= 60, `skies differ by ${r.minDist}`);
  for (const f of r.fields) {
    assert.equal(f.steel > 0, f.f === 2, `girders on ${f.f}`);
    if (f.f !== 1) assert.ok(f.mirror <= 10, `mirrored within ${f.mirror}`);
    else assert.ok(f.low > 30, `the CPU starts lower on Battlefield 2 (${f.low})`);
  }
  await context.close();
});

test('crumble AC-12: the frame holds at 844×390, DPR 2, CPU 4× slower, with blasts every few frames', async () => {
  const { context, page } = await open({ deviceScaleFactor: 2 });
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.evaluate(() => {
    const c = window.__crumble;
    c.store.taught = true;
    c.startBattle(0);
    c.frameTimes.length = 0;
    c.carveTimes.length = 0;
    window.__fxMax = 0;
    let n = 0;
    const blast = () => {
      if (n++ > 200) return;
      if (n % 3 === 0) {
        const x = 300 + Math.random() * 800;
        c.detonate(x, c.terrain.top(x) + 6);
      }
      window.__fxMax = Math.max(window.__fxMax, c.fx.count);
      requestAnimationFrame(blast);
    };
    requestAnimationFrame(blast);
  });
  await page.waitForTimeout(4000);
  const r = await page.evaluate(() => {
    const c = window.__crumble;
    const f = [...c.frameTimes].sort((a, b) => a - b);
    const k = [...c.carveTimes].sort((a, b) => a - b);
    const x = 700;
    const y = c.terrain.top(x) + 8;
    c.detonate(x, y);
    const s = c.terrain.scale;
    const alpha = c.terrain.ctx.getImageData(Math.round(x * s), Math.round(y * s), 1, 1).data[3];
    return { frames: f.length, p95: f[Math.floor(f.length * 0.95)], carve: k[Math.floor(k.length * 0.95)], carves: k.length, fxMax: window.__fxMax, alpha };
  });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  console.log(`crumble AC-12: ${JSON.stringify(r)}`);
  assert.ok(r.frames > 30 && r.carves > 20, 'it ran');
  assert.ok(r.fxMax >= 200, `the explosion pool was at least half full (${r.fxMax})`);
  assert.ok(r.p95 < 16.7, `p95 frame ${r.p95.toFixed(2)} ms`);
  assert.ok(r.carve < 4, `p95 carve + settle ${r.carve.toFixed(2)} ms`);
  assert.equal(r.alpha, 0, 'the crater is transparent in the drawn ground');
  await context.close();
});

test('crumble AC-13: portrait shows the turn card and pauses a battle; landscape plays; the HUD fits 640×360', async () => {
  const { context, page } = await open({ viewport: { width: 390, height: 844 } });
  assert.equal(await page.isVisible('[data-rotate]'), true);
  await page.evaluate(() => {
    const c = window.__crumble;
    c.store.taught = true;
    c.startBattle(0);
    c.fire(0, 'shell', 1.2, 0.9);
  });
  const x0 = await page.evaluate(() => window.__crumble.game.projectile.x);
  await page.waitForTimeout(500);
  assert.equal(await page.evaluate(() => window.__crumble.game.projectile.x), x0, 'the shell holds');
  await page.evaluate(() => {
    const c = window.__crumble;
    c.game.projectile = null;
    c.game.shots = 1;
    c.startTurn(1);
  });
  await page.waitForTimeout(1300);
  assert.equal(await page.evaluate(() => window.__crumble.game.phase), 'cpu', "the CPU's timer holds");
  await page.setViewportSize({ width: 844, height: 390 });
  assert.equal(await page.isVisible('[data-rotate]'), false);
  await page.waitForTimeout(1300);
  assert.notEqual(await page.evaluate(() => window.__crumble.game.phase), 'cpu', 'play goes on');

  await page.setViewportSize({ width: 640, height: 360 });
  await page.evaluate(() => {
    const c = window.__crumble;
    c.manual = true;
    c.game.attempt[1] = 0;
    c.startBattle(1);
  });
  await page.waitForTimeout(200);
  const boxes = await page.evaluate(() =>
    ['.shell-back', '[data-mute]', '[data-hud-top]', '[data-weapon="shell"]', '[data-weapon="auger"]'].map((s) => {
      const r = document.querySelector(s).getBoundingClientRect();
      return { s, x: r.x, y: r.y, w: r.width, h: r.height };
    })
  );
  for (const b of boxes) {
    assert.ok(b.x >= 0 && b.y >= 0 && b.x + b.w <= 640 && b.y + b.h <= 360, `${b.s} on screen`);
    if (b.s !== '[data-hud-top]') assert.ok(b.w >= 44 && b.h >= 44, `${b.s} at least 44 px`);
  }
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i];
      const b = boxes[j];
      const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
      assert.equal(overlap, false, `${a.s} and ${b.s} don't overlap`);
    }
  const tanks = await page.evaluate(() => {
    const c = window.__crumble;
    return c.tanks.map((t) => ({ x: c.view.ox + t.x * c.view.s, y: c.view.oy + (t.y - 40) * c.view.s }));
  });
  for (const t of tanks) assert.ok(t.x > 0 && t.x < 640 && t.y > 0 && t.y < 360, `tank on screen ${JSON.stringify(t)}`);
  // No button covers a tank (Battlefield 2's CPU starts low by the water, under the buttons' row).
  const covered = await page.evaluate(() => {
    const c = window.__crumble;
    const hits = [];
    for (const t of c.tanks) {
      const box = { x: c.view.ox + (t.x - 40) * c.view.s, y: c.view.oy + (t.y - 50) * c.view.s, w: 80 * c.view.s, h: 50 * c.view.s };
      for (const sel of ['[data-weapon="shell"]', '[data-weapon="auger"]', '.shell-back', '[data-mute]', '[data-hud-top]']) {
        const r = document.querySelector(sel).getBoundingClientRect();
        if (box.x < r.right && r.left < box.x + box.w && box.y < r.bottom && r.top < box.y + box.h) hits.push(sel);
      }
    }
    return hits;
  });
  assert.deepEqual(covered, [], 'no HUD box covers a tank');
  await context.close();
});

test('crumble AC-15: a hidden page stops a shell in flight; a tap resumes', async () => {
  const { context, page } = await open();
  await page.evaluate(() => {
    const c = window.__crumble;
    c.store.taught = true;
    c.startBattle(0);
    c.fire(0, 'shell', 1.2, 0.9);
  });
  await page.waitForTimeout(150);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  const x0 = await page.evaluate(() => window.__crumble.game.projectile.x);
  await page.waitForTimeout(400);
  assert.equal(await page.evaluate(() => window.__crumble.game.projectile.x), x0, 'nothing moves');
  assert.equal(await page.isVisible('[data-paused]'), true);
  await page.evaluate(() => Object.defineProperty(document, 'hidden', { value: false, configurable: true }));
  await page.mouse.click(400, 200);
  await page.waitForTimeout(200);
  assert.equal(await page.isVisible('[data-paused]'), false);
  const x1 = await page.evaluate(() => window.__crumble.game.projectile?.x ?? Infinity);
  assert.notEqual(x1, x0, 'moving again');
  await context.close();
});

test('crumble AC-17: Crumble plays offline once it has been played, a shot and its explosion included', async () => {
  const { context, page } = await open();
  await page.evaluate(() => navigator.serviceWorker.register('../sw.js'));
  await page.evaluate(() => Promise.race([navigator.serviceWorker.ready, new Promise((r) => setTimeout(r, 10000))]));
  await page.reload(); // controlled now: this load caches the game's files
  await page.waitForFunction(() => window.__crumble);
  await page.waitForLoadState('networkidle');
  await context.setOffline(true);
  await page.reload();
  await page.waitForFunction(() => window.__crumble);
  await page.click('[data-play]');
  const r = await page.evaluate(async () => {
    const c = window.__crumble;
    c.manual = true;
    const art = await Promise.all(
      ['yellow', 'orange', 'red', 'grey'].map(
        (k) =>
          new Promise((ok) => {
            const i = new Image();
            i.onload = () => ok(i.naturalWidth > 0);
            i.onerror = () => ok(false);
            i.src = `../shared/explosion/${k}.png`;
          })
      )
    );
    const carves = c.terrain.carves;
    c.fire(0, 'shell', 0.5, 0.6);
    for (let i = 0; i < 600 && c.game.phase === 'flight'; i++) c.step(1 / 60);
    return { art, burst: c.terrain.carves > carves, fx: c.fx.count };
  });
  assert.deepEqual(r.art, [true, true, true, true], 'the explosion art is there offline');
  assert.equal(r.burst, true);
  assert.ok(r.fx > 0);
  await context.close();
});

test('crumble AC-18: the keyboard alone plays a turn', async () => {
  const { context, page } = await open();
  await battle(page, 1);
  const a0 = await page.evaluate(() => ({ aim: window.__crumble.tanks[0].aim, power: window.__crumble.tanks[0].power }));
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowUp');
  const a1 = await page.evaluate(() => ({ aim: window.__crumble.tanks[0].aim, power: window.__crumble.tanks[0].power }));
  assert.ok(a1.aim > a0.aim, 'left raises the barrel toward the left');
  assert.ok(a1.power > a0.power);
  await page.keyboard.press('ArrowRight');
  assert.ok((await page.evaluate(() => window.__crumble.tanks[0].aim)) < a1.aim);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('q');
  assert.equal(await page.evaluate(() => window.__crumble.game.weapon), 'auger');
  await page.keyboard.press('Space');
  const r = await page.evaluate(() => ({ shots: window.__crumble.game.shots, weapon: window.__crumble.game.projectile?.weapon, augers: window.__crumble.tanks[0].augers }));
  assert.deepEqual(r, { shots: 1, weapon: 'auger', augers: 1 });
  await context.close();
});

test('crumble AC-19: firing, an explosion and a tide rise each play their sound', async () => {
  const { context, page } = await open({ audio: true });
  const size = (n) => statSync(new URL(`../crumble/sounds/${n}.mp3`, import.meta.url)).size;
  await page.waitForFunction(() => window.__decoded >= 14, null, { timeout: 5000 });
  await page.click('[data-play]'); // the tap unlocks sound
  await page.evaluate(() => {
    const c = window.__crumble;
    c.manual = true;
    window.__played.length = 0;
    c.fire(0, 'shell', 0.6, 0.6);
  });
  const played = () => page.evaluate(() => window.__played.map((p) => p.bytes));
  assert.ok((await played()).includes(size('fire')), 'fire');
  await page.evaluate(() => {
    const c = window.__crumble;
    for (let i = 0; i < 600 && c.game.phase === 'flight'; i++) c.step(1 / 60);
  });
  assert.ok((await played()).includes(size('boom')), 'boom');
  await page.evaluate(() => {
    const c = window.__crumble;
    c.game.shots = 3;
    c.game.phase = 'settle';
    c.game.timer = 1;
    window.__played.length = 0;
    for (let i = 0; i < 60; i++) c.step(1 / 60);
  });
  assert.equal(await page.evaluate(() => window.__crumble.game.phase), 'tide');
  assert.ok((await played()).includes(size('tide')), 'tide');
  await context.close();
});

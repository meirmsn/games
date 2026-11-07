// End-to-end tests for Reef. Run: scripts/check-slow.sh.
// The game exposes window.__reef (state, and a step() that advances the simulation without
// drawing), so these tests can set up a situation and check what the rules do with it.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const PORT = 8900 + Math.floor(Math.random() * 90);
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
  const context = await browser.newContext({ viewport: { width: 1024, height: 700 }, ...opts });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(BASE + 'reef/');
  await page.waitForFunction(() => window.__reef);
  return { context, page, errors };
}

// Start a game with the reef emptied, so a test controls exactly which fish are near the player.
// The test then owns the clock: the page's frames only draw, and step() moves the simulation.
async function startEmpty(page) {
  await page.click('[data-play]');
  await page.evaluate(() => {
    const r = window.__reef;
    r.manual = true;
    r.npcs().length = 0;
    r.game.feastIn = 999;
    r.game.calm = -999;
    r.game.spawnIn = 999;
    r.player.invul = 0;
  });
}

const steps = (page, n) =>
  page.evaluate((n) => {
    for (let i = 0; i < n; i++) window.__reef.step(1 / 60);
  }, n);

// Put a fish of the given size next to the player and run the simulation for a moment.
async function meet(page, species, size, frames = 30) {
  return page.evaluate(
    ({ species, size, frames }) => {
      const r = window.__reef;
      r.game.spawnIn = 999;
      const p = r.player;
      r.npcs().push({
        kind: 'fish', species, size, x: p.x + 4, y: p.y, vx: 0, vy: 0, dir: 1, speed: 0, face: 1, faceT: 1,
        angle: 0, ph: 0, state: 'tired', t: 9, cool: 9, stamina: 0, leader: null, ox: 0, oy: 0, near: false,
        sated: 0, fade: 1, huntT: 0, prey: null,
      });
      for (let i = 0; i < frames; i++) r.step(1 / 60);
      return { score: r.game.score, lives: r.game.lives, xp: r.game.xp, mode: r.game.mode, fish: r.npcs().length };
    },
    { species, size, frames }
  );
}

test('the reef opens on its title card and starts with no errors', async () => {
  const { context, page, errors } = await open();
  assert.equal(await page.locator('[data-screen="title"]').isVisible(), true);
  assert.ok((await page.evaluate(() => window.__reef.npcs().length)) > 5, 'fish are swimming behind the title');
  await page.click('[data-play]');
  assert.equal(await page.locator('[data-screen="title"]').isVisible(), false);
  assert.equal(await page.evaluate(() => window.__reef.game.mode), 'play');
  await page.waitForTimeout(500);
  assert.deepEqual(errors, []);
  await context.close();
});

test('eating a smaller fish scores and grows you', async () => {
  const { context, page } = await open();
  await startEmpty(page);
  const after = await meet(page, 'pink', 22);
  assert.ok(after.score > 0, 'scored');
  assert.ok(after.xp > 0, 'grew');
  assert.equal(after.fish, 0, 'the fish was eaten');
  await context.close();
});

test('a bigger fish costs a life, and the third ends the run', async () => {
  const { context, page } = await open();
  await startEmpty(page);
  let s = await meet(page, 'red', 150, 5);
  assert.equal(s.lives, 2);
  for (let i = 0; i < 2; i++) {
    await page.evaluate(() => {
      window.__reef.npcs().length = 0;
      window.__reef.player.invul = 0;
    });
    s = await meet(page, 'red', 150, 5);
  }
  assert.equal(s.lives, 0);
  assert.equal(s.mode, 'over');
  await page.evaluate(() => {
    for (let i = 0; i < 150; i++) window.__reef.step(1 / 60);
  });
  await page.locator('[data-screen="over"]').waitFor();
  await page.click('[data-again]');
  assert.equal(await page.evaluate(() => window.__reef.game.lives), 3);
  await context.close();
});

test('getting caught makes the next stretch easier', async () => {
  const { context, page } = await open();
  await startEmpty(page);
  const before = await page.evaluate(() => window.__reef.game.assist);
  await meet(page, 'red', 150, 5);
  const after = await page.evaluate(() => window.__reef.game.assist);
  assert.ok(after > before + 0.2, `assist rose from ${before} to ${after}`);
  await context.close();
});

test('growing all the way dives to the next depth with an extra life back', async () => {
  const { context, page } = await open();
  await startEmpty(page);
  await page.evaluate(() => {
    const r = window.__reef;
    r.game.lives = 2;
    r.game.xp = 9.99;
  });
  await meet(page, 'pink', 30, 5);
  assert.equal(await page.evaluate(() => window.__reef.game.mode), 'dive');
  await steps(page, 75); // past the swap to the new depth
  await page.evaluate(() => {
    const r = window.__reef;
    r.npcs().length = 0; // nothing to eat on the way out, so xp stays at its reset value
    r.game.spawnIn = 999;
  });
  await steps(page, 85);
  const s = await page.evaluate(() => ({ mode: window.__reef.game.mode, depth: window.__reef.game.depth, lives: window.__reef.game.lives, xp: window.__reef.game.xp }));
  assert.deepEqual(s, { mode: 'play', depth: 1, lives: 3, xp: 0 });
  await context.close();
});

test('dragging on a touch screen steers the fish', async () => {
  const { context, page } = await open({ hasTouch: true, viewport: { width: 390, height: 844 } });
  await startEmpty(page);
  const start = await page.evaluate(() => window.__reef.player.x);
  const cdp = await context.newCDPSession(page);
  const touch = (type, x, y) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
  await touch('touchStart', 100, 600);
  for (let i = 1; i <= 10; i++) await touch('touchMove', 100 + i * 12, 600);
  await touch('touchEnd', 0, 0);
  await page.evaluate(() => {
    for (let i = 0; i < 60; i++) window.__reef.step(1 / 60);
  });
  const end = await page.evaluate(() => window.__reef.player.x);
  assert.ok(end > start + 60, `moved right from ${start} to ${end}`);
  await context.close();
});

test('the reef works offline once it has been played', async () => {
  const { context, page } = await open();
  await page.evaluate(() => navigator.serviceWorker.register('../sw.js'));
  await page.evaluate(
    () => Promise.race([navigator.serviceWorker.ready, new Promise((r) => setTimeout(r, 10000))])
  );
  await page.reload(); // controlled now: this load caches the game's files
  await page.waitForFunction(() => window.__reef);
  await page.waitForLoadState('networkidle');
  await context.setOffline(true);
  await page.reload();
  await page.waitForFunction(() => window.__reef);
  await page.click('[data-play]');
  assert.equal(await page.evaluate(() => window.__reef.game.mode), 'play');
  await context.close();
});

test('a fish is worth (its size / yours) squared', async () => {
  const { context, page } = await open();
  await startEmpty(page);
  const gain = async (size) => {
    const before = await page.evaluate(() => window.__reef.game.xp);
    const p = await page.evaluate(() => window.__reef.player.size);
    const after = await meet(page, 'pink', size, 3);
    return { gain: after.xp - before, ratio: size / p };
  };
  const small = await gain(20);
  const big = await gain(30);
  assert.ok(Math.abs(small.gain - small.ratio ** 2) < 0.01, `small fish: ${small.gain} vs ${small.ratio ** 2}`);
  assert.ok(Math.abs(big.gain - big.ratio ** 2) < 0.01, `bigger fish: ${big.gain} vs ${big.ratio ** 2}`);
  assert.ok(big.gain > small.gain * 1.8, 'the bigger fish is worth much more');
  await context.close();
});

test('the assist fades while you do well', async () => {
  const { context, page } = await open();
  await startEmpty(page);
  await page.evaluate(() => (window.__reef.game.assist = 0.5));
  await steps(page, 600); // 10 s with no danger
  const a = await page.evaluate(() => window.__reef.game.assist);
  assert.ok(a < 0.47 && a > 0.4, `assist went from 0.5 to ${a}`);
  await context.close();
});

test('an eel warns with bubbles first, then strikes across the reef', async () => {
  const { context, page } = await open();
  await startEmpty(page);
  await page.evaluate(() => {
    const r = window.__reef;
    r.game.depth = 2; // Kelp Forest: eels
    r.game.eelIn = 0;
  });
  await steps(page, 1);
  const warn = await page.evaluate(() => {
    const r = window.__reef;
    const e = r.eels()[0];
    e.y = r.player.y;
    r.game.eelIn = 999;
    return { state: e.state, t: e.t };
  });
  assert.equal(warn.state, 'warn');
  assert.ok(warn.t >= 1.3, `warned ${warn.t} s ahead`);
  await steps(page, 60);
  assert.equal(await page.evaluate(() => window.__reef.game.lives), 3, 'no harm during the warning');
  await steps(page, 180);
  assert.equal(await page.evaluate(() => window.__reef.game.lives), 2, 'the eel caught the fish in its path');
  await context.close();
});

test('a pufferfish puffs up when you come close, and bumps you away', async () => {
  const { context, page } = await open();
  await startEmpty(page);
  const s = await page.evaluate(() => {
    const r = window.__reef;
    const p = r.player;
    const f = r.makePuffer(-1);
    Object.assign(f, { x: p.x + 70, y: p.y, vx: 0, fade: 1 });
    r.npcs().push(f);
    for (let i = 0; i < 20; i++) r.step(1 / 60);
    const puff = f.puff;
    const xp = (r.game.xp = 3);
    f.x = p.x + 10;
    f.y = p.y;
    for (let i = 0; i < 3; i++) r.step(1 / 60);
    return { puff, lives: r.game.lives, stun: p.stun, xpLost: xp - r.game.xp };
  });
  assert.ok(s.puff > 0.9, `puffed ${s.puff}`);
  assert.equal(s.lives, 3, 'a bump is not a lost life');
  assert.ok(s.stun > 0, 'stunned');
  assert.ok(s.xpLost > 0, 'lost some growth');
  await context.close();
});

test('a long calm brings a hunter in', async () => {
  const { context, page } = await open();
  await startEmpty(page);
  await page.evaluate(() => (window.__reef.game.calm = 30));
  await steps(page, 1);
  const hunters = await page.evaluate(() => window.__reef.npcs().filter((n) => n.huntPlayer && window.__reef.isThreat(n)).length);
  assert.equal(hunters, 1);
  await context.close();
});

test('a passing school is a feast of fish you can eat', async () => {
  const { context, page } = await open();
  await startEmpty(page);
  await page.evaluate(() => (window.__reef.game.feastIn = 0));
  await steps(page, 1);
  const school = await page.evaluate(() => window.__reef.npcs().map((n) => window.__reef.isFood(n)));
  assert.ok(school.length >= 8, `${school.length} fish`);
  assert.ok(school.every(Boolean), 'all of them edible');
  await context.close();
});

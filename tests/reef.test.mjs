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
async function startEmpty(page) {
  await page.click('[data-play]');
  await page.evaluate(() => {
    const r = window.__reef;
    r.npcs().length = 0;
    r.game.feastIn = 999;
    r.game.calm = -999;
    r.game.spawnIn = 999;
    r.player.invul = 0;
  });
}

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
  await page.evaluate(() => {
    for (let i = 0; i < 160; i++) window.__reef.step(1 / 60);
  });
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

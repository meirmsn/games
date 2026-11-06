// End-to-end tests for Googly Faces (googly-faces/).
// Run: scripts/check-slow.sh (serves the site and runs these with Playwright's Chromium).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import { FAKE_AUDIO } from './fake-audio.mjs';

const PORT = 8900 + Math.floor(Math.random() * 100);
const BASE = `http://127.0.0.1:${PORT}/`;
const GAME = BASE + 'googly-faces/';
const SOUND_FILES = 23; // the game's 22 and the shell's back sound
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

// Open the game on a phone-sized touch screen, with the stand-in audio unless told otherwise.
async function openGame({ fakeAudio = true, muted = false, url = GAME } = {}) {
  const context = await browser.newContext({
    hasTouch: true,
    isMobile: true,
    viewport: { width: 390, height: 844 },
  });
  if (fakeAudio) await context.addInitScript(FAKE_AUDIO);
  if (muted) await context.addInitScript(() => localStorage.setItem('sound', 'off'));
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(url);
  await page.waitForFunction(() => document.documentElement.dataset.ready === 'true');
  if (fakeAudio) await page.waitForFunction((n) => window.__decoded >= n, SOUND_FILES);
  return { context, page, errors };
}

const state = (page) => page.evaluate(() => window.googly.state);

// Wait for a face that has finished popping up, and return it.
async function readyFace(page) {
  const handle = await page.waitForFunction(() =>
    window.googly.state.faces.find((f) => f.phase === 'idle')
  );
  return handle.jsonValue();
}

test('the game loads with no errors and a face pops up', async () => {
  const { context, page, errors } = await openGame({ fakeAudio: false });
  const face = await readyFace(page);
  assert.ok(face.size >= 96, `faces are big tap targets (${face.size} px)`);
  const box = await page.locator('.gf-stage').boundingBox();
  assert.deepEqual([box.width, box.height], [390, 844], 'the canvas fills the screen');
  await page.waitForLoadState('networkidle');
  assert.deepEqual(errors, []);
  await context.close();
});

test('the pupils fall to the bottom of the eyes and stay inside them', async () => {
  const { context, page } = await openGame({ fakeAudio: false });
  await readyFace(page);
  await page.waitForTimeout(1500);
  const { faces } = await state(page);
  for (const f of faces) {
    for (const p of f.pupils) {
      assert.ok(Math.hypot(p.x, p.y) <= 0.4, 'inside the eye');
      assert.ok(p.y > 0.15, `rolled down under gravity (y = ${p.y.toFixed(2)})`);
    }
  }
  await context.close();
});

test('tapping a face plays a sound and makes it react', async () => {
  const { context, page } = await openGame();
  const face = await readyFace(page);
  const before = face.pupils.map((p) => ({ ...p }));
  await page.touchscreen.tap(face.x, face.y);

  const played = await page.evaluate(() => window.__played);
  assert.ok(played.length >= 1, 'a sound plays');
  assert.equal(played[0].state, 'running', 'the tap unlocked audio');
  assert.notEqual(played[0].rate, 1, 'the pitch is varied');

  await page.waitForTimeout(120);
  let now = (await state(page)).faces.find((f) => f.id === face.id);
  assert.equal(now.phase, 'react');
  assert.equal(now.mouth, 'o', 'its mouth opens');
  assert.ok(now.hop > 10, 'it jumps');
  const moved = now.pupils.some((p, i) => Math.hypot(p.x - before[i].x, p.y - before[i].y) > 0.05);
  assert.ok(moved, 'its pupils move');
  assert.equal((await state(page)).taps, 1, 'it counts');

  // A second tap on the same face plays again but doesn't count twice.
  const count = played.length;
  await page.touchscreen.tap(face.x, now.y);
  assert.ok((await page.evaluate(() => window.__played.length)) > count);
  assert.equal((await state(page)).taps, 1);

  // Then it lands with a new expression and ducks away.
  await page.waitForFunction(
    (id) => !window.googly.state.faces.some((f) => f.id === id && f.phase !== 'out'),
    face.id,
    { timeout: 5000 }
  );
  await context.close();
});

test('mute is respected, and the sound button changes it for the whole site', async () => {
  const { context, page } = await openGame({ muted: true });
  const btn = page.locator('[data-sound-toggle]');
  assert.equal(await btn.getAttribute('aria-pressed'), 'true');
  const face = await readyFace(page);
  await page.touchscreen.tap(face.x, face.y);
  await page.waitForTimeout(300);
  assert.equal((await page.evaluate(() => window.__played)).length, 0, 'nothing plays while muted');

  await btn.tap(); // unmute
  assert.equal(await btn.getAttribute('aria-pressed'), 'false');
  assert.ok((await page.evaluate(() => window.__played)).length >= 1, 'unmuting plays again');
  assert.equal(await page.evaluate(() => localStorage.getItem('sound')), null, 'saved for the site');
  await context.close();
});

test('tapping empty space is answered too', async () => {
  const { context, page } = await openGame();
  await readyFace(page);
  const { faces } = await state(page);
  const f = faces[0];
  const x = f.x < 195 ? 340 : 50;
  const y = f.y < 422 ? 760 : 200;
  await page.touchscreen.tap(x, y);
  assert.equal((await page.evaluate(() => window.__played)).length, 1);
  assert.equal((await state(page)).taps, 0);
  await context.close();
});

test('a round ends after twelve faces, and play again starts a new one', async () => {
  const { context, page } = await openGame();
  for (let tries = 0; tries < 40 && (await state(page)).taps < 12; tries++) {
    const f = await readyFace(page);
    await page.touchscreen.tap(f.x, f.y);
  }
  assert.equal((await state(page)).taps, 12);
  const again = page.locator('[data-play-again]');
  await again.waitFor({ state: 'visible', timeout: 5000 });
  const box = await again.boundingBox();
  assert.ok(box.width >= 44 && box.height >= 44, 'play again is a big button');
  assert.equal((await state(page)).state, 'party');
  await again.tap();
  const s = await state(page);
  assert.equal(s.state, 'play');
  assert.equal(s.taps, 0);
  assert.equal(s.round, 2);
  await again.waitFor({ state: 'hidden' });
  await context.close();
});

test("the game's back button returns to the landing page", async () => {
  const { context, page } = await openGame({ fakeAudio: false });
  const back = page.locator('.shell-back');
  await back.tap();
  await page.waitForURL(BASE);
  await context.close();
});

test('the landing tile opens the game', async () => {
  const context = await browser.newContext({ hasTouch: true });
  const page = await context.newPage();
  await page.goto(BASE);
  const tile = page.locator('a.tile[href="googly-faces/"]');
  assert.equal(await tile.locator('h2').textContent(), 'Googly Faces');
  assert.equal(await tile.locator('.badge').count(), 0, 'no "Coming soon" badge');
  await tile.click();
  await page.waitForURL(GAME);
  await page.waitForFunction(() => document.documentElement.dataset.ready === 'true');
  await context.close();
});

// Wait until the service worker's cache holds a URL, or fail after 10 s instead of hanging.
const cached = (page, url) =>
  page.waitForFunction(async (u) => !!(await caches.match(u)), url, { timeout: 10000 });

test('it works offline after one visit straight from a link', async () => {
  const { context, page } = await openGame({ fakeAudio: false });
  await cached(page, GAME);
  await cached(page, GAME + 'sounds/giggle-3.mp3');
  await cached(page, GAME + 'art/eye-pupil.png');
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 10000 });
  await context.setOffline(true);
  await page.reload();
  await page.waitForFunction(() => document.documentElement.dataset.ready === 'true');
  const face = await readyFace(page);
  await page.touchscreen.tap(face.x, face.y);
  assert.equal((await state(page)).taps, 1);
  const art = await page.evaluate(async () => !!(await caches.match('art/red_body_square.png')));
  assert.ok(art, 'every face is cached, not only the ones seen');
  await context.close();
});

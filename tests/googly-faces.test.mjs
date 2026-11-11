// End-to-end tests for Googly Faces (googly-faces/).
// Run: scripts/check-slow.sh (serves the site and runs these with Playwright's Chromium).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { serve } from './serve.mjs';
import { chromium } from 'playwright';
import { FAKE_AUDIO } from './fake-audio.mjs';

let BASE; // set in before(), from tests/serve.mjs
let GAME;
const SOUND_FILES = 23; // the game's 22 and the shell's back sound
let server;
let browser;

before(async () => {
  server = await serve();
  BASE = server.base;
  GAME = BASE + 'googly-faces/';
  browser = await chromium.launch();
});

after(async () => {
  await browser?.close();
  server?.close();
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

// Every few seconds each face hops or wobbles on its own, and the pupils fly up for a moment, as
// they should. So rather than one look at one instant: wait (up to 4 s) for a moment when every
// face on the ground has its pupils down, checking at every look that no pupil leaves its eye.
async function pupilsRestAtBottom(page) {
  let last = '';
  for (let i = 0; i < 80; i++) {
    const { faces } = await state(page);
    for (const f of faces) for (const p of f.pupils) assert.ok(Math.hypot(p.x, p.y) <= 0.4, 'inside the eye');
    const ground = faces.filter((f) => f.phase === 'idle' && f.hop < 0.5);
    const ys = ground.flatMap((f) => f.pupils.map((p) => p.y));
    if (ys.length && ys.every((y) => y > 0.15)) return;
    last = ys.map((y) => y.toFixed(2)).join(', ');
    await page.waitForTimeout(50);
  }
  assert.fail(`the pupils never all rested at the bottom (last y: ${last})`);
}

test('the pupils fall to the bottom of the eyes and stay inside them', async () => {
  const { context, page } = await openGame({ fakeAudio: false });
  await readyFace(page);
  await page.waitForTimeout(1500);
  await pupilsRestAtBottom(page);
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

// Every pupil looks towards a point: the median of six reads, since a face's own hop can tug its
// pupils for an instant.
async function eyesLookAt(page, x, y, what) {
  const along = {};
  for (let i = 0; i < 6; i++) {
    for (const o of (await state(page)).faces.filter((g) => g.phase !== 'out')) {
      const d = Math.hypot(x - o.x, y - o.y);
      o.pupils.forEach((p, k) => (along[`${o.id}.${k}`] ??= []).push((p.x * (x - o.x) + p.y * (y - o.y)) / d));
    }
    await page.waitForTimeout(30);
  }
  for (const [eye, v] of Object.entries(along)) {
    const m = v.sort((a, b) => a - b)[Math.floor(v.length / 2)];
    assert.ok(m > 0.25, `pupil ${eye} looks at ${what} (${m.toFixed(2)} eye radii towards it)`);
  }
}

test('tapping empty space is answered too, and the eyes follow the pointer for a moment', async () => {
  const { context, page } = await openGame();
  await readyFace(page);
  const { faces } = await state(page);
  const f = faces[0];
  // Up in the sky, on the other side from the face: the eyes have to look up, against gravity.
  const x = f.x < 195 ? 340 : 50;
  const y = 110;
  await page.touchscreen.tap(x, y);
  assert.equal((await page.evaluate(() => window.__played)).length, 1);
  assert.equal((await state(page)).taps, 0);

  // Every eye looks at the spot...
  await page.waitForTimeout(300);
  await eyesLookAt(page, x, y, 'the tap');
  // ...and follows the pointer as it moves, here level with the face on its far side...
  const x2 = f.x < 195 ? 5 : 385;
  await page.mouse.move(x2, f.y);
  await page.waitForTimeout(300);
  await eyesLookAt(page, x2, f.y, 'the pointer');
  // ...then, a couple of seconds after the tap, rolls loose again, back to the bottom.
  await page.waitForTimeout(1200);
  await pupilsRestAtBottom(page);
  await context.close();
});

test('the dot a tap fills swells, pushing the others aside, then settles', async () => {
  const { context, page } = await openGame({ fakeAudio: false });
  const { pips: rest } = await state(page);
  const face = await readyFace(page);
  await page.touchscreen.tap(face.x, face.y);
  let biggest = 0;
  let pushed = 0;
  for (let i = 0; i < 20; i++) {
    const { pips } = await state(page);
    biggest = Math.max(biggest, pips[0].r / rest[0].r);
    pushed = Math.max(pushed, pips[1].x - rest[1].x);
    await page.waitForTimeout(25);
  }
  assert.ok(biggest > 1.8, `the new dot swells (${biggest.toFixed(2)}x)`);
  assert.ok(pushed > 4, `its neighbour moves aside (${pushed.toFixed(1)} px)`);
  await page.waitForTimeout(1200);
  const { pips } = await state(page);
  assert.ok(pips[0].filled && Math.abs(pips[0].r - rest[0].r) < 0.5, 'then it settles back to size');
  assert.ok(Math.abs(pips[1].x - rest[1].x) < 0.5, 'and the row closes up');
  // The row stays clear of the back and sound buttons.
  const back = await page.locator('.shell-back').boundingBox();
  const snd = await page.locator('[data-sound-toggle]').boundingBox();
  assert.ok(rest[0].x - rest[0].r > back.x + back.width && rest[11].x + rest[11].r < snd.x);
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
  // it scales in from 40%: measure it once its entrance has finished, not part-way through
  await again.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
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
  await page.locator('[data-shell-leave]').tap(); // the shell asks before leaving
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
// (Not waitForFunction: it takes the promise an async predicate returns as true at once.)
async function cached(page, url) {
  const found = await page.evaluate(async (u) => {
    for (let i = 0; i < 100; i++) {
      if (await caches.match(u)) return true;
      await new Promise((r) => setTimeout(r, 100));
    }
    return false;
  }, url);
  assert.ok(found, `${url} is cached`);
}

test('it works offline after one visit straight from a link', async () => {
  const { context, page } = await openGame({ fakeAudio: false });
  await cached(page, GAME);
  await cached(page, GAME + 'sounds/giggle-3.mp3');
  await cached(page, GAME + 'art/eye-pupil.png');
  await cached(page, GAME + 'art/yellow_body_rhombus.png'); // the last body the game loads
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

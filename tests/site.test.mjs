// End-to-end tests for the landing page, the PWA and the shared game shell.
// Run: scripts/check-slow.sh (serves the site and runs these with Playwright's Chromium).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { serve } from './serve.mjs';
import { launch } from './clock.mjs';
import { FAKE_AUDIO } from './fake-audio.mjs';

let BASE; // set in before(), from tests/serve.mjs
let server;
let browser;

before(async () => {
  server = await serve();
  BASE = server.base;
  browser = await launch();
});

after(async () => {
  await browser?.close();
  server?.close();
});

// Wait for the service worker to control the page, or fail after 10 s instead of hanging.
const swReady = (page) =>
  page.evaluate(
    () =>
      Promise.race([
        navigator.serviceWorker.ready.then(() => true),
        new Promise((r) => setTimeout(() => r(false), 10000)),
      ])
  );

async function open(path = '', opts = {}) {
  const context = await browser.newContext({ hasTouch: true, ...opts });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(BASE + path);
  return { context, page, errors };
}

test('reef AC-11: landing page lists nine games, Reef first and playable, with no errors', async () => {
  const { context, page, errors } = await open();
  assert.equal(await page.locator('.tiles > li').count(), 9);
  assert.equal(await page.locator('.tile h2').first().textContent(), 'Reef');
  const reef = page.locator('.tiles > li').first().locator('.tile');
  assert.equal(await reef.evaluate((el) => el.tagName), 'A', 'the Reef tile is a link');
  assert.equal(await reef.getAttribute('href'), 'reef/');
  assert.equal(await reef.evaluate((el) => el.classList.contains('is-soon')), false, 'not a coming-soon tile');
  await page.waitForLoadState('networkidle');
  assert.deepEqual(errors, []);
  await context.close();
});

test('splat-gallery AC-20: the Splat Gallery tile is playable and opens the game', async () => {
  const { context, page, errors } = await open();
  const tile = page.locator('.tile', { has: page.locator('h2', { hasText: 'Splat Gallery' }) });
  assert.equal(await tile.evaluate((el) => el.tagName), 'A', 'the tile is a link');
  assert.equal(await tile.getAttribute('href'), 'splat-gallery/');
  assert.equal(await tile.locator('.badge').count(), 0, 'no coming-soon badge');
  await tile.click();
  await page.waitForURL(/splat-gallery\/$/);
  await page.waitForFunction(() => window.__gallery);
  assert.deepEqual(errors, []);
  await context.close();
});

test('walk-on-red AC-21: the landing page shows nine tiles, Gotta Go! playable after Googly Faces', async () => {
  const { context, page, errors } = await open();
  assert.equal(await page.locator('.tiles > li').count(), 9);
  const names = await page.locator('.tile h2').allTextContents();
  assert.equal(names.indexOf('Gotta Go!'), names.indexOf('Googly Faces') + 1);
  const tile = page.locator('.tile', { hasText: 'Gotta Go!' });
  assert.equal(await tile.evaluate((el) => el.tagName), 'A', 'a link');
  assert.equal(await tile.getAttribute('href'), 'walk-on-red/');
  assert.equal(await tile.evaluate((el) => el.classList.contains('is-soon')), false);
  const img = tile.locator('img');
  await page.waitForLoadState('networkidle');
  assert.ok(await img.evaluate((el) => el.complete && el.naturalWidth === 640));
  assert.deepEqual(errors, []);
  await context.close();
});

test('runes AC-17: the Runes tile is a playable link, and the page lists nine tiles (Gotta Go! and Crumble add one each)', async () => {
  const { context, page } = await open();
  assert.equal(await page.locator('.tiles > li').count(), 9);
  const runes = page.locator('.tile', { has: page.locator('h2', { hasText: 'Runes' }) });
  assert.equal(await runes.evaluate((el) => el.tagName), 'A');
  assert.equal(await runes.getAttribute('href'), 'runes/');
  assert.equal(await runes.evaluate((el) => el.classList.contains('is-soon')), false);
  assert.equal(await runes.locator('.badge').count(), 0, 'no coming-soon badge');
  assert.doesNotMatch((await runes.getAttribute('aria-label')) || '', /coming soon/i);
  await context.close();
});

test('orbit AC-16: the Orbit tile is a playable link, and the page shows nine tiles (Gotta Go! and Crumble add one each)', async () => {
  const { context, page } = await open();
  assert.equal(await page.locator('.tiles > li').count(), 9);
  const orbit = page.locator('.tile', { has: page.locator('h2', { hasText: /^Orbit$/ }) });
  assert.equal(await orbit.evaluate((el) => el.tagName), 'A');
  assert.equal(await orbit.getAttribute('href'), 'orbit/');
  assert.equal(await orbit.evaluate((el) => el.classList.contains('is-soon')), false);
  assert.equal(await orbit.locator('.badge').count(), 0);
  await context.close();
});

test('pixel-leap AC-20: the Pixel Leap tile is playable and opens pixel-leap/', async () => {
  const { context, page } = await open();
  const tile = page.locator('.tile', { has: page.locator('h2', { hasText: 'Pixel Leap' }) });
  assert.equal(await tile.evaluate((el) => el.tagName), 'A');
  assert.equal(await tile.getAttribute('href'), 'pixel-leap/');
  assert.equal(await tile.evaluate((el) => el.classList.contains('is-soon')), false);
  await tile.click();
  await page.waitForURL(/pixel-leap\/(#.*)?$/);
  await page.waitForFunction(() => window.__leap);
  await context.close();
});

test('a coming-soon tile nudges and does not navigate', async () => {
  const { context, page } = await open();
  const tile = page.locator('.tile.is-soon').first();
  await tile.click();
  assert.ok(await tile.evaluate((el) => el.classList.contains('nudge')));
  assert.equal(page.url(), BASE);
  await context.close();
});

test('the sound toggle mutes and is remembered', async () => {
  const { context, page } = await open();
  const btn = page.locator('[data-sound-toggle]');
  assert.equal(await btn.getAttribute('aria-pressed'), 'false');
  await btn.click();
  assert.equal(await btn.getAttribute('aria-pressed'), 'true');
  await page.reload();
  assert.equal(await page.locator('[data-sound-toggle]').getAttribute('aria-pressed'), 'true');
  await context.close();
});

test('the theme toggle cycles system, light, dark and is remembered', async () => {
  const { context, page } = await open();
  const btn = page.locator('[data-theme-toggle]');
  const theme = () => page.evaluate(() => document.documentElement.getAttribute('data-theme'));
  assert.equal(await theme(), null);
  await btn.click();
  assert.equal(await theme(), 'light');
  await btn.click();
  assert.equal(await theme(), 'dark');
  await page.reload();
  assert.equal(await theme(), 'dark');
  await page.locator('[data-theme-toggle]').click();
  assert.equal(await theme(), null);
  await context.close();
});

test('the manifest is valid and its icons load', async () => {
  const res = await fetch(BASE + 'manifest.webmanifest');
  const m = await res.json();
  assert.equal(m.display, 'standalone');
  assert.ok(m.icons.some((i) => i.sizes === '512x512' && i.purpose === 'maskable'));
  for (const icon of m.icons) assert.ok((await fetch(BASE + icon.src)).ok, icon.src);
});

test('crumble AC-16: the landing page shows 9 tiles, with Crumble playable after Splat Gallery', async () => {
  const { context, page, errors } = await open();
  assert.equal(await page.locator('.tiles > li').count(), 9);
  const names = await page.locator('.tile h2').allTextContents();
  assert.equal(names.indexOf('Crumble'), names.indexOf('Splat Gallery') + 1);
  const tile = page.locator('.tile', { has: page.locator('h2', { hasText: 'Crumble' }) });
  assert.equal(await tile.evaluate((el) => el.tagName), 'A');
  assert.equal(await tile.getAttribute('href'), 'crumble/');
  assert.equal(await tile.evaluate((el) => el.classList.contains('is-soon')), false);
  await page.waitForLoadState('networkidle');
  assert.ok(await tile.locator('img').evaluate((img) => img.complete && img.naturalWidth > 0));
  assert.deepEqual(errors, []);
  await context.close();
});

test('works offline once loaded', async () => {
  const { context, page } = await open();
  assert.ok(await swReady(page), 'service worker registered');
  await page.reload(); // now controlled by the service worker
  assert.ok(await page.evaluate(() => !!navigator.serviceWorker.controller), 'page is controlled');
  await context.setOffline(true);
  await page.reload();
  assert.equal(await page.locator('.tiles > li').count(), 9);
  const tileArt = page.locator('.tile img').first();
  assert.ok(await tileArt.evaluate((img) => img.complete && img.naturalWidth > 0));
  await context.close();
});

test("the game shell's back button returns to the landing page", async () => {
  const { context, page, errors } = await open('tests/fixtures/game/');
  const back = page.locator('.shell-back');
  await back.waitFor();
  const box = await back.boundingBox();
  assert.ok(box.width >= 44 && box.height >= 44, 'back button is at least 44 px');
  assert.equal(await back.getAttribute('href'), BASE);
  await back.click();
  // It asks first: leaving loses the game's progress.
  const ask = page.locator('dialog.shell-leave');
  await ask.waitFor({ state: 'visible' });
  assert.match(await ask.textContent(), /Leave this level\?/);
  assert.match(await ask.textContent(), /Your progress on this level will be lost\./);
  await page.locator('[data-shell-leave]').click();
  await page.waitForURL(BASE);
  assert.deepEqual(errors, []);
  await context.close();
});

test('runes AC-24: before leaving any game, the shell always asks "Leave this level?"; Stay keeps you there, Leave goes back', async () => {
  const { context, page } = await open('tests/fixtures/game/');
  const ask = page.locator('dialog.shell-leave');
  await page.locator('.shell-back').click();
  await ask.waitFor({ state: 'visible' });
  await page.locator('[data-shell-stay]').click();
  await ask.waitFor({ state: 'hidden' });
  assert.equal(page.url(), BASE + 'tests/fixtures/game/', 'Stay keeps you in the game');
  // Escape asks too, and a second Escape stays.
  await page.keyboard.press('Escape');
  await ask.waitFor({ state: 'visible' });
  await page.keyboard.press('Escape');
  await ask.waitFor({ state: 'hidden' });
  await page.waitForTimeout(200);
  assert.equal(page.url(), BASE + 'tests/fixtures/game/');
  // It asks every time, even straight after opening the game.
  await page.reload();
  await page.locator('.shell-back').click();
  await ask.waitFor({ state: 'visible' });
  await page.locator('[data-shell-leave]').click();
  await page.waitForURL(BASE);
  await context.close();
});

test('Escape in a game goes back to the landing page, after asking', async () => {
  const { context, page } = await open('tests/fixtures/game/');
  await page.locator('.shell-back').waitFor();
  await page.keyboard.press('Escape');
  await page.locator('[data-shell-leave]').click();
  await page.waitForURL(BASE);
  await context.close();
});

async function openWithFakeAudio(path = '') {
  const context = await browser.newContext({ hasTouch: true });
  await context.addInitScript(FAKE_AUDIO);
  const page = await context.newPage();
  await page.goto(BASE + path);
  await page.waitForFunction((n) => window.__decoded >= n, 3); // tap, soon and toggle
  return { context, page };
}

test("the very first tap's sound plays, and mute silences it", async () => {
  const { context, page } = await openWithFakeAudio();
  await page.locator('.tile.is-soon').first().click();
  let played = await page.evaluate(() => window.__played);
  assert.equal(played.length, 1, 'first tap plays a sound');
  assert.equal(played[0].state, 'running', 'audio was unlocked by that tap');

  await page.locator('[data-sound-toggle]').click(); // mute (its own sound is muted too)
  // The same tile again: since Splat Gallery went live, High Seas is the only coming-soon tile.
  await page.locator('.tile.is-soon').first().click();
  played = await page.evaluate(() => window.__played);
  assert.equal(played.length, 1, 'nothing plays while muted');

  await page.locator('[data-sound-toggle]').click(); // unmute plays the toggle sound
  played = await page.evaluate(() => window.__played);
  assert.equal(played.length, 2, 'unmuting plays again');
  await context.close();
});

test('the Install button appears when the browser offers install, and hides after', async () => {
  const context = await browser.newContext({ hasTouch: true });
  // Hold back Chromium's own install offer so the test controls when one arrives.
  await context.addInitScript(() => {
    window.addEventListener(
      'beforeinstallprompt',
      (e) => {
        if (e.isTrusted) e.stopImmediatePropagation();
      },
      true
    );
  });
  const page = await context.newPage();
  await page.goto(BASE);
  await page.waitForLoadState('networkidle');
  const btn = page.locator('[data-install]');
  assert.equal(await btn.isVisible(), false);
  await page.evaluate(() => {
    const e = new Event('beforeinstallprompt', { cancelable: true });
    e.prompt = () => {
      window.__prompted = true;
    };
    e.userChoice = Promise.resolve({ outcome: 'accepted' });
    window.dispatchEvent(e);
  });
  assert.equal(await btn.isVisible(), true);
  await btn.click();
  assert.equal(await page.evaluate(() => window.__prompted), true);
  await btn.waitFor({ state: 'hidden' });
  await context.close();
});

test('a playable tile plays its sound and opens its game', async () => {
  const context = await browser.newContext({ hasTouch: true });
  await context.addInitScript(FAKE_AUDIO);
  const page = await context.newPage();
  // Serve the landing page with its first coming-soon tile made playable, pointing at the test game.
  await page.route(BASE, async (route) => {
    const res = await route.fetch();
    const html = (await res.text()).replace(
      /<article class="tile is-soon ([^"]*)"([^>]*)>([\s\S]*?)<\/article>/,
      '<a class="tile $1" href="tests/fixtures/game/">$3</a>'
    );
    await route.fulfill({ response: res, body: html });
  });
  await page.goto(BASE);
  await page.waitForFunction(() => window.__decoded >= 3);
  await page.locator('a.tile[href="tests/fixtures/game/"]').click();
  await page.waitForURL(BASE + 'tests/fixtures/game/');
  await context.close();
});

test('a game works offline once it has been played', async () => {
  const { context, page } = await open();
  assert.ok(await swReady(page), 'service worker registered');
  await page.goto(BASE + 'tests/fixtures/game/'); // first visit, online: cached on the way
  await page.locator('.shell-back').waitFor();
  await page.waitForLoadState('networkidle');
  await context.setOffline(true);
  await page.reload();
  await page.locator('.shell-back').waitFor({ timeout: 5000 });
  assert.equal(await page.title(), 'Shell test game');
  await context.close();
});

test('a game can keep Escape for itself', async () => {
  const { context, page } = await open('tests/fixtures/game/');
  await page.locator('.shell-back').waitFor();
  await page.evaluate(() =>
    window.addEventListener('keydown', (e) => e.key === 'Escape' && e.preventDefault(), {
      capture: true,
    })
  );
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  assert.equal(page.url(), BASE + 'tests/fixtures/game/');
  await context.close();
});

test('Escape in a text field does not leave the game', async () => {
  const { context, page } = await open('tests/fixtures/game/');
  await page.locator('.shell-back').waitFor();
  await page.evaluate(() => {
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
  });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  assert.equal(page.url(), BASE + 'tests/fixtures/game/');
  await context.close();
});

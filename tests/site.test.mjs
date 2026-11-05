// End-to-end tests for the landing page, the PWA and the shared game shell.
// Run: scripts/check-slow.sh (serves the site and runs these with Playwright's Chromium).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const PORT = 8790 + Math.floor(Math.random() * 100);
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

test('landing page lists six games with no errors', async () => {
  const { context, page, errors } = await open();
  assert.equal(await page.locator('.tiles > li').count(), 6);
  assert.equal(await page.locator('.tile h2').first().textContent(), 'Googly Faces');
  await page.waitForLoadState('networkidle');
  assert.deepEqual(errors, []);
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

test('works offline once loaded', async () => {
  const { context, page } = await open();
  assert.ok(await swReady(page), 'service worker registered');
  await page.reload(); // now controlled by the service worker
  assert.ok(await page.evaluate(() => !!navigator.serviceWorker.controller), 'page is controlled');
  await context.setOffline(true);
  await page.reload();
  assert.equal(await page.locator('.tiles > li').count(), 6);
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
  await page.waitForURL(BASE);
  assert.deepEqual(errors, []);
  await context.close();
});

test('Escape in a game goes back to the landing page', async () => {
  const { context, page } = await open('tests/fixtures/game/');
  await page.locator('.shell-back').waitFor();
  await page.keyboard.press('Escape');
  await page.waitForURL(BASE);
  await context.close();
});

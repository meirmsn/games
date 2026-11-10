// End-to-end tests for specs/pwa-updates.md: the Update button, games never reloaded, matching
// versions, per-game caches, the upgrade from the old worker and offline play.
//
// Each test builds its own copy of the site in a temp folder (the real landing page, sw.js and
// shared files, plus two small games, alpha/ and beta/), serves it with Cache-Control: no-cache, and
// "deploys" a new version by rewriting files there.
// Run: scripts/check-slow.sh (Playwright's Chromium).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { cpSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, extname, normalize } from 'node:path';
import { chromium } from 'playwright';

const ROOT = new URL('..', import.meta.url).pathname;
const TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.mp3': 'audio/mpeg',
};
let browser;

before(async () => {
  browser = await chromium.launch();
});
after(async () => {
  await browser?.close();
});

// A game: its page and script each carry a version mark; a stylesheet, a picture and a sound.
function writeGame(dir, slug, mark) {
  mkdirSync(join(dir, slug, 'sounds'), { recursive: true });
  writeFileSync(
    join(dir, slug, 'index.html'),
    `<!doctype html>
<html lang="en" data-mark="${mark}">
  <head>
    <meta charset="utf-8" />
    <title>${slug}</title>
    <link rel="stylesheet" href="../shared/game-shell.css" />
    <link rel="stylesheet" href="game.css" />
    <script type="module" src="game.js"></script>
  </head>
  <body><img src="art.png" alt="" /></body>
</html>
`
  );
  writeFileSync(
    join(dir, slug, 'game.js'),
    `import { mountShell } from '../shared/game-shell.js';
mountShell();
document.documentElement.dataset.scriptMark = '${mark}';
window.__alive = true;
fetch('sounds/hit.mp3').then((r) => r.arrayBuffer()).then((b) => { window.__soundBytes = b.byteLength; });
`
  );
  writeFileSync(join(dir, slug, 'game.css'), `html { --mark: '${mark}'; }\n`);
  copyFileSync(join(ROOT, 'assets/tiles/reef.png'), join(dir, slug, 'art.png'));
  copyFileSync(join(ROOT, 'assets/sounds/tap.mp3'), join(dir, slug, 'sounds/hit.mp3'));
}

// The landing page's page and script carry a version mark too.
function markLanding(dir, mark) {
  const page = readFileSync(join(ROOT, 'index.html'), 'utf8');
  writeFileSync(join(dir, 'index.html'), page.replace('<html lang="en">', `<html lang="en" data-mark="${mark}">`));
  const script = readFileSync(join(ROOT, 'assets/site.js'), 'utf8');
  writeFileSync(join(dir, 'assets/site.js'), `${script}\ndocument.documentElement.dataset.scriptMark = '${mark}';\n`);
}

function setVersion(dir, version) {
  const sw = readFileSync(join(ROOT, 'sw.js'), 'utf8');
  assert.match(sw, /^const VERSION = '[^']+';$/m);
  writeFileSync(join(dir, 'sw.js'), sw.replace(/^const VERSION = '[^']+';$/m, `const VERSION = '${version}';`));
}

async function site({ legacy = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'pwa-updates-'));
  for (const f of ['manifest.webmanifest', 'assets', 'shared']) cpSync(join(ROOT, f), join(dir, f), { recursive: true });
  markLanding(dir, '1');
  if (legacy) copyFileSync(join(ROOT, 'tests/fixtures/sw-v5.js'), join(dir, 'sw.js'));
  else setVersion(dir, 'test-1');
  writeGame(dir, 'alpha', '1');
  writeGame(dir, 'beta', '1');
  const server = http.createServer((req, res) => {
    let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (path.endsWith('/')) path += 'index.html';
    const file = normalize(join(dir, path));
    if (!file.startsWith(dir)) return res.writeHead(403).end();
    try {
      const body = readFileSync(file);
      res.writeHead(200, {
        'Content-Type': TYPES[extname(file)] || 'application/octet-stream',
        'Cache-Control': 'no-cache',
      });
      res.end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/`;
  const context = await browser.newContext({ hasTouch: true });
  return {
    dir,
    base,
    context,
    async page(path = '') {
      const page = await context.newPage();
      await page.goto(base + path);
      return page;
    },
    async close() {
      await context.close();
      server.close();
    },
  };
}

// Wait for a service worker to control the page (reloading once if needed), or fail in 10 s.
async function controlled(page) {
  const ok = await page.evaluate(() =>
    Promise.race([navigator.serviceWorker.ready.then(() => true), new Promise((r) => setTimeout(() => r(false), 10000))])
  );
  assert.ok(ok, 'service worker registered');
  if (!(await page.evaluate(() => !!navigator.serviceWorker.controller))) await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 10000 });
}

// Poll in the page until fn (a page function) is true, or fail after 10 s.
async function until(page, fn, arg, what) {
  const ok = await page.evaluate(
    async ({ src, arg }) => {
      const f = eval(src);
      for (let i = 0; i < 100; i++) {
        if (await f(arg)) return true;
        await new Promise((r) => setTimeout(r, 100));
      }
      return false;
    },
    { src: fn.toString(), arg }
  );
  assert.ok(ok, what);
}

const marks = (page) =>
  page.evaluate(() => ({ page: document.documentElement.dataset.mark, script: document.documentElement.dataset.scriptMark }));
const notice = (page) => page.locator('[data-update]');

async function played(page) {
  await page.waitForFunction(() => window.__alive && window.__soundBytes > 0, null, { timeout: 10000 });
}

// Deploy a new version: bump VERSION, and remark the landing page and the listed games.
function deploy(s, mark, games = []) {
  setVersion(s.dir, `test-${mark}`);
  markLanding(s.dir, mark);
  for (const g of games) writeGame(s.dir, g, mark);
}

test('pwa-updates AC-1: no notice on a first visit or without a newer version; it shows on the next load once one is deployed', async () => {
  const s = await site();
  const page = await s.page();
  await controlled(page);
  await page.waitForTimeout(500);
  assert.equal(await notice(page).isVisible(), false, 'first visit, then controlled: no notice');
  await page.reload();
  await page.waitForTimeout(500);
  assert.equal(await notice(page).isVisible(), false, 'no newer version: no notice');
  deploy(s, '2');
  await page.reload();
  await notice(page).waitFor({ state: 'visible', timeout: 10000 });
  assert.equal(await notice(page).locator('p').textContent(), 'New version available');
  const box = await notice(page).getByRole('button', { name: 'Update' }).boundingBox();
  assert.ok(box.width >= 44 && box.height >= 44, `Update is at least 44 px (${box.width}×${box.height})`);
  await s.close();
});

test('pwa-updates AC-1: an open landing page finds a new version when it becomes visible again, without a reload', async () => {
  const s = await site();
  const page = await s.page();
  await controlled(page);
  deploy(s, '2');
  let navigations = 0;
  page.on('framenavigated', (f) => f === page.mainFrame() && navigations++);
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await notice(page).waitFor({ state: 'visible', timeout: 10000 });
  assert.equal(navigations, 0, 'not reloaded');
  await s.close();
});

test('pwa-updates AC-2 / pwa-updates AC-4: Update reloads the landing page once into the new version; page and script always match', async () => {
  const s = await site();
  const page = await s.page();
  await controlled(page);
  assert.deepEqual(await marks(page), { page: '1', script: '1' });
  deploy(s, '2');
  await page.reload();
  // Before Update: the old worker still serves the page, and page and script are both the new ones.
  assert.deepEqual(await marks(page), { page: '2', script: '2' }, 'first load after the deploy');
  await notice(page).waitFor({ state: 'visible', timeout: 10000 });
  let navigations = 0;
  page.on('framenavigated', (f) => f === page.mainFrame() && navigations++);
  await notice(page).getByRole('button', { name: 'Update' }).click();
  await page.waitForFunction(() => document.readyState === 'complete' && navigator.serviceWorker.controller);
  await page.waitForTimeout(1000);
  assert.equal(navigations, 1, 'reloaded exactly once');
  assert.deepEqual(await marks(page), { page: '2', script: '2' }, 'after Update');
  assert.equal(await notice(page).isVisible(), false, 'notice gone');
  const keys = await page.evaluate(() => caches.keys());
  assert.ok(keys.includes('games-shell-test-2'), `the new version runs (${keys})`);
  assert.ok(!keys.includes('games-shell-test-1'), 'the old shell cache is gone');
  await s.close();
});

test('pwa-updates AC-3: a game open in another tab never reloads or shows the notice, even when the landing page taps Update', async () => {
  const s = await site();
  const landing = await s.page();
  await controlled(landing);
  const game = await s.page('alpha/');
  await played(game);
  let navigations = 0;
  game.on('framenavigated', (f) => f === game.mainFrame() && navigations++);
  deploy(s, '2', ['alpha']);
  // The browser checks for an update from the game page too: the new worker installs and waits.
  await game.evaluate(() => navigator.serviceWorker.getRegistration().then((r) => r.update()));
  await until(game, () => navigator.serviceWorker.getRegistration().then((r) => !!r.waiting), null, 'a new worker waits');
  await game.waitForTimeout(500);
  assert.equal(await game.locator('[data-update]').count(), 0, 'no notice in the game');
  assert.equal(await game.getByText('New version available').count(), 0);
  await landing.reload();
  await notice(landing).waitFor({ state: 'visible', timeout: 10000 });
  await notice(landing).getByRole('button', { name: 'Update' }).click();
  await landing.waitForFunction(() => document.readyState === 'complete');
  await until(game, () => navigator.serviceWorker.getRegistration().then((r) => !r.waiting), null, 'the new worker took over');
  await game.waitForTimeout(1000);
  assert.equal(navigations, 0, 'the game page never reloaded');
  assert.equal(await game.evaluate(() => window.__alive), true, 'the run carries on');
  assert.deepEqual(await marks(game), { page: '1', script: '1' }, 'still the version it started with');
  assert.equal(await game.locator('[data-update]').count(), 0, 'still no notice in the game');
  // Opened again, the game is the new version.
  await game.reload();
  await played(game);
  assert.deepEqual(await marks(game), { page: '2', script: '2' });
  await s.close();
});

test('pwa-updates AC-2: with two landing tabs, only the one that taps Update reloads; the other hides its notice', async () => {
  const s = await site();
  const one = await s.page();
  await controlled(one);
  const two = await s.page();
  await controlled(two);
  deploy(s, '2');
  await one.reload();
  await notice(one).waitFor({ state: 'visible', timeout: 10000 });
  await two.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await notice(two).waitFor({ state: 'visible', timeout: 10000 });
  let navigations = 0;
  two.on('framenavigated', (f) => f === two.mainFrame() && navigations++);
  await notice(one).getByRole('button', { name: 'Update' }).click();
  await one.waitForFunction(() => document.readyState === 'complete' && navigator.serviceWorker.controller);
  await notice(two).waitFor({ state: 'hidden', timeout: 10000 });
  await two.waitForTimeout(1000);
  assert.equal(navigations, 0, 'the other tab did not reload');
  assert.equal(await notice(one).isVisible(), false);
  await s.close();
});

test('pwa-updates AC-5: online, pages, scripts and styles come from the network; pictures and sounds from the cache, refreshed for next time', async () => {
  const s = await site();
  const landing = await s.page();
  await controlled(landing);
  const game = await s.page('alpha/');
  await played(game);
  const art = () => game.evaluate(() => document.querySelector('img').naturalWidth);
  const sound = () => game.evaluate(() => window.__soundBytes);
  const style = () => game.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--mark').trim());
  const [art1, sound1] = [await art(), await sound()];
  // A new picture and sound (different sizes), script, style and page.
  writeGame(s.dir, 'alpha', '2');
  copyFileSync(join(ROOT, 'assets/icons/icon-192.png'), join(s.dir, 'alpha/art.png'));
  copyFileSync(join(ROOT, 'assets/sounds/back.mp3'), join(s.dir, 'alpha/sounds/hit.mp3'));
  const newSound = readFileSync(join(s.dir, 'alpha/sounds/hit.mp3')).length;
  assert.notEqual(newSound, sound1);
  await game.reload();
  await played(game);
  assert.deepEqual(await marks(game), { page: '2', script: '2' }, 'page and script from the network');
  assert.equal(await style(), "'2'", 'stylesheet from the network');
  assert.equal(await art(), art1, 'picture from the cache');
  assert.equal(await sound(), sound1, 'sound from the cache');
  // Refreshed behind the scenes: the next load has them.
  await until(
    game,
    async (n) => {
      const r = await caches.match('sounds/hit.mp3');
      return !!r && (await r.arrayBuffer()).byteLength === n;
    },
    newSound,
    'the new sound is cached'
  );
  await until(
    game,
    async () => {
      const r = await caches.match('art.png');
      if (!r) return false;
      const img = await createImageBitmap(await r.blob());
      return img.width === 192;
    },
    null,
    'the new picture is cached'
  );
  await game.reload();
  await played(game);
  assert.equal(await art(), 192, 'the new picture, one load later');
  assert.equal(await sound(), newSound, 'the new sound, one load later');
  await s.close();
});

test("pwa-updates AC-6 / pwa-updates AC-8: a version bump that changes one game keeps the other playable offline, and offline play still works", async () => {
  const s = await site();
  const landing = await s.page();
  await controlled(landing);
  for (const g of ['alpha', 'beta']) {
    await landing.goto(s.base + `${g}/`);
    await played(landing);
  }
  await landing.goto(s.base);
  deploy(s, '2', ['beta']);
  await landing.reload();
  await notice(landing).waitFor({ state: 'visible', timeout: 10000 });
  await notice(landing).getByRole('button', { name: 'Update' }).click();
  await landing.waitForFunction(() => document.readyState === 'complete' && navigator.serviceWorker.controller);
  await until(landing, () => caches.keys().then((k) => k.includes('games-shell-test-2')), null, 'updated');
  await landing.waitForLoadState('networkidle');
  // Beta is played online on the new version; alpha isn't opened online again.
  await landing.goto(s.base + 'beta/');
  await played(landing);
  await s.context.setOffline(true);
  await landing.goto(s.base + 'alpha/');
  await played(landing);
  assert.deepEqual(await marks(landing), { page: '1', script: '1' }, 'alpha, offline, from its own cache');
  await landing.goto(s.base + 'beta/');
  await played(landing);
  assert.deepEqual(await marks(landing), { page: '2', script: '2' }, 'beta, offline, the new version');
  await landing.goto(s.base);
  assert.equal(await landing.locator('.tiles > li').count(), 8, 'the landing page, offline');
  assert.deepEqual(await marks(landing), { page: '2', script: '2' });
  const keys = await landing.evaluate(() => caches.keys());
  assert.ok(keys.includes('games-game-alpha') && keys.includes('games-game-beta'), `per-game caches (${keys})`);
  await s.close();
});

test('pwa-updates AC-7: the upgrade from the old worker is silent, keeps a played game offline, and deletes the old cache', async () => {
  const s = await site({ legacy: true });
  const landing = await s.page();
  await controlled(landing);
  await landing.goto(s.base + 'alpha/');
  await played(landing);
  await landing.waitForLoadState('networkidle');
  await landing.goto(s.base);
  assert.ok((await landing.evaluate(() => caches.keys())).includes('games-v5'), 'the old cache');
  setVersion(s.dir, 'test-2'); // the new worker is deployed
  await landing.evaluate(() => navigator.serviceWorker.getRegistration().then((r) => r.update()));
  await until(
    landing,
    () => caches.keys().then((k) => !k.includes('games-v5') && k.includes('games-game-alpha') && k.includes('games-shell-test-2')),
    null,
    'moved into the new caches, old cache deleted'
  );
  assert.equal(
    await landing.evaluate(() => navigator.serviceWorker.getRegistration().then((r) => !r.waiting && !!r.active)),
    true,
    'took over without waiting for Update'
  );
  await landing.reload();
  await landing.waitForTimeout(500);
  assert.equal(await notice(landing).isVisible(), false, 'no Update button for it');
  await s.context.setOffline(true);
  await landing.goto(s.base + 'alpha/');
  await played(landing);
  assert.deepEqual(await marks(landing), { page: '1', script: '1' }, 'alpha offline, played before the upgrade');
  await s.close();
});

test("pwa-updates AC-9: the notice is drawn with the site's theme tokens, in light and in dark", async () => {
  const s = await site();
  const page = await s.page();
  await page.evaluate(() => (document.querySelector('[data-update]').hidden = false));
  for (const scheme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme: scheme });
    const r = await page.evaluate(() => {
      const el = document.querySelector('[data-update]');
      const probe = document.createElement('div');
      probe.style.background = 'var(--card)';
      probe.style.color = 'var(--card-foreground)';
      document.body.appendChild(probe);
      const want = getComputedStyle(probe);
      const got = getComputedStyle(el);
      const out = { bg: [got.backgroundColor, want.backgroundColor], fg: [got.color, want.color] };
      probe.remove();
      return out;
    });
    assert.equal(r.bg[0], r.bg[1], `${scheme}: background is --card`);
    assert.equal(r.fg[0], r.fg[1], `${scheme}: text is --card-foreground`);
  }
  const light = await page.evaluate(() => getComputedStyle(document.querySelector('[data-update]')).backgroundColor);
  await page.emulateMedia({ colorScheme: 'light' });
  assert.notEqual(light, await page.evaluate(() => getComputedStyle(document.querySelector('[data-update]')).backgroundColor), 'light and dark differ');
  await s.close();
});

test('pwa-updates AC-10: a game opened straight from a link is cached into its own game cache, and opens offline', async () => {
  const s = await site();
  const game = await s.page('alpha/');
  await played(game);
  await until(
    game,
    async () => {
      const c = await caches.open('games-game-alpha');
      return !!(await c.match('game.js')) && !!(await c.match('art.png')) && !!(await c.match('./'));
    },
    null,
    'alpha cached in games-game-alpha'
  );
  await game.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 10000 });
  await s.context.setOffline(true);
  await game.reload();
  await played(game);
  await s.close();
});

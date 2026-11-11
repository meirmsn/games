// End-to-end tests for specs/pwa-updates.md: the Update button, games never reloaded, matching
// versions, per-game caches, the upgrade from the old worker and offline play.
//
// Each test builds its own copy of the site in a temp folder (the real landing page, sw.js and
// shared files, plus two small games, alpha/ and beta/), serves it with Cache-Control: no-cache, and
// "deploys" a new version by rewriting files there.
// Run: scripts/check-slow.sh (Playwright's Chromium).
// clock-checked: each test waits on the signal it needs (a reload, a worker, the cache), and every
// waitForTimeout left is a scaled negative bound after that signal (specs/slow-tests-pwa-site.md).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import { once } from 'node:events';
import { cpSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, extname, normalize } from 'node:path';
import { launch, scaled, within } from './clock.mjs';

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
  browser = await launch();
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

// One test's site: a temp folder, its server and a browser context. Closed when the test ends, even
// when it fails or never reaches its own close(): a server left listening keeps the file's process
// alive after its tests end, so the file never exits (F-34, specs/slow-tests-pwa-site.md).
async function site(t, { legacy = false } = {}) {
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
  let context = null;
  let closing = null;
  // Drops keep-alive connections, so the server closes now (specs/slow-tests-harness.md). The server
  // closes even if the context's close fails or hangs; a second call shares the first.
  const close = () =>
    (closing ??= (async () => {
      try {
        if (context) await within(context.close(), 'the browser context closed');
      } finally {
        server.closeAllConnections();
        await new Promise((r) => server.close(r));
      }
    })());
  t.after(close); // registered before anything else can fail
  context = await browser.newContext({ hasTouch: true });
  return {
    dir,
    base,
    server,
    context,
    async page(path = '') {
      const page = await context.newPage();
      await page.goto(base + path);
      return page;
    },
    close,
  };
}

// An in-page promise on the caches or the service worker, which can stay pending for ever
// (`page.evaluate` has no time-out): fails, naming `what`, after 10 s (specs/slow-tests-harness.md).
const inPage = (page, fn, what, arg) => within(page.evaluate(fn, arg), what);

// Wait for a service worker to control the page (reloading once if needed). `ready` is bounded in
// Node by within(), so the limit scales with the throttle.
async function controlled(page) {
  await inPage(page, () => navigator.serviceWorker.ready.then(() => true), 'navigator.serviceWorker.ready');
  if (!(await inPage(page, () => !!navigator.serviceWorker.controller, 'the controller'))) await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: scaled(10000) });
}

// Poll every 100 ms until fn (a page function, often on the caches or the service worker) is true, or
// fail, naming `what`, after scaled(10000) ms. Each check is bounded on its own: one that never
// settles fails instead of hanging the file (specs/slow-tests-harness.md).
async function until(page, fn, arg, what) {
  const deadline = Date.now() + scaled(10000);
  for (;;) {
    const ok = await inPage(page, ({ src, arg }) => eval(src)(arg), `${what} (a check that never settled)`, {
      src: fn.toString(),
      arg,
    });
    if (ok) return;
    if (Date.now() > deadline) assert.fail(`${what}: not true after ${scaled(10000)} ms`);
    await new Promise((r) => setTimeout(r, 100));
  }
}

// The version check's outcome: the browser has compared the server's sw.js with the page's worker
// (registration.update() settles once it has), and no worker is installing or waiting. A newer sw.js
// would leave one installing or waiting, and this fails, naming it (specs/slow-tests-pwa-site.md).
async function versionChecked(page) {
  await inPage(page, () => navigator.serviceWorker.getRegistration().then((r) => r.update()), 'the worker update');
  await until(
    page,
    () => navigator.serviceWorker.getRegistration().then((r) => !!r.active && !r.installing && !r.waiting),
    null,
    'no new worker installing or waiting after the version check'
  );
}

// Counts the page's main-frame navigations from now on; `reached(n)` waits until there have been n,
// then for the page's load. Set up before the action that reloads, so no reload is missed.
function navigations(page) {
  let n = 0;
  let wake = () => {};
  page.on('framenavigated', (f) => {
    if (f !== page.mainFrame()) return;
    n++;
    wake();
  });
  return {
    get count() {
      return n;
    },
    async reached(want, what = `${want} reload(s)`) {
      if (n < want) {
        await within(
          new Promise((r) => {
            wake = () => n >= want && r();
          }),
          what
        );
      }
      await page.waitForLoadState('load');
    },
  };
}

// Waits until `cache` holds each of `keys` (relative to the site's root, matched as the offline step
// will match them). With `mark`, each page (`…/`) must be that version's (data-mark) and each script
// (`….js`) too (scriptMark), since an older copy may already be there.
const inCache = (page, cache, keys, mark = null) =>
  until(
    page,
    async ({ cache, keys, mark, root }) => {
      const c = await caches.open(cache);
      for (const k of keys) {
        const r = await c.match(new URL(k, root).href);
        if (!r) return false;
        if (mark && k.endsWith('/') && !(await r.text()).includes(`data-mark="${mark}"`)) return false;
        if (mark && k.endsWith('.js') && !(await r.text()).includes(`scriptMark = '${mark}'`)) return false;
      }
      return true;
    },
    { cache, keys, mark, root: new URL('/', page.url()).href },
    `${cache} holds ${keys.join(', ')}${mark ? ` at mark ${mark}` : ''}`
  );
const gameFiles = (g) => [`${g}/`, `${g}/game.js`, `${g}/game.css`, `${g}/art.png`, `${g}/sounds/hit.mp3`];

const marks = (page) =>
  page.evaluate(() => ({ page: document.documentElement.dataset.mark, script: document.documentElement.dataset.scriptMark }));
const notice = (page) => page.locator('[data-update]');

async function played(page) {
  await page.waitForFunction(() => window.__alive && window.__soundBytes > 0, null, { timeout: scaled(10000) });
}

// Deploy a new version: bump VERSION, and remark the landing page and the listed games.
function deploy(s, mark, games = []) {
  setVersion(s.dir, `test-${mark}`);
  markLanding(s.dir, mark);
  for (const g of games) writeGame(s.dir, g, mark);
}

test('pwa-updates AC-1 / slow-tests-pwa-site AC-4: no notice on a first visit or without a newer version; it shows on the next load once one is deployed', async (t) => {
  const s = await site(t);
  const page = await s.page();
  await controlled(page);
  await versionChecked(page);
  await page.waitForTimeout(scaled(300)); // safe: negative bound: the page's own register/statechange handlers, after the version check
  assert.equal(await notice(page).isVisible(), false, 'first visit, then controlled: no notice');
  await page.reload();
  await versionChecked(page);
  await page.waitForTimeout(scaled(300)); // safe: negative bound: the page's own register/statechange handlers, after the version check
  assert.equal(await notice(page).isVisible(), false, 'no newer version: no notice');
  deploy(s, '2');
  await page.reload();
  await notice(page).waitFor({ state: 'visible', timeout: scaled(10000) });
  assert.equal(await notice(page).locator('p').textContent(), 'New version available');
  const box = await notice(page).getByRole('button', { name: 'Update' }).boundingBox();
  assert.ok(box.width >= 44 && box.height >= 44, `Update is at least 44 px (${box.width}×${box.height})`);
  await s.close();
});

test('pwa-updates AC-1: an open landing page finds a new version when it becomes visible again, without a reload', async (t) => {
  const s = await site(t);
  const page = await s.page();
  await controlled(page);
  deploy(s, '2');
  let navigations = 0;
  page.on('framenavigated', (f) => f === page.mainFrame() && navigations++);
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await notice(page).waitFor({ state: 'visible', timeout: scaled(10000) });
  assert.equal(navigations, 0, 'not reloaded');
  await s.close();
});

test('pwa-updates AC-2 / pwa-updates AC-4 / slow-tests-pwa-site AC-5: Update reloads the landing page once into the new version; page and script always match', async (t) => {
  const s = await site(t);
  const page = await s.page();
  await controlled(page);
  assert.deepEqual(await marks(page), { page: '1', script: '1' });
  deploy(s, '2');
  await page.reload();
  // Before Update: the old worker still serves the page, and page and script are both the new ones.
  assert.deepEqual(await marks(page), { page: '2', script: '2' }, 'first load after the deploy');
  await notice(page).waitFor({ state: 'visible', timeout: scaled(10000) });
  const reloads = navigations(page);
  await notice(page).getByRole('button', { name: 'Update' }).click();
  await reloads.reached(1, 'the reload after Update');
  await until(
    page,
    () => navigator.serviceWorker.getRegistration().then((r) => !r.waiting && r.active?.state === 'activated' && navigator.serviceWorker.controller === r.active),
    null,
    'the new worker in charge'
  );
  await page.waitForTimeout(scaled(500)); // safe: negative bound: a second reload, after the first and the new worker in charge
  assert.equal(reloads.count, 1, 'reloaded exactly once');
  assert.deepEqual(await marks(page), { page: '2', script: '2' }, 'after Update');
  assert.equal(await notice(page).isVisible(), false, 'notice gone');
  const keys = await inPage(page, () => caches.keys(), 'caches.keys()');
  assert.ok(keys.includes('games-shell-test-2'), `the new version runs (${keys})`);
  assert.ok(!keys.includes('games-shell-test-1'), 'the old shell cache is gone');
  await s.close();
});

test('pwa-updates AC-3 / slow-tests-pwa-site AC-5 / slow-tests-pwa-site AC-6: a game open in another tab never reloads or shows the notice, even when the landing page taps Update', async (t) => {
  const s = await site(t);
  const landing = await s.page();
  await controlled(landing);
  const game = await s.page('alpha/');
  await played(game);
  const gameLoads = navigations(game);
  deploy(s, '2', ['alpha']);
  // The browser checks for an update from the game page too: the new worker installs and waits.
  await inPage(game, () => navigator.serviceWorker.getRegistration().then((r) => r.update()), 'the worker update');
  await until(game, () => navigator.serviceWorker.getRegistration().then((r) => !!r.waiting), null, 'a new worker waits');
  await game.waitForTimeout(scaled(500)); // safe: negative bound: a notice in the game, after its registration found the new worker waiting
  assert.equal(await game.locator('[data-update]').count(), 0, 'no notice in the game');
  assert.equal(await game.getByText('New version available').count(), 0);
  await landing.reload();
  await notice(landing).waitFor({ state: 'visible', timeout: scaled(10000) });
  const landingLoads = navigations(landing);
  await notice(landing).getByRole('button', { name: 'Update' }).click();
  await landingLoads.reached(1, "the landing page's reload after Update");
  // The game's controller is the new worker: its controllerchange, which a wrong reload would come
  // from, has run. Both workers have the same scriptURL, so this is checked by identity.
  await until(
    game,
    () => navigator.serviceWorker.getRegistration().then((r) => !r.waiting && r.active?.state === 'activated' && navigator.serviceWorker.controller === r.active),
    null,
    'the new worker took over the game'
  );
  await game.waitForTimeout(scaled(1000)); // safe: negative bound: a reload of the game, after its controllerchange
  assert.equal(gameLoads.count, 0, 'the game page never reloaded');
  assert.equal(await game.evaluate(() => window.__alive), true, 'the run carries on');
  assert.deepEqual(await marks(game), { page: '1', script: '1' }, 'still the version it started with');
  assert.equal(await game.locator('[data-update]').count(), 0, 'still no notice in the game');
  // Opened again, the game is the new version.
  await game.reload();
  await played(game);
  assert.deepEqual(await marks(game), { page: '2', script: '2' });
  await s.close();
});

test('pwa-updates AC-2 / slow-tests-pwa-site AC-5 / slow-tests-pwa-site AC-6: with two landing tabs and a new worker, only the one that taps Update reloads; the other hides its notice', async (t) => {
  const s = await site(t);
  const one = await s.page();
  await controlled(one);
  const two = await s.page();
  await controlled(two);
  setVersion(s.dir, 'test-2'); // only the worker changes: the page's own files are as they were
  await one.reload();
  await notice(one).waitFor({ state: 'visible', timeout: scaled(10000) });
  await two.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await notice(two).waitFor({ state: 'visible', timeout: scaled(10000) });
  const twoLoads = navigations(two);
  const oneLoads = navigations(one);
  await notice(one).getByRole('button', { name: 'Update' }).click();
  await oneLoads.reached(1, 'the reload of the tab that tapped Update');
  // Two hides its notice on controllerchange, the handler a wrong reload would come from.
  await notice(two).waitFor({ state: 'hidden', timeout: scaled(10000) });
  await two.waitForTimeout(scaled(1000)); // safe: negative bound: a reload of the other tab, after its controllerchange
  assert.equal(twoLoads.count, 0, 'the other tab did not reload');
  assert.equal(oneLoads.count, 1, 'the tab that tapped reloaded once');
  assert.equal(await notice(one).isVisible(), false);
  await s.close();
});

test("pwa-updates AC-11 / slow-tests-pwa-site AC-5: with sw.js unchanged, a change to the landing page's own files shows the notice once it's back on screen; Update reloads into it", async (t) => {
  const s = await site(t);
  const page = await s.page();
  await controlled(page);
  await page.waitForLoadState('networkidle');
  markLanding(s.dir, '2'); // index.html and site.js change; sw.js doesn't
  await page.waitForTimeout(scaled(300)); // safe: negative bound: no check runs without visibilitychange, and the load-time fetches are done (networkidle)
  assert.equal(await notice(page).isVisible(), false, 'nothing until the page is shown again');
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await notice(page).waitFor({ state: 'visible', timeout: scaled(10000) });
  assert.equal(await inPage(page, () => navigator.serviceWorker.getRegistration().then((r) => !!r.waiting), 'the registration'), false, 'no new worker');
  const reloads = navigations(page);
  await notice(page).getByRole('button', { name: 'Update' }).click();
  await reloads.reached(1, 'the reload after Update');
  await page.waitForFunction(() => document.readyState === 'complete' && document.documentElement.dataset.scriptMark === '2');
  await page.waitForTimeout(scaled(1000)); // safe: negative bound: a second reload, after the first
  assert.equal(reloads.count, 1, 'reloaded exactly once');
  assert.deepEqual(await marks(page), { page: '2', script: '2' });
  assert.equal(await notice(page).isVisible(), false, 'notice gone');
  await s.close();
});

test('pwa-updates AC-5: online, pages, scripts and styles come from the network; pictures and sounds from the cache, refreshed for next time', async (t) => {
  const s = await site(t);
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

test("pwa-updates AC-6 / pwa-updates AC-8 / slow-tests-pwa-site AC-7: a version bump that changes one game keeps the other playable offline, and offline play still works", async (t) => {
  const s = await site(t);
  const landing = await s.page();
  await controlled(landing);
  for (const g of ['alpha', 'beta']) {
    await landing.goto(s.base + `${g}/`);
    await played(landing);
  }
  // The worker stores what a page loads after the page has it: wait for alpha's files to land.
  await inCache(landing, 'games-game-alpha', gameFiles('alpha'), '1');
  await landing.goto(s.base);
  deploy(s, '2', ['beta']);
  await landing.reload();
  await notice(landing).waitFor({ state: 'visible', timeout: scaled(10000) });
  await notice(landing).getByRole('button', { name: 'Update' }).click();
  await landing.waitForFunction(() => document.readyState === 'complete' && navigator.serviceWorker.controller);
  await until(landing, () => caches.keys().then((k) => k.includes('games-shell-test-2')), null, 'updated');
  await landing.waitForLoadState('networkidle');
  const tiles = await landing.locator('.tiles > li').count();
  assert.ok(tiles > 0);
  // Beta is played online on the new version; alpha isn't opened online again.
  await landing.goto(s.base + 'beta/');
  await played(landing);
  await inCache(landing, 'games-game-beta', ['beta/', 'beta/game.js'], '2');
  await s.context.setOffline(true);
  await landing.goto(s.base + 'alpha/');
  await played(landing);
  assert.deepEqual(await marks(landing), { page: '1', script: '1' }, 'alpha, offline, from its own cache');
  await landing.goto(s.base + 'beta/');
  await played(landing);
  assert.deepEqual(await marks(landing), { page: '2', script: '2' }, 'beta, offline, the new version');
  await landing.goto(s.base);
  assert.equal(await landing.locator('.tiles > li').count(), tiles, 'the landing page, offline, every tile');
  assert.deepEqual(await marks(landing), { page: '2', script: '2' });
  const keys = await inPage(landing, () => caches.keys(), 'caches.keys()');
  assert.ok(keys.includes('games-game-alpha') && keys.includes('games-game-beta'), `per-game caches (${keys})`);
  await s.close();
});

test('pwa-updates AC-7 / slow-tests-pwa-site AC-4 / slow-tests-pwa-site AC-7: the upgrade from the old worker is silent, keeps a played game offline, and deletes the old cache', async (t) => {
  const s = await site(t, { legacy: true });
  const landing = await s.page();
  await controlled(landing);
  await landing.goto(s.base + 'alpha/');
  await played(landing);
  // The old worker's cache holds alpha before the upgrade: moveLegacy copies only what is there.
  await inCache(landing, 'games-v5', gameFiles('alpha'));
  await landing.goto(s.base);
  assert.ok((await inPage(landing, () => caches.keys(), 'caches.keys()')).includes('games-v5'), 'the old cache');
  setVersion(s.dir, 'test-2'); // the new worker is deployed
  await inPage(landing, () => navigator.serviceWorker.getRegistration().then((r) => r.update()), 'the worker update');
  await until(
    landing,
    () => caches.keys().then((k) => !k.includes('games-v5') && k.includes('games-game-alpha') && k.includes('games-shell-test-2')),
    null,
    'moved into the new caches, old cache deleted'
  );
  assert.equal(
    await inPage(landing, () => navigator.serviceWorker.getRegistration().then((r) => !r.waiting && !!r.active), 'the registration'),
    true,
    'took over without waiting for Update'
  );
  await landing.reload();
  await versionChecked(landing);
  await landing.waitForTimeout(scaled(300)); // safe: negative bound: the page's own register/statechange handlers, after the version check
  assert.equal(await notice(landing).isVisible(), false, 'no Update button for it');
  await s.context.setOffline(true);
  await landing.goto(s.base + 'alpha/');
  await played(landing);
  assert.deepEqual(await marks(landing), { page: '1', script: '1' }, 'alpha offline, played before the upgrade');
  await s.close();
});

test("pwa-updates AC-9: the notice is drawn with the site's theme tokens, in light and in dark", async (t) => {
  const s = await site(t);
  const page = await s.page();
  await page.evaluate(() => (document.querySelector('[data-update]').hidden = false));
  for (const scheme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme: scheme });
    const r = await page.evaluate(() => {
      const el = document.querySelector('[data-update]');
      const probe = document.createElement('div');
      Object.assign(probe.style, {
        background: 'var(--card)',
        color: 'var(--card-foreground)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        boxShadow: 'var(--shadow)',
        padding: 'var(--space-2) var(--space-2) var(--space-2) var(--space-4)',
        gap: 'var(--space-4)',
      });
      document.body.appendChild(probe);
      const want = getComputedStyle(probe);
      const got = getComputedStyle(el);
      const keys = ['backgroundColor', 'color', 'borderTopColor', 'borderTopLeftRadius', 'boxShadow', 'paddingTop', 'paddingLeft', 'columnGap'];
      const out = Object.fromEntries(keys.map((k) => [k, [got[k], want[k]]]));
      out.weight = [getComputedStyle(el.querySelector('p')).fontWeight, getComputedStyle(document.body).fontWeight];
      probe.remove();
      return out;
    });
    for (const [k, [got, want]] of Object.entries(r)) assert.equal(got, want, `${scheme}: ${k} comes from the theme`);
  }
  const light = await page.evaluate(() => getComputedStyle(document.querySelector('[data-update]')).backgroundColor);
  await page.emulateMedia({ colorScheme: 'light' });
  assert.notEqual(light, await page.evaluate(() => getComputedStyle(document.querySelector('[data-update]')).backgroundColor), 'light and dark differ');
  await s.close();
});

test('pwa-updates AC-10 / slow-tests-pwa-site AC-7: a game opened straight from a link is cached into its own game cache, and opens offline', async (t) => {
  const s = await site(t);
  const game = await s.page('alpha/');
  await played(game);
  await until(
    game,
    async () => {
      const c = await caches.open('games-game-alpha');
      const keys = ['./', 'game.js', 'game.css', 'art.png', 'sounds/hit.mp3'];
      return (await Promise.all(keys.map((k) => c.match(k)))).every(Boolean);
    },
    null,
    'alpha (page, script, style, picture and sound) cached in games-game-alpha'
  );
  await game.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: scaled(10000) });
  await s.context.setOffline(true);
  await game.reload();
  await played(game);
  await s.close();
});

test('slow-tests-harness AC-4: the test server drops a connection still open and has closed when close() returns', async (t) => {
  const s = await site(t);
  await s.page();
  // A request whose headers never finish: an active connection, which server.close() alone keeps
  // open, so the old close() returned with the server still holding it (and the file kept running).
  const raw = net.connect(s.server.address().port, '127.0.0.1');
  await once(raw, 'connect');
  raw.write('GET / HTTP/1.1\r\nHost: 127.0.0.1\r\n');
  const dropped = once(raw, 'close');
  const serverClosed = once(s.server, 'close');
  const start = Date.now();
  await within(s.close(), 'close()', 2000);
  assert.equal(s.server.listening, false, 'the server stopped listening');
  await within(Promise.all([dropped, serverClosed]), 'the open connection dropped and the server closed', 500);
  assert.ok(Date.now() - start < 2000, `closed in ${Date.now() - start} ms`);
  raw.destroy();
});

test('slow-tests-pwa-site AC-1: a site is closed when its test ends, even when the test never calls close()', async (t) => {
  let s;
  // A test that skips close(), as a failing one does: t.after() runs on both paths.
  await t.test('a test that never reaches close()', async (inner) => {
    s = await site(inner);
    await s.page();
  });
  const listening = s.server.listening;
  const contextOpen = browser.contexts().includes(s.context);
  // Clean up what the old site() would leak, so this fails fast instead of keeping the file running.
  if (contextOpen) await s.context.close();
  if (listening) {
    s.server.closeAllConnections();
    await new Promise((r) => s.server.close(r));
  }
  assert.equal(listening, false, "the test's server stopped listening when the test ended");
  assert.equal(contextOpen, false, "the test's browser context closed when the test ended");
});

// The lines of `src` whose wait has a fixed limit in ms that TEST_CPU_THROTTLE doesn't scale: an
// explicit time-out, a fixed waitForTimeout, an in-page timer used as a limit, or a poll count.
function fixedLimits(src, name = 'file') {
  const fixed = [/\btimeout:\s*\d/, /waitForTimeout\(\s*\d/, /setTimeout\(\(\)\s*=>\s*r\(false\)/, /for \(let i = 0; i < \d+;/];
  return src
    .split('\n')
    .map((line, i) => [line, i])
    .filter(([line]) => !/^\s*\/\//.test(line) && !line.includes('fixedLimits(') && fixed.some((re) => re.test(line)))
    .map(([line, i]) => `${name}:${i + 1}: ${line.trim()}`);
}

test('slow-tests-pwa-site AC-8: no wait in this file or the landing page tests has a fixed limit the throttle does not scale', () => {
  assert.equal(fixedLimits("await x.waitFor({ state: 'visible', timeout: 10000 });").length, 1);
  assert.equal(fixedLimits('await page.waitForTimeout(500);').length, 1); // safe: an example string for the check, not a wait
  assert.equal(fixedLimits('new Promise((r) => setTimeout(() => r(false), 10000))').length, 1);
  assert.equal(fixedLimits('for (let i = 0; i < 100; i++) {').length, 1);
  assert.deepEqual(fixedLimits('await page.waitForTimeout(scaled(500)); // safe: negative bound: x\n// timeout: 10'), []);
  for (const name of ['pwa-updates.test.mjs', 'site.test.mjs']) {
    assert.deepEqual(fixedLimits(readFileSync(join(ROOT, 'tests', name), 'utf8'), `tests/${name}`), []);
  }
});

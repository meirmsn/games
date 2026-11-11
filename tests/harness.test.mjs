// Tests for the slow tier's harness (specs/slow-tests-harness.md): the per-file limit in
// scripts/check-slow.sh, the CPU throttle and waits in tests/clock.mjs, and the bounded waits in
// tests/pwa-updates.test.mjs. Run: scripts/check-slow.sh.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { launch, realFrames, scaled, waitFor, within } from './clock.mjs';
import { serve } from './serve.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const DIR = new URL('./', import.meta.url);
const source = (f) => readFileSync(new URL(f, DIR), 'utf8');

// Runs scripts/check-slow.sh with `env` on `files`; returns its exit, output and seconds taken.
function checkSlow(files, env = {}) {
  const start = Date.now();
  // Without NODE_TEST_CONTEXT, which would make the inner `node --test` skip its files.
  const { NODE_TEST_CONTEXT, ...outer } = process.env;
  const r = spawnSync('scripts/check-slow.sh', files, {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...outer, TEST_CPU_THROTTLE: '', SLOW_TEST_TIMEOUT_MS: '', ...env },
    timeout: 120000,
  });
  return { status: r.status, out: r.stdout + r.stderr, secs: (Date.now() - start) / 1000 };
}

test('slow-tests-harness AC-1: a file that hangs in a test, in a hook, or never exits is stopped, named, and fails the run', () => {
  for (const f of ['hang-test', 'hang-hook', 'hang-linger']) {
    const file = `tests/fixtures/${f}.mjs`;
    const r = checkSlow([file], { SLOW_TEST_TIMEOUT_MS: '2000' });
    assert.equal(r.status, 1, `${f}: exit 1\n${r.out}`);
    assert.ok(r.secs < 2 + 10, `${f}: stopped within the limit plus 10 s (${r.secs} s)`);
    assert.match(r.out, new RegExp(`check-slow: stopped at the 2000 ms limit: ${file}`), `${f} named`);
  }
  const ok = checkSlow(['tests/fixtures/passes.mjs'], { SLOW_TEST_TIMEOUT_MS: '2000' });
  assert.equal(ok.status, 0, ok.out);
  assert.doesNotMatch(ok.out, /stopped at/);
  // With no files it runs the suite's glob, as before.
  assert.match(source('../scripts/check-slow.sh'), /files=\(tests\/\*\.test\.mjs\)/);
});

test('slow-tests-harness AC-2: the limit is SLOW_TEST_TIMEOUT_MS (default 5 min) times the throttle, at most 20 min', () => {
  const limit = (env) => checkSlow(['tests/fixtures/passes.mjs'], env).out.match(/each file's limit is (\d+) ms/)?.[1];
  assert.equal(limit({}), '300000');
  assert.equal(limit({ TEST_CPU_THROTTLE: '1' }), '300000');
  assert.equal(limit({ SLOW_TEST_TIMEOUT_MS: '1000', TEST_CPU_THROTTLE: '3' }), '3000');
  assert.equal(limit({ TEST_CPU_THROTTLE: '10' }), '1200000');
  // And the scaled limit is the one that stops a file.
  const r = checkSlow(['tests/fixtures/hang-test.mjs'], { SLOW_TEST_TIMEOUT_MS: '1000', TEST_CPU_THROTTLE: '3' });
  assert.match(r.out, /stopped at the 3000 ms limit/);
});

test('slow-tests-harness AC-3: pwa-updates waits on the caches and the service worker only through a bounded helper', async () => {
  const s = source('pwa-updates.test.mjs');
  const unbounded = s
    .split('\n')
    .filter((l) => /\.evaluate\(/.test(l) && /caches|serviceWorker|eval\(src\)/.test(l) && !/^const inPage = /.test(l));
  assert.deepEqual(unbounded, [], 'every evaluate on caches / navigator.serviceWorker goes through inPage()');
  assert.match(s, /^const inPage = \(page, fn, what, arg\) => within\(page\.evaluate\(fn, arg\), what\);$/m);
  // until() bounds each check, not just its loop.
  assert.match(s, /async function until[\s\S]*?await inPage\(page,/);
  // The helper fails, naming what it waited for, when the page's promise never settles.
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const start = Date.now();
    // Its time-outs scale with TEST_CPU_THROTTLE, so a throttled run expects the scaled one.
    await assert.rejects(
      within(page.evaluate(() => new Promise(() => {})), 'the test promise', 500),
      new RegExp(`within: the test promise: didn't settle within ${scaled(500)} ms`)
    );
    assert.ok(Date.now() - start < scaled(500) + 4000);
  } finally {
    await browser.close();
  }
});

// A fixed piece of script; returns how long it took in the page.
const work = (page) =>
  page.evaluate(() => {
    const t0 = performance.now();
    let x = 0;
    for (let i = 0; i < 3e7; i++) x += Math.sqrt(i);
    return performance.now() - t0 + (x < 0 ? 1 : 0);
  });
// How many times slower `page` runs the script than `base` (a page at full speed), from their total
// times over five runs taken in turns, so a change in the machine's load hits both alike. Chromium
// throttles in time slices, so a short piece of work can slip through one at full speed: each run
// is long enough (tens of ms at full speed) to span many slices.
async function slowdown(page, base) {
  let b = 0;
  let t = 0;
  for (let i = 0; i < 5; i++) {
    b += await work(base);
    t += await work(page);
  }
  return t / b;
}

let server;
before(async () => {
  server = await serve();
});
after(() => server?.close());

test('slow-tests-harness AC-7: with the throttle, every page from launch() runs slower: newContext, newPage, a noopener popup, after a reload; throttle: false opts out', async () => {
  const plain = await chromium.launch();
  const slow = await launch({ rate: 10 });
  try {
    const base = await plain.newPage();
    const slower = async (page, what) => {
      const r = await slowdown(page, base);
      assert.ok(r >= 4, `${what}: ${r.toFixed(1)}× slower than full speed`);
    };
    const context = await slow.newContext();
    const page = await context.newPage();
    await page.goto(server.base);
    await slower(page, 'a page from newContext()');
    await page.reload();
    await slower(page, 'the same page after a reload');
    await slower(await slow.newPage(), 'a page from browser.newPage()');
    // Another site (localhost, not 127.0.0.1) and noopener: its own renderer, so only the
    // context's 'page' handler can slow it.
    const [popup] = await Promise.all([
      context.waitForEvent('page'),
      page.evaluate((url) => window.open(url, '_blank', 'noopener'), server.base.replace('127.0.0.1', 'localhost')),
    ]);
    await popup.waitForLoadState();
    await popup.__throttling;
    await slower(popup, 'a noopener popup');
    const fast = await (await slow.newContext({ throttle: false })).newPage();
    const r = await slowdown(fast, base);
    assert.ok(r < 2.5, `throttle: false runs at full speed (${r.toFixed(1)}×)`);
  } finally {
    await plain.close();
    await slow.close();
  }
});

test('slow-tests-harness AC-8: with no throttle, launch() is plain Chromium: nothing wrapped, no CDP session', async () => {
  for (const rate of [1, 0.5]) {
    const browser = await launch({ rate });
    try {
      assert.equal(Object.hasOwn(browser, 'newContext'), false, `rate ${rate}: newContext is Playwright's own`);
      assert.equal(Object.hasOwn(browser, 'newPage'), false, `rate ${rate}: newPage is Playwright's own`);
      const context = await browser.newContext();
      assert.equal(Object.hasOwn(context, 'newPage'), false, `rate ${rate}: the context's newPage is Playwright's own`);
      const page = await context.newPage();
      assert.equal(page.__throttle, undefined, `rate ${rate}: no CDP throttle on the page`);
    } finally {
      await browser.close();
    }
  }
});

test('slow-tests-harness AC-9: every browser test file starts Chromium with launch() from tests/clock.mjs', () => {
  const files = readdirSync(DIR).filter((f) => f.endsWith('.mjs') && f !== 'clock.mjs' && f !== 'harness.test.mjs');
  const forbidden = [/chromium\.launch\(/, /browser\.newPage\(/, /launchPersistentContext/];
  const browserFiles = [];
  for (const f of files) {
    const s = source(f);
    for (const re of forbidden) assert.doesNotMatch(s, re, `${f}: ${re}`);
    if (/newContext\(|newPage\(/.test(s)) browserFiles.push(f);
  }
  assert.ok(browserFiles.length >= 11, `the browser test files (${browserFiles})`);
  for (const f of browserFiles) {
    const s = source(f);
    assert.match(s, /^import \{[^}]*\blaunch\b[^}]*\} from '\.\/clock\.mjs';$/m, `${f} imports launch`);
    assert.match(s, /browser = await launch\(\);/, `${f} starts Chromium with launch()`);
  }
});

test('slow-tests-harness AC-10: realFrames waits on frames and fails on a page that runs none; waitFor waits on state and fails naming what', async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(server.base);
    await page.evaluate(() => {
      window.__frames = 0;
      const tick = () => {
        window.__frames++;
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    const f0 = await page.evaluate(() => window.__frames);
    await realFrames(page, 10);
    assert.ok((await page.evaluate(() => window.__frames)) - f0 >= 9, 'ten frames ran');
    await page.evaluate(() => setTimeout(() => (window.__ready = true), 200));
    await waitFor(page, () => window.__ready === true, null, { what: 'the flag' });
    await assert.rejects(waitFor(page, () => window.__never === true, null, { what: 'a flag nobody sets', timeout: 500 }), new RegExp(`waitFor: a flag nobody sets: not true after ${scaled(500)} ms`));
    // A page that runs no frames, as a hidden one doesn't (headless Chromium keeps every page
    // visible, and won't freeze one, so the frames are stopped in the page): realFrames fails
    // instead of waiting for ever. Its bound is in Node, so why the frames stopped doesn't matter.
    await page.evaluate(() => (window.requestAnimationFrame = () => 0));
    const start = Date.now();
    await assert.rejects(realFrames(page, 5, { timeout: 1000 }), /realFrames: 5 animation frames/);
    assert.ok(Date.now() - start < scaled(1000) + 4000);
  } finally {
    await browser.close();
  }
});

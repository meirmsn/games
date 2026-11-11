// The browser tests' clock and CPU (specs/slow-tests-harness.md). A busy CI runner runs fewer frames
// in a given time, so a test that waits a fixed time for a game to move on can flake. These helpers
// wait on the page's frames or on the game's state instead, and `launch()` can run every page with a
// slower CPU, so a test can be proved under the load that broke it.
//
//   TEST_CPU_THROTTLE=10 scripts/check-slow.sh   runs every page any test opens 10× slower
//
// Unset, or 1 or less, `launch()` is `chromium.launch()`: no CDP session, nothing wrapped.
import { chromium } from 'playwright';

// The throttle rate from an env value: a number above 1, or 1 (full speed).
export function rateFrom(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 1 ? n : 1;
}

export const RATE = rateFrom(process.env.TEST_CPU_THROTTLE);

// A time-out for a wait, scaled by the throttle rate: a slower CPU gets as many frames, not as many ms.
export const scaled = (ms, rate = RATE) => ms * rate;

const PLAYWRIGHT_DEFAULT_TIMEOUT = 30000;

// Slow one page's CPU through its own CDP session, kept open for the page's life (the throttle ends
// when its session detaches).
async function throttlePage(context, page, rate) {
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate });
  page.__throttle = { cdp, rate };
}

// Chromium, with every page of every context slowed `rate` times when rate > 1. Each test file starts
// its browser with this, so the contexts a test makes itself (not through its file's open()) are
// slowed too. A context made with `{ throttle: false }` isn't: the tests that measure CPU time or set
// their own throttle use it. `browser.newPage()` goes through `newContext()`, so it's covered.
export async function launch({ rate = RATE, ...options } = {}) {
  const browser = await chromium.launch(options);
  if (rate <= 1) return browser;
  const newContext = browser.newContext.bind(browser);
  browser.newContext = async ({ throttle = true, ...contextOptions } = {}) => {
    const context = await newContext(contextOptions);
    if (!throttle) return context;
    context.setDefaultTimeout(scaled(PLAYWRIGHT_DEFAULT_TIMEOUT, rate));
    context.setDefaultNavigationTimeout(scaled(PLAYWRIGHT_DEFAULT_TIMEOUT, rate));
    const applied = new WeakMap();
    const apply = (page) => {
      if (!applied.has(page)) {
        // Kept on the page, so a test can wait until a page it didn't open itself is slowed.
        page.__throttling = throttlePage(context, page, rate).catch(() => {});
        applied.set(page, page.__throttling);
      }
      return applied.get(page);
    };
    context.on('page', apply); // pages a page opens
    const newPage = context.newPage.bind(context);
    context.newPage = async () => {
      const page = await newPage();
      await apply(page); // slowed before the test's first goto
      return page;
    };
    return context;
  };
  return browser;
}

// Resolves after `n` of the page's animation frames. A hidden or frozen page runs none, so it fails
// after `timeout` ms (scaled by the throttle) instead of waiting for ever; the bound is kept here, in
// Node, since a frozen page runs no timers either.
export async function realFrames(page, n, { timeout = 10000 } = {}) {
  await within(
    page.evaluate(
      (n) =>
        new Promise((done) => {
          let k = 0;
          const tick = () => (++k >= n ? done() : requestAnimationFrame(tick));
          requestAnimationFrame(tick);
        }),
      n
    ),
    `realFrames: ${n} animation frames (is the page hidden?)`,
    timeout
  );
}

// Waits until `fn(arg)` is true in the page, checked on each frame; fails after `timeout` ms (scaled
// by the throttle) with a message naming `what`.
export async function waitFor(page, fn, arg, { what, timeout = 10000 } = {}) {
  if (!what) throw new Error('waitFor: say what it waits for ({ what })');
  const ms = scaled(timeout);
  try {
    await page.waitForFunction(fn, arg, { timeout: ms, polling: 'raf' });
  } catch (e) {
    if (/Timeout/i.test(e.message)) throw new Error(`waitFor: ${what}: not true after ${ms} ms`);
    throw e;
  }
}

// Fails, naming `what`, if `promise` hasn't settled within `ms` (scaled by the throttle). For in-page
// promises that may never settle (a service worker's, a cache's): `page.evaluate` has no time-out.
export async function within(promise, what, ms = 10000) {
  const limit = scaled(ms);
  let timer;
  const late = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`within: ${what}: didn't settle within ${limit} ms`)), limit);
  });
  try {
    return await Promise.race([promise, late]);
  } finally {
    clearTimeout(timer);
  }
}

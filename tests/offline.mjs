// The offline tests' waits (specs/slow-tests-orbit-reef-runes.md): a test goes offline only once the
// site's service worker is ready and holds every file the page loaded, never after a fixed time or
// Playwright's `networkidle` (500 ms with no requests, which a slow CPU can outlast mid-load).
import { within, realFrames } from './clock.mjs';

// Registers the site's worker from a game's page and waits, bounded, until it is ready.
export async function registerWorker(page) {
  await page.evaluate(() => navigator.serviceWorker.register('../sw.js'));
  await within(page.evaluate(() => navigator.serviceWorker.ready.then(() => true)), 'the service worker is ready', 20000);
}

// The same-origin files this page loaded (the page itself and each resource) that no cache holds yet.
const uncached = (page) =>
  page.evaluate(async () => {
    const urls = [location.href, ...performance.getEntriesByType('resource').map((e) => e.name)]
      .map((u) => new URL(u))
      .filter((u) => u.origin === location.origin && !u.pathname.endsWith('/sw.js'))
      .map((u) => ((u.hash = ''), u.href));
    const out = [];
    for (const u of new Set(urls)) if (!(await caches.match(u))) out.push(u);
    return out;
  });

// Waits, bounded, until every file the controlled page loaded is cached; fails naming what isn't.
export async function cachedAll(page, timeout = 20000) {
  let left = [];
  let stop = false;
  const poll = (async () => {
    while (!stop && (left = await uncached(page)).length) await realFrames(page, 5);
  })();
  poll.catch(() => {}); // after a time-out the page may close under the loop
  try {
    await within(poll, 'every file the page loaded is cached', timeout);
  } catch (e) {
    throw new Error(`${e.message}; not cached: ${left.join(', ')}`);
  } finally {
    stop = true;
  }
}

// End-to-end tests for specs/landing-home-and-ribbon.md: the landing page's Home button, and the
// add-to-home-screen ribbon in the bottom-right corner with its dialog. The ribbon hiding while the
// Update notice shows, and coming back when it goes, is in tests/pwa-updates.test.mjs (it needs a
// real update). The device cases are tested by the signals the page reads (the spec's decisions).
// Run: scripts/check-slow.sh (Playwright's Chromium).
// clock-checked: each test waits on the signal it needs (a load, the ribbon, the dialog), with no
// fixed waits.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { serve } from './serve.mjs';
import { launch } from './clock.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const DAY = 24 * 60 * 60 * 1000;
const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const MAC_SAFARI =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
const MAC_CHROME =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

let BASE;
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

// Hold back Chromium's own install offer, so a test decides when one arrives (as tests/site.test.mjs).
const HOLD_INSTALL = () => {
  window.addEventListener(
    'beforeinstallprompt',
    (e) => {
      if (e.isTrusted) e.stopImmediatePropagation();
    },
    true
  );
};

// A browser context and a page on the landing page, collecting the page's errors. `init` scripts run
// before the page's own. `visits` loads the landing page that many times (2: the ribbon's due).
async function open({ visits = 1, init = [], ...opts } = {}, t) {
  const context = await browser.newContext({ hasTouch: true, ...opts });
  t?.after(() => context.close().catch(() => {}));
  await context.addInitScript(HOLD_INSTALL);
  for (const s of init) await context.addInitScript(s);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  for (let i = 0; i < visits; i++) await page.goto(BASE);
  return { context, page, errors };
}

const ribbon = (page) => page.locator('[data-ribbon]');
const band = (page) => page.locator('[data-ribbon] button');
const dialog = (page) => page.locator('[data-add-dialog]');
const shown = (page) => ribbon(page).isVisible();

// Offer install as Chrome would: a synthetic beforeinstallprompt whose prompt() is a stub.
const offerInstall = (page, outcome = 'accepted') =>
  page.evaluate((outcome) => {
    const e = new Event('beforeinstallprompt', { cancelable: true });
    e.prompt = () => {
      window.__prompted = (window.__prompted || 0) + 1;
    };
    e.userChoice = Promise.resolve({ outcome });
    window.dispatchEvent(e);
  }, outcome);

// Which advice the open dialog shows (the one visible [data-advice]).
const advice = (page) =>
  page.evaluate(() => {
    const shown = [...document.querySelectorAll('[data-add-dialog] [data-advice]')].filter((a) => !a.hidden);
    return shown.map((a) => ({ kind: a.dataset.advice, text: a.textContent.replace(/\s+/g, ' ').trim() }));
  });

async function openDialog(page) {
  await band(page).click();
  await dialog(page).waitFor({ state: 'visible' });
}

// "Not now" once, then 7 days and a minute later the ribbon is back: the state in which the dialog
// offers "Don't show again" too.
async function notNowOnce(page) {
  const now = Date.now();
  await openDialog(page);
  await dialog(page).getByRole('button', { name: 'Not now' }).click();
  await page.clock.setFixedTime(now + 7 * DAY + 60 * 1000);
  await page.reload();
  await ribbon(page).waitFor();
}
const neverBtn = (page) => dialog(page).getByRole('button', { name: "Don't show again" });

test('landing-home-and-ribbon AC-1: the header starts with a 44 px Home button to https://meirmsn.dev/; no game page has one', async (t) => {
  const { page, errors } = await open({}, t);
  const first = page.locator('.site-header .inner a, .site-header .inner button').first();
  assert.equal(await first.getAttribute('href'), 'https://meirmsn.dev/');
  const home = page.getByRole('link', { name: 'Home', exact: true });
  assert.equal(await home.count(), 1, 'one link named "Home"');
  assert.equal(await home.getAttribute('title'), 'Home', 'its tooltip');
  assert.ok(await home.evaluate((el, f) => el === f, await first.elementHandle()), 'the Home button comes first');
  const box = await home.boundingBox();
  assert.ok(box.width >= 44 && box.height >= 44, `at least 44 × 44 px (${box.width} × ${box.height})`);
  const brand = await page.locator('.brand').boundingBox();
  assert.ok(box.x + box.width <= brand.x, 'before "Games"');
  // A game page: the shell's back button, no Home button.
  await page.goto(BASE + 'tests/fixtures/game/');
  await page.locator('.shell-back').waitFor();
  assert.equal(await page.locator('a[href="https://meirmsn.dev/"]').count(), 0, 'no Home button in a game');
  assert.deepEqual(errors, []);
});

test('landing-home-and-ribbon AC-1: at 320 px wide the header stays on one line, even with Install showing', async (t) => {
  const { page } = await open({ viewport: { width: 320, height: 568 } }, t);
  // The browser's own font, then DejaVu Sans, the wide one a Linux browser without system-ui falls
  // back to (CI's runner): the header must fit in both.
  for (const [install, font] of [
    [false, null],
    [false, 'DejaVu Sans'],
    [true, null],
    [true, 'DejaVu Sans'],
  ]) {
    if (install && !(await page.locator('[data-install]').isVisible())) {
      await offerInstall(page);
      await page.locator('[data-install]').waitFor();
    }
    await page.evaluate((font) => {
      document.querySelector('#font-under-test')?.remove();
      if (!font) return;
      const style = Object.assign(document.createElement('style'), { id: 'font-under-test' });
      style.textContent = `:root { --font-sans: '${font}' !important; }`;
      document.head.append(style);
    }, font);
    await page.evaluate(() => document.fonts.ready);
    const row = await page.evaluate(() => {
      const items = [...document.querySelectorAll('.site-header .inner :is(a, button)')].filter((el) => el.offsetParent);
      const rects = items.map((el) => el.getBoundingClientRect());
      return {
        n: items.length,
        tops: [...new Set(rects.map((r) => Math.round(r.top)))],
        right: Math.max(...rects.map((r) => r.right)),
        width: document.documentElement.clientWidth,
        scroll: document.documentElement.scrollWidth,
      };
    });
    assert.equal(row.n, install ? 5 : 4, 'Home, Games, (Install,) sound, theme');
    assert.equal(row.tops.length, 1, `one line (tops ${row.tops}), Install ${install}, font ${font}`);
    assert.ok(row.right <= row.width, `nothing past the right edge (${row.right} > ${row.width}), Install ${install}, font ${font}`);
    assert.equal(row.scroll, row.width, 'no sideways scroll');
  }
});

test('landing-home-and-ribbon AC-2: no ribbon on a first visit; on the second it shows across the bottom-right corner, 44 px tall', async (t) => {
  const { page, errors } = await open({}, t);
  await page.waitForLoadState('networkidle');
  assert.equal(await shown(page), false, 'first visit: clean');
  await page.reload();
  await ribbon(page).waitFor();
  assert.equal(await band(page).textContent(), 'Add to home screen', 'a touch device');
  const geo = await page.evaluate(() => {
    const box = document.querySelector('[data-ribbon]').getBoundingClientRect();
    const b = document.querySelector('[data-ribbon] button');
    return {
      right: box.right,
      bottom: box.bottom,
      w: innerWidth,
      h: innerHeight,
      height: b.offsetHeight,
      transform: getComputedStyle(b).transform,
    };
  });
  assert.equal(geo.right, geo.w, 'at the right edge');
  assert.equal(geo.bottom, geo.h, 'at the bottom edge');
  assert.equal(geo.height, 44, '44 px tall');
  const [a, b] = geo.transform.match(/matrix\(([^)]+)\)/)[1].split(',').map(Number);
  assert.equal(Math.round((Math.atan2(b, a) * 180) / Math.PI), -45, 'at 45°');
  assert.deepEqual(errors, []);
});

test('landing-home-and-ribbon AC-2: on desktop the ribbon reads "Bookmark this site"', async (t) => {
  const { page } = await open({ visits: 2, hasTouch: false }, t);
  await ribbon(page).waitFor();
  assert.equal(await band(page).textContent(), 'Bookmark this site');
});

test('landing-home-and-ribbon AC-2: back on the landing page after tapping a game tile, the ribbon shows on a first visit', async (t) => {
  const { page } = await open({}, t);
  await page.route(BASE + 'reef/', (route) => route.fulfill({ contentType: 'text/html', body: '<title>Reef</title><p>A game</p>' }));
  await page.waitForLoadState('networkidle');
  assert.equal(await shown(page), false);
  await page.locator('a.tile[href="reef/"]').click();
  await page.waitForURL(BASE + 'reef/');
  await page.goBack();
  await ribbon(page).waitFor();
});

test('landing-home-and-ribbon AC-2: the ribbon is on the landing page only: never on a game page, even when it is due', async (t) => {
  const { page, errors } = await open({ visits: 2 }, t);
  await ribbon(page).waitFor(); // due: shown on the landing page
  for (const path of ['tests/fixtures/game/', 'reef/']) {
    await page.goto(BASE + path);
    await page.waitForLoadState('load');
    assert.equal(await page.locator('[data-ribbon], [data-add-dialog]').count(), 0, `no ribbon or dialog on ${path}`);
  }
  assert.deepEqual(errors, []);
});

for (const [w, h] of [
  [320, 568],
  [390, 844],
  [844, 390],
]) {
  test(`landing-home-and-ribbon AC-3: at ${w} × ${h} the ribbon covers nothing in the header, and the last tile and the footer scroll clear of it`, async (t) => {
    const { page } = await open({ visits: 2, viewport: { width: w, height: h } }, t);
    await ribbon(page).waitFor();
    const header = await page.evaluate(() => document.querySelector('.site-header').getBoundingClientRect().bottom);
    const corner = await ribbon(page).boundingBox();
    assert.ok(corner.y >= header, `below the header (corner top ${corner.y}, header bottom ${header})`);
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForFunction(() => Math.ceil(scrollY + innerHeight) >= document.documentElement.scrollHeight);
    const end = await page.evaluate(() => ({
      tile: document.querySelector('.tiles > li:last-child').getBoundingClientRect().bottom,
      footer: document.querySelector('.site-footer').getBoundingClientRect().bottom,
      corner: document.querySelector('[data-ribbon]').getBoundingClientRect().top,
    }));
    assert.ok(end.tile <= end.corner, `the last tile clears it (${end.tile} > ${end.corner})`);
    assert.ok(end.footer <= end.corner, `the footer clears it (${end.footer} > ${end.corner})`);
  });
}

test('landing-home-and-ribbon AC-4: never in the installed app (display-mode: standalone, or iOS standalone)', async (t) => {
  // display-mode: standalone, as the installed app reports it (Chromium can't emulate this media
  // feature, so the page's matchMedia answers it).
  const standalone = () => {
    const real = window.matchMedia.bind(window);
    window.matchMedia = (q) =>
      /display-mode:\s*standalone/.test(q) ? { ...real('all'), matches: true, media: q, addEventListener() {}, removeEventListener() {} } : real(q);
  };
  const { page, errors } = await open({ visits: 3, init: [standalone] }, t);
  assert.equal(await page.evaluate(() => matchMedia('(display-mode: standalone)').matches), true, 'standalone');
  await page.waitForLoadState('networkidle');
  assert.equal(await shown(page), false, 'display-mode: standalone');
  assert.deepEqual(errors, []);
  // iOS's home-screen app.
  const ios = await open({ visits: 3, userAgent: IPHONE, init: [() => Object.defineProperty(navigator, 'standalone', { get: () => true })] }, t);
  await ios.page.waitForLoadState('networkidle');
  assert.equal(await shown(ios.page), false, 'navigator.standalone');
});

test('landing-home-and-ribbon AC-4: never when storage is unavailable', async (t) => {
  const blocked = () =>
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw new DOMException('blocked', 'SecurityError');
      },
    });
  const { page, errors } = await open({ visits: 3, init: [blocked] }, t);
  await page.route(BASE + 'reef/', (route) => route.fulfill({ contentType: 'text/html', body: '<p>A game</p>' }));
  await page.locator('a.tile[href="reef/"]').click(); // a tile tap
  await page.waitForURL(BASE + 'reef/');
  await page.goBack();
  await page.waitForLoadState('networkidle');
  assert.equal(await shown(page), false);
  assert.deepEqual(errors, []);
  // Storage that reads but won't write: the visit isn't counted, so no ribbon either.
  const readOnly = () => {
    Storage.prototype.setItem = () => {
      throw new DOMException('full', 'QuotaExceededError');
    };
  };
  const ro = await open({ visits: 3, init: [readOnly] }, t);
  await ro.page.waitForLoadState('networkidle');
  assert.equal(await shown(ro.page), false, 'storage that cannot be written');
});

test('landing-home-and-ribbon AC-6: the first dialog offers "Not now" alone; "Don\'t show again" comes once "Not now" has been chosen', async (t) => {
  const { page } = await open({ visits: 2 }, t);
  await openDialog(page);
  assert.equal(await dialog(page).getByRole('button', { name: 'Not now' }).isVisible(), true);
  assert.equal(await neverBtn(page).isVisible(), false, 'no "Don\'t show again" the first time');
  await page.keyboard.press('Escape'); // closing without a choice is no "Not now"
  await dialog(page).waitFor({ state: 'hidden' });
  await page.reload();
  await openDialog(page);
  assert.equal(await neverBtn(page).isVisible(), false, 'still none after Escape and another visit');
  await page.keyboard.press('Escape');
  await notNowOnce(page);
  await openDialog(page);
  assert.equal(await neverBtn(page).isVisible(), true, 'offered when the ribbon comes back');
});

test('landing-home-and-ribbon AC-4 / landing-home-and-ribbon AC-6: "Don\'t show again" removes it for good, on any later visit', async (t) => {
  const { page } = await open({ visits: 2 }, t);
  await notNowOnce(page);
  await openDialog(page);
  await neverBtn(page).click();
  assert.equal(await dialog(page).isVisible(), false, 'the dialog closes');
  assert.equal(await shown(page), false, 'the ribbon goes');
  await page.clock.setFixedTime(Date.now() + 40 * DAY);
  for (let i = 0; i < 2; i++) await page.reload();
  await page.waitForLoadState('networkidle');
  assert.equal(await shown(page), false, 'still gone a month later');
});

test('landing-home-and-ribbon AC-6: "Not now" closes the dialog and the ribbon stays away for 7 days, then returns', async (t) => {
  const { page } = await open({ visits: 2 }, t);
  const now = Date.now();
  await openDialog(page);
  await dialog(page).getByRole('button', { name: 'Not now' }).click();
  assert.equal(await dialog(page).isVisible(), false, 'the dialog closes');
  assert.equal(await shown(page), false, 'the ribbon goes');
  await page.reload();
  await page.waitForLoadState('networkidle');
  assert.equal(await shown(page), false, 'the next visit');
  await page.clock.setFixedTime(now + 7 * DAY - 60 * 1000);
  await page.reload();
  await page.waitForLoadState('networkidle');
  assert.equal(await shown(page), false, 'a minute short of 7 days');
  await page.clock.setFixedTime(now + 7 * DAY + 60 * 1000);
  await page.reload();
  await ribbon(page).waitFor();
  await openDialog(page);
  assert.equal(await neverBtn(page).isVisible(), true, 'back, with "Don\'t show again" now offered');
});

test('landing-home-and-ribbon AC-5 / landing-home-and-ribbon AC-6: where the browser offers install, the dialog\'s Install opens its prompt; then the ribbon and both Install buttons go', async (t) => {
  const { page, errors } = await open({ visits: 2 }, t);
  await ribbon(page).waitFor();
  await offerInstall(page);
  const header = page.locator('[data-install]');
  await header.waitFor();
  await openDialog(page);
  assert.deepEqual((await advice(page)).map((a) => a.kind), ['install']);
  await dialog(page).getByRole('button', { name: 'Install' }).click();
  assert.equal(await page.evaluate(() => window.__prompted), 1, "the browser's prompt opened");
  await ribbon(page).waitFor({ state: 'hidden' });
  assert.equal(await dialog(page).isVisible(), false, 'the dialog closes');
  assert.equal(await header.isVisible(), false, "the header's Install goes");
  assert.equal(await page.locator('[data-install-here]').evaluate((b) => b.hidden), true, "the dialog's Install goes");
  await page.reload();
  await page.waitForLoadState('networkidle');
  assert.equal(await shown(page), false, 'not back on a later visit');
  assert.deepEqual(errors, []);
});

test("landing-home-and-ribbon AC-6: installing from the header's Install removes the ribbon and both Install buttons", async (t) => {
  const { page } = await open({ visits: 2 }, t);
  await ribbon(page).waitFor();
  await offerInstall(page);
  const header = page.locator('[data-install]');
  await header.click();
  assert.equal(await page.evaluate(() => window.__prompted), 1);
  await ribbon(page).waitFor({ state: 'hidden' });
  assert.equal(await header.isVisible(), false);
  assert.equal(await page.locator('[data-install-here]').evaluate((b) => b.hidden), true);
});

test('landing-home-and-ribbon AC-4 / landing-home-and-ribbon AC-6: installing another way (appinstalled) removes the ribbon for good', async (t) => {
  const { page } = await open({ visits: 2 }, t);
  await ribbon(page).waitFor();
  await page.evaluate(() => window.dispatchEvent(new Event('appinstalled')));
  await ribbon(page).waitFor({ state: 'hidden' });
  await page.reload();
  await page.waitForLoadState('networkidle');
  assert.equal(await shown(page), false);
});

test('landing-home-and-ribbon AC-6: a dismissed install prompt leaves the ribbon, its dialog falling back to the device\'s steps', async (t) => {
  const { page } = await open({ visits: 2 }, t);
  await offerInstall(page, 'dismissed');
  await openDialog(page);
  await dialog(page).getByRole('button', { name: 'Install' }).click();
  await page.locator('[data-advice="touch"]').waitFor();
  assert.deepEqual((await advice(page)).map((a) => a.kind), ['touch'], 'the prompt is used up');
  assert.equal(await shown(page), true, 'not installed: the ribbon stays');
});

// The device cases, by the signals the page reads.
const IPAD_AS_MAC = () => Object.defineProperty(Navigator.prototype, 'maxTouchPoints', { get: () => 5 });
const MAC = () => {
  Object.defineProperty(Navigator.prototype, 'platform', { get: () => 'MacIntel' });
  Object.defineProperty(Navigator.prototype, 'userAgentData', { get: () => undefined });
};
const LINUX = () => Object.defineProperty(Navigator.prototype, 'userAgentData', { get: () => undefined });
for (const [name, opts, kind, words] of [
  ['an iPhone', { userAgent: IPHONE, isMobile: true }, 'ios', /^Tap Share .*, then Add to Home Screen\.$/],
  ['an iPad reporting as a Mac', { userAgent: MAC_SAFARI, init: [IPAD_AS_MAC] }, 'ios', /^Tap Share .*, then Add to Home Screen\.$/],
  ['another touch device', {}, 'touch', /^Open your browser's menu, then Add to Home screen or Install\.$/],
  ['desktop Safari', { userAgent: MAC_SAFARI, hasTouch: false, init: [MAC] }, 'safari', /^Choose File, then Add to Dock\.$/],
  ['a Mac, not Safari', { userAgent: MAC_CHROME, hasTouch: false, init: [MAC] }, 'mac', /^Press ⌘D to bookmark this site\.$/],
  ['any other desktop', { hasTouch: false, init: [LINUX] }, 'ctrl', /^Press Ctrl\+D to bookmark this site\.$/],
]) {
  test(`landing-home-and-ribbon AC-5: tapping the ribbon on ${name} opens the dialog with its advice`, async (t) => {
    const { page, errors } = await open({ visits: 2, ...opts }, t);
    await openDialog(page);
    const shownAdvice = await advice(page);
    assert.deepEqual(shownAdvice.map((a) => a.kind), [kind]);
    assert.match(shownAdvice[0].text, words);
    if (kind === 'ios') {
      const icon = page.locator('[data-advice="ios"] svg');
      assert.equal(await icon.getAttribute('aria-label'), '(the Share icon)', 'the Share icon is drawn in');
      assert.ok((await icon.boundingBox()).width > 0);
    }
    assert.equal(await dialog(page).getByRole('button', { name: 'Install' }).isVisible(), false, 'no Install without the offer');
    assert.equal(await dialog(page).evaluate((d) => d.matches(':modal')), true, 'a modal dialog');
    assert.deepEqual(errors, []);
  });
}

test('landing-home-and-ribbon AC-2: the ribbon stays in its corner when tapped, while its dialog is open, and after it closes', async (t) => {
  const { page } = await open({ visits: 2, ...{ viewport: { width: 390, height: 664 }, isMobile: true } }, t);
  await ribbon(page).waitFor();
  // Where the band is, and whether its corner box has anything to scroll (it must not: a tap or
  // focus() scrolling the band into view inside the box slid it out of the corner).
  const where = () =>
    page.evaluate(() => {
      const box = document.querySelector('[data-ribbon]');
      const r = box.querySelector('button').getBoundingClientRect();
      return { x: r.x, y: r.y, scroll: [box.scrollLeft, box.scrollTop] };
    });
  const at = await where();
  assert.deepEqual(at.scroll, [0, 0]);
  await openDialog(page);
  assert.deepEqual(await where(), at, 'unmoved with the dialog open');
  await page.keyboard.press('Escape');
  await dialog(page).waitFor({ state: 'hidden' });
  assert.deepEqual(await where(), at, 'unmoved after the dialog closes and focus returns');
  await band(page).focus();
  assert.deepEqual(await where(), at, 'unmoved when focused');
});

test('landing-home-and-ribbon AC-5 / landing-home-and-ribbon AC-6: "Not now" comes first, on the left, then "Don\'t show again"; Install is larger, centred above them', async (t) => {
  const { page } = await open({ visits: 2 }, t);
  await notNowOnce(page);
  await offerInstall(page);
  await openDialog(page);
  const never = await dialog(page).getByRole('button', { name: "Don't show again" }).boundingBox();
  const notNow = await dialog(page).getByRole('button', { name: 'Not now' }).boundingBox();
  const install = await dialog(page).getByRole('button', { name: 'Install' }).boundingBox();
  const box = await dialog(page).boundingBox();
  assert.ok(notNow.x + notNow.width <= never.x, '"Not now" left of "Don\'t show again"');
  assert.ok(install.height > notNow.height, `Install is taller (${install.height} vs ${notNow.height})`);
  assert.ok(install.width > never.width + notNow.width, 'Install is wider than both together');
  const centre = install.x + install.width / 2 - (box.x + box.width / 2);
  assert.ok(Math.abs(centre) <= 1, `Install is centred (off by ${centre} px)`);
  assert.ok(install.y + install.height <= Math.min(never.y, notNow.y) - 16, 'well apart from the two below it');
});

test('landing-home-and-ribbon AC-7: Escape closes the dialog and returns focus to the ribbon', async (t) => {
  const { page } = await open({ visits: 2 }, t);
  await band(page).focus();
  await page.keyboard.press('Enter');
  await dialog(page).waitFor({ state: 'visible' });
  await page.keyboard.press('Escape');
  await dialog(page).waitFor({ state: 'hidden' });
  assert.equal(await band(page).evaluate((b) => b === document.activeElement), true, 'focus is on the ribbon');
  assert.equal(await shown(page), true, 'Escape is no choice: the ribbon stays');
  // A tap (a click that may not focus the button, as in Safari) returns focus too.
  await band(page).click();
  await dialog(page).waitFor({ state: 'visible' });
  await page.evaluate(() => document.activeElement.blur());
  await page.keyboard.press('Escape');
  await dialog(page).waitFor({ state: 'hidden' });
  assert.equal(await band(page).evaluate((b) => b === document.activeElement), true, 'focus is on the ribbon after a tap');
});

test("landing-home-and-ribbon AC-8: the Home button, ribbon and dialog use the theme's tokens, in light and dark", async (t) => {
  // Statically: every colour, radius and space in the stylesheets is a theme token (the fast tier's check).
  execFileSync('node', ['scripts/ui/tokens-check.mjs', '--theme', 'assets/base.css', 'assets/base.css', 'assets/site.css'], { cwd: ROOT });
  for (const colorScheme of ['light', 'dark']) {
    const { page } = await open({ visits: 2, colorScheme }, t);
    await openDialog(page);
    const got = await page.evaluate(() => {
      const probe = document.createElement('div');
      document.body.append(probe);
      const token = (name) => {
        probe.style.color = `var(${name})`;
        return getComputedStyle(probe).color;
      };
      const css = (sel) => getComputedStyle(document.querySelector(sel));
      const band = css('[data-ribbon] button');
      const dlg = css('[data-add-dialog]');
      const home = css('[data-home]');
      const sound = css('[data-sound-toggle]');
      return {
        tokens: { card: token('--card'), cardFg: token('--card-foreground'), border: token('--border'), fg: token('--foreground'), input: token('--input') },
        band: { bg: band.backgroundColor, fg: band.color, border: band.borderTopColor, shadow: band.boxShadow !== 'none' },
        dialog: { bg: dlg.backgroundColor, fg: dlg.color, border: dlg.borderTopColor },
        home: { fg: home.color, border: home.borderTopColor, w: home.width, radius: home.borderTopLeftRadius },
        sound: { fg: sound.color, border: sound.borderTopColor, w: sound.width, radius: sound.borderTopLeftRadius },
        dark: matchMedia('(prefers-color-scheme: dark)').matches,
      };
    });
    assert.equal(got.dark, colorScheme === 'dark');
    assert.deepEqual(got.band, { bg: got.tokens.card, fg: got.tokens.cardFg, border: got.tokens.border, shadow: true }, `${colorScheme}: the ribbon`);
    assert.deepEqual(got.dialog, { bg: got.tokens.card, fg: got.tokens.cardFg, border: got.tokens.border }, `${colorScheme}: the dialog`);
    assert.deepEqual(got.home, got.sound, `${colorScheme}: the Home button is styled as the sound button`);
    assert.equal(got.home.fg, got.tokens.fg);
  }
});

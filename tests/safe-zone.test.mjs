// Tests for the shared gesture-safe zone (shared/safe-zone.js, specs/edge-gestures.md). The pure
// parts run in plain Node; reading the real insets and guarding an element run in Chromium, with an
// iPhone's safe-area insets simulated over the DevTools protocol.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { serve } from './serve.mjs';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { MARGIN, SIDES_ONLY, rectFor, isEdgeStart, inside } from '../shared/safe-zone.js';

let BASE; // set in before(), from tests/serve.mjs
let server;
let browser;

before(async () => {
  server = await serve();
  BASE = server.base;
  browser = await chromium.launch();
});

after(async () => {
  await browser?.close();
  server?.close();
});

const IPHONE = { top: 47, bottom: 34, left: 0, right: 0 };

test('edge-gestures AC-1: the safe rectangle is the viewport minus the insets, minus 40 px at the bottom, 20 at the left and 24 at the top', () => {
  assert.deepEqual({ ...MARGIN }, { top: 24, right: 0, bottom: 40, left: 20 });
  assert.deepEqual(rectFor(390, 844, IPHONE), { left: 20, top: 71, right: 390, bottom: 770 });
  // Landscape, the notch on the left: the margin adds to the inset.
  assert.deepEqual(rectFor(844, 390, { top: 0, bottom: 21, left: 47, right: 47 }), { left: 67, top: 24, right: 797, bottom: 329 });
  // No insets (a Home-button phone, a desktop): the margins alone.
  assert.deepEqual(rectFor(360, 640), { left: 20, top: 24, right: 360, bottom: 600 });
});

test('edge-gestures AC-1: a touch or pen starting outside the rectangle is an edge start; a mouse never is', () => {
  const r = rectFor(390, 844, IPHONE);
  const at = (x, y, pointerType = 'touch') => ({ clientX: x, clientY: y, pointerType });
  assert.equal(isEdgeStart(at(200, 800), r), true, 'the bottom strip');
  assert.equal(isEdgeStart(at(200, 771), r), true, 'just inside the bottom strip');
  assert.equal(isEdgeStart(at(200, 770), r), false, 'its top edge is safe');
  assert.equal(isEdgeStart(at(10, 400), r), true, 'the left strip');
  assert.equal(isEdgeStart(at(200, 60), r), true, 'the top strip');
  assert.equal(isEdgeStart(at(385, 400), r), false, 'the right edge has no strip');
  assert.equal(isEdgeStart(at(200, 400), r), false, 'the middle');
  assert.equal(isEdgeStart(at(200, 820, 'pen'), r), true, 'a pen too');
  assert.equal(isEdgeStart(at(200, 820, 'mouse'), r), false, 'a mouse is never an edge start');
  // A touchstart reads its changed touch.
  assert.equal(isEdgeStart({ changedTouches: [{ clientX: 200, clientY: 830 }] }, r), true);
  assert.equal(isEdgeStart({ changedTouches: [{ clientX: 200, clientY: 300 }] }, r), false);
  assert.equal(inside(r, 20, 71), true);
  // SIDES_ONLY: the bottom strip is open, the left and top strips are not.
  const s = rectFor(390, 844, IPHONE, SIDES_ONLY);
  assert.equal(isEdgeStart(at(200, 830), s), false, 'the bottom strip is open to a slow slide');
  assert.equal(isEdgeStart(at(10, 830), s), true, 'the left strip is not');
  assert.equal(isEdgeStart(at(200, 60), s), true, 'nor the top strip');
});

test('edge-gestures AC-2: the helper reads simulated iPhone insets, and ignoreEdgeStarts stops only edge starts', async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 59, bottom: 34, left: 0, right: 0 } });
  // A bare page from this origin, so the module loads.
  await page.route(BASE + 'safe-zone-probe.html', (r) =>
    r.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><body style="margin:0"><div id="el" style="position:fixed;inset:0;touch-action:none"></div></body>',
    })
  );
  await page.goto(BASE + 'safe-zone-probe.html');
  const r = await page.evaluate(async () => {
    const z = await import('/shared/safe-zone.js');
    const el = document.getElementById('el');
    const got = [];
    el.addEventListener('pointerdown', (e) => got.push(['pointer', e.pointerType, e.clientY]));
    el.addEventListener('touchstart', (e) => got.push(['touch', e.changedTouches[0].clientY]));
    const remove = z.ignoreEdgeStarts(el);
    const down = (y, pointerType) => el.dispatchEvent(new PointerEvent('pointerdown', { clientX: 200, clientY: y, pointerType, bubbles: true }));
    const touch = (y) => {
      const t = new Touch({ identifier: 1, target: el, clientX: 200, clientY: y });
      el.dispatchEvent(new TouchEvent('touchstart', { changedTouches: [t], touches: [t], bubbles: true }));
    };
    down(800, 'touch'); // the bottom strip
    down(800, 'pen');
    down(70, 'touch'); // the top strip, 59 + 24 = 83 deep
    down(400, 'touch'); // safe
    down(800, 'mouse'); // a mouse anywhere
    touch(820); // a touchstart in the strip
    touch(500);
    remove();
    down(810, 'touch'); // unguarded again
    return { insets: z.readInsets(), rect: z.safeRect(), got };
  });
  assert.deepEqual(r.insets, { top: 59, right: 0, bottom: 34, left: 0 });
  assert.deepEqual(r.rect, { left: 20, top: 83, right: 390, bottom: 770 });
  assert.deepEqual(r.got, [
    ['pointer', 'touch', 400],
    ['pointer', 'mouse', 800],
    ['touch', 500],
    ['pointer', 'touch', 810],
  ]);
  await context.close();
});

test('edge-gestures AC-10: the service worker precaches the helper, with VERSION bumped past the v7 on main', () => {
  const sw = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
  const shell = sw.slice(sw.indexOf('const SHELL = ['), sw.indexOf('];', sw.indexOf('const SHELL = [')));
  assert.match(shell, /'shared\/safe-zone\.js'/, 'in SHELL');
  const v = Number(/const VERSION = 'v(\d+)'/.exec(sw)[1]);
  assert.ok(v >= 8, `VERSION is v${v}`);
});

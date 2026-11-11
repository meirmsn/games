// clock-checked (specs/slow-tests-orbit-reef-runes.md)
// Tests for Runes. Run: scripts/check-slow.sh.
// The game exposes window.__runes (the state, the rules, and the actions the player can take), so
// these tests can set up a board and check what the rules and the input do with it. The level
// checks (AC-9) run in Node, on the same rules the page uses.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { serve } from './serve.mjs';
import { launch, realFrames, waitFor, within } from './clock.mjs';
import { registerWorker, cachedAll } from './offline.mjs';
import { simulateInsets, PORTRAIT_INSETS } from './insets.mjs';
import { FAKE_AUDIO } from './fake-audio.mjs';
import * as R from '../runes/rules.js';
import { LEVELS, CHAPTERS } from '../runes/levels.js';
import { runesMatter } from '../scripts/runes/generate.mjs';
import { greedy } from '../scripts/runes/lab.mjs';

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

// Levels open one at a time, so unless a test sets up its own storage, every level starts solved
// (and so open), letting a test go straight to the level it needs.
const ALL_SOLVED = () => localStorage.setItem('runes-solved', JSON.stringify([...Array(14).keys()]));
async function open({ hash = '1', viewport = { width: 390, height: 844 }, init = ALL_SOLVED } = {}) {
  const context = await browser.newContext({ viewport, hasTouch: true });
  await context.addInitScript(FAKE_AUDIO);
  if (init) await context.addInitScript(init);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(`${BASE}runes/#${hash}`);
  await page.waitForFunction(() => window.__runes);
  return { context, page, errors };
}

const path = (page) => page.evaluate(() => window.__runes.game.s.path.slice());
const board = (page, rows) => page.evaluate((rows) => window.__runes.loadBoard(rows), rows);

// Synthetic pointer events on the canvas, so a test controls every finger.
async function pointer(page, type, id, x, y) {
  await page.evaluate(
    ({ type, id, x, y }) => {
      const c = document.querySelector('#pool');
      c.dispatchEvent(
        new PointerEvent(type, { pointerId: id, clientX: x, clientY: y, bubbles: true, isPrimary: id === 1, pointerType: 'touch' })
      );
    },
    { type, id, x, y }
  );
}
// Drag one finger from (x, y) by (dx, dy), in small moves.
async function drag(page, x, y, dx, dy, { id = 1, end = true, start = true } = {}) {
  if (start) await pointer(page, 'pointerdown', id, x, y);
  const n = 12;
  for (let i = 1; i <= n; i++) await pointer(page, 'pointermove', id, x + (dx * i) / n, y + (dy * i) / n);
  if (end) await pointer(page, 'pointerup', id, x + dx, y + dy);
}
const cellSize = (page) => page.evaluate(() => window.__runes.box.cell);
const center = (page, c) => page.evaluate((c) => window.__runes.center(c), c);
// A tap: pointerdown and pointerup in one call, so nothing runs between them. The game counts a
// pointer as a tap only if it lifts within 300 ms, and two round trips to a busy page can take longer.
async function tapCell(page, c) {
  await page.evaluate((c) => {
    const p = window.__runes.center(c);
    const canvas = document.querySelector('#pool');
    for (const type of ['pointerdown', 'pointerup']) {
      canvas.dispatchEvent(new PointerEvent(type, { pointerId: 1, clientX: p.x, clientY: p.y, bubbles: true, isPrimary: true, pointerType: 'touch' }));
    }
  }, c);
}
// Waits, bounded, until the element's own animations (a card's slide-in) have finished.
const settled = (page, sel) =>
  within(
    page.evaluate((sel) => Promise.all(document.querySelector(sel).getAnimations({ subtree: true }).map((a) => a.finished)).then(() => true), sel),
    `${sel}'s animations finish`
  );

// ---------------------------------------------------------------------------------------------

test('runes AC-1, slow-tests-orbit-reef-runes AC-10: the pool is already moving before any input, with its buttons, and no errors', async () => {
  const { context, page, errors } = await open();
  // Only the pool may change the picture: no ghost light (it shows after 4 s idle on level 1).
  await page.evaluate(() => (window.__runes.knobs.ghostDelay = Infinity));
  await realFrames(page, 2);
  const a = await page.screenshot();
  // 300 ms on the page's clock, then frames drawn after it, however slowly a busy machine runs them.
  const t0 = await page.evaluate(() => performance.now());
  await waitFor(page, (t0) => performance.now() >= t0 + 300, t0, { what: "300 ms on the page's clock" });
  await realFrames(page, 2);
  const b = await page.screenshot();
  assert.notDeepEqual(a, b, 'two frames 300 ms apart differ');
  for (const sel of ['[data-restart]', '[data-hint]', '[data-levels]', '[data-guidance]']) {
    assert.ok(await page.locator(sel).isVisible(), sel);
  }
  assert.equal(await page.evaluate(() => window.__runes.game.index), 0);
  assert.deepEqual(errors, []);
  await context.close();
});

test('edge-gestures AC-7: with iPhone insets, a drag that starts in an edge strip moves no line; a tap there still acts', async () => {
  const { context, page } = await open();
  const cdp = await simulateInsets(context, page, PORTRAIT_INSETS, () => window.__runes);
  const c = await cellSize(page);
  const box = await page.evaluate(() => ({ ...window.__runes.box, h: window.__runes.game.level.h }));
  // From the bottom strip and the left strip, a drag right of most of a cell steps nothing.
  await drag(page, box.ox + c, 844 - PORTRAIT_INSETS.bottom - 20, 0.62 * c, 0);
  assert.deepEqual(await path(page), [0], 'a drag from the bottom strip moves no line');
  await drag(page, 8, box.oy + (box.h + 0.6) * c, 0.95 * c, 0);
  assert.deepEqual(await path(page), [0], 'a drag from the left strip moves no line');
  // The same drag from the safe area steps the line.
  await drag(page, box.ox + c, box.oy + (box.h + 0.6) * c, 0.62 * c, 0);
  assert.deepEqual(await path(page), [0, 1], 'a drag from the safe area steps');
  await page.evaluate(() => window.__runes.restart());
  // Widen the left inset until the next stone sits in the left strip: a tap on it still steps there,
  // and a drag that starts on it does nothing.
  const p = await center(page, 1);
  await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { ...PORTRAIT_INSETS, left: Math.max(0, Math.floor(p.x - 10)) } });
  const q = await center(page, 1);
  const strip = await page.evaluate(async () => (await import('/shared/safe-zone.js')).safeRect().left);
  assert.ok(q.x < strip, `the stone is in the left strip (${q.x} < ${strip})`);
  await drag(page, q.x, q.y, 0, 0.95 * c);
  assert.deepEqual(await path(page), [0], 'a drag from the strip moves nothing');
  await tapCell(page, 1);
  assert.deepEqual(await path(page), [0, 1], 'a tap in the strip still acts');
  await context.close();
});

test('runes AC-2: a relative drag steps the line, a drag back takes nothing back, walls store nothing, a second finger moves nothing', async () => {
  const { context, page } = await open();
  const c = await cellSize(page);
  // Start below the board, far from the line's head.
  const box = await page.evaluate(() => ({ ...window.__runes.box, h: window.__runes.game.level.h }));
  const y = box.oy + (box.h + 0.6) * c;
  const x = box.ox + c;
  await drag(page, x, y, 0.62 * c, 0);
  assert.deepEqual(await path(page), [0, 1], '0.6 cell right steps one stone right');
  // No going back: dragging toward the previous stone, however far, moves nothing and stores nothing.
  await drag(page, x, y, -3 * c, 0, { end: false });
  assert.deepEqual(await path(page), [0, 1], 'a drag back takes nothing back');
  await drag(page, x - 3 * c, y, 0.95 * c, 0, { start: false });
  assert.deepEqual(await path(page), [0, 1, 2], 'the drag back stored nothing');
  await page.evaluate(() => window.__runes.restart());
  // Push left (off the board) for three cells, then right: nothing was stored by the push.
  await drag(page, x, y, -3 * c, 0, { end: false });
  assert.deepEqual(await path(page), [0]);
  await drag(page, x - 3 * c, y, 0.95 * c, 0, { start: false });
  assert.deepEqual(await path(page), [0, 1], 'the push into the wall stored nothing');
  // Push into a lit stone that is not the previous one: nothing steps and nothing is stored.
  await board(page, ['Soo', 'ooo', 'ooG']);
  for (const c2 of [1, 4, 3]) await page.evaluate((c2) => window.__runes.stepTo(c2), c2);
  await drag(page, x, y, 0, -3 * c, { end: false }); // up from 3 is the lit source
  assert.deepEqual(await path(page), [0, 1, 4, 3], 'a lit stone takes nothing');
  await drag(page, x, y - 3 * c, 0, 0.95 * c, { start: false });
  assert.deepEqual(await path(page), [0, 1, 4, 3, 6], 'the push into the lit stone stored nothing');
  await page.evaluate(() => window.__runes.loadLevel(0));
  await page.evaluate(() => window.__runes.stepTo(1));
  // Push down into water (below the source) for three cells, then right: nothing was stored.
  await page.evaluate(() => window.__runes.restart());
  await drag(page, x, y, 0, 3 * c, { end: false });
  assert.deepEqual(await path(page), [0], 'water takes nothing');
  await drag(page, x, y + 3 * c, 0.95 * c, 0, { start: false });
  assert.deepEqual(await path(page), [0, 1], 'the push into the water stored nothing');
  // Down from stone 1 is water: nothing happens.
  await drag(page, x, y, 0, 2 * c);
  assert.deepEqual(await path(page), [0, 1]);
  // A second finger moves nothing while the first is down.
  await pointer(page, 'pointerdown', 1, x, y);
  await drag(page, x + 50, y, 2 * c, 0, { id: 2 });
  assert.deepEqual(await path(page), [0, 1], 'the second finger was ignored');
  await pointer(page, 'pointerup', 1, x, y);
  await context.close();
});

test('runes AC-3, slow-tests-orbit-reef-runes AC-9: taps step; a tap on a lit stone does nothing; Restart clears the line; there is no Undo button', async () => {
  const { context, page } = await open();
  await tapCell(page, 1);
  await tapCell(page, 2);
  await tapCell(page, 5);
  assert.deepEqual(await path(page), [0, 1, 2, 5], 'taps on neighbours step');
  await tapCell(page, 1);
  assert.deepEqual(await path(page), [0, 1, 2, 5], 'a tap on a lit stone takes nothing back');
  await page.click('[data-restart]');
  assert.deepEqual(await path(page), [0], 'Restart clears the line');
  assert.equal(await page.locator('[data-undo], [data-result-undo]').count(), 0, 'no Undo button anywhere');
  await context.close();
});

test('runes AC-4: arrow keys step, never back; R restarts; Backspace and Z do nothing', async () => {
  const { context, page } = await open();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowDown');
  assert.deepEqual(await path(page), [0, 1, 2, 5]);
  await page.keyboard.press('ArrowUp');
  assert.deepEqual(await path(page), [0, 1, 2, 5], 'an arrow toward the previous stone does nothing');
  await page.keyboard.press('Backspace');
  await page.keyboard.press('z');
  assert.deepEqual(await path(page), [0, 1, 2, 5], 'Backspace and Z change nothing');
  await page.keyboard.press('r');
  assert.deepEqual(await path(page), [0], 'R restarts');
  await context.close();
});

test('runes AC-5: entering a Rise raises its water neighbours; Restart lowers them again', async () => {
  const { context, page } = await open();
  // S R .     the Rise (1) has water to its right (2) and below (4); the source (0) is lit.
  // o . .
  // G . .
  await board(page, ['SR.', 'o..', 'G..']);
  const up = () => page.evaluate(() => [...window.__runes.game.s.up].map(Number));
  assert.deepEqual(await up(), [1, 1, 0, 1, 0, 0, 1, 0, 0]);
  await page.evaluate(() => window.__runes.stepTo(1));
  assert.deepEqual(await up(), [1, 1, 1, 1, 1, 0, 1, 0, 0], 'cells 2 and 4 rose; nothing else changed');
  await page.evaluate(() => window.__runes.restart());
  assert.deepEqual(await up(), [1, 1, 0, 1, 0, 0, 1, 0, 0], 'they sank again');
  await context.close();
});

test('runes AC-6: leaving a Sink sinks its plain neighbours except the next, never a rune, the source or the gate', async () => {
  const { context, page } = await open();
  // S K o     leaving the Sink (1) for 2 sinks 4? no: 4 is a Rise and stays. Leaving it for 4
  // o R o     sinks 2. The source (0) never sinks.
  // G o o
  await board(page, ['SKo', 'oRo', 'Goo']);
  const up = () => page.evaluate(() => [...window.__runes.game.s.up].map(Number));
  await page.evaluate(() => window.__runes.stepTo(1));
  assert.deepEqual(await up(), [1, 1, 1, 1, 1, 1, 1, 1, 1], 'nothing sinks while the light stands on it');
  await page.evaluate(() => window.__runes.stepTo(2));
  assert.deepEqual(await up(), [1, 1, 1, 1, 1, 1, 1, 1, 1], 'the next stone is spared, the Rise and the source stay');
  await board(page, ['SKo', 'ooo', 'Goo']);
  await page.evaluate(() => window.__runes.stepTo(1));
  await page.evaluate(() => window.__runes.stepTo(4));
  assert.deepEqual(await up(), [1, 1, 0, 1, 1, 1, 1, 1, 1], 'stone 2 sank as the light left for 4');
  await page.evaluate(() => window.__runes.restart());
  assert.deepEqual(await up(), [1, 1, 1, 1, 1, 1, 1, 1, 1], 'Restart raises it again');
  await context.close();
});

test('runes AC-7: the gate solves only as the last stone; then the result panel shows, the mark is remembered, and Next opens the next level', async () => {
  const { context, page } = await open({ init: null }); // a fresh browser
  // An early step onto the gate ends the attempt unsolved (AC-20 checks the panel).
  await board(page, ['SoG', 'ooo']);
  await page.evaluate(() => window.__runes.stepTo(1));
  assert.equal(await page.evaluate(() => window.__runes.stepTo(2)), true);
  assert.equal(await page.evaluate(() => window.__runes.game.done), false, 'not solved');
  assert.equal(await page.evaluate(() => window.__runes.game.failed), true, 'the attempt ended');
  // A Sink beside the gate that sinks the last dark stone as the light leaves it lets the gate in.
  await board(page, ['SKG', '.o.']);
  await page.evaluate(() => window.__runes.stepTo(1));
  assert.equal(await page.evaluate(() => window.__runes.stepTo(2)), true);
  assert.equal(await page.evaluate(() => window.__runes.game.done), true);
  // Level 1, played for real.
  await page.evaluate(() => window.__runes.loadLevel(0));
  for (const k of ['ArrowRight', 'ArrowRight', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowLeft']) {
    await page.keyboard.press(k);
  }
  await page.locator('[data-result][data-kind="solved"]').waitFor({ state: 'visible' });
  assert.deepEqual(await page.evaluate(() => window.__runes.solvedSet()), [0]);
  await page.click('[data-result-levels]');
  assert.ok(await page.locator('.lv[data-level="1"]').evaluate((el) => el.classList.contains('is-solved')));
  await page.reload();
  await page.waitForFunction(() => window.__runes);
  assert.deepEqual(await page.evaluate(() => window.__runes.solvedSet()), [0], 'the mark survives a reload');
  await page.evaluate(() => {
    const r = window.__runes;
    for (const c of r.game.solutions[0].slice(1)) r.stepTo(c);
  });
  await page.locator('[data-next]').click();
  assert.equal(await page.evaluate(() => window.__runes.game.index), 1);
  assert.equal(new URL(page.url()).hash, '#2');
  await context.close();
});

test('runes AC-7: each state shows only its own panel, and the board takes input only while playing', async () => {
  const { context, page } = await open();
  const seen = () =>
    page.evaluate(() => ({
      solved: !document.querySelector('[data-result]').hidden,
      levels: !document.querySelector('[data-screen="levels"]').hidden,
    }));
  const c = await cellSize(page);
  // Playing: neither card.
  assert.deepEqual(await seen(), { solved: false, levels: false });
  // Choosing a level: the level select only; keys and drags move nothing.
  await page.click('[data-levels]');
  assert.deepEqual(await seen(), { solved: false, levels: true });
  assert.equal(await page.locator('.bar').isVisible(), true, 'the bar stays while choosing a level');
  await page.keyboard.press('ArrowRight');
  await drag(page, 100, 700, c, 0);
  assert.deepEqual(await path(page), [0], 'no input while choosing a level');
  await page.click('[data-close-levels]');
  // Solved: the solved card only; keys and drags move nothing.
  for (const k of ['ArrowRight', 'ArrowRight', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowLeft']) {
    await page.keyboard.press(k);
  }
  await page.locator('[data-result][data-kind="solved"]').waitFor({ state: 'visible' });
  assert.deepEqual(await seen(), { solved: true, levels: false });
  assert.equal(await page.locator('.bar').isVisible(), false, 'the panel takes the bar’s place');
  const solvedLine = await path(page);
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Backspace');
  await drag(page, 100, 700, 0, -c);
  assert.deepEqual(await path(page), solvedLine, 'no input once solved');
  await context.close();
});

test('runes AC-8, slow-tests-orbit-reef-runes AC-11: with Guidance on (off by default), a line that can no longer finish dims the gate and marks stranded stones; Restart restores it', async () => {
  const { context, page } = await open({ hash: '2' });
  assert.equal(await page.evaluate(() => window.__runes.guidance()), false, 'Guidance starts off');
  assert.equal(await page.locator('[data-guidance]').getAttribute('aria-pressed'), 'false');
  // Find a line on level 2 that dies with a stone stranded.
  const found = await page.evaluate(() => {
    const r = window.__runes;
    const s = r.game.s;
    const L = r.game.level;
    function walk(depth) {
      if (depth > 6) return null;
      for (const m of r.rules.moves(s)) {
        r.rules.step(s, m);
        const dead = !r.rules.solve(L, { from: s, max: 1 }).solutions.length;
        if (dead && r.rules.stranded(s).length) {
          const line = s.path.slice();
          r.rules.back(s);
          return line;
        }
        const deeper = dead ? null : walk(depth + 1);
        r.rules.back(s);
        if (deeper) return deeper;
      }
      return null;
    }
    return walk(0);
  });
  assert.ok(found, 'level 2 has a line that strands a stone');
  for (const c of found.slice(1)) await page.evaluate((c) => window.__runes.stepTo(c), c);
  // Guidance off: nothing tells you yet. With it on, the check would run on the next frame and then in
  // a task; wait for both, so a check that ran would have shown.
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => setTimeout(done, 0))));
  assert.equal(await page.evaluate(() => window.__runes.game.dead), false, 'no live feedback without Guidance');
  assert.equal(await page.evaluate(() => window.__runes.game.stranded.length), 0);
  // Guidance on (and remembered): the gate dims and the stranded stones show.
  await page.click('[data-guidance]');
  assert.equal(await page.locator('[data-guidance]').getAttribute('aria-pressed'), 'true');
  await page.waitForFunction(() => window.__runes.game.dead === true);
  assert.ok((await page.evaluate(() => window.__runes.game.stranded.length)) > 0, 'a stranded stone is marked');
  await page.click('[data-restart]');
  await page.waitForFunction(() => window.__runes.game.dead === false && window.__runes.game.deadKnown);
  assert.equal(await page.evaluate(() => window.__runes.game.stranded.length), 0);
  await page.reload();
  await page.waitForFunction(() => window.__runes);
  assert.equal(await page.evaluate(() => window.__runes.guidance()), true, 'Guidance is remembered');
  await context.close();
});

test('runes AC-9: every level is sound: 1–3 solutions, greedy fails, every rune matters, no Spark', () => {
  assert.equal(LEVELS.length, 14);
  for (const [i, lv] of LEVELS.entries()) {
    const name = `level ${i + 1} ${lv.name}`;
    assert.match(lv.rows.join(''), /^[.oSGRK]+$/, `${name}: only stones, water, source, gate, Rise and Sink`);
    const L = R.parse(lv.rows);
    const res = R.solve(L, { max: 4, limit: 3e6 });
    assert.equal(res.cut, false, `${name}: the search finished`);
    assert.ok(res.solutions.length >= 1 && res.solutions.length <= 3, `${name}: ${res.solutions.length} solutions`);
    const runes = L.kind.filter(R.isRune).length;
    if (runes) {
      assert.equal(greedy(L), false, `${name}: the greedy line fails`);
      assert.equal(runesMatter(lv.rows, res.solutions.length), '', `${name}: every rune matters`);
    }
  }
  const dawn = LEVELS.slice(CHAPTERS[0].from, CHAPTERS[0].to);
  assert.ok(dawn.every((lv) => !lv.rows.join('').includes('K')), 'Dawn has no Sink');
  // The first level with each rune has only that rune.
  for (const r of ['R', 'K']) {
    const first = LEVELS.find((lv) => lv.rows.join('').includes(r));
    const other = r === 'R' ? 'K' : 'R';
    assert.ok(!first.rows.join('').includes(other), `${first.name} brings in ${r} alone`);
  }
});

test('runes AC-10: two chapters of seven levels; each level opens once the one before it is solved; Next goes in order; entering the game, or a link to a locked level, opens the furthest one open', async () => {
  assert.deepEqual(
    CHAPTERS.map((c) => [c.name, c.level, c.to - c.from]),
    [
      ['Dawn', 'easy', 7],
      ['Tide', 'challenging', 7],
    ]
  );
  // A fresh browser: only level 1 is open.
  const { context, page } = await open({ init: null });
  const locks = () => page.evaluate(() => [...Array(14).keys()].map((i) => window.__runes.locked(i)));
  assert.deepEqual(await locks(), [false, ...Array(13).fill(true)]);
  await page.click('[data-levels]');
  assert.equal(await page.locator('.lv[data-level="2"]').getAttribute('aria-disabled'), 'true');
  await page.locator('.lv[data-level="2"]').click({ force: true });
  assert.equal(await page.evaluate(() => window.__runes.game.index), 0, 'a locked level does not open');
  await page.click('[data-close-levels]');
  // Solving level 1 opens level 2, and only level 2.
  for (const k of ['ArrowRight', 'ArrowRight', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowLeft']) {
    await page.keyboard.press(k);
  }
  assert.deepEqual(await locks(), [false, false, ...Array(12).fill(true)]);
  assert.equal(await page.evaluate(() => window.__runes.nextAfter(0)), 1, 'Next opens level 2');
  // A link to a locked level opens the furthest level open, and says so in the URL.
  await page.goto(`${BASE}runes/#9`);
  await page.reload();
  await page.waitForFunction(() => window.__runes);
  assert.equal(await page.evaluate(() => window.__runes.game.index), 1);
  assert.equal(new URL(page.url()).hash, '#2');
  await context.close();

  // With levels 1 to 7 solved, Next after 7 opens 8; after the last level, the level select.
  const s = await open({ init: () => localStorage.setItem('runes-solved', '[0,1,2,3,4,5,6]') });
  assert.equal(await s.page.evaluate(() => window.__runes.nextAfter(6)), 7);
  assert.equal(await s.page.evaluate(() => window.__runes.locked(8)), true, 'level 9 waits for level 8');
  assert.equal(await s.page.evaluate(() => window.__runes.nextAfter(13)), -1);
  await s.context.close();

  // Entering the game (no level in the URL, or one that names no level) opens the furthest level
  // open, and the URL says which.
  const mid = await open({ init: () => localStorage.setItem('runes-solved', '[0,1,2]') });
  for (const h of ['', '#0', '#99', '#abc']) {
    await mid.page.goto(`${BASE}runes/${h}`);
    await mid.page.reload();
    await mid.page.waitForFunction(() => window.__runes);
    assert.equal(await mid.page.evaluate(() => window.__runes.game.index), 3, `'${h}' opens level 4`);
    assert.equal(new URL(mid.page.url()).hash, '#4', `'${h}' is rewritten`);
  }
  // A URL naming an open level still opens it.
  await mid.page.goto(`${BASE}runes/#2`);
  await mid.page.reload();
  await mid.page.waitForFunction(() => window.__runes);
  assert.equal(await mid.page.evaluate(() => window.__runes.game.index), 1);
  await mid.context.close();
  const fresh = await browser.newContext();
  const fp = await fresh.newPage();
  await fp.goto(`${BASE}runes/`);
  await fp.waitForFunction(() => window.__runes);
  assert.equal(await fp.evaluate(() => window.__runes.game.index), 0, 'a fresh browser starts at level 1');
  await fresh.close();
});

test('runes AC-11: Hint cuts back to the start shared with a solution and marks its next stone', async () => {
  const { context, page } = await open({ hash: '2' });
  const { sol, wrong } = await page.evaluate(() => {
    const r = window.__runes;
    const sol = r.game.solutions[0];
    // Two right steps, then a wrong one.
    r.stepTo(sol[1]);
    r.stepTo(sol[2]);
    const wrong = r.rules.moves(r.game.s).find((m) => m !== sol[3]);
    r.stepTo(wrong);
    return { sol, wrong };
  });
  assert.ok(wrong != null, 'level 2 has a wrong turn at its third step');
  await page.click('[data-hint]');
  assert.deepEqual(await path(page), sol.slice(0, 3));
  assert.equal(await page.evaluate(() => window.__runes.game.hintCell), sol[3]);
  // A tie: two solutions share the same start with the line (just the source); the first listed wins.
  const tie = await page.evaluate(() => {
    const r = window.__runes;
    r.loadBoard(['Soo', 'ooo', 'ooG']);
    const sols = r.game.solutions;
    r.hint();
    return { first: sols[0][1], second: sols[1] && sols[1][1], hint: r.game.hintCell };
  });
  assert.ok(tie.second != null && tie.second !== tie.first, 'the board has two solutions that part at the first step');
  assert.equal(tie.hint, tie.first, 'the first listed solution wins the tie');
  await context.close();
});

test('runes AC-12: the chime climbs with the line and falls on a Restart; Rise, Sink and solving have their sounds; mute silences all', async () => {
  const { context, page } = await open();
  await page.evaluate(() => {
    const r = window.__runes;
    window.__log = [];
    const play = r.sound.play.bind(r.sound);
    r.sound.play = (name, opts = {}) => {
      if (!r.sound.muted) window.__log.push([name, opts.rate ?? 1]);
      play(name, opts);
    };
  });
  const log = () => page.evaluate(() => window.__log.splice(0));
  for (const k of ['ArrowRight', 'ArrowRight', 'ArrowDown']) await page.keyboard.press(k);
  const chimes = (await log()).filter(([n]) => n === 'chime').map(([, r]) => r);
  assert.equal(chimes.length, 3);
  assert.ok(chimes[0] < chimes[1] && chimes[1] < chimes[2], `rates climb: ${chimes}`);
  await page.keyboard.press('r');
  const back = (await log()).find(([n]) => n === 'chime');
  assert.ok(back[1] < chimes[2], 'a Restart plays a falling note');
  for (const k of ['ArrowRight', 'ArrowRight', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowLeft']) await page.keyboard.press(k);
  assert.ok((await log()).some(([n]) => n === 'solved'), 'solving plays the jingle');
  await page.evaluate(() => window.__runes.loadBoard(['SR.', 'o..', 'G..']));
  await page.evaluate(() => window.__runes.stepTo(1));
  assert.ok((await log()).some(([n]) => n === 'rise'), 'a Rise plays its sound');
  await page.evaluate(() => {
    const r = window.__runes;
    r.loadBoard(['SKo', 'ooo', 'Goo']);
    r.stepTo(1);
    r.stepTo(4);
  });
  assert.ok((await log()).some(([n]) => n === 'sink'), 'a Sink plays its sound');
  // Muted: nothing reaches the speakers.
  await page.click('[data-mute]');
  const playedBefore = await page.evaluate(() => window.__played.length);
  await page.evaluate(() => {
    const r = window.__runes;
    r.loadLevel(0);
    r.stepTo(1);
    r.stepTo(2);
  });
  assert.equal(await page.evaluate(() => window.__played.length), playedBefore, 'nothing plays while muted');
  await context.close();
});

test('runes AC-13: hiding the page ends a drag, keeps the line and suspends the sound', async () => {
  const { context, page } = await open();
  await page.evaluate(() => {
    window.__suspended = 0;
    window.__runes.sound.suspend = () => window.__suspended++;
  });
  const c = await cellSize(page);
  await drag(page, 100, 700, 0.62 * c, 0, { end: false });
  assert.deepEqual(await path(page), [0, 1]);
  assert.equal(await page.evaluate(() => window.__runes.dragging()), true);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  assert.equal(await page.evaluate(() => window.__runes.dragging()), false, 'the drag ended');
  assert.deepEqual(await path(page), [0, 1], 'the line stayed');
  assert.equal(await page.evaluate(() => window.__suspended), 1, 'the sound was suspended');
  await context.close();
});

for (const viewport of [
  { width: 360, height: 640 },
  { width: 390, height: 844 },
]) {
  test(`runes AC-14: at ${viewport.width} × ${viewport.height} a 6 × 8 board fits, with big enough cells and buttons, and no scroll`, async () => {
    const { context, page } = await open({ viewport });
    await board(page, ['Sooooo', 'oooooo', 'oooooo', 'oooooo', 'oooooo', 'oooooo', 'oooooo', 'oooooG']);
    const m = await page.evaluate(() => {
      const r = window.__runes;
      const b = r.box;
      const L = r.game.level;
      const bar = document.querySelector('.bar').getBoundingClientRect();
      const title = document.querySelector('.title').getBoundingClientRect();
      const buttons = [...document.querySelectorAll('.round, .shell-back')].map((el) => el.getBoundingClientRect());
      return {
        cell: b.cell,
        left: b.ox,
        right: innerWidth - (b.ox + b.cell * L.w),
        top: b.oy,
        bottom: b.oy + b.cell * (L.h + 0.2),
        barTop: bar.top,
        titleBottom: title.bottom,
        minButton: Math.min(...buttons.map((r) => Math.min(r.width, r.height))),
        scroll: document.documentElement.scrollHeight - innerHeight,
      };
    });
    assert.ok(m.cell >= 44, `cells are ${m.cell} px`);
    assert.ok(m.left >= 16 && m.right >= 16, `side margins ${m.left} and ${m.right}`);
    assert.ok(m.top >= m.titleBottom, 'the board is below the title');
    assert.ok(m.bottom <= m.barTop, 'the board is above the bar');
    assert.ok(m.minButton >= 44, `buttons are at least ${m.minButton} px`);
    assert.ok(m.scroll <= 0, 'the page does not scroll');
    await context.close();
  });
}

test('runes AC-15, slow-tests-orbit-reef-runes AC-12: on level 1 a ghost light shows the first steps after a pause, again later, and stops once the line moves', async () => {
  const { context, page } = await open();
  await page.evaluate(() => {
    const r = window.__runes;
    r.knobs.ghostDelay = 400; // the real delays are 4 s and 8 s
    r.knobs.ghostRepeat = 800;
    r.game.lastInput = performance.now();
  });
  await waitFor(page, () => window.__runes.game.ghost.shows >= 1, null, { what: 'the first ghost' });
  await waitFor(page, () => window.__runes.game.ghost.shows >= 2, null, { what: 'the second ghost' });
  await page.keyboard.press('ArrowRight');
  const { n, at } = await page.evaluate(() => ({ n: window.__runes.game.ghost.shows, at: performance.now() }));
  // Past the repeat delay and a whole show (1.6 s), with a second to spare, on the page's clock; then
  // frames drawn after it. A ghost still due would have shown by now.
  await waitFor(page, (t) => performance.now() > t, at + 800 + 1600 + 1000, { what: 'the repeat delay and a show have passed' });
  await realFrames(page, 30);
  assert.equal(await page.evaluate(() => window.__runes.game.ghost.shows), n, 'no more ghosts once the line moved');
  await context.close();
});

test('runes AC-16: the head next to a Rise previews what it raises; the head on a Sink, what it sinks', async () => {
  const { context, page } = await open();
  await board(page, ['SoR.', 'o..o', 'Gooo']);
  await page.evaluate(() => window.__runes.stepTo(1));
  // The Rise (2) would raise 3 and 6; 1 is lit.
  assert.deepEqual((await page.evaluate(() => window.__runes.preview().cells)).sort(), [3, 6]);
  await board(page, ['SKo', 'oRo', 'Goo']);
  await page.evaluate(() => window.__runes.stepTo(1));
  // On the Sink (1): its plain neighbour 2 would sink; 0 is lit and 4 is a Rise.
  assert.deepEqual(await page.evaluate(() => window.__runes.preview().cells), [2]);
  await context.close();
});

test('runes AC-18: with localStorage throwing, the game plays and solves a level without errors', async () => {
  const { context, page, errors } = await open({
    init: () => {
      Storage.prototype.getItem = () => {
        throw new Error('blocked');
      };
      Storage.prototype.setItem = () => {
        throw new Error('blocked');
      };
    },
  });
  for (const k of ['ArrowRight', 'ArrowRight', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowLeft']) {
    await page.keyboard.press(k);
  }
  assert.equal(await page.evaluate(() => window.__runes.game.done), true);
  await page.locator('[data-result][data-kind="solved"]').waitFor({ state: 'visible' });
  assert.deepEqual(errors, []);
  await context.close();
});

test('runes AC-19, slow-tests-orbit-reef-runes AC-4: Runes plays offline once it has been played', async () => {
  const { context, page } = await open();
  await registerWorker(page);
  await page.reload(); // controlled now: this load caches the game's files
  await page.waitForFunction(() => window.__runes);
  await cachedAll(page);
  await context.setOffline(true);
  await page.reload();
  await page.waitForFunction(() => window.__runes);
  await page.keyboard.press('ArrowRight');
  assert.deepEqual(await path(page), [0, 1]);
  await context.close();
});

test('runes AC-20, slow-tests-orbit-reef-runes AC-13: a line that ends unsolved shows a loud panel below the board with why, and a tip; Try again restarts', async () => {
  const { context, page } = await open({ hash: '2' });
  // Level 2: stepping onto the gate with stones still dark.
  const toGate = await page.evaluate(() => {
    const r = window.__runes;
    const s = r.game.s;
    const L = r.game.level;
    // A shortest line from the source to the gate.
    const prev = new Map([[L.source, -1]]);
    const queue = [L.source];
    while (queue.length) {
      const c = queue.shift();
      for (let d = 0; d < 4; d++) {
        const n = r.rules.neighbour(L, c, d);
        if (n >= 0 && s.up[n] && !prev.has(n)) {
          prev.set(n, c);
          queue.push(n);
        }
      }
    }
    const line = [];
    for (let c = L.gate; c !== -1; c = prev.get(c)) line.unshift(c);
    return line;
  });
  for (const c of toGate.slice(1)) await page.evaluate((c) => window.__runes.stepTo(c), c);
  const panel = page.locator('[data-result][data-kind="failed"]');
  await panel.waitFor({ state: 'visible' });
  // The state: the bar gives way to the panel, the missed stones are outlined, and keys and drags
  // move nothing.
  assert.equal(await page.locator('.bar').isVisible(), false, 'the bar is hidden');
  const dark = await page.evaluate(() => {
    const s = window.__runes.game.s;
    return [...s.up].map((u, i) => (u && !s.lit[i] ? i : -1)).filter((i) => i >= 0);
  });
  assert.ok(dark.length > 0);
  assert.deepEqual(await page.evaluate(() => window.__runes.missed()), dark, 'every dark stone is outlined');
  const ended = await path(page);
  for (const k of ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']) await page.keyboard.press(k);
  const cs = await cellSize(page);
  await drag(page, 100, 300, -cs, 0);
  await drag(page, 100, 300, 0, -cs);
  assert.deepEqual(await path(page), ended, 'no keys or drags once the attempt ended');
  assert.match(await panel.textContent(), /didn’t make it/);
  assert.match(await panel.textContent(), /still dark/);
  assert.match(await page.locator('[data-result-tip]').textContent(), /Light every stone before you step on the gate/);
  // The panel sits below the board, never over it: measured once its slide-in has finished.
  await settled(page, '[data-result]');
  const m = await page.evaluate(() => {
    const r = window.__runes;
    return {
      boardBottom: r.box.oy + r.box.cell * (r.game.level.h + 0.2),
      panelTop: document.querySelector('[data-result]').getBoundingClientRect().top,
    };
  });
  assert.ok(m.boardBottom <= m.panelTop, `board ends at ${m.boardBottom}, panel starts at ${m.panelTop}`);
  assert.equal(await panel.locator('[data-result-undo]').count(), 0, 'no Undo on the panel');
  await page.click('[data-again]');
  await panel.waitFor({ state: 'hidden' });
  assert.equal(await page.evaluate(() => window.__runes.game.failed), false);

  // A dead end away from the gate: the line has nowhere to go.
  const stuck = await page.evaluate(() => {
    const r = window.__runes;
    r.restart();
    const s = r.game.s;
    const L = r.game.level;
    const open = () => [0, 1, 2, 3].map((d) => r.rules.neighbour(L, r.rules.head(s), d)).filter((n) => n >= 0 && !r.rules.blocked(s, n));
    function walk() {
      const m = open();
      if (!m.length && r.rules.head(s) !== L.gate) return s.path.slice();
      for (const n of m) {
        if (n === L.gate) continue;
        r.rules.step(s, n);
        const found = walk();
        r.rules.back(s);
        if (found) return found;
      }
      return null;
    }
    return walk();
  });
  assert.ok(stuck, 'level 2 has a dead end');
  for (const c of stuck.slice(1)) await page.evaluate((c) => window.__runes.stepTo(c), c);
  await panel.waitFor({ state: 'visible' });
  assert.match(await page.locator('[data-result-tip]').textContent(), /way in and a way out/);
  await page.click('[data-again]');
  await panel.waitFor({ state: 'hidden' });
  assert.deepEqual(await path(page), [await page.evaluate(() => window.__runes.game.level.source)], 'Try again restarts');
  // A tip for each rune's trap.
  const tips = await page.evaluate(() => window.__runes.tips);
  assert.match(tips.rise, /Rise/);
  assert.match(tips.sink, /Sink/);
  await context.close();
});

test('runes AC-21: with a mouse, the cursor is a hand over stones the line can act on, a closed hand while dragging, and the arrow elsewhere', async () => {
  const { context, page } = await open();
  const cursor = () => page.evaluate(() => getComputedStyle(document.querySelector('#pool')).cursor);
  const at = async (c) => center(page, c);
  const mouse = async (x, y) => {
    await page.evaluate(
      ({ x, y }) => document.querySelector('#pool').dispatchEvent(new PointerEvent('pointermove', { clientX: x, clientY: y, pointerType: 'mouse', bubbles: true })),
      { x, y }
    );
  };
  let p = await at(1); // a stone next to the head
  await mouse(p.x, p.y);
  assert.equal(await cursor(), 'pointer');
  p = await at(0); // the head
  await mouse(p.x, p.y);
  assert.equal(await cursor(), 'pointer');
  await page.evaluate(() => {
    window.__runes.stepTo(1);
    window.__runes.stepTo(2);
  });
  p = await at(1); // a lit stone (not the head): nothing to do there
  await mouse(p.x, p.y);
  assert.equal(await cursor(), 'auto');
  await page.evaluate(() => window.__runes.restart());
  p = await at(3); // water
  await mouse(p.x, p.y);
  assert.equal(await cursor(), 'auto');
  p = await at(8); // a stone too far away
  await mouse(p.x, p.y);
  assert.equal(await cursor(), 'auto');
  // While dragging: a closed hand.
  const c = await cellSize(page);
  p = await at(0);
  await pointer(page, 'pointerdown', 1, p.x, p.y);
  for (let i = 1; i <= 6; i++) await pointer(page, 'pointermove', 1, p.x + (c * 0.3 * i) / 6, p.y);
  assert.equal(await cursor(), 'grabbing');
  await pointer(page, 'pointerup', 1, p.x + c * 0.3, p.y);
  await context.close();
});

test('runes AC-22: every button at the bottom says what it does on hover', async () => {
  const { context, page } = await open();
  for (const sel of ['[data-levels]', '[data-restart]', '[data-hint]', '[data-guidance]']) {
    const title = await page.locator(sel).getAttribute('title');
    assert.ok(title && title.length > 3, `${sel} has a hover label`);
  }
  assert.equal(await page.locator('[data-guidance]').getAttribute('title'), 'Guidance: show tiles that become unreachable');
  await context.close();
});

test('runes AC-23, slow-tests-orbit-reef-runes AC-13: the level select names each chapter with its difficulty, locks what can’t be opened yet, ticks solved levels, and sits on the board', async () => {
  const { context, page } = await open({ init: () => localStorage.setItem('runes-solved', '[0,1]') });
  await page.click('[data-levels]');
  const names = await page.locator('.ch-name').allTextContents();
  assert.deepEqual(names, ['Dawn (easy)', 'Tide (challenging)']);
  assert.equal(await page.locator('.lv.is-locked').count(), 11, 'levels 4 to 14 are locked');
  assert.equal(await page.locator('.lv[data-level="4"] svg').count(), 1, 'a locked level shows a lock');
  assert.equal(await page.locator('.lv.is-solved').count(), 2);
  await settled(page, '[data-screen="levels"]'); // the card's slide-in
  const m = await page.evaluate(() => {
    const r = window.__runes;
    const card = document.querySelector('[data-screen="levels"]').getBoundingClientRect();
    return {
      card: (card.top + card.bottom) / 2,
      board: r.box.oy + (r.box.cell * (r.game.level.h + 0.2)) / 2,
      top: card.top,
      bottom: card.bottom,
    };
  });
  assert.ok(m.top >= 16 && m.bottom <= 844 - 16, 'inside the screen');
  assert.ok(Math.abs(m.card - m.board) <= 2, `card centre ${m.card}, board centre ${m.board}`);
  await context.close();
});

test('runes AC-25: in Runes, the back button always asks, even before any move, after solving and on the level select', async () => {
  const { context, page } = await open();
  const ask = page.locator('dialog.shell-leave');
  const backAsks = async (where) => {
    await page.locator('.shell-back').click();
    await ask.waitFor({ state: 'visible' });
    assert.match(await ask.textContent(), /Leave this level\?/);
    assert.match(await ask.textContent(), /Your progress on this level will be lost\./);
    await page.locator('[data-shell-stay]').click();
    await ask.waitFor({ state: 'hidden' });
    assert.equal(new URL(page.url()).pathname, '/runes/', `Stay keeps you in the game (${where})`);
  };
  await backAsks('before any move');
  await page.keyboard.press('ArrowRight');
  await backAsks('a line drawn');
  assert.deepEqual(await path(page), [0, 1], 'Stay keeps the line');
  await page.click('[data-levels]');
  await backAsks('on the level select');
  await page.click('[data-close-levels]');
  for (const k of ['ArrowRight', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowLeft']) await page.keyboard.press(k);
  await page.locator('[data-result][data-kind="solved"]').waitFor({ state: 'visible' });
  await backAsks('a solved level');
  await page.locator('.shell-back').click();
  await page.locator('[data-shell-leave]').click();
  await page.waitForURL(BASE);
  await context.close();
});

test('runes AC-26, slow-tests-orbit-reef-runes AC-14: a refresh or closing the tab warns only while there is an unsaved line', async () => {
  const { context, page } = await open();
  // Whichever comes first: the warning, or the tab closing.
  const warned = async () => {
    const dialog = page.waitForEvent('dialog').catch(() => null);
    const closed = page.waitForEvent('close').then(() => null, () => null);
    page.close({ runBeforeUnload: true }).catch(() => {});
    const d = await within(Promise.race([dialog, closed]), 'a beforeunload warning or the tab closing');
    if (!d) return '';
    await d.dismiss();
    await page.evaluate(() => true); // still answers: dismissing it stays
    return d.type();
  };
  await page.keyboard.press('ArrowRight'); // a line, and the user's gesture the browser asks for
  assert.equal(await warned(), 'beforeunload', 'an unsaved line warns');
  assert.equal(page.isClosed(), false, 'dismissing the warning stays');
  await page.keyboard.press('r'); // Restart: nothing left to lose
  assert.equal(await warned(), '', 'no line, no warning');
  assert.equal(page.isClosed(), true, 'and the tab closes');
  await context.close();
});

// The game counts a pointer as a tap only if it lifts within 300 ms. A busy page between the test's
// pointerdown and pointerup (here a 400 ms task queued from each pointerdown) must not turn a tap into
// nothing: tapCell sends both in one call.
test('slow-tests-orbit-reef-runes AC-9: a tap steps the line even when the page is busy right after its pointerdown', async () => {
  const { context, page } = await open();
  await page.evaluate(() =>
    document.querySelector('#pool').addEventListener('pointerdown', () =>
      setTimeout(() => {
        const end = performance.now() + 400;
        while (performance.now() < end);
      }, 0)
    )
  );
  await tapCell(page, 1);
  assert.deepEqual(await path(page), [0, 1]);
  await context.close();
});

// This slice's three files are marked, and the marked-file rule holds in each (the fast tier's
// tests/clock-check.test.mjs checks the same rule for every marked file).
test('slow-tests-orbit-reef-runes AC-15: the Orbit, Reef and Runes test files are clock-checked, with no unexplained fixed wait', async () => {
  const { readFile } = await import('node:fs/promises');
  for (const name of ['orbit', 'reef', 'runes']) {
    const lines = (await readFile(new URL(`./${name}.test.mjs`, import.meta.url), 'utf8')).split('\n');
    assert.ok(lines.slice(0, 10).some((l) => l.includes('// clock-checked')), `${name} is marked`);
    lines.forEach((l, i) => {
      if (!/waitForTimeout\(/.test(l) || /^\s*\/\//.test(l) || l.includes("'waitForTimeout(")) return;
      assert.ok(/\/\/ safe: \w/.test(l) || /\/\/ safe: \w/.test(lines[i - 1] || ''), `${name}.test.mjs:${i + 1} waits a fixed time with no reason`);
    });
  }
});

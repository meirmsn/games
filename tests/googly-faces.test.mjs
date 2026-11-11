// End-to-end tests for Googly Faces (googly-faces/).
// Run: scripts/check-slow.sh (serves the site and runs these with Playwright's Chromium).
// clock-checked: the game runs on its real loop only, so each test waits on a frame, an input the
// page has seen, the game's state or the game's own time, never a fixed time
// (specs/slow-tests-crumble-googly.md, which also holds this file's guard tests).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { statSync } from 'node:fs';
import { serve } from './serve.mjs';
import { launch, waitFor, within } from './clock.mjs';
import { FAKE_AUDIO } from './fake-audio.mjs';

let BASE; // set in before(), from tests/serve.mjs
let GAME;
const SOUND_FILES = 23; // the game's 22 and the shell's back sound
let server;
let browser;

before(async () => {
  server = await serve();
  BASE = server.base;
  GAME = BASE + 'googly-faces/';
  browser = await launch();
});

after(async () => {
  await browser?.close();
  server?.close();
});

// What the page has seen of the pointer, recorded before the game's handlers (capture, on window),
// and the game's own time: the game steps each frame by its interval capped at 1/20 s
// (googly-faces/game.js ~986) and shows no clock, so this counts the page's frames the same way.
// It starts a frame later than the game's, so it never runs ahead of it.
const SEEN = () => {
  const s = (window.__seen = { down: 0, end: 0, move: null });
  addEventListener('pointerdown', () => s.down++, true);
  for (const t of ['pointerup', 'pointercancel']) addEventListener(t, () => s.end++, true);
  addEventListener('pointermove', (e) => (s.move = [e.clientX, e.clientY]), true);
  window.__gameT = 0;
  let last = null;
  const tick = (now) => {
    if (last !== null) window.__gameT += Math.min((now - last) / 1000, 1 / 20);
    last = now;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
};

// Every animation frame takes at least `ms`: frames slow on purpose, on any machine (the guards).
const SLOW_FRAMES = (ms) => {
  const busy = () => {
    const t = performance.now();
    while (performance.now() - t < ms);
    requestAnimationFrame(busy);
  };
  requestAnimationFrame(busy);
};

// Open the game on a phone-sized touch screen, with the stand-in audio unless told otherwise.
// `slowFrames` makes every frame take that many ms, on a context the harness doesn't throttle.
async function openGame({ fakeAudio = true, muted = false, url = GAME, slowFrames = 0 } = {}) {
  const context = await browser.newContext({
    hasTouch: true,
    isMobile: true,
    viewport: { width: 390, height: 844 },
    ...(slowFrames ? { throttle: false } : {}),
  });
  await context.addInitScript(SEEN);
  if (slowFrames) await context.addInitScript(SLOW_FRAMES, slowFrames);
  if (fakeAudio) await context.addInitScript(FAKE_AUDIO);
  if (muted) await context.addInitScript(() => localStorage.setItem('sound', 'off'));
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(url);
  await page.waitForFunction(() => document.documentElement.dataset.ready === 'true');
  if (fakeAudio) await page.waitForFunction((n) => window.__decoded >= n, SOUND_FILES);
  return { context, page, errors };
}

const state = (page) => page.evaluate(() => window.googly.state);
const gameTime = (page) => page.evaluate(() => window.__gameT);

// Waits until `s` seconds of the game's time have passed since `from` (a gameTime reading).
const untilGameTime = (page, from, s) =>
  waitFor(page, (t) => window.__gameT >= t, from + s, { what: `${s} s of the game's time`, timeout: 20000 });

// Runs `act` (a tap or click), then waits until the page has seen its press and its release.
async function seenAfter(page, act) {
  const b = await page.evaluate(() => ({ down: window.__seen.down, end: window.__seen.end }));
  await act();
  await waitFor(page, ({ down, end }) => window.__seen.down >= down && window.__seen.end >= end, { down: b.down + 1, end: b.end + 1 }, { what: 'the page seeing the press and the release' });
}
const tapAt = (page, x, y) => seenAfter(page, () => page.touchscreen.tap(x, y));

// Runs `fn(arg)` in the page on every animation frame until it returns something other than
// undefined, and returns that; fails after `ms` (scaled by the throttle) naming `what`.
async function eachFrame(page, fn, arg, what, ms = 20000) {
  const f = await page.evaluateHandle(`(${fn})`); // the function itself, not its result
  try {
    return await within(
      page.evaluate(
        ([f, arg]) =>
          new Promise((done, fail) => {
            const tick = () => {
              let r;
              try {
                r = f(arg);
              } catch (e) {
                return fail(e);
              }
              if (r !== undefined) done(r);
              else requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
          }),
        [f, arg]
      ),
      what,
      ms
    );
  } finally {
    await f.dispose().catch(() => {});
  }
}

// Wait for a face that has finished popping up, and return it.
async function readyFace(page) {
  const handle = await page.waitForFunction(() =>
    window.googly.state.faces.find((f) => f.phase === 'idle')
  );
  return handle.jsonValue();
}

test('the game loads with no errors and a face pops up', async () => {
  const { context, page, errors } = await openGame({ fakeAudio: false });
  const face = await readyFace(page);
  assert.ok(face.size >= 96, `faces are big tap targets (${face.size} px)`);
  const box = await page.locator('.gf-stage').boundingBox();
  assert.deepEqual([box.width, box.height], [390, 844], 'the canvas fills the screen');
  await page.waitForLoadState('networkidle');
  assert.deepEqual(errors, []);
  await context.close();
});

// Every few seconds each face hops or wobbles on its own, and the pupils fly up for a moment, as
// they should. So rather than one look at one instant: watch every frame for one where every face
// on the ground has its pupils down, at least `after` s of the game's time from now, checking on
// every frame that no pupil leaves its eye.
async function pupilsRestAtBottom(page, { after = 0 } = {}) {
  const from = await gameTime(page);
  const r = await eachFrame(
    page,
    ({ until }) => {
      const { faces } = window.googly.state;
      for (const f of faces)
        for (const p of f.pupils) if (Math.hypot(p.x, p.y) > 0.4) return { outside: `face ${f.id}: (${p.x.toFixed(2)}, ${p.y.toFixed(2)})` };
      const ground = faces.filter((f) => f.phase === 'idle' && f.hop < 0.5);
      const ys = ground.flatMap((f) => f.pupils.map((p) => p.y));
      if (window.__gameT >= until && ys.length && ys.every((y) => y > 0.15)) return {};
      window.__restLast = ys.map((y) => y.toFixed(2)).join(', ');
    },
    { until: from + after },
    'the pupils resting at the bottom'
  ).catch(async (e) => {
    assert.fail(`the pupils never all rested at the bottom (last y: ${await page.evaluate(() => window.__restLast)}): ${e.message}`);
  });
  assert.equal(r.outside, undefined, `every pupil stays inside its eye (${r.outside})`);
}

test('the pupils fall to the bottom of the eyes and stay inside them', async () => {
  const { context, page } = await openGame({ fakeAudio: false });
  await readyFace(page);
  await pupilsRestAtBottom(page, { after: 1.5 });
  await context.close();
});

// Tap a face and return it as it is on the first frame it is more than 10 px up: one frame after the
// tap is enough, so this waits for that frame, not for a time.
async function tapAndJump(page, face) {
  await tapAt(page, face.x, face.y);
  return eachFrame(page, (id) => window.googly.state.faces.find((f) => f.id === id && f.hop > 10), face.id, `face ${face.id} jumping`);
}

async function reactsAndJumps(page, face) {
  const before = face.pupils.map((p) => ({ ...p }));
  const now = await tapAndJump(page, face);
  assert.equal(now.phase, 'react');
  assert.equal(now.mouth, 'o', 'its mouth opens');
  assert.ok(now.hop > 10, 'it jumps');
  const moved = now.pupils.some((p, i) => Math.hypot(p.x - before[i].x, p.y - before[i].y) > 0.05);
  assert.ok(moved, 'its pupils move');
  return now;
}

const BOING = [1, 2, 3, 4].map((i) => statSync(new URL(`../googly-faces/sounds/boing-${i}.mp3`, import.meta.url)).size);

test('tapping a face plays a sound and makes it react', async () => {
  const { context, page } = await openGame();
  const face = await readyFace(page);
  const now = await reactsAndJumps(page, face);

  const played = await page.evaluate(() => window.__played);
  assert.ok(played.length >= 1, 'a sound plays');
  assert.equal(played[0].state, 'running', 'the tap unlocked audio');
  assert.notEqual(played[0].rate, 1, 'the pitch is varied');
  assert.equal((await state(page)).taps, 1, 'it counts');

  // A second tap on the same face, where it is now, plays its boing again but doesn't count twice.
  const at = (await state(page)).faces.find((f) => f.id === now.id);
  const count = await page.evaluate(() => window.__played.length);
  await tapAt(page, at.x, at.y);
  const again = (await page.evaluate(() => window.__played)).slice(count);
  assert.ok(again.some((p) => BOING.includes(p.bytes)), 'the tap hit the face: a boing played');
  assert.equal((await state(page)).taps, 1);

  // Then it lands with a new expression and ducks away.
  await waitFor(page, (id) => !window.googly.state.faces.some((f) => f.id === id && f.phase !== 'out'), face.id, { what: `face ${face.id} ducking away`, timeout: 20000 });
  await context.close();
});

// The check for the tap: with every frame 250 ms long, tapAndJump still sees the face react and jump,
// since it waits for the frame that lifts it, not 120 ms. (It doesn't fail the old 120 ms wait: a
// busy frame holds back the test's read too; that wait failed only when frames came late while the
// page sat idle. See specs/slow-tests-crumble-googly.md.)
test('slow-tests-crumble-googly AC-5: a tapped face reacts and jumps with every frame 250 ms long', async () => {
  const { context, page } = await openGame({ slowFrames: 250 });
  await reactsAndJumps(page, await readyFace(page));
  await context.close();
});

test('slow-tests-crumble-googly AC-8: mute is respected, and the sound button changes it for the whole site', async () => {
  const { context, page } = await openGame({ muted: true });
  const btn = page.locator('[data-sound-toggle]');
  assert.equal(await btn.getAttribute('aria-pressed'), 'true');
  const face = await readyFace(page);
  await tapAt(page, face.x, face.y);
  // The game plays a giggle or a flourish 120 or 140 ms after the tap, on a timer its pointerdown
  // queued; a 200 ms timer queued after that runs after it.
  await within(page.evaluate(() => new Promise((r) => setTimeout(r, 200))), 'a 200 ms timer in the page');
  assert.equal((await page.evaluate(() => window.__played)).length, 0, 'nothing plays while muted');

  await seenAfter(page, () => btn.tap()); // unmute
  assert.equal(await btn.getAttribute('aria-pressed'), 'false');
  assert.ok((await page.evaluate(() => window.__played)).length >= 1, 'unmuting plays again');
  assert.equal(await page.evaluate(() => localStorage.getItem('sound')), null, 'saved for the site');
  await context.close();
});

// Waits until every pupil looks towards a point: each eye's median over its last six frames, since
// a face's own hop can tug its pupils for an instant.
async function eyesLookAt(page, x, y, what) {
  const r = await eachFrame(
    page,
    ({ x, y }) => {
      const along = (window.__along ??= {});
      const live = window.googly.state.faces.filter((g) => g.phase !== 'out');
      let ok = live.length > 0;
      let worst = null;
      for (const o of live) {
        const d = Math.hypot(x - o.x, y - o.y);
        o.pupils.forEach((p, k) => {
          const v = (along[`${o.id}.${k}`] ??= []);
          v.push((p.x * (x - o.x) + p.y * (y - o.y)) / d);
          if (v.length > 6) v.shift();
          const m = v.length < 6 ? -Infinity : [...v].sort((a, b) => a - b)[3];
          if (!worst || m < worst.m) worst = { eye: `${o.id}.${k}`, m };
          if (!(m > 0.25)) ok = false;
        });
      }
      window.__lookWorst = worst;
      if (ok) {
        delete window.__along;
        return worst;
      }
    },
    { x, y },
    `every eye looking at ${what}`,
    10000
  ).catch(async (e) => {
    const w = await page.evaluate(() => window.__lookWorst);
    assert.fail(`pupil ${w?.eye} doesn't look at ${what} (${w?.m?.toFixed(2)} eye radii towards it): ${e.message}`);
  });
  assert.ok(r.m > 0.25);
}

test('slow-tests-crumble-googly AC-9: tapping empty space is answered too, and the eyes follow the pointer for a moment', async () => {
  const { context, page } = await openGame();
  await readyFace(page);
  const { faces } = await state(page);
  const f = faces[0];
  // Up in the sky, on the other side from the face: the eyes have to look up, against gravity.
  const x = f.x < 195 ? 340 : 50;
  const y = 110;
  await tapAt(page, x, y);
  const tapped = await gameTime(page);
  assert.equal((await page.evaluate(() => window.__played)).length, 1);
  assert.equal((await state(page)).taps, 0);

  // Every eye looks at the spot...
  await eyesLookAt(page, x, y, 'the tap');
  // ...and follows the pointer as it moves, here level with the face on its far side...
  const x2 = f.x < 195 ? 5 : 385;
  await page.mouse.move(x2, f.y);
  await waitFor(page, ([x, y]) => !!window.__seen.move && Math.abs(window.__seen.move[0] - x) <= 0.5 && Math.abs(window.__seen.move[1] - y) <= 0.5, [x2, f.y], { what: 'the page seeing the pointer move' });
  await eyesLookAt(page, x2, f.y, 'the pointer');
  // ...then, once the look has held (2 s of the game's time) and let go (0.35 s), rolls loose again,
  // back to the bottom.
  await untilGameTime(page, tapped, 2.35);
  await pupilsRestAtBottom(page);
  await context.close();
});

test('the dot a tap fills swells, pushing the others aside, then settles', async () => {
  const { context, page } = await openGame({ fakeAudio: false });
  const { pips: rest } = await state(page);
  const face = await readyFace(page);
  await tapAt(page, face.x, face.y);
  // The largest swell and push over 0.6 s of the game's time, read on every frame.
  const { biggest, pushed } = await eachFrame(
    page,
    ({ rest, until }) => {
      const { pips } = window.googly.state;
      const m = (window.__pipMax ??= { biggest: 0, pushed: 0 });
      m.biggest = Math.max(m.biggest, pips[0].r / rest[0].r);
      m.pushed = Math.max(m.pushed, pips[1].x - rest[1].x);
      if (window.__gameT >= until) {
        delete window.__pipMax;
        return m;
      }
    },
    { rest, until: (await gameTime(page)) + 0.6 },
    'the dot swelling'
  );
  assert.ok(biggest > 1.8, `the new dot swells (${biggest.toFixed(2)}x)`);
  assert.ok(pushed > 4, `its neighbour moves aside (${pushed.toFixed(1)} px)`);
  // Then it settles: back to size and the row closed up, on 10 frames in a row.
  await eachFrame(
    page,
    (rest) => {
      const { pips } = window.googly.state;
      const still = pips[0].filled && Math.abs(pips[0].r - rest[0].r) < 0.5 && Math.abs(pips[1].x - rest[1].x) < 0.5;
      window.__settled = still ? (window.__settled ?? 0) + 1 : 0;
      if (window.__settled >= 10) {
        delete window.__settled;
        return true;
      }
    },
    rest,
    'the dot settling back to size and the row closing up'
  );
  // The row stays clear of the back and sound buttons.
  const back = await page.locator('.shell-back').boundingBox();
  const snd = await page.locator('[data-sound-toggle]').boundingBox();
  assert.ok(rest[0].x - rest[0].r > back.x + back.width && rest[11].x + rest[11].r < snd.x);
  await context.close();
});

// Tap faces until twelve have counted, then wait for the party and its play-again button. The button
// shows 2.4 s of the game's time after the twelfth tap; with slow frames the game runs slower than
// the clock, so the bound is generous.
async function playRound(page) {
  for (let tries = 0; tries < 40 && (await state(page)).taps < 12; tries++) {
    const f = await readyFace(page);
    await tapAt(page, f.x, f.y);
  }
  assert.equal((await state(page)).taps, 12);
  await waitFor(page, () => window.googly.state.state === 'party', null, { what: 'the party after the twelfth face', timeout: 20000 });
  const again = page.locator('[data-play-again]');
  await again.waitFor({ state: 'visible' });
  // it scales in from 40%: measure it once its entrance has finished, not part-way through
  await within(again.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished))), "play again's entrance");
  return again;
}

test('a round ends after twelve faces, and play again starts a new one', async () => {
  const { context, page } = await openGame();
  const again = await playRound(page);
  const box = await again.boundingBox();
  assert.ok(box.width >= 44 && box.height >= 44, 'play again is a big button');
  assert.equal((await state(page)).state, 'party');
  await seenAfter(page, () => again.tap());
  const s = await state(page);
  assert.equal(s.state, 'play');
  assert.equal(s.taps, 0);
  assert.equal(s.round, 2);
  await again.waitFor({ state: 'hidden' });
  await context.close();
});

// The guard for the round: with every frame 100 ms long, the 2.4 s of the game's time before play
// again shows take about 4.8 s, past the old fixed 5 s wait once the taps' own time is added.
test('slow-tests-crumble-googly AC-6: a round of twelve faces reaches play again with every frame 100 ms long', async () => {
  const { context, page } = await openGame({ slowFrames: 100 });
  await playRound(page);
  assert.equal((await state(page)).state, 'party');
  await context.close();
});

test("the game's back button returns to the landing page", async () => {
  const { context, page } = await openGame({ fakeAudio: false });
  const back = page.locator('.shell-back');
  await back.tap();
  await page.locator('[data-shell-leave]').tap(); // the shell asks before leaving
  await page.waitForURL(BASE);
  await context.close();
});

test('the landing tile opens the game', async () => {
  const context = await browser.newContext({ hasTouch: true });
  const page = await context.newPage();
  await page.goto(BASE);
  const tile = page.locator('a.tile[href="googly-faces/"]');
  assert.equal(await tile.locator('h2').textContent(), 'Googly Faces');
  assert.equal(await tile.locator('.badge').count(), 0, 'no "Coming soon" badge');
  await tile.click();
  await page.waitForURL(GAME);
  await page.waitForFunction(() => document.documentElement.dataset.ready === 'true');
  await context.close();
});

// Wait until the service worker's cache holds a URL; fails, naming it, if it doesn't within 20 s
// (scaled by the throttle). (Not waitForFunction: it takes the promise an async predicate returns
// as true at once.)
async function cached(page, url) {
  await within(
    page.evaluate(async (u) => {
      while (!(await caches.match(u))) await new Promise((r) => setTimeout(r, 100));
    }, url),
    `${url} being cached`,
    20000
  );
}

test('it works offline after one visit straight from a link', async () => {
  const { context, page } = await openGame({ fakeAudio: false });
  await cached(page, GAME);
  await cached(page, GAME + 'sounds/giggle-3.mp3');
  await cached(page, GAME + 'art/eye-pupil.png');
  await cached(page, GAME + 'art/yellow_body_rhombus.png'); // the last body the game loads
  await waitFor(page, () => !!navigator.serviceWorker.controller, null, { what: 'the service worker controlling the page', timeout: 20000 });
  await context.setOffline(true);
  await page.reload();
  await page.waitForFunction(() => document.documentElement.dataset.ready === 'true');
  const face = await readyFace(page);
  await tapAt(page, face.x, face.y);
  assert.equal((await state(page)).taps, 1);
  const art = await page.evaluate(async () => !!(await caches.match('art/red_body_square.png')));
  assert.ok(art, 'every face is cached, not only the ones seen');
  await context.close();
});

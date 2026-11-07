// End-to-end tests for Reef. Run: scripts/check-slow.sh.
// The game exposes window.__reef (state, and a step() that advances the simulation without
// drawing), so these tests can set up a situation and check what the rules do with it.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const PORT = 8900 + Math.floor(Math.random() * 90);
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

async function open(opts = {}) {
  const context = await browser.newContext({ viewport: { width: 1024, height: 700 }, ...opts });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(BASE + 'reef/');
  await page.waitForFunction(() => window.__reef);
  return { context, page, errors };
}

// Empty the reef and wake the player, so a test controls exactly which fish are near it.
// The test then owns the clock: the page's frames only draw, and step() moves the simulation.
async function startEmpty(page) {
  await page.evaluate(() => {
    const r = window.__reef;
    r.manual = true;
    r.npcs().length = 0;
    r.game.feastIn = 999;
    r.game.calm = -999;
    r.game.spawnIn = 999;
    r.player.waiting = false;
    r.player.invul = 0;
  });
}

const steps = (page, n) =>
  page.evaluate((n) => {
    for (let i = 0; i < n; i++) window.__reef.step(1 / 60);
  }, n);

// Ready the player for the next touch: no protection left from the last one.
const ready = (page) =>
  page.evaluate(() => {
    const r = window.__reef;
    r.npcs().length = 0;
    r.player.invul = 0;
    r.player.hurt = 0;
    r.game.lastEat = -10; // no combo from the last fish
  });

// Put a fish of the given size right next to the player and run the simulation for a moment.
async function meet(page, species, size, frames = 30) {
  return page.evaluate(
    ({ species, size, frames }) => {
      const r = window.__reef;
      r.game.spawnIn = 999;
      const p = r.player;
      r.npcs().push({
        kind: 'fish', species, size, x: p.x + 4, y: p.y, vx: 0, vy: 0, dir: 1, speed: 0, face: 1, faceT: 1,
        angle: 0, ph: 0, state: 'tired', t: 9, cool: 9, stamina: 0, leader: null, ox: 0, oy: 0, near: false,
        sated: 0, fade: 1, huntT: 0, prey: null,
      });
      for (let i = 0; i < frames; i++) r.step(1 / 60);
      return { score: r.game.score, lives: r.game.lives, xp: r.game.xp, mode: r.game.mode, fish: r.npcs().length };
    },
    { species, size, frames }
  );
}

test('AC-1: the reef starts straight away, with no card, and nothing bites until you move', async () => {
  const { context, page, errors } = await open();
  const s = await page.evaluate(() => ({
    mode: window.__reef.game.mode,
    waiting: window.__reef.player.waiting,
    cards: document.querySelectorAll('.card:not([hidden])').length,
    fish: window.__reef.npcs().length,
  }));
  assert.deepEqual({ mode: s.mode, waiting: s.waiting, cards: s.cards }, { mode: 'play', waiting: true, cards: 0 });
  assert.ok(s.fish > 5, 'fish are swimming');
  // A predator touching the waiting fish does nothing.
  await page.evaluate(() => {
    const r = window.__reef;
    r.manual = true;
    r.npcs().length = 0;
  });
  assert.equal((await meet(page, 'blue', 70, 10)).lives, 3);
  // The first move wakes it.
  await page.mouse.move(300, 300);
  assert.equal(await page.evaluate(() => window.__reef.player.waiting), false);
  await page.waitForTimeout(300);
  assert.deepEqual(errors, []);
  await context.close();
});

test('AC-2: eating a food fish scores and moves the bar one notch', async () => {
  const { context, page } = await open();
  await startEmpty(page);
  const after = await meet(page, 'pink', 22);
  assert.ok(after.score > 0, 'scored');
  assert.equal(after.xp, 1, 'one fish, one notch');
  assert.equal(after.fish, 0, 'the fish was eaten');
  await context.close();
});

test('AC-2: bigger food is worth more, by (its size / yours) squared', async () => {
  const { context, page } = await open();
  await startEmpty(page);
  const points = async (size) => {
    await ready(page);
    const before = await page.evaluate(() => window.__reef.game.score);
    const p = await page.evaluate(() => window.__reef.player.size);
    const after = await meet(page, 'orange', size, 3);
    return { pts: after.score - before, ratio: size / p };
  };
  const small = await points(20);
  const big = await points(36);
  const expected = (big.ratio / small.ratio) ** 2;
  assert.ok(Math.abs(big.pts / small.pts - expected) < 0.4, `${big.pts} vs ${small.pts}, expected ×${expected.toFixed(2)}`);
  await context.close();
});

test('AC-15: food is told by colour: orange, green and pink are food, the rest bite', async () => {
  const { context, page } = await open();
  await startEmpty(page);
  // A big orange fish is still food...
  let s = await meet(page, 'orange', 80, 3);
  assert.equal(s.xp, 1, 'ate the big orange fish');
  // ...and a small blue fish still bites.
  await ready(page);
  s = await meet(page, 'blue', 30, 3);
  assert.equal(s.lives, 2, 'bitten by the small blue fish');
  await context.close();
});

test('AC-16: depths take 4, 7, 11, 15 and 20 fish, then 5 more each', async () => {
  const { context, page } = await open();
  const goals = await page.evaluate(() => {
    const r = window.__reef;
    const out = [];
    for (let d = 0; d < 7; d++) {
      r.game.depth = d;
      out.push(r.goal());
    }
    r.game.depth = 0;
    return out;
  });
  assert.deepEqual(goals, [4, 7, 11, 15, 20, 25, 30]);
  await context.close();
});

test('AC-3: a predator costs a life, and the third ends the run', async () => {
  const { context, page } = await open();
  await startEmpty(page);
  let s = await meet(page, 'red', 150, 5);
  assert.equal(s.lives, 2);
  for (let i = 0; i < 2; i++) {
    await ready(page);
    s = await meet(page, 'red', 150, 5);
  }
  assert.equal(s.lives, 0);
  assert.equal(s.mode, 'over');
  await steps(page, 150);
  await page.locator('[data-screen="over"]').waitFor();
  await page.click('[data-again]');
  assert.equal(await page.evaluate(() => window.__reef.game.lives), 3);
  await context.close();
});

test('AC-17: a bite: the predator swims off, and the player flees to safety on its own', async () => {
  const { context, page } = await open();
  await startEmpty(page);
  await meet(page, 'blue', 70, 2);
  const during = await page.evaluate(() => {
    const r = window.__reef;
    r.input.target = { x: 0, y: 0 }; // steering is ignored while fleeing
    return { hurt: r.player.hurt > 0, safe: r.player.safe };
  });
  assert.ok(during.hurt, 'the player is fleeing');
  await steps(page, 80);
  const after = await page.evaluate(() => {
    const r = window.__reef;
    const pred = r.npcs()[0];
    return { hurt: r.player.hurt, x: r.player.x, y: r.player.y, state: pred && pred.state, gone: !pred };
  });
  assert.ok(after.hurt <= 0, 'control is back');
  const toSafe = Math.hypot(after.x - during.safe.x, after.y - during.safe.y);
  assert.ok(toSafe < 40, `reached the safe spot (${toSafe.toFixed(0)} away)`);
  assert.ok(after.gone || after.state === 'leave', `the predator leaves (${after.state})`);
  await context.close();
});

test('AC-4: getting bitten makes the next stretch easier', async () => {
  const { context, page } = await open();
  await startEmpty(page);
  const before = await page.evaluate(() => window.__reef.game.assist);
  await meet(page, 'red', 150, 5);
  const after = await page.evaluate(() => window.__reef.game.assist);
  assert.ok(after > before + 0.2, `assist rose from ${before} to ${after}`);
  await context.close();
});

test('AC-4: the assist fades while you do well', async () => {
  const { context, page } = await open();
  await startEmpty(page);
  await page.evaluate(() => (window.__reef.game.assist = 0.5));
  await steps(page, 600); // 10 s with no danger
  const a = await page.evaluate(() => window.__reef.game.assist);
  assert.ok(a < 0.47 && a > 0.4, `assist went from 0.5 to ${a}`);
  await context.close();
});

test('AC-5: the last fish of a depth dives to the next, with a life back, at most 3', async () => {
  const { context, page } = await open();
  await startEmpty(page);
  await page.evaluate(() => {
    const r = window.__reef;
    r.game.lives = 2;
    r.game.xp = 3; // one short of the first depth's 4
  });
  await meet(page, 'pink', 30, 5);
  assert.equal(await page.evaluate(() => window.__reef.game.mode), 'dive');
  await steps(page, 75); // past the swap to the new depth
  await page.evaluate(() => {
    const r = window.__reef;
    r.npcs().length = 0; // nothing to eat on the way out, so the count stays at its reset value
    r.game.spawnIn = 999;
  });
  await steps(page, 85);
  const s = await page.evaluate(() => ({ mode: window.__reef.game.mode, depth: window.__reef.game.depth, lives: window.__reef.game.lives, xp: window.__reef.game.xp }));
  assert.deepEqual(s, { mode: 'play', depth: 1, lives: 3, xp: 0 });
  // A second dive with all 3 lives still leaves 3: the life back is capped.
  await page.evaluate(() => (window.__reef.game.xp = 6)); // one short of 7
  await meet(page, 'pink', 30, 5);
  await steps(page, 160);
  const again = await page.evaluate(() => ({ depth: window.__reef.game.depth, lives: window.__reef.game.lives }));
  assert.deepEqual(again, { depth: 2, lives: 3 });
  await context.close();
});

test('AC-6: an eel warns with bubbles first, then strikes across the reef', async () => {
  const { context, page } = await open();
  await startEmpty(page);
  await page.evaluate(() => {
    const r = window.__reef;
    r.game.depth = 2; // Kelp Forest: eels
    r.game.eelIn = 0;
  });
  await steps(page, 1);
  const warn = await page.evaluate(() => {
    const r = window.__reef;
    const e = r.eels()[0];
    e.y = r.player.y;
    r.game.eelIn = 999;
    return { state: e.state, t: e.t };
  });
  assert.equal(warn.state, 'warn');
  assert.ok(warn.t >= 1.3, `warned ${warn.t} s ahead`);
  await steps(page, 60);
  assert.equal(await page.evaluate(() => window.__reef.game.lives), 3, 'no harm during the warning');
  await steps(page, 180);
  assert.equal(await page.evaluate(() => window.__reef.game.lives), 2, 'the eel caught the fish in its path');
  await context.close();
});

test('AC-7: a pufferfish puffs up when you come close, and bumps you away', async () => {
  const { context, page } = await open();
  await startEmpty(page);
  const s = await page.evaluate(() => {
    const r = window.__reef;
    const p = r.player;
    const f = r.makePuffer(-1);
    Object.assign(f, { x: p.x + 70, y: p.y, vx: 0, fade: 1 });
    r.npcs().push(f);
    for (let i = 0; i < 20; i++) r.step(1 / 60);
    const puff = f.puff;
    const xp = (r.game.xp = 3);
    f.x = p.x + 10;
    f.y = p.y;
    for (let i = 0; i < 3; i++) r.step(1 / 60);
    return { puff, lives: r.game.lives, stun: p.stun, xpLost: xp - r.game.xp };
  });
  assert.ok(s.puff > 0.9, `puffed ${s.puff}`);
  assert.equal(s.lives, 3, 'a bump is not a lost life');
  assert.ok(s.stun > 0, 'stunned');
  assert.equal(s.xpLost, 1, 'lost a notch');
  await context.close();
});

test('AC-8: a long calm brings a hunter in', async () => {
  const { context, page } = await open();
  await startEmpty(page);
  await page.evaluate(() => (window.__reef.game.calm = 30));
  await steps(page, 1);
  const hunters = await page.evaluate(() => window.__reef.npcs().filter((n) => n.huntPlayer && window.__reef.isThreat(n)).length);
  assert.equal(hunters, 1);
  await context.close();
});

test('AC-8: a passing school is a feast of fish you can eat', async () => {
  const { context, page } = await open();
  await startEmpty(page);
  await page.evaluate(() => (window.__reef.game.feastIn = 0));
  await steps(page, 1);
  const school = await page.evaluate(() => window.__reef.npcs().map((n) => window.__reef.isFood(n)));
  assert.ok(school.length >= 8, `${school.length} fish`);
  assert.ok(school.every(Boolean), 'all of them edible');
  await context.close();
});

test('AC-18: each depth brings its own fish', async () => {
  const { context, page } = await open();
  const kinds = await page.evaluate(() => {
    const r = window.__reef;
    const out = [];
    for (let d = 0; d < 5; d++) {
      r.game.depth = d;
      const seen = new Set();
      for (let i = 0; i < 200; i++) {
        seen.add(r.chooseFish(true).species);
        seen.add(r.chooseFish(false).species);
      }
      out.push([...seen].sort().join(' '));
    }
    r.game.depth = 0;
    return out;
  });
  assert.deepEqual(kinds, [
    'blue green pink',
    'blue green orange pink',
    'blue green orange pink red',
    'blue green grey orange pink red',
    'blue green grey orange pink red',
  ]);
  await context.close();
});

test('AC-9: dragging on a touch screen steers the fish', async () => {
  const { context, page } = await open({ hasTouch: true, viewport: { width: 390, height: 844 } });
  await startEmpty(page);
  const start = await page.evaluate(() => window.__reef.player.x);
  const cdp = await context.newCDPSession(page);
  const touch = (type, x, y) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
  await touch('touchStart', 100, 600);
  for (let i = 1; i <= 10; i++) await touch('touchMove', 100 + i * 12, 600);
  await touch('touchEnd', 0, 0);
  await steps(page, 60);
  const end = await page.evaluate(() => window.__reef.player.x);
  assert.ok(end > start + 60, `moved right from ${start} to ${end}`);
  await context.close();
});

test('AC-10: the reef works offline once it has been played', async () => {
  const { context, page } = await open();
  await page.evaluate(() => navigator.serviceWorker.register('../sw.js'));
  await page.evaluate(
    () => Promise.race([navigator.serviceWorker.ready, new Promise((r) => setTimeout(r, 10000))])
  );
  await page.reload(); // controlled now: this load caches the game's files
  await page.waitForFunction(() => window.__reef);
  await page.waitForLoadState('networkidle');
  await context.setOffline(true);
  await page.reload();
  await page.waitForFunction(() => window.__reef);
  assert.equal(await page.evaluate(() => window.__reef.game.mode), 'play');
  await context.close();
});

test('AC-12: The Deep is dark, with a glow around the player', async () => {
  const { context, page } = await open();
  await startEmpty(page);
  await page.evaluate(() => {
    const r = window.__reef;
    r.game.depth = 3;
    r.dive();
  });
  await steps(page, 150); // through the dive into The Deep
  await page.evaluate(() => {
    const r = window.__reef;
    r.npcs().length = 0;
    r.game.spawnIn = 999;
    r.player.x = r.world().W * 0.7;
    r.player.y = r.world().H * 0.4;
    r.player.invul = 0;
  });
  await page.waitForTimeout(300); // let frames draw
  const lum = await page.evaluate(() => {
    const r = window.__reef;
    const c = document.getElementById('sea');
    const g = c.getContext('2d');
    const k = c.width / r.world().W;
    const at = (x, y) => {
      const d = g.getImageData(Math.round(x * k), Math.round(y * k), 1, 1).data;
      return d[0] * 0.3 + d[1] * 0.59 + d[2] * 0.11;
    };
    const y = r.player.y;
    return { depth: r.game.depth, near: at(r.player.x - 70, y), far: at(r.player.x - 420, y) };
  });
  assert.equal(lum.depth, 4, 'in The Deep');
  assert.ok(lum.near > lum.far * 1.5, `near the player ${lum.near}, far away ${lum.far}`);
  await context.close();
});

test('AC-13: a new player starts with some help, and a hard run carries over', async () => {
  const { context, page } = await open();
  // The page load started the first run.
  const first = await page.evaluate(() => window.__reef.game.assist);
  assert.ok(first >= 0.4 && first <= 0.5, `first run starts at ${first}`);
  const runs = await page.evaluate(() => {
    const r = window.__reef;
    r.game.assist = 1;
    r.startGame(); // second run, still a new player: 1 x 0.6 + 0.25 = 0.85, capped at 0.7
    const second = r.game.assist;
    r.game.assist = 1;
    r.startGame(); // third run: 1 x 0.6 + 0.05
    return { second, third: r.game.assist };
  });
  assert.ok(Math.abs(runs.second - 0.7) < 0.001, `capped at 0.7: ${runs.second}`);
  assert.ok(Math.abs(runs.third - 0.65) < 0.001, `after a hard run: ${runs.third}`);
  await context.close();
});

test('AC-14: each state shows only its own card and HUD', async () => {
  const { context, page } = await open();
  // What shows, read after the page has drawn a couple of frames of the current state.
  const cards = async () => {
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    return page.evaluate(() => ({
      mode: window.__reef.game.mode,
      over: !document.querySelector('[data-screen="over"]').hidden,
      hud: window.__reef.drawn.hud,
    }));
  };
  assert.deepEqual(await cards(), { mode: 'play', over: false, hud: true }, 'waiting for the first move');
  await startEmpty(page);
  assert.deepEqual(await cards(), { mode: 'play', over: false, hud: true });
  await page.evaluate(() => window.__reef.dive());
  await steps(page, 50); // well into the dive
  assert.deepEqual(await cards(), { mode: 'dive', over: false, hud: true });
  assert.ok((await page.evaluate(() => window.__reef.drawn.wash)) > 0.5, 'a wash of the deeper colour');
  await steps(page, 110);
  await page.evaluate(() => {
    const r = window.__reef;
    r.npcs().length = 0;
    r.game.spawnIn = 999;
    r.game.lives = 1;
    r.player.invul = 0;
    r.player.hurt = 0;
    r.game.score = 1234;
  });
  await meet(page, 'red', 150, 5);
  assert.deepEqual(await cards(), { mode: 'over', over: false, hud: true }, 'the card waits a moment');
  await steps(page, 120);
  assert.deepEqual(await cards(), { mode: 'over', over: true, hud: true });
  assert.equal(await page.locator('[data-final-score]').textContent(), '1,234');
  assert.match(await page.locator('[data-final-detail]').textContent(), /Reached Coral Garden/);
  await context.close();
});

test('AC-19: each predator has its own mark, and food has none', async () => {
  const { context, page } = await open();
  const marks = await page.evaluate(() => window.__reef.marks());
  assert.deepEqual(marks, { pink: null, green: null, orange: null, blue: 'jaws', red: 'lure', grey: 'spark' });
  await context.close();
});

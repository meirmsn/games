// End-to-end tests for Reef. Run: scripts/check-slow.sh.
// The game exposes window.__reef (state, and a step() that advances the simulation without
// drawing), so these tests can set up a situation and check what the rules do with it.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

// Its own port range: the test files run in parallel, and a shared range can collide.
const PORT = 9100 + Math.floor(Math.random() * 100);
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
    if (r.game.mode !== 'play') r.startGame(0);
    r.manual = true;
    r.npcs().length = 0;
    r.game.feastIn = 999;
    r.game.calm = -999;
    r.game.spawnIn = 999;
    r.player.waiting = false;
    r.player.invul = 0;
    // The page ran on its own until now, and a passing fish may already have been eaten.
    r.game.xp = 0;
    r.game.score = 0;
    r.game.chain = 0;
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

test('AC-1: the reef opens behind a start card; Start begins L1, and nothing bites until you move', async () => {
  const { context, page, errors } = await open();
  const s = await page.evaluate(() => ({
    mode: window.__reef.game.mode,
    start: !document.querySelector('[data-screen="start"]').hidden,
    fish: window.__reef.npcs().length,
  }));
  assert.deepEqual({ mode: s.mode, start: s.start }, { mode: 'title', start: true });
  assert.ok(s.fish > 5, 'fish are swimming behind the card');
  await page.click('[data-play]');
  const after = await page.evaluate(() => ({
    mode: window.__reef.game.mode,
    depth: window.__reef.game.depth,
    waiting: window.__reef.player.waiting,
    start: !document.querySelector('[data-screen="start"]').hidden,
  }));
  assert.deepEqual(after, { mode: 'play', depth: 0, waiting: true, start: false });
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

test('AC-16: levels take 4, 7, 9, 11, 13, 15, 17 and 20 fish, then 5 more each', async () => {
  const { context, page } = await open();
  const goals = await page.evaluate(() => {
    const r = window.__reef;
    const out = [];
    for (let d = 0; d < 10; d++) {
      r.game.depth = d;
      out.push(r.goal());
    }
    r.game.depth = 0;
    return out;
  });
  assert.deepEqual(goals, [4, 7, 9, 11, 13, 15, 17, 20, 25, 30]);
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
  await page.locator('[data-screen="start"]').waitFor();
  await page.click('[data-play]');
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
  await steps(page, 160); // up to 2.5 s of fleeing
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
    r.game.depth = 5; // Sunset Reef: the first eels
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

test('AC-18: new dangers come in slowly, level by level', async () => {
  const { context, page } = await open();
  const levels = await page.evaluate(() => {
    const r = window.__reef;
    const out = [];
    for (let d = 0; d < 8; d++) {
      r.game.depth = d;
      const seen = new Set();
      for (let i = 0; i < 200; i++) {
        seen.add(r.chooseFish(true).species);
        seen.add(r.chooseFish(false).species);
      }
      const def = r.depths[d];
      out.push({ fish: [...seen].sort().join(' '), puffers: def.puffers, eels: !!def.eel, current: !!def.current });
    }
    r.game.depth = 0;
    return out;
  });
  assert.deepEqual(levels.map((l) => l.fish), [
    'blue green pink',
    'blue green orange pink',
    'blue green orange pink',
    'blue green orange pink',
    'blue green orange pink red',
    'blue green orange pink red',
    'blue green grey orange pink red',
    'blue green grey orange pink red',
  ]);
  assert.deepEqual(levels.map((l) => l.puffers), [0, 1, 1, 1, 1, 2, 2, 2], 'pufferfish from L2');
  assert.deepEqual(levels.map((l) => l.current), [false, false, false, true, false, true, true, false], 'currents from L4');
  assert.deepEqual(levels.map((l) => l.eels), [false, false, false, false, false, true, true, true], 'eels from L6');
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
  await page.click('[data-play]');
  assert.equal(await page.evaluate(() => window.__reef.game.mode), 'play');
  await context.close();
});

test('AC-12: The Deep is dark, with a glow around the player', async () => {
  const { context, page } = await open();
  await startEmpty(page);
  await page.evaluate(() => {
    const r = window.__reef;
    r.game.depth = 6;
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
  assert.equal(lum.depth, 7, 'in The Deep');
  assert.ok(lum.near > lum.far * 1.5, `near the player ${lum.near}, far away ${lum.far}`);
  await context.close();
});

test('AC-13: a new player starts with some help, and a hard run carries over', async () => {
  const { context, page } = await open();
  const first = await page.evaluate(() => {
    window.__reef.startGame(0); // the first run
    return window.__reef.game.assist;
  });
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
      start: !document.querySelector('[data-screen="start"]').hidden,
      over: !document.querySelector('[data-screen="over"]').hidden,
      hud: window.__reef.drawn.hud,
    }));
  };
  assert.deepEqual(await cards(), { mode: 'title', start: true, over: false, hud: false }, 'the start card');
  await page.click('[data-play]');
  assert.deepEqual(await cards(), { mode: 'play', start: false, over: false, hud: true }, 'waiting for the first move');
  await startEmpty(page);
  assert.deepEqual(await cards(), { mode: 'play', start: false, over: false, hud: true });
  await page.evaluate(() => window.__reef.dive());
  await steps(page, 50); // well into the dive
  assert.deepEqual(await cards(), { mode: 'dive', start: false, over: false, hud: true });
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
  assert.deepEqual(await cards(), { mode: 'over', start: false, over: false, hud: true }, 'the card waits a moment');
  await steps(page, 120);
  assert.deepEqual(await cards(), { mode: 'over', start: false, over: true, hud: true });
  assert.equal(await page.locator('[data-final-score]').textContent(), '1,234');
  assert.match(await page.locator('[data-final-detail]').textContent(), /Reached Coral Garden/);
  await context.close();
});

test('AC-19: each predator has its own mark, and food has none', async () => {
  const { context, page } = await open();
  const marks = await page.evaluate(() => window.__reef.marks());
  assert.deepEqual(marks, { pink: null, green: null, orange: null, blue: 'jaws', red: 'lure', grey: 'zap' });
  // ...and they are drawn: one of each predator and each food fish on screen.
  await startEmpty(page);
  const drawn = await page.evaluate(async () => {
    const r = window.__reef;
    const { W, H } = r.world();
    const mk = (species, x) => ({ kind: 'fish', species, size: 60, x, y: H * 0.5, vx: 0, vy: 0, dir: 1, speed: 0, face: 1, faceT: 1, angle: 0, ph: 0, state: 'tired', t: 99, cool: 99, stamina: 0, leader: null, ox: 0, oy: 0, near: false, sated: 99, fade: 1, huntT: 0, prey: null });
    r.player.x = -999;
    ['pink', 'green', 'orange'].forEach((k, i) => r.npcs().push(mk(k, W * (0.1 + i * 0.1))));
    const foodOnly = await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(() => res([...r.drawn.marks]))));
    ['blue', 'red', 'grey'].forEach((k, i) => r.npcs().push(mk(k, W * (0.5 + i * 0.15))));
    const all = await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(() => res([...r.drawn.marks]))));
    return { foodOnly, all: all.sort() };
  });
  assert.deepEqual(drawn.foodOnly, [], 'food fish draw no mark');
  assert.deepEqual(drawn.all, ['jaws', 'lure', 'zap']);
  await context.close();
});

test('AC-20: level codes: the game-over card shows one, and entering it starts at that level', async () => {
  const { context, page } = await open();
  // The codes are pinned: a code names a level number and never changes from one version to the
  // next, and the codes of earlier versions keep working. Only add to this list.
  const codes = await page.evaluate(() => [1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => window.__reef.codeFor(d)));
  assert.deepEqual(codes, ['PERCH', 'KRILL', 'TROUT', 'GLOOM', 'BLENNY', 'GOBY', 'MOREL', 'REEF9', 'REEF10']);
  const levels = await page.evaluate(() =>
    ['PERCH', 'KRILL', 'TROUT', 'GLOOM', 'BLENNY', 'GOBY', 'MOREL', 'REEF9', 'PEARL', 'SQUID', 'MANTA', 'ABYSS', 'DEEP6', 'abyss'].map((c) => window.__reef.depthForCode(c) + 1)
  );
  assert.deepEqual(levels, [2, 3, 4, 5, 6, 7, 8, 9, 2, 3, 4, 5, 6, 5], 'each code opens its level number');
  assert.ok(codes.every((c) => !/[WASD]/.test(c)), 'no code uses the keys that steer');
  // Typing in the code box types, even the steering keys, and doesn't steer the fish.
  await page.click('[data-code]');
  await page.keyboard.type('wasd');
  assert.equal(await page.inputValue('[data-code]'), 'WASD');
  assert.equal(await page.evaluate(() => window.__reef.input.keys.size), 0, 'no steering keys held');
  // A wrong code is refused, and the card stays.
  await page.fill('[data-code]', 'tuna');
  await page.click('.go');
  assert.equal(await page.evaluate(() => window.__reef.game.mode), 'title');
  assert.match(await page.locator('[data-code-msg]').textContent(), /doesn.t open/);
  // A right one (any case) starts at its level.
  await page.fill('[data-code]', 'krill');
  await page.click('.go');
  assert.deepEqual(await page.evaluate(() => ({ mode: window.__reef.game.mode, depth: window.__reef.game.depth })), { mode: 'play', depth: 2 });
  // Losing there shows that level's code.
  await startEmpty(page);
  await page.evaluate(() => (window.__reef.game.lives = 1));
  await meet(page, 'red', 150, 5);
  await steps(page, 120);
  assert.equal(await page.locator('[data-level-code-value]').textContent(), 'KRILL');
  assert.match(await page.locator('[data-level-code-label]').textContent(), /L3/);
  // The start card doesn't remind you of it: you have to remember it.
  await page.click('[data-again]');
  await page.locator('[data-screen="start"]').waitFor();
  assert.equal(await page.locator('[data-code-msg]').textContent(), '');
  assert.equal(await page.inputValue('[data-code]'), '');
  await context.close();
});

test('AC-21: losing a life makes a show of it in the HUD', async () => {
  const { context, page } = await open();
  await startEmpty(page);
  await meet(page, 'blue', 70, 3);
  assert.deepEqual(await page.evaluate(() => window.__reef.game.lifeLost && window.__reef.game.lifeLost.slot), 2);
  await steps(page, 27); // half a second in: the icon is out, about three times its size
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const pop = await page.evaluate(() => window.__reef.drawn.lifePop);
  assert.ok(pop > 2.8, `the lost life pops out (${pop}×)`);
  await steps(page, 60); // 90 frames in all: 1.5 s
  assert.equal(await page.evaluate(() => window.__reef.game.lifeLost), null, 'settled within 1.5 s');
  await context.close();
});

test('AC-22: each world looks different from the one before', async () => {
  const { context, page } = await open();
  const w = await page.evaluate(() => {
    const r = window.__reef;
    const d = r.depths;
    const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    const gaps = d.slice(1).map((x, i) => Math.round(dist(x.top, d[i].top) + dist(x.bottom, d[i].bottom)));
    r.game.depth = 4;
    const { W } = r.world();
    const slope = r.groundAt(0) - r.groundAt(W);
    r.game.depth = 0;
    return { gaps, slope, plants: d.map((x) => x.weedDensity), bones: d.map((x) => !!x.bones) };
  });
  assert.ok(w.gaps.every((g) => g > 120), `water colours differ between neighbours: ${w.gaps}`);
  assert.ok(w.slope > 100, `the Twilight Slope's floor rises (${w.slope})`);
  assert.equal(w.plants[4], 0, 'the slope is bare');
  assert.ok(w.plants[1] >= 3 && w.plants[2] >= 2 && w.plants[3] >= 3, 'the coral, the kelp and the seagrass are overgrown');
  assert.deepEqual(w.bones, [false, false, false, false, false, false, false, true]);
  await context.close();
});

test('AC-23: currents: a gentle drift at L4, a rip across the top third at L6, the whole sea at L7', async () => {
  const { context, page } = await open();
  const flows = await page.evaluate(() => {
    const r = window.__reef;
    const { H } = r.world();
    const at = (d, f) => {
      r.game.depth = d;
      return Math.round(r.currentAt(H * f));
    };
    const out = {
      calm: [0, 1, 2, 4, 7].map((d) => at(d, 0.5)),
      l4: at(3, 0.5),
      l6top: at(5, 0.15),
      l6low: at(5, 0.7),
      l7top: at(6, 0.15),
      l7low: at(6, 0.7),
    };
    r.game.depth = 0;
    return out;
  });
  assert.deepEqual(flows.calm, [0, 0, 0, 0, 0], 'no current at L1, L2, L3, L5 or L8');
  assert.ok(flows.l4 > 20 && flows.l4 < 50, `L4 drifts gently: ${flows.l4}`);
  assert.ok(flows.l6top > 90 && flows.l6low === 0, `L6: ${flows.l6top} at the top, ${flows.l6low} below`);
  assert.ok(flows.l7top < -40 && flows.l7low < -40, `L7: ${flows.l7top} and ${flows.l7low}, both flowing left`);
  // A fish left alone at L7 is carried along with it.
  await page.evaluate(() => window.__reef.startGame(6));
  await startEmpty(page);
  const before = await page.evaluate(() => {
    const r = window.__reef;
    r.player.x = r.world().W * 0.7;
    return r.player.x;
  });
  await steps(page, 120);
  const after = await page.evaluate(() => window.__reef.player.x);
  assert.ok(before - after > 60, `carried left from ${before} to ${after}`);
  await context.close();
});

test('AC-24: L1 has no pufferfish, even behind the start card', async () => {
  const { context, page } = await open();
  await page.evaluate(() => (window.__reef.manual = true));
  await steps(page, 1800); // 30 s of the start card
  assert.equal(await page.evaluate(() => window.__reef.npcs().filter((n) => n.kind === 'puffer').length), 0);
  assert.equal(await page.evaluate(() => window.__reef.depths[0].puffers), 0);
  // ...and 30 s of play at L1, the fish awake and safe, still brings none.
  await page.evaluate(() => {
    const r = window.__reef;
    r.startGame(0);
    r.player.waiting = false;
    r.player.invul = 999;
  });
  await steps(page, 1800);
  assert.equal(await page.evaluate(() => window.__reef.npcs().filter((n) => n.kind === 'puffer').length), 0, 'none in play');
  await context.close();
});

test('AC-25: orange food fish are golden, clearly unlike the player\'s orange', async () => {
  const { context, page } = await open();
  const tone = await page.evaluate(() => {
    const avg = (c) => {
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let r = 0, g = 0, n = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 200) { r += d[i]; g += d[i + 1]; n++; }
      return g / r;
    };
    const gold = avg(window.__reef.golden('fish_orange'));
    // The player's sprite, straight from the atlas.
    const f = window.__reef.frame('fish_orange_outline');
    const c = document.createElement('canvas');
    c.width = f[2];
    c.height = f[3];
    c.getContext('2d').drawImage(window.__reef.atlas, f[0], f[1], f[2], f[3], 0, 0, f[2], f[3]);
    return { gold, player: avg(c) };
  });
  assert.ok(tone.gold - tone.player > 0.15, `green-to-red: golden ${tone.gold.toFixed(2)}, player ${tone.player.toFixed(2)}`);
  await context.close();
});

test('AC-26: a bite sounds clearly: the thud, then a short falling phrase, but not on the last life', async () => {
  const { context, page } = await open();
  await startEmpty(page);
  await page.evaluate(() => (window.__reef.heard.length = 0));
  await meet(page, 'blue', 70, 3);
  await page.waitForTimeout(250); // the phrase follows the thud
  assert.deepEqual(await page.evaluate(() => window.__reef.heard.filter((n) => n === 'caught' || n === 'hurt')), ['caught', 'hurt']);
  await ready(page);
  await page.evaluate(() => {
    window.__reef.game.lives = 1;
    window.__reef.heard.length = 0;
  });
  await meet(page, 'blue', 70, 3);
  await page.waitForTimeout(700);
  const last = await page.evaluate(() => window.__reef.heard.slice());
  assert.ok(!last.includes('hurt') && last.includes('gameover'), `the last bite: ${last}`);
  await context.close();
});

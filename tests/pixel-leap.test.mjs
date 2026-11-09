// End-to-end tests for Pixel Leap. Run: scripts/check-slow.sh.
// The game exposes window.__leap (its state, and step() that advances the simulation without
// drawing), so a test can set up a moment and check what the rules do with it.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chromium, devices } from 'playwright';
import { FAKE_AUDIO } from './fake-audio.mjs';

// Its own port range: the test files run in parallel, and a shared range can collide.
const PORT = 9300 + Math.floor(Math.random() * 100);
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

const PHONE = { ...devices['iPhone 13'], deviceScaleFactor: 2 };

async function open(opts = {}, hash = '', init = null) {
  const context = await browser.newContext({ viewport: { width: 1024, height: 700 }, ...opts });
  await context.addInitScript(FAKE_AUDIO);
  if (init) await context.addInitScript(init);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(BASE + 'pixel-leap/' + hash);
  await page.waitForFunction(() => window.__leap);
  return { context, page, errors };
}

// Start playing, with the test owning the clock.
async function play(page, world = 0, stage = 0) {
  await page.evaluate(
    ([w, s]) => {
      const L = window.__leap;
      if (L.game.mode === 'build') L.go();
      L.manual = true;
      if (w !== L.game.world) L.startWorld(w);
      L.loadStage(w, s);
      L.game.mode = 'play';
      L.input.keys.clear();
      L.sync();
    },
    [world, stage]
  );
}
const steps = (page, n) => page.evaluate((n) => window.__leap.steps(n), n);
const keys = (page, ...k) =>
  page.evaluate((k) => {
    const L = window.__leap;
    L.input.keys.clear();
    for (const x of k) L.input.keys.add(x);
    L.sync();
  }, k);
// Put the monster on flat ground: the first stretch of Meadow 1 or Candy 1.
const place = (page, x, y = 11) =>
  page.evaluate(
    ([x, y]) => {
      const p = window.__leap.player;
      Object.assign(p, { x, y, vx: 0, vy: 0, ground: true, poof: 0, invul: 0, land: 0 });
    },
    [x, y]
  );

test('pixel-leap AC-1: opens on the builder over the moving Meadow; Go starts Meadow 1; no errors', async () => {
  const { context, page, errors } = await open();
  assert.equal(await page.evaluate(() => window.__leap.game.mode), 'build');
  assert.equal(await page.locator('[data-screen="build"]').isVisible(), true);
  assert.equal(await page.locator('[data-hud]').isVisible(), false);
  const t0 = await page.evaluate(() => [window.__leap.game.t, window.__leap.cam.x]);
  await page.waitForTimeout(600);
  const t1 = await page.evaluate(() => [window.__leap.game.t, window.__leap.cam.x]);
  assert.ok(t1[0] > t0[0] && t1[1] !== t0[1], 'the world moves behind the builder');
  await page.click('[data-go]');
  const s = await page.evaluate(() => {
    const L = window.__leap;
    return { mode: L.game.mode, world: L.game.world, stage: L.game.stage, ground: L.player.ground };
  });
  assert.deepEqual(s, { mode: 'play', world: 0, stage: 0, ground: true });
  assert.equal(await page.locator('[data-screen="build"]').isVisible(), false);
  assert.deepEqual(errors, []);
  await context.close();
});

test('pixel-leap AC-2: each builder button changes its part, Shuffle changes the monster, and codes round-trip', async () => {
  const { context, page, errors } = await open();
  const parts = ['shape', 'colour', 'eyes', 'mouth', 'arms', 'legs'];
  for (const part of parts) {
    const before = await page.evaluate(() => window.__leap.monster());
    await page.click(`[data-part="${part}"]`);
    const after = await page.evaluate(() => window.__leap.monster());
    assert.notEqual(after[part], before[part], `${part} changed`);
    for (const other of parts) if (other !== part) assert.equal(after[other], before[other]);
  }
  const before = await page.evaluate(() => window.__leap.code());
  await page.click('[data-shuffle]');
  const code = await page.evaluate(() => window.__leap.code());
  assert.notEqual(code, before);
  await context.close();

  const again = await open({}, `#m=${code}`);
  assert.equal(await again.page.evaluate(() => window.__leap.code()), code);
  await again.context.close();

  for (const bad of ['#m=zzzzzzzzzzzzz', '#m=1zzzzzz', '#m=', '#m=%00%ff']) {
    const g = await open({}, bad);
    const c = await g.page.evaluate(() => window.__leap.code());
    assert.match(c, /^1[a-z]{6}$/, `${bad} gives a random monster`);
    assert.deepEqual(g.errors, []);
    await g.context.close();
  }
  const blocked = await open({}, '', () => {
    Storage.prototype.getItem = () => {
      throw new Error('blocked');
    };
    Storage.prototype.setItem = () => {
      throw new Error('blocked');
    };
  });
  await blocked.page.click('[data-go]');
  assert.equal(await blocked.page.evaluate(() => window.__leap.game.mode), 'play');
  assert.deepEqual(blocked.errors, []);
  await blocked.context.close();
  assert.deepEqual(errors, []);
});

test('pixel-leap AC-3: the same speed and jump in tiles in both worlds; a held jump is far higher than a tap', async () => {
  const { context, page } = await open();
  const measure = async (world, x) => {
    await play(page, world, 0);
    await place(page, x);
    await keys(page, 'right');
    await steps(page, 120);
    const speed = await page.evaluate(() => window.__leap.player.vx);
    await keys(page);
    await steps(page, 120);
    const jump = async (holdSteps) => {
      await place(page, x);
      await keys(page, 'jump');
      const apex = await page.evaluate((hold) => {
        const L = window.__leap;
        let top = L.player.y;
        for (let i = 0; i < 160; i++) {
          if (i === hold) {
            L.input.keys.clear();
            L.sync();
          }
          L.step();
          top = Math.min(top, L.player.y);
        }
        return L.player.y - top;
      }, holdSteps);
      return apex;
    };
    return { speed, held: await jump(160), tap: await jump(2) };
  };
  const m = await measure(0, 2);
  const c = await measure(1, 2);
  assert.ok(Math.abs(m.speed - c.speed) < 0.01 && m.speed > 6, `speed ${m.speed} vs ${c.speed}`);
  assert.ok(Math.abs(m.held - c.held) < 0.05 && m.held > 3, `held jump ${m.held} vs ${c.held}`);
  assert.ok(m.held >= 1.6 * m.tap, `held ${m.held} vs tap ${m.tap}`);
  await context.close();
});

// Reads the screen and reports whether it is made of k×k blocks of one colour (a sample of them).
const blocky = (page, k) =>
  page.evaluate((k) => {
    const L = window.__leap;
    L.render();
    const c = document.getElementById('view');
    const g = c.getContext('2d');
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let uniform = 0;
    let varied = 0;
    for (let by = 2; by < c.height / k - 2; by += 3) {
      for (let bx = 2; bx < c.width / k - 2; bx += 3) {
        const i0 = (by * k * c.width + bx * k) * 4;
        let same = true;
        for (let y = 0; y < k && same; y++) {
          for (let x = 0; x < k; x++) {
            const i = ((by * k + y) * c.width + bx * k + x) * 4;
            if (Math.abs(d[i] - d[i0]) + Math.abs(d[i + 1] - d[i0 + 1]) + Math.abs(d[i + 2] - d[i0 + 2]) > 3) {
              same = false;
              break;
            }
          }
        }
        if (same) uniform++;
        else varied++;
      }
    }
    return { uniform, varied };
  }, k);

test('pixel-leap AC-4: the Meadow is drawn in 18-px-per-tile blocks, Candy smooth at 70, with the same tile size', async () => {
  const { context, page } = await open(PHONE);
  await play(page, 0, 0);
  await place(page, 8);
  const meadow = await page.evaluate(() => ({ U: window.__leap.view.U, k: window.__leap.view.k }));
  assert.equal(meadow.U, 18 * meadow.k);
  const m = await blocky(page, meadow.k);
  assert.equal(await page.evaluate(() => window.__leap.renderRes()), 18);
  assert.equal(m.varied, 0, `every sampled ${meadow.k}×${meadow.k} block is one colour`);
  await play(page, 1, 0);
  await place(page, 8);
  const c = await blocky(page, meadow.k);
  assert.equal(await page.evaluate(() => window.__leap.renderRes()), 70);
  assert.equal(await page.evaluate(() => window.__leap.view.U), meadow.U, 'a tile is the same size on screen');
  assert.ok(c.varied > 20, `Candy is smooth (${c.varied} blocks with more than one colour)`);
  await context.close();
});

test('pixel-leap AC-5: the Meadow monster is baked with binary alpha, a dark outline and a short palette, in pose frames', async () => {
  const { context, page } = await open();
  for (const code of ['1aaaaaa', '1cckcdb', '1fbhjce', '1edcbab', '1aeabaa', '1fejaba']) {
    await page.evaluate((c) => {
      location.hash = `m=${c}`;
    }, code);
    await page.reload();
    await page.waitForFunction(() => window.__leap);
    const r = await page.evaluate(() => {
      const b = window.__leap.baked();
      const names = Object.keys(b.frames);
      const colours = new Set();
      let notBinary = 0;
      let bareEdges = 0;
      for (const n of names) {
        const f = b.frames[n];
        const d = f.getContext('2d').getImageData(0, 0, f.width, f.height).data;
        const at = (x, y) => (x < 0 || y < 0 || x >= f.width || y >= f.height ? 0 : d[(y * f.width + x) * 4 + 3]);
        for (let y = 0; y < f.height; y++) {
          for (let x = 0; x < f.width; x++) {
            const i = (y * f.width + x) * 4;
            const a = d[i + 3];
            if (a !== 0 && a !== 255) notBinary++;
            if (a !== 255) continue;
            const rgb = `${d[i]},${d[i + 1]},${d[i + 2]}`;
            colours.add(rgb);
            const edge = !at(x - 1, y) || !at(x + 1, y) || !at(x, y - 1) || !at(x, y + 1);
            if (edge && rgb !== '38,35,56') bareEdges++;
          }
        }
      }
      const cols = [...colours].map((c) => c.split(',').map(Number));
      let near = 0;
      for (let i = 0; i < cols.length; i++) {
        for (let j = i + 1; j < cols.length; j++) {
          const [a, b] = [cols[i], cols[j]];
          const d2 = (a[0] - b[0]) ** 2 * 2 + (a[1] - b[1]) ** 2 * 3 + (a[2] - b[2]) ** 2;
          if (d2 < 150 * 150) near++;
        }
      }
      return { names, notBinary, bareEdges, colours: colours.size, near };
    });
    for (const n of ['stand0', 'run0', 'run1', 'run2', 'run3', 'rise', 'fall']) assert.ok(r.names.includes(n), `${code} has ${n}`);
    assert.equal(r.notBinary, 0, `${code}: alpha is binary`);
    assert.equal(r.bareEdges, 0, `${code}: every edge pixel is the outline`);
    assert.ok(r.colours <= 9, `${code}: ${r.colours} colours, at most 8 plus the outline`);
    assert.equal(r.near, 0, `${code}: no two colours near each other`);
  }
  await context.close();
});

test('pixel-leap AC-6: coyote time and the jump buffer', async () => {
  const { context, page } = await open();
  await play(page, 0, 0);
  // Meadow 1's ground steps up at column 10: run left off the top of a step.
  const r = await page.evaluate(() => {
    const L = window.__leap;
    const p = L.player;
    // Find a ledge: a ground column whose right neighbour is lower.
    const st = L.stage();
    let x = 0;
    for (let c = 2; c < st.cols - 1; c++) if (st.ground[c + 1] > st.ground[c]) {
      x = c;
      break;
    }
    Object.assign(p, { x: x + 0.2, y: st.ground[x], vx: 6.5, vy: 0, ground: true, poof: 0 });
    L.input.keys.clear();
    L.input.keys.add('right');
    L.sync();
    let left = 0;
    for (let i = 0; i < 60 && !left; i++) {
      L.step();
      if (!p.ground) left = 1;
    }
    for (let i = 0; i < 5; i++) L.step(); // 0.04 s after leaving the ledge
    L.input.keys.add('jump');
    L.sync();
    L.step();
    const coyote = p.vy < -10;
    // Buffer: press jump while falling just before landing.
    L.input.keys.clear();
    L.sync();
    Object.assign(p, { x: 4, y: st.ground[4] - 1.2, vx: 0, vy: 4, ground: false });
    let jumped = false;
    for (let i = 0; i < 80; i++) {
      const fallingTo = st.ground[4] - p.y;
      if (fallingTo < 0.25 && !L.input.keys.has('jump') && !p.ground) {
        L.input.keys.add('jump');
        L.sync();
      }
      L.step();
      if (p.vy < -10) jumped = true;
    }
    return { left, coyote, jumped };
  });
  assert.equal(r.left, 1);
  assert.equal(r.coyote, true, 'a jump just after the ledge jumps');
  assert.equal(r.jumped, true, 'a jump pressed just before landing jumps on landing');
  await context.close();
});

test('pixel-leap AC-7: spikes, a walker and falling poof back to the checkpoint within 1 s; coins stay; cookies and walkers reset', async () => {
  const { context, page } = await open();
  await play(page, 0, 1);
  const r = await page.evaluate(() => {
    const L = window.__leap;
    const p = L.player;
    const st = L.stage();
    L.game.coins = 3;
    const cp = { ...p.checkpoint };
    const back = () => {
      for (let i = 0; i < 120; i++) {
        L.step();
        if (p.poof <= 0 && Math.abs(p.x - cp.x) < 0.01) return (i + 1) / 120;
      }
      return 99;
    };
    const out = {};
    // Spikes.
    let sx = 0;
    for (let c = 0; c < st.cols; c++) if (L.tileAt(c, st.ground[c] - 1) === L.T.SPIKES) {
      sx = c;
      break;
    }
    Object.assign(p, { x: sx + 0.5, y: st.ground[sx], vx: 0, vy: 0, invul: 0 });
    L.step();
    out.spikes = back();
    // A walker's side.
    const w = st.things.find((t) => t.type === 'walker');
    w.x += 0; // where it is
    Object.assign(p, { x: w.x - 0.5, y: w.y, vx: 0, vy: 0, invul: 0, ground: true });
    L.step();
    out.walker = back();
    // Falling.
    Object.assign(p, { x: 10, y: L.ROWS + 2, vx: 0, vy: 5, invul: 0 });
    L.step();
    out.fall = back();
    out.coins = L.game.coins;
    out.mode = L.game.mode;
    return out;
  });
  assert.ok(r.spikes <= 1, `spikes: back in ${r.spikes} s`);
  assert.ok(r.walker <= 1, `walker: back in ${r.walker} s`);
  assert.ok(r.fall <= 1, `fall: back in ${r.fall} s`);
  assert.equal(r.coins, 3, 'coins taken stay taken');
  assert.equal(r.mode, 'play', 'no lives, no game over');
  // A crumbled cookie is whole after a poof, and a living walker is back where it started.
  await play(page, 1, 1);
  const c = await page.evaluate(() => {
    const L = window.__leap;
    const st = L.stage();
    const ck = st.things.find((t) => t.type === 'cookie');
    ck.state = 'gone';
    const worm = st.things.find((t) => t.type === 'worm');
    worm.x += 3;
    const p = L.player;
    Object.assign(p, { x: 10, y: L.ROWS + 2, vy: 5, invul: 0 });
    L.step();
    for (let i = 0; i < 120 && p.poof > 0; i++) L.step();
    return { cookie: ck.state, worm: Math.abs(worm.x - worm.sx) < 0.05 };
  });
  assert.deepEqual(c, { cookie: 'whole', worm: true });
  await context.close();
});

test('pixel-leap AC-8: landing on a walker defeats it and bounces, higher with jump held', async () => {
  const { context, page } = await open();
  await play(page, 0, 1);
  const bounce = async (hold) =>
    page.evaluate((hold) => {
      const L = window.__leap;
      L.loadStage(0, 1);
      const p = L.player;
      const w = L.stage().things.find((t) => t.type === 'walker');
      Object.assign(p, { x: w.x, y: w.y - 1.2, vx: 0, vy: 6, ground: false, invul: 0 });
      L.input.keys.clear();
      if (hold) L.input.keys.add('jump');
      L.sync();
      p.buffer = 0;
      let vy = 0;
      for (let i = 0; i < 30 && w.alive; i++) {
        L.step();
        vy = p.vy;
      }
      return { alive: w.alive, vy, poof: p.poof > 0 };
    }, hold);
  const soft = await bounce(false);
  const hard = await bounce(true);
  assert.equal(soft.alive, false);
  assert.equal(soft.poof, false);
  assert.ok(soft.vy < -5, `bounces up (${soft.vy})`);
  assert.ok(hard.vy < soft.vy - 2, `higher with jump held (${hard.vy} vs ${soft.vy})`);
  await context.close();
});

test('pixel-leap AC-9: touching a checkpoint heart moves the respawn point there', async () => {
  const { context, page } = await open();
  await play(page, 0, 0);
  const r = await page.evaluate(() => {
    const L = window.__leap;
    const h = L.stage().things.find((t) => t.type === 'heart');
    Object.assign(L.player, { x: h.x, y: h.y, vx: 0, vy: 0 });
    L.step();
    return { cp: L.player.checkpoint, h: { x: h.x, y: h.y }, state: h.state };
  });
  assert.deepEqual(r.cp, r.h);
  assert.equal(r.state, 'full');
  await context.close();
});

test('pixel-leap AC-10: the Meadow ears join the monster and let it float', async () => {
  const { context, page } = await open();
  await play(page, 0, 2);
  const r = await page.evaluate(() => {
    const L = window.__leap;
    const p = L.player;
    const fall = (hold) => {
      Object.assign(p, { x: 4, y: 2, vx: 0, vy: 0, ground: false, poof: 0 });
      L.input.keys.clear();
      if (hold) L.input.keys.add('jump');
      L.sync();
      p.buffer = 0;
      for (let i = 0; i < 60; i++) L.step();
      return p.vy;
    };
    const before = fall(true);
    const ears = L.stage().things.find((t) => t.type === 'ears');
    Object.assign(p, { x: ears.x, y: ears.y + 0.5, vx: 0, vy: 0 });
    L.input.keys.clear();
    L.sync();
    L.step();
    const got = L.game.ears;
    const baked = L.baked().key.endsWith(':true');
    return { before, got, baked, plain: fall(false), floating: fall(true) };
  });
  assert.equal(r.got, true);
  assert.equal(r.baked, true, 'the ears are drawn on the monster');
  assert.ok(r.before > 10, 'no float before the ears');
  assert.ok(r.floating <= 0.4 * r.plain, `float ${r.floating} vs ${r.plain}`);
  await context.close();
});

test('pixel-leap AC-11: jelly bounces higher than a jump, cookies crumble and come back, springs launch', async () => {
  const { context, page } = await open();
  await play(page, 1, 0);
  const r = await page.evaluate(() => {
    const L = window.__leap;
    const p = L.player;
    const st = L.stage();
    const j = st.things.find((t) => t.type === 'jelly');
    Object.assign(p, { x: j.x, y: j.y - 0.4, vx: 0, vy: 3, ground: false, invul: 0 });
    L.input.keys.clear();
    L.sync();
    L.step();
    L.step();
    const jelly = -p.vy;
    L.loadStage(1, 1);
    const ck = L.stage().things.find((t) => t.type === 'cookie');
    Object.assign(p, { x: ck.x, y: ck.y, vx: 0, vy: 0, ground: true });
    let gone = 0;
    for (let i = 1; i < 200 && !gone; i++) {
      L.step();
      if (ck.state === 'gone') gone = i / 120;
    }
    Object.assign(p, { x: 3, y: 9, vx: 0, vy: 0 });
    let back = 0;
    for (let i = 1; i < 600 && !back; i++) {
      L.step();
      if (ck.state === 'whole') back = i / 120;
    }
    L.loadStage(0, 2);
    const sp = L.stage().things.find((t) => t.type === 'spring');
    Object.assign(p, { x: sp.x, y: sp.y, vx: 0, vy: 0, ground: true });
    L.step();
    L.step();
    return { jelly, jump: L.MOVE.jump, gone, back, spring: -p.vy };
  });
  assert.ok(r.jelly > r.jump, `jelly ${r.jelly} > jump ${r.jump}`);
  assert.ok(r.gone >= 0.45 && r.gone <= 0.6, `crumbles after ${r.gone} s`);
  assert.ok(r.back >= 2.9 && r.back <= 3.2, `back after ${r.back} s`);
  assert.ok(r.spring > r.jump, `spring ${r.spring}`);
  await context.close();
});

test('pixel-leap AC-12: the portal shows the tally and freezes time; the leap steps 18, 35, smooth into Candy', async () => {
  const { context, page } = await open(PHONE);
  await play(page, 0, 2);
  await page.evaluate(() => {
    const L = window.__leap;
    L.game.ears = true;
    L.game.time = 42;
    const po = L.stage().things.find((t) => t.type === 'portal');
    Object.assign(L.player, { x: po.x - 1.5, y: po.y, vx: 0, vy: 0 });
    L.input.keys.add('right');
    L.sync();
    for (let i = 0; i < 120 && L.game.mode === 'play'; i++) L.step();
    L.input.keys.clear();
    L.sync();
  });
  assert.equal(await page.evaluate(() => window.__leap.game.mode), 'tally');
  assert.equal(await page.locator('[data-screen="tally"]').isVisible(), true);
  for (const f of ['coins', 'time', 'prize', 'best']) {
    assert.notEqual((await page.locator(`[data-tally-${f}]`).textContent()).trim(), '', `${f} shown`);
  }
  const frozen = await page.evaluate(() => {
    const L = window.__leap;
    const t = L.game.time;
    const x = L.player.x;
    L.steps(240);
    return L.game.time === t && L.player.x === x;
  });
  assert.equal(frozen, true, 'time on the tally does not count and nothing moves');
  await page.click('[data-leap]');
  const k = await page.evaluate(() => window.__leap.view.k);
  const at = async (secs) => {
    await page.evaluate((s) => {
      const L = window.__leap;
      while (L.game.mode === 'leap' && L.game.modeT < s) L.step();
    }, secs);
    return page.evaluate(() => {
      window.__leap.render();
      return window.__leap.renderRes();
    });
  };
  assert.equal(await at(0.5), 18);
  const b18 = await blocky(page, k);
  assert.equal(b18.varied, 0, 'blocks of 18 px per tile');
  assert.equal(await at(0.95), 35);
  assert.equal(await at(1.3), 70);
  await page.evaluate(() => {
    const L = window.__leap;
    for (let i = 0; i < 240 && L.game.mode !== 'play'; i++) L.step();
  });
  const s = await page.evaluate(() => ({ mode: window.__leap.game.mode, world: window.__leap.game.world, stage: window.__leap.game.stage, ears: window.__leap.game.ears, t: window.__leap.game.time }));
  assert.deepEqual(s, { mode: 'play', world: 1, stage: 0, ears: true, t: 0 });
  await context.close();
});

test('pixel-leap AC-13: phones show at least 12 tiles across in whole multiples of 18 px, the deck clear of the view, 7 tiles ahead', async () => {
  for (const [w, h] of [[360, 640], [390, 844]]) {
    for (const dpr of [1, 2, 3]) {
      const { context, page } = await open({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, hasTouch: true, isMobile: true });
      await page.click('[data-go]');
      const v = await page.evaluate(() => {
        const L = window.__leap;
        const c = document.getElementById('view').getBoundingClientRect();
        const d = document.querySelector('[data-deck]').getBoundingClientRect();
        return { tilesW: L.view.tilesW, U: L.view.U, viewBottom: c.bottom, deckTop: d.top, deckH: d.height };
      });
      assert.ok(v.tilesW >= 12, `${w}×${h}@${dpr}: ${v.tilesW} tiles`);
      assert.equal(v.U % 18, 0, `${w}×${h}@${dpr}: tile ${v.U}`);
      assert.ok(v.deckH > 100 && v.deckTop >= v.viewBottom - 0.5, 'the deck is below the view');
      await play(page, 0, 1);
      await place(page, 3);
      await keys(page, 'right');
      await steps(page, 240);
      const ahead = await page.evaluate(() => {
        const L = window.__leap;
        return L.cam.x + L.view.tilesW - L.player.x;
      });
      assert.ok(ahead >= 7, `${w}×${h}@${dpr}: ${ahead} tiles ahead`);
      await context.close();
    }
  }
  // Turning the phone mid-run keeps the monster's place, releases held controls and pauses.
  const { context, page } = await open({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  await page.click('[data-go]');
  await page.evaluate(() => {
    window.__leap.manual = true;
  });
  await keys(page, 'right', 'jump');
  const x0 = await page.evaluate(() => window.__leap.player.x);
  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForFunction(() => window.__leap.game.mode === 'paused');
  const r = await page.evaluate(() => ({ x: window.__leap.player.x, right: window.__leap.input.right, jump: window.__leap.input.jump, tilesW: window.__leap.view.tilesW }));
  assert.equal(r.x, x0);
  assert.equal(r.right, false);
  assert.equal(r.jump, false);
  assert.ok(r.tilesW >= 12);
  await context.close();
});

// Sends a touch pointer event to the element under (x, y), as a finger would.
const touch = (page, type, id, x, y) =>
  page.evaluate(
    ([type, id, x, y]) => {
      const target = type === 'pointerdown' ? document.elementFromPoint(x, y) : window;
      target.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', clientX: x, clientY: y, bubbles: true, cancelable: true }));
    },
    [type, id, x, y]
  );

test('pixel-leap AC-14: the touch deck runs and jumps, a touch keeps its half, two fingers work; keys do the same', async () => {
  const { context, page } = await open({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  await page.click('[data-go]');
  const pad = await page.locator('[data-pad]').boundingBox();
  const jump = await page.locator('[data-jump]').boundingBox();
  const st = () => page.evaluate(() => ({ left: window.__leap.input.left, right: window.__leap.input.right, jump: window.__leap.input.jump }));
  const cy = pad.y + pad.height / 2;
  await touch(page, 'pointerdown', 11, pad.x + pad.width * 0.8, cy);
  assert.deepEqual(await st(), { left: false, right: true, jump: false });
  await touch(page, 'pointermove', 11, pad.x + pad.width * 0.15, cy);
  assert.deepEqual(await st(), { left: true, right: false, jump: false });
  await touch(page, 'pointermove', 11, jump.x + jump.width / 2, cy); // slides over the jump half
  const slid = await st();
  assert.equal(slid.jump, false, 'a run touch never jumps');
  assert.equal(slid.right, true);
  await touch(page, 'pointerdown', 12, jump.x + jump.width / 2, jump.y + jump.height / 2);
  assert.deepEqual(await st(), { left: false, right: true, jump: true });
  await touch(page, 'pointerdown', 13, pad.x + 10, cy); // a third finger is ignored
  assert.equal((await st()).right, true);
  await touch(page, 'pointerup', 11, 0, 0);
  await touch(page, 'pointerup', 12, 0, 0);
  await touch(page, 'pointerup', 13, 0, 0);
  assert.deepEqual(await st(), { left: false, right: false, jump: false });
  for (const sel of ['[data-pad]', '[data-jump]', '[data-mute]', '.shell-back']) {
    const b = await page.locator(sel).boundingBox();
    assert.ok(b.width >= 44 && b.height >= 44, `${sel} is ${b.width}×${b.height}`);
  }
  await context.close();

  // Keyboard.
  const k = await open();
  await k.page.click('[data-go]');
  for (const [key, want] of [['ArrowRight', 'right'], ['KeyD', 'right'], ['ArrowLeft', 'left'], ['KeyA', 'left'], ['Space', 'jump'], ['ArrowUp', 'jump'], ['KeyW', 'jump'], ['KeyZ', 'jump']]) {
    await k.page.keyboard.down(key);
    assert.equal(await k.page.evaluate((w) => window.__leap.input[w], want), true, key);
    await k.page.keyboard.up(key);
  }
  const url = k.page.url();
  await k.page.keyboard.press('Escape');
  await k.page.waitForTimeout(200);
  assert.equal(await k.page.evaluate(() => window.__leap.game.mode), 'paused');
  assert.equal(k.page.url(), url, 'Escape in play pauses instead of leaving');
  await k.context.close();
});

test('pixel-leap AC-15: hiding the page pauses; a tap resumes without jumping, safe for 0.5 s; paused time does not count', async () => {
  const { context, page } = await open({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await page.click('[data-go]');
  await page.evaluate(() => {
    window.__leap.manual = true;
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  assert.equal(await page.evaluate(() => window.__leap.game.mode), 'paused');
  assert.equal(await page.locator('[data-screen="paused"]').isVisible(), true);
  const t = await page.evaluate(() => {
    const L = window.__leap;
    const t0 = L.game.time;
    L.steps(240);
    return L.game.time - t0;
  });
  assert.equal(t, 0);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
  });
  const jump = await page.locator('[data-jump]').boundingBox();
  await touch(page, 'pointerdown', 21, jump.x + jump.width / 2, jump.y + jump.height / 2);
  const r = await page.evaluate(() => ({ mode: window.__leap.game.mode, jump: window.__leap.input.jump, invul: window.__leap.player.invul }));
  assert.equal(r.mode, 'play');
  assert.equal(r.jump, false, 'the tap that resumes does not jump');
  assert.ok(r.invul >= 0.5);
  // A walker touching it in that half second does no harm.
  const safe = await page.evaluate(() => {
    const L = window.__leap;
    L.loadStage(0, 1);
    L.player.invul = 0.5;
    const w = L.stage().things.find((x) => x.type === 'walker');
    Object.assign(L.player, { x: w.x - 0.3, y: w.y, vx: 0, vy: 0 });
    L.steps(30);
    return L.player.poof <= 0;
  });
  assert.equal(safe, true);
  await touch(page, 'pointerup', 21, 0, 0);
  await context.close();
});

test('pixel-leap AC-16: after 3 poofs the hidden assist widens coyote and buffer (at most double); enemies keep speed; a checkpoint resets it', async () => {
  const { context, page } = await open();
  await play(page, 0, 1);
  const r = await page.evaluate(() => {
    const L = window.__leap;
    const p = L.player;
    const walker = L.stage().things.find((t) => t.type === 'walker');
    const speed = () => {
      const x0 = walker.x;
      for (let i = 0; i < 12; i++) L.step();
      return Math.abs(walker.x - x0);
    };
    Object.assign(p, { x: 2, y: 11 });
    const before = speed();
    const assists = [];
    for (let n = 0; n < 5; n++) {
      Object.assign(p, { x: 10, y: L.ROWS + 2, vy: 5, invul: 0, poof: 0 });
      for (let i = 0; i < 120; i++) L.step();
      assists.push(L.game.assist);
    }
    Object.assign(p, { x: 2, y: 11 });
    const after = speed();
    const coyote = L.MOVE.coyote * (1 + L.game.assist);
    const h = L.stage().things.find((t) => t.type === 'heart');
    Object.assign(p, { x: h.x, y: h.y, vx: 0, vy: 0 });
    L.step();
    return { assists, before, after, coyote, base: L.MOVE.coyote, reset: L.game.assist };
  });
  assert.equal(r.assists[0], 0);
  assert.equal(r.assists[1], 0);
  assert.ok(r.assists[2] > 0, 'on after the third poof');
  assert.ok(r.coyote <= 2 * r.base + 1e-9);
  assert.ok(Math.abs(r.after - r.before) < 1e-6, 'walkers keep their speed');
  assert.equal(r.reset, 0);
  await context.close();
});

test('pixel-leap AC-17: once Candy is reached the builder offers it as a start, with the ears if found; best times are kept', async () => {
  const { context, page } = await open();
  assert.equal(await page.locator('[data-starts]').isVisible(), false);
  await play(page, 0, 2);
  await page.evaluate(() => {
    const L = window.__leap;
    L.game.ears = true;
    const ears = L.stage().things.find((t) => t.type === 'ears');
    Object.assign(L.player, { x: ears.x, y: ears.y + 0.5 });
    L.step();
    const po = L.stage().things.find((t) => t.type === 'portal');
    Object.assign(L.player, { x: po.x, y: po.y });
    L.step();
    L.leap();
    for (let i = 0; i < 400; i++) L.step();
  });
  assert.equal(await page.evaluate(() => window.__leap.game.world), 1);
  await page.reload();
  await page.waitForFunction(() => window.__leap);
  assert.equal(await page.locator('[data-starts]').isVisible(), true);
  const store = await page.evaluate(() => window.__leap.store());
  assert.ok(store.best && Object.keys(store.best).some((k) => k.endsWith(':meadow')), 'the Meadow best is kept');
  await page.click('[data-world="candy"]');
  await page.click('[data-go]');
  const s = await page.evaluate(() => ({ world: window.__leap.game.world, ears: window.__leap.game.ears }));
  assert.deepEqual(s, { world: 1, ears: true });
  await context.close();
});

test("pixel-leap AC-18: each world plays its own jump sound and starts its own music", async () => {
  const { context, page } = await open();
  await page.click('[data-go]');
  await page.evaluate(() => {
    window.__leap.manual = true;
  });
  const jumpIn = async (w) => {
    await play(page, w, 0);
    await place(page, 3);
    await keys(page, 'jump');
    await steps(page, 2);
    await keys(page);
    return page.evaluate(() => window.__leap.heard.slice());
  };
  const m = await jumpIn(0);
  assert.ok(m.includes('m-jump'));
  assert.ok(m.includes('loop:m-music'), 'the Meadow music starts');
  await page.evaluate(() => {
    const L = window.__leap;
    const po = (L.loadStage(0, 2), L.stage().things.find((t) => t.type === 'portal'));
    L.game.mode = 'play';
    Object.assign(L.player, { x: po.x, y: po.y });
    L.step();
    L.leap();
    for (let i = 0; i < 400; i++) L.step();
  });
  const heard = await page.evaluate(() => window.__leap.heard.slice());
  assert.ok(heard.includes('loop:c-music'), 'Candy starts its own music');
  const c = await jumpIn(1);
  assert.equal(c.filter((x) => x.endsWith('-jump')).pop(), 'c-jump');
  await context.close();
});

test('pixel-leap AC-19: plays offline once played, Candy included', async () => {
  const { context, page } = await open();
  await page.evaluate(() => navigator.serviceWorker.register('../sw.js'));
  await page.evaluate(() => Promise.race([navigator.serviceWorker.ready, new Promise((r) => setTimeout(r, 10000))]));
  await page.reload(); // controlled now: this load caches the game's files
  await page.waitForFunction(() => window.__leap);
  await page.waitForLoadState('networkidle');
  await context.setOffline(true);
  await page.reload();
  await page.waitForFunction(() => window.__leap, null, { timeout: 10000 });
  await page.click('[data-go]');
  const ok = await page.evaluate(() => {
    const L = window.__leap;
    L.manual = true;
    L.startWorld(1);
    L.game.mode = 'play';
    L.render();
    return L.game.world === 1 && L.renderRes() === 70;
  });
  assert.equal(ok, true);
  await context.close();
});

test('pixel-leap AC-21: every stage can be finished; first coin within 5 s; checkpoints and hazards are placed fairly', async () => {
  const { context, page, errors } = await open();
  await page.click('[data-go]');
  const runs = await page.evaluate(() => {
    const L = window.__leap;
    L.manual = true;
    const out = [];
    for (let w = 0; w < L.WORLDS.length; w++) {
      for (let s = 0; s < L.WORLDS[w].stages.length; s++) {
        L.game.mode = 'play';
        L.game.ears = false;
        L.loadStage(w, s);
        const st = L.stage();
        const p = L.player;
        let t = 0;
        let hold = 0;
        let firstCoin = null;
        let end = null;
        // A simple player: run right, jump at walls, gaps, spikes and enemies, ride springs.
        while (t < 120) {
          const ahead = (dx, dy) => L.tileAt(Math.floor(p.x + dx), Math.floor(p.y + dy));
          let jump = false;
          if (p.ground && p.poof <= 0) {
            for (let d = 0.4; d <= 1.6; d += 0.2) if (ahead(d, -0.5) === 1 || ahead(d, -0.5) === 2) jump = true;
            let ground = false;
            for (let d = 0.5; d <= 1; d += 0.25) {
              const k = ahead(d, 0.5);
              if (k === 1 || k === 2 || k === 3) ground = true;
            }
            const cookie = st.things.some((c) => c.type === 'cookie' && c.state !== 'gone' && Math.abs(c.x - (p.x + 0.8)) < 0.6 && Math.abs(c.y - p.y) < 0.5);
            if (!ground && !cookie) jump = true;
            for (let d = 0.6; d <= 1.6; d += 0.2) if (ahead(d, -0.5) === L.T.SPIKES) jump = true;
            for (const e of st.things) if ((e.type === 'walker' || e.type === 'worm') && e.alive && e.x > p.x && e.x - p.x < 2.4 && Math.abs(e.y - p.y) < 1) jump = true;
          }
          const bouncer = st.things.some((c) => (c.type === 'spring' || c.type === 'jelly') && c.x > p.x - 0.2 && c.x - p.x < 2.2 && Math.abs(c.y - p.y) < 0.5);
          if (bouncer && p.ground) jump = false;
          if (jump || (bouncer && !p.ground)) hold = 0.4;
          L.input.keys.clear();
          L.input.keys.add('right');
          if (hold > 0) L.input.keys.add('jump');
          L.sync();
          hold -= 1 / 120;
          const coins = L.game.coins;
          L.step();
          t += 1 / 120;
          if (firstCoin === null && L.game.coins > coins) firstCoin = t;
          if (L.game.mode !== 'play') {
            end = L.game.mode;
            break;
          }
        }
        // The level data's fairness.
        const hazards = [];
        for (let c = 0; c < st.cols; c++) {
          if (st.ground[c] >= L.ROWS) hazards.push(c + 0.5);
          for (let y = 0; y < L.ROWS; y++) if (L.tileAt(c, y) === L.T.SPIKES) hazards.push(c + 0.5);
        }
        for (const e of st.things) if (e.type === 'walker' || e.type === 'worm') hazards.push(e.sx);
        const hearts = st.things.filter((h) => h.type === 'heart');
        const badHearts = hearts.filter((h) => hazards.some((x) => Math.abs(x - h.x) < 2) || st.things.some((c) => c.type === 'cookie' && Math.abs(c.x - h.x) < 1));
        const nearStart = hazards.filter((x) => x - st.start.x < 7);
        out.push({ w, s, end, t, firstCoin, badHearts: badHearts.length, nearStart: nearStart.length });
        L.input.keys.clear();
        L.sync();
      }
    }
    return out;
  });
  for (const r of runs) {
    assert.ok(r.end === 'wipe' || r.end === 'tally', `world ${r.w} stage ${r.s} finished (${r.end} after ${r.t.toFixed(1)} s)`);
    assert.equal(r.badHearts, 0, `world ${r.w} stage ${r.s}: checkpoints clear of hazards and cookies`);
    assert.equal(r.nearStart, 0, `world ${r.w} stage ${r.s}: no hazard near the start`);
  }
  assert.ok(runs[0].firstCoin !== null && runs[0].firstCoin <= 5, `first coin at ${runs[0].firstCoin} s`);
  assert.deepEqual(errors, []);
  await context.close();
});

test('pixel-leap AC-22: frames are cheap at 390×844, and the simulation is the same at 60 and 120 fps', async () => {
  const { context, page } = await open({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
  await page.click('[data-go]');
  await page.evaluate(() => {
    const L = window.__leap;
    L.frameWork.length = 0;
    L.input.keys.add('right');
    L.sync();
  });
  await page.waitForTimeout(20000);
  const avg = await page.evaluate(() => {
    const f = window.__leap.frameWork;
    return f.reduce((a, b) => a + b, 0) / f.length;
  });
  assert.ok(avg < 8, `average frame work ${avg.toFixed(2)} ms`);
  const same = await page.evaluate(() => {
    const L = window.__leap;
    L.manual = true;
    const run = (hz) => {
      L.loadStage(0, 0);
      L.game.mode = 'play';
      L.input.keys.clear();
      L.input.keys.add('right');
      L.sync();
      for (let i = 0; i < hz * 2; i++) {
        if (i === hz / 2) {
          L.input.keys.add('jump');
          L.sync();
        }
        L.advance(1 / hz);
      }
      return [L.player.x, L.player.y];
    };
    const a = run(60);
    const b = run(120);
    return Math.abs(a[0] - b[0]) < 0.05 && Math.abs(a[1] - b[1]) < 0.05 ? true : [a, b];
  });
  assert.equal(same, true);
  await context.close();
});

// The spec's state table: in each state, which of the builder, the deck, the paused card and the
// tally show. The deck is hidden while building and shown (still) otherwise.
test('pixel-leap AC-12: each state shows only what the state table says, and the end card plays again', async () => {
  const { context, page, errors } = await open({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const seen = () =>
    page.evaluate(() => {
      const shown = (sel) => {
        const el = document.querySelector(sel);
        const cs = getComputedStyle(el);
        return !el.hidden && cs.display !== 'none' && cs.visibility !== 'hidden';
      };
      return {
        builder: shown('[data-screen="build"]'),
        deck: shown('[data-deck]'),
        paused: shown('[data-screen="paused"]'),
        tally: shown('[data-screen="tally"]'),
        view: shown('#view'),
      };
    });
  const row = (builder, deck, paused, tally) => ({ builder, deck, paused, tally, view: true });
  assert.deepEqual(await seen(), row(true, false, false, false), 'building');
  await page.click('[data-go]');
  await page.evaluate(() => {
    window.__leap.manual = true;
  });
  assert.deepEqual(await seen(), row(false, true, false, false), 'playing');
  await page.evaluate(() => window.__leap.pause());
  assert.deepEqual(await seen(), row(false, true, true, false), 'paused');
  await page.evaluate(() => {
    const L = window.__leap;
    L.resume();
    L.loadStage(0, 2);
    const po = L.stage().things.find((t) => t.type === 'portal');
    Object.assign(L.player, { x: po.x, y: po.y });
    L.step();
  });
  assert.deepEqual(await seen(), row(false, true, false, true), 'tally');
  assert.match(await page.locator('[data-leap]').textContent(), /Leap/);
  await page.click('[data-leap]');
  await page.evaluate(() => {
    const L = window.__leap;
    while (L.game.modeT < 0.6) L.step();
  });
  assert.equal(await page.evaluate(() => window.__leap.game.mode), 'leap');
  assert.deepEqual(await seen(), row(false, true, false, false), 'leaping');
  await page.evaluate(() => {
    const L = window.__leap;
    while (L.game.mode !== 'play') L.step();
    L.loadStage(1, 1);
    const po = L.stage().things.find((t) => t.type === 'portal');
    Object.assign(L.player, { x: po.x, y: po.y });
    L.step();
  });
  assert.deepEqual(await seen(), row(false, true, false, true), 'end of the slice');
  assert.equal((await page.locator('[data-leap]').textContent()).trim(), 'Play again');
  assert.equal(await page.locator('[data-rebuild]').isVisible(), true);
  await page.click('[data-leap]');
  assert.equal(await page.evaluate(() => window.__leap.game.mode), 'build');
  assert.deepEqual(await seen(), row(true, false, false, false), 'back to building');
  assert.deepEqual(errors, []);
  await context.close();
});

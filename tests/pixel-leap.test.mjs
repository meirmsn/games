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
// The worlds, in their order.
const W = { meadow: 0, farm: 1, frost: 2, candy: 3, industrial: 4, mushroom: 5, pico: 6, ink: 7 };

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
// Steps the simulation until the game is playing (through the map and the leap), then hands the
// clock back to the page unless `keep` is set.
const untilPlay = (page, keep = false) =>
  page.evaluate((keep) => {
    const L = window.__leap;
    L.manual = true;
    for (let i = 0; i < 1200 && L.game.mode !== 'play'; i++) L.step();
    L.manual = keep;
    return L.game.mode;
  }, keep);
const goPlay = async (page, keep = false) => {
  await page.click('[data-go]');
  return untilPlay(page, keep);
};
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

test('pixel-leap AC-1: opens on the builder with a whole pixel monster; Go starts level 1, the Meadow; no errors', async () => {
  const { context, page, errors } = await open();
  assert.equal(await page.evaluate(() => window.__leap.game.mode), 'build');
  await page.waitForTimeout(200);
  const preview = await page.evaluate(() => {
    const c = document.querySelector('[data-preview]');
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let top = 0;
    let any = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i]) any++;
    for (let i = 3; i < c.width * 4 * 4; i += 4) if (d[i]) top++; // the top four rows
    return { any, top, pixelated: getComputedStyle(c).imageRendering, key: window.__leap.baked().key };
  });
  assert.ok(preview.any > 500, 'the monster is drawn');
  assert.equal(preview.top, 0, 'nothing touches the top edge: the head is inside the preview');
  assert.equal(preview.pixelated, 'pixelated');
  assert.match(preview.key, /^meadow:/, 'the builder shows the Meadow’s baked monster');
  assert.equal(await page.locator('[data-screen="build"]').isVisible(), true);
  assert.equal(await page.locator('[data-hud]').isVisible(), false);
  const t0 = await page.evaluate(() => [window.__leap.game.t, window.__leap.cam.x]);
  await page.waitForTimeout(600);
  const t1 = await page.evaluate(() => [window.__leap.game.t, window.__leap.cam.x]);
  assert.ok(t1[0] > t0[0] && t1[1] !== t0[1], 'the world moves behind the builder');
  await page.click('[data-go]');
  assert.equal(await page.evaluate(() => window.__leap.game.mode), 'map', 'Go shows the map first');
  await untilPlay(page);
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
  assert.equal(await goPlay(blocked.page), 'play');
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
  const c = await measure(W.candy, 2);
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
  await play(page, W.candy, 0);
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
  const ink = await page.evaluate(() => {
    const L = window.__leap;
    L.manual = true;
    L.go();
    L.startWorld(7);
    const b = L.baked();
    const cols = new Set();
    for (const f of Object.values(b.frames)) {
      const d = f.getContext('2d').getImageData(0, 0, f.width, f.height).data;
      for (let i = 0; i < d.length; i += 4) if (d[i + 3]) cols.add(`${d[i]},${d[i + 1]},${d[i + 2]}`);
    }
    return [...cols].sort();
  });
  assert.deepEqual(ink, ['242,239,230', '29,27,34'], 'the Ink monster is ink and dark only');
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

test('pixel-leap AC-7: a hit costs a heart if held, else a life and the level restarts; falling always costs a life; the third ends the run', async () => {
  const { context, page } = await open();
  await play(page, 0, 0);
  const r = await page.evaluate(() => {
    const L = window.__leap;
    const p = L.player;
    const out = {};
    const settle = () => {
      for (let i = 0; i < 120 && (p.poof > 0 || L.game.mode !== 'play'); i++) L.step();
    };
    // A spike with no heart: a life, and the level from its beginning with its coins back.
    const st = L.stage();
    let sx = 0;
    for (let c = 0; c < st.cols; c++) if (L.tileAt(c, st.ground[c] - 1) === L.T.SPIKES) {
      sx = c;
      break;
    }
    L.game.coins = 3;
    st.things.find((t) => t.type === 'coin').alive = false;
    Object.assign(p, { x: sx + 0.5, y: st.ground[sx], vx: 0, vy: 0, invul: 0 });
    L.step();
    settle();
    const fresh = L.stage();
    out.spike = { lives: L.game.lives, x: p.x, start: fresh.start.x, coins: L.game.coins, coinsBack: fresh.things.filter((t) => t.type === 'coin').every((t) => t.alive) };
    // A walker's side with a heart held: the heart goes, not a life.
    L.game.shields = 1;
    const w = L.stage().things.find((t) => t.type === 'walker');
    Object.assign(p, { x: w.x - 0.5, y: w.y, vx: 0, vy: 0, invul: 0, ground: true });
    L.step();
    out.shielded = { lives: L.game.lives, shields: L.game.shields, invul: p.invul > 0, poof: p.poof > 0 };
    // Falling off with a heart held: still a life.
    L.game.shields = 2;
    p.invul = 0;
    Object.assign(p, { x: 10, y: L.ROWS + 2, vy: 5 });
    L.step();
    settle();
    out.fall = { lives: L.game.lives, shields: L.game.shields };
    // The third life: game over, then Play again starts level 1 with three lives.
    Object.assign(p, { x: 10, y: L.ROWS + 2, vy: 5, invul: 0 });
    L.step();
    for (let i = 0; i < 120 && L.game.mode === 'play'; i++) L.step();
    out.over = { mode: L.game.mode, lives: L.game.lives };
    return out;
  });
  assert.equal(r.spike.lives, 2, 'a spike cost a life');
  assert.equal(r.spike.x, r.spike.start, 'back at the level’s beginning');
  assert.equal(r.spike.coins, 0);
  assert.equal(r.spike.coinsBack, true, 'the level’s coins are back');
  assert.deepEqual(r.shielded, { lives: 2, shields: 0, invul: true, poof: false });
  assert.deepEqual(r.fall, { lives: 1, shields: 2 });
  assert.deepEqual(r.over, { mode: 'tally', lives: 0 });
  assert.equal((await page.locator('[data-tally-title]').textContent()).trim(), 'Game over');
  assert.equal(await page.locator('[data-rebuild]').isVisible(), true);
  await page.click('[data-leap]');
  await untilPlay(page, true);
  const again = await page.evaluate(() => ({ mode: window.__leap.game.mode, world: window.__leap.game.world, lives: window.__leap.game.lives }));
  assert.deepEqual(again, { mode: 'play', world: 0, lives: 3 });
  await context.close();
});

test('pixel-leap AC-8: landing on a walker defeats it and bounces, higher with jump held; a spiky walker hurts', async () => {
  const { context, page } = await open();
  await play(page, 0, 0);
  const bounce = async (hold) =>
    page.evaluate((hold) => {
      const L = window.__leap;
      L.loadStage(0, 0);
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
  await play(page, W.frost, 0);
  const spiky = await page.evaluate(() => {
    const L = window.__leap;
    const p = L.player;
    L.game.shields = 1;
    const w = L.stage().things.find((t) => t.type === 'walker' && t.kind === 'spiky');
    Object.assign(p, { x: w.x, y: w.y - 1.2, vx: 0, vy: 6, ground: false, invul: 0 });
    for (let i = 0; i < 30; i++) L.step();
    return { alive: w.alive, shields: L.game.shields };
  });
  assert.deepEqual(spiky, { alive: true, shields: 0 }, 'a spiky walker survives the landing, and it costs the heart');
  await context.close();
});

test('pixel-leap AC-9: a heart adds a heart (at most two) and a coin; with two held it shows and counts as a coin; the HUD shows lives and hearts', async () => {
  const { context, page } = await open();
  await play(page, 0, 0);
  const r = await page.evaluate(() => {
    const L = window.__leap;
    const p = L.player;
    const take = () => {
      const h = { type: 'heart', x: p.x, y: p.y - 0.5, alive: true, id: 999, t: 0 };
      L.stage().things.push(h);
      L.step();
      return h.alive;
    };
    const out = [];
    for (let i = 0; i < 3; i++) {
      take();
      out.push([L.game.shields, L.game.coins]);
    }
    return out;
  });
  assert.deepEqual(r, [[1, 1], [2, 2], [2, 3]]);
  await page.evaluate(() => window.__leap.render());
  const hud = await page.evaluate(() => ({
    lives: document.querySelectorAll('[data-hud-lives] .hud-icon.on').length,
    hearts: document.querySelectorAll('[data-hud-hearts] .hud-icon.on').length,
    slots: document.querySelectorAll('[data-hud-hearts] .hud-icon').length,
  }));
  await page.waitForFunction(() => document.querySelectorAll('[data-hud-hearts] .hud-icon.on').length === 2);
  assert.equal(hud.lives, 3);
  assert.equal(hud.slots, 2);
  // With two held, a heart in the level is drawn as a coin.
  const drawnAsCoin = await page.evaluate(() => {
    const L = window.__leap;
    const h = L.stage().things.find((t) => t.type === 'heart' && t.alive);
    Object.assign(L.player, { x: h.x - 3 });
    L.cam.x = h.x - L.view.tilesW / 2;
    L.render();
    const c = document.getElementById('view');
    const g = c.getContext('2d');
    const U = L.view.U;
    const sx = Math.round((h.x - L.cam.x) * U);
    const sy = Math.round((h.y - L.cam.y) * U);
    const d = g.getImageData(sx - U / 4, sy - U / 4, U / 2, U / 2).data;
    let red = 0;
    let gold = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i] > 200 && d[i + 1] < 90 && d[i + 2] < 90) red++;
      if (d[i] > 200 && d[i + 1] > 150 && d[i + 2] < 90) gold++;
    }
    return { red, gold };
  });
  assert.ok(drawnAsCoin.gold > drawnAsCoin.red, `a coin, not a heart (gold ${drawnAsCoin.gold}, red ${drawnAsCoin.red})`);
  await context.close();
});

test('pixel-leap AC-10: Frost’s ears join the monster and let it float', async () => {
  const { context, page } = await open();
  await play(page, W.frost, 0);
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

test('pixel-leap AC-11: jelly bounces, cookies crumble and come back, springs launch, ice slides, drips fall and hurt', async () => {
  const { context, page } = await open();
  await play(page, W.candy, 0);
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
    L.loadStage(2, 0);
    const ck = L.stage().things.find((t) => t.type === 'cookie');
    Object.assign(p, { x: ck.x, y: ck.y, vx: 0, vy: 0, ground: true });
    let gone = 0;
    for (let i = 1; i < 200 && !gone; i++) {
      L.step();
      if (ck.state === 'gone') gone = i / 120;
    }
    Object.assign(p, { x: 3, y: 11, vx: 0, vy: 0 });
    let back = 0;
    for (let i = 1; i < 600 && !back; i++) {
      L.step();
      if (ck.state === 'whole') back = i / 120;
    }
    return { jelly, jump: L.MOVE.jump, gone, back };
  });
  assert.ok(r.jelly > r.jump, `jelly ${r.jelly} > jump ${r.jump}`);
  assert.ok(r.gone >= 0.45 && r.gone <= 0.6, `crumbles after ${r.gone} s`);
  assert.ok(r.back >= 2.9 && r.back <= 3.2, `back after ${r.back} s`);
  // A spring in the Meadow launches higher than a jump.
  await play(page, 0, 0);
  const spring = await page.evaluate(() => {
    const L = window.__leap;
    const p = L.player;
    const sp = L.stage().things.find((t) => t.type === 'spring');
    Object.assign(p, { x: sp.x, y: sp.y, vx: 0, vy: 0, ground: true });
    L.step();
    L.step();
    return -p.vy;
  });
  assert.ok(spring > r.jump, `spring ${spring}`);
  // Ice: running at top speed then letting go slides further in Frost than in the Meadow.
  const slide = async (w) => {
    await play(page, w, 0);
    await place(page, 3);
    await keys(page, 'right');
    await steps(page, 120);
    await keys(page);
    return page.evaluate(() => {
      const L = window.__leap;
      const x0 = L.player.x;
      for (let i = 0; i < 240 && Math.abs(L.player.vx) > 0.01; i++) L.step();
      return L.player.x - x0;
    });
  };
  const grass = await slide(0);
  const ice = await slide(W.frost);
  assert.ok(ice > grass * 2, `ice slides ${ice.toFixed(2)} tiles, grass ${grass.toFixed(2)}`);
  // An Ink drip lets go as the monster comes near, and hurts if it lands on it.
  await play(page, W.ink, 0);
  const drip = await page.evaluate(() => {
    const L = window.__leap;
    const p = L.player;
    const d = L.stage().things.find((t) => t.type === 'drip');
    Object.assign(p, { x: d.x - 6, y: 11, vx: 0, vy: 0, invul: 0, ground: true });
    L.step();
    const still = !d.falling;
    Object.assign(p, { x: d.x - 3, y: 11 });
    L.step();
    const falls = Boolean(d.falling);
    // Stand under it: it hits.
    L.loadStage(7, 0);
    const d2 = L.stage().things.find((t) => t.type === 'drip');
    L.game.shields = 1;
    Object.assign(p, { x: d2.x, y: 11, vx: 0, vy: 0, invul: 0, ground: true });
    for (let i = 0; i < 90; i++) L.step();
    return { still, falls, shields: L.game.shields };
  });
  assert.deepEqual(drip, { still: true, falls: true, shields: 0 });
  await context.close();
});

test('pixel-leap AC-12: the door leads to the map with no numbers; the way on paints in, and the leap from Frost steps 18, 35, smooth into Candy', async () => {
  const { context, page } = await open(PHONE);
  await play(page, W.frost, 0);
  await page.evaluate(() => {
    const L = window.__leap;
    L.game.ears = true;
    L.game.time = 42;
    const po = L.stage().things.find((t) => t.type === 'portal');
    Object.assign(L.player, { x: po.x - 1.5, y: po.y });
    L.input.keys.add('right');
    L.sync();
    for (let i = 0; i < 120 && L.game.mode === 'play'; i++) L.step();
    L.input.keys.clear();
    L.sync();
  });
  const map = await page.evaluate(() => ({ mode: window.__leap.game.mode, map: window.__leap.game.map }));
  assert.equal(map.mode, 'map');
  assert.deepEqual([map.map.from, map.map.to], [W.frost, W.candy]);
  assert.equal(await page.locator('[data-screen="tally"]').isVisible(), false, 'no numbers between levels');
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
  await page.evaluate(() => {
    const L = window.__leap;
    for (let i = 0; i < 1000 && L.game.mode === 'map'; i++) L.step();
  });
  assert.equal(await page.evaluate(() => window.__leap.game.mode), 'leap');
  assert.equal(await at(0.5), 18);
  const b18 = await blocky(page, k);
  assert.equal(b18.varied, 0, 'blocks of 18 px per tile');
  assert.equal(await at(0.95), 35);
  assert.equal(await at(1.3), 70);
  await page.evaluate(() => {
    const L = window.__leap;
    for (let i = 0; i < 240 && L.game.mode !== 'play'; i++) L.step();
  });
  const s = await page.evaluate(() => ({ mode: window.__leap.game.mode, world: window.__leap.game.world, ears: window.__leap.game.ears, t: window.__leap.game.time }));
  assert.deepEqual(s, { mode: 'play', world: W.candy, ears: true, t: 0 });
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
      // The Meadow's long flat stretch from column 35, with its walker out of the way.
      await play(page, 0, 0);
      await page.evaluate(() => window.__leap.stage().things.forEach((t) => {
        if (t.type === 'walker') t.alive = false;
      }));
      await place(page, 35, 10);
      await keys(page, 'right');
      await steps(page, 150);
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
  await goPlay(page, true);
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
  await goPlay(page);
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
  await goPlay(k.page);
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
  await goPlay(page, true);
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
    L.loadStage(0, 0);
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

test('pixel-leap AC-16: after two lives lost the hidden assist widens coyote and buffer (at most double); enemies keep speed; it survives a game over; a cleared level resets it', async () => {
  const { context, page } = await open();
  await play(page, 0, 0);
  const r = await page.evaluate(() => {
    const L = window.__leap;
    const p = L.player;
    const walkerSpeed = () => {
      const w = L.stage().things.find((t) => t.type === 'walker');
      Object.assign(p, { x: 2, y: 11 });
      const x0 = w.x;
      for (let i = 0; i < 12; i++) L.step();
      return Math.abs(w.x - x0);
    };
    const before = walkerSpeed();
    const assists = [];
    const lose = () => {
      Object.assign(p, { x: 10, y: L.ROWS + 2, vy: 5, invul: 0, poof: 0 });
      L.step();
      for (let i = 0; i < 120 && (p.poof > 0); i++) L.step();
      assists.push(L.game.assist);
    };
    lose();
    lose();
    const after = walkerSpeed();
    const coyote = L.MOVE.coyote * (1 + L.game.assist);
    lose(); // the third: game over
    const overMode = L.game.mode;
    L.leap(); // Play again
    for (let i = 0; i < 1000 && L.game.mode !== 'play'; i++) L.step();
    const afterOver = L.game.assist;
    // Clear the level: the next level starts without the assist.
    const po = L.stage().things.find((t) => t.type === 'portal');
    Object.assign(p, { x: po.x, y: po.y, invul: 0 });
    L.step();
    for (let i = 0; i < 1000 && L.game.mode !== 'play'; i++) L.step();
    return { assists, before, after, coyote, base: L.MOVE.coyote, overMode, afterOver, reset: L.game.assist, world: L.game.world };
  });
  assert.equal(r.assists[0], 0);
  assert.ok(r.assists[1] > 0, 'on after the second life lost');
  assert.ok(r.coyote <= 2 * r.base + 1e-9);
  assert.ok(Math.abs(r.after - r.before) < 1e-6, 'walkers keep their speed');
  assert.equal(r.overMode, 'tally');
  assert.ok(r.afterOver > 0, 'a game over keeps the assist');
  assert.equal(r.world, 1);
  assert.equal(r.reset, 0, 'a cleared level resets it');
  await context.close();
});

test('pixel-leap AC-17: eight levels, eight worlds, in order; each ends with a glimpse of the next; the UI follows the world; best times are kept under version 3', async () => {
  const { context, page } = await open(PHONE);
  await play(page, 0, 0);
  const worlds = await page.evaluate(() => window.__leap.WORLDS.map((w) => w.id));
  assert.deepEqual(worlds, ['meadow', 'farm', 'frost', 'candy', 'industrial', 'mushroom', 'pico', 'ink']);
  // The last stretch of each level is drawn in the next world's style: its sky is the next world's.
  for (let w = 0; w < worlds.length - 1; w++) {
    const sky = await page.evaluate((w) => {
      const L = window.__leap;
      L.startWorld(w);
      L.game.mode = 'play';
      const st = L.stage();
      const next = L.WORLDS[w + 1];
      Object.assign(L.player, { x: st.next - 2, y: st.ground[st.next - 2], vx: 0, vy: 0 });
      L.cam.x = st.next - L.view.tilesW / 2;
      L.cam.y = st.ground[st.next - 2] - L.view.tilesH * 0.62;
      L.render();
      const c = document.getElementById('view');
      const g = c.getContext('2d');
      const sx = Math.round((st.next + 2 - L.cam.x) * L.view.U);
      const d = g.getImageData(sx, 4, 1, 1).data;
      const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
      const want = hex(next.sky[0]);
      return { got: [d[0], d[1], d[2]], want, id: next.id, next: st.next < st.cols };
    }, w);
    assert.equal(sky.next, true);
    const diff = sky.got.reduce((n, v, i) => n + Math.abs(v - sky.want[i]), 0);
    assert.ok(diff < 40, `level ${w + 1}'s end shows ${sky.id}'s sky (${sky.got} vs ${sky.want})`);
  }
  const ui = await page.evaluate(() => {
    const L = window.__leap;
    const at = (w) => {
      L.startWorld(w);
      L.game.mode = 'play';
      return { smooth: document.body.classList.contains('smooth'), font: getComputedStyle(document.querySelector('.hud > span')).fontFamily };
    };
    return [at(0), at(3), at(7), at(5), at(6)];
  });
  assert.equal(ui[0].smooth, false);
  assert.match(ui[0].font, /Kenney Pixel/);
  assert.equal(ui[1].smooth, true);
  assert.doesNotMatch(ui[1].font, /Kenney Pixel/);
  assert.equal(ui[2].smooth, false);
  assert.equal(ui[3].smooth, true, 'Mushroom is smooth');
  assert.equal(ui[4].smooth, false, 'Pico is pixels');
  // A cleared level keeps its best time.
  await page.evaluate(() => {
    const L = window.__leap;
    L.startWorld(0);
    L.game.mode = 'play';
    L.game.time = 61;
    const po = L.stage().things.find((t) => t.type === 'portal');
    Object.assign(L.player, { x: po.x, y: po.y });
    L.step();
  });
  const best = await page.evaluate(() => window.__leap.store().best);
  assert.ok(Object.entries(best).some(([k, v]) => k === '3:meadow' && v === 61), 'kept under version 3');
  await context.close();
});

test("pixel-leap AC-18: each world plays its own jump sound and starts its own music", async () => {
  const { context, page } = await open();
  await goPlay(page, true);
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
  const leapFrom = (w) =>
    page.evaluate((w) => {
      const L = window.__leap;
      L.startWorld(w);
      L.game.mode = 'play';
      const po = L.stage().things.find((t) => t.type === 'portal');
      Object.assign(L.player, { x: po.x, y: po.y, invul: 0 });
      L.step();
      for (let i = 0; i < 1000 && L.game.mode !== 'play'; i++) L.step();
      return L.heard.slice();
    }, w);
  assert.ok((await leapFrom(W.frost)).includes('loop:c-music'), 'Candy starts its own music');
  assert.ok((await leapFrom(W.pico)).includes('loop:i-music'), 'Ink starts its own music');
  const c = await jumpIn(W.candy);
  assert.equal(c.filter((x) => x.endsWith('-jump')).pop(), 'c-jump');
  await context.close();
});

test('pixel-leap AC-19: plays offline once played, every world included', async () => {
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
    const out = {};
    for (let w = 0; w < L.WORLDS.length; w++) {
      L.startWorld(w);
      L.game.mode = 'play';
      L.render();
      out[L.WORLDS[w].id] = L.renderRes();
    }
    return out;
  });
  assert.deepEqual(ok, { meadow: 18, farm: 18, frost: 18, candy: 70, industrial: 18, mushroom: 70, pico: 8, ink: 16 });
  await context.close();
});

// A simple scripted player: it runs right, jumps at walls, gaps, spikes and bad guys, rides springs
// and caps, steps onto moving platforms and lifts when they come, and waits on them until the far
// side is in reach. `ride: false` makes it ignore moving platforms (it jumps the gap instead).
const BOT = `(opts) => {
  const L = window.__leap;
  const p = L.player;
  const T = L.T;
  const solidT = (k) => k === T.GROUND || k === T.BLOCK || k === T.HAY || k === T.BELTL || k === T.BELTR;
  const footing = (k) => solidT(k) || k === T.ONEWAY;
  let t = 0;
  let hold = 0;
  let firstCoin = null;
  let end = null;
  let lives = 0;
  let lastCap = null;
  const deaths = [];
  while (t < opts.limit) {
    const st = L.stage();
    const ahead = (dx, dy) => L.tileAt(Math.floor(p.x + dx), Math.floor(p.y + dy));
    const movers = st.things.filter((m) => m.type === 'mover');
    let jump = false;
    let run = 1;
    if (p.onMover && p.ground && opts.ride) {
      // Riding: step off once the ground on the far side is at the feet, near enough.
      const m = p.onMover;
      const edge = m.x + m.w;
      let land = false;
      for (let d = 0; d <= 1.6; d += 0.4) {
        const k = L.tileAt(Math.floor(edge + d), Math.floor(p.y + 0.1));
        if (footing(k) && L.tileAt(Math.floor(edge + d), Math.floor(p.y - 0.5)) === T.AIR) land = true;
      }
      const other = movers.find((o) => o !== m && o.x > m.x && o.x - edge < 1.2 && Math.abs(o.y - m.y) < 0.4);
      run = land || other ? 1 : p.x < m.x + 1.5 ? 0.5 : 0;
      if (run === 0.5) run = 1;
      if (!land && !other && p.x > m.x + 1.8) run = 0;
    } else if (p.ground && p.poof <= 0) {
      for (let d = 0.4; d <= 1.6; d += 0.2) if (solidT(ahead(d, -0.5))) jump = true;
      let ground = false;
      for (let d = 0.5; d <= 1; d += 0.25) if (footing(ahead(d, 0.5))) ground = true;
      const cookie = st.things.some((c) => c.type === 'cookie' && c.state !== 'gone' && Math.abs(c.x - (p.x + 0.8)) < 0.6 && Math.abs(c.y - p.y) < 0.5);
      const onIt = movers.some((m) => p.x + 0.9 > m.x && p.x + 0.9 < m.x + m.w && Math.abs(m.y - p.y) < 0.3);
      if (!ground && !cookie && !onIt) jump = true;
      for (let d = 0.6; d <= 1.6; d += 0.2) if (ahead(d, -0.5) === T.SPIKES) jump = true;
      // A bad guy ahead: jump it, unless a gap is coming (then the jump waits for the edge).
      let gapSoon = false;
      for (let d = 1; d <= 4; d += 0.5) if (!footing(ahead(d, 0.5))) gapSoon = true;
      for (const e of st.things) if ((e.type === 'walker' || e.type === 'worm' || e.type === 'flyer') && e.alive && e.x > p.x && e.x - p.x < 2.4 && Math.abs(e.y - p.y) < 1.4 && (!gapSoon || e.x - p.x < 1.2)) jump = true;
      // A cap ahead, a little above: jump onto it.
      for (const c of st.things) if (c.type === 'cap' && c.x - p.x > -0.5 && c.x - p.x < 2.2 && p.y - c.y > 0.5 && p.y - c.y < 3) jump = true;
      if (opts.ride) {
        // A mover in the gap or lift ahead at our feet: wait for it, then step on.
        const m = movers.find((m) => m.x + m.w > p.x + 0.4 && m.sx - p.x < 3.5 && m.sx + m.w > p.x && Math.abs(m.sy - p.y) < 0.5);
        if (m && (!ground || jump)) {
          jump = false;
          const here = Math.abs(m.y - p.y) < 0.15 && m.x <= p.x + 0.9 && m.x + m.w > p.x + 0.9;
          run = here ? 1 : 0;
        }
      }
    }
    // Waiting on a belt: run against it, just enough to hold the spot.
    if (run === 0 && p.ground) {
      const k = L.tileAt(Math.floor(p.x), Math.floor(p.y + 0.1));
      const carry = k === T.BELTR ? 1 : k === T.BELTL ? -1 : 0;
      if (carry && Math.sign(p.vx + carry * 2.5) === carry) run = -carry;
    }
    // In the air over caps: aim for the middle of the next cap ahead whose top is below the feet,
    // never back at the one just left.
    if (!p.ground) {
      const left = st.things.find((c) => c.type === 'cap' && c.boing > 0);
      if (left) lastCap = left;
      const caps = st.things.filter((c) => c.type === 'cap' && c !== lastCap && c.y > p.y + 0.2 && c.x + 1.5 > p.x - 1 && Math.abs(c.x + 1.5 - p.x) < 4.5 && (!lastCap || c.x > lastCap.x));
      if (caps.length) {
        const c = caps.sort((a, b) => a.x - b.x)[0];
        const dx = c.x + 1.5 - p.x;
        run = Math.abs(dx) < 0.3 ? 0 : Math.sign(dx);
      }
    } else if (!p.onCap) lastCap = null;
    // A flyer diving nearby: back off and let it pass, unless a walker is right there.
    const diving = st.things.some((f) => f.type === 'flyer' && f.alive && f.state === 'swoop' && f.x - p.x > -1.5 && f.x - p.x < 4.5);
    if (diving && p.ground) {
      run = -1;
      jump = st.things.some((e) => e.type === 'walker' && e.alive && Math.abs(e.x - p.x) < 1.3 && Math.abs(e.y - p.y) < 1);
    }
    const bouncer = st.things.some((c) => (c.type === 'spring' || c.type === 'jelly') && c.x > p.x - 0.2 && c.x - p.x < 2.2 && Math.abs(c.y - p.y) < 0.5);
    if (bouncer && p.ground) jump = false;
    if (jump || (bouncer && !p.ground)) hold = 0.4;
    L.input.keys.clear();
    if (run > 0) L.input.keys.add('right');
    if (run < 0) L.input.keys.add('left');
    if (hold > 0) L.input.keys.add('jump');
    L.sync();
    hold -= 1 / 120;
    if (opts.trace && p.x > opts.trace[0] && p.x < opts.trace[1] && Math.round(t * 120) % 6 === 0) opts.tr.push([+p.x.toFixed(2), +p.y.toFixed(2), +p.vy.toFixed(1), p.ground ? 'g' : '', run, hold > 0 ? 'J' : '']);
    const coins = L.game.coins;
    const before = L.game.lives;
    L.step();
    t += 1 / 120;
    if (L.game.lives < before) {
      lives++;
      deaths.push(Math.round(p.x));
      if (opts.why) opts.why.push({ x: +p.x.toFixed(1), y: +p.y.toFixed(1), near: st.things.filter((e) => e.alive && Math.abs(e.x - p.x) < 3 && e.type !== 'coin').map((e) => [e.type, +e.x.toFixed(1), +e.y.toFixed(1), e.state]) });
    }
    if (firstCoin === null && L.game.coins > coins) firstCoin = t;
    if (L.game.mode !== 'play') {
      end = L.game.mode;
      break;
    }
    if (opts.stopAfterDeaths && lives >= opts.stopAfterDeaths) break;
  }
  L.input.keys.clear();
  L.sync();
  return { end, t, firstCoin, lives, deaths, x: +p.x.toFixed(1), y: +p.y.toFixed(1) };
}`;

test('pixel-leap AC-21: every level can be finished; first coin within 5 s; hazards clear of the start; open air above bouncers; mover tracks clear', async () => {
  const { context, page, errors } = await open();
  await page.click('[data-go]');
  const runs = await page.evaluate((BOT) => {
    const bot = eval(BOT);
    const L = window.__leap;
    L.manual = true;
    const out = [];
    for (let w = 0; w < L.WORLDS.length; w++) {
      L.game.mode = 'play';
      L.game.ears = false;
      L.game.lives = 99;
      L.startWorld(w);
      const r = bot({ limit: 150, ride: true });
      // The level data's layout rules.
      L.startWorld(w);
      const st = L.stage();
      const solid = (k) => k === L.T.GROUND || k === L.T.BLOCK || k === L.T.HAY || k === L.T.BELTL || k === L.T.BELTR;
      const hazards = [];
      for (let c = 0; c < st.cols; c++) {
        if (st.ground[c] >= st.rows) hazards.push(c + 0.5);
        for (let y = 0; y < st.rows; y++) {
          const k = L.tileAt(c, y);
          if (k === L.T.SPIKES || k === L.T.BELTL || k === L.T.BELTR) hazards.push(c + 0.5);
        }
      }
      for (const e of st.things) {
        if (e.type === 'walker' || e.type === 'worm' || e.type === 'drip') hazards.push(e.sx);
        if (e.type === 'flyer') hazards.push(e.sx - 5 - 1); // it swoops from 5 tiles out
      }
      const nearStart = hazards.filter((x) => x - st.start.x < 7);
      const blocked = [];
      const bouncers = [];
      for (const b of st.things) if (b.type === 'spring' || b.type === 'jelly' || b.type === 'cap') bouncers.push({ type: b.type, x: Math.floor(b.type === 'cap' ? b.sx + 1 : b.sx), y: b.sy, air: b.type === 'cap' ? 9 : 6 });
      for (let c = 0; c < st.cols; c++) for (let y = 0; y < st.rows; y++) if (L.tileAt(c, y) === L.T.HAY) bouncers.push({ type: 'hay', x: c, y, air: 6 });
      for (const b of bouncers) {
        const span = b.type === 'cap' ? 2 : 1;
        for (let dx = -span; dx <= span; dx++) {
          for (let dy = 1; dy <= b.air; dy++) {
            const k = L.tileAt(b.x + dx, b.y - dy);
            if (solid(k)) blocked.push([b.type, b.x + dx, b.y - dy]);
          }
        }
      }
      const tracks = [];
      for (const m of st.things.filter((t) => t.type === 'mover')) {
        const x0 = Math.floor(m.sx);
        const x1 = Math.ceil(m.sx + m.w + (m.axis === 'x' ? m.range : 0)) - 1;
        const y0 = Math.floor(m.sy - (m.axis === 'y' ? m.range : 0)) - 2;
        for (let x = x0; x <= x1; x++) for (let y = y0; y < m.sy; y++) if (solid(L.tileAt(x, y))) tracks.push(['mover', x, y]);
        if (m.sy > st.base + 3) tracks.push(['below the ground line', x0, m.sy]);
        if (x1 >= st.next) tracks.push(['into the glimpse', x1]);
      }
      // The assist never changes a mechanic's speed.
      const before = JSON.stringify([L.MOVE.mover, L.MOVE.belt, L.MOVE.caps, L.MOVE.hay, L.MOVE.hayHigh, L.MOVE.swoop]);
      L.game.assist = 1;
      const after = JSON.stringify([L.MOVE.mover, L.MOVE.belt, L.MOVE.caps, L.MOVE.hay, L.MOVE.hayHigh, L.MOVE.swoop]);
      L.game.assist = 0;
      out.push({ w, id: L.WORLDS[w].id, ...r, nearStart: nearStart.length, blocked, tracks, assist: before === after });
    }
    return out;
  }, BOT);
  for (const r of runs) {
    assert.equal(r.end, r.w === runs.length - 1 ? 'tally' : 'map', `level ${r.w + 1} (${r.id}) finished (after ${r.t.toFixed(1)} s, lives lost at ${r.deaths})`);
    assert.equal(r.nearStart, 0, `level ${r.w + 1}: no hazard near the start`);
    assert.deepEqual(r.blocked, [], `level ${r.w + 1}: open air above every spring, jelly, haybale and cap`);
    assert.deepEqual(r.tracks, [], `level ${r.w + 1}: every mover's track is clear`);
    assert.equal(r.assist, true);
  }
  assert.ok(runs[0].firstCoin !== null && runs[0].firstCoin <= 5, `first coin at ${runs[0].firstCoin} s`);
  assert.deepEqual(errors, []);
  await context.close();
});

test('pixel-leap AC-22: frames are cheap at 390×844, and the simulation is the same at 60 and 120 fps', async () => {
  const { context, page } = await open({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
  await goPlay(page);
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
  assert.equal(await page.evaluate(() => window.__leap.game.mode), 'map');
  assert.deepEqual(await seen(), row(false, true, false, false), 'the map');
  await untilPlay(page, true);
  assert.deepEqual(await seen(), row(false, true, false, false), 'playing');
  await page.evaluate(() => window.__leap.pause());
  assert.deepEqual(await seen(), row(false, true, true, false), 'paused');
  await page.evaluate(() => {
    const L = window.__leap;
    L.resume();
    L.loadStage(0, 0);
    const po = L.stage().things.find((t) => t.type === 'portal');
    Object.assign(L.player, { x: po.x, y: po.y });
    L.step();
  });
  assert.equal(await page.evaluate(() => window.__leap.game.mode), 'map');
  assert.deepEqual(await seen(), row(false, true, false, false), 'the map between levels');
  await page.evaluate(() => {
    const L = window.__leap;
    while (L.game.mode === 'map') L.step();
    while (L.game.modeT < 0.6) L.step();
  });
  assert.equal(await page.evaluate(() => window.__leap.game.mode), 'leap');
  assert.deepEqual(await seen(), row(false, true, false, false), 'leaping');
  await page.evaluate(() => {
    const L = window.__leap;
    while (L.game.mode !== 'play') L.step();
    L.startWorld(7);
    const po = L.stage().things.find((t) => t.type === 'portal');
    Object.assign(L.player, { x: po.x, y: po.y });
    L.step();
  });
  assert.deepEqual(await seen(), row(false, true, false, true), 'end of the slice');
  assert.equal((await page.locator('[data-leap]').textContent()).trim(), 'Play again');
  assert.equal(await page.locator('[data-rebuild]').isVisible(), true);
  // Play again: a new run, through the map.
  await page.click('[data-leap]');
  assert.equal(await page.evaluate(() => window.__leap.game.mode), 'map');
  assert.deepEqual(await seen(), row(false, true, false, false), 'a new run’s map');
  await untilPlay(page, true);
  // Game over: the stats card with Play again and New monster.
  await page.evaluate(() => {
    const L = window.__leap;
    L.manual = true;
    L.game.lives = 1;
    Object.assign(L.player, { x: 10, y: L.ROWS + 2, vy: 5, invul: 0 });
    for (let i = 0; i < 120 && L.game.mode === 'play'; i++) L.step();
  });
  assert.deepEqual(await seen(), row(false, true, false, true), 'game over');
  assert.equal((await page.locator('[data-leap]').textContent()).trim(), 'Play again');
  assert.equal(await page.locator('[data-rebuild]').isVisible(), true);
  // New monster: back to the builder.
  await page.click('[data-rebuild]');
  assert.deepEqual(await seen(), row(true, false, false, false), 'back to building');
  assert.deepEqual(errors, []);
  await context.close();
});

test('pixel-leap AC-23: the glimpse is drawn by the next world’s rule, and stepping into it changes the monster with a sound', async () => {
  const { context, page } = await open(PHONE);
  await play(page, 0, 0);
  const cross = (w) =>
    page.evaluate((w) => {
      const L = window.__leap;
      L.startWorld(w);
      L.game.mode = 'play';
      const st = L.stage();
      Object.assign(L.player, { x: st.next - 1.5, y: st.ground[st.next - 2], vx: 0, vy: 0, invul: 0 });
      L.steps(5);
      const heard = L.heard.length;
      const res = [];
      L.input.keys.add('right');
      L.sync();
      for (let i = 0; i < 100; i++) {
        L.step();
        L.render();
        if (L.player.x >= st.next) res.push(L.game.morphRes);
      }
      L.input.keys.clear();
      L.sync();
      // The glimpse's look: a block of the screen just past the line, in canvas pixels.
      L.cam.x = st.next - L.view.tilesW / 2;
      L.render();
      const c = document.getElementById('view');
      const U = L.view.U;
      const x0 = Math.round((st.next + 1 - L.cam.x) * U);
      const y0 = Math.round((st.ground[st.next + 1] - 0.5 - L.cam.y) * U);
      const d = c.getContext('2d').getImageData(x0, y0, U, U).data;
      let soft = 0;
      for (let y = 0; y < U; y++) {
        for (let x = 1; x < U; x++) {
          const i = (y * U + x) * 4;
          const diff = Math.abs(d[i] - d[i - 4]) + Math.abs(d[i + 1] - d[i - 3]) + Math.abs(d[i + 2] - d[i - 2]);
          if (diff > 0 && diff < 30) soft++; // a soft step between neighbours: smooth drawing
        }
      }
      return { sounds: L.heard.slice(heard), steps: [...new Set(res.filter(Boolean))], soft };
    }, w);
  const meadow = await cross(W.meadow);
  assert.deepEqual(meadow.sounds.filter((x) => x.startsWith('morph')), [], 'Meadow to Farm changes no style');
  assert.deepEqual(meadow.steps, []);
  const frost = await cross(W.frost);
  assert.ok(frost.sounds.includes('morph-up'), 'a rising sound into smooth Candy');
  assert.deepEqual(frost.steps, [18, 35], 'the monster steps through 18 and 35 px per tile');
  assert.ok(frost.soft > 20, `Candy's glimpse is smooth (${frost.soft} soft steps)`);
  const candy = await cross(W.candy);
  assert.ok(candy.sounds.includes('morph-down'), 'a falling sound out of smooth Candy');
  assert.deepEqual(candy.steps, [35, 18]);
  assert.ok(candy.soft < 5, `Industrial's glimpse is hard-edged pixels (${candy.soft} soft steps)`);
  const pico = await cross(W.pico);
  assert.deepEqual(pico.sounds.filter((x) => x.startsWith('morph')), [], 'Pico to Ink: pixels to pixels, no crossing sound');
  assert.deepEqual(pico.steps, []);
  assert.ok(pico.soft < 5, `Ink's glimpse is hard-edged pixels (${pico.soft} soft steps)`);
  await context.close();
});

test('pixel-leap AC-24: the map shows the start, the cells reached and the next one lit, the rest carved dark, and the monster walks the newly painted way', async () => {
  const { context, page } = await open(PHONE);
  await page.click('[data-go]');
  const look = (t) =>
    page.evaluate((t) => {
      const L = window.__leap;
      L.manual = true;
      while (L.game.mode === 'map' && L.game.modeT < t) L.step();
      L.render();
      const c = document.getElementById('view');
      const g = c.getContext('2d');
      const U = L.view.U;
      const { nodes: tn, cs } = L.mapLayout();
      const nodes = tn.map((p) => ({ x: p.x * U, y: p.y * U }));
      // A cell is lit when its top shows its world's sky (bright), dark when carved.
      const lum = (x, y) => {
        const d = g.getImageData(Math.round(x), Math.round(y - U * cs * 0.4), 1, 1).data;
        return d[0] * 0.3 + d[1] * 0.59 + d[2] * 0.11;
      };
      return { mode: L.game.mode, map: L.game.map, lit: nodes.slice(1).map((n) => lum(n.x, n.y) > 120) };
    }, t);
  const start = await look(0.2);
  assert.equal(start.mode, 'map');
  assert.deepEqual([start.map.from, start.map.to], [-1, 0]);
  assert.deepEqual(start.lit, [true, false, false, false, false, false, false, false], 'only the first world is lit; the rest are carved dark');
  const after = await look(2.0);
  assert.equal(after.mode, 'map');
  // Skip ahead with a tap: the monster steps in and the world opens.
  await page.evaluate(() => window.__leap.skipMap());
  assert.equal(await untilPlay(page, true), 'play');
  // Through the Meadow's door: the map again, from Meadow to Farm, with Farm now lit too.
  await page.evaluate(() => {
    const L = window.__leap;
    const po = L.stage().things.find((t) => t.type === 'portal');
    Object.assign(L.player, { x: po.x, y: po.y });
    L.step();
  });
  const second = await look(2.0);
  assert.deepEqual([second.map.from, second.map.to], [0, 1]);
  assert.deepEqual(second.lit, [true, true, false, false, false, false, false, false]);
  await context.close();
  // Every cell and the start on screen, none overlapping, each name at least 12 CSS px tall.
  for (const opts of [{ viewport: { width: 360, height: 640 }, deviceScaleFactor: 2 }, PHONE, { viewport: { width: 1024, height: 700 } }]) {
    const o = await open(opts);
    const fit = await o.page.evaluate(() => {
      const L = window.__leap;
      L.go();
      L.manual = true;
      const { nodes, cs } = L.mapLayout();
      const half = cs / 2;
      const inside = nodes.every((n, i) => n.x - (i ? half : 0.6) >= 0 && n.x + (i ? half : 0.6) <= L.view.tilesW && n.y - (i ? half : 0.3) >= 0 && n.y + (i ? half + 1 : 0.3) <= L.view.tilesH);
      let overlap = 0;
      const cells = nodes.slice(1);
      for (let i = 0; i < cells.length; i++) {
        for (let j = i + 1; j < cells.length; j++) {
          if (Math.abs(cells[i].x - cells[j].x) < cs && Math.abs(cells[i].y - cells[j].y) < cs + 1) overlap++;
        }
      }
      return { inside, overlap, fontCss: L.mapFont(cs) / L.view.ratio };
    });
    assert.equal(fit.inside, true, `all cells on screen at ${JSON.stringify(opts.viewport)}`);
    assert.equal(fit.overlap, 0, 'no two cells overlap');
    assert.ok(fit.fontCss >= 12, `names ${fit.fontCss} CSS px`);
    await o.context.close();
  }
});

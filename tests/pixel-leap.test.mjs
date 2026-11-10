// End-to-end tests for Pixel Leap. Run: scripts/check-slow.sh.
// The game exposes window.__leap (its state, and step() that advances the simulation without
// drawing), so a test can set up a moment and check what the rules do with it.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chromium, devices } from 'playwright';
import { FAKE_AUDIO } from './fake-audio.mjs';
import { simulateInsets, PORTRAIT_INSETS, LANDSCAPE_INSETS, STRIP } from './insets.mjs';

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
const W = { meadow: 0, ice: 1, farm: 2, candy: 3, industrial: 4, mushroom: 5, pico: 6, sea: 7, ink: 8, castle: 9, scribble: 10, sky: 11 };

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

// Letting go at top speed on a ground kind ('grass': the level's first stretch; 'ice' or 'snow': the
// first long enough run of it in Ice), returns how far the monster slides before it stops.
const slide = (page, w, kind) =>
  play(page, w, 0).then(() =>
    page.evaluate((kind) => {
      const L = window.__leap;
      const st = L.stage();
      let x = 3;
      if (kind !== 'grass') {
        const want = kind === 'ice' ? L.T.ICE : L.T.GROUND;
        for (let c = 2; c < st.cols - 6; c++) {
          let ok = true;
          for (let k = 0; k < 5; k++) if (L.tileAt(c + k, st.ground[c]) !== want || st.ground[c + k] !== st.ground[c]) ok = false;
          if (ok) {
            x = c + 0.5;
            break;
          }
        }
      }
      const p = L.player;
      Object.assign(p, { x, y: st.ground[Math.floor(x)], vx: L.MOVE.top, vy: 0, ground: true, poof: 0, invul: 9 });
      L.input.keys.clear();
      L.sync();
      L.step(); // one step to stand on it (so the ground's grip is the one under the feet)
      p.vx = L.MOVE.top;
      const x0 = p.x;
      for (let i = 0; i < 480 && Math.abs(p.vx) > 0.01; i++) L.step();
      return p.x - x0;
    }, kind)
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
    L.startWorld(8);
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
  assert.equal(await page.locator('[data-tally-lives-row]').isVisible(), false, 'no lives left row after a game over');
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
  await play(page, W.candy, 0);
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

test('pixel-leap AC-10: Ice’s ears join the monster and let it float', async () => {
  const { context, page } = await open();
  await play(page, W.ice, 0);
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
    L.loadStage(3, 0);
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
  // Ice: letting go at top speed slides further on Ice's ice than on the Meadow's grass.
  const grass = await slide(page, W.meadow, 'grass');
  const ice = await slide(page, W.ice, 'ice');
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
    L.loadStage(L.WORLDS.findIndex((w) => w.id === 'ink'), 0);
    const d2 = L.stage().things.find((t) => t.type === 'drip');
    L.game.shields = 1;
    Object.assign(p, { x: d2.x, y: 11, vx: 0, vy: 0, invul: 0, ground: true });
    for (let i = 0; i < 90; i++) L.step();
    return { still, falls, shields: L.game.shields };
  });
  assert.deepEqual(drip, { still: true, falls: true, shields: 0 });
  await context.close();
});

test('pixel-leap AC-12: the door leads to the map with no numbers; the way on paints in, and the leap from the Meadow steps 18, 35, smooth into Ice', async () => {
  const { context, page } = await open(PHONE);
  await play(page, W.meadow, 0);
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
  assert.deepEqual([map.map.from, map.map.to], [W.meadow, W.ice]);
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
  assert.deepEqual(s, { mode: 'play', world: W.ice, ears: true, t: 0 });
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

test('edge-gestures AC-5: Pixel Leap keeps its deck as it was: with iPhone insets the keys stand 14 px above the safe area, and a press low on them runs and jumps', async () => {
  for (const [viewport, insets] of [
    [{ width: 390, height: 844 }, PORTRAIT_INSETS],
    [{ width: 844, height: 390 }, LANDSCAPE_INSETS],
  ]) {
    const { context, page } = await open({ viewport, hasTouch: true, isMobile: true });
    await simulateInsets(context, page, insets, () => window.__leap);
    await goPlay(page);
    const label = `${viewport.width}x${viewport.height}`;
    const pad = await page.locator('[data-pad]').boundingBox();
    const jump = await page.locator('[data-jump]').boundingBox();
    for (const [name, b] of [['pad', pad], ['jump key', jump]]) {
      const gap = viewport.height - insets.bottom - (b.y + b.height);
      assert.ok(Math.abs(gap - 14) < 0.5, `${label}: the ${name} stands 14 px above the safe area (${gap})`);
    }
    // As before #27, the pad starts at max(24 px, the left inset), with no 20 px for the left strip.
    assert.ok(Math.abs(pad.x - Math.max(24, insets.left)) < 0.5, `${label}: the pad starts at ${pad.x}`);
    // Presses and holds aren't swipes: one that starts low on a key, inside the bottom strip, acts.
    const st = () => page.evaluate(() => ({ right: window.__leap.input.right, jump: window.__leap.input.jump }));
    const low = pad.y + pad.height - 6;
    assert.ok(low > viewport.height - insets.bottom - STRIP.bottom, `${label}: the press starts in the strip`);
    await touch(page, 'pointerdown', 31, pad.x + pad.width * 0.8, low);
    await touch(page, 'pointerdown', 32, jump.x + jump.width / 2, jump.y + jump.height - 6);
    assert.deepEqual(await st(), { right: true, jump: true }, `${label}: low presses run and jump`);
    await touch(page, 'pointerup', 31, 0, 0);
    await touch(page, 'pointerup', 32, 0, 0);
    await context.close();
  }
});

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

test('pixel-leap AC-17: twelve levels, twelve worlds, in order; each but the last ends with a glimpse of the next; the UI follows the world; best times are kept under version 5', async () => {
  const { context, page } = await open(PHONE);
  await play(page, 0, 0);
  const worlds = await page.evaluate(() => window.__leap.WORLDS.map((w) => w.id));
  assert.deepEqual(worlds, ['meadow', 'ice', 'farm', 'candy', 'industrial', 'mushroom', 'pico', 'sea', 'ink', 'castle', 'scribble', 'sky']);
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
    return [at(0), at(3), at(8), at(5), at(6), at(1), at(7), at(9), at(10), at(11)];
  });
  assert.equal(ui[0].smooth, false);
  assert.match(ui[0].font, /Kenney Pixel/);
  assert.equal(ui[1].smooth, true);
  assert.doesNotMatch(ui[1].font, /Kenney Pixel/);
  assert.equal(ui[2].smooth, false);
  assert.equal(ui[3].smooth, true, 'Mushroom is smooth');
  assert.equal(ui[4].smooth, false, 'Pico is pixels');
  assert.deepEqual([ui[5].smooth, ui[6].smooth, ui[7].smooth], [true, true, true], 'Ice, Sea and Castle are smooth');
  assert.deepEqual([ui[8].smooth, ui[9].smooth], [true, true], 'Scribble and Sky are smooth');
  // Sky, the last, has no glimpse: no world follows it.
  assert.equal(await page.evaluate(() => { const L = window.__leap; L.startWorld(11); return L.stage().next === L.stage().cols; }), true);
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
  assert.ok(Object.entries(best).some(([k, v]) => k === '5:meadow' && v === 61), 'kept under version 5');
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
  assert.ok(m.includes('loop:meadow-bed'), 'the Meadow music starts');
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
  assert.ok((await leapFrom(W.farm)).includes('loop:candy-bed'), 'Candy starts its own music');
  assert.ok((await leapFrom(W.sea)).includes('loop:i-music'), 'Ink starts its own music');
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
  assert.deepEqual(ok, { meadow: 18, ice: 70, farm: 18, candy: 70, industrial: 18, mushroom: 70, pico: 8, sea: 70, ink: 16, castle: 70, scribble: 70, sky: 70 });
  await context.close();
});

// A simple scripted player: it runs right, jumps at walls, gaps, spikes and bad guys, rides springs
// and caps, steps onto moving platforms and lifts when they come, and waits on them until the far
// side is in reach. `ride: false` makes it ignore moving platforms (it jumps the gap instead).
const BOT = `(opts) => {
  const L = window.__leap;
  const p = L.player;
  const T = L.T;
  const solidT = (k) => k === T.GROUND || k === T.BLOCK || k === T.HAY || k === T.BELTL || k === T.BELTR || k === T.ICE || k === T.GATE || k === T.SKETCH;
  const footing = (k) => solidT(k) || k === T.ONEWAY || k === T.SLOPEU || k === T.SLOPED;
  let t = 0;
  let hold = 0;
  let firstCoin = null;
  let end = null;
  let lives = 0;
  let lastCap = null;
  const deaths = [];
  let keyFor = null; // Castle: the gate it's fetching a key for
  let landX = null; // where it means to land after a short hop
  // Scribble: jumps that leave the ground before the tile they land on is drawn (trust).
  let trust = 0;
  let undrawnAtTakeoff = null;
  // Sky: the ledge it bounced from, and the one it's aiming for.
  let skyFrom = null;
  let skyTo = null;
  let lastVy = 0;
  while (t < opts.limit) {
    const st = L.stage();
    if (L.WORLDS[L.game.world].bounce) {
      // Sky: plain bounces only (it never presses jump on a ledge); at each bounce it picks the
      // nearest ledge above that a plain bounce reaches and that isn't cracked or held by a spiky,
      // and steers to it; with a flyer in the way it bounces in place.
      const ledges = [];
      for (let y = 0; y < st.rows; y++) {
        let x = 1;
        while (x < st.cols - 1) {
          if (L.tileAt(x, y) === T.ONEWAY) {
            let e = x;
            while (L.tileAt(e + 1, y) === T.ONEWAY) e++;
            ledges.push({ y, a: x, b: e + 1 });
            x = e + 1;
          } else x++;
        }
      }
      for (const m of st.things) if (m.type === 'mover') ledges.push({ y: m.y, a: m.x, b: m.x + m.w, m });
      const spiky = (l) => st.things.some((e) => e.type === 'walker' && e.alive && Math.abs(e.y - l.y) < 0.5 && e.x > l.a - 1 && e.x < l.b + 1);
      const bounced = p.vy < -10 && lastVy >= 0;
      // At the top of a spring's or the wings' launch: aim for the nearest ledge below to land on.
      if (L.game.skyLaunch && p.vy >= 0 && lastVy < 0) {
        const below = ledges.filter((l) => l.y > p.y && l.y - p.y < 8).sort((a, b) => Math.max(0, a.a - p.x, p.x - a.b) - Math.max(0, b.a - p.x, p.x - b.b) || a.y - b.y);
        skyTo = below[0] || skyTo;
      }
      lastVy = p.vy;
      const onPlateau = p.ground && Math.abs(p.y - st.top) < 0.1;
      let run = 0;
      let jump = false;
      if (bounced || (p.ground && !skyTo)) {
        skyFrom = { y: p.y, x: p.x };
        // From a sliding ledge it only goes for a ledge close by; a sliding ledge it only goes for
        // from under it.
        const fromSlider = ledges.some((l) => l.m && Math.abs(l.y - p.y) < 0.15 && p.x > l.a - 0.4 && p.x < l.b + 0.4);
        const gap = (l) => Math.max(0, l.a - (p.x + 0.4), p.x - 0.4 - l.b);
        const reach = ledges.filter((l) => l.y < p.y - 0.5 && p.y - l.y <= 2.6 && gap(l) <= (l.m ? (Math.sign(l.m.vx) === Math.sign(p.x - (l.a + l.b) / 2) ? 1 : 0) : fromSlider ? 1.5 : 2.1) && !spiky(l));
        reach.sort((a, b) => b.y - a.y || Math.abs((a.a + a.b) / 2 - p.x) - Math.abs((b.a + b.b) / 2 - p.x));
        // Nothing in reach yet (a sliding ledge far over): bounce in place on the one it's on.
        const here = ledges.find((l) => Math.abs(l.y - p.y) < 0.15 && p.x > l.a - 0.4 && p.x < l.b + 0.4);
        skyTo = reach[0] || (here ? { ...here, stay: true } : null);
        if (skyTo && skyTo.stay && here) {
          // Waiting: on the end of its ledge nearest the next ledge up (riding a sliding one).
          const up = ledges.filter((l) => l.y < p.y - 0.5 && p.y - l.y <= 2.6 && l !== here).sort((a, b) => b.y - a.y)[0];
          if (up) {
            const left = (up.a + up.b) / 2 < (here.a + here.b) / 2;
            if (!here.m) skyTo = { ...skyTo, a: left ? here.a + 0.2 : here.b - 0.7, b: left ? here.a + 0.7 : here.b - 0.2 };
          }
        }
        if (opts.log) opts.log.push([+(st.base - p.y).toFixed(1), +p.x.toFixed(1), skyTo ? [+(st.base - skyTo.y).toFixed(1), skyTo.a, skyTo.stay ? 'stay' : ''] : null]);
        if (skyTo) {
          const c = (skyTo.a + skyTo.b) / 2;
          const lo = Math.min(c, p.x) - 1.6;
          const hi = Math.max(c, p.x) + 1.6;
          const flyer = st.things.some((f) => f.type === 'flyer' && f.alive && f.y < p.y + 0.5 && f.y > skyTo.y - 2.5 && f.x > lo && f.x < hi);
          if (flyer && !p.ground) skyTo = { y: p.y, a: p.x - 0.3, b: p.x + 0.3, stay: true };
        }
      }
      if (onPlateau || (st.top !== undefined && p.y <= st.top + 0.05 && p.ground)) {
        const door = st.things.find((d) => d.type === 'portal');
        run = door.x > p.x + 0.2 ? 1 : door.x < p.x - 0.2 ? -1 : 0;
      } else if (p.ground && Math.abs(p.y - st.base) < 0.1) {
        // The start's ground: walk under the first ledge and jump up to it.
        jump = true;
        if (skyTo) run = Math.abs((skyTo.a + skyTo.b) / 2 - p.x) < 0.3 ? 0 : Math.sign((skyTo.a + skyTo.b) / 2 - p.x);
      } else if (skyTo) {
        // The nearest footing on it: its near end, not its middle.
        const c = skyTo.m ? skyTo.m.x + (skyTo.aim !== undefined ? skyTo.aim : skyTo.m.w / 2) : Math.max(skyTo.a + 0.35, Math.min(skyTo.b - 0.35, p.x));
        run = Math.abs(c - p.x) < 0.25 ? 0 : Math.sign(c - p.x);
      }
      L.input.keys.clear();
      if (run > 0) L.input.keys.add('right');
      if (run < 0) L.input.keys.add('left');
      if (jump && hold <= 0) hold = 0.4;
      if (hold > 0) L.input.keys.add('jump');
      L.sync();
      hold -= 1 / 120;
      const coins = L.game.coins;
      const before = L.game.lives;
      L.step();
      t += 1 / 120;
      if (L.game.lives < before) {
        lives++;
        deaths.push(Math.round(st.base - p.y));
        skyTo = null;
        if (opts.why) opts.why.push({ x: +p.x.toFixed(1), h: +(st.base - p.y).toFixed(1), near: st.things.filter((e) => e.alive && Math.abs(e.y - p.y) < 3 && e.type !== 'coin').map((e) => [e.type, +e.x.toFixed(1), +(st.base - e.y).toFixed(1)]) });
      }
      if (firstCoin === null && L.game.coins > coins) firstCoin = t;
      if (L.game.mode !== 'play') {
        end = L.game.mode;
        break;
      }
      if (opts.stopAfterDeaths && lives >= opts.stopAfterDeaths) break;
      continue;
    }
    // Castle: stopped at a shut gate with no key, it goes back for the nearest key not yet taken,
    // then on to the gate. dir is the way it means to go.
    let dir = 1;
    let target = null;
    const gateAhead = st.things.find((g) => g.type === 'gate' && !g.open && g.x > p.x && g.x - p.x < 1.6);
    if (gateAhead && !L.game.keys && opts.keys !== false) keyFor = gateAhead;
    if (keyFor && (keyFor.open || L.game.keys)) keyFor = null;
    if (keyFor) {
      const keys = st.things.filter((k) => k.type === 'key' && k.alive && k.x < keyFor.x);
      target = keys.sort((a, b) => Math.abs(a.x - p.x) - Math.abs(b.x - p.x))[0] || null;
      if (target) dir = target.x < p.x - 0.3 ? -1 : target.x > p.x + 0.3 ? 1 : 0;
    }
    const ahead = (dx, dy) => L.tileAt(Math.floor(p.x + (dir || 1) * dx), Math.floor(p.y + dy));
    const movers = st.things.filter((m) => m.type === 'mover');
    let jump = false;
    let short = false;
    let run = dir;
    const wet = L.inWater();
    if (wet) {
      // Swimming: keep the head a little under the surface, stroking as it sinks; a wall ahead and
      // a stroke near the surface leaps out over it or onto the land; a fish ahead: wait for it.
      const surf = st.water[Math.floor(p.x)];
      const head = p.y - 1.3;
      let wall = false;
      for (let d = 0.4; d <= 1.4; d += 0.2) for (const dy of [-0.2, -0.9]) if (solidT(ahead(d, dy))) wall = true;
      const want = wall ? 0.2 : 0.75;
      if (head - surf > want && p.vy > -1) jump = true;
      // A fish in its lane: back off from one coming at it, follow one swimming away.
      for (const f of st.things) {
        if (f.type !== 'fish' || !f.alive || Math.abs(f.y - 0.5 - (p.y - 0.65)) >= 1.5) continue;
        const dx = f.x - p.x;
        if (dx > -1.2 && dx < 2.6) run = f.dir < 0 || dx < 1.6 ? (dx > 0 ? -1 : 0) : 1;
      }
    } else if (p.onMover && p.ground && opts.ride) {
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
      // A wall ahead (not the ground under a slope, which the slope covers): jump.
      const slopeT = (k) => k === T.SLOPEU || k === T.SLOPED;
      // On a slope it runs on: the flat at the slope's top is where its feet will be (no slope here ends at a wall).
      if (!p.onSlope) for (let d = 0.4; d <= 1.6; d += 0.2) if (solidT(ahead(d, -0.5)) && !slopeT(ahead(d, -1.5))) jump = true;
      let ground = false;
      for (let d = 0.5; d <= 1; d += 0.25) if (footing(ahead(d, 0.5))) ground = true;
      const cookie = st.things.some((c) => c.type === 'cookie' && c.state !== 'gone' && Math.abs(c.x - (p.x + 0.8)) < 0.6 && Math.abs(c.y - p.y) < 0.5);
      const onIt = movers.some((m) => p.x + 0.9 > m.x && p.x + 0.9 < m.x + m.w && Math.abs(m.y - p.y) < 0.3);
      if (!ground && !cookie && !onIt) {
        jump = true;
        // A small gap to a near ledge: a short hop, not a full jump that flies over it.
        let land = 0;
        for (let d = 1; d <= 6 && !land; d++) {
          for (const dy of [0.5, -0.5]) if (footing(ahead(d, dy)) && !solidT(ahead(d, dy - 1))) land = d;
        }
        // Scribble: no ground in sight yet, but pencil ticks mark where a sketch run will draw in:
        // aim for the nearest run ahead (trust).
        if (!land && st.sketches && st.sketches.length) {
          const runs = st.sketches.filter((k) => k.state === 'undrawn' && (k.x + 0.5 - p.x) * (dir || 1) > 0.8 && Math.abs(k.x + 0.5 - p.x) < 6.5 && k.y >= p.y - 2.5 && k.y <= p.y + 1.5);
          const first = runs.sort((a, b) => Math.abs(a.x - p.x) - Math.abs(b.x - p.x))[0];
          if (first) {
            const run = st.sketches.filter((k) => k.run === first.run);
            const mid = (Math.min(...run.map((k) => k.x)) + Math.max(...run.map((k) => k.x)) + 1) / 2;
            land = Math.max(1, Math.round(Math.abs(mid - p.x)));
            landX = mid;
          }
        }
        if (land && land <= 3) short = true;
        // Where it means to land: the middle of the near ledge, steered for in the air.
        if (landX === null || !st.sketches || !st.sketches.length) landX = land && land <= 4 ? Math.floor(p.x + (dir || 1) * land) + 0.5 + (dir || 1) * 0.5 : null;
      }
      for (let d = 0.6; d <= 1.6; d += 0.2) if (ahead(d, -0.5) === T.SPIKES) jump = true;
      // A bad guy ahead: jump it, unless a gap is coming (then the jump waits for the edge).
      let gapSoon = false;
      for (let d = 1; d <= 4; d += 0.5) if (!footing(ahead(d, 0.5))) gapSoon = true;
      for (const e of st.things) if ((e.type === 'walker' || e.type === 'worm' || e.type === 'flyer') && e.alive && e.x > p.x && e.x - p.x < 2.4 && Math.abs(e.y - p.y) < 1.4 && (!gapSoon || e.x - p.x < 1.2)) jump = true;
      // A cap ahead, a little above: jump onto it.
      for (const c of st.things) if (c.type === 'cap' && c.x - p.x > -0.5 && c.x - p.x < 2.2 && p.y - c.y > 0.5 && p.y - c.y < 3) jump = true;
      // A snowball rolling at it: jump it.
      for (const b of st.balls || []) if ((b.x - p.x) * (dir || 1) > 0 && Math.abs(b.x - p.x) < 2.6 && Math.abs(b.y - p.y) < 1.5 && Math.sign(b.vx) !== (dir || 1)) jump = true;
      // A snow pile up a slope ahead: wait at the foot until no snowball is between it and the pile
      // and the pile isn't about to send one, then climb; on the flat top, snowballs are jumped.
      for (const pl of st.things) {
        if (p.onSlope || pl.type !== 'pile' || pl.x - p.x < 0 || pl.x - p.x > 8.5 || pl.y > p.y - 1.5) continue;
        const rolling = (st.balls || []).some((b) => b.x > p.x - 0.5 && b.x < p.x + 12);
        if (rolling || pl.next < 0.3) {
          run = 0;
          jump = false;
        }
      }
      // A crusher ahead: wait until it has just gone up, so it stays up while the monster runs under.
      // Under a crusher it never stops: it runs on to the gap after it.
      const under = st.things.some((c) => c.type === 'crusher' && p.x + 0.4 > c.x && p.x - 0.4 < c.x + c.w);
      for (const c of st.things) {
        if (c.type !== 'crusher' || under) continue;
        const near = dir >= 0 ? c.x - p.x : p.x - (c.x + c.w);
        if (near > -0.2 && near < 1.3 && Math.abs(c.floor - p.y) < 0.5) {
          const ph = L.crusherPhase(c);
          // Time to clear it from a standstill, with a margin.
          const need = (c.w + 1.4 + Math.max(0, near)) / 5 + 0.15;
          if (!(ph.state === 'up' && ph.left > need)) {
            run = 0;
            jump = false;
          }
        }
      }
      // Under the key it's fetching, up a ledge or two: jump.
      if (target && Math.abs(target.x - p.x) < 0.7 && target.y < p.y - 1.2) jump = true;
      if (target && dir === 0) run = 0;
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
    // Coming down toward the ledge it chose: steer to it, braking in the air.
    if (p.ground && !jump) landX = null;
    else if (landX !== null && p.vy > 0 && !target) run = Math.abs(landX - p.x) < 0.3 ? 0 : Math.sign(landX - p.x);
    // In the air with a key above: steer under it.
    if (!p.ground && target) run = Math.abs(target.x - p.x) < 0.25 ? 0 : Math.sign(target.x - p.x);
    // Past the door (a jump carried it over): walk back to it.
    const door = st.things.find((d) => d.type === 'portal');
    if (door && p.x > door.x + 0.5 && Math.abs(p.y - door.y) < 4) run = -1;
    // A flyer diving nearby: back off and let it pass, unless a walker is right there.
    const diving = st.things.some((f) => f.type === 'flyer' && f.alive && f.state === 'swoop' && f.x - p.x > -1.5 && f.x - p.x < 4.5);
    if (diving && p.ground) {
      run = -1;
      jump = st.things.some((e) => e.type === 'walker' && e.alive && Math.abs(e.x - p.x) < 1.3 && Math.abs(e.y - p.y) < 1);
    }
    const bouncer = st.things.some((c) => (c.type === 'spring' || c.type === 'jelly') && c.x > p.x - 0.2 && c.x - p.x < 2.2 && Math.abs(c.y - p.y) < 0.5);
    if (bouncer && p.ground) jump = false;
    if (jump || (bouncer && !p.ground)) hold = short && !bouncer ? 0.12 : 0.4;
    L.input.keys.clear();
    if (run > 0) L.input.keys.add('right');
    if (run < 0) L.input.keys.add('left');
    if (hold > 0) L.input.keys.add('jump');
    L.sync();
    hold -= 1 / 120;
    if (opts.snap && Math.round(t * 120) % Math.round(opts.snap * 120) === 0) opts.onSnap(t);
    if (opts.trace && p.x > opts.trace[0] && p.x < opts.trace[1] && Math.round(t * 120) % 6 === 0) opts.tr.push([+p.x.toFixed(2), +p.y.toFixed(2), +p.vy.toFixed(1), p.ground ? 'g' : '', run, hold > 0 ? 'J' : '', ...(st.balls || []).map((b) => +b.x.toFixed(1))]);
    const coins = L.game.coins;
    const before = L.game.lives;
    const wasGround = p.ground;
    L.step();
    t += 1 / 120;
    // Trust: a takeoff remembers which sketch tiles weren't drawn; a landing on one of them counts.
    if (st.sketches && st.sketches.length) {
      if (wasGround && !p.ground && p.vy < -5) undrawnAtTakeoff = new Set(st.sketches.filter((k) => k.state === 'undrawn').map((k) => k.x + ',' + k.y));
      if (!wasGround && p.ground && undrawnAtTakeoff) {
        if (undrawnAtTakeoff.has(Math.floor(p.x) + ',' + Math.round(p.y))) trust++;
        undrawnAtTakeoff = null;
      }
    }
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
  return { end, t, firstCoin, lives, deaths, trust, x: +p.x.toFixed(1), y: +p.y.toFixed(1) };
}`;
const BOT_SRC = BOT;

test('pixel-leap AC-21 and pixel-leap AC-38: every level can be finished; first coin within 5 s; hazards clear of the start; open air above bouncers; mover and crusher tracks clear; snowballs, keys and gates laid out fairly', async () => {
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
        if (e.type === 'walker' || e.type === 'worm' || e.type === 'drip' || e.type === 'fish') hazards.push(e.sx);
        if (e.type === 'flyer') hazards.push(e.sx - 5 - 1); // it swoops from 5 tiles out
        if (e.type === 'crusher' || e.type === 'current') hazards.push(e.sx);
      }
      // A snow pile counts at the foot of its slope; and its snowballs' path, from the pile to where
      // they shatter (a wall or a pit's edge), must not reach the start.
      const balls = [];
      for (const e of st.things.filter((t) => t.type === 'pile')) {
        let c = Math.floor(e.sx);
        let y = st.ground[c];
        while (c > 0 && st.ground[c - 1] < st.rows && st.ground[c - 1] >= y - 0.5 && !solid(L.tileAt(c - 1, st.ground[c] - 1))) {
          c--;
          y = st.ground[c];
        }
        hazards.push(c + 0.5);
        if (c <= st.start.x + 1) balls.push(['a snowball reaches the start', e.sx]);
      }
      // Sky's climb is checked by height (AC-45), not across.
      const nearStart = st.climb ? [] : hazards.filter((x) => x - st.start.x < 7);
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
      // A crusher's drop, from its top to the floor, is clear of solid tiles.
      for (const c of st.things.filter((t) => t.type === 'crusher')) {
        for (let x = Math.floor(c.sx); x < c.sx + c.w; x++) for (let y = Math.floor(c.floor - c.h - 1.5); y < c.floor; y++) if (solid(L.tileAt(x, y))) tracks.push(['crusher', x, y]);
        if (c.h > 4) tracks.push(['crusher too high', c.sx]);
      }
      // Castle: every gate has a key before it and after the gate before it; the door is past the last gate.
      const gates = st.things.filter((t) => t.type === 'gate').map((g) => g.sx).sort((a, b) => a - b);
      const keys = st.things.filter((t) => t.type === 'key').map((k) => k.sx);
      const locks = [];
      gates.forEach((g, i) => {
        if (!keys.some((k) => k < g && k > (i ? gates[i - 1] : -1))) locks.push(['no key before the gate', g]);
      });
      const door = st.things.find((t) => t.type === 'portal');
      if (gates.length && door.sx < gates[gates.length - 1]) locks.push(['the door is before the last gate']);
      // The assist never changes a mechanic's speed.
      const speeds = () => JSON.stringify([L.MOVE.mover, L.MOVE.belt, L.MOVE.caps, L.MOVE.hay, L.MOVE.hayHigh, L.MOVE.swoop, L.MOVE.crusher, L.MOVE.rollSlope, L.MOVE.rollFlat, L.MOVE.pileEvery, L.MOVE.current, L.MOVE.fish, L.MOVE.stroke, L.MOVE.sink, L.MOVE.swimTop, L.MOVE.swimGravity, L.MOVE.sketchDraw, L.MOVE.sketchNear, L.MOVE.sketchNearY, L.MOVE.skyHigh, L.MOVE.skyPress, L.MOVE.skySpring, L.MOVE.wings, L.MOVE.wingsTime, L.MOVE.skyFlyer, L.MOVE.skyFloor]);
      const before = speeds();
      L.game.assist = 1;
      const after = speeds();
      L.game.assist = 0;
      out.push({ w, id: L.WORLDS[w].id, ...r, nearStart: nearStart.length, blocked, tracks, balls, locks, assist: before === after });
    }
    return out;
  }, BOT);
  for (const r of runs) {
    assert.equal(r.end, 'map', `level ${r.w + 1} (${r.id}) finished (after ${r.t.toFixed(1)} s, lives lost at ${r.deaths})`);
    assert.equal(r.nearStart, 0, `level ${r.w + 1}: no hazard near the start`);
    assert.deepEqual(r.blocked, [], `level ${r.w + 1}: open air above every spring, jelly, haybale and cap`);
    assert.deepEqual(r.tracks, [], `level ${r.w + 1}: every mover's and crusher's track is clear`);
    assert.deepEqual(r.balls, [], `level ${r.w + 1}: no snowball's path reaches the start`);
    assert.deepEqual(r.locks, [], `level ${r.w + 1}: each gate has its key, the door is past the last gate`);
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
    L.startWorld(11);
    const po = L.stage().things.find((t) => t.type === 'portal');
    Object.assign(L.player, { x: po.x, y: po.y });
    L.step();
  });
  // The journey's end: the map's summit, then the gallery, then the card.
  assert.equal(await page.evaluate(() => window.__leap.game.mode), 'map');
  assert.deepEqual(await seen(), row(false, true, false, false), 'the summit');
  await page.evaluate(() => {
    const L = window.__leap;
    while (L.game.mode === 'map') L.step();
  });
  assert.equal(await page.evaluate(() => window.__leap.game.mode), 'gallery');
  // The gallery: builder and Paused card hidden, the deck shown (row() checks each).
  assert.deepEqual(await seen(), row(false, true, false, false), 'the gallery');
  // A real tap on the view skips it to the card.
  await page.tap('#view');
  assert.equal(await page.evaluate(() => window.__leap.game.mode), 'tally');
  assert.deepEqual(await seen(), row(false, true, false, true), "the journey's end");
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
      // The camera on the monster, so the glimpse's line is on screen.
      L.cam.x = L.player.x - L.view.tilesW / 2;
      L.cam.y = L.player.y - L.view.tilesH * 0.62;
      L.game.lives = 9;
      L.game.shields = 2; // a bad guy near the door doesn't restart the level mid-check
      L.steps(5);
      const heard = L.heard.length;
      const res = [];
      L.input.keys.add('right');
      L.sync();
      // Into the glimpse, short of the door.
      for (let i = 0; i < 100 && L.player.x < st.next + 2.5; i++) {
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
      // The ground's top tile: drawn art, steadier than a sky of gradients and twinkling stars.
      const y0 = Math.round((st.ground[st.next + 1] - L.cam.y) * U);
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
  const farm = await cross(W.farm);
  assert.ok(farm.sounds.includes('morph-up'), 'a rising sound into smooth Candy');
  assert.deepEqual(farm.steps, [18, 35], 'the monster steps through 18 and 35 px per tile');
  assert.ok(farm.soft > 20, `Candy's glimpse is smooth (${farm.soft} soft steps)`);
  const candy = await cross(W.candy);
  assert.ok(candy.sounds.includes('morph-down'), 'a falling sound out of smooth Candy');
  assert.deepEqual(candy.steps, [35, 18]);
  assert.ok(candy.soft < 5, `Industrial's glimpse is hard-edged pixels (${candy.soft} soft steps)`);
  const sea = await cross(W.sea);
  assert.ok(sea.sounds.includes('morph-down'), 'a falling sound out of smooth Sea');
  assert.ok(sea.soft < 5, `Ink's glimpse is hard-edged pixels (${sea.soft} soft steps)`);
  // Perfect alternation: every door changes the style, with its sound.
  for (const w of [W.meadow, W.ice, W.industrial, W.mushroom, W.pico, W.ink, W.scribble]) {
    const r = await cross(w);
    assert.equal(r.sounds.filter((x) => x.startsWith('morph')).length, 1, `level ${w + 1}'s glimpse changes the style`);
  }
  // Castle's door into line art changes the style too, with the pen's scratch (AC-40).
  const castle = await cross(W.castle);
  assert.equal(castle.sounds.filter((x) => x === 'scratch').length >= 1, true, "Castle's glimpse changes the style, into line art");
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
  assert.deepEqual(start.lit.slice(0, 12), [true, ...Array(11).fill(false)], 'only the first world is lit; the rest are carved dark');
  const after = await look(2.0);
  assert.equal(after.mode, 'map');
  // Skip ahead with a tap: the monster steps in and the world opens.
  await page.evaluate(() => window.__leap.skipMap());
  assert.equal(await untilPlay(page, true), 'play');
  // Through the Meadow's door: the map again, from the Meadow to Ice, with Ice now lit too.
  await page.evaluate(() => {
    const L = window.__leap;
    const po = L.stage().things.find((t) => t.type === 'portal');
    Object.assign(L.player, { x: po.x, y: po.y });
    L.step();
  });
  const second = await look(2.0);
  assert.deepEqual([second.map.from, second.map.to], [0, 1]);
  assert.deepEqual(second.lit.slice(0, 12), [true, true, ...Array(10).fill(false)]);
  await context.close();
  // Every cell, the start and the summit on screen, none overlapping, each name at least 12 CSS px tall.
  for (const opts of [{ viewport: { width: 360, height: 640 }, deviceScaleFactor: 2 }, PHONE, { viewport: { width: 1024, height: 700 } }, { viewport: { width: 844, height: 390 } }]) {
    const o = await open(opts);
    const fit = await o.page.evaluate(() => {
      const L = window.__leap;
      L.go();
      L.manual = true;
      const { nodes: all, cs } = L.mapLayout();
      const summit = all[all.length - 1];
      const nodes = all.slice(0, -1);
      const half = cs / 2;
      const inside = nodes.every((n, i) => n.x - (i ? half : 0.6) >= 0 && n.x + (i ? half : 0.6) <= L.view.tilesW && n.y - (i ? half : 0.3) >= 0 && n.y + (i ? half + 1 : 0.3) <= L.view.tilesH) && summit.y - 1.1 >= 0 && summit.x - 0.6 >= 0 && summit.x + 0.6 <= L.view.tilesW;
      // The summit's star sits clear of the cell under it.
      const last = nodes[nodes.length - 1];
      const clear = last.y - half - (summit.y + 0.1) >= 0;
      let overlap = clear ? 0 : 1;
      const cells = nodes.slice(1);
      for (let i = 0; i < cells.length; i++) {
        for (let j = i + 1; j < cells.length; j++) {
          if (Math.abs(cells[i].x - cells[j].x) < cs && Math.abs(cells[i].y - cells[j].y) < cs + 1) overlap++;
        }
      }
      return { inside, overlap, fontCss: L.mapFont(cs) / L.view.ratio, cells: cells.length };
    });
    assert.equal(fit.cells, 12);
    assert.equal(fit.inside, true, `all cells on screen at ${JSON.stringify(opts.viewport)}`);
    assert.equal(fit.overlap, 0, 'no two cells overlap');
    assert.ok(fit.fontCss >= 12, `names ${fit.fontCss} CSS px`);
    await o.context.close();
  }
});

// ---------------------------------------------------------------- batch 2: Farm, Industrial, Mushroom, Pico

test('pixel-leap AC-25: Farm is platforms, big and small at many heights; a haybale bounces, higher with jump held', async () => {
  const { context, page } = await open();
  await play(page, W.farm, 0);
  const r = await page.evaluate(() => {
    const L = window.__leap;
    const st = L.stage();
    const T = L.T;
    // Platforms: runs of ledge or block tiles side by side in one row (not ground).
    const plats = [];
    for (let y = 0; y < st.rows; y++) {
      let run = 0;
      for (let x = 0; x <= st.cols; x++) {
        const k = x < st.cols ? L.tileAt(x, y) : T.AIR;
        if (k === T.ONEWAY || k === T.BLOCK) run++;
        else if (run) {
          const x0 = x - run;
          const g = st.ground[x0] < st.rows ? st.ground[x0] : st.base;
          plats.push({ len: run, h: g - y });
          run = 0;
        }
      }
    }
    // A haybale: drop onto it from a little above; how high do the feet go above its top?
    let hay = null;
    for (let x = 0; x < st.cols && !hay; x++) for (let y = 0; y < st.rows; y++) if (L.tileAt(x, y) === T.HAY && L.tileAt(x, y - 1) === T.AIR) hay = { x, y };
    const bounce = (held) => {
      Object.assign(L.player, { x: hay.x + 0.5, y: hay.y - 0.5, vx: 0, vy: 2, ground: false, poof: 0, invul: 9 });
      L.input.keys.clear();
      if (held) L.input.keys.add('jump');
      L.sync();
      let top = Infinity;
      let launched = false;
      for (let i = 0; i < 240; i++) {
        L.step();
        if (L.player.vy < -5) launched = true;
        if (launched) top = Math.min(top, L.player.y);
        if (launched && L.player.vy > 0) break;
      }
      L.input.keys.clear();
      L.sync();
      return hay.y - top;
    };
    return { plats, low: bounce(false), high: bounce(true) };
  });
  assert.ok(r.plats.length >= 14, `${r.plats.length} platforms`);
  assert.ok(r.plats.some((p) => p.len === 1), 'a platform 1 tile long');
  assert.ok(r.plats.some((p) => p.len >= 6), 'a platform at least 6 long');
  const heights = new Set(r.plats.filter((p) => p.h >= 1 && p.h <= 8).map((p) => p.h));
  assert.ok(heights.size >= 5, `${heights.size} different heights: ${[...heights]}`);
  assert.ok(r.low >= 2 && r.low <= 3, `a haybale bounces ${r.low.toFixed(2)} tiles`);
  assert.ok(r.high >= 4.5 && r.high <= 5.5, `with jump held ${r.high.toFixed(2)} tiles`);
  await context.close();
});

test('pixel-leap AC-26: Farm hides pockets of coins off the route, drawn only within 3 tiles, with a glint every 2 s', async () => {
  const { context, page } = await open();
  await page.click('[data-go]');
  const r = await page.evaluate((BOT) => {
    const L = window.__leap;
    L.manual = true;
    L.game.mode = 'play';
    L.game.lives = 99;
    L.startWorld(2);
    const st = L.stage();
    const pockets = {};
    for (const t of st.things) if (t.hidden) (pockets[t.pocket] = pockets[t.pocket] || []).push(t);
    // The coins' drawing: a block of the screen around the pocket, with the monster far, then near.
    const c = document.getElementById('view');
    const g = c.getContext('2d');
    const look = (coin) => {
      L.cam.x = coin.x - L.view.tilesW / 2;
      L.cam.y = coin.y - L.view.tilesH / 2;
      L.render();
      const U = L.view.U;
      return Array.from(g.getImageData(Math.round((coin.x - L.cam.x) * U - U * 0.4), Math.round((coin.y - L.cam.y) * U - U * 0.4), Math.round(U * 0.8), Math.round(U * 0.8)).data).join(',');
    };
    const draws = [];
    for (const list of Object.values(pockets)) {
      const coin = list[1] || list[0];
      const first = list[0];
      L.game.t = 1 - first.pocket * 0.7 + 2 * 10; // between glints
      Object.assign(L.player, { x: coin.x + 6, y: st.base, vx: 0, vy: 0 });
      const far = look(coin);
      // Hidden: with the monster far, the picture is the same as with the coin gone.
      coin.alive = false;
      const gone = look(coin);
      coin.alive = true;
      // The glint: over any 2 s, the first coin's spot is drawn differently at least once.
      const base = look(first);
      let glints = 0;
      const t0 = L.game.t;
      for (let t = 0; t < 2; t += 0.05) {
        L.game.t = t0 + t;
        if (look(first) !== base) glints++;
      }
      L.game.t = t0;
      Object.assign(L.player, { x: coin.x + 1, y: coin.y + 1.2 });
      const near = look(coin);
      draws.push({ n: list.length, hiddenFar: far === gone, shownNear: near !== far, glints });
    }
    // Off the route: the scripted run passes without taking any of them.
    L.startWorld(2);
    const run = eval(BOT)({ limit: 150, ride: true });
    const taken = L.stage().things.filter((t) => t.hidden && t.got).length;
    return { draws, end: run.end, taken };
  }, BOT_SRC);
  assert.ok(r.draws.length >= 3, `${r.draws.length} pockets`);
  for (const d of r.draws) {
    assert.ok(d.n >= 3, `a pocket of ${d.n} coins`);
    assert.equal(d.hiddenFar, true, 'its coins are not drawn while the monster is far');
    assert.equal(d.shownNear, true, 'its coins show once the monster comes within 3 tiles');
    assert.ok(d.glints >= 1, 'a glint every 2 s');
  }
  assert.equal(r.end, 'map');
  assert.equal(r.taken, 0, 'the pockets are off the scripted route');
  // Drawn only near: a pocket's coins aren't drawn while far (the game keeps them unfound).
  const far = await page.evaluate(() => {
    const L = window.__leap;
    L.startWorld(2);
    L.game.mode = 'play';
    const coin = L.stage().things.find((t) => t.hidden);
    Object.assign(L.player, { x: coin.x + 6, y: L.stage().base });
    L.render();
    const before = Boolean(coin.found);
    Object.assign(L.player, { x: coin.x + 2, y: coin.y + 1.2 });
    L.render();
    return { before, after: Boolean(coin.found) };
  });
  assert.deepEqual(far, { before: false, after: true });
  await context.close();
});

test('pixel-leap AC-27: Industrial: platforms and lifts carry you, you jump up through them, belts carry you; wide gaps only riding crosses', async () => {
  const { context, page } = await open();
  await page.click('[data-go]');
  const r = await page.evaluate((BOT) => {
    const L = window.__leap;
    L.manual = true;
    L.game.mode = 'play';
    L.game.lives = 99;
    L.startWorld(4);
    const st = L.stage();
    const movers = st.things.filter((t) => t.type === 'mover');
    const ride = (m) => {
      L.startWorld(4);
      const mm = L.stage().things.find((t) => t.id === m.id);
      const off = 1.5;
      Object.assign(L.player, { x: mm.x + off, y: mm.y, vx: 0, vy: 0, ground: true, onMover: mm, invul: 9, poof: 0 });
      L.input.keys.clear();
      L.sync();
      for (let i = 0; i < 120; i++) L.step();
      return Math.hypot(L.player.x - (mm.x + off), L.player.y - mm.y);
    };
    const flat = movers.find((m) => m.axis === 'x');
    const lift = movers.find((m) => m.axis === 'y');
    const drift = [ride(flat), ride(lift)];
    // Up through a platform from below, then down onto it.
    L.startWorld(4);
    const m2 = L.stage().things.find((t) => t.id === flat.id);
    Object.assign(L.player, { x: m2.x + 1.5, y: m2.y + 2.2, vx: 0, vy: -17, ground: false, invul: 9 });
    let through = false;
    let landed = false;
    for (let i = 0; i < 200; i++) {
      L.step();
      if (L.player.y < m2.y - 0.5) through = true;
      if (through && L.player.onMover === m2) landed = true;
    }
    // A belt: standing still on it for 1 s.
    L.startWorld(4);
    let bx = 0;
    while (L.tileAt(bx, st.base) !== L.T.BELTR) bx++;
    Object.assign(L.player, { x: bx + 0.5, y: st.base, vx: 0, vy: 0, ground: true, onMover: null, invul: 9 });
    L.step();
    const x0 = L.player.x;
    for (let i = 0; i < 120; i++) L.step();
    const belt = L.player.x - x0;
    // Gaps of 10 or more, each with a moving platform in it.
    const gaps = [];
    for (let x = 0, run = 0; x <= st.cols; x++) {
      if (x < st.cols && st.ground[x] >= st.rows) run++;
      else {
        if (run >= 10) gaps.push({ x0: x - run, x1: x, mover: movers.some((m) => m.axis === 'x' && m.sx >= x - run - 0.5 && m.sx < x) });
        run = 0;
      }
    }
    // A run with the ears that never rides falls into each of those gaps.
    const falls = [];
    for (const g of gaps) {
      L.startWorld(4);
      L.game.ears = true;
      // Never riding: the moving platforms aren't there to land on.
      const s2 = L.stage();
      s2.surfaces = s2.surfaces.filter((m) => m.type !== 'mover');
      s2.things = s2.things.filter((m) => m.type !== 'mover');
      s2.movers = [];
      Object.assign(L.player, { x: g.x0 - 3.5, y: L.stage().ground[g.x0 - 4], vx: 0, vy: 0, ground: true, invul: 0 });
      const res = eval(BOT)({ limit: 20, ride: false, stopAfterDeaths: 1 });
      falls.push(res.deaths[0] >= g.x0 - 1 && res.deaths[0] <= g.x1 + 1 ? true : res.deaths[0] ?? res.end);
    }
    L.game.ears = false;
    return { drift, through, landed, belt, gaps, lifts: movers.filter((m) => m.axis === 'y').length, falls };
  }, BOT_SRC);
  assert.ok(r.drift[0] < 0.1, `a moving platform carries the monster (off by ${r.drift[0]})`);
  assert.ok(r.drift[1] < 0.1, `a lift carries the monster (off by ${r.drift[1]})`);
  assert.equal(r.through, true, 'jumps up through a platform');
  assert.equal(r.landed, true, 'and lands on it');
  assert.ok(Math.abs(r.belt - 2.5) <= 0.3, `a belt carries 2.5 tiles a second (${r.belt.toFixed(2)})`);
  assert.ok(r.gaps.length >= 2, `${r.gaps.length} gaps of 10 or more`);
  assert.ok(r.gaps.every((g) => g.mover), 'each with a moving platform');
  assert.ok(r.lifts >= 1, 'a lift');
  assert.deepEqual(r.falls, r.gaps.map(() => true), `without riding, even with the ears, each gap is a fall (${JSON.stringify(r.gaps)} ${JSON.stringify(r.falls)})`);
  await context.close();
});

test('pixel-leap AC-28: Mushroom is a tall climb; caps launch 4, 6, 8 tiles in a run, 4 again after the ground; the landing stays in view', async () => {
  for (const opts of [{}, PHONE]) {
    const { context, page } = await open(opts);
    await play(page, W.mushroom, 0);
    const r = await page.evaluate(() => {
      const L = window.__leap;
      const st = L.stage();
      const door = st.things.find((t) => t.type === 'portal');
      const caps = st.things.filter((t) => t.type === 'cap');
      const cap = caps[0];
      const launch = () => {
        let top = Infinity;
        let up = false;
        for (let i = 0; i < 400; i++) {
          L.step();
          if (L.player.vy < -5) up = true;
          if (up) top = Math.min(top, L.player.y);
          if (up && L.player.vy > 0) break;
        }
        return cap.y - top;
      };
      const dropOn = () => {
        Object.assign(L.player, { x: cap.x + 1.5, y: cap.y - 0.3, vx: 0, vy: 2, ground: false, poof: 0, invul: 9 });
        return launch();
      };
      L.input.keys.clear();
      L.sync();
      const run = [dropOn(), dropOn(), dropOn(), dropOn()];
      // Land on the ground, then the cap again.
      Object.assign(L.player, { x: 3, y: st.ground[3] - 0.2, vx: 0, vy: 2, ground: false });
      for (let i = 0; i < 20; i++) L.step();
      const after = dropOn();
      // An 8-tile launch in a real run: from the third cap to the fourth (6 higher), the fourth
      // cap stays in view the whole way.
      const run2 = caps.filter((c) => c.x > 80).sort((a, b) => a.x - b.x);
      let inView = run2.length >= 4;
      if (run2.length >= 4) {
        const [c3, c4] = [run2[2], run2[3]];
        L.game.capChain = 2;
        Object.assign(L.player, { x: c3.x + 1.5, y: c3.y - 0.3, vx: 0, vy: 2, ground: false });
        L.cam.y = L.player.y - L.view.tilesH * 0.62;
        for (let i = 0; i < 300; i++) {
          const dx = c4.x + 1.5 - L.player.x;
          L.input.keys.clear();
          if (L.player.y < c4.y && Math.abs(dx) > 0.3) L.input.keys.add(dx > 0 ? 'right' : 'left');
          else if (L.player.vy < 0) L.input.keys.add('right');
          L.sync();
          L.step();
          if (c4.y < L.cam.y || c4.y > L.cam.y + L.view.tilesH) inView = false;
          if (L.player.onCap === c4 || L.player.vy < -5 && L.player.y > c4.y - 1 && i > 30) break;
        }
      }
      // Falling below the level's bottom costs a life.
      const lives = L.game.lives;
      Object.assign(L.player, { x: run2[0] ? run2[0].x + 6 : 100, y: st.rows + 1, vx: 0, vy: 5, ground: false, invul: 0 });
      for (let i = 0; i < 30; i++) L.step();
      return { climb: st.start.y - door.y, run, after, inView, lost: lives - L.game.lives, rows: st.rows };
    });
    assert.ok(r.climb >= 30, `the door is ${r.climb} tiles above the start`);
    assert.ok(r.rows > 15, 'a tall level');
    for (const [got, want] of r.run.map((h, i) => [h, [4, 6, 8, 8][i]])) assert.ok(Math.abs(got - want) <= 0.5, `cap launch ${got.toFixed(2)} for ${want}`);
    assert.ok(Math.abs(r.after - 4) <= 0.5, `back to 4 after the ground (${r.after.toFixed(2)})`);
    assert.equal(r.inView, true, `four caps in the second run, and the landing cap stays in view (${JSON.stringify(opts.viewport || 'desktop')})`);
    assert.equal(r.lost, 1, 'falling off the bottom costs a life');
    await context.close();
  }
});

test('pixel-leap AC-29: Pico is drawn at 8 px per tile in PICO-8’s 16 colours, its monster too', async () => {
  const { context, page } = await open(PHONE);
  await play(page, W.pico, 0);
  const r = await page.evaluate(() => {
    const L = window.__leap;
    const pal = new Set(L.WORLDS[6].fixed.map((h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)).join(',')));
    const off = [];
    const scan = (x) => {
      const st = L.stage();
      Object.assign(L.player, { x, y: st.ground[Math.floor(x)] < st.rows ? st.ground[Math.floor(x)] : st.base, vx: 0, vy: 0, ground: true, invul: 0 });
      L.steps(30);
      L.clearParticles();
      L.render();
      const c = document.getElementById('view');
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let bad = 0;
      for (let i = 0; i < d.length; i += 4 * 7) if (!pal.has(`${d[i]},${d[i + 1]},${d[i + 2]}`)) bad++;
      off.push(bad);
    };
    for (const x of [4, 30, 60, 90]) scan(x);
    const b = L.baked();
    const cols = new Set();
    for (const f of Object.values(b.frames)) {
      const d = f.getContext('2d').getImageData(0, 0, f.width, f.height).data;
      for (let i = 0; i < d.length; i += 4) if (d[i + 3]) cols.add(`${d[i]},${d[i + 1]},${d[i + 2]}`);
    }
    return { res: L.renderRes(), off, monster: [...cols].filter((c) => !pal.has(c)) };
  });
  assert.equal(r.res, 8);
  assert.deepEqual(r.off, [0, 0, 0, 0], 'every pixel of the world is a PICO-8 colour');
  assert.deepEqual(r.monster, [], 'the monster is baked in PICO-8 colours');
  await context.close();
});

test('pixel-leap AC-30: Pico is the most crowded; flyers swoop and climb back, hurt and can be stomped; stomp chains pay extra in Pico only', async () => {
  const { context, page } = await open();
  await play(page, W.pico, 0);
  const r = await page.evaluate(() => {
    const L = window.__leap;
    const counts = L.WORLDS.map((w, i) => {
      L.startWorld(i);
      const st = L.stage();
      const bad = st.things.filter((t) => t.type === 'walker' || t.type === 'flyer' || t.type === 'worm');
      return { id: w.id, n: bad.length, after: bad.filter((t) => t.x >= 15 && t.x < st.next).length, span: st.next - 15 };
    });
    L.startWorld(6);
    L.game.mode = 'play';
    const st = L.stage();
    const f = st.things.find((t) => t.type === 'flyer');
    // In the air within 5 tiles ahead: no dive (it dives only at a monster on the ground).
    const gy = st.ground[Math.floor(f.sx - 4)];
    let airDive = false;
    for (let i = 0; i < 60; i++) {
      Object.assign(L.player, { x: f.sx - 4, y: gy - 2, vx: 0, vy: -1, ground: false, invul: 99 });
      L.step();
      if (f.state !== 'hover') airDive = true;
    }
    // A swoop: the monster on the ground 4 tiles before it.
    Object.assign(L.player, { x: f.sx - 4, y: gy, vx: 0, vy: 0, ground: true, invul: 99 });
    L.input.keys.clear();
    L.sync();
    let low = f.y;
    let swooped = false;
    let back = false;
    for (let i = 0; i < 600; i++) {
      L.step();
      low = Math.max(low, f.y);
      if (f.state === 'swoop') swooped = true;
      if (swooped && f.state === 'hover') {
        back = true;
        break;
      }
      // The monster steps aside so the flyer misses.
      if (swooped) L.player.x = f.sx + 8;
    }
    // From the side it hurts; from above it's stomped.
    L.startWorld(6);
    const f2 = L.stage().things.find((t) => t.type === 'flyer');
    f2.state = 'return';
    L.game.shields = 1;
    Object.assign(L.player, { x: f2.x - 0.5, y: f2.y, vx: 0, vy: 0, ground: false, invul: 0 });
    L.step();
    const hurt = L.game.shields === 0;
    L.startWorld(6);
    const f3 = L.stage().things.find((t) => t.type === 'flyer');
    Object.assign(L.player, { x: f3.x, y: f3.y - 1.3, vx: 0, vy: 6, ground: false, invul: 0 });
    for (let i = 0; i < 20; i++) L.step();
    const stomped = !f3.alive;
    // Stomp chains: six stomps in the air, then one after landing.
    const chain = (w) => {
      L.startWorld(w);
      L.game.mode = 'play';
      const s = L.stage();
      const walkers = s.things.filter((t) => t.type === 'walker' && t.kind !== 'spiky').slice(0, 3);
      const coins = [];
      let n = 0;
      const stompOn = () => {
        const e = walkers[n++ % walkers.length];
        e.alive = true;
        e.x = 30.5;
        e.y = s.ground[30] < s.rows ? s.ground[30] : s.base;
        Object.assign(L.player, { x: 30.5, y: e.y - 2.4, vx: 0, vy: 8, ground: false, invul: 0, poof: 0 });
        const c0 = L.game.coins;
        for (let i = 0; i < 30 && e.alive; i++) L.step();
        coins.push(L.game.coins - c0);
      };
      for (let i = 0; i < 6; i++) stompOn();
      // Land, then stomp again: a new chain.
      Object.assign(L.player, { x: 20, y: s.ground[20], vx: 0, vy: 1, ground: false });
      for (let i = 0; i < 5; i++) L.step();
      stompOn();
      return coins;
    };
    const pico = chain(6);
    const meadow = chain(0);
    // A hit ends a chain.
    L.startWorld(6);
    L.game.mode = 'play';
    L.game.stompChain = 3;
    L.game.shields = 1;
    L.player.invul = 0;
    L.hit(L.player.x + 1);
    const afterHit = L.game.stompChain;
    return { counts, airDive, swooped, low: low - f.sy, back, hurt, stomped, pico, meadow, afterHit };
  });
  const pico = r.counts.find((c) => c.id === 'pico');
  for (const c of r.counts) if (c.id !== 'pico') assert.ok(pico.n > c.n, `Pico (${pico.n}) has more bad guys than ${c.id} (${c.n})`);
  assert.ok(pico.after >= Math.floor(pico.span / 8), `at least one per 8 tiles after the opening (${pico.after} in ${pico.span})`);
  assert.equal(r.airDive, false, 'no dive at a monster in the air');
  assert.equal(r.swooped, true, 'a flyer swoops at the monster on the ground');
  assert.ok(r.low > 1.5, `it dives down (${r.low.toFixed(2)} tiles)`);
  assert.equal(r.back, true, 'and climbs back home');
  assert.equal(r.hurt, true, 'a flyer hurts from the side');
  assert.equal(r.stomped, true, 'a flyer can be stomped');
  assert.deepEqual(r.pico, [0, 1, 2, 3, 4, 4, 0], 'in Pico each stomp in a chain pays one more, up to 4; landing ends it');
  assert.deepEqual(r.meadow, [0, 0, 0, 0, 0, 0, 0], 'in the Meadow a chain pays nothing extra');
  assert.equal(r.afterHit, 0, 'a hit ends the chain');
  await context.close();
});

test('pixel-leap AC-31: each new world plays its music (its own bed, else its sound set’s loop) and draws from its own pack', async () => {
  const { context, page } = await open();
  await goPlay(page, true);
  const r = await page.evaluate(() => {
    const L = window.__leap;
    L.manual = true;
    const used = new Set();
    const orig = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function (img, ...rest) {
      if (img && img.src) used.add(img.src.split('/').pop());
      return orig.call(this, img, ...rest);
    };
    const out = {};
    for (const id of ['farm', 'industrial', 'mushroom', 'pico']) {
      const w = L.WORLDS.findIndex((x) => x.id === id);
      // Through the previous level's door and the map into this world.
      L.startWorld(w - 1);
      L.game.mode = 'play';
      const po = L.stage().things.find((t) => t.type === 'portal');
      Object.assign(L.player, { x: po.x, y: po.y, invul: 0 });
      L.step();
      for (let i = 0; i < 1000 && L.game.mode !== 'play'; i++) L.step();
      const loops = L.heard.filter((x) => x.startsWith('loop:'));
      used.clear();
      const st = L.stage();
      Object.assign(L.player, { x: 10, y: st.ground[10] });
      L.cam.x = 4;
      L.cam.y = st.ground[10] - L.view.tilesH * 0.62;
      L.render();
      out[id] = { world: L.game.world === w, loop: loops[loops.length - 1], images: [...used] };
    }
    CanvasRenderingContext2D.prototype.drawImage = orig;
    return out;
  });
  assert.equal(r.farm.loop, 'loop:farm-bed', 'the owner’s bed for the Farm');
  assert.equal(r.industrial.loop, 'loop:m-music');
  assert.equal(r.mushroom.loop, 'loop:c-music');
  assert.equal(r.pico.loop, 'loop:m-music');
  assert.ok(r.farm.images.includes('farm-tiles.png'), `Farm draws its pack (${r.farm.images})`);
  assert.ok(r.industrial.images.includes('industrial-tiles.png'), 'Industrial draws its pack');
  assert.ok(r.mushroom.images.includes('mushroom.png'), 'Mushroom draws its pack');
  assert.ok(r.pico.images.includes('pico-tiles.png'), 'Pico draws its pack');
  for (const id of Object.keys(r)) assert.equal(r[id].world, true);
  await context.close();
});

test('pixel-leap AC-32: a world with the owner’s music plays its bed, with an accent over it every 15 to 40 s of play, never twice running; pause stops both', async () => {
  const { context, page } = await open();
  await goPlay(page, true);
  const r = await page.evaluate(async () => {
    const L = window.__leap;
    L.manual = true;
    await new Promise((res) => setTimeout(res, 300));
    const bed = L.bed();
    // Ten minutes of play in the Meadow: when each accent comes, and which.
    const times = [];
    const names = [];
    let t = 0;
    const from = L.heard.length;
    let seen = from;
    for (let i = 0; i < 600 * 120; i++) {
      L.game.mode = 'play';
      L.player.invul = 9;
      L.player.x = 4;
      L.player.y = 11;
      L.player.vy = 0;
      L.step();
      t += 1 / 120;
      while (seen < L.heard.length) {
        const h = L.heard[seen++];
        if (/^meadow-a\d$/.test(h)) {
          times.push(t);
          names.push(h);
        }
      }
      if (L.heard.length > 25) {
        L.heard.splice(0, L.heard.length);
        seen = 0;
      }
    }
    const gaps = times.map((x, i) => x - (i ? times[i - 1] : 0));
    // Each other world with the owner's music plays its own accents.
    const own = {};
    for (const id of ['farm', 'ice', 'candy', 'sea', 'castle']) {
      L.startWorld(L.WORLDS.findIndex((w) => w.id === id));
      L.game.mode = 'play';
      L.game.accentIn = 0.005;
      L.heard.splice(0, L.heard.length);
      L.step();
      own[id] = L.heard.filter((h) => /-a\d$/.test(h));
    }
    // Paused: the bed stops and no accent comes.
    L.manual = false;
    L.game.mode = 'play';
    L.pause();
    const pausedBed = L.bed().paused;
    const before = L.game.accentIn;
    L.manual = true;
    for (let i = 0; i < 120 * 60; i++) L.step();
    return { bed, gaps, names, own, distinct: new Set(names).size, pausedBed, still: L.game.accentIn === before, mode: L.game.mode };
  });
  assert.equal(r.bed.world, 'meadow', 'the Meadow’s bed is playing');
  assert.ok(r.gaps.length >= 15, `${r.gaps.length} accents in ten minutes`);
  for (const g of r.gaps) assert.ok(g >= 15 - 0.01 && g <= 40 + 0.01, `an accent after ${g.toFixed(1)} s`);
  assert.equal(r.distinct, 3, 'all three accents come');
  for (const id of ['farm', 'ice', 'candy', 'sea', 'castle']) assert.match(String(r.own[id]), new RegExp(`^${id}-a[123]$`), `${id} plays its own accent (${r.own[id]})`);
  for (let i = 1; i < r.names.length; i++) assert.notEqual(r.names[i], r.names[i - 1], 'never the same twice running');
  assert.equal(r.mode, 'paused');
  assert.equal(r.pausedBed, true, 'paused, the bed stops');
  assert.equal(r.still, true, 'paused, no accent comes');
  // Muting mutes the bed too.
  await page.click('[data-mute]');
  assert.equal((await page.evaluate(() => window.__leap.bed())).muted, true);
  await page.click('[data-mute]');
  await context.close();
});

test('pixel-leap AC-33: Castle: a gate stops you until you touch it holding a key; keys show in the HUD and reset with the level; a run that takes no key stops at the first gate', async () => {
  const { context, page } = await open(PHONE);
  await play(page, W.castle, 0);
  const r = await page.evaluate((BOT) => {
    const L = window.__leap;
    const p = L.player;
    const st = L.stage();
    const gate = st.things.find((t) => t.type === 'gate');
    const runAt = (x) => {
      Object.assign(p, { x, y: gate.y, vx: 0, vy: 0, ground: true, invul: 9, poof: 0 });
      L.input.keys.clear();
      L.input.keys.add('right');
      L.sync();
      for (let i = 0; i < 120; i++) L.step();
      L.input.keys.clear();
      L.sync();
      return p.x;
    };
    const stopped = runAt(gate.x - 4);
    // Pick up the first key (the HUD shows it on the next frames).
    const key = st.things.find((t) => t.type === 'key');
    Object.assign(p, { x: key.x, y: key.y + 0.6, vx: 0, vy: 0, ground: false });
    L.step();
    const held = L.game.keys;
    window.__leap.render();
    // The HUD updates on the next frame.
    // The HUD updates on the frames that follow.
    return new Promise((res) =>
      requestAnimationFrame(() => requestAnimationFrame(() => {
        const hud0 = document.querySelector('[data-hud-keys]').hidden;
        const hudN = document.querySelector('[data-hud-keys-n]').textContent;
        const through = runAt(gate.x - 4);
        const after = { keys: L.game.keys, open: gate.open, tile: L.tileAt(Math.floor(gate.x), gate.y - 1) };
        // A life lost brings the keys back and shuts the gate.
        L.game.lives = 3;
        L.loseLife();
        for (let i = 0; i < 120; i++) L.step();
        const st2 = L.stage();
        const reset = { keys: L.game.keys, shut: L.tileAt(Math.floor(gate.x), gate.y - 1) === L.T.GATE, key: st2.things.find((t) => t.type === 'key').alive };
        // A scripted run that only runs right and jumps gaps, walls and hazards: it takes no key.
        L.startWorld(L.game.world);
        L.game.lives = 99;
        const bot = eval(BOT);
        const run = bot({ limit: 20, ride: true, keys: false });
        const firstGate = L.stage().things.find((t) => t.type === 'gate');
        res({ stopped, gateX: gate.x, hud0, held, hudN, through, after, reset, runX: run.x, runKeys: L.game.keys, taken: L.stage().things.filter((t) => t.type === 'key' && !t.alive).length, firstGate: firstGate.x, gates: L.stage().things.filter((t) => t.type === 'gate').length });
      }))
    );
  }, BOT);
  assert.ok(r.stopped < r.gateX - 0.5, `the shut gate stops the monster (${r.stopped} at a gate at ${r.gateX})`);
  assert.equal(r.hud0, false, 'Castle shows its keys in the HUD');
  assert.equal(r.held, 1);
  assert.equal(r.hudN, '1');
  assert.ok(r.through > r.gateX + 1, 'with a key, through the gate');
  assert.deepEqual(r.after, { keys: 0, open: true, tile: 0 });
  assert.deepEqual(r.reset, { keys: 0, shut: true, key: true });
  assert.ok(r.gates >= 3, `${r.gates} gates`);
  assert.equal(r.taken, 0, 'a run straight on touches no key');
  assert.ok(r.runX < r.firstGate, `and stops at the first gate (${r.runX})`);
  // Keys held at the door don't carry on.
  const carried = await page.evaluate(() => {
    const L = window.__leap;
    L.startWorld(L.WORLDS.findIndex((w) => w.id === 'ink'));
    L.game.mode = 'play';
    L.game.keys = 2;
    const po = L.stage().things.find((t) => t.type === 'portal');
    Object.assign(L.player, { x: po.x, y: po.y });
    L.step();
    for (let i = 0; i < 1000 && L.game.mode !== 'play'; i++) L.step();
    return L.game.keys;
  });
  assert.equal(carried, 0);
  await context.close();
});

test('pixel-leap AC-34: a Castle crusher waits, shakes, drops, stays and rises on a 3.2 s rhythm; it hurts only when down or coming down', async () => {
  const { context, page } = await open();
  await play(page, W.castle, 0);
  const r = await page.evaluate(() => {
    const L = window.__leap;
    const st = L.stage();
    const cs = st.things.filter((t) => t.type === 'crusher');
    const c = cs[0];
    const p = L.player;
    // Its rhythm, sampled every step for two periods.
    const seen = [];
    let prev = null;
    let shakeFrom = null;
    for (let i = 0; i < 2 * 3.2 * 120; i++) {
      L.step();
      Object.assign(p, { x: c.x - 6, y: c.floor, vx: 0, vy: 0, ground: true, invul: 9 });
      if (c.state !== prev) {
        seen.push([c.state, +st.clock.toFixed(3)]);
        prev = c.state;
      }
      if (c.shake && shakeFrom === null) shakeFrom = st.clock;
    }
    // Under it while it waits up: nothing; while it is down: a heart.
    const under = (state) => {
      while (c.state !== state) L.step();
      L.game.shields = 1;
      Object.assign(p, { x: c.x + 1, y: c.floor, vx: 0, vy: 0, ground: true, invul: 0, poof: 0 });
      L.step();
      return L.game.shields;
    };
    const upShield = under('up');
    const downShield = under('down');
    // Rising: harmless once its bottom is 1.4 tiles up.
    while (c.state !== 'rising') L.step();
    let safeAt = null;
    while (c.state === 'rising') {
      if (safeAt === null && c.floor - c.y >= 1.4) safeAt = c.floor - c.y;
      L.step();
    }
    const phases = [...new Set(cs.slice(0, 3).map((t) => t.phase))];
    return { seen, shakeFrom, upShield, downShield, h: cs.map((t) => t.h), n: cs.length, phases, safeAt };
  });
  // Durations between state changes, after the first full change.
  const order = r.seen.map((s) => s[0]);
  const at = (s, k = 0) => r.seen.filter((x) => x[0] === s)[k][1];
  const i = order.indexOf('falling');
  assert.ok(i >= 0);
  const fall = at('down') - at('falling');
  const down = at('rising') - at('down');
  const rise = at('up', 1) - at('rising');
  const period = at('falling', 1) - at('falling');
  assert.ok(Math.abs(fall - 0.2) < 0.05, `drops in ${fall}`);
  assert.ok(Math.abs(down - 0.6) < 0.05, `stays ${down}`);
  assert.ok(Math.abs(rise - 1.0) < 0.05, `rises in ${rise}`);
  assert.ok(Math.abs(period - 3.2) < 0.05, `again every ${period}`);
  assert.ok(r.shakeFrom !== null, 'it shakes before it drops');
  assert.equal(r.upShield, 1, 'standing under it while it waits up costs nothing');
  assert.equal(r.downShield, 0, 'under it when it is down costs the heart');
  assert.ok(r.h.every((h) => h <= 4), 'its bottom at most 4 tiles up');
  assert.ok(r.n >= 5, `${r.n} crushers`);
  assert.ok(r.phases.length >= 2, 'crushers side by side start at different points of the rhythm');
  await context.close();
});

test('pixel-leap AC-35: Ice: ice slides, snow grips, slopes run both ways, snow piles roll snowballs that hurt and shatter; small ledges over pits', async () => {
  const { context, page } = await open();
  const ice = await slide(page, W.ice, 'ice');
  const snow = await slide(page, W.ice, 'snow');
  assert.ok(ice >= 2, `ice slides ${ice.toFixed(2)} tiles`);
  assert.ok(snow < 1, `snow grips: ${snow.toFixed(2)} tiles`);
  const r = await page.evaluate(() => {
    const L = window.__leap;
    const st = L.stage();
    const p = L.player;
    // The first slope up: run from its foot to past its top without jumping.
    let foot = 0;
    for (let c = 0; c < st.cols; c++) if (L.tileAt(c, st.ground[c]) === L.T.SLOPEU) {
      foot = c;
      break;
    }
    Object.assign(p, { x: foot - 3, y: st.ground[foot - 3], vx: 0, vy: 0, ground: true, invul: 99 });
    L.input.keys.clear();
    L.input.keys.add('right');
    L.sync();
    let off = 0;
    let air = 0;
    const speeds = [];
    for (let i = 0; i < 240 && p.x < foot + 12; i++) {
      L.step();
      const sl = L.SLOPES.has(L.tileAt(Math.floor(p.x), Math.floor(p.y - 0.01))) || L.SLOPES.has(L.tileAt(Math.floor(p.x), Math.floor(p.y)));
      if (sl) {
        const tx = Math.floor(p.x);
        const ty = L.SLOPES.has(L.tileAt(tx, Math.floor(p.y - 0.01))) ? Math.floor(p.y - 0.01) : Math.floor(p.y);
        off = Math.max(off, Math.abs(L.slopeY(L.tileAt(tx, ty), tx, ty, p.x) - p.y));
        if (Math.abs(p.vx) > 6) speeds.push(p.vx);
      }
      if (!p.ground) air++;
    }
    const up = { off, air, speeds: speeds.length, top: p.x >= foot + 4 };
    // And it can jump from a slope.
    let mid = 0;
    for (let c = 0; c < st.cols; c++) if (L.tileAt(c, st.ground[c]) === L.T.SLOPEU) {
      mid = c;
      break;
    }
    Object.assign(p, { x: mid + 0.5, y: st.ground[mid] + 0.5, vx: 0, vy: 0, ground: true, onSlope: true });
    L.input.keys.clear();
    L.input.keys.add('jump');
    L.sync();
    L.step();
    L.step();
    const jumped = p.vy < -10;
    L.input.keys.clear();
    L.sync();
    // Down the slope that falls, the feet stay on it.
    let down = 0;
    for (let c = foot; c < st.cols; c++) if (L.tileAt(c, st.ground[c]) === L.T.SLOPED) {
      down = c;
      break;
    }
    Object.assign(p, { x: down - 1.5, y: st.ground[down - 1], vx: 0, vy: 0, ground: true, onSlope: false });
    L.input.keys.add('right');
    L.sync();
    let offD = 0;
    let airD = 0;
    for (let i = 0; i < 120 && p.x < down + 3; i++) {
      L.step();
      const tx = Math.floor(p.x);
      for (const ty of [Math.floor(p.y - 0.01), Math.floor(p.y)]) if (L.tileAt(tx, ty) === L.T.SLOPED) offD = Math.max(offD, Math.abs(L.slopeY(L.T.SLOPED, tx, ty, p.x) - p.y));
      if (!p.ground) airD++;
    }
    L.input.keys.clear();
    L.sync();
    // Snow piles and snowballs: the rhythm, the speeds, where they end.
    L.startWorld(L.game.world);
    L.game.mode = 'play';
    const st2 = L.stage();
    const pile = st2.things.find((t) => t.type === 'pile');
    const sent = [];
    let maxSlope = 0;
    let maxFlat = 0;
    let shattered = 0;
    let lastN = 0;
    for (let i = 0; i < 120 * 12; i++) {
      Object.assign(p, { x: 3, y: st2.ground[3], vx: 0, vy: 0, ground: true, invul: 99 });
      const before = pile.sent || 0;
      L.step();
      if ((pile.sent || 0) > before) sent.push(st2.clock);
      for (const b of st2.balls) {
        const tx = Math.floor(b.x);
        const onSlope = L.SLOPES.has(L.tileAt(tx, Math.floor(b.y - 0.01))) || L.SLOPES.has(L.tileAt(tx, Math.floor(b.y)));
        if (onSlope) maxSlope = Math.max(maxSlope, Math.abs(b.vx));
        else maxFlat = Math.max(maxFlat, Math.abs(b.vx));
      }
      if (st2.balls.length < lastN) shattered++;
      lastN = st2.balls.length;
    }
    const gaps = sent.slice(1).map((t, i) => t - sent[i]);
    // A snowball hurts (a heart), and can't be stomped.
    const b = st2.balls[0];
    L.game.shields = 1;
    // Coming down onto its top, as a stomp would.
    Object.assign(p, { x: b.x, y: b.y - 0.9, vx: 0, vy: 5, ground: false, invul: 0, poof: 0 });
    L.step();
    const hurt = L.game.shields === 0 && st2.balls.includes(b);
    // Ledges over pits, 1 to 3 long; ice ones at least 2.
    const ledges = [];
    for (let y = 0; y < st2.rows; y++) {
      let run = [];
      for (let x = 0; x <= st2.cols; x++) {
        const k = x < st2.cols ? L.tileAt(x, y) : 0;
        if ((k === L.T.ONEWAY || k === L.T.ICE || k === L.T.BLOCK) && st2.ground[x] >= st2.rows) run.push(k);
        else {
          if (run.length) ledges.push({ len: run.length, ice: run.every((t) => t === L.T.ICE) });
          run = [];
        }
      }
    }
    return {
      up, jumped, offD, airD, gaps, maxSlope, maxFlat, shattered, hurt,
      piles: st2.things.filter((t) => t.type === 'pile').length,
      ledges: ledges.filter((l) => l.len >= 1 && l.len <= 3).length,
      iceLedges: ledges.filter((l) => l.ice && l.len >= 2 && l.len <= 3).length,
    };
  });
  assert.ok(r.up.top, 'runs up to the slope top');
  assert.equal(r.up.air, 0, 'without leaving the ground');
  assert.ok(r.up.off <= 0.1, `feet on the slope (off by ${r.up.off})`);
  assert.ok(r.up.speeds > 0, 'at its flat speed on the slope');
  assert.equal(r.jumped, true, 'it can jump from a slope');
  assert.ok(r.offD <= 0.1, `down the slope, feet on it (off by ${r.offD})`);
  assert.equal(r.airD, 0, 'down without leaving the ground');
  assert.ok(r.gaps.length >= 3 && r.gaps.every((g) => Math.abs(g - 2.5) <= 0.1), `a snowball every 2.5 s: ${r.gaps}`);
  assert.ok(r.maxSlope <= 4 + 1e-6 && r.maxSlope > 3, `down a slope at up to 4 tiles/s (${r.maxSlope})`);
  assert.ok(r.maxFlat <= 3 + 1e-6, `on the flat at up to 3 (${r.maxFlat})`);
  assert.ok(r.shattered >= 3, 'snowballs shatter');
  assert.equal(r.hurt, true, 'a snowball hurts and is not stomped');
  assert.ok(r.piles >= 3, `${r.piles} snow piles`);
  assert.ok(r.ledges >= 10, `${r.ledges} small ledges over pits`);
  assert.ok(r.iceLedges >= 5, `${r.iceLedges} ice ledges at least 2 long`);
  await context.close();
});

test('pixel-leap AC-36: Sea: you float, each tap a stroke, a stroke near the surface leaps out onto a ledge; currents carry you; fish hurt', async () => {
  const { context, page } = await open();
  await play(page, W.sea, 0);
  const r = await page.evaluate(() => {
    const L = window.__leap;
    const st = L.stage();
    const p = L.player;
    // The deepest water column.
    let c = 0;
    for (let x = 0; x < st.cols; x++) if (Number.isFinite(st.water[x]) && st.ground[x] < st.rows && (!c || st.ground[x] - st.water[x] > st.ground[c] - st.water[c])) c = x;
    // Find a stretch with no current and no fish nearby.
    const clear = (x) => !st.things.some((t) => (t.type === 'current' && x > t.x - 1 && x < t.x + t.w + 1) || (t.type === 'fish' && Math.abs(t.sx - x) < 8));
    for (let x = 0; x < st.cols; x++) if (Number.isFinite(st.water[x]) && st.ground[x] - st.water[x] >= 5 && clear(x)) {
      c = x;
      break;
    }
    const surf = st.water[c];
    const floor = st.ground[c];
    const put = (y) => Object.assign(p, { x: c + 0.5, y, vx: 0, vy: 0, ground: false, invul: 99, poof: 0 });
    const keys = (...k) => {
      L.input.keys.clear();
      for (const x of k) L.input.keys.add(x);
      L.sync();
    };
    // Sinking, pressing nothing.
    put(floor - 1.5);
    keys();
    let sink = 0;
    for (let i = 0; i < 120; i++) {
      L.step();
      sink = Math.max(sink, p.vy);
    }
    // One tap: its lift.
    const lift = (hold) => {
      put(floor - 0.2);
      p.ground = true;
      keys();
      L.step();
      const y0 = p.y;
      keys('jump');
      let top = y0;
      for (let i = 0; i < 180; i++) {
        if (!hold && i === 6) keys();
        L.step();
        top = Math.min(top, p.y);
      }
      keys();
      return y0 - top;
    };
    const tap = lift(false);
    const held = lift(true);
    // Two taps closer than 0.25 s count once.
    put(floor - 0.2);
    p.ground = true;
    keys();
    L.step();
    const y1 = p.y;
    keys('jump');
    L.step();
    keys();
    for (let i = 0; i < 6; i++) L.step();
    keys('jump');
    let top2 = y1;
    for (let i = 0; i < 180; i++) {
      if (i === 4) keys();
      L.step();
      top2 = Math.min(top2, p.y);
    }
    const twoQuick = y1 - top2;
    // Sideways.
    put(floor - 2);
    keys('right');
    let side = 0;
    for (let i = 0; i < 120; i++) {
      L.step();
      side = Math.max(side, Math.abs(p.vx));
    }
    keys();
    // A leap out: by a ledge 2 tiles above the water (the next dry land, its top within 2 of the surface).
    let edge = -1;
    for (let x = c; x < st.cols; x++) if (!Number.isFinite(st.water[x]) && st.ground[x] < st.rows) {
      edge = x;
      break;
    }
    const ledgeUp = surf - st.ground[edge];
    Object.assign(p, { x: edge - 0.6, y: surf + 1.3 + 0.3, vx: 0, vy: 0, ground: false, invul: 99 });
    p.lastStroke = -9;
    keys('jump', 'right');
    for (let i = 0; i < 4; i++) L.step();
    keys('right');
    for (let i = 0; i < 120 && !(p.ground && !L.inWater()); i++) L.step();
    keys();
    const leapt = { ground: p.ground, dry: !L.inWater(), y: p.y, ledge: st.ground[edge], ledgeUp };
    // A current, pressing nothing: carried its way at 3 tiles/s.
    const cur = st.things.find((t) => t.type === 'current' && t.cx);
    Object.assign(p, { x: cur.x + 1, y: cur.y + cur.h / 2 + 0.65, vx: 0, vy: 0, ground: false, invul: 99 });
    p.lastStroke = -9;
    const x0 = p.x;
    let n = 0;
    for (let i = 0; i < 60; i++) {
      p.vy = 0;
      L.step();
      n++;
    }
    const carried = (p.x - x0) / (n / 120);
    // A fish hurts at a touch, from above too.
    const fish = st.things.find((t) => t.type === 'fish');
    L.game.shields = 1;
    Object.assign(p, { x: fish.x, y: fish.y - 0.8, vx: 0, vy: 2, ground: false, invul: 0, poof: 0 });
    L.step();
    const fishHurt = L.game.shields === 0;
    const start = st.water[Math.floor(st.start.x)];
    return { sink, tap, held, twoQuick, side, leapt, carried, dir: cur.cx, currents: st.things.filter((t) => t.type === 'current').length, fishHurt, dryStart: !Number.isFinite(start) };
  });
  assert.ok(r.sink <= 1.5 + 1e-6, `sinks at most 1.5 tiles/s (${r.sink})`);
  assert.ok(r.tap >= 1.5 && r.tap <= 2.5, `a tap lifts ${r.tap.toFixed(2)} tiles`);
  assert.ok(r.held <= r.tap + 0.05, `holding lifts no further (${r.held.toFixed(2)})`);
  assert.ok(r.twoQuick <= r.tap + 0.05, `two taps 0.06 s apart count once (${r.twoQuick.toFixed(2)})`);
  assert.ok(r.side <= 4 + 1e-6 && r.side > 3, `swims sideways at up to 4 (${r.side})`);
  assert.ok(r.leapt.ledgeUp >= 0.9 && r.leapt.ledgeUp <= 2, `the land is ${r.leapt.ledgeUp} tiles above the water`);
  assert.deepEqual([r.leapt.ground, r.leapt.dry, r.leapt.y], [true, true, r.leapt.ledge], 'a stroke at the surface leaps out onto the land');
  assert.ok(Math.abs(Math.abs(r.carried) - 3) <= 0.3 && Math.sign(r.carried) === r.dir, `a current carries ${r.carried.toFixed(2)} tiles/s its way`);
  assert.ok(r.currents >= 3, `${r.currents} currents`);
  assert.equal(r.fishHurt, true, 'a fish hurts, from above too');
  assert.equal(r.dryStart, true, 'Sea starts on dry land');
  // A leap out onto a ledge exactly 2 tiles above the water: a level built for the check.
  const two = await page.evaluate(() => {
    const L = window.__leap;
    const st = L.stage();
    const p = L.player;
    // Raise the land past the first bay by one tile, so it stands 2 tiles above the surface.
    let edge = -1;
    let c = 0;
    for (let x = 0; x < st.cols; x++) if (Number.isFinite(st.water[x])) {
      c = x;
      break;
    }
    for (let x = c; x < st.cols; x++) if (!Number.isFinite(st.water[x]) && st.ground[x] < st.rows) {
      edge = x;
      break;
    }
    const surf = st.water[c];
    for (let x = edge; x < edge + 4; x++) {
      const top = surf - 2;
      st.grid[(top) * st.cols + x] = L.T.GROUND;
      st.ground[x] = top;
    }
    Object.assign(p, { x: edge - 0.6, y: surf + 1.3 + 0.4, vx: 0, vy: 0, ground: false, invul: 99 });
    p.lastStroke = -9;
    L.input.keys.clear();
    L.input.keys.add('jump');
    L.input.keys.add('right');
    L.sync();
    for (let i = 0; i < 4; i++) L.step();
    L.input.keys.delete('jump');
    L.sync();
    for (let i = 0; i < 120 && !(p.ground && !L.inWater()); i++) L.step();
    L.input.keys.clear();
    L.sync();
    return { ground: p.ground, y: p.y, want: surf - 2 };
  });
  assert.deepEqual([two.ground, two.y], [true, two.want], 'onto a ledge 2 tiles above the water');
  await context.close();
});

test('pixel-leap AC-37: Ink is dark outside a circle of light, in its two colours, with glimmers where hazards hide; the glimpse of Castle is lit', async () => {
  const { context, page } = await open(PHONE);
  await play(page, W.ink, 0);
  const r = await page.evaluate(() => {
    const L = window.__leap;
    const st = L.stage();
    const w = L.WORLDS[L.game.world];
    const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)).join(',');
    const two = new Set([hex(w.oneBit.ink), hex(w.oneBit.dark)]);
    // Somewhere in the middle, away from lamps.
    const lamps = st.things.filter((t) => t.type === 'lamp');
    let x = 60;
    for (let c = 40; c < st.next - 20; c++) if (st.ground[c] < st.rows && lamps.every((l) => Math.abs(l.x - c) > 14)) {
      x = c + 0.5;
      break;
    }
    Object.assign(L.player, { x, y: st.ground[Math.floor(x)], vx: 0, vy: 0, ground: true, invul: 0 });
    L.cam.x = x - L.view.tilesW / 2;
    L.cam.y = L.player.y - L.view.tilesH * 0.62;
    L.clearParticles();
    L.render();
    const c = document.getElementById('view');
    const U = L.view.U;
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    const px = (L.player.x - L.cam.x) * U;
    const py = (L.player.y - 0.65 - L.cam.y) * U;
    // The places a glimmer may be, in canvas pixels.
    const marks = [];
    for (const t of st.things) {
      if (t.type === 'walker' || t.type === 'drip' || t.type === 'lamp' || t.type === 'portal') marks.push([t.x, t.y - 0.5]);
    }
    for (let cx = 0; cx < st.cols; cx++) {
      const gy = st.ground[cx];
      if (gy < st.rows && (st.ground[cx - 1] >= st.rows || st.ground[cx + 1] >= st.rows)) marks.push([cx + 0.5, gy]);
      for (let y = 0; y < st.rows; y++) {
        const k = L.tileAt(cx, y);
        if (k === L.T.SPIKES || ((k === L.T.ONEWAY || k === L.T.BLOCK) && (L.tileAt(cx - 1, y) === 0 || L.tileAt(cx + 1, y) === 0))) marks.push([cx + 0.5, y + 0.5]);
      }
    }
    const near = (gx, gy) => marks.some(([mx, my]) => Math.abs(mx - gx) < 1 && Math.abs(my - gy) < 1);
    let off = 0;
    let darkBad = 0;
    let litLevel = 0;
    let litPx = 0;
    const where = [];
    for (let y = 0; y < c.height; y += 3) {
      for (let x2 = 0; x2 < c.width; x2 += 3) {
        const i = (y * c.width + x2) * 4;
        const k = `${d[i]},${d[i + 1]},${d[i + 2]}`;
        if (!two.has(k)) off++;
        const dist = Math.hypot(x2 - px, y - py) / U;
        const gx = L.cam.x + x2 / U;
        const gy = L.cam.y + y / U;
        if (gx >= st.next) continue; // the glimpse, lit
        const farFromLamps = lamps.every((l) => Math.hypot(l.x - gx, l.y - 2.2 - gy) > 3.2);
        if (dist > 5.6 && farFromLamps && k !== hex(w.oneBit.dark) && !near(gx, gy)) {
          darkBad++;
          if (where.length < 5) where.push([+gx.toFixed(1), +gy.toFixed(1)]);
        }
        if (dist < 4.4) {
          litPx++;
          if (k === hex(w.oneBit.ink)) litLevel++;
        }
      }
    }
    // The glimpse of Castle at the end, and the door: drawn lit, smooth.
    const po = st.things.find((t) => t.type === 'portal');
    Object.assign(L.player, { x: st.next - 3, y: st.ground[st.next - 3] });
    L.cam.x = st.next - 2;
    L.render();
    const d2 = c.getContext('2d').getImageData(Math.round((po.x - L.cam.x) * U) - U, Math.round((po.y - 2 - L.cam.y) * U), 2 * U, 2 * U).data;
    let bright = 0;
    for (let i = 0; i < d2.length; i += 4) if (d2[i] + d2[i + 1] + d2[i + 2] > 300) bright++;
    // Each hazard draws a glimmer in the dark: count ink pixels around each ghost far from the light.
    const ghost = st.things.find((t) => t.kind === 'ghost' && Math.abs(t.x - x) > 7 && Math.abs(t.x - x) < L.view.tilesW / 2 - 1);
    let ghostGlint = null;
    if (ghost) {
      Object.assign(L.player, { x, y: st.ground[Math.floor(x)] });
      L.cam.x = x - L.view.tilesW / 2;
      L.render();
      const gx0 = Math.round((ghost.x - 0.5 - L.cam.x) * U);
      const gy0 = Math.round((ghost.y - 1.5 - L.cam.y) * U);
      const d3 = c.getContext('2d').getImageData(gx0, gy0, U, U).data;
      ghostGlint = 0;
      for (let i = 0; i < d3.length; i += 4) if (`${d3[i]},${d3[i + 1]},${d3[i + 2]}` === hex(w.oneBit.ink)) ghostGlint++;
    }
    return { off, darkBad, where, litLevel, litPx, bright, ghostGlint };
  });
  assert.equal(r.off, 0, 'every pixel is one of Ink’s two colours');
  assert.equal(r.darkBad, 0, `dark beyond 5.5 tiles, but for glimmers (${JSON.stringify(r.where)})`);
  assert.ok(r.litLevel > 20, `the level shows inside the light (${r.litLevel} of ${r.litPx} ink pixels)`);
  assert.ok(r.bright > 50, 'the glimpse of Castle and its door are lit');
  if (r.ghostGlint !== null) assert.ok(r.ghostGlint > 0, 'a ghost in the dark shows its eyes');
  await context.close();
});

test('pixel-leap AC-39: Ice, Sea and Castle draw from their own packs and play the owner’s music; the map shows every world', async () => {
  const { context, page } = await open();
  await goPlay(page, true);
  const r = await page.evaluate(() => {
    const L = window.__leap;
    L.manual = true;
    const used = new Set();
    const orig = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function (img, ...rest) {
      if (img && img.src) used.add(img.src.split('/').pop());
      return orig.call(this, img, ...rest);
    };
    const out = {};
    for (const id of ['ice', 'sea', 'castle']) {
      const w = L.WORLDS.findIndex((x) => x.id === id);
      L.startWorld(w - 1);
      L.game.mode = 'play';
      const po = L.stage().things.find((t) => t.type === 'portal');
      Object.assign(L.player, { x: po.x, y: po.y, invul: 0 });
      L.step();
      const map = L.game.mode === 'map' ? L.mapLayout().nodes.length - 2 : null; // the start and the summit aside
      for (let i = 0; i < 1000 && L.game.mode !== 'play'; i++) L.step();
      const loops = L.heard.filter((x) => x.startsWith('loop:'));
      used.clear();
      const st = L.stage();
      Object.assign(L.player, { x: 10, y: st.ground[10] });
      L.cam.x = 4;
      L.cam.y = st.ground[10] - L.view.tilesH * 0.62;
      L.render();
      out[id] = { world: L.game.world === w, loop: loops[loops.length - 1], images: [...used], map };
    }
    CanvasRenderingContext2D.prototype.drawImage = orig;
    return out;
  });
  assert.equal(r.ice.loop, 'loop:ice-bed', 'Ice plays the owner’s Frost music');
  assert.equal(r.sea.loop, 'loop:sea-bed', 'the owner’s bed for Sea');
  assert.equal(r.castle.loop, 'loop:castle-bed', 'the owner’s bed for Castle');
  assert.ok(r.ice.images.includes('ice.png'), `Ice draws its pack (${r.ice.images})`);
  assert.ok(r.sea.images.includes('sea.png'), 'Sea draws its pack');
  assert.ok(r.castle.images.includes('castle.png'), 'Castle draws its pack');
  for (const id of Object.keys(r)) {
    assert.equal(r[id].world, true);
    assert.equal(r[id].map, 12, 'the map shows every world');
  }
  await context.close();
});

// ---------------------------------------------------------------- batch 4: Scribble, Sky and the journey's end

// A pixel's distance from grey (paper white, pen black or a grey between them).
const GREYISH = `(d, i) => Math.max(d[i], d[i + 1], d[i + 2]) - Math.min(d[i], d[i + 1], d[i + 2]) <= 24`;

test('pixel-leap AC-40: Scribble is drawn smooth at 70 in line art: the monster and slimes in grey pen, the line boils, and the crossing from Castle is a pen trace with a scratch', async () => {
  const { context, page, errors } = await open();
  await play(page, W.scribble, 0);
  const r = await page.evaluate((GREY) => {
    const L = window.__leap;
    const grey = eval(GREY);
    L.render();
    const allGrey = (c) => {
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let n = 0;
      let bad = 0;
      for (let i = 0; i < d.length; i += 4) {
        if (!d[i + 3]) continue;
        n++;
        if (!grey(d, i)) bad++;
      }
      return { n, bad };
    };
    const frames = ['stand0', 'run1', 'rise', 'fall', 'land'].map((p) => allGrey(L.lineArtFrame(p, 0)));
    const slimes = [0, 1, 3, 4].map((c) => allGrey(L.lineSlime(c, 0)));
    // The line boils: the wobble in use changes within 1/8 s, and two wobbles differ.
    const b0 = L.boilNow();
    L.steps(15);
    const b1 = L.boilNow();
    const a = L.lineArtFrame('stand0', 0).getContext('2d').getImageData(0, 0, 50, 50);
    const f0 = L.lineArtFrame('stand0', 0);
    const f1 = L.lineArtFrame('stand0', 1);
    const d0 = f0.getContext('2d').getImageData(0, 0, f0.width, f0.height).data;
    const d1 = f1.getContext('2d').getImageData(0, 0, f1.width, f1.height).data;
    let differ = 0;
    for (let i = 3; i < d0.length; i += 4) if (d0[i - 3] !== d1[i - 3]) differ++;
    void a;
    return { res: L.renderRes(), frames, slimes, boils: [b0, b1], differ };
  }, GREYISH);
  assert.equal(r.res, 70, 'drawn at 70 px per tile');
  for (const f of r.frames) assert.ok(f.n > 500 && f.bad === 0, `the monster's line art is all grey (${JSON.stringify(f)})`);
  for (const f of r.slimes) assert.ok(f.n > 500 && f.bad === 0, `a slime's line art is all grey (${JSON.stringify(f)})`);
  assert.notEqual(r.boils[0], r.boils[1], 'the wobble changes within 1/8 s');
  assert.ok(r.differ > 50, `two wobbles differ (${r.differ} pixels)`);
  // From Castle into Scribble's glimpse: the scratch, and the monster part-traced before whole.
  const x = await page.evaluate(() => {
    const L = window.__leap;
    L.startWorld(9);
    L.game.mode = 'play';
    const st = L.stage();
    Object.assign(L.player, { x: st.next - 1.2, y: st.ground[st.next - 2], vx: 0, vy: 0, invul: 0 });
    L.cam.x = L.player.x - L.view.tilesW / 2;
    L.game.shields = 2;
    const heard = L.heard.length;
    L.input.keys.add('right');
    L.sync();
    const traces = [];
    for (let i = 0; i < 120 && L.player.x < st.next + 3; i++) {
      L.step();
      L.render();
      traces.push(L.game.morphTrace || 0);
    }
    L.input.keys.clear();
    L.sync();
    for (let i = 0; i < 60; i++) {
      L.step();
      L.render();
      traces.push(L.game.morphTrace || 0);
    }
    return { sounds: L.heard.slice(heard), part: traces.some((k) => k > 0.1 && k < 0.9), whole: traces[traces.length - 1] };
  });
  assert.ok(x.sounds.includes('scratch'), 'the pen scratches');
  assert.equal(x.part, true, 'drawn part-traced on the way');
  assert.equal(x.whole, 0, 'then whole');
  assert.deepEqual(errors, []);
  await context.close();
});

test('pixel-leap AC-41: a sketch tile draws itself in within 3 tiles across and 5 up or down, solid 0.3 s later, never round the monster; a life lost undraws it; running over a sketch bridge never falls; ticks mark undrawn runs', async () => {
  const { context, page, errors } = await open();
  await play(page, W.scribble, 0);
  const r = await page.evaluate(() => {
    const L = window.__leap;
    const st = L.stage();
    const p = L.player;
    // The first sketch run over a real pit at the ground line (a bridge).
    const bridge = st.sketches.find((k) => st.ground[k.x] >= st.rows && k.y === st.base);
    const k = bridge;
    const stand = (x, y) => Object.assign(p, { x, y, vx: 0, vy: 0, ground: true, poof: 0, invul: 9 });
    // Far off: nothing drawn.
    stand(k.x - 6, st.base);
    L.step();
    const far = [k.state, L.tileAt(k.x, k.y)];
    // 3.05 tiles from its nearest edge (middle to edge): still not drawn.
    stand(k.x - 3.05, st.base);
    L.step();
    const out3 = k.state;
    // Within 3: drawing; solid 0.3 s later.
    stand(k.x - 2.95, st.base);
    let t = 0;
    while (L.tileAt(k.x, k.y) !== L.T.SKETCH && t < 1) {
      L.step();
      t += 1 / 120;
    }
    const solidAt = t;
    // Up or down: more than 5 from it, nothing; within 5, drawn.
    const k2 = st.sketches.find((q) => q.state === 'undrawn' && q.y < st.base - 1);
    stand(k2.x + 0.5, k2.y + 6.6); // its middle 5.1 below the tile's bottom edge... in the air
    p.ground = false;
    const before = k2.state;
    L.game.mode = 'play';
    // Hold it in place: step the sketches only by stepping with the monster pinned.
    for (let i = 0; i < 3; i++) {
      Object.assign(p, { x: k2.x + 0.5, y: k2.y + 1 + 0.65 + 5.1, vx: 0, vy: 0 });
      L.step();
    }
    const below51 = k2.state;
    // Overlapping a tile as it draws: it isn't solid until the monster is clear of it.
    const k3 = st.sketches.find((q) => q.state === 'undrawn' && q !== k2);
    for (let i = 0; i < 60; i++) {
      Object.assign(p, { x: k3.x + 0.5, y: k3.y + 1, vx: 0, vy: 0, ground: false, invul: 9 });
      L.step();
    }
    const over = [k3.state, L.tileAt(k3.x, k3.y)];
    stand(k3.x + 0.5, k3.y - 2);
    p.ground = false;
    L.step();
    const clear = L.tileAt(k3.x, k3.y);
    // A life lost undraws the level's sketch tiles.
    L.game.lives = 5;
    L.loseLife();
    for (let i = 0; i < 120 && L.player.poof > 0; i++) L.step();
    const st2 = L.stage();
    const undrawn = st2.sketches.every((q) => q.state === 'undrawn') && st2.sketches.every((q) => L.tileAt(q.x, q.y) === L.T.AIR);
    // Running at top speed along the bridge: never falls.
    const b2 = st2.sketches.find((q) => q.x === k.x && q.y === k.y);
    const run = st2.sketches.filter((q) => q.run === b2.run);
    const x1 = Math.max(...run.map((q) => q.x)) + 1;
    Object.assign(L.player, { x: b2.x - 5, y: st2.base, vx: L.MOVE.top, vy: 0, ground: true, invul: 9, poof: 0 });
    L.input.keys.clear();
    L.input.keys.add('right');
    L.sync();
    let lowest = 0;
    for (let i = 0; i < 240 && L.player.x < x1 + 1; i++) {
      L.step();
      lowest = Math.max(lowest, L.player.y - st2.base);
    }
    L.input.keys.clear();
    L.sync();
    return { far, out3, solidAt, before, below51, over, clear, undrawn, lowest };
  });
  assert.deepEqual(r.far, ['undrawn', 0], 'not drawn, not solid, far off');
  assert.equal(r.out3, 'undrawn', 'not drawn at 3.05 tiles');
  assert.ok(Math.abs(r.solidAt - 0.3) <= 0.05, `solid ${r.solidAt.toFixed(3)} s after it starts`);
  assert.equal(r.below51, 'undrawn', 'not drawn 5.1 tiles below it');
  assert.equal(r.over[1], 0, `not solid round the monster (${r.over})`);
  assert.equal(r.clear, 12, 'solid once the monster is clear of it');
  assert.equal(r.undrawn, true, 'a life lost undraws them');
  assert.ok(r.lowest < 0.05, `running over the bridge never falls (${r.lowest})`);
  // Pencil ticks at an undrawn run's ends.
  const ticks = await page.evaluate(() => {
    const L = window.__leap;
    L.startWorld(10);
    L.game.mode = 'play';
    const st = L.stage();
    const k = st.sketches.find((q) => !q.guide && st.ground[q.x] >= st.rows);
    const run = st.sketches.filter((q) => q.run === k.run);
    const x0 = Math.min(...run.map((q) => q.x));
    Object.assign(L.player, { x: x0 - 6, y: st.base, vx: 0, vy: 0 });
    L.cam.x = x0 - L.view.tilesW / 2;
    L.cam.y = st.base - L.view.tilesH * 0.62;
    L.render();
    const c = document.getElementById('view');
    const U = L.view.U;
    const px = Math.round((x0 - L.cam.x) * U);
    const py = Math.round((k.y - L.cam.y) * U);
    const d = c.getContext('2d').getImageData(px - U * 0.15, py - U * 0.3, U * 0.5, U * 0.8).data;
    let pencil = 0;
    for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i] - 0xa2) < 30 && Math.abs(d[i + 1] - 0x9c) < 30 && Math.abs(d[i + 2] - 0x8f) < 30) pencil++;
    return pencil;
  });
  assert.ok(ticks > 10, `pencil ticks at the run's end (${ticks} pencil pixels)`);
  assert.deepEqual(errors, []);
  await context.close();
});

test('pixel-leap AC-42: Scribble is built on trust: sketch runs over pits too wide to jump, none near the start, no bad guy on one, and a scripted run that jumps before the ground is there', async () => {
  const { context, page } = await open();
  await page.click('[data-go]');
  const r = await page.evaluate((BOT) => {
    const L = window.__leap;
    const bot = eval(BOT);
    L.manual = true;
    L.game.mode = 'play';
    L.game.lives = 99;
    L.startWorld(10);
    const st = L.stage();
    const runs = new Map();
    for (const k of st.sketches) runs.set(k.run, [...(runs.get(k.run) || []), k]);
    // Pits (columns with no ground) and how wide each is.
    const pitW = (x) => {
      if (st.ground[x] < st.rows) return 0;
      let a = x;
      let b = x;
      while (a > 0 && st.ground[a - 1] >= st.rows) a--;
      while (b < st.cols - 1 && st.ground[b + 1] >= st.rows) b++;
      return b - a + 1;
    };
    const widePits = new Set();
    for (const list of runs.values()) for (const k of list) if (pitW(k.x) > 9.4) widePits.add(k.x - (k.x - 1)); // counted per run below
    let overWide = 0;
    for (const list of runs.values()) if (list.some((k) => pitW(k.x) > 9.4)) overWide++;
    const near = st.sketches.filter((k) => k.x - st.start.x < 7).length;
    const walkersOn = st.things.filter((e) => e.type === 'walker' && st.sketches.some((k) => k.x === Math.floor(e.sx) && k.y === Math.round(e.sy))).length;
    // A walker by a drawn sketch run turns back at it.
    const k = st.sketches[0];
    for (const q of st.sketches.filter((q) => q.run === k.run)) {
      q.state = 'solid';
      st.grid[q.y * st.cols + q.x] = L.T.SKETCH;
    }
    const w0 = st.things.find((e) => e.type === 'walker');
    Object.assign(w0, { x: k.x - 1.5, y: k.y, dir: 1, alive: true });
    Object.assign(L.player, { x: k.x - 20, y: st.base, invul: 9 });
    const turns = [];
    for (let i = 0; i < 240; i++) {
      L.step();
      turns.push(w0.x);
    }
    const reached = Math.max(...turns);
    L.startWorld(10);
    const run = bot({ limit: 150, ride: true });
    return { tiles: st.sketches.length, runs: runs.size, overWide, near, walkersOn, reached, kx: k.x, run };
  }, BOT);
  assert.ok(r.tiles >= 30, `${r.tiles} sketch tiles`);
  assert.ok(r.runs >= 8, `${r.runs} sketch runs`);
  assert.ok(r.overWide >= 3, `${r.overWide} runs over pits too wide to jump`);
  assert.equal(r.near, 0, 'no sketch tile near the start');
  assert.equal(r.walkersOn, 0, 'no bad guy stands on a sketch tile');
  assert.ok(r.reached < r.kx + 0.1, `a slime turns back at a sketch run (${r.reached} vs ${r.kx})`);
  assert.equal(r.run.end, 'map', `the scripted player finishes Scribble (${JSON.stringify(r.run)})`);
  assert.ok(r.run.trust >= 5, `${r.run.trust} jumps leave the ground before the tile they land on is drawn`);
  await context.close();
});

// Sky: a monster dropped onto a ledge, measured from the ledge's top to its feet at the top of the
// bounce. press: seconds before landing a jump is pressed (null: none); hold: kept held throughout.
const SKY_BOUNCE = `(o) => {
  const L = window.__leap;
  const st = L.stage();
  const p = L.player;
  // A grass ledge from the opening.
  let ly = -1;
  let lx = -1;
  for (let y = st.base - 1; y > 0 && ly < 0; y--) for (let x = 1; x < st.cols - 1; x++) if (L.tileAt(x, y) === L.T.ONEWAY && L.tileAt(x + 1, y) === L.T.ONEWAY && L.tileAt(x - 1, y) === L.T.ONEWAY) { ly = y; lx = x; break; }
  L.game.assist = o.assist || 0;
  L.input.keys.clear();
  if (o.hold) L.input.keys.add('jump');
  L.sync();
  p.pressAt = -9;
  // Dropped from rest at a height whose fall takes o.fall s (default 0.3: 1.7 tiles, under the
  // ledge above it).
  const fall = o.fall || 0.3;
  Object.assign(p, { x: lx + 0.5, y: ly - 0.5 * L.MOVE.gravity * fall * fall, vx: 0, vy: 0, ground: false, invul: 9, poof: 0 });
  let t = 0;
  let pressed = false;
  let landed = false;
  let top = Infinity;
  let pressDone = false;
  for (let i = 0; i < 360; i++) {
    if (o.press != null && !pressed && t >= fall - o.press - 1e-9) {
      L.input.keys.add('jump');
      L.sync();
      pressed = true;
    }
    if (o.release && pressed && !pressDone && t >= fall - o.press + 0.04) {
      L.input.keys.delete('jump');
      L.sync();
      pressDone = true;
    }
    L.step();
    t += 1 / 120;
    if (!landed && p.vy < 0) landed = true;
    if (landed) top = Math.min(top, p.y);
    if (landed && p.vy > 0) break;
  }
  L.input.keys.clear();
  L.sync();
  L.game.assist = 0;
  return { h: ly - top, ly, lx };
}`;

test('pixel-leap AC-43: Sky bounces on every ledge, 3.3 tiles, or 5 with a fresh press just before landing; nothing else changes the bounce', async () => {
  const { context, page, errors } = await open({ viewport: { width: 1024, height: 700 } });
  await play(page, W.sky, 0);
  const run = (o) => page.evaluate(([B, o]) => eval(B)(o), [SKY_BOUNCE, o]);
  const plain = await run({});
  assert.ok(Math.abs(plain.h - 3.3) <= 0.2, `a plain bounce: ${plain.h.toFixed(2)} tiles`);
  const press = await run({ press: 0.08 });
  assert.ok(Math.abs(press.h - 5) <= 0.2, `a press just before landing: ${press.h.toFixed(2)} tiles`);
  const tap = await run({ press: 0.08, release: true });
  assert.ok(Math.abs(tap.h - 5) <= 0.2, `the same, let go before the top: ${tap.h.toFixed(2)} tiles`);
  const held = await run({ hold: true });
  assert.ok(Math.abs(held.h - 3.3) <= 0.2, `held through the landing, no fresh press: ${held.h.toFixed(2)} tiles`);
  const early = await run({ press: 0.2, fall: 0.4 });
  assert.ok(Math.abs(early.h - 3.3) <= 0.2, `a press 0.2 s before landing: ${early.h.toFixed(2)} tiles`);
  const assisted = await run({ press: 0.2, assist: 1, fall: 0.4 });
  assert.ok(Math.abs(assisted.h - 3.3) <= 0.2, `with the hidden assist at its most: ${assisted.h.toFixed(2)} tiles`);
  const r = await page.evaluate(() => {
    const L = window.__leap;
    const st = L.stage();
    const p = L.player;
    // A press in the air does nothing.
    Object.assign(p, { x: 6.5, y: st.base - 6, vx: 0, vy: -4, ground: false, invul: 9 });
    L.step();
    const vy0 = p.vy;
    L.input.keys.add('jump');
    L.sync();
    L.step();
    const air = p.vy - vy0;
    L.input.keys.clear();
    L.sync();
    // The start's ground doesn't bounce (the press above, buffered, would be a jump there: cleared).
    Object.assign(p, { x: 6.5, y: st.base - 0.3, vx: 0, vy: 3, ground: false, buffer: 0, pressAt: -9 });
    for (let i = 0; i < 60; i++) L.step();
    const start = [p.ground, Math.abs(p.y - st.base) < 0.01];
    // Nor does the plateau at the top.
    Object.assign(p, { x: 3.5, y: st.top - 0.3, vx: 0, vy: 3, ground: false });
    for (let i = 0; i < 60; i++) L.step();
    const plateau = [p.ground, Math.abs(p.y - st.top) < 0.01];
    // Up through a ledge from below, and onto it from above.
    let ly = -1;
    let lx = -1;
    for (let y = st.base - 1; y > 0 && ly < 0; y--) for (let x = 1; x < st.cols - 1; x++) if (L.tileAt(x, y) === L.T.ONEWAY) { ly = y; lx = x; break; }
    Object.assign(p, { x: lx + 0.5, y: ly + 1.6, vx: 0, vy: -14, ground: false });
    let through = false;
    for (let i = 0; i < 60; i++) {
      L.step();
      if (p.y < ly - 0.2) through = true;
    }
    // A bounce off a sliding ledge keeps its sideways motion.
    const m = st.things.find((t) => t.type === 'mover');
    L.steps(30);
    Object.assign(p, { x: m.x + 1.5, y: m.y - 0.3, vx: 0, vy: 2, ground: false });
    let carry = null;
    for (let i = 0; i < 30 && carry === null; i++) {
      L.step();
      if (p.vy < -10) carry = [p.carry, m.vx];
    }
    // Top speed sideways.
    Object.assign(p, { x: 3, y: st.base, vx: 0, vy: 0, ground: true });
    L.input.keys.add('right');
    L.sync();
    let top = 0;
    for (let i = 0; i < 90; i++) {
      L.step();
      top = Math.max(top, Math.abs(p.vx));
    }
    L.input.keys.clear();
    L.sync();
    return { air, start, plateau, through, carry, top };
  });
  assert.ok(Math.abs(r.air) < 1, 'a press in the air does nothing');
  assert.deepEqual(r.start, [true, true], "the start's ground doesn't bounce");
  assert.deepEqual(r.plateau, [true, true], "the plateau doesn't bounce");
  assert.equal(r.through, true, 'up through a ledge from below');
  assert.ok(r.carry && Math.abs(r.carry[0] - r.carry[1]) < 0.01 && r.carry[0] !== 0, `a sliding ledge's motion carries on (${r.carry})`);
  assert.ok(Math.abs(r.top - 6.5) < 0.01, `top speed ${r.top}`);
  assert.deepEqual(errors, []);
  await context.close();
});

test('pixel-leap AC-44: Sky has cracked ledges, springs, wings, flyers and spikies; its camera only climbs; falling out of view costs a life', async () => {
  const { context, page, errors } = await open({ viewport: { width: 1024, height: 700 } });
  await play(page, W.sky, 0);
  const r = await page.evaluate(() => {
    const L = window.__leap;
    const st = L.stage();
    const p = L.player;
    const count = (f) => st.things.filter(f).length;
    const counts = {
      sliding: count((t) => t.type === 'mover'),
      cracked: count((t) => t.type === 'cracked'),
      springs: count((t) => t.type === 'spring'),
      wings: count((t) => t.type === 'wings'),
      flyers: count((t) => t.type === 'flyer'),
      spikies: count((t) => t.type === 'walker' && t.kind === 'spiky'),
    };
    const door = st.things.find((t) => t.type === 'portal');
    const height = st.start.y - door.y;
    L.game.lives = 9;
    // A cracked ledge: one bounce, then it's gone.
    const c = st.things.find((t) => t.type === 'cracked');
    Object.assign(p, { x: c.x + c.w / 2, y: c.y - 0.3, vx: 0, vy: 2, ground: false, invul: 9 });
    for (let i = 0; i < 20 && p.vy >= 0; i++) L.step();
    const bounced = p.vy < -10;
    L.steps(40);
    Object.assign(p, { x: c.sx + c.w / 2, y: c.sy - 0.3, vx: 0, vy: 2, ground: false });
    L.steps(30);
    const gone = p.y > c.sy + 0.5;
    // Each check on a fresh copy of the level (a broken ledge raises the view's floor).
    const fresh = () => {
      L.loadStage(11, 0);
      L.game.lives = 9;
      return L.stage();
    };
    // A spring: the feet 9.5 tiles up or more.
    const s = fresh().things.find((t) => t.type === 'spring');
    Object.assign(p, { x: s.x, y: s.y - 1.2, vx: 0, vy: 3, ground: false });
    let top = Infinity;
    for (let i = 0; i < 240; i++) {
      L.step();
      top = Math.min(top, p.y);
      if (p.vy > 0 && top < s.y - 3) break;
    }
    const spring = s.y - top;
    // Wings: 15 tiles up over 2 s.
    const w = fresh().things.find((t) => t.type === 'wings');
    Object.assign(p, { x: w.x, y: w.y - 0.2, vx: 0, vy: 0, ground: false });
    L.step();
    const y0 = p.y;
    let wingsT = 0;
    while (L.game.wingsT > 0 && wingsT < 3) {
      L.step();
      wingsT += 1 / 120;
    }
    const wings = [y0 - p.y, wingsT];
    // A flyer stomped from above bounces you; one touched from the side hurts.
    const fl = fresh().things.filter((t) => t.type === 'flyer');
    L.step(); // the flyers take their places on their patrols
    Object.assign(p, { x: fl[0].x, y: fl[0].y - 1.2, vx: 0, vy: 6, ground: false, invul: 0 });
    L.game.shields = 2;
    for (let i = 0; i < 20 && fl[0].alive; i++) L.step();
    const stomp = [fl[0].alive, p.vy < -10, L.game.shields];
    p.invul = 0;
    Object.assign(p, { x: fl[1].x - 0.6, y: fl[1].y, vx: 2, vy: 0, ground: false });
    for (let i = 0; i < 10; i++) {
      Object.assign(p, { x: fl[1].x - 0.6, y: fl[1].y });
      L.step();
    }
    const side = L.game.shields;
    // A spiky hurts from above.
    const sp = fresh().things.find((t) => t.type === 'walker' && t.kind === 'spiky');
    L.game.shields = 2;
    p.invul = 0;
    Object.assign(p, { x: sp.x, y: sp.y - 1.4, vx: 0, vy: 6, ground: false });
    for (let i = 0; i < 20; i++) L.step();
    const spiky = [sp.alive, L.game.shields];
    return { counts, height, bounced, gone, spring, wings, stomp, side, spiky };
  });
  assert.ok(r.counts.sliding >= 3 && r.counts.cracked >= 3 && r.counts.springs >= 2 && r.counts.wings >= 1 && r.counts.flyers >= 4 && r.counts.spikies >= 2, JSON.stringify(r.counts));
  assert.ok(r.height >= 90, `the door is ${r.height} tiles above the start`);
  assert.equal(r.bounced, true, 'a cracked ledge bounces once');
  assert.equal(r.gone, true, 'then it is gone');
  assert.ok(r.spring >= 9.5, `a spring launches ${r.spring.toFixed(1)} tiles`);
  assert.ok(Math.abs(r.wings[0] - 15) <= 1 && Math.abs(r.wings[1] - 2) <= 0.1, `wings: ${r.wings[0].toFixed(1)} tiles over ${r.wings[1].toFixed(2)} s`);
  assert.deepEqual(r.stomp, [false, true, 2], 'a flyer stomped from above, bouncing, no harm');
  assert.equal(r.side, 1, 'a flyer touched from the side hurts');
  assert.deepEqual(r.spiky, [true, 1], 'a spiky hurts from above');
  // The camera: it never moves down; a 5-tile bounce in place at 1024×700 costs nothing; dropping
  // out of the view costs a life, a heart held or not.
  const cam = await page.evaluate(() => {
    const L = window.__leap;
    L.startWorld(11);
    L.game.mode = 'play';
    const st = L.stage();
    const p = L.player;
    L.game.lives = 9;
    // Up onto the ledge at height 10, then bounce on it with a press before every landing.
    let ly = -1;
    let lx = -1;
    for (let x = 1; x < st.cols - 1; x++) if (L.tileAt(x, st.base - 10) === L.T.ONEWAY && L.tileAt(x + 1, st.base - 10) === L.T.ONEWAY) { ly = st.base - 10; lx = x + 1; break; }
    Object.assign(p, { x: lx, y: ly - 0.5, vx: 0, vy: 2, ground: false, invul: 0 });
    let down = 0;
    let last = L.cam.y;
    let high = 0;
    for (let i = 0; i < 600; i++) {
      // Press just before each landing, so every bounce is the 5-tile one.
      const falling = p.vy > 0 && ly - p.y < 0.5;
      if (falling) {
        L.input.keys.add('jump');
      } else L.input.keys.delete('jump');
      L.sync();
      L.step();
      high = Math.max(high, ly - p.y);
      if (L.cam.y > last + 1e-9) down++;
      last = L.cam.y;
      p.x = lx;
    }
    L.input.keys.clear();
    L.sync();
    const livesAfter = L.game.lives;
    // Out of the view: a life, a heart held or not.
    L.game.shields = 2;
    Object.assign(p, { x: lx, y: L.cam.y + L.view.tilesH + 1.5, vx: 0, vy: 3, ground: false, invul: 0 });
    L.step();
    return { down, high, livesAfter, outLife: L.game.lives, shields: L.game.shields };
  });
  assert.equal(cam.down, 0, 'the camera never moves down');
  assert.ok(cam.high > 4.6, `bounced ${cam.high.toFixed(1)} tiles in place`);
  assert.equal(cam.livesAfter, 9, 'a 5-tile bounce in place costs nothing');
  assert.equal(cam.outLife, 8, 'dropping out of the view costs a life');
  assert.equal(cam.shields, 2, 'a heart held doesn’t save you');
  assert.deepEqual(errors, []);
  await context.close();
});

test('pixel-leap AC-45: Sky is laid out so a plain bounce reaches every step, nothing threatens the start or the top of a launch, tracks are clear; the scripted player climbs it with plain bounces', async () => {
  const { context, page } = await open();
  await page.click('[data-go]');
  const r = await page.evaluate((BOT) => {
    const L = window.__leap;
    L.manual = true;
    L.game.mode = 'play';
    L.game.lives = 99;
    L.startWorld(11);
    const st = L.stage();
    const at = (x, y) => L.tileAt(x, y);
    const ledges = [];
    for (let y = 0; y < st.rows; y++) {
      if (y === st.top) continue;
      let x = 1;
      while (x < st.cols - 1) {
        if (at(x, y) === L.T.ONEWAY) {
          let e = x;
          while (at(e + 1, y) === L.T.ONEWAY) e++;
          ledges.push({ y, a: x, b: e + 1 });
          x = e + 1;
        } else x++;
      }
    }
    for (const t of st.things) {
      if (t.type === 'mover') ledges.push({ y: t.y, a: t.x, b: t.x + t.w + t.range });
      if (t.type === 'cracked') ledges.push({ y: t.y, a: t.x, b: t.x + t.w });
    }
    const floor = [...ledges, { y: st.base, a: 1, b: st.cols - 1 }];
    const unreached = [...ledges, { y: st.top, a: 1, b: st.cols - 1 }].filter((l) => !floor.some((o) => o !== l && o.y > l.y && o.y - l.y <= 2.5 && Math.max(0, l.a - o.b, o.a - l.b) <= 3)).map((l) => st.base - l.y);
    const nearStart = st.things.filter((t) => ['walker', 'flyer', 'cracked', 'spring'].includes(t.type) && st.base - t.sy < 7).length;
    const launch = [];
    for (const s of st.things.filter((t) => t.type === 'spring' || t.type === 'wings')) {
      const lift = s.type === 'spring' ? 10 : 15;
      for (const e of st.things.filter((t) => t.type === 'walker' || t.type === 'flyer')) {
        const x0 = e.sx - 0.75;
        const x1 = e.sx + 0.75 + (e.range || 0);
        if (e.sy < s.sy && s.sy - e.sy <= lift + 6 && x1 >= Math.floor(s.sx) - 2 && x0 <= Math.floor(s.sx) + 3) launch.push([s.type, st.base - s.sy, st.base - e.sy]);
      }
    }
    const tracks = [];
    for (const e of st.things.filter((t) => t.type === 'flyer' || t.type === 'mover')) {
      const x0 = Math.floor(e.type === 'flyer' ? e.sx - 0.75 : e.sx);
      const x1 = Math.ceil(e.type === 'flyer' ? e.sx + 0.75 + e.range : e.sx + e.w + e.range) - 1;
      const ys = e.type === 'flyer' ? [Math.floor(e.sy - 1.1), Math.floor(e.sy - 0.01)] : [Math.floor(e.sy), Math.floor(e.sy)];
      for (let x = x0; x <= x1; x++) for (let y = ys[0]; y <= ys[1]; y++) if (at(x, y) !== L.T.AIR) tracks.push([e.type, st.base - e.sy, x]);
      if (x0 < 1 || x1 > st.cols - 2) tracks.push(['walls', e.type, st.base - e.sy]);
    }
    // The scripted player: plain bounces only (no press on a ledge), never ears.
    let presses = 0;
    const orig = L.sync;
    const onLedge = () => L.player.y < st.base - 0.5 && L.player.y > st.top + 0.5;
    L.game.ears = false;
    const run = eval(BOT)({ limit: 150, ride: true });
    void orig;
    void onLedge;
    return { unreached, nearStart, launch, tracks, run, presses };
  }, BOT);
  assert.deepEqual(r.unreached, [], 'a plain bounce reaches every step');
  assert.equal(r.nearStart, 0, 'nothing that hurts, cracks or launches near the start');
  assert.deepEqual(r.launch, [], 'no bad guy over a spring or the wings');
  assert.deepEqual(r.tracks, [], 'sliding ledges and flyers have clear tracks inside the walls');
  assert.equal(r.run.end, 'map', `the scripted player climbs Sky (${JSON.stringify(r.run)})`);
  await context.close();
});

test('pixel-leap AC-46: past Sky’s door, the summit, the gallery of the monster in every world’s style, and the journey’s end card', async () => {
  const { context, page, errors } = await open({ viewport: { width: 1024, height: 700 } });
  await page.click('[data-go]');
  const r = await page.evaluate(() => {
    const L = window.__leap;
    L.manual = true;
    L.game.mode = 'play';
    L.startWorld(11);
    const po = L.stage().things.find((t) => t.type === 'portal');
    Object.assign(L.player, { x: po.x, y: po.y });
    L.step();
    const map = [L.game.mode, L.game.map.from, L.game.map.to];
    while (L.game.mode === 'map' && L.game.modeT < L.MAP.arrive) L.step();
    L.render();
    // Every cell lit: each cell's top shows its world's picture, not the dark wall.
    const c = document.getElementById('view');
    const g = c.getContext('2d');
    const U = L.view.U;
    const { nodes, cs } = L.mapLayout();
    // A lit cell shows its world's picture; a carved one is a plain hollow (#1c1826).
    const lit = nodes.slice(1, -1).map((n) => {
      const s = Math.round(cs * U * 0.6);
      const d = g.getImageData(Math.round(n.x * U - s / 2), Math.round(n.y * U - s / 2), s, s).data;
      let hollow = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i] === 0x1c && d[i + 1] === 0x18 && d[i + 2] === 0x26) hollow++;
      return hollow < d.length / 8;
    });
    const summit = L.game.map.summit;
    while (L.game.mode === 'map') L.step();
    const mode = L.game.mode;
    L.steps(Math.round(1.2 * 120));
    L.render();
    // Each cell of the gallery, by its world's rule.
    const cells = L.galleryCells();
    const PICO = new Set(['#000000', '#1d2b53', '#7e2553', '#008751', '#ab5236', '#5f574f', '#c2c3c7', '#fff1e8', '#ff004d', '#ffa300', '#ffec27', '#00e436', '#29adff', '#83769c', '#ff77a8', '#ffccaa']);
    const hex = (d, i) => '#' + [d[i], d[i + 1], d[i + 2]].map((v) => v.toString(16).padStart(2, '0')).join('');
    const box = (cell, w) => {
      const pad = Math.round(cell.size * 0.06);
      const inner = cell.size - 2 * pad;
      if (!w.smooth) {
        const q = Math.max(1, Math.floor(inner / (w.res * 3)));
        const side = q * w.res * 3;
        return { x: cell.x + pad + Math.floor((inner - side) / 2), y: cell.y + pad + Math.floor((inner - side) / 2), s: side, q };
      }
      return { x: cell.x + pad, y: cell.y + pad, s: inner, q: 1 };
    };
    const out = {};
    for (const id of ['meadow', 'ink', 'pico', 'scribble', 'sky']) {
      const i = L.WORLDS.findIndex((w) => w.id === id);
      const w = L.WORLDS[i];
      const b = box(cells[i], w);
      const d = g.getImageData(b.x, b.y, b.s, b.s).data;
      let bad = 0;
      let soft = 0;
      const colours = new Set();
      for (let y = 0; y < b.s; y++) {
        for (let x = 0; x < b.s; x++) {
          const k = (y * b.s + x) * 4;
          colours.add(hex(d, k));
          if (id === 'meadow' && (x % b.q || y % b.q)) {
            const k0 = ((y - (y % b.q)) * b.s + (x - (x % b.q))) * 4;
            if (d[k] !== d[k0] || d[k + 1] !== d[k0 + 1] || d[k + 2] !== d[k0 + 2]) bad++;
          }
          if (id === 'pico' && !PICO.has(hex(d, k))) bad++;
          if (id === 'scribble' && Math.max(d[k], d[k + 1], d[k + 2]) - Math.min(d[k], d[k + 1], d[k + 2]) > 30) bad++;
          if (x > 0) {
            const diff = Math.abs(d[k] - d[k - 4]) + Math.abs(d[k + 1] - d[k - 3]) + Math.abs(d[k + 2] - d[k - 2]);
            if (diff > 0 && diff < 30) soft++;
          }
        }
      }
      out[id] = { bad, soft, colours: colours.size, q: b.q };
    }
    const gallery = { mode, end: L.GALLERY.end, cells: cells.length };
    // A tap skips to the card.
    L.skipMap();
    const card = {
      mode: L.game.mode,
      title: document.querySelector('[data-tally-title]').textContent,
      coins: document.querySelector('[data-tally-coins]').textContent,
      time: document.querySelector('[data-tally-time]').textContent,
      lives: document.querySelector('[data-tally-lives]').textContent,
      livesShown: !document.querySelector('[data-tally-lives-row]').hidden,
      prize: document.querySelector('[data-tally-prize]').textContent,
      best: document.querySelector('[data-tally-best]').textContent,
      text: document.body.innerText,
    };
    return { map, lit, summit, gallery, out, card };
  });
  assert.deepEqual(r.map, ['map', 11, 12], 'the map heads from Sky to the summit');
  assert.deepEqual(r.lit, Array(12).fill(true), 'every cell lit');
  assert.equal(r.summit, true, 'the summit lit');
  assert.equal(r.gallery.mode, 'gallery');
  assert.equal(r.gallery.cells, 12);
  assert.ok(r.gallery.end <= 6, 'at most 6 s');
  assert.equal(r.out.meadow.bad, 0, `the Meadow's in 18-px blocks (×${r.out.meadow.q})`);
  assert.ok(r.out.ink.colours <= 2, `Ink's in two colours (${r.out.ink.colours})`);
  assert.equal(r.out.pico.bad, 0, "Pico's in PICO-8's colours");
  assert.equal(r.out.scribble.bad, 0, "Scribble's in line art");
  assert.ok(r.out.sky.soft > 20, `Sky's smooth (${r.out.sky.soft})`);
  assert.equal(r.card.mode, 'tally');
  assert.equal(r.card.title, "The journey's end");
  for (const k of ['coins', 'time', 'lives', 'prize', 'best']) assert.ok(r.card[k].length > 0, `the card shows ${k}`);
  assert.equal(r.card.livesShown, true);
  assert.doesNotMatch(r.card.text, /more worlds|for now|on their way/i);
  await page.click('[data-leap]');
  const again = await page.evaluate(() => [window.__leap.game.mode, window.__leap.game.lives, window.__leap.game.map.to]);
  assert.deepEqual(again, ['map', 3, 0], 'Play again starts level 1 with 3 lives');
  assert.deepEqual(errors, []);
  await context.close();
});

test('pixel-leap AC-47: Scribble and Sky draw from their own packs and play the owner’s beds and accents', async () => {
  const { context, page } = await open();
  await goPlay(page, true);
  const r = await page.evaluate(() => {
    const L = window.__leap;
    L.manual = true;
    const used = new Set();
    const orig = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function (img, ...rest) {
      if (img && img.src) used.add(img.src.split('/').pop());
      return orig.call(this, img, ...rest);
    };
    const out = {};
    for (const id of ['scribble', 'sky']) {
      const w = L.WORLDS.findIndex((x) => x.id === id);
      L.startWorld(w - 1);
      L.game.mode = 'play';
      const po = L.stage().things.find((t) => t.type === 'portal');
      Object.assign(L.player, { x: po.x, y: po.y, invul: 0 });
      L.step();
      for (let i = 0; i < 1000 && L.game.mode !== 'play'; i++) L.step();
      const loops = L.heard.filter((x) => x.startsWith('loop:'));
      used.clear();
      L.steps(240);
      L.render();
      out[id] = { loop: loops[loops.length - 1], images: [...used], bed: L.WORLDS[w].bed };
    }
    CanvasRenderingContext2D.prototype.drawImage = orig;
    return out;
  });
  assert.equal(r.scribble.loop, 'loop:scribble-bed');
  assert.equal(r.sky.loop, 'loop:sky-bed');
  assert.equal(r.scribble.bed && r.sky.bed, true);
  for (const f of ['scribble-bed.mp3', 'scribble-a1.mp3', 'scribble-a2.mp3', 'scribble-a3.mp3', 'sky-bed.mp3', 'sky-a1.mp3', 'sky-a2.mp3', 'sky-a3.mp3']) {
    assert.equal((await fetch(BASE + 'pixel-leap/sounds/' + f)).ok, true, f);
  }
  // Every world marked bed: true has its bed in sounds/.
  const beds = await page.evaluate(() => window.__leap.WORLDS.filter((w) => w.bed).map((w) => w.id));
  for (const id of beds) assert.equal((await fetch(BASE + `pixel-leap/sounds/${id}-bed.mp3`)).ok, true, `${id}-bed.mp3`);
  assert.ok(r.scribble.images.includes('scribble.png'), `Scribble draws its pack (${r.scribble.images})`);
  assert.ok(r.sky.images.includes('jumper.png'), `Sky draws its pack (${r.sky.images})`);
  await context.close();
});

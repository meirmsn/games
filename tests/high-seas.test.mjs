// Tests for High Seas. Run: scripts/check-slow.sh.
// The game exposes window.__seas (its state S, and a step() that advances the simulation without
// drawing), so these tests set up a moment and check what the rules do with it. AC-13 runs the
// world generator in Node.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import { FAKE_AUDIO } from './fake-audio.mjs';
import { makeWorld, routeLength, DEEP, W, H } from '../high-seas/world.js';
import { rig, polarAt } from '../high-seas/boat.js';

// Its own port range: the test files run in parallel, and a shared range can collide.
const PORT = 9600 + Math.floor(Math.random() * 100); // its own range: the others use 8790-9399
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

async function open({ hash = 'KAPOS', audio = false, ...opts } = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, ...opts });
  if (audio) await context.addInitScript(FAKE_AUDIO);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(BASE + 'high-seas/#' + hash);
  await page.waitForFunction(() => window.__seas);
  return { context, page, errors };
}

// Start a voyage, take the clock, and sail off into open water with the wind across grid +x
// (blowing towards +y), no gusts, and nothing in the hold. The boat heads along grid +x.
async function openWater(page, { heading = 0, galleon = false } = {}) {
  await page.evaluate(
    ({ heading, galleon }) => {
      const s = window.__seas;
      const S = s.S;
      s.manual = true;
      s.startVoyage(S.seed || 'KAPOS');
      S.owned.galleon = galleon;
      s.castOff();
      // The middle of the widest stretch of deep water.
      let best = null;
      for (let j = 4; j < 40; j++)
        for (let i = 4; i < 40; i++) {
          let r = 0;
          while (r < 8) {
            let ok = true;
            for (let y = -r - 1; y <= r + 1 && ok; y++)
              for (let x = -r - 1; x <= r + 1 && ok; x++) {
                const a = i + x;
                const b = j + y;
                if (a < 0 || b < 0 || a >= 44 || b >= 44 || S.world.tiles[b * 44 + a] !== 0) ok = false;
                if (S.world.rocks.some((q) => q.i === a && q.j === b)) ok = false;
              }
            if (!ok) break;
            r++;
          }
          if (!best || r > best.r) best = { i, j, r };
        }
      Object.assign(S.boat, { x: best.i + 0.5, y: best.j + 0.5, h: heading, target: heading, v: 0, heel: 0, heelHold: 0, knock: 0, bump: 0 });
      S.wind.dir = Math.PI / 2;
      S.wind.next = null;
      S.wind.shiftAt = Infinity;
      S.wind.strength = 1;
      S.gusts.length = 0;
      S.gustIn = 1e9;
      S.hold.length = 0;
      S.crates.length = 0;
      S.slowFor = 0;
      S.assistIn = Infinity;
      s.TUNE.gustDrift = 0;
      for (const k of Object.keys(S.armed)) S.armed[k] = true;
      window.__open = best;
    },
    { heading, galleon }
  );
}

const steps = (page, n, dt = 1 / 60) =>
  page.evaluate(
    ({ n, dt }) => {
      for (let i = 0; i < n; i++) window.__seas.step(dt);
    },
    { n, dt }
  );
const boat = (page) => page.evaluate(() => ({ ...window.__seas.S.boat }));
const near = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg || ''} ${a} ≈ ${b} ± ${eps}`);

test('high-seas AC-4: the page opens on a moving sea behind a start card; Start docks at the shipyard with its contracts', async () => {
  const { context, page, errors } = await open();
  assert.equal(await page.isVisible('[data-screen="start"]'), true);
  assert.equal(await page.isVisible('[data-hud]'), false);
  const t0 = await page.evaluate(() => window.__seas.S.t);
  const shot0 = await page.evaluate(() => document.getElementById('sea').toDataURL());
  await page.waitForTimeout(600);
  const t1 = await page.evaluate(() => window.__seas.S.t);
  const shot1 = await page.evaluate(() => document.getElementById('sea').toDataURL());
  assert.ok(t1 > t0, 'the sea clock runs');
  assert.notEqual(shot0, shot1, 'two frames differ');
  await page.click('[data-start]');
  const st = await page.evaluate(() => ({ mode: window.__seas.S.mode, port: window.__seas.S.portAt }));
  assert.deepEqual(st, { mode: 'docked', port: 0 });
  assert.equal(await page.isVisible('[data-screen="port"]'), true);
  assert.equal(await page.textContent('[data-port-name]'), 'Shipyard');
  assert.ok((await page.locator('[data-offer]').count()) >= 2);
  assert.equal(await page.isVisible('[data-hud]'), true);
  assert.deepEqual(errors, []);
  await context.close();
});

test('high-seas AC-5: a drag steers the boat towards what it shows on screen, at the turn rate; short drags, letting go and a second finger hold the course; keys turn', async () => {
  const { context, page } = await open();
  await openWater(page, { heading: Math.PI / 2 + 0.3 }); // running off downwind
  // A drag straight down-right on screen, through the real gesture path.
  const fire = (type, id, x, y) =>
    page.evaluate(
      ({ type, id, x, y }) => {
        const c = document.getElementById('sea');
        c.dispatchEvent(new PointerEvent(type, { pointerId: id, clientX: x, clientY: y, bubbles: true, pointerType: 'touch', isPrimary: id === 1 }));
      },
      { type, id, x, y }
    );
  await fire('pointerdown', 1, 150, 500);
  await fire('pointermove', 1, 158, 504); // 9 px: nothing yet
  assert.ok(Math.abs((await boat(page)).target - (Math.PI / 2 + 0.3)) < 1e-9, 'a short drag does nothing');
  await fire('pointermove', 1, 230, 540); // down-right: grid (1, 0)
  const b1 = await boat(page);
  near(b1.target, 0, 1e-6, 'heading along grid +x');
  await steps(page, 6); // 0.1 s
  const b2 = await boat(page);
  const turned = Math.abs(b2.h - (Math.PI / 2 + 0.3));
  assert.ok(turned > 0.2 && turned <= (150 * Math.PI) / 180 * 0.1 + 1e-6, `turned ${turned} rad in 0.1 s`);
  // A second finger: the steer is cancelled and the course held.
  await fire('pointerdown', 2, 300, 300);
  const b3 = await boat(page);
  near(b3.target, b3.h, 1e-9, 'holds its course');
  await fire('pointerup', 2, 300, 300);
  await fire('pointerup', 1, 230, 540);
  await steps(page, 60);
  near((await boat(page)).h, b3.h, 1e-9, 'still holds it');
  // Letting go holds the course too.
  await page.evaluate(() => window.__seas.steer(80, 40));
  await page.evaluate(() => window.__seas.release());
  await steps(page, 120);
  near((await boat(page)).h, 0, 1e-6, 'reached and held');
  // Arrow keys turn it.
  await page.keyboard.down('ArrowRight');
  await steps(page, 12);
  await page.keyboard.up('ArrowRight');
  assert.ok((await boat(page)).h > 0.2, 'right arrow turns clockwise on the grid');
  await context.close();
});

// The boat's steady speed on a heading, held in the middle of open water so it never meets land.
async function steady(page, target, n = 400) {
  await page.evaluate(
    ({ t, n }) => {
      const s = window.__seas;
      const b = s.S.boat;
      const o = window.__open;
      b.target = t;
      for (let i = 0; i < n; i++) {
        s.step(1 / 60);
        b.x = o.i + 0.5;
        b.y = o.j + 0.5;
      }
    },
    { t: target, n }
  );
  return boat(page);
}

test('high-seas AC-6: speed follows the polar; a drag into the no-go wedge sails its edge at 40% or more; across the wedge it tacks', async () => {
  const { context, page } = await open();
  await openWater(page, { heading: 0 });
  const top = await page.evaluate(() => window.__seas.rig().top);
  // Wind blows +y, from −y (−π/2). Beam reach: heading 0 or π.
  const beam = (await steady(page, 0)).v;
  near(beam, top, top * 0.02, 'a beam reach is full speed');
  await openWater(page, { heading: Math.PI / 2 });
  const run = (await steady(page, Math.PI / 2)).v;
  await openWater(page, { heading: -Math.PI / 2 + 1.0 });
  const close = (await steady(page, -Math.PI / 2 + 1.0)).v;
  assert.ok(beam > run && beam > close, `beam ${beam} beats run ${run} and close-hauled ${close}`);
  // Straight up on screen-right of the wind: grid (0, −1) is drawn up-right: into the wind.
  await openWater(page, { heading: 0 });
  await page.evaluate(() => window.__seas.steer(80, -40));
  const b = await boat(page);
  const wedge = (50 * Math.PI) / 180;
  near(Math.abs(b.target - -Math.PI / 2), wedge, 1e-6, 'clamped to the wedge edge');
  assert.ok(b.target > -Math.PI / 2, 'the nearer edge (the starboard tack it came from)');
  const edge = await steady(page, b.target);
  assert.ok(edge.v >= 0.4 * top, `on the edge it sails at ${edge.v / top} of top speed`);
  // A drag a little to the other side of the wind: the other edge, a tack through the wind.
  const sx = await page.evaluate(() => {
    const d = window.__seas.iso.gridDirToScreen(Math.cos(-Math.PI / 2 - 0.15), Math.sin(-Math.PI / 2 - 0.15));
    return d;
  });
  await page.evaluate(({ x, y }) => window.__seas.steer(x * 90, y * 90), sx);
  const t = await boat(page);
  near(t.target, -Math.PI / 2 - wedge, 1e-6, 'the other tack');
  await steps(page, 120);
  near((await boat(page)).h, -Math.PI / 2 - wedge, 1e-3, 'it tacked');
  await context.close();
});

test('high-seas AC-7: inside a gust the speed settles at the gust\'s strength times the speed outside', async () => {
  const { context, page } = await open();
  await openWater(page, { heading: Math.PI / 2 + 0.6 }); // a broad reach: little heel
  const v0 = (await steady(page, Math.PI / 2 + 0.6)).v;
  await page.evaluate(() => {
    const S = window.__seas.S;
    S.gusts.push({ x: S.boat.x, y: S.boat.y, g: 1.3, r: 60, life: 1e9, age: 5, seed: 1 });
  });
  const v1 = (await steady(page, Math.PI / 2 + 0.6)).v;
  near(v1 / v0, 1.3, 0.02, 'the gust multiplies the speed');
  assert.ok((await page.evaluate(() => window.__seas.gustAt(window.__seas.S.boat.x + 0.1, window.__seas.S.boat.y))) > 1.29);
  await context.close();
});

test('high-seas AC-8: entering a port\'s ring docks and pays; casting off doesn\'t re-dock; other cargo stays; a full hold refuses; mail on time pays more', async () => {
  const { context, page } = await open();
  await openWater(page);
  const r = await page.evaluate(() => {
    const s = window.__seas;
    const S = s.S;
    const p = S.world.ports[1];
    S.coins = 0;
    const forHere = s.makeContract(0, 1, 'goods');
    const forThere = s.makeContract(0, 2, 'goods');
    S.hold.push(forHere);
    S.owned.galleon = true; // room for two
    // Two and a half tiles out from the ring, in deep water, heading for it on a beam reach.
    let a = 0;
    for (let k = 0; k < 16; k++) {
      a = (k / 16) * Math.PI * 2;
      const x = p.rx + Math.cos(a) * 2.6;
      const y = p.ry + Math.sin(a) * 2.6;
      if (S.world.deep[Math.floor(y) * 44 + Math.floor(x)]) break;
    }
    S.wind.dir = a + Math.PI / 2;
    S.gusts.length = 0;
    Object.assign(S.boat, { x: p.rx + Math.cos(a) * 2.6, y: p.ry + Math.sin(a) * 2.6, h: a + Math.PI, target: a + Math.PI, v: 1 });
    S.hold.push(forThere);
    for (let i = 0; i < 600 && !(S.mode === 'docked' && S.dock === null); i++) s.step(1 / 60);
    return { mode: S.mode, port: S.portAt, coins: S.coins, pay: forHere.pay, hold: S.hold.map((c) => c.to) };
  });
  assert.equal(r.mode, 'docked');
  assert.equal(r.port, 1);
  assert.equal(r.coins, r.pay);
  assert.deepEqual(r.hold, [2]);
  assert.equal(await page.isVisible('[data-screen="port"]'), true);
  // Cast off: still inside the ring, but it doesn't dock again until it has left.
  const again = await page.evaluate(() => {
    const s = window.__seas;
    const S = s.S;
    s.castOff();
    S.boat.v = 0.1;
    for (let i = 0; i < 60; i++) s.step(1 / 60);
    return S.mode;
  });
  assert.equal(again, 'sail');
  // A full hold refuses another contract.
  const full = await page.evaluate(() => {
    const s = window.__seas;
    const S = s.S;
    s.startVoyage('KAPOS');
    s.manual = true;
    S.hold.push(s.makeContract(0, 1, 'goods')); // the dinghy's one space
    const offer = S.offers[0][0];
    const ok = s.takeOffer(offer);
    return { ok, hold: S.hold.length, disabled: document.querySelector('[data-offer]').getAttribute('aria-disabled') };
  });
  assert.deepEqual(full, { ok: false, hold: 1, disabled: 'true' });
  // Mail on time pays more than the same mail late.
  const mail = await page.evaluate(() => {
    const s = window.__seas;
    const S = s.S;
    const pays = [];
    for (const left of [5, 0]) {
      s.startVoyage('KAPOS');
      s.manual = true;
      S.coins = 0;
      const c = s.makeContract(0, 1, 'mail');
      c.left = left;
      S.hold.push(c);
      s.castOff();
      const p = S.world.ports[1];
      Object.assign(S.boat, { x: p.rx, y: p.ry, v: 0 });
      S.armed[1] = true;
      for (let i = 0; i < 200 && !(S.mode === 'docked' && S.dock === null); i++) s.step(1 / 60);
      pays.push(S.coins);
    }
    return pays;
  });
  assert.ok(mail[0] > mail[1], `on time ${mail[0]} > late ${mail[1]}`);
  await context.close();
});

test('high-seas AC-9: keel, spinnaker and galleon change the boat; each is on the quay from the start; one you can\'t afford changes nothing', async () => {
  const { context, page } = await open();
  await page.click('[data-start]');
  // On the quay from the start, with prices.
  const yard = await page.$$eval('[data-buy]', (b) => b.map((x) => [x.dataset.buy, x.querySelector('.price').textContent, x.getAttribute('aria-disabled')]));
  assert.deepEqual(yard, [
    ['keel', '60', 'true'],
    ['spinnaker', '130', 'true'],
    ['galleon', '360', 'true'],
  ]);
  assert.ok(await page.evaluate(() => !!window.__seas.S.yardGalleon), 'the galleon waits at the shipyard');
  // Can't afford: nothing changes.
  await page.evaluate(() => (window.__seas.S.coins = 59));
  await page.click('[data-buy="keel"]', { force: true }); // it says it's disabled; tap it anyway
  assert.deepEqual(await page.evaluate(() => ({ c: window.__seas.S.coins, k: window.__seas.S.owned.keel })), { c: 59, k: false });
  const res = await page.evaluate(() => {
    const s = window.__seas;
    const S = s.S;
    const D = Math.PI / 180;
    const out = {};
    out.dinghyWedge = s.rig().wedge / D;
    // The spinnaker on its own: downwind gets faster, the wedge stays the dinghy's.
    S.coins = 130;
    s.buy('spinnaker');
    out.spinAlone = { wedge: Math.round(s.rig().wedge / D), runBeatsBeam: s.polarAt(s.rig(), Math.PI) > s.polarAt(s.rig(), Math.PI / 2), coins: S.coins };
    S.owned.spinnaker = false;
    S.coins = 1000;
    s.buy('keel');
    out.keelWedge = Math.round(s.rig().wedge / D);
    out.coinsAfterKeel = S.coins;
    s.buy('spinnaker');
    const r = s.rig();
    out.runBeatsBeam = s.polarAt(r, Math.PI) > s.polarAt(r, Math.PI / 2);
    s.buy('galleon');
    const g = s.rig();
    out.galleon = { cargo: g.cargo, wedge: Math.round(g.wedge / D), name: g.name };
    out.coins = S.coins;
    return out;
  });
  assert.equal(Math.round(res.dinghyWedge), 50);
  assert.deepEqual(res.spinAlone, { wedge: 50, runBeatsBeam: true, coins: 0 });
  assert.equal(res.keelWedge, 38);
  assert.equal(res.coinsAfterKeel, 940);
  assert.equal(res.runBeatsBeam, true);
  assert.deepEqual(res.galleon, { cargo: 3, wedge: 65, name: 'galleon' });
  assert.equal(res.coins, 1000 - 60 - 130 - 360);
  // The galleon can't enter shallow water: sail it at a shallow tile and it never gets in.
  const inShallow = await page.evaluate(() => {
    const s = window.__seas;
    const S = s.S;
    s.manual = true;
    s.castOff();
    // A deep-water tile two tiles from a shallow one, along grid +x.
    const t = S.world.tiles;
    for (let j = 4; j < 40; j++)
      for (let i = 4; i < 37; i++) {
        if (S.world.deep[j * 44 + i] && t[j * 44 + i + 3] === 1 && t[j * 44 + i + 1] === 0 && t[j * 44 + i + 2] === 0) {
          S.wind.dir = Math.PI / 2;
          S.gusts.length = 0;
          S.gustIn = 1e9;
          Object.assign(S.boat, { x: i + 0.5, y: j + 0.5, h: 0, target: 0, v: 1.5 });
          let worst = 0;
          for (let k = 0; k < 300; k++) {
            s.step(1 / 60);
            S.boat.target = 0;
            const tile = t[Math.floor(S.boat.y) * 44 + Math.floor(S.boat.x)];
            if (tile !== 0) worst = tile;
          }
          return worst;
        }
      }
    return 'no spot';
  });
  assert.equal(inShallow, 0);
  await context.close();
});

test('high-seas AC-10: a strong gust across the dinghy heels it, and held it knocks down and spills the cargo, which can be picked up; bearing away sheds it; the galleon never knocks down', async () => {
  const { context, page } = await open();
  await openWater(page, { heading: 0 });
  const r = await page.evaluate(() => {
    const s = window.__seas;
    const S = s.S;
    S.hold.push(s.makeContract(0, 1, 'goods'));
    S.gusts.push({ x: S.boat.x, y: S.boat.y, g: 1.6, r: 60, life: 1e9, age: 5, seed: 1 });
    const out = { heel: 0, knockAt: null };
    for (let i = 0; i < 60 * 6; i++) {
      s.step(1 / 60);
      S.boat.target = 0;
      out.heel = Math.max(out.heel, S.boat.heel);
      if (S.boat.knock > 0 && out.knockAt === null) out.knockAt = i / 60;
    }
    out.crates = S.crates.map((c) => ({ x: c.x, y: c.y, nav: S.world.light[Math.floor(c.y) * 44 + Math.floor(c.x)] }));
    out.hold = S.hold.length;
    return out;
  });
  assert.ok(r.heel >= 0.99, `heeled to ${r.heel}`);
  assert.ok(r.knockAt !== null && r.knockAt >= 1.5, `knocked down at ${r.knockAt} s`);
  assert.equal(r.hold, 0);
  assert.equal(r.crates.length, 1);
  assert.equal(r.crates[0].nav, 1, 'the crate floats where the boat can reach');
  // Sail over it: back aboard.
  const back = await page.evaluate(() => {
    const s = window.__seas;
    const S = s.S;
    S.gusts.length = 0;
    const c = S.crates[0];
    Object.assign(S.boat, { x: c.x - 1.2, y: c.y, h: 0, target: 0, v: 1.2, knock: 0 });
    for (let i = 0; i < 120 && S.crates.length; i++) s.step(1 / 60);
    return { hold: S.hold.length, crates: S.crates.length };
  });
  assert.deepEqual(back, { hold: 1, crates: 0 });
  // Bearing away in the same gust: no knockdown.
  await openWater(page, { heading: Math.PI / 2 });
  const away = await page.evaluate(() => {
    const s = window.__seas;
    const S = s.S;
    S.gusts.push({ x: S.boat.x, y: S.boat.y, g: 1.6, r: 60, life: 1e9, age: 5, seed: 1 });
    let heel = 0;
    let knocked = false;
    for (let i = 0; i < 60 * 5; i++) {
      s.step(1 / 60);
      S.boat.target = Math.PI / 2;
      heel = Math.max(heel, S.boat.heel);
      knocked = knocked || S.boat.knock > 0;
    }
    return { heel, knocked };
  });
  assert.equal(away.knocked, false);
  assert.ok(away.heel < 0.2, `heel ${away.heel}`);
  // The galleon, beam on in a stronger gust: never.
  await openWater(page, { heading: 0, galleon: true });
  const g = await page.evaluate(() => {
    const s = window.__seas;
    const S = s.S;
    S.gusts.push({ x: S.boat.x, y: S.boat.y, g: 1.7, r: 60, life: 1e9, age: 5, seed: 1 });
    let knocked = false;
    for (let i = 0; i < 60 * 5; i++) {
      s.step(1 / 60);
      S.boat.target = 0;
      knocked = knocked || S.boat.knock > 0;
    }
    return knocked;
  });
  assert.equal(g, false);
  await context.close();
});

test('high-seas AC-11: a rock bumps the boat and spills its cargo; sailing into land slides along it and never stops dead', async () => {
  const { context, page } = await open();
  await openWater(page);
  const r = await page.evaluate(() => {
    const s = window.__seas;
    const S = s.S;
    const rock = S.world.rocks[0];
    S.hold.push(s.makeContract(0, 1, 'goods'));
    Object.assign(S.boat, { x: rock.x - 1.6, y: rock.y, h: 0, target: 0, v: 1.2 });
    S.wind.dir = Math.PI / 2;
    let bumped = false;
    for (let i = 0; i < 180 && !bumped; i++) {
      s.step(1 / 60);
      bumped = S.boat.bump > 0;
    }
    return { bumped, crates: S.crates.length, hold: S.hold.length, played: s.played.includes('bump') };
  });
  assert.deepEqual(r, { bumped: true, crates: 1, hold: 0, played: true });
  // Head straight into a coast and hold the steer there: it keeps moving along the shore.
  const slide = await page.evaluate(() => {
    const s = window.__seas;
    const S = s.S;
    S.crates.length = 0;
    const t = S.world.tiles;
    // A water tile with land two tiles along grid +x, and open water behind.
    for (let j = 5; j < 39; j++)
      for (let i = 5; i < 39; i++) {
        if (t[j * 44 + i] <= 1 && t[j * 44 + i + 1] <= 1 && t[j * 44 + i + 2] >= 2 && t[j * 44 + i - 1] <= 1 && !S.world.rocks.some((q) => Math.hypot(q.x - i, q.y - j) < 3)) {
          S.wind.dir = Math.PI / 2;
          Object.assign(S.boat, { x: i + 0.5, y: j + 0.5, h: 0, target: 0, v: 1.2, bump: 0, knock: 0 });
          let minStep = Infinity;
          let land = false;
          for (let k = 0; k < 180; k++) {
            const x = S.boat.x;
            const y = S.boat.y;
            S.boat.target = 0; // the finger keeps pointing ashore
            s.step(1 / 60);
            minStep = Math.min(minStep, Math.hypot(S.boat.x - x, S.boat.y - y));
            land = land || t[Math.floor(S.boat.y) * 44 + Math.floor(S.boat.x)] >= 2;
          }
          return { minStep, land };
        }
      }
    return null;
  });
  assert.ok(slide, 'found a coast');
  assert.equal(slide.land, false, 'never on land');
  assert.ok(slide.minStep > 0.002, `kept moving: least step ${slide.minStep}`);
  await context.close();
});

test('high-seas AC-12: a wind shift is announced at least 30 s ahead, then the wind turns', async () => {
  const { context, page } = await open();
  const r = await page.evaluate(() => {
    const s = window.__seas;
    const S = s.S;
    s.manual = true;
    s.startVoyage('KAPOS');
    // The fourth delivery sets it off.
    S.deliveries = 3;
    const p = S.world.ports[1];
    S.hold.push(s.makeContract(0, 1, 'goods'));
    s.castOff();
    Object.assign(S.boat, { x: p.rx, y: p.ry, v: 0 });
    S.armed[1] = true;
    for (let i = 0; i < 200 && !(S.mode === 'docked' && S.dock === null); i++) s.step(1 / 60);
    const announced = { clock: S.clock, next: S.wind.next, dir: S.wind.dir, at: S.wind.shiftAt, sound: s.played.includes('shift') };
    // Stay docked: the clock runs.
    let changedBy = null;
    for (let i = 0; i < 60 * 60; i++) {
      s.step(1 / 60);
      if (changedBy === null && Math.abs(S.wind.dir - announced.dir) > 1e-9) changedBy = S.clock;
    }
    return { announced, changedBy, dir: S.wind.dir };
  });
  assert.notEqual(r.announced.next, null);
  assert.ok(r.announced.at - r.announced.clock >= 30, 'announced at least 30 s ahead');
  assert.equal(r.announced.sound, true);
  assert.ok(r.changedBy - r.announced.clock >= 30, `the wind held for ${r.changedBy - r.announced.clock} s`);
  near(r.dir, r.announced.next, 1e-9, 'then it turned to the announced direction');
  // The vane shows the coming wind: drawn while announced (checked by the state the vane reads).
  await context.close();
});

test('high-seas AC-13: a seed always gives the same sea; every sea links its ports and lighthouse by deep channels and has a first hop under 40 s', () => {
  const d = rig({});
  const opts = { polarAt: (off) => polarAt(d, off), topSpeed: d.top };
  const a = makeWorld('SAME', opts);
  const b = makeWorld('SAME', opts);
  assert.deepEqual([...a.tiles], [...b.tiles]);
  assert.deepEqual(a.ports.map((p) => [p.name, p.rx, p.ry]), b.ports.map((p) => [p.name, p.rx, p.ry]));
  assert.equal(a.wind, b.wind);
  for (let k = 0; k < 100; k++) {
    const w = makeWorld('T' + k, opts);
    assert.ok(w.attempt < 50, `seed T${k} settled on attempt ${w.attempt}`);
    const y = w.ports[0];
    for (const p of [...w.ports, w.lighthouse]) {
      assert.ok(routeLength(w.deep, y.rx, y.ry, p.rx, p.ry) < Infinity, `T${k}: ${p.name} reachable in deep water`);
    }
    // Deep-water cells (where the galleon may be) have deep water all round: 3-wide channels.
    for (let j = 1; j < H - 1; j++)
      for (let i = 1; i < W - 1; i++) {
        if (!w.deep[j * W + i]) continue;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) assert.equal(w.tiles[(j + dy) * W + i + dx], DEEP);
      }
    // The first contract's hop: route length over the dinghy's speed at the starting wind.
    const f = w.ports[w.first.port];
    const len = routeLength(w.light, y.rx, y.ry, f.rx, f.ry);
    const bearing = Math.atan2(f.ry - y.ry, f.rx - y.rx);
    let off = Math.abs(bearing - (w.wind + Math.PI));
    off = Math.abs(((off + Math.PI) % (2 * Math.PI)) - Math.PI);
    assert.ok(len / (d.top * polarAt(d, off)) < 40, `T${k}: first hop ${len / (d.top * polarAt(d, off))} s`);
  }
});

test('high-seas AC-14: with the galleon, the shipyard offers the Grand Charter, on a fair wind; the lighthouse ends the voyage with its time and the sea\'s best; then a new sea or the same', async () => {
  const { context, page } = await open({ hash: 'LUMEN' });
  await page.click('[data-start]');
  assert.equal(await page.locator('[data-charter]').count(), 0, 'no charter without the galleon');
  await page.evaluate(() => {
    const s = window.__seas;
    s.manual = true;
    s.S.coins = 400;
    s.buy('galleon');
  });
  assert.equal(await page.locator('[data-charter]').count(), 1);
  await page.click('[data-charter]');
  const r = await page.evaluate(() => {
    const s = window.__seas;
    const S = s.S;
    // A fair wind for the charter: within a few seconds the lighthouse lies 135° off the wind.
    for (let i = 0; i < 60 * 6; i++) s.step(1 / 60);
    const y = S.world.ports[0];
    const lh = S.world.lighthouse;
    const bearing = Math.atan2(lh.ry - y.ry, lh.rx - y.rx);
    const off = Math.abs(Math.atan2(Math.sin(bearing - S.wind.dir - Math.PI), Math.cos(bearing - S.wind.dir - Math.PI)));
    window.__fair = { off: (off * 180) / Math.PI, next: S.wind.next };
    s.castOff();
    // Sailing through another port's ring with only the charter aboard doesn't stop the voyage.
    const p = S.world.ports[1];
    Object.assign(S.boat, { x: p.rx, y: p.ry, v: 0.5 });
    S.armed[1] = true;
    for (let i = 0; i < 30; i++) s.step(1 / 60);
    window.__passed = S.mode;
    S.clock = 425;
    const l = S.world.lighthouse;
    Object.assign(S.boat, { x: l.rx, y: l.ry, v: 0 });
    for (let i = 0; i < 200 && S.mode !== 'over'; i++) s.step(1 / 60);
    return { mode: S.mode, best: JSON.parse(localStorage.getItem('high-seas-best')) };
  });
  assert.equal(await page.evaluate(() => window.__passed), 'sail', 'no stop on the way');
  const fair = await page.evaluate(() => window.__fair);
  near(fair.off, 135, 0.5, 'the lighthouse on a broad reach');
  assert.equal(fair.next, null, 'and no further shift is coming');
  assert.equal(r.mode, 'over');
  assert.equal(await page.isVisible('[data-screen="over"]'), true);
  assert.equal(await page.textContent('[data-final-time]'), '7:06');
  assert.equal(r.best.LUMEN, 426);
  await page.click('[data-same]');
  assert.equal(await page.isVisible('[data-screen="start"]'), true);
  assert.equal(await page.textContent('[data-sea-name]'), 'LUMEN');
  assert.match(await page.textContent('[data-sea-best]'), /7:06/);
  await page.click('[data-new-sea]');
  assert.notEqual(await page.textContent('[data-sea-name]'), 'LUMEN');
  await context.close();
});

test('high-seas AC-15: the address keeps the voyage after a port; reloading resumes it; an edited address starts the sea afresh', async () => {
  const { context, page, errors } = await open({ hash: 'TIDAL' });
  await page.click('[data-start]');
  await page.evaluate(() => {
    const s = window.__seas;
    const S = s.S;
    s.manual = true;
    S.coins = 200;
    s.buy('keel');
    S.deliveries = 6;
    S.clock = 321;
    S.portAt = 2;
    s.saveHash();
  });
  const hash = await page.evaluate(() => location.hash);
  assert.match(hash, /^#v1\.TIDAL\./);
  await page.reload();
  await page.waitForFunction(() => window.__seas);
  assert.equal(await page.isVisible('[data-continue]'), true);
  await page.click('[data-continue]');
  const st = await page.evaluate(() => {
    const S = window.__seas.S;
    return { coins: S.coins, keel: S.owned.keel, galleon: S.owned.galleon, port: S.portAt, clock: Math.round(S.clock), mode: S.mode, seed: S.seed };
  });
  assert.deepEqual(st, { coins: 140, keel: true, galleon: false, port: 2, clock: 321, mode: 'docked', seed: 'TIDAL' });
  // Edit the coins in the address: the checksum fails, and the sea starts afresh.
  const parts = hash.slice(1).split('.');
  parts[2] = '99999';
  await page.goto(BASE + 'high-seas/#' + parts.join('.'));
  await page.reload();
  await page.waitForFunction(() => window.__seas);
  assert.equal(await page.isVisible('[data-continue]'), false);
  assert.equal(await page.textContent('[data-sea-name]'), 'TIDAL');
  await page.click('[data-start]');
  assert.equal(await page.evaluate(() => window.__seas.S.coins), 0);
  // Garbage is ignored too.
  await page.goto(BASE + 'high-seas/#v1.%%%.x.y');
  await page.reload();
  await page.waitForFunction(() => window.__seas);
  assert.equal(await page.isVisible('[data-screen="start"]'), true);
  assert.deepEqual(errors, []);
  await context.close();
});

test('high-seas AC-16: hiding the page pauses the voyage; nothing moves until a tap', async () => {
  const { context, page } = await open();
  await page.click('[data-start]');
  await page.click('[data-cast]');
  const before = await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    const S = window.__seas.S;
    return { mode: S.mode, x: S.boat.x, y: S.boat.y, clock: S.clock };
  });
  assert.equal(before.mode, 'paused');
  await page.waitForTimeout(700);
  const during = await page.evaluate(() => {
    const S = window.__seas.S;
    return { x: S.boat.x, y: S.boat.y, clock: S.clock };
  });
  assert.deepEqual(during, { x: before.x, y: before.y, clock: before.clock });
  assert.equal(await page.isVisible('[data-screen="pause"]'), true);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => window.__seas.S.mode), 'paused', 'coming back alone doesn\'t resume');
  await page.click('[data-resume]');
  assert.equal(await page.evaluate(() => window.__seas.S.mode), 'sail');
  await context.close();
});

test('high-seas AC-17: a boat slow for 4 s gets a gust forming upwind within 6 s', async () => {
  const { context, page } = await open();
  await openWater(page, { heading: 0 });
  const r = await page.evaluate(() => {
    const s = window.__seas;
    const S = s.S;
    S.wind.strength = 0.2; // a near calm: slow
    let formedAt = null;
    let g = null;
    for (let i = 0; i < 60 * 10 && formedAt === null; i++) {
      s.step(1 / 60);
      S.boat.target = 0;
      if (S.gusts.length) {
        formedAt = S.clock;
        g = S.gusts[0];
      }
    }
    const b = S.boat;
    const up = S.wind.dir + Math.PI;
    return { formedAt, upwind: g ? (g.x - b.x) * Math.cos(up) + (g.y - b.y) * Math.sin(up) : null, dist: g ? Math.hypot(g.x - b.x, g.y - b.y) : null };
  });
  assert.ok(r.formedAt !== null && r.formedAt <= 4 + 6 + 0.5, `formed at ${r.formedAt}`);
  assert.ok(r.formedAt >= 4, 'not before 4 s of being slow');
  assert.ok(r.upwind > 2, 'upwind of the boat');
  assert.ok(r.dist < 5, 'close by');
  await context.close();
});

test('high-seas AC-19: High Seas plays offline once it has been played', async () => {
  const { context, page } = await open();
  await page.evaluate(() => navigator.serviceWorker.register('../sw.js'));
  await page.evaluate(() => Promise.race([navigator.serviceWorker.ready, new Promise((r) => setTimeout(r, 10000))]));
  await page.reload(); // controlled now: this load caches the game's files
  await page.waitForFunction(() => window.__seas);
  await page.waitForLoadState('networkidle');
  await context.setOffline(true);
  await page.reload();
  await page.waitForFunction(() => window.__seas);
  await page.click('[data-start]');
  assert.equal(await page.evaluate(() => window.__seas.S.mode), 'docked');
  assert.equal(await page.evaluate(() => document.querySelector('img') === null && window.__seas.S.world.ports.length), 4);
  await context.close();
});

test('high-seas AC-20: on a phone nothing scrolls, buttons are 44 px or more, the canvas is at most 2×, turning the phone keeps the boat in view, and physics runs on delta time', async () => {
  const { context, page } = await open({ deviceScaleFactor: 3, hasTouch: true, isMobile: true });
  const sizes = async () =>
    page.$$eval('button:not([hidden])', (bs) =>
      bs
        .filter((b) => b.offsetParent !== null)
        .map((b) => {
          const r = b.getBoundingClientRect();
          return { t: b.textContent.trim() || b.getAttribute('aria-label'), w: r.width, h: r.height };
        })
    );
  for (const b of await sizes()) assert.ok(b.w >= 44 && b.h >= 44, `${b.t}: ${b.w}×${b.h}`);
  await page.click('[data-start]');
  for (const b of await sizes()) assert.ok(b.w >= 44 && b.h >= 44, `${b.t}: ${b.w}×${b.h}`);
  const dims = await page.evaluate(() => ({
    scroll: document.scrollingElement.scrollHeight - innerHeight,
    cw: document.getElementById('sea').width,
    w: innerWidth,
  }));
  assert.ok(dims.scroll <= 0, 'no scroll');
  assert.ok(dims.cw <= dims.w * 2, `canvas ${dims.cw} for ${dims.w} css px`);
  await page.click('[data-cast]');
  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForTimeout(1500);
  const land = await page.evaluate(() => {
    const s = window.__seas;
    const p = s.iso.toScreen(s.S.boat.x, s.S.boat.y);
    const v = s.cam.toView(p.x, p.y);
    return { v, scroll: document.scrollingElement.scrollHeight - innerHeight, w: innerWidth, h: innerHeight };
  });
  assert.ok(land.scroll <= 0);
  assert.ok(land.v.x > 0 && land.v.x < land.w && land.v.y > 0 && land.v.y < land.h, `boat in view at ${JSON.stringify(land.v)}`);
  // The same two seconds at 60 and at 120 steps a second.
  await openWater(page, { heading: Math.PI / 2 + 0.6 });
  const d60 = await page.evaluate(() => {
    const s = window.__seas;
    const b = s.S.boat;
    const x0 = b.x;
    const y0 = b.y;
    for (let i = 0; i < 120; i++) s.step(1 / 60);
    return Math.hypot(b.x - x0, b.y - y0);
  });
  await openWater(page, { heading: Math.PI / 2 + 0.6 });
  const d120 = await page.evaluate(() => {
    const s = window.__seas;
    const b = s.S.boat;
    const x0 = b.x;
    const y0 = b.y;
    for (let i = 0; i < 240; i++) s.step(1 / 120);
    return Math.hypot(b.x - x0, b.y - y0);
  });
  near(d120 / d60, 1, 0.02, 'same distance');
  await context.close();
});

test('high-seas AC-21: a delivery, a gust and a knockdown each play their sound, and nothing plays while muted', async () => {
  const { context, page } = await open({ audio: true });
  await page.click('[data-start]'); // unlocks audio
  await page.waitForFunction(() => window.__decoded >= 13);
  const scenario = () =>
    page.evaluate(() => {
      const s = window.__seas;
      const S = s.S;
      s.manual = true;
      const n0 = window.__played.length;
      const names = [];
      const mark = (what) => names.push([what, window.__played.length > n0 + names.length]);
      // A delivery.
      S.hold.push(s.makeContract(0, 1, 'goods'));
      s.castOff();
      const p = S.world.ports[1];
      Object.assign(S.boat, { x: p.rx, y: p.ry, v: 0 });
      S.armed[1] = true;
      for (let i = 0; i < 200 && !(S.mode === 'docked' && S.dock === null); i++) s.step(1 / 60);
      const afterDelivery = window.__played.length;
      // A gust and a knockdown, in open water.
      s.castOff();
      S.wind.dir = Math.PI / 2;
      S.gusts.length = 0;
      S.gustIn = 1e9;
      s.TUNE.gustDrift = 0;
      Object.assign(S.boat, { x: 22, y: 22, v: 1.4, h: 0, target: 0 });
      // Find open water near the middle.
      for (let j = 6; j < 38; j++)
        for (let i = 6; i < 38; i++) {
          let ok = true;
          for (let y = -3; y <= 3 && ok; y++) for (let x = -3; x <= 3 && ok; x++) ok = S.world.tiles[(j + y) * 44 + i + x] === 0 && !S.world.rocks.some((q) => q.i === i + x && q.j === j + y);
          if (ok) {
            S.boat.x = i + 0.5;
            S.boat.y = j + 0.5;
            j = 99;
            break;
          }
        }
      s.step(1 / 60);
      const beforeGust = window.__played.length;
      S.gusts.push({ x: S.boat.x, y: S.boat.y, g: 1.6, r: 60, life: 1e9, age: 5, seed: 1 });
      s.step(1 / 60);
      const afterGust = window.__played.length;
      for (let i = 0; i < 60 * 5 && S.boat.knock <= 0; i++) {
        s.step(1 / 60);
        S.boat.target = 0;
      }
      const knocked = S.boat.knock > 0;
      void mark;
      return { delivery: afterDelivery - n0, gust: afterGust - beforeGust, knocked, total: window.__played.length - n0, names: s.played.slice(-12) };
    });
  const loud = await scenario();
  assert.ok(loud.delivery >= 1, 'the delivery sounds');
  assert.ok(loud.gust >= 1, 'the gust sounds');
  assert.equal(loud.knocked, true);
  for (const n of ['coins', 'gust', 'splash']) assert.ok(loud.names.includes(n) || (await page.evaluate((n) => window.__seas.played.includes(n), n)), `${n} played`);
  // Muted: the same moments, and nothing reaches the speakers.
  await page.click('[data-mute]');
  await page.evaluate(() => {
    const s = window.__seas;
    s.startVoyage('KAPOS');
  });
  const quiet = await scenario();
  assert.equal(quiet.total, 0);
  await context.close();
});

test('high-seas: each state shows only its own cards and HUD, as in the spec\'s state table', async () => {
  const { context, page } = await open();
  const shown = () =>
    page.evaluate(() => {
      const vis = (sel) => {
        const el = document.querySelector(sel);
        return !!el && !el.hidden && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
      };
      return {
        start: vis('[data-screen="start"]'),
        port: vis('[data-screen="port"]'),
        hud: vis('[data-hud]'),
        over: vis('[data-screen="over"]'),
        pause: vis('[data-screen="pause"]'),
      };
    });
  const row = (start, port, hud, over, pause) => ({ start, port, hud, over, pause });
  assert.deepEqual(await shown(), row(true, false, false, false, false), 'Start');
  await page.click('[data-start]');
  assert.deepEqual(await shown(), row(false, true, true, false, false), 'Docked');
  await page.click('[data-cast]');
  assert.deepEqual(await shown(), row(false, false, true, false, false), 'Sailing');
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  assert.deepEqual(await shown(), row(false, false, true, false, true), 'Paused');
  await page.click('[data-resume]');
  await page.evaluate(() => {
    const s = window.__seas;
    const S = s.S;
    s.manual = true;
    S.mode = 'docked';
    S.portAt = 0;
    S.coins = 400;
    s.buy('galleon');
    s.takeCharter();
    s.castOff();
    const l = S.world.lighthouse;
    Object.assign(S.boat, { x: l.rx, y: l.ry, v: 0 });
    for (let i = 0; i < 200 && S.mode !== 'over'; i++) s.step(1 / 60);
  });
  assert.deepEqual(await shown(), row(false, false, false, true, false), 'Voyage over');
  await context.close();
});

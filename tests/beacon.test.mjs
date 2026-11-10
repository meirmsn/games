// Tests for Beacon. Run: scripts/check-slow.sh.
// The rules live in beacon/sim.js with no DOM, so most acceptance items run it here in Node; the
// page's own items (cards, input, sound, layout, offline) drive the game in Chromium through
// window.__beacon.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import { FAKE_AUDIO } from './fake-audio.mjs';
import {
  TUNE,
  COASTS,
  createNight,
  step,
  inBeam,
  bearingOf,
  beamLimits,
  reachOf,
  fogOn,
  galeOn,
  onSea,
  driftHits,
  autopilotTarget,
  starsOf,
  wrapAngle,
  leftAt,
  rightAt,
} from '../beacon/sim.js';

const D = Math.PI / 180;
// Its own port range: the test files run in parallel, and a shared range can collide (FINDINGS F-13).
const PORT = 9600 + Math.floor(Math.random() * 100);
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

async function open({ hash = '', audio = false, mem = null, ...opts } = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, ...opts });
  if (audio) await context.addInitScript(FAKE_AUDIO);
  if (mem) await context.addInitScript((m) => localStorage.setItem('beacon.v1', JSON.stringify(m)), mem);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(BASE + 'beacon/' + hash);
  await page.waitForFunction(() => window.__beacon);
  return { context, page, errors };
}

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b} ±${tol}`);

// A quiet night: no arrivals, no set pieces, only what the test puts on the sea.
function quiet(coast = 0) {
  const s = createNight(coast, 1);
  s.coast = structuredClone(s.coast); // tests may add rocks to their own copy
  s.ships.length = 0;
  s.queue.length = 0;
  s.pending.length = 0;
  s.t = 20;
  s.beam.free = 0;
  return s;
}
function put(s, kind, x, y, h, crew = TUNE.ships[kind].crew) {
  const b = { id: s.nextId++, kind, x, y, h, crew, lit: false, dark: 0, threaded: false, born: s.t };
  s.ships.push(b);
  return b;
}
const hold = (b) => ({ hold: true, target: bearingOf(b.x, b.y) });
function run(s, secs, input = () => ({})) {
  const n = Math.round(secs * 60);
  for (let i = 0; i < n && !s.over; i++) step(s, 1 / 60, input());
}
function playNight(coast, night, pilot) {
  const s = createNight(coast, night);
  let target = null;
  let k = 0;
  while (!s.over) {
    if (pilot && k++ % 15 === 0) target = autopilotTarget(s);
    step(s, 1 / 60, target === null ? {} : { hold: true, target });
  }
  return s;
}

// --- The rules (Node) -----------------------------------------------------------------------------

test('beacon AC-4: left alone, no ship on any coast wrecks before 25 s, and the first freighter, in the beam, is home within 8 s', () => {
  for (let c = 0; c < COASTS.length; c++)
    for (let n = 1; n <= 4; n++) {
      const s = createNight(c, n);
      assert.equal(s.ships.length, 1);
      assert.equal(s.ships[0].kind, 'freighter');
      assert.ok(inBeam(s, s.ships[0].x, s.ships[0].y, 4), 'the first freighter starts in the beam');
      let home = null;
      while (s.t < 25) {
        step(s, 1 / 60, {});
        for (const e of s.events.splice(0)) if (e.type === 'home' && home === null) home = s.t;
        assert.equal(s.wrecked, 0, `${COASTS[c].name} night ${n}: a wreck at ${s.t.toFixed(1)} s`);
      }
      assert.ok(home !== null && home <= 8, `${COASTS[c].name}: first home at ${home}`);
      assert.ok(s.home >= 3);
    }
});

test('beacon AC-5: let go, the beam sweeps at 45° a second; held, it swings no faster than 120° a second and only as low as the mouth allows; keys swing it', () => {
  const s = quiet(0);
  const [lo, hi] = beamLimits(s);
  // Clears the breakwater: from the lowest beam angle, a line to the lamp passes inside the mouth.
  const edge = lo - s.beamHalf;
  const x = TUNE.lamp.x + (Math.cos(edge) * (TUNE.lamp.y - TUNE.seaH)) / Math.sin(edge);
  assert.ok(Math.abs(x - TUNE.lamp.x) <= s.coast.mouth - TUNE.ships.freighter.r + 1e-9);
  assert.ok(lo > 25 * D && hi < 155 * D);
  // Sweep.
  s.beam.a = Math.PI / 2;
  s.beam.dir = 1;
  s.beam.free = 1;
  const a0 = s.beam.a;
  run(s, 0.5);
  near(s.beam.a - a0, 22.5 * D, 0.5 * D, 'swept 22.5° in half a second');
  // Held towards a far target: capped at 120° a second.
  s.beam.a = lo;
  run(s, 0.25, () => ({ hold: true, target: hi }));
  near(s.beam.a - lo, 30 * D, 0.5 * D, '30° in a quarter second');
  run(s, 2, () => ({ hold: true, target: hi + 1 }));
  near(s.beam.a, hi, 1e-9, 'stops at the upper limit');
  run(s, 2, () => ({ hold: true, target: 0 }));
  near(s.beam.a, lo, 1e-9, 'stops at the lower limit');
  // Held still, it stays.
  run(s, 1, () => ({ hold: true, target: lo }));
  near(s.beam.a, lo, 1e-9, 'held');
  // Keys: right swings it right (down from the vertical), at 90° a second.
  s.beam.a = Math.PI / 2;
  s.beam.target = Math.PI / 2;
  for (let i = 0; i < 30; i++) step(s, 1 / 60, { swing: 1 });
  near(Math.PI / 2 - s.beam.a, 45 * D, 2 * D, 'half a second of the right key');
});

test('beacon AC-6: a lit ship turns for the lamp at its rate; unlit, the current turns and carries it; lit from anywhere in range with a clear line, it comes home; ships ease apart', () => {
  // Turn rates.
  for (const [kind, rate] of [
    ['freighter', 25],
    ['cutter', 90],
  ]) {
    const s = quiet(0);
    const b = put(s, kind, 50, 120, 0); // heading right, across the bay; the lamp is straight down
    const h0 = b.h;
    run(s, 0.5, () => hold(b));
    near(b.h - h0, rate * 0.5 * D, 1 * D, `${kind} turns ${rate}° a second`);
  }
  // Unlit: turned towards the current and carried by it.
  {
    const s = quiet(0); // the current runs east (+x)
    s.beam.a = beamLimits(s)[1];
    s.beam.free = -100; // the lamp stays put, away from her
    const b = put(s, 'freighter', 50, 60, Math.PI / 2);
    run(s, 2);
    assert.equal(b.lit, false);
    near(Math.PI / 2 - b.h, s.current.bend * 2, 0.5 * D, 'bent towards the current');
    assert.ok(b.x > 50, 'carried east');
  }
  // Any bearing in the beam's range, heading within 30° of the lamp, with no rock on the line: home.
  for (let c = 0; c < COASTS.length; c++) {
    const probe = quiet(c);
    const [lo, hi] = beamLimits(probe);
    let tried = 0;
    for (let a = lo; a <= hi; a += 4 * D)
      for (const d of [60, 120, 200])
        for (const off of [-28, 0, 28]) {
          const s = quiet(c);
          const x = TUNE.lamp.x + Math.cos(a) * d;
          const y = TUNE.lamp.y - Math.sin(a) * d;
          // Clear water, a clear line to the mouth, and room on either side for a turn.
          const clear = (px, py) => !s.coast.rocks.some((r) => Math.hypot(px - r.x, py - r.y) < r.r + 10) && px > leftAt(s.coast, py) + 10 && px < rightAt(s.coast, py) - 10;
          let ok = true;
          for (let f = 0; f <= 1 && ok; f += 0.02) ok = clear(x + (TUNE.lamp.x - x) * f, y + (TUNE.lamp.y - y) * f) || y + (TUNE.lamp.y - y) * f > TUNE.seaH - 8;
          if (!ok || y < 10) continue;
          const h = Math.atan2(TUNE.lamp.y - y, TUNE.lamp.x - x) + off * D;
          const b = put(s, 'freighter', x, y, h);
          tried++;
          run(s, 40, () => hold(b));
          assert.ok(s.home === b.crew && s.wrecked === 0, `${COASTS[c].name}: a freighter at ${x.toFixed(0)},${y.toFixed(0)} heading ${off}° off: home ${s.home}, wrecked ${s.wrecked}`);
        }
    assert.ok(tried > 20, `${COASTS[c].name}: ${tried} cases`);
  }
  // Two ships that touch are eased apart; neither wrecks.
  {
    const s = quiet(0);
    const a = put(s, 'freighter', 50, 100, Math.PI / 2);
    const b = put(s, 'cutter', 51, 101, -Math.PI / 2);
    step(s, 1 / 60, {});
    assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= TUNE.ships.freighter.r + TUNE.ships.cutter.r - 0.5);
    assert.equal(s.wrecked, 0);
  }
});

test('beacon AC-7: a wreck on a rock, the cliffs or the breakwater puts off a lifeboat clear of it; the lifeboat rows only lit, slides along rocks, is lost after 12 s of dark in all, and never leaves the screen', () => {
  // A rock.
  const s = quiet(0);
  const rock = s.coast.rocks[0];
  const b = put(s, 'freighter', rock.x, rock.y - rock.r - 6, Math.PI / 2);
  s.beam.a = beamLimits(s)[1];
  s.beam.free = -100;
  run(s, 1);
  assert.equal(s.wrecked, 1);
  const boat = s.ships.find((x) => x.kind === 'lifeboat');
  assert.ok(boat, 'a lifeboat');
  assert.equal(boat.crew, b.crew);
  assert.ok(Math.hypot(boat.x - rock.x, boat.y - rock.y) >= rock.r + TUNE.ships.lifeboat.r, 'clear of the rock');
  // Unlit: it doesn't row, it only drifts with the current.
  const y0 = boat.y;
  run(s, 1);
  near(boat.y, y0, 0.05, 'no rowing in the dark');
  // Lit: it rows for the lamp (the beam swung onto it first).
  s.beam.a = bearingOf(boat.x, boat.y);
  const before = Math.hypot(boat.x - TUNE.lamp.x, boat.y - TUNE.lamp.y);
  run(s, 1, () => hold(boat));
  assert.ok(Math.hypot(boat.x - TUNE.lamp.x, boat.y - TUNE.lamp.y) < before - TUNE.ships.lifeboat.speed * 0.8, 'rows in the light');
  // Dark time adds up across spells; at 12 s it's lost, and its crew don't come home.
  const dark = boat.dark;
  s.beam.a = beamLimits(s)[1];
  s.beam.free = -100;
  run(s, 12 - dark - 0.2);
  assert.ok(s.ships.includes(boat), 'still there just before 12 s of dark');
  run(s, 0.5);
  assert.ok(!s.ships.includes(boat), 'lost');
  assert.equal(s.lost, b.crew);
  // Slides along a rock: lit straight through one, it ends up on the far side or along it, never in it.
  {
    const q = quiet(0);
    const r = q.coast.rocks[1];
    const lb = put(q, 'lifeboat', r.x, r.y - r.r - 3, Math.PI / 2, 2);
    for (let i = 0; i < 240; i++) {
      step(q, 1 / 60, { hold: true, target: bearingOf(r.x, r.y) });
      assert.ok(Math.hypot(lb.x - r.x, lb.y - r.y) >= r.r + TUNE.ships.lifeboat.r - 0.05, 'never inside the rock');
    }
    assert.equal(q.wrecked, 0);
  }
  // The cliffs and the breakwater wreck ships; a lifeboat put off there is clear of them.
  for (const [x, y, h] of [
    [12, 150, Math.PI],
    [80, 290, Math.PI / 2],
  ]) {
    const q = quiet(0);
    q.beam.a = beamLimits(q)[0] - 0.01;
    q.beam.free = -100;
    put(q, 'freighter', x, y, h);
    run(q, 3);
    assert.equal(q.wrecked, 1, `a wreck at ${x},${y}`);
    const lb = q.ships.find((v) => v.kind === 'lifeboat');
    assert.ok(lb && !driftHits(q, 'lifeboat', lb.x, lb.y, lb.h, 0.01));
  }
  // Nothing leaves the screen: lifeboats drifting in a current and a gale stay inside the bay.
  {
    const q = quiet(4);
    for (let i = 0; i < 6; i++) put(q, 'lifeboat', 20 + i * 12, 5 + i * 30, 0, 1);
    q.t = TUNE.gale.at - 1;
    q.beam.free = -1000;
    q.beam.a = beamLimits(q)[0];
    for (let i = 0; i < 60 * 11; i++) {
      step(q, 1 / 60, {});
      for (const lb of q.ships) assert.ok(lb.x > 0 && lb.x < 100 && lb.y > 0 && lb.y < TUNE.seaH, `lifeboat at ${lb.x},${lb.y}`);
    }
  }
});

test('beacon AC-8: a ship or lifeboat crossing the mouth is home and counts as many sailors as its crew; the night knows every sailor from the start', () => {
  const s = createNight(0, 1);
  const crews = s.ships.reduce((n, b) => n + b.crew, 0) + s.queue.reduce((n, q) => n + q.crew, 0);
  assert.equal(s.total, crews);
  assert.equal(s.total, 68);
  const q = quiet(0);
  const lb = put(q, 'lifeboat', 50, 290, Math.PI / 2, 3);
  const f = put(q, 'freighter', 50, 230, Math.PI / 2);
  run(q, 6, () => ({ hold: true, target: Math.PI / 2 }));
  assert.equal(q.home, 3 + 3);
  assert.equal(q.moored.length, 2);
  void lb;
  void f;
});

test('beacon AC-9: each lantern shows 2 s ahead; no ship comes in on a heading that hits within 4 s (8 s in fog); one to four ships on the sea until 190 s, five in the last wave', () => {
  for (let c = 0; c < COASTS.length; c++) {
    const s = createNight(c, 2);
    const shown = new Map();
    let maxSea = 0;
    while (!s.over) {
      const before = new Set(s.ships.map((b) => b.id));
      step(s, 1 / 60, {});
      for (const e of s.events.splice(0)) if (e.type === 'horn') shown.set(e.x, s.t);
      for (const b of s.ships)
        if (!before.has(b.id) && b.kind !== 'lifeboat' && b.y < 0) {
          // A new arrival: its lantern showed 2 s before, and its heading is fair.
          // (matched by position: two ships that touch are eased apart, so she may have moved a hair)
          const key = [...shown.keys()].sort((p, q) => Math.abs(p - b.x) - Math.abs(q - b.x))[0];
          const at = Math.abs(key - b.x) < 2 ? shown.get(key) : undefined;
          shown.delete(key);
          assert.ok(at !== undefined, 'its lantern showed');
          near(s.t - at, TUNE.warn, 0.05, 'shown 2 s ahead');
          const ahead = fogOn(s) || (s.t < TUNE.fog.at && s.t + TUNE.fairAheadFog > TUNE.fog.at) ? TUNE.fairAheadFog : TUNE.fairAhead;
          assert.ok(!driftHits(s, b.kind, b.x, b.y, b.h, ahead), `${COASTS[c].name}: a fair heading at ${s.t.toFixed(1)}`);
        }
      if (s.t < TUNE.lastArrival) {
        const n = onSea(s);
        assert.ok(n >= 1, `${COASTS[c].name}: an empty sea at ${s.t.toFixed(1)}`);
        maxSea = Math.max(maxSea, n);
        assert.ok(n <= (s.t >= TUNE.wave[0] - TUNE.warn ? 5 : 4), `${COASTS[c].name}: ${n} ships at ${s.t.toFixed(1)}`);
      }
    }
    assert.ok(maxSea >= 3);
  }
});

test('beacon AC-10: a cutter by 45 s, fog that halves the reach for 30 s, a gale whose whitecaps show 2 s before a 6 s shove of every ship, and a last wave of five; none come in after 190 s', () => {
  const s = createNight(0, 1);
  let cutter = null;
  const arrivals = [];
  let warn = null;
  let gale = null;
  while (!s.over) {
    step(s, 1 / 60, {});
    for (const e of s.events.splice(0)) {
      if (e.type === 'galeWarn') warn = s.t;
      if (e.type === 'gale') gale = s.t;
    }
    for (const b of s.ships)
      if (b.y < 0 && !arrivals.some((a) => a.id === b.id) && b.kind !== 'lifeboat') {
        arrivals.push({ id: b.id, t: s.t, kind: b.kind });
        if (b.kind === 'cutter' && cutter === null) cutter = s.t;
      }
    if (s.t > TUNE.fog.at + 1 && s.t < TUNE.fog.at + TUNE.fog.dur - 1) near(reachOf(s), TUNE.reach / 2, 1e-9, 'fog');
    if (s.t > TUNE.fog.at + TUNE.fog.dur + 1 && s.t < TUNE.fog.at + TUNE.fog.dur + 2) near(reachOf(s), TUNE.reach, 1e-9, 'clear');
  }
  assert.ok(cutter !== null && cutter <= 45, `first cutter at ${cutter}`);
  assert.ok(arrivals.filter((a) => a.t < 38).every((a) => a.kind === 'freighter'), 'only freighters before the first cutter');
  near(gale - warn, 2, 0.02, 'whitecaps 2 s ahead');
  assert.ok(arrivals.every((a) => a.t <= TUNE.lastArrival + 0.01), 'none after 190 s');
  assert.ok(arrivals.filter((a) => a.t >= TUNE.wave[0] - 0.01).length >= 5, 'the last wave');
  // The gale shoves every ship, lit or not, for 6 s.
  const q = quiet(0);
  const lit = put(q, 'freighter', 50, 150, Math.PI / 2);
  const dark = put(q, 'freighter', 30, 60, Math.PI / 2);
  q.t = TUNE.gale.at - 0.01;
  const x0 = [lit.x, dark.x];
  run(q, 1, () => hold(lit));
  assert.ok(galeOn(q));
  const side = q.gale.side;
  assert.ok((dark.x - x0[1]) * side > TUNE.gale.push * 0.8, 'the dark ship is shoved');
  assert.ok((lit.x - x0[0]) * side > TUNE.gale.push * 0.3, 'the lit ship is shoved too');
  run(q, 6);
  assert.equal(galeOn(q), false, 'over after 6 s');
});

test('beacon AC-11: dawn at 210 s on an empty sea, or when the last ship is resolved, by 240 s at the latest; stars at 60%, 85% and all home with no wreck', () => {
  // Empty sea at 210 s: dawn then.
  const a = quiet(0);
  a.t = 205;
  run(a, 10);
  assert.ok(a.over);
  near(a.t, 210, 0.02, 'dawn at 210 s');
  // A ship still at sea: dawn waits for her.
  const b = quiet(0);
  b.t = 205;
  const ship = put(b, 'freighter', 50, 200, Math.PI / 2);
  run(b, 30, () => hold(ship));
  assert.ok(b.over && b.t > 210 && b.t < 240 && b.home === 3);
  // Stuck: a lifeboat kept lit against a rock dead ahead of the lamp, in slack water, until 240 s.
  // At 240 s she isn't home.
  const c = quiet(0);
  c.t = 200;
  c.current.speed = 0;
  c.coast.rocks.push({ x: TUNE.lamp.x, y: 200, r: 4 });
  const rock = c.coast.rocks.at(-1);
  const lb = put(c, 'lifeboat', rock.x, rock.y - rock.r - 2, Math.PI / 2, 2);
  c.total = 2;
  run(c, 60, () => ({ hold: true, target: Math.PI / 2 }));
  assert.ok(c.over);
  near(c.t, 240, 0.02, 'dawn at 240 s at the latest');
  assert.equal(c.home, 0);
  void lb;
  // Stars.
  const st = (home, total, wrecked) => starsOf({ home, total, wrecked });
  assert.equal(st(40, 68, 0), 0);
  assert.equal(st(41, 68, 3), 1);
  assert.equal(st(58, 68, 3), 2);
  assert.equal(st(68, 68, 1), 2);
  assert.equal(st(68, 68, 0), 3);
});

test('beacon AC-12: the same coast and night give the same night; the autopilot brings home 80% or more on every coast, and no input under 45%', () => {
  const fingerprint = (s) => s.queue.map((q) => `${q.kind}@${q.t.toFixed(3)}`).join(',') + `|${s.ships[0].x.toFixed(4)}|${s.gale.side}`;
  for (let c = 0; c < COASTS.length; c++) {
    assert.equal(fingerprint(createNight(c, 7)), fingerprint(createNight(c, 7)));
    assert.notEqual(fingerprint(createNight(c, 7)), fingerprint(createNight(c, 8)));
    const a = playNight(c, 3, false);
    const b = playNight(c, 3, false);
    assert.deepEqual([a.home, a.wrecked, a.lost, a.t], [b.home, b.wrecked, b.lost, b.t], 'replays the same');
  }
  for (let c = 0; c < COASTS.length; c++) {
    let home = 0;
    let total = 0;
    let idle = 0;
    for (const n of [1, 2]) {
      const s = playNight(c, n, true);
      home += s.home;
      total += s.total;
      idle += playNight(c, n, false).home;
    }
    assert.ok(home / total >= 0.8, `${COASTS[c].name}: the autopilot brought ${home} of ${total} home`);
    assert.ok(idle / total < 0.45, `${COASTS[c].name}: no input brought ${idle} of ${total} home`);
  }
});

test('beacon AC-13: a ship home through the gap adds close calls, not windows or stars; a starless night widens the beam 1° and slows the current 10%', () => {
  for (let c = 0; c < COASTS.length; c++) {
    const s = quiet(c);
    const [i, j] = s.coast.gap;
    const r1 = s.coast.rocks[i];
    const r2 = s.coast.rocks[j];
    // A cutter between the two rocks, heading for the lamp.
    const mx = (r1.x + r2.x) / 2;
    const my = (r1.y + r2.y) / 2;
    const h = Math.atan2(TUNE.lamp.y - my, TUNE.lamp.x - mx);
    const b = put(s, 'cutter', mx - Math.cos(h) * 14, my - Math.sin(h) * 14, h);
    run(s, 20, () => hold(b));
    assert.equal(s.wrecked, 0, `${COASTS[c].name}: through the gap without a wreck`);
    assert.equal(s.home, 2, 'windows count the crew once');
    assert.equal(s.closeCalls, 2, 'and the close calls count them again');
    assert.equal(s.threaded, 1);
  }
  const plain = createNight(2, 1);
  const eased = createNight(2, 1, { assist: 1 });
  near(eased.beamHalf - plain.beamHalf, 1 * D, 1e-9, 'a degree wider');
  near(eased.current.speed / plain.current.speed, 0.9, 1e-9, 'current 10% slower');
  near(eased.current.bend / plain.current.bend, 0.9, 1e-9, 'and its turn');
});

// --- The page (Chromium) ---------------------------------------------------------------------------

test('beacon AC-4: the page opens on a moving night behind the start card; Start puts the beam on a freighter that comes home within 8 s and lights its windows', async () => {
  const { context, page, errors } = await open();
  assert.equal(await page.isVisible('[data-screen="start"]'), true);
  const a = await page.evaluate(() => window.__beacon.s.t);
  const shot1 = await page.locator('canvas').screenshot();
  await page.waitForTimeout(600);
  const shot2 = await page.locator('canvas').screenshot();
  assert.ok((await page.evaluate(() => window.__beacon.s.t)) > a, 'the clock runs');
  assert.notDeepEqual(shot1, shot2, 'the picture moves');
  await page.click('[data-start]');
  const st = await page.evaluate(() => {
    const b = window.__beacon;
    const f = b.s.ships[0];
    return { mode: b.mode, kind: f.kind, lit: b.inBeam(f.x, f.y, 4), hud: !document.querySelector('[data-hud]').hidden };
  });
  assert.deepEqual(st, { mode: 'night', kind: 'freighter', lit: true, hud: true });
  await page.waitForFunction(() => window.__beacon.s.home >= 3, null, { timeout: 9000 });
  assert.ok((await page.evaluate(() => window.__beacon.s.t)) <= 8.2);
  assert.equal(await page.textContent('[data-home]'), '3');
  assert.equal(await page.textContent('[data-total]'), '68');
  assert.deepEqual(errors, []);
  await context.close();
});

test('beacon AC-5: a sideways drag, by finger or mouse, swings the beam 0.4° a pixel; a second finger is ignored', async () => {
  const { context, page } = await open({ hasTouch: true });
  await page.click('[data-start]');
  await page.evaluate(() => {
    const b = window.__beacon;
    b.manual = true;
    b.s.beam.a = Math.PI / 2;
    b.s.beam.free = 0;
  });
  // Mouse: 50 px right, then let the beam catch up.
  await page.mouse.move(200, 500);
  await page.mouse.down();
  await page.mouse.move(225, 500);
  await page.mouse.move(250, 500);
  await page.evaluate(() => window.__beacon.step(1));
  const a1 = await page.evaluate(() => window.__beacon.s.beam.a);
  near(Math.PI / 2 - a1, 20 * D, 0.5 * D, '50 px right is 20° right');
  await page.mouse.up();
  // Touch: a first finger drags, a second finger's moves change nothing.
  const cdp = await context.newCDPSession(page);
  const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points });
  await page.evaluate(() => {
    window.__beacon.s.beam.a = Math.PI / 2;
    window.__beacon.s.beam.target = Math.PI / 2;
  });
  await touch('touchStart', [{ x: 200, y: 500, id: 1 }]);
  await touch('touchMove', [{ x: 175, y: 500, id: 1 }]);
  await touch('touchStart', [{ x: 175, y: 500, id: 1 }, { x: 100, y: 400, id: 2 }]);
  await touch('touchMove', [{ x: 175, y: 500, id: 1 }, { x: 300, y: 400, id: 2 }]);
  await page.evaluate(() => window.__beacon.step(1));
  const a2 = await page.evaluate(() => window.__beacon.s.beam.a);
  near(a2 - Math.PI / 2, 10 * D, 0.5 * D, '25 px left is 10° left; the second finger did nothing');
  await touch('touchEnd', []);
  await context.close();
});

test('beacon AC-11: the dawn card shows the stars, sailors home and the best; a star opens the next coast; the fifth has no Next; the best persists over a reload', async () => {
  const { context, page } = await open();
  await page.click('[data-start]');
  const finish = (home, wrecked) =>
    page.evaluate(
      ([home, wrecked]) => {
        const b = window.__beacon;
        b.manual = true;
        const s = b.s;
        s.ships.length = 0;
        s.queue.length = 0;
        s.pending.length = 0;
        s.home = home;
        s.wrecked = wrecked;
        s.t = 209.9;
        b.step(0.5);
        return b.mode;
      },
      [home, wrecked]
    );
  assert.equal(await finish(60, 2), 'dawn');
  assert.equal(await page.isVisible('[data-screen="dawn"]'), true);
  assert.equal(await page.getAttribute('[data-stars]', 'aria-label'), '2 of 3 stars');
  assert.equal(await page.textContent('[data-tally-home]'), '60');
  assert.match(await page.textContent('[data-best]'), /best 60 of 68/);
  assert.equal(await page.isVisible('[data-next-coast]'), true, 'a star opened the next coast');
  await page.click('[data-next-coast]');
  assert.equal(await page.evaluate(() => window.__beacon.s.coastIndex), 1);
  assert.match(page.url(), /#coast=2$/);
  // A starless night opens nothing.
  assert.equal(await finish(10, 9), 'dawn');
  assert.equal(await page.isVisible('[data-next-coast]'), false);
  await page.reload();
  await page.waitForFunction(() => window.__beacon);
  const mem = await page.evaluate(() => window.__beacon.mem);
  assert.equal(mem.open, 1);
  assert.equal(mem.best[0].home, 60);
  assert.equal(mem.best[0].stars, 2);
  await context.close();
  // On the fifth coast, no Next.
  const fifth = await open({ hash: '#coast=5', mem: { open: 4 } });
  await fifth.page.click('[data-start]');
  await fifth.page.evaluate(() => {
    const b = window.__beacon;
    b.manual = true;
    Object.assign(b.s, { home: 68, wrecked: 0, t: 209.9 });
    b.s.ships.length = 0;
    b.s.queue.length = 0;
    b.s.pending.length = 0;
    b.step(0.5);
  });
  assert.equal(await fifth.page.isVisible('[data-screen="dawn"]'), true);
  assert.equal(await fifth.page.isVisible('[data-next-coast]'), false);
  assert.equal(await fifth.page.isVisible('[data-again]'), true);
  await fifth.context.close();
});

test('beacon AC-13: after a starless night the coast is eased on any next opening, a reload included, until it earns a star', async () => {
  const { context, page } = await open();
  await page.click('[data-start]');
  const end = (home) =>
    page.evaluate((home) => {
      const b = window.__beacon;
      b.manual = true;
      Object.assign(b.s, { home, wrecked: 3, t: 209.9 });
      b.s.ships.length = 0;
      b.s.queue.length = 0;
      b.s.pending.length = 0;
      b.step(0.5);
    }, home);
  await end(5);
  await page.reload();
  await page.waitForFunction(() => window.__beacon);
  await page.click('[data-start]');
  const eased = await page.evaluate(() => [window.__beacon.s.assist, window.__beacon.s.beamHalf]);
  assert.equal(eased[0], 1);
  near(eased[1], TUNE.beamHalf + 1 * D, 1e-9, 'a degree wider');
  await end(60);
  await page.click('[data-again]');
  assert.equal(await page.evaluate(() => window.__beacon.s.assist), 0, 'a star clears it');
  await context.close();
});

test('beacon AC-14: #coast=N opens an open coast; anything else opens coast 1, without an error, and the address shows the coast opened', async () => {
  for (const [hash, mem, want] of [
    ['#coast=3', { open: 4 }, 2],
    ['#coast=3', { open: 1 }, 0],
    ['#coast=0', { open: 4 }, 0],
    ['#coast=6', { open: 4 }, 0],
    ['#coast=abc', { open: 4 }, 0],
    ['#coast=2.5', { open: 4 }, 0],
    ['', null, 0],
  ]) {
    const { context, page, errors } = await open({ hash, mem });
    assert.equal(await page.evaluate(() => window.__beacon.s.coastIndex), want, `${hash} with ${JSON.stringify(mem)}`);
    assert.match(page.url(), new RegExp(`#coast=${want + 1}$`));
    assert.equal(await page.textContent('[data-coast-name]'), COASTS[want].name);
    assert.deepEqual(errors, []);
    await context.close();
  }
});

test('beacon AC-15: hiding the page pauses the night; it resumes only on a tap, which doesn\'t move the beam', async () => {
  const { context, page } = await open();
  await page.click('[data-start]');
  await page.waitForTimeout(300);
  const before = await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    const s = window.__beacon.s;
    return { mode: window.__beacon.mode, t: s.t, beam: s.beam.a, x: s.ships[0]?.x };
  });
  assert.equal(before.mode, 'paused');
  await page.waitForTimeout(700);
  const during = await page.evaluate(() => {
    const s = window.__beacon.s;
    return { t: s.t, beam: s.beam.a, x: s.ships[0]?.x };
  });
  assert.deepEqual(during, { t: before.t, beam: before.beam, x: before.x });
  assert.equal(await page.isVisible('[data-screen="pause"]'), true);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => window.__beacon.mode), 'paused', 'coming back alone doesn\'t resume');
  await page.click('[data-resume]');
  const after = await page.evaluate(() => ({ mode: window.__beacon.mode, held: window.__beacon.s.beam.held }));
  assert.equal(after.mode, 'night');
  assert.ok(!after.held, 'the tap didn\'t take hold of the beam');
  await context.close();
});

test('beacon AC-16: until the first touch a ghost finger shows the drag; after it, never again, a reload too', async () => {
  const { context, page } = await open();
  await page.click('[data-start]');
  assert.equal(await page.evaluate(() => window.__beacon.ghostShown()), true);
  await page.mouse.move(200, 500);
  await page.mouse.down();
  await page.mouse.move(220, 500);
  await page.mouse.up();
  assert.equal(await page.evaluate(() => window.__beacon.ghostShown()), false);
  await page.reload();
  await page.waitForFunction(() => window.__beacon);
  await page.click('[data-start]');
  assert.equal(await page.evaluate(() => window.__beacon.ghostShown()), false);
  await context.close();
});

test('beacon AC-17: a horn, a ship home, a wreck and a lost lifeboat each sound, and nothing plays while muted', async () => {
  const { context, page } = await open({ audio: true });
  await page.click('[data-start]'); // unlocks audio
  await page.waitForFunction(() => window.__decoded >= 8);
  const scenario = () =>
    page.evaluate(() => {
      const b = window.__beacon;
      b.manual = true;
      const s = b.s;
      const n0 = window.__played.length;
      const from = b.played.length;
      // The first freighter comes home, a horn sounds for the next.
      for (let i = 0; i < 60 * 9; i++) b.step(1 / 60);
      // A wreck on a rock, then its lifeboat left in the dark until it's lost.
      const rock = s.coast.rocks[0];
      s.ships.length = 0;
      s.queue.length = 0;
      s.pending.length = 0;
      s.ships.push({ id: 999, kind: 'freighter', x: rock.x, y: rock.y - rock.r - 5, h: Math.PI / 2, crew: 3, lit: false, dark: 0, threaded: false });
      s.beam.a = b.beamLimits()[1];
      s.beam.free = -1000;
      for (let i = 0; i < 60 * 14; i++) b.step(1 / 60);
      return { names: b.played.slice(from), sounded: window.__played.length - n0 };
    });
  const loud = await scenario();
  for (const n of ['horn', 'bell', 'bump', 'splash', 'lowbell']) assert.ok(loud.names.includes(n), `${n} in ${loud.names}`);
  assert.ok(loud.sounded >= 5);
  await page.click('[data-mute]');
  await page.evaluate(() => window.__beacon.start({ coast: 0 }));
  const quietRun = await scenario();
  assert.equal(quietRun.sounded, 0, 'nothing reaches the speakers while muted');
  await context.close();
});

test('beacon AC-18: on a phone nothing scrolls, buttons are 44 px or more, the canvas is at most 2×, the whole bay is in view either way up, and a ship covers the same distance at 60 and 120 Hz', async () => {
  const { context, page } = await open({ deviceScaleFactor: 3, hasTouch: true, isMobile: true });
  const sizes = async () =>
    page.$$eval('button, a', (bs) =>
      bs
        .filter((b) => b.offsetParent !== null && getComputedStyle(b).visibility !== 'hidden')
        .map((b) => {
          const r = b.getBoundingClientRect();
          return { t: b.textContent.trim() || b.getAttribute('aria-label'), w: r.width, h: r.height };
        })
    );
  for (const b of await sizes()) assert.ok(b.w >= 44 && b.h >= 44, `${b.t}: ${b.w}×${b.h}`);
  await page.click('[data-start]');
  for (const b of await sizes()) assert.ok(b.w >= 44 && b.h >= 44, `${b.t}: ${b.w}×${b.h}`);
  for (const [w, h] of [
    [390, 844],
    [844, 390],
    [360, 640],
  ]) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(200);
    const d = await page.evaluate(() => {
      const b = window.__beacon;
      const top = b.toScreen(0, 0);
      const right = b.toScreen(100, 0);
      const town = b.toScreen(0, b.TUNE.fieldH);
      return { scroll: document.scrollingElement.scrollHeight - innerHeight, cw: document.getElementById('sea').width, w: innerWidth, h: innerHeight, top, right, town };
    });
    assert.ok(d.scroll <= 0, 'no scroll');
    assert.ok(d.cw <= d.w * 2, `canvas ${d.cw} for ${d.w}`);
    assert.ok(d.top.x >= -0.5 && d.right.x <= d.w + 0.5 && d.top.y >= 0 && d.town.y <= d.h + 0.5, `${w}×${h}: the bay in view ${JSON.stringify(d)}`);
  }
  await context.close();
  // Delta time: the same two seconds at 60 and at 120 steps a second.
  const dist = (hz) => {
    const s = quiet(0);
    const b = put(s, 'cutter', 50, 100, Math.PI / 2);
    for (let i = 0; i < 2 * hz; i++) step(s, 1 / hz, hold(b));
    return Math.hypot(b.x - 50, b.y - 100);
  };
  near(dist(120) / dist(60), 1, 0.01, 'same distance');
});

test('beacon AC-19: Beacon plays offline once it has been played', async () => {
  const { context, page } = await open();
  await page.evaluate(() => navigator.serviceWorker.register('../sw.js'));
  await page.evaluate(() => Promise.race([navigator.serviceWorker.ready, new Promise((r) => setTimeout(r, 10000))]));
  await page.reload(); // controlled now: this load caches the game's files
  await page.waitForFunction(() => window.__beacon);
  await page.waitForLoadState('networkidle');
  await context.setOffline(true);
  await page.reload();
  await page.waitForFunction(() => window.__beacon);
  await page.click('[data-start]');
  assert.equal(await page.evaluate(() => window.__beacon.mode), 'night');
  assert.ok(await page.evaluate(() => [...document.images].length === 0 && performance.getEntriesByType('resource').some((r) => r.name.endsWith('atlas.png'))));
  await context.close();
});

test('beacon: each state shows only its own cards, as in the spec\'s state table', async () => {
  const { context, page } = await open();
  const vis = () =>
    page.evaluate(() => ({
      start: !document.querySelector('[data-screen="start"]').hidden,
      dawn: !document.querySelector('[data-screen="dawn"]').hidden,
      pause: !document.querySelector('[data-screen="pause"]').hidden,
      ghost: window.__beacon.ghostShown(),
    }));
  assert.deepEqual(await vis(), { start: true, dawn: false, pause: false, ghost: false });
  await page.click('[data-start]');
  assert.deepEqual(await vis(), { start: false, dawn: false, pause: false, ghost: true });
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  assert.deepEqual(await vis(), { start: false, dawn: false, pause: true, ghost: false });
  await page.click('[data-resume]');
  await page.evaluate(() => {
    const b = window.__beacon;
    b.manual = true;
    Object.assign(b.s, { t: 209.9 });
    b.s.ships.length = 0;
    b.s.queue.length = 0;
    b.s.pending.length = 0;
    b.step(0.5);
  });
  assert.deepEqual(await vis(), { start: false, dawn: true, pause: false, ghost: false });
  await context.close();
});

void wrapAngle;

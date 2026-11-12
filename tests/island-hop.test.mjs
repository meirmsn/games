// Tests for Island Hop. Run: scripts/check-slow.sh.
// clock-checked: they wait on the game's state and its frames, not on time.
// The rules live in island-hop/rules.js with no DOM, so most acceptance items run them here in Node;
// the page's own items (cards, input, the camera, sound, layout, offline) drive the game in Chromium
// through window.__hop.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FAKE_AUDIO } from './fake-audio.mjs';
import { serve } from './serve.mjs';
import { launch, realFrames, waitFor } from './clock.mjs';
import { ROWS, ISLANDS, CARS, MAP_VERSION, LEISURE } from '../island-hop/map.js';
import { ATLAS } from '../island-hop/atlas.js';
import {
  RULES,
  MISSIONS,
  WORLD,
  iso,
  createMission,
  step,
  youAt,
  youBoat,
  youCar,
  tileAt,
  navigable,
  isWalkable,
  isRoad,
  walkPath,
  sailPath,
  gridToStick,
  runPilot,
  medalFor,
  medalTimes,
  trafficAt,
  leisureAt,
  obstaclesAt,
  TRUNK_R,
  PROP_R,
  personBlocked,
  TRAFFIC_R,
} from '../island-hop/rules.js';

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

async function open({ hash = '', audio = false, mem = null, ...opts } = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, ...opts });
  if (audio) await context.addInitScript(FAKE_AUDIO);
  if (mem) await context.addInitScript((m) => localStorage.setItem('island-hop.v1', JSON.stringify(m)), mem);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(BASE + 'island-hop/' + hash);
  await page.waitForFunction(() => window.__hop);
  return { context, page, errors };
}

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b} ±${tol}`);
const D = Math.PI / 180;
const centre = (t) => ({ x: t.x + 0.5, y: t.y + 0.5 });

// A mission in play with no traffic, for setting up one situation.
function play(index = 0) {
  const s = createMission(index, { phase: 'play' });
  s.traffic = [];
  return s;
}
function run(s, secs, stick = null) {
  const n = Math.round(secs / RULES.dt);
  for (let i = 0; i < n; i++) step(s, RULES.dt, typeof stick === 'function' ? stick(s) : stick);
}
// Put you ashore at a tile centre (or a point).
function ashore(s, x, y) {
  s.mode = 'walk';
  s.person.x = x;
  s.person.y = y;
  s.person.tile = `${Math.floor(x)},${Math.floor(y)}`;
}
// Put your boat at a point and heading, moving at v.
function afloat(s, kind, x, y, hDeg, v = 0) {
  s.mode = 'boat';
  s.you.boat = kind;
  const b = youBoat(s);
  Object.assign(b, { x, y, h: hDeg * D, v, berth: null, hold: 0, left: null });
  return b;
}
const toward = (from, to, len = 1) => gridToStick(to.x - from.x, to.y - from.y, len);
const events = (s, type) => s.events.filter((e) => e.type === type);

// --- The map (Node) -------------------------------------------------------------------------------------------

test('island-hop AC-5: every stop can be reached in each mission, every berth from water its boats can reach, the lagoon and footbridge are the rowboat\'s, and the large islands give a real choice of berth', () => {
  // Each mission's gold route reaches every stop with only the boats and cars it provides.
  for (const [i, m] of MISSIONS.entries()) {
    const s = runPilot(i, m.gold);
    assert.equal(s.phase, 'done', `mission ${i + 1} finishes on its gold route`);
    assert.deepEqual(
      s.stops.map((st) => st.done),
      m.stops.map(() => true)
    );
  }
  // Every stop's doormat is walkable and reachable on foot from a jetty on its island.
  for (const st of Object.values(WORLD.stops)) {
    assert.ok(isWalkable(tileAt(st.mat.x, st.mat.y)), `${st.name}'s mat`);
    assert.ok(WORLD.berths.some((b) => walkPath(centre(b.end), st.mat)), `${st.name} reachable from a jetty`);
  }
  // Every berth touches water its boats reach from the open sea: deep berths for every boat, the
  // shallow ones (Lagoon Isle's and Far Cay's) only for the rowboat.
  const sea = { x: 50.5, y: 40.5 };
  for (const b of WORLD.berths) {
    const kinds = b.shallow ? ['row'] : ['row', 'motor', 'speed'];
    for (const k of kinds) assert.ok(sailPath(k, sea, b), `${b.id} by the ${k}`);
    if (b.shallow) for (const k of ['motor', 'speed']) assert.equal(navigable(k, tileAt(b.x, b.y)), false, `${b.id} not for the ${k}`);
  }
  // The lagoon: shallow water only the rowboat sails; the footbridge only it passes under, and people walk over.
  let shallow = 0;
  for (let y = 0; y < ROWS.length; y++)
    for (let x = 0; x < ROWS.length; x++) {
      const c = ROWS[y][x];
      if (c === ',' || c === 'f') {
        shallow++;
        assert.ok(navigable('row', c) && !navigable('motor', c) && !navigable('speed', c), `${x},${y}`);
      }
      if (c === 'f') assert.ok(isWalkable(c));
    }
  assert.ok(shallow > 100);
  assert.ok(ROWS.some((r) => r.includes('f')), 'a footbridge');
  // The two large islands: three berths, at least two cars, and the berth nearest a door has no car,
  // 6–10 tiles from the berth by a car.
  for (const isl of ISLANDS.filter((i) => i.size === 'large')) {
    const on = (p) => p.x >= isl.x0 && p.x <= isl.x1 && p.y >= isl.y0 && p.y <= isl.y1;
    // A berth belongs to the island its jetty's root stands on.
    const shore = (b) => {
      const root = b.planks.at(-1);
      return { x: 2 * root.x - (b.planks.at(-2) || b).x, y: 2 * root.y - (b.planks.at(-2) || b).y };
    };
    const berths = WORLD.berths.filter((b) => on(shore(b)));
    const cars = Object.keys(CARS).map((k) => ({ x: +k.split(',')[0], y: +k.split(',')[1] })).filter(on);
    const doors = Object.values(WORLD.stops).filter((st) => on(st.mat)).map((st) => st.mat);
    assert.equal(berths.length, 3, `${isl.name}: ${berths.map((b) => b.id)}`);
    assert.ok(cars.length >= 2, `${isl.name}: cars`);
    const dd = (b) => Math.min(...doors.map((d) => Math.hypot(d.x - b.x, d.y - b.y)));
    const byCar = (b) => cars.some((c) => Math.hypot(c.x - b.end.x, c.y - b.end.y) <= 2.5);
    const nearest = berths.reduce((a, b) => (dd(b) < dd(a) ? b : a));
    assert.ok(!byCar(nearest), `${isl.name}: ${nearest.id} is nearest a door and has no car`);
    const carBerth = berths.find(byCar);
    assert.ok(carBerth, `${isl.name}: a berth by a car`);
    const d = Math.hypot(carBerth.x - nearest.x, carBerth.y - nearest.y);
    assert.ok(d >= 6 && d <= 10, `${isl.name}: ${nearest.id} to ${carBerth.id} is ${d.toFixed(1)}`);
  }
  // Five islands: two large, three small, and the small ones have footpaths only.
  assert.deepEqual(ISLANDS.map((i) => i.size).sort(), ['large', 'large', 'small', 'small', 'small']);
  for (const isl of ISLANDS.filter((i) => i.size === 'small'))
    for (let y = isl.y0; y <= isl.y1; y++) for (let x = isl.x0; x <= isl.x1; x++) assert.ok(!isRoad(ROWS[y][x]), `${isl.name} has no roads`);
});

// --- Moving (Node) -----------------------------------------------------------------------------------------------

test('island-hop AC-6: the stick moves the boat, the person and the car the way it points on screen, at each mode\'s speed', () => {
  // On foot, on open ground: 1.6 tiles a second, toward the stick's side of the screen.
  // A spot with open ground all round.
  let open3 = null;
  for (let y = 2; y < 40 && !open3; y++)
    for (let x = 2; x < 40 && !open3; x++) {
      let ok = true;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (!isWalkable(tileAt(x + dx, y + dy))) ok = false;
      if (ok) open3 = { x: x + 0.5, y: y + 0.5 };
    }
  assert.ok(open3);
  for (const [sx, sy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
    const s = play(1);
    ashore(s, open3.x, open3.y);
    const p0 = iso.toScreen(s.person.x, s.person.y);
    run(s, 0.3, { x: sx, y: sy });
    const p1 = iso.toScreen(s.person.x, s.person.y);
    assert.ok((p1.x - p0.x) * sx + (p1.y - p0.y) * sy > 0, `walks toward ${sx},${sy}`);
  }
  {
    const s = play(1);
    ashore(s, 14.5, 3.5); // the ring road's top straight, along x
    const x0 = s.person.x;
    run(s, 2, gridToStick(1, 0));
    near((s.person.x - x0) / 2, RULES.walk, 0.02, 'walking speed');
  }
  // By car along the road: 5 tiles a second.
  {
    const s = play(1);
    s.mode = 'car';
    s.you.car = 'portN';
    const c = youCar(s);
    Object.assign(c, { x: 10.5, y: 3.5, node: { x: 10, y: 3 }, target: null });
    run(s, 0.2, gridToStick(1, 0));
    const x0 = c.x;
    run(s, 1, gridToStick(1, 0));
    near(c.x - x0, RULES.car, 0.15, 'car speed');
  }
  // Boats at full stick in open water reach their top speeds.
  for (const [kind, top] of [['row', 2.2], ['motor', 3.5], ['speed', 5.5]]) {
    const s = play(5);
    const b = afloat(s, kind, 52, 25, 90);
    run(s, 3, gridToStick(0, 1));
    near(b.v, top, 0.01, `${kind} top speed`);
    const y0 = b.y;
    run(s, 1, gridToStick(0, 1));
    near(b.y - y0, top, 0.05, `${kind} covers its speed in a second`);
  }
});

test('island-hop AC-6: the person slides along walls and can\'t walk off a jetty; the car keeps to the roads and takes the branch the stick points at; a boat nosed into a cliff is free within 2 s', () => {
  // Pressed diagonally into a building, the person slides along it.
  {
    const s = play(1);
    ashore(s, 12.5, 5.5); // under Port Town's school (11,4) and the mat (12,4)
    const before = { x: s.person.x, y: s.person.y };
    run(s, 1, gridToStick(-1, -1));
    assert.ok(Math.hypot(s.person.x - before.x, s.person.y - before.y) > 0.3, 'it slid');
    for (const [dx, dy] of [[0.2, 0.2], [-0.2, 0.2], [0.2, -0.2], [-0.2, -0.2]]) assert.ok(isWalkable(tileAt(s.person.x + dx, s.person.y + dy)));
  }
  // At a jetty's end, walking on toward the sea goes nowhere.
  {
    const s = play(1);
    const br = WORLD.berthById.portE;
    ashore(s, br.end.x + 0.5, br.end.y + 0.5);
    run(s, 2, toward(centre(br.end), centre(br)));
    assert.equal(Math.floor(s.person.x) + ',' + Math.floor(s.person.y), `${br.end.x},${br.end.y}`);
    assert.equal(s.mode, 'walk');
  }
  // The car: from a junction, the stick's direction picks the branch; it never leaves the road.
  {
    const s = play(1);
    s.mode = 'car';
    s.you.car = 'portN';
    const c = youCar(s);
    Object.assign(c, { x: 9.5, y: 3.5, node: { x: 9, y: 3 }, target: null }); // the ring's corner
    run(s, 0.5, gridToStick(0.2, 1)); // mostly +y: down the west side
    assert.ok(c.y > 4 && Math.abs(c.x - 9.5) < 1e-6, `took the +y branch: ${c.x},${c.y}`);
    run(s, 4, gridToStick(-1, 0.3)); // pushing off the road to the west: it follows the road instead
    for (let i = 0; i < 3; i++) assert.ok(isRoad(tileAt(c.x, c.y)));
    const s2 = play(1);
    s2.mode = 'car';
    s2.you.car = 'portN';
    const c2 = youCar(s2);
    Object.assign(c2, { x: 9.5, y: 3.5, node: { x: 9, y: 3 }, target: null });
    run(s2, 0.5, gridToStick(1, 0.2)); // mostly +x: along the top
    assert.ok(c2.x > 10 && Math.abs(c2.y - 3.5) < 1e-6, `took the +x branch: ${c2.x},${c2.y}`);
  }
  // A boat nosed into Port Town's west cliff, then the stick points back out to sea.
  {
    const s = play(5);
    const b = afloat(s, 'motor', 7.4, 4.5, 0);
    run(s, 1, gridToStick(1, 0));
    assert.ok(b.v < 0.5, 'stopped at the cliff');
    const x0 = b.x;
    run(s, 2, gridToStick(-1, 0));
    assert.ok(x0 - b.x > 0.5, `free within 2 s: ${x0} → ${b.x}`);
  }
});

// --- Docking, boarding, cars (Node) -----------------------------------------------------------------------------

test('island-hop AC-7: a slow boat heading for a free berth docks; one sailing past fast doesn\'t; an occupied berth can\'t be docked at; walking onto your boat\'s berth boards it', () => {
  const br = WORLD.berthById.portW; // free in mission 1
  // Slow, heading in, within 1.5 tiles: docks, and you step onto the jetty.
  {
    const s = play(0);
    const b = afloat(s, 'motor', br.x - 0.7, br.y + 0.5, 0, 1);
    run(s, 0.5, gridToStick(1, 0, 0.3));
    assert.equal(s.mode, 'walk');
    assert.equal(b.berth, 'portW');
    assert.equal(`${Math.floor(s.person.x)},${Math.floor(s.person.y)}`, `${br.end.x},${br.end.y}`);
    assert.equal(events(s, 'dock').length, 1);
  }
  // At speed, passing within range: no dock.
  {
    const s = play(0);
    const b = afloat(s, 'motor', br.x + 0.5, br.y - 3, 90, 3.5);
    run(s, 1.5, gridToStick(0, 1));
    assert.equal(s.mode, 'boat');
    assert.equal(b.berth, null);
  }
  // An occupied berth: the motorboat sits at Port Town's east berth; the speedboat can't dock there.
  {
    const s = play(5);
    const motor = s.boats.find((b) => b.kind === 'motor');
    Object.assign(motor, { berth: 'portE', x: 26.5, y: 11.5 });
    const b = afloat(s, 'speed', 28, 11.5, 180, 1);
    run(s, 1, gridToStick(-1, 0, 0.3));
    assert.equal(s.mode, 'boat');
    assert.equal(b.berth, null);
  }
  // Walking onto a berth holding one of your boats boards it.
  {
    const s = play(5);
    const motor = s.boats.find((b) => b.kind === 'motor');
    Object.assign(motor, { berth: 'portE', x: 26.5, y: 11.5 });
    const e = WORLD.berthById.portE;
    ashore(s, e.end.x - 1 + 0.5, e.end.y + 0.5); // the jetty's root
    run(s, 1.2, gridToStick(1, 0));
    assert.equal(s.mode, 'boat');
    assert.equal(s.you.boat, 'motor');
  }
});

test('island-hop AC-7: a slow boat touching a free jetty from any side docks, not only heading into the berth', () => {
  // Port Town's east jetty runs along x from the shore, (24,11) and (25,11), to its berth at (26,11).
  const br = WORLD.berthById.portE;
  for (const [x, y, h, stick] of [
    [24.5, 12.75, 270, gridToStick(0, -1, 0.3)], // alongside, from the +y side, by the shore end
    [25.5, 10.25, 90, gridToStick(0, 1, 0.3)], // alongside, from the -y side
  ]) {
    const s = play(0);
    const b = afloat(s, 'motor', x, y, h, 0.6);
    run(s, 1, stick);
    assert.equal(s.mode, 'walk', `docked from ${x},${y}`);
    assert.equal(b.berth, br.id);
  }
  // Fast along the same side: no dock.
  const s = play(0);
  afloat(s, 'motor', 22.5, 12.75, 0, 3.5);
  run(s, 0.6, gridToStick(1, 0));
  assert.equal(s.mode, 'boat', 'sailing past at speed');
});

test('island-hop AC-7: straight after docking you can board again, and straight after leaving you can dock again', () => {
  const br = WORLD.berthById.portW; // free in mission 1; its jetty runs along x, end (6,9), berth (5,9)
  const s = play(0);
  afloat(s, 'motor', br.x - 0.7, br.y + 0.5, 0, 1);
  run(s, 0.5, gridToStick(1, 0, 0.3));
  assert.equal(s.mode, 'walk', 'docked');
  // Without walking away: push back toward the boat from the jetty end, and you're aboard.
  run(s, 0.6, gridToStick(-1, 0));
  assert.equal(s.mode, 'boat', 'boarded again at once');
  // Turn away and sail out a little, then straight back: it docks again.
  const b = youBoat(s);
  run(s, 0.9, gridToStick(-1, 0.2));
  assert.equal(s.mode, 'boat');
  assert.ok(Math.hypot(b.x - (br.x + 0.5), b.y - (br.y + 0.5)) < 2, `still close: ${b.x.toFixed(2)},${b.y.toFixed(2)}`);
  run(s, 3, (st) => (st.mode === 'boat' ? toward(youBoat(st), centre(br), 0.4) : null));
  assert.equal(s.mode, 'walk', 'docked again at once');
  // A boat still sitting at the berth it just left doesn't dock again by itself.
  const s2 = play(0);
  afloat(s2, 'motor', br.x - 0.7, br.y + 0.5, 0, 1);
  run(s2, 0.5, gridToStick(1, 0, 0.3));
  run(s2, 0.6, gridToStick(-1, 0));
  assert.equal(s2.mode, 'boat');
  run(s2, 1, null);
  assert.equal(s2.mode, 'boat', 'no re-dock while it sits there');
});

test('island-hop AC-7: a tap while driving gets you out wherever the car is, and the car stays', () => {
  const s = play(1);
  s.mode = 'car';
  s.you.car = 'portS';
  const car = s.cars.find((c) => c.id === 'portS');
  Object.assign(car, { x: 9.5, y: 5.5, node: { x: 9, y: 5 }, target: null }); // mid-road, nothing in reach
  run(s, 0.3, null);
  assert.equal(s.mode, 'car', 'letting go mid-road keeps you in');
  step(s, RULES.dt, { x: 0, y: 0, out: true });
  run(s, 0.5, null);
  assert.equal(s.mode, 'walk', 'the tap got you out');
  assert.deepEqual({ x: car.x, y: car.y }, { x: 9.5, y: 5.5 });
});

test('island-hop AC-7: leaving the rowboat in the lagoon leaves the motorboat at its berth, ready to board; a parked car gets you in, letting go only stops it (even at its car park), a tap gets you out, and it stays there', () => {
  // You came to Lagoon Isle by motorboat (moored at Port Town's west berth), took the rowboat out into
  // the channel and docked it back; the motorboat is still at its berth and boards.
  {
    const s = play(4);
    const motor = s.boats.find((b) => b.kind === 'motor');
    Object.assign(motor, { berth: 'portW', x: 5.5, y: 9.5, h: 0 });
    const row = s.boats.find((b) => b.kind === 'row');
    assert.equal(row.berth, 'lagoon');
    // Board the rowboat from Lagoon Isle's jetty.
    const lb = WORLD.berthById.lagoon;
    ashore(s, lb.end.x + 0.5, lb.end.y + 1.5);
    run(s, 1, gridToStick(0, -1));
    assert.equal(s.mode, 'boat');
    assert.equal(s.you.boat, 'row');
    // Row out along the shallow channel and back, then dock again at the lagoon berth.
    run(s, 1, gridToStick(-1, 0));
    run(s, 2.5, gridToStick(-1, 0.15));
    run(s, 8, (st) => (st.mode === 'boat' ? toward(youBoat(st), centre(lb), 0.4) : null));
    assert.equal(s.mode, 'walk', 'docked in the lagoon');
    assert.equal(motor.berth, 'portW', 'the motorboat is still at its berth');
    // Walk over the footbridge to Port Town and onto the motorboat's jetty.
    s.person.x = 7.5;
    s.person.y = 9.5;
    s.person.tile = '7,9';
    run(s, 0.8, gridToStick(-1, 0));
    assert.equal(s.mode, 'boat');
    assert.equal(s.you.boat, 'motor');
  }
  // Cars.
  {
    const s = play(3); // Fresh fish: the bakery (A) is a stop, and the south car park has a car
    const car = s.cars.find((c) => c.id === 'portS'); // at (12,13), Port Town's south car park
    ashore(s, 14.5, 13.5);
    // Walk into it, and let go the moment you're in: at its own car park, you stay in, never thrown
    // straight back out.
    let inAt = null;
    run(s, 3, (st) => {
      if (st.mode === 'car' && inAt === null) inAt = st.t;
      return inAt === null && st.mode === 'walk' && !st.trans ? toward(st.person, car) : null;
    });
    assert.ok(inAt !== null, 'got in');
    near(car.x, 12.5, 0.01, 'still at its car park');
    assert.equal(s.mode, 'car', 'still in the car at its car park');
    assert.equal(events(s, 'door').length, 1, 'one door: in, and not out again');
    // Drive down the ring's west side and let go mid-road, away from any car park, jetty or door: it
    // just stops.
    Object.assign(car, { x: 9.5, y: 4.5, node: { x: 9, y: 4 }, target: null });
    run(s, 0.2, gridToStick(0, 1));
    run(s, 0.5, null);
    near(car.y, 5.5, 0.01, 'the car stopped where you let go');
    assert.equal(s.mode, 'car', 'mid-road the car just stops');
    // Back to beside the bakery's door (14,11): letting go still only stops it; a tap gets you out,
    // and the car stays.
    Object.assign(car, { x: 14.5, y: 12.5, node: { x: 14, y: 12 }, target: null });
    run(s, 0.5, null);
    assert.equal(s.mode, 'car', 'by a door, letting go just stops the car too');
    run(s, 0.5, { x: 0, y: 0, out: true });
    assert.equal(s.mode, 'walk');
    const at = { x: car.x, y: car.y };
    run(s, 1, gridToStick(0, -1));
    assert.deepEqual({ x: car.x, y: car.y }, at, 'the car stays where you left it');
  }
});

// --- Stops and pickups (Node) -----------------------------------------------------------------------------------

test('island-hop AC-8: a doormat ticks its stop; an ordered stop waits for its pickup; pickups ride with you until delivered; the last stop finishes', () => {
  const s = play(3); // Fresh fish: V gives fish, I needs fish, A gives cake, L needs cake, W gives coconut, F needs coconut
  const at = (id) => WORLD.stops[id].mat;
  const stepOn = (id) => {
    const m = at(id);
    // Walk onto the mat from the tile beside it that's walkable.
    const from = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => ({ x: m.x + dx, y: m.y + dy })).find((t) => isWalkable(tileAt(t.x, t.y)) && !WORLD.jettyEnds[`${t.x},${t.y}`]);
    ashore(s, from.x + 0.5, from.y + 0.5);
    s.person.nearCar = null;
    run(s, 1.2, toward(centre(from), centre(m)));
  };
  // The café before the fish: not ticked, and it says which pickup it needs.
  stepOn('I');
  const cafe = s.stops.find((st) => st.at === 'I');
  assert.equal(cafe.done, false);
  const locked = events(s, 'locked');
  assert.equal(locked.at(-1).needs, 'fish');
  // The fish, then the café.
  stepOn('V');
  assert.deepEqual(s.carrying, ['fish']);
  assert.equal(events(s, 'stop').length, 1);
  stepOn('A');
  assert.deepEqual(s.carrying.sort(), ['cake', 'fish']);
  stepOn('I');
  assert.equal(cafe.done, true);
  assert.deepEqual(s.carrying, ['cake']);
  // Splits come with each tick: its clock.
  assert.equal(s.ticked.length, 3);
  stepOn('L');
  stepOn('W');
  assert.notEqual(s.phase, 'done');
  stepOn('F');
  assert.equal(s.phase, 'done', 'the last stop finishes the mission');
  assert.equal(events(s, 'finish').length, 1);
});

// --- Boats, the lagoon, bumps (Node) ------------------------------------------------------------------------------

test('island-hop AC-8: walking up to a stop\'s building from any side ticks it, not only its doormat', () => {
  // The town hall D stands at (20,7), with a house on its -x side; its doormat is at (21,7). Walk
  // into its open walls.
  for (const [x, y, gx, gy] of [
    [20.5, 8.5, 0, -1], // from the +y side, below it
    [20.5, 6.5, 0, 1], // from the -y side
  ]) {
    const s = play(0);
    ashore(s, x, y);
    run(s, 1, gridToStick(gx, gy));
    assert.equal(s.stops.find((st) => st.at === 'D').done, true, `ticked from ${x},${y}`);
    assert.equal(events(s, 'stop').length, 1);
  }
  // Passing near, not touching: nothing.
  const s = play(0);
  ashore(s, 19.5, 8.5);
  run(s, 0.3, gridToStick(-1, 0));
  assert.equal(s.stops.find((st) => st.at === 'D').done, false);
});

test('island-hop AC-9: at the marina, walking onto the other berth swaps boats; the speedboat can\'t enter the lagoon and the rowboat can; a rock or traffic stops you for 0.6 s and never fails the mission', () => {
  // Dock the motorboat at the marina's free berth; walk to the speedboat's berth.
  {
    const s = play(5);
    const m1 = WORLD.berthById.marina1;
    afloat(s, 'motor', m1.x + 0.5, m1.y - 0.6, 90, 0.8);
    run(s, 0.5, gridToStick(0, 1, 0.3));
    assert.equal(s.mode, 'walk');
    const m2 = WORLD.berthById.marina2;
    const path = walkPath(s.person, m2.end);
    assert.ok(path, 'a path to the other berth');
    let k = 0;
    run(s, 5, (st) => {
      if (st.mode !== 'walk') return null;
      const here = `${Math.floor(st.person.x)},${Math.floor(st.person.y)}`;
      while (k < path.length - 1 && `${path[k].x},${path[k].y}` !== here) k++;
      const t = centre(path[Math.min(k + 1, path.length - 1)]);
      return toward(st.person, t);
    });
    assert.equal(s.mode, 'boat');
    assert.equal(s.you.boat, 'speed');
    assert.equal(s.boats.find((b) => b.kind === 'motor').berth, 'marina1', 'the motorboat stays at the marina');
  }
  // The lagoon round Far Cay: the speedboat stops at its edge; the rowboat sails in.
  for (const [kind, gets] of [['speed', false], ['row', true]]) {
    const s = play(5);
    const b = afloat(s, kind, 42.5, 44.5, 90);
    run(s, 4, gridToStick(0, 1));
    assert.equal(b.y > 47.2, gets, `${kind} at y ${b.y.toFixed(2)}`);
  }
  // A rock: stopped dead and held for 0.6 s.
  {
    const s = play(5);
    const rock = WORLD.obstacles.find((o) => o.kind === 'rock');
    const b = afloat(s, 'motor', rock.x - 2.2, rock.y, 0, 3.5);
    let t0 = null;
    let movedAt = null;
    run(s, 2, (st) => {
      if (t0 === null && events(st, 'bump').length) {
        t0 = st.t;
        assert.equal(b.v, 0, 'stopped dead');
      }
      if (t0 !== null && movedAt === null && b.v > 0) movedAt = st.t;
      return gridToStick(1, 0);
    });
    assert.ok(t0 !== null, 'bumped');
    near(movedAt - t0, RULES.bump, 0.02, 'held for 0.6 s');
    assert.equal(s.phase, 'play');
    assert.equal(s.stops.every((st) => !st.done), true, 'nothing lost: the mission carries on');
  }
  // Traffic: the ferry, met head on.
  {
    const s = play(0);
    s.traffic = ['ferry'];
    s.t = 0;
    const f = trafficAt('ferry', 1);
    const b = afloat(s, 'motor', f.x + 0.2, f.y + TRAFFIC_R.ferry + 0.6, 270, 2);
    run(s, 1, gridToStick(0, -1));
    assert.ok(events(s, 'bump').some((e) => e.what === 'traffic'));
    assert.equal(s.phase, 'play');
    void b;
  }
});

test('island-hop AC-9: you glide round moored and leisure boats and buoys, never held, even head on; sailing away from a rock you touch isn\'t held', () => {
  // Head on into the big moored boat at (20,31): eased round it and past, never held.
  {
    const s = play(0);
    const m = WORLD.obstacles.find((o) => o.kind === 'moored' && o.r > 0.5);
    const b = afloat(s, 'motor', m.x - 3, m.y, 0);
    let held = false;
    run(s, 4, (st) => {
      if (youBoat(st).hold > 0) held = true;
      return gridToStick(1, 0);
    });
    assert.equal(held, false, 'never held');
    assert.ok(b.x > m.x + 1, `past it: x ${b.x.toFixed(2)}`);
    assert.equal(events(s, 'bump').filter((e) => !e.soft).length, 0, 'no hard bump');
  }
  // A leisure boat: met head on where it will be, the same.
  {
    const s = play(0);
    s.tt = 3.8;
    const l = leisureAt(1, 5); // east of Port Town, heading +y along x = 29: where you'll cross its course
    const b = afloat(s, 'motor', l.x + 2.5, l.y, 180);
    let held = false;
    let touched = false;
    run(s, 3, (st) => {
      if (youBoat(st).hold > 0) held = true;
      const o = obstaclesAt(st).find((ob) => ob.kind === 'leisure' && Math.hypot(ob.x - b.x, ob.y - b.y) < ob.r + 0.5);
      if (o) touched = true;
      return gridToStick(-1, 0);
    });
    assert.ok(touched, 'met the leisure boat');
    assert.equal(held, false, 'never held');
  }
  // A buoy, head on.
  {
    const s = play(0);
    const bu = WORLD.obstacles.find((o) => o.kind === 'buoy' && o.x > 30);
    const b = afloat(s, 'motor', bu.x - 2.5, bu.y, 0);
    let held = false;
    run(s, 3, (st) => {
      if (youBoat(st).hold > 0) held = true;
      return gridToStick(1, 0);
    });
    assert.equal(held, false, 'never held');
    assert.ok(b.x > bu.x + 0.5, `past it: x ${b.x.toFixed(2)}`);
  }
  // Touching a rock and sailing away: not held.
  {
    const s = play(5);
    const rock = WORLD.obstacles.find((o) => o.kind === 'rock');
    const b = afloat(s, 'motor', rock.x - (rock.r + RULES.boats.motor.radius - 0.05), rock.y, 180, 1);
    run(s, 1, gridToStick(-1, 0));
    assert.equal(events(s, 'bump').length, 0, 'no bump');
    assert.ok(b.x < rock.x - 2, `sailed away: x ${b.x.toFixed(2)}`);
  }
});

test('island-hop AC-21: in every mission at least ten small leisure boats sail, on water, never on land: round single islands, round the whole archipelago, and on a figure of eight round two islands', async () => {
  for (const [i] of MISSIONS.entries()) {
    const s = createMission(i, { phase: 'play' });
    const at0 = obstaclesAt(s).filter((o) => o.kind === 'leisure');
    run(s, 2);
    const at1 = obstaclesAt(s).filter((o) => o.kind === 'leisure');
    assert.ok(at0.length >= 10, `mission ${i + 1}: ${at0.length} leisure boats`);
    const moved = at1.filter((o, k) => Math.hypot(o.x - at0[k].x, o.y - at0[k].y) > 1).length;
    assert.equal(moved, at0.length, `mission ${i + 1}: all of them moving`);
  }
  for (let k = 0; k < LEISURE.length; k++)
    for (let t = 0; t < 140; t += 0.25) {
      const p = leisureAt(k, t);
      assert.ok(navigable('motor', tileAt(p.x, p.y)), `leisure boat ${k} on water at ${t} s`);
    }
  // The circuits: one goes round all five islands, and one is a figure of eight, its loops round Palm
  // Key and Marina Bay.
  const around = (path, isl) => {
    const xs = path.map((p) => p[0]);
    const ys = path.map((p) => p[1]);
    return Math.min(...xs) < isl.x0 && Math.max(...xs) > isl.x1 + 1 && Math.min(...ys) < isl.y0 && Math.max(...ys) > isl.y1 + 1;
  };
  assert.ok(LEISURE.some((l) => ISLANDS.every((isl) => around(l.path, isl))), 'a boat goes round the whole archipelago');
  const eight = LEISURE.find((l) => l.path.length === 8);
  const isl = (id) => ISLANDS.find((i) => i.id === id);
  assert.ok(eight && around(eight.path.slice(0, 4), isl('palm')) && around(eight.path.slice(4), isl('marina')), 'a figure of eight round Palm Key and Marina Bay');
});

test('island-hop AC-6: on foot, a tree\'s tile is grass: you walk across it, only its trunk stops you, and walking straight at the trunk steps round it', () => {
  // The tree at (13,5) in Port Town, grass on either side.
  assert.equal(tileAt(13, 5), 'T');
  const s = play(0);
  const trunk = { x: 13.5, y: 5.5 };
  let closest = Infinity;
  const track = (st) => {
    closest = Math.min(closest, Math.hypot(st.person.x - trunk.x, st.person.y - trunk.y));
    return gridToStick(1, 0);
  };
  // Across the tile's edge, clear of the trunk.
  ashore(s, 12.5, 5.92);
  run(s, 1.5, track);
  assert.ok(s.person.x > 14.2, `across the tree's tile: x ${s.person.x.toFixed(2)}`);
  // Straight at the trunk: round it and on.
  closest = Infinity;
  ashore(s, 12.3, 5.5);
  run(s, 2.5, track);
  assert.ok(s.person.x > 14.2, `round the trunk: x ${s.person.x.toFixed(2)}`);
  assert.ok(closest >= TRUNK_R + RULES.personR - 1e-6, `never into the trunk: ${closest.toFixed(3)}`);
});

test('island-hop AC-6: on foot, the fountain is the same: only its basin stops you, its tile\'s corners are paving, and walking straight at it steps round', () => {
  // The fountain at (15,7) in Port Town's plaza.
  assert.equal(tileAt(15, 7), '*');
  const s = play(0);
  const basin = { x: 15.5, y: 7.5 };
  let closest = Infinity;
  const track = (st) => {
    closest = Math.min(closest, Math.hypot(st.person.x - basin.x, st.person.y - basin.y));
    return gridToStick(1, 0);
  };
  // The paving round the basin, its tile's corners, is yours to stand on.
  for (const [x, y] of [[15.12, 7.12], [15.88, 7.12], [15.12, 7.88], [15.88, 7.88]]) assert.equal(personBlocked(x, y), false, `the fountain tile's corner ${x},${y}`);
  // Straight at the basin: round it and on.
  ashore(s, 14.2, 7.5);
  run(s, 2.5, track);
  assert.ok(s.person.x > 16.2, `round the basin: x ${s.person.x.toFixed(2)}`);
  assert.ok(closest >= PROP_R['*'] + RULES.personR - 1e-6, `never into the basin: ${closest.toFixed(3)}`);
});

// --- Pars and the gold routes (Node) ----------------------------------------------------------------------------

test('island-hop AC-11: each mission\'s gold route, flown by the autopilot, lands in its band and on its par; another order of its stops is slower than gold', () => {
  const BANDS = [[10, 25], [40, 75], [60, 110], [65, 120], [75, 130], [80, 140]];
  for (const [i, m] of MISSIONS.entries()) {
    const gold = runPilot(i, m.gold);
    const alt = runPilot(i, m.alt);
    assert.equal(gold.phase, 'done');
    assert.equal(alt.phase, 'done');
    const [lo, hi] = BANDS[i];
    assert.ok(gold.clock >= lo && gold.clock <= hi, `mission ${i + 1}: ${gold.clock.toFixed(1)} s in ${lo}–${hi}`);
    near(gold.clock, m.par, 0.5, `mission ${i + 1}'s par`);
    const goldMedal = medalTimes(i).gold;
    assert.ok(alt.clock > goldMedal, `mission ${i + 1}: the other order ${alt.clock.toFixed(1)} s is slower than gold, ${goldMedal.toFixed(1)} s`);
  }
});

test('island-hop AC-10: medals: gold within par × 1.1, silver × 1.35 of gold, bronze × 1.8 of gold', () => {
  const t = medalTimes(2);
  near(t.gold, MISSIONS[2].par * 1.1, 1e-9, 'gold');
  near(t.silver, t.gold * 1.35, 1e-9, 'silver');
  near(t.bronze, t.gold * 1.8, 1e-9, 'bronze');
  assert.equal(medalFor(2, t.gold - 0.1), 'gold');
  assert.equal(medalFor(2, t.gold + 0.1), 'silver');
  assert.equal(medalFor(2, t.silver + 0.1), 'bronze');
  assert.equal(medalFor(2, t.bronze + 0.1), null);
});

test('island-hop AC-16: the same moves cover the same distance at 60 and 120 frames a second', () => {
  const go = (hz) => {
    const s = play(5);
    const b = afloat(s, 'speed', 52, 25, 90);
    for (let i = 0; i < 3 * hz; i++) step(s, 1 / hz, gridToStick(0, 1));
    const w = play(1);
    ashore(w, 10.5, 5.5);
    for (let i = 0; i < 2 * hz; i++) step(w, 1 / hz, gridToStick(1, 0));
    return { boat: b.y, walk: w.person.x };
  };
  const a = go(60);
  const b = go(120);
  near(a.boat, b.boat, 1e-6, 'boat');
  near(a.walk, b.walk, 1e-6, 'walk');
});

// --- The page (Chromium) ----------------------------------------------------------------------------------------

test('island-hop AC-20: the timed playtest: each mission\'s autopilot time in its band, and Port Town drawn at 50 fps or more at 390×844 (a frame stepped and drawn in 20 ms or less)', async () => {
  const BANDS = [[10, 25], [40, 75], [60, 110], [65, 120], [75, 130], [80, 140]];
  for (const [i, m] of MISSIONS.entries()) {
    const s = runPilot(i, m.gold);
    const [lo, hi] = BANDS[i];
    assert.ok(s.phase === 'done' && s.clock >= lo && s.clock <= hi, `mission ${i + 1}: ${s.clock.toFixed(1)} s in ${lo}–${hi}`);
  }
  // It measures speed, so it runs at the CPU's own speed, never under the test throttle.
  const { context, page } = await open({ deviceScaleFactor: 2, throttle: false });
  // Mission 2's gold route: in Port Town from about 32 s, on foot and then by car.
  await page.evaluate(() => {
    __hop.manual = true;
    __hop.start(1, { fly: false });
    __hop.autopilot('gold');
    __hop.step(33);
    __hop.manual = false;
  });
  await realFrames(page, 30);
  // 50 frames a second leaves 20 ms a frame. Step and draw 180 frames of Port Town with the autopilot
  // driving, timing each, and take the median: what the game itself costs, which a busy CI machine
  // running other test files at the same time can't push off by a stray stall the way counting
  // frames in a window can.
  const ms = await page.evaluate(() => {
    __hop.manual = true;
    const times = [];
    for (let i = 0; i < 180; i++) {
      const t0 = performance.now();
      __hop.step(1 / 60);
      __hop.draw();
      times.push(performance.now() - t0);
    }
    times.sort((a, b) => a - b);
    return times[times.length >> 1];
  });
  const where = await page.evaluate(() => ({ x: __hop.state.person.x, y: __hop.state.person.y }));
  assert.ok(where.x > 7 && where.x < 25 && where.y > 1 && where.y < 15, `in Port Town: ${JSON.stringify(where)}`);
  assert.ok(ms <= 20, `a frame of Port Town takes ${ms.toFixed(1)} ms (50 fps needs 20 or less)`);
  await context.close();
});

test('island-hop AC-4: the page opens on the moving archipelago behind the mission card; Go flies over the stops in about 3 s at 0:00, then the boat is yours and the clock starts on the first move', async () => {
  const { context, page, errors } = await open();
  assert.equal(await page.isVisible('[data-screen="start"]'), true);
  const icons = await page.$$eval('[data-card-stops] li', (ls) => ls.map((l) => l.firstChild.textContent));
  assert.equal(icons.length, MISSIONS[0].stops.length);
  // The world moves behind the card: the ferry sails, the water animates.
  const a = await page.evaluate(() => ({ t: __hop.state.t, tt: __hop.state.tt, phase: __hop.state.phase }));
  assert.equal(a.phase, 'card');
  await waitFor(page, (tt) => __hop.state.tt > tt + 0.3, a.tt, { what: 'the traffic sailing behind the card' });
  await page.click('[data-start]');
  assert.equal(await page.evaluate(() => __hop.state.phase), 'fly');
  assert.equal(await page.textContent('[data-clock]'), '0:00');
  await waitFor(page, () => __hop.state.fly >= 1.5, null, { what: '1.5 s of the fly-over' });
  assert.equal(await page.evaluate(() => __hop.state.phase), 'fly', 'still flying at 1.5 s');
  assert.equal(await page.textContent('[data-clock]'), '0:00');
  await waitFor(page, () => __hop.state.phase === 'play', null, { what: 'the fly-over over and the boat yours' });
  assert.equal(await page.evaluate(() => __hop.state.mode), 'boat');
  await realFrames(page, 45);
  assert.equal(await page.evaluate(() => __hop.state.clock), 0, 'no move, no clock');
  await page.keyboard.down('ArrowLeft');
  await waitFor(page, () => __hop.state.clock > 0.4, null, { what: 'the clock running past 0.4 s' });
  await page.keyboard.up('ArrowLeft');
  const c = await page.evaluate(() => ({ clock: __hop.state.clock, started: __hop.state.started }));
  assert.ok(c.started && c.clock > 0.4, `the clock runs: ${c.clock}`);
  assert.deepEqual(errors, []);
  await context.close();
});

test('island-hop AC-6: afloat, two arrow keys sail along the grid\'s lines, as on foot', async () => {
  const { context, page } = await open();
  await page.evaluate(() => {
    __hop.start(0, { fly: false });
    Object.assign(__hop.state.boats[0], { x: 45, y: 25, h: -Math.PI / 2, v: 0 }); // open water east of Port Town
  });
  await page.keyboard.down('ArrowUp');
  await page.keyboard.down('ArrowRight');
  await waitFor(page, () => __hop.state.clock > 1, null, { what: 'a second under way' });
  const a = await page.evaluate(() => ({ x: __hop.state.boats[0].x, y: __hop.state.boats[0].y }));
  await waitFor(page, (y) => __hop.state.boats[0].y < y - 1.5, a.y, { what: '1.5 tiles further' });
  const b = await page.evaluate(() => ({ x: __hop.state.boats[0].x, y: __hop.state.boats[0].y, h: __hop.state.boats[0].h }));
  await page.keyboard.up('ArrowUp');
  await page.keyboard.up('ArrowRight');
  // Up and right on screen is the grid's -y line: x doesn't change.
  assert.ok(Math.abs(b.x - a.x) < 0.05, `along the grid line: moved ${(b.x - a.x).toFixed(3)} across it, ${(b.y - a.y).toFixed(2)} along`);
  assert.ok(Math.abs(b.h + Math.PI / 2) < 0.02, `heading along it: ${b.h.toFixed(3)}`);
  await context.close();
});

test('island-hop AC-4: the mission card and a big banner when you take control say the goal: collect them all, as fast as you can', async () => {
  const { context, page } = await open();
  assert.match(await page.textContent('[data-goal]'), /Collect them all, as fast as you can!/);
  assert.equal(await page.isVisible('[data-goal]'), true);
  await page.click('[data-start]');
  assert.equal(await page.isVisible('[data-banner]'), false, 'not during the fly-over');
  await waitFor(page, () => __hop.state.phase === 'play', null, { what: 'the fly-over over and the boat yours' });
  await waitFor(page, () => !document.querySelector('[data-banner]').hidden, null, { what: 'the goal banner shown' });
  const b = await page.evaluate(() => {
    const el = document.querySelector('[data-banner]');
    return { text: el.textContent, size: parseFloat(getComputedStyle(el).fontSize) };
  });
  assert.match(b.text, /Collect them all,\s*as fast as you can!/);
  assert.ok(b.size >= 28, `big: ${b.size}px`);
  await waitFor(page, () => document.querySelector('[data-banner]').hidden, null, { what: 'the goal banner gone' });
  await context.close();
});

test('island-hop AC-7: a tap on the screen, or Space, while driving gets you out', async () => {
  const { context, page } = await open({ hasTouch: true });
  for (const how of ['tap', 'space']) {
    await page.evaluate(() => {
      __hop.manual = true;
      __hop.start(1, { fly: false });
      const s = __hop.state;
      s.mode = 'car';
      s.you.car = 'portS';
      Object.assign(s.cars.find((c) => c.id === 'portS'), { x: 9.5, y: 5.5, node: { x: 9, y: 5 }, target: null });
      __hop.manual = false;
    });
    if (how === 'tap') await page.touchscreen.tap(200, 500);
    else await page.keyboard.press('Space');
    await waitFor(page, () => __hop.state.mode === 'walk', null, { what: 'out of the car' });
  }
  await context.close();
});

test('island-hop AC-6: a drag anywhere steers; a second finger is ignored', async () => {
  const { context, page } = await open();
  await page.evaluate(() => {
    __hop.manual = true;
    __hop.start(0, { fly: false });
  });
  const fire = (type, id, x, y) =>
    page.evaluate(
      ([type, id, x, y]) => document.getElementById('world').dispatchEvent(new PointerEvent(type, { pointerId: id, clientX: x, clientY: y, bubbles: true, isPrimary: id === 1 })),
      [type, id, x, y]
    );
  const screenPos = () => page.evaluate(() => { const p = __hop.state.boats.find((b) => b.id === __hop.state.you.boat); return { x: (p.x - p.y) * 66, y: (p.x + p.y) * 33 }; });
  await fire('pointerdown', 1, 200, 600);
  await fire('pointermove', 1, 200, 540); // up the screen
  const p0 = await screenPos();
  await page.evaluate(() => __hop.step(1.5, null));
  // __hop.step with null uses no stick: steer through the page's own pointer stick instead.
  await page.evaluate(() => { __hop.manual = false; });
  await waitFor(page, (y0) => { const p = __hop.state.boats.find((b) => b.id === __hop.state.you.boat); return (p.x + p.y) * 33 < y0 - 25; }, p0.y, { what: 'the boat moving up the screen' });
  await page.evaluate(() => { __hop.manual = true; });
  const p1 = await screenPos();
  assert.ok(p1.y < p0.y - 20, `moved up the screen: ${p0.y} → ${p1.y}`);
  // A second finger down and dragging the other way changes nothing.
  await fire('pointerdown', 2, 100, 300);
  await fire('pointermove', 2, 100, 400);
  await page.evaluate(() => { __hop.manual = false; });
  await waitFor(page, (y1) => { const p = __hop.state.boats.find((b) => b.id === __hop.state.you.boat); return (p.x + p.y) * 33 < y1 - 25; }, p1.y, { what: 'the boat still moving up the screen' });
  await page.evaluate(() => { __hop.manual = true; });
  const p2 = await screenPos();
  assert.ok(p2.y < p1.y - 20, `still moving up: ${p1.y} → ${p2.y}`);
  await fire('pointerup', 2, 100, 400);
  await fire('pointerup', 1, 200, 540);
  await context.close();
});

test('island-hop AC-6: a drag that starts in the phone\'s edge strips doesn\'t steer (shared/safe-zone.js)', async () => {
  const { context, page } = await open({ hasTouch: true });
  await page.evaluate(() => {
    __hop.manual = true;
    __hop.start(0, { fly: false });
  });
  const fire = (type, id, x, y) =>
    page.evaluate(
      ([type, id, x, y]) => document.getElementById('world').dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', clientX: x, clientY: y, bubbles: true, isPrimary: true })),
      [type, id, x, y]
    );
  // From the bottom strip (40 px), the left-edge strip (20 px) and the top strip (24 px): nothing;
  // from mid-screen, the same drag steers.
  for (const [x0, y0, dx, dy, steers] of [
    [200, 844 - 10, 0, -60, false],
    [8, 500, 60, 0, false],
    [200, 10, 0, 60, false],
    [200, 600, 0, -60, true],
  ]) {
    await page.evaluate(() => __hop.start(0, { fly: false }));
    await fire('pointerdown', 1, x0, y0);
    await fire('pointermove', 1, x0 + dx, y0 + dy);
    await page.evaluate(() => { __hop.manual = false; });
    await realFrames(page, 36);
    await page.evaluate(() => { __hop.manual = true; });
    await fire('pointerup', 1, x0 + dx, y0 + dy);
    assert.equal(await page.evaluate(() => __hop.state.started), steers, `a drag from ${x0},${y0}`);
  }
  await context.close();
});

test('island-hop: a ground tile in front never covers the person standing behind it', async () => {
  const { context, page } = await open();
  // On open grass in Port Town (the screenshot the owner sent: the next tile cut across the body),
  // the person's body is still drawn: its pink shows just above the feet.
  const pink = await page.evaluate(() => {
    __hop.manual = true;
    __hop.start(1, { fly: false });
    const s = __hop.state;
    s.mode = 'walk';
    const out = [];
    for (const [x, y] of [[10.3, 7.4], [10.5, 7.3], [10.2, 7.6], [10.7, 7.7]]) {
      s.person.x = x;
      s.person.y = y;
      __hop.step(1.5, null);
      __hop.draw();
      const v = __hop.view;
      const cv = document.getElementById('world');
      const k = cv.width / innerWidth;
      const fx = ((x - y) * 66 - v.x) * v.zoom + innerWidth / 2;
      const fy = ((x + y) * 33 - 16 - v.y) * v.zoom + innerHeight / 2;
      const d = cv.getContext('2d').getImageData(Math.round(fx * k), Math.round((fy - 6 * v.zoom) * k), 1, 1).data;
      out.push([d[0], d[1], d[2]]);
    }
    return out;
  });
  for (const [r, g, b] of pink) assert.ok(r > 200 && g < 140 && b > 110, `the person's body shows: rgb(${r}, ${g}, ${b})`);
  await context.close();
});

test('island-hop AC-8: walking onto an ordered stop too soon pulses its beam and flashes the pickup\'s icon', async () => {
  const { context, page } = await open({ mem: { map: MAP_VERSION, open: 5, best: {} }, hash: '#m=4' });
  await page.evaluate(() => {
    __hop.manual = true;
    __hop.start(3, { fly: false });
    const s = __hop.state;
    s.traffic = [];
    s.mode = 'walk';
    s.person.x = 29.5; // beside the café's mat (29,30)
    s.person.y = 31.5;
    s.person.tile = '29,31';
  });
  await page.evaluate((st) => __hop.step(1, st), gridToStick(0, -1));
  const flash = await page.$$eval('[data-stops] li', (ls) => ls.map((l) => l.classList.contains('flash')));
  const stops = MISSIONS[3].stops;
  assert.equal(flash[stops.findIndex((s) => s.at === 'I')], true, 'the café flashes');
  assert.equal(flash[stops.findIndex((s) => s.gives === 'fish')], true, 'the fish it needs flashes');
  assert.equal(await page.evaluate(() => __hop.state.stops.find((s) => s.at === 'I').done), false);
  await context.close();
});

test('island-hop AC-10: the finish shows the time, the medal, the pars, the best and both routes; it opens the next mission; best and medal persist, and no ghost is kept or drawn; another map version\'s runs are thrown away', async () => {
  const { context, page } = await open();
  await page.evaluate(() => {
    __hop.manual = true;
    __hop.start(0, { fly: false });
    __hop.autopilot('gold');
    __hop.step(60);
    __hop.autopilot(null);
  });
  assert.equal(await page.isVisible('[data-screen="finish"]'), true);
  const fin = await page.evaluate(() => ({
    time: document.querySelector('[data-time]').textContent,
    medal: document.querySelector('[data-medal]').textContent,
    pars: [...document.querySelectorAll('[data-pars] li')].map((l) => l.textContent),
    best: document.querySelector('[data-best]').textContent,
    view: __hop.view,
    mem: __hop.mem,
  }));
  assert.match(fin.time, /^0:\d\d\.\d$/);
  assert.equal(fin.medal, '🥇');
  assert.equal(fin.pars.length, 3);
  assert.match(fin.best, /Best/);
  assert.equal(fin.view.finished, true, 'routes drawn');
  assert.equal(fin.mem.open, 1, 'mission 2 is open');
  assert.equal(fin.mem.best[0].medal, 'gold');
  assert.equal(fin.mem.best[0].ghost, undefined, 'no ghost is kept');
  const routes = await page.evaluate(() => {
    // The finish keeps your route and the gold route to draw over the map.
    return __hop.view.finished;
  });
  assert.ok(routes);
  // A reload keeps it all; the next run has no ghost: only you are drawn as a person.
  await page.reload();
  await page.waitForFunction(() => window.__hop);
  assert.match(await page.textContent('[data-card-best]'), /Best 0:\d\d\.\d 🥇/);
  assert.equal(await page.isEnabled('[data-next]'), true);
  await page.evaluate(() => {
    __hop.manual = true;
    __hop.start(0, { fly: false });
    __hop.step(0.5, { x: -1, y: 0 });
  });
  const g1 = await page.evaluate(() => __hop.state.clock);
  assert.ok(g1 > 0);
  const people = await page.evaluate(() => {
    __hop.draw();
    return __hop.people;
  });
  assert.equal(people, 0, 'afloat, no person is drawn: no ghost walks or sails beside you');
  await context.close();
  // Runs saved against another version of the map are thrown away.
  const old = await open({ mem: { map: MAP_VERSION - 1, open: 3, best: { 0: { time: 1, medal: 'gold', splits: [], ghost: [] } } } });
  const m = await old.page.evaluate(() => __hop.mem);
  assert.deepEqual(m.best, {});
  assert.equal(m.open, 3, 'the missions opened stay open');
  assert.equal(await old.page.textContent('[data-card-best]'), '');
  await old.context.close();
});

test('island-hop AC-10: at the finish the camera follows your route from its start, drawing it as it goes, then pulls back to the whole map', async () => {
  const { context, page } = await open();
  // Read where the replay starts before any real frame runs it on.
  const { first, start } = await page.evaluate(() => {
    __hop.manual = true;
    __hop.start(1, { fly: false });
    __hop.autopilot('gold');
    __hop.step(60);
    __hop.autopilot(null);
    const first = __hop.view.replay;
    const start = __hop.state.trail[0];
    __hop.manual = false;
    return { first, start };
  });
  assert.ok(first && first.dur >= 4 && first.dur <= 9, `a replay of 4–9 s: ${JSON.stringify(first)}`);
  assert.ok(Math.hypot(first.head.x - start[0], first.head.y - start[1]) < 1, 'it starts where you started');
  await waitFor(page, () => __hop.view.replay && __hop.view.replay.head.n > 20 && Math.abs(__hop.view.tilesAcross - 16) < 1, null, { what: 'the camera close, 16 tiles across, following the route' });
  const mid = await page.evaluate(() => ({ head: __hop.view.replay.head, x: __hop.view.x, y: __hop.view.y }));
  await waitFor(page, (n) => __hop.view.replay && __hop.view.replay.head.n > n + 20, mid.head.n, { what: 'the head moving on along the route' });
  const later = await page.evaluate(() => ({ x: __hop.view.x, y: __hop.view.y }));
  assert.ok(Math.hypot(later.x - mid.x, later.y - mid.y) > 10, 'the camera moves with it');
  await waitFor(page, () => !__hop.view.replay && __hop.view.tilesAcross > 30, null, { what: 'the whole map after the replay', timeout: 20000 });
  assert.equal(await page.isVisible('[data-screen="finish"]'), true, 'the score card stays up throughout');
  await context.close();
});

test('island-hop AC-12: off-screen stops get an edge arrow with their icon; holding the map shows it all and the clock runs on; the camera shows 14, 11 and 7 tiles across', async () => {
  const { context, page } = await open();
  await page.evaluate(() => {
    __hop.manual = true;
    __hop.start(1, { fly: false });
    __hop.step(0.6, { x: -1, y: 0 });
    __hop.step(3, null);
    __hop.draw();
  });
  const arrows = await page.evaluate(() => __hop.arrows);
  assert.ok(arrows.length >= 1, 'arrows for the stops off screen');
  const icons = await page.evaluate(() => __hop.state.stops.map((s) => s.at));
  for (const a of arrows) assert.ok(typeof a.icon === 'string' && a.icon.length > 0 && a.dist > 0 && icons[a.stop]);
  near(await page.evaluate(() => __hop.view.tilesAcross), 14, 0.3, 'boat');
  // The map, held: the whole archipelago; the clock keeps running.
  const c0 = await page.evaluate(() => __hop.state.clock);
  await page.dispatchEvent('[data-map]', 'pointerdown');
  await page.evaluate(() => {
    __hop.step(1.5, null);
    __hop.draw();
  });
  const v = await page.evaluate(() => __hop.view);
  assert.ok(v.mapHeld, 'the map is held');
  for (const isl of ISLANDS) {
    for (const [gx, gy] of [[isl.x0, isl.y0], [isl.x1 + 1, isl.y0], [isl.x0, isl.y1 + 1], [isl.x1 + 1, isl.y1 + 1]]) {
      const p = iso.toScreen(gx, gy, 16);
      const vx = (p.x - v.x) * v.zoom + 390 / 2;
      const vy = (p.y - v.y) * v.zoom + 844 / 2;
      assert.ok(vx >= 0 && vx <= 390 && vy >= 0 && vy <= 844, `${isl.name} in view: ${vx.toFixed(0)},${vy.toFixed(0)}`);
    }
  }
  assert.ok((await page.evaluate(() => __hop.state.clock)) > c0 + 1.4, 'the clock ran on');
  assert.equal(await page.evaluate(() => __hop.arrows.length), 0);
  await page.dispatchEvent('[data-map]', 'pointerup');
  // On foot and by car.
  await page.evaluate(() => {
    const s = __hop.state;
    s.mode = 'walk';
    s.person.x = 15.5;
    s.person.y = 7.5;
    __hop.step(2, null);
  });
  near(await page.evaluate(() => __hop.view.tilesAcross), 7, 0.3, 'on foot');
  await page.evaluate(() => {
    const s = __hop.state;
    s.mode = 'car';
    s.you.car = 'portS';
    Object.assign(s.cars.find((c) => c.id === 'portS'), { x: 9.5, y: 5.5, node: { x: 9, y: 5 }, target: null }); // mid-road
    __hop.step(2, null);
  });
  near(await page.evaluate(() => __hop.view.tilesAcross), 11, 0.3, 'by car');
  await context.close();
});

test('island-hop AC-13: #m=N opens mission N if it is open, and mission 1 otherwise', async () => {
  for (const [hash, open3, want] of [['#m=3', 3, 2], ['#m=3', 0, 0], ['#m=99', 5, 0], ['#m=abc', 5, 0], ['#m=6', 5, 5]]) {
    const { context, page, errors } = await open({ hash, mem: { map: MAP_VERSION, open: open3, best: {} } });
    assert.equal(await page.textContent('[data-mission-num]'), `Mission ${want + 1}`, `${hash} with ${open3} open`);
    assert.deepEqual(errors, []);
    await context.close();
  }
});

test('island-hop AC-14: hiding the page pauses the mission, the clock and a fly-over; only a tap resumes; restart resets everything', async () => {
  const { context, page, errors } = await open();
  const hide = (h) =>
    page.evaluate((h) => {
      Object.defineProperty(document, 'hidden', { value: h, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    }, h);
  // During the fly-over.
  await page.click('[data-start]');
  await waitFor(page, () => __hop.state.fly > 0.4, null, { what: 'the fly-over under way' });
  await hide(true);
  const f0 = await page.evaluate(() => __hop.state.fly);
  await realFrames(page, 45);
  assert.equal(await page.evaluate(() => __hop.state.fly), f0, 'the fly-over waits');
  assert.equal(await page.isVisible('[data-screen="pause"]'), true);
  await hide(false);
  await realFrames(page, 24);
  assert.equal(await page.evaluate(() => __hop.paused), true, 'coming back alone doesn\'t resume');
  await page.click('[data-resume]');
  await waitFor(page, () => __hop.state.phase === 'play', null, { what: 'the rest of the fly-over after the tap' });
  // The resume tap sets the frame clock after the next frame's stamp: that frame's step is never
  // negative (a negative one once set the music's volume below 0, which threw and stopped the game).
  assert.deepEqual(errors, [], 'no page errors after resuming');
  // In play, with the clock running.
  await page.keyboard.down('ArrowLeft');
  await waitFor(page, () => __hop.state.clock > 0.3, null, { what: 'the clock running' });
  await hide(true);
  await page.keyboard.up('ArrowLeft');
  const c0 = await page.evaluate(() => __hop.state.clock);
  await realFrames(page, 45);
  assert.equal(await page.evaluate(() => __hop.state.clock), c0, 'the clock stops');
  await hide(false);
  // Restart from the pause card: the clock, the stops, pickups and every vehicle reset.
  await page.evaluate(() => {
    const s = __hop.state;
    s.stops[0].done = true;
    s.carrying.push('fish');
    s.boats[0].x += 3;
  });
  await page.click('[data-restart-pause]');
  const r = await page.evaluate(() => ({ clock: __hop.state.clock, done: __hop.state.stops.some((s) => s.done), carrying: __hop.state.carrying.length, x: __hop.state.boats[0].x, paused: __hop.paused }));
  assert.deepEqual(r, { clock: 0, done: false, carrying: 0, x: MISSIONS[0].boats.motor.x, paused: false });
  // And from the HUD's restart button.
  await page.evaluate(() => {
    __hop.manual = true;
    __hop.step(1, { x: 1, y: 0 });
  });
  assert.ok((await page.evaluate(() => __hop.state.clock)) > 0.5);
  await page.click('[data-restart]');
  assert.equal(await page.evaluate(() => __hop.state.clock), 0);
  await context.close();
});

test('island-hop AC-15: docking, a car door, a stop and the finish each sound, and none plays while muted', async () => {
  const { context, page } = await open({ audio: true });
  await page.click('[data-start]'); // unlocks audio
  await page.waitForFunction(() => window.__decoded >= 9);
  const scenario = () =>
    page.evaluate(() => {
      __hop.manual = true;
      __hop.start(1, { fly: false });
      const from = __hop.played.length;
      const n0 = window.__played.length;
      __hop.autopilot('gold');
      const looping = new Set();
      for (let t = 0; t < 80; t += 0.5) {
        __hop.step(0.5);
        for (const l of __hop.loops) looping.add(l);
      }
      __hop.autopilot(null);
      return { names: __hop.played.slice(from), sounded: window.__played.length - n0, looping: [...looping] };
    });
  const loud = await scenario();
  for (const n of ['creak', 'door', 'chime', 'jingle']) assert.ok(loud.names.includes(n), `${n} in ${loud.names}`);
  // The car's engine runs while you drive; the sea plays afloat and the island's breeze ashore.
  for (const n of ['loop:motor', 'loop:land']) assert.ok(loud.names.includes(n), `${n} in ${loud.names}`);
  assert.ok(await page.evaluate(() => __hop.played.includes('loop:sea')), 'the sea plays afloat');
  // Sampled through a whole run: the car's engine runs the whole time in the car, the sea only
  // afloat and the breeze only ashore.
  const samples = await page.evaluate(() => {
    __hop.start(1, { fly: false });
    __hop.autopilot('gold');
    const out = [];
    for (let t = 0; t < 80 && __hop.state.phase === 'play'; t += 0.1) {
      __hop.step(0.1);
      if (__hop.state.phase === 'play') out.push({ mode: __hop.state.mode, loops: __hop.loops });
    }
    __hop.autopilot(null);
    return out;
  });
  const modes = new Set(samples.map((s) => s.mode));
  for (const m of ['boat', 'car']) assert.ok(modes.has(m), `the run goes by ${m}: ${[...modes]}`);
  assert.ok(modes.size >= 3, `the run also goes on foot: ${[...modes]}`);
  for (const { mode, loops } of samples) {
    const at = `${mode}: ${loops}`;
    assert.equal(loops.includes('motor'), mode === 'car', `car engine iff in the car (${at})`);
    assert.equal(loops.includes('sea'), mode === 'boat', `sea iff afloat (${at})`);
    assert.equal(loops.includes('land'), mode !== 'boat', `breeze iff ashore (${at})`);
  }
  assert.ok(loud.sounded >= 8, `${loud.sounded} sounds reached the speakers`);
  await page.click('[data-again]');
  await page.click('[data-mute]');
  const quiet = await scenario();
  assert.equal(quiet.sounded, 0, 'nothing reaches the speakers while muted');
  assert.deepEqual(quiet.looping, [], 'no loop runs at all while muted');
  await context.close();
});

test('island-hop AC-22: a boat in front of a building on the shore is drawn over it, the land in front of a boat behind an island is drawn over the boat, and no tile is drawn twice', async () => {
  const { context, page } = await open();
  const orderAt = (x, y, hDeg) =>
    page.evaluate(
      ([x, y, h]) => {
        __hop.manual = true;
        __hop.recordGround = true;
        __hop.start(0, { fly: false });
        const b = __hop.state.boats[0];
        for (let k = 0; k < 240; k++) {
          Object.assign(b, { x, y, h, v: 0 });
          __hop.step(1 / 60); // the camera settles on the boat
        }
        __hop.draw();
        return __hop.order;
      },
      [x, y, (hDeg * Math.PI) / 180]
    );
  // Off Port Town's south shore, in front of the ice cream kiosk (17,13).
  const front = await orderAt(18, 14.4, 90);
  assert.ok(front.includes('building:17,13'), 'the kiosk is drawn');
  assert.ok(front.indexOf('boat:motor') > front.indexOf('building:17,13'), `the boat after the kiosk: ${front.join(' ')}`);
  // Off its north shore, behind the car park (15,2): the boat is drawn before that land, so the land
  // covers it.
  const behind = await orderAt(15, 1.6, 0);
  const at = behind.indexOf('boat:motor');
  assert.ok(at >= 0 && behind.indexOf('ground:15,2', at) > at, `the north shore over the boat: ${behind.join(' ')}`);
  // Nothing is drawn twice: no tile pops over what was drawn after it.
  for (const o of [front, behind]) {
    const ground = o.filter((n) => n.startsWith('ground:'));
    assert.equal(new Set(ground).size, ground.length, 'each ground tile drawn once');
    assert.equal(o.filter((n) => n === 'boat:motor').length, 1, 'the boat drawn once');
  }
  await context.close();
});

test('island-hop AC-23: the sea\'s music plays afloat and the island\'s ashore, crossfading; none plays before a tap, while muted or while the page is hidden', async () => {
  const { context, page } = await open({ audio: true });
  await waitFor(page, () => __hop.music.sea.ready && __hop.music.land.ready, null, { what: 'both tracks fetched' });
  const tracks = () => page.evaluate(() => __hop.music);
  // Before any tap, nothing plays.
  await page.evaluate(() => {
    __hop.manual = true;
    __hop.start(1, { fly: false });
    __hop.step(1);
  });
  let m = await tracks();
  assert.deepEqual([m.sea.level, m.land.level, m.sea.playing, m.land.playing], [0, 0, false, false], 'silent before a tap');
  // A tap lets it play: afloat, the sea's track fades in.
  await page.mouse.click(195, 600);
  await page.evaluate(() => __hop.step(1));
  m = await tracks();
  assert.deepEqual([m.sea.level, m.land.level], [1, 0], 'afloat: the sea');
  assert.ok(await page.evaluate(() => __hop.played.includes('music:sea')), 'the sea track started');
  // Ashore on Palm Key, the moment mission 2's gold route docks there: the island's track fades in.
  await page.evaluate(() => {
    __hop.start(1, { fly: false });
    __hop.autopilot('gold');
    for (let t = 0; t < 30 && __hop.state.mode !== 'walk'; t += 0.1) __hop.step(0.1);
    __hop.autopilot(null);
  });
  assert.equal(await page.evaluate(() => __hop.state.mode), 'walk');
  await page.evaluate(() => __hop.step(0.4));
  m = await tracks();
  assert.ok(m.land.level > 0 && m.land.level < 1 && m.sea.level > 0 && m.sea.level < 1, `crossfading: ${JSON.stringify(m)}`);
  await page.evaluate(() => __hop.step(1));
  m = await tracks();
  assert.deepEqual([m.sea.level, m.land.level], [0, 1], 'ashore: the island');
  assert.ok(await page.evaluate(() => __hop.played.includes('music:land')), 'the island track started');
  // Muted: nothing plays; unmuted, it comes back.
  await page.click('[data-mute]');
  m = await tracks();
  assert.deepEqual([m.sea.level, m.land.level, m.sea.playing, m.land.playing], [0, 0, false, false], 'muted: silent');
  await page.click('[data-mute]');
  await page.evaluate(() => __hop.step(1));
  assert.equal((await tracks()).land.level, 1, 'unmuted: back');
  // Hidden: it stops at once.
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  m = await tracks();
  assert.deepEqual([m.sea.level, m.land.level, m.sea.playing, m.land.playing], [0, 0, false, false], 'hidden: silent');
  await context.close();
});

test('island-hop AC-23: the two tracks are the owner\'s at 64 kbps: the sea\'s about 2½ minutes, the island\'s about 1 minute', () => {
  for (const [name, secs] of [['sea', 150], ['land', 60]]) {
    const bytes = readFileSync(new URL(`../island-hop/sounds/music-${name}.mp3`, import.meta.url)).length;
    const want = (64000 / 8) * secs; // 64 kbps
    assert.ok(Math.abs(bytes - want) < want * 0.05, `music-${name}.mp3 is ${bytes} bytes, about ${want} for ${secs} s at 64 kbps`);
  }
});

test('island-hop AC-24: in the car, a thought bubble on how to get out: 2 s after getting in without driving, and as soon as the car stops once driven; a boat too deep for the shallows says so', async () => {
  const { context, page } = await open();
  // Mission 2's taxi: in, and left alone.
  await page.evaluate(() => {
    __hop.manual = true;
    __hop.start(1, { fly: false });
    __hop.autopilot('gold');
    for (let t = 0; t < 60 && __hop.state.mode !== 'car'; t += 0.1) __hop.step(0.1);
    __hop.autopilot(null);
    __hop.step(0.4); // the door's transition
  });
  assert.equal(await page.evaluate(() => __hop.state.mode), 'car');
  const hintAfter = (secs, stick = null) =>
    page.evaluate(
      ([secs, stick]) => {
        for (let k = 0; k < Math.round(secs * 60); k++) __hop.step(1 / 60, stick);
        return __hop.hint;
      },
      [secs, stick]
    );
  assert.equal(await hintAfter(1.4), null, 'sitting in it: not before 2 s');
  const h = await hintAfter(0.8);
  assert.equal(h?.kind, 'car', 'sitting in it: after 2 s');
  // Driven, then stopped: at once.
  assert.equal(await hintAfter(1.5, { x: 0, y: -1 }), null, 'gone while driving');
  assert.equal((await hintAfter(1 / 60))?.kind, 'car', 'the moment it stops');
  assert.match(h.text, /Click or press Space to get out/, 'a mouse and keys: click or Space');
  // In pictures: a finger over a small car and, with a keyboard, "or" and a space bar with its own
  // finger; the fingers move (tap) from one frame to the next.
  const parts = await page.evaluate(() => {
    const seen = [];
    for (let k = 0; k < 13; k++) {
      __hop.step(0.12); // a whole tap, 1.4 s, in steps shorter than the 0.21 s press
      __hop.draw();
      seen.push(__hop.hintParts);
    }
    return seen;
  });
  assert.ok(parts.every((p) => p && /^(taxi|police|ambulance)\d$/.test(p.car) && p.or && p.space && p.fingers.length === 2), `car, or, space and two fingers: ${JSON.stringify(parts[0])}`);
  assert.ok(new Set(parts.map((p) => p.fingers[0])).size > 2, `the car's finger moves: ${parts.map((p) => p.fingers[0])}`);
  assert.ok(parts.some((p) => p.space.pressed) && parts.some((p) => !p.space.pressed), 'the space bar goes down and up');
  assert.equal(await hintAfter(0.2, { x: 0, y: -1 }), null, 'moving hides it');
  assert.equal((await hintAfter(1 / 60))?.kind, 'car', 'and stopping shows it again');
  await page.keyboard.press('Space');
  await page.evaluate(() => {
    __hop.manual = false;
  });
  await waitFor(page, () => __hop.state.mode === 'walk', null, { what: 'out of the car after Space' });
  assert.equal(await page.evaluate(() => __hop.hint), null, 'gone once out');
  // The motorboat nosing into Far Cay's lagoon.
  const shallow = await page.evaluate(() => {
    __hop.manual = true;
    __hop.start(4, { fly: false });
    const b = __hop.state.boats.find((x) => x.kind === 'motor');
    __hop.state.you.boat = 'motor';
    __hop.state.mode = 'boat';
    Object.assign(b, { x: 42.5, y: 45, h: Math.PI / 2, v: 0, berth: null });
    for (let k = 0; k < 120; k++) __hop.step(1 / 60, { x: -0.45, y: 0.9 });
    return { hint: __hop.hint, y: b.y };
  });
  assert.ok(shallow.y < 47.2, 'kept out of the lagoon');
  assert.match(shallow.hint?.text || '', /only the rowboat/, 'it says only the rowboat fits');
  await context.close();
});

test('island-hop AC-24: on a touch screen the bubble says to tap', async () => {
  const { context, page } = await open({ hasTouch: true, isMobile: true });
  const text = await page.evaluate(() => {
    __hop.manual = true;
    __hop.start(1, { fly: false });
    __hop.autopilot('gold');
    for (let t = 0; t < 60 && __hop.state.mode !== 'car'; t += 0.1) __hop.step(0.1);
    __hop.autopilot(null);
    for (let k = 0; k < 90; k++) __hop.step(1 / 60, { x: 0, y: -1 });
    __hop.step(1 / 60);
    __hop.draw();
    return { text: __hop.hint?.text, parts: __hop.hintParts };
  });
  assert.equal(text.text, 'Tap to get out');
  assert.ok(text.parts?.car && text.parts.fingers.length === 1 && !text.parts.or && !text.parts.space, `only the car and its finger: ${JSON.stringify(text.parts)}`);
  await context.close();
});

test('island-hop AC-16: on a 390×844 phone nothing scrolls, every button is 44 px or more, the canvas is at most 2×, and a building covering the person fades', async () => {
  const { context, page } = await open({ deviceScaleFactor: 3, hasTouch: true, isMobile: true });
  const sizes = () =>
    page.$$eval('button, a', (bs) =>
      bs
        .filter((b) => b.offsetParent !== null && getComputedStyle(b).visibility !== 'hidden')
        .map((b) => {
          const r = b.getBoundingClientRect();
          return { t: b.textContent.trim() || b.getAttribute('aria-label'), w: r.width, h: r.height };
        })
    );
  for (const b of await sizes()) assert.ok(b.w >= 44 && b.h >= 44, `${b.t}: ${b.w}×${b.h}`);
  await page.evaluate(() => {
    __hop.manual = true;
    __hop.start(0, { fly: false });
  });
  for (const b of await sizes()) assert.ok(b.w >= 44 && b.h >= 44, `${b.t}: ${b.w}×${b.h}`);
  const d = await page.evaluate(() => ({ scroll: document.scrollingElement.scrollHeight - innerHeight, cw: document.getElementById('world').width, w: innerWidth }));
  assert.ok(d.scroll <= 0, 'no scroll');
  assert.ok(d.cw <= d.w * 2, `canvas ${d.cw} for ${d.w}`);
  // Behind a building: the person just behind Port Town's school (11,4), whose block is drawn after.
  const faded = await page.evaluate(() => {
    const s = __hop.state;
    s.mode = 'walk';
    s.person.x = 11.5;
    s.person.y = 3.6;
    __hop.step(1.5, null);
    __hop.draw();
    const behind = __hop.faded;
    s.person.x = 15.5; // the ring road's south side: nothing stands in front
    s.person.y = 12.5;
    __hop.step(0.2, null);
    __hop.draw();
    return { behind, inTheOpen: __hop.faded };
  });
  assert.deepEqual(faded, { behind: true, inTheOpen: false });
  for (const b of await sizes()) assert.ok(b.w >= 44 && b.h >= 44, `${b.t}: ${b.w}×${b.h}`);
  await context.close();
});

test('island-hop AC-17: Island Hop plays offline once it has been played', async () => {
  const { context, page } = await open();
  await page.evaluate(() => navigator.serviceWorker.register('../sw.js'));
  await page.evaluate(() => Promise.race([navigator.serviceWorker.ready, new Promise((r) => setTimeout(r, 10000))]));
  await page.reload(); // controlled now: this load caches the game's files
  await page.waitForFunction(() => window.__hop);
  await page.waitForLoadState('networkidle');
  await context.setOffline(true);
  await page.reload();
  await page.waitForFunction(() => window.__hop);
  await page.click('[data-start]');
  assert.equal(await page.evaluate(() => __hop.state.phase), 'fly');
  assert.ok(await page.evaluate(() => performance.getEntriesByType('resource').some((r) => r.name.endsWith('atlas.png'))));
  await context.close();
});

test('island-hop AC-19: the art is Kenney\'s: all 29 Watercraft drawn in the world, and every tile, building, car and tree drawn comes from the built atlas', async () => {
  const header = readFileSync(new URL('../island-hop/atlas.js', import.meta.url), 'utf8').split('\n').slice(0, 3).join(' ');
  assert.match(header, /scripts\/island-hop\/build-assets\.py/);
  for (const pack of ['Tiles Base', 'Buildings', 'City', 'Vehicles', 'Isometric Nature', 'Isometric Watercraft']) assert.match(header, new RegExp(pack));
  const { context, page } = await open();
  // Mission 6 has every boat out; the map view draws the whole archipelago.
  const drawn = await page.evaluate(async () => {
    __hop.manual = true;
    __hop.start(5, { fly: false });
    document.querySelector('[data-map]').dispatchEvent(new PointerEvent('pointerdown'));
    __hop.step(3, null);
    __hop.draw();
    const all = new Set(__hop.drawn);
    // Up close too, for what the map view leaves out (trees).
    document.querySelector('[data-map]').dispatchEvent(new PointerEvent('pointerup'));
    __hop.state.mode = 'walk';
    __hop.state.person.x = 15.5;
    __hop.state.person.y = 7.5;
    __hop.step(2, null);
    __hop.draw();
    for (const n of __hop.drawn) all.add(n);
    return [...all];
  });
  for (let c = 1; c <= 29; c++) assert.ok(drawn.some((n) => n.startsWith(`craft${c}_`)), `watercraft ${c} drawn`);
  for (const prefix of ['road', 'grass', 'sand', 'paving', 'bld', 'tree', 'rock']) assert.ok(drawn.some((n) => n.startsWith(prefix)), `${prefix} drawn`);
  for (const n of drawn) assert.ok(ATLAS[n], `${n} is in the atlas`);
  await context.close();
});

test('island-hop: each state shows only its own cards and HUD, as in the spec\'s state table', async () => {
  const { context, page } = await open();
  const vis = () =>
    page.evaluate(() => ({
      card: !document.querySelector('[data-screen="start"]').hidden,
      hud: !document.querySelector('[data-hud]').hidden,
      finish: !document.querySelector('[data-screen="finish"]').hidden,
      pause: !document.querySelector('[data-screen="pause"]').hidden,
    }));
  assert.deepEqual(await vis(), { card: true, hud: false, finish: false, pause: false }, 'Start');
  const hide = (h) =>
    page.evaluate((h) => {
      Object.defineProperty(document, 'hidden', { value: h, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    }, h);
  await page.click('[data-start]');
  assert.equal(await page.evaluate(() => __hop.state.phase), 'fly');
  assert.deepEqual(await vis(), { card: false, hud: true, finish: false, pause: false }, 'Fly-over');
  // Playing: once the fly-over has ended.
  await waitFor(page, () => __hop.state.phase === 'play', null, { what: 'the fly-over over and the boat yours' });
  assert.deepEqual(await vis(), { card: false, hud: true, finish: false, pause: false }, 'Playing');
  // Paused, from play.
  await hide(true);
  assert.equal(await page.evaluate(() => __hop.state.phase), 'play');
  assert.deepEqual(await vis(), { card: false, hud: true, finish: false, pause: true }, 'Paused');
  await hide(false);
  await page.click('[data-resume]');
  assert.deepEqual(await vis(), { card: false, hud: true, finish: false, pause: false }, 'Playing again');
  await page.evaluate(() => {
    __hop.manual = true;
    __hop.start(0, { fly: false });
    __hop.autopilot('gold');
    __hop.step(60);
  });
  assert.deepEqual(await vis(), { card: false, hud: false, finish: true, pause: false }, 'Finished');
  await context.close();
});

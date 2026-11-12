// Island Hop's rules, with no DOM: the world built from map.js, moving by boat, on foot and by car,
// docking, boarding, stops and pickups, traffic, the clock, and an autopilot that follows a mission's
// written route. The page (game.js) draws it and feeds it the stick; the tests and the playtest
// (scripts/island-hop/playtest.mjs) run it headless.
//
// Coordinates are shared/iso.js grid terms in tiles: tile (i, j) covers [i, i+1) × [j, j+1); +x runs
// down-right on screen, +y down-left. The stick is in screen terms ({ x, y }, length 0..1).
import { createIso } from '../shared/iso.js';
import { ROWS, BERTHS, CARS, PLACES, YOUR_BOATS, MOORED, BUOYS, SEA_ROCKS, TRAFFIC, LEISURE, MAP_VERSION } from './map.js';
import { MISSIONS } from './missions.js';

const D = Math.PI / 180;

// Every number a player feels, in one place. Speeds in tiles a second, turns in degrees a second.
export const RULES = {
  walk: 1.6,
  car: 5,
  boats: {
    row: { speed: 2.2, turn: 150, shallow: true, radius: 0.32 },
    motor: { speed: 3.5, turn: 120, shallow: false, radius: 0.42 },
    speed: { speed: 5.5, turn: 72, shallow: false, radius: 0.42 },
  },
  accel: 1.1, // seconds from still to top speed
  brake: 0.7, // seconds from top speed to still
  spin: 120, // degrees: a stick further than this from the bow turns the boat on the spot
  dock: { range: 1.5, slow: 0.5, touch: 0.35, away: 0.3 }, // under half top speed: within 1.5 tiles of a free berth heading in, or touching its jetty
  transition: 0.3,
  bump: 0.6, // seconds held still after hitting a rock or traffic
  personR: 0.2,
  carReach: 0.5, // walking this close to a parked car gets in
  outReach: 1.05, // a car stopped within 1 tile of a car park, jetty or door lets you out
  dead: 0.15, // stick lengths under this are no input
  flyover: 3,
  trailEvery: 0.2, // your route, for the finish's map: a point every 0.2 s
  trailMax: 1200,
  dt: 1 / 120, // the rules step at a fixed 120 Hz, whatever the frame rate
  medals: { gold: 1.1, silver: 1.1 * 1.35, bronze: 1.1 * 1.8 },
};

export const iso = createIso({ tileW: 132, tileH: 66 });
export const SIZE = ROWS.length;
export { MAP_VERSION, MISSIONS, PLACES };

// --- The map ------------------------------------------------------------------------------------------
export function tileAt(x, y) {
  const i = Math.floor(x);
  const j = Math.floor(y);
  if (i < 0 || j < 0 || i >= SIZE || j >= SIZE) return null;
  return ROWS[j][i];
}
const WALK = new Set(['.', ':', '#', 'P', 'c', 'o', 'm', '=', 'f']);
const ROAD = new Set(['#', 'P', 'c']);
const DEEP = new Set(['~', 'b']);
const SHALLOW = new Set([',', 'd', 'f']);
export const isWalkable = (ch) => WALK.has(ch);
export const isRoad = (ch) => ROAD.has(ch);
export const isWater = (ch) => DEEP.has(ch) || SHALLOW.has(ch);
export const isShallow = (ch) => SHALLOW.has(ch);
export const isLand = (ch) => ch !== null && !isWater(ch) && ch !== '=';
export const isBuilding = (ch) => ch === 'H' || !!PLACES[ch];
export function navigable(kind, ch) {
  if (ch === null) return false;
  if (DEEP.has(ch)) return true;
  return SHALLOW.has(ch) && RULES.boats[kind].shallow;
}

// The map's features, read from its rows once.
export const WORLD = (() => {
  const stops = {};
  const berths = [];
  const jettyEnds = {};
  const parks = [];
  const jetties = [];
  for (let y = 0; y < SIZE; y++)
    for (let x = 0; x < SIZE; x++) {
      const ch = ROWS[y][x];
      if (PLACES[ch]) {
        const mat = [[x + 1, y], [x, y + 1]].find(([i, j]) => ROWS[j][i] === 'm');
        stops[ch] = { id: ch, x, y, mat: { x: mat[0], y: mat[1] }, ...PLACES[ch] };
      }
      if (ch === 'P' || ch === 'c') parks.push({ x, y });
      if (ch === '=') jetties.push({ x, y });
      if (ch === 'b' || ch === 'd') {
        const end = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => ({ x: x + dx, y: y + dy })).find((p) => ROWS[p.y][p.x] === '=');
        const id = BERTHS[`${x},${y}`];
        // The jetty's planks, from its end back to the shore.
        const planks = [end];
        for (let k = 1; ROWS[end.y + (end.y - y) * k]?.[end.x + (end.x - x) * k] === '='; k++)
          planks.push({ x: end.x + (end.x - x) * k, y: end.y + (end.y - y) * k });
        const b = { id, x, y, shallow: ch === 'd', end, planks, h: Math.atan2(end.y - y, end.x - x) };
        berths.push(b);
        jettyEnds[`${end.x},${end.y}`] = id;
      }
    }
  const berthById = Object.fromEntries(berths.map((b) => [b.id, b]));
  const obstacles = [
    ...MOORED.map((m) => ({ kind: 'moored', x: m.x, y: m.y, r: [3, 4, 7].includes(m.craft) ? 0.6 : 0.38 })),
    ...BUOYS.map((b) => ({ kind: 'buoy', x: b.x, y: b.y, r: 0.22 })),
    ...SEA_ROCKS.map((r) => ({ kind: 'rock', x: r.x, y: r.y, r: 0.45 })),
  ];
  return { stops, berths, berthById, jettyEnds, parks, jetties, obstacles };
})();

// --- Traffic ------------------------------------------------------------------------------------------
export const TRAFFIC_R = { ferry: 0.85, tugA: 0.6, tugB: 0.6, ship: 1.3 };
function pathLength(p, loop) {
  let L = 0;
  const n = loop ? p.length : p.length - 1;
  for (let i = 0; i < n; i++) {
    const a = p[i];
    const b = p[(i + 1) % p.length];
    L += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  return L;
}
export function trafficAt(id, t) {
  return { id, ...routeAt(TRAFFIC[id], t) };
}
// The leisure boats: where each is at traffic time t.
export function leisureAt(i, t) {
  return routeAt(LEISURE[i], t);
}
function routeAt(tr, t) {
  const p = tr.path;
  const L = pathLength(p, tr.loop);
  let s = (tr.speed * t + (tr.from || 0)) % (tr.loop ? L : 2 * L);
  let back = false;
  if (!tr.loop && s > L) {
    s = 2 * L - s;
    back = true;
  }
  const n = tr.loop ? p.length : p.length - 1;
  for (let i = 0; i < n; i++) {
    const a = p[i];
    const b = p[(i + 1) % p.length];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (s <= len || i === n - 1) {
      const k = Math.min(1, s / len);
      const h = Math.atan2(b[1] - a[1], b[0] - a[0]) + (back ? Math.PI : 0);
      return { x: a[0] + (b[0] - a[0]) * k, y: a[1] + (b[1] - a[1]) * k, h };
    }
    s -= len;
  }
  return null;
}

// --- Small maths --------------------------------------------------------------------------------------
export const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const centre = (t) => ({ x: t.x + 0.5, y: t.y + 0.5 });
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// The stick (screen terms) to a grid direction and a length.
export function stickToGrid(stick) {
  const len = Math.min(1, Math.hypot(stick?.x || 0, stick?.y || 0));
  if (len < RULES.dead) return { x: 0, y: 0, len: 0 };
  const g = iso.screenDirToGrid(stick.x, stick.y);
  return { x: g.x, y: g.y, len };
}
// A grid direction to the screen stick that asks for it.
export function gridToStick(gx, gy, len = 1) {
  const s = iso.gridDirToScreen(gx, gy);
  return { x: s.x * len, y: s.y * len };
}

// --- A mission ----------------------------------------------------------------------------------------
// phase: 'card' (the world moves behind the mission card), 'fly' (the fly-over), 'play', 'done'.
export function createMission(index, { phase = 'fly' } = {}) {
  const m = MISSIONS[index];
  const boats = Object.keys(YOUR_BOATS).map((kind) => {
    const at = m.boats[kind] ?? YOUR_BOATS_HOME[kind];
    const b = { id: kind, kind, x: 0, y: 0, h: 0, v: 0, hold: 0, berth: null };
    placeBoat(b, at);
    return b;
  });
  const cars = (m.cars || []).map((id) => {
    const [key, car] = Object.entries(CARS).find(([, c]) => c.id === id);
    const [x, y] = key.split(',').map(Number);
    return { id, kind: car.kind, x: x + 0.5, y: y + 0.5, node: { x, y }, target: null, dir: { x: 1, y: 0 }, moved: false };
  });
  const you = boats.find((b) => b.id === m.start);
  if (you.berth) you.berth = null; // you start aboard: your boat leaves its berth free behind it
  const s = {
    mission: index,
    phase,
    t: 0,
    tt: 0, // the traffic's clock
    fly: 0,
    clock: 0,
    started: false,
    done: false,
    mode: 'boat', // boat, walk, car
    you: { boat: you.id, car: null },
    boats,
    cars,
    person: { x: you.x, y: you.y, dir: 0, tile: null, nearCar: null },
    stops: m.stops.map((st) => ({ ...st, done: false })),
    carrying: [],
    ticked: [], // [stop index, clock] in the order ticked
    traffic: (m.traffic || ['ferry']).slice(),
    trans: null,
    trail: [],
    trailT: 0,
    events: [],
    stepAcc: 0,
    walkT: 0,
  };
  return s;
}
const YOUR_BOATS_HOME = { motor: { berth: 'portE' }, speed: { berth: 'marina2' }, row: { berth: 'lagoon' } };

function placeBoat(b, at) {
  if (at.berth) {
    const br = WORLD.berthById[at.berth];
    b.x = br.x + 0.5;
    b.y = br.y + 0.5;
    b.h = br.h;
    b.berth = br.id;
  } else {
    b.x = at.x;
    b.y = at.y;
    b.h = (at.h ?? 0) * D;
    b.berth = null;
  }
}

export const youBoat = (s) => s.boats.find((b) => b.id === s.you.boat);
export const youCar = (s) => s.cars.find((c) => c.id === s.you.car);
// Where you are: the boat, the car or the person.
export function youAt(s) {
  if (s.mode === 'boat') return youBoat(s);
  if (s.mode === 'car') return youCar(s);
  return s.person;
}
export const openStops = (s) => s.stops.filter((st) => !st.done);
// A stop is open to tick when its pickup (if it needs one) is being carried.
export const canTick = (s, st) => !st.done && (!st.needs || s.carrying.includes(st.needs));

// Start the clock and run one frame's time in fixed steps (so 60 and 120 fps move the same).
// The stick can be a function of the state, asked again at every fixed step (the autopilot).
export function step(s, dt, stick = null) {
  s.stepAcc += Math.min(dt, 0.25);
  while (s.stepAcc >= RULES.dt - 1e-9) {
    s.stepAcc -= RULES.dt;
    tick(s, RULES.dt, typeof stick === 'function' ? stick(s) : stick);
  }
}

function tick(s, dt, stick) {
  s.t += dt;
  if (s.phase === 'fly') {
    s.fly += dt;
    if (s.fly >= RULES.flyover) s.phase = 'play';
    return;
  }
  s.tt += dt; // traffic sails behind the card and in play; it waits for the fly-over
  if (s.phase === 'card' || s.phase === 'done') return;
  const g = stickToGrid(stick);
  if (!s.started && g.len > 0 && !s.trans) {
    s.started = true;
    s.events.push({ type: 'start' });
  }
  if (s.started) {
    s.clock += dt;
    s.trailT += dt;
    if (s.trailT >= RULES.trailEvery - 1e-9) {
      s.trailT -= RULES.trailEvery;
      if (s.trail.length < RULES.trailMax) {
        const p = youAt(s);
        s.trail.push([Math.round(p.x * 100) / 100, Math.round(p.y * 100) / 100]);
      }
    }
  }
  if (s.trans) {
    runTransition(s, dt);
    return;
  }
  // A tap while driving gets you out, wherever the car is.
  if (s.mode === 'car' && stick && stick.out) {
    s.trans = { kind: 'carOut', t: 0, car: s.you.car };
    return;
  }
  if (s.mode === 'boat') sailStep(s, youBoat(s), g, dt);
  else if (s.mode === 'walk') walkStep(s, g, dt);
  else if (s.mode === 'car') driveStep(s, youCar(s), g, dt);
}

// --- Boats --------------------------------------------------------------------------------------------
export function boatFits(kind, x, y) {
  return navigable(kind, tileAt(x, y));
}
function sailStep(s, b, g, dt) {
  const spec = RULES.boats[b.kind];
  if (b.hold > 0) {
    b.hold = Math.max(0, b.hold - dt);
    b.v = 0;
    return;
  }
  let want = 0;
  if (g.len > 0) {
    const diff = wrap(Math.atan2(g.y, g.x) - b.h);
    const turn = spec.turn * D * dt;
    b.h = wrap(b.h + clamp(diff, -turn, turn));
    if (Math.abs(diff) <= RULES.spin * D) want = spec.speed * g.len * (Math.abs(diff) < 90 * D ? 1 : 0.35);
  }
  const rate = spec.speed / (want > b.v ? RULES.accel : RULES.brake);
  b.v = want > b.v ? Math.min(want, b.v + rate * dt) : Math.max(want, b.v - rate * dt);
  if (b.v > 0) {
    const nx = b.x + Math.cos(b.h) * b.v * dt;
    const ny = b.y + Math.sin(b.h) * b.v * dt;
    const fits = (x, y) => boatFits(b.kind, x, y) && boatFits(b.kind, x + Math.cos(b.h) * spec.radius, y + Math.sin(b.h) * spec.radius);
    if (fits(nx, ny)) {
      b.x = nx;
      b.y = ny;
    } else if (fits(nx, b.y) && Math.abs(nx - b.x) > 1e-4) {
      b.x = nx; // glancing off the coast: slide along it, slowed
      b.v *= 0.97;
    } else if (fits(b.x, ny) && Math.abs(ny - b.y) > 1e-4) {
      b.y = ny;
      b.v *= 0.97;
    } else {
      b.v = 0; // nosed into the coast: stopped, never stuck (it can always turn away)
    }
  }
  // Moored and leisure boats and buoys you glide round: pushed clear, slowed, never held. Rocks and traffic
  // bump you: stopped and held, pushed clear; only when you're heading into them, so you can
  // always sail away from one you touch.
  for (const o of obstaclesAt(s)) {
    const d = Math.hypot(b.x - o.x, b.y - o.y);
    const r = o.r + spec.radius;
    if (d < r) {
      const ux = d > 1e-6 ? (b.x - o.x) / d : -Math.cos(b.h);
      const uy = d > 1e-6 ? (b.y - o.y) / d : -Math.sin(b.h);
      const closing = -(Math.cos(b.h) * ux + Math.sin(b.h) * uy) * b.v; // speed toward it
      const px = o.x + ux * (r + 0.02);
      const py = o.y + uy * (r + 0.02);
      if (boatFits(b.kind, px, py)) {
        b.x = px;
        b.y = py;
      }
      if (o.kind === 'moored' || o.kind === 'leisure' || o.kind === 'buoy') {
        if (closing > 1.2) {
          b.v *= 0.5; // a knock at speed: once, then you're slow enough to glide
          s.events.push({ type: 'bump', what: o.kind, x: b.x, y: b.y, soft: true });
        } else if (closing > 0) b.v *= 0.9;
        // Slide along its side, the way you're heading (head on: to its right), so you ease round it.
        if (closing > 0) {
          const along = Math.cos(b.h) * -uy + Math.sin(b.h) * ux;
          const side = along < -1e-3 ? -1 : 1;
          const sx = b.x + -uy * side * b.v * dt;
          const sy = b.y + ux * side * b.v * dt;
          if (boatFits(b.kind, sx, sy)) {
            b.x = sx;
            b.y = sy;
          }
        }
      } else if (closing > 0.2 || (o.kind === 'traffic' && b.v <= 0.2 && d < r - 0.05)) {
        b.v = 0;
        b.hold = RULES.bump;
        s.events.push({ type: 'bump', what: o.kind, id: o.id, x: b.x, y: b.y });
      }
    }
  }
  tryDock(s, b);
}
export function obstaclesAt(s) {
  const list = WORLD.obstacles.slice();
  for (const [i, l] of LEISURE.entries()) {
    const p = leisureAt(i, s.tt);
    list.push({ kind: 'leisure', x: p.x, y: p.y, r: [3, 4, 7].includes(l.craft) ? 0.6 : 0.38 });
  }
  for (const id of s.traffic) {
    const p = trafficAt(id, s.tt);
    list.push({ kind: 'traffic', id, x: p.x, y: p.y, r: TRAFFIC_R[id] });
  }
  return list;
}
export const berthFree = (s, br) => !s.boats.some((b) => b.berth === br.id);
function tryDock(s, b) {
  const spec = RULES.boats[b.kind];
  if (b.v >= spec.speed * RULES.dock.slow) return;
  for (const br of WORLD.berths) {
    if (!berthFree(s, br) || (br.shallow && !spec.shallow)) continue;
    const c = centre(br);
    const d = dist(b, c);
    // Heading slowly into the berth, or touching its jetty from any side.
    const heading = (Math.cos(b.h) * (c.x - b.x) + Math.sin(b.h) * (c.y - b.y)) / Math.max(d, 1e-6);
    let toward = d <= RULES.dock.range && (d < 0.6 || heading > 0.3);
    let touching = br.planks.some((t) => Math.hypot(Math.max(t.x - b.x, 0, b.x - (t.x + 1)), Math.max(t.y - b.y, 0, b.y - (t.y + 1))) <= spec.radius + RULES.dock.touch);
    // The berth just left: you can turn straight back into it, but a boat still sitting there, or
    // turning away from it, doesn't dock again.
    if (b.left === br.id) {
      if (d > RULES.dock.range + 0.5) b.left = null;
      else {
        toward = d >= RULES.dock.away && d <= RULES.dock.range && heading > 0.3;
        touching = false;
      }
    }
    if (!toward && !touching) continue;
    s.trans = { kind: 'dock', t: 0, boat: b.id, berth: br.id, from: { x: b.x, y: b.y, h: b.h } };
    b.v = 0;
    return;
  }
}

// --- On foot ------------------------------------------------------------------------------------------
// On foot, a tree's tile is grass with a trunk in the middle: only a circle round the trunk stops
// you (owner, 2026-11-11: "You cannot get to the tile ... Most of the grid is mainly grass. So you
// should be able to walk on the grass"). Paths (walkPath) still go round tree tiles, so the
// autopilot's routes are unchanged.
export const TRUNK_R = 0.2;
// The same for the fountain: only its basin stops you (owner, 2026-11-12: "you should do similar to
// the fountain tile that you did for the trees").
export const PROP_R = { T: TRUNK_R, '*': 0.3 };
const onFoot = (ch) => isWalkable(ch) || ch in PROP_R;
function blocked(x, y) {
  const r = RULES.personR;
  for (const [dx, dy] of [[-r, -r], [r, -r], [-r, r], [r, r]]) if (!onFoot(tileAt(x + dx, y + dy))) return true;
  for (let ty = Math.floor(y) - 1; ty <= Math.floor(y) + 1; ty++)
    for (let tx = Math.floor(x) - 1; tx <= Math.floor(x) + 1; tx++)
      if (PROP_R[tileAt(tx, ty)] && Math.hypot(x - tx - 0.5, y - ty - 0.5) < PROP_R[tileAt(tx, ty)] + r) return true;
  return false;
}
export const personBlocked = blocked;
function nearTrunk(x, y) {
  const pr = PROP_R[tileAt(Math.floor(x), Math.floor(y))];
  return !!pr && Math.hypot(x - Math.floor(x) - 0.5, y - Math.floor(y) - 0.5) < pr + RULES.personR + 0.1;
}
// The person walks in the 8 grid directions nearest the stick.
export function walkDir(g) {
  const a = Math.round(Math.atan2(g.y, g.x) / (45 * D)) * 45 * D;
  return { x: Math.cos(a), y: Math.sin(a) };
}
function walkStep(s, g, dt) {
  const p = s.person;
  if (g.len > 0) {
    const d = walkDir(g);
    p.dir = Math.atan2(d.y, d.x);
    const v = RULES.walk * g.len;
    const x0 = p.x;
    const y0 = p.y;
    const nx = p.x + d.x * v * dt;
    if (!blocked(nx, p.y)) p.x = nx;
    const ny = p.y + d.y * v * dt;
    if (!blocked(p.x, ny)) p.y = ny;
    // Walking straight into a trunk: step round it, to whichever side is open.
    if (p.x === x0 && p.y === y0) {
      for (const side of [1, -1]) {
        const sx = p.x - d.y * side * v * dt;
        const sy = p.y + d.x * side * v * dt;
        if (!blocked(sx, sy) && nearTrunk(p.x + d.x * 0.3, p.y + d.y * 0.3)) {
          p.x = sx;
          p.y = sy;
          break;
        }
      }
    }
    s.walkT += dt;
    if (s.walkT > 0.38) {
      s.walkT = 0;
      s.events.push({ type: 'step' });
    }
  }
  arrive(s, g);
}
// Touching a stop: standing on its doormat, or within a step of its building's walls.
export const STOP_TOUCH = 0.15; // tiles between the person's edge and the wall
export function touchesStop(p, stop) {
  if (Math.floor(p.x) === stop.mat.x && Math.floor(p.y) === stop.mat.y) return true;
  const dx = Math.max(stop.x - p.x, 0, p.x - (stop.x + 1));
  const dy = Math.max(stop.y - p.y, 0, p.y - (stop.y + 1));
  return Math.hypot(dx, dy) <= RULES.personR + STOP_TOUCH;
}
// What walking does: a stop's doormat or building ticks it, a berth with your boat boards it, a
// parked car gets you in.
function arrive(s, g = { x: 0, y: 0, len: 0 }) {
  const p = s.person;
  const key = `${Math.floor(p.x)},${Math.floor(p.y)}`;
  const entered = key !== p.tile;
  p.tile = key;
  // Parked cars: walking into one (from outside its reach) gets in.
  let near = null;
  for (const c of s.cars) if (dist(p, c) < RULES.carReach) near = c.id;
  if (near && near !== p.nearCar) {
    p.nearCar = near;
    s.trans = { kind: 'carIn', t: 0, car: near, from: { x: p.x, y: p.y } };
    return;
  }
  p.nearCar = near;
  // Your boat at this jetty end: stepping onto it, or pushing toward the boat while on it, boards.
  const berthId = WORLD.jettyEnds[key];
  const boat = berthId && s.boats.find((b) => b.berth === berthId);
  if (boat) {
    const d = walkDir(g);
    const toBoat = g.len > 0 && (d.x * (boat.x - p.x) + d.y * (boat.y - p.y)) / Math.max(dist(boat, p), 1e-6) > 0.3;
    if (entered || toBoat) {
      s.trans = { kind: 'board', t: 0, boat: boat.id, from: { x: p.x, y: p.y } };
      return;
    }
  }
  // A stop: walking onto its doormat, or up to its building from any side.
  const touching = new Set(s.stops.filter((st) => touchesStop(p, WORLD.stops[st.at])).map((st) => st.at));
  const was = p.touching || new Set();
  p.touching = touching;
  for (const st of s.stops) {
    if (st.done || !touching.has(st.at)) continue;
    if (!canTick(s, st)) {
      if (!was.has(st.at)) s.events.push({ type: 'locked', stop: s.stops.indexOf(st), needs: st.needs });
      continue;
    }
    st.done = true;
    if (st.gives) s.carrying.push(st.gives);
    if (st.needs) s.carrying.splice(s.carrying.indexOf(st.needs), 1);
    s.ticked.push([s.stops.indexOf(st), s.clock]);
    s.events.push({ type: 'stop', stop: s.stops.indexOf(st), clock: s.clock });
    if (s.stops.every((x) => x.done)) {
      s.done = true;
      s.phase = 'done';
      s.events.push({ type: 'finish', clock: s.clock });
    }
    return;
  }
}

// --- By car -------------------------------------------------------------------------------------------
const AXES = [[1, 0], [0, 1], [-1, 0], [0, -1]];
export function roadNeighbours(x, y) {
  return AXES.filter(([dx, dy]) => isRoad(tileAt(x + dx, y + dy))).map(([dx, dy]) => ({ x: dx, y: dy }));
}
// The car stops within reach of a car park, a jetty or a stop's door: you can get out there.
export function canGetOut(s, c) {
  const near = (t) => dist(c, centre(t)) <= RULES.outReach;
  return (
    WORLD.parks.some(near) ||
    WORLD.jetties.some(near) ||
    s.stops.some((st) => near(WORLD.stops[st.at].mat))
  );
}
function driveStep(s, c, g, dt) {
  if (g.len === 0) {
    if (canGetOut(s, c)) s.trans = { kind: 'carOut', t: 0, car: c.id };
    return;
  }
  let left = RULES.car * g.len * dt;
  for (let guard = 0; guard < 8 && left > 1e-9; guard++) {
    if (!c.target) {
      let best = null;
      let bestDot = -0.05;
      for (const d of roadNeighbours(c.node.x, c.node.y)) {
        const dot = d.x * g.x + d.y * g.y;
        if (dot > bestDot + 1e-6) {
          bestDot = dot;
          best = d;
        }
      }
      if (!best) return;
      c.dir = best;
      c.target = { x: c.node.x + best.x, y: c.node.y + best.y };
    } else if (c.dir.x * g.x + c.dir.y * g.y < -0.7) {
      // The stick points back: turn round, toward the tile we came from.
      const back = c.node;
      c.node = c.target;
      c.target = back;
      c.dir = { x: -c.dir.x, y: -c.dir.y };
    }
    const tc = centre(c.target);
    const rem = dist(c, tc);
    if (left >= rem - 1e-9) {
      c.x = tc.x;
      c.y = tc.y;
      c.node = c.target;
      c.target = null;
      left = 0; // at each junction the next branch is the stick's to choose, next step
    } else {
      c.x += c.dir.x * left;
      c.y += c.dir.y * left;
      left = 0;
    }
    c.moved = true;
  }
}

// --- Transitions (about 0.3 s, no buttons) --------------------------------------------------------------
function runTransition(s, dt) {
  const tr = s.trans;
  tr.t += dt;
  const k = Math.min(1, tr.t / RULES.transition);
  if (tr.kind === 'dock') {
    const b = s.boats.find((x) => x.id === tr.boat);
    const br = WORLD.berthById[tr.berth];
    const c = centre(br);
    b.x = tr.from.x + (c.x - tr.from.x) * k;
    b.y = tr.from.y + (c.y - tr.from.y) * k;
    b.h = tr.from.h + wrap(br.h - tr.from.h) * k;
    if (k >= 1) {
      b.berth = br.id;
      b.v = 0;
      s.mode = 'walk';
      s.person.x = br.end.x + 0.5;
      s.person.y = br.end.y + 0.5;
      s.person.tile = `${br.end.x},${br.end.y}`;
      s.person.dir = br.h;
      s.trans = null;
      s.events.push({ type: 'dock', berth: br.id });
    }
  } else if (tr.kind === 'board') {
    const b = s.boats.find((x) => x.id === tr.boat);
    s.person.x = tr.from.x + (b.x - tr.from.x) * k;
    s.person.y = tr.from.y + (b.y - tr.from.y) * k;
    if (k >= 1) {
      b.left = b.berth;
      b.berth = null;
      s.you.boat = b.id;
      s.mode = 'boat';
      s.trans = null;
      s.events.push({ type: 'board', boat: b.id });
    }
  } else if (tr.kind === 'carIn') {
    const c = s.cars.find((x) => x.id === tr.car);
    s.person.x = tr.from.x + (c.x - tr.from.x) * k;
    s.person.y = tr.from.y + (c.y - tr.from.y) * k;
    if (k >= 1) {
      s.you.car = c.id;
      s.mode = 'car';
      s.trans = null;
      s.events.push({ type: 'door', car: c.id });
    }
  } else if (tr.kind === 'carOut') {
    const c = s.cars.find((x) => x.id === tr.car);
    if (k >= 1) {
      s.person.x = c.x;
      s.person.y = c.y;
      s.person.tile = `${Math.floor(c.x)},${Math.floor(c.y)}`;
      s.person.nearCar = c.id;
      s.you.car = null;
      s.mode = 'walk';
      s.trans = null;
      s.events.push({ type: 'door', car: c.id });
    }
  }
}

// --- Medals -------------------------------------------------------------------------------------------
export function medalFor(index, time) {
  const par = MISSIONS[index].par;
  if (time <= par * RULES.medals.gold) return 'gold';
  if (time <= par * RULES.medals.silver) return 'silver';
  if (time <= par * RULES.medals.bronze) return 'bronze';
  return null;
}
export const medalTimes = (index) => {
  const par = MISSIONS[index].par;
  return { gold: par * RULES.medals.gold, silver: par * RULES.medals.silver, bronze: par * RULES.medals.bronze };
};

// --- Paths --------------------------------------------------------------------------------------------
// A* over tiles. ok(x, y) says a tile can be entered; cost(x, y) adds to a step's length.
function astar(from, goal, ok, { diag = true, cost = () => 0, isGoal = null } = {}) {
  const key = (x, y) => y * SIZE + x;
  const done = isGoal || ((x, y) => x === goal.x && y === goal.y);
  const h = goal ? (x, y) => Math.hypot(goal.x - x, goal.y - y) : () => 0;
  const open = [[h(from.x, from.y), 0, from.x, from.y]];
  const g = new Map([[key(from.x, from.y), 0]]);
  const prev = new Map();
  const dirs = diag ? [...AXES, [1, 1], [1, -1], [-1, 1], [-1, -1]] : AXES;
  while (open.length) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (open[i][0] < open[bi][0]) bi = i;
    const [, gc, x, y] = open.splice(bi, 1)[0];
    if (gc > (g.get(key(x, y)) ?? Infinity)) continue;
    if (done(x, y)) {
      const out = [{ x, y }];
      let k = key(x, y);
      while (prev.has(k)) {
        k = prev.get(k);
        out.unshift({ x: k % SIZE, y: Math.floor(k / SIZE) });
      }
      return out;
    }
    for (const [dx, dy] of dirs) {
      const nx = x + dx;
      const ny = y + dy;
      if (!ok(nx, ny)) continue;
      if (dx && dy && (!ok(x + dx, y) || !ok(x, y + dy))) continue; // no cutting corners
      const ng = gc + Math.hypot(dx, dy) + cost(nx, ny);
      if (ng < (g.get(key(nx, ny)) ?? Infinity)) {
        g.set(key(nx, ny), ng);
        prev.set(key(nx, ny), key(x, y));
        open.push([ng + h(nx, ny), ng, nx, ny]);
      }
    }
  }
  return null;
}
const tileOf = (p) => ({ x: Math.floor(p.x), y: Math.floor(p.y) });
const nearObstacle = (x, y, pad) =>
  WORLD.obstacles.some((o) => Math.hypot(o.x - (x + 0.5), o.y - (y + 0.5)) < o.r + pad);
const coastNear = (kind, x, y) => {
  for (const [dx, dy] of [...AXES, [1, 1], [1, -1], [-1, 1], [-1, -1]]) if (!navigable(kind, tileAt(x + dx, y + dy))) return true;
  return false;
};
export function walkPath(from, to, avoid = []) {
  const skip = new Set(avoid.map((t) => `${t.x},${t.y}`));
  return astar(tileOf(from), to, (x, y) => isWalkable(tileAt(x, y)) && ((x === to.x && y === to.y) || !skip.has(`${x},${y}`)));
}
export function sailPath(kind, from, to) {
  return astar(tileOf(from), to, (x, y) => (x === to.x && y === to.y) || (navigable(kind, tileAt(x, y)) && !nearObstacle(x, y, 0.55)), {
    cost: (x, y) => (coastNear(kind, x, y) ? 1.5 : 0),
  });
}
export function drivePath(from, isGoal) {
  return astar(from, null, (x, y) => isRoad(tileAt(x, y)), { diag: false, isGoal });
}

// --- The autopilot ------------------------------------------------------------------------------------
// It follows a route of legs, each one of:
//   { sail: berthId }   sail your boat to that berth and dock
//   { walk: 'A' }       walk to stop A's doormat
//   { walk: 'car:id' }  walk into that parked car
//   { board: berthId }  walk onto that berth's jetty end and board your boat there
//   { drive: 'A' | berthId | 'park' }  drive to where you can get out by that door, jetty or the nearest
//                       car park, and let go
export function createPilot(route) {
  return { route, leg: 0, path: null, pathFor: -1 };
}
export function straightClear(kind, a, b, pad) {
  const n = Math.ceil(dist(a, b) / 0.2);
  for (let i = 1; i <= n; i++) {
    const x = a.x + ((b.x - a.x) * i) / n;
    const y = a.y + ((b.y - a.y) * i) / n;
    for (const [dx, dy] of [[pad, 0], [-pad, 0], [0, pad], [0, -pad]]) if (!navigable(kind, tileAt(x + dx, y + dy))) return false;
    if (WORLD.obstacles.some((o) => Math.hypot(o.x - x, o.y - y) < o.r + pad)) return false;
  }
  return true;
}
export function pilotStick(s, pilot) {
  if (s.phase !== 'play' || s.trans) return null;
  const leg = pilot.route[pilot.leg];
  if (!leg) return null;
  // A leg is over when its goal is reached.
  const over =
    (leg.sail && s.mode === 'walk') ||
    (leg.walk && !leg.walk.startsWith('car:') && s.stops.some((st) => st.at === leg.walk && st.done)) ||
    (leg.walk && leg.walk.startsWith('car:') && s.mode === 'car') ||
    (leg.board && s.mode === 'boat') ||
    (leg.drive && s.mode === 'walk' && pilot.drove);
  if (over) {
    pilot.leg++;
    pilot.path = null;
    pilot.aim = null;
    pilot.drove = false;
    return pilotStick(s, pilot);
  }
  if (leg.sail) {
    const b = youBoat(s);
    const br = WORLD.berthById[leg.sail];
    if (pilot.pathFor !== pilot.leg || !pilot.path) {
      pilot.path = sailPath(b.kind, b, br);
      pilot.pathFor = pilot.leg;
    }
    const c = centre(br);
    const pad = RULES.boats[b.kind].radius + 0.1;
    // Steer for the furthest point of the path ahead in clear sight (tighter when hugging a coast),
    // looked for ten times a second.
    if (pilot.aim && s.t - pilot.aimT < 0.1) return gridToStick(pilot.aim.x - b.x, pilot.aim.y - b.y, dist(b, centre(br)) < 4 ? 0.3 : 1);
    let near = 0;
    for (let i = 1; i < pilot.path.length; i++) if (dist(b, centre(pilot.path[i])) < dist(b, centre(pilot.path[near]))) near = i;
    let target = null;
    for (const p2 of [pad, 0.15]) {
      if (straightClear(b.kind, b, c, p2)) target = c;
      for (let i = pilot.path.length - 1; !target && i > near; i--) {
        const p = centre(pilot.path[i]);
        if (straightClear(b.kind, b, p, p2)) target = p;
      }
      if (target) break;
    }
    if (!target) target = centre(pilot.path[Math.min(near + 1, pilot.path.length - 1)]);
    pilot.aim = target;
    pilot.aimT = s.t;
    const d = dist(b, c);
    const len = d < 4 ? 0.3 : 1;
    return gridToStick(target.x - b.x, target.y - b.y, len);
  }
  if (leg.walk || leg.board) {
    const p = s.person;
    let goal;
    if (leg.board) goal = WORLD.berthById[leg.board].end;
    else if (leg.walk.startsWith('car:')) goal = tileOf(s.cars.find((c) => c.id === leg.walk.slice(4)));
    else goal = WORLD.stops[leg.walk].mat;
    // Walk round parked cars, except the one being walked to.
    const avoid = s.cars.filter((c) => !(leg.walk && leg.walk === 'car:' + c.id)).map(tileOf);
    if (pilot.pathFor !== pilot.leg || !pilot.path) {
      pilot.path = walkPath(p, goal, avoid);
      pilot.pathFor = pilot.leg;
    }
    // The next tile centre not yet reached; off the path (a corner cut), plan again from here.
    const here = tileOf(p);
    let i = pilot.path.findIndex((t) => t.x === here.x && t.y === here.y);
    if (i < 0) {
      pilot.path = walkPath(p, goal, avoid);
      i = 0;
    }
    const path = pilot.path;
    let target = centre(path[Math.min(i + 1, path.length - 1)]);
    if (leg.walk && leg.walk.startsWith('car:') && i >= path.length - 2) target = s.cars.find((c) => c.id === leg.walk.slice(4));
    // Head for the target, snapping as the person does; aim to the centre line first so walls don't snag.
    let dx = target.x - p.x;
    let dy = target.y - p.y;
    if (Math.abs(dx) > 0.12 && Math.abs(dy) > 0.12 && i >= 0 && path[i + 1] && (path[i + 1].x === here.x || path[i + 1].y === here.y)) {
      // An axis step: centre up on the other axis first.
      if (path[i + 1].x === here.x) dx = (here.x + 0.5 - p.x) * 3;
      else dy = (here.y + 0.5 - p.y) * 3;
    }
    if (Math.hypot(dx, dy) < 1e-3) dx = 0.01;
    return gridToStick(dx, dy, 1);
  }
  if (leg.drive) {
    const c = youCar(s);
    if (pilot.pathFor !== pilot.leg || !pilot.path) {
      const near = leg.drive === 'park' ? WORLD.parks : WORLD.stops[leg.drive] ? [WORLD.stops[leg.drive].mat] : WORLD.berthById[leg.drive].planks;
      const isGoal = (x, y) => near.some((t) => Math.hypot(x - t.x, y - t.y) <= RULES.outReach);
      pilot.path = drivePath(c.target || c.node, isGoal);
      pilot.pathFor = pilot.leg;
    }
    const path = pilot.path;
    const last = path[path.length - 1];
    if (!c.target && c.node.x === last.x && c.node.y === last.y) {
      pilot.drove = true;
      return null; // let go: out you get
    }
    if (c.target) return gridToStick(c.dir.x, c.dir.y, 1);
    const i = path.findIndex((t) => t.x === c.node.x && t.y === c.node.y);
    const next = path[i + 1];
    return gridToStick(next.x - c.node.x, next.y - c.node.y, 1);
  }
  return null;
}

// Run a mission headless with the autopilot on a route; returns the finished state (or the state at
// the time limit) and the route taken.
export function runPilot(index, route, { limit = 600, fly = true } = {}) {
  const s = createMission(index, { phase: fly ? 'fly' : 'play' });
  const pilot = createPilot(route);
  while (s.phase !== 'done' && s.t < limit) {
    step(s, RULES.dt, s.phase === 'play' ? pilotStick(s, pilot) : null);
    s.events.length = 0;
  }
  return s;
}

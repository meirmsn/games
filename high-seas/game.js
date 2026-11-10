// High Seas: sail a dinghy by the wind across an isometric archipelago, run cargo between ports,
// buy the keel, the spinnaker and the galleon, and carry the Grand Charter to the lighthouse.
// One canvas, no library. The isometric maths is shared (../shared/iso.js); the sea comes from
// world.js and the boats from boat.js. The spec is specs/high-seas.md.
//
// window.__seas exposes the state and a step(dt) that advances the simulation without drawing,
// so tests can set up a moment and check what the rules do with it.
import { mountShell } from '../shared/game-shell.js';
import { createIso, createCamera, sortByDepth, attachGestures } from '../shared/iso.js';
import { makeWorld, newSeed, hashSeed, rng, wrap, tileAt, nearestNav, routeLength, routePath, DEEP, SHALLOW, SAND, GRASS, W, H } from './world.js';
import { BOATS, rig, polarAt, offWind, clampToWedge, turnTowards, heelTarget, drawDinghy } from './boat.js';
import { drawPerson, flagCloth } from './people.js';
import { ATLAS } from './atlas.js';

// --- Tuning: every knob in one place -------------------------------------------------------------
const TUNE = {
  firstLimit: 40, // s: the first contract's route at the starting wind
  prices: { keel: 60, spinnaker: 130, galleon: 360 },
  goodsBase: 7, // coins for any fare
  goodsPerTile: 0.85, // and per tile of route
  guidedTrips: 3, // the first trips: one passenger at a time, nothing else waiting
  respawn: 7, // s before a port has someone waiting again
  hopTime: 0.7, // s for a passenger to hop aboard or ashore
  residents: 5, // most delivered passengers that stay standing on a quay
  traffic: 4, // boats that sail between the ports on their own
  trafficSpeed: 1.05, // tiles a second
  gustEvery: 2.2, // s between gust chains
  gustMax: 14,
  gustStrength: [1.25, 1.7],
  gustRadius: [1.4, 2.4],
  gustLife: [9, 13],
  gustDrift: 1.0, // tiles a second, downwind
  heelHold: 1.5, // s at full heel before a knockdown
  knockTime: 2.2,
  bumpTime: 0.8,
  shiftWarn: 45, // s between the announcement of a wind shift and the shift
  shiftAfterDeliveries: 4,
  shiftEvery: 180,
  shiftTurn: 5, // s the wind takes to swing round
  assistSlow: 0.3, // under this share of top speed …
  assistAfter: 4, // … for this long, a gust forms upwind
  ringRadius: 1.45,
  ringRearm: 2.1,
  dockGlide: 1.0,
  dragDead: 20, // px before a drag steers
  keyTurn: 1, // keys turn at the boat's turn rate
};

// --- Page, shell and sound -----------------------------------------------------------------------
const canvas = document.getElementById('sea');
let ctx = canvas.getContext('2d'); // swapped briefly while a cached bitmap is drawn
const $ = (sel) => document.querySelector(sel);
const screens = {
  start: $('[data-screen="start"]'),
  buy: $('[data-screen="buy"]'),
  pause: $('[data-screen="pause"]'),
  over: $('[data-screen="over"]'),
};
const hud = $('[data-hud]');
const muteBtn = $('[data-mute]');

const SOUNDS = {};
for (const n of ['luff', 'tack', 'gust', 'creak', 'splash', 'bump', 'bell', 'coins', 'load', 'buy', 'fanfare', 'shift', 'sea'])
  SOUNDS[n] = `sounds/${n}.mp3`;
const { sound } = mountShell({ sounds: SOUNDS });
const played = []; // the last sounds played, for tests
function play(name, opts) {
  played.push(name);
  if (played.length > 40) played.shift();
  sound.play(name, opts);
}
function syncMute() {
  muteBtn.setAttribute('aria-pressed', String(sound.muted));
  muteBtn.setAttribute('aria-label', sound.muted ? 'Unmute' : 'Mute');
}
muteBtn.addEventListener('click', () => {
  sound.muted = !sound.muted;
  syncMute();
});
syncMute();
let stopSea = null;

const atlas = new Image();
atlas.src = 'img/atlas.png';

// --- View --------------------------------------------------------------------------------------
const iso = createIso({ tileW: 64, tileH: 32 });
const ZS = 32; // screen px per tile of height
const cam = createCamera({ zoom: 1, minZoom: 0.3, maxZoom: 2.4 });
let dpr = 1;
let baseZoom = 1;
let userZoom = 1; // pinch, relative to the base
function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = window.innerWidth;
  const h = window.innerHeight;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  cam.resize(w, h);
  // The dinghy about 48 px long on a phone, a little bigger on bigger screens.
  baseZoom = Math.max(1.4, Math.min(1.9, (Math.min(w, h) / 390) * 1.4));
  const wb = worldBox();
  cam.minZoom = Math.min(baseZoom, cam.fitZoom(wb, 12));
  cam.maxZoom = baseZoom * 2;
  cam.zoom = Math.min(cam.maxZoom, Math.max(cam.minZoom, baseZoom * userZoom));
}
function worldBox() {
  const a = iso.toScreen(0, 0);
  const b = iso.toScreen(W, 0);
  const c = iso.toScreen(0, H);
  const d = iso.toScreen(W, H);
  return { minX: c.x, maxX: b.x, minY: a.y - 40, maxY: d.y };
}
window.addEventListener('resize', resize);

// --- State ---------------------------------------------------------------------------------------
const S = {
  mode: 'start', // start | sail | docked | paused | over
  paused: false,
  world: null,
  seed: '',
  rand: Math.random,
  clock: 0, // the voyage's time, s
  t: 0, // the sea's own clock, for waves: runs always
  coins: 0,
  owned: { keel: false, spinnaker: false, galleon: false },
  deliveries: 0,
  hold: [], // passengers aboard
  waiting: [], // passengers waiting on jetties: { c, at, t, respawn }
  residents: {}, // port id -> passengers delivered there, standing on its quay
  hops: [], // passengers hopping between boat and jetty: { c, port, on, t }
  respawnAt: {}, // port id -> clock when someone may wait there again
  traffic: [],
  crates: [], // passengers in the water: { x, y, c }
  gusts: [],
  gustIn: 1,
  wind: { dir: 0, strength: 1, next: null, shiftAt: Infinity, from: 0, turnT: 0 },
  shifts: 0,
  boat: null,
  portAt: 0, // where the boat is docked (or last docked)
  armed: {}, // port id -> may dock
  slowFor: 0,
  assistIn: Infinity,
  steer: null, // { x0, y0, x, y } while a finger steers
  keys: { left: false, right: false },
  dock: null, // { t, fromX, fromY, fromH, port }
  paid: null,
  done: null,
  wakes: [],
  streaks: [],
  fx: [],
  sounds: { luffAt: 0, creakAt: 0, gustIn: false, side: 0 },
};
let nextId = 1;

function newBoat(x, y, h) {
  return { x, y, h, target: h, v: 0, heel: 0, heelHold: 0, knock: 0, bump: 0, inGust: 1, boom: 0, fill: 0, luff: 0, spin: 0, clamped: false };
}

function currentRig() {
  return rig(S.owned);
}

// --- Voyage ---------------------------------------------------------------------------------------
function buildWorld(seed) {
  const dinghy = rig({});
  return makeWorld(seed, { polarAt: (off) => polarAt(dinghy, off), topSpeed: dinghy.top, firstLimit: TUNE.firstLimit });
}

function loadSea(seed) {
  S.seed = seed;
  S.world = buildWorld(seed);
  S.rand = rng(hashSeed('voyage:' + seed));
  S.wind.dir = S.world.wind;
  const p = S.world.ports[0];
  S.boat = newBoat(p.bx, p.by, Math.atan2(-p.dir[1], -p.dir[0]));
  S.portAt = 0;
  S.gusts = [];
  S.crates = [];
  for (let k = 0; k < 6; k++) spawnGusts(true);
  makeTraffic();
  const box = worldBox();
  cam.bounds = { minX: box.minX + 40, maxX: box.maxX - 40, minY: box.minY + 40, maxY: box.maxY - 40 };
  cam.lookAt(iso.toScreen(S.boat.x, S.boat.y));
}

function resetVoyage() {
  S.clock = 0;
  S.coins = 0;
  S.owned = { keel: false, spinnaker: false, galleon: false };
  S.deliveries = 0;
  S.hold = [];
  S.waiting = [];
  S.residents = {};
  S.hops = [];
  S.respawnAt = {};
  S.crates = [];
  S.shifts = 0;
  S.wind.next = null;
  S.wind.shiftAt = Infinity;
  S.wind.turnT = 0;
  S.wind.fair = false;
  S.wind.fairGoal = undefined;
  S.done = null;
  S.paid = null;
  S.slowFor = 0;
  S.assistIn = Infinity;
  S.armed = {};
}

function startVoyage(seed, resume) {
  loadSea(seed);
  resetVoyage();
  if (resume) {
    S.coins = resume.coins;
    S.owned = { keel: !!(resume.flags & 1), spinnaker: !!(resume.flags & 2), galleon: !!(resume.flags & 4) };
    S.deliveries = resume.deliveries;
    S.clock = resume.clock;
    S.shifts = resume.shifts;
    S.wind.dir = wrap(S.world.wind + resume.windTurn);
    S.portAt = resume.port;
    const p = S.world.ports[resume.port] || S.world.ports[0];
    S.portAt = p.id;
    const out = S.owned.galleon ? 0.9 : 0;
    S.boat = newBoat(p.bx + p.dir[0] * out, p.by + p.dir[1] * out, Math.atan2(-p.dir[1], -p.dir[0]));
    if (S.owned.galleon) scheduleShift(TUNE.shiftWarn + TUNE.shiftEvery / 2);
    else if (S.deliveries >= TUNE.shiftAfterDeliveries) scheduleShift(TUNE.shiftWarn + 30);
  }
  for (const p of S.world.ports) S.armed[p.id] = p.id !== S.portAt;
  S.armed.lighthouse = true;
  if (!stopSea) stopSea = sound.loop('sea', { gain: 0.35 });
  arriveAt(S.world.ports[S.portAt], true);
}

// --- Contracts ------------------------------------------------------------------------------------
function placeById(id) {
  return id === 'lighthouse' ? S.world.lighthouse : S.world.ports[id];
}

// A passenger: where they're going, their fare, and how they look. kind is 'fare' or 'charter'
// (the lighthouse keeper, who ends the voyage).
const COATS = ['#3d5a80', '#9c6644', '#6d597a', '#2a9d8f', '#bc4749', '#e9c46a', '#577590', '#8d6e63'];
function makeContract(from, to, kind = 'fare') {
  const w = S.world;
  const a = placeById(from);
  const b = placeById(to);
  const len = routeLength(w.light, a.rx, a.ry, b.rx, b.ry);
  const pay = kind === 'charter' ? 0 : Math.round(TUNE.goodsBase + TUNE.goodsPerTile * len);
  const c = { id: nextId++, from, to, kind, colour: b.colour, shape: shapeOf(to), name: b.name, pay, len };
  c.bags = pay < 15 ? 1 : pay < 25 ? 2 : 3; // coin bags at their feet: what the fare is worth
  c.coat = kind === 'charter' ? '#f4f1e8' : COATS[Math.floor(S.rand() * COATS.length)];
  return c;
}

// Each place's flag has its own shape as well as its colour, so destinations read without colour.
const SHAPES = ['square', 'pennant', 'swallow', 'triangle'];
const shapeOf = (id) => (id === 'lighthouse' ? 'star' : SHAPES[id % SHAPES.length]);

function holdRoom() {
  return currentRig().cargo - S.hold.length;
}

// Where someone waits on a port's jetty: near its end, by the berth.
function jettySpot(p, k = 0) {
  const [di, dj] = p.dir;
  const back = 0.55 + k * 0.32;
  return { x: p.bx - di * back - dj * 0.12, y: p.by - dj * back + di * 0.12 };
}

function spawnWaiting(at, to, kind = 'fare') {
  const port = placeById(at);
  const c = makeContract(at, to, kind);
  S.waiting.push({ c, at, t: 0 });
  void port;
  return c;
}

// Keep people waiting. The first trips are guided: one passenger at a time, at the port you're at.
// After that every port has someone (two, once you sail the galleon), and you choose where to go.
// With the galleon, the lighthouse keeper waits at the shipyard for the last passage.
function refillWaiting() {
  const ports = S.world.ports;
  const others = (id) => ports.filter((p) => p.id !== id);
  const pick = (id) => {
    const list = others(id).filter((p) => !S.waiting.some((w) => w.at === id && w.c.to === p.id));
    return (list.length ? list : others(id))[Math.floor(S.rand() * (list.length || others(id).length))].id;
  };
  if (S.deliveries < TUNE.guidedTrips && !S.owned.galleon) {
    if (S.waiting.length || S.hold.length || S.hops.length || S.crates.length) return;
    const at = S.portAt;
    const to = S.deliveries === 0 && at === 0 ? S.world.first.port : pick(at);
    spawnWaiting(at, to);
    return;
  }
  const want = S.owned.galleon ? 2 : 1;
  for (const p of ports) {
    const here = S.waiting.filter((w) => w.at === p.id && w.c.kind === 'fare').length;
    if (here < want && (S.respawnAt[p.id] || 0) <= S.clock) {
      spawnWaiting(p.id, pick(p.id));
      S.respawnAt[p.id] = S.clock + TUNE.respawn * 0.5;
    }
  }
  const keeper = S.waiting.some((w) => w.c.kind === 'charter') || S.hold.some((c) => c.kind === 'charter') || S.crates.some((cr) => cr.c.kind === 'charter') || S.hops.some((h) => h.c.kind === 'charter');
  if (S.owned.galleon && !keeper) spawnWaiting(0, 'lighthouse', 'charter');
}

// What the shipyard sells next, in order, and whether you can pay for it.
function nextBuy() {
  return ['keel', 'spinnaker', 'galleon'].find((w) => !S.owned[w]) || null;
}
const canBuyNext = () => {
  const w = nextBuy();
  return !!w && S.coins >= TUNE.prices[w];
};

function buy(what = nextBuy()) {
  if (S.mode !== 'docked' || S.portAt !== 0 || !what) return false;
  if (S.owned[what]) return false;
  if ((what === 'keel' || what === 'spinnaker') && S.owned.galleon) return false;
  const price = TUNE.prices[what];
  if (S.coins < price) return false;
  S.coins -= price;
  S.owned[what] = true;
  if (what === 'galleon') {
    const b = S.boat;
    S.boat = newBoat(b.x, b.y, b.h);
    scheduleShift(TUNE.shiftWarn);
    refillWaiting();
  }
  play('buy');
  fxText(S.boat.x, S.boat.y, '★', '#ffd23f');
  saveHash();
  showScreen(canBuyNext() ? 'buy' : null);
  renderBuy();
  renderHud();
  return true;
}

// Does this port give the boat a reason to stop? Someone to drop off, someone waiting with a seat
// free, or the shipyard with something you can afford. Otherwise the boat sails past.
function wantsDock(p) {
  if (S.hold.some((c) => c.to === p.id)) return true;
  if (S.hold.some((c) => c.kind === 'charter')) return false; // the last passage: no detours
  if (p.id === 'lighthouse') return false;
  // Someone waiting, and a seat for them.
  if (holdRoom() > 0 && S.waiting.some((w) => w.at === p.id)) return true;
  return p.id === 0 && canBuyNext();
}

// --- Docking -------------------------------------------------------------------------------------
function arriveAt(port, quiet) {
  S.mode = 'docked';
  S.dock = null; // the glide is over: a drag sails again
  S.portAt = port.id;
  const b = S.boat;
  b.v = 0;
  b.heel = 0;
  b.heelHold = 0;
  S.steer = null;
  // Those bound here hop ashore, one after another, and are paid for.
  let paid = 0;
  let k = 0;
  S.hold = S.hold.filter((c) => {
    if (c.to !== port.id) return true;
    S.hops.push({ c, port: port.id, on: false, t: -k * 0.35 });
    k++;
    paid += c.pay;
    if (c.kind !== 'charter') S.deliveries++;
    if (S.deliveries === TUNE.shiftAfterDeliveries && S.wind.shiftAt === Infinity) scheduleShift(TUNE.shiftWarn);
    return false;
  });
  if (paid) {
    S.coins += paid;
    S.paid = { amount: paid };
    play('coins');
    fxText(port.bx, port.by, `+${paid}`, '#ffd23f');
    hudBump();
  } else S.paid = null;
  if (!quiet) play('bell', { rate: 0.95 + Math.random() * 0.1 });
  if (port.id === 'lighthouse') {
    S.endIn = TUNE.hopTime + 0.9; // the keeper steps ashore, then the voyage ends
    return;
  }
  // Then whoever waits here hops aboard, while there's a seat.
  S.boardIn = k * 0.35 + (k ? TUNE.hopTime : 0.5);
  refillWaiting();
  saveHash();
  showScreen(port.id === 0 && canBuyNext() ? 'buy' : null);
  renderBuy();
  renderHud();
}

// While docked: people hop ashore and aboard; the next waiting passenger boards when a seat's free.
function stepDocked(dt) {
  for (const h of S.hops) {
    h.t += dt;
    if (h.t >= TUNE.hopTime && !h.done) {
      h.done = true;
      if (h.on) {
        S.hold.push(h.c);
        play('load', { rate: 1.1 });
        if (h.c.kind === 'charter') fairWind();
        renderHud();
      } else {
        S.residents[h.port] = Math.min(TUNE.residents, (S.residents[h.port] || 0) + 1);
        refillWaiting();
      }
    }
  }
  S.hops = S.hops.filter((h) => !h.done);
  if (S.endIn !== undefined) {
    S.endIn -= dt;
    if (S.endIn <= 0) {
      S.endIn = undefined;
      endVoyage();
    }
    return;
  }
  if (S.mode !== 'docked' || S.dock) return;
  S.boardIn = (S.boardIn || 0) - dt;
  if (S.boardIn > 0) return;
  // The lighthouse keeper boards first and sails alone: the last passage is theirs. Others board
  // while there's a seat, unless the keeper is aboard.
  const seats = holdRoom() - S.hops.filter((h) => h.on).length;
  const keeperAboard = S.hold.some((c) => c.kind === 'charter') || S.hops.some((h) => h.on && h.c.kind === 'charter');
  const here = S.waiting.filter((x) => x.at === S.portAt);
  const w = here.find((x) => x.c.kind === 'charter') || (keeperAboard ? null : here[0]);
  if (w && seats > 0) {
    S.waiting.splice(S.waiting.indexOf(w), 1);
    S.hops.push({ c: w.c, port: S.portAt, on: true, t: 0 });
    S.respawnAt[S.portAt] = S.clock + TUNE.respawn;
    S.boardIn = 0.45;
  }
}

function castOff() {
  if (S.mode !== 'docked') return;
  const port = placeById(S.portAt);
  S.mode = 'sail';
  S.dock = null;
  const b = S.boat;
  const r = currentRig();
  b.h = Math.atan2(port.dir[1], port.dir[0]);
  b.target = clampToWedge(r, b.h, S.wind.dir);
  b.v = r.top * 0.35;
  S.armed[S.portAt] = false;
  S.paid = null;
  // Anyone still mid-hop finishes it: aboard if they were boarding, ashore if they were leaving.
  for (const h of S.hops) h.t = TUNE.hopTime;
  stepDocked(0);
  showScreen(null);
}

// --- Wind and gusts ----------------------------------------------------------------------------
// The Grand Charter sails on a fair wind: as it's loaded the wind swings round so the lighthouse
// lies on a broad reach (135° off the wind, the galleon's best), and it holds to the end.
function fairWind() {
  const y = S.world.ports[0];
  const l = S.world.lighthouse;
  // Along the galleon's actual way out: the deep-water route's first ten tiles, which is where a
  // square-rigger has least room to beat (the route may start away from the lighthouse itself).
  const route = routePath(S.world.deep, y.rx, y.ry, l.rx, l.ry);
  const ahead = route ? route[Math.min(route.length - 1, 10)] : { x: l.rx, y: l.ry };
  const bearing = Math.atan2(ahead.y - y.ry, ahead.x - y.rx);
  const a = wrap(bearing + Math.PI / 4);
  const b = wrap(bearing - Math.PI / 4);
  // The nearer of the two broad reaches to the wind that's blowing.
  S.wind.next = Math.abs(wrap(a - S.wind.dir)) <= Math.abs(wrap(b - S.wind.dir)) ? a : b;
  S.wind.shiftAt = S.clock;
  S.wind.turnT = 0;
  S.wind.fair = true;
  play('shift');
}

function scheduleShift(inS) {
  if (S.wind.fair) {
    S.wind.next = null;
    S.wind.shiftAt = Infinity;
    return;
  }
  S.wind.shiftAt = S.clock + inS;
  const turn = (S.rand() < 0.5 ? 1 : -1) * (Math.PI / 2) * (0.85 + S.rand() * 0.3);
  S.wind.next = wrap(S.wind.dir + turn);
  play('shift');
}

function spawnGusts(anywhere, near) {
  const b = S.boat;
  const up = S.wind.dir + Math.PI;
  let cx;
  let cy;
  if (near) {
    cx = b.x + Math.cos(up) * 3.2;
    cy = b.y + Math.sin(up) * 3.2;
  } else if (anywhere || !b) {
    cx = 2 + S.rand() * (W - 4);
    cy = 2 + S.rand() * (H - 4);
  } else {
    // Mostly upwind of the boat, so they drift towards it, within a screen or so.
    const a = up + (S.rand() - 0.5) * 2.4;
    const d = 4 + S.rand() * 6;
    cx = b.x + Math.cos(a) * d;
    cy = b.y + Math.sin(a) * d;
  }
  // A chain of one to three, in a line across the wind: a lane to ride.
  const n = near ? 1 : 1 + Math.floor(S.rand() * 3);
  const across = S.wind.dir + Math.PI / 2 + (S.rand() - 0.5) * 0.8;
  for (let k = 0; k < n; k++) {
    if (S.gusts.length >= TUNE.gustMax) S.gusts.shift();
    const [g0, g1] = TUNE.gustStrength;
    const [r0, r1] = TUNE.gustRadius;
    const [l0, l1] = TUNE.gustLife;
    S.gusts.push({
      x: cx + Math.cos(across) * (k - (n - 1) / 2) * 3.4,
      y: cy + Math.sin(across) * (k - (n - 1) / 2) * 3.4,
      g: near ? Math.max(1.3, g0 + S.rand() * (g1 - g0) * 0.4) : g0 + S.rand() * (g1 - g0),
      r: r0 + S.rand() * (r1 - r0),
      life: l0 + S.rand() * (l1 - l0),
      age: anywhere ? S.rand() * 4 : 0,
      seed: S.rand() * 100,
    });
  }
}

// A gust's strength now (it swells in and fades out over its life).
function gustNow(g) {
  const k = Math.min(1, g.age / 1.5, (g.life - g.age) / 2);
  return Math.max(0, k);
}

function gustAt(x, y) {
  let best = 1;
  for (const g of S.gusts) {
    const d = Math.hypot(x - g.x, y - g.y);
    if (d >= g.r) continue;
    const edge = Math.min(1, (1 - d / g.r) * 2.5); // flat in the middle, soft at the rim
    const f = 1 + (g.g - 1) * gustNow(g) * edge;
    if (f > best) best = f;
  }
  return best;
}

// --- Simulation ----------------------------------------------------------------------------------
function solid(x, y) {
  const t = tileAt(S.world, x, y);
  if (S.owned.galleon) return t !== DEEP;
  return t >= SAND;
}

function hitRock(x, y, rad) {
  for (const r of S.world.rocks) if (Math.hypot(r.x - x, r.y - y) < 0.42 + rad) return r;
  return null;
}

function spill() {
  const b = S.boat;
  const nav = S.owned.galleon ? S.world.deep : S.world.light;
  S.hold.forEach((c, k) => {
    const a = b.h + Math.PI + (k - (S.hold.length - 1) / 2) * 0.9;
    let p = nearestNav(nav, b.x + Math.cos(a) * 1.3, b.y + Math.sin(a) * 1.3, S.world.rocks, 2.2);
    if (!nav[Math.floor(p.y) * W + Math.floor(p.x)]) p = nearestNav(nav, b.x, b.y); // nowhere clear: just afloat
    S.crates.push({ x: p.x, y: p.y, c, t: 0 });
  });
  S.hold = [];
  renderHud();
}

function step(dt) {
  S.t += dt;
  // Waves of wind streaks and gusts drift whatever the mode, so the sea is alive behind the cards.
  driftSea(dt);
  if (S.mode === 'paused' || S.mode === 'start' || S.mode === 'over') {
    tickFx(dt);
    return;
  }
  S.clock += dt;
  stepWind(dt);
  S.refillT = (S.refillT || 0) - dt;
  if (S.refillT <= 0) {
    S.refillT = 1;
    refillWaiting();
  }
  for (const w of S.waiting) w.t += dt;
  if (S.mode === 'docked') {
    stepDockGlide(dt);
    stepDocked(dt);
  } else if (S.mode === 'sail') {
    stepBoat(dt);
  }
  tickFx(dt);
}

function stepWind(dt) {
  const w = S.wind;
  // The last passage: the wind follows the galleon home, keeping the next stretch of its route
  // on a broad reach. It swings slowly (the vane shows it), never more than 15° a second.
  if (w.fair && w.turnT === 0 && w.next === null && S.mode === 'sail' && S.boat) {
    S.fairT = (S.fairT || 0) - dt;
    if (S.fairT <= 0) {
      S.fairT = 2;
      const b = S.boat;
      const l = S.world.lighthouse;
      const from = nearestNav(S.world.deep, b.x, b.y);
      const route = routePath(S.world.deep, from.x, from.y, l.rx, l.ry);
      if (route && route.length > 2) {
        const ahead = route[Math.min(route.length - 1, 8)];
        const bearing = Math.atan2(ahead.y - b.y, ahead.x - b.x);
        const a = wrap(bearing + Math.PI / 4);
        const c = wrap(bearing - Math.PI / 4);
        w.fairGoal = Math.abs(wrap(a - w.dir)) <= Math.abs(wrap(c - w.dir)) ? a : c;
      }
    }
    if (w.fairGoal !== undefined) {
      const d = wrap(w.fairGoal - w.dir);
      const step = (15 * Math.PI) / 180 * dt;
      w.dir = Math.abs(d) <= step ? w.fairGoal : wrap(w.dir + Math.sign(d) * step);
    }
  }
  if (w.next !== null && S.clock >= w.shiftAt && w.turnT === 0) {
    w.from = w.dir;
    w.turnT = 1e-6;
  }
  if (w.turnT > 0) {
    w.turnT += dt / TUNE.shiftTurn;
    const k = Math.min(1, w.turnT);
    const e = k * k * (3 - 2 * k);
    w.dir = wrap(w.from + wrap(w.next - w.from) * e);
    if (k >= 1) {
      w.dir = w.next;
      w.next = null;
      w.turnT = 0;
      S.shifts++;
      S.wind.shiftAt = Infinity;
      scheduleShift(TUNE.shiftEvery);
      // The boat keeps its course, re-clamped to the new wedge.
      if (S.boat) S.boat.target = clampToWedge(currentRig(), S.boat.target, w.dir);
    }
  }
  S.gustIn -= dt;
  if (S.gustIn <= 0 && S.boat) {
    spawnGusts(false);
    S.gustIn = TUNE.gustEvery * (0.7 + S.rand() * 0.6);
  }
}

// --- Traffic: boats with their own errands -----------------------------------------------------
// A tug, a motorboat, a fishing rowboat and a container ship sail between the ports on engines or
// oars (the wind doesn't trouble them), stop at each quay for a while, and go on to another.
const TRAFFIC = [
  { sprite: 'traffic23', speed: 0.9, pause: 5 },
  { sprite: 'traffic19', speed: 1.5, pause: 3 },
  { sprite: 'traffic29', speed: 0.6, pause: 7 },
  { sprite: 'traffic6', speed: 0.75, pause: 8, big: true },
];
function makeTraffic() {
  const w = S.world;
  const r = rng(hashSeed('traffic:' + S.seed));
  S.traffic = TRAFFIC.slice(0, TUNE.traffic).map((kind, k) => {
    const at = w.ports[(k + 1) % w.ports.length];
    const t = { ...kind, id: k, rand: r, at: at.id, x: at.rx, y: at.ry, h: 0, path: null, i: 0, wait: r() * 6 };
    nextLeg(t);
    // Spread them out along their first leg, so the sea is busy from the first frame.
    if (t.path) {
      t.i = Math.floor(r() * t.path.length * 0.8);
      t.x = t.path[t.i].x;
      t.y = t.path[t.i].y;
      t.wait = 0;
    }
    return t;
  });
}
function nextLeg(t) {
  const w = S.world;
  const others = w.ports.filter((p) => p.id !== t.at);
  const to = others[Math.floor(t.rand() * others.length)];
  const from = placeById(t.at);
  t.path = routePath(w.deep, t.x, t.y, to.rx, to.ry) || routePath(w.deep, from.rx, from.ry, to.rx, to.ry);
  t.to = to.id;
  t.i = 0;
}
function stepTraffic(dt) {
  for (const t of S.traffic) {
    if (t.wait > 0) {
      t.wait -= dt;
      if (t.wait <= 0) nextLeg(t);
      continue;
    }
    if (!t.path || t.i >= t.path.length) {
      t.at = t.to;
      t.wait = t.pause;
      continue;
    }
    const tgt = t.path[t.i];
    const dx = tgt.x - t.x;
    const dy = tgt.y - t.y;
    const d = Math.hypot(dx, dy);
    const v = t.speed * dt;
    if (d <= v) {
      t.x = tgt.x;
      t.y = tgt.y;
      t.i++;
    } else {
      t.x += (dx / d) * v;
      t.y += (dy / d) * v;
    }
    if (d > 0.01) t.h = Math.atan2(dy, dx);
    if (Math.random() < dt * 8) {
      S.wakes.push({ x: t.x - Math.cos(t.h) * 0.4, y: t.y - Math.sin(t.h) * 0.4, h: t.h, age: 0, v: Math.min(1, t.speed / 1.2) });
      if (S.wakes.length > 140) S.wakes.shift();
    }
  }
}

function driftSea(dt) {
  stepTraffic(dt);
  const dx = Math.cos(S.wind.dir) * TUNE.gustDrift;
  const dy = Math.sin(S.wind.dir) * TUNE.gustDrift;
  for (const g of S.gusts) {
    g.age += dt;
    g.x += dx * dt;
    g.y += dy * dt;
  }
  S.gusts = S.gusts.filter((g) => g.age < g.life);
  for (const cr of S.crates) cr.t += dt;
}

function stepDockGlide(dt) {
  const d = S.dock;
  if (!d) return;
  d.t = Math.min(1, d.t + dt / TUNE.dockGlide);
  const e = 1 - (1 - d.t) ** 3;
  const p = d.port;
  const out = S.owned.galleon ? 0.9 : 0; // the galleon lies off the jetty's end
  const tx = p.bx + p.dir[0] * out;
  const ty = p.by + p.dir[1] * out;
  S.boat.x = d.fromX + (tx - d.fromX) * e;
  S.boat.y = d.fromY + (ty - d.fromY) * e;
  const toH = Math.atan2(-p.dir[1], -p.dir[0]);
  S.boat.h = wrap(d.fromH + wrap(toH - d.fromH) * e);
  S.boat.v = 0;
  if (d.t >= 1 && !d.arrived) {
    d.arrived = true;
    arriveAt(p);
  }
}

function stepBoat(dt) {
  const b = S.boat;
  const r = currentRig();
  const wind = S.wind.dir;
  // Steering.
  if (b.knock > 0) {
    b.knock -= dt;
    b.v *= Math.exp(-dt * 3);
    if (b.knock <= 0) {
      b.knock = 0;
      b.heel = 0;
    }
  } else if (b.bump > 0) {
    // Knocked off a rock: the bow swings round to the way it was thrown, then steering returns.
    b.bump -= dt;
    b.h = turnTowards(b.h, b.bumpAway, r.turn * 1.5, dt);
    b.target = clampToWedge(r, b.bumpAway, wind);
    b.v *= Math.exp(-dt * 1.5);
  } else {
    if (S.keys.left || S.keys.right) {
      // Keys turn the wanted heading itself, through the wedge if held: a tack.
      const dir = (S.keys.right ? 1 : 0) - (S.keys.left ? 1 : 0);
      b.target = wrap(b.h + dir * 0.6);
      b.keyTurning = true;
    } else if (b.keyTurning) {
      b.keyTurning = false;
      b.target = clampToWedge(r, b.h, wind);
    }
    b.h = turnTowards(b.h, b.target, r.turn, dt);
    // A tack: the bow crosses the wind.
    const side = Math.sign(wrap(b.h - (wind + Math.PI)));
    if (S.sounds.side && side && side !== S.sounds.side && offWind(b.h, wind) < 1.2) play('tack');
    if (side) S.sounds.side = side;
  }
  // Speed.
  const off = offWind(b.h, wind);
  const g = gustAt(b.x, b.y);
  if (g > 1.25 && !b.inGustPrev) play('gust', { gain: 0.7 });
  b.inGustPrev = g > 1.25;
  b.inGust = g;
  const want = b.knock > 0 ? 0 : r.top * polarAt(r, off) * g * S.wind.strength;
  const k = want > b.v ? 1.2 : 0.8;
  b.v += (want - b.v) * (1 - Math.exp(-dt * k));
  // The sail.
  const inIrons = off < r.wedge - 0.02;
  b.luff += ((inIrons ? 1 : 0) - b.luff) * (1 - Math.exp(-dt * 8));
  if (inIrons && S.clock - S.sounds.luffAt > 1.2) {
    play('luff', { gain: 0.8 });
    S.sounds.luffAt = S.clock;
  }
  // The boom goes to leeward, eased out as the boat bears away.
  const fromSide = Math.sign(wrap(wind + Math.PI - b.h)) || 1; // + the wind comes over starboard?
  const ease = Math.max(0.1, Math.min(1.35, (off - 0.35) * 0.62));
  b.boom += (-fromSide * ease - b.boom) * (1 - Math.exp(-dt * 5));
  b.fill = inIrons ? 0 : Math.min(1, polarAt(r, off) * g);
  b.spin += ((r.spinnaker && off > 2.0 ? 1 : 0) - b.spin) * (1 - Math.exp(-dt * 3));
  // Heel.
  const ht = b.knock > 0 ? 0 : heelTarget(r, off, g);
  b.heel += (ht - b.heel) * (1 - Math.exp(-dt * 3));
  if (b.heel >= 0.995 && b.knock <= 0) b.heelHold += dt;
  else b.heelHold = Math.max(0, b.heelHold - dt * 2);
  if (b.heel > 0.7 && S.clock - S.sounds.creakAt > 1.4) {
    play('creak', { rate: 0.9 + b.heel * 0.2 });
    S.sounds.creakAt = S.clock;
  }
  if (b.heelHold >= TUNE.heelHold) knockDown();
  // Move, sliding along land.
  const nx = b.x + Math.cos(b.h) * b.v * dt;
  const ny = b.y + Math.sin(b.h) * b.v * dt;
  const rad = r.radius;
  // The hull's bow tip and its beam on each side must stay in water.
  const reach = r.length / 2 + 0.06;
  // How strictly the hull must clear land: the whole hull, then the bow alone, then the centre (a
  // tight spot never traps the boat).
  const blockedAt = (x, y, hh, strict = 2) => {
    const ch = Math.cos(hh);
    const sh = Math.sin(hh);
    if (solid(x, y)) return true;
    if (strict >= 1 && solid(x + ch * reach * (strict === 2 ? 1 : 0.6), y + sh * reach * (strict === 2 ? 1 : 0.6))) return true;
    return (
      strict === 2 &&
      (solid(x + ch * reach * 0.4 - sh * rad, y + sh * reach * 0.4 + ch * rad) ||
        solid(x + ch * reach * 0.4 + sh * rad, y + sh * reach * 0.4 - ch * rad))
    );
  };
  if (!blockedAt(nx, ny, b.h)) {
    b.x = nx;
    b.y = ny;
    b.grounded = 0;
    b.slideSide = 0;
  } else {
    // Against the shore: slide along it, in the open direction nearest the heading, keeping to the
    // side it chose (so it runs along the coast instead of jittering), never dead.
    b.grounded = (b.grounded || 0) + dt;
    const v = Math.max(b.v * 0.97, r.top * 0.25);
    let moved = false;
    for (let strict = 2; strict >= 0 && !moved; strict--)
      for (const m of [0.4, 0.8, 1.2, 1.6, 2.1, 2.6, Math.PI]) {
        const first = b.slideSide || 1;
        for (const d of [m * first, -m * first]) {
          const hh = b.h + d;
          const x = b.x + Math.cos(hh) * v * dt;
          const y = b.y + Math.sin(hh) * v * dt;
          if (blockedAt(x, y, hh, strict)) continue;
          b.x = x;
          b.y = y;
          b.v = v;
          if (!b.slideSide) b.slideSide = Math.sign(d) || 1;
          // The bow follows the way it slides; the wanted heading follows too if it pointed ashore.
          b.h = turnTowards(b.h, hh, r.turn * 1.2, dt);
          if (Math.abs(wrap(b.target - b.h)) < 1.2) b.target = clampToWedge(r, b.h, wind);
          moved = true;
          break;
        }
        if (moved) break;
      }
    if (!moved) b.v = r.top * 0.2;
  }
  // Rocks.
  const rock = b.bump <= 0 && b.knock <= 0 ? hitRock(b.x, b.y, rad) : null;
  if (rock) {
    // Thrown clear of the rock, onto open water: straight away from it, or the nearest open
    // direction round it when that would be ashore (a rock by a beach never pins the boat).
    const away = Math.atan2(b.y - rock.y, b.x - rock.x);
    const out = 0.45 + rad + 0.08;
    let a = away;
    for (const d of [0, 0.5, -0.5, 1, -1, 1.5, -1.5, 2, -2, 2.6, -2.6, Math.PI]) {
      const x = rock.x + Math.cos(away + d) * out;
      const y = rock.y + Math.sin(away + d) * out;
      if (!solid(x, y) && !solid(x + Math.cos(away + d) * 0.3, y + Math.sin(away + d) * 0.3)) {
        a = away + d;
        break;
      }
    }
    b.x = rock.x + Math.cos(a) * out;
    b.y = rock.y + Math.sin(a) * out;
    b.bumpAway = a;
    b.bump = TUNE.bumpTime;
    b.v = r.top * 0.2;
    play('bump');
    shake(0.25);
    // The dinghy pitches its passengers into the water; the galleon is big enough to keep them.
    if (S.hold.length && !S.owned.galleon) spill();
    fxText(b.x, b.y, 'Crunch!', '#ffffff');
  }
  // Other boats: a gentle shove apart, never damage.
  for (const t of S.traffic) {
    const d = Math.hypot(b.x - t.x, b.y - t.y);
    const min = rad + (t.big ? 0.9 : 0.45);
    if (d < min && d > 1e-6) {
      // Shoved apart, and round: head-on, the shove turns sideways, so the boat slides past.
      const push = (min - d) * 0.5;
      const ax = (b.x - t.x) / d;
      const ay = (b.y - t.y) / d;
      const headOn = -(ax * Math.cos(b.h) + ay * Math.sin(b.h));
      const side = ax * -Math.sin(b.h) + ay * Math.cos(b.h) >= 0 ? 1 : -1;
      const slide = Math.max(0, headOn) * b.v * dt * 1.2;
      const nx = b.x + ax * push - Math.sin(b.h) * side * slide;
      const ny = b.y + ay * push + Math.cos(b.h) * side * slide;
      if (!solid(nx, ny)) {
        b.x = nx;
        b.y = ny;
      }
      if (!t.bumped || S.clock - t.bumped > 1.5) {
        t.bumped = S.clock;
        play('bump', { gain: 0.35, rate: 1.3 });
      }
    }
  }
  // People in the water to pick up.
  for (const cr of S.crates.slice()) {
    if (Math.hypot(cr.x - b.x, cr.y - b.y) < 0.55 + rad * 0.5 && holdRoom() > 0) {
      S.crates.splice(S.crates.indexOf(cr), 1);
      S.hold.push(cr.c);
      play('load');
      renderHud();
    }
  }
  // Docking.
  for (const p of [...S.world.ports, S.world.lighthouse]) {
    const d = Math.hypot(p.rx - b.x, p.ry - b.y);
    if (d > TUNE.ringRearm + (S.owned.galleon ? 1.0 : 0)) S.armed[p.id] = true;
    if (!wantsDock(p)) continue;
    if (d < ringR() && S.armed[p.id] && b.knock <= 0) {
      S.mode = 'docked';
      S.dock = { t: 0, fromX: b.x, fromY: b.y, fromH: b.h, port: p };
      S.steer = null;
      return;
    }
  }
  // Hidden assist: slow for a while, and a gust forms upwind.
  if (b.v < r.top * TUNE.assistSlow && b.knock <= 0) S.slowFor += dt;
  else S.slowFor = 0;
  if (S.slowFor >= TUNE.assistAfter && S.assistIn === Infinity) S.assistIn = 0.5 + S.rand() * 1.5;
  if (S.assistIn !== Infinity) {
    S.assistIn -= dt;
    if (S.assistIn <= 0) {
      spawnGusts(false, true);
      S.assistIn = Infinity;
      S.slowFor = -6; // not again straight away
    }
  }
  // Wake.
  if (b.v > 0.2) {
    S.wakes.push({ x: b.x - Math.cos(b.h) * r.length * 0.45, y: b.y - Math.sin(b.h) * r.length * 0.45, h: b.h, age: 0, v: b.v / r.top });
    if (S.wakes.length > 90) S.wakes.shift();
  }
}

function knockDown() {
  const b = S.boat;
  b.knock = TUNE.knockTime;
  b.heelHold = 0;
  b.heel = 1.5;
  play('splash');
  shake(0.35);
  if (S.hold.length) spill();
  fxText(b.x, b.y, 'Knocked down!', '#ffffff');
}

// --- Effects ---------------------------------------------------------------------------------------
let shakeT = 0;
function shake(t) {
  shakeT = Math.max(shakeT, t);
}
function fxText(x, y, text, colour) {
  S.fx.push({ x, y, text, colour, age: 0 });
}
function tickFx(dt) {
  for (const f of S.fx) f.age += dt;
  S.fx = S.fx.filter((f) => f.age < 1.6);
  for (const w of S.wakes) w.age += dt;
  S.wakes = S.wakes.filter((w) => w.age < 1.6);
  shakeT = Math.max(0, shakeT - dt);
}

function endVoyage() {
  S.mode = 'over';
  const time = S.clock;
  const best = readBest();
  const prev = best[S.seed];
  const isBest = !prev || time < prev;
  if (isBest) {
    best[S.seed] = Math.round(time);
    writeBest(best);
  }
  S.done = { time, best: isBest ? time : prev, isBest };
  play('fanfare');
  $('[data-final-time]').textContent = fmt(time);
  $('[data-final-detail]').textContent = isBest
    ? prev
      ? `A new best for sea ${S.seed} (it was ${fmt(prev)}).`
      : `Sea ${S.seed}: your first voyage here.`
    : `Sea ${S.seed}: your best is ${fmt(prev)}.`;
  history.replaceState(null, '', location.pathname + location.search);
  showScreen('over');
  hud.hidden = true;
}

const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

// --- Saving: the address and a best per sea -------------------------------------------------------
const BEST_KEY = 'high-seas-best';
function readBest() {
  try {
    return JSON.parse(localStorage.getItem(BEST_KEY) || '{}') || {};
  } catch {
    return {};
  }
}
function writeBest(b) {
  try {
    localStorage.setItem(BEST_KEY, JSON.stringify(b));
  } catch {}
}

const HASH_V = 'v1';
function sum(s) {
  return (hashSeed('high-seas|' + s) % 46656).toString(36).padStart(3, '0');
}
function saveHash() {
  if (!S.world) return;
  const flags = (S.owned.keel ? 1 : 0) | (S.owned.spinnaker ? 2 : 0) | (S.owned.galleon ? 4 : 0);
  const turn = Math.round((wrap(S.wind.dir - S.world.wind) * 180) / Math.PI);
  const body = [HASH_V, S.seed, S.coins, flags, S.deliveries, S.portAt, Math.round(S.clock), S.shifts, turn].join('.');
  history.replaceState(null, '', '#' + body + '.' + sum(body));
}
function readHash() {
  let h = '';
  try {
    h = decodeURIComponent(location.hash.slice(1));
  } catch {
    return null; // not even text: a fresh sea
  }
  if (!h) return null;
  const parts = h.split('.');
  if (parts[0] !== HASH_V) return { seed: /^[A-Z0-9]{3,12}$/i.test(parts[0]) ? parts[0].toUpperCase() : null };
  const seed = /^[A-Z0-9]{3,12}$/i.test(parts[1] || '') ? parts[1].toUpperCase() : null;
  if (parts.length !== 10 || !seed) return { seed };
  const body = parts.slice(0, 9).join('.');
  if (sum(body) !== parts[9]) return { seed };
  const n = parts.slice(2, 9).map(Number);
  if (n.some((v) => !Number.isFinite(v) || v < -360)) return { seed };
  const [coins, flags, deliveries, port, clock, shifts, turn] = n;
  if (port < 0 || port > 3 || flags < 0 || flags > 7 || coins < 0) return { seed };
  return { seed, resume: { coins, flags, deliveries, port, clock, shifts, windTurn: (turn * Math.PI) / 180 } };
}

// --- Screens --------------------------------------------------------------------------------------
function showScreen(name) {
  for (const [k, el] of Object.entries(screens)) el.hidden = k !== name;
  hud.hidden = name === 'start' || name === 'over' || S.mode === 'start';
}

function hudBump() {
  const el = $('.coins');
  el.classList.remove('bump');
  void el.offsetWidth;
  el.classList.add('bump');
}

// Small pictures, no words: the next thing the shipyard sells, and the lighthouse at the end.
const ICONS = {
  keel: '<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M5 17h30l-5 7H10z" fill="#c9553f"/><path d="M17 24h7l-2 11h-3z" fill="#2f6f9f"/><path d="M20 4v13" stroke="#6b4a2b" stroke-width="2"/><path d="M21 5l9 11h-9z" fill="#fbf6ea"/></svg>',
  spinnaker: '<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M5 27h28l-4 6H9z" fill="#2f6f9f"/><path d="M15 6v21" stroke="#6b4a2b" stroke-width="2"/><path d="M16 7c14 1 19 10 13 19H16z" fill="#e8604c"/><path d="M16 7c8 3 10 10 7 19h-7z" fill="#fbf6ea"/></svg>',
  galleon: '<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M3 26h34l-5 8H9z" fill="#9c6b3c"/><path d="M10 26V8M20 26V5M30 26V9" stroke="#6b4a2b" stroke-width="2"/><path d="M5 10h10l-1 12H6zM15 7h10l-1 16h-8zM25 11h10l-1 11h-8z" fill="#fbf6ea"/></svg>',
  lighthouse: '<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M15 36l2-24h6l2 24z" fill="#fbf6ea"/><path d="M15.7 28h8.6l.4 4h-9.4zM16.6 18h6.8l.4 4h-7.6z" fill="#e8604c"/><path d="M14 12h12l-2-5h-8z" fill="#2f3a44"/><circle cx="20" cy="9" r="2.4" fill="#ffd23f"/></svg>',
};

function renderHud() {
  $('[data-coins]').textContent = S.coins;
  // Seats: one per passenger the boat can carry, filled in their coat's colour.
  const hold = $('[data-hold]');
  const cap = currentRig().cargo;
  const parts = [];
  for (let k = 0; k < cap; k++) {
    const c = S.hold[k];
    parts.push(c ? `<span class="slot full" style="--c:${c.colour}"></span>` : '<span class="slot"></span>');
  }
  hold.innerHTML = parts.join('');
  // The goal: the next thing to buy, filling as the coins come in; then the lighthouse.
  const what = nextBuy();
  const goal = $('[data-goal]');
  const f = what ? Math.min(1, S.coins / TUNE.prices[what]) : 1;
  goal.dataset.goal = what || 'lighthouse';
  goal.classList.toggle('ready', !!what && f >= 1);
  goal.setAttribute('aria-label', what ? `Next: the ${what}, ${S.coins} of ${TUNE.prices[what]} coins` : 'Next: the lighthouse');
  goal.innerHTML = `${ICONS[what || 'lighthouse']}<svg class="ring" viewBox="0 0 44 44" aria-hidden="true"><circle cx="22" cy="22" r="20" fill="none" stroke="rgb(255 255 255 / 25%)" stroke-width="3"/><circle cx="22" cy="22" r="20" fill="none" stroke="#ffd23f" stroke-width="3" stroke-linecap="round" stroke-dasharray="${(f * 125.7).toFixed(1)} 200"/></svg>`;
}

// At the shipyard, when you can afford it: one button, the picture of what's next and its price.
function renderBuy() {
  const what = nextBuy();
  const btn = $('[data-buy]');
  if (!what) return;
  btn.dataset.buy = what;
  btn.setAttribute('aria-label', `Buy the ${what} for ${TUNE.prices[what]} coins`);
  btn.innerHTML = `${ICONS[what]}<span class="price"><span class="coin-icon" aria-hidden="true"></span>${TUNE.prices[what]}</span>`;
}

// --- Drawing ----------------------------------------------------------------------------------
const C = {
  deep: '#4a9fd0',
  deepDark: '#3f92c4',
  shallow: '#9cd5e2',
  sand: '#d8d19e',
  sandL: '#cdc687',
  sandR: '#c1b868',
  grass: '#8bb54a',
  grassL: '#7da343',
  grassR: '#74973e',
  dirtL: '#bb8d5d',
  dirtR: '#9e7758',
};
const LIFT = { [SAND]: 5, [GRASS]: 11 };

function tilePath(i, j, z) {
  const a = iso.toScreen(i, j, z);
  const b = iso.toScreen(i + 1, j, z);
  const c = iso.toScreen(i + 1, j + 1, z);
  const d = iso.toScreen(i, j + 1, z);
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.lineTo(c.x, c.y);
  ctx.lineTo(d.x, d.y);
  ctx.closePath();
}

function quad(p1, p2, p3, p4, fill) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(p1.x, p1.y);
  ctx.lineTo(p2.x, p2.y);
  ctx.lineTo(p3.x, p3.y);
  ctx.lineTo(p4.x, p4.y);
  ctx.closePath();
  ctx.fill();
}

function drawGround(range, items) {
  const w = S.world;
  const t = S.t;
  // Shallows in one path, glints on the deep water; land blocks go to the sorted pass.
  const shallow = new Path2D();
  for (let s = range.x0 + range.y0; s <= range.x1 + range.y1; s++)
    for (let i = range.x0; i <= range.x1; i++) {
      const j = s - i;
      if (j < range.y0 || j > range.y1) continue;
      const tt = tileAt(w, i + 0.5, j + 0.5);
      const inside = i >= 0 && j >= 0 && i < W && j < H;
      if (!inside) continue;
      if (tt === SHALLOW) {
        const a = iso.toScreen(i, j);
        shallow.moveTo(a.x, a.y);
        shallow.lineTo(a.x + iso.tileW / 2, a.y + iso.tileH / 2);
        shallow.lineTo(a.x, a.y + iso.tileH);
        shallow.lineTo(a.x - iso.tileW / 2, a.y + iso.tileH / 2);
        shallow.closePath();
      } else if (tt >= SAND) {
        items.push({ depth: iso.depth(i + 0.5, j + 0.5, 0), draw: () => drawBlock(i, j, tt) });
      } else if (((i * 7 + j * 13) % 5 === 0)) {
        // Deep water: a glint that comes and goes.
        const ph = t * 0.9 + i * 0.7 + j * 1.3;
        const a = Math.sin(ph);
        if (a > 0.3) {
          const c = iso.toScreen(i + 0.5, j + 0.5);
          ctx.strokeStyle = `rgba(255,255,255,${(a - 0.3) * 0.45})`;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(c.x - 7, c.y);
          ctx.quadraticCurveTo(c.x, c.y - 3, c.x + 7, c.y);
          ctx.stroke();
        }
      }
    }
  ctx.fillStyle = C.shallow;
  ctx.fill(shallow);
  ctx.strokeStyle = C.shallow; // hide hairline seams
  ctx.lineWidth = 1;
  ctx.stroke(shallow);
  if (S.owned.galleon) {
    ctx.fillStyle = 'rgba(232,96,76,0.13)';
    ctx.fill(shallow);
  }
  // Surf where the shallows meet the beach: a soft white line that breathes. Four brightness
  // levels, one path each.
  const surf = [new Path2D(), new Path2D(), new Path2D(), new Path2D()];
  for (let j = Math.max(0, range.y0); j <= Math.min(H - 1, range.y1); j++)
    for (let i = Math.max(0, range.x0); i <= Math.min(W - 1, range.x1); i++) {
      if (tileAt(w, i + 0.5, j + 0.5) < SAND) continue;
      const lvl = Math.min(3, Math.floor((0.5 + 0.5 * Math.sin(t * 1.6 + i * 0.9 + j * 0.6)) * 4));
      const path = surf[lvl];
      for (const [di, dj, x0, y0, x1, y1] of [
        [1, 0, 1, 0, 1, 1],
        [0, 1, 0, 1, 1, 1],
        [-1, 0, 0, 0, 0, 1],
        [0, -1, 0, 0, 1, 0],
      ]) {
        if (tileAt(w, i + di + 0.5, j + dj + 0.5) >= SAND) continue;
        const off = 0.12 + 0.05 * Math.sin(t * 1.6 + i + j);
        const p = iso.toScreen(i + x0 + di * off, j + y0 + dj * off, -2);
        const q = iso.toScreen(i + x1 + di * off, j + y1 + dj * off, -2);
        path.moveTo(p.x, p.y);
        path.lineTo(q.x, q.y);
      }
    }
  ctx.lineWidth = 2;
  surf.forEach((path, k) => {
    ctx.strokeStyle = `rgba(255,255,255,${0.25 + 0.4 * ((k + 0.5) / 4)})`;
    ctx.stroke(path);
  });
}


// A land block, stamped from a bitmap drawn once per kind (its type and its front neighbours'
// heights) and per zoom: much cheaper than filling its faces every frame.
const blockCache = new Map();
let blockScale = 0;
function drawBlock(i, j, tt, at = (x, y) => tileAt(S.world, x, y)) {
  const right = at(i + 1.5, j + 0.5);
  const left = at(i + 0.5, j + 1.5);
  const zr = right >= SAND ? LIFT[right] : -3;
  const zl = left >= SAND ? LIFT[left] : -3;
  const scale = Math.round(cam.zoom * dpr * 8) / 8;
  if (scale !== blockScale) {
    blockCache.clear();
    blockScale = scale;
  }
  const key = `${tt}|${zr}|${zl}`;
  let bmp = blockCache.get(key);
  if (!bmp) {
    // The block's top corner at (hw, top margin); it spans the tile's width and its height plus
    // its lift and the faces below the water line.
    const hw = iso.tileW / 2;
    const up = LIFT[tt] + 2;
    const h = iso.tileH + up + 8;
    const c = document.createElement('canvas');
    c.width = Math.ceil((iso.tileW + 2) * scale);
    c.height = Math.ceil(h * scale);
    const g = c.getContext('2d');
    g.setTransform(scale, 0, 0, scale, (hw + 1) * scale, up * scale);
    const saved = ctx;
    ctx = g;
    blockFaces(0, 0, tt, zr, zl);
    ctx = saved;
    bmp = { c, ox: hw + 1, oy: up, w: iso.tileW + 2, h };
    blockCache.set(key, bmp);
  }
  const p = iso.toScreen(i, j);
  ctx.drawImage(bmp.c, p.x - bmp.ox, p.y - bmp.oy, bmp.c.width / scale, bmp.c.height / scale);
}

function blockFaces(i, j, tt, zr, zl) {
  const z = LIFT[tt];
  const top = tt === GRASS ? C.grass : C.sand;
  if (zr < z) {
    const sideTop = tt === GRASS ? C.grassR : C.sandR;
    quad(iso.toScreen(i + 1, j, z), iso.toScreen(i + 1, j + 1, z), iso.toScreen(i + 1, j + 1, zr), iso.toScreen(i + 1, j, zr), zr < 0 ? C.dirtR : sideTop);
    if (zr < 0) quad(iso.toScreen(i + 1, j, z), iso.toScreen(i + 1, j + 1, z), iso.toScreen(i + 1, j + 1, z - 3), iso.toScreen(i + 1, j, z - 3), sideTop);
  }
  if (zl < z) {
    const sideTop = tt === GRASS ? C.grassL : C.sandL;
    quad(iso.toScreen(i, j + 1, z), iso.toScreen(i + 1, j + 1, z), iso.toScreen(i + 1, j + 1, zl), iso.toScreen(i, j + 1, zl), zl < 0 ? C.dirtL : sideTop);
    if (zl < 0) quad(iso.toScreen(i, j + 1, z), iso.toScreen(i + 1, j + 1, z), iso.toScreen(i + 1, j + 1, z - 3), iso.toScreen(i, j + 1, z - 3), sideTop);
  }
  tilePath(i, j, z);
  ctx.fillStyle = top;
  ctx.fill();
  ctx.strokeStyle = top;
  ctx.lineWidth = 1;
  ctx.stroke();
}

function ellipse(x, y, r, fill, stroke, lw) {
  const c = iso.toScreen(x, y);
  ctx.beginPath();
  ctx.ellipse(c.x, c.y, r * iso.tileW * 0.7071, r * iso.tileH * 0.7071, 0, 0, Math.PI * 2);
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lw || 2;
    ctx.stroke();
  }
}

// A gust is wind you can see on the water: a patch of ruffled sea, stretched along the wind and
// soft at its edges, made of short dark ripples lying across the wind with a few bright glints,
// all drifting downwind. A strong gust is denser and darker. No outline, no disc.
function drawGusts() {
  const wd = S.wind.dir;
  const along = { x: Math.cos(wd), y: Math.sin(wd) };
  const across = { x: -along.y, y: along.x };
  const sa = iso.gridDirToScreen(across.x, across.y);
  ctx.lineCap = 'round';
  for (const g of S.gusts) {
    const k = gustNow(g);
    if (k <= 0) continue;
    const strong = g.g >= 1.4;
    const n = Math.round(g.r * g.r * (strong ? 9 : 6));
    for (let m = 0; m < n; m++) {
      // A fixed scatter per gust (golden-angle spiral), squeezed across the wind.
      const ang = g.seed + m * 2.39996;
      const rr = Math.sqrt((m + 0.5) / n);
      const u = Math.cos(ang) * rr * g.r * 1.35; // along the wind: longer
      const v = Math.sin(ang) * rr * g.r * 0.8; // across: narrower
      const edge = 1 - rr * rr;
      const x = g.x + along.x * u + across.x * v;
      const y = g.y + along.y * u + across.y * v;
      const p = iso.toScreen(x, y);
      // Each ripple flickers in and out on its own beat, like wind catching the surface.
      const beat = 0.5 + 0.5 * Math.sin(S.t * 5 + m * 1.7 + g.seed);
      const a = k * edge * (0.25 + 0.55 * beat) * (strong ? 1 : 0.7);
      if (a < 0.03) continue;
      const len = 3 + beat * 3;
      const bright = m % 7 === 0;
      ctx.strokeStyle = bright ? `rgba(255,255,255,${a * 0.8})` : `rgba(20,72,118,${a})`;
      ctx.lineWidth = bright ? 1.2 : 1.6;
      ctx.beginPath();
      ctx.moveTo(p.x - sa.x * len, p.y - sa.y * len);
      ctx.lineTo(p.x + sa.x * len, p.y + sa.y * len);
      ctx.stroke();
    }
  }
}

// Wind streaks: thin lines drifting with the wind across the whole view.
function drawStreaks(range) {
  const n = 22;
  while (S.streaks.length < n) S.streaks.push({ u: Math.random(), v: Math.random(), age: Math.random() * 3, life: 2.4 + Math.random() * 2, ph: Math.random() * 6 });
  const sd = iso.gridDirToScreen(Math.cos(S.wind.dir), Math.sin(S.wind.dir));
  const tl = cam.toWorld(0, 0);
  const vw = cam.w / cam.zoom;
  const vh = cam.h / cam.zoom;
  ctx.lineCap = 'round';
  for (const s of S.streaks) {
    s.age += 1 / 60;
    if (s.age > s.life) {
      s.u = Math.random();
      s.v = Math.random();
      s.age = 0;
    }
    // A long, faint line that grows from its tail, with a gentle wave along it: wind, not rain.
    const k = Math.sin((s.age / s.life) * Math.PI);
    const travel = s.age * 60;
    const x = tl.x + s.u * vw + sd.x * travel;
    const y = tl.y + s.v * vh + sd.y * travel;
    const len = 70 * Math.min(1, s.age * 1.5);
    const nx = -sd.y;
    const ny = sd.x;
    ctx.strokeStyle = `rgba(255,255,255,${0.28 * k})`;
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    for (let q = 0; q <= 8; q++) {
      const f = q / 8;
      const wv = Math.sin(f * 5 + s.ph + s.age * 3) * 2.5;
      const px = x - sd.x * len * f + nx * wv;
      const py = y - sd.y * len * f + ny * wv;
      if (q) ctx.lineTo(px, py);
      else ctx.moveTo(px, py);
    }
    ctx.stroke();
  }
}

function drawWakes() {
  for (const w of S.wakes) {
    const k = 1 - w.age / 1.6;
    const spread = 0.1 + w.age * 0.35;
    const px = -Math.sin(w.h);
    const py = Math.cos(w.h);
    const a = iso.toScreen(w.x + px * spread, w.y + py * spread);
    const b = iso.toScreen(w.x - px * spread, w.y - py * spread);
    ctx.fillStyle = `rgba(255,255,255,${0.55 * k * Math.min(1, w.v)})`;
    ctx.beginPath();
    ctx.ellipse(a.x, a.y, 2.2, 1.2, 0, 0, Math.PI * 2);
    ctx.ellipse(b.x, b.y, 2.2, 1.2, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function sprite(name, x, y, scale = 1, z = 0, alpha = 1) {
  const a = ATLAS[name];
  if (!a || !atlas.complete) return;
  const [sx, sy, sw, sh, ay] = a;
  const p = iso.toScreen(x, y, z);
  const w = sw * scale;
  const h = sh * scale;
  if (alpha !== 1) ctx.globalAlpha = alpha;
  ctx.drawImage(atlas, sx, sy, sw, sh, p.x - w / 2, p.y - h * ay, w, h);
  if (alpha !== 1) ctx.globalAlpha = 1;
}

// A little house: a box with a gabled roof, in the pack's flat style.
function drawHouse(x, y, z, roof) {
  const s = 0.3;
  const hgt = 16;
  const P = (dx, dy, dz) => iso.toScreen(x + dx, y + dy, z + dz);
  quad(P(s, -s, 0), P(s, s, 0), P(s, s, hgt), P(s, -s, hgt), '#e9e2cf');
  quad(P(-s, s, 0), P(s, s, 0), P(s, s, hgt), P(-s, s, hgt), '#d6cdb4');
  ctx.fillStyle = '#5a4630';
  const door = P(s, 0.05, 0);
  ctx.fillRect(door.x - 2, door.y - 9, 4, 8);
  // Roof: ridge along x.
  const r1 = P(-s - 0.05, 0, hgt + 10);
  const r2 = P(s + 0.05, 0, hgt + 10);
  quad(P(-s - 0.05, s + 0.06, hgt - 1), P(s + 0.05, s + 0.06, hgt - 1), r2, r1, roof);
  ctx.fillStyle = shadeHex(roof, 0.82);
  ctx.beginPath();
  const e1 = P(s + 0.05, -s - 0.06, hgt - 1);
  const e2 = P(s + 0.05, s + 0.06, hgt - 1);
  ctx.moveTo(e1.x, e1.y);
  ctx.lineTo(e2.x, e2.y);
  ctx.lineTo(r2.x, r2.y);
  ctx.closePath();
  ctx.fill();
}

function shadeHex(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.max(0, Math.min(255, Math.round(v * k)));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

function drawJetty(p) {
  // Planks from the quay tile out over the shallow tile to the berth.
  const [di, dj] = p.dir;
  const px = -dj;
  const py = di;
  const w = 0.17;
  const z = 3;
  const a0 = { x: p.qx + di * 0.2, y: p.qy + dj * 0.2 };
  const a1 = { x: p.bx - di * 0.35, y: p.by - dj * 0.35 };
  const P = (o, s, zz) => iso.toScreen(o.x + px * s, o.y + py * s, zz);
  // Posts.
  ctx.fillStyle = '#6b4a2b';
  for (const t of [0.35, 0.7, 1]) {
    for (const s of [-w, w]) {
      const q = iso.toScreen(a0.x + (a1.x - a0.x) * t + px * s, a0.y + (a1.y - a0.y) * t + py * s, -4);
      ctx.fillRect(q.x - 1.5, q.y - 7, 3, 8);
    }
  }
  quad(P(a0, -w, z), P(a0, w, z), P(a1, w, z), P(a1, -w, z), '#c8935a');
  quad(P(a0, w, z), P(a1, w, z), P(a1, w, z - 3), P(a0, w, z - 3), '#9b6b3c');
}

function drawFlag(x, y, z, colour, size, t, big, shape = 'square') {
  const base = iso.toScreen(x, y, z);
  // A destination's flag stands tall, rising to its height as the passenger boards.
  const hgt = size * (big ? 2.1 : 1);
  ctx.strokeStyle = '#5b4a3a';
  ctx.lineWidth = big ? 2.5 : 2;
  ctx.beginPath();
  ctx.moveTo(base.x, base.y);
  ctx.lineTo(base.x, base.y - hgt);
  ctx.stroke();
  const sd = iso.gridDirToScreen(Math.cos(S.wind.dir), Math.sin(S.wind.dir));
  const fx = Math.sign(sd.x) || 1;
  const w = (big ? 26 : 13) * (0.75 + 0.25 * Math.abs(sd.x));
  const h = big ? 17 : 9;
  flagCloth(ctx, base.x, base.y - hgt, w, h, shape, colour, fx, Math.sin(t * 8 + x) * (big ? 2.5 : 1.5));
}

function drawLighthouse(p, t) {
  const x = p.island.x;
  const y = p.island.y;
  const z = LIFT[tileAt(S.world, x, y)] || 5;
  const base = iso.toScreen(x, y, z);
  const hgt = 74;
  const w0 = 13;
  const w1 = 8;
  // Tower: white with red bands, shaded right side.
  for (let k = 0; k < 5; k++) {
    const f0 = k / 5;
    const f1 = (k + 1) / 5;
    const y0 = base.y - hgt * f0;
    const y1 = base.y - hgt * f1;
    const wa = w0 + (w1 - w0) * f0;
    const wb = w0 + (w1 - w0) * f1;
    ctx.fillStyle = k % 2 ? '#e8604c' : '#fbf6ea';
    ctx.beginPath();
    ctx.moveTo(base.x - wa, y0);
    ctx.lineTo(base.x + wa, y0);
    ctx.lineTo(base.x + wb, y1);
    ctx.lineTo(base.x - wb, y1);
    ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.beginPath();
    ctx.moveTo(base.x + wa * 0.3, y0);
    ctx.lineTo(base.x + wa, y0);
    ctx.lineTo(base.x + wb, y1);
    ctx.lineTo(base.x + wb * 0.3, y1);
    ctx.fill();
  }
  // Lamp room and a slow beam.
  const ly = base.y - hgt;
  ctx.fillStyle = '#2f3a44';
  ctx.fillRect(base.x - 10, ly - 3, 20, 4);
  const glow = 0.6 + 0.4 * Math.sin(t * 2.2);
  ctx.fillStyle = `rgba(255,230,140,${0.85 * glow + 0.15})`;
  ctx.fillRect(base.x - 6, ly - 13, 12, 10);
  ctx.fillStyle = '#2f3a44';
  ctx.beginPath();
  ctx.moveTo(base.x - 9, ly - 13);
  ctx.lineTo(base.x, ly - 21);
  ctx.lineTo(base.x + 9, ly - 13);
  ctx.fill();
  const beam = t * 0.9;
  const bx = Math.cos(beam);
  ctx.fillStyle = `rgba(255,240,180,${0.18 * Math.abs(bx)})`;
  ctx.beginPath();
  ctx.moveTo(base.x, ly - 8);
  ctx.lineTo(base.x + bx * 120, ly - 20);
  ctx.lineTo(base.x + bx * 120, ly + 6);
  ctx.closePath();
  ctx.fill();
}

const GALLEON_SCALE = 0.42;
// Kenney's frames: 0 points up-left on screen, then clockwise. iso.facing() counts clockwise from
// screen-right, so frame = facing + 3.
const galleonFrame = (h) => (iso.facing(Math.cos(h), Math.sin(h)) + 3) % 8;

function drawGalleon(x, y, h, alpha = 1, bob = 0) {
  sprite('galleon' + galleonFrame(h), x, y, GALLEON_SCALE, bob, alpha);
}

// Things standing on land sort with their tile's centre, so they draw after their own block.
const onTile = (x, y, layer) => iso.depth(Math.floor(x) + 0.5, Math.floor(y) + 0.5, layer);

function collectProps(items, range) {
  const w = S.world;
  const inView = (x, y, m = 3) => x >= range.x0 - m && x <= range.x1 + m && y >= range.y0 - m && y <= range.y1 + m;
  for (const p of w.props) {
    if (!inView(p.x, p.y)) continue;
    const z = LIFT[tileAt(w, p.x, p.y)] || 0;
    items.push({ depth: onTile(p.x, p.y, 1 + (p.x % 1) * 0.1), draw: () => sprite(p.kind, p.x, p.y, 0.62, z) });
  }
  for (const r of w.rocks) {
    if (!inView(r.x, r.y)) continue;
    items.push({
      depth: iso.depth(r.x, r.y, 1),
      draw: () => {
        // The footprint, ringed with surf: what the boat hits.
        const k = 0.5 + 0.5 * Math.sin(S.t * 2 + r.x);
        ellipse(r.x, r.y, 0.62 + k * 0.06, 'rgba(255,255,255,0.18)', `rgba(255,255,255,${0.55 + 0.3 * k})`, 2);
        sprite(r.kind, r.x, r.y, 0.62, 0);
      },
    });
  }
  // Ports: jetty, houses and flag; the ring on the water.
  const marked = markedPorts();
  for (const p of [...w.ports, w.lighthouse]) {
    if (!inView(p.qx, p.qy, 6)) continue;
    const isDest = marked.has(p.id);
    items.push({ depth: iso.depth(p.qx, p.qy, 0.5), draw: () => drawJetty(p) });
    if (p.id !== 'lighthouse') {
      const [di, dj] = p.dir;
      const hx = p.qx - di * 1.1 - dj * 0.8;
      const hy = p.qy - dj * 1.1 + di * 0.8;
      const hx2 = p.qx - di * 1.0 + dj * 0.9;
      const hy2 = p.qy - dj * 1.0 - di * 0.9;
      for (const [x, y, roof] of [
        [hx, hy, p.id === 0 ? '#8a6d4b' : '#e8604c'],
        [hx2, hy2, p.id === 0 ? '#6f7d86' : '#d98c3f'],
      ]) {
        if (tileAt(w, x, y) < SAND) continue;
        const z = LIFT[tileAt(w, x, y)];
        items.push({ depth: onTile(x, y, 1), draw: () => drawHouse(x, y, z, roof) });
      }
    } else items.push({ depth: onTile(p.island.x, p.island.y, 1), draw: () => drawLighthouse(p, S.t) });
    const fz = LIFT[tileAt(w, p.qx, p.qy)] || 4;
    items.push({ depth: iso.depth(p.qx, p.qy, 2), draw: () => drawFlag(p.qx, p.qy, fz, p.colour, 30, S.t, isDest, shapeOf(p.id)) });
  }
  // The galleon waits at the shipyard until it's bought, with its price.
  const yard = w.ports[0];
  if (!S.owned.galleon) {
    const [di, dj] = yard.dir;
    const gx = yard.bx + dj * 2.2 + di * 0.6;
    const gy = yard.by - di * 2.2 + dj * 0.6;
    const gh = Math.atan2(di, -dj);
    S.yardGalleon = { x: gx, y: gy };
    if (inView(gx, gy, 5))
      items.push({
        depth: iso.depth(gx, gy, 1),
        draw: () => {
          drawGalleon(gx, gy, gh, 1, Math.sin(S.t * 1.3) * 1.2);
          if (S.mode !== 'start') priceTag(gx, gy, 95, TUNE.prices.galleon, S.coins >= TUNE.prices.galleon);
        },
      });
  }
  // Moored decor: a houseboat or a rowboat at some ports.
  w.ports.forEach((p, k) => {
    const [di, dj] = p.dir;
    const x = p.bx - dj * 1.3 + di * 0.2;
    const y = p.by + di * 1.3 + dj * 0.2;
    if (tileAt(w, x, y) >= SAND || !inView(x, y)) return;
    const name = ['boat28_0', 'boat25_0', 'boat26_2', 'boat23_0'][k];
    items.push({ depth: iso.depth(x, y, 1), draw: () => sprite(name, x, y, 0.42, Math.sin(S.t * 1.7 + k) * 0.8) });
  });
  // Passengers knocked overboard, treading water and waving.
  for (const cr of S.crates) {
    items.push({
      depth: iso.depth(cr.x, cr.y, 1),
      draw: () => {
        const p = iso.toScreen(cr.x, cr.y, 0);
        drawPerson(ctx, p.x, p.y, { coat: cr.c.coat, skin: cr.c.id, t: cr.t, swim: true });
      },
    });
  }
  for (const t of S.traffic) {
    if (!inView(t.x, t.y, 3)) continue;
    items.push({
      depth: iso.depth(t.x, t.y, 1),
      draw: () => sprite(`${t.sprite}_${(iso.facing(Math.cos(t.h), Math.sin(t.h)) + 3) % 8}`, t.x, t.y, 0.42, Math.sin(S.t * 1.6 + t.id) * 0.8),
    });
  }
  collectPeople(items, inView);
}

// The people of the ports: passengers waiting on the jetties, those hopping aboard or ashore, and
// those you've brought, who stay on the quay.
const JETTY_Z = 3;
function collectPeople(items, inView) {
  const w = S.world;
  const perPort = {};
  for (const wt of S.waiting) {
    const p = placeById(wt.at);
    const k = (perPort[wt.at] = (perPort[wt.at] || 0) + 1) - 1;
    const spot = jettySpot(p, k);
    if (!inView(spot.x, spot.y, 3)) continue;
    const toward = iso.gridDirToScreen(p.dir[0], p.dir[1]);
    items.push({
      depth: iso.depth(spot.x, spot.y, 1.2),
      draw: () => {
        const q = iso.toScreen(spot.x, spot.y, JETTY_Z);
        // A soft pulse under their feet: someone's waiting here.
        const k2 = (wt.t * 0.8) % 1;
        ctx.strokeStyle = `rgba(255,255,255,${0.6 * (1 - k2)})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.ellipse(q.x, q.y, 5 + k2 * 9, (5 + k2 * 9) * 0.5, 0, 0, Math.PI * 2);
        ctx.stroke();
        drawPerson(ctx, q.x, q.y, { coat: wt.c.coat, skin: wt.c.id, t: wt.t + wt.c.id, wave: 0.85, flag: { colour: wt.c.colour, shape: wt.c.shape }, bags: wt.c.kind === 'charter' ? 0 : wt.c.bags, face: toward.x >= 0 ? 1 : -1 });
      },
    });
  }
  // Hopping between the jetty and the boat: an arc.
  for (const h of S.hops) {
    const p = placeById(h.port);
    const spot = jettySpot(p);
    const b = S.boat;
    const f = Math.max(0, Math.min(1, h.t / TUNE.hopTime));
    const [ax, ay, bx, by] = h.on ? [spot.x, spot.y, b.x, b.y] : [b.x, b.y, spot.x, spot.y];
    const x = ax + (bx - ax) * f;
    const y = ay + (by - ay) * f;
    items.push({
      depth: iso.depth(x, y, 1.6),
      draw: () => {
        const q = iso.toScreen(x, y, JETTY_Z + Math.sin(f * Math.PI) * 14);
        drawPerson(ctx, q.x, q.y, { coat: h.c.coat, skin: h.c.id, t: S.t, wave: h.on ? 0 : 1, face: bx > ax ? 1 : -1 });
      },
    });
  }
  // On the quays: everyone you've brought, standing about, turning to watch the boat come in.
  for (const p of [...w.ports, w.lighthouse]) {
    const n = S.residents[p.id] || 0;
    if (!n || !inView(p.qx, p.qy, 4)) continue;
    const [di, dj] = p.dir;
    for (let k = 0; k < n; k++) {
      const a = (k - (n - 1) / 2) * 0.55;
      const x = p.qx - di * (0.25 + (k % 2) * 0.3) - dj * a;
      const y = p.qy - dj * (0.25 + (k % 2) * 0.3) + di * a;
      if (tileAt(w, x, y) < SAND) continue;
      const z = LIFT[tileAt(w, x, y)];
      const seed = p.id === 'lighthouse' ? 7 : p.id * 5 + k;
      items.push({
        depth: onTile(x, y, 1.1 + k * 0.01),
        draw: () => {
          const q = iso.toScreen(x, y, z);
          const bq = iso.toScreen(S.boat.x, S.boat.y);
          const near = S.mode === 'docked' && S.portAt === p.id;
          drawPerson(ctx, q.x, q.y, { coat: COATS[(seed * 3) % COATS.length], skin: seed, t: S.t + seed * 1.7, wave: near ? 0.6 : 0.05, face: bq.x >= q.x ? 1 : -1, scale: 0.92 });
        },
      });
    }
  }
}

function priceTag(x, y, lift, price, can) {
  const p = iso.toScreen(x, y, lift);
  const text = String(price);
  ctx.font = '700 13px system-ui, sans-serif';
  const w = ctx.measureText(text).width + 26;
  ctx.fillStyle = can ? '#ffd23f' : 'rgba(12,38,60,0.75)';
  ctx.beginPath();
  ctx.roundRect(p.x - w / 2, p.y - 11, w, 22, 11);
  ctx.fill();
  ctx.fillStyle = can ? '#0f2a3f' : '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, p.x + 7, p.y + 1);
  ctx.beginPath();
  ctx.arc(p.x - w / 2 + 11, p.y, 5, 0, Math.PI * 2);
  ctx.fillStyle = '#ffd23f';
  ctx.fill();
  ctx.strokeStyle = '#c99a12';
  ctx.lineWidth = 1;
  ctx.stroke();
}

function drawPlayer() {
  const b = S.boat;
  const r = currentRig();
  if (r.name === 'galleon') {
    let h = b.h;
    if (b.knock > 0) h += b.knock * 3;
    drawGalleon(b.x, b.y, h, 1, Math.sin(S.t * 1.5) * 1.2);
    // Passengers on deck, along the ship's middle.
    S.hold.forEach((c, k) => {
      const f = (k - (S.hold.length - 1) / 2) * 0.45;
      const q = iso.toScreen(b.x + Math.cos(b.h) * f, b.y + Math.sin(b.h) * f, 20);
      drawPerson(ctx, q.x, q.y, { coat: c.coat, skin: c.id, t: S.t + c.id, wave: 0.2, scale: 0.9 });
    });
    return;
  }
  const sd = iso.gridDirToScreen(Math.cos(S.wind.dir), Math.sin(S.wind.dir));
  let heel = b.heel * 0.42 * (Math.sign(b.boom) || 1);
  if (b.knock > 0) {
    const k = b.knock / TUNE.knockTime;
    heel = (Math.sign(b.boom) || 1) * Math.sin(k * Math.PI) * 1.35;
  }
  drawDinghy(
    ctx,
    iso,
    b.x,
    b.y,
    {
      heading: b.h,
      heel,
      boom: b.boom,
      fill: b.fill,
      luff: b.luff,
      t: S.t,
      keel: r.keel,
      spinnaker: r.spinnaker,
      spinFill: b.spin,
      cargo: S.hold,
      vane: sd,
    },
    ZS
  );
  // Spray off the bow when heeling hard or surging.
  if (b.heel > 0.6 || b.inGust > 1.3) {
    const p = iso.toScreen(b.x + Math.cos(b.h) * 0.45, b.y + Math.sin(b.h) * 0.45, 2);
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    for (let k = 0; k < 4; k++) {
      const a = S.t * 13 + k * 1.7;
      ctx.beginPath();
      ctx.arc(p.x + Math.cos(a) * 5, p.y - Math.abs(Math.sin(a)) * 6, 1.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

// While steering: the speed ring on the water round the boat, green on the fast headings, grey on
// slow, red in the no-go wedge, with the wanted heading marked.
function drawPolarRing() {
  const b = S.boat;
  const r = currentRig();
  const R = r.name === 'galleon' ? 2.1 : 1.25;
  const segs = 72;
  const maxP = Math.max(...r.polar.map((q) => q[1]));
  ctx.lineWidth = 5;
  ctx.lineCap = 'butt';
  for (let k = 0; k < segs; k++) {
    const a0 = (k / segs) * Math.PI * 2;
    const a1 = ((k + 1) / segs) * Math.PI * 2;
    const mid = (a0 + a1) / 2;
    const off = offWind(mid, S.wind.dir);
    let col;
    if (off < r.wedge) col = 'rgba(232,96,76,0.75)';
    else {
      const f = polarAt(r, off) / maxP;
      const g = Math.round(110 + 120 * f);
      col = `rgba(${Math.round(240 - 150 * f)},${g},${Math.round(140 - 60 * f)},${0.35 + 0.5 * f})`;
    }
    const p0 = iso.toScreen(b.x + Math.cos(a0) * R, b.y + Math.sin(a0) * R);
    const p1 = iso.toScreen(b.x + Math.cos(a1) * R, b.y + Math.sin(a1) * R);
    ctx.strokeStyle = col;
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    ctx.lineTo(p1.x, p1.y);
    ctx.stroke();
  }
  // The heading the boat is turning to.
  const t = iso.toScreen(b.x + Math.cos(b.target) * (R + 0.35), b.y + Math.sin(b.target) * (R + 0.35));
  const t0 = iso.toScreen(b.x + Math.cos(b.target) * (R - 0.15), b.y + Math.sin(b.target) * (R - 0.15));
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(t0.x, t0.y);
  ctx.lineTo(t.x, t.y);
  ctx.stroke();
}

// The no-go wedge drawn faintly when the boat sails on its edge (a drag asked for more).
function drawWedge(alpha) {
  const b = S.boat;
  const r = currentRig();
  const from = S.wind.dir + Math.PI;
  const R = r.name === 'galleon' ? 3 : 2;
  const c = iso.toScreen(b.x, b.y);
  ctx.fillStyle = `rgba(232,96,76,${0.18 * alpha})`;
  ctx.beginPath();
  ctx.moveTo(c.x, c.y);
  for (let k = 0; k <= 16; k++) {
    const a = from - r.wedge + (2 * r.wedge * k) / 16;
    const p = iso.toScreen(b.x + Math.cos(a) * R, b.y + Math.sin(a) * R);
    ctx.lineTo(p.x, p.y);
  }
  ctx.closePath();
  ctx.fill();
}

function drawRings() {
  const dests = markedPorts();
  for (const p of [...S.world.ports, S.world.lighthouse]) {
    if (p.id === 'lighthouse' && !dests.has('lighthouse')) continue;
    const dest = dests.has(p.id);
    const pulse = dest ? 0.5 + 0.5 * Math.sin(S.t * 4) : 0;
    ctx.setLineDash(dest ? [] : [6, 6]);
    ellipse(p.rx, p.ry, ringR(), dest ? hexA(p.colour, 0.16 + 0.1 * pulse) : null, hexA(p.colour, dest ? 0.9 : 0.55), dest ? 3 : 2);
    ctx.setLineDash([]);
  }
}

// The places marked on the sea right now: where your passengers are going (their flags raised,
// rings filled, arrows at the screen's edge), and the shipyard when you can afford what's next.
function markedPorts() {
  const m = new Set(S.hold.map((c) => c.to));
  if (canBuyNext() && !(S.mode === 'docked' && S.portAt === 0)) m.add(0);
  return m;
}

// The galleon's bow reaches the shallows by the jetty before its middle is in the dinghy's ring.
const ringR = () => TUNE.ringRadius + (S.owned.galleon ? 1.0 : 0);

function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
}

// Screen-space overlays: the wind vane, the minimap, chevrons to destinations, the drag ring.
function drawOverlay() {
  const w = cam.w;
  const h = cam.h;
  const top = safeTop() + 64;
  // Wind vane: top right, under the mute button.
  const vx = w - 34 - safeRight();
  const vy = top + 26;
  ctx.fillStyle = 'rgba(20,22,31,0.5)';
  ctx.beginPath();
  ctx.arc(vx, vy, 24, 0, Math.PI * 2);
  ctx.fill();
  const arrow = (dir, colour, alpha) => {
    const d = iso.gridDirToScreen(Math.cos(dir), Math.sin(dir));
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(vx, vy);
    ctx.rotate(Math.atan2(d.y, d.x));
    ctx.fillStyle = colour;
    ctx.beginPath();
    ctx.moveTo(15, 0);
    ctx.lineTo(3, -8);
    ctx.lineTo(5, -2.5);
    ctx.lineTo(-15, -2.5);
    ctx.lineTo(-15, 2.5);
    ctx.lineTo(5, 2.5);
    ctx.lineTo(3, 8);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  };
  if (S.wind.next !== null && S.mode !== 'start') {
    const k = 0.45 + 0.35 * Math.sin(S.t * 5);
    arrow(S.wind.next, '#ffd23f', k);
  }
  arrow(S.wind.dir, '#ffffff', 1);
  // Minimap: under the vane.
  const ms = Math.min(96, w * 0.22);
  const mx = w - ms - 10 - safeRight();
  const my = vy + 34;
  drawMinimap(mx, my, ms);
  // Chevrons to destinations off screen.
  if (S.mode === 'sail' || S.mode === 'docked') {
    const seen = new Set();
    // The shipyard, in gold, when you can afford what it sells next.
    const marks = S.hold.slice();
    if (canBuyNext() && !(S.mode === 'docked' && S.portAt === 0)) marks.push({ to: 0, colour: '#ffd23f' });
    for (const c of marks) {
      if (seen.has(c.to)) continue;
      seen.add(c.to);
      const p = placeById(c.to);
      const sp = iso.toScreen(p.rx, p.ry);
      const v = cam.toView(sp.x, sp.y);
      const m = 34;
      if (v.x > m && v.x < w - m && v.y > top + 40 && v.y < h - m) continue;
      const cx = w / 2;
      const cy = h / 2;
      const dx = v.x - cx;
      const dy = v.y - cy;
      const s = Math.min((w / 2 - m) / Math.abs(dx || 1e-6), (h / 2 - m - 30) / Math.abs(dy || 1e-6));
      const ex = cx + dx * s;
      const ey = cy + dy * s + 15;
      const a = Math.atan2(dy, dx);
      ctx.save();
      ctx.translate(ex, ey);
      ctx.rotate(a);
      ctx.fillStyle = hexA(c.colour, 0.95);
      ctx.strokeStyle = 'rgba(15,42,63,0.6)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(14, 0);
      ctx.lineTo(-8, -12);
      ctx.lineTo(-3, 0);
      ctx.lineTo(-8, 12);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }
  // A ghost finger, until you first steer: it drags from the middle of the screen towards where
  // your passenger is going, and the boat would follow. A gesture, not a tip.
  if (S.mode === 'docked' && S.hold.length && !S.hops.length && !everSteered()) {
    const c = S.hold[0];
    const p = placeById(c.to);
    const sp = iso.toScreen(p.rx, p.ry);
    const v = cam.toView(sp.x, sp.y);
    const bp = iso.toScreen(S.boat.x, S.boat.y);
    const bv = cam.toView(bp.x, bp.y);
    let dx = v.x - bv.x;
    let dy = v.y - bv.y;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    const f = (S.t % 2.2) / 1.6;
    if (f <= 1) {
      const e = 1 - (1 - f) ** 2;
      const x0 = w / 2 - dx * 50;
      const y0 = h * 0.62 - dy * 50;
      const x = x0 + dx * 100 * e;
      const y = y0 + dy * 100 * e;
      const a = Math.sin(f * Math.PI);
      ctx.strokeStyle = `rgba(255,255,255,${0.5 * a})`;
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x, y);
      ctx.stroke();
      ctx.fillStyle = `rgba(255,255,255,${0.75 * a})`;
      ctx.beginPath();
      ctx.arc(x, y, 13, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = `rgba(15,42,63,${0.35 * a})`;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }
  // Where the finger went down, and the line to it now.
  if (S.steer && S.steer.active) {
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(S.steer.x0, S.steer.y0, 14, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(S.steer.x0, S.steer.y0);
    ctx.lineTo(S.steer.x, S.steer.y);
    ctx.stroke();
  }
}

let miniCache = null;
function drawMinimap(x, y, size) {
  const w = S.world;
  if (!miniCache || miniCache.world !== w || miniCache.size !== size) {
    // Drawn once per sea, as a diamond like the view.
    const c = document.createElement('canvas');
    c.width = Math.round(size * 2);
    c.height = Math.round(size * 2);
    const g = c.getContext('2d');
    g.scale(2, 2);
    const sx = size / (W + H);
    const ox = (H * size) / (W + H);
    for (let j = 0; j < H; j++)
      for (let i = 0; i < W; i++) {
        const t = w.tiles[j * W + i];
        g.fillStyle = t === DEEP ? '#2f7fb4' : t === SHALLOW ? '#6fb8d6' : t === SAND ? '#e8e0a8' : '#9cc65a';
        const px = ox + (i - j) * sx;
        const py = (i + j) * sx * 0.5;
        g.beginPath();
        g.moveTo(px, py);
        g.lineTo(px + sx, py + sx * 0.5);
        g.lineTo(px, py + sx);
        g.lineTo(px - sx, py + sx * 0.5);
        g.fill();
      }
    miniCache = { world: w, size, canvas: c, sx, ox };
  }
  const { sx, ox } = miniCache;
  ctx.save();
  ctx.fillStyle = 'rgba(20,22,31,0.5)';
  ctx.beginPath();
  ctx.roundRect(x - 6, y - 6, size + 12, size / 2 + 14, 12);
  ctx.fill();
  ctx.drawImage(miniCache.canvas, x, y, size, size / 2 + 2);
  const at = (gx, gy) => ({ x: x + ox + (gx - gy) * sx, y: y + (gx + gy) * sx * 0.5 });
  const dests = markedPorts();
  for (const p of [...w.ports, w.lighthouse]) {
    const q = at(p.rx, p.ry);
    ctx.fillStyle = p.colour;
    ctx.beginPath();
    ctx.arc(q.x, q.y, dests.has(p.id) ? 3.5 + Math.sin(S.t * 5) : 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(15,42,63,0.7)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  if (S.boat) {
    // Someone waiting: a little white dot by their port.
    for (const wt of S.waiting) {
      const p = placeById(wt.at);
      const r = at(p.qx, p.qy);
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(r.x + 3, r.y - 3, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
    const q = at(S.boat.x, S.boat.y);
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(q.x, q.y, 2.6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

let safe = { top: 0, right: 0 };
function readSafe() {
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;top:env(safe-area-inset-top);right:env(safe-area-inset-right);';
  document.body.appendChild(probe);
  const cs = getComputedStyle(probe);
  safe = { top: parseFloat(cs.top) || 0, right: parseFloat(cs.right) || 0 };
  probe.remove();
}
const safeTop = () => safe.top;
const safeRight = () => safe.right;

// The landing tile's picture (scripts/high-seas/make-tile.mjs): an islet with palms, the galleon,
// and the dinghy running under its spinnaker, on a pool of sea, with the page's background clear.
function drawVignette() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const z = (cam.w / 330) * 0.66;
  const centre = iso.toScreen(4.6, 4.0);
  ctx.setTransform(dpr * z, 0, 0, dpr * z, dpr * (cam.w / 2 - centre.x * z), dpr * (cam.h / 2 - centre.y * z - 14));
  // A pool of sea that fades out at its rim.
  const c = iso.toScreen(4.7, 4.4);
  ctx.save();
  ctx.translate(c.x, c.y);
  ctx.scale(1, 0.5);
  const grad = ctx.createRadialGradient(0, 0, 60, 0, 0, 215);
  grad.addColorStop(0, C.deep);
  grad.addColorStop(0.75, 'rgba(74,159,208,0.9)');
  grad.addColorStop(1, 'rgba(74,159,208,0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(0, 0, 215, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  const land = { '3,2': SAND, '4,2': SAND, '2,3': SAND, '3,3': GRASS, '4,3': SAND, '3,4': SAND, '2,4': SAND };
  const at = (x, y) => land[`${Math.floor(x)},${Math.floor(y)}`] ?? DEEP;
  for (let j = 1; j <= 5; j++)
    for (let i = 1; i <= 5; i++) {
      const t = at(i + 0.5, j + 0.5);
      if (t !== DEEP) continue;
      let nearLand = false;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) nearLand = nearLand || at(i + di + 0.5, j + dj + 0.5) >= SAND;
      if (!nearLand) continue;
      tilePath(i, j, 0);
      ctx.fillStyle = C.shallow;
      ctx.fill();
      ctx.strokeStyle = C.shallow;
      ctx.stroke();
    }
  const items = [];
  for (const [k, t] of Object.entries(land)) {
    const [i, j] = k.split(',').map(Number);
    items.push({ depth: iso.depth(i + 0.5, j + 0.5), draw: () => drawBlock(i, j, t, at) });
  }
  items.push({ depth: onTile(3.4, 3.3, 1), draw: () => sprite('tree168', 3.4, 3.3, 0.62, LIFT[GRASS]) });
  items.push({ depth: onTile(3.8, 2.4, 1), draw: () => sprite('tree167', 3.8, 2.4, 0.55, LIFT[SAND]) });
  items.push({ depth: onTile(2.5, 4.4, 1), draw: () => sprite('tree169', 2.5, 4.4, 0.5, LIFT[SAND]) });
  items.push({ depth: iso.depth(6.4, 2.6, 1), draw: () => drawGalleon(6.6, 3.0, Math.PI) });
  const b = { x: 5.0, y: 6.2 };
  items.push({
    depth: iso.depth(b.x, b.y, 1),
    draw: () => {
      for (let k = 1; k <= 7; k++) {
        const w = { x: b.x - k * 0.22, y: b.y + k * 0.05, h: -0.25, age: k * 0.18, v: 1 };
        const spread = 0.1 + w.age * 0.35;
        const a = iso.toScreen(w.x - Math.sin(w.h) * spread, w.y + Math.cos(w.h) * spread);
        const q = iso.toScreen(w.x + Math.sin(w.h) * spread, w.y - Math.cos(w.h) * spread);
        ctx.fillStyle = `rgba(255,255,255,${0.6 * (1 - k / 8)})`;
        ctx.beginPath();
        ctx.ellipse(a.x, a.y, 2.2, 1.2, 0, 0, Math.PI * 2);
        ctx.ellipse(q.x, q.y, 2.2, 1.2, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      drawDinghy(ctx, iso, b.x, b.y, { heading: -0.25, heel: 0.12, boom: 1.25, fill: 1, luff: 0, t: 0, keel: true, spinnaker: true, spinFill: 1, cargo: [{ colour: '#e8604c' }], vane: { x: 0.9, y: -0.3 } }, ZS);
    },
  });
  for (const it of sortByDepth(items)) it.draw();
}

function draw() {
  if (S.mode === 'tile') return drawVignette();
  if (!S.world) return;
  const b = S.boat;
  // Follow the boat, a little ahead of where it's going.
  const lead = S.mode === 'sail' ? Math.min(1.8, b.v * 1.2) : 0;
  const target = iso.toScreen(b.x + Math.cos(b.h) * lead, b.y + Math.sin(b.h) * lead);
  if (S.mode === 'start' || S.mode === 'over') {
    // Drift slowly over the sea behind the cards.
    target.x += Math.sin(S.t * 0.07) * 160;
    target.y += Math.cos(S.t * 0.05) * 80 + 60;
  }
  cam.follow(target, 0.08);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = C.deep;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const [a, bb, c, d, e, f] = cam.transform(dpr);
  const sk = shakeT > 0 ? (Math.random() - 0.5) * 8 * shakeT * dpr : 0;
  ctx.setTransform(a, bb, c, d, e + sk, f + sk * 0.5);
  const range = cam.tileRange(iso, 1, 120);
  const items = [];
  drawGusts();
  drawGround(range, items);
  drawWakes();
  drawRings();
  if (S.mode === 'sail' && b.clamped) drawWedge(1);
  if (S.mode === 'sail' && S.steer && S.steer.active) drawPolarRing();
  collectProps(items, range);
  items.push({ depth: iso.depth(b.x, b.y, 1.5), draw: drawPlayer });
  for (const it of sortByDepth(items)) it.draw();
  drawStreaks(range);
  // Floating words.
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const fx of S.fx) {
    const p = iso.toScreen(fx.x, fx.y, 40 + fx.age * 30);
    ctx.globalAlpha = Math.max(0, 1 - fx.age / 1.6);
    ctx.font = '800 18px system-ui, sans-serif';
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(15,42,63,0.6)';
    ctx.strokeText(fx.text, p.x, p.y);
    ctx.fillStyle = fx.colour;
    ctx.fillText(fx.text, p.x, p.y);
    ctx.globalAlpha = 1;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (S.mode !== 'start' && S.mode !== 'over') drawOverlay();
}

// --- Input -------------------------------------------------------------------------------------------
// Once you've steered, the ghost finger never shows again (in this browser).
const STEERED_KEY = 'high-seas-steered';
let steered = null;
function everSteered() {
  if (steered === null) {
    try {
      steered = localStorage.getItem(STEERED_KEY) === '1';
    } catch {
      steered = false;
    }
  }
  return steered;
}
function markSteered() {
  if (steered) return;
  steered = true;
  try {
    localStorage.setItem(STEERED_KEY, '1');
  } catch {}
}

function steerFrom(p) {
  if (S.mode === 'docked' && S.dock === null) castOff();
  if (S.mode !== 'sail') return;
  const b = S.boat;
  const len = Math.hypot(p.dx, p.dy);
  S.steer = { x0: p.x - p.dx, y0: p.y - p.dy, x: p.x, y: p.y, active: len > TUNE.dragDead };
  if (len <= TUNE.dragDead || b.knock > 0 || b.bump > 0) return;
  markSteered();
  const g = iso.screenDirToGrid(p.dx, p.dy);
  const want = Math.atan2(g.y, g.x);
  const r = currentRig();
  b.target = clampToWedge(r, want, S.wind.dir);
  b.clamped = Math.abs(wrap(b.target - want)) > 0.01;
}

attachGestures(canvas, cam, {
  tapSlop: TUNE.dragDead,
  onDown: (p) => {
    sound.unlock();
    if (S.mode === 'paused') return;
    if (S.mode === 'sail') S.steer = { x0: p.x, y0: p.y, x: p.x, y: p.y, active: false };
  },
  onMove: (p) => {
    if (S.mode === 'paused') return;
    if (S.mode === 'docked' && Math.hypot(p.dx, p.dy) > TUNE.dragDead && S.dock === null) castOff();
    if (S.mode === 'sail') steerFrom(p);
  },
  onUp: () => {
    S.steer = null;
    if (S.boat) S.boat.clamped = false;
  },
  onCancel: () => {
    // A second finger: hold the course.
    S.steer = null;
    if (S.boat) {
      S.boat.target = S.boat.h;
      S.boat.clamped = false;
    }
  },
  onTap: () => {
    if (S.mode === 'paused') resume();
  },
  onZoom: (z) => {
    userZoom = z / baseZoom;
  },
});

window.addEventListener('keydown', (e) => {
  if (e.target instanceof Element && e.target.closest('input, textarea')) return;
  const k = e.key;
  if (k === 'ArrowLeft' || k === 'a' || k === 'A') S.keys.left = true;
  else if (k === 'ArrowRight' || k === 'd' || k === 'D') S.keys.right = true;
  else if ((k === ' ' || k === 'Enter') && S.mode === 'docked' && document.activeElement === document.body) castOff();
  else if (k === 'ArrowUp' || k === 'w' || k === 'W') {
    if (S.mode === 'docked' && S.dock === null) castOff();
  } else if (k === '+' || k === '=') cam.zoomAt(1.15);
  else if (k === '-') cam.zoomAt(1 / 1.15);
  else if (S.mode === 'paused') resume();
  else return;
  if (S.mode === 'docked' && (k === 'ArrowLeft' || k === 'ArrowRight') && S.dock === null) castOff();
  if (k.startsWith('Arrow')) e.preventDefault();
});
window.addEventListener('keyup', (e) => {
  const k = e.key;
  if (k === 'ArrowLeft' || k === 'a' || k === 'A') S.keys.left = false;
  if (k === 'ArrowRight' || k === 'd' || k === 'D') S.keys.right = false;
});
window.addEventListener('blur', () => {
  S.keys.left = S.keys.right = false;
});

// Buttons.
$('[data-start]').addEventListener('click', () => {
  sound.unlock();
  const h = readHash();
  startVoyage(S.seed || (h && h.seed) || newSeed());
});
$('[data-continue]').addEventListener('click', () => {
  sound.unlock();
  const h = readHash();
  if (h && h.resume) startVoyage(h.seed, h.resume);
});
$('[data-new-sea]').addEventListener('click', () => {
  S.seed = newSeed();
  history.replaceState(null, '', '#' + S.seed);
  showStart();
});
$('[data-buy]').addEventListener('click', () => buy());
$('[data-resume]').addEventListener('click', () => resume());
$('[data-again]').addEventListener('click', () => {
  S.seed = newSeed();
  history.replaceState(null, '', '#' + S.seed);
  showStart();
});
$('[data-same]').addEventListener('click', () => {
  history.replaceState(null, '', '#' + S.seed);
  showStart();
});

function showStart() {
  const h = readHash();
  const seed = S.seed || (h && h.seed) || newSeed();
  if (!S.world || S.world.seed !== seed) loadSea(seed);
  S.seed = seed;
  resetVoyage();
  S.mode = 'start';
  $('[data-sea-name]').textContent = seed;
  const best = readBest()[seed];
  $('[data-sea-best]').textContent = best ? `· best ${fmt(best)}` : '';
  const resume = h && h.seed === seed && h.resume;
  $('[data-continue]').hidden = !resume;
  $('[data-start]').textContent = resume ? 'Start this sea over' : 'Set sail';
  $('[data-start]').classList.toggle('link', !!resume);
  $('[data-start]').classList.toggle('play', !resume);
  showScreen('start');
  hud.hidden = true;
}

// Pause when hidden; resume on a tap.
let pausedFrom = null;
function pause() {
  if (S.mode !== 'sail' && S.mode !== 'docked') return;
  pausedFrom = { mode: S.mode, screen: screens.buy.hidden ? null : 'buy' };
  S.mode = 'paused';
  S.steer = null;
  S.keys.left = S.keys.right = false;
  showScreen('pause');
  sound.suspend();
}
function resume() {
  if (S.mode !== 'paused' || !pausedFrom) return;
  S.mode = pausedFrom.mode;
  showScreen(pausedFrom.screen);
  pausedFrom = null;
  sound.unlock();
  renderBuy();
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) pause();
});

// --- Loop ------------------------------------------------------------------------------------------
let last = performance.now();
let hudT = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (!api.manual) step(dt);
  hudT += dt;
  if (hudT > 0.25) {
    hudT = 0;
    if (S.hold.some((c) => c.kind === 'mail')) renderHud();
  }
  draw();
  requestAnimationFrame(frame);
}

readSafe();
resize();
showStart();
renderHud();
requestAnimationFrame(frame);

// --- Test hook ---------------------------------------------------------------------------------------
const api = {
  manual: false,
  S,
  TUNE,
  iso,
  cam,
  played,
  rig: currentRig,
  polarAt,
  step: (dt) => step(dt),
  startVoyage,
  castOff,
  spawnWaiting,
  refillWaiting,
  wantsDock,
  nextBuy,
  renderHud,
  marked: () => [...markedPorts()],
  routePath,
  shapeOf,
  hintShown: () => S.mode === 'docked' && S.hold.length > 0 && !S.hops.length && !everSteered(),
  buy,
  gustAt,
  spawnGusts,
  saveHash,
  readHash,
  steer: (dx, dy) => steerFrom({ x: 200 + dx, y: 400 + dy, dx, dy }),
  release: () => {
    S.steer = null;
  },
  knockDown,
  makeContract,
  pose: () => {
    S.mode = 'tile';
    for (const el of Object.values(screens)) el.hidden = true;
    hud.hidden = true;
  },
};
window.__seas = api;

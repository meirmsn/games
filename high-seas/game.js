// High Seas: sail a dinghy by the wind across an isometric archipelago, run cargo between ports,
// buy the keel, the spinnaker and the galleon, and carry the Grand Charter to the lighthouse.
// One canvas, no library. The isometric maths is shared (../shared/iso.js); the sea comes from
// world.js and the boats from boat.js. The spec is specs/high-seas.md.
//
// window.__seas exposes the state and a step(dt) that advances the simulation without drawing,
// so tests can set up a moment and check what the rules do with it.
import { mountShell } from '../shared/game-shell.js';
import { createIso, createCamera, sortByDepth, attachGestures } from '../shared/iso.js';
import { makeWorld, newSeed, hashSeed, rng, wrap, tileAt, nearestNav, routeLength, DEEP, SHALLOW, SAND, GRASS, W, H } from './world.js';
import { BOATS, rig, polarAt, offWind, clampToWedge, turnTowards, heelTarget, drawDinghy } from './boat.js';
import { ATLAS } from './atlas.js';

// --- Tuning: every knob in one place -------------------------------------------------------------
const TUNE = {
  firstLimit: 40, // s: the first contract's route at the starting wind
  prices: { keel: 60, spinnaker: 120, galleon: 260 },
  goodsBase: 6, // coins for any delivery
  goodsPerTile: 0.8, // and per tile of route
  mailBonus: 1.6, // mail on time pays this many times the goods rate
  mailShare: 0.4, // share of offers that are mail
  mailSlack: 1.45, // mail window: route time at 70% speed, times this, plus mailGrace
  mailGrace: 10,
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
const ctx = canvas.getContext('2d');
const $ = (sel) => document.querySelector(sel);
const screens = {
  start: $('[data-screen="start"]'),
  port: $('[data-screen="port"]'),
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
  baseZoom = Math.max(1, Math.min(1.6, Math.min(w, h) / 390));
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
  hold: [], // contracts aboard
  offers: {}, // port id -> [contract]
  crates: [], // floating cargo: { x, y, c }
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
  S.offers = {};
  S.crates = [];
  S.shifts = 0;
  S.wind.next = null;
  S.wind.shiftAt = Infinity;
  S.wind.turnT = 0;
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

function makeContract(from, to, kind) {
  const w = S.world;
  const a = placeById(from);
  const b = placeById(to);
  const len = routeLength(w.light, a.rx, a.ry, b.rx, b.ry);
  const goods = Math.round(TUNE.goodsBase + TUNE.goodsPerTile * len);
  const c = { id: nextId++, from, to, kind, colour: b.colour, name: b.name, goods, len };
  if (kind === 'mail') {
    c.window = Math.round((len / (BOATS.dinghy.top * 0.7)) * TUNE.mailSlack + TUNE.mailGrace);
    c.left = c.window;
    c.pay = Math.round(goods * TUNE.mailBonus);
  } else if (kind === 'charter') {
    c.pay = 0;
  } else c.pay = goods;
  return c;
}

function makeOffers(port) {
  const others = S.world.ports.filter((p) => p.id !== port.id);
  const list = [];
  if (port.id === 0 && S.deliveries === 0 && !S.hold.length) {
    // The very first: a short hop on a reach.
    list.push(makeContract(0, S.world.first.port, 'goods'));
  }
  while (list.length < 2) {
    const to = others[Math.floor(S.rand() * others.length)];
    if (list.some((c) => c.to === to.id)) continue;
    list.push(makeContract(port.id, to.id, S.rand() < TUNE.mailShare && S.deliveries > 0 ? 'mail' : 'goods'));
  }
  return list;
}

function holdRoom() {
  return currentRig().cargo - S.hold.length;
}

function takeOffer(c) {
  if (S.mode !== 'docked') return false;
  if (holdRoom() <= 0) {
    renderPort(); // the cards show the hold is full
    return false;
  }
  const list = S.offers[S.portAt] || [];
  const k = list.indexOf(c);
  if (k < 0) return false;
  list.splice(k, 1);
  S.hold.push(c);
  play('load', { rate: 0.95 + Math.random() * 0.1 });
  renderPort();
  renderHud();
  return true;
}

function takeCharter() {
  if (S.mode !== 'docked' || S.portAt !== 0 || !S.owned.galleon || holdRoom() <= 0) return false;
  if (S.hold.some((c) => c.kind === 'charter')) return false;
  S.hold.push(makeContract(0, 'lighthouse', 'charter'));
  play('load');
  renderPort();
  renderHud();
  return true;
}

function buy(what) {
  if (S.mode !== 'docked' || S.portAt !== 0) return false;
  if (S.owned[what]) return false;
  if (what === 'spinnaker' && !S.owned.keel) return false;
  if ((what === 'keel' || what === 'spinnaker') && S.owned.galleon) return false;
  const price = TUNE.prices[what];
  if (S.coins < price) return false;
  S.coins -= price;
  S.owned[what] = true;
  if (what === 'galleon') {
    const b = S.boat;
    S.boat = newBoat(b.x, b.y, b.h);
    scheduleShift(TUNE.shiftWarn);
  }
  play('buy');
  fxText(S.boat.x, S.boat.y, what === 'galleon' ? 'The galleon is yours' : what === 'keel' ? 'Keel fitted' : 'Spinnaker aboard', '#ffd23f');
  saveHash();
  renderPort();
  renderHud();
  return true;
}

// --- Docking -------------------------------------------------------------------------------------
function arriveAt(port, quiet) {
  S.mode = 'docked';
  S.dock = null; // the glide is over: a drag or Cast off sails again
  S.portAt = port.id;
  const b = S.boat;
  b.v = 0;
  b.heel = 0;
  b.heelHold = 0;
  S.steer = null;
  // Unload what's bound here.
  let paid = 0;
  const notes = [];
  S.hold = S.hold.filter((c) => {
    if (c.to !== port.id) return true;
    if (c.kind === 'charter') return true; // handled below
    const onTime = c.kind === 'mail' && c.left > 0;
    const pay = c.kind === 'mail' ? (onTime ? c.pay : c.goods) : c.pay;
    paid += pay;
    S.deliveries++;
    notes.push(c.kind === 'mail' ? (onTime ? 'mail on time' : 'mail, late') : 'goods');
    if (S.deliveries === TUNE.shiftAfterDeliveries && S.wind.shiftAt === Infinity) scheduleShift(TUNE.shiftWarn);
    return false;
  });
  if (port.id === 'lighthouse' && S.hold.some((c) => c.kind === 'charter')) {
    endVoyage();
    return;
  }
  if (paid) {
    S.coins += paid;
    S.paid = { amount: paid, notes };
    play('coins');
    fxText(port.bx, port.by, `+${paid}`, '#ffd23f');
    hudBump();
  } else S.paid = null;
  if (!quiet) play('bell', { rate: 0.95 + Math.random() * 0.1 });
  if (port.id !== 'lighthouse') {
    S.offers[port.id] = makeOffers(port);
    saveHash();
  }
  showScreen('port');
  renderPort();
  renderHud();
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
  showScreen(null);
}

// --- Wind and gusts ----------------------------------------------------------------------------
function scheduleShift(inS) {
  S.wind.shiftAt = S.clock + inS;
  const turn = (S.rand() < 0.5 ? 1 : -1) * (Math.PI / 2) * (0.85 + S.rand() * 0.3);
  S.wind.next = wrap(S.wind.dir + turn);
  play('shift');
}

function spawnGusts(anywhere, near) {
  const w = S.world;
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
  void w;
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
    const p = nearestNav(nav, b.x + Math.cos(a) * 1.3, b.y + Math.sin(a) * 1.3);
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
  for (const c of S.hold) if (c.kind === 'mail' && c.left > 0) c.left = Math.max(0, c.left - dt);
  for (const cr of S.crates) if (cr.c.kind === 'mail' && cr.c.left > 0) cr.c.left = Math.max(0, cr.c.left - dt);
  stepWind(dt);
  if (S.mode === 'docked') {
    stepDockGlide(dt);
  } else if (S.mode === 'sail') {
    stepBoat(dt);
  }
  tickFx(dt);
}

function stepWind(dt) {
  const w = S.wind;
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

function driftSea(dt) {
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
    b.bump -= dt;
    b.h = wrap(b.h + dt * 2.2);
    b.target = b.h;
    b.v *= Math.exp(-dt * 2);
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
    const before = b.h;
    b.h = turnTowards(b.h, b.target, r.turn, dt);
    // A tack: the bow crosses the wind.
    const side = Math.sign(wrap(b.h - (wind + Math.PI)));
    if (S.sounds.side && side && side !== S.sounds.side && offWind(b.h, wind) < 1.2) play('tack');
    if (side) S.sounds.side = side;
    void before;
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
  const blockedAt = (x, y, hh) => {
    const ch = Math.cos(hh);
    const sh = Math.sin(hh);
    return (
      solid(x, y) ||
      solid(x + ch * reach, y + sh * reach) ||
      solid(x + ch * reach * 0.4 - sh * rad, y + sh * reach * 0.4 + ch * rad) ||
      solid(x + ch * reach * 0.4 + sh * rad, y + sh * reach * 0.4 - ch * rad)
    );
  };
  if (!blockedAt(nx, ny, b.h)) {
    b.x = nx;
    b.y = ny;
    b.grounded = 0;
  } else {
    // Against the shore: slide along it, in the open direction nearest the heading, never dead.
    b.grounded = (b.grounded || 0) + dt;
    const v = Math.max(b.v * 0.97, r.top * 0.25);
    let moved = false;
    for (const d of [0.4, -0.4, 0.8, -0.8, 1.2, -1.2, 1.6, -1.6, 2.1, -2.1, 2.6, -2.6, Math.PI]) {
      const hh = b.h + d;
      const x = b.x + Math.cos(hh) * v * dt;
      const y = b.y + Math.sin(hh) * v * dt;
      if (blockedAt(x, y, hh)) continue;
      b.x = x;
      b.y = y;
      b.v = v;
      // The bow follows the way it slides; the wanted heading follows too if it pointed ashore.
      b.h = turnTowards(b.h, hh, r.turn * 1.2, dt);
      if (Math.abs(wrap(b.target - b.h)) < 1.2) b.target = clampToWedge(r, b.h, wind);
      moved = true;
      break;
    }
    if (!moved) b.v = r.top * 0.2;
  }
  // Rocks.
  const rock = b.bump <= 0 && b.knock <= 0 ? hitRock(b.x, b.y, rad) : null;
  if (rock) {
    const a = Math.atan2(b.y - rock.y, b.x - rock.x);
    b.x = rock.x + Math.cos(a) * (0.45 + rad + 0.05);
    b.y = rock.y + Math.sin(a) * (0.45 + rad + 0.05);
    b.bump = TUNE.bumpTime;
    b.v = r.top * 0.2;
    play('bump');
    shake(0.25);
    if (S.hold.length) spill();
    fxText(b.x, b.y, 'Crunch!', '#ffffff');
  }
  // Crates to pick up.
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
    if (p.id === 'lighthouse' && !S.hold.some((c) => c.kind === 'charter')) continue;
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

function renderHud() {
  $('[data-coins]').textContent = S.coins;
  const hold = $('[data-hold]');
  const cap = currentRig().cargo;
  const parts = [];
  for (let k = 0; k < cap; k++) {
    const c = S.hold[k];
    if (!c) {
      parts.push('<span class="slot"></span>');
      continue;
    }
    let ring = '';
    if (c.kind === 'mail') {
      const f = c.left / c.window;
      ring = `<svg class="ring" viewBox="0 0 36 36"><circle cx="18" cy="18" r="16" fill="none" stroke="${f > 0 ? '#fff' : 'transparent'}" stroke-width="3" stroke-dasharray="${(f * 100.5).toFixed(1)} 200" /></svg>`;
    }
    parts.push(`<span class="slot full ${c.kind}" style="--c:${c.colour}">${ring}</span>`);
  }
  hold.innerHTML = parts.join('');
}

function offerLabel(c) {
  if (c.kind === 'charter') return 'The Grand Charter';
  if (c.kind === 'mail') return `Mail · ${c.window} s`;
  return 'Goods';
}

function renderPort() {
  if (S.mode !== 'docked') return;
  const port = placeById(S.portAt);
  $('[data-port-name]').textContent = port.name;
  $('[data-port-flag]').style.setProperty('--c', port.colour);
  const paid = $('[data-paid]');
  if (S.paid) {
    paid.hidden = false;
    paid.textContent = `+${S.paid.amount} coins`;
  } else paid.hidden = true;
  const offers = $('[data-offers]');
  offers.innerHTML = '';
  const room = holdRoom();
  const list = S.offers[S.portAt] || [];
  if (S.portAt === 0 && S.owned.galleon && !S.hold.some((c) => c.kind === 'charter')) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'offer charter';
    btn.dataset.charter = '';
    btn.setAttribute('aria-disabled', String(room <= 0));
    btn.innerHTML = `<span class="swatch" style="--c:#fff"></span><span class="to">The Lighthouse<span class="kind">The Grand Charter: the voyage's end</span></span><span class="pay">★</span>`;
    btn.addEventListener('click', () => takeCharter());
    offers.appendChild(btn);
  }
  for (const c of list) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'offer';
    btn.dataset.offer = c.id;
    btn.setAttribute('aria-disabled', String(room <= 0));
    btn.innerHTML = `<span class="swatch" style="--c:${c.colour}"></span><span class="to">${c.name}<span class="kind">${offerLabel(c)}</span></span><span class="pay">${c.pay}</span>`;
    btn.addEventListener('click', () => takeOffer(c));
    offers.appendChild(btn);
  }
  const yard = $('[data-yard]');
  yard.hidden = S.portAt !== 0 || S.owned.galleon;
  if (S.portAt === 0 && !S.owned.galleon) {
    const items = [
      ['keel', 'Keel'],
      ['spinnaker', 'Spinnaker'],
      ['galleon', 'Galleon'],
    ];
    yard.innerHTML = '';
    yard.style.gridTemplateColumns = `repeat(${items.length}, 1fr)`;
    for (const [what, label] of items) {
      const owned = S.owned[what];
      const can = !owned && S.coins >= TUNE.prices[what] && !(what === 'spinnaker' && !S.owned.keel);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'buy' + (owned ? ' owned' : '');
      btn.dataset.buy = what;
      btn.setAttribute('aria-disabled', String(!can));
      btn.innerHTML = `<span class="what">${label}</span><span class="price">${owned ? 'Yours' : TUNE.prices[what]}</span>`;
      btn.addEventListener('click', () => buy(what));
      yard.appendChild(btn);
    }
  }
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
  // Shallows and their animated sparkle, then the land blocks, back to front.
  for (let s = range.x0 + range.y0; s <= range.x1 + range.y1; s++)
    for (let i = range.x0; i <= range.x1; i++) {
      const j = s - i;
      if (j < range.y0 || j > range.y1) continue;
      const tt = tileAt(w, i + 0.5, j + 0.5);
      const inside = i >= 0 && j >= 0 && i < W && j < H;
      if (!inside) continue;
      if (tt === SHALLOW) {
        tilePath(i, j, 0);
        ctx.fillStyle = C.shallow;
        ctx.fill();
        ctx.strokeStyle = C.shallow; // hide hairline seams
        ctx.lineWidth = 1;
        ctx.stroke();
        if (S.owned.galleon) {
          ctx.fillStyle = 'rgba(232,96,76,0.13)';
          ctx.fill();
        }
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
  // Surf where the shallows meet the beach: a soft white line that breathes.
  ctx.lineWidth = 2;
  for (let j = Math.max(0, range.y0); j <= Math.min(H - 1, range.y1); j++)
    for (let i = Math.max(0, range.x0); i <= Math.min(W - 1, range.x1); i++) {
      if (tileAt(w, i + 0.5, j + 0.5) < SAND) continue;
      const a = 0.25 + 0.2 * Math.sin(t * 1.6 + i * 0.9 + j * 0.6);
      ctx.strokeStyle = `rgba(255,255,255,${a})`;
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
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(q.x, q.y);
        ctx.stroke();
      }
    }
}


function drawBlock(i, j, tt) {
  const w = S.world;
  const z = LIFT[tt];
  const top = tt === GRASS ? C.grass : C.sand;
  // Side faces where the neighbour in front is lower.
  const right = tileAt(w, i + 1.5, j + 0.5);
  const left = tileAt(w, i + 0.5, j + 1.5);
  const zr = right >= SAND ? LIFT[right] : -3;
  const zl = left >= SAND ? LIFT[left] : -3;
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

function drawGusts() {
  for (const g of S.gusts) {
    const k = gustNow(g);
    if (k <= 0) continue;
    const strong = g.g >= 1.4;
    const c = iso.toScreen(g.x, g.y);
    const rx = g.r * iso.tileW * 0.7071;
    const ry = g.r * iso.tileH * 0.7071;
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.scale(1, ry / rx);
    const grad = ctx.createRadialGradient(0, 0, rx * 0.2, 0, 0, rx);
    const a = (strong ? 0.32 : 0.22) * k;
    grad.addColorStop(0, `rgba(18,70,120,${a})`);
    grad.addColorStop(0.7, `rgba(18,70,120,${a * 0.8})`);
    grad.addColorStop(1, 'rgba(18,70,120,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, rx, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // Cat's paws: little dark ripples scattered inside, moving.
    const n = Math.round(g.r * 5);
    ctx.strokeStyle = `rgba(16,58,100,${0.45 * k})`;
    ctx.lineWidth = 1.4;
    for (let m = 0; m < n; m++) {
      const ang = g.seed + m * 2.39996;
      const rr = Math.sqrt((m + 0.5) / n) * g.r * 0.85;
      const px = g.x + Math.cos(ang) * rr;
      const py = g.y + Math.sin(ang) * rr;
      const p = iso.toScreen(px, py);
      const wob = Math.sin(S.t * 6 + m) * 1.5;
      ctx.beginPath();
      ctx.moveTo(p.x - 5, p.y + wob * 0.3);
      ctx.lineTo(p.x - 1, p.y - 1.5);
      ctx.lineTo(p.x + 4, p.y + wob * 0.3);
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
  void range;
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

function drawFlag(x, y, z, colour, size, t, big) {
  const base = iso.toScreen(x, y, z);
  const hgt = size * (big ? 1.5 : 1);
  ctx.strokeStyle = '#5b4a3a';
  ctx.lineWidth = big ? 2.5 : 2;
  ctx.beginPath();
  ctx.moveTo(base.x, base.y);
  ctx.lineTo(base.x, base.y - hgt);
  ctx.stroke();
  const sd = iso.gridDirToScreen(Math.cos(S.wind.dir), Math.sin(S.wind.dir));
  const len = (big ? 22 : 13) * (0.75 + 0.25 * Math.abs(sd.x));
  const fx = Math.sign(sd.x) || 1;
  const wave = Math.sin(t * 8 + x) * 2.5;
  ctx.fillStyle = colour;
  ctx.beginPath();
  ctx.moveTo(base.x, base.y - hgt);
  ctx.quadraticCurveTo(base.x + fx * len * 0.5, base.y - hgt - wave, base.x + fx * len, base.y - hgt + 3 + wave * 0.5);
  ctx.lineTo(base.x + fx * len * 0.95, base.y - hgt + (big ? 13 : 8));
  ctx.quadraticCurveTo(base.x + fx * len * 0.5, base.y - hgt + (big ? 12 : 8) - wave, base.x, base.y - hgt + (big ? 14 : 9));
  ctx.closePath();
  ctx.fill();
  if (big) {
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
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
  const dests = new Set(S.hold.map((c) => c.to));
  for (const p of [...w.ports, w.lighthouse]) {
    if (!inView(p.qx, p.qy, 6)) continue;
    const isDest = dests.has(p.id);
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
    items.push({ depth: iso.depth(p.qx, p.qy, 2), draw: () => drawFlag(p.qx, p.qy, fz, p.colour, 30, S.t, isDest) });
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
  // Floating crates.
  for (const cr of S.crates) {
    items.push({
      depth: iso.depth(cr.x, cr.y, 1),
      draw: () => {
        const bob = Math.sin(cr.t * 3) * 1.5;
        ellipse(cr.x, cr.y, 0.35, 'rgba(255,255,255,0.25)');
        const p = iso.toScreen(cr.x, cr.y, 4 + bob);
        ctx.fillStyle = cr.c.kind === 'mail' ? '#f6f1e3' : '#b98245';
        ctx.strokeStyle = cr.c.colour;
        ctx.lineWidth = 2;
        ctx.fillRect(p.x - 6, p.y - 6, 12, 10);
        ctx.strokeRect(p.x - 6, p.y - 6, 12, 10);
      },
    });
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
  const dests = new Set(S.hold.map((c) => c.to));
  for (const p of [...S.world.ports, S.world.lighthouse]) {
    if (p.id === 'lighthouse' && !dests.has('lighthouse')) continue;
    const dest = dests.has(p.id);
    const pulse = dest ? 0.5 + 0.5 * Math.sin(S.t * 4) : 0;
    ctx.setLineDash(dest ? [] : [6, 6]);
    ellipse(p.rx, p.ry, ringR(), dest ? hexA(p.colour, 0.16 + 0.1 * pulse) : null, hexA(p.colour === '#d9d4c7' ? '#ffffff' : p.colour, dest ? 0.9 : 0.55), dest ? 3 : 2);
    ctx.setLineDash([]);
  }
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
    for (const c of S.hold) {
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
      ctx.fillStyle = hexA(c.colour === '#d9d4c7' ? '#ffffff' : c.colour, 0.95);
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
  const dests = new Set(S.hold.map((c) => c.to));
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
    const q = at(S.boat.x, S.boat.y);
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(q.x, q.y, 2.6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

const cssVar = (name) => parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name)) || 0;
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
void cssVar;

function draw() {
  if (!S.world) return;
  const b = S.boat;
  // Follow the boat, a little ahead of where it's going.
  const r = currentRig();
  const lead = S.mode === 'sail' ? Math.min(1.8, b.v * 1.2) : 0;
  const target = iso.toScreen(b.x + Math.cos(b.h) * lead, b.y + Math.sin(b.h) * lead);
  if (S.mode === 'start' || S.mode === 'over') {
    // Drift slowly over the sea behind the cards.
    target.x += Math.sin(S.t * 0.07) * 160;
    target.y += Math.cos(S.t * 0.05) * 80 + 60;
  } else if (S.mode === 'docked') target.y += cam.h * 0.18 / cam.zoom; // the sheet covers the bottom
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
  void r;
}

// --- Input -------------------------------------------------------------------------------------------
function steerFrom(p) {
  if (S.mode === 'docked' && S.dock === null) castOff();
  if (S.mode !== 'sail') return;
  const b = S.boat;
  const len = Math.hypot(p.dx, p.dy);
  S.steer = { x0: p.x - p.dx, y0: p.y - p.dy, x: p.x, y: p.y, active: len > TUNE.dragDead };
  if (len <= TUNE.dragDead || b.knock > 0 || b.bump > 0) return;
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
$('[data-cast]').addEventListener('click', () => castOff());
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
  pausedFrom = { mode: S.mode, screen: S.mode === 'docked' ? 'port' : null };
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
  renderPort();
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
  takeOffer,
  takeCharter,
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
};
window.__seas = api;

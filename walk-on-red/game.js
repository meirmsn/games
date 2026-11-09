// Walk on Red: you're late, on the phone, and the light is red, so you go now. Each time you make it
// to safe ground and stop there a moment, the people waiting trust you a little more and follow.
//
// The rules (specs/walk-on-red.md):
//  - The street is a grid of rows: the near kerb at the bottom, lanes, sometimes a median, the far
//    kerb at the top. You hop one lane forward (a tap) or back (a swipe down), always in one column.
//  - Copiers wait on the near kerb. They only move from one safe strip (a kerb or a median) to the
//    next, after you have stood on that next strip for PROVE_T. They set off only when the lanes on
//    their way are clear; if no gap comes within HOLD_AFTER, those lanes' lights hold the cars for
//    them. Cars always brake for a copier in their lane: copiers are never hit.
//  - A level is one red light. It closes when you are on the far kerb and no copier is on the way:
//    its score is (1 + copiers across, the grandpa counting 2) × the whole seconds of red left.
//    Then the light turns green, the cars stop and everyone crosses together.
//  - A car hitting you costs time and the trust of one copier, who goes back to the crowd. There
//    are no lives: a level always ends in green, and a run is eight levels.
//  - A hidden assist eases the traffic after hits.
//
// Drawing: the street is drawn at its art resolution (1 art px = 1 canvas px) on a small offscreen
// canvas, then scaled up with smoothing off; text goes on the full-resolution canvas on top.
import { mountShell } from '../shared/game-shell.js';
import { FRAMES } from './atlas.js';

const { sound } = mountShell({
  sounds: {
    step: 'sounds/step.mp3',
    step2: 'sounds/step2.mp3',
    join: 'sounds/join.mp3',
    arrive: 'sounds/arrive.mp3',
    hit: 'sounds/hit.mp3',
    horn: 'sounds/horn.mp3',
    bump: 'sounds/bump.mp3',
    tick: 'sounds/tick.mp3',
    start: 'sounds/start.mp3',
    street: 'sounds/street.mp3',
    over: 'sounds/over.mp3',
    siren: 'sounds/siren.mp3',
    walk: 'sounds/walk.mp3',
    music: 'sounds/music.mp3',
  },
});
const heard = []; // the sounds played, with their pitch, for tests
function sfx(name, opts) {
  heard.push({ name, rate: (opts && opts.rate) || 1 });
  if (heard.length > 200) heard.shift();
  sound.play(name, opts);
}

// ---------- Constants ----------

const COLS = 12;
const CW = 12; // a cell's width in art px
const ROW = 22; // a row's height in art px
const PLAY_W = COLS * CW; // 144
const ENTRY = 80; // vehicles enter this far beyond the play area's edge
const WAIT_H = 12; // the strip behind each kerb where people wait
const HOP_TWEEN = 0.12;
const PERSON_HALF = 2.5; // a person's hitbox is 5 art px wide
const SHRINK = 0.1; // vehicles' boxes are 20% narrower than their art (10% off each end)
const PCOL = 5; // the player's column
const PROVE_T = 0.6; // standing this long on a strip shows the copiers it is safe
const SEE_DELAY = 0.45; // a copier's glance before setting off
const HOLD_AFTER = 6; // a copier waiting this long for a gap gets the lanes held for them
const COP_HOP = 0.32;
const GRANDPA_HOP = 0.7;
const DOWN_T = 1.2; // a hit player lies flat this long
const GREEN_T = 3.6; // the green light's crossing
const TALLY_T = 2.2;
const LEVELS_N = 8;

const CARS = ['sedan', 'sedan_blue', 'rounded_green', 'rounded_red', 'rounded_yellow', 'station', 'suv', 'suv_green', 'convertible', 'vintage', 'sports_red', 'sports_yellow', 'van_small', 'taxi'];
const CITY = ['van', 'van_large', 'van_flat', 'taxi', 'bus', 'truckdelivery', 'vendor', 'hotdog', 'suv_large', 'truckdark', 'sedan', 'station', 'taxi'];
const SCHOOL = ['bus_school', 'sedan', 'station', 'suv_travel', 'van_small', 'rounded_yellow', 'suv_closed', 'sedan_blue'];
const EVENING = ['sedan', 'suv', 'van', 'taxi', 'sports_red', 'sedan_vintage', 'truckcabin_vintage', 'station', 'suv_military', 'van_large'];
const NIGHT = ['sports_red', 'sports_yellow', 'sports_green', 'sports_convertible', 'taxi', 'sedan_vintage', 'truckdark', 'bus', 'van', 'convertible'];
const SIRENS = ['ambulance', 'police', 'firetruck', 'riot'];

const HEAVY = ['bus', 'bus_school', 'truck', 'truckdelivery', 'van_large', 'trucktank', 'transport', 'truckdark', 'sedan', 'taxi'];
const SUNDAY = ['vintage', 'convertible', 'sedan_vintage', 'rounded_green', 'rounded_yellow', 'station'];

// A lane: [direction (1 = to the right), speed (art px/s), vehicle set, gap range, platoon range, lull range]
const L = (dir, speed, set, gap = [16, 50], on = [3, 6], off = [3, 5]) => ({ dir, speed, set, gap, on, off });

const PAL = {
  maple: { sky: '#bfe6ff', far: '#9fd28a', build: ['#e8b48a', '#f2d29b', '#c99ac2'], walk: '#d9d2c3', edge: '#b6ab98', road: '#5b6070', line: '#f4f1e8', mid: '#ffd23f', verge: '#7cc46a', dark: 0 },
  market: { sky: '#a9d8f5', far: '#8fb7c9', build: ['#d98b6a', '#c9c2b2', '#7fa7c4', '#e6c27a'], walk: '#d6cfc0', edge: '#aaa08f', road: '#545a68', line: '#f4f1e8', mid: '#ffd23f', verge: '#8bbf6a', dark: 0 },
  school: { sky: '#ffe2b0', far: '#e8c27a', build: ['#c9714f', '#d9a46b', '#a7b86f'], walk: '#ddd0b8', edge: '#b39f80', road: '#585a66', line: '#f6efe0', mid: '#ffd23f', verge: '#a6c76a', dark: 0 },
  evening: { sky: '#f7a072', far: '#b86b77', build: ['#6b4a6e', '#8a5a6b', '#4f4a6e'], walk: '#c9b7aa', edge: '#9a8576', road: '#4c4b5a', line: '#f3e6d8', mid: '#ffc93f', verge: '#7f9a6a', dark: 0.12 },
  night: { sky: '#1d2240', far: '#2c3160', build: ['#3a3f6b', '#2f3459', '#463f6b'], walk: '#8d8a9a', edge: '#6f6c7d', road: '#3a3c4a', line: '#d8d6e6', mid: '#ffc93f', verge: '#4a5a52', dark: 0.35 },
};

// The eight levels: rows from the far kerb (top) down to the near kerb; 'K' kerb, 'L' lane,
// 'M' median. Each brings one new thing.
const LEVELS = [
  { name: 'Quiet Street', red: 30, copiers: 0, rows: ['K', 'L', 'L', 'K'], lanes: [L(1, 13, CARS, [30, 70]), L(1, 15, CARS, [30, 70])], pal: PAL.maple },
  { name: 'Both Ways', red: 30, copiers: 0, rows: ['K', 'L', 'L', 'L', 'L', 'K'], lanes: [L(-1, 17, CARS), L(-1, 20, CARS), L(1, 18, CARS), L(1, 16, CARS)], pal: PAL.maple },
  { name: 'Market Avenue', red: 28, copiers: 1, rows: ['K', 'L', 'L', 'M', 'L', 'L', 'K'], lanes: [L(-1, 16, CITY, [34, 80], [2, 4], [4, 6]), L(-1, 18, CITY, [34, 80], [2, 4], [4, 6]), L(1, 17, CITY, [34, 80], [2, 4], [4, 6]), L(1, 15, CITY, [34, 80], [2, 4], [4, 6])], pal: PAL.market },
  { name: 'Bus Lane', red: 28, copiers: 2, rows: ['K', 'L', 'L', 'M', 'L', 'L', 'K'], lanes: [L(-1, 18, HEAVY, [24, 60]), L(-1, 21, CITY), L(1, 20, CITY), L(1, 16, HEAVY, [24, 60])], pal: PAL.market },
  { name: 'Sunday Morning', red: 28, copiers: 3, rows: ['K', 'L', 'L', 'M', 'L', 'L', 'K'], lanes: [L(-1, 15, SUNDAY, [30, 70], [2, 4], [4, 6]), L(-1, 17, SUNDAY, [30, 70], [2, 4], [4, 6]), L(1, 16, SUNDAY, [30, 70], [2, 4], [4, 6]), L(1, 14, SUNDAY, [30, 70], [2, 4], [4, 6])], pal: PAL.school },
  { name: 'Siren Boulevard', red: 30, copiers: 3, sirens: true, rows: ['K', 'L', 'L', 'L', 'M', 'L', 'L', 'K'], lanes: [L(-1, 22, EVENING), L(-1, 19, EVENING), L(-1, 24, EVENING), L(1, 20, EVENING), L(1, 23, EVENING)], pal: PAL.evening },
  { name: 'Old Town', red: 32, copiers: 2, grandpa: true, rows: ['K', 'L', 'L', 'M', 'L', 'L', 'L', 'K'], lanes: [L(-1, 20, CARS), L(-1, 23, CARS), L(1, 21, CITY), L(1, 18, CITY), L(1, 24, CARS)], pal: PAL.school },
  { name: 'Downtown', red: 34, copiers: 4, sirens: true, rows: ['K', 'L', 'M', 'L', 'L', 'M', 'L', 'K'], lanes: [L(-1, 24, NIGHT), L(-1, 21, NIGHT), L(1, 23, NIGHT), L(1, 26, NIGHT)], pal: PAL.night },
];

// What the player says into the phone, now and then.
const CALL = ['Yes, yes, two minutes!', 'I’m nearly there!', 'Start without me!', 'No, I’m crossing now…', 'Can you hear me?'];
const OUCH = ['I’m fine, I’m fine!', 'No, all good!', 'Just a bus. Go on.'];

// Shirt colours for the crowd: [light, shade].
const SHIRTS = [
  [[240, 110, 170], [200, 70, 130]],
  [[160, 120, 230], [120, 85, 190]],
  [[70, 200, 200], [40, 155, 160]],
  [[235, 85, 85], [190, 55, 60]],
  [[240, 240, 240], [200, 200, 205]],
  [[170, 220, 80], [125, 175, 50]],
  [[90, 150, 245], [55, 110, 200]],
  [[255, 216, 61], [220, 156, 36]],
];
const SUIT = [[64, 82, 132], [44, 58, 100]]; // the player's jacket
const GRANDPA = [[160, 120, 80], [125, 92, 60]];

// ---------- Random (seedable, for tests) ----------

let seed = (Math.random() * 2 ** 31) | 0;
function rnd() {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const rand = (a, b) => a + rnd() * (b - a);
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];

// ---------- Storage ----------

const KEY = 'walk-on-red';
function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || {};
  } catch (e) {
    return {};
  }
}
function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(saved));
  } catch (e) {
    // Blocked storage: it lasts until the page reloads.
  }
}
const saved = Object.assign({ best: 0, reached: 0, assist: null, stars: [] }, load());
if (!Array.isArray(saved.stars)) saved.stars = [];

// ---------- State ----------

const game = {
  mode: 'title', // title | play | green | tally | over
  paused: false,
  level: 0,
  red: 30, // seconds of red left
  score: 0, // the run's total
  levelScore: 0,
  results: [], // per level: { score, stars, across }
  assist: 0.4,
  grace: 0, // after a resume: input ignored and the player can't be hit
  time: 0,
  phaseT: 0, // time in the green or tally phase
  siren: null, // { lane, t, name } while warning
  sirenIn: 0,
  lastTick: 0,
  shake: 0,
  callIn: 3,
};

let layout = null; // the current level's rows, lanes and geometry
let vehicles = [];
let people = []; // copiers and the crowd
let popups = []; // floating text: { x, y, text, t, color, big }
let proven = new Set(); // safe rows the player has stood on long enough
let nextId = 1;
const player = { col: PCOL, row: 0, lastSafe: 0, standT: 0, face: 1, vx: 0, vy: 0, fx: 0, fy: 0, tw: 1, down: 0, walkFrame: 0, auto: false, autoT: 0 };

function street() {
  return LEVELS[game.level];
}

// ---------- Layout ----------

function buildLayout(idx) {
  const s = LEVELS[idx];
  const rows = s.rows.slice();
  const lanes = [];
  let li = 0;
  rows.forEach((kind, r) => {
    if (kind === 'L') lanes.push({ row: r, ...s.lanes[li++], phase: 'on', t: 0, spawnIn: 0, light: 'green', holdCol: null, holdBy: null });
  });
  return { s, rows, lanes, bottom: rows.length - 1 };
}

const isKerb = (r) => r === 0 || r === layout.bottom;
const isSafe = (r) => layout.rows[r] === 'K' || layout.rows[r] === 'M';
const isLane = (r) => layout.rows[r] === 'L';
const laneAt = (r) => layout.lanes.find((l) => l.row === r);
const colX = (c) => c * CW + CW / 2; // a column's centre, in world x (0 = the play area's left edge)

// The next safe strip above a row (toward the far kerb), or -1.
function nextStrip(row) {
  for (let r = row - 1; r >= 0; r--) if (isSafe(r)) return r;
  return -1;
}

function rowY(r) {
  return WAIT_H + r * ROW; // world y; the top wait strip sits above row 0
}
function cellFeet(col, row) {
  return { x: colX(col), y: rowY(row) + ROW - 4 };
}
// Where someone stands in the strip behind a kerb.
function stripFeet(col, row) {
  if (row === 0) return { x: colX(col), y: rowY(0) - 2 };
  return { x: colX(col), y: rowY(row) + ROW + WAIT_H - 1 };
}

// ---------- People ----------

function makePerson(kind, col, row) {
  const p = {
    id: nextId++,
    kind, // copier | grandpa | crowd
    weight: kind === 'grandpa' ? 2 : 1,
    hop: kind === 'grandpa' ? GRANDPA_HOP : COP_HOP,
    col,
    row,
    state: 'wait', // wait | cross | across | home | walk
    path: [],
    seeT: 0,
    waitT: 0,
    hopT: 0,
    shirt: Math.floor(rnd() * SHIRTS.length),
    woman: kind === 'grandpa' ? false : rnd() < 0.5,
    face: 1,
    vx: 0,
    vy: 0,
    fx: 0,
    fy: 0,
    tx: 0,
    ty: 0,
    tw: 1,
    twDur: 0.2,
    t: rnd() * 3,
    walkFrame: 0,
  };
  return p;
}

function place(p, x, y) {
  p.vx = p.fx = p.tx = x;
  p.vy = p.fy = p.ty = y;
  p.tw = 1;
}

function walkTo(p, x, y, dur) {
  p.fx = p.vx;
  p.fy = p.vy;
  p.tx = x;
  p.ty = y;
  p.tw = 0;
  p.twDur = Math.max(0.05, dur);
  if (Math.abs(x - p.vx) > 0.5) p.face = x > p.vx ? 1 : -1;
  p.walkFrame ^= 1;
}

const COPIER_COLS = [3, 8, 2, 9, 7];

// ---------- Level set-up ----------

function setupLevel(idx) {
  game.level = idx;
  layout = buildLayout(idx);
  const s = layout.s;
  vehicles = [];
  people = [];
  popups = [];
  proven = new Set();
  game.red = s.red;
  game.levelScore = 0;
  game.lastTick = 0;
  game.siren = null;
  game.sirenIn = rand(7, 11);
  game.callIn = 2.5;
  game.phaseT = 0;
  // Lanes start staggered: neighbours never in the same phase.
  layout.lanes.forEach((ln, i) => {
    ln.phase = i % 2 === 0 ? 'on' : 'off';
    ln.t = ln.phase === 'on' ? rand(ln.on[0], ln.on[1]) * (0.4 + 0.5 * rnd()) : rand(ln.off[0], ln.off[1]) * (0.4 + 0.5 * rnd());
    ln.spawnIn = rand(0, 1);
  });
  // The player on the near kerb.
  player.col = PCOL;
  player.row = layout.bottom;
  player.lastSafe = layout.bottom;
  player.standT = 0;
  player.down = 0;
  player.auto = false;
  player.face = 1;
  const f = cellFeet(player.col, player.row);
  player.vx = player.fx = f.x;
  player.vy = player.fy = f.y;
  player.tw = 1;
  // The copiers stand at the kerb's edge, the crowd behind them.
  const n = s.copiers + (s.grandpa ? 1 : 0);
  for (let i = 0; i < n; i++) {
    const kind = s.grandpa && i === n - 1 ? 'grandpa' : 'copier';
    const p = makePerson(kind, COPIER_COLS[i], layout.bottom);
    const g = cellFeet(p.col, p.row);
    place(p, g.x, g.y);
    people.push(p);
  }
  for (const col of [1, 4, 6, 10]) {
    const p = makePerson('crowd', col, layout.bottom);
    const g = stripFeet(col, layout.bottom);
    place(p, g.x + rand(-3, 3), g.y);
    people.push(p);
  }
  resize();
  // The road starts with traffic already in it.
  for (let i = 0; i < 12 * 30; i++) updateTraffic(1 / 30, true);
}

// ---------- Copiers ----------

// Is a lane cell clear of vehicles from t0 to t1 seconds from now (with a margin in art px)?
function laneClear(col, row, t0, t1, margin = 3) {
  const x = colX(col);
  const a = x - PERSON_HALF - margin;
  const b = x + PERSON_HALF + margin;
  const mul = speedMul();
  const ln = laneAt(row);
  for (const v of vehicles) {
    if (v.lane !== row) continue;
    // A car held before this column won't reach it.
    if (ln && ln.holdCol === col && v.s <= stopLine(v, col) + 0.5) continue;
    const [x0, x1] = boxOf(v);
    const sp = v.siren ? v.speed : v.speed * mul;
    const d0 = v.dir * sp * t0;
    const d1 = v.dir * sp * t1;
    const lo = Math.min(x0 + d0, x0 + d1);
    const hi = Math.max(x1 + d0, x1 + d1);
    if (lo < b && hi > a) return false;
  }
  return true;
}

function releaseHolds(p) {
  for (const ln of layout.lanes) {
    if (ln.holdBy === p.id) {
      ln.holdCol = null;
      ln.holdBy = null;
    }
  }
}

function updateCopiers(dt) {
  for (const p of people) {
    if (p.kind === 'crowd') continue;
    if (p.state === 'wait') {
      const ns = nextStrip(p.row);
      if (ns < 0 || !proven.has(ns)) {
        p.seeT = 0;
        p.waitT = 0;
        continue;
      }
      if (p.seeT < SEE_DELAY) {
        p.seeT += dt; // a glance: they've seen you make it
        continue;
      }
      if (game.siren) continue; // nobody steps out while a siren is coming
      p.waitT += dt;
      const lanes = [];
      for (let r = p.row - 1; r > ns; r--) lanes.push(r);
      const clear = lanes.every((r, k) => laneClear(p.col, r, k * p.hop - 0.2, (k + 1) * p.hop + 0.8, 6));
      if (clear) {
        releaseHolds(p);
        p.state = 'cross';
        p.path = [...lanes, ns];
        p.hopT = 0;
        sfx('join', { rate: p.kind === 'grandpa' ? 0.8 : rand(0.95, 1.1), gain: 0.6 });
        popups.push({ x: colX(p.col), y: rowY(p.row) - 8, text: '!', t: 0, color: '#ffffff', big: false });
      } else if (p.waitT > HOLD_AFTER) {
        // No gap came: the lanes' lights hold the cars for them.
        for (const r of lanes) {
          const ln = laneAt(r);
          if (ln.holdCol == null) {
            ln.holdCol = p.col;
            ln.holdBy = p.id;
          }
        }
      }
    } else if (p.state === 'cross') {
      p.hopT -= dt;
      if (p.hopT > 0) continue;
      const r = p.path.shift();
      p.row = r;
      const g = cellFeet(p.col, r);
      walkTo(p, g.x, g.y, p.hop * 0.8);
      p.hopT = p.hop;
      if (!p.path.length) {
        releaseHolds(p);
        if (r === 0) arrive(p);
        else {
          p.state = 'wait';
          p.seeT = 0;
          p.waitT = 0;
        }
      }
    }
  }
}

function arrive(p) {
  p.state = 'across';
  const n = people.filter((q) => q.state === 'across' && q.kind !== 'crowd').reduce((s, q) => s + q.weight, 0);
  game.assist = Math.max(0, game.assist - 0.03);
  popups.push({ x: colX(p.col), y: rowY(0) - 14, text: p.weight > 1 ? '+2' : '+1', t: 0, color: '#ffd23f', big: true });
  sfx('arrive', { rate: Math.min(2, 1 + 0.08 * (n - 1)), gain: 0.7 });
  // Off the kerb's edge, into the strip behind it.
  setTimeout(() => {
    if (p.state !== 'across' || !layout) return;
    const g = stripFeet(p.col, 0);
    walkTo(p, g.x, g.y, 0.3);
  }, 250);
}

function acrossWeight() {
  return people.filter((q) => q.state === 'across' && q.kind !== 'crowd').reduce((s, q) => s + q.weight, 0);
}
function onTheWayWeight() {
  return people.filter((q) => q.state === 'cross' && q.kind !== 'crowd').reduce((s, q) => s + q.weight, 0);
}

// ---------- The player ----------

const DIRS = { up: -1, down: 1 };

function canAct() {
  return game.mode === 'play' && !game.paused && game.grace <= 0 && !player.down;
}

function hop(dir) {
  const dy = DIRS[dir];
  if (!dy || !canAct()) return false;
  const row = player.row + dy;
  if (row < 0 || row > layout.bottom) {
    bump();
    return false;
  }
  movePlayer(row);
  sfx(rnd() < 0.5 ? 'step' : 'step2', { rate: rand(0.9, 1.15), gain: 0.55 });
  return true;
}

function movePlayer(row) {
  player.fx = player.vx;
  player.fy = player.vy;
  player.row = row;
  player.tw = 0;
  player.walkFrame ^= 1;
  player.standT = 0;
  if (isSafe(row)) player.lastSafe = row;
}

function bump() {
  sfx('bump', { gain: 0.5 });
  player.nudge = 0.15;
}

function updatePlayer(dt) {
  if (player.tw < 1) {
    player.tw = Math.min(1, player.tw + dt / HOP_TWEEN);
    const f = cellFeet(player.col, player.row);
    player.vx = player.fx + (f.x - player.fx) * player.tw;
    player.vy = player.fy + (f.y - player.fy) * player.tw;
  }
  if (player.nudge > 0) player.nudge -= dt;
  if (player.down > 0) {
    player.down -= dt;
    if (player.down <= 0) {
      // Back on the last safe strip.
      player.down = 0;
      player.row = player.lastSafe;
      const f = cellFeet(player.col, player.row);
      player.fx = player.vx = f.x;
      player.fy = player.vy = f.y;
      player.tw = 1;
      player.standT = 0;
    }
    return;
  }
  if (game.mode === 'play' && isSafe(player.row) && player.tw >= 1 && player.row !== layout.bottom) {
    player.standT += dt;
    if (player.standT >= PROVE_T && !proven.has(player.row)) {
      proven.add(player.row);
      // The copiers who can follow now look up.
      for (const p of people) if (p.state === 'wait' && p.kind !== 'crowd' && nextStrip(p.row) === player.row) p.seeT = 0;
    }
  }
  // On the green light, everyone still on the way walks across, the player too.
  if (player.auto && player.row > 0) {
    player.autoT -= dt;
    if (player.autoT <= 0) {
      movePlayer(player.row - 1);
      player.autoT = 0.3;
    }
  }
}

function checkHit() {
  if (game.mode !== 'play' || game.grace > 0 || player.down || !isLane(player.row)) return;
  const x = colX(player.col);
  const a = x - PERSON_HALF;
  const b = x + PERSON_HALF;
  for (const v of vehicles) {
    if (v.lane !== player.row) continue;
    const [x0, x1] = boxOf(v);
    if (x0 < b && x1 > a) {
      hitPlayer();
      return;
    }
  }
}

function hitPlayer() {
  player.down = DOWN_T;
  game.assist = Math.min(1, game.assist + 0.25);
  game.shake = 0.25;
  sfx('hit', { gain: 0.8 });
  sfx('horn', { gain: 0.45, rate: rand(0.95, 1.08) });
  popups.push({ x: colX(player.col), y: rowY(player.row) - 10, text: pick(OUCH), t: 0, color: '#ffffff', big: false, long: true });
  // One copier who saw it shakes their head and goes back to the crowd.
  const doubter = people.find((p) => p.kind !== 'crowd' && p.state === 'wait');
  if (doubter) {
    doubter.state = 'home';
    releaseHolds(doubter);
    popups.push({ x: colX(doubter.col), y: rowY(doubter.row) - 8, text: 'nope', t: 0, color: '#ffb3b3', big: false });
    const g = stripFeet(doubter.col, layout.bottom);
    walkTo(doubter, g.x, g.y, Math.max(0.4, (layout.bottom - doubter.row) * 0.35));
    doubter.row = layout.bottom;
  }
}

// ---------- Level flow ----------

function closeLevel() {
  const n = acrossWeight();
  const secs = Math.max(0, Math.ceil(game.red - 1e-9));
  game.levelScore = (1 + n) * secs;
  beginGreen();
}

function maxScore(s) {
  return s.red * (1 + s.copiers + (s.grandpa ? 2 : 0));
}
function starsFor(score, s) {
  const f = score / maxScore(s);
  return f >= 0.45 ? 3 : f >= 0.28 ? 2 : f >= 0.12 ? 1 : 0;
}

function beginGreen() {
  game.mode = 'green';
  game.phaseT = 0;
  game.siren = null;
  for (const ln of layout.lanes) {
    ln.holdCol = null;
    ln.holdBy = null;
  }
  sfx('walk', { gain: 0.5 });
  sfx('street', { gain: 0.7 });
}

function updateGreen(dt) {
  game.phaseT += dt;
  // After a beat, everyone still on this side crosses: copiers left behind, the crowd, the player.
  if (game.phaseT >= 0.8 && !game.greenWalk) {
    game.greenWalk = true;
    for (const p of people) {
      if (p.state === 'across') continue;
      p.state = 'walk';
      p.walkRow = p.row;
      p.hopT = rand(0, 0.4);
    }
    if (player.row > 0 && !player.down) {
      player.auto = true;
      player.autoT = 0;
    }
  }
  if (game.greenWalk) {
    for (const p of people) {
      if (p.state !== 'walk') continue;
      p.hopT -= dt;
      if (p.hopT > 0) continue;
      p.hopT = 0.3;
      if (p.walkRow > 0) {
        p.walkRow -= 1;
        const g = cellFeet(p.col, p.walkRow);
        walkTo(p, g.x, g.y, 0.25);
      } else if (!p.gone) {
        p.gone = true;
        const g = stripFeet(p.col, 0);
        walkTo(p, g.x, g.y, 0.3);
      }
    }
  }
  if (game.phaseT >= GREEN_T) beginTally();
}

function beginTally() {
  game.mode = 'tally';
  game.phaseT = 0;
  game.greenWalk = false;
  const s = street();
  const stars = starsFor(game.levelScore, s);
  const across = acrossWeight();
  game.results[game.level] = { score: game.levelScore, stars, across };
  game.score += game.levelScore;
  const prev = saved.stars[game.level] || 0;
  if (stars > prev) saved.stars[game.level] = stars;
  saved.reached = Math.max(saved.reached || 0, Math.min(LEVELS_N - 1, game.level + 1));
  save();
  ui.bannerNum.textContent = `${1 + across} × ${Math.ceil(game.closedRed || 0)} s · ${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}`;
  ui.bannerName.textContent = `+${game.levelScore}`;
  ui.banner.hidden = false;
  sfx(stars ? 'arrive' : 'bump', { rate: 1.2, gain: 0.6 });
}

function updateTally(dt) {
  game.phaseT += dt;
  if (game.phaseT < TALLY_T) return;
  ui.banner.hidden = true;
  if (game.level + 1 >= LEVELS_N) endRun();
  else startLevel(game.level + 1);
}

function startLevel(idx) {
  setupLevel(idx);
  game.mode = 'play';
  game.closedRed = 0;
  showBanner();
  sfx('start', { gain: 0.6 });
  syncHud();
}

function startGame(idx = 0) {
  game.paused = false;
  game.score = 0;
  game.results = [];
  game.grace = 0;
  game.assist = saved.assist == null ? 0.4 : Math.min(0.7, 0.6 * saved.assist);
  ui.start.hidden = true;
  ui.over.hidden = true;
  ui.paused.hidden = true;
  ui.hud.hidden = false;
  startLevel(idx);
  startMusic();
}

let stopMusic = null;
function startMusic() {
  if (!stopMusic) stopMusic = sound.loop('music', { gain: 0.22 });
}
function endMusic() {
  if (stopMusic) stopMusic();
  stopMusic = null;
}

function endRun() {
  game.mode = 'over';
  saved.best = Math.max(saved.best || 0, game.score);
  saved.assist = game.assist;
  save();
  endMusic();
  sfx('over', { gain: 0.7 });
  const stars = game.results.reduce((s, r) => s + (r ? r.stars : 0), 0);
  ui.finalScore.textContent = String(game.score);
  ui.finalDetail.textContent = `${stars} of ${LEVELS_N * 3} stars · Best: ${saved.best}`;
  ui.hud.hidden = true;
  ui.banner.hidden = true;
  ui.over.hidden = false;
}

function showStart() {
  game.mode = 'title';
  game.paused = false;
  setupLevel(2);
  ui.over.hidden = true;
  ui.paused.hidden = true;
  ui.hud.hidden = true;
  ui.banner.hidden = true;
  ui.start.hidden = false;
  const stars = saved.stars.reduce((s, n) => s + (n || 0), 0);
  ui.best.textContent = saved.best ? `Best ${saved.best} · ${stars} ★` : '';
  ui.best.hidden = !saved.best;
}

function showBanner() {
  ui.bannerNum.textContent = `Level ${game.level + 1} of ${LEVELS_N}`;
  ui.bannerName.textContent = street().name;
  ui.banner.hidden = false;
  clearTimeout(showBanner.t);
  showBanner.t = setTimeout(() => game.mode === 'play' && (ui.banner.hidden = true), 1600);
}

// ---------- Update ----------

function update(dt) {
  game.time += dt;
  if (game.paused) return;
  if (game.shake > 0) game.shake -= dt;
  if (game.grace > 0) game.grace -= dt;
  updateTraffic(dt);
  updatePlayer(dt);
  updatePeople(dt);
  for (const pp of popups) pp.t += dt;
  popups = popups.filter((pp) => pp.t < (pp.long ? 1.8 : 1.1));
  if (game.mode === 'green') return updateGreen(dt);
  if (game.mode === 'tally') return updateTally(dt);
  if (game.mode !== 'play') return;
  updateCopiers(dt);
  checkHit();
  // The phone call.
  game.callIn -= dt;
  if (game.callIn <= 0 && !player.down) {
    game.callIn = rand(6, 10);
    popups.push({ x: colX(player.col), y: rowY(player.row) - 12, text: pick(CALL), t: 0, color: '#ffffff', big: false, long: true, follow: true });
  }
  game.red -= dt;
  const whole = Math.ceil(game.red);
  if (game.red <= 5 && game.red > 0 && whole !== game.lastTick) {
    game.lastTick = whole;
    sfx('tick', { gain: 0.6 });
  }
  if (game.red <= 0) {
    game.red = 0;
    game.closedRed = 0;
    game.levelScore = 0;
    beginGreen();
    return;
  }
  // Across, and nobody on the way or about to set off: the level closes.
  if (player.row === 0 && player.standT >= PROVE_T) {
    const pending = people.some((p) => p.kind !== 'crowd' && (p.state === 'cross' || (p.state === 'wait' && proven.has(nextStrip(p.row)))));
    if (!pending) {
      game.closedRed = Math.ceil(game.red - 1e-9);
      closeLevel();
    }
  }
  if (input.queued && player.tw >= 1) {
    const d = input.queued;
    input.queued = null;
    doHop(d);
  }
}

function updatePeople(dt) {
  for (const p of people) {
    p.t += dt;
    if (p.tw < 1) {
      p.tw = Math.min(1, p.tw + dt / p.twDur);
      p.vx = p.fx + (p.tx - p.fx) * p.tw;
      p.vy = p.fy + (p.ty - p.fy) * p.tw;
    }
  }
}

// Hops from input go through here: one can be queued during a hop.
function doHop(dir) {
  if (player.tw < 1) {
    input.queued = dir;
    return;
  }
  hop(dir);
}

// ---------- Input ----------

const input = { id: null, x: 0, y: 0, queued: null, swallow: false };
const canvas = document.getElementById('street');

canvas.addEventListener('pointerdown', (e) => {
  if (input.id !== null) return; // a second finger does nothing
  if (game.paused) {
    resume();
    input.swallow = true;
  }
  input.id = e.pointerId;
  input.x = e.clientX;
  input.y = e.clientY;
  try {
    canvas.setPointerCapture(e.pointerId);
  } catch (err) {
    // Synthetic pointers can't be captured.
  }
});

function endPointer(e, cancelled) {
  if (e.pointerId !== input.id) return;
  input.id = null;
  if (input.swallow) {
    input.swallow = false;
    return;
  }
  if (cancelled || game.mode !== 'play') return;
  const dx = e.clientX - input.x;
  const dy = e.clientY - input.y;
  if (Math.hypot(dx, dy) >= 18) {
    if (Math.abs(dy) >= Math.abs(dx)) doHop(dy > 0 ? 'down' : 'up'); // sideways swipes do nothing
  } else doHop('up');
}
canvas.addEventListener('pointerup', (e) => endPointer(e, false));
canvas.addEventListener('pointercancel', (e) => endPointer(e, true));
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

const KEYS = { ArrowUp: 'up', ArrowDown: 'down', w: 'up', s: 'down', W: 'up', S: 'down', ' ': 'up' };
let lastKey = 0;
window.addEventListener('keydown', (e) => {
  const dir = KEYS[e.key];
  if (game.paused && (dir || e.key === 'Enter')) {
    e.preventDefault();
    resume();
    return;
  }
  if (!dir || game.mode !== 'play') return;
  if (e.target instanceof Element && e.target.closest('button') && e.key === ' ') return;
  e.preventDefault();
  const now = performance.now();
  if (e.repeat && now - lastKey < 150) return;
  lastKey = now;
  doHop(dir);
});

// ---------- Traffic ----------

function speedMul() {
  return 1 - 0.25 * game.assist;
}

function frameOf(name) {
  return FRAMES[name];
}

// A vehicle's front, measured along its lane from where it enters (s grows as it drives).
function vxOf(v) {
  return v.dir === 1 ? v.s - v.w - ENTRY : PLAY_W + ENTRY - v.s;
}
function boxOf(v) {
  const x = vxOf(v);
  return [x + v.w * SHRINK, x + v.w * (1 - SHRINK)];
}
const LANE_LEN = PLAY_W + 2 * ENTRY;

function spawnVehicle(ln, name, { siren = false } = {}) {
  const [, , w, h] = frameOf(name);
  const v = { id: nextId++, lane: ln.row, dir: ln.dir, name, w, h, s: 0, speed: ln.speed * (siren ? 2.5 : rand(0.92, 1.08)), v: 0, siren, wait: 0, near: new Set(), passed: new Set() };
  v.v = v.speed;
  vehicles.push(v);
  return v;
}

function updateLaneCycle(ln, dt, frozen) {
  if (!frozen) ln.t -= dt;
  if (ln.t <= 0) {
    if (ln.phase === 'on') {
      ln.phase = 'off';
      ln.t = rand(ln.off[0], ln.off[1]) * (1 + 0.4 * game.assist);
    } else {
      ln.phase = 'on';
      ln.t = rand(ln.on[0], ln.on[1]);
      ln.spawnIn = 0;
    }
  }
  ln.light = ln.phase === 'on' ? 'green' : 'red';
  if (ln.holdCol != null || game.mode === 'green' || game.mode === 'tally') ln.light = 'hold';
  if (game.siren && game.siren.lane === ln.row) ln.light = 'siren';
}

// Where a vehicle's front must stop to keep clear of a column (in s along its lane).
function stopLine(v, col) {
  const x0 = colX(col) - CW / 2 - 1;
  const x1 = colX(col) + CW / 2 + 1;
  return v.dir === 1 ? x0 + ENTRY : PLAY_W + ENTRY - x1;
}

// The furthest a vehicle's front may go this frame: before a copier crossing its lane (cars always
// brake for them), before a column its lane's light holds, and, on the green light, before the
// street.
function stopLineS(v) {
  let lim = Infinity;
  const stopAt = (sNear) => {
    if (v.s <= sNear + 0.5) lim = Math.min(lim, sNear);
  };
  if (game.mode === 'green' || game.mode === 'tally') stopAt(ENTRY - 2);
  const ln = laneAt(v.lane);
  if (ln && ln.holdCol != null) stopAt(stopLine(v, ln.holdCol));
  for (const p of people) {
    if (p.state === 'cross' && p.row === v.lane) stopAt(stopLine(v, p.col));
    if (p.state === 'walk' && p.walkRow === v.lane) stopAt(stopLine(v, p.col));
  }
  if (player.auto && player.row === v.lane) stopAt(stopLine(v, player.col));
  return lim;
}

function updateTraffic(dt, quiet = false) {
  const mul = speedMul();
  for (const ln of layout.lanes) {
    updateLaneCycle(ln, dt, quiet); // filling the road at the start keeps the lanes' staggered phases
    if (ln.phase === 'on' && !(game.siren && game.siren.lane === ln.row)) {
      ln.spawnIn -= dt;
      if (ln.spawnIn <= 0) {
        // Room at the entry?
        const last = vehicles.filter((v) => v.lane === ln.row && !v.siren).reduce((m, v) => (v.s < m.s ? v : m), { s: Infinity });
        const name = pick(ln.set);
        const [, , w] = frameOf(name);
        const gap = rand(ln.gap[0], ln.gap[1]);
        if (last.s === Infinity || last.s - last.w > gap) {
          spawnVehicle(ln, name);
          ln.spawnIn = 0.2;
        } else ln.spawnIn = 0.1;
        void w;
      }
    }
  }
  // Sirens.
  if (layout.s.sirens && !quiet && game.mode === 'play') {
    if (game.siren) {
      game.siren.t -= dt;
      if (game.siren.t <= 0) {
        const ln = laneAt(game.siren.lane);
        spawnVehicle(ln, game.siren.name, { siren: true });
        game.siren = null;
        game.sirenIn = rand(9, 14);
      }
    } else {
      game.sirenIn -= dt;
      if (game.sirenIn <= 0) {
        const ln = pick(layout.lanes);
        game.siren = { lane: ln.row, t: 2.5, name: pick(SIRENS) };
        sfx('siren', { gain: 0.5 });
      }
    }
  }
  // Move: each lane front to back, keeping a gap behind the one ahead.
  const byLane = new Map();
  for (const v of vehicles) {
    if (!byLane.has(v.lane)) byLane.set(v.lane, []);
    byLane.get(v.lane).push(v);
  }
  for (const list of byLane.values()) {
    list.sort((a, b) => b.s - a.s);
    let aheadBack = Infinity;
    for (const v of list) {
      const want = v.speed * mul;
      v.v = Math.min(want, v.v + want * 3 * dt);
      let limit = stopLineS(v);
      if (!v.siren) limit = Math.min(limit, aheadBack - 3);
      let ns = v.s + v.v * dt;
      if (ns > limit) {
        ns = Math.max(v.s, limit);
        v.v = Math.max(0, (ns - v.s) / Math.max(dt, 1e-6));
      }
      v.s = ns;
      if (!v.siren) aheadBack = v.s - v.w;
    }
  }
  vehicles = vehicles.filter((v) => v.s - v.w < LANE_LEN);
}

// ---------- Pause ----------

function pause() {
  if (game.mode !== 'play' && game.mode !== 'change') return;
  game.paused = true;
  input.queued = null;
  ui.paused.hidden = false;
}

function resume() {
  if (!game.paused) return;
  game.paused = false;
  game.grace = 0.5;
  ui.paused.hidden = true;
  sound.unlock();
}

// ---------- Drawing ----------

const ctx = canvas.getContext('2d');
const low = document.createElement('canvas');
const lctx = low.getContext('2d');
let scale = 1;
let dpr = 1;
let LW = PLAY_W; // the visible width, in art px
let LH = 300;
let originX = 0; // where world x = 0 lands on the low canvas
let originY = 0;
let offX = 0;
const TILE = new URLSearchParams(location.search).has('tile'); // device px from the screen's left edge to the street's
let insetTop = 0;
let insetBottom = 0;
const view = { scale: 1, person: 0, top: 0, bottom: 0 }; // for tests

const sheet = new Image();
sheet.src = 'img/vehicles.png';
const sprites = {}; // name -> canvas (and flipped / recoloured variants)

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function cut(name) {
  const [x, y, w, h] = FRAMES[name];
  const c = makeCanvas(w, h);
  c.getContext('2d').drawImage(sheet, x, y, w, h, 0, 0, w, h);
  return c;
}
function flip(src) {
  const c = makeCanvas(src.width, src.height);
  const g = c.getContext('2d');
  g.translate(src.width, 0);
  g.scale(-1, 1);
  g.drawImage(src, 0, 0);
  return c;
}
function recolor(src, map) {
  const c = makeCanvas(src.width, src.height);
  const g = c.getContext('2d');
  g.drawImage(src, 0, 0);
  const img = g.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    for (const [from, to] of map) {
      if (d[i] === from[0] && d[i + 1] === from[1] && d[i + 2] === from[2]) {
        if (to === 'grey') {
          const l = Math.round(0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2]);
          d[i] = d[i + 1] = d[i + 2] = Math.round(l * 0.75 + 40);
        } else {
          d[i] = to[0];
          d[i + 1] = to[1];
          d[i + 2] = to[2];
        }
        break;
      }
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}
function grey(src) {
  const c = makeCanvas(src.width, src.height);
  const g = c.getContext('2d');
  g.drawImage(src, 0, 0);
  const img = g.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const l = 0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2];
    d[i] = d[i + 1] = d[i + 2] = Math.round(l * 0.6 + 70);
  }
  g.putImageData(img, 0, 0);
  return c;
}

const MAN_SHIRT = [[255, 216, 61], [220, 156, 36]];
const WOMAN_SHIRT = [[90, 225, 124], [68, 178, 93]];
const POSES = ['', '_walk1', '_walk2', '_fall', '_down', '_point'];
const PERSON_KEYS = {};

function buildSprites() {
  const vnames = Object.keys(FRAMES).filter((n) => !n.startsWith('man') && !n.startsWith('woman'));
  for (const n of vnames) {
    const c = cut(n);
    sprites[n] = [c, flip(c)];
  }
  // People: for each shirt (and hi-vis, and grey), each pose, facing both ways.
  const variants = SHIRTS.map((s, i) => ['s' + i, s]).concat([['suit', SUIT], ['grandpa', GRANDPA]]);
  for (const sex of ['man', 'woman']) {
    for (const pose of POSES) {
      const base = cut(sex + pose);
      const shirtFrom = sex === 'man' ? MAN_SHIRT : WOMAN_SHIRT;
      for (const [key, shirt] of variants) {
        const map = [
          [shirtFrom[0], shirt[0]],
          [shirtFrom[1], shirt[1]],
        ];
        if (key === 'grandpa') map.push([[62, 71, 81], [214, 214, 220]]); // grey hair
        const c = recolor(base, map);
        sprites[`${sex}${pose}:${key}`] = [c, flip(c)];
      }
    }
  }
  PERSON_KEYS.ready = true;
}

function resize() {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(vw * dpr);
  canvas.height = Math.round(vh * dpr);
  readInsets();
  // Fit the play area's width and the tallest street, with room for the HUD above.
  const rows = layout ? layout.rows.length : 9;
  const need = rows * ROW + 2 * WAIT_H + 6;
  const hudRoom = 64 + insetTop; // CSS px above the street for the HUD
  scale = Math.min(vw / PLAY_W, (vh - hudRoom - 16 - insetBottom) / need);
  scale = Math.max(1, scale);
  // Only the street's 12 columns are shown (it's a portrait game): on a wide screen it sits in the
  // middle, with plain background either side.
  // The landing tile's picture (?tile) shows the street wide, filling the picture.
  LW = TILE ? Math.ceil(vw / scale) : PLAY_W;
  LH = Math.ceil(vh / scale);
  low.width = LW;
  low.height = LH;
  originX = TILE ? Math.floor((LW - PLAY_W) / 2) : 0;
  offX = TILE ? 0 : Math.round(((vw - PLAY_W * scale) / 2) * dpr);
  ui.hud.style.maxWidth = `${Math.max(240, Math.round(PLAY_W * scale) - 96)}px`;
  // The street sits in the space under the HUD, centred.
  const room = vh / scale - hudRoom / scale;
  originY = Math.round(hudRoom / scale + Math.max(0, (room - need) / 2));
  view.scale = scale;
  view.width = PLAY_W * scale;
  view.left = offX / dpr;
  view.person = 15 * scale;
  view.top = originY * scale;
  view.bottom = (originY + need) * scale;
}

const insetProbe = document.createElement('div');
insetProbe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) 0 env(safe-area-inset-bottom) 0';
document.body.appendChild(insetProbe);
function readInsets() {
  const cs = getComputedStyle(insetProbe);
  insetTop = parseFloat(cs.paddingTop) || 0;
  insetBottom = parseFloat(cs.paddingBottom) || 0;
}

function px(x) {
  return Math.round(x + originX);
}
function py(y) {
  return Math.round(y + originY);
}

function drawBackground() {
  const pal = street().pal;
  const g = lctx;
  g.fillStyle = pal.sky;
  g.fillRect(0, 0, LW, LH);
  const yTop = py(rowY(0)) - WAIT_H; // top of the top wait strip
  // Buildings along the far side.
  const buildRng = mulberry(game.level * 97 + 13);
  let x = -((originX % 40) + 40);
  while (x < LW) {
    const w = 18 + Math.floor(buildRng() * 22);
    const h = 18 + Math.floor(buildRng() * 34);
    const col = pal.build[Math.floor(buildRng() * pal.build.length)];
    g.fillStyle = col;
    g.fillRect(x, yTop - h, w - 2, h);
    // Windows.
    g.fillStyle = pal.dark > 0.3 ? (buildRng() < 0.5 ? '#ffe9a0' : '#3b3f66') : 'rgba(255,255,255,0.45)';
    for (let wy = yTop - h + 4; wy < yTop - 6; wy += 7) {
      for (let wx = x + 3; wx < x + w - 5; wx += 6) {
        if (pal.dark > 0.3) g.fillStyle = buildRng() < 0.55 ? '#ffe39a' : '#2c3157';
        g.fillRect(wx, wy, 3, 3);
      }
    }
    x += w;
  }
  // Top sidewalk (wait strip + kerb row).
  g.fillStyle = pal.walk;
  g.fillRect(0, yTop, LW, WAIT_H + ROW);
  g.fillStyle = pal.edge;
  g.fillRect(0, py(rowY(1)) - 2, LW, 2);
  // Paving lines.
  g.fillStyle = 'rgba(0,0,0,0.06)';
  for (let c = -20; c < LW; c += CW) g.fillRect(c + (originX % CW), yTop, 1, WAIT_H + ROW - 2);
  // Rows.
  layout.rows.forEach((kind, r) => {
    const y = py(rowY(r));
    if (kind === 'L') {
      g.fillStyle = pal.road;
      g.fillRect(0, y, LW, ROW);
    } else if (kind === 'M') {
      g.fillStyle = pal.road;
      g.fillRect(0, y, LW, ROW);
      g.fillStyle = pal.edge;
      g.fillRect(0, y + 3, LW, ROW - 6);
      g.fillStyle = pal.verge;
      g.fillRect(0, y + 5, LW, ROW - 10);
    }
  });
  // Lane markings between lanes.
  for (let r = 1; r < layout.bottom; r++) {
    if (!isLane(r) || !isLane(r + 1)) continue;
    const y = py(rowY(r + 1));
    const a = laneAt(r);
    const b = laneAt(r + 1);
    if (a.dir !== b.dir) {
      g.fillStyle = pal.mid;
      g.fillRect(0, y - 1, LW, 1);
      g.fillRect(0, y + 1, LW, 1);
    } else {
      g.fillStyle = pal.line;
      const off = (originX % 16) - 16;
      for (let dx = off; dx < LW; dx += 16) g.fillRect(dx, y, 8, 1);
    }
  }
  // Bottom sidewalk.
  const yb = py(rowY(layout.bottom));
  g.fillStyle = pal.walk;
  g.fillRect(0, yb, LW, LH - yb);
  g.fillStyle = pal.edge;
  g.fillRect(0, yb, LW, 2);
  g.fillStyle = 'rgba(0,0,0,0.06)';
  for (let c = -20; c < LW; c += CW) g.fillRect(c + (originX % CW), yb + 2, 1, ROW + WAIT_H);
  g.fillStyle = pal.verge;
  g.fillRect(0, yb + ROW + WAIT_H + 2, LW, LH);
  // Trees and hedges along the verge, the same for a street whatever the screen.
  const treeRng = mulberry(game.level * 31 + 5);
  const vy = yb + ROW + WAIT_H + 2;
  const leaf = shade(pal.verge, -0.22);
  const leafLight = shade(pal.verge, 0.12);
  for (let tx = (originX % 26) - 26; tx < LW + 26; tx += 26) {
    const kind = treeRng();
    const ox = Math.floor(treeRng() * 8);
    if (kind < 0.55) {
      // A round tree.
      g.fillStyle = '#7a5a3a';
      g.fillRect(tx + ox + 6, vy + 12, 2, 8);
      g.fillStyle = leaf;
      g.fillRect(tx + ox + 1, vy + 3, 12, 10);
      g.fillRect(tx + ox + 3, vy + 1, 8, 14);
      g.fillStyle = leafLight;
      g.fillRect(tx + ox + 3, vy + 3, 4, 3);
    } else {
      g.fillStyle = leaf;
      g.fillRect(tx + ox, vy + 14, 16, 6);
      g.fillRect(tx + ox + 2, vy + 12, 12, 2);
    }
  }
  // Lamp posts on the sidewalks, at the play area's edges and beyond.
  for (let lx = -36; lx < PLAY_W + 72; lx += 72) {
    lamp(g, px(lx), yTop + 2, pal);
    lamp(g, px(lx), yb + ROW + WAIT_H - 24, pal);
  }
  // The play area's edges: faint posts on the kerbs.
  g.fillStyle = 'rgba(0,0,0,0.12)';
  g.fillRect(px(-1), yTop, 1, WAIT_H + ROW - 2);
  g.fillRect(px(PLAY_W), yTop, 1, WAIT_H + ROW - 2);
  g.fillRect(px(-1), yb + 2, 1, ROW + WAIT_H);
  g.fillRect(px(PLAY_W), yb + 2, 1, ROW + WAIT_H);
}

function lamp(g, x, yFoot, pal) {
  // A lamp post 24 px tall, its feet at yFoot + 24.
  if (x < -4 || x > LW + 4) return;
  g.fillStyle = '#5b6170';
  g.fillRect(x, yFoot, 1, 24);
  g.fillRect(x, yFoot, 5, 1);
  g.fillStyle = pal.dark > 0.3 ? '#ffe9a0' : '#e8ecf2';
  g.fillRect(x + 3, yFoot + 1, 3, 2);
}

function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const f = (c) => Math.max(0, Math.min(255, Math.round(k < 0 ? c * (1 + k) : c + (255 - c) * k)));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

function mulberry(a) {
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function drawVehicle(v) {
  const spr = sprites[v.name];
  if (!spr) return;
  const img = v.dir === 1 ? spr[0] : spr[1];
  const x = px(vxOf(v));
  const y = py(rowY(v.lane) + ROW - 2 - v.h);
  lctx.drawImage(img, x, y);
  if (v.siren) {
    const on = Math.floor(game.time * 8) % 2 === 0;
    lctx.fillStyle = on ? '#ff3b3b' : '#3b8bff';
    lctx.fillRect(x + Math.floor(v.w / 2) - 2, y - 2, 4, 2);
  }
  // Headlights at night.
  if (street().pal.dark > 0.3) {
    lctx.fillStyle = '#fff3b0';
    lctx.fillRect(v.dir === 1 ? x + v.w - 1 : x, y + v.h - 8, 2, 2);
  }
}

function personSprite(p, isPlayer) {
  const sex = p.woman ? 'woman' : 'man';
  let pose = '';
  const moving = isPlayer ? player.tw < 1 : p.tw < 1;
  if (isPlayer && player.down > 0) pose = player.down > DOWN_T - 0.4 ? '_fall' : '_down';
  else if (moving) pose = p.walkFrame ? '_walk1' : '_walk2';
  else if (!isPlayer && p.kind !== 'crowd' && p.state === 'across' && Math.floor(p.t * 3) % 2 === 0) pose = '_point';
  else if (!isPlayer && p.kind !== 'crowd' && p.state === 'wait' && p.seeT > 0 && p.seeT < SEE_DELAY) pose = '_point';
  const key = isPlayer ? 'suit' : p.kind === 'grandpa' ? 'grandpa' : `s${p.shirt}`;
  return sprites[`${sex}${pose}:${key}`];
}

function drawPerson(p, isPlayer = false) {
  const spr = personSprite(p, isPlayer);
  if (!spr) return;
  const tw = isPlayer ? player.tw : p.tw;
  const img = p.face === 1 ? spr[0] : spr[1];
  const hopY = tw < 1 ? Math.sin(Math.PI * tw) * 2 : 0;
  let x = px(p.vx - img.width / 2);
  if (isPlayer && player.nudge > 0) x += Math.round(Math.sin(player.nudge * 60));
  const y = py(p.vy - img.height - hopY);
  lctx.drawImage(img, x, y);
  if (isPlayer && !player.down) {
    // The phone at his ear.
    lctx.fillStyle = '#1b1d24';
    lctx.fillRect(x + (p.face === 1 ? img.width - 3 : 1), y + 2, 2, 4);
  }
  if (!isPlayer && p.kind === 'grandpa' && !(p.tw < 1)) {
    // A cane.
    lctx.fillStyle = '#7a5a3a';
    lctx.fillRect(x + img.width, y + 8, 1, 7);
  }
  // A copier still waiting watches you: a small eye above their head.
  if (!isPlayer && p.kind !== 'crowd' && p.state === 'wait') {
    const ex = x + Math.floor(img.width / 2) - 2;
    const ey = y - 5 + Math.round(Math.sin(game.time * 3 + p.id) * 0.6);
    const ready = proven.has(nextStrip(p.row));
    lctx.fillStyle = ready ? '#ffd23f' : 'rgba(255,255,255,0.92)';
    lctx.fillRect(ex, ey + 1, 5, 1);
    lctx.fillRect(ex + 1, ey, 3, 3);
    lctx.fillStyle = '#20232b';
    lctx.fillRect(ex + 2, ey + 1, 1, 1);
  }
}

function drawLights() {
  // A light at each lane's entry: green while its platoon comes, red in a lull or a hold.
  for (const ln of layout.lanes) {
    const y = py(rowY(ln.row) + 3);
    const x = ln.dir === 1 ? 1 : LW - 5; // at the screen's edge, where the lane's traffic comes in
    lctx.fillStyle = '#20232b';
    lctx.fillRect(x, y, 4, 9);
    if (ln.light === 'siren') {
      const on = Math.floor(game.time * 8) % 2 === 0;
      lctx.fillStyle = on ? '#ff3b3b' : '#3b8bff';
      lctx.fillRect(x + 1, y + 1, 2, 7);
      lctx.fillStyle = on ? 'rgba(255,59,59,0.35)' : 'rgba(59,139,255,0.35)';
      const ex = ln.dir === 1 ? 0 : LW - 6;
      lctx.fillRect(ex, py(rowY(ln.row)), 6, ROW);
    } else {
      const red = ln.light === 'red' || ln.light === 'hold';
      lctx.fillStyle = red ? '#ff4b4b' : '#3a1515';
      lctx.fillRect(x + 1, y + 1, 2, 3);
      lctx.fillStyle = ln.light === 'green' ? '#5ae17c' : '#14301c';
      lctx.fillRect(x + 1, y + 5, 2, 3);
    }
  }
  // The pedestrian signal on both kerbs, beside the player's column: the red man, then the green.
  const green = game.mode === 'green' || game.mode === 'tally';
  for (const r of [0, layout.bottom]) {
    const x = px(colX(PCOL) + CW / 2 + 3);
    const y = r === 0 ? py(rowY(0)) - 12 : py(rowY(r) + ROW) + 1;
    lctx.fillStyle = '#c8e0ff';
    lctx.fillRect(x + 3, y + 8, 1, 6);
    lctx.fillStyle = '#20232b';
    lctx.fillRect(x, y, 7, 9);
    lctx.fillStyle = green ? '#5ae17c' : '#ff4b4b';
    if (green) {
      // Walking.
      lctx.fillRect(x + 3, y + 1, 1, 1);
      lctx.fillRect(x + 2, y + 2, 3, 3);
      lctx.fillRect(x + 2, y + 5, 1, 3);
      lctx.fillRect(x + 4, y + 5, 1, 2);
      lctx.fillRect(x + 5, y + 7, 1, 1);
    } else {
      // Standing.
      lctx.fillRect(x + 3, y + 1, 1, 1);
      lctx.fillRect(x + 2, y + 2, 3, 3);
      lctx.fillRect(x + 2, y + 5, 1, 3);
      lctx.fillRect(x + 4, y + 5, 1, 3);
    }
  }
}

function draw() {
  if (!layout || !PERSON_KEYS.ready) return;
  const pal = street().pal;
  drawBackground();
  // Everyone is drawn by where their feet are: the top strip, then row by row (vehicles, then
  // people), then the bottom strip, so nearer things cover farther ones.
  const band = (y) => (y < WAIT_H ? -1 : y > rowY(layout.bottom) + ROW ? layout.bottom + 1 : Math.floor((y - WAIT_H - 1) / ROW));
  const byBand = new Map();
  for (const p of people) {
    const b = band(p.vy);
    if (!byBand.has(b)) byBand.set(b, []);
    byBand.get(b).push(p);
  }
  const drawBand = (b) => {
    const list = byBand.get(b) || [];
    list.sort((a, c) => a.vy - c.vy).forEach((p) => drawPerson(p));
    if (band(player.vy) === b) drawPerson(player, true);
  };
  drawBand(-1);
  for (let r = 0; r <= layout.bottom; r++) {
    for (const v of vehicles) if (v.lane === r) drawVehicle(v);
    drawBand(r);
  }
  drawLights();
  drawBand(layout.bottom + 1);
  if (pal.dark > 0) {
    lctx.fillStyle = `rgba(10,12,40,${pal.dark * 0.5})`;
    lctx.fillRect(0, 0, LW, py(rowY(0)) - WAIT_H - 1);
  }
  if (game.paused) {
    lctx.fillStyle = 'rgba(20,22,31,0.45)';
    lctx.fillRect(0, 0, LW, LH);
  }
  // Up to the screen.
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = false;
  let sx = 0;
  let sy = 0;
  if (game.shake > 0) {
    sx = Math.round((rnd() - 0.5) * 4 * dpr);
    sy = Math.round((rnd() - 0.5) * 4 * dpr);
  }
  if (offX > 0) {
    ctx.fillStyle = '#2b2f3a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.drawImage(low, 0, 0, LW, LH, offX + sx, sy, LW * scale * dpr, LH * scale * dpr);
  drawText();
}

function drawText() {
  const k = scale * dpr;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  const left = offX + 6 * dpr;
  const right = offX + PLAY_W * k - 6 * dpr;
  for (const pp of popups) {
    const life = pp.long ? 1.8 : 1.1;
    const a = Math.min(1, (life - pp.t) * 2.5);
    const wx = pp.follow ? player.vx : pp.x;
    const wy = pp.follow ? player.vy - 22 : pp.y;
    ctx.font = `800 ${Math.round((pp.big ? 20 : 12) * dpr)}px system-ui, sans-serif`;
    const w = ctx.measureText(pp.text).width;
    const x = Math.max(left + w / 2, Math.min(right - w / 2, (wx + originX) * k + offX));
    const y = (wy + originY - (pp.long ? 0 : pp.t * 10)) * k;
    ctx.globalAlpha = Math.max(0, a);
    ctx.lineWidth = 4 * dpr;
    ctx.strokeStyle = 'rgba(20,22,31,0.75)';
    ctx.strokeText(pp.text, x, y);
    ctx.fillStyle = pp.color;
    ctx.fillText(pp.text, x, y);
  }
  ctx.globalAlpha = 1;
  // The level's score so far, shown at the far kerb before it is earned: × the people across
  // (and on their way), times the seconds of red left.
  if (game.mode === 'play' && street().copiers > 0) {
    const m = 1 + acrossWeight() + onTheWayWeight();
    const secs = Math.max(0, Math.ceil(game.red));
    const text = `×${m} · ${secs} s = ${m * secs}`;
    const yk = rowY(0) - WAIT_H - 10;
    ctx.font = `800 ${Math.round(14 * dpr)}px system-ui, sans-serif`;
    const w = ctx.measureText(text).width + 16 * dpr;
    const h = 22 * dpr;
    const x = offX + (PLAY_W * k) / 2;
    const y = (yk + originY) * k;
    ctx.fillStyle = 'rgba(20,22,31,0.62)';
    roundRect(x - w / 2, y - h / 2, w, h, h / 2);
    ctx.fill();
    ctx.fillStyle = '#ffd23f';
    ctx.fillText(text, x, y + dpr);
    drawn.payout = text;
  } else drawn.payout = null;
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ---------- HUD ----------

const $ = (sel) => document.querySelector(sel);
const ui = {
  hud: $('[data-hud]'),
  clock: $('[data-clock]'),
  score: $('[data-score]'),
  streetName: $('[data-street-name]'),
  quotaFill: $('[data-quota-fill]'),
  banner: $('[data-banner]'),
  bannerNum: $('[data-banner-num]'),
  bannerName: $('[data-banner-name]'),
  start: $('[data-screen="start"]'),
  paused: $('[data-screen="paused"]'),
  over: $('[data-screen="over"]'),
  play: $('[data-play]'),
  resume: $('[data-resume]'),
  again: $('[data-again]'),
  best: $('[data-best]'),
  finalScore: $('[data-final-score]'),
  finalDetail: $('[data-final-detail]'),
  mute: $('[data-mute]'),
};
const drawn = { payout: null };

let hudCache = '';
function syncHud() {
  const c = Math.max(0, Math.ceil(game.red));
  const key = `${c}|${game.score}|${game.level}|${game.mode}`;
  if (key === hudCache) return;
  hudCache = key;
  const green = game.mode === 'green' || game.mode === 'tally';
  ui.clock.textContent = green ? 'GO' : String(c);
  ui.clock.classList.toggle('low', game.red <= 5 && game.mode === 'play');
  ui.clock.classList.toggle('green', green);
  ui.score.textContent = String(game.score);
  ui.streetName.textContent = `${game.level + 1} · ${street().name}`;
  ui.quotaFill.style.width = `${((game.level + (green ? 1 : 0)) / LEVELS_N) * 100}%`;
}

// ---------- Loop ----------

let last = 0;
let running = true;
let manual = false; // tests drive the simulation with step(); frames only draw
function frame(now) {
  if (!running) return;
  const dt = Math.min(0.05, (now - last) / 1000 || 0);
  last = now;
  if (!manual) update(dt);
  draw();
  syncHud();
  requestAnimationFrame(frame);
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    pause();
    running = false;
    sound.suspend();
  } else if (!running) {
    running = true;
    last = performance.now();
    requestAnimationFrame(frame);
  }
});

ui.play.addEventListener('click', () => startGame(0));
ui.again.addEventListener('click', showStart);
ui.resume.addEventListener('click', (e) => {
  e.stopPropagation();
  resume();
});

function syncMute() {
  ui.mute.setAttribute('aria-pressed', String(sound.muted));
  ui.mute.setAttribute('aria-label', sound.muted ? 'Unmute' : 'Mute');
}
ui.mute.addEventListener('click', () => {
  sound.muted = !sound.muted;
  syncMute();
});
syncMute();

window.addEventListener('resize', resize);

sheet.decode().then(
  () => {
    buildSprites();
    showStart();
    resize();
    if (TILE) {
      // For the landing page's tile picture: just the street.
      ui.start.hidden = true;
      document.querySelector('.shell-back')?.setAttribute('hidden', '');
      ui.mute.hidden = true;
    }
    last = performance.now();
    requestAnimationFrame(frame);
    window.__walkOnRed = {
      game,
      player,
      saved,
      heard,
      drawn,
      view,
      LEVELS,
      PROVE_T,
      HOLD_AFTER,
      startGame,
      startLevel,
      showStart,
      step: update,
      move: doHop,
      pause,
      resume,
      spawnVehicle: (row, name = 'sedan', s) => {
        const v = spawnVehicle(laneAt(row), name);
        if (s != null) v.s = s;
        return v;
      },
      setupLevel,
      layout: () => layout,
      people: () => people,
      copiers: () => people.filter((p) => p.kind !== 'crowd'),
      vehicles: () => vehicles,
      proven: () => proven,
      nextStrip,
      laneClear,
      // Put the player on a row, standing (for tests).
      put: (row) => {
        player.row = row;
        if (isSafe(row)) player.lastSafe = row;
        player.standT = 0;
        player.tw = 1;
        const f = cellFeet(player.col, row);
        player.vx = player.fx = f.x;
        player.vy = player.fy = f.y;
      },
      clearTraffic: () => {
        vehicles = [];
        for (const ln of layout.lanes) {
          ln.phase = 'off';
          ln.t = 999;
        }
        game.sirenIn = 999;
        game.siren = null;
      },
      seed: (n) => {
        seed = n | 0;
      },
      colX,
      xOf: vxOf,
      ENTRY,
      PLAY_W,
      PCOL,
      set manual(v) {
        manual = v;
      },
    };
  },
  () => {}
);

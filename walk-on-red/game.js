// Walk on Red: he really needs the loo, the porta-potty is across the street, and the walk light
// is red. So he goes now. Make it across before the light turns green, and the sooner the better;
// the people waiting see him go and start copying him.
//
// The rules (specs/walk-on-red.md):
//  - The street is a grid of rows: the near kerb at the bottom, lanes, sometimes a median, the far
//    kerb at the top. You hop one cell: forward (a tap), back or sideways (a swipe).
//  - The walk light counts down. Each lane's car light is green while it does, turns yellow near the
//    end and then red; the cars stop before the zebra crossing, and once it is clear the walk light
//    turns green. Cars obey their lights.
//  - Copiers walk on their own: they set off once you are a couple of lanes out, hop up their own
//    column at a steady pace, never get ahead of you, look before stepping off safe ground, and
//    only hesitate briefly in a lane, so in heavy traffic they can be hit.
//  - Reaching the far kerb before the light turns green scores the seconds left × (1 + copiers
//    across). If the light turns green first, the level scores 0 and you try it again.
//  - A car hitting you knocks you back to the last safe strip; a copier hit goes home, and their
//    share of the points with them. There are no lives; a run is eight levels.
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
    ambience: 'sounds/ambience.mp3',
    flush: 'sounds/flush.mp3',
    cheer: 'sounds/arrive.mp3', // the chime as he gets in, higher than any copier's
  },
});
const heard = []; // the sounds played, with their pitch, for tests
function sfx(name, opts) {
  heard.push({ name, rate: (opts && opts.rate) || 1 });
  if (heard.length > 200) heard.shift();
  sound.play(name, opts);
}

// ---------- Constants ----------

const CW = 12; // a cell's width in art px
const ROW = 22; // a row's height in art px
const MAX_ROWS = 8; // the tallest street: every street is scaled as if it were this tall
// The street is simulated 12 columns wide; only the zebra crossing in its middle is shown (with the
// sidewalks, and each lane's car light on the crossing's edge), the same on every screen.
const COLS = 12;
const PLAY_W = COLS * CW;
const PCOL = 5; // the player's starting column, and the porta-potty's
const CROSS_C0 = 1; // the zebra crossing's columns: nine, the view's whole width
const CROSS_C1 = 9;
const CROSS_W = (CROSS_C1 - CROSS_C0 + 1) * CW;
const ENTRY = 80; // vehicles enter this far beyond the play area's edge
const WAIT_H = 12; // the strip behind each kerb where people wait
const HOP_TWEEN = 0.12;
const PERSON_HALF = 2.5; // a person's hitbox is 5 art px wide
const SHRINK = 0.1; // vehicles' boxes are 20% narrower than their art (10% off each end)
const YELLOW_AT = 4.5; // seconds of red left when the car lights turn yellow
const RED_AT = 2; // … and red
const COP_START = 2; // a copier sets off once the player is this many rows out
const COP_STAGGER = 0.9; // … each one this much after the one before
const COP_HOP = 0.42; // a copier's pace, one row
const FF = 20; // once he's in the loo, the game runs this many times faster, through the green light's crossing
const DOOR_T = 1.8; // in the loo: the door shuts, a flush, a chime, then the fast-forward
const HONK_GAP = 10; // art px: a car this close to you, coming, honks
const COP_LOOK = 1.1; // on safe ground, a copier waits while a car would reach the next cell this soon
const COP_DARE = 2.2; // in the road, a copier waits at most this long for the next lane
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
  { name: 'Quiet Street', red: 30, copiers: 0, rows: ['K', 'L', 'L', 'K'], lanes: [L(1, 11, CARS, [50, 100], [2, 3], [5, 7]), L(1, 13, CARS, [50, 100], [2, 3], [5, 7])], pal: PAL.maple },
  { name: 'Both Ways', red: 26, copiers: 0, rows: ['K', 'L', 'L', 'K'], lanes: [L(-1, 20, CARS, [18, 46], [3, 6], [2, 4]), L(1, 22, CARS, [18, 46], [3, 6], [2, 4])], pal: PAL.maple },
  { name: 'Market Avenue', red: 28, copiers: 1, rows: ['K', 'L', 'L', 'M', 'L', 'L', 'K'], lanes: [L(-1, 16, CITY, [30, 70]), L(-1, 18, CITY, [30, 70]), L(1, 17, CITY, [30, 70]), L(1, 15, CITY, [30, 70])], pal: PAL.market },
  { name: 'Bus Lane', red: 28, copiers: 1, rows: ['K', 'L', 'L', 'M', 'L', 'L', 'K'], lanes: [L(-1, 19, HEAVY, [24, 60]), L(-1, 21, CITY, [24, 60]), L(1, 20, CITY, [24, 60]), L(1, 18, HEAVY, [24, 60])], pal: PAL.market },
  { name: 'Rush Hour', red: 30, copiers: 2, rows: ['K', 'L', 'L', 'L', 'M', 'L', 'L', 'K'], lanes: [L(-1, 20, CITY, [20, 54]), L(-1, 22, CARS, [20, 54]), L(-1, 19, HEAVY, [20, 54]), L(1, 21, CARS, [20, 54]), L(1, 23, CITY, [20, 54])], pal: PAL.school },
  { name: 'Siren Boulevard', red: 30, copiers: 2, sirens: true, rows: ['K', 'L', 'L', 'L', 'M', 'L', 'L', 'K'], lanes: [L(-1, 22, EVENING, [20, 52]), L(-1, 20, EVENING, [20, 52]), L(-1, 24, EVENING, [20, 52]), L(1, 21, EVENING, [20, 52]), L(1, 23, EVENING, [20, 52])], pal: PAL.evening },
  { name: 'Old Town', red: 32, copiers: 3, rows: ['K', 'L', 'L', 'L', 'M', 'L', 'L', 'K'], lanes: [L(-1, 22, CARS, [20, 54]), L(-1, 24, CARS, [20, 54]), L(-1, 21, CITY, [20, 54]), L(1, 23, CITY, [20, 54]), L(1, 25, CARS, [20, 54])], pal: PAL.school },
  { name: 'Downtown', red: 32, copiers: 3, sirens: true, rows: ['K', 'L', 'M', 'L', 'L', 'M', 'L', 'K'], lanes: [L(-1, 27, NIGHT, [14, 44]), L(-1, 25, NIGHT, [14, 44]), L(1, 26, NIGHT, [14, 44]), L(1, 28, NIGHT, [14, 44])], pal: PAL.night },
];


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
  mode: 'title', // title | play | finish | wait | green | tally | over
  paused: false,
  level: 0,
  red: 30, // seconds of red left on the walk light
  score: 0, // the run's total
  levelScore: 0,
  failed: false,
  results: [], // per level: { score, stars, across }
  assist: 0.4,
  grace: 0, // after a resume: input ignored and the player can't be hit
  time: 0,
  phaseT: 0,
  siren: null, // { lane, t, name } while warning
  sirenIn: 0,
  lastTick: 0,
  shake: 0,
  closedSecs: 0,
  tries: 0,
};

let layout = null; // the current level's rows, lanes and geometry
let vehicles = [];
let people = []; // copiers and the crowd
let popups = []; // floating text: { x, y, text, t, color, big }
let nextId = 1;
const player = { col: PCOL, row: 0, lastSafe: 0, face: 1, vx: 0, vy: 0, fx: 0, fy: 0, tw: 1, down: 0, walkFrame: 0, auto: false, autoT: 0, inside: false };

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
    if (kind === 'L') lanes.push({ row: r, ...s.lanes[li++], phase: 'on', t: 0, spawnIn: 0, light: 'green' });
  });
  return { s, rows, lanes, bottom: rows.length - 1 };
}

const isKerb = (r) => r === 0 || r === layout.bottom;
const isSafe = (r) => layout.rows[r] === 'K' || layout.rows[r] === 'M';
const isLane = (r) => layout.rows[r] === 'L';
const laneAt = (r) => layout.lanes.find((l) => l.row === r);
const colX = (c) => c * CW + CW / 2; // a column's centre, in world x (0 = the play area's left edge)

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

// The car lights, all lanes together: green while the walk light counts down, then yellow, then red.
function carLight() {
  if (game.mode === 'title') return 'green';
  if (game.mode === 'green' || game.mode === 'tally' || game.mode === 'wait') return 'red';
  return game.red > YELLOW_AT ? 'green' : game.red > RED_AT ? 'yellow' : 'red';
}

// ---------- People ----------

function makePerson(kind, col, row) {
  return {
    id: nextId++,
    kind, // copier | crowd
    col,
    row,
    state: 'wait', // wait | go | across | down | home | walk
    hopT: 0,
    dare: 0,
    startAt: Infinity,
    shirt: Math.floor(rnd() * SHIRTS.length),
    woman: rnd() < 0.5,
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
    downT: 0,
  };
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

// Copiers stand beside his starting column; the crowd waits on the rest of the crossing.
const copierCols = () => [PCOL - 1, PCOL + 1, PCOL + 2];
const crowdCols = () => [CROSS_C0, CROSS_C1 - 1, PCOL - 1, PCOL + 1, PCOL + 2]; // clear of the walk light

// ---------- Level set-up ----------

function setupLevel(idx) {
  game.level = idx;
  layout = buildLayout(idx);
  const s = layout.s;
  vehicles = [];
  people = [];
  popups = [];
  game.red = s.red;
  game.levelScore = 0;
  game.failed = false;
  game.lastTick = 0;
  game.siren = null;
  game.sirenIn = rand(7, 11);
  game.phaseT = 0;
  game.greenWalk = false;
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
  player.down = 0;
  player.auto = false;
  player.inside = false;
  player.face = 1;
  const f = cellFeet(player.col, player.row);
  player.vx = player.fx = f.x;
  player.vy = player.fy = f.y;
  player.tw = 1;
  // The copiers stand at the kerb's edge beside him; the crowd waits behind.
  for (let i = 0; i < s.copiers; i++) {
    const p = makePerson('copier', copierCols()[i], layout.bottom);
    p.order = i;
    const g = cellFeet(p.col, p.row);
    place(p, g.x, g.y);
    people.push(p);
  }
  for (const col of crowdCols().slice(0, 4 - Math.min(2, s.copiers))) {
    const p = makePerson('crowd', col, layout.bottom);
    const g = stripFeet(col, layout.bottom);
    place(p, g.x + rand(-2, 2), g.y);
    people.push(p);
  }
  resize();
  // The road starts busy: every lane full of traffic driving on green (the last level's red light
  // must not hold it at the stop lines), then the lanes take up their staggered phases.
  const mode = game.mode;
  if (mode !== 'title') game.mode = 'play';
  const phases = layout.lanes.map((ln) => [ln.phase, ln.t]);
  for (const ln of layout.lanes) ln.phase = 'on';
  for (let i = 0; i < 16 * 30; i++) updateTraffic(1 / 30, true);
  layout.lanes.forEach((ln, i) => ([ln.phase, ln.t] = phases[i]));
  game.mode = mode;
  // Level 1 starts with just one car, coming up to the crossing.
  if (s.lanes.length && idx === 0) {
    const before = vehicles.filter((v) => v.s < crossingStop(v) - 4);
    const first = before.reduce((m, v) => (!m || v.s > m.s ? v : m), null);
    vehicles = first ? [first] : [];
  }
}

// ---------- Copiers ----------

// Would a vehicle reach a lane cell within t seconds (or is one on it now)?
function laneBusy(col, row, t) {
  const x = colX(col);
  const a = x - PERSON_HALF - 1;
  const b = x + PERSON_HALF + 1;
  const mul = speedMul();
  for (const v of vehicles) {
    if (v.lane !== row) continue;
    let [x0, x1] = boxOf(v);
    const reach = (v.v || 0) * (v.siren ? 1 : mul) * t;
    if (v.dir === 1) x1 += reach;
    else x0 -= reach;
    if (x0 < b && x1 > a) return true;
  }
  return false;
}

// A copier may go to a row the player has reached, never past him (copying, not leading); they
// may share a safe strip with him.
function copierMayEnter(row) {
  if (player.row === 0 || player.inside) return true;
  if (row > player.row) return true;
  return row === player.row && isSafe(row);
}

function updateCopiers(dt) {
  const out = layout.bottom - player.row; // how far out the player is
  for (const p of people) {
    if (p.kind !== 'copier') continue;
    if (p.state === 'wait') {
      // They see you go and copy you, one after another.
      if (out >= COP_START && p.startAt === Infinity) p.startAt = game.time + p.order * COP_STAGGER;
      if (game.time >= p.startAt) {
        p.state = 'go';
        p.hopT = 0;
        sfx('join', { rate: rand(0.95, 1.1), gain: 0.6 });
      }
      continue;
    }
    if (p.state === 'down') {
      p.downT -= dt;
      if (p.downT <= 0) {
        // Shaken, they walk back to the crowd: out for this level.
        p.state = 'home';
        p.row = layout.bottom;
        const g = stripFeet(p.col, layout.bottom);
        walkTo(p, g.x, g.y, 0.9);
      }
      continue;
    }
    if (p.state !== 'go') continue;
    p.hopT -= dt;
    if (p.hopT > 0) continue;
    const next = p.row - 1;
    if (!copierMayEnter(next)) {
      p.hopT = 0.1;
      continue;
    }
    if (isLane(next) && (game.mode === 'play' || game.mode === 'finish')) {
      // Looking before stepping: careful from safe ground; in the road, they wait a little while
      // the next lane is about to be hit and their own spot isn't, then go anyway.
      if (isSafe(p.row)) {
        if (laneBusy(p.col, next, COP_LOOK)) {
          p.hopT = 0.1;
          continue;
        }
      } else if (laneBusy(p.col, next, COP_HOP + 0.15) && !laneBusy(p.col, p.row, 0.4) && p.dare < COP_DARE) {
        p.dare += 0.1;
        p.hopT = 0.1;
        continue;
      }
    }
    p.dare = 0;
    p.row = next;
    const g = cellFeet(p.col, next);
    walkTo(p, g.x, g.y, COP_HOP * 0.6);
    p.hopT = COP_HOP;
    if (next === 0) arrive(p);
  }
}

function arrive(p) {
  p.state = 'across';
  const n = acrossCount();
  game.assist = Math.max(0, game.assist - 0.03);
  popups.push({ x: colX(p.col), y: rowY(0) - 12, text: '+1', t: 0, color: '#ffd23f', big: true });
  sfx('arrive', { rate: Math.min(2, 1 + 0.1 * (n - 1)), gain: 0.7 });
  // They queue at the porta-potty too.
  setTimeout(() => {
    if (p.state !== 'across' || !layout) return;
    const g = stripFeet(PCOL + (p.col < PCOL ? -1 : 1) * (1 + (p.order || 0)), 0);
    walkTo(p, g.x, g.y, 0.4);
  }, 250);
}

function acrossCount() {
  return people.filter((q) => q.kind === 'copier' && q.state === 'across').length;
}
function onTheWayCount() {
  return people.filter((q) => q.kind === 'copier' && q.state === 'go').length;
}

function hitCopier(p) {
  p.state = 'down';
  p.downT = 1;
  game.assist = Math.min(1, game.assist + 0.1);
  sfx('hit', { gain: 0.6, rate: 1.15 });
  sfx('horn', { gain: 0.35, rate: rand(1, 1.1) });
}

// ---------- The player ----------

const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

function canAct() {
  return game.mode === 'play' && !game.paused && game.grace <= 0 && !player.down;
}

function hop(dir) {
  const d = DIRS[dir];
  if (!d || !canAct()) return false;
  const col = player.col + d[0];
  const row = player.row + d[1];
  if (row < 0 || row > layout.bottom || col < CROSS_C0 || col > CROSS_C1) {
    bump();
    return false;
  }
  if (d[0]) player.face = d[0];
  movePlayer(row, col);
  sfx(rnd() < 0.5 ? 'step' : 'step2', { rate: rand(0.9, 1.15), gain: 0.55 });
  return true;
}

function movePlayer(row, col = player.col) {
  player.fx = player.vx;
  player.fy = player.vy;
  player.row = row;
  player.col = col;
  player.tw = 0;
  player.walkFrame ^= 1;
  if (isSafe(row)) player.lastSafe = row;
}

function bump() {
  sfx('bump', { gain: 0.5 });
  player.nudge = 0.15;
}

function updatePlayer(dt) {
  if (player.tw < 1) {
    player.tw = Math.min(1, player.tw + dt / HOP_TWEEN);
    const f = player.inside ? doorFeet() : cellFeet(player.col, player.row);
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
    }
    return;
  }
  // On the green light after running out of time, he crosses with everyone.
  if (player.auto && player.row > 0) {
    player.autoT -= dt;
    if (player.autoT <= 0) {
      movePlayer(player.row - 1);
      player.autoT = 0.3;
    }
  }
}

function doorFeet() {
  return { x: colX(PCOL), y: rowY(0) - WAIT_H + 1 };
}

function checkHits() {
  if (game.grace > 0) return;
  const hitAt = (col, row) => {
    const x = colX(col);
    const a = x - PERSON_HALF;
    const b = x + PERSON_HALF;
    return vehicles.some((v) => {
      if (v.lane !== row) return false;
      const [x0, x1] = boxOf(v);
      return x0 < b && x1 > a;
    });
  };
  if (game.mode === 'play' && !player.down && isLane(player.row) && hitAt(player.col, player.row)) hitPlayer();
  for (const p of people) {
    if (p.kind === 'copier' && p.state === 'go' && isLane(p.row) && hitAt(p.col, p.row)) hitCopier(p);
  }
  honk();
}

// A car coming close to him, or just missing him, honks: deep for big vehicles, high for small ones.
const DEEP = ['bus', 'bus_school', 'truck', 'truck_trailer', 'truckcabin', 'truckcabin_vintage', 'truckdark', 'truckdelivery', 'trucktank', 'trucktank_trailer', 'transport', 'towtruck', 'firetruck', 'hotdog', 'vendor', 'tractor', 'riot', 'van_large'];
const HIGH = ['sports_red', 'sports_yellow', 'sports_green', 'sports_race', 'sports_convertible', 'convertible', 'kart', 'formula', 'buggy', 'scooter', 'cycle', 'cycle_low', 'rounded_yellow', 'rounded_red', 'rounded_green'];
function hornRate(v) {
  return DEEP.includes(v.name) ? 0.72 : HIGH.includes(v.name) ? 1.3 : 1;
}
function honk() {
  if (game.mode !== 'play' || player.down || !isLane(player.row)) return;
  const x = colX(player.col);
  const a = x - PERSON_HALF;
  const b = x + PERSON_HALF;
  for (const v of vehicles) {
    if (v.lane !== player.row || v.honked || v.siren) continue;
    const [x0, x1] = boxOf(v);
    const gap = v.dir === 1 ? a - x1 : x0 - b; // how far its front is from him, if it's coming
    const passed = v.dir === 1 ? x0 > b : x1 < a;
    if ((gap > 0 && gap < HONK_GAP && v.v > 4) || (passed && Math.min(Math.abs(x0 - b), Math.abs(a - x1)) < 4)) {
      v.honked = true;
      sfx('horn', { rate: hornRate(v) * rand(0.96, 1.04), gain: 0.4 });
    }
  }
}

function hitPlayer() {
  player.down = DOWN_T;
  game.assist = Math.min(1, game.assist + 0.25);
  game.shake = 0.25;
  sfx('hit', { gain: 0.8 });
  const v = vehicles.find((u) => u.lane === player.row);
  sfx('horn', { gain: 0.45, rate: (v ? hornRate(v) : 1) * rand(0.96, 1.04) });
}

// ---------- Level flow ----------

function maxScore(s) {
  return s.red * (1 + s.copiers);
}
function starsFor(score, s) {
  const f = score / maxScore(s);
  return f >= 0.45 ? 3 : f >= 0.28 ? 2 : f >= 0.12 ? 1 : 0;
}

// He's across: the seconds left are his. In he goes: the door shuts, a flush, a chime. Then nobody
// waits in real time: the whole game runs FF times faster under its own rules (the walk light's
// seconds drain into points, the car lights change, copiers on the way carry on and can be hit)
// until the walk light turns green.
function closeLevel() {
  game.closedSecs = Math.max(1, Math.ceil(game.red - 1e-9));
  game.red = game.closedSecs;
  game.mode = 'finish';
  game.stage = 'door';
  game.counted = 0;
  game.phaseT = 0;
  game.shut = false;
  game.flushed = false;
  game.cheered = false;
  // In through the porta-potty door.
  player.inside = true;
  player.fx = player.vx;
  player.fy = player.vy;
  player.tw = 0;
  sfx('join', { rate: 0.75, gain: 0.7 }); // in through the door
}

function scoreLevel() {
  game.levelScore = game.closedSecs * (1 + acrossCount());
}

// From the fast-forward to the tally, nobody waits in real time: the green light's crossing (and,
// when he was too slow, the wait for the crossing to clear) runs fast too.
const fastForward = () => (game.mode === 'finish' && (game.stage === 'ff' || game.stage === 'clear')) || game.mode === 'wait' || game.mode === 'green';

function updateFinish(dt) {
  game.phaseT += dt;
  if (game.stage === 'door') {
    // The street goes on at normal speed; the walk light holds his seconds.
    updateCopiers(dt);
    checkHits();
    if (!game.shut && game.phaseT >= 0.3) {
      game.shut = true;
      sfx('bump', { rate: 0.7, gain: 0.45 }); // the door shuts
    }
    if (!game.flushed && game.phaseT >= 0.35) {
      game.flushed = true;
      sfx('flush', { gain: 0.8 });
    }
    if (!game.cheered && game.phaseT >= DOOR_T - 0.25) {
      game.cheered = true;
      sfx('cheer', { rate: 1.3, gain: 0.8 });
    }
    if (game.phaseT >= DOOR_T) {
      game.stage = 'ff';
      game.phaseT = 0;
    }
    return;
  }
  if (game.stage === 'ff') {
    // The game's own rules, fast: copiers carry on, the seconds drain into points.
    updateCopiers(dt);
    checkHits();
    const before = Math.ceil(game.red - 1e-9);
    game.red = Math.max(0, game.red - dt);
    const left = Math.ceil(game.red - 1e-9);
    if (left < before) sfx('tick', { gain: 0.3, rate: 1 + 0.6 * (1 - left / game.closedSecs) });
    game.levelScore = (game.closedSecs - left) * (1 + acrossCount());
    if (game.red <= 0) {
      scoreLevel();
      sfx('cheer', { rate: 1.6, gain: 0.7 });
      game.stage = 'clear';
      game.phaseT = 0;
    }
    return;
  }
  // The walk light is at 0: once no vehicle is on the crossing (at most 10 s, run fast), green.
  if (game.stage === 'clear' && (crossingClear() || game.phaseT > 10)) beginGreen();
}

// The walk light has run out: the cars stop before the crossing, and once it is clear, green.
function beginWait() {
  game.mode = 'wait';
  game.phaseT = 0;
}

function crossingClear() {
  const x0 = CROSS_C0 * CW - 1;
  const x1 = (CROSS_C1 + 1) * CW + 1;
  return !vehicles.some((v) => {
    const x = vxOf(v);
    return x < x1 && x + v.w > x0;
  });
}

function beginGreen() {
  game.mode = 'green';
  game.phaseT = 0;
  game.siren = null;
  sfx('walk', { gain: 0.5 });
  sfx('street', { gain: 0.7 });
}

function updateGreen(dt) {
  game.phaseT += dt;
  // Everyone still on this side crosses on the zebra at once, inside the fast-forward; so does he if
  // he didn't make it.
  if (!game.greenWalk) {
    game.greenWalk = true;
    for (const p of people) {
      if (p.state === 'across') continue;
      p.state = 'walk';
      p.walkRow = p.row;
      p.hopT = rand(0, 0.4);
    }
    if (!player.inside && player.row > 0 && !player.down) {
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
        // Crossing on green earns nothing.
        if (p.kind === 'copier') popups.push({ x: colX(p.col), y: rowY(0) - 12, text: '+0', t: 0, color: '#c9ccd6', big: false });
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
  if (game.failed) {
    ui.bannerNum.textContent = 'The light turned green';
    ui.bannerName.textContent = 'Try again';
    ui.banner.hidden = false;
    sfx('bump', { rate: 0.8, gain: 0.6 });
    return;
  }
  const stars = starsFor(game.levelScore, s);
  const across = acrossCount();
  game.results[game.level] = { score: game.levelScore, stars, across };
  game.score += game.levelScore;
  const prev = saved.stars[game.level] || 0;
  if (stars > prev) saved.stars[game.level] = stars;
  save();
  ui.bannerNum.textContent = `${game.closedSecs} s × ${1 + across} · ${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}`;
  ui.bannerName.textContent = `+${game.levelScore}`;
  ui.banner.hidden = false;
  sfx('arrive', { rate: 1.2, gain: 0.6 });
}

function updateTally(dt) {
  game.phaseT += dt;
  if (game.phaseT < TALLY_T) return;
  ui.banner.hidden = true;
  if (game.failed) startLevel(game.level); // the same level again
  else if (game.level + 1 >= LEVELS_N) endRun();
  else startLevel(game.level + 1);
}

function startLevel(idx) {
  setupLevel(idx);
  game.mode = 'play';
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
  startAmbience();
}

let stopAmbience = null; // the street ambience loop
function startAmbience() {
  if (!stopAmbience) stopAmbience = sound.loop('ambience', { gain: 0.5 });
}
function endAmbience() {
  if (stopAmbience) stopAmbience();
  stopAmbience = null;
}

function endRun() {
  game.mode = 'over';
  saved.best = Math.max(saved.best || 0, game.score);
  saved.assist = game.assist;
  save();
  endAmbience();
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
  if (game.paused) {
    game.time += dt;
    return;
  }
  if (game.shake > 0) game.shake -= dt;
  if (game.grace > 0) game.grace -= dt;
  for (const pp of popups) pp.t += dt;
  popups = popups.filter((pp) => pp.t < (pp.long ? 1.8 : 1.1));
  // Once he's in the loo, the whole game runs FF times over, step by step, with its usual rules.
  const n = fastForward() ? FF : 1;
  for (let i = 0; i < n; i++) {
    tick(dt);
    if (i < n - 1 && !fastForward()) break;
  }
}

function tick(dt) {
  game.time += dt;
  updateTraffic(dt);
  updatePlayer(dt);
  updatePeople(dt);
  if (game.mode === 'green') return updateGreen(dt);
  if (game.mode === 'tally') return updateTally(dt);
  if (game.mode === 'wait') {
    // Wait for the crossing to clear, at most a few seconds.
    game.phaseT += dt;
    if (crossingClear() || game.phaseT > 10) beginGreen();
    return;
  }
  if (game.mode === 'finish') return updateFinish(dt);
  if (game.mode !== 'play') return;
  updateCopiers(dt);
  checkHits();
  game.red -= dt;
  const whole = Math.ceil(game.red);
  if (game.red <= 5 && game.red > 0 && whole !== game.lastTick) {
    game.lastTick = whole;
    sfx('tick', { gain: 0.6 });
  }
  if (game.red <= 0) {
    // Too slow: the light turns green before he is across. No points, and the level again.
    game.red = 0;
    game.failed = true;
    game.levelScore = 0;
    game.tries += 1;
    beginWait();
    return;
  }
  if (player.row === 0 && player.tw >= 1 && !player.down) {
    closeLevel();
    return;
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
  if (Math.hypot(dx, dy) >= 18) doHop(Math.abs(dy) >= Math.abs(dx) ? (dy > 0 ? 'down' : 'up') : dx > 0 ? 'right' : 'left');
  else doHop('up');
}
canvas.addEventListener('pointerup', (e) => endPointer(e, false));
canvas.addEventListener('pointercancel', (e) => endPointer(e, true));
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

const KEYS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', s: 'down', a: 'left', d: 'right', W: 'up', S: 'down', A: 'left', D: 'right', ' ': 'up' };
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
const laneLen = () => PLAY_W + 2 * ENTRY;

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
  if (game.siren && game.siren.lane === ln.row) ln.light = 'siren';
}

// Where a vehicle's front stops: its stop line, just before the zebra crossing (in s along its lane).
function crossingStop(v) {
  const x = v.dir === 1 ? CROSS_C0 * CW - 3 : (CROSS_C1 + 1) * CW + 3;
  return v.dir === 1 ? x + ENTRY : PLAY_W + ENTRY - x;
}

// The furthest a vehicle's front may go this frame: on red it stops at its stop line, on yellow
// too if it can still stop in time; past the line it drives on.
function stopLineS(v) {
  const light = carLight();
  if (light === 'green') return Infinity;
  const sStop = crossingStop(v);
  const margin = light === 'yellow' ? -6 : 0.5; // on yellow, only a car well short of the line stops
  return v.s <= sStop + margin ? sStop : Infinity;
}

// A car caught past its stop line on yellow or red hurries to clear the crossing.
function hurrying(v) {
  return carLight() !== 'green' && v.s > crossingStop(v) + 0.5;
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
      const want = v.speed * mul * (hurrying(v) ? 1.8 : 1);
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
  vehicles = vehicles.filter((v) => v.s - v.w < laneLen());
}

// ---------- Pause ----------

function pause() {
  if (game.mode === 'title' || game.mode === 'over') return;
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

const SKY = 24; // art px of sky kept clear above the street, for the porta-potty
function streetNeed() {
  return MAX_ROWS * ROW + 2 * WAIT_H + 6 + SKY; // in art px: the tallest street, so every street is one size
}
function hudRoom() {
  return 64 + insetTop; // CSS px above the street for the HUD
}

function resize() {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(vw * dpr);
  canvas.height = Math.round(vh * dpr);
  readInsets();
  const fitH = (vh - hudRoom() - 16 - insetBottom) / streetNeed();
  if (TILE) {
    // The landing page's tile picture (?tile) shows the street wide, filling the picture.
    scale = Math.max(1, Math.min(vw / PLAY_W, fitH));
    LW = Math.ceil(vw / scale);
    originX = Math.floor((LW - PLAY_W) / 2);
    offX = 0;
  } else {
    // One scale for every street and every state, so the width never jumps; the view is the
    // crossing, edge to edge.
    scale = Math.max(1, Math.min(vw / CROSS_W, fitH));
    LW = CROSS_W;
    originX = -CROSS_C0 * CW;
    offX = Math.max(0, Math.round(((vw - LW * scale) / 2) * dpr));
  }
  LH = Math.ceil(vh / scale);
  low.width = LW;
  low.height = LH;
  if (typeof ui !== 'undefined') ui.hud.style.maxWidth = `${Math.max(240, Math.round(LW * scale) - 96)}px`;
  // The street sits under the HUD; a street with fewer rows sits in the middle of the same space.
  const rows = layout ? layout.rows.length : MAX_ROWS;
  const used = rows * ROW + 2 * WAIT_H + 6 + SKY;
  const room = vh / scale - hudRoom() / scale;
  originY = Math.round(hudRoom() / scale + SKY + Math.max(0, (room - used) / 2));
  view.scale = scale;
  view.person = 15 * scale;
  view.top = originY * scale;
  view.bottom = (originY + used - SKY) * scale;
  view.width = LW * scale;
  view.left = offX / dpr;
  view.lw = LW;
  view.x0 = -originX; // the world x at the view's left edge
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
  else if (!isPlayer && p.state === 'down') pose = p.downT > 0.6 ? '_fall' : '_down';
  else if (moving) pose = p.walkFrame ? '_walk1' : '_walk2';
  const key = isPlayer ? 'suit' : `s${p.shirt}`;
  return sprites[`${sex}${pose}:${key}`];
}

// He needs the loo: standing still, now and then he hops from foot to foot for a moment.
function urgentJiggle(p, isPlayer) {
  if (game.mode === 'title' && !isPlayer) return 0;
  const still = isPlayer ? player.tw >= 1 && !player.down : p.tw >= 1;
  const urgent = isPlayer ? !player.inside : p.kind === 'copier' && p.state !== 'down' && p.state !== 'home';
  if (!still || !urgent) return 0;
  const t = game.time + (p.id || 0) * 1.7;
  if (t % 3.6 > 0.7) return 0; // a burst of 0.7 s every 3.6 s
  return Math.floor(t * 9) % 2 === 0 ? -1 : 1;
}

function drawPerson(p, isPlayer = false) {
  if (isPlayer && player.inside && player.tw >= 1) return; // in the loo
  const spr = personSprite(p, isPlayer);
  if (!spr) return;
  const tw = isPlayer ? player.tw : p.tw;
  const img = p.face === 1 ? spr[0] : spr[1];
  const hopY = tw < 1 ? Math.sin(Math.PI * tw) * 2 : 0;
  let x = px(p.vx - img.width / 2) + urgentJiggle(p, isPlayer);
  if (isPlayer && player.nudge > 0) x += Math.round(Math.sin(player.nudge * 60));
  const y = py(p.vy - img.height - hopY);
  if (!isPlayer && p.state === 'home') lctx.globalAlpha = 0.7;
  lctx.drawImage(img, x, y);
  lctx.globalAlpha = 1;
  // A drop of sweat, now and then.
  if (isPlayer && !player.down && !player.inside && game.mode !== 'title') {
    const ph = (game.time * 1.3) % 1;
    if (ph < 0.6) {
      const sx = x + (p.face === 1 ? 1 : img.width - 2);
      const sy = y - 1 + Math.round(ph * 6);
      lctx.fillStyle = '#7fd0ff';
      lctx.fillRect(sx, sy, 1, 2);
      lctx.fillRect(sx - 1, sy + 1, 3, 1);
    }
  }
  // Knocked down: stars.
  if ((isPlayer && player.down > 0) || (!isPlayer && p.state === 'down')) {
    const a = game.time * 6;
    lctx.fillStyle = '#ffd23f';
    for (let i = 0; i < 3; i++) {
      const ang = a + (i * Math.PI * 2) / 3;
      lctx.fillRect(Math.round(x + img.width / 2 + Math.cos(ang) * 5), Math.round(y - 2 + Math.sin(ang) * 2), 1, 1);
    }
  }
}

// A 3×5 pixel font for the countdown.
const DIGITS = ['111101101101111', '010110010010111', '111001111100111', '111001111001111', '101101111001001', '111100111001111', '111100111101111', '111001001001001', '111101111101111', '111101111001111'];
function drawDigits(n, x, y, color) {
  const s = String(n);
  lctx.fillStyle = color;
  for (let i = 0; i < s.length; i++) {
    const d = DIGITS[+s[i]];
    for (let k = 0; k < 15; k++) if (d[k] === '1') lctx.fillRect(x + i * 4 + (k % 3), y + Math.floor(k / 3), 1, 1);
  }
}

// The zebra crossing and each lane's stop line, under the traffic.
function drawCrossing() {
  const x0 = px(CROSS_C0 * CW);
  const w = (CROSS_C1 - CROSS_C0 + 1) * CW;
  for (let r = 1; r < layout.bottom; r++) {
    if (!isLane(r)) continue;
    const y = py(rowY(r));
    lctx.fillStyle = 'rgba(245,245,240,0.82)';
    for (let sx = x0 + 2; sx < x0 + w - 1; sx += 6) lctx.fillRect(sx, y + 3, 3, ROW - 6);
    const ln = laneAt(r);
    lctx.fillStyle = 'rgba(245,245,240,0.9)';
    const lx = ln.dir === 1 ? x0 - 3 : x0 + w + 2;
    lctx.fillRect(lx, y + 2, 1, ROW - 4);
  }
}

function drawLights() {
  // Each lane's car light at its stop line: green, then yellow, then red with the walk light.
  const light = carLight();
  for (const ln of layout.lanes) {
    const y = py(rowY(ln.row)) + 1;
    const x = ln.dir === 1 ? px(CROSS_C0 * CW) + 1 : px((CROSS_C1 + 1) * CW) - 5; // on the crossing's edge the cars come from
    lctx.fillStyle = '#20232b';
    lctx.fillRect(x, y, 4, 10);
    lctx.fillStyle = light === 'red' ? '#ff4b4b' : '#3a1515';
    lctx.fillRect(x + 1, y + 1, 2, 2);
    lctx.fillStyle = light === 'yellow' ? '#ffcf3f' : '#3a3010';
    lctx.fillRect(x + 1, y + 4, 2, 2);
    lctx.fillStyle = light === 'green' ? '#5ae17c' : '#14301c';
    lctx.fillRect(x + 1, y + 7, 2, 2);
    if (game.siren && game.siren.lane === ln.row) {
      // A siren is coming: the lane's edge flashes.
      const on = Math.floor(game.time * 8) % 2 === 0;
      lctx.fillStyle = on ? 'rgba(255,59,59,0.4)' : 'rgba(59,139,255,0.4)';
      const ex = ln.dir === 1 ? 0 : LW - 6;
      lctx.fillRect(ex, py(rowY(ln.row)), 6, ROW);
    }
  }
  // The walk light on both kerbs, beside the crossing, with its countdown.
  const green = game.mode === 'green' || game.mode === 'tally';
  const secs = Math.max(0, Math.ceil(game.red));
  for (const r of [0, layout.bottom]) {
    const x = px((CROSS_C1 + 1) * CW) - 11;
    const y = r === 0 ? py(rowY(0)) - 16 : py(rowY(r) + ROW) + 1;
    lctx.fillStyle = '#c8e0ff';
    lctx.fillRect(x + 4, y + 14, 1, 6);
    lctx.fillStyle = '#20232b';
    lctx.fillRect(x, y, 9, 15);
    lctx.fillStyle = green ? '#5ae17c' : '#ff4b4b';
    if (green) {
      lctx.fillRect(x + 4, y + 1, 1, 1);
      lctx.fillRect(x + 3, y + 2, 3, 3);
      lctx.fillRect(x + 3, y + 5, 1, 2);
      lctx.fillRect(x + 5, y + 5, 1, 1);
      lctx.fillRect(x + 6, y + 6, 1, 1);
    } else {
      lctx.fillRect(x + 4, y + 1, 1, 1);
      lctx.fillRect(x + 3, y + 2, 3, 3);
      lctx.fillRect(x + 3, y + 5, 1, 2);
      lctx.fillRect(x + 5, y + 5, 1, 2);
      if (game.mode !== 'title') {
        drawDigits(Math.min(99, secs), x + (secs >= 10 ? 1 : 3), y + 9, '#ffb03f');
        drawn.countdown = secs;
      }
    }
  }
}

// The porta-potty across the street, on the far sidewalk above his starting column: blue, with a
// roof, a vent, a door that opens for him, and a WC sign on it.
const shut = () => player.inside && (game.mode !== 'finish' || game.stage !== 'door' || game.shut);
function drawToilet() {
  // It rocks a little while it flushes.
  const flushing = game.mode === 'finish' && game.stage === 'door' && game.phaseT > 0.35 && game.phaseT < 1.4;
  const cx = px(colX(PCOL)) + (flushing ? (Math.floor(game.phaseT * 14) % 2 ? 1 : 0) : 0);
  const w = 13;
  const h = 24;
  const x = cx - 6;
  const y = py(rowY(0)) - WAIT_H - h + 3; // its foot on the back of the sidewalk
  // Body and roof.
  lctx.fillStyle = '#1f5fbf';
  lctx.fillRect(x, y + 3, w, h - 3);
  lctx.fillStyle = '#2f7be0';
  lctx.fillRect(x + 1, y + 4, w - 2, h - 5);
  lctx.fillStyle = '#dfe8f5';
  lctx.fillRect(x - 1, y + 1, w + 2, 3);
  lctx.fillRect(x + 1, y, w - 2, 1);
  lctx.fillStyle = '#9aa7b8';
  lctx.fillRect(x + w - 3, y - 2, 2, 2); // vent
  // Door: open (a dark doorway, the door swung out) as he goes in, then shut.
  const open = player.inside && !shut();
  if (open) {
    lctx.fillStyle = '#0f2f60';
    lctx.fillRect(x + 2, y + 6, w - 4, h - 7);
    lctx.fillStyle = '#4a92ec';
    lctx.fillRect(x - 2, y + 6, 3, h - 7);
    return;
  }
  lctx.fillStyle = '#4a92ec';
  lctx.fillRect(x + 2, y + 6, w - 4, h - 7);
  lctx.fillStyle = '#dfe8f5';
  lctx.fillRect(x + w - 4, y + 13, 1, 2); // handle
  // WC on the door.
  lctx.fillStyle = '#ffffff';
  const W = ['10001', '10101', '01010'];
  const C = ['11', '10', '11'];
  W.forEach((row, j) => [...row].forEach((c, i) => c === '1' && lctx.fillRect(x + 2 + i, y + 8 + j, 1, 1)));
  C.forEach((row, j) => [...row].forEach((c, i) => c === '1' && lctx.fillRect(x + 8 + i, y + 8 + j, 1, 1)));
  // Busy / free: a red or green dot by the handle.
  lctx.fillStyle = player.inside ? '#ff4b4b' : '#5ae17c';
  lctx.fillRect(x + w - 4, y + 10, 1, 1);
}

function draw() {
  if (!layout || !PERSON_KEYS.ready) return;
  const pal = street().pal;
  drawBackground();
  drawToilet();
  drawCrossing();
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
    lctx.fillRect(0, 0, LW, py(rowY(0)) - WAIT_H - 30);
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
  const right = offX + LW * k - 6 * dpr;
  for (const pp of popups) {
    const life = pp.long ? 1.8 : 1.1;
    const a = Math.min(1, (life - pp.t) * 2.5);
    ctx.font = `800 ${Math.round((pp.big ? 20 : 12) * dpr)}px system-ui, sans-serif`;
    const w = ctx.measureText(pp.text).width;
    const x = Math.max(left + w / 2, Math.min(right - w / 2, (pp.x + originX) * k + offX));
    const y = (pp.y + originY - pp.t * 10) * k;
    ctx.globalAlpha = Math.max(0, a);
    ctx.lineWidth = 4 * dpr;
    ctx.strokeStyle = 'rgba(20,22,31,0.75)';
    ctx.strokeText(pp.text, x, y);
    ctx.fillStyle = pp.color;
    ctx.fillText(pp.text, x, y);
  }
  ctx.globalAlpha = 1;
  // Across: the points counting up as the seconds drain, big, above the porta-potty.
  if ((game.mode === 'finish' && game.stage !== 'door') || (game.mode === 'green' && !game.failed)) {
    const per = 1 + acrossCount();
    const text = `+${game.levelScore}`;
    const x = offX + (colX(PCOL) + originX) * k;
    const y = (rowY(0) + 6 + originY) * k; // over the far sidewalk, below the porta-potty
    ctx.font = `900 ${Math.round(26 * dpr)}px system-ui, sans-serif`;
    ctx.lineWidth = 5 * dpr;
    ctx.strokeStyle = 'rgba(20,22,31,0.8)';
    ctx.strokeText(text, x, y);
    ctx.fillStyle = '#ffd23f';
    ctx.fillText(text, x, y);
    if (per > 1) {
      ctx.font = `800 ${Math.round(13 * dpr)}px system-ui, sans-serif`;
      ctx.lineWidth = 4 * dpr;
      const sub = `× ${per} a second`;
      ctx.strokeText(sub, x, y + 20 * dpr);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(sub, x, y + 20 * dpr);
    }
    // Fast-forward: a ▶▶ mark in the corner of the sky.
    if (fastForward()) {
      ctx.font = `900 ${Math.round(15 * dpr)}px system-ui, sans-serif`;
      ctx.textAlign = 'right';
      ctx.lineWidth = 4 * dpr;
      const fy = (rowY(0) - WAIT_H - 12 + originY) * k;
      ctx.strokeText(`▶▶ ${FF}×`, right, fy);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(`▶▶ ${FF}×`, right, fy);
      ctx.textAlign = 'center';
      drawn.ff = true;
    } else drawn.ff = false;
    drawn.counting = game.levelScore;
  }
  // What the level is worth right now: the seconds left × (1 + copiers across or on the way).
  if (game.mode === 'play' && street().copiers > 0) {
    const m = 1 + acrossCount() + onTheWayCount();
    const secs = Math.max(0, Math.ceil(game.red));
    const text = `${secs} s × ${m} = ${m * secs}`;
    const yk = rowY(0) - WAIT_H - 12;
    ctx.font = `800 ${Math.round(14 * dpr)}px system-ui, sans-serif`;
    const w = ctx.measureText(text).width + 16 * dpr;
    const h = 22 * dpr;
    const x = offX + LW * k * 0.74; // beside the porta-potty, not on it
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
  const shown = game.score + (['finish', 'wait', 'green'].includes(game.mode) ? game.levelScore : 0);
  const key = `${c}|${shown}|${game.level}|${game.mode}`;
  if (key === hudCache) return;
  hudCache = key;
  const green = game.mode === 'green' || game.mode === 'tally';
  ui.clock.textContent = green ? 'GO' : String(c);
  ui.clock.classList.toggle('low', game.red <= 5 && game.mode === 'play');
  ui.clock.classList.toggle('green', green);
  ui.score.textContent = String(shown);
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
      CROSS_C0,
      CROSS_C1,
      COLS,
      FF,
      DOOR_T,
      YELLOW_AT,
      RED_AT,
      COP_START,
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
      popups: () => popups,
      carLight,
      crossingClear,
      laneBusy,
      // Put the player on a row, standing (for tests).
      put: (row) => {
        player.row = row;
        if (isSafe(row)) player.lastSafe = row;
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
      hornRate,
      set manual(v) {
        manual = v;
      },
    };
  },
  () => {}
);

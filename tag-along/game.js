// Tag Along: lead a line of pedestrians across rush hour. They follow your path, a step behind.
//
// The rules (specs/tag-along.md):
//  - The street is a grid: 12 columns, and rows from the top kerb (row 0) down to the bottom kerb,
//    with lanes and sometimes a median between. The leader moves one cell per step.
//  - The line follows the leader's path (the trail) on its own, one cell every FOLLOW_STEP, closing
//    up behind the person ahead. Before stepping off a kerb or the median into a lane, a follower
//    looks and waits while a car is about to reach that cell; in a lane they keep walking.
//  - People wait on both kerbs (and on a median), each wanting another kerb. Stepping next to one
//    asks them to join; they join the end of the line once nobody in it is in a lane.
//  - A follower reaching their destination kerb arrives: the nth arrival of a crossing scores n and
//    adds 0.5 + 0.5 * n seconds. The run is a clock; it ends at zero.
//  - Traffic comes in platoons and lulls per lane, shown by a light at each lane's entry.
//  - A hidden assist eases traffic after hits.
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
const STEP_TWEEN = 0.09;
const HOLD_DELAY = 0.22;
const HOLD_REPEAT = 0.16;
const START_CLOCK = 45;
const STREET_BONUS = 10; // a new street adds this to the clock
const NEAR = 6; // half a cell: a close call
const PERSON_HALF = 2.5; // a person's hitbox is 5 art px wide
const SHRINK = 0.1; // vehicles' boxes are 20% narrower than their art (10% off each end)

const CARS = ['sedan', 'sedan_blue', 'rounded_green', 'rounded_red', 'rounded_yellow', 'station', 'suv', 'suv_green', 'convertible', 'vintage', 'sports_red', 'sports_yellow', 'van_small', 'taxi'];
const CITY = ['van', 'van_large', 'van_flat', 'taxi', 'bus', 'truckdelivery', 'vendor', 'hotdog', 'suv_large', 'truckdark', 'sedan', 'station', 'taxi'];
const SCHOOL = ['bus_school', 'sedan', 'station', 'suv_travel', 'van_small', 'rounded_yellow', 'suv_closed', 'sedan_blue'];
const EVENING = ['sedan', 'suv', 'van', 'taxi', 'sports_red', 'sedan_vintage', 'truckcabin_vintage', 'station', 'suv_military', 'van_large'];
const NIGHT = ['sports_red', 'sports_yellow', 'sports_green', 'sports_convertible', 'taxi', 'sedan_vintage', 'truckdark', 'bus', 'van', 'convertible'];
const SIRENS = ['ambulance', 'police', 'firetruck', 'riot'];

// A lane: [direction (1 = to the right), speed (art px/s), vehicle set, gap range, platoon range, lull range]
const L = (dir, speed, set, gap = [16, 50], on = [3, 6], off = [3, 5]) => ({ dir, speed, set, gap, on, off });

// Rows from the top kerb down: 'K' kerb, 'L' lane, 'M' median.
const STREETS = [
  {
    name: 'Maple Street',
    quota: 8,
    rows: ['K', 'L', 'L', 'L', 'K'],
    lanes: [L(-1, 17, CARS), L(1, 22, CARS), L(-1, 19, CARS)],
    pal: { sky: '#bfe6ff', far: '#9fd28a', build: ['#e8b48a', '#f2d29b', '#c99ac2'], walk: '#d9d2c3', edge: '#b6ab98', road: '#5b6070', line: '#f4f1e8', mid: '#ffd23f', verge: '#7cc46a', dark: 0 },
  },
  {
    name: 'Market Avenue',
    quota: 10,
    rows: ['K', 'L', 'L', 'M', 'L', 'L', 'L', 'K'],
    median: true,
    lanes: [L(-1, 24, CITY), L(-1, 19, CITY), L(1, 21, CITY), L(1, 27, CITY), L(1, 18, CITY)],
    pal: { sky: '#a9d8f5', far: '#8fb7c9', build: ['#d98b6a', '#c9c2b2', '#7fa7c4', '#e6c27a'], walk: '#d6cfc0', edge: '#aaa08f', road: '#545a68', line: '#f4f1e8', mid: '#ffd23f', verge: '#8bbf6a', dark: 0 },
  },
  {
    name: 'School Run',
    quota: 12,
    rows: ['K', 'L', 'L', 'L', 'L', 'K'],
    crosswalk: true,
    lanes: [L(-1, 26, SCHOOL), L(-1, 21, SCHOOL), L(1, 23, SCHOOL), L(1, 29, SCHOOL)],
    pal: { sky: '#ffe2b0', far: '#e8c27a', build: ['#c9714f', '#d9a46b', '#a7b86f'], walk: '#ddd0b8', edge: '#b39f80', road: '#585a66', line: '#f6efe0', mid: '#ffd23f', verge: '#a6c76a', dark: 0 },
  },
  {
    name: 'Siren Boulevard',
    quota: 14,
    rows: ['K', 'L', 'L', 'L', 'L', 'L', 'K'],
    sirens: true,
    lanes: [L(-1, 27, EVENING), L(-1, 23, EVENING), L(1, 20, EVENING), L(1, 26, EVENING), L(1, 31, EVENING)],
    pal: { sky: '#f7a072', far: '#b86b77', build: ['#6b4a6e', '#8a5a6b', '#4f4a6e'], walk: '#c9b7aa', edge: '#9a8576', road: '#4c4b5a', line: '#f3e6d8', mid: '#ffc93f', verge: '#7f9a6a', dark: 0.12 },
  },
  {
    name: 'Downtown',
    quota: 16,
    rows: ['K', 'L', 'L', 'L', 'M', 'L', 'L', 'L', 'K'],
    median: true,
    crosswalk: true,
    sirens: true,
    lanes: [L(-1, 29, NIGHT), L(-1, 24, NIGHT), L(-1, 20, NIGHT), L(1, 22, NIGHT), L(1, 27, NIGHT), L(1, 32, NIGHT)],
    pal: { sky: '#1d2240', far: '#2c3160', build: ['#3a3f6b', '#2f3459', '#463f6b'], walk: '#8d8a9a', edge: '#6f6c7d', road: '#3a3c4a', line: '#d8d6e6', mid: '#ffc93f', verge: '#4a5a52', dark: 0.35 },
  },
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
const HIVIS = [[255, 132, 26], [215, 92, 14]];

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

const KEY = 'tag-along';
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
const saved = Object.assign({ best: 0, reached: 0, assist: null }, load());

// ---------- State ----------

const game = {
  mode: 'title', // title | play | change | over
  paused: false,
  street: 0, // index into STREETS (4 = Downtown, repeating)
  round: 0, // rounds of Downtown done
  clock: START_CLOCK,
  clockRunning: false,
  score: 0,
  arrived: 0, // arrivals on this street
  crossing: 0, // arrivals in this crossing
  closeGain: 0, // close-call time earned in this crossing
  assist: 0.4,
  runAssistStart: 0.4,
  pendingChange: false,
  changeT: 0,
  grace: 0, // after a resume: input ignored and nobody hittable
  time: 0,
  walk: null, // crosswalk: { col, t, phase: 'stop' | 'clear' | 'walk', hold }
  siren: null, // { lane, t } while warning
  sirenIn: 0,
  spawnIn: [0, 0],
  medianIn: 0,
  lastTick: 0,
  shake: 0,
};

let layout = null; // the current street's rows, lanes and geometry
let vehicles = [];
let people = []; // everyone but the leader: waiting, pending, follower, back (walking back), leaving
let trail = []; // the leader's path: the last cell is the leader's; each follower has a pos in it
const leader = { col: 5, row: 0, from: 0, heading: 0, face: 1, vx: 0, vy: 0, fx: 0, fy: 0, tw: 1, down: 0, walkFrame: 0 };
let line = []; // the followers, in order: line[k - 1] is follower k
let popups = []; // floating text: { x, y, text, t, color, big }
let nextId = 1;

function street() {
  return STREETS[game.street];
}

// ---------- Layout ----------

function buildLayout(idx) {
  const s = STREETS[idx];
  const rows = s.rows.slice();
  const lanes = [];
  let li = 0;
  rows.forEach((kind, r) => {
    if (kind === 'L') lanes.push({ row: r, ...s.lanes[li++], phase: 'on', t: 0, spawnIn: 0, light: 'green' });
  });
  return { s, rows, lanes, bottom: rows.length - 1, crossCol: 7 };
}

const isKerb = (r) => r === 0 || r === layout.bottom;
const isSafe = (r) => layout.rows[r] === 'K' || layout.rows[r] === 'M';
const isLane = (r) => layout.rows[r] === 'L';
const laneAt = (r) => layout.lanes.find((l) => l.row === r);
const colX = (c) => c * CW + CW / 2; // a column's centre, in world x (0 = the play area's left edge)

// ---------- People ----------

function shirtFor(i) {
  return i % SHIRTS.length;
}

function makePerson(kind, col, row, dest) {
  return {
    id: nextId++,
    kind,
    col,
    row,
    dest, // the kerb row they want, or -1 for either (never used: median people get a kerb)
    home: row, // where they wait (a kerb or the median row)
    shirt: shirtFor(Math.floor(rnd() * 64)),
    woman: rnd() < 0.5,
    vx: 0,
    vy: 0, // their drawn position (world x, y of their feet)
    fx: 0,
    fy: 0,
    tw: 1,
    tx: 0,
    ty: 0,
    face: rnd() < 0.5 ? 1 : -1,
    t: 0,
    walkFrame: 0,
    down: 0,
  };
}

// The feet position of someone waiting at a kerb (in the strip behind it) or on the median.
function waitSpot(col, row) {
  const y = rowY(row);
  if (row === 0) return { x: colX(col), y: y - 2 };
  if (row === layout.bottom) return { x: colX(col), y: y + ROW + WAIT_H - 1 };
  return { x: colX(col), y: y + ROW - 7 }; // median: on the island
}
function cellFeet(col, row) {
  return { x: colX(col), y: rowY(row) + ROW - 4 };
}
function rowY(r) {
  return WAIT_H + r * ROW; // world y; the top wait strip sits above row 0
}

function waitingAt(row) {
  return people.filter((p) => (p.kind === 'waiting' || p.kind === 'pending') && p.home === row);
}

function spawnWaiting(row, nearCol = null) {
  const taken = new Set(people.filter((p) => p.home === row && p.kind !== 'leaving').map((p) => p.col));
  let col = nearCol;
  if (col == null || taken.has(col)) {
    const free = [];
    for (let c = 0; c < COLS; c++) if (!taken.has(c)) free.push(c);
    if (!free.length) return null;
    col = pick(free);
  }
  const dest = row === 0 ? layout.bottom : row === layout.bottom ? 0 : rnd() < 0.5 ? 0 : layout.bottom;
  const p = makePerson('waiting', col, row, dest);
  const s = waitSpot(col, row);
  p.vx = p.tx = s.x;
  p.vy = p.ty = s.y;
  // They walk in from the side of the screen.
  if (row !== 0 && row !== layout.bottom) {
    p.fade = 0;
  } else {
    p.vx = col < COLS / 2 ? -20 : PLAY_W + 20;
    p.fx = p.vx;
    p.fy = p.vy;
    p.tw = 0;
    p.twDur = Math.abs(p.tx - p.vx) / 28;
    p.walking = true;
  }
  people.push(p);
  return p;
}

// ---------- Street set-up ----------

function setupStreet(idx, { attract = false } = {}) {
  game.street = idx;
  layout = buildLayout(idx);
  vehicles = [];
  people = [];
  line = [];
  popups = [];
  game.arrived = 0;
  game.crossing = 0;
  game.closeGain = 0;
  game.pendingChange = false;
  game.siren = null;
  game.sirenIn = rand(9, 14);
  game.spawnIn = [rand(2, 4), rand(2, 4)];
  game.medianIn = 4;
  game.walk = layout.s.crosswalk ? { col: layout.crossCol, t: 0, phase: 'stop', hold: 0 } : null;
  // Lanes start staggered: neighbours never in the same phase.
  layout.lanes.forEach((ln, i) => {
    ln.phase = i % 2 === 0 ? 'on' : 'off';
    ln.t = ln.phase === 'on' ? rand(ln.on[0], ln.on[1]) * (0.4 + 0.5 * rnd()) : rand(ln.off[0], ln.off[1]) * (0.4 + 0.5 * rnd());
    ln.spawnIn = rand(0, 1);
  });
  // Leader on the bottom kerb, heading up.
  leader.col = 5;
  leader.row = layout.bottom;
  leader.from = layout.bottom;
  leader.heading = 0;
  leader.down = 0;
  const f = cellFeet(leader.col, leader.row);
  leader.vx = leader.fx = f.x;
  leader.vy = leader.fy = f.y;
  leader.tw = 1;
  trail = [{ col: leader.col, row: leader.row }];
  // People already waiting: one right next to the leader.
  const near = spawnWaiting(layout.bottom, leader.col + 1);
  const others = attract ? 4 : 2;
  for (let i = 0; i < others; i++) spawnWaiting(layout.bottom);
  for (let i = 0; i < 3; i++) spawnWaiting(0);
  for (const p of people) {
    // Already in place.
    p.vx = p.tx;
    p.vy = p.ty;
    p.tw = 1;
    p.walking = false;
  }
  if (layout.s.median) {
    const m = layout.rows.indexOf('M');
    const p = spawnWaiting(m);
    if (p) p.fade = 1;
  }
  void near;
  resize();
  // The road starts with traffic already in it.
  for (let i = 0; i < 12 * 30; i++) updateTraffic(1 / 30, true);
}

// ---------- Traffic ----------

function speedMul() {
  return (1 - 0.25 * game.assist) * Math.pow(1.04, game.round);
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
  if (game.siren && game.siren.lane === ln.row) ln.light = 'siren';
}

// The furthest a vehicle's front may go this frame: behind the vehicle ahead, and before the
// crosswalk while it is closed to cars.
function stopLineS(v) {
  const w = game.walk;
  if (!w) return Infinity;
  const x0 = colX(w.col) - CW / 2 - 1;
  const x1 = colX(w.col) + CW / 2 + 1;
  // In s along this vehicle's lane: the crosswalk's near edge.
  const sNear = v.dir === 1 ? x0 + ENTRY : PLAY_W + ENTRY - x1;
  if (v.s > sNear + 0.5) return Infinity; // already at or over it: drive on
  if (w.phase === 'walk') return sNear;
  if (w.phase === 'clear') return sNear; // stopping for the walk that is coming
  // Walk has ended: wait for a person still on the crosswalk in this lane, for at most 2 s.
  if (w.hold > 0 && personOnCell(w.col, v.lane)) return sNear;
  return Infinity;
}

function personOnCell(col, row) {
  if (leader.col === col && leader.row === row && !leader.down) return true;
  return line.some((p) => p.col === col && p.row === row);
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
  if (layout.s.sirens && !quiet) {
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
  // Crosswalk light.
  const w = game.walk;
  if (w) {
    w.t += dt;
    if (w.hold > 0) w.hold -= dt;
    if (w.phase === 'stop' && w.t >= 8) {
      w.phase = 'clear';
      w.t = 0;
    } else if (w.phase === 'clear') {
      // Walk shows once no vehicle is on the crosswalk.
      const x0 = colX(w.col) - CW / 2;
      const x1 = colX(w.col) + CW / 2;
      const busy = vehicles.some((v) => {
        const x = vxOf(v);
        return x < x1 && x + v.w > x0;
      });
      if (!busy || w.t > 6) {
        w.phase = 'walk';
        w.t = 0;
        if (!quiet && game.mode === 'play') sfx('walk', { gain: 0.5 });
      }
    } else if (w.phase === 'walk' && w.t >= 4) {
      w.phase = 'stop';
      w.t = 0;
      w.hold = 2;
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

// ---------- The line ----------
//
// The leader's path is the trail: trail[trail.length - 1] is the leader's cell. Each follower walks
// the trail on their own, one cell every FOLLOW_STEP, stopping one cell behind the person ahead.
// Before stepping from a kerb or the median into a lane, a follower looks: they wait while a vehicle
// would reach that cell within GATE_TIME. In a lane they keep walking.

const FOLLOW_STEP = 0.18;
const GATE_TIME = 1.0;
const ROAD_LOOK = 0.5;
const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

// Which way a tap goes: toward the kerb the leader is heading for (on a kerb, the other one).
function forwardDir() {
  return leader.heading === 0 ? 'up' : 'down';
}

function canAct() {
  return game.mode === 'play' && !game.paused && game.grace <= 0 && !leader.down;
}

function step(dirName) {
  if (!canAct()) return false;
  const [dx, dy] = DIRS[dirName];
  const col = leader.col + dx;
  const row = leader.row + dy;
  if (col < 0 || col >= COLS || row < 0 || row > layout.bottom) {
    bump();
    return false;
  }
  const wasKerb = isKerb(leader.row);
  trail.push({ col, row });
  trimTrail();
  moveLeader(col, row, dx);
  if (wasKerb && isLane(row)) {
    game.crossing = 0;
    game.closeGain = 0;
  }
  if (isKerb(row)) {
    leader.from = row;
    leader.heading = row === 0 ? layout.bottom : 0;
  }
  if (!game.clockRunning) game.clockRunning = true;
  sfx(rnd() < 0.5 ? 'step' : 'step2', { rate: rand(0.9, 1.15), gain: 0.55 });
  askNearby();
  return true;
}

// Drop the part of the trail behind the last follower.
function trimTrail() {
  const lowest = line.length ? Math.min(...line.map((p) => p.pos)) : trail.length - 1;
  if (lowest > 0) {
    trail.splice(0, lowest);
    for (const p of line) p.pos -= lowest;
  }
}

function moveLeader(col, row, dx) {
  leader.fx = leader.vx;
  leader.fy = leader.vy;
  leader.col = col;
  leader.row = row;
  leader.tw = 0;
  leader.walkFrame ^= 1;
  if (dx) leader.face = dx > 0 ? 1 : -1;
}

function movePerson(p, col, row, dur = STEP_TWEEN) {
  p.fx = p.vx;
  p.fy = p.vy;
  if (col !== p.col) p.face = col > p.col ? 1 : -1;
  p.col = col;
  p.row = row;
  const f = cellFeet(col, row);
  p.tx = f.x;
  p.ty = f.y;
  p.tw = 0;
  p.twDur = dur;
  p.walkFrame ^= 1;
}

function bump() {
  sfx('bump', { gain: 0.5 });
  leader.nudge = 0.15;
}

// Would a vehicle be on this lane cell within `t` seconds?
function laneBusy(col, row, t) {
  const x = colX(col);
  const a = x - PERSON_HALF - 1;
  const b = x + PERSON_HALF + 1;
  const mul = speedMul();
  for (const v of vehicles) {
    if (v.lane !== row) continue;
    let [x0, x1] = boxOf(v);
    const reach = v.speed * mul * t;
    if (v.dir === 1) x1 += reach;
    else x0 -= reach;
    if (x0 < b && x1 > a) return true;
  }
  return false;
}

function updateFollowers(dt) {
  for (let i = 0; i < line.length; i++) {
    const p = line[i];
    p.walkT = (p.walkT || 0) - dt;
    if (p.walkT > 0) continue;
    let maxPos = i === 0 ? trail.length - 2 : line[i - 1].pos - 1;
    // The leader standing on this follower's kerb doesn't keep them from arriving there.
    if (i === 0 && trail[trail.length - 1].row === p.dest) maxPos = trail.length - 1;
    if (p.pos >= maxPos) {
      p.looking = false;
      continue;
    }
    const next = trail[p.pos + 1];
    // Looking before a lane: from a kerb or the median, wait while a car would reach the cell within
    // GATE_TIME; in the road, wait only if that cell is about to be hit and where they stand isn't.
    const waitHere = isLane(next.row) && (isSafe(p.row) ? laneBusy(next.col, next.row, GATE_TIME) : laneBusy(next.col, next.row, ROAD_LOOK) && !laneBusy(p.col, p.row, ROAD_LOOK));
    if (waitHere) {
      p.looking = true; // waiting for the car to pass
      continue;
    }
    p.looking = false;
    const prev = { row: p.row, col: p.col };
    p.pos += 1;
    const far = Math.abs(next.col - p.col) + Math.abs(next.row - p.row);
    movePerson(p, next.col, next.row, Math.min(0.5, FOLLOW_STEP * 0.75 * Math.max(1, far)));
    p.walkT = FOLLOW_STEP;
    checkLeaveNear(prev.row, prev.col, p.id, p);
    if (p.row === p.dest) {
      arrive(p, i);
      i--;
    }
  }
  trimTrail();
}

// The people waiting next to the leader are asked to join; they join the end of the line once
// nobody in it is in a lane, so they never start out in the road.
function askNearby() {
  if (!leader.down && isSafe(leader.row) && game.mode === 'play') {
    for (const p of people) {
      if (p.kind !== 'waiting' || p.home !== leader.row || p.tw < 1) continue;
      if (Math.abs(p.col - leader.col) <= 1 && p.dest !== leader.row) {
        p.kind = 'pending';
        p.t = 0;
      }
    }
  }
  tryJoins();
}

function removeFromLine(i) {
  line.splice(i, 1);
}

function arrive(p, i) {
  removeFromLine(i);
  game.crossing += 1;
  const n = game.crossing;
  game.score += n;
  game.clock += 0.5 + 0.5 * n;
  game.arrived += 1;
  game.assist = Math.max(0, game.assist - 0.03);
  p.kind = 'leaving';
  p.t = 0;
  const f = cellFeet(p.col, p.row);
  p.tx = f.x;
  p.ty = p.row === 0 ? f.y - 40 : f.y + 40;
  p.fx = p.vx;
  p.fy = p.vy;
  p.tw = 0;
  p.twDur = 1.2;
  popups.push({ x: f.x, y: f.y - 18, text: `+${n}`, t: 0, color: '#ffd23f', big: true });
  sfx('arrive', { rate: Math.min(2, 1 + 0.07 * (n - 1)), gain: 0.7 });
  if (game.arrived >= questQuota() && !game.pendingChange) game.pendingChange = true;
}

function questQuota() {
  return street().quota;
}

function tryJoins() {
  const pend = people.filter((p) => p.kind === 'pending');
  for (const p of pend) {
    // Too far from the leader now: back to waiting.
    if (Math.abs(leader.row - p.home) > 2 || leader.down) {
      p.kind = 'waiting';
      continue;
    }
    if (line.some((q) => isLane(q.row))) continue;
    // Join at the end: their own cell becomes the start of the trail.
    trail.unshift({ col: p.col, row: p.home });
    for (const q of line) q.pos += 1;
    p.pos = 0;
    p.walkT = 0.15;
    p.kind = 'follower';
    line.push(p);
    movePerson(p, p.col, p.home, 0.22);
    sfx('join', { rate: rand(0.95, 1.1), gain: 0.7 });
  }
}

// ---------- Hits ----------

function hitBoxPerson(p) {
  const x = colX(p.col);
  return [x - PERSON_HALF, x + PERSON_HALF];
}

function knock(p, i) {
  removeFromLine(i);
  sendBack(p);
}

function sendBack(p) {
  p.kind = 'back';
  p.down = 0.8; // tumbling, then walking back
  p.t = 0;
  p.fx = p.vx;
  p.fy = p.vy;
}

function hitLeader() {
  leader.down = 1.5;
  game.assist = Math.min(1, game.assist + 0.25);
  game.shake = 0.25;
  // Everyone scatters back to where they waited.
  for (const p of line) sendBack(p);
  line = [];
  for (const p of people) if (p.kind === 'pending') p.kind = 'waiting';
}

function checkHits() {
  if (game.grace > 0) return;
  const lanePeople = [];
  if (!leader.down && isLane(leader.row)) lanePeople.push({ p: leader, i: -1 });
  line.forEach((p, i) => isLane(p.row) && lanePeople.push({ p, i }));
  let leaderHit = false;
  const knocked = [];
  for (const { p, i } of lanePeople) {
    const [a, b] = hitBoxPerson(p);
    for (const v of vehicles) {
      if (v.lane !== p.row) continue;
      const [x0, x1] = boxOf(v);
      if (x0 < b && x1 > a) {
        if (i < 0) leaderHit = true;
        else knocked.push(p);
        sfx('hit', { gain: 0.8 });
        sfx('horn', { gain: 0.45, rate: rand(0.95, 1.08) });
        break;
      }
      // Close calls: the gap between them in this lane.
      const gap = x0 >= b ? x0 - b : a - x1;
      const key = i < 0 ? 'L' : p.id;
      if (gap < NEAR && !v.near.has(key)) {
        v.near.add(key);
      }
      // It has passed this person after coming close: a close call.
      const passed = v.dir === 1 ? x0 > b : x1 < a;
      if (passed && v.near.has(key) && !v.passed.has(key) && gap < NEAR + 1) {
        v.passed.add(key);
        closeCall(p);
      }
    }
  }
  if (leaderHit) {
    hitLeader();
    return;
  }
  for (const p of knocked) {
    const i = line.indexOf(p);
    if (i >= 0) {
      knock(p, i);
      game.assist = Math.min(1, game.assist + 0.25);
    }
  }
}

function closeCall(p) {
  if (game.closeGain >= 1 - 1e-9) return;
  const add = Math.min(0.3, 1 - game.closeGain);
  game.closeGain += add;
  game.clock += add;
  popups.push({ x: colX(p.col), y: rowY(p.row) - 2, text: 'close!', t: 0, color: '#9fe7ff', big: false });
}

// A person leaving a lane while a vehicle is right on them is also a close call.
function checkLeaveNear(prevRow, col, key, p) {
  if (!isLane(prevRow)) return;
  const x = colX(col);
  for (const v of vehicles) {
    if (v.lane !== prevRow) continue;
    const [x0, x1] = boxOf(v);
    const gap = x0 >= x + PERSON_HALF ? x0 - x - PERSON_HALF : x - PERSON_HALF - x1;
    const coming = v.dir === 1 ? x1 <= x : x0 >= x;
    if (coming && gap >= 0 && gap < NEAR && !v.passed.has(key)) {
      v.passed.add(key);
      closeCall(p);
    }
  }
}

// ---------- People update ----------

function updatePeople(dt) {
  for (const p of people) {
    p.t += dt;
    if (p.tw < 1) {
      p.tw = Math.min(1, p.tw + dt / (p.twDur || STEP_TWEEN));
      p.vx = p.fx + (p.tx - p.fx) * p.tw;
      p.vy = p.fy + (p.ty - p.fy) * p.tw;
      if (p.tw >= 1) p.walking = false;
    }
    if (p.fade != null && p.fade < 1) p.fade = Math.min(1, p.fade + dt * 2);
    if (p.kind === 'back') {
      if (p.down > 0) {
        p.down -= dt;
        if (p.down <= 0) {
          // Walk back to where they waited.
          const taken = new Set(people.filter((q) => q !== p && q.home === p.home && (q.kind === 'waiting' || q.kind === 'pending')).map((q) => q.col));
          let col = p.col;
          for (let d = 0; d < COLS && taken.has(col); d++) col = (p.col + d) % COLS;
          p.col = col;
          p.row = p.home;
          const s = waitSpot(col, p.home);
          p.fx = p.vx;
          p.fy = p.vy;
          p.tx = s.x;
          p.ty = s.y;
          p.tw = 0;
          p.twDur = Math.max(0.6, Math.hypot(p.tx - p.vx, p.ty - p.vy) / 40);
          p.walking = true;
          p.face = p.tx > p.vx ? 1 : -1;
        }
      } else if (p.tw >= 1) {
        p.kind = 'waiting';
      }
    }
  }
  people = people.filter((p) => !(p.kind === 'leaving' && p.tw >= 1));
  // Leader tween.
  if (leader.tw < 1) {
    leader.tw = Math.min(1, leader.tw + dt / STEP_TWEEN);
    const f = cellFeet(leader.col, leader.row);
    leader.vx = leader.fx + (f.x - leader.fx) * leader.tw;
    leader.vy = leader.fy + (f.y - leader.fy) * leader.tw;
  }
  if (leader.nudge > 0) leader.nudge -= dt;
  if (leader.down > 0) {
    leader.down -= dt;
    if (leader.down <= 0) {
      // Back on the kerb it last left.
      leader.down = 0;
      leader.row = leader.from;
      leader.heading = leader.from === 0 ? layout.bottom : 0;
      const f = cellFeet(leader.col, leader.row);
      leader.fx = leader.vx = f.x;
      leader.fy = leader.vy = f.y;
      leader.tw = 1;
      trail = [{ col: leader.col, row: leader.row }];
    }
  }
  // New people arrive on the kerbs.
  if (game.mode === 'play' || game.mode === 'title') {
    [0, layout.bottom].forEach((row, i) => {
      game.spawnIn[i] -= dt;
      if (game.spawnIn[i] <= 0) {
        game.spawnIn[i] = 3;
        if (waitingAt(row).length < 6) spawnWaiting(row);
      }
    });
    if (layout.s.median) {
      game.medianIn -= dt;
      if (game.medianIn <= 0) {
        game.medianIn = 6;
        const m = layout.rows.indexOf('M');
        if (waitingAt(m).length < 2) {
          const p = spawnWaiting(m);
          if (p) p.fade = 0;
        }
      }
    }
  }
  for (const pp of popups) pp.t += dt;
  popups = popups.filter((pp) => pp.t < 1.1);
}

// ---------- Run flow ----------

function startGame(idx = 0) {
  game.mode = 'play';
  game.paused = false;
  game.round = 0;
  game.clock = START_CLOCK;
  game.clockRunning = false;
  game.score = 0;
  game.grace = 0;
  game.lastTick = 0;
  game.assist = saved.assist == null ? 0.4 : Math.min(0.7, 0.6 * saved.assist);
  game.runAssistStart = game.assist;
  game.startStreet = idx;
  setupStreet(idx);
  ui.start.hidden = true;
  ui.over.hidden = true;
  ui.paused.hidden = true;
  ui.hud.hidden = false;
  showBanner();
  sfx('start', { gain: 0.6 });
  startMusic();
  syncHud();
}

let stopMusic = null;
function startMusic() {
  if (!stopMusic) stopMusic = sound.loop('music', { gain: 0.22 });
}
function endMusic() {
  if (stopMusic) stopMusic();
  stopMusic = null;
}

function beginChange() {
  game.mode = 'change';
  game.changeT = 2;
  game.changed = false;
  sfx('street', { gain: 0.7 });
}

function updateChange(dt) {
  game.changeT -= dt;
  if (!game.changed && game.changeT <= 1) {
    game.changed = true;
    let next = game.street + 1;
    if (next >= STREETS.length) {
      next = STREETS.length - 1;
      game.round += 1;
    }
    saved.reached = Math.max(saved.reached || 0, next);
    save();
    setupStreet(next);
    game.clock += STREET_BONUS;
    popups.push({ x: PLAY_W / 2, y: rowY(layout.bottom) - 4, text: `+${STREET_BONUS} s`, t: -0.6, color: '#5ae17c', big: true });
    showBanner();
  }
  if (game.changeT <= 0) {
    game.mode = 'play';
    ui.banner.hidden = true;
  }
}

function endRun() {
  game.mode = 'over';
  game.clock = 0;
  saved.best = Math.max(saved.best || 0, game.score);
  saved.assist = game.assist;
  save();
  endMusic();
  sfx('over', { gain: 0.7 });
  ui.finalScore.textContent = String(game.score);
  const name = street().name + (game.round ? ` (round ${game.round + 1})` : '');
  ui.finalDetail.textContent = `You reached ${name}. Best: ${saved.best}.`;
  ui.hud.hidden = true;
  ui.banner.hidden = true;
  ui.over.hidden = false;
}

function showStart() {
  game.mode = 'title';
  game.paused = false;
  setupStreet(0, { attract: true });
  ui.over.hidden = true;
  ui.paused.hidden = true;
  ui.hud.hidden = true;
  ui.banner.hidden = true;
  ui.start.hidden = false;
  ui.chips.innerHTML = '';
  const reached = Math.min(saved.reached || 0, STREETS.length - 1);
  ui.chips.hidden = reached < 1;
  for (let i = 1; i <= reached; i++) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.textContent = `${i + 1} · ${STREETS[i].name}`;
    b.dataset.street = String(i);
    b.addEventListener('click', () => startGame(i));
    ui.chips.appendChild(b);
  }
}

function showBanner() {
  ui.bannerNum.textContent = game.round ? `Street ${game.street + 1} · round ${game.round + 1}` : `Street ${game.street + 1}`;
  ui.bannerName.textContent = street().name;
  ui.banner.hidden = false;
  clearTimeout(showBanner.t);
  if (game.mode === 'play') showBanner.t = setTimeout(() => game.mode === 'play' && (ui.banner.hidden = true), 1600);
}

// ---------- Update ----------

function update(dt) {
  game.time += dt;
  if (game.paused) return;
  if (game.shake > 0) game.shake -= dt;
  if (game.mode === 'change') {
    updateChange(dt);
    updateTraffic(dt);
    updatePeople(dt);
    return;
  }
  if (game.grace > 0) game.grace -= dt;
  updateTraffic(dt);
  updatePeople(dt);
  if (game.mode !== 'play') return;
  updateFollowers(dt);
  askNearby();
  checkHits();
  if (game.clockRunning) {
    game.clock -= dt;
    const whole = Math.ceil(game.clock);
    if (game.clock <= 5 && game.clock > 0 && whole !== game.lastTick) {
      game.lastTick = whole;
      sfx('tick', { gain: 0.6 });
    }
    if (game.clock <= 0) {
      endRun();
      return;
    }
  }
  if (game.pendingChange && !leader.down && isKerb(leader.row) && line.every((p) => isKerb(p.row))) beginChange();
  // Input: a held press repeats steps.
  if (input.holding) {
    input.holdT -= dt;
    if (input.holdT <= 0) {
      input.holdT = HOLD_REPEAT;
      input.held = true;
      step(forwardDir());
    }
  }
  if (input.queued && leader.tw >= 1) {
    const d = input.queued;
    input.queued = null;
    doStep(d);
  }
}

// Steps from input go through here: one can be queued during a step's tween.
function doStep(dir) {
  if (leader.tw < 1) {
    input.queued = dir;
    return;
  }
  const prevLeader = { row: leader.row, col: leader.col };
  const d = dir === 'forward' ? forwardDir() : dir;
  if (step(d)) checkLeaveNear(prevLeader.row, prevLeader.col, 'L', leader);
}

// ---------- Input ----------

const input = { id: null, x: 0, y: 0, t: 0, holding: false, holdT: 0, held: false, queued: null, swallow: false };
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
  input.held = false;
  input.holding = !input.swallow && game.mode === 'play';
  input.holdT = HOLD_DELAY;
  try {
    canvas.setPointerCapture(e.pointerId);
  } catch (err) {
    // Synthetic pointers can't be captured.
  }
});

function endPointer(e, cancelled) {
  if (e.pointerId !== input.id) return;
  input.id = null;
  input.holding = false;
  if (input.swallow) {
    input.swallow = false;
    return;
  }
  if (cancelled || input.held) return;
  const dx = e.clientX - input.x;
  const dy = e.clientY - input.y;
  if (Math.hypot(dx, dy) >= 18) doStep(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up');
  else doStep('forward');
}
canvas.addEventListener('pointerup', (e) => endPointer(e, false));
canvas.addEventListener('pointercancel', (e) => endPointer(e, true));
canvas.addEventListener('pointermove', (e) => {
  if (e.pointerId !== input.id || !input.holding) return;
  if (Math.hypot(e.clientX - input.x, e.clientY - input.y) > 12) input.holding = false; // it's a swipe
});
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

const KEYS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', s: 'down', a: 'left', d: 'right', W: 'up', S: 'down', A: 'left', D: 'right', ' ': 'forward' };
let lastKey = 0;
window.addEventListener('keydown', (e) => {
  const dir = KEYS[e.key];
  if (game.paused && (dir || e.key === 'Enter')) {
    e.preventDefault();
    resume();
    return;
  }
  if (!dir || game.mode !== 'play') return;
  if (e.target instanceof Element && e.target.closest('button')) {
    if (e.key === ' ') return; // Space on a focused button presses it
  }
  e.preventDefault();
  const now = performance.now();
  if (e.repeat && now - lastKey < 120) return;
  lastKey = now;
  doStep(dir);
});

// ---------- Pause ----------

function pause() {
  if (game.mode !== 'play' && game.mode !== 'change') return;
  game.paused = true;
  input.holding = false;
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
let offX = 0; // device px from the screen's left edge to the street's
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
  const variants = SHIRTS.map((s, i) => ['s' + i, s]).concat([['hivis', HIVIS]]);
  for (const sex of ['man', 'woman']) {
    for (const pose of POSES) {
      const base = cut(sex + pose);
      const shirtFrom = sex === 'man' ? MAN_SHIRT : WOMAN_SHIRT;
      for (const [key, shirt] of variants) {
        const c = recolor(base, [
          [shirtFrom[0], shirt[0]],
          [shirtFrom[1], shirt[1]],
        ]);
        sprites[`${sex}${pose}:${key}`] = [c, flip(c)];
        if (key !== 'hivis') {
          const g = grey(c);
          sprites[`${sex}${pose}:${key}:grey`] = [g, flip(g)];
        }
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
  LW = PLAY_W;
  LH = Math.ceil(vh / scale);
  low.width = LW;
  low.height = LH;
  originX = 0;
  offX = Math.round(((vw - PLAY_W * scale) / 2) * dpr);
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
  const buildRng = mulberry(game.street * 97 + 13);
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
  const treeRng = mulberry(game.street * 31 + 5);
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
  // Crosswalk stripes.
  const w = game.walk;
  if (w) {
    const x0 = px(colX(w.col) - CW / 2);
    for (let r = 1; r < layout.bottom; r++) {
      if (!isLane(r)) continue;
      const y = py(rowY(r));
      g.fillStyle = 'rgba(245,245,240,0.85)';
      for (let sy = y + 2; sy < y + ROW - 1; sy += 4) g.fillRect(x0 + 1, sy, CW - 2, 2);
    }
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

function personSprite(p, isLeader) {
  const sex = p.woman ? 'woman' : 'man';
  let pose = '';
  const moving = isLeader ? leader.tw < 1 : p.tw < 1 || p.walking;
  if (p.down > 0 && (isLeader || p.kind === 'back')) pose = p.down > (isLeader ? 1.1 : 0.5) ? '_fall' : '_down';
  else if (moving) pose = p.walkFrame ? '_walk1' : '_walk2';
  else if (p.kind === 'pending' && Math.floor(p.t * 4) % 2 === 0) pose = '_point';
  const key = isLeader ? 'hivis' : `s${p.shirt}`;
  const greyed = !isLeader && p.kind === 'back';
  return sprites[`${sex}${pose}:${key}${greyed ? ':grey' : ''}`];
}

function drawPerson(p, isLeader = false) {
  const spr = personSprite(p, isLeader);
  if (!spr) return;
  const img = p.face === 1 ? spr[0] : spr[1];
  const hop = (isLeader ? leader.tw : p.tw) < 1 ? Math.sin(Math.PI * (isLeader ? leader.tw : p.tw)) * 2 : 0;
  let x = px(p.vx - img.width / 2);
  if (isLeader && leader.nudge > 0) x += Math.round(Math.sin(leader.nudge * 60) * 1);
  const y = py(p.vy - img.height - hop);
  if (p.fade != null && p.fade < 1) lctx.globalAlpha = p.fade;
  if (p.kind === 'leaving') lctx.globalAlpha = Math.max(0, 1 - p.tw * 1.1);
  lctx.drawImage(img, x, y);
  lctx.globalAlpha = 1;
  if (isLeader && !(p.down > 0)) {
    // The lollipop sign, held up.
    const sx = x + (p.face === 1 ? img.width : -2);
    const sy = y - 7;
    lctx.fillStyle = '#c8e0ff';
    lctx.fillRect(sx, sy + 5, 1, 8);
    lctx.fillStyle = '#c03e41';
    lctx.fillRect(sx - 2, sy, 5, 5);
    lctx.fillRect(sx - 1, sy - 1, 3, 7);
    lctx.fillRect(sx - 3, sy + 1, 7, 3);
    lctx.fillStyle = '#f5f5f5';
    lctx.fillRect(sx - 1, sy + 2, 3, 1);
  }
  // A waiting person's arrow: which kerb they want.
  if (!isLeader && (p.kind === 'waiting' || p.kind === 'pending') && p.tw >= 1) {
    const up = p.dest === 0;
    const ax = x + Math.floor(img.width / 2);
    const bob = Math.round(Math.sin(game.time * 4 + p.id) * 0.8);
    const ay = (up ? y - 5 : y - 3) + bob;
    lctx.fillStyle = p.kind === 'pending' ? '#ffd23f' : 'rgba(255,255,255,0.9)';
    if (up) {
      lctx.fillRect(ax, ay, 1, 1);
      lctx.fillRect(ax - 1, ay + 1, 3, 1);
      lctx.fillRect(ax - 2, ay + 2, 5, 1);
    } else {
      lctx.fillRect(ax - 2, ay, 5, 1);
      lctx.fillRect(ax - 1, ay + 1, 3, 1);
      lctx.fillRect(ax, ay + 2, 1, 1);
    }
  }
}

function drawRope() {
  if (!line.length) return;
  lctx.strokeStyle = 'rgba(255,210,63,0.75)';
  lctx.lineWidth = 1;
  lctx.beginPath();
  lctx.moveTo(px(leader.vx) + 0.5, py(leader.vy - 8) + 0.5);
  for (const p of line) lctx.lineTo(px(p.vx) + 0.5, py(p.vy - 8) + 0.5);
  lctx.stroke();
}

function drawLights() {
  // A light at each lane's entry: green while its platoon comes, red in the lull.
  for (const ln of layout.lanes) {
    const y = py(rowY(ln.row) + 3);
    const x = ln.dir === 1 ? 1 : LW - 5; // at the screen's edge, where the lane's traffic comes in
    lctx.fillStyle = '#20232b';
    lctx.fillRect(x, y, 4, 9);
    if (ln.light === 'siren') {
      const on = Math.floor(game.time * 8) % 2 === 0;
      lctx.fillStyle = on ? '#ff3b3b' : '#3b8bff';
      lctx.fillRect(x + 1, y + 1, 2, 7);
      // The lane's edge flashes.
      lctx.fillStyle = on ? 'rgba(255,59,59,0.35)' : 'rgba(59,139,255,0.35)';
      const ex = ln.dir === 1 ? 0 : LW - 6;
      lctx.fillRect(ex, py(rowY(ln.row)), 6, ROW);
    } else {
      lctx.fillStyle = ln.light === 'red' ? '#ff4b4b' : '#3a1515';
      lctx.fillRect(x + 1, y + 1, 2, 3);
      lctx.fillStyle = ln.light === 'green' ? '#5ae17c' : '#14301c';
      lctx.fillRect(x + 1, y + 5, 2, 3);
    }
  }
  // The crosswalk's walk signal, on both kerbs.
  const w = game.walk;
  if (w) {
    for (const r of [0, layout.bottom]) {
      const x = px(colX(w.col) + CW / 2 + 1);
      const y = r === 0 ? py(rowY(0)) - 8 : py(rowY(r) + ROW) + 2;
      lctx.fillStyle = '#c8e0ff';
      lctx.fillRect(x + 2, y + 6, 1, 6);
      lctx.fillStyle = '#20232b';
      lctx.fillRect(x, y, 5, 6);
      lctx.fillStyle = w.phase === 'walk' ? '#f5f5f5' : '#ff6a3b';
      if (w.phase === 'walk') {
        lctx.fillRect(x + 2, y + 1, 1, 1);
        lctx.fillRect(x + 1, y + 2, 3, 2);
        lctx.fillRect(x + 1, y + 4, 1, 1);
        lctx.fillRect(x + 3, y + 4, 1, 1);
      } else {
        lctx.fillRect(x + 1, y + 1, 3, 4);
      }
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
    if (band(leader.vy) === b) drawPerson(leader, true);
  };
  drawBand(-1);
  for (let r = 0; r <= layout.bottom; r++) {
    for (const v of vehicles) if (v.lane === r) drawVehicle(v);
    drawBand(r);
  }
  drawLights();
  drawRope();
  drawBand(layout.bottom + 1);
  if (pal.dark > 0) {
    lctx.fillStyle = `rgba(10,12,40,${pal.dark * 0.5})`;
    // Dim only the scenery above the street; people and the road stay lit.
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
  for (const pp of popups) {
    const a = Math.min(1, 2 - pp.t * 2);
    const x = (pp.x + originX) * k + offX;
    const y = (pp.y + originY - pp.t * 10) * k;
    ctx.globalAlpha = Math.max(0, a);
    ctx.font = `800 ${Math.round((pp.big ? 20 : 13) * dpr)}px system-ui, sans-serif`;
    ctx.lineWidth = 4 * dpr;
    ctx.strokeStyle = 'rgba(20,22,31,0.7)';
    ctx.strokeText(pp.text, x, y);
    ctx.fillStyle = pp.color;
    ctx.fillText(pp.text, x, y);
  }
  ctx.globalAlpha = 1;
  // The line's payout, shown at the kerb it is heading for before it is earned.
  const going = line.filter((p) => p.dest === leader.heading || (isKerb(leader.row) && p.dest === leader.row));
  if (game.mode === 'play' && going.length && line.some((p) => !isKerb(p.row) || p.row !== p.dest)) {
    const n = going.length;
    const a = game.crossing;
    const sum = (n * (2 * a + n + 1)) / 2;
    const target = going[0].dest;
    const yk = target === 0 ? rowY(0) - WAIT_H - 8 : rowY(layout.bottom) + ROW + WAIT_H + 8;
    const x = (colX(leader.col) + originX) * k + offX;
    const y = (yk + originY) * k;
    const text = `×${n} · +${sum}`;
    ctx.font = `800 ${Math.round(15 * dpr)}px system-ui, sans-serif`;
    const w = ctx.measureText(text).width + 16 * dpr;
    const h = 24 * dpr;
    const bx = Math.max(offX + 4 * dpr, Math.min(offX + PLAY_W * k - w - 4 * dpr, x - w / 2));
    ctx.fillStyle = 'rgba(20,22,31,0.62)';
    roundRect(bx, y - h / 2, w, h, h / 2);
    ctx.fill();
    ctx.fillStyle = '#ffd23f';
    ctx.fillText(text, bx + w / 2, y + dpr);
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
  chips: $('[data-chips]'),
  finalScore: $('[data-final-score]'),
  finalDetail: $('[data-final-detail]'),
  mute: $('[data-mute]'),
};
const drawn = { payout: null };

let hudCache = '';
function syncHud() {
  const c = Math.max(0, Math.ceil(game.clock));
  const q = Math.min(1, game.arrived / questQuota());
  const key = `${c}|${game.score}|${game.street}|${q}`;
  if (key === hudCache) return;
  hudCache = key;
  ui.clock.textContent = String(c);
  ui.clock.classList.toggle('low', game.clock <= 5 && game.mode === 'play');
  ui.score.textContent = String(game.score);
  ui.streetName.textContent = `${game.street + 1} · ${street().name}`;
  ui.quotaFill.style.width = `${q * 100}%`;
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
    const tile = new URLSearchParams(location.search).has('tile');
    showStart();
    resize();
    if (tile) {
      // For the landing page's tile picture: just the street.
      ui.start.hidden = true;
      document.querySelector('.shell-back')?.setAttribute('hidden', '');
      ui.mute.hidden = true;
    }
    last = performance.now();
    requestAnimationFrame(frame);
    window.__tagAlong = {
      game,
      leader,
      saved,
      heard,
      drawn,
      view,
      STREETS,
      startGame,
      showStart,
      step: update,
      move: doStep,
      forwardDir,
      pause,
      resume,
      spawnVehicle: (row, name = 'sedan', s) => {
        const v = spawnVehicle(laneAt(row), name);
        if (s != null) v.s = s;
        return v;
      },
      spawnWaiting,
      setupStreet,
      layout: () => layout,
      line: () => line,
      people: () => people,
      vehicles: () => vehicles,
      trail: () => trail,
      clearTraffic: () => {
        vehicles = [];
        for (const ln of layout.lanes) {
          ln.phase = 'off';
          ln.t = 999;
        }
        game.sirenIn = 999;
        game.siren = null;
      },
      // Set up a line directly: cells[0] is the leader, the rest followers (wanting dest), and
      // `tail` an extra cell of the leader's path behind the last follower.
      form: (cells, { dest = 0 } = {}) => {
        line = [];
        people = people.filter((p) => p.kind === 'waiting');
        const [c0, ...rest] = cells;
        moveLeader(c0[0], c0[1], 0);
        leader.tw = 1;
        const f = cellFeet(c0[0], c0[1]);
        leader.vx = f.x;
        leader.vy = f.y;
        trail = [...rest].reverse().map(([col, row]) => ({ col, row }));
        trail.push({ col: c0[0], row: c0[1] });
        rest.forEach(([col, row], i) => {
          const p = makePerson('follower', col, row, dest);
          p.home = dest === 0 ? layout.bottom : 0;
          p.pos = rest.length - 1 - i;
          p.walkT = 0;
          const g = cellFeet(col, row);
          p.vx = p.tx = g.x;
          p.vy = p.ty = g.y;
          people.push(p);
          line.push(p);
        });
        return line;
      },
      seed: (n) => {
        seed = n | 0;
      },
      colX,
      xOf: vxOf,
      ENTRY,
      PLAY_W,
      set manual(v) {
        manual = v;
      },
    };
  },
  () => {}
);

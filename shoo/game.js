// Shoo!: an airfield seen from above. Shoo the birds off the runways before each plane lands: a slow
// sweep of the reticle walks them away, a fast one makes them fly off and land somewhere else.
// Spec: specs/shoo.md.
//
// The field is laid out in "art px" (the Pixel Shmup pack's own pixels): a 180 × 330 portrait field,
// scaled to fit the screen below the HUD. Everything is simulated in art px on a fixed 1/120 s step,
// drawn at that resolution and enlarged with no smoothing, so the whole game is 8-bit.
import { mountShell } from '../shared/game-shell.js';

// ---------- Knobs ----------

const FW = 180; // field width, art px
const FH = 330; // field height
const HOUR_LEN = 75; // seconds per in-game hour
const QUIET = 6; // no landing in the first seconds of an hour
const STEP = 1 / 120;
const DECIDE = 3; // the decision point, seconds before touchdown
const APPROACH = { prop: 9, heavy: 7 }; // seconds from the top edge to touchdown
const ROLL_TIME = 4; // seconds of roll-out
const COMEBACK = 15; // a plane that went round lands again this much later
const HOLD_MAX = 3;
const FEAR_R = 24; // the scarer's reach, art px
const FAST = 70; // a scarer faster than this (art px/s) makes birds fly
const WALK = { gull: 15, goose: 10, starling: 17 }; // walking away, art px/s
const PULL = 2.4; // idle birds drift toward the nearest open runway, art px/s
const FLIGHT = [2, 4]; // seconds a panicked bird flies
const FLEE_DIST = { gull: [50, 80], starling: [80, 120] };
const SAFE_AFTER = 1.5; // a bird won't land on a runway whose decision is within flight + this
const FINGER_OFFSET = 64; // CSS px the reticle sits above a finger
const KEY_SPEED = 50; // art px/s; with Shift, KEY_FAST
const KEY_FAST = 140;
const STREAK_MAX = 5;
const BIRD_CAP = 150;
const ASSIST_STEP = 0.08;
const ASSIST_MAX = 0.25;

// One new thing per hour (06:00 … 09:00).
const HOURS = [
  { gap: 9.5, runways: ['A'], species: ['gull'], heavy: 0, flockEvery: 16, maxBirds: 14 },
  { gap: 6.5, runways: ['A', 'B'], species: ['gull'], heavy: 0, flockEvery: 14, maxBirds: 18 },
  { gap: 6.0, runways: ['A', 'B'], species: ['gull', 'goose'], heavy: 0, flockEvery: 13, newcomer: 'goose', maxBirds: 22 },
  { gap: 5.6, runways: ['A', 'B'], species: ['gull', 'goose', 'starling'], heavy: 0.3, flockEvery: 12, newcomer: 'starling', maxBirds: 28 },
];
const FLOCK_SIZE = { gull: [4, 7], goose: [3, 5], starling: [8, 12] };
const FIRST_EXTRA = 5; // the shift's first landing comes this much later, to learn the reticle
const EDGE = 6; // a panicked bird whose flight would end within this of the field's edge leaves

// ---------- The airfield ----------

// Two runways up the screen; planes come down from the top and touch down near the top end.
const RUNWAYS = {
  A: { id: 'A', x: 52, y0: 46, y1: 250, w: 16 },
  B: { id: 'B', x: 128, y0: 46, y1: 250, w: 16 },
};
const THRESHOLD = 58; // touchdown point, y
const WATER_X = 18; // a strip of water along the left edge
const APRON_Y = 268; // the terminal's apron below the runways
const BINS = [
  { x: 150, y: 286 },
  { x: 32, y: 286 },
];
const HOLD_C = { x: 90, y: 22 }; // the hold: planes circle here

// Is a point on a runway (the asphalt plus a pixel's margin)?
function onRunway(r, p) {
  return Math.abs(p.x - r.x) <= r.w / 2 + 1 && p.y >= r.y0 - 1 && p.y <= r.y1 + 1;
}

// ---------- Small helpers ----------

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- Memory (small, optional) ----------

function readMemory() {
  try {
    return JSON.parse(localStorage.getItem('shoo') || '{}') || {};
  } catch (e) {
    return {};
  }
}
function writeMemory(v) {
  try {
    localStorage.setItem('shoo', JSON.stringify(v));
  } catch (e) {
    // Blocked storage: nothing is kept, and the game still plays.
  }
}

// ---------- Sound ----------

const { sound } = mountShell({
  sounds: {
    flutter: 'sounds/flutter.mp3',
    chirp: 'sounds/chirp.mp3',
    clear: 'sounds/clear.mp3',
    land: 'sounds/land.mp3',
    tyre: 'sounds/tyre.mp3',
    streak: 'sounds/streak.mp3',
    engine: 'sounds/engine.mp3',
    alarm: 'sounds/alarm.mp3',
    hour: 'sounds/hour.mp3',
    click: 'sounds/click.mp3',
    done: 'sounds/done.mp3',
    music: 'sounds/music.mp3',
  },
});
const heard = []; // the sounds asked for, for tests
let lastSfx = {};
function sfx(name, opts, every = 0) {
  if (every && clock - (lastSfx[name] ?? -9) < every) return;
  lastSfx[name] = clock;
  heard.push(name);
  if (heard.length > 200) heard.shift();
  sound.play(name, opts);
}

// ---------- Art ----------

const tiles = new Image();
tiles.src = 'img/tiles.png';
const planesImg = new Image();
planesImg.src = 'img/planes.png';
// Ship sheet: row 0 four-engine heavies, row 1 single-engine props; columns blue, red, green, yellow.
const LIVERIES = [0, 1, 3];

// ---------- DOM ----------

const canvas = document.getElementById('field');
const ctx = canvas.getContext('2d');
const $ = (s) => document.querySelector(s);
const ui = {
  hud: $('[data-hud]'),
  clock: $('[data-clock]'),
  score: $('[data-score]'),
  streak: $('[data-streak]'),
  hold: $('[data-hold]'),
  mute: $('[data-mute]'),
  start: $('[data-screen="start"]'),
  full: $('[data-screen="full"]'),
  done: $('[data-screen="done"]'),
  paused: $('[data-screen="paused"]'),
  play: $('[data-play]'),
  from: $('[data-from]'),
  bestStart: $('[data-best-start]'),
  fullDetail: $('[data-full-detail]'),
  retry: $('[data-retry]'),
  newShift: $('[data-new]'),
  finalScore: $('[data-final-score]'),
  finalDetail: $('[data-final-detail]'),
  again: $('[data-again]'),
  resume: $('[data-resume]'),
};

// ---------- View ----------

let cssW = 0;
let cssH = 0;
let dpr = 1;
let S = 2; // CSS px per art px
let offX = 0; // field origin, CSS px
let offY = 0;
let hudBottom = 68;
let ground = null;
const GEXT = 360; // grass drawn this far beyond the field, art px

function resize() {
  cssW = window.innerWidth;
  cssH = window.innerHeight;
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  const insets = readInsets();
  hudBottom = insets.top + 12 + 44 + 8;
  const availW = cssW - insets.left - insets.right - 8;
  const availH = cssH - hudBottom - insets.bottom - 6;
  S = Math.max(0.5, Math.min(availW / FW, availH / FH));
  offX = insets.left + (cssW - insets.left - insets.right - FW * S) / 2;
  offY = hudBottom + (availH - FH * S) / 2;
  sizeLow();
}

const insetProbe = document.createElement('div');
insetProbe.style.cssText =
  'position:fixed;visibility:hidden;pointer-events:none;top:0;left:0;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
document.body.appendChild(insetProbe);
function readInsets() {
  const cs = getComputedStyle(insetProbe);
  return {
    top: parseFloat(cs.paddingTop) || 0,
    right: parseFloat(cs.paddingRight) || 0,
    bottom: parseFloat(cs.paddingBottom) || 0,
    left: parseFloat(cs.paddingLeft) || 0,
  };
}

const toField = (cx, cy) => ({ x: (cx - offX) / S, y: (cy - offY) / S });
const toScreen = (p) => ({ x: offX + p.x * S, y: offY + p.y * S });

// ---------- State ----------

const memory = readMemory();
let mode = 'start'; // start | play | full | done
let paused = false;
let manual = false; // tests step the simulation themselves
let clock = 0; // seconds since the page opened (animation)
let st = null; // the shift (snapshotted as each hour begins)
let snapshot = null;
let retries = 0; // retries of the current hour (the hidden assist)
let startHour = 0;
const scarer = { x: FW / 2, y: 180, active: false, held: 0, trail: [], speed: 0, kind: null };
let pointer = null; // the one finger or mouse moving the scarer
const keys = new Set();
const particles = [];
const popups = [];
const clouds = [];
let musicStop = null;

// The shift's random numbers live in its state, so a snapshot replays them exactly.
function rand() {
  let t = (st.seed = (st.seed + 0x6d2b79f5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const rr = (a, b) => a + rand() * (b - a);

function newShiftState(seed) {
  return {
    seed: seed >>> 0,
    hour: 0,
    t: 0,
    simTime: 0,
    score: 0,
    clean: 0,
    goarounds: 0,
    streak: 0,
    bestStreak: 0,
    birds: [],
    planes: [],
    landings: [], // scheduled: { at (simTime of touchdown), rw, kind, comeback }
    hold: [], // planes circling: { id, back (simTime it lands again), rw, kind }
    nextFlock: 0,
    nextId: 1,
    ending: false,
  };
}

const openRunways = () => (HOURS[Math.min(st.hour, HOURS.length - 1)] || HOURS[0]).runways;

// When does each runway next decide, in simTime? (Infinity if nothing is coming.)
function nextDecision(rw) {
  let best = Infinity;
  for (const p of st.planes) if (p.rw === rw && p.state === 'approach') best = Math.min(best, p.touch - DECIDE);
  for (const l of st.landings) if (l.rw === rw) best = Math.min(best, l.at - DECIDE);
  for (const h of st.hold) if (h.rw === rw) best = Math.min(best, h.back - DECIDE);
  return best;
}
// May a bird the player didn't move come onto this runway now (or land there in `within` s)?
function runwayGuarded(rw, within = 0) {
  if (st.planes.some((p) => p.rw === rw && (p.state === 'roll' || (p.state === 'approach' && p.cleared)))) return true;
  return nextDecision(rw) - st.simTime < Math.max(3, within + SAFE_AFTER);
}
// Push a point out of any runway it may not be on, to the nearer side.
function offGuarded(p, within) {
  for (const rw of Object.values(RUNWAYS)) {
    if (!onRunway(rw, p)) continue;
    if (!openRunways().includes(rw.id) || runwayGuarded(rw.id, within)) {
      p.x = p.x < rw.x ? rw.x - rw.w / 2 - 5 : rw.x + rw.w / 2 + 5;
    }
  }
  return p;
}
const runwayAt = (p) => Object.values(RUNWAYS).find((r) => onRunway(r, p));

// ---------- Birds ----------

function makeBird(sp, x, y, flock) {
  return { id: st.nextId++, sp, x, y, flock, state: 'ground', face: rand() < 0.5 ? -1 : 1, peck: rand() * 3, calm: 0, alert: 0, ax: 0, ay: 0, fl: null };
}

// A flock flies in from an edge and lands together on the grass, off the runways.
function arriveFlock(sp) {
  const [a, b] = FLOCK_SIZE[sp];
  const n = Math.round(rr(a, b));
  const cap = mode === 'play' ? HOURS[st.hour].maxBirds : BIRD_CAP;
  if (st.birds.length + n > Math.min(cap, BIRD_CAP) && st.birds.length) return;
  const flock = st.nextId++;
  const side = sp === 'gull' ? 2 : rand() < 0.5 ? 1 : 3;
  const from = side === 2 ? { x: rr(30, 150), y: FH + 10 } : { x: side === 1 ? FW + 10 : -10, y: rr(80, 240) };
  // A spot near a runway, beside it (never on one).
  const rw = RUNWAYS[openRunways()[Math.floor(rand() * openRunways().length)]];
  const spot = { x: rw.x + (rand() < 0.5 ? -1 : 1) * rr(16, 34), y: rr(80, 230) };
  for (let i = 0; i < n; i++) {
    const bird = makeBird(sp, from.x + rr(-8, 8), from.y + rr(-8, 8), flock);
    const to = offGuarded({ x: clamp(spot.x + rr(-9, 9), WATER_X + 3, FW - 4), y: clamp(spot.y + rr(-9, 9), 30, APRON_Y - 4) }, 99);
    for (const r of Object.values(RUNWAYS)) if (onRunway(r, to)) to.x = to.x < r.x ? r.x - r.w / 2 - 4 : r.x + r.w / 2 + 4;
    bird.state = 'fly';
    bird.fl = { fx: bird.x, fy: bird.y, tx: to.x, ty: to.y, t: 0, dur: rr(2.4, 3.4) };
    st.birds.push(bird);
  }
}

// Panic: lift off and land somewhere else, the spot shown from the start.
function takeOff(b, from) {
  if (b.state === 'fly') return;
  const dur = rr(FLIGHT[0], FLIGHT[1]);
  const [d0, d1] = FLEE_DIST[b.sp] || [50, 80];
  let ang = Math.atan2(b.y - from.y, b.x - from.x) + rr(-0.5, 0.5);
  let d = rr(d0, d1);
  let to = { x: b.x + Math.cos(ang) * d, y: b.y + Math.sin(ang) * d };
  if (b.sp === 'gull') {
    // Gulls head for the bins, within reach.
    const bin = BINS[b.x > FW / 2 ? 0 : 1];
    to = { x: to.x * 0.5 + bin.x * 0.5 + rr(-10, 10), y: to.y * 0.5 + (bin.y - 6) * 0.5 + rr(-8, 8) };
  }
  // Chased toward the field's edge, it leaves for good (gulls heading for the bins stay).
  if (to.x < EDGE || to.x > FW - EDGE || to.y < EDGE + 20) {
    const ang2 = Math.atan2(to.y - b.y, to.x - b.x);
    b.state = 'fly';
    b.leaving = true;
    b.fl = { fx: b.x, fy: b.y, tx: b.x + Math.cos(ang2) * 140, ty: b.y + Math.sin(ang2) * 140, t: 0, dur: 2.2 };
    b.face = Math.cos(ang2) >= 0 ? 1 : -1;
    return;
  }
  to.x = clamp(to.x, b.sp === 'gull' ? 4 : WATER_X + 3, FW - 4);
  to.y = clamp(to.y, 28, b.sp === 'gull' ? FH - 30 : APRON_Y - 4);
  offGuarded(to, dur);
  b.state = 'fly';
  b.fl = { fx: b.x, fy: b.y, tx: to.x, ty: to.y, t: 0, dur };
  b.face = to.x >= b.x ? 1 : -1;
}

function updateBirds(dt) {
  const live = mode === 'play';
  const sc = scarer.active ? scarer : null;
  const fast = sc && scarer.speed > FAST && scarer.held > 0.1;
  let lifted = 0;
  let walked = 0;
  // Planes on the ground push birds out of their way.
  const rollers = st.planes.filter((p) => p.state === 'roll' || (p.state === 'approach' && p.cleared && p.alt < 0.35));
  for (const b of st.birds) {
    if (b.state === 'fly') {
      const f = b.fl;
      f.t += dt;
      const k = Math.min(1, f.t / f.dur);
      b.x = f.fx + (f.tx - f.fx) * k;
      b.y = f.fy + (f.ty - f.fy) * k;
      b.alt = Math.sin(Math.PI * k);
      if (k >= 1) {
        if (b.leaving) {
          b.gone = true;
          continue;
        }
        b.state = 'ground';
        b.fl = null;
        b.alt = 0;
        b.calm = 1;
      }
      continue;
    }
    let vx = 0;
    let vy = 0;
    // The scarer.
    let scared = false;
    if (sc) {
      const d = Math.hypot(b.x - sc.x, b.y - sc.y);
      if (d < FEAR_R) {
        if (fast && b.sp !== 'goose') {
          takeOff(b, sc);
          lifted++;
          // The flock goes with it.
          for (const o of st.birds) if (o !== b && o.flock === b.flock && o.state === 'ground' && dist(o, b) < 22) takeOff(o, sc);
          continue;
        }
        if (!fast) {
          const k = 1 - d / FEAR_R / 1.6;
          vx += ((b.x - sc.x) / (d || 1)) * WALK[b.sp] * k;
          vy += ((b.y - sc.y) / (d || 1)) * WALK[b.sp] * k;
          b.alert = 0.6;
          scared = true;
          walked++;
        }
      }
    }
    // Rolling planes: out of the way, always.
    for (const p of rollers) {
      const ahead = (b.y - p.y) * 1; // planes roll down the screen
      const side = Math.abs(b.x - p.x);
      if (ahead > -10 && ahead < 30 && side < 16) {
        if (b.sp === 'goose') {
          vx += (b.x < p.x ? -1 : 1) * 40;
          scared = true;
        } else {
          takeOff(b, { x: p.x, y: p.y - 10 });
          lifted++;
        }
      }
    }
    if (b.state === 'fly') continue;
    if (b.alert > 0) {
      b.alert -= dt;
      // An alarmed bird moves its flockmates along with it.
      if (scared) for (const o of st.birds) if (o !== b && o.flock === b.flock && o.state === 'ground' && dist(o, b) < 12) o.ax = vx * 0.7, o.ay = vy * 0.7, o.alert = Math.max(o.alert, 0.3);
    }
    if (!scared && b.alert > 0) {
      vx += b.ax;
      vy += b.ay;
    }
    if (!scared && b.alert <= 0) {
      b.ax = b.ay = 0;
      b.calm += dt;
      // Warm tarmac: an idle bird drifts toward the nearest open runway, but never onto a guarded one.
      let best = null;
      for (const id of openRunways()) {
        const r = RUNWAYS[id];
        const dx = r.x - b.x;
        if (!best || Math.abs(dx) < Math.abs(best.dx)) best = { r, dx };
      }
      if (best && b.calm > 1 && !onRunway(best.r, b)) {
        const dir = Math.sign(best.dx);
        const nx = b.x + dir * PULL * dt;
        const blocked = runwayGuarded(best.r.id) && Math.abs(best.r.x - nx) <= best.r.w / 2 + 2;
        if (!blocked) vx += dir * PULL;
      }
      // Pecking about, and flock cohesion.
      b.peck -= dt;
      if (b.peck < 0) {
        b.peck = rr(0.8, 2.6);
        b.face = rand() < 0.5 ? -1 : 1;
      }
    }
    // Keep a pixel apart from neighbours.
    b.x += vx * dt;
    b.y += vy * dt;
    if (vx) b.face = vx > 0 ? 1 : -1;
    b.x = clamp(b.x, b.sp === 'gull' ? 3 : WATER_X + 2, FW - 3);
    b.y = clamp(b.y, 26, b.sp === 'gull' ? FH - 26 : APRON_Y - 3);
  }
  st.birds = st.birds.filter((b) => !b.gone);
  // Separation (cheap grid): birds don't stand on each other.
  separate();
  if (live || mode === 'start') {
    if (lifted) sfx('flutter', { rate: 0.9 + Math.random() * 0.3, gain: 0.7 }, 0.25);
    else if (walked) sfx('chirp', { rate: 1 + Math.random() * 0.4, gain: 0.35 }, 0.9);
  }
}

const GRID = 10;
function separate() {
  const cells = new Map();
  for (const b of st.birds) {
    if (b.state !== 'ground') continue;
    const k = ((b.x / GRID) | 0) + ',' + ((b.y / GRID) | 0);
    let c = cells.get(k);
    if (!c) cells.set(k, (c = []));
    c.push(b);
  }
  for (const c of cells.values()) {
    for (let i = 0; i < c.length; i++) {
      for (let j = i + 1; j < c.length; j++) {
        const a = c[i];
        const b = c[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        const min = a.sp === 'goose' || b.sp === 'goose' ? 8 : 6;
        if (d < min) {
          const push = (min - d) / 2 / (d || 1);
          a.x -= dx * push || 0.5;
          a.y -= dy * push;
          b.x += dx * push || 0.5;
          b.y += dy * push;
        }
      }
    }
  }
}

// ---------- Planes ----------

// The hour's landings, from the shift's random numbers; the assist stretches the gaps. Decisions on
// the two runways are at least 4 s apart, and none falls after the hour's end.
function scheduleHour(hour, stretch) {
  const cfg = HOURS[hour];
  const base = st.simTime - st.t; // the hour's start, in simTime
  let t = QUIET + DECIDE + (hour === startHour && st.t === 0 && !st.landings.length && st.clean + st.goarounds === 0 ? FIRST_EXTRA : 0);
  const list = [];
  const gaps = [];
  while (t < HOUR_LEN) {
    const rw = cfg.runways[Math.floor(rand() * cfg.runways.length)];
    const kind = rand() < cfg.heavy ? 'heavy' : 'prop';
    list.push({ at: base + t, rw, kind });
    const gap = cfg.gap * rr(0.8, 1.2) * (1 + stretch);
    gaps.push(gap);
    t += gap;
  }
  st.rawGaps = gaps;
  st.landings = st.landings.filter((l) => l.comeback).concat(list);
  spaceLandings();
  // Spacing may push one past the hour's end: no decision falls after it.
  st.landings = st.landings.filter((l) => l.comeback || l.at - DECIDE <= base + HOUR_LEN);
}
function spaceLandings() {
  st.landings.sort((a, b) => a.at - b.at);
  // Planes already coming in are fixed points: the schedule spaces itself after them.
  let last = -Infinity;
  const lastBy = {};
  for (const p of st.planes) {
    if (p.state !== 'approach') continue;
    last = Math.max(last, p.touch);
    lastBy[p.rw] = Math.max(lastBy[p.rw] ?? -Infinity, p.touch);
  }
  for (const l of st.landings) {
    const prev = Math.max(last + 4, (lastBy[l.rw] ?? -Infinity) + 6);
    if (l.at < prev) l.at = prev;
    last = l.at;
    lastBy[l.rw] = l.at;
  }
}

function spawnPlane(l) {
  const rw = RUNWAYS[l.rw];
  const app = APPROACH[l.kind];
  const p = {
    id: st.nextId++,
    rw: l.rw,
    kind: l.kind,
    livery: LIVERIES[Math.floor(rand() * LIVERIES.length)],
    state: 'approach',
    touch: l.at,
    start: l.at - app,
    x: rw.x,
    y: -18,
    alt: 1,
    cleared: false,
    hd: Math.PI / 2,
    fade: 0,
  };
  st.planes.push(p);
  sfx('engine', { gain: 0.25, rate: l.kind === 'heavy' ? 0.75 : 1.1 }, 1.5);
}

function updatePlanes(dt) {
  const live = mode === 'play';
  // New approaches, from the schedule and the hold.
  for (let i = st.landings.length - 1; i >= 0; i--) {
    const l = st.landings[i];
    if (st.simTime >= l.at - APPROACH[l.kind]) {
      st.landings.splice(i, 1);
      spawnPlane(l);
    }
  }
  for (let i = st.hold.length - 1; i >= 0; i--) {
    const h = st.hold[i];
    if (st.simTime >= h.back - APPROACH[h.kind]) {
      st.hold.splice(i, 1);
      spawnPlane({ at: h.back, rw: h.rw, kind: h.kind });
    }
  }
  for (const p of st.planes) {
    const rw = RUNWAYS[p.rw];
    if (p.state === 'approach') {
      const k = clamp((st.simTime - p.start) / (p.touch - p.start), 0, 1);
      p.y = -18 + (THRESHOLD + 18) * k;
      p.alt = 1 - k;
      if (!p.decided && st.simTime >= p.touch - DECIDE) decide(p, live);
      if (k >= 1) {
        p.state = 'roll';
        p.rollT = 0;
        if (live) {
          sfx('land', { rate: p.kind === 'heavy' ? 0.8 : 1 });
          sfx('tyre', { gain: 0.6 });
        }
        for (let i = 0; i < 3; i++) puff(p.x + rr(-5, 5), p.y + rr(-2, 4), 0.6);
      }
    } else if (p.state === 'roll') {
      p.rollT += dt;
      const k = Math.min(1, p.rollT / ROLL_TIME);
      p.y = THRESHOLD + (rw.y1 - 24 - THRESHOLD) * (1 - (1 - k) * (1 - k));
      if (k >= 1) {
        // Turn off toward the terminal and fade.
        p.fade += dt / 0.8;
        p.x += (rw.x < FW / 2 ? 1 : -1) * 10 * dt;
        p.hd = Math.PI / 2 + (rw.x < FW / 2 ? -0.6 : 0.6);
        if (p.fade >= 1) p.gone = true;
      }
    } else if (p.state === 'around') {
      // Climb away to the top, then join the hold.
      p.aroundT += dt;
      p.alt = Math.min(1, p.alt + dt * 0.8);
      p.hd -= dt * 0.9 * (rw.x < FW / 2 ? -1 : 1);
      p.x += Math.cos(p.hd) * 22 * dt;
      p.y += Math.sin(p.hd) * 22 * dt;
      if (p.aroundT > 2.5) p.gone = true;
    }
  }
  st.planes = st.planes.filter((p) => !p.gone);
}

function decide(p, live) {
  p.decided = true;
  const rw = RUNWAYS[p.rw];
  const blocked = st.birds.some((b) => onRunway(rw, b.state === 'fly' ? { x: b.fl.tx, y: b.fl.ty } : b));
  if (blocked) {
    p.state = 'around';
    p.aroundT = 0;
    p.red = clock;
    st.streak = 0;
    if (live) {
      st.goarounds++;
      st.hold.push({ id: p.id, rw: p.rw, kind: p.kind, back: st.simTime + COMEBACK });
      popups.push({ x: p.x, y: p.y + 16, text: 'GO AROUND', t: 0, red: true });
      sfx('engine', { gain: 0.7, rate: 0.9 });
      sfx('alarm', { gain: 0.5 });
      // Keep the 4 s spacing for its return.
      const back = st.hold[st.hold.length - 1];
      const tmp = st.landings.concat([{ at: back.back, rw: back.rw, kind: back.kind, comeback: true, hold: back }]);
      st.landings = tmp;
      spaceLandings();
      const mine = st.landings.find((l) => l.hold === back);
      back.back = mine.at;
      st.landings = st.landings.filter((l) => l !== mine);
      if (st.hold.length > HOLD_MAX) holdFull();
    }
    return;
  }
  p.cleared = true;
  p.green = clock;
  if (live) {
    st.streak = Math.min(st.streak + 1, 99);
    st.bestStreak = Math.max(st.bestStreak, st.streak);
    const mult = Math.min(st.streak, STREAK_MAX);
    const pts = (p.kind === 'heavy' ? 20 : 10) * mult;
    st.score += pts;
    st.clean++;
    popups.push({ x: p.x, y: p.y + 18, text: mult > 1 ? `+${pts} x${mult}` : `+${pts}`, t: 0 });
    sfx('clear', { gain: 0.7 });
    if (mult > 1) sfx('streak', { rate: 0.9 + mult * 0.08, gain: 0.6 });
  }
}

function holdFull() {
  mode = 'full';
  pointer = null;
  scarer.active = false;
  sfx('alarm');
  syncScreens();
}

// ---------- Ambient ----------

function puff(x, y, size) {
  particles.push({ x, y, size, life: 0, max: 1 + Math.random() * 0.6 });
}
function updateAmbient(dt) {
  for (const c of clouds) {
    c.x += 3 * dt;
    if (c.x > FW + 60 + GEXT) c.x -= FW + 2 * (60 + GEXT);
  }
  for (const p of particles) {
    p.life += dt;
    p.x += 2 * dt;
  }
  for (let i = particles.length - 1; i >= 0; i--) if (particles[i].life >= particles[i].max) particles.splice(i, 1);
  for (const p of popups) p.t += dt;
  for (let i = popups.length - 1; i >= 0; i--) if (popups[i].t > 1.4) popups.splice(i, 1);
}

// ---------- The scarer ----------

function moveScarer(x, y) {
  scarer.x = clamp(x, 2, FW - 2);
  scarer.y = clamp(y, 2, FH - 2);
}
function updateScarer(dt) {
  // Keys.
  const kx = (keys.has('ArrowRight') || keys.has('KeyD') ? 1 : 0) - (keys.has('ArrowLeft') || keys.has('KeyA') ? 1 : 0);
  const ky = (keys.has('ArrowDown') || keys.has('KeyS') ? 1 : 0) - (keys.has('ArrowUp') || keys.has('KeyW') ? 1 : 0);
  if (kx || ky) {
    const v = keys.has('ShiftLeft') || keys.has('ShiftRight') ? KEY_FAST : KEY_SPEED;
    const n = Math.hypot(kx, ky);
    if (scarer.kind !== 'key') {
      scarer.kind = 'key';
      scarer.held = 0;
      scarer.trail = [];
    }
    moveScarer(scarer.x + (kx / n) * v * dt, scarer.y + (ky / n) * v * dt);
    scarer.active = true;
  } else if (scarer.kind === 'key') {
    scarer.kind = null;
    scarer.active = false;
  }
  if (scarer.active) scarer.held += dt;
  // Speed over the last 100 ms.
  scarer.trail.push({ x: scarer.x, y: scarer.y, c: clockSim });
  while (scarer.trail.length > 2 && clockSim - scarer.trail[0].c > 0.1) scarer.trail.shift();
  const a = scarer.trail[0];
  const span = clockSim - a.c;
  scarer.speed = span > 0.02 ? Math.hypot(scarer.x - a.x, scarer.y - a.y) / span : 0;
  if (scarer.held < 0.1) scarer.speed = Math.min(scarer.speed, FAST - 1);
}
let clockSim = 0; // seconds of simulation, for the scarer's speed window

// ---------- Simulation ----------

function update(dt) {
  clockSim += dt;
  if (mode === 'full') {
    updateAmbient(dt);
    return;
  }
  if (mode === 'play') {
    st.t += dt;
    st.simTime += dt;
    updateScarer(dt);
    // Flocks arrive.
    st.nextFlock -= dt;
    if (st.nextFlock <= 0 && !st.ending) {
      const cfg = HOURS[st.hour];
      const sp = cfg.newcomer && !st.newcomerIn ? cfg.newcomer : cfg.species[Math.floor(rand() * cfg.species.length)];
      if (sp === cfg.newcomer) st.newcomerIn = true;
      arriveFlock(sp);
      st.nextFlock = cfg.flockEvery * rr(0.8, 1.2);
    }
  } else if (mode === 'start' || mode === 'done') {
    st.simTime += dt;
    attractTick(dt);
  }
  updateBirds(dt);
  updatePlanes(dt);
  updateAmbient(dt);
  if (mode === 'play') {
    if (!st.ending && st.t >= HOUR_LEN) {
      if (st.hour + 1 >= HOURS.length) st.ending = true;
      else beginHour(st.hour + 1, true);
    }
    if (st.ending && !st.planes.length && !st.landings.length && !st.hold.length) finishShift();
  }
}

// Behind the start card: birds pecking, a plane landing every so often on runway A.
function attractTick() {
  if (!st.landings.length && !st.planes.length) st.landings.push({ at: st.simTime + 4, rw: rand() < 0.5 ? 'A' : 'B', kind: rand() < 0.3 ? 'heavy' : 'prop' });
  // Keep the attract runway clear: the demo planes always land.
  for (const p of st.planes) if (p.state === 'approach' && !p.decided && st.simTime >= p.touch - DECIDE - 0.5) for (const b of st.birds) if (b.state === 'ground' && onRunway(RUNWAYS[p.rw], b)) takeOff(b, { x: b.x + 1, y: b.y });
}

// ---------- Shift flow ----------

function beginShift(hour) {
  startHour = hour;
  st = newShiftState((Date.now() ^ (Math.random() * 1e9)) >>> 0);
  st.hour = hour;
  particles.length = 0;
  popups.length = 0;
  retries = 0;
  // Two flocks are already about, one near the first runway.
  arriveFlock(HOURS[hour].species[0]);
  for (const b of st.birds) {
    b.x = b.fl.tx;
    b.y = b.fl.ty;
    b.state = 'ground';
    b.fl = null;
  }
  st.nextFlock = 8;
  beginHour(hour, false);
  mode = 'play';
  if (!musicStop) musicStop = sound.loop('music', { gain: 0.3 });
  syncScreens();
}

function beginHour(hour, chime) {
  st.hour = hour;
  st.t = 0;
  st.newcomerIn = false;
  if (chime) {
    retries = 0;
    sfx('hour');
    ui.clock.classList.remove('tick');
    void ui.clock.offsetWidth;
    ui.clock.classList.add('tick');
  }
  // The snapshot is taken before the hour's landings are drawn, so a retry draws the same ones.
  snapshot = JSON.parse(JSON.stringify(st));
  scheduleHour(hour, Math.min(ASSIST_MAX, retries * ASSIST_STEP));
  memory.hour = Math.max(memory.hour || 0, hour);
  writeMemory(memory);
}

function retryHour() {
  retries++;
  st = JSON.parse(JSON.stringify(snapshot));
  // The hour's landings again, from the same random numbers, stretched by the assist.
  scheduleHour(st.hour, Math.min(ASSIST_MAX, retries * ASSIST_STEP));
  st.streak = 0;
  popups.length = 0;
  mode = 'play';
  sfx('click');
  syncScreens();
}

function finishShift() {
  mode = 'done';
  pointer = null;
  scarer.active = false;
  sfx('done');
  memory.best = Math.max(memory.best || 0, st.score);
  memory.bestStreak = Math.max(memory.bestStreak || 0, st.bestStreak);
  memory.hour = HOURS.length - 1;
  writeMemory(memory);
  ui.finalScore.textContent = String(st.score);
  ui.finalDetail.textContent = `${st.clean} clean landings · ${st.goarounds} go-arounds · best streak ${st.bestStreak}`;
  syncScreens();
}

function hourFromHash() {
  const m = /hour=(\d)/.exec(location.hash);
  const n = m ? Number(m[1]) : 0;
  return n >= 1 && n <= HOURS.length ? n - 1 : -1;
}

function showStart() {
  mode = 'start';
  pointer = null;
  scarer.active = false;
  attract();
  const h = memory.hour || 0;
  ui.from.hidden = !(h > 0);
  ui.from.textContent = `From ${hourName(h)}`;
  ui.from.dataset.hour = String(h);
  const bits = [];
  if (memory.best) bits.push(`Best ${memory.best}`);
  if (memory.bestStreak) bits.push(`streak ${memory.bestStreak}`);
  ui.bestStart.hidden = !bits.length;
  ui.bestStart.textContent = bits.join(' · ');
  syncScreens();
}

function attract() {
  st = newShiftState(4242);
  st.hour = 1;
  for (const sp of ['gull', 'gull']) arriveFlock(sp);
  for (const b of st.birds) {
    b.x = b.fl.tx;
    b.y = b.fl.ty;
    b.state = 'ground';
    b.fl = null;
  }
  st.landings.push({ at: 3, rw: 'A', kind: 'prop' });
}

const hourName = (h) => `${String(6 + h).padStart(2, '0')}:00`;
function clockText() {
  if (!st || mode === 'start') return '06:00';
  if (st.ending) return '10:00';
  const mins = Math.min(59, Math.floor((st.t / HOUR_LEN) * 60));
  return `${String(6 + st.hour).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

function syncScreens() {
  ui.start.hidden = !(mode === 'start' && !paused);
  ui.full.hidden = !(mode === 'full' && !paused);
  ui.done.hidden = !(mode === 'done' && !paused);
  ui.paused.hidden = !paused;
  ui.hud.hidden = mode === 'start';
  if (mode === 'full') {
    ui.retry.textContent = `Retry ${hourName(st.hour)}`;
    ui.fullDetail.textContent = `Four planes were waiting at ${clockText()}.`;
  }
  syncHud();
}

let shown = {};
function syncHud() {
  if (!st) return;
  const c = clockText();
  if (c !== shown.clock) ui.clock.textContent = shown.clock = c;
  if (st.score !== shown.score) ui.score.textContent = String((shown.score = st.score));
  const k = st.streak > 1 ? Math.min(st.streak, STREAK_MAX) : 0;
  if (k !== shown.streak) {
    shown.streak = k;
    ui.streak.hidden = !k;
    ui.streak.textContent = k ? `x${k}` : '';
  }
  const h = Math.min(st.hold.length, HOLD_MAX + 1);
  if (h !== shown.hold) {
    shown.hold = h;
    [...ui.hold.children].forEach((el, i) => el.classList.toggle('on', i < h));
    ui.hold.setAttribute('aria-label', `Planes in the hold: ${Math.min(h, HOLD_MAX)} of ${HOLD_MAX}`);
  }
}

// ---------- Input ----------

canvas.addEventListener('pointerdown', (e) => {
  if (paused || mode !== 'play') return;
  if (pointer) return; // one finger at a time; a second is ignored
  e.preventDefault();
  try {
    canvas.setPointerCapture(e.pointerId);
  } catch (err) {}
  pointer = { id: e.pointerId, touch: e.pointerType !== 'mouse' };
  scarer.kind = 'pointer';
  scarer.held = 0;
  scarer.trail = [];
  placeFromPointer(e);
  scarer.active = true;
});
function placeFromPointer(e) {
  const y = e.clientY - (pointer.touch ? FINGER_OFFSET : 0);
  scarer.css = { x: e.clientX, y };
  const f = toField(e.clientX, y);
  moveScarer(f.x, f.y);
}
canvas.addEventListener('pointermove', (e) => {
  if (!pointer || e.pointerId !== pointer.id) return;
  placeFromPointer(e);
});
function endPointer(e) {
  if (!pointer || e.pointerId !== pointer.id) return;
  pointer = null;
  scarer.active = false;
  scarer.kind = null;
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
const MOVE_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'ShiftRight']);
window.addEventListener('keydown', (e) => {
  if (!MOVE_KEYS.has(e.code) || mode !== 'play' || paused) return;
  keys.add(e.code);
  e.preventDefault();
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => keys.clear());

// ---------- Clouds ----------

// Clouds: pixel blobs, drawn once.
function makeCloud(rng) {
  const w = 34 + Math.floor(rng() * 20);
  const h = 18 + Math.floor(rng() * 8);
  const blobs = [];
  for (let i = 0; i < 5; i++) blobs.push({ x: 8 + rng() * (w - 16), y: 7 + rng() * (h - 14), r: 5 + rng() * 5 });
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const c = cv.getContext('2d');
  const sh = document.createElement('canvas');
  sh.width = w;
  sh.height = h;
  const s = sh.getContext('2d');
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = 0;
      for (const b of blobs) v += (b.r * b.r) / ((x - b.x) ** 2 + (y - b.y) ** 2 + 1);
      if (v > 1) {
        c.fillStyle = v > 1.6 ? '#ffffff' : '#e3e8f2';
        c.fillRect(x, y, 1, 1);
        s.fillStyle = '#000';
        s.fillRect(x, y, 1, 1);
      }
    }
  }
  return { img: cv, shadow: sh };
}
function seedClouds() {
  const rng = mulberry32(99);
  clouds.length = 0;
  for (let i = 0; i < 16; i++) {
    const shape = makeCloud(rng);
    clouds.push({ ...shape, x: -GEXT + rng() * (FW + GEXT * 2), y: -GEXT + rng() * (FH + GEXT * 2) });
  }
}

// ---------- Pixel drawing ----------
//
// Everything is drawn on a small canvas at the art's own resolution (one canvas pixel per art px),
// then enlarged to the screen with no smoothing, so the whole game is one grid of square pixels.
// Shapes on top of the sprites (rings, lines, chevrons, the sock, arrows, fuel arcs, conflict marks,
// points) are plotted pixel by pixel, never with anti-aliased paths: nothing is smooth.

const lo = document.createElement('canvas');
let lc = lo.getContext('2d');
let LW = 1;
let LH = 1;
let OX = 0; // the field's origin on the small canvas, whole pixels
let OY = 0;

function sizeLow() {
  OX = Math.round(offX / S) + 1;
  OY = Math.round(offY / S) + 1;
  LW = Math.ceil(cssW / S) + 3;
  LH = Math.ceil(cssH / S) + 3;
  if (lo.width !== LW) lo.width = LW;
  if (lo.height !== LH) lo.height = LH;
}

const px = (x, y) => lc.fillRect(Math.round(x), Math.round(y), 1, 1);

// A line, Bresenham.
function pxLine(x0, y0, x1, y1, color) {
  lc.fillStyle = color;
  x0 = Math.round(x0);
  y0 = Math.round(y0);
  x1 = Math.round(x1);
  y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (let i = 0; i < 2000; i++) {
    lc.fillRect(x0, y0, 1, 1);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += sy;
    }
  }
}

// A ring (or an arc of one, clockwise from a0) `th` pixels thick; `fill` fills the inside too.
function pxRing(cx, cy, r, color, { th = 1, a0 = 0, a1 = Math.PI * 2, fill = null } = {}) {
  cx = Math.round(cx);
  cy = Math.round(cy);
  const R = Math.ceil(r + th);
  const span = a1 - a0;
  for (let j = -R; j <= R; j++) {
    for (let i = -R; i <= R; i++) {
      const d = Math.hypot(i, j);
      if (fill && d < r - th / 2) {
        lc.fillStyle = fill;
        lc.fillRect(cx + i, cy + j, 1, 1);
        continue;
      }
      if (Math.abs(d - r) > th / 2) continue;
      if (span < Math.PI * 2) {
        let a = Math.atan2(j, i) - a0;
        a = ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
        if (a > span) continue;
      }
      lc.fillStyle = color;
      lc.fillRect(cx + i, cy + j, 1, 1);
    }
  }
}

// A filled polygon, by testing each pixel's centre.
function pxPoly(pts, color) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const p of pts) {
    x0 = Math.min(x0, p.x);
    y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x);
    y1 = Math.max(y1, p.y);
  }
  lc.fillStyle = color;
  for (let y = Math.floor(y0); y <= Math.ceil(y1); y++) {
    for (let x = Math.floor(x0); x <= Math.ceil(x1); x++) {
      const qx = x + 0.5;
      const qy = y + 0.5;
      let inside = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const a = pts[i];
        const b = pts[j];
        if (a.y > qy !== b.y > qy && qx < ((b.x - a.x) * (qy - a.y)) / (b.y - a.y) + a.x) inside = !inside;
      }
      if (inside) lc.fillRect(x, y, 1, 1);
    }
  }
}
const rot = (x, y, a, ox, oy) => ({ x: ox + x * Math.cos(a) - y * Math.sin(a), y: oy + x * Math.sin(a) + y * Math.cos(a) });

// A 3 × 5 pixel font for the points that pop up.
const GLYPHS = {
  0: '111101101101111',
  1: '010110010010111',
  2: '111001111100111',
  3: '111001111001111',
  4: '101101111001001',
  5: '111100111001111',
  6: '111100111101111',
  7: '111001001010010',
  8: '111101111101111',
  9: '111101111001111',
  '+': '000010111010000',
  x: '000101010101000',
  D: '110101101101110',
  I: '111010010010111',
  V: '101101101101010',
  E: '111100110100111',
  R: '110101110101101',
  T: '111010010010010',
  G: '111100101101111',
  O: '111101101101111',
  A: '010101111101101',
  U: '101101101101111',
  N: '110101101101101',
  C: '111100100100111',
  L: '100100100100111',
  K: '101101110101101',
  ' ': '000000000000000',
};
function pxText(text, cx, y, color, outline) {
  const w = text.length * 4 - 1;
  const x0 = Math.round(cx - w / 2);
  y = Math.round(y);
  for (const pass of outline ? [0, 1] : [1]) {
    lc.fillStyle = pass ? color : outline;
    for (let k = 0; k < text.length; k++) {
      const g = GLYPHS[text[k]] || GLYPHS[' '];
      for (let i = 0; i < 15; i++) {
        if (g[i] !== '1') continue;
        const x = x0 + k * 4 + (i % 3);
        const yy = y + Math.floor(i / 3);
        if (pass) lc.fillRect(x, yy, 1, 1);
        else lc.fillRect(x - 1, yy - 1, 3, 3);
      }
    }
  }
}

// Black silhouettes of the plane sprites, for shadows (canvas filters aren't everywhere).
let silhouettes = null;
function buildSilhouettes() {
  const c = document.createElement('canvas');
  c.width = planesImg.naturalWidth;
  c.height = planesImg.naturalHeight;
  const g = c.getContext('2d');
  g.drawImage(planesImg, 0, 0);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = '#000';
  g.fillRect(0, 0, c.width, c.height);
  return c;
}


// ---------- The airfield, drawn once ----------

const groundSeed = mulberry32(4242);
function buildGround() {
  const gw = FW + GEXT * 2;
  const gh = FH + GEXT * 2;
  const g = document.createElement('canvas');
  g.width = gw;
  g.height = gh;
  const c = g.getContext('2d');
  c.imageSmoothingEnabled = false;
  const tile = (i, x, y) => c.drawImage(tiles, (i % 12) * 16, Math.floor(i / 12) * 16, 16, 16, x, y, 16, 16);
  const rnd = groundSeed;
  for (let y = 0; y < gh; y += 16) for (let x = 0; x < gw; x += 16) tile(rnd() < 0.82 ? 110 : 50, x, y);
  const O = GEXT;
  const clear = (x, y) => {
    const fx = x - O + 8;
    const fy = y - O + 8;
    if (fy > -12 && fy < FH + 4 && fx > WATER_X - 8 && fx < FW + 8) return true; // the airfield itself
    return false;
  };
  for (let y = 0; y < gh; y += 16) {
    for (let x = 0; x < gw; x += 16) {
      if (clear(x, y)) continue;
      const r = rnd();
      if (r < 0.14) tile([36, 48, 60][Math.floor(rnd() * 3)], x, y);
      else if (r < 0.18) tile(109, x, y);
      else if (r < 0.2) tile(111, x, y);
    }
  }
  // Water along the left edge, with a sandy shore.
  // A river along the left edge, with sandy banks.
  const RIVER = 46;
  c.fillStyle = '#e8d07a';
  c.fillRect(O + WATER_X - RIVER - 2, 0, RIVER + 4, gh);
  c.fillStyle = '#cfeef3';
  c.fillRect(O + WATER_X - RIVER, 0, RIVER, gh);
  c.fillStyle = '#ffffff';
  for (let y = 4; y < gh; y += 9) c.fillRect(O + WATER_X - 6 - ((y * 7) % 30), y, 3, 1);
  // The apron and terminal along the bottom, with its bins.
  c.fillStyle = '#3e4255';
  c.fillRect(O + WATER_X + 4, O + APRON_Y - 1, FW - WATER_X - 6, FH - APRON_Y + GEXT);
  c.fillStyle = '#a9abb8';
  c.fillRect(O + WATER_X + 5, O + APRON_Y, FW - WATER_X - 8, FH - APRON_Y + GEXT);
  c.fillStyle = '#c3c5d0';
  for (let x = O + WATER_X + 8; x < O + FW - 4; x += 12) c.fillRect(x, O + APRON_Y + 3, 6, 1);
  // The terminal: a long low roof.
  c.fillStyle = '#3e4255';
  c.fillRect(O + 50, O + 300, 84, 20);
  c.fillStyle = '#5c6274';
  c.fillRect(O + 51, O + 301, 82, 18);
  c.fillStyle = '#7d8398';
  for (let x = O + 54; x < O + 132; x += 8) c.fillRect(x, O + 303, 5, 14);
  for (const b of BINS) {
    c.fillStyle = '#1e2130';
    c.fillRect(O + b.x - 4, O + b.y - 3, 8, 7);
    c.fillStyle = '#4a8a2c';
    c.fillRect(O + b.x - 3, O + b.y - 2, 6, 5);
    c.fillStyle = '#6cc04a';
    c.fillRect(O + b.x - 3, O + b.y - 2, 6, 1);
  }
  // Taxiways from each runway's end to the apron.
  for (const r of Object.values(RUNWAYS)) {
    c.fillStyle = '#3e4255';
    c.fillRect(O + r.x - 5, O + r.y1, 10, APRON_Y - r.y1 + 1);
    c.fillStyle = '#8a8f9f';
    c.fillRect(O + r.x - 4, O + r.y1, 8, APRON_Y - r.y1 + 1);
    c.fillStyle = '#ffd23f';
    for (let y = O + r.y1 + 1; y < O + APRON_Y; y += 4) c.fillRect(O + r.x, y, 1, 2);
  }
  // Runways: pale asphalt so birds show, a dark edge, centre dashes and threshold bars.
  for (const r of Object.values(RUNWAYS)) {
    const x0 = O + r.x - r.w / 2;
    const y0 = O + r.y0;
    const len = r.y1 - r.y0;
    c.fillStyle = '#1e2130';
    c.fillRect(x0 - 1, y0 - 1, r.w + 2, len + 2);
    c.fillStyle = '#9a9fb0';
    c.fillRect(x0, y0, r.w, len);
    c.fillStyle = '#ffffff';
    for (let y = y0 + 22; y < y0 + len - 8; y += 12) c.fillRect(O + r.x - 1, y, 2, 6);
    for (let x = x0 + 2; x < x0 + r.w - 2; x += 3) c.fillRect(x, y0 + 3, 2, 6);
    // Aiming point blocks at the touchdown zone.
    c.fillRect(x0 + 3, O + THRESHOLD + 4, 3, 8);
    c.fillRect(x0 + r.w - 6, O + THRESHOLD + 4, 3, 8);
  }
  return g;
}

// A closed runway: yellow crosses on it.
function drawClosed(r) {
  for (const y of [r.y0 + 30, (r.y0 + r.y1) / 2, r.y1 - 30]) {
    pxLine(r.x - 4, y - 4, r.x + 4, y + 4, '#ffd23f');
    pxLine(r.x + 4, y - 4, r.x - 4, y + 4, '#ffd23f');
    pxLine(r.x - 3, y - 4, r.x + 5, y + 4, '#ffd23f');
    pxLine(r.x + 5, y - 4, r.x - 3, y + 4, '#ffd23f');
  }
}

// Threshold lights: amber blinking while a plane comes in, green when cleared, red when it goes round.
function drawLights(r) {
  const p = st.planes.find((q) => q.rw === r.id && (q.state === 'approach' || q.state === 'around'));
  let color = '#3e4255';
  if (p) {
    if (p.state === 'around' || (p.red && clock - p.red < 2)) color = Math.sin(clock * 16) > 0 ? '#ff3b30' : '#7a1d18';
    else if (p.cleared) color = '#5ee05a';
    else color = Math.sin(clock * 9) > 0 ? '#ffb02e' : '#7a5310';
  }
  lc.fillStyle = color;
  for (let x = r.x - r.w / 2; x < r.x + r.w / 2; x += 3) lc.fillRect(x, r.y0 - 3, 2, 2);
}

// ---------- Birds, in pixels ----------

const BIRD_COLORS = {
  gull: { body: '#ffffff', wing: '#a9abb8', head: '#ffffff', beak: '#ffb02e', line: '#1e2130' },
  goose: { body: '#9c7a58', wing: '#6e5440', head: '#1e2130', beak: '#1e2130', line: '#1e2130' },
  starling: { body: '#2a2d3c', wing: '#4b4f66', head: '#2a2d3c', beak: '#ffd23f', line: '#e3e8f2' },
};
// Pixels, facing right: [dx, dy, part].
const B = 'body';
const W = 'wing';
const H = 'head';
const K = 'beak';
const SHAPES = {
  ground: [[-1, -1, B], [0, -1, B], [1, -1, B], [2, -1, H], [3, -1, K], [-3, 0, W], [-2, 0, W], [-1, 0, W], [0, 0, W], [1, 0, B], [-1, 1, B], [0, 1, B]],
  peck: [[-1, -1, B], [0, -1, B], [1, -1, B], [-3, 0, W], [-2, 0, W], [-1, 0, W], [0, 0, W], [1, 0, B], [2, 0, H], [3, 1, K], [-1, 1, B], [0, 1, B]],
  goose: [[-4, -1, W], [-3, -1, W], [-2, -1, W], [-1, -1, W], [0, -1, W], [1, -1, B], [-4, 0, B], [-3, 0, B], [-2, 0, B], [-1, 0, B], [0, 0, B], [1, 0, B], [2, 0, B], [-3, 1, B], [-2, 1, B], [-1, 1, B], [0, 1, B], [1, 1, B], [2, -1, H], [3, -2, H], [3, -3, H], [4, -3, H], [5, -3, K]],
  flyUp: [[-3, 0, W], [-2, 0, B], [-1, 0, B], [0, 0, B], [1, 0, B], [2, 0, H], [3, 0, K], [0, -1, W], [-1, -2, W], [-2, -3, W], [-3, -4, W], [0, 1, W], [-1, 2, W], [-2, 3, W], [-3, 4, W]],
  flyDown: [[-3, 0, W], [-2, 0, B], [-1, 0, B], [0, 0, B], [1, 0, B], [2, 0, H], [3, 0, K], [0, -1, W], [-1, -2, W], [0, 1, W], [-1, 2, W]],
};
function drawPixels(x, y, shape, face, colors) {
  x = Math.round(x);
  y = Math.round(y);
  lc.fillStyle = colors.line;
  for (const [dx, dy] of shape) lc.fillRect(x + dx * face - 1, y + dy - 1, 3, 3);
  for (const [dx, dy, part] of shape) {
    lc.fillStyle = colors[part];
    lc.fillRect(x + dx * face, y + dy, 1, 1);
  }
}
function drawBirdShadows() {
  lc.fillStyle = '#1e2130';
  for (const b of st.birds) {
    if (b.state !== 'fly' || b.leaving) continue;
    // Where it will land, shown for the whole flight.
    const x = Math.round(b.fl.tx);
    const y = Math.round(b.fl.ty);
    lc.fillRect(x - 2, y, 5, 1);
    lc.fillRect(x - 3, y + 1, 7, 1);
    lc.fillRect(x - 2, y + 2, 5, 1);
  }
}
function drawBirds(flying) {
  for (const b of st.birds) {
    const col = BIRD_COLORS[b.sp];
    if (b.state === 'fly') {
      if (!flying) continue;
      const up = Math.sin(clock * 22 + b.id) > 0;
      drawPixels(b.x, b.y - Math.round(6 * (b.alt || 0)), up ? SHAPES.flyUp : SHAPES.flyDown, b.face, col);
    } else {
      if (flying) continue;
      const pecking = b.sp !== 'goose' && Math.sin(clock * 3 + b.id * 1.7) > 0.7;
      drawPixels(b.x, b.y, b.sp === 'goose' ? SHAPES.goose : pecking ? SHAPES.peck : SHAPES.ground, b.face, col);
    }
  }
}

// ---------- Planes ----------

function drawPlane(p) {
  const a = p.state === 'roll' ? 1 - p.fade : 1;
  const sx = p.livery * 32;
  const sy = p.kind === 'heavy' ? 0 : 32;
  const sc = (p.kind === 'heavy' ? 1 : 0.85) * (0.85 + 0.3 * p.alt);
  const x = Math.round(p.x);
  const y = Math.round(p.y);
  const r = p.hd - Math.PI / 2;
  // Shadow, offset by height.
  lc.save();
  lc.globalAlpha = 0.25 * a;
  lc.translate(x + Math.round(10 * p.alt) + 1, y + Math.round(14 * p.alt) + 1);
  lc.rotate(r);
  lc.scale(sc, sc);
  if (silhouettes) lc.drawImage(silhouettes, sx, sy, 32, 32, -16, -16, 32, 32);
  lc.restore();
  lc.save();
  lc.globalAlpha = a;
  lc.translate(x, y);
  lc.rotate(r);
  lc.scale(sc, sc);
  lc.drawImage(planesImg, sx, sy, 32, 32, -16, -16, 32, 32);
  lc.restore();
}

// The hold: small planes circling between the runways at the top.
function drawHold() {
  const n = st.hold.length;
  for (let i = 0; i < n; i++) {
    const ang = clock * 1.2 + (i * Math.PI * 2) / Math.max(n, 1);
    const x = Math.round(HOLD_C.x + Math.cos(ang) * 12);
    const y = Math.round(HOLD_C.y + Math.sin(ang) * 7);
    lc.save();
    lc.translate(x, y);
    lc.rotate(ang + Math.PI);
    lc.scale(0.45, 0.45);
    lc.drawImage(planesImg, 32, 32, 32, 32, -16, -16, 32, 32);
    lc.restore();
  }
}

// ---------- Marks: countdowns, reticle, points ----------

// The countdowns on screen: seconds to each coming plane's decision.
function countdowns() {
  const out = [];
  for (const p of st.planes) {
    if (p.state !== 'approach' || p.decided) continue;
    const left = Math.ceil(p.touch - DECIDE - st.simTime);
    if (left >= 1 && left <= 9) out.push({ p, rw: p.rw, left });
  }
  return out;
}

function drawMarks() {
  // Countdown to each plane's decision, beside it.
  for (const { p, left } of countdowns()) {
    const r = RUNWAYS[p.rw];
    pxText(String(left), r.x + (r.x < FW / 2 ? 16 : -16), Math.max(4, Math.round(p.y) - 2), left <= 2 ? '#ffb02e' : '#ffffff', '#1e2130');
  }
  // The reticle: the pack's corners, and its reach while it scares.
  if (mode === 'play' && (scarer.active || pointer || scarer.kind)) {
    const fast = scarer.speed > FAST && scarer.held > 0.1;
    const color = fast ? '#ffb02e' : '#ffffff';
    if (scarer.active) pxRing(scarer.x, scarer.y, FEAR_R, color, { a0: clock * 2, a1: clock * 2 + Math.PI * 1.6 });
    lc.drawImage(tiles, 3 * 16, 2 * 16, 16, 16, Math.round(scarer.x) - 8, Math.round(scarer.y) - 8, 16, 16);
  }
  for (const p of popups) {
    if (p.t > 1 && Math.sin(p.t * 30) < -0.6) continue;
    pxText(p.text, p.x, p.y - Math.floor(p.t * 10), p.red ? '#ff3b30' : '#ffd23f', '#1e2130');
  }
}

function draw() {
  lc = lo.getContext('2d');
  lc.setTransform(1, 0, 0, 1, 0, 0);
  lc.imageSmoothingEnabled = false;
  lc.globalAlpha = 1;
  lc.fillStyle = '#8cc63f';
  lc.fillRect(0, 0, LW, LH);
  lc.translate(OX, OY);
  if (ground) lc.drawImage(ground, -GEXT, -GEXT);
  for (const c of clouds) {
    lc.globalAlpha = 0.1;
    lc.drawImage(c.shadow, Math.round(c.x + 14), Math.round(c.y + 20));
  }
  lc.globalAlpha = 1;
  const open = mode === 'start' ? ['A', 'B'] : openRunways();
  for (const r of Object.values(RUNWAYS)) {
    if (!open.includes(r.id)) drawClosed(r);
    else drawLights(r);
  }
  drawBirdShadows();
  drawBirds(false);
  for (const p of particles) {
    const a = 1 - p.life / p.max;
    lc.globalAlpha = Math.round(0.55 * a * 4) / 4;
    const s = Math.max(2, Math.round(10 * p.size * (0.6 + 0.6 * (p.life / p.max))));
    lc.drawImage(tiles, 8 * 16, 0, 16, 16, Math.round(p.x - s / 2), Math.round(p.y - s / 2), s, s);
  }
  lc.globalAlpha = 1;
  const order = [...st.planes].sort((a, b) => a.alt - b.alt);
  for (const p of order) if (p.alt < 0.5) drawPlane(p);
  drawBirds(true);
  for (const p of order) if (p.alt >= 0.5) drawPlane(p);
  drawHold();
  for (const c of clouds) {
    lc.globalAlpha = 0.3;
    lc.drawImage(c.img, Math.round(c.x), Math.round(c.y));
  }
  lc.globalAlpha = 1;
  drawMarks();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(lo, 0, 0, LW, LH, (offX - OX * S) * dpr, (offY - OY * S) * dpr, LW * S * dpr, LH * S * dpr);
}

// The flat alphas marks may use: clear, drawn, and nothing else. Smoothing would add others.
const MARK_ALPHAS = [0, 255];
// For the test: draw the live game's marks (lights, crosses, shadows, birds, countdowns, the reticle,
// points) with the frame's own functions onto a clear canvas, and return the alpha values found.
function marksAlphaProbe() {
  const keep = lc;
  const c = document.createElement('canvas');
  c.width = FW + 40;
  c.height = FH + 40;
  lc = c.getContext('2d');
  lc.translate(20, 20);
  for (const r of Object.values(RUNWAYS)) (openRunways().includes(r.id) ? drawLights : drawClosed)(r);
  drawBirdShadows();
  drawBirds(false);
  drawBirds(true);
  drawMarks();
  pxText('+20 x2 GO AROUND', 90, 300, '#ffd23f', '#1e2130');
  const data = lc.getImageData(0, 0, c.width, c.height).data;
  lc = keep;
  const alphas = new Set();
  let drawn = 0;
  for (let i = 3; i < data.length; i += 4) {
    alphas.add(data[i]);
    if (data[i]) drawn++;
  }
  return { alphas: [...alphas].sort((x, y) => x - y), allowed: MARK_ALPHAS, drawn };
}

// ---------- Loop ----------

let last = performance.now();
let acc = 0;
let running = true;
function frame(now) {
  if (!running) return;
  const raw = Math.min(0.1, Math.max(0, (now - last) / 1000));
  last = now;
  if (!paused) {
    if (!manual) advance(raw);
    clock += raw;
  }
  if (tiles.complete && planesImg.complete) {
    if (!ground && tiles.naturalWidth) ground = buildGround();
    if (!silhouettes && planesImg.naturalWidth) silhouettes = buildSilhouettes();
    draw();
  }
  syncHud();
  requestAnimationFrame(frame);
}

function advance(raw) {
  acc += raw;
  let n = 0;
  while (acc >= STEP && n < 24) {
    update(STEP);
    acc -= STEP;
    n++;
  }
  if (n >= 24) acc = 0;
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    pointer = null;
    keys.clear();
    scarer.active = false;
    if (mode === 'play') {
      paused = true;
      syncScreens();
    }
    sound.suspend();
  } else {
    last = performance.now();
  }
});

// On Resume, no decision is less than 3 s away: anything closer is moved back.
function resume() {
  for (const p of st.planes) {
    if (p.state !== 'approach' || p.decided) continue;
    const left = p.touch - DECIDE - st.simTime;
    if (left < 3) {
      p.touch += 3 - left;
      p.start += 3 - left;
    }
  }
  paused = false;
  last = performance.now();
  sound.unlock();
  syncScreens();
}

// ---------- UI ----------

ui.play.addEventListener('click', () => {
  sfx('click');
  beginShift(0);
});
ui.from.addEventListener('click', () => {
  sfx('click');
  beginShift(Number(ui.from.dataset.hour) || 0);
});
ui.retry.addEventListener('click', retryHour);
ui.newShift.addEventListener('click', () => {
  sfx('click');
  beginShift(0);
});
ui.again.addEventListener('click', () => {
  sfx('click');
  showStart();
});
ui.resume.addEventListener('click', resume);

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
window.addEventListener('hashchange', () => {
  const h = hourFromHash();
  if (h >= 0) beginShift(h);
});

resize();
seedClouds();
showStart();
{
  const h = hourFromHash();
  if (h >= 0) beginShift(h);
}
requestAnimationFrame(frame);

// For tests and balance runs: read the state, and step the simulation without drawing.
window.__shoo = {
  get st() {
    return st;
  },
  get mode() {
    return mode;
  },
  get paused() {
    return paused;
  },
  get snapshot() {
    return snapshot;
  },
  get retries() {
    return retries;
  },
  set manual(v) {
    manual = v;
  },
  scarer,
  view: () => ({ S, offX, offY, cssW, cssH, dpr, hudBottom }),
  RUNWAYS,
  HOURS,
  FW,
  FH,
  HOUR_LEN,
  DECIDE,
  FEAR_R,
  FAST,
  PULL,
  STEP,
  THRESHOLD,
  onRunway,
  nextDecision,
  runwayGuarded,
  toScreen,
  toField,
  beginShift,
  beginHour,
  retryHour,
  showStart,
  resume,
  heard,
  memory: () => readMemory(),
  makeBird: (sp, x, y, flock = 0) => {
    const b = makeBird(sp, x, y, flock || st.nextId++);
    st.birds.push(b);
    return b;
  },
  arriveFlock,
  takeOff,
  addLanding(rw, inSeconds, kind = 'prop') {
    st.landings.push({ at: st.simTime + inSeconds, rw, kind });
  },
  // Run the simulation for `seconds` (fixed steps), or at `hz` frames per second.
  run(seconds, hz) {
    if (!hz) {
      const n = Math.round(seconds / STEP);
      for (let i = 0; i < n; i++) update(STEP);
      return;
    }
    const frames = Math.round(seconds * hz);
    for (let i = 0; i < frames; i++) advance(1 / hz);
  },
  draw,
  marksAlphaProbe,
  countdowns: () => countdowns().map((c) => ({ rw: c.rw, left: c.left, id: c.p.id })),
  clouds: () => clouds.map((c) => ({ x: c.x, y: c.y })),
};

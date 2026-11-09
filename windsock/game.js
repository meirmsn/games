// Windsock: an airfield seen from above. Drag from a plane to draw its path to a runway end that
// faces into the wind; when the windsock swings, the live ends flip. Spec: specs/windsock.md.
//
// The field is laid out in "art px" (the Pixel Shmup pack's own pixels): a 180 × 330 portrait field,
// scaled to fit the screen below the HUD. Everything is simulated in art px on a fixed 1/120 s step.
import { mountShell } from '../shared/game-shell.js';

// ---------- Knobs ----------

const FW = 180; // field width, art px
const FH = 330; // field height
const HOUR_LEN = 45; // seconds per in-game hour
const STEP = 1 / 120; // fixed simulation step
const WARN = 5; // wind warning before a swing, s
const LULL = 5; // no arrivals after a swing, s
const SWING_AT = 20; // a swing falls this far into each hour from 07:00
const ARROW_LEAD = 3; // an arrival's arrow shows this long before the plane
const DRIFT = 5; // wind push on planes without a line, art px/s
const STREAK_GAP = 6; // landings within this many seconds build the streak
const STREAK_MAX = 5;
const FINGER_OFFSET = 44; // CSS px the line's head sits above a finger
const OFFSET_BLEND = 24; // CSS px of drag over which the offset blends in
const GRAB_CSS = 22; // grab radius in CSS px (a 44 px hit area)
const RING_R = 11; // landing ring radius, art px
const SNAP_R = RING_R + 5; // the line snaps when its head comes this close
const MARGIN = 14; // free planes turn back inside this margin of the field
const ASSIST_STEP = 0.08;
const ASSIST_MAX = 0.25;

const TYPES = {
  prop: { r: 8, speed: 17, turn: 2.4, fuel: 50, points: 10, roll: { main: 62, strip: 56 }, look: 10, scale: 0.8 },
  heavy: { r: 11, speed: 13, turn: 1.5, fuel: 60, points: 30, roll: { main: 96, strip: 0 }, look: 12, scale: 0.95 },
};

// One new thing per hour (06:00 … 10:00).
const HOURS = [
  { gap: 8.0, max: 3, heavy: 0, swing: false, strip: false }, // props, the long runway
  { gap: 7.0, max: 4, heavy: 0, swing: true, strip: false }, // the first swing
  { gap: 5.6, max: 6, heavy: 0, swing: true, strip: true }, // the strip opens
  { gap: 5.4, max: 6, heavy: 0.35, swing: true, strip: true }, // heavies
  { gap: 4.0, max: 8, heavy: 0.3, swing: true, strip: true }, // rush hour
];

// ---------- The airfield ----------

const MAIN = { x: 90, y0: 66, y1: 270, w: 14 }; // the long runway, up the screen
const STRIP = { y: 150, x0: 42, x1: 138, w: 10 }; // the dirt strip, across it

// Each runway end: its ring out on the approach, the threshold where the plane touches down, and the
// direction it rolls. `when(from)` says whether it faces into a wind blowing from `from`.
const ENDS = {
  S: { id: 'S', runway: 'main', ring: { x: 90, y: 300 }, thr: { x: 90, y: 262 }, dir: { x: 0, y: -1 }, label: '36' },
  N: { id: 'N', runway: 'main', ring: { x: 90, y: 34 }, thr: { x: 90, y: 74 }, dir: { x: 0, y: 1 }, label: '18' },
  W: { id: 'W', runway: 'strip', ring: { x: 16, y: 150 }, thr: { x: 48, y: 150 }, dir: { x: 1, y: 0 }, label: '09' },
  E: { id: 'E', runway: 'strip', ring: { x: 164, y: 150 }, thr: { x: 132, y: 150 }, dir: { x: -1, y: 0 }, label: '27' },
};
const SOCK = { x: 122, y: 116 };

// Wind comes from one of the four diagonals: 0 NE, 1 SE, 2 SW, 3 NW (y grows down the screen).
const FROM = [
  { x: 1, y: -1 },
  { x: 1, y: 1 },
  { x: -1, y: 1 },
  { x: -1, y: -1 },
];
const WIND_NAMES = ['NE', 'SE', 'SW', 'NW'];
// A plane lands heading into the wind: wind from the north side → land heading north, from the south
// end; wind from the east side → land heading east, from the west end.
function liveEnds(dir) {
  const f = FROM[dir];
  return { main: f.y < 0 ? 'S' : 'N', strip: f.x > 0 ? 'W' : 'E' };
}
function blowVec(dir) {
  const f = FROM[dir];
  return { x: -f.x / Math.SQRT2, y: -f.y / Math.SQRT2 };
}

// ---------- Small helpers ----------

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));
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
const hourRng = (day, hour, salt = 0) => mulberry32(day * 7919 + hour * 104729 + salt * 31337 + 13);

function todayNumber() {
  const now = new Date();
  const local = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.floor((local - Date.UTC(2026, 0, 1)) / 86400000) + 1;
}
function dayFromHash() {
  const m = /day=(\d+)/.exec(location.hash);
  const n = m ? Number(m[1]) : 0;
  return n >= 1 && n <= 9999 ? n : clamp(todayNumber(), 1, 9999);
}

// ---------- Memory (small, optional) ----------

function readMemory() {
  try {
    return JSON.parse(localStorage.getItem('windsock') || '{}') || {};
  } catch (e) {
    return {};
  }
}
function writeMemory(v) {
  try {
    localStorage.setItem('windsock', JSON.stringify(v));
  } catch (e) {
    // Blocked storage: nothing is kept, and the game still plays.
  }
}

// ---------- Sound ----------

const { sound } = mountShell({
  sounds: {
    grab: 'sounds/grab.mp3',
    snap: 'sounds/snap.mp3',
    land: 'sounds/land.mp3',
    tyre: 'sounds/tyre.mp3',
    streak: 'sounds/streak.mp3',
    gust: 'sounds/gust.mp3',
    swing: 'sounds/swing.mp3',
    crash: 'sounds/crash.mp3',
    alarm: 'sounds/alarm.mp3',
    divert: 'sounds/divert.mp3',
    hour: 'sounds/hour.mp3',
    click: 'sounds/click.mp3',
    done: 'sounds/done.mp3',
    music: 'sounds/music.mp3',
  },
});
const heard = []; // the sounds asked for, for tests
function sfx(name, opts) {
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
// Green is left out: it would melt into the grass.
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
  mute: $('[data-mute]'),
  start: $('[data-screen="start"]'),
  crash: $('[data-screen="crash"]'),
  done: $('[data-screen="done"]'),
  paused: $('[data-screen="paused"]'),
  day: $('[data-day]'),
  play: $('[data-play]'),
  play9: $('[data-play9]'),
  bestStart: $('[data-best-start]'),
  crashDetail: $('[data-crash-detail]'),
  retry: $('[data-retry]'),
  newShift: $('[data-new]'),
  finalScore: $('[data-final-score]'),
  finalDetail: $('[data-final-detail]'),
  again: $('[data-again]'),
  another: $('[data-another]'),
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
let ground = null; // pre-drawn grass and runways
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
let day = dayFromHash();
let mode = 'start'; // start | play | crashing | crash | done
let paused = false;
let manual = false; // tests step the simulation themselves
let clock = 0; // seconds since the page opened (animation)
let st = null; // the shift's state (snapshotted per hour)
let snapshot = null;
let schedule = []; // this hour's arrivals still to come
let retries = 0; // retries of the current hour (the hidden assist)
let startHour = 0;
let crashInfo = null;
let drawing = null; // the one finger (or mouse) drawing a line
const particles = [];
const clouds = [];
let sweep = null; // the swing's sweep of light across the field
let sockAngle = 0; // drawn angle of the sock (downwind)
let lastAlarm = -9;
let musicStop = null;

function newShiftState(hour) {
  const rng = hourRng(day, 99);
  return {
    hour,
    t: 0,
    score: 0,
    landed: 0,
    diverted: 0,
    streak: 0,
    lastLand: -99,
    wind: Math.floor(rng() * 4),
    warn: null, // { to, at } during a warning
    swung: false,
    planes: [],
    nextId: 1,
    simTime: 0,
  };
}

// The arrivals of one hour, from the day's seed; the assist stretches the gaps.
function buildSchedule(d, hour, stretch = 0) {
  const cfg = HOURS[hour];
  const rng = hourRng(d, hour);
  const list = [];
  let t = hour === startHourOf() ? 1.5 : 0.5 + rng() * 2;
  while (t < HOUR_LEN - 2) {
    const heavy = rng() < cfg.heavy;
    const side = Math.floor(rng() * 4);
    const along = rng();
    const aim = { x: 50 + rng() * 80, y: 80 + rng() * 170 };
    const livery = LIVERIES[Math.floor(rng() * LIVERIES.length)];
    const fuel = 0.85 + rng() * 0.15;
    list.push({ at: t, type: heavy ? 'heavy' : 'prop', side, along, aim, livery, fuel });
    t += cfg.gap * (0.8 + rng() * 0.4) * (1 + stretch);
  }
  if (cfg.swing) {
    // A lull after the swing: arrivals in it slide past it, keeping their order.
    let next = SWING_AT + LULL;
    for (const a of list) {
      if (a.at >= SWING_AT - 1 && a.at < next) {
        a.at = next;
        next += 1.5;
      } else if (a.at >= next) next = a.at;
    }
  }
  return list.filter((a) => a.at < HOUR_LEN - 1).map((a) => ({ ...a, shown: false, delay: 0 }));
}
function startHourOf() {
  return startHour;
}

// The swing of an hour: 90° or 180°, from the seed. At 07:00 the strip is shut, so the swing always
// flips the long runway.
function swingTarget(d, hour, from) {
  const rng = hourRng(d, hour, 7);
  const r = rng();
  let to;
  if (r < 0.34) to = (from + 2) % 4;
  else if (r < 0.67) to = (from + 1) % 4;
  else to = (from + 3) % 4;
  if (hour === 1 && liveEnds(to).main === liveEnds(from).main) to = (from + 2) % 4;
  return to;
}

// Where an arrival comes in: along an edge, but never down a runway's approach (the top and bottom
// edges skip the long runway's line, the side edges skip the strip's).
function entryPoint(a) {
  const pad = 10;
  const gap = 34;
  if (a.side === 0 || a.side === 2) {
    const span = FW - 40 - 2 * gap;
    let x = 20 + a.along * span;
    if (x > MAIN.x - gap) x += 2 * gap;
    return { x, y: a.side === 0 ? -pad : FH + pad };
  }
  const span = FH - 60 - 2 * gap;
  let y = 30 + a.along * span;
  if (y > STRIP.y - gap) y += 2 * gap;
  return { x: a.side === 1 ? FW + pad : -pad, y };
}

function makePlane(type, x, y, hd, opts = {}) {
  const T = TYPES[type];
  return {
    id: st ? st.nextId++ : 0,
    type,
    livery: opts.livery ?? 0,
    x,
    y,
    hd,
    vx: Math.cos(hd) * T.speed,
    vy: Math.sin(hd) * T.speed,
    alt: 1,
    path: [],
    ring: null, // the end its line snaps to
    ringIdx: -1, // index of the ring point in its path
    state: 'fly', // fly | final | roll | divert
    hold: false, // circling
    fuel: T.fuel * (opts.fuel ?? 1),
    fuelMax: T.fuel,
    roll: null,
    fade: 0,
    conflict: false,
    born: st ? st.simTime : 0,
  };
}

// ---------- Rules ----------

function stripOpen() {
  return HOURS[st.hour] ? HOURS[st.hour].strip : true;
}
function isLive(endId) {
  const live = liveEnds(st.wind);
  return live.main === endId || live.strip === endId;
}
function soonLive(endId) {
  if (!st.warn) return false;
  const live = liveEnds(st.warn.to);
  return (live.main === endId || live.strip === endId) && !isLive(endId);
}
// Can this plane's line snap to this end now?
function canSnap(plane, endId) {
  const end = ENDS[endId];
  if (end.runway === 'strip' && (plane.type === 'heavy' || !stripOpen())) return false;
  return isLive(endId) || soonLive(endId);
}
const grabbable = (p) => p.state === 'fly' && !p.gone;
const layer = (p) => (p.state === 'roll' ? 'ground' : 'air');
const collidable = (p) => !p.gone && p.state !== 'divert' && !(p.state === 'roll' && p.fade > 0);
const sepOf = (a, b) => TYPES[a.type].r + TYPES[b.type].r;

// ---------- Lines ----------

function snapLine(plane, endId) {
  const end = ENDS[endId];
  plane.path.push({ x: end.ring.x, y: end.ring.y });
  plane.ringIdx = plane.path.length - 1;
  const n = Math.ceil(dist(end.ring, end.thr) / 4);
  for (let i = 1; i <= n; i++) {
    plane.path.push({
      x: end.ring.x + ((end.thr.x - end.ring.x) * i) / n,
      y: end.ring.y + ((end.thr.y - end.ring.y) * i) / n,
    });
  }
  plane.ring = endId;
}
function dropLine(plane) {
  plane.path = [];
  plane.ring = null;
  plane.ringIdx = -1;
}
// Extend a plane's line toward a field point, a point every 3 art px, and snap if it reaches a ring.
function extendLine(plane, head) {
  head = { x: clamp(head.x, 2, FW - 2), y: clamp(head.y, 2, FH - 2) };
  let last = plane.path[plane.path.length - 1] || { x: plane.x, y: plane.y };
  let d = dist(last, head);
  while (d >= 3) {
    const k = 3 / d;
    last = { x: last.x + (head.x - last.x) * k, y: last.y + (head.y - last.y) * k };
    plane.path.push(last);
    d = dist(last, head);
    for (const id of Object.keys(ENDS)) {
      if (dist(last, ENDS[id].ring) < SNAP_R) {
        if (canSnap(plane, id)) {
          snapLine(plane, id);
          return id;
        }
        ENDS[id].refused = clock;
      }
    }
  }
  return null;
}

// ---------- Simulation ----------

function update(dt) {
  if (mode === 'crash') {
    updateAmbient(dt); // the sky holds still behind the collision card
    return;
  }
  if (mode === 'play') updateShift(dt);
  updatePlanes(dt, mode === 'play');
  updateAmbient(dt);
}

function updateShift(dt) {
  st.t += dt;
  st.simTime += dt;
  const cfg = HOURS[st.hour];
  // The wind: warn, then swing.
  if (cfg.swing && !st.swung) {
    if (!st.warn && st.t >= SWING_AT - WARN) {
      st.warn = { to: swingTarget(day, st.hour, st.wind) };
      sfx('gust', { gain: 0.9 });
    }
    if (st.warn && st.t >= SWING_AT) doSwing();
  }
  // Arrivals.
  for (const a of schedule) {
    if (a.done) continue;
    const at = a.at + a.delay;
    if (st.t >= at - ARROW_LEAD) {
      if (!a.shown) {
        const flying = st.planes.filter((p) => !p.gone && p.state !== 'divert').length;
        if (flying + schedule.filter((b) => b.shown && !b.done).length >= cfg.max) {
          a.delay += dt; // full sky: the arrival waits, its arrow not yet shown
          continue;
        }
        a.shown = true;
        a.shownAt = st.t;
        a.delay = Math.max(a.delay, st.t + ARROW_LEAD - a.at);
      }
      if (st.t >= a.at + a.delay) {
        const e = entryPoint(a);
        const hd = Math.atan2(a.aim.y - e.y, a.aim.x - e.x);
        const p = makePlane(a.type, e.x, e.y, hd, { livery: a.livery, fuel: a.fuel });
        if (entryConflict(p)) {
          a.delay += 0.5; // the arrow stays; the plane comes when its way is clear
          continue;
        }
        p.enteredAt = st.t;
        p.arrowAt = a.shownAt;
        st.planes.push(p);
        a.done = true;
      }
    }
  }
  // The hour turns.
  if (st.t >= HOUR_LEN) {
    if (st.hour + 1 >= HOURS.length) {
      finishShift();
      return;
    }
    beginHour(st.hour + 1, true);
  }
}

// Would a plane entering here come within separation of another in its first 4 s?
function entryConflict(p) {
  for (const q of st.planes) {
    if (!collidable(q) || layer(q) !== 'air') continue;
    for (let t = 0; t <= 4; t += 0.25) {
      const a = { x: p.x + p.vx * t, y: p.y + p.vy * t };
      const b = { x: q.x + q.vx * t, y: q.y + q.vy * t };
      if (dist(a, b) < sepOf(p, q) * 1.3) return true;
    }
  }
  return false;
}

function doSwing() {
  st.wind = st.warn.to;
  st.warn = null;
  st.swung = true;
  sweep = { t: 0, dir: blowVec(st.wind) };
  sfx('swing');
  for (const p of st.planes) {
    if (p.state === 'fly' && p.ring && !isLive(p.ring)) {
      dropLine(p);
      p.hold = true;
    }
  }
  if (drawing && drawing.plane.ring && !isLive(drawing.plane.ring)) {
    dropLine(drawing.plane);
    drawing.plane.hold = true;
    drawing.snapped = true; // the finger's line is done
  }
}

function updatePlanes(dt, live) {
  const blow = blowVec(st ? st.wind : 0);
  for (const p of st.planes) {
    if (p.gone || p.crashed) continue;
    const T = TYPES[p.type];
    if (p.state === 'roll') {
      updateRoll(p, dt);
      continue;
    }
    if (p.state === 'divert') {
      p.fade += dt / 2;
      p.x += p.vx * 1.4 * dt;
      p.y += p.vy * 1.4 * dt;
      if (p.fade >= 1) p.gone = true;
      continue;
    }
    if (live) {
      p.fuel -= dt;
      if (p.fuel <= 0) {
        divert(p);
        continue;
      }
    }
    // Steering.
    let want = p.hd;
    let turn = T.turn;
    let drift = 0;
    if (p.path.length) {
      // Drop points behind; pure pursuit to a point a little ahead.
      while (p.path.length > 1 && dist(p, p.path[0]) < T.look * 0.7) {
        p.path.shift();
        p.ringIdx--;
      }
      if (p.state === 'fly' && p.ring && p.ringIdx < 0) commitToFinal(p);
      let target = p.path[p.path.length - 1];
      for (const q of p.path) {
        if (dist(p, q) >= T.look) {
          target = q;
          break;
        }
      }
      want = Math.atan2(target.y - p.y, target.x - p.x);
      if (p.path.length === 1 && dist(p, p.path[0]) < 3) {
        p.path.shift();
        p.ringIdx--;
        if (p.state === 'final') {
          touchDown(p);
          continue;
        }
        if (p.state === 'fly' && p.ring && p.ringIdx < 0) commitToFinal(p);
      }
    } else if (p.hold) {
      want = p.hd + 1.2;
      turn = T.turn * 0.55;
      drift = 1;
    } else {
      drift = 1;
    }
    if (!p.path.length && !p.hold) {
      // Free planes turn back inside the margin, toward the middle.
      const out = p.x < MARGIN || p.x > FW - MARGIN || p.y < MARGIN || p.y > FH - MARGIN;
      const toMid = { x: FW / 2 - p.x, y: FH / 2 - p.y };
      // Outside the margin a free plane heads back in (one entering is already headed in).
      if (out && (p.vx * toMid.x + p.vy * toMid.y) < 0.6 * Math.hypot(p.vx, p.vy) * Math.hypot(toMid.x, toMid.y)) {
        want = Math.atan2(toMid.y, toMid.x);
      }
    } else if (p.hold) {
      const out = p.x < MARGIN || p.x > FW - MARGIN || p.y < MARGIN || p.y > FH - MARGIN;
      if (out) {
        want = Math.atan2(FH / 2 - p.y, FW / 2 - p.x);
        turn = T.turn;
      }
    }
    const diff = wrapAngle(want - p.hd);
    p.hd += clamp(diff, -turn * dt, turn * dt);
    p.vx = Math.cos(p.hd) * T.speed + blow.x * DRIFT * drift;
    p.vy = Math.sin(p.hd) * T.speed + blow.y * DRIFT * drift;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (p.state === 'final') {
      const end = ENDS[p.ring];
      const total = dist(end.ring, end.thr);
      p.alt = clamp(dist(p, end.thr) / total, 0.05, 1);
    }
  }
  st.planes = st.planes.filter((p) => !p.gone);
  if (live) checkConflicts();
}

function commitToFinal(p) {
  if (!isLive(p.ring)) {
    // Reached an end that isn't live yet (drawn during the warning): circle here.
    dropLine(p);
    p.hold = true;
    return;
  }
  p.state = 'final';
}

function touchDown(p) {
  const end = ENDS[p.ring];
  const T = TYPES[p.type];
  p.state = 'roll';
  p.alt = 0;
  const len = T.roll[end.runway];
  p.roll = { d: 0, len, v0: T.speed * 1.3, lat: (p.x - end.thr.x) * end.dir.y - (p.y - end.thr.y) * end.dir.x };
  p.hd = Math.atan2(end.dir.y, end.dir.x);
  p.path = [];
  // Points, with the streak.
  if (mode === 'play') {
    st.streak = st.simTime - st.lastLand <= STREAK_GAP ? Math.min(st.streak + 1, STREAK_MAX) : 1;
    st.lastLand = st.simTime;
    const pts = T.points * st.streak;
    st.score += pts;
    st.landed++;
    popups.push({ x: p.x, y: p.y - 10, text: st.streak > 1 ? `+${pts} ×${st.streak}` : `+${pts}`, t: 0 });
    sfx('land', { rate: p.type === 'heavy' ? 0.8 : 1 });
    sfx('tyre', { gain: 0.7, rate: 0.9 + Math.random() * 0.2 });
    if (st.streak > 1) sfx('streak', { rate: 0.9 + st.streak * 0.08, gain: 0.7 });
  }
  for (let i = 0; i < 4; i++) puff(p.x + (Math.random() - 0.5) * 6, p.y + (Math.random() - 0.5) * 6, 0.6 + Math.random() * 0.4);
}

function updateRoll(p, dt) {
  const end = ENDS[p.ring];
  const r = p.roll;
  const remaining = Math.max(0, r.len - r.d);
  const v = r.len ? Math.max(4, r.v0 * Math.sqrt(remaining / r.len)) : 0;
  r.d = Math.min(r.len, r.d + v * dt);
  r.lat *= Math.exp(-dt * 6);
  p.x = end.thr.x + end.dir.x * r.d - end.dir.y * r.lat;
  p.y = end.thr.y + end.dir.y * r.d + end.dir.x * r.lat;
  p.vx = end.dir.x * v;
  p.vy = end.dir.y * v;
  if (r.d >= r.len - 0.5) {
    p.fade += dt / 0.6;
    if (p.fade >= 1) p.gone = true;
  }
}

function divert(p) {
  p.state = 'divert';
  dropLine(p);
  p.hold = false;
  // Off toward the nearest edge.
  const ex = p.x < FW / 2 ? -1 : 1;
  const ey = p.y < FH / 2 ? -1 : 1;
  const toX = Math.min(p.x, FW - p.x) < Math.min(p.y, FH - p.y);
  p.hd = toX ? (ex < 0 ? Math.PI : 0) : ey < 0 ? -Math.PI / 2 : Math.PI / 2;
  const T = TYPES[p.type];
  p.vx = Math.cos(p.hd) * T.speed;
  p.vy = Math.sin(p.hd) * T.speed;
  if (drawing && drawing.plane === p) drawing = null;
  if (mode === 'play') {
    st.diverted++;
    st.streak = 0;
    popups.push({ x: p.x, y: p.y - 10, text: 'Diverted', t: 0, dim: true });
    sfx('divert', { gain: 0.8 });
  }
}

function checkConflicts() {
  const ps = st.planes.filter(collidable);
  for (const p of ps) p.conflict = false;
  let newConflict = false;
  for (let i = 0; i < ps.length; i++) {
    for (let j = i + 1; j < ps.length; j++) {
      const a = ps[i];
      const b = ps[j];
      if (layer(a) !== layer(b)) continue;
      const sep = sepOf(a, b);
      if (dist(a, b) < sep) {
        crash(a, b);
        return;
      }
      for (let t = 0.2; t <= 2; t += 0.2) {
        const pa = { x: a.x + a.vx * t, y: a.y + a.vy * t };
        const pb = { x: b.x + b.vx * t, y: b.y + b.vy * t };
        if (dist(pa, pb) < sep) {
          if (!a.conflict && !b.conflict) newConflict = true;
          a.conflict = b.conflict = true;
          a.conflictWith = b.id;
          break;
        }
      }
    }
  }
  if (newConflict && clock - lastAlarm > 1.2) {
    lastAlarm = clock;
    sfx('alarm', { gain: 0.6 });
  }
}

function crash(a, b) {
  mode = 'crashing';
  drawing = null;
  crashInfo = { a: a.id, b: b.id, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, hour: st.hour, at: clockText() };
  a.crashed = b.crashed = true;
  for (let i = 0; i < 10; i++) puff(crashInfo.x + (Math.random() - 0.5) * 14, crashInfo.y + (Math.random() - 0.5) * 14, 1 + Math.random());
  sfx('crash');
  crashTimer = 1.1;
  syncScreens();
}
let crashTimer = 0;

// ---------- Ambient: clouds, smoke, puffs ----------

const popups = [];
function puff(x, y, size) {
  particles.push({ x, y, size, life: 0, max: 1.2 + Math.random() * 0.6 });
}

function updateAmbient(dt) {
  const blow = blowVec(st ? st.wind : 0);
  for (const c of clouds) {
    c.x += blow.x * DRIFT * 1.6 * dt;
    c.y += blow.y * DRIFT * 1.6 * dt;
    const m = 60;
    if (c.x < -m - GEXT) c.x += FW + 2 * (m + GEXT);
    if (c.x > FW + m + GEXT) c.x -= FW + 2 * (m + GEXT);
    if (c.y < -m - GEXT) c.y += FH + 2 * (m + GEXT);
    if (c.y > FH + m + GEXT) c.y -= FH + 2 * (m + GEXT);
  }
  for (const p of particles) {
    p.life += dt;
    p.x += blow.x * DRIFT * 1.2 * dt;
    p.y += blow.y * DRIFT * 1.2 * dt;
  }
  for (let i = particles.length - 1; i >= 0; i--) if (particles[i].life >= particles[i].max) particles.splice(i, 1);
  for (const p of popups) p.t += dt;
  for (let i = popups.length - 1; i >= 0; i--) if (popups[i].t > 1.4) popups.splice(i, 1);
  // Chimney smoke from the houses.
  smokeTimer -= dt;
  if (smokeTimer <= 0) {
    smokeTimer = 0.7;
    for (const h of chimneys) if (Math.random() < 0.5) puff(h.x, h.y, 0.45);
  }
  if (sweep) {
    sweep.t += dt;
    if (sweep.t > 1.4) sweep = null;
  }
  // The sock: toward the wind, shivering during a warning.
  const target = Math.atan2(blow.y, blow.x);
  sockAngle += wrapAngle(target - sockAngle) * Math.min(1, dt * 2.2);
}
let smokeTimer = 0;
const chimneys = [];

// ---------- Shift flow ----------

function beginShift(hour) {
  startHour = hour;
  st = newShiftState(hour);
  particles.length = 0;
  popups.length = 0;
  retries = 0;
  // A prop is already on its way in, beside the live approach, so the first landing comes quickly.
  const live = ENDS[liveEnds(st.wind).main];
  const first = makePlane('prop', 42, live.ring.y + (live.dir.y > 0 ? 50 : -50), live.dir.y > 0 ? -Math.PI / 2 : Math.PI / 2, {
    livery: LIVERIES[day % 3],
  });
  st.planes.push(first);
  beginHour(hour, false);
  mode = 'play';
  if (!musicStop) musicStop = sound.loop('music', { gain: 0.32 });
  syncScreens();
}

function beginHour(hour, chime) {
  st.hour = hour;
  st.t = 0;
  st.warn = null;
  st.swung = false;
  if (chime) {
    retries = 0;
    sfx('hour');
    ui.clock.classList.remove('tick');
    void ui.clock.offsetWidth;
    ui.clock.classList.add('tick');
  }
  snapshot = JSON.parse(JSON.stringify(st));
  schedule = buildSchedule(day, hour, Math.min(ASSIST_MAX, retries * ASSIST_STEP));
}

function retryHour() {
  retries++;
  st = JSON.parse(JSON.stringify(snapshot));
  st.streak = 0;
  st.lastLand = -99;
  for (const p of st.planes) p.conflict = false;
  crashInfo = null;
  schedule = buildSchedule(day, st.hour, Math.min(ASSIST_MAX, retries * ASSIST_STEP));
  mode = 'play';
  sfx('click');
  syncScreens();
}

function finishShift() {
  mode = 'done';
  drawing = null;
  sfx('done');
  const fullShift = startHour === 0;
  if (fullShift) {
    memory.best = memory.best || {};
    memory.best[day] = Math.max(memory.best[day] || 0, st.score);
    memory.start9 = true;
    writeMemory(memory);
  }
  const best = memory.best && memory.best[day];
  ui.finalScore.textContent = String(st.score);
  ui.finalDetail.textContent =
    `${st.landed} landed · ${st.diverted} diverted` + (best ? ` · best today ${best}` : '') + (fullShift ? '' : ' · from 09:00');
  syncScreens();
}

function showStart() {
  mode = 'start';
  crashInfo = null;
  drawing = null;
  attract();
  ui.day.textContent = `Day ${day}`;
  ui.play9.hidden = !memory.start9;
  const best = memory.best && memory.best[day];
  ui.bestStart.hidden = !best;
  ui.bestStart.textContent = best ? `Best today: ${best}` : '';
  syncScreens();
}

// Behind the start card: two props circling and clouds drifting.
function attract() {
  st = newShiftState(0);
  st.planes.push(Object.assign(makePlane('prop', 50, 210, 0, { livery: 1 }), { hold: true }));
  st.planes.push(Object.assign(makePlane('prop', 130, 110, Math.PI, { livery: 0 }), { hold: true }));
  st.planes.push(makePlane('heavy', 150, 290, -2.2, { livery: 3 }));
  schedule = [];
}

function clockText() {
  if (!st) return '06:00';
  const mins = Math.min(59, Math.floor((st.t / HOUR_LEN) * 60));
  return `${String(6 + st.hour).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

function syncScreens() {
  ui.start.hidden = !(mode === 'start' && !paused);
  ui.crash.hidden = !(mode === 'crash' && !paused);
  ui.done.hidden = !(mode === 'done' && !paused);
  ui.paused.hidden = !paused;
  ui.hud.hidden = mode === 'start';
  if (mode === 'crash' && crashInfo) {
    const h = `${String(6 + crashInfo.hour).padStart(2, '0')}:00`;
    ui.retry.textContent = `Retry ${h}`;
    ui.crashDetail.textContent = `Two planes touched at ${crashInfo.at}.`;
  }
}

let shownScore = -1;
let shownClock = '';
let shownStreak = -1;
function syncHud() {
  if (!st) return;
  const c = clockText();
  if (c !== shownClock) ui.clock.textContent = shownClock = c;
  if (st.score !== shownScore) ui.score.textContent = String((shownScore = st.score));
  const k = st.simTime - st.lastLand <= STREAK_GAP && st.streak > 1 ? st.streak : 0;
  if (k !== shownStreak) {
    shownStreak = k;
    ui.streak.hidden = !k;
    ui.streak.textContent = k ? `×${k}` : '';
  }
}

// ---------- Input ----------

function pointerPos(e) {
  return { x: e.clientX, y: e.clientY };
}

canvas.addEventListener('pointerdown', (e) => {
  if (paused || mode !== 'play') return;
  if (drawing) return; // one drawing finger; a second is ignored
  const c = pointerPos(e);
  const f = toField(c.x, c.y);
  const grabR = Math.max(GRAB_CSS / S, 8);
  let best = null;
  let bestD = grabR;
  for (const p of st.planes) {
    if (!grabbable(p)) continue;
    const d = dist(p, f);
    if (d < bestD) {
      best = p;
      bestD = d;
    }
  }
  if (!best) return;
  e.preventDefault();
  try {
    canvas.setPointerCapture(e.pointerId);
  } catch (err) {}
  dropLine(best);
  best.hold = false;
  best.path = [];
  drawing = { id: e.pointerId, plane: best, touch: e.pointerType !== 'mouse', sx: c.x, sy: c.y, snapped: false, head: { x: best.x, y: best.y } };
  sfx('grab', { gain: 0.6 });
});

function headFor(d, c) {
  const moved = Math.hypot(c.x - d.sx, c.y - d.sy);
  const blend = d.touch ? clamp(moved / OFFSET_BLEND, 0, 1) : 0;
  return { x: c.x, y: c.y - FINGER_OFFSET * blend };
}

canvas.addEventListener('pointermove', (e) => {
  if (!drawing || e.pointerId !== drawing.id || drawing.snapped) return;
  const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
  for (const ev of evs.length ? evs : [e]) {
    const head = headFor(drawing, pointerPos(ev));
    drawing.headCss = head;
    const f = toField(head.x, head.y);
    drawing.head = f;
    if (drawing.plane.state !== 'fly') {
      drawing = null;
      return;
    }
    const snapped = extendLine(drawing.plane, f);
    if (snapped) {
      drawing.snapped = true;
      sfx('snap', { gain: 0.8 });
      break;
    }
  }
});

function endDraw(e) {
  if (!drawing || e.pointerId !== drawing.id) return;
  drawing = null;
}
canvas.addEventListener('pointerup', endDraw);
canvas.addEventListener('pointercancel', endDraw);
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

// ---------- Drawing ----------

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
  // Grass, with a few speckled tiles.
  for (let y = 0; y < gh; y += 16) for (let x = 0; x < gw; x += 16) tile(rnd() < 0.82 ? 110 : 50, x, y);
  const O = GEXT; // field origin in the ground canvas
  const keepClear = (x, y) => {
    const fx = x - O + 8;
    const fy = y - O + 8;
    if (Math.abs(fx - MAIN.x) < 26 && fy > 10 && fy < FH - 8) return true;
    if (Math.abs(fy - STRIP.y) < 22 && fx > -6 && fx < FW + 6) return true;
    if (Math.abs(fx - SOCK.x) < 14 && Math.abs(fy - SOCK.y) < 14) return true;
    return false;
  };
  // Fields and trees, thicker outside the field; a village in two corners.
  for (let y = 0; y < gh; y += 16) {
    for (let x = 0; x < gw; x += 16) {
      if (keepClear(x, y)) continue;
      const inField = x >= O - 8 && x < O + FW - 8 && y >= O - 8 && y < O + FH - 8;
      const r = rnd();
      if (r < (inField ? 0.05 : 0.14)) tile([36, 48, 60][Math.floor(rnd() * 3)], x, y);
      else if (r < (inField ? 0.065 : 0.18)) tile(109, x, y);
      else if (r < (inField ? 0.07 : 0.2)) tile(111, x, y);
    }
  }
  chimneys.length = 0;
  const houses = [
    [O + 6, O + 300, 72],
    [O + 22, O + 306, 84],
    [O + 8, O + 282, 84],
    [O + 150, O + 12, 78],
    [O + 162, O + 30, 90],
    [O + 140, O + 32, 78],
  ];
  for (const [x, y, i] of houses) {
    c.fillStyle = '#8cc63f';
    tile(i, x, y);
    chimneys.push({ x: x - O + 11, y: y - O + 3 });
  }
  // The apron by the long runway: concrete, with two hangars.
  c.fillStyle = '#3e4255';
  c.fillRect(O + MAIN.x + 10, O + 196, 30, 44);
  c.fillStyle = '#a9abb8';
  c.fillRect(O + MAIN.x + 11, O + 197, 28, 42);
  tile(16, O + MAIN.x + 17, O + 204);
  tile(16, O + MAIN.x + 17, O + 221);
  // Runways.
  drawRunways(c, O);
  return g;
}

function drawRunways(c, O) {
  // The strip: packed dirt with white edge markers.
  const sx = O + STRIP.x0;
  const sy = O + STRIP.y - STRIP.w / 2;
  c.fillStyle = '#3e4255';
  c.fillRect(sx - 1, sy - 1, STRIP.x1 - STRIP.x0 + 2, STRIP.w + 2);
  c.fillStyle = '#d98a52';
  c.fillRect(sx, sy, STRIP.x1 - STRIP.x0, STRIP.w);
  c.fillStyle = '#c4703d';
  for (let x = sx + 3; x < sx + STRIP.x1 - STRIP.x0 - 3; x += 7) c.fillRect(x, sy + 3 + ((x * 7) % 4), 2, 1);
  c.fillStyle = '#fff';
  for (let x = sx + 2; x < sx + STRIP.x1 - STRIP.x0; x += 10) {
    c.fillRect(x, sy, 3, 1);
    c.fillRect(x, sy + STRIP.w - 1, 3, 1);
  }
  // The long runway: asphalt, edge lines, centre dashes, threshold bars.
  const mx = O + MAIN.x - MAIN.w / 2;
  const my = O + MAIN.y0;
  const ml = MAIN.y1 - MAIN.y0;
  c.fillStyle = '#3e4255';
  c.fillRect(mx - 1, my - 1, MAIN.w + 2, ml + 2);
  c.fillStyle = '#5c6274';
  c.fillRect(mx, my, MAIN.w, ml);
  c.fillStyle = '#e8e8ef';
  c.fillRect(mx + 1, my, 1, ml);
  c.fillRect(mx + MAIN.w - 2, my, 1, ml);
  for (let y = my + 18; y < my + ml - 18; y += 12) c.fillRect(O + MAIN.x - 0.5, y, 1, 6);
  for (const yy of [my + 2, my + ml - 7]) for (let x = mx + 3; x < mx + MAIN.w - 3; x += 2) c.fillRect(x, yy, 1, 5);
  // The crossing: the long runway's asphalt runs over the strip.
  c.fillStyle = '#5c6274';
  c.fillRect(mx, O + STRIP.y - STRIP.w / 2, MAIN.w, STRIP.w);
}

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

function sprite(p) {
  const row = p.type === 'heavy' ? 0 : 1;
  return { sx: p.livery * 32, sy: row * 32 };
}

function drawPlane(p, a) {
  const T = TYPES[p.type];
  const { sx, sy } = sprite(p);
  const fadeA = p.state === 'divert' ? 1 - p.fade : p.state === 'roll' ? 1 - p.fade : 1;
  // Crab: the nose turned a little into the wind while airborne.
  const blow = blowVec(st.wind);
  const cross = Math.cos(p.hd) * blow.y - Math.sin(p.hd) * blow.x;
  const crab = p.alt > 0.2 ? -cross * 0.22 : 0;
  const rot = p.hd + Math.PI / 2 + crab;
  const sc = T.scale * (0.86 + 0.14 * p.alt);
  // Shadow, offset by height.
  ctx.save();
  ctx.globalAlpha = 0.28 * fadeA * a;
  ctx.translate(p.x + 4 * p.alt + 1, p.y + 6 * p.alt + 1);
  ctx.rotate(rot);
  ctx.scale(sc, sc);
  ctx.filter = 'brightness(0)';
  ctx.drawImage(planesImg, sx, sy, 32, 32, -16, -16, 32, 32);
  ctx.restore();
  ctx.save();
  ctx.globalAlpha = fadeA * a;
  ctx.translate(p.x, p.y);
  ctx.rotate(rot);
  ctx.scale(sc, sc);
  ctx.drawImage(planesImg, sx, sy, 32, 32, -16, -16, 32, 32);
  ctx.restore();
}

function ringPath(x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
}

function drawEnds() {
  const open = stripOpen();
  for (const e of Object.values(ENDS)) {
    const strip = e.runway === 'strip';
    if (strip && !open) continue;
    const live = isLive(e.id);
    const soon = soonLive(e.id);
    const blink = Math.sin(clock * 10) > 0;
    let color = 'rgba(62,66,85,0.55)';
    if (live) color = '#5ee05a';
    if (soon) color = blink ? '#ffb02e' : 'rgba(255,176,46,0.35)';
    const going = live && st.warn && !liveEndsHas(st.warn.to, e.id);
    if (going) color = blink ? '#5ee05a' : 'rgba(94,224,90,0.4)';
    ctx.lineWidth = live || soon ? 2 : 1.2;
    ctx.strokeStyle = color;
    ringPath(e.ring.x, e.ring.y, RING_R);
    ctx.stroke();
    if (live || soon) {
      ctx.fillStyle = live ? 'rgba(94,224,90,0.16)' : 'rgba(255,176,46,0.12)';
      ringPath(e.ring.x, e.ring.y, RING_R);
      ctx.fill();
      // Rabbit lights: chevrons running toward the runway.
      const n = 3;
      const L = dist(e.ring, e.thr);
      const ang = Math.atan2(e.dir.y, e.dir.x);
      for (let i = 0; i < n; i++) {
        const k = (i + 1) / (n + 1);
        const phase = (clock * 2.5 - k) % 1;
        const on = phase > 0 && phase < 0.35;
        const cx = e.ring.x + (e.thr.x - e.ring.x) * k;
        const cy = e.ring.y + (e.thr.y - e.ring.y) * k;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(ang);
        ctx.strokeStyle = live ? (on ? '#d6ffd0' : '#5ee05a') : on ? '#fff0c0' : '#ffb02e';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(-2, -4);
        ctx.lineTo(2, 0);
        ctx.lineTo(-2, 4);
        ctx.stroke();
        ctx.restore();
      }
      void L;
    }
    // A refused end shows a cross for a moment.
    if (e.refused && clock - e.refused < 0.5) {
      ctx.strokeStyle = 'rgba(62,66,85,0.9)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(e.ring.x - 5, e.ring.y - 5);
      ctx.lineTo(e.ring.x + 5, e.ring.y + 5);
      ctx.moveTo(e.ring.x + 5, e.ring.y - 5);
      ctx.lineTo(e.ring.x - 5, e.ring.y + 5);
      ctx.stroke();
    }
  }
  if (!open) {
    // A closed runway: yellow crosses on it.
    ctx.strokeStyle = '#ffd23f';
    ctx.lineWidth = 1.6;
    for (const x of [STRIP.x0 + 10, STRIP.x1 - 10]) {
      ctx.beginPath();
      ctx.moveTo(x - 4, STRIP.y - 3);
      ctx.lineTo(x + 4, STRIP.y + 3);
      ctx.moveTo(x + 4, STRIP.y - 3);
      ctx.lineTo(x - 4, STRIP.y + 3);
      ctx.stroke();
    }
  }
}
function liveEndsHas(dir, id) {
  const l = liveEnds(dir);
  return l.main === id || l.strip === id;
}

function drawSock() {
  const shiver = st.warn ? Math.sin(clock * 38) * 0.35 : Math.sin(clock * 5) * 0.06;
  const a = sockAngle + shiver;
  // Pole and its shadow.
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.fillRect(SOCK.x - 1, SOCK.y, 5, 2);
  ctx.fillStyle = '#3e4255';
  ctx.fillRect(SOCK.x - 2, SOCK.y - 2, 4, 4);
  ctx.save();
  ctx.translate(SOCK.x, SOCK.y);
  ctx.rotate(a);
  // A striped cone, wide at the pole, flapping a little.
  const segs = 4;
  const len = 20;
  for (let i = 0; i < segs; i++) {
    const x0 = (i * len) / segs + 2;
    const x1 = ((i + 1) * len) / segs + 2;
    const w0 = 4.2 - i * 0.7;
    const w1 = 4.2 - (i + 1) * 0.7;
    const wob = Math.sin(clock * 9 - i) * 0.6 * (i / segs);
    ctx.fillStyle = i % 2 ? '#ffffff' : '#ff6a2b';
    ctx.beginPath();
    ctx.moveTo(x0, -w0 + wob);
    ctx.lineTo(x1, -w1 + wob);
    ctx.lineTo(x1, w1 + wob);
    ctx.lineTo(x0, w0 + wob);
    ctx.closePath();
    ctx.fill();
  }
  ctx.strokeStyle = '#3e4255';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(2, -4.2);
  ctx.lineTo(len + 2, -1.4);
  ctx.lineTo(len + 2, 1.4);
  ctx.lineTo(2, 4.2);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

function drawLine(p) {
  if (!p.path.length) return;
  const ringI = p.ringIdx;
  let last = { x: p.x, y: p.y };
  let acc = 0;
  for (let i = 0; i < p.path.length; i++) {
    const q = p.path[i];
    acc += dist(last, q);
    last = q;
    if (acc < 3) continue;
    acc = 0;
    const final = p.ring && i > ringI;
    ctx.fillStyle = final ? 'rgba(94,224,90,0.9)' : 'rgba(255,255,255,0.88)';
    ctx.fillRect(q.x - 1, q.y - 1, 2, 2);
  }
}

function drawFuel(p) {
  if (p.state !== 'fly') return;
  const T = TYPES[p.type];
  const f = clamp(p.fuel / p.fuelMax, 0, 1);
  const low = f < 0.25;
  if (low && Math.sin(clock * 12) < 0) return;
  ctx.strokeStyle = low ? '#ffffff' : 'rgba(255,255,255,0.55)';
  ctx.lineWidth = low ? 1.6 : 1;
  ctx.beginPath();
  ctx.arc(p.x, p.y, T.r + 4, -Math.PI / 2, -Math.PI / 2 + f * Math.PI * 2);
  ctx.stroke();
}

function draw() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#8cc63f';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const k = S * dpr;
  ctx.setTransform(k, 0, 0, k, offX * dpr, offY * dpr);
  ctx.imageSmoothingEnabled = false;
  if (ground) ctx.drawImage(ground, -GEXT, -GEXT);
  // Cloud shadows on the ground.
  for (const c of clouds) {
    ctx.globalAlpha = 0.1;
    ctx.drawImage(c.shadow, Math.round(c.x + 14), Math.round(c.y + 20));
  }
  ctx.globalAlpha = 1;
  drawEnds();
  drawSock();
  // Smoke and tyre puffs.
  for (const p of particles) {
    const a = 1 - p.life / p.max;
    ctx.globalAlpha = 0.55 * a;
    const s = 10 * p.size * (0.6 + 0.6 * (p.life / p.max));
    ctx.drawImage(tiles, 8 * 16, 0, 16, 16, p.x - s / 2, p.y - s / 2, s, s);
  }
  ctx.globalAlpha = 1;
  // Arrival arrows at the edge.
  if (mode === 'play') {
    for (const a of schedule) {
      if (!a.shown || a.done) continue;
      const e = entryPoint(a);
      const x = clamp(e.x, 7, FW - 7);
      const y = clamp(e.y, 7, FH - 7);
      const ang = Math.atan2(a.aim.y - e.y, a.aim.x - e.x);
      const pulse = 0.6 + 0.4 * Math.sin(clock * 8);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(ang);
      ctx.scale(1.4, 1.4);
      ctx.globalAlpha = pulse;
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#3e4255';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(5, 0);
      ctx.lineTo(-3, -4);
      ctx.lineTo(-1, 0);
      ctx.lineTo(-3, 4);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }
  // Lines under the planes.
  for (const p of st.planes) drawLine(p);
  // The swing's sweep of light, under the planes.
  if (sweep) {
    const k2 = sweep.t / 1.4;
    const ang = Math.atan2(sweep.dir.y, sweep.dir.x);
    ctx.save();
    ctx.translate(FW / 2, FH / 2);
    ctx.rotate(ang);
    const x = -260 + k2 * 520;
    const grad = ctx.createLinearGradient(x - 40, 0, x + 40, 0);
    grad.addColorStop(0, 'rgba(255,255,255,0)');
    grad.addColorStop(0.5, 'rgba(255,255,255,0.22)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(x - 40, -300, 80, 600);
    ctx.restore();
  }
  // Planes: rolling ones first, then the air.
  const order = [...st.planes].sort((a, b) => a.alt - b.alt);
  const dim = mode === 'crashing' || mode === 'crash' ? 0.75 : 1;
  for (const p of order) drawPlane(p, p.crashed ? 1 : dim);
  // Clouds above the ground, faint, under the planes' marks.
  for (const c of clouds) {
    ctx.globalAlpha = 0.32;
    ctx.drawImage(c.img, Math.round(c.x), Math.round(c.y));
  }
  ctx.globalAlpha = 1;
  // Fuel, conflict and crash marks on top: nothing hides them.
  for (const p of st.planes) drawFuel(p);
  const byId = new Map(st.planes.map((p) => [p.id, p]));
  for (const p of st.planes) {
    if (!p.conflict) continue;
    const T = TYPES[p.type];
    ctx.strokeStyle = '#ff3b30';
    ctx.lineWidth = 1.6;
    ringPath(p.x, p.y, T.r + 2);
    ctx.stroke();
    const q = byId.get(p.conflictWith);
    if (q && q.conflict) {
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(q.x, q.y);
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }
  if (crashInfo && (mode === 'crashing' || mode === 'crash')) {
    ctx.strokeStyle = '#ff3b30';
    ctx.lineWidth = 2;
    ringPath(crashInfo.x, crashInfo.y, 16 + Math.sin(clock * 6) * 1.5);
    ctx.stroke();
  }
  // The drawing head.
  if (drawing && !drawing.snapped && drawing.head) {
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.2;
    ringPath(drawing.head.x, drawing.head.y, 3.5);
    ctx.stroke();
  }
  // Points.
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const p of popups) {
    const a = 1 - p.t / 1.4;
    ctx.globalAlpha = a;
    ctx.font = 'bold 8px system-ui, sans-serif';
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = 'rgba(30,34,48,0.8)';
    ctx.fillStyle = p.dim ? '#e3e8f2' : '#ffd23f';
    const y = p.y - p.t * 10;
    ctx.strokeText(p.text, p.x, y);
    ctx.fillText(p.text, p.x, y);
  }
  ctx.globalAlpha = 1;
}

// ---------- Loop ----------

let last = performance.now();
let acc = 0;
let running = true;
function frame(now) {
  if (!running) return;
  let raw = Math.min(0.1, Math.max(0, (now - last) / 1000));
  last = now;
  if (!paused) {
    if (!manual) advance(raw);
    clock += raw;
  }
  if (tiles.complete && planesImg.complete) {
    if (!ground && tiles.naturalWidth) ground = buildGround();
    draw();
  }
  syncHud();
  requestAnimationFrame(frame);
}

// Advance real time: fixed steps; slow motion while crashing.
function advance(raw) {
  if (mode === 'crashing') {
    crashTimer -= raw;
    raw *= 0.25;
    if (crashTimer <= 0) {
      mode = 'crash';
      syncScreens();
    }
  }
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
    drawing = null;
    if (mode === 'play' || mode === 'crashing') {
      paused = true;
      syncScreens();
    }
    sound.suspend();
  } else {
    last = performance.now();
  }
});

// ---------- UI ----------

ui.play.addEventListener('click', () => {
  sfx('click');
  beginShift(0);
});
ui.play9.addEventListener('click', () => {
  sfx('click');
  beginShift(3);
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
ui.another.addEventListener('click', () => {
  sfx('click');
  let d = day;
  while (d === day) d = 1 + Math.floor(Math.random() * 999);
  location.hash = `day=${d}`; // hashchange picks it up
});
window.addEventListener('hashchange', () => {
  day = dayFromHash();
  showStart();
});
ui.resume.addEventListener('click', () => {
  paused = false;
  last = performance.now();
  sound.unlock();
  syncScreens();
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

resize();
seedClouds();
showStart();
requestAnimationFrame(frame);

// For tests and balance runs: read the state, and step the simulation without drawing.
window.__windsock = {
  get st() {
    return st;
  },
  get mode() {
    return mode;
  },
  get paused() {
    return paused;
  },
  get drawing() {
    return drawing;
  },
  get schedule() {
    return schedule;
  },
  get snapshot() {
    return snapshot;
  },
  get retries() {
    return retries;
  },
  get day() {
    return day;
  },
  set manual(v) {
    manual = v;
  },
  view: () => ({ S, offX, offY, cssW, cssH, dpr, hudBottom }),
  ENDS,
  HOURS,
  TYPES,
  FW,
  FH,
  HOUR_LEN,
  SWING_AT,
  WARN,
  LULL,
  STEP,
  liveEnds,
  blowVec,
  buildSchedule,
  swingTarget,
  canSnap,
  extendLine,
  makePlane,
  toScreen,
  toField,
  beginShift,
  beginHour,
  showStart,
  retryHour,
  heard,
  memory: () => readMemory(),
  // Run the simulation for `seconds` of game time in fixed steps (or `hz` frames per second).
  run(seconds, hz) {
    if (!hz) {
      const n = Math.round(seconds / STEP);
      for (let i = 0; i < n && mode !== 'crashing'; i++) update(STEP);
      return;
    }
    const frames = Math.round(seconds * hz);
    for (let i = 0; i < frames; i++) advance(1 / hz);
  },
  addPlane(type, x, y, hd, opts) {
    const p = makePlane(type, x, y, hd, opts);
    st.planes.push(p);
    return p.id;
  },
  plane: (id) => st.planes.find((p) => p.id === id),
  // Put a plane straight onto a runway end's threshold and touch it down.
  land(id, endId) {
    const p = st.planes.find((q) => q.id === id);
    p.ring = endId;
    p.x = ENDS[endId].thr.x;
    p.y = ENDS[endId].thr.y;
    touchDown(p);
  },
  isLive: (id) => isLive(id),
  soonLive: (id) => soonLive(id),
  entryConflict: (p) => entryConflict(p),
  entryPoint,
  advance,
  clouds: () => clouds.map((c) => ({ x: c.x, y: c.y })),
};

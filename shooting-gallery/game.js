// Shooting Gallery: a fairground paintball booth (specs/shooting-gallery.md).
//
// The booth is drawn on one canvas in logical units. Portrait stacks 5 lanes, landscape 3, from the
// far lane (small, worth the most) to the near one. Each lane is a strip of water or grass with its
// targets running along it, one way or the other; pop-ups rise from behind any lane's strip and
// drop-downs are lowered into a lane on a rope.
//
// There is no crosshair. A slingshot stands on the counter: pull back and let go. Pulling sideways
// moves the landing point the other way along the lanes, pulling down sends it farther, and the
// paintball takes a moment to fly, so a moving target has to be led. Every miss leaves its paint.
import { mountShell } from '../shared/game-shell.js';
import { FRAMES, ATLAS_SCALE } from './atlas.js';

const { sound } = mountShell({
  sounds: {
    twang: 'sounds/twang.mp3',
    splat: 'sounds/splat.mp3',
    splat2: 'sounds/splat2.mp3',
    plip: 'sounds/plip.mp3',
    hit: 'sounds/hit.mp3',
    tin: 'sounds/tin.mp3',
    ding: 'sounds/ding.mp3',
    dry: 'sounds/tick.mp3',
    splash: 'sounds/splash.mp3',
    round: 'sounds/round.mp3',
    quota: 'sounds/quota.mp3',
    lost: 'sounds/lost.mp3',
    finale: 'sounds/finale.mp3',
    music: 'sounds/music.mp3',
    frenzy: 'sounds/frenzy.mp3',
    frenzyhit: 'sounds/frenzyhit.mp3',
    chime: 'sounds/chime.mp3',
    warn: 'sounds/warn.mp3',
    tock: 'sounds/tock.mp3',
  },
});

// Every sound played, newest last, for the tests.
const heard = [];
const heardOpts = {}; // the options each sound was last played with
function sfx(name, opts) {
  heard.push(name);
  heardOpts[name] = { gain: 1, rate: 1, ...(opts || {}) };
  if (heard.length > 60) heard.shift();
  sound.play(name, opts);
}

// ---------- Rules ----------

const ROUND_TIME = 30;
const HOPPER = 6;
const REFILL = 0.6;
// The slingshot: a pull of PULL_X sideways reaches 0.47 of the stage width either way, a pull of
// PULL_Y down reaches the top of the booth. A pull under PULL_MIN is no shot.
const REACH = 0.47;
const pullX = () => (orient === 'landscape' ? 90 : 80);
const pullY = () => (orient === 'landscape' ? 80 : 140);
const PULL_MIN = 10;
const FLIGHT_NEAR = 0.18;
const FLIGHT_FAR = 0.45;
const FRENZY_LEN = 6;
const FRENZY_SPEED = 1.6;
const MULT_CAP = 8;
const PAINT_KEEP = 70;
// Blues, purples, pinks and greens: never the gold or red that mark bullseyes and the gold duck.
const PALETTE = ['#2f80ed', '#9b51e0', '#eb4f9b', '#27ae60', '#00b5c8', '#7ac143', '#6c5ce7', '#16a085'];

const ROUNDS = [
  null,
  { name: 'Warm-up', bg: 'wood', quota: 7, vNear: 30, vFar: 55, frenzy: true },
  { name: 'Pop-ups', bg: 'red', shade: true, quota: 13, vNear: 34, vFar: 62, pops: true, frenzy: true },
  { name: 'Drop-downs', bg: 'blue', quota: 18, vNear: 38, vFar: 68, pops: true, drops: true, frenzy: true },
  { name: 'Turnabouts', bg: 'green', quota: 24, vNear: 40, vFar: 72, pops: true, drops: true, turn: true, frenzy: true },
  { name: 'Gold rush', bg: 'wood', dusk: true, quota: 30, vNear: 50, vFar: 90, pops: true, drops: true, turn: true, gold: 2, frenzy: true },
  { name: 'Closing time', bg: 'blue', dusk: true, quota: 34, vNear: 50, vFar: 90, pops: true, drops: true, turn: true, gold: 1, frenzy: true, double: true, lamps: true },
];
const LAST_ROUND = 6;

// The bullseye of each target face: its painted centre with the ring around it, as a share of the
// sprite's half-width (measured from the pack's art).
const BULL = { target_red1: 0.232, target_red2: 0.268, target_red3: 0.366, target_colored: 0.366 };
// A target-duck's painted target: its centre and radius as shares of the sprite's width and height.
const DUCK_BULL = { u: 0.467, v: 0.686, r: 0.164 };

// ---------- Randomness (seedable, so a run can be replayed in tests) ----------

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
let rng = mulberry32(Date.now());
const rand = (a, b) => a + rng() * (b - a);
const pick = (xs) => xs[Math.floor(rng() * xs.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;

// ---------- Memory: the bests and the hidden assist ----------

const STORE = 'shooting-gallery';
function load() {
  try {
    return JSON.parse(localStorage.getItem(STORE) || '{}') || {};
  } catch (e) {
    return {};
  }
}
function save(v) {
  try {
    localStorage.setItem(STORE, JSON.stringify(v));
  } catch (e) {
    // Blocked storage: the best lasts until the page reloads.
  }
}
const stored = load();
const memory = {
  best: { portrait: 0, landscape: 0, ...(stored.best && typeof stored.best === 'object' ? stored.best : {}) },
  bestRound: { portrait: 0, landscape: 0, ...(stored.bestRound && typeof stored.bestRound === 'object' ? stored.bestRound : {}) },
  assist: typeof stored.assist === 'number' ? stored.assist : 0.3,
};

// ---------- Canvas and layout ----------

const canvas = document.getElementById('booth');
const ctx = canvas.getContext('2d');
const atlas = new Image();
atlas.src = 'img/atlas.png';
const splatImg = new Image();
splatImg.src = 'img/splats.png';

let dpr = 1;
let k = 1; // CSS px per unit
let ox = 0; // CSS px from the screen's left to the stage's left
let oy = 0; // and from its top
let SW = 400; // the stage, in units, fixed for a run
let SH = 760;
let orient = 'portrait'; // the stage's layout
let insetTop = 0;
let insetBottom = 0;
const L = { lanes: [], n: 5 }; // the booth's lines, in units

function readInsets() {
  const cs = getComputedStyle(document.documentElement);
  insetTop = parseFloat(cs.getPropertyValue('--sat')) || 0;
  insetBottom = parseFloat(cs.getPropertyValue('--sab')) || 0;
}

const screenOrient = () => (window.innerWidth / window.innerHeight > 1 ? 'landscape' : 'portrait');

// Lay out a stage for an orientation, from the screen as it is now.
function layoutStage(o) {
  orient = o;
  const w = window.innerWidth;
  const h = window.innerHeight;
  const land = o === 'landscape';
  const k0 = land ? Math.min(w / 800, h / 450) : Math.min(w / 400, h / 720);
  SW = Math.min(w / k0, land ? 1000 : 520);
  SH = h / k0;
  const top = insetTop / k0;
  const bottom = insetBottom / k0;
  L.top = top;
  L.bottom = bottom;
  L.T = top + (land ? 58 : 72); // the lanes start below the valance
  L.counterH = land ? 104 : 168;
  L.C = SH - bottom - L.counterH; // the counter's top edge: the thumb's pad, never a target
  const n = land ? 3 : 5;
  const band = (L.C - L.T) / n;
  const [sFar, sNear] = land ? [0.38, 0.52] : [0.36, 0.6];
  L.lanes = [];
  for (let i = 0; i < n; i++) {
    const s = lerp(sFar, sNear, n === 1 ? 1 : i / (n - 1));
    const top0 = L.T + i * band;
    // Targets stand high enough that a length of their stick always shows above the strip: the
    // crest sits below the biggest target's bottom by about a third of its size.
    const lineY = top0 + band * 0.36;
    const D = 142 * s;
    L.lanes.push({
      i,
      s,
      top: top0,
      line: lineY, // where the targets' centres run, and where a shot aimed at this lane lands
      strip: lineY + D * 0.74, // the crest of the lane's water or grass
      kind: (n - 1 - i) % 2 === 0 ? 'water' : 'grass',
      dir: i % 2 === 0 ? 1 : -1,
      pips: i === 0 ? 3 : i === n - 1 ? 1 : 2,
    });
  }
  L.n = n;
  // The slingshot's pouch at rest, on the counter; its handle runs down to the bottom.
  L.slingX = SW / 2;
  L.slingY = L.C + (land ? 50 : 70);
  L.slingFoot = SH - bottom - 2;
  L.SHbottom = SH - bottom;
  fit();
}

// Fit the stage to the screen, letterboxed when the screen no longer matches it.
function fit() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  k = Math.min(w / SW, h / SH);
  ox = (w - SW * k) / 2;
  oy = (h - SH * k) / 2;
}

// ---------- Sprites, masks and paint ----------

const masks = {};
function makeMasks() {
  const c = document.createElement('canvas');
  c.width = atlas.naturalWidth;
  c.height = atlas.naturalHeight;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(atlas, 0, 0);
  for (const name of ['duck_yellow', 'water1', 'water2', 'grass1', 'curtain']) {
    const [x, y, w, h] = FRAMES[name];
    const d = g.getImageData(x, y, w, h).data;
    const a = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) a[i] = d[i * 4 + 3] > 128 ? 1 : 0;
    // The top edge of each column, as a share of the height: the contour of water and grass.
    const top = new Float32Array(w);
    for (let col = 0; col < w; col++) {
      let row = 0;
      while (row < h && !a[row * w + col]) row++;
      top[col] = row / h;
    }
    masks[name] = { w, h, a, top };
  }
}
function maskAt(name, u, v) {
  const m = masks[name];
  if (!m || u < 0 || u >= 1 || v < 0 || v >= 1) return false;
  return m.a[Math.floor(v * m.h) * m.w + Math.floor(u * m.w)] === 1;
}
const size = (name) => [FRAMES[name][2] / ATLAS_SCALE, FRAMES[name][3] / ATLAS_SCALE];

function sprite(name, x, y, w, h, flip = false) {
  const f = FRAMES[name];
  if (flip) {
    ctx.save();
    ctx.translate(x + w, y);
    ctx.scale(-1, 1);
    ctx.drawImage(atlas, f[0], f[1], f[2], f[3], 0, 0, w, h);
    ctx.restore();
  } else {
    ctx.drawImage(atlas, f[0], f[1], f[2], f[3], x, y, w, h);
  }
}

// A lane's strip: a row of water or grass tiles, scaled with the lane.
const stripName = (lane) => (lane.kind === 'water' ? (lane.i % 4 === 0 ? 'water2' : 'water1') : 'grass1');
const stripScale = (lane) => 0.32 + lane.s * 0.45;
function stripY(lane, x) {
  const name = stripName(lane);
  const [w, h] = size(name);
  const sc = stripScale(lane);
  const tw = w * sc;
  const off = lane.i * 37;
  const u = ((((x - off) % tw) + tw) % tw) / tw;
  return lane.strip + masks[name].top[Math.floor(u * masks[name].w)] * h * sc;
}

// A splat, tinted: drawn once into its own small canvas.
const SPLAT_CELL = 128;
function tinted(shape, color, px) {
  const c = document.createElement('canvas');
  c.width = c.height = Math.max(16, Math.min(160, Math.round(px)));
  const g = c.getContext('2d');
  g.drawImage(splatImg, (shape % 12) * SPLAT_CELL, Math.floor(shape / 12) * SPLAT_CELL, SPLAT_CELL, SPLAT_CELL, 0, 0, c.width, c.height);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = color;
  g.fillRect(0, 0, c.width, c.height);
  return c;
}

// ---------- State ----------

const game = {
  mode: 'start', // start | intro | play | won | lost | over
  paused: false,
  turned: false, // the screen turned away from the run's layout
  resumeT: 0,
  run: 0,
  round: 0,
  cfg: null,
  score: 0,
  roundScore: 0,
  pips: 0,
  bonus: false,
  time: ROUND_TIME, // left in the round
  elapsed: 0, // in the round, on the timer's own clock
  T: 0, // the simulation's time
  modeT: 0,
  hopper: HOPPER,
  refillT: 0,
  frenzy: 0, // seconds of frenzy left
  frenzyTimes: [], // when in the round the frenzy target comes
  frenzyDone: false,
  spawn: {},
  colour: 0,
  missRow: 0,
  assist: memory.assist,
  banner: null,
  ended: '',
  kick: 0,
  lastFire: -1,
  attract: true,
  rock: 1, // how much targets rock (tests set 0 to aim exactly)
};
// The pull, in units: x to the right, y down. `active` while a finger or the mouse holds the pouch;
// `kb` once the keyboard has set it (the keyboard's pull stays between shots).
const aim = { px: 0, py: 0, active: false, kb: false, kx: 0, ky: 55, shots: 0 };
let targets = [];
let balls = [];
let paint = []; // splats on the scenery
let fx = [];
let nextId = 1;
let decor = [];

// ---------- Targets ----------

function faceFor(kind, face) {
  if (face) return face;
  if (kind === 'gold') return 'duck_target_yellow';
  if (kind === 'duck') return pick(['duck_yellow', 'duck_brown', 'duck_white', 'duck_target_yellow', 'duck_target_brown', 'duck_target_white']);
  return pick(['target_red1', 'target_red2', 'target_red3', 'target_colored']);
}

// kind: duck | target (movers along a lane) | pop (rises from behind a strip) | drop (lowered on a
// rope) | gold (a fast gold duck).
function makeTarget(kind, opts = {}) {
  const lane = L.lanes[opts.lane ?? L.n - 1];
  const cfg = game.cfg || {};
  const t = {
    id: nextId++,
    kind,
    lane: lane.i,
    face: faceFor(kind, opts.face),
    state: 'live', // live | knocked | gone
    anim: 0,
    dir: opts.dir ?? lane.dir,
    speed: opts.speed ?? 40,
    x: opts.x ?? SW / 2,
    y: lane.line,
    phase: rand(0, Math.PI * 2),
    turn: opts.turn ?? !!cfg.turn,
    turnT: opts.turnT ?? rand(0, 3.9),
    upFor: opts.upFor ?? 1.8,
    popT: opts.up ? 0.35 : 0,
    splats: [],
    big: opts.big ?? 1,
    rockF: rand(0.75, 1.25),
  };
  t.isDuck = kind === 'duck' || kind === 'gold';
  t.bull = kind === 'gold' || (t.isDuck ? t.face.startsWith('duck_target') : true);
  if (kind === 'pop') t.y = opts.up ? lane.line : hiddenY(t);
  if (kind === 'drop') t.y = opts.up ? lane.line : dropTop(t);
  targets.push(t);
  return t;
}

function dims(t) {
  const s = L.lanes[t.lane].s * t.big;
  if (t.isDuck) return [114 * s * 1.15, 109 * s * 1.15];
  return [142 * s, 142 * s];
}
const hiddenY = (t) => L.lanes[t.lane].strip + dims(t)[1] * 0.6;

// Every target stands on a stick (or hangs on a rope) driven from below, and rocks a little about
// the stick's foot (the rope's top), as if on levers: a few degrees, each at its own pace.
function pivotOf(t) {
  if (t.kind === 'drop') return { x: t.x, y: L.top + 30 };
  return { x: t.x, y: L.lanes[t.lane].strip + 30 };
}
function rockAngle(t) {
  if (t.state === 'knocked') return t.knockRot || 0;
  const amp = (t.kind === 'drop' ? 3 : t.isDuck ? 5 : 4) * (Math.PI / 180) * game.rock;
  return amp * Math.sin(game.T * 1.7 * t.rockF + t.phase);
}
const dropTop = (t) => L.top + 40 - dims(t)[1];

// Turnabouts: 2.2 s facing, a 0.25 s turn, 1.2 s showing the back, a 0.25 s turn. A turn counts as
// back.
const TURN = [2.2, 0.25, 1.2, 0.25];
function turnState(t) {
  if (!t.turn) return { back: false, sx: 1, showBack: false };
  const cyc = TURN.reduce((a, b) => a + b, 0);
  let u = ((t.turnT % cyc) + cyc) % cyc;
  if (u < TURN[0]) return { back: false, sx: 1, showBack: false };
  u -= TURN[0];
  if (u < TURN[1]) {
    const p = u / TURN[1];
    return { back: true, sx: Math.abs(Math.cos(Math.PI * p)), showBack: p >= 0.5 };
  }
  u -= TURN[1];
  if (u < TURN[2]) return { back: true, sx: 1, showBack: true };
  u -= TURN[2];
  const p = u / TURN[3];
  return { back: true, sx: Math.abs(Math.cos(Math.PI * p)), showBack: p < 0.5 };
}

function laneSpeed(cfg, i) {
  const n = L.n;
  return lerp(cfg.vNear, cfg.vFar, n === 1 ? 0 : (n - 1 - i) / (n - 1));
}

function launchMover(i, cfg, gold = false) {
  const lane = L.lanes[i];
  const kind = gold ? 'gold' : lane.kind === 'water' ? 'duck' : 'target';
  const t = makeTarget(kind, { lane: i, speed: laneSpeed(cfg, i) * (gold ? 1.6 : 1) });
  const [w] = dims(t);
  t.x = t.dir > 0 ? -w / 2 - 4 : SW + w / 2 + 4;
  return t;
}

function freeSpot(i, w) {
  const taken = targets.filter((t) => t.lane === i && t.state === 'live').map((t) => t.x);
  let x = SW / 2;
  for (let tries = 0; tries < 12; tries++) {
    x = rand(60, SW - 60);
    if (taken.every((o) => Math.abs(o - x) > w)) return x;
  }
  return x;
}
// In portrait, drop-downs only come into the front three lanes, so their ropes don't cross the far
// lanes' targets.
function dropLanes() {
  const n = L.n;
  return L.lanes.filter((l) => n < 5 || l.i >= n - 3).map((l) => l.i);
}
function launchPop(i, upFor = 1.8) {
  const t = makeTarget('pop', { lane: i, upFor });
  t.x = freeSpot(i, dims(t)[0] * 1.2);
  return t;
}
// The frenzy target: easy in round 1 (big, rising in the nearest lane for 3.5 s), harder in round 2
// (crossing a middle lane), hard from round 3 (crossing the farthest lane at 1.8× its speed).
function launchFrenzyTarget() {
  const n = L.n;
  const cfg = game.cfg;
  if (game.round === 1) {
    const t = makeTarget('frenzy', { lane: n - 1, face: 'target_colored', turn: false, big: 1.15, upFor: 3.5 });
    t.motion = 'pop';
    t.y = hiddenY(t);
    t.x = freeSpot(n - 1, dims(t)[0] * 1.2);
    return t;
  }
  const i = game.round === 2 ? Math.floor((n - 1) / 2) : 0;
  const t = makeTarget('frenzy', { lane: i, face: 'target_colored', turn: false, speed: laneSpeed(cfg, i) * (game.round === 2 ? 1 : 1.8) });
  t.motion = 'mover';
  const [w] = dims(t);
  t.x = t.dir > 0 ? -w / 2 - 4 : SW + w / 2 + 4;
  return t;
}
function launchDrop(i, upFor = 1.8) {
  const t = makeTarget('drop', { lane: i, upFor });
  t.x = freeSpot(i, dims(t)[0] * 1.2);
  return t;
}

// ---------- Rounds and the run ----------

let stopMusic = null;
let musicName = '';
function music(name) {
  if (musicName === name) return;
  if (stopMusic) stopMusic();
  musicName = name;
  stopMusic = name ? sound.loop(name, { gain: name === 'frenzy' ? 0.3 : 0.24 }) : null;
}

function startRun({ seed = Date.now(), restart = false } = {}) {
  rng = mulberry32(seed);
  if (screenOrient() !== orient || restart) layoutStage(screenOrient());
  game.run++;
  game.score = 0;
  game.missRow = 0;
  game.assist = memory.assist;
  game.attract = false;
  game.ended = '';
  game.turned = false;
  game.paused = false;
  game.resumeT = 0;
  game.hopper = HOPPER;
  game.colour = 0;
  ui.start.hidden = true;
  ui.over.hidden = true;
  ui.turned.hidden = true;
  ui.pause.hidden = true;
  paint = [];
  targets = [];
  balls = [];
  makeDecor();
  aim.px = 0;
  aim.py = 0;
  aim.active = false;
  aim.shots = 0;
  startRound(1);
  music('music');
}

function startRound(n) {
  game.round = n;
  const cfg = ROUNDS[n];
  game.cfg = cfg;
  game.pips = 0;
  game.roundScore = 0;
  game.bonus = false;
  game.time = ROUND_TIME;
  game.elapsed = 0;
  game.frenzy = 0;
  game.frenzyDone = false;
  // The frenzy target comes 5–9 s in, and again at 17–22 s if no frenzy has come.
  game.frenzyTimes = cfg.frenzy ? [rand(5, 9), rand(17, 22)] : [];
  game.halfDone = false;
  game.tenDone = false;
  game.missRow = 0;
  game.spawn = { movers: L.lanes.map(() => rand(0.2, 1.8)), pop: rand(1.5, 3), drop: rand(2.5, 4), gold: [] };
  if (cfg.gold) for (let g = 0; g < cfg.gold; g++) game.spawn.gold.push(rand(5, 24));
  targets = targets.filter((t) => t.state !== 'live');
  game.mode = 'intro';
  game.modeT = 0;
  banner(`Round ${n}`, cfg.name, 1.3);
  sfx('round');
  if (n === 1) {
    // A big, slow target crosses the middle of the nearest lane, where a short straight pull lands.
    const i = L.n - 1;
    const t = makeTarget(L.lanes[i].kind === 'water' ? 'duck' : 'target', { lane: i, speed: 26, big: 1.15, face: L.lanes[i].kind === 'water' ? 'duck_target_yellow' : 'target_colored', turn: false });
    // It crosses the middle, where a straight pull lands.
    t.x = SW / 2 - t.dir * 60;
    game.spawn.movers[i] = 3.5;
  }
}

// A banner between rounds sits over the lanes; one during play (`small`) is a slim pill on the
// counter, where nothing can be hit, so it never hides a target.
function banner(text, sub = '', life = 1.2, small = false) {
  game.banner = { text, sub, t: 0, life, small };
}

function roundOver() {
  endFrenzy();
  if (game.pips >= game.cfg.quota) {
    game.mode = 'won';
    game.modeT = 0;
    if (game.round === LAST_ROUND) banner('Closing time!', `${game.score.toLocaleString('en-US')} points`, 2);
    else banner('Round cleared', `+${game.roundScore.toLocaleString('en-US')} points`, 1.5);
  } else {
    game.mode = 'lost';
    game.modeT = 0;
    game.ended = 'time';
    sfx('lost');
    music('');
    if (game.round <= 2) game.assist = Math.min(1, game.assist + 0.3);
  }
}

function gameOver() {
  game.mode = 'over';
  game.modeT = 0;
  game.attract = true;
  game.spawn = {};
  music('');
  const best = memory.best[orient] || 0;
  const newBest = game.score > best;
  if (newBest) memory.best[orient] = game.score;
  memory.bestRound[orient] = Math.max(memory.bestRound[orient] || 0, game.round);
  memory.assist = game.assist;
  save(memory);
  ui.overTitle.textContent = game.ended === 'closing' ? 'Closing time!' : 'Out of time';
  ui.finalScore.textContent = game.score.toLocaleString('en-US');
  ui.finalDetail.textContent = `Round ${game.round} · ${ROUNDS[game.round].name}`;
  ui.finalBest.textContent = newBest && game.score > 0 ? 'A new best!' : `Best ${(memory.best[orient] || 0).toLocaleString('en-US')}`;
  ui.finalBest.classList.toggle('is-new', newBest && game.score > 0);
  ui.over.hidden = false;
  ui.again.focus({ preventScroll: true });
}

function showStart() {
  game.mode = 'start';
  game.attract = true;
  game.cfg = null;
  ui.over.hidden = true;
  ui.start.hidden = false;
  const best = memory.best[orient] || 0;
  ui.best.hidden = !best;
  ui.best.textContent = `Best ${best.toLocaleString('en-US')} · round ${memory.bestRound[orient] || 0}`;
}

function startFrenzy() {
  game.frenzy = FRENZY_LEN;
  game.frenzyDone = true;
  game.spawn.frenzy = 0;
  banner('Frenzy!', '', FRENZY_LEN, true);
  music('frenzy');
}
function endFrenzy() {
  const was = game.frenzy > 0 || musicName === 'frenzy';
  game.frenzy = 0;
  if (game.banner && game.banner.text === 'Frenzy!') game.banner = null;
  if (was && (game.mode === 'play' || game.mode === 'won')) music('music');
}

// ---------- Aiming and shooting ----------

function aimPoint(px = aim.px, py = aim.py) {
  const fx = clamp(px / pullX(), -1, 1);
  const fy = clamp(py / pullY(), 0, 1);
  return { x: SW / 2 - fx * REACH * SW, y: L.C - fy * (L.C - L.T) };
}
// Set the pull, clamped: sideways to ±pullX, down to pullY, a little up.
function setPull(px, py) {
  aim.px = clamp(px, -pullX(), pullX());
  aim.py = clamp(py, -20, pullY());
}
const pullLen = () => Math.hypot(aim.px, aim.py);
// The flight: longer the farther it goes.
function flightTime(y) {
  return lerp(FLIGHT_NEAR, FLIGHT_FAR, clamp((L.C - y) / (L.C - L.T), 0, 1));
}
// The lane whose band holds a height.
function laneAt(y) {
  const band = (L.C - L.T) / L.n;
  return clamp(Math.floor((y - L.T) / band), 0, L.n - 1);
}
// Where the pouch is drawn: it follows the pull, a little less than the finger.
function pouch() {
  return { x: L.slingX + aim.px * 0.75, y: L.slingY + clamp(aim.py, -20, pullY()) * (orient === 'landscape' ? 0.45 : 0.6) };
}

function canFire() {
  return !game.paused && !game.turned && game.resumeT <= 0 && game.mode === 'play' && game.T - game.lastFire >= 0.12;
}

function fire() {
  if (!canFire()) return null;
  if (pullLen() < PULL_MIN) return null;
  const free = game.frenzy > 0;
  if (!free && game.hopper < 1) {
    sfx('dry');
    game.lastFire = game.T;
    return null;
  }
  if (!free) {
    if (game.hopper === HOPPER) game.refillT = 0;
    game.hopper--;
  }
  game.lastFire = game.T;
  game.kick = 1;
  aim.shots++;
  const from = pouch();
  const a = aimPoint();
  const colour = PALETTE[game.colour++ % PALETTE.length];
  const lane = laneAt(a.y);
  const b = { x0: from.x, y0: from.y, x1: a.x, y1: a.y, t: 0, dur: flightTime(a.y), colour, lane, free };
  balls.push(b);
  sfx('twang', { rate: rand(0.95, 1.08) });
  return b;
}

// What is at (px, py): front to back, lane by lane from the nearest, its strip and then its targets;
// the wall behind everything.
function resolve(px, py) {
  const grow = 1 + 0.15 * assistNow();
  const c = curtainRect();
  if (curtainAt((px - c.x) / c.w, (py - c.y) / c.h) || curtainAt((SW - c.x - px) / c.w, (py - c.y) / c.h)) return { what: 'curtain' };
  for (let i = L.n - 1; i >= 0; i--) {
    const lane = L.lanes[i];
    if (py >= stripY(lane, px)) return { what: 'strip', lane: i };
    // Within a lane, the target drawn last is in front: test it first.
    const here = drawOrder(i);
    for (let j = here.length - 1; j >= 0; j--) {
      if (here[j].state !== 'live') continue;
      const r = hitTest(here[j], px, py, grow);
      if (r) return r;
    }
  }
  return { what: 'wall' };
}
const drawOrder = (i) => targets.filter((t) => t.lane === i && t.kind === 'drop').concat(targets.filter((t) => t.lane === i && t.kind !== 'drop'));

function hitTest(t, px0, py0, grow) {
  const [w, h] = dims(t);
  // Into the target's frame: undo its rock about the pivot.
  const r = rockAngle(t);
  let px = px0;
  let py = py0;
  if (r) {
    const pv = pivotOf(t);
    const c = Math.cos(-r);
    const sn = Math.sin(-r);
    const dx = px0 - pv.x;
    const dy = py0 - pv.y;
    px = pv.x + dx * c - dy * sn;
    py = pv.y + dx * sn + dy * c;
  }
  const back = turnState(t).back;
  if (t.isDuck) {
    const flip = t.dir < 0;
    let u = (px - t.x) / (w * grow) + 0.5;
    const v = (py - t.y) / (h * grow) + 0.5;
    if (flip) u = 1 - u;
    if (!maskAt('duck_yellow', u, v)) return null;
    if (back) return { what: 'back', t };
    if (t.bull) {
      let bu = (px - t.x) / w + 0.5;
      if (flip) bu = 1 - bu;
      const bv = (py - t.y) / h + 0.5;
      if (Math.hypot((bu - DUCK_BULL.u) * w, (bv - DUCK_BULL.v) * h) <= DUCK_BULL.r * w) return { what: 'bull', t };
    }
    return { what: 'body', t };
  }
  const R = (w / 2) * 0.97;
  const d = Math.hypot(px - t.x, py - t.y);
  if (d > R * grow) return null;
  if (back) return { what: 'back', t };
  if (d <= (w / 2) * BULL[t.face]) return { what: 'bull', t };
  return { what: 'body', t };
}

function assistNow() {
  return game.round === LAST_ROUND ? 0 : game.assist;
}

// A hit's multiplier: the bullseye's ×2, then the higher of the bonus (by the lane's depth) and the
// frenzy's ×2, then closing time's ×2; never more than ×8.
function multiplier(t, bull) {
  const lane = L.lanes[t.lane];
  let m = bull ? 2 : 1;
  const bonusM = game.bonus ? (t.kind === 'gold' ? 3 : lane.pips) : 1;
  const frenzyM = game.frenzy > 0 ? 2 : 1;
  m *= Math.max(bonusM, frenzyM);
  if (game.cfg && game.cfg.double) m *= 2;
  return Math.min(MULT_CAP, m);
}

// Where a ball lands, it's judged; the last result is kept for the tests.
function land(b) {
  const r = landOn(b);
  game.lastLand = { what: r.what, kind: r.t ? r.t.kind : null, lane: r.t ? r.t.lane : r.lane ?? null, id: r.t ? r.t.id : null };
  return r;
}
function landOn(b) {
  const r = resolve(b.x1, b.y1);
  const free = b.free;
  splatSound(r.what);
  if (r.what === 'curtain' || r.what === 'strip' || r.what === 'wall') {
    addPaint(b.x1, b.y1, r.what === 'strip' ? r.lane : -1, b.colour, b.lane);
    if (!free) missed();
    return r;
  }
  const t = r.t;
  addSplatTo(t, b.x1, b.y1, b.colour);
  if (r.what === 'back') {
    sfx('hit', { rate: 0.7, gain: 0.6 });
    popup(b.x1, b.y1 - 16, 'back!', '#d8e6e7');
    if (!free) missed();
    return r;
  }
  t.knockRot = rockAngle(t);
  t.state = 'knocked';
  t.anim = 0;
  if (t.kind === 'frenzy') {
    game.score += 50;
    game.roundScore += 50;
    popup(b.x1, b.y1 - 18, '+50', '#ffd1ea');
    sfx('frenzyhit');
    startFrenzy();
    return r;
  }
  const bull = r.what === 'bull';
  const lane = L.lanes[t.lane];
  const pips = t.kind === 'gold' ? 2 : lane.pips;
  const base = t.kind === 'gold' ? 100 : 10 * pips;
  const pts = base * multiplier(t, bull);
  game.score += pts;
  game.roundScore += pts;
  popup(b.x1, b.y1 - 18, `+${pts}`, '#fff');
  sfx(lane.pips === 3 ? 'tin' : 'hit', { rate: rand(0.92, 1.08) });
  if (bull) {
    sfx('ding');
    fx.push({ type: 'ring', x: b.x1, y: b.y1, t: 0 });
    game.hopper = Math.min(HOPPER, game.hopper + 1);
  }
  if (t.kind === 'gold') game.hopper = HOPPER;
  if (!free) {
    const was = game.pips;
    game.pips += pips;
    if (was < game.cfg.quota && game.pips >= game.cfg.quota) {
      game.bonus = true;
      sfx('quota');
      if (game.frenzy <= 0) banner('Bonus!', '', 1.4, true);
    }
    hitAssist();
  }
  return r;
}

function splatSound(what) {
  if (what === 'body' || what === 'bull' || what === 'back') sfx(rng() < 0.5 ? 'splat' : 'splat2', { rate: rand(0.9, 1.15) });
  else sfx('plip', { rate: rand(0.85, 1.15) });
}

function missed() {
  game.missRow++;
  if (game.missRow >= 2) {
    game.assist = Math.min(1, game.assist + 0.2);
    game.missRow = 0;
  }
}
function hitAssist() {
  game.missRow = 0;
  game.assist = Math.max(0, game.assist - 0.05);
}

// ---------- Paint ----------

const splatSize = (laneIdx) => 30 + 26 * L.lanes[laneIdx].s;
// A splat on the scenery: `layer` is the lane whose strip it's on, or -1 for the wall.
function addPaint(x, y, layer, colour, aimedLane) {
  const sz = splatSize(aimedLane);
  const shape = Math.floor(rng() * 36);
  const px = sz * k * dpr;
  paint.push({ x, y, layer, size: sz, rot: rand(0, Math.PI * 2), born: game.T, colour, fresh: tinted(shape, colour, px), dying: -1 });
  const live = paint.filter((p) => p.dying < 0);
  if (live.length > PAINT_KEEP) live[0].dying = game.T;
}
function addSplatTo(t, x0, y0, colour) {
  const sz = splatSize(t.lane) * 0.7;
  // Where it landed, in the target's own rocked frame, so the paint rocks with it.
  const r = rockAngle(t);
  const pv = pivotOf(t);
  const dx0 = x0 - pv.x;
  const dy0 = y0 - pv.y;
  const x = pv.x + dx0 * Math.cos(-r) - dy0 * Math.sin(-r);
  const y = pv.y + dx0 * Math.sin(-r) + dy0 * Math.cos(-r);
  const shape = Math.floor(rng() * 36);
  t.splats.push({ dx: x - t.x, dy: y - t.y, size: sz, rot: rand(0, Math.PI * 2), colour, img: tinted(shape, colour, sz * k * dpr) });
}
// Fresh for 1 s, then it settles to 80% over 0.4 s, keeping its colour; dissolving ones fade out.
// Scenery paint is drawn behind every target in front of it, so it never hides one.
const PAINT_SETTLED = 0.8;
function paintAlpha(p) {
  const age = game.T - p.born;
  let a = age < 1 ? 1 : age < 1.4 ? 1 - ((age - 1) / 0.4) * (1 - PAINT_SETTLED) : PAINT_SETTLED;
  if (p.dying >= 0) a *= Math.max(0, 1 - (game.T - p.dying) / 0.5);
  return a;
}

// ---------- Effects ----------

function popup(x, y, text, color) {
  fx.push({ type: 'text', x, y, text, color, t: 0 });
}

// ---------- The simulation ----------

function spawnStep(dt, cfg) {
  const sp = game.spawn;
  const fr = game.frenzy > 0;
  for (let i = 0; i < L.n; i++) {
    sp.movers[i] -= dt * (fr ? FRENZY_SPEED : 1);
    if (sp.movers[i] <= 0) {
      launchMover(i, cfg);
      sp.movers[i] = rand(2.4, 4) * (55 / laneSpeed(cfg, i)) * 0.9;
    }
  }
  if (cfg.pops) {
    sp.pop -= dt;
    if (sp.pop <= 0) {
      launchPop(Math.floor(rng() * L.n));
      sp.pop = rand(2.4, 3.8);
    }
  }
  if (cfg.drops) {
    sp.drop -= dt;
    if (sp.drop <= 0) {
      launchDrop(pick(dropLanes()));
      sp.drop = rand(3, 4.6);
    }
  }
  for (let g = 0; g < sp.gold.length; g++) {
    if (sp.gold[g] > 0 && game.elapsed >= sp.gold[g]) {
      const waters = L.lanes.filter((l) => l.kind === 'water').map((l) => l.i);
      launchMover(pick(waters), cfg, true);
      sp.gold[g] = -1;
    }
  }
  if (!game.frenzyDone && !fr && game.frenzyTimes.length && game.elapsed >= game.frenzyTimes[0]) {
    game.frenzyTimes.shift();
    if (!targets.some((t) => t.kind === 'frenzy' && t.state === 'live')) launchFrenzyTarget();
  }
  if (fr) {
    // Targets spring up across every lane.
    sp.frenzy -= dt;
    if (sp.frenzy <= 0) {
      if (rng() < 0.55) launchPop(Math.floor(rng() * L.n), 1.4);
      else launchDrop(pick(dropLanes()), 1.4);
      sp.frenzy = rand(0.22, 0.4);
    }
  }
}

// The timer's cues: a chime and a swell at half time, a double chime at 10 s, a tick in each of the
// last 3 seconds.
function timerCues(before, now) {
  const half = ROUND_TIME / 2;
  if (before > half && now <= half) {
    sfx('chime');
    game.pulse = 1;
  }
  if (before > 10 && now <= 10) {
    sfx('warn', { gain: 1.6 });
    game.pulse = 1;
  }
  for (const s of [3, 2, 1]) if (before > s && now <= s) sfx('tock');
}
// The timer badge's background: plain, then yellow from 10 s, orange from 5 s, red from 3 s; pink
// in a frenzy.
function timerColour() {
  if (game.frenzy > 0) return 'pink';
  if (game.time <= 3) return 'red';
  if (game.time <= 5) return 'orange';
  if (game.time <= 10) return 'yellow';
  return 'plain';
}
const BULB = { plain: '#fff1c1', yellow: '#ffd23f', orange: '#ff8c1a', red: '#ff3b2e', pink: '#ff6ec7' };
// The bulbs of a seven-segment digit: segments a (top) to g (middle), three bulbs each.
const SEGMENTS = ['abcdef', 'bc', 'abged', 'abgcd', 'fgbc', 'afgcd', 'afgedc', 'abc', 'abcdefg', 'abcfgd'];

// ---------- Analog pieces: wooden planks, painted lettering, brass ----------

// A wooden plank or sign: the pack's wood, square-cut with bevelled edges, a nail in each corner and
// a shadow beneath. `tone` darkens (negative) or lightens (positive) the wood.
function plank(x, y, w, h, { nails = true, tone = 0, shadow = true } = {}) {
  if (shadow) {
    ctx.fillStyle = 'rgba(20, 8, 0, 0.35)';
    ctx.fillRect(x + 2, y + 3, w, h);
  }
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  for (let ty = y - ((y % 96) + 96) % 96; ty < y + h; ty += 96) for (let tx = x - 20; tx < x + w; tx += 96) sprite('bg_wood', tx, ty, 96.5, 96.5);
  if (tone) {
    ctx.fillStyle = tone > 0 ? `rgba(255, 230, 190, ${tone})` : `rgba(40, 18, 4, ${-tone})`;
    ctx.fillRect(x, y, w, h);
  }
  ctx.restore();
  // The bevel: light along the top and left, dark along the bottom and right.
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(255, 222, 170, 0.55)';
  ctx.beginPath();
  ctx.moveTo(x + 1, y + h - 1);
  ctx.lineTo(x + 1, y + 1);
  ctx.lineTo(x + w - 1, y + 1);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(40, 18, 4, 0.7)';
  ctx.beginPath();
  ctx.moveTo(x + w - 1, y + 1);
  ctx.lineTo(x + w - 1, y + h - 1);
  ctx.lineTo(x + 1, y + h - 1);
  ctx.stroke();
  ctx.lineWidth = 1;
  ctx.strokeStyle = '#3b210c';
  ctx.strokeRect(x, y, w, h);
  if (nails) for (const [nx, ny] of [[x + 4, y + 4], [x + w - 4, y + 4], [x + 4, y + h - 4], [x + w - 4, y + h - 4]]) nail(nx, ny);
}
function nail(x, y) {
  ctx.fillStyle = '#5a5249';
  ctx.beginPath();
  ctx.arc(x, y, 1.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
  ctx.beginPath();
  ctx.arc(x - 0.5, y - 0.5, 0.7, 0, Math.PI * 2);
  ctx.fill();
}
// Painted lettering: cream paint with a dark edge below, as if brushed onto the wood.
function painted(text, x, y, px, align = 'center', color = '#fff1d6') {
  ctx.font = `800 ${px}px "Rockwell", "Georgia", "Times New Roman", serif`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(30, 12, 2, 0.75)';
  ctx.fillText(text, x + 0.8, y + 1.4);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}
// A recessed groove in the wood, and a brass bar sliding in it.
function groove(x, y, w, h) {
  ctx.fillStyle = '#24130a';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
  ctx.fillRect(x, y, w, 2);
}
function brass(x, y, w, h, gold = false) {
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, gold ? '#fff0a8' : '#f2d37a');
  g.addColorStop(0.5, gold ? '#ffd23f' : '#c99a3a');
  g.addColorStop(1, gold ? '#b8860b' : '#7a5a1c');
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
}

// The timer: a wooden marquee board with two digits of light bulbs, lit in the time's colour, with a
// little flicker; unlit bulbs stay dark glass. It swells at half time and at 10 s.
function drawTimerBoard(tm) {
  const col = BULB[timerColour()];
  const swell = 1 + 0.3 * Math.sin(Math.PI * Math.min(1, game.pulse || 0));
  ctx.save();
  ctx.translate(tm.x + tm.w / 2, tm.y + tm.h / 2);
  ctx.scale(swell, swell);
  // The board: a nailed wooden sign, with a black-painted panel behind the bulbs.
  plank(-tm.w / 2, -tm.h / 2, tm.w, tm.h, { tone: -0.12 });
  ctx.fillStyle = '#17100a';
  ctx.fillRect(-tm.w / 2 + 6, -tm.h / 2 + 6, tm.w - 12, tm.h - 12);
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
  ctx.lineWidth = 2;
  ctx.strokeRect(-tm.w / 2 + 6, -tm.h / 2 + 6, tm.w - 12, tm.h - 12);
  const { digits } = timerBulbs();
  const dh = tm.font;
  const dw = dh * 0.5;
  const r = dh / 10.5;
  digits.forEach((d, i) => bulbDigit((i - 0.5) * (dw + r * 5.2), 0, dw, dh, d, col, r));
  ctx.restore();
}
// The board's two digits (-1 for a dark one) and how many of its bulbs are lit.
function timerBulbs() {
  const secs = Math.max(0, Math.ceil(game.time - 1e-6));
  const digits = [secs >= 10 ? Math.floor(secs / 10) % 10 : -1, secs % 10];
  const lit = digits.reduce((n, d) => n + (d >= 0 ? SEGMENTS[d].length * 3 : 0), 0);
  return { digits, lit, of: 2 * 7 * 3 };
}
function bulbDigit(cx, cy, dw, dh, digit, col, r) {
  const on = digit >= 0 ? SEGMENTS[digit] : '';
  const xl = cx - dw / 2;
  const xr = cx + dw / 2;
  const yt = cy - dh / 2;
  const yb = cy + dh / 2;
  const seg = {
    a: [xl, yt, xr, yt],
    b: [xr, yt, xr, cy],
    c: [xr, cy, xr, yb],
    d: [xl, yb, xr, yb],
    e: [xl, cy, xl, yb],
    f: [xl, yt, xl, cy],
    g: [xl, cy, xr, cy],
  };
  // The dark bulbs first, so a lit one's glow is never covered by an unlit neighbour at a corner.
  for (const pass of [false, true]) {
    for (const [key, [x1, y1, x2, y2]] of Object.entries(seg)) {
      if (on.includes(key) !== pass) continue;
      for (const f of [0.17, 0.5, 0.83]) bulb(x1 + (x2 - x1) * f, y1 + (y2 - y1) * f, r, pass ? col : null);
    }
  }
}
function bulb(x, y, r, col) {
  if (!col) {
    ctx.fillStyle = '#3a2a1c';
    ctx.beginPath();
    ctx.arc(x, y, r * 0.85, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  const flicker = 0.85 + 0.15 * Math.sin(game.T * 31 + x * 7.3 + y * 3.1) * Math.sin(game.T * 13 + x);
  const g = ctx.createRadialGradient(x, y, 0, x, y, r * 2.6);
  g.addColorStop(0, col);
  g.addColorStop(1, 'rgba(255, 220, 140, 0)');
  ctx.globalAlpha = 0.55 * flicker;
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r * 2.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = flicker;
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
  ctx.beginPath();
  ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.35, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

function attractStep(dt) {
  const cfg = ROUNDS[1];
  if (!game.spawn.movers || game.spawn.movers.length !== L.n) game.spawn.movers = L.lanes.map(() => rand(0, 2));
  for (let i = 0; i < L.n; i++) {
    game.spawn.movers[i] -= dt;
    if (game.spawn.movers[i] <= 0) {
      const t = launchMover(i, cfg);
      t.turn = false;
      game.spawn.movers[i] = rand(3, 5.5);
    }
  }
}

function update(dt) {
  game.T += dt;
  game.modeT += dt;
  if (game.banner) {
    game.banner.t += dt;
    if (game.banner.t > game.banner.life) game.banner = null;
  }
  game.kick = Math.max(0, game.kick - dt * 6);
  game.pulse = Math.max(0, (game.pulse || 0) - dt * 1.6);
  for (const d of decor) if (d.v) d.x = d.x + d.v * dt > SW + 80 ? -80 : d.x + d.v * dt;

  if (game.mode === 'intro' && game.modeT >= 1.2) {
    game.mode = 'play';
    game.modeT = 0;
  }
  const cfg = game.cfg;
  if (game.mode === 'play') {
    if (game.frenzy > 0) {
      game.frenzy -= dt;
      if (game.frenzy <= 0) endFrenzy();
    } else {
      const before = game.time;
      game.time -= dt;
      game.elapsed += dt;
      timerCues(before, game.time);
    }
    spawnStep(dt, cfg);
    // The hopper refills one ball every 0.6 s.
    if (game.hopper < HOPPER) {
      game.refillT += dt;
      while (game.refillT >= REFILL && game.hopper < HOPPER) {
        game.refillT -= REFILL;
        game.hopper++;
      }
    } else game.refillT = 0;
  } else if (game.attract && (game.mode === 'start' || game.mode === 'over')) attractStep(dt);

  const speed = game.frenzy > 0 ? FRENZY_SPEED : 1;
  const moving = game.mode !== 'intro' || game.attract;
  for (const t of targets) {
    if (t.turn) t.turnT += dt * speed;
    if (t.state === 'knocked') {
      t.anim += dt;
      continue;
    }
    if (t.state !== 'live' || !moving) continue;
    const lane = L.lanes[t.lane];
    if (t.kind === 'pop' || t.kind === 'drop' || t.motion === 'pop') {
      t.popT += dt * speed;
      const up = t.upFor;
      let h;
      if (t.popT < 0.35) h = t.popT / 0.35;
      else if (t.popT < 0.35 + up) h = 1;
      else if (t.popT < 0.7 + up) h = 1 - (t.popT - 0.35 - up) / 0.35;
      else {
        h = 0;
        t.state = 'gone';
      }
      const e = h * h * (3 - 2 * h);
      const from = t.kind === 'drop' ? dropTop(t) : hiddenY(t);
      const wasHidden = t.y > lane.strip;
      t.y = from + (lane.line - from) * e;
      if (t.kind !== 'drop' && wasHidden && t.y <= lane.strip && t.popT < 0.35 && game.mode === 'play') sfx('splash', { gain: 0.3, rate: rand(1.2, 1.5) });
    } else {
      t.x += t.dir * t.speed * dt * speed;
      t.y = lane.line + (t.isDuck ? 2.5 * Math.sin(game.T * 2.4 + t.phase) : 0);
      const [w] = dims(t);
      if ((t.dir > 0 && t.x > SW + w / 2 + 8) || (t.dir < 0 && t.x < -w / 2 - 8)) t.state = 'gone';
    }
  }
  targets = targets.filter((t) => t.state === 'live' || (t.state === 'knocked' && t.anim < 0.9));

  for (const b of balls) {
    b.t += dt;
    if (b.t >= b.dur && !b.landed) {
      b.landed = true;
      land(b);
    }
  }
  balls = balls.filter((b) => !b.landed);
  for (const f of fx) f.t += dt;
  fx = fx.filter((f) => f.t < (f.type === 'text' ? 0.9 : 0.7));
  paint = paint.filter((p) => p.dying < 0 || game.T - p.dying < 0.5);

  if (game.mode === 'play' && game.time <= 0) {
    game.time = 0;
    roundOver();
  }
  if (game.mode === 'won' && game.modeT >= (game.round === LAST_ROUND ? 2 : 1.6)) {
    if (game.round === LAST_ROUND) {
      game.ended = 'closing';
      sfx('finale');
      gameOver();
    } else startRound(game.round + 1);
  }
  if (game.mode === 'lost' && game.modeT >= 1.5) gameOver();
  updateKeys(dt);
}

// ---------- Drawing ----------

const CURTAIN_PART = 0.5;
function curtainRect() {
  const [w] = size('curtain');
  const ch = L.C - L.top - 20;
  const cw = Math.min(w * 0.7, SW * (orient === 'landscape' ? 0.1 : 0.18));
  return { x: -cw * 0.5, y: L.top + 10, w: cw, h: ch };
}
function curtainAt(u, v) {
  return maskAt('curtain', u, v * CURTAIN_PART);
}

function drawWall() {
  const name = 'bg_' + (game.cfg ? game.cfg.bg : 'wood');
  const ts = 128;
  for (let y = L.top; y < L.C; y += ts) for (let x = 0; x < SW; x += ts) sprite(name, x, y, ts + 0.5, ts + 0.5);
  if (game.cfg && game.cfg.shade) {
    ctx.fillStyle = 'rgba(70, 14, 0, 0.3)';
    ctx.fillRect(0, L.top, SW, L.C - L.top);
  }
  if (game.cfg && game.cfg.dusk) {
    ctx.fillStyle = 'rgba(40, 20, 70, 0.3)';
    ctx.fillRect(0, L.top, SW, L.C - L.top);
  }
  for (const d of decor) sprite(d.name, d.x, d.y, d.w, d.h);
}

function drawStrip(lane) {
  const name = stripName(lane);
  const [w, h] = size(name);
  const f = FRAMES[name];
  const sc = stripScale(lane);
  const tw = w * sc;
  const part = 0.6;
  const th = h * sc * part;
  ctx.fillStyle = lane.kind === 'water' ? '#3ea3df' : '#3c9f45';
  ctx.fillRect(-4, lane.strip + th - 1, SW + 8, Math.max(0, L.C - lane.strip - th + 1));
  const off = lane.i * 37;
  let x = (((off % tw) + tw) % tw) - tw;
  for (; x < SW + tw; x += tw) ctx.drawImage(atlas, f[0], f[1], f[2], f[3] * part, x, lane.strip, tw + 0.5, th);
}

function drawPaint(layer) {
  for (const p of paint) {
    if (p.layer !== layer) continue;
    const a = paintAlpha(p);
    if (a <= 0) continue;
    const age = game.T - p.born;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    const s = p.size * (age < 0.12 ? 0.6 + 0.4 * (age / 0.12) : 1);
    ctx.globalAlpha = a;
    ctx.drawImage(p.fresh, -s / 2, -s / 2, s, s);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

function drawTarget(t) {
  const [w, h] = dims(t);
  const lane = L.lanes[t.lane];
  const ts = turnState(t);
  const pv = pivotOf(t);
  ctx.save();
  ctx.translate(pv.x, pv.y);
  ctx.rotate(rockAngle(t));
  ctx.translate(-pv.x, -pv.y);
  if (t.kind === 'drop') {
    // The rope, from the valance down to the target.
    ctx.strokeStyle = '#6b4a2a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(t.x, L.top + 30);
    ctx.lineTo(t.x, t.y - h / 2 + 2);
    ctx.stroke();
  } else if (t.state === 'live') {
    // The stick it stands on, from its middle down past its lane's strip.
    const sw = 30 * lane.s * 0.8;
    sprite('stick_wood', t.x - sw / 2, t.y, sw, Math.max(4, pv.y + 16 - t.y));
  }
  ctx.save();
  ctx.translate(t.x, t.y);
  let fade = 1;
  if (t.state === 'knocked') {
    // Knocked flat: it tips back over its base.
    const p = Math.min(1, t.anim / 0.25);
    ctx.translate(0, h * 0.5);
    ctx.scale(1, Math.max(0.02, 1 - p));
    ctx.translate(0, -h * 0.5);
    if (t.anim > 0.5) fade = Math.max(0, 1 - (t.anim - 0.5) / 0.4);
  }
  ctx.globalAlpha = fade;
  ctx.scale(ts.sx, 1);
  let name = t.face;
  if (ts.showBack) name = t.isDuck ? 'duck_back' : 'target_back';
  sprite(name, -w / 2, -h / 2, w, h, t.isDuck && t.dir < 0);
  if (t.kind === 'frenzy' && t.state === 'live') {
    const r = w * (0.62 + 0.06 * Math.sin(game.T * 9));
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = '#ff5fa2';
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  if (t.kind === 'gold' && !ts.showBack) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = fade * (0.25 + 0.2 * Math.sin(game.T * 8));
    sprite(name, -w / 2, -h / 2, w, h, t.dir < 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = fade;
  }
  for (const s of t.splats) {
    ctx.save();
    ctx.translate(s.dx, s.dy);
    ctx.rotate(s.rot);
    ctx.drawImage(s.img, -s.size / 2, -s.size / 2, s.size, s.size);
    ctx.restore();
  }
  ctx.restore();
  ctx.restore();
  ctx.globalAlpha = 1;
}

function drawCurtains() {
  const c = curtainRect();
  const f = FRAMES.curtain;
  for (const flip of [false, true]) {
    ctx.save();
    if (flip) {
      ctx.translate(SW, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(atlas, f[0], f[1], f[2], f[3] * CURTAIN_PART, c.x, c.y, c.w, c.h);
    ctx.restore();
  }
  const [vw, vh] = size('curtain_straight');
  const s = orient === 'landscape' ? 0.75 : 0.95;
  for (let x = -10; x < SW + 10; x += vw * s - 1) sprite('curtain_straight', x, L.top - 6, vw * s, vh * s);
  if (L.top > 0) {
    ctx.fillStyle = '#e86a17';
    ctx.fillRect(-4, -4, SW + 8, L.top - 2);
  }
}

function drawCounter() {
  const ts = 128;
  ctx.save();
  ctx.beginPath();
  ctx.rect(-4, L.C, SW + 8, SH - L.C + 4);
  ctx.clip();
  for (let x = 0; x < SW; x += ts) for (let y = L.C; y < SH; y += ts) sprite('bg_wood', x, y, ts + 0.5, ts + 0.5);
  ctx.fillStyle = 'rgba(40, 20, 6, 0.32)';
  ctx.fillRect(-4, L.C, SW + 8, SH - L.C + 4);
  ctx.restore();
  ctx.fillStyle = '#7a4417';
  ctx.fillRect(-4, L.C - 4, SW + 8, 10);
  ctx.fillStyle = '#c98a4b';
  ctx.fillRect(-4, L.C - 4, SW + 8, 3);
}

const hudVisible = () => game.mode !== 'start';

// The HUD's places, in units: the timer badge at the top left beside the back button, the rest on
// the counter.
function hudLayout() {
  const land = orient === 'landscape';
  return {
    // The timer board; `font` is its digits' height.
    timer: { x: Math.max(8, (64 - ox) / k), y: L.top + (land ? 3 : 4), w: land ? 70 : 88, h: land ? 46 : 58, font: land ? 30 : 38 },
    score: { y: L.top + (land ? 26 : 34), font: land ? 22 : 26 },
    label: { x: 22, y: L.C + 20 },
    pips: { x: 22, y: L.C + (land ? 42 : 46), r: land ? 5.5 : 6.5 },
    hopper: { x: 22, y: L.C + (land ? 72 : 82), r: land ? 7 : 8.5 },
  };
}

function drawHud() {
  if (!hudVisible()) return;
  const cfg = game.cfg;
  const H = hudLayout();
  // The score, painted on a small sign hanging under the valance.
  const sc = game.score.toLocaleString('en-US');
  ctx.font = `800 ${H.score.font}px "Rockwell", "Georgia", serif`;
  const sw = Math.max(48, ctx.measureText(sc).width + 22);
  plank(SW / 2 - sw / 2, H.score.y - H.score.font * 0.75, sw, H.score.font * 1.5, { tone: 0.05 });
  painted(sc, SW / 2, H.score.y + 1, H.score.font);
  if (!cfg) return;
  drawTimerBoard(H.timer);
  // The round, painted on a nailed sign.
  const rt = `Round ${game.round} · ${cfg.name}`;
  ctx.font = '800 13px "Rockwell", "Georgia", serif';
  const rw = ctx.measureText(rt).width + 20;
  plank(H.label.x - 6, H.label.y - 10, rw, 20, { tone: 0.08 });
  painted(rt, H.label.x + 4, H.label.y + 1, 13, 'left');
  // The quota: a brass bar sliding along a groove in a wooden gauge, a notch for every pip; gold in
  // the bonus; the empty groove flashing red when the time runs out. It stays left of the slingshot.
  const flash = game.mode === 'lost' && Math.floor(game.modeT * 6) % 2 === 0;
  const bw = Math.min(SW * 0.42, L.slingX - 62 - H.pips.x);
  const bh = H.pips.r * 2.6;
  const by = H.pips.y - bh / 2;
  plank(H.pips.x - 4, by - 4, bw + 8, bh + 8, { nails: false, tone: -0.05 });
  groove(H.pips.x, by, bw, bh);
  if (flash) {
    ctx.fillStyle = 'rgba(208, 52, 44, 0.8)';
    ctx.fillRect(H.pips.x, by, bw, bh);
  }
  const f = clamp(game.pips / cfg.quota, 0, 1);
  if (f > 0) brass(H.pips.x, by + 1, bw * f, bh - 2, game.bonus);
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
  ctx.lineWidth = 1;
  for (let i = 1; i < cfg.quota; i++) {
    const nx = H.pips.x + (bw * i) / cfg.quota;
    ctx.beginPath();
    ctx.moveTo(nx, by + bh - 3);
    ctx.lineTo(nx, by + bh);
    ctx.stroke();
  }
  painted(`${Math.min(game.pips, 999)} / ${cfg.quota}`, H.pips.x + bw / 2, H.pips.y + 1, 11);
  // The hopper: a carved wooden tray with a cup for each paintball.
  const hx = H.hopper.x - 5;
  const hw = H.hopper.r * (2.6 * (HOPPER - 1) + 2) + 10;
  plank(hx, H.hopper.y - H.hopper.r - 5, hw, H.hopper.r * 2 + 10, { nails: false, tone: -0.1 });
  for (let i = 0; i < HOPPER; i++) {
    ctx.fillStyle = '#24130a';
    ctx.beginPath();
    ctx.arc(H.hopper.x + H.hopper.r + i * H.hopper.r * 2.6, H.hopper.y + 1, H.hopper.r + 1, 0, Math.PI * 2);
    ctx.fill();
  }
  // The hopper: the paintballs ready to fire, in the colours they'll be.
  for (let i = 0; i < HOPPER; i++) {
    const x = H.hopper.x + H.hopper.r + i * H.hopper.r * 2.6;
    ctx.beginPath();
    ctx.arc(x, H.hopper.y, H.hopper.r, 0, Math.PI * 2);
    const ready = game.frenzy > 0 || i < game.hopper;
    if (!ready) continue;
    ctx.fillStyle = PALETTE[(game.colour + i) % PALETTE.length];
    ctx.fill();
    if (ready) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
      ctx.beginPath();
      ctx.arc(x - H.hopper.r * 0.3, H.hopper.y - H.hopper.r * 0.3, H.hopper.r * 0.3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

// The slingshot: a carved wooden fork with a shadow on the counter, both bands in front of the wood,
// and a leather pouch holding the next paintball. The pouch follows the pull. Beside it, a wooden
// ruler with a notch for each lane shows how far the pull will send the ball, and a short dotted
// arc from the pouch shows which way: enough to aim by, never the landing spot itself.
function slingGeometry() {
  const land = orient === 'landscape';
  const spread = land ? 30 : 40;
  const forkY = L.slingY - (land ? 20 : 28);
  return { spread, forkY, crotchY: L.slingY + (land ? 18 : 28), limb: land ? 12 : 15 };
}
// A limb of wood: a tapering tube along a curve from (x1, y1) through the pull of (cx, cy) to
// (x2, y2), w1 wide at its start and w2 at its end. tubePath() outlines it; the slingshot draws every
// limb's outline first and the wood over them, so the joins show no seams.
function bez(x1, y1, cx, cy, x2, y2, t) {
  const u = 1 - t;
  return [u * u * x1 + 2 * u * t * cx + t * t * x2, u * u * y1 + 2 * u * t * cy + t * t * y2];
}
function tubePath(L0, shift = 0, scale = 1) {
  const { x1, y1, cx, cy, x2, y2, w1, w2 } = L0;
  const n = 14;
  const left = [];
  const right = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const [x, y] = bez(x1, y1, cx, cy, x2, y2, t);
    const [xa, ya] = bez(x1, y1, cx, cy, x2, y2, Math.min(1, t + 0.01));
    const [xb, yb] = bez(x1, y1, cx, cy, x2, y2, Math.max(0, t - 0.01));
    const a = Math.atan2(ya - yb, xa - xb);
    const nx = -Math.sin(a);
    const ny = Math.cos(a);
    const w = ((w1 + (w2 - w1) * t) / 2) * scale;
    const o = shift * w;
    left.push([x + nx * (w + o), y + ny * (w + o)]);
    right.push([x - nx * (w - o), y - ny * (w - o)]);
  }
  ctx.beginPath();
  ctx.moveTo(left[0][0], left[0][1]);
  for (const [x, y] of left) ctx.lineTo(x, y);
  // A rounded end.
  const end = left[left.length - 1];
  const endR = right[right.length - 1];
  ctx.quadraticCurveTo(x2 + (x2 - cx) * 0.12, y2 + (y2 - cy) * 0.12, endR[0], endR[1]);
  for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(right[i][0], right[i][1]);
  ctx.closePath();
  void end;
}
function drawWoodLimbs(limbs) {
  // The outlines, all first, so where the limbs meet only the wood shows.
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#3b210c';
  ctx.lineWidth = 4;
  for (const l of limbs) {
    tubePath(l);
    ctx.stroke();
  }
  for (const l of limbs) {
    tubePath(l);
    ctx.fillStyle = '#b4743a';
    ctx.fill();
  }
  // Roundness: light along one side, shadow along the other, both following the curve.
  for (const l of limbs) {
    tubePath(l, 0.35, 0.55);
    ctx.fillStyle = 'rgba(244, 196, 132, 0.38)';
    ctx.fill();
    tubePath(l, -0.55, 0.45);
    ctx.fillStyle = 'rgba(70, 36, 12, 0.32)';
    ctx.fill();
  }
  // Grain along each limb, and a knot or two.
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(70, 36, 12, 0.45)';
  for (const l of limbs) {
    for (const off of [-0.18, 0.12]) {
      ctx.beginPath();
      for (let i = 0; i <= 12; i++) {
        const t = 0.06 + (i / 12) * 0.86;
        const [x, y] = bez(l.x1, l.y1, l.cx, l.cy, l.x2, l.y2, t);
        const w = l.w1 + (l.w2 - l.w1) * t;
        const wob = Math.sin(t * 9 + off * 20) * 0.6;
        if (i === 0) ctx.moveTo(x + (off * w) + wob, y);
        else ctx.lineTo(x + (off * w) + wob, y);
      }
      ctx.stroke();
    }
    if (l.knot != null) {
      const [kx, ky] = bez(l.x1, l.y1, l.cx, l.cy, l.x2, l.y2, l.knot);
      ctx.fillStyle = 'rgba(70, 36, 12, 0.6)';
      ctx.beginPath();
      ctx.ellipse(kx + 1, ky, 2.2, 1.5, 0.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
function drawSlingshot() {
  const g = slingGeometry();
  const x = L.slingX;
  const inPlay = hudVisible() && game.cfg;
  const showPull = inPlay && (aim.active || aim.kb);
  const p = showPull ? pouch() : { x, y: L.slingY };
  const ball = PALETTE[game.colour % PALETTE.length];
  const ready = game.frenzy > 0 || game.hopper >= 1;
  // Its shadow on the counter.
  ctx.fillStyle = 'rgba(20, 8, 0, 0.28)';
  ctx.beginPath();
  ctx.ellipse(x + 8, L.slingFoot - 2, g.spread * 0.9, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  if (inPlay) drawRuler();
  // The fork: a handle and two prongs curving out from the crotch, carved from one piece; the band's
  // dark wrapping at the prongs' tips.
  const rise = g.crotchY - g.forkY;
  drawWoodLimbs([
    { x1: x + 1, y1: L.slingFoot + 8, cx: x - 3, cy: (L.slingFoot + g.crotchY) / 2, x2: x, y2: g.crotchY - 2, w1: g.limb * 1.3, w2: g.limb * 1.15, knot: 0.45 },
    { x1: x, y1: g.crotchY + 2, cx: x - g.spread * 0.15, cy: g.crotchY - rise * 0.75, x2: x - g.spread, y2: g.forkY, w1: g.limb * 1.05, w2: g.limb * 0.78 },
    { x1: x, y1: g.crotchY + 2, cx: x + g.spread * 0.2, cy: g.crotchY - rise * 0.7, x2: x + g.spread, y2: g.forkY, w1: g.limb * 1.05, w2: g.limb * 0.78, knot: 0.6 },
  ]);
  ctx.fillStyle = '#3b2412';
  for (const sx of [-1, 1]) roundRect(x + sx * g.spread - g.limb * 0.45, g.forkY + 2, g.limb * 0.9, 6, 2);
  ctx.fill();
  // Both bands in front of the wood, from the prongs to the pouch's ends.
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#6b4424';
  ctx.lineWidth = 6;
  for (const sx of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(x + sx * g.spread, g.forkY + 4);
    ctx.lineTo(p.x + sx * 11, p.y);
    ctx.stroke();
  }
  // The leather pouch, and the ball in it.
  const lg = ctx.createLinearGradient(0, p.y - 6, 0, p.y + 9);
  lg.addColorStop(0, '#6b4424');
  lg.addColorStop(1, '#3b2412');
  ctx.fillStyle = lg;
  roundRect(p.x - 14, p.y - 6, 28, 14, 6);
  ctx.fill();
  if (ready && inPlay) {
    ctx.fillStyle = ball;
    ctx.beginPath();
    ctx.arc(p.x, p.y - 4, 8.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.beginPath();
    ctx.arc(p.x - 3, p.y - 7, 2.8, 0, Math.PI * 2);
    ctx.fill();
  }
  if (showPull && pullLen() >= PULL_MIN && game.mode === 'play') drawArc(p);
  // Until the run's first shot, an arrow under the pouch shows the pull.
  if (game.mode === 'play' && aim.shots === 0 && !aim.active) {
    const bob = 6 * Math.sin(game.T * 5);
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = '#fff4dc';
    ctx.translate(x, L.slingY + 22 + bob);
    ctx.beginPath();
    ctx.moveTo(-7, -10);
    ctx.lineTo(7, -10);
    ctx.lineTo(7, 4);
    ctx.lineTo(13, 4);
    ctx.lineTo(0, 18);
    ctx.lineTo(-13, 4);
    ctx.lineTo(-7, 4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}
// The ruler's place on the counter, right of the slingshot.
function rulerBox() {
  const land = orient === 'landscape';
  const top = L.C + (land ? 14 : 18);
  const bottom = L.SHbottom - (land ? 10 : 20);
  return { x: L.slingX + (land ? 58 : 70), top, bottom, w: land ? 10 : 12 };
}
// How far the current pull reaches, 0 (just above the counter) to 1 (the top of the booth).
const reach = () => clamp(aim.py / pullY(), 0, 1);
// Where the ruler's slider is drawn: at the pull's reach while pulled, at the bottom otherwise.
function sliderY() {
  const r = rulerBox();
  return r.bottom - (aim.active || aim.kb ? reach() : 0) * (r.bottom - r.top);
}
// The notches' heights on the ruler, one for each lane.
function notchYs() {
  const r = rulerBox();
  return L.lanes.map((lane) => r.bottom - ((L.C - lane.line) / (L.C - L.T)) * (r.bottom - r.top));
}
function drawRuler() {
  const r = rulerBox();
  drawWoodLimbs([{ x1: r.x, y1: r.bottom, cx: r.x, cy: (r.top + r.bottom) / 2, x2: r.x, y2: r.top, w1: r.w, w2: r.w }]);
  // A notch at each lane's height.
  ctx.strokeStyle = '#3b2412';
  ctx.lineWidth = 2;
  for (const y of notchYs()) {
    ctx.beginPath();
    ctx.moveTo(r.x - r.w / 2, y);
    ctx.lineTo(r.x + r.w / 2 + 3, y);
    ctx.stroke();
  }
  // The brass slider: where the pull will send the ball.
  const live = aim.active || aim.kb;
  const y = sliderY();
  ctx.globalAlpha = live ? 1 : 0.45;
  ctx.fillStyle = '#e6be5a';
  ctx.strokeStyle = '#6b4a12';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(r.x - r.w / 2 - 8, y - 5);
  ctx.lineTo(r.x - r.w / 2, y);
  ctx.lineTo(r.x - r.w / 2 - 8, y + 5);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  roundRect(r.x - r.w / 2 - 1, y - 2.5, r.w + 2, 5, 2);
  ctx.fill();
  ctx.stroke();
  ctx.globalAlpha = 1;
}
// The first fifth of the ball's flight, dotted: the way it will go, not where it will land.
const ARC_SHARE = 0.2;
// The arc's dots, as drawn: the first fifth of the ball's own path from the pouch.
function arcPoints(p = pouch()) {
  const a = aimPoint();
  const pts = [];
  for (let i = 1; i <= 6; i++) {
    const q = (i / 6) * ARC_SHARE;
    pts.push({ x: p.x + (a.x - p.x) * q, y: p.y + (a.y - p.y) * q - Math.sin(Math.PI * q) * 18 });
  }
  return pts;
}
function drawArc(p) {
  arcPoints(p).forEach(({ x, y }, j) => {
    const i = j + 1;
    ctx.globalAlpha = 0.85 - i * 0.11;
    ctx.fillStyle = '#fff4dc';
    ctx.beginPath();
    ctx.arc(x, y, 3 - i * 0.25, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.globalAlpha = 1;
}

function drawBalls() {
  for (const b of balls) {
    const p = Math.min(1, b.t / b.dur);
    const at = (q) => [b.x0 + (b.x1 - b.x0) * q, b.y0 + (b.y1 - b.y0) * q - Math.sin(Math.PI * q) * 18];
    const r = lerp(7, 3 + 4 * L.lanes[b.lane].s, p);
    for (let j = 3; j >= 1; j--) {
      const [tx, ty] = at(Math.max(0, p - j * 0.06));
      ctx.globalAlpha = (0.18 * (4 - j)) / 3;
      ctx.fillStyle = b.colour;
      ctx.beginPath();
      ctx.arc(tx, ty, r, 0, Math.PI * 2);
      ctx.fill();
    }
    const [x, y] = at(p);
    ctx.globalAlpha = 1;
    ctx.fillStyle = b.colour;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.beginPath();
    ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.35, 0, Math.PI * 2);
    ctx.fill();
  }
}

function label(text, x, y, px, align = 'center', color = '#fff') {
  ctx.font = `800 ${px}px "Trebuchet MS", "Arial Rounded MT Bold", system-ui, sans-serif`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(3, px / 5);
  ctx.strokeStyle = '#7a3f12';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

function drawFx() {
  for (const f of fx) {
    if (f.type === 'text') {
      ctx.globalAlpha = Math.max(0, 1 - Math.max(0, f.t - 0.5) / 0.4);
      label(f.text, f.x, f.y - f.t * 36, 18, 'center', f.color);
    } else if (f.type === 'ring') {
      ctx.globalAlpha = Math.max(0, 1 - f.t / 0.7);
      ctx.strokeStyle = '#ffd23f';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(f.x, f.y, 6 + f.t * 60, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
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

// Where a mid-play banner's pill sits, in units: on the counter, right of the slingshot.
function pillBox() {
  // Right of the ruler, so it covers nothing.
  const left = rulerBox().x + 22;
  const w = Math.min(200, SW - left - 10);
  const cy = L.C + (orient === 'landscape' ? 44 : 50);
  return { x: left, y: cy - 18, w, h: 36 };
}

function bannerShown() {
  if (game.paused || game.turned) return null;
  if (game.resumeT > 0) return { text: 'Ready…', sub: '', t: 1, life: 2, small: false };
  return game.banner;
}

function drawBanner() {
  const b = bannerShown();
  if (!b) return;
  const p = Math.min(1, b.t / 0.18);
  const out = Math.max(0, (b.t - (b.life - 0.25)) / 0.25);
  ctx.globalAlpha = 1 - out;
  if (b.small) {
    const frenzy = b.text === 'Frenzy!';
    // On the counter's right side, clear of every lane.
    const pill = pillBox();
    const w = pill.w;
    ctx.save();
    ctx.translate(pill.x + w / 2, pill.y + pill.h / 2);
    ctx.scale(0.8 + 0.2 * p, 0.8 + 0.2 * p);
    plank(-w / 2, -18, w, 36, { tone: frenzy ? 0 : 0.05 });
    painted(b.text, 0, 1, Math.min(20, w / 5), 'center', frenzy ? '#ff9ad2' : '#ffd23f');
    ctx.restore();
    ctx.globalAlpha = 1;
    return;
  }
  const s = 0.7 + 0.3 * p;
  ctx.save();
  ctx.translate(SW / 2, (L.T + L.C) / 2);
  ctx.scale(s, s);
  const w = Math.min(SW - 40, 300);
  const bh2 = b.sub ? 88 : 66;
  plank(-w / 2, -42, w, bh2, { tone: 0.04 });
  painted(b.text, 0, b.sub ? -14 : -9, 30, 'center', '#ffd23f');
  if (b.sub) painted(b.sub, 0, 20, 16);
  ctx.restore();
  ctx.globalAlpha = 1;
}

// The frenzy's marquee: big bulbs along the valance's edge and peeking in from behind the left and
// right edges, about 3.3 times the timer's bulbs, chasing as on a carnival sign. They fade in and
// out with the frenzy.
const MARQUEE_R = 12;
const MARQUEE_COLOURS = ['#fff1c1', '#ffd23f', '#ff6ec7'];
function marqueeBulbs() {
  const out = [];
  const gap = MARQUEE_R * 2.9;
  const topY = L.top + 62;
  for (let x = gap / 2, i = 0; x < SW; x += gap, i++) out.push({ x, y: topY, i });
  let i = out.length;
  for (let y = topY + gap; y < L.C - MARQUEE_R; y += gap) {
    out.push({ x: 2, y, i: i++ });
    out.push({ x: SW - 2, y, i: i++ });
  }
  const step = Math.floor(game.T * 9);
  for (const b of out) b.lit = (b.i + step) % 3 !== 0;
  return out;
}
function drawMarquee() {
  if (game.frenzy <= 0) return;
  const fade = Math.min(1, (FRENZY_LEN - game.frenzy) / 0.3, game.frenzy / 0.3);
  const step = Math.floor(game.T * 9);
  for (const b of marqueeBulbs()) {
    ctx.globalAlpha = fade;
    // The socket.
    ctx.fillStyle = '#3a2a1c';
    ctx.beginPath();
    ctx.arc(b.x, b.y, MARQUEE_R + 2.5, 0, Math.PI * 2);
    ctx.fill();
    if (!b.lit) {
      ctx.fillStyle = '#5a4630';
      ctx.beginPath();
      ctx.arc(b.x, b.y, MARQUEE_R, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }
    const col = MARQUEE_COLOURS[(b.i + Math.floor(step / 3)) % MARQUEE_COLOURS.length];
    const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, MARQUEE_R * 2.4);
    g.addColorStop(0, col);
    g.addColorStop(1, 'rgba(255, 220, 140, 0)');
    ctx.globalAlpha = fade * 0.6;
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(b.x, b.y, MARQUEE_R * 2.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = fade;
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(b.x, b.y, MARQUEE_R, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
    ctx.beginPath();
    ctx.arc(b.x - MARQUEE_R * 0.35, b.y - MARQUEE_R * 0.35, MARQUEE_R * 0.32, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawLamps() {
  for (let x = 20; x < SW; x += 34) {
    const on = Math.sin(game.T * 5 + x * 0.3) > -0.3;
    ctx.fillStyle = on ? '#ffe27a' : '#a5772a';
    ctx.beginPath();
    ctx.arc(x, L.T - 6 + Math.sin(x * 0.13) * 3, 4.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

function draw() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#3a2414';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(dpr * k, 0, 0, dpr * k, dpr * ox, dpr * oy);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, SW, SH);
  ctx.clip();
  drawWall();
  drawPaint(-1);
  for (let i = 0; i < L.n; i++) {
    for (const t of drawOrder(i)) drawTarget(t);
    drawStrip(L.lanes[i]);
    drawPaint(i);
  }
  if (game.cfg && game.cfg.lamps) drawLamps();
  drawCurtains();
  drawMarquee();
  drawCounter();
  drawHud();
  drawSlingshot();
  drawBalls();
  drawFx();
  drawBanner();
  if (game.frenzy > 0) {
    // A frenzy tints the edges pink, never the middle of the booth.
    const g = ctx.createRadialGradient(SW / 2, SH / 2, Math.min(SW, SH) * 0.45, SW / 2, SH / 2, Math.max(SW, SH) * 0.75);
    g.addColorStop(0, 'rgba(255, 80, 160, 0)');
    g.addColorStop(1, `rgba(255, 80, 160, ${0.18 + 0.06 * Math.sin(game.T * 10)})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, SW, SH);
  }
  ctx.restore();
}

function makeDecor() {
  decor = [];
  const [cw, ch] = size('cloud1');
  const top = L.T - 6;
  decor.push({ name: 'cloud1', x: SW * 0.15, y: top, w: cw * 0.45, h: ch * 0.45, v: 6 });
  decor.push({ name: 'cloud2', x: SW * 0.7, y: top + 16, w: cw * 0.4, h: ch * 0.4, v: 4 });
  const [pw, ph] = size('tree_pine');
  const [ow, oh] = size('tree_oak');
  // The trunks go down behind the far lane's strip, past its deepest trough.
  const base = L.lanes[0].strip + 38;
  decor.push({ name: 'tree_pine', x: SW * 0.08, y: base - ph * 0.42, w: pw * 0.42, h: ph * 0.42, v: 0 });
  decor.push({ name: 'tree_oak', x: SW * 0.8, y: base - oh * 0.38, w: ow * 0.38, h: oh * 0.38, v: 0 });
}

// ---------- Input ----------

const toUnits = (cx, cy) => ({ x: (cx - ox) / k, y: (cy - oy) / k });
// The counter is the thumb's pad; the lanes aren't for touching.
const onPad = (cx, cy) => toUnits(cx, cy).y >= L.C - 8;

// The slingshot is pulled from wherever the finger first touches the counter (or the mouse
// presses anywhere): the pull is how far it has moved since, and letting go fires.
let grip = null; // { id, x, y }: the pointer holding the pouch, and where it first touched
canvas.addEventListener('pointerdown', (e) => {
  if (game.paused || game.turned || grip) return;
  const isMouse = e.pointerType === 'mouse';
  if (isMouse && e.button !== 0) return;
  if (!isMouse && !onPad(e.clientX, e.clientY)) return;
  try {
    canvas.setPointerCapture(e.pointerId);
  } catch (err) {
    // A synthetic pointer can't be captured; it still pulls.
  }
  grip = { id: e.pointerId, x: e.clientX, y: e.clientY };
  aim.active = true;
  aim.kb = false;
  setPull(0, 0);
});
canvas.addEventListener('pointermove', (e) => {
  if (!grip || e.pointerId !== grip.id || game.paused || game.turned) return;
  setPull((e.clientX - grip.x) / k, (e.clientY - grip.y) / k);
});
function release(e) {
  if (!grip || e.pointerId !== grip.id) return;
  grip = null;
  if (e.type === 'pointerup' && !game.paused && !game.turned) fire();
  aim.active = false;
  setPull(0, 0);
}
canvas.addEventListener('pointerup', release);
canvas.addEventListener('pointercancel', release);
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

// The keyboard sets a pull that stays between shots: Left and Right aim along the lanes, Up and Down
// farther and nearer (Shift for fine), Space or Enter lets go.
const keys = new Set();
window.addEventListener('keydown', (e) => {
  const t = e.target;
  if (t instanceof HTMLElement && t.closest('button') && (e.key === ' ' || e.key === 'Enter')) return;
  if (e.key.startsWith('Arrow')) {
    keys.add(e.key);
    e.preventDefault();
    if (!aim.kb) {
      aim.kb = true;
      aim.kx = clamp(aim.kx, -pullX(), pullX());
    }
  } else if (e.key === 'Shift') keys.add('Shift');
  else if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
    if (game.mode === 'play' || game.mode === 'intro') {
      e.preventDefault();
      if (aim.active) return;
      aim.kb = true;
      setPull(aim.kx, aim.ky);
      fire();
    }
  }
});
window.addEventListener('keyup', (e) => keys.delete(e.key));
window.addEventListener('blur', () => keys.clear());
function updateKeys(dt) {
  const ax = (keys.has('ArrowLeft') ? 1 : 0) - (keys.has('ArrowRight') ? 1 : 0);
  const ay = (keys.has('ArrowUp') ? 1 : 0) - (keys.has('ArrowDown') ? 1 : 0);
  if (!ax && !ay) return;
  const v = keys.has('Shift') ? 18 : 60; // units of pull a second
  aim.kx = clamp(aim.kx + ax * v * dt, -pullX(), pullX());
  aim.ky = clamp(aim.ky + ay * v * dt, 0, pullY());
  if (!aim.active) setPull(aim.kx, aim.ky);
}

// ---------- Pause and orientation ----------

const inRun = () => ['intro', 'play', 'won', 'lost'].includes(game.mode);
function pause() {
  grip = null;
  aim.active = false;
  if (inRun()) {
    game.paused = true;
    ui.pause.hidden = game.turned;
  }
  sound.suspend();
}
function resume() {
  ui.pause.hidden = true;
  game.paused = false;
  if (!game.turned) game.resumeT = 1;
  sound.unlock();
  last = performance.now();
}

// The screen turned: on the cards the booth just lays itself out again; in a run, play freezes under
// the veil until the screen turns back (play goes on) or the player restarts in the new layout. A
// turn counts only past 1.15 or below 0.87, held for 0.4 s, so a near-square window doesn't flicker.
let turnTimer = 0;
const wanted = () => {
  const r = window.innerWidth / window.innerHeight;
  return r > 1.15 ? 'landscape' : r < 0.87 ? 'portrait' : orient;
};
function onResize() {
  readInsets();
  if (!inRun()) {
    const o = screenOrient();
    if (o !== orient) {
      layoutStage(o);
      targets = [];
      paint = [];
      game.spawn = {};
    } else layoutStage(orient);
    makeDecor();
    if (game.mode === 'start') showStart();
    return;
  }
  fit();
  clearTimeout(turnTimer);
  turnTimer = setTimeout(checkTurn, wanted() === orient ? 0 : 400);
}
function checkTurn() {
  if (!inRun()) return;
  const w = wanted();
  if (w !== orient && !game.turned) {
    game.turned = true;
    grip = null;
    aim.active = false;
    ui.turned.hidden = false;
    ui.pause.hidden = true;
    ui.turnedText.textContent = `Restart in ${w}?`;
    sound.suspend();
  } else if (w === orient && game.turned) {
    game.turned = false;
    ui.turned.hidden = true;
    if (game.paused) ui.pause.hidden = false;
    else {
      game.resumeT = 1;
      sound.unlock();
    }
  }
}

// ---------- UI ----------

const $ = (s) => document.querySelector(s);
const ui = {
  start: $('[data-screen="start"]'),
  over: $('[data-screen="over"]'),
  pause: $('[data-screen="pause"]'),
  turned: $('[data-screen="turned"]'),
  turnedText: $('[data-turned-text]'),
  restart: $('[data-restart]'),
  play: $('[data-play]'),
  again: $('[data-again]'),
  best: $('[data-best]'),
  overTitle: $('[data-over-title]'),
  finalScore: $('[data-final-score]'),
  finalDetail: $('[data-final-detail]'),
  finalBest: $('[data-final-best]'),
  mute: $('[data-mute]'),
};
ui.play.addEventListener('click', () => startRun());
ui.again.addEventListener('click', () => startRun());
ui.pause.addEventListener('click', resume);
ui.restart.addEventListener('click', () => {
  // A restart from the veil isn't a lost run: the assist stays as it was.
  game.turned = false;
  ui.turned.hidden = true;
  sound.unlock();
  music('');
  startRun({ restart: true });
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

// ---------- The loop ----------

let manual = false;
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (!manual && !game.paused && !game.turned) {
    if (game.resumeT > 0) game.resumeT = Math.max(0, game.resumeT - dt);
    else update(dt);
  }
  draw();
  requestAnimationFrame(frame);
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) pause();
  else last = performance.now();
});
window.addEventListener('resize', onResize);

Promise.all([atlas.decode(), splatImg.decode()]).then(
  () => {
    readInsets();
    layoutStage(screenOrient());
    makeMasks();
    makeDecor();
    // The booth is already moving behind the start card.
    game.spawn = { movers: L.lanes.map(() => rand(2, 4)) };
    for (let i = 0; i < L.n; i++) {
      const t = launchMover(i, ROUNDS[1]);
      t.turn = false;
      t.x = rand(70, SW - 70);
    }
    showStart();
    requestAnimationFrame(frame);
    // For tests and tuning: read the state, and step the simulation without drawing.
    window.__gallery = {
      game, aim, heard, heardOpts, memory, L, ROUNDS, PALETTE, BULL, DUCK_BULL, HOPPER,
      step: update, startRun, startRound, fire, resolve, makeTarget, dims, turnState, assistNow, pause, resume,
      aimPoint, setPull, pouch, rockAngle, pivotOf, timerBulbs, marqueeBulbs, MARQUEE_R, timerBulbRadius: () => hudLayout().timer.font / 10.5, rulerBox, reach, sliderY, notchYs, arcPoints, ARC_SHARE, flightTime, laneAt, launchPop, launchFrenzyTarget, timerColour, launchDrop, dropLanes, multiplier, stripY, paintAlpha,
      targets: () => targets,
      balls: () => balls,
      paint: () => paint,
      clear() {
        targets.length = 0;
        balls.length = 0;
      },
      set manual(v) { manual = v; },
      get manual() { return manual; },
      stage: () => ({ SW, SH, k, ox, oy, orient }),
      pullRange: () => ({ x: pullX(), y: pullY() }),
      // For tests: set the pull that lands at (x, y), and start a frenzy.
      aimAt(x, y) {
        setPull(((SW / 2 - x) / (REACH * SW)) * pullX(), ((L.C - y) / (L.C - L.T)) * pullY());
      },
      startFrenzy,
      toClient: (x, y) => ({ x: ox + x * k, y: oy + y * k }),
      music: () => musicName,
      ui: () => {
        const b = bannerShown();
        const shown = hudVisible();
        return {
          start: !ui.start.hidden,
          over: !ui.over.hidden,
          pause: !ui.pause.hidden,
          turned: !ui.turned.hidden,
          banner: b ? b.text : null,
          bannerSub: b ? b.sub : '',
          hud: shown,
          pips: !shown || !game.cfg ? 'hidden' : game.mode === 'lost' ? 'flash' : game.bonus ? 'gold' : 'shown',
          timer: !shown || !game.cfg ? 'hidden' : game.frenzy > 0 ? 'stopped' : 'running',
          timerColour: !shown || !game.cfg ? 'hidden' : timerColour(),
          marquee: game.frenzy > 0,
          timerText: !shown || !game.cfg ? '' : String(Math.max(0, Math.ceil(game.time - 1e-6))),
          // Under the orientation veil the whole booth, HUD included, is greyed by the veil's filter.
          greyed: !ui.turned.hidden && getComputedStyle(ui.turned).backdropFilter.includes('grayscale'),
          // A mid-play banner's pill, in CSS px.
          pill: b && b.small ? (() => {
            const p = pillBox();
            return { top: oy + p.y * k, bottom: oy + (p.y + p.h) * k, left: ox + p.x * k, right: ox + (p.x + p.w) * k, counterTop: oy + L.C * k };
          })() : null,
        };
      },
      // The HUD's drawn bounds in CSS px, from the same numbers the drawing uses.
      hudBounds: () => {
        const H = hudLayout();
        const c = (x, y) => ({ x: ox + x * k, y: oy + y * k });
        return {
          counterTop: c(0, L.C).y,
          timer: c(H.timer.x + H.timer.w, H.timer.y + H.timer.h),
          hopper: c(H.hopper.x + H.hopper.r * (2.6 * (HOPPER - 1) + 2), H.hopper.y + H.hopper.r),
          timerBadge: { ...c(H.timer.x, H.timer.y), w: H.timer.w * k, h: H.timer.h * k, font: H.timer.font * k },
          scoreFont: H.score.font * k,
          sling: c(L.slingX, L.slingY),
          slingFoot: c(L.slingX, L.slingFoot),
          boothTop: c(0, L.T).y,
        };
      },
    };
  },
  () => {}
);

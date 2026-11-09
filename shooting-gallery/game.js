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
function sfx(name, opts) {
  heard.push(name);
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
const pullY = () => (orient === 'landscape' ? 64 : 110);
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
    const lineY = top0 + band * 0.52;
    const duckH = 109 * s * 1.15;
    L.lanes.push({
      i,
      s,
      top: top0,
      line: lineY, // where the targets' centres run, and where a shot aimed at this lane lands
      strip: lineY + duckH * 0.32, // the crest of the lane's water or grass
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
    // A big, slow target crosses the middle of the nearest lane, where the gun already points.
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

function hitTest(t, px, py, grow) {
  const [w, h] = dims(t);
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
function addSplatTo(t, x, y, colour) {
  const sz = splatSize(t.lane) * 0.7;
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
    sfx('warn');
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
const TIMER_BG = { plain: '#fff4dc', yellow: '#ffd23f', orange: '#f28c28', red: '#e8452c', pink: '#ff7ab8' };

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
  if (t.kind === 'drop') {
    // The rope, from the valance down to the target.
    ctx.strokeStyle = '#6b4a2a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(t.x, L.top + 30);
    ctx.lineTo(t.x, t.y - h / 2 + 2);
    ctx.stroke();
  } else if (!t.isDuck && t.state === 'live') {
    // The stick under a target, down behind its lane's strip.
    const sw = 30 * lane.s * 0.8;
    sprite('stick_wood', t.x - sw / 2, t.y, sw, Math.max(4, lane.strip + 30 - t.y));
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
  const bh = land ? 40 : 48;
  return {
    timer: { x: Math.max(8, (64 - ox) / k), y: L.top + (land ? 6 : 8), w: land ? 64 : 76, h: bh, font: land ? 30 : 36 },
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
  label(game.score.toLocaleString('en-US'), SW / 2, H.score.y, H.score.font, 'center');
  if (!cfg) return;
  // The timer badge: whole seconds, large, its background warning as time runs out.
  const tm = H.timer;
  const col = timerColour();
  const swell = 1 + 0.3 * Math.sin(Math.PI * Math.min(1, game.pulse || 0));
  ctx.save();
  ctx.translate(tm.x + tm.w / 2, tm.y + tm.h / 2);
  ctx.scale(swell, swell);
  ctx.fillStyle = TIMER_BG[col];
  ctx.strokeStyle = '#7a3f12';
  ctx.lineWidth = 3;
  roundRect(-tm.w / 2, -tm.h / 2, tm.w, tm.h, 12);
  ctx.fill();
  ctx.stroke();
  const secs = Math.max(0, Math.ceil(game.time - 1e-6));
  ctx.font = `800 ${tm.font}px "Trebuchet MS", "Arial Rounded MT Bold", system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = col === 'plain' || col === 'yellow' ? '#4a2a12' : '#fff';
  ctx.fillText(String(secs), 0, 2);
  ctx.restore();
  label(`Round ${game.round} · ${cfg.name}`, H.label.x, H.label.y, 14, 'left', '#fff4dc');
  // The quota: a bar that fills with every pip, the count inside it; gold in the bonus, the
  // missing part flashing red when the time runs out. It stays left of the slingshot.
  const flash = game.mode === 'lost' && Math.floor(game.modeT * 6) % 2 === 0;
  const bw = Math.min(SW * 0.42, L.slingX - 62 - H.pips.x);
  const bh = H.pips.r * 2.4;
  const by = H.pips.y - bh / 2;
  ctx.fillStyle = flash ? '#d0342c' : 'rgba(255, 244, 220, 0.18)';
  roundRect(H.pips.x, by, bw, bh, bh / 2);
  ctx.fill();
  const f = clamp(game.pips / cfg.quota, 0, 1);
  if (f > 0) {
    ctx.fillStyle = game.bonus ? '#ffd23f' : '#e86a17';
    roundRect(H.pips.x, by, Math.max(bh, bw * f), bh, bh / 2);
    ctx.fill();
  }
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(255, 244, 220, 0.6)';
  roundRect(H.pips.x, by, bw, bh, bh / 2);
  ctx.stroke();
  label(`${Math.min(game.pips, 999)} / ${cfg.quota}`, H.pips.x + bw / 2, H.pips.y + 1, 12, 'center', '#fff');
  // The hopper: the paintballs ready to fire, in the colours they'll be.
  for (let i = 0; i < HOPPER; i++) {
    const x = H.hopper.x + H.hopper.r + i * H.hopper.r * 2.6;
    ctx.beginPath();
    ctx.arc(x, H.hopper.y, H.hopper.r, 0, Math.PI * 2);
    const ready = game.frenzy > 0 || i < game.hopper;
    ctx.fillStyle = ready ? PALETTE[(game.colour + i) % PALETTE.length] : 'rgba(255, 244, 220, 0.15)';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255, 244, 220, 0.7)';
    ctx.stroke();
    if (ready) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
      ctx.beginPath();
      ctx.arc(x - H.hopper.r * 0.3, H.hopper.y - H.hopper.r * 0.3, H.hopper.r * 0.3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

// The slingshot: a fork of the pack's wooden sticks, a band from its prongs to the pouch, and the
// next paintball in the pouch. The pouch follows the pull; the band shows which way and how far.
function slingGeometry() {
  const land = orient === 'landscape';
  const spread = land ? 32 : 42;
  const forkY = L.slingY - (land ? 20 : 28);
  return { spread, forkY, crotchY: L.slingY + (land ? 18 : 28), stick: land ? 13 : 17 };
}
function drawSlingshot() {
  const g = slingGeometry();
  const x = L.slingX;
  const wood = (x1, y1, x2, y2, wdt) => {
    // A stick from the pack, stretched and turned to run from (x1, y1) to (x2, y2).
    const len = Math.hypot(x2 - x1, y2 - y1);
    ctx.save();
    ctx.translate(x1, y1);
    ctx.rotate(Math.atan2(x2 - x1, -(y2 - y1)));
    sprite('stick_wood', -wdt / 2, -len, wdt, len + 2);
    ctx.restore();
  };
  const showPull = hudVisible() && game.cfg && (aim.active || aim.kb);
  const p = showPull ? pouch() : { x: x, y: L.slingY };
  const ball = PALETTE[game.colour % PALETTE.length];
  const ready = game.frenzy > 0 || game.hopper >= 1;
  // The back band, the handle and prongs, then the pouch and the front band.
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#5b3a1e';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(x - g.spread, g.forkY);
  ctx.lineTo(p.x, p.y);
  ctx.stroke();
  wood(x, L.slingFoot, x, g.crotchY, g.stick * 1.25);
  wood(x, g.crotchY + 2, x - g.spread, g.forkY, g.stick);
  wood(x, g.crotchY + 2, x + g.spread, g.forkY, g.stick);
  ctx.fillStyle = '#4a2f18';
  roundRect(p.x - 13, p.y - 5, 26, 13, 5);
  ctx.fill();
  if (ready && hudVisible() && game.cfg) {
    ctx.fillStyle = ball;
    ctx.beginPath();
    ctx.arc(p.x, p.y - 4, 8.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.beginPath();
    ctx.arc(p.x - 3, p.y - 7, 2.8, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = '#6b4424';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(x + g.spread, g.forkY);
  ctx.lineTo(p.x, p.y);
  ctx.stroke();
  // Until the run's first shot, an arrow under the pouch shows the pull.
  if (game.mode === 'play' && aim.shots === 0 && !aim.active) {
    const bob = 6 * Math.sin(game.T * 5);
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = '#fff4dc';
    ctx.translate(x + 40, L.slingY + 6 + bob);
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

// Where a mid-play banner's pill sits, in units: on the counter, right of the gun.
function pillBox() {
  const w = Math.min(SW * 0.4, 200);
  const cy = L.C + (orient === 'landscape' ? 44 : 50);
  return { x: SW - w - 14, y: cy - 18, w, h: 36 };
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
    ctx.fillStyle = frenzy ? '#ffe3f1' : '#fff4dc';
    ctx.strokeStyle = frenzy ? '#d63384' : '#b9773a';
    ctx.lineWidth = 4;
    roundRect(-w / 2, -18, w, 36, 18);
    ctx.fill();
    ctx.stroke();
    label(b.text, 0, 1, 21, 'center', frenzy ? '#d63384' : '#e86a17');
    ctx.restore();
    ctx.globalAlpha = 1;
    return;
  }
  const s = 0.7 + 0.3 * p;
  ctx.save();
  ctx.translate(SW / 2, (L.T + L.C) / 2);
  ctx.scale(s, s);
  const w = Math.min(SW - 40, 300);
  ctx.fillStyle = '#fff4dc';
  ctx.strokeStyle = '#b9773a';
  ctx.lineWidth = 5;
  roundRect(-w / 2, -42, w, b.sub ? 88 : 66, 18);
  ctx.fill();
  ctx.stroke();
  label(b.text, 0, b.sub ? -14 : -9, 30, 'center', '#e86a17');
  if (b.sub) {
    ctx.font = '700 16px system-ui, sans-serif';
    ctx.fillStyle = '#7a4a22';
    ctx.textAlign = 'center';
    ctx.fillText(b.sub, 0, 20);
  }
  ctx.restore();
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
      game, aim, heard, memory, L, ROUNDS, PALETTE, BULL, DUCK_BULL, HOPPER,
      step: update, startRun, startRound, fire, resolve, makeTarget, dims, turnState, assistNow, pause, resume,
      aimPoint, setPull, pouch, flightTime, laneAt, launchPop, launchFrenzyTarget, timerColour, launchDrop, dropLanes, multiplier, stripY, paintAlpha,
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

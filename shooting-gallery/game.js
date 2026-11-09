// Shooting Gallery: a fairground booth where every shell counts (specs/shooting-gallery.md).
//
// The booth is drawn on one canvas in logical units: the stage is 400 units wide (up to 640 on wide
// screens) and one unit is min(width / 400, height / 700) CSS px. Three rails stand in depth: small
// targets on sticks at the back, ducks riding the water in the middle, and big targets that pop up
// from behind the front water. The counter at the bottom holds the pips, the shells and the rifle.
//
// Drag to aim (the crosshair moves by the finger's movement), tap to fire. A tap's shot is judged
// against the booth as it was when the finger touched down, so the tap's own latency costs nothing.
import { mountShell } from '../shared/game-shell.js';
import { FRAMES, ATLAS_SCALE } from './atlas.js';

const { sound } = mountShell({
  sounds: {
    shot: 'sounds/shot.mp3',
    hit: 'sounds/hit.mp3',
    tin: 'sounds/tin.mp3',
    ding: 'sounds/ding.mp3',
    shell: 'sounds/shell.mp3',
    snap: 'sounds/snap.mp3',
    miss: 'sounds/miss.mp3',
    thud: 'sounds/thud.mp3',
    splash: 'sounds/splash.mp3',
    pay: 'sounds/pay.mp3',
    tick: 'sounds/tick.mp3',
    round: 'sounds/round.mp3',
    quota: 'sounds/quota.mp3',
    lost: 'sounds/lost.mp3',
    finale: 'sounds/finale.mp3',
    music: 'sounds/music.mp3',
  },
});

// Every sound played, newest last, for the tests.
const heard = [];
function sfx(name, opts) {
  heard.push(name);
  if (heard.length > 40) heard.shift();
  sound.play(name, opts);
}

// ---------- Rules ----------

const TRAY_MAX = 10;
const START_SHELLS = 8;
const ROUND_SHELLS = 4;
const OVERFLOW_PAY = 50;
const END_SHELL_PAY = 60;
const BONUS_SPEED = 1.5;
const TAP_MS = 250;
const TAP_PX = 6;
const DRAG_GAIN = 1.5;

// Each kind of target: its points, its pips, its drawn scale, and the rail it runs on.
const KINDS = {
  tin: { points: 30, pips: 3, scale: 0.4, sound: 'tin' },
  duck: { points: 20, pips: 2, scale: 0.75, sound: 'hit' },
  gold: { points: 100, pips: 2, scale: 0.75, sound: 'hit' },
  pop: { points: 10, pips: 1, scale: 0.9, sound: 'hit' },
};
// The bullseye of each target face: its painted centre with the first ring around it, as a share
// of the sprite's half-width (measured from the pack's art).
const BULL = { target_red1: 0.232, target_red2: 0.268, target_red3: 0.366, target_colored: 0.366 };
// A target-duck's painted target: its centre and radius as shares of the sprite's width and height.
const DUCK_BULL = { u: 0.467, v: 0.686, r: 0.164 };

const CARD_TURN = { key: 'turn', name: 'Turnabouts', bg: 'green', turn: true };
const CARD_WIND = { key: 'wind', name: 'Crosswind', bg: 'wood', dusk: true, wind: true };

function roundPlan(order) {
  const [a, b] = order;
  return [
    null,
    { name: 'Ducks', bg: 'wood', quota: 6, ducks: 9, tins: 0, pops: 0, duckV: 60, tinV: 110 },
    { name: 'Tin row', bg: 'red', shade: true, quota: 10, ducks: 6, tins: 5, pops: 0, duckV: 65, tinV: 110, hint: true },
    { name: 'Pop-ups', bg: 'blue', quota: 12, ducks: 5, tins: 4, pops: 6, duckV: 70, tinV: 115, gold: true },
    { name: 'Free round', bg: 'wood', free: true, duration: 12, flockV: 100 },
    { ...a, quota: 14, ducks: 5, tins: 5, pops: 6, duckV: 75, tinV: 120, gold: true },
    { ...b, quota: 15, ducks: 5, tins: 5, pops: 6, duckV: 75, tinV: 120, gold: true },
    { name: 'Free round', bg: 'blue', free: true, duration: 12, flockV: 130 },
    { name: 'Closing time', bg: 'blue', dusk: true, quota: 16, ducks: 6, tins: 6, pops: 6, duckV: 80, tinV: 125, gold: true, turn: true, wind: true, double: true, lamps: true },
  ];
}
const LAST_ROUND = 8;

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

// ---------- Memory: the best and the hidden assist ----------

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
const memory = { best: 0, bestRound: 0, assist: 0.3, ...load() };

// ---------- Canvas and layout ----------

const canvas = document.getElementById('booth');
const ctx = canvas.getContext('2d');
const atlas = new Image();
atlas.src = 'img/atlas.png';

let dpr = 1;
let k = 1; // CSS px per unit
let SW = 400; // stage width, units
let SH = 700; // stage height, units
let ox = 0; // CSS px from the screen's left to the stage's left
let insetTop = 0;
let insetBottom = 0;
const L = {}; // the booth's lines, in units

function readInsets() {
  const cs = getComputedStyle(document.documentElement);
  insetTop = parseFloat(cs.getPropertyValue('--sat')) || 0;
  insetBottom = parseFloat(cs.getPropertyValue('--sab')) || 0;
}

function layout() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  k = Math.min(w / 400, h / 700);
  SW = Math.min(w / k, 640);
  SH = h / k;
  ox = (w - SW * k) / 2;
  const top = insetTop / k;
  const bottom = insetBottom / k;
  L.T = top + 76; // the booth starts below the valance
  L.C = SH - 172 - bottom; // the counter's top edge
  const S = L.C - L.T;
  const extra = Math.max(0, S - 444); // tall phones: the extra height spreads the rails
  L.farY = L.T + 0.2 * S; // the small targets' centres
  L.grassY = L.farY + 52; // the grass that hides their sticks
  L.duckY = L.T + 0.47 * S; // the ducks' centres
  L.midY = L.duckY + 26; // the middle water's crest: a duck's painted target stays above it
  L.frontY = L.C - 66 - 0.25 * extra; // the front water's crest
  L.popUp = L.frontY - 57 - 30; // a pop-up target's centre when up
  L.popDown = L.frontY + 70; // and when down, hidden
  L.bottom = bottom;
  L.top = top;
}

// ---------- Sprites and masks ----------

const masks = {};
function makeMasks() {
  const c = document.createElement('canvas');
  c.width = atlas.naturalWidth;
  c.height = atlas.naturalHeight;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(atlas, 0, 0);
  for (const name of ['duck_yellow', 'duck_back', 'water1', 'water2', 'grass1', 'curtain']) {
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
// The 1x size of a sprite, in the pack's own pixels.
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

// Water and grass are rows of tiles; these are their sizes in units and their contour.
const WATER_SCALE = 0.6;
const GRASS_SCALE = 0.6;
function contourY(name, scale, top, x, offset) {
  const [w, h] = size(name);
  const tw = w * scale;
  const u = (((x - offset) % tw) + tw) % tw / tw;
  return top + masks[name].top[Math.floor(u * masks[name].w)] * h * scale;
}

// ---------- State ----------

const game = {
  mode: 'start', // start | intro | play | won | lost | over
  paused: false,
  resumeT: 0, // the count-in after a pause
  run: 0,
  round: 0,
  plan: roundPlan([CARD_TURN, CARD_WIND]),
  cfg: null,
  score: 0,
  shells: START_SHELLS,
  pips: 0,
  bonus: false,
  speedMul: 1,
  clock: 0, // the parade's own clock, which runs faster in the bonus
  T: 0, // the simulation's time
  modeT: 0, // time in the current mode
  queue: [], // the parade still to come: { at, kind, ... }
  ended: '', // why the run ended: 'empty', 'away' or 'closing'
  missRow: 0,
  assist: memory.assist,
  banner: null, // { text, sub, t, life }
  shake: 0,
  kick: 0,
  overflowPaid: 0,
  lastFire: -1,
  attract: true,
};
let targets = [];
let fx = []; // short effects: popups, splinters, splashes, flying shells, rings
let holes = []; // shot holes on the backdrop
let decor = [];
const cross = { x: 200, y: 300 };
let nextId = 1;

function bgName() {
  const cfg = game.cfg;
  return 'bg_' + (cfg ? cfg.bg : 'wood');
}

// ---------- Targets ----------

function faceFor(kind, variant) {
  if (kind === 'tin') return variant || pick(['target_red1', 'target_red2', 'target_colored']);
  if (kind === 'pop') return variant || pick(['target_red3', 'target_colored', 'target_red2']);
  if (kind === 'gold') return 'duck_target_yellow';
  return variant || pick(['duck_yellow', 'duck_brown', 'duck_white']);
}

function makeTarget(kind, opts = {}) {
  const K = KINDS[kind];
  const cfg = game.cfg || {};
  const face = faceFor(kind, opts.face);
  const t = {
    id: nextId++,
    kind,
    face,
    scale: K.scale,
    state: 'live', // live | knocked | snapped
    anim: 0,
    dir: opts.dir ?? 1,
    speed: opts.speed ?? 60,
    x: opts.x ?? 0,
    y: 0,
    phase: rand(0, Math.PI * 2),
    turn: opts.turn ?? !!cfg.turn,
    turnT: opts.turnT ?? rand(0, 3.9),
    hint: !!opts.hint,
    cracked: !!opts.cracked,
    holes: [],
    popT: 0,
    vy: 0,
    rot: 0,
  };
  if (kind === 'tin') t.y = L.farY;
  if (kind === 'duck' || kind === 'gold') t.y = L.duckY;
  if (kind === 'pop') {
    t.y = opts.up ? L.popUp : L.popDown;
    t.popT = opts.up ? 0.35 : 0;
    t.upFor = opts.upFor ?? 1.8;
  }
  t.hasStick = kind === 'tin' || kind === 'pop';
  t.bull = kind === 'gold' || (kind === 'duck' ? face.startsWith('duck_target') : true);
  targets.push(t);
  return t;
}

// The sprite's drawn size in units.
function dims(t) {
  const [w, h] = size(t.kind === 'duck' || t.kind === 'gold' ? 'duck_yellow' : 'target_colored');
  return [w * t.scale, h * t.scale];
}

// Turnabouts: 2.2 s facing, a 0.25 s turn, 1.2 s showing the back, a 0.25 s turn. A turn counts as
// back. Returns whether the back shows to a shot, and the drawn width's share and side.
const TURN = [2.2, 0.25, 1.2, 0.25];
function turnState(t, time = t.turnT) {
  if (!t.turn) return { back: false, sx: 1, showBack: false };
  const cyc = TURN.reduce((a, b) => a + b, 0);
  let u = ((time % cyc) + cyc) % cyc;
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

function stickWidth(t) {
  return 30 * t.scale * (t.kind === 'tin' ? 1.15 : 0.8);
}
// Where a stick ends: the grass hides the small targets' sticks, the front water the pop-ups'.
function stickBottom(t) {
  return t.kind === 'tin' ? L.grassY + 30 : L.C;
}

// A target's pose at this moment: all a shot needs to judge it later.
function pose(t) {
  const ts = turnState(t);
  return { t, x: t.x, y: t.y, back: ts.back };
}

// ---------- The parade ----------

function buildParade(cfg) {
  const q = [];
  const ducks = cfg.ducks || 0;
  let at = 0.2;
  for (let i = 0; i < ducks; i++) {
    // A third of the ducks carry a painted target; the first is always plain and easy.
    const target = i > 0 && i % 3 === 1;
    q.push({ at, kind: 'duck', face: target ? pick(['duck_target_yellow', 'duck_target_brown', 'duck_target_white']) : null });
    at += rand(1.7, 2.6) * (60 / cfg.duckV);
  }
  at = 3;
  for (let i = 0; i < (cfg.tins || 0); i++) {
    q.push({ at, kind: 'tin', hint: cfg.hint && i < 2, cracked: cfg.hint && i === 2 });
    at += rand(2.6, 4);
  }
  at = 4;
  for (let i = 0; i < (cfg.pops || 0); i++) {
    q.push({ at, kind: 'pop' });
    at += rand(2.8, 4.2);
  }
  if (cfg.gold) q.push({ at: rand(6, 14), kind: 'gold' });
  return q.sort((a, b) => a.at - b.at);
}

function launch(item) {
  const cfg = game.cfg;
  if (item.kind === 'pop') {
    // Pick a spot along the counter that no other pop-up holds.
    const taken = targets.filter((t) => t.kind === 'pop' && t.state === 'live').map((t) => t.x);
    let x = 0;
    for (let tries = 0; tries < 12; tries++) {
      x = rand(70, SW - 70);
      if (taken.every((o) => Math.abs(o - x) > 120)) break;
    }
    return makeTarget('pop', { x });
  }
  const tin = item.kind === 'tin';
  const dir = tin && cfg.wind ? -1 : 1;
  const speed = tin ? cfg.tinV : item.kind === 'gold' ? cfg.duckV * 1.6 : cfg.duckV;
  const t = makeTarget(item.kind, { dir, speed, face: item.face, hint: item.hint, cracked: item.cracked });
  const [w] = dims(t);
  t.x = dir > 0 ? -w / 2 - 4 : SW + w / 2 + 4;
  return t;
}

function paradeOver() {
  return game.queue.length === 0 && targets.every((t) => t.state !== 'live' && t.anim > 1.2);
}

// ---------- Rounds and the run ----------

function startRun({ seed = Date.now(), order } = {}) {
  rng = mulberry32(seed);
  const cards = order || (rng() < 0.5 ? ['turn', 'wind'] : ['wind', 'turn']);
  game.plan = roundPlan(cards.map((c) => (c === 'turn' ? CARD_TURN : CARD_WIND)));
  game.run++;
  game.score = 0;
  game.shells = START_SHELLS;
  game.missRow = 0;
  game.assist = memory.assist;
  game.attract = false;
  game.ended = '';
  ui.start.hidden = true;
  ui.over.hidden = true;
  startRound(1);
  if (!stopMusic) stopMusic = sound.loop('music', { gain: 0.22 });
}
let stopMusic = null;

function startRound(n) {
  game.round = n;
  const cfg = game.plan[n];
  game.cfg = cfg;
  if (!cfg.free && n > 1) {
    const total = game.shells + ROUND_SHELLS;
    const over = Math.max(0, total - TRAY_MAX);
    game.shells = Math.min(TRAY_MAX, total);
    if (over > 0) {
      game.score += over * OVERFLOW_PAY;
      game.overflowPaid = over;
      for (let i = 0; i < over; i++) popup(trayX(TRAY_MAX - 1), trayY() - 10 - i * 14, `+${OVERFLOW_PAY}`, '#ffd23f', 0.3 + i * 0.15);
      setTimeout(() => sfx('pay'), 400);
    } else game.overflowPaid = 0;
  }
  game.pips = 0;
  game.bonus = false;
  game.speedMul = 1;
  game.clock = 0;
  game.flockIn = 0;
  game.missRow = 0;
  targets = targets.filter((t) => t.state !== 'live');
  game.queue = cfg.free ? [] : buildParade(cfg);
  game.mode = 'intro';
  game.modeT = 0;
  banner(`Round ${n}`, cfg.name, 1.3);
  sfx('round');
  // Round 1's first duck is already in view, so the first hit comes within seconds.
  if (n === 1 && game.queue.length) {
    const first = game.queue.shift();
    const t = launch(first);
    t.x = 70;
  }
  if (n === 1) {
    cross.x = SW / 2;
    cross.y = L.duckY;
  }
}

function banner(text, sub = '', life = 1.2) {
  game.banner = { text, sub, t: 0, life };
}

function quotaRound() {
  return game.cfg && !game.cfg.free && (game.mode === 'play' || game.mode === 'intro');
}

function checkRound() {
  if (game.mode !== 'play' || !game.cfg) return;
  const cfg = game.cfg;
  if (cfg.free) {
    if (game.clock >= cfg.duration && (game.clock >= cfg.duration + 3 || targets.every((t) => t.state !== 'live'))) roundWon();
    return;
  }
  const met = game.pips >= cfg.quota;
  if (met && !game.bonus) {
    sfx('quota');
    if (game.shells > 0 && !paradeOver()) {
      game.bonus = true;
      game.speedMul = BONUS_SPEED;
      banner('Bonus!', 'double points', 1.1);
      return;
    }
    roundWon();
    return;
  }
  if (met && (paradeOver() || game.shells === 0)) {
    roundWon();
    return;
  }
  if (!met && (game.shells === 0 || paradeOver())) lose(game.shells === 0 ? 'empty' : 'away');
}

function roundWon() {
  game.mode = 'won';
  game.modeT = 0;
  game.speedMul = BONUS_SPEED;
  const cfg = game.cfg;
  if (game.round === LAST_ROUND) {
    banner('Closing time!', game.shells ? `${game.shells} × ${END_SHELL_PAY} for shells left` : '', 2);
  } else banner(cfg.free ? 'Time!' : 'Round cleared', cfg.free ? '' : `${game.shells} shell${game.shells === 1 ? '' : 's'} carried`, 1.5);
}

function finishRun() {
  game.score += game.shells * END_SHELL_PAY;
  game.ended = 'closing';
  sfx('finale');
  gameOver();
}

function lose(why) {
  game.mode = 'lost';
  game.modeT = 0;
  game.ended = why;
  sfx('lost');
  if (game.round <= 2) game.assist = Math.min(1, game.assist + 0.3);
}

function gameOver() {
  game.mode = 'over';
  game.modeT = 0;
  game.attract = true;
  game.speedMul = 1;
  const newBest = game.score > memory.best;
  if (newBest) memory.best = game.score;
  memory.bestRound = Math.max(memory.bestRound || 0, game.round);
  memory.assist = game.assist;
  save(memory);
  ui.overTitle.textContent = game.ended === 'closing' ? 'Closing time!' : game.ended === 'empty' ? 'Out of shells' : 'They got away';
  ui.finalScore.textContent = game.score.toLocaleString('en-US');
  ui.finalDetail.textContent = `Round ${game.round} · ${game.plan[game.round].name}`;
  ui.finalBest.textContent = newBest && game.score > 0 ? 'A new best!' : `Best ${memory.best.toLocaleString('en-US')}`;
  ui.finalBest.classList.toggle('is-new', newBest && game.score > 0);
  ui.over.hidden = false;
  ui.again.focus({ preventScroll: true });
}

function showStart() {
  game.mode = 'start';
  game.attract = true;
  game.speedMul = 1;
  game.cfg = null;
  ui.over.hidden = true;
  ui.start.hidden = false;
  ui.best.hidden = !memory.best;
  ui.best.textContent = `Best ${memory.best.toLocaleString('en-US')} · round ${memory.bestRound}`;
}

// ---------- Shooting ----------

// The assist in effect now: none in the last round.
function assistNow() {
  return game.round === LAST_ROUND ? 0 : game.assist;
}

// What a shot at (px, py) hits, given the booth's poses and the water's sway at that moment.
// Front to back: front water, pop-ups, middle water, ducks, grass, small targets, backdrop.
function resolve(px, py, snap) {
  const grow = 1 + 0.15 * assistNow();
  // The curtains at the sides cover the booth.
  const cw = curtainRect();
  if (curtainAt((px - cw.x) / cw.w, (py - cw.y) / cw.h) || curtainAt((SW - cw.x - px) / cw.w, (py - cw.y) / cw.h)) {
    return { what: 'miss', on: 'curtain' };
  }
  if (py >= contourY('water1', WATER_SCALE, L.frontY, px, snap.front)) return { what: 'water' };
  const poses = snap.poses;
  for (const p of poses) if (p.t.kind === 'pop') {
    const r = hitTarget(p, px, py, grow);
    if (r) return r;
  }
  if (py >= contourY('water2', WATER_SCALE, L.midY, px, snap.mid)) return { what: 'water' };
  for (const p of poses) if (p.t.kind === 'duck' || p.t.kind === 'gold') {
    const r = hitDuck(p, px, py, grow);
    if (r) return r;
  }
  if (py >= contourY('grass1', GRASS_SCALE, L.grassY, px, 0)) return { what: 'miss', on: 'grass' };
  for (const p of poses) if (p.t.kind === 'tin') {
    const r = hitTarget(p, px, py, grow);
    if (r) return r;
  }
  return { what: 'miss', on: 'backdrop' };
}

function hitTarget(p, px, py, grow) {
  const t = p.t;
  const [w] = dims(t);
  const R = (w / 2) * 0.97;
  const dx = px - p.x;
  const dy = py - p.y;
  const d = Math.hypot(dx, dy);
  // The stick first: it wins even where the assist grows the body over it.
  const sw = stickWidth(t);
  if (Math.abs(dx) <= sw / 2 && py > p.y + R && py < stickBottom(t)) return { what: 'stick', p };
  if (d > R * grow) return null;
  if (p.back) return { what: 'back', p };
  if (d <= (w / 2) * BULL[t.face]) return { what: 'bull', p };
  return { what: 'body', p };
}

function hitDuck(p, px, py, grow) {
  const t = p.t;
  const [w, h] = dims(t);
  const flip = t.dir < 0;
  let u = (px - p.x) / (w * grow) + 0.5;
  const v = (py - p.y) / (h * grow) + 0.5;
  if (flip) u = 1 - u;
  if (!maskAt('duck_yellow', u, v)) return null;
  if (p.back) return { what: 'back', p };
  if (t.bull) {
    let bu = (px - p.x) / w + 0.5;
    if (flip) bu = 1 - bu;
    const bv = (py - p.y) / h + 0.5;
    if (Math.hypot((bu - DUCK_BULL.u) * w, (bv - DUCK_BULL.v) * h) <= DUCK_BULL.r * w) return { what: 'bull', p };
  }
  return { what: 'body', p };
}

// The booth's state a little while back, for a tap's shot; the newest snapshot when no time is given.
const history = [];
function snapshot() {
  return {
    T: game.T,
    poses: targets.filter((t) => t.state === 'live').map(pose),
    mid: waveOffset('mid'),
    front: waveOffset('front'),
  };
}
function snapshotAt(T) {
  for (let i = history.length - 1; i >= 0; i--) if (history[i].T <= T) return history[i];
  return history[0] || snapshot();
}

function canFire() {
  if (game.paused || game.resumeT > 0 || game.mode !== 'play') return false;
  if (game.T - game.lastFire < 0.1) return false;
  return game.cfg.free || game.shells > 0;
}

// Fire at (x, y), judged against the booth as it was at time `at` (now when not given).
function fire(x = cross.x, y = cross.y, at = null) {
  if (!canFire()) return null;
  game.lastFire = game.T;
  const cfg = game.cfg;
  const free = !!cfg.free;
  if (!free) game.shells--;
  game.kick = 1;
  sfx('shot', { rate: rand(0.95, 1.05) });
  const snap = at == null ? snapshot() : snapshotAt(at);
  const r = resolve(x, y, snap);
  // The target may have been knocked since the snapshot by another shot: then it's a miss.
  if (r.p && r.p.t.state !== 'live') r.what = 'gone';
  apply(r, x, y);
  checkRound();
  return r;
}

function apply(r, x, y) {
  const cfg = game.cfg;
  const free = !!cfg.free;
  const mult = (game.bonus ? 2 : 1) * (cfg.double ? 2 : 1);
  if (r.what === 'water') {
    splash(x, y);
    sfx('splash', { gain: 0.5, rate: rand(1.1, 1.3) });
    missed();
    return;
  }
  if (r.what === 'miss' || r.what === 'gone') {
    if (r.on === 'backdrop') holes.push({ x, y, t: 0 });
    if (holes.length > 24) holes.shift();
    splinters(x, y, '#8a5a2b', 4);
    sfx('miss', { rate: rand(0.9, 1.1) });
    missed();
    return;
  }
  const t = r.p.t;
  const K = KINDS[t.kind];
  if (r.what === 'stick') {
    t.state = 'snapped';
    t.anim = 0;
    t.vy = -60;
    t.rot = 0;
    t.snapY = y;
    const pts = K.points * 3 * mult;
    gain(pts, K.pips + 1, t, x, y);
    splinters(x, y, '#c98a4b', 10);
    game.shake = 0.15;
    sfx('snap', { rate: rand(0.95, 1.08) });
    hitAssist();
    return;
  }
  if (r.what === 'back') {
    t.holes.push({ dx: x - t.x, dy: y - t.y });
    sfx('thud', { rate: rand(0.9, 1.1) });
    splinters(x, y, '#9fb8ba', 4);
    popup(x, y - 16, 'back!', '#d8e6e7');
    missed();
    return;
  }
  t.state = 'knocked';
  t.anim = 0;
  t.holes.push({ dx: x - t.x, dy: y - t.y });
  const bull = r.what === 'bull';
  const pts = K.points * (bull ? 2 : 1) * mult;
  gain(pts, K.pips, t, x, y);
  sfx(K.sound, { rate: rand(0.92, 1.08) });
  if (bull) {
    sfx('ding');
    fx.push({ type: 'ring', x, y, t: 0 });
    if (!free && !game.bonus) refund(x, y, 1, 0.12);
  }
  if (t.kind === 'gold' && !free && !game.bonus) refund(x, y, 2, 0.3);
  hitAssist();
}

function gain(points, pips, t, x, y) {
  game.score += points;
  if (!game.cfg.free) game.pips += pips;
  popup(x, y - 18, `+${points}`, '#fff');
}

function refund(x, y, n, delay) {
  for (let i = 0; i < n; i++) {
    if (game.shells >= TRAY_MAX) break;
    game.shells++;
    fx.push({ type: 'shell', x, y, t: -i * 0.15, slot: game.shells - 1 });
  }
  setTimeout(() => sfx('shell'), delay * 1000 + 380);
}

function missed() {
  if (game.cfg.free) return;
  game.missRow++;
  if (game.missRow >= 2) {
    game.assist = Math.min(1, game.assist + 0.2);
    game.missRow = 0;
  }
}
function hitAssist() {
  if (game.cfg.free) return;
  game.missRow = 0;
  game.assist = Math.max(0, game.assist - 0.05);
}

// ---------- Effects ----------

function popup(x, y, text, color, delay = 0) {
  fx.push({ type: 'text', x, y, text, color, t: -delay });
}
function splinters(x, y, color, n) {
  for (let i = 0; i < n; i++) {
    const a = rand(0, Math.PI * 2);
    const s = rand(40, 140);
    fx.push({ type: 'bit', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 60, color, t: 0, r: rand(1.5, 3) });
  }
}
function splash(x, y) {
  for (let i = 0; i < 9; i++) {
    const a = rand(-Math.PI * 0.9, -Math.PI * 0.1);
    const s = rand(60, 170);
    fx.push({ type: 'bit', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, color: '#e8f6ff', t: 0, r: rand(2, 4) });
  }
}

// ---------- The simulation ----------

function waveOffset(which) {
  const amp = game.cfg && game.cfg.wind ? 2 : 1;
  return which === 'mid' ? 14 * amp * Math.sin(game.T * 0.9) : -16 * amp * Math.sin(game.T * 0.75 + 1);
}

function attractStep() {
  // Behind the start and over cards the booth keeps going: ducks and small targets cross.
  const live = targets.filter((t) => t.state === 'live');
  if (live.filter((t) => t.kind === 'duck').length < 4 && (game.attractDuck ?? 0) <= game.T) {
    const saved = game.cfg;
    game.cfg = { duckV: 55, tinV: 90 };
    const t = launch({ kind: 'duck', face: rng() < 0.3 ? 'duck_target_yellow' : null });
    t.turn = false;
    game.cfg = saved;
    game.attractDuck = game.T + rand(1.6, 2.6);
  }
  if (live.filter((t) => t.kind === 'tin').length < 2 && (game.attractTin ?? 0) <= game.T) {
    const saved = game.cfg;
    game.cfg = { duckV: 55, tinV: 90 };
    const t = launch({ kind: 'tin' });
    t.turn = false;
    game.cfg = saved;
    game.attractTin = game.T + rand(3, 5);
  }
}

function update(dt) {
  game.T += dt;
  game.modeT += dt;
  if (game.banner) {
    game.banner.t += dt;
    if (game.banner.t > game.banner.life) game.banner = null;
  }
  game.shake = Math.max(0, game.shake - dt);
  game.kick = Math.max(0, game.kick - dt * 6);
  for (const d of decor) d.x = d.x + d.v * dt > SW + 80 ? -80 : d.x + d.v * dt;

  if (game.mode === 'intro' && game.modeT >= 1.2) {
    game.mode = 'play';
    game.modeT = 0;
  }
  const moving = game.mode === 'play' || game.mode === 'won' || game.mode === 'lost' || game.attract;
  if (game.attract && (game.mode === 'start' || game.mode === 'over')) attractStep();
  if (moving) {
    const step = dt * game.speedMul;
    game.clock += step;
    if (game.mode === 'play') {
      while (game.queue.length && game.queue[0].at <= game.clock) launch(game.queue.shift());
      if (game.cfg && game.cfg.free && game.clock < game.cfg.duration - 2 && (game.flockIn ?? 0) <= game.clock) {
        const t = makeTarget('duck', { speed: game.cfg.flockV, dir: rng() < 0.5 ? 1 : -1 });
        t.face = pick(['duck_yellow', 'duck_brown', 'duck_white', 'duck_target_yellow', 'duck_target_brown']);
        t.bull = t.face.startsWith('duck_target');
        const [w] = dims(t);
        t.x = t.dir > 0 ? -w / 2 : SW + w / 2;
        game.flockIn = game.clock + rand(0.35, 0.6);
      }
    }
    for (const t of targets) {
      if (t.kind === 'pop') {
        if (t.state === 'live') {
          t.popT += step;
          const up = t.upFor;
          let h; // 0 down, 1 up
          if (t.popT < 0.35) h = t.popT / 0.35;
          else if (t.popT < 0.35 + up) h = 1;
          else if (t.popT < 0.7 + up) h = 1 - (t.popT - 0.35 - up) / 0.35;
          else {
            h = 0;
            t.state = 'gone';
            t.anim = 99;
          }
          const e = h * h * (3 - 2 * h);
          const wasDown = t.y > L.frontY + 20;
          t.y = L.popDown + (L.popUp - L.popDown) * e;
          if (wasDown && t.y <= L.frontY + 20 && t.popT < 0.35 && game.mode === 'play') sfx('splash', { gain: 0.35, rate: rand(1.2, 1.4) });
        }
      } else if (t.state === 'live') {
        t.x += t.dir * t.speed * step;
        const bob = (game.cfg && game.cfg.wind ? 2 : 1) * 4;
        if (t.kind !== 'tin') t.y = L.duckY + bob * Math.sin(game.T * 2.2 + t.phase);
        else t.y = L.farY;
        const [w] = dims(t);
        if ((t.dir > 0 && t.x > SW + w / 2 + 8) || (t.dir < 0 && t.x < -w / 2 - 8)) {
          t.state = 'gone';
          t.anim = 99;
        }
      }
      if (t.turn) t.turnT += step;
      if (t.state === 'knocked') t.anim += dt;
      if (t.state === 'snapped') {
        t.anim += dt;
        t.vy += 900 * dt;
        t.y += t.vy * dt;
        t.rot += dt * 3 * t.dir;
      }
    }
    targets = targets.filter((t) => t.anim < 1.5 && t.y < SH + 200);
  }
  for (const f of fx) {
    f.t += dt;
    if (f.type === 'bit') {
      f.vy += 500 * dt;
      f.x += f.vx * dt;
      f.y += f.vy * dt;
    }
  }
  fx = fx.filter((f) => f.t < (f.type === 'text' ? 0.9 : f.type === 'shell' ? 0.55 : 0.7));
  for (const h of holes) h.t += dt;
  holes = holes.filter((h) => h.t < 5);

  history.push(snapshot());
  while (history.length && history[0].T < game.T - 0.6) history.shift();

  if (game.mode === 'play') checkRound();
  if (game.mode === 'won' && game.modeT >= (game.round === LAST_ROUND ? 2 : 1.6)) {
    if (game.round === LAST_ROUND) finishRun();
    else startRound(game.round + 1);
  }
  if (game.mode === 'lost' && game.modeT >= 1.5) gameOver();
  updateKeys(dt);
}

// ---------- Drawing ----------

// The side curtains hang from the valance to the counter, tied back; most of each is off the stage.
// Only the curtain's top swag (CURTAIN_PART of the sprite) is drawn, stretched to that height.
const CURTAIN_PART = 0.5;
function curtainRect() {
  const [w] = size('curtain');
  const ch = L.C - L.top - 30;
  const cw = Math.min(w * 0.7, SW * 0.2);
  return { x: -cw * 0.45, y: L.top + 10, w: cw, h: ch };
}
function curtainAt(u, v) {
  return maskAt('curtain', u, v * CURTAIN_PART);
}

// A row of water or grass tiles; only their top part is drawn (their bottom edge has an outline),
// and below it their colour carries on down to `bottom`.
function tileRow(name, scale, x0, top, bottom) {
  const [w, h] = size(name);
  const f = FRAMES[name];
  const part = 0.6;
  const tw = w * scale;
  const th = h * scale * part;
  ctx.fillStyle = name.startsWith('water') ? '#3ea3df' : '#3c9f45';
  ctx.fillRect(-4, top + th - 1, SW + 8, Math.max(0, bottom - top - th + 1));
  let x = (((x0 % tw) + tw) % tw) - tw;
  for (; x < SW + tw; x += tw) ctx.drawImage(atlas, f[0], f[1], f[2], f[3] * part, x, top, tw + 0.5, th);
}

function drawBackdrop() {
  const name = bgName();
  const ts = 128;
  for (let y = L.top; y < L.C; y += ts) for (let x = 0; x < SW; x += ts) sprite(name, x, y, ts + 0.5, ts + 0.5);
  if (game.cfg && game.cfg.shade) {
    // A red wall a shade darker, so the orange curtains stand out from it.
    ctx.fillStyle = 'rgba(70, 14, 0, 0.3)';
    ctx.fillRect(0, L.top, SW, L.C - L.top);
  }
  if (game.cfg && game.cfg.dusk) {
    ctx.fillStyle = 'rgba(60, 30, 80, 0.28)';
    ctx.fillRect(0, L.top, SW, L.C - L.top);
  }
  for (const d of decor) if (d.cloud) sprite(d.name, d.x, d.y, d.w, d.h);
  for (const h of holes) {
    ctx.globalAlpha = Math.min(1, 5 - h.t);
    sprite('shot_hole', h.x - 5, h.y - 5, 10, 10);
  }
  ctx.globalAlpha = 1;
  for (const d of decor) if (!d.cloud) sprite(d.name, d.x, d.y, d.w, d.h);
}

function drawStick(t) {
  const sw = stickWidth(t);
  const bottom = stickBottom(t);
  const name = t.cracked ? 'stick_wood_fixed' : 'stick_wood';
  if (t.state === 'snapped') {
    // The stump stays behind.
    const y0 = t.snapY;
    sprite('stick_wood_broken', t.x - sw / 2, y0 - 4, sw, bottom - y0 + 4);
    return;
  }
  sprite(name, t.x - sw / 2, t.y, sw, bottom - t.y);
}

function drawTarget(t) {
  const [w, h] = dims(t);
  if (t.hasStick && t.state !== 'knocked') drawStick(t);
  const ts = turnState(t);
  ctx.save();
  ctx.translate(t.x, t.y);
  if (t.state === 'knocked') {
    // Knocked flat: it tips back over its base.
    const p = Math.min(1, t.anim / 0.25);
    ctx.translate(0, h * 0.5);
    ctx.scale(1, Math.max(0.02, 1 - p));
    ctx.translate(0, -h * 0.5);
    if (t.anim > 0.6) ctx.globalAlpha = Math.max(0, 1 - (t.anim - 0.6) / 0.5);
  }
  if (t.state === 'snapped') ctx.rotate(t.rot);
  ctx.scale(ts.sx, 1);
  const isDuck = t.kind === 'duck' || t.kind === 'gold';
  let name = t.face;
  if (ts.showBack) name = isDuck ? 'duck_back' : 'target_back';
  sprite(name, -w / 2, -h / 2, w, h, isDuck && t.dir < 0);
  if (t.kind === 'gold' && !ts.showBack) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha *= 0.25 + 0.2 * Math.sin(game.T * 8);
    sprite(name, -w / 2, -h / 2, w, h, t.dir < 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }
  if (!ts.showBack) for (const hole of t.holes) sprite(t.kind === 'tin' ? 'shot_hole_tin' : 'shot_hole', hole.dx - 4, hole.dy - 4, 8, 8);
  ctx.restore();
  if (t.kind === 'gold' && t.state === 'live') {
    // A few twinkles around the gold duck.
    for (let i = 0; i < 3; i++) {
      const a = game.T * 2 + i * 2.1;
      twinkle(t.x + Math.cos(a) * w * 0.55, t.y + Math.sin(a * 1.3) * h * 0.45, 3 + 2 * Math.sin(game.T * 6 + i));
    }
  }
  if (t.hint && t.state === 'live' && !ts.showBack) {
    // Round 2's first targets show their reward: the bullseye pulses gold, a shell above.
    const r = (w / 2) * BULL[t.face];
    ctx.strokeStyle = `rgba(255, 210, 63, ${0.6 + 0.4 * Math.sin(game.T * 6)})`;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(t.x, t.y, r + 2 + Math.sin(game.T * 6), 0, Math.PI * 2);
    ctx.stroke();
    sprite('shell', t.x - 5, t.y - h / 2 - 26, 10, 20);
  }
}

function twinkle(x, y, r) {
  ctx.fillStyle = '#fff6c2';
  ctx.beginPath();
  ctx.moveTo(x, y - r * 2);
  ctx.lineTo(x + r * 0.5, y - r * 0.5);
  ctx.lineTo(x + r * 2, y);
  ctx.lineTo(x + r * 0.5, y + r * 0.5);
  ctx.lineTo(x, y + r * 2);
  ctx.lineTo(x - r * 0.5, y + r * 0.5);
  ctx.lineTo(x - r * 2, y);
  ctx.lineTo(x - r * 0.5, y - r * 0.5);
  ctx.fill();
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
  // The valance across the top.
  const [vw, vh] = size('curtain_straight');
  const s = 0.95;
  for (let x = -10; x < SW + 10; x += vw * s - 1) sprite('curtain_straight', x, L.top - 6, vw * s, vh * s);
  if (L.top > 0) {
    ctx.fillStyle = '#e86a17';
    ctx.fillRect(-4, -4, SW + 8, L.top - 2);
  }
}

const pipR = 6.5;
function pipX(i, n) {
  const gap = Math.min(16, (SW * 0.58) / n);
  return 24 + i * gap + pipR;
}
const trayX = (i) => 24 + i * 22 + 8;
const trayY = () => L.C + 70;

function drawCounter() {
  // The counter: a wooden bar across the bottom.
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

function hudVisible() {
  return game.mode !== 'start' && game.mode !== 'over';
}

function drawHud() {
  if (!hudVisible() && game.mode !== 'over') return;
  const cfg = game.cfg;
  // The score, on the valance.
  label(game.score.toLocaleString('en-US'), SW / 2, L.top + 34, 30, 'center');
  if (!cfg) return;
  label(`Round ${game.round} · ${cfg.name}`, 24, L.C + 24, 15, 'left', '#fff4dc');
  if (!cfg.free) {
    const n = cfg.quota;
    const flash = game.mode === 'lost' && Math.floor(game.modeT * 6) % 2 === 0;
    for (let i = 0; i < n; i++) {
      const x = pipX(i, n);
      const y = L.C + 46;
      ctx.beginPath();
      ctx.arc(x, y, pipR, 0, Math.PI * 2);
      const lit = i < game.pips;
      ctx.fillStyle = lit ? (game.bonus ? '#ffd23f' : '#e86a17') : flash ? '#d0342c' : 'rgba(255, 244, 220, 0.18)';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = lit ? '#fff4dc' : 'rgba(255, 244, 220, 0.6)';
      ctx.stroke();
    }
  }
  // The tray of shells.
  const flying = fx.filter((f) => f.type === 'shell').length;
  const shown = game.shells - flying;
  ctx.globalAlpha = cfg.free ? 0.45 : 1;
  for (let i = 0; i < TRAY_MAX; i++) sprite(i < shown ? 'shell' : 'shell_empty', trayX(i) - 8, trayY() - 16, 16, 32);
  ctx.globalAlpha = 1;
  if (cfg.free) label('free shots', trayX(0) - 8, trayY() + 34, 13, 'left', '#ffd23f');
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

function drawRifle() {
  if (game.mode === 'start') return;
  const [w, h] = size('rifle');
  const s = 0.55;
  const bx = SW - 62;
  const by = SH + 46 - L.bottom * 0;
  const ang = clamp(Math.atan2(cross.x - bx, by - cross.y), -0.45, 0.25);
  ctx.save();
  ctx.translate(bx, by + game.kick * 10);
  ctx.rotate(ang);
  sprite('rifle', -w * s * 0.42, -h * s, w * s, h * s);
  ctx.restore();
}

function drawFx() {
  for (const f of fx) {
    if (f.t < 0) continue;
    if (f.type === 'bit') {
      ctx.globalAlpha = Math.max(0, 1 - f.t / 0.7);
      ctx.fillStyle = f.color;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
      ctx.fill();
    } else if (f.type === 'text') {
      ctx.globalAlpha = Math.max(0, 1 - Math.max(0, f.t - 0.5) / 0.4);
      label(f.text, f.x, f.y - f.t * 36, 18, 'center', f.color);
    } else if (f.type === 'ring') {
      ctx.globalAlpha = Math.max(0, 1 - f.t / 0.7);
      ctx.strokeStyle = '#ffd23f';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(f.x, f.y, 6 + f.t * 60, 0, Math.PI * 2);
      ctx.stroke();
    } else if (f.type === 'shell') {
      // The shell arcs back to its slot in the tray.
      const p = Math.min(1, f.t / 0.55);
      const tx = trayX(f.slot);
      const ty = trayY();
      const x = f.x + (tx - f.x) * p;
      const y = f.y + (ty - f.y) * p - Math.sin(Math.PI * p) * 80;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(p * Math.PI * 2);
      sprite('shell', -8, -16, 16, 32);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }
}

function drawBanner() {
  let text = null;
  let sub = '';
  if (game.paused) return;
  if (game.resumeT > 0) text = 'Ready…';
  else if (game.banner) ({ text, sub } = game.banner);
  if (!text) return;
  const b = game.banner;
  const p = b ? Math.min(1, b.t / 0.18) : 1;
  const out = b ? Math.max(0, (b.t - (b.life - 0.25)) / 0.25) : 0;
  ctx.globalAlpha = 1 - out;
  const y = (L.T + L.C) / 2 - 30;
  const s = 0.7 + 0.3 * p;
  ctx.save();
  ctx.translate(SW / 2, y);
  ctx.scale(s, s);
  const w = Math.min(SW - 40, 300);
  ctx.fillStyle = '#fff4dc';
  ctx.strokeStyle = '#b9773a';
  ctx.lineWidth = 5;
  roundRect(-w / 2, -42, w, sub ? 88 : 66, 18);
  ctx.fill();
  ctx.stroke();
  label(text, 0, sub ? -14 : -9, 30, 'center', '#e86a17');
  if (sub) {
    ctx.font = '700 16px system-ui, sans-serif';
    ctx.fillStyle = '#7a4a22';
    ctx.textAlign = 'center';
    ctx.fillText(sub, 0, 20);
  }
  ctx.restore();
  ctx.globalAlpha = 1;
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

function drawCrosshair() {
  if (game.mode === 'start' || game.mode === 'over') return;
  const { x, y } = cross;
  ctx.lineCap = 'round';
  for (const [color, lw] of [
    ['rgba(40, 20, 6, 0.7)', 4.5],
    ['#fff', 2],
  ]) {
    ctx.strokeStyle = color;
    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.arc(x, y, 15, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      ctx.moveTo(x + dx * 8, y + dy * 8);
      ctx.lineTo(x + dx * 21, y + dy * 21);
    }
    ctx.stroke();
  }
  ctx.fillStyle = '#d0342c';
  ctx.beginPath();
  ctx.arc(x, y, 1.6, 0, Math.PI * 2);
  ctx.fill();
}

function draw() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#3a2414';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const sx = game.shake > 0 ? rand(-2, 2) : 0;
  const sy = game.shake > 0 ? rand(-2, 2) : 0;
  ctx.setTransform(dpr * k, 0, 0, dpr * k, dpr * (ox + sx * k), dpr * sy * k);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, SW, SH);
  ctx.clip();
  drawBackdrop();
  const live = (kind) => targets.filter((t) => (Array.isArray(kind) ? kind.includes(t.kind) : t.kind === kind));
  for (const t of live('tin')) drawTarget(t);
  tileRow('grass1', GRASS_SCALE, 0, L.grassY, L.midY + 30);
  for (const t of live(['duck', 'gold'])) drawTarget(t);
  tileRow('water2', WATER_SCALE, waveOffset('mid'), L.midY, L.frontY + 30);
  for (const t of live('pop')) drawTarget(t);
  tileRow('water1', WATER_SCALE, waveOffset('front'), L.frontY, L.C);
  if (game.cfg && game.cfg.lamps) drawLamps();
  drawCurtains();
  drawCounter();
  drawHud();
  drawRifle();
  drawFx();
  drawBanner();
  drawCrosshair();
  ctx.restore();
}

function drawLamps() {
  // Closing time: a string of lamps under the valance.
  for (let x = 20; x < SW; x += 34) {
    const on = Math.sin(game.T * 5 + x * 0.3) > -0.3;
    ctx.fillStyle = on ? '#ffe27a' : '#a5772a';
    ctx.beginPath();
    ctx.arc(x, L.T - 2 + Math.sin(x * 0.13) * 3, 4.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

function makeDecor() {
  decor = [];
  const [cw, ch] = size('cloud1');
  decor.push({ cloud: true, name: 'cloud1', x: SW * 0.15, y: L.T + 4, w: cw * 0.5, h: ch * 0.5, v: 6 });
  decor.push({ cloud: true, name: 'cloud2', x: SW * 0.7, y: L.T + 26, w: cw * 0.45, h: ch * 0.45, v: 4 });
  const [pw, ph] = size('tree_pine');
  const [ow, oh] = size('tree_oak');
  const base = L.grassY + 26;
  decor.push({ name: 'tree_pine', x: SW * 0.08, y: base - ph * 0.55, w: pw * 0.55, h: ph * 0.55, v: 0 });
  decor.push({ name: 'tree_oak', x: SW * 0.78, y: base - oh * 0.5, w: ow * 0.5, h: oh * 0.5, v: 0 });
  decor.push({ name: 'tree_pine', x: SW * 0.55, y: base - ph * 0.38, w: pw * 0.38, h: ph * 0.38, v: 0 });
}

// ---------- Input ----------

const toUnits = (clientX, clientY) => ({ x: (clientX - ox) / k, y: clientY / k });
function clampCross() {
  cross.x = clamp(cross.x, 6, SW - 6);
  cross.y = clamp(cross.y, L.T, L.C - 4);
}

let primary = null; // the finger that aims: { id, x, y, t0, T0, moved, cancelled, cx, cy }
canvas.addEventListener('pointerdown', (e) => {
  if (game.paused) return;
  if (e.pointerType === 'mouse') {
    if (e.button !== 0) return;
    Object.assign(cross, toUnits(e.clientX, e.clientY));
    clampCross();
    fire();
    return;
  }
  if (!primary) {
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch (err) {
      // A synthetic pointer can't be captured; it still aims.
    }
    primary = { id: e.pointerId, x: e.clientX, y: e.clientY, t0: performance.now(), T0: game.T, moved: 0, cancelled: false, cx: cross.x, cy: cross.y };
    return;
  }
  if (primary.second == null) {
    // A second finger fires at once, where the crosshair is now; the first finger's lift won't.
    primary.second = e.pointerId;
    primary.cancelled = true;
    fire();
  }
});
canvas.addEventListener('pointermove', (e) => {
  if (e.pointerType === 'mouse') {
    Object.assign(cross, toUnits(e.clientX, e.clientY));
    clampCross();
    return;
  }
  if (!primary || e.pointerId !== primary.id) return;
  const dx = e.clientX - primary.x;
  const dy = e.clientY - primary.y;
  primary.x = e.clientX;
  primary.y = e.clientY;
  primary.moved += Math.hypot(dx, dy);
  if (game.paused) return;
  cross.x += (dx * DRAG_GAIN) / k;
  cross.y += (dy * DRAG_GAIN) / k;
  clampCross();
});
function endTouch(e) {
  if (!primary) return;
  if (e.pointerId === primary.second) {
    primary.second = undefined;
    return;
  }
  if (e.pointerId !== primary.id) return;
  const p = primary;
  primary = null;
  if (e.type === 'pointercancel' || p.cancelled || game.paused) return;
  if (p.moved < TAP_PX && performance.now() - p.t0 < TAP_MS) fire(p.cx, p.cy, p.T0);
}
canvas.addEventListener('pointerup', endTouch);
canvas.addEventListener('pointercancel', endTouch);
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

const keys = new Set();
let held = 0;
window.addEventListener('keydown', (e) => {
  const t = e.target;
  if (t instanceof HTMLElement && t.closest('button') && (e.key === ' ' || e.key === 'Enter')) return;
  if (e.key.startsWith('Arrow')) {
    keys.add(e.key);
    e.preventDefault();
  } else if (e.key === 'Shift') keys.add('Shift');
  else if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
    if (game.mode === 'play' || game.mode === 'intro') {
      e.preventDefault();
      fire();
    }
  }
});
window.addEventListener('keyup', (e) => {
  keys.delete(e.key);
});
window.addEventListener('blur', () => keys.clear());
function updateKeys(dt) {
  const ax = (keys.has('ArrowRight') ? 1 : 0) - (keys.has('ArrowLeft') ? 1 : 0);
  const ay = (keys.has('ArrowDown') ? 1 : 0) - (keys.has('ArrowUp') ? 1 : 0);
  if (!ax && !ay) {
    held = 0;
    return;
  }
  held += dt;
  const v = keys.has('Shift') ? 60 : Math.min(480, 160 + held * 500);
  cross.x += ax * v * dt;
  cross.y += ay * v * dt;
  clampCross();
}

// ---------- Pause ----------

function pause() {
  primary = null;
  if (game.mode === 'intro' || game.mode === 'play' || game.mode === 'won' || game.mode === 'lost') {
    game.paused = true;
    ui.pause.hidden = false;
  }
  sound.suspend();
}
function resume() {
  ui.pause.hidden = true;
  game.paused = false;
  game.resumeT = 1;
  sound.unlock();
  last = performance.now();
}

// ---------- UI ----------

const $ = (s) => document.querySelector(s);
const ui = {
  start: $('[data-screen="start"]'),
  over: $('[data-screen="over"]'),
  pause: $('[data-screen="pause"]'),
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
  if (!manual && !game.paused) {
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

window.addEventListener('resize', () => {
  readInsets();
  layout();
  makeDecor();
});

atlas.decode().then(
  () => {
    readInsets();
    layout();
    makeMasks();
    makeDecor();
    cross.x = SW / 2;
    cross.y = L.duckY;
    // The booth is already moving behind the start card.
    for (let i = 0; i < 3; i++) {
      attractStep();
      const t = targets[targets.length - 1];
      t.x = 60 + i * 130;
      game.attractDuck = 0;
    }
    showStart();
    requestAnimationFrame(frame);
    // For tests and tuning: read the state, and step the simulation without drawing.
    window.__gallery = {
      game, cross, heard, memory, KINDS, BULL, DUCK_BULL, TRAY_MAX,
      L, step: update, startRun, startRound, fire, resolve, snapshot, makeTarget, dims, turnState, stickWidth, stickBottom, assistNow, pause, resume,
      targets: () => targets,
      clear() {
        targets.length = 0;
        game.queue.length = 0;
      },
      set manual(v) { manual = v; },
      get manual() { return manual; },
      stage: () => ({ SW, SH, k, ox }),
      toClient: (x, y) => ({ x: ox + x * k, y: y * k }),
      ui: () => ({
        start: !ui.start.hidden,
        over: !ui.over.hidden,
        pause: !ui.pause.hidden,
        banner: game.resumeT > 0 ? 'Ready…' : game.banner ? game.banner.text : null,
        hud: hudVisible(),
      }),
    };
  },
  () => {}
);

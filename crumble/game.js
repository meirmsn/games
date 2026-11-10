// Crumble: two toy tanks on a crumbling shore, and the tide coming in.
//
// One canvas, no library. The world is 1400 × 620 units, fitted whole into the screen and aligned
// to the bottom; the sky and the sea fill any space left. The ground is terrain.js (a canvas carved
// with holes, plus a mask for physics). Shells fly on fixed 1/120 s steps, so the CPU's planning and
// the real flight follow exactly the same path. window.__crumble exposes the state for the tests.
import { mountShell } from '../shared/game-shell.js';
import { createExplosions, loadExplosionArt } from '../shared/explosion.js';
import { createTerrain, makeHeights, rng, STEEL } from './terrain.js';

const W = 1400;
const H = 620;
const SIM = 1 / 120;

// Every knob, in one place (the spec's Decisions). Distances are world units, times seconds.
export const TUNING = {
  gravity: 420,
  speed: 760, // launch speed at full power
  dragCap: 120, // CSS px of pull for full power
  deadZone: 14, // CSS px: a shorter pull cancels
  shellRadius: 36,
  shellDamage: 30,
  directBonus: 15,
  reach: 28, // a tank's size, added to the blast's edge for damage
  fallSafe: 30,
  fallDamage: 0.5, // per unit fallen beyond fallSafe
  augerWidth: 1.3, // × a tank's width
  augerNotches: 2.5,
  augerCharges: 2,
  augerSpeed: 300,
  tideEvery: 3, // shots per rise
  tideDamage: 30,
  cpuDelay: 0.7,
  // By level, at assist 0: the CPU's aim tightens level by level (radians, and a fraction of power).
  cpuSpreadAngle: [0.13, 0.09, 0.078, 0.07, 0.064, 0.058, 0.054, 0.05, 0.046, 0.042],
  cpuSpreadPower: [0.11, 0.075, 0.066, 0.06, 0.055, 0.05, 0.047, 0.044, 0.041, 0.038],
  cpuWarmup: [1.6, 1.3, 1.0], // its first three shots of a battle are this much wider: it homes in
  assistSpread: 1.8, // spread × (1 + assist × this)
  assistStart: 0.25,
  assistUp: 0.35,
  assistDown: 0.2,
  digWeight: 0.6, // k: the CPU's value of a unit of drop against a point of damage
  sideMargin: 80,
  crateEvery: 4, // shots between supply drops
  crateRepair: 30, // armour a repair crate gives back
  crateReach: 24, // a blast this much beyond its radius still claims a crate
  heavyRadius: 54, // a heavy shell's crater
  heavyDamage: 42,
  maxFlight: 8,
};

// A tank's size in world units: the art is drawn 1.2× its 64-unit base.
const TANK = { w: 77, half: 31, hull: 17, center: 24, radius: 28, pivot: 36, barrel: 38, k: 1.2 };

// The ten levels: each its own look and terrain, and each harder than the one before (owner,
// 2026-11-10: "the terrain should change on level 2 ... significantly harder. And keep getting harder
// over ... 10 levels"). Per level: wind (max), the tide's speed (rises until an undug hull is under),
// the CPU's armour, how much of the arc the preview shows, and the terrain: bumps (ridges h > 0,
// channels h < 0), slope (> 0: the right side lower), and girders ('walls', 'towers', 'bridge').
const LOOK = {
  beach: { ground: ['#f2d9a6', '#dcb67d', '#a97d4b'], top: '#fbecc8', speck: '#b88a55', scorch: 'rgba(110,70,30,0.45)', debris: '#d9b47a' },
  rock: { ground: ['#d9834c', '#a9532f', '#6a3220'], top: '#a39250', speck: '#55291a', scorch: 'rgba(50,20,10,0.5)', debris: '#b9693c' },
  stone: { ground: ['#868b98', '#5e6370', '#363a45'], top: '#a9afba', speck: '#24272e', scorch: 'rgba(20,20,26,0.5)', debris: '#7d8290' },
  dune: { ground: ['#efcf86', '#d3a85a', '#9b733a'], top: '#fae3a8', speck: '#a37a3d', scorch: 'rgba(90,60,20,0.45)', debris: '#e2bd6e' },
  red: { ground: ['#c9573d', '#93382a', '#55201a'], top: '#d98a5a', speck: '#3d140f', scorch: 'rgba(40,10,6,0.55)', debris: '#b0503a' },
  moss: { ground: ['#8e9a78', '#66705a', '#3c4436'], top: '#aab890', speck: '#2a3024', scorch: 'rgba(20,24,16,0.5)', debris: '#7c8868' },
  slate: { ground: ['#6f7884', '#4c535e', '#2b3038'], top: '#8e98a5', speck: '#1b1f25', scorch: 'rgba(10,12,16,0.55)', debris: '#5f6874' },
  ash: { ground: ['#4a4644', '#302d2c', '#1a1817'], top: '#6b6460', speck: '#ff7a3a', scorch: 'rgba(0,0,0,0.55)', debris: '#3d3937' },
  ice: { ground: ['#eef5fb', '#c9dceb', '#93aec4'], top: '#ffffff', speck: '#7f9bb3', scorch: 'rgba(40,60,80,0.4)', debris: '#dbe8f2' },
  night: { ground: ['#4b4f6a', '#33364c', '#1c1e2c'], top: '#6d7294', speck: '#14151f', scorch: 'rgba(0,0,0,0.55)', debris: '#454962' },
};
const level = (o) => ({ auger: true, girders: null, mirror: true, slope: 0, bumps: [], base: 0.66, rough: 0.9, ...LOOK[o.look], ...o });
const FIELDS = [
  level({ name: 'Morning Beach', look: 'beach', sky: ['#7cc7ee', '#bfe7f7', '#fff1d6'], far: '#b7ddd6', sun: { x: 0.78, y: 0.22, r: 38, color: '#fff6c4' }, water: 'rgba(52,160,200,0.78)', waterDeep: '#2a7ea8', foam: '#effcff', enemy: 'navy', wind: 0, auger: false, preview: 0.45, rough: 1, tideRises: 6, cpuArmour: 100 }),
  // Level 2: the shore changes: a tall ridge stands between the tanks, so every shot is a lob.
  level({ name: 'Windy Point', look: 'rock', sky: ['#4a3a78', '#d8705a', '#ffc98a'], far: '#7a4760', sun: { x: 0.2, y: 0.5, r: 46, color: '#ffdd9a' }, water: 'rgba(58,104,146,0.8)', waterDeep: '#294a6c', foam: '#ffdcc0', enemy: 'desert', wind: 60, preview: 0.36, base: 0.68, rough: 0.7, mirror: false, slope: 0.36, bumps: [{ x: 0.47, h: 0.3, w: 0.07 }], tideRises: 6, cpuArmour: 100 }),
  level({ name: 'Breakwater', look: 'stone', sky: ['#121c3a', '#3a4a7c', '#d08a72'], far: '#25304f', sun: { x: 0.7, y: 0.18, r: 22, color: '#f3f0dc' }, water: 'rgba(28,66,98,0.82)', waterDeep: '#132c45', foam: '#c8dbee', enemy: 'grey', wind: 75, preview: 0.33, girders: 'walls', bumps: [{ x: 0.5, h: 0.14, w: 0.09 }], tideRises: 6, cpuArmour: 100 }),
  level({ name: 'Dune Sea', look: 'dune', sky: ['#c99a4e', '#f0c98a', '#fbe7c4'], far: '#d6a96a', sun: { x: 0.5, y: 0.2, r: 54, color: '#fff3d0' }, water: 'rgba(70,150,170,0.78)', waterDeep: '#2f6f82', foam: '#fff4dc', enemy: 'desert', wind: 90, preview: 0.31, rough: 1.2, bumps: [{ x: 0.37, h: 0.24, w: 0.06 }, { x: 0.63, h: 0.24, w: 0.06 }], tideRises: 6, cpuArmour: 110 }),
  // The enemy holds a high plateau across a deep valley.
  level({ name: 'Red Cliffs', look: 'red', sky: ['#5a1f2e', '#b8494a', '#f2a46c'], far: '#7d3038', sun: { x: 0.85, y: 0.3, r: 34, color: '#ffd1a0' }, water: 'rgba(60,90,120,0.8)', waterDeep: '#253b52', foam: '#ffd8c4', enemy: 'grey', wind: 100, preview: 0.3, mirror: false, slope: -0.18, bumps: [{ x: 0.5, h: -0.2, w: 0.08 }], tideRises: 6, cpuArmour: 110 }),
  // The sea cuts the shore in two; a steel bridge spans the channel and catches low shots.
  level({ name: 'Fog Harbour', look: 'moss', sky: ['#6f8a86', '#a9bdb5', '#dfe7df'], far: '#8ea59d', sun: { x: 0.3, y: 0.25, r: 30, color: '#f4f6ee' }, water: 'rgba(50,96,96,0.82)', waterDeep: '#1f4344', foam: '#e6f0ea', enemy: 'navy', wind: 105, preview: 0.28, girders: 'bridge', bumps: [{ x: 0.5, h: -0.6, w: 0.05 }], tideRises: 5, cpuArmour: 120 }),
  level({ name: 'Storm Coast', look: 'slate', sky: ['#1f2730', '#46525e', '#7c8794'], far: '#353f4a', sun: { x: 0.6, y: 0.2, r: 18, color: '#c9d2dc' }, water: 'rgba(36,60,78,0.85)', waterDeep: '#152635', foam: '#b9c8d4', enemy: 'grey', wind: 130, preview: 0.27, rough: 1.1, bumps: [{ x: 0.5, h: 0.32, w: 0.07 }], tideRises: 5, cpuArmour: 130 }),
  // Steel towers crown the ridge.
  level({ name: 'Black Sands', look: 'ash', sky: ['#5a1712', '#8a2e1c', '#e0723a'], far: '#4a1c18', sun: { x: 0.25, y: 0.3, r: 40, color: '#ffb066' }, water: 'rgba(40,52,66,0.85)', waterDeep: '#141c26', foam: '#e8b89a', enemy: 'navy', wind: 135, preview: 0.25, girders: 'towers', bumps: [{ x: 0.5, h: 0.28, w: 0.08 }], tideRises: 5, cpuArmour: 140 }),
  level({ name: 'Ice Shelf', look: 'ice', sky: ['#8fb4d8', '#cfe2f2', '#f4f9fd'], far: '#b4cde2', sun: { x: 0.8, y: 0.18, r: 30, color: '#ffffff' }, water: 'rgba(40,110,150,0.8)', waterDeep: '#1d4f72', foam: '#ffffff', enemy: 'grey', wind: 140, preview: 0.24, mirror: false, slope: -0.14, bumps: [{ x: 0.47, h: 0.26, w: 0.06 }], tideRises: 5, cpuArmour: 140 }),
  // The last: the highest ridge, towers on it and walls before each tank, the strongest wind.
  level({ name: 'Night Siege', look: 'night', sky: ['#05060f', '#151a35', '#3a3060'], far: '#1b1f38', sun: { x: 0.15, y: 0.15, r: 20, color: '#e8e6ff' }, water: 'rgba(20,30,60,0.88)', waterDeep: '#0a1024', foam: '#9aa6d8', enemy: 'grey', wind: 150, preview: 0.22, girders: 'walls+towers', bumps: [{ x: 0.5, h: 0.3, w: 0.07 }], tideRises: 5, cpuArmour: 140 }),
];

const PX = 240; // where the player's tank starts
const CX = W - 240;

// --- Page, sound, storage -----------------------------------------------------------------------

const $ = (s) => document.querySelector(s);
const ui = {
  canvas: $('#field'),
  safe: $('[data-safe]'),
  mute: $('[data-mute]'),
  hudTop: $('[data-hud-top]'),
  hudBottom: $('[data-hud-bottom]'),
  fieldName: $('[data-field-name]'),
  wind: $('[data-wind]'),
  windArrow: $('[data-wind] svg'),
  windBars: [...document.querySelectorAll('[data-wind-bars] i')],
  tide: $('[data-tide]'),
  pips: [...document.querySelectorAll('[data-pips] i')],
  shellBtn: $('[data-weapon="shell"]'),
  shellLabel: $('[data-weapon="shell"] span'),
  augerBtn: $('[data-weapon="auger"]'),
  charges: $('[data-charges]'),
  start: $('[data-screen="start"]'),
  prev: $('[data-prev]'),
  next: $('[data-next]'),
  pickNum: $('[data-pick-num]'),
  pickName: $('[data-pick-name]'),
  pickStars: [...document.querySelectorAll('[data-pick-stars] i')],
  play: $('[data-play]'),
  result: $('[data-screen="result"]'),
  resultTitle: $('[data-result-title]'),
  resultStars: [...document.querySelectorAll('[data-result-stars] i')],
  resultStarsBox: $('[data-result-stars]'),
  resultDetail: $('[data-result-detail]'),
  resultNext: $('[data-result-next]'),
  resultAgain: $('[data-result-again]'),
  resultNew: $('[data-result-new]'),
  banner: $('[data-banner]'),
  paused: $('[data-paused]'),
  rotate: $('[data-rotate]'),
};
const ctx = ui.canvas.getContext('2d');

const { sound } = mountShell({
  sounds: {
    fire: 'sounds/fire.mp3',
    boom: 'sounds/boom.mp3',
    drill: 'sounds/drill.mp3',
    thud: 'sounds/thud.mp3',
    tide: 'sounds/tide.mp3',
    sink: 'sounds/sink.mp3',
    hit: 'sounds/hit.mp3',
    clank: 'sounds/clank.mp3',
    click: 'sounds/click.mp3',
    win: 'sounds/win.mp3',
    lose: 'sounds/lose.mp3',
    whoosh: 'sounds/whoosh.mp3',
    music: 'sounds/music.mp3',
  },
});

// Sounds play in a battle only: the demo behind the start card stays quiet.
function sfx(name, opts) {
  if (game.mode !== 'demo') sound.play(name, opts);
}

const STORE = 'crumble';
function loadStore() {
  const d = { reached: 1, stars: FIELDS.map(() => 0), assist: TUNING.assistStart, taught: false };
  try {
    const s = JSON.parse(localStorage.getItem(STORE) || '{}');
    if (Number.isInteger(s.reached)) d.reached = Math.max(1, Math.min(FIELDS.length, s.reached));
    if (Array.isArray(s.stars)) d.stars = FIELDS.map((_, i) => Math.max(0, Math.min(3, s.stars[i] | 0)));
    if (typeof s.assist === 'number') d.assist = Math.max(0, Math.min(1, s.assist));
    d.taught = !!s.taught;
  } catch (e) {
    // Blocked or broken storage: start fresh; nothing is lost that matters.
  }
  return d;
}
const store = loadStore();
function saveStore() {
  try {
    localStorage.setItem(STORE, JSON.stringify(store));
  } catch (e) {}
}

// --- Images -------------------------------------------------------------------------------------

function img(src) {
  const i = new Image();
  i.src = src;
  return i;
}
const IMG = {
  body: { green: img('img/body-green.png'), navy: img('img/body-navy.png'), desert: img('img/body-desert.png'), grey: img('img/body-grey.png') },
  tracks: img('img/tracks.png'),
  turret: img('img/turret.png'),
  shell: img('img/shell.png'),
  auger: img('img/auger.png'),
  girder: img('img/girder.png'),
  crate: { repair: img('img/crate-repair.png'), heavy: img('img/crate-ammo.png') },
};
const ready = (i) => i.complete && i.naturalWidth > 0;
const allImages = [...Object.values(IMG.body), IMG.tracks, IMG.turret, IMG.shell, IMG.auger, IMG.girder, IMG.crate.repair, IMG.crate.heavy];
const imagesLoaded = Promise.all(allImages.map((i) => (i.decode ? i.decode().catch(() => {}) : Promise.resolve())));

const fx = createExplosions({ art: loadExplosionArt(), max: 400 });

// --- State --------------------------------------------------------------------------------------

const PLAYER = 0;
const CPU = 1;

const game = {
  mode: 'demo', // demo (behind the start card) | battle | result
  phase: 'idle', // aim | cpu | flight | settle | tide | sinking | idle
  field: 0, // index into FIELDS
  seed: 1,
  hill: [0, 0, 0], // the "New hill" count per battlefield
  attempt: [0, 0, 0],
  starter: PLAYER,
  turn: PLAYER,
  shots: 0,
  wind: 0,
  waterY: H - 30,
  waterTarget: H - 30,
  waterStart: H - 30,
  notch: 30,
  waterMin: 0, // the tide stops here (smallest y the water reaches)
  weapon: 'shell',
  projectile: null,
  timer: 0,
  cpuPlan: null,
  texts: [],
  lastTrace: null, // the player's previous shot
  outcome: null,
  time: 0,
  demoTimer: 1.2,
  crate: null, // a supply drop: { x, y, vy, kind: 'repair' | 'heavy', landed }
  puffs: [], // smoke behind a shell in flight
  slow: 0, // seconds of slow motion left (a direct hit)
  damage: true,
};
let terrain = null;
let heights = null;
let tanks = [];
let cpuRandom = rng(1);
let paused = false;
let manual = false; // tests drive the simulation with step()
const frameTimes = [];
const carveTimes = [];

function newTank(side, x, color) {
  return { side, x, y: 0, tilt: 0, vy: 0, falling: false, fallFrom: 0, armour: 100, maxArmour: 100, aim: side === PLAYER ? 0.85 : Math.PI - 0.85, power: 0.6, augers: TUNING.augerCharges, sunk: 0, out: false, color, hitFlash: 0, swing: null, recoil: 0, heavy: false };
}

const field = () => FIELDS[game.field];
const hullY = (t) => t.y - TANK.hull;
const centerOf = (t) => ({ x: t.x, y: t.y - TANK.center });

// --- Building a battlefield -----------------------------------------------------------------------

function paintGround(f) {
  const c = terrain.ctx;
  c.save();
  c.clearRect(0, 0, W, H);
  c.beginPath();
  c.moveTo(0, H + 10);
  for (let x = 0; x < W; x += 2) c.lineTo(x, heights[x]);
  c.lineTo(W, heights[W - 1]);
  c.lineTo(W, H + 10);
  c.closePath();
  const g = c.createLinearGradient(0, H * 0.25, 0, H);
  g.addColorStop(0, f.ground[0]);
  g.addColorStop(0.55, f.ground[1]);
  g.addColorStop(1, f.ground[2]);
  c.fillStyle = g;
  c.fill();
  c.globalCompositeOperation = 'source-atop';
  // Strata that follow the surface.
  c.lineWidth = 3;
  for (const [off, a] of [
    [46, 0.12],
    [110, 0.1],
    [190, 0.08],
  ]) {
    c.strokeStyle = f.speck;
    c.globalAlpha = a;
    c.beginPath();
    for (let x = 0; x < W; x += 6) c.lineTo(x, heights[x] + off + Math.sin(x * 0.02) * 6);
    c.stroke();
  }
  // Speckles: pebbles and grains.
  const r = rng(game.seed * 7 + 3);
  for (let i = 0; i < 1100; i++) {
    const x = r() * W;
    const top = heights[x | 0];
    const y = top + 6 + r() * (H - top);
    c.globalAlpha = 0.12 + r() * 0.22;
    c.fillStyle = r() < 0.7 ? f.speck : '#ffffff';
    c.beginPath();
    c.ellipse(x, y, 1 + r() * 2.6, 0.8 + r() * 1.6, r() * 3, 0, Math.PI * 2);
    c.fill();
  }
  // The top: a light band of dry sand, grass or worn stone along the surface.
  c.globalAlpha = 1;
  c.strokeStyle = f.top;
  c.lineWidth = 10;
  c.lineJoin = 'round';
  c.beginPath();
  for (let x = 0; x < W; x += 3) c.lineTo(x, heights[x] + 3);
  c.stroke();
  c.globalAlpha = 0.25;
  c.strokeStyle = f.speck;
  c.lineWidth = 2;
  c.beginPath();
  for (let x = 0; x < W; x += 3) c.lineTo(x, heights[x] + 9);
  c.stroke();
  c.restore();
}

// Girders are square tiles laid along the girder's long side (a wall stands, a bridge lies).
function paintGirder(c, g) {
  c.save();
  c.globalCompositeOperation = 'source-over';
  const along = g.w >= g.h;
  const tile = along ? g.h : g.w;
  const len = along ? g.w : g.h;
  const im = IMG.girder;
  for (let d = 0; d < len - 0.5; d += tile) {
    const part = Math.min(tile, len - d);
    const x = along ? g.x + d : g.x;
    const y = along ? g.y : g.y + d;
    const w = along ? part : g.w;
    const h = along ? g.h : part;
    if (ready(im)) {
      const sw = along ? (im.naturalWidth * part) / tile : im.naturalWidth;
      const sh = along ? im.naturalHeight : (im.naturalHeight * part) / tile;
      c.drawImage(im, 0, 0, sw, sh, x, y, w, h);
    } else {
      c.fillStyle = '#9aa3ad';
      c.fillRect(x, y, w, h);
    }
  }
  c.restore();
}

function setupBattle(index, { seed, starter = PLAYER, demo = false } = {}) {
  game.field = index;
  const f = field();
  game.seed = seed ?? 1000 * (index + 1) + game.hill[index];
  const scale = Math.max(1, Math.min(2, view.s * dpr));
  terrain = createTerrain(W, H, { scale });
  heights = makeHeights(W, H, { seed: game.seed, base: f.base, rough: f.rough, mirror: f.mirror, slope: f.slope, bumps: f.bumps, pads: [PX, CX] });
  terrain.fillFromHeights(heights);
  paintGround(f);
  terrain.steelPainter = paintGirder;
  const girders = f.girders || '';
  if (girders.includes('walls')) {
    for (const gx of [PX + 150, CX - 150]) {
      const top = Math.min(heights[gx - 22], heights[gx + 22]);
      terrain.addSteel({ x: gx - 20, y: top - 104, w: 40, h: 124 });
    }
  }
  if (girders.includes('towers')) {
    for (const gx of [W / 2 - 70, W / 2 + 70]) {
      const top = Math.min(heights[gx - 22], heights[gx + 22]);
      terrain.addSteel({ x: gx - 20, y: top - 125, w: 40, h: 145 });
    }
  }
  if (girders.includes('bridge')) {
    // Across the channel, level with the shore either side of it.
    const y = Math.min(heights[Math.round(W * 0.38)], heights[Math.round(W * 0.62)]) - 4;
    terrain.addSteel({ x: W * 0.39, y, w: W * 0.22, h: 24 });
  }
  tanks = [newTank(PLAYER, PX, 'green'), newTank(CPU, CX, f.enemy)];
  tanks[CPU].armour = tanks[CPU].maxArmour = f.cpuArmour;
  for (const t of tanks) {
    t.y = supportY(t).y;
    t.tilt = supportY(t).tilt;
  }
  // The tide: notches sized so an undug tank goes under after about the level's tideRises rises.
  const hulls = tanks.map(hullY);
  game.waterStart = H - 26;
  const avg = (hulls[0] + hulls[1]) / 2;
  game.notch = Math.max(12, (game.waterStart - avg) / f.tideRises);
  if (index === 0) {
    // Battlefield 1: the tide stops at least 2 notches below both hulls.
    game.waterMin = Math.max(...hulls) + 2 * game.notch;
  } else {
    game.waterMin = Math.min(...hulls) - game.notch;
  }
  game.waterY = game.waterTarget = game.waterStart;
  game.shots = 0;
  game.wind = 0;
  game.projectile = null;
  game.crate = null;
  game.puffs = [];
  game.slow = 0;
  birds.length = 0;
  for (let i = 0; i < 3; i++) birds.push({ x: Math.random() * W, y: 60 + Math.random() * 120, vx: (Math.random() < 0.5 ? -1 : 1) * (30 + Math.random() * 25), flap: Math.random() * 6, scared: 0 });
  game.texts = [];
  game.lastTrace = null;
  game.outcome = null;
  game.weapon = 'shell';
  game.starter = starter;
  game.turn = starter;
  game.damage = !demo;
  cpuRandom = rng(game.seed * 31 + 7 + game.attempt[index]);
  fx.clear();
  sky.cache = null;
}

// --- Physics --------------------------------------------------------------------------------------

// Where a tank stands: on the ground under its two track ends, the higher of the two, tilted to match.
function supportY(t) {
  const from = t.y ? t.y - 6 : 0;
  const l = terrain.surfaceBelow(t.x - TANK.half, from);
  const r = terrain.surfaceBelow(t.x + TANK.half, from);
  const top = Math.min(l, r);
  const lc = Math.min(l, top + 26);
  const rc = Math.min(r, top + 26);
  return { y: Math.min(H + 40, (lc + rc) / 2 - Math.abs(lc - rc) * 0.25), tilt: Math.atan2(rc - lc, TANK.half * 2) };
}

function settleTank(t, dt) {
  if (t.out) return;
  const s = supportY(t);
  if (s.y > t.y + 0.5) {
    if (!t.falling) {
      t.falling = true;
      t.fallFrom = t.y;
      t.vy = 0;
    }
    t.vy += TUNING.gravity * 1.4 * dt;
    t.y = Math.min(s.y, t.y + t.vy * dt);
    t.tilt += (s.tilt - t.tilt) * Math.min(1, dt * 10);
    if (t.y >= s.y - 0.01) land(t);
  } else {
    t.y = s.y;
    t.tilt += (s.tilt - t.tilt) * Math.min(1, dt * 12);
    if (t.falling) land(t);
  }
}

function land(t) {
  const fell = t.y - t.fallFrom;
  t.falling = false;
  t.vy = 0;
  if (fell > 8) sfx('thud', { gain: Math.min(1, fell / 60), rate: 0.9 + Math.random() * 0.2 });
  // Riding down an Auger's shaft doesn't hurt: the Auger does no damage.
  if (fell > TUNING.fallSafe && game.damage && !t.riding) hurt(t, (fell - TUNING.fallSafe) * TUNING.fallDamage);
  t.riding = false;
}

function hurt(t, amount) {
  const n = Math.round(amount);
  if (n <= 0 || t.out) return 0;
  t.armour = Math.max(0, t.armour - n);
  t.hitFlash = 0.5;
  game.texts.push({ x: t.x, y: t.y - 72, text: `−${n}`, age: 0, color: t.side === PLAYER ? '#ff6b5a' : '#ffffff' });
  return n;
}

function launch(t, angle, power) {
  const dir = { x: Math.cos(angle), y: -Math.sin(angle) };
  const px = t.x + Math.sin(t.tilt) * (TANK.pivot - 2);
  const py = t.y - Math.cos(t.tilt) * (TANK.pivot - 2);
  const v = Math.max(0.05, Math.min(1, power)) * TUNING.speed;
  return { x: px + dir.x * TANK.barrel, y: py + dir.y * TANK.barrel, vx: dir.x * v, vy: dir.y * v };
}

// One fixed step of a shell's flight. Returns what it ran into, if anything:
//   null (still flying), {kind: 'out'|'water'|'steel'|'ground'|'tank', x, y, tank}.
function stepShell(p, wind, ownerSide) {
  p.vx += wind * SIM;
  p.vy += TUNING.gravity * SIM;
  p.x += p.vx * SIM;
  p.y += p.vy * SIM;
  p.age += SIM;
  if (p.x < -TUNING.sideMargin || p.x > W + TUNING.sideMargin || p.age > TUNING.maxFlight || p.y > H + 60) return { kind: 'out', x: p.x, y: p.y };
  if (p.y >= game.waterY && p.y < H + 60 && !terrain.solid(p.x, p.y)) return { kind: 'water', x: p.x, y: game.waterY };
  for (const t of tanks) {
    if (t.out) continue;
    if (t.side === ownerSide && p.age < 0.25) continue;
    const c = centerOf(t);
    const dx = p.x - c.x;
    const dy = p.y - c.y;
    if (dx * dx + dy * dy < TANK.radius * TANK.radius) return { kind: 'tank', x: p.x, y: p.y, tank: t };
  }
  const cr = game.crate;
  if (cr && Math.abs(p.x - cr.x) < 24 && p.y > cr.y - 46 && p.y < cr.y + 2) return { kind: 'crate', x: p.x, y: p.y };
  const m = terrain.at(p.x, p.y);
  if (m === STEEL) return { kind: 'steel', x: p.x, y: p.y };
  if (m) return { kind: 'ground', x: p.x, y: p.y };
  return null;
}

// Where a shot would land (the CPU's planning, and the tests), with no side effects.
function simulate(t, angle, power, wind = game.wind) {
  const p = { ...launch(t, angle, power), age: 0 };
  for (let i = 0; i < 2000; i++) {
    const hit = stepShell(p, wind, t.side);
    if (hit) return hit;
  }
  return { kind: 'out', x: p.x, y: p.y };
}

function fire(side, weapon, angle, power) {
  const t = tanks[side];
  t.aim = angle;
  t.power = power;
  const p = { ...launch(t, angle, power), age: 0, weapon, owner: side, trace: [], mode: 'fly', drillTo: 0, lastCarve: 0, heavy: false };
  if (weapon === 'auger') t.augers = Math.max(0, t.augers - 1);
  if (weapon === 'shell' && t.heavy) {
    p.heavy = true;
    t.heavy = false;
  }
  t.recoil = 1;
  t.shotsFired = (t.shotsFired || 0) + 1;
  game.projectile = p;
  game.phase = 'flight';
  game.shots++;
  sfx('fire', { rate: 0.95 + Math.random() * 0.1 });
  setTimeout(() => sfx('whoosh', { gain: 0.35, rate: 0.9 + Math.random() * 0.2 }), 80);
  fx.burst(p.x, p.y, { radius: 9, wind: game.wind, debris: null, power: 0.08 });
  updateHud();
}

function detonate(x, y, { direct = null, radius = TUNING.shellRadius, damage = TUNING.shellDamage, carve = true, owner = null } = {}) {
  const t0 = performance.now();
  if (carve) terrain.carve(x, y, radius, { scorch: field().scorch });
  for (const t of tanks) settleTank(t, 0);
  carveTimes.push(performance.now() - t0);
  if (carveTimes.length > 300) carveTimes.shift();
  fx.burst(x, y, { radius, wind: game.wind, debris: field().debris });
  sfx('boom', { rate: 1.15 - radius / 120 + Math.random() * 0.1, gain: Math.min(1, radius / 36) });
  scareBirds(x, y);
  if (owner !== null) claimCrate(x, y, radius, owner);
  if (!game.damage) return;
  if (direct) {
    game.slow = 0.45;
    game.texts.push({ x: direct.x, y: direct.y - 110, text: 'Direct hit!', age: 0, color: '#ffd23f', big: true });
  }
  let any = false;
  for (const t of tanks) {
    if (t.out) continue;
    const c = centerOf(t);
    const d = Math.hypot(c.x - x, c.y - y);
    let dmg = damage * Math.max(0, 1 - d / (radius + TUNING.reach));
    if (direct === t) dmg += TUNING.directBonus;
    if (hurt(t, dmg)) any = true;
  }
  if (any) sfx('hit', { gain: 0.7 });
}

function augerShaft() {
  return { r: (TANK.w * TUNING.augerWidth) / 2, depth: game.notch * TUNING.augerNotches };
}

function updateProjectile() {
  const p = game.projectile;
  if (!p) return;
  if (p.mode === 'drill') {
    const { r } = augerShaft();
    for (const t of tanks) if (Math.abs(t.x - p.x) < r + TANK.half) t.riding = true;
    p.y += TUNING.augerSpeed * SIM;
    p.age += SIM;
    if (p.y - p.lastCarve >= 7 || p.y >= p.drillTo) {
      p.lastCarve = p.y;
      terrain.carve(p.x, p.y, r, { scorch: field().scorch });
      if (Math.random() < 0.25) fx.burst(p.x + (Math.random() - 0.5) * r, p.y - r * 0.6, { radius: 10, wind: game.wind, debris: field().debris, power: 0.02 });
    }
    if (p.y >= p.drillTo || terrain.at(p.x, p.y + r) === STEEL) {
      fx.burst(p.x, p.y, { radius: 22, wind: game.wind, debris: field().debris, power: 0.3 });
      claimCrate(p.x, p.y, r, p.owner);
      sfx('boom', { rate: 1.3, gain: 0.6 });
      endShot();
    }
    return;
  }
  if (p.trace.length === 0 || p.age - p.trace[p.trace.length - 1][2] > 0.03) {
    p.trace.push([p.x, p.y, p.age]);
    if (game.mode === 'battle' && game.puffs.length < 90) game.puffs.push({ x: p.x, y: p.y, age: 0 });
  }
  const hit = stepShell(p, game.wind, p.owner);
  if (!hit) return;
  p.trace.push([hit.x, hit.y, p.age]);
  if (hit.kind === 'out') return endShot();
  if (hit.kind === 'water') {
    fx.burst(hit.x, game.waterY, { radius: 14, wind: game.wind, debris: field().foam, power: 0.05 });
    sfx('tide', { gain: 0.5, rate: 1.4 });
    return endShot();
  }
  if (hit.kind === 'steel') {
    sfx('clank');
    detonate(hit.x, hit.y, { radius: p.weapon === 'auger' ? 18 : TUNING.shellRadius, damage: p.weapon === 'auger' ? 0 : TUNING.shellDamage, owner: p.owner });
    return endShot();
  }
  if (hit.kind === 'crate') {
    detonate(hit.x, hit.y, { radius: p.weapon === 'auger' ? 18 : p.heavy ? TUNING.heavyRadius : TUNING.shellRadius, damage: p.weapon === 'auger' ? 0 : p.heavy ? TUNING.heavyDamage : TUNING.shellDamage, owner: p.owner });
    return endShot();
  }
  if (p.weapon === 'auger') {
    // Drill straight down from where it touches the ground (or the tank it landed on).
    const { depth } = augerShaft();
    const y0 = hit.kind === 'tank' ? hit.tank.y : hit.y;
    p.mode = 'drill';
    p.x = hit.kind === 'tank' ? hit.tank.x : hit.x;
    p.y = y0 - 8;
    p.drillTo = y0 + depth;
    p.lastCarve = -999;
    sfx('drill', { gain: 0.8 });
    return;
  }
  detonate(hit.x, hit.y, { direct: hit.kind === 'tank' ? hit.tank : null, owner: p.owner, radius: p.heavy ? TUNING.heavyRadius : TUNING.shellRadius, damage: p.heavy ? TUNING.heavyDamage : TUNING.shellDamage });
  endShot();
}

function endShot() {
  const p = game.projectile;
  if (p && p.owner === PLAYER) game.lastTrace = p.trace.map(([x, y]) => [x, y]);
  game.projectile = null;
  game.phase = 'settle';
  game.timer = 0;
}

// --- Supply drops ---------------------------------------------------------------------------------

// Every few shots a crate parachutes down between the tanks. A blast near it claims it for whoever
// fired: a repair crate gives armour back, an ammo crate makes the next Shell a heavy one. Hit the
// tank or grab the crate: a new choice every few turns, and the CPU goes for them too.
function dropCrate() {
  const tanksAt = tanks.map((t) => t.x);
  const x = Math.round(W * 0.32 + cpuRandom() * W * 0.36);
  const hurtMost = Math.min(...tanks.map((t) => t.armour / t.maxArmour));
  const kind = hurtMost < 0.75 && cpuRandom() < 0.6 ? 'repair' : 'heavy';
  game.crate = { x: Math.max(tanksAt[0] + 120, Math.min(tanksAt[1] - 120, x)), y: -30, vy: 0, kind, landed: false };
  sfx('whoosh', { gain: 0.5, rate: 0.7 });
}

function updateCrate(dt) {
  const c = game.crate;
  if (!c) return;
  // The sea takes a crate it reaches, falling or landed (the tide comes up over it).
  if (c.y - 10 > game.waterY) {
    fx.burst(c.x, game.waterY, { radius: 12, wind: game.wind, debris: field().foam, power: 0.02 });
    game.crate = null;
    return;
  }
  const below = terrain.solid(c.x, c.y + 1) || terrain.solid(c.x - 16, c.y + 1) || terrain.solid(c.x + 16, c.y + 1);
  if (below) {
    if (!c.landed) sfx('thud', { gain: 0.5 });
    c.landed = true;
    c.vy = 0;
    // Settle onto the ground (it may have been dug out from under it).
    while (terrain.solid(c.x, c.y) && c.y > 0) c.y -= 1;
  } else if (!c.landed) {
    c.vy = 70; // under its parachute
    c.y += c.vy * dt;
    c.x = Math.max(60, Math.min(W - 60, c.x + game.wind * 0.25 * dt));
  } else {
    c.vy += TUNING.gravity * dt;
    c.y += c.vy * dt;
  }
}

function claimCrate(x, y, radius, owner) {
  const c = game.crate;
  if (!c || owner === null || owner === undefined) return;
  if (Math.hypot(c.x - x, c.y - 22 - y) > radius + TUNING.crateReach) return;
  const t = tanks[owner];
  game.crate = null;
  sfx('clank', { gain: 0.9, rate: 1.3 });
  if (c.kind === 'repair') {
    const n = Math.min(TUNING.crateRepair, t.maxArmour - t.armour);
    t.armour += n;
    game.texts.push({ x: t.x, y: t.y - 72, text: `+${n}`, age: 0, color: '#7dffa8' });
  } else {
    t.heavy = true;
    game.texts.push({ x: t.x, y: t.y - 72, text: 'Heavy shell', age: 0, color: '#ffd23f' });
  }
  updateHud();
}

// --- Life: seagulls, wind streaks, smoke ------------------------------------------------------------

const birds = [];
const streaks = [];
for (let i = 0; i < 26; i++) streaks.push({ x: Math.random() * W, y: 30 + Math.random() * 300, l: 0.5 + Math.random() });

function scareBirds(x, y) {
  for (const b of birds) if (Math.hypot(b.x - x, b.y - y) < 420) b.scared = 1.6;
}

function updateLife(dt) {
  for (const b of birds) {
    const fast = b.scared > 0 ? 2.6 : 1;
    b.scared = Math.max(0, b.scared - dt);
    b.x += b.vx * fast * dt + game.wind * 0.2 * dt;
    b.y += (b.scared > 0 ? -60 : Math.sin(game.time * 0.7 + b.flap) * 6) * dt;
    b.flap += dt * (b.scared > 0 ? 18 : 7);
    if (b.x < -60) b.x = W + 50;
    if (b.x > W + 60) b.x = -50;
    if (b.y < -40) {
      b.y = 80 + Math.random() * 100;
      b.x = b.vx > 0 ? -50 : W + 50;
    }
  }
  for (const s of streaks) {
    s.x += (game.wind * 2.2 + 8) * dt;
    if (s.x > W + 80) s.x = -80;
    if (s.x < -80) s.x = W + 80;
  }
  for (const p of game.puffs) {
    p.age += dt;
    p.x += game.wind * 0.4 * dt;
    p.y -= 8 * dt;
  }
  game.puffs = game.puffs.filter((p) => p.age < 0.9);
  for (const t of tanks) t.recoil = Math.max(0, t.recoil - dt * 5);
  updateCrate(dt);
}

// --- The CPU ------------------------------------------------------------------------------------

function gauss(r) {
  let u = 0;
  let v = 0;
  while (u === 0) u = r();
  while (v === 0) v = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// Plan a shot for `shooter` at `target`: score every candidate by expected damage plus k × the
// drop it would cause, take the best, then miss by the battlefield's spread (wider with the assist).
// plan() runs it to the end at once (the tests, the demo); the CPU's turn runs it a few milliseconds a
// frame (planSteps), so a phone's frame rate holds while it thinks.
function plan(shooter, target, opts = {}) {
  const it = planSteps(shooter, target, opts);
  let r = it.next();
  while (!r.done) r = it.next();
  return r.value;
}

function* planSteps(shooter, target, { assist = store.assist, random = cpuRandom, weapon: forced, spreadAngle, spreadPower } = {}) {
  const f = field();
  const fi = game.field;
  const k = fi === 0 ? 0 : TUNING.digWeight;
  let weapon = forced || 'shell';
  if (!forced && f.auger && shooter.augers > 0 && game.mode === 'battle' && hullY(target) > game.waterY - game.notch) weapon = 'auger';
  const { depth } = augerShaft();
  const facing = target.x < shooter.x ? -1 : 1;

  // What a landing is worth with this weapon: expected damage plus k × the drop it causes, a crate
  // it claims, and minus any harm to the shooter itself.
  const scoreHit = (hit, weapon) => {
    if (hit.kind === 'out' || hit.kind === 'water') return 0;
    const dist = Math.abs(hit.x - target.x);
    const c = centerOf(target);
    let score = 0;
    if (weapon === 'shell') {
      const d = Math.hypot(hit.x - c.x, hit.y - c.y);
      score = TUNING.shellDamage * Math.max(0, 1 - d / (TUNING.shellRadius + TUNING.reach));
      if (hit.kind === 'tank' && hit.tank === target) score += TUNING.directBonus;
      if (hit.kind === 'ground' && Math.abs(hit.y - target.y) < 50) score += k * Math.max(0, TUNING.shellRadius - Math.max(0, dist - TANK.half));
      const self = centerOf(shooter);
      const ds = Math.hypot(hit.x - self.x, hit.y - self.y);
      score -= 2 * TUNING.shellDamage * Math.max(0, 1 - ds / (TUNING.shellRadius + TUNING.reach));
    } else {
      if (hit.kind !== 'steel' && Math.abs(hit.y - target.y) < 60) score = dist < 28 ? depth : dist < 44 ? depth * 0.5 : 0;
      if (Math.abs(hit.x - shooter.x) < 50) score = -1;
    }
    if (game.crate) {
      const cr = game.crate;
      const dc = Math.hypot(hit.x - cr.x, hit.y - (cr.y - 22));
      if (dc < TUNING.shellRadius + TUNING.crateReach) score += cr.kind === 'repair' ? (shooter.maxArmour - shooter.armour >= 20 ? 18 : 3) : 12;
    }
    return score;
  };

  const search = function* (weapon) {
    const found = [];
    let bestLob = null;
    for (let a = 0.12; a <= 1.5; a += 0.02) {
      const angle = facing > 0 ? a : Math.PI - a;
      for (let pw = 0.25; pw <= 1.0001; pw += 0.025) {
        const hit = simulate(shooter, angle, pw);
        const dist = Math.abs(hit.x - target.x);
        if (!bestLob || dist < bestLob.dist) bestLob = { angle, power: pw, dist };
        const score = scoreHit(hit, weapon);
        if (score > 0) found.push({ angle, power: pw, score });
      }
      yield;
    }
    // Prefer shots with room for error: re-score the best few with small misses either way, so a
    // shot that only just clears a girder (and mostly hits it) loses to one with margin.
    found.sort((x, y) => y.score - x.score);
    let best = null;
    for (const cand of found.slice(0, 15)) {
      let sum = 0;
      for (const [da, dp] of [[0, 0], [0.03, 0], [-0.03, 0], [0, 0.04], [0, -0.04]]) {
        sum += Math.max(-10, scoreHit(simulate(shooter, cand.angle + da, Math.min(1, cand.power * (1 + dp))), weapon));
      }
      cand.robust = sum / 5;
      if (!best || cand.robust > best.robust) best = cand;
    }
    return { best, bestLob };
  };

  let { best, bestLob } = yield* search(weapon);
  if (weapon === 'auger' && (!best || best.robust < depth * 0.3)) {
    // No safe way to dig under the target (girders in the way): shoot instead.
    weapon = 'shell';
    ({ best, bestLob } = yield* search(weapon));
  }
  const pick = best || bestLob || { angle: facing > 0 ? 0.8 : Math.PI - 0.8, power: 0.7 };
  const warm = TUNING.cpuWarmup[Math.min(2, shooter.shotsFired || 0)];
  const spread = (1 + assist * TUNING.assistSpread) * (game.mode === 'battle' ? warm : 1);
  const sa = spreadAngle ?? TUNING.cpuSpreadAngle[fi] * spread;
  const sp = spreadPower ?? TUNING.cpuSpreadPower[fi] * spread;
  const angle = pick.angle + gauss(random) * sa;
  const power = Math.max(0.15, Math.min(1, pick.power * (1 + gauss(random) * sp)));
  return { angle, power, weapon, ideal: pick };
}

// --- Turns, the tide, the end -------------------------------------------------------------------

function startTurn(side) {
  game.turn = side;
  // Wind changes at the start of each round (both shots) and holds within it.
  if (game.shots % 2 === 0) {
    const max = field().wind;
    game.wind = max ? Math.round((cpuRandom() * 2 - 1) * max) : 0;
  }
  if (side === PLAYER) {
    game.phase = 'aim';
    // Every turn is aimed from scratch: the barrel goes back to rest and nothing fires until you aim.
    const me = tanks[PLAYER];
    me.aim = Math.PI / 4;
    me.power = 0.5;
    aim.shown = false;
    if (game.weapon === 'auger' && tanks[PLAYER].augers === 0) game.weapon = 'shell';
  } else {
    game.phase = 'cpu';
    game.timer = 0;
    game.cpuPlan = null;
    game.cpuThinking = planSteps(tanks[CPU], tanks[PLAYER]);
    tanks[CPU].swing = null;
  }
  updateHud();
}

function afterShot() {
  // Anyone out?
  const out = tanks.filter((t) => t.armour <= 0 && !t.out);
  if (out.length) return beginSinking(out);
  if (game.mode === 'battle' && !game.crate && game.shots % TUNING.crateEvery === 0) dropCrate();
  // The tide?
  if (game.mode === 'battle' && game.shots % TUNING.tideEvery === 0 && game.waterY > game.waterMin + 0.5) {
    game.waterTarget = Math.max(game.waterMin, game.waterY - game.notch);
    game.phase = 'tide';
    game.timer = 0;
    sfx('tide', { gain: 0.9 });
    updateHud();
    return;
  }
  // At its top the sea rises no more, but it still pounds a hull under water every few shots, so a
  // battle always ends (two tanks sunk in their pits would otherwise trade misses for ever).
  if (game.mode === 'battle' && game.shots % TUNING.tideEvery === 0 && tanks.some(submerged)) {
    sfx('tide', { gain: 0.9 });
    return afterTide();
  }
  startTurn(game.turn === PLAYER ? CPU : PLAYER);
}

function submerged(t) {
  return !t.out && hullY(t) > game.waterY + 0.5;
}

function afterTide() {
  for (const t of tanks) if (submerged(t)) hurt(t, TUNING.tideDamage);
  const out = tanks.filter((t) => t.armour <= 0 && !t.out);
  if (out.length) return beginSinking(out);
  startTurn(game.turn === PLAYER ? CPU : PLAYER);
}

function beginSinking(out) {
  for (const t of out) t.sinking = true;
  game.phase = 'sinking';
  game.timer = 0;
  sfx('sink');
}

function finish() {
  const p = tanks[PLAYER];
  const c = tanks[CPU];
  const pOut = p.armour <= 0;
  const cOut = c.armour <= 0;
  const fi = game.field;
  if (pOut && cOut) {
    // A draw: the same hill again at once, the other side starting, no stars.
    showBanner('Draw: again');
    const starter = game.starter === PLAYER ? CPU : PLAYER;
    setupBattle(fi, { seed: game.seed, starter });
    game.mode = 'battle';
    startTurn(starter);
    return;
  }
  game.mode = 'result';
  game.phase = 'idle';
  if (cOut) {
    const left = p.armour;
    const stars = left >= 60 ? 3 : left >= 30 ? 2 : 1;
    game.outcome = { win: true, stars, armour: left };
    store.stars[fi] = Math.max(store.stars[fi], stars);
    store.reached = Math.max(store.reached, Math.min(FIELDS.length, fi + 2));
    store.assist = Math.max(0, store.assist - TUNING.assistDown);
    sfx('win');
  } else {
    game.outcome = { win: false, stars: 0, armour: 0 };
    store.assist = Math.min(1, store.assist + TUNING.assistUp);
    sfx('lose');
  }
  saveStore();
  showResult();
}

function startBattle(index, { newHill = false, seed } = {}) {
  if (newHill) game.hill[index]++;
  game.attempt[index]++;
  const starter = game.attempt[index] % 2 === 1 ? PLAYER : CPU;
  game.mode = 'battle';
  setupBattle(index, { seed, starter });
  location.replace(`#${index + 1}`);
  ui.start.hidden = true;
  ui.result.hidden = true;
  showBanner(`${index + 1} · ${field().name}`);
  ui.augerBtn.classList.remove('pulse');
  if (field().auger && index === 1 && !store.stars[1]) {
    void ui.augerBtn.offsetWidth;
    ui.augerBtn.classList.add('pulse');
  }
  startTurn(starter);
  startMusic();
}

// --- The main update ----------------------------------------------------------------------------

function update(dt) {
  game.time += dt;
  fx.update(dt);
  updateLife(dt);
  for (const t of game.texts) t.age += dt;
  game.texts = game.texts.filter((t) => t.age < 1.4);
  for (const t of tanks) t.hitFlash = Math.max(0, t.hitFlash - dt);
  // Shells and tanks on fixed steps.
  sim.acc += dt;
  let n = 0;
  while (sim.acc >= SIM && n < 40) {
    sim.acc -= SIM;
    n++;
    if (game.projectile) updateProjectile();
    for (const t of tanks) settleTank(t, SIM);
  }
  if (n === 40) sim.acc = 0;

  if (game.mode === 'demo') return updateDemo(dt);
  if (game.mode !== 'battle') return;

  switch (game.phase) {
    case 'cpu': {
      game.timer += dt;
      const me = tanks[CPU];
      if (!game.cpuPlan) {
        // Think a few milliseconds a frame; in step()-driven tests (manual), think it all at once.
        const until = performance.now() + (manual ? 1e9 : 4);
        let r = game.cpuThinking.next();
        while (!r.done && performance.now() < until) r = game.cpuThinking.next();
        if (r.done) {
          game.cpuPlan = r.value;
          me.swing = { from: me.aim, to: game.cpuPlan.angle, at: game.timer };
        }
      }
      if (me.swing) {
        const span = Math.max(0.15, TUNING.cpuDelay * 0.8 - me.swing.at);
        const k = Math.min(1, (game.timer - me.swing.at) / span);
        me.aim = me.swing.from + (me.swing.to - me.swing.from) * (1 - (1 - k) * (1 - k));
      }
      if (game.cpuPlan && game.timer >= TUNING.cpuDelay) {
        me.swing = null;
        fire(CPU, game.cpuPlan.weapon, game.cpuPlan.angle, game.cpuPlan.power);
      }
      break;
    }
    case 'settle': {
      game.timer += dt;
      const moving = tanks.some((t) => t.falling);
      if (!moving && game.timer > 0.55) afterShot();
      break;
    }
    case 'tide': {
      game.timer += dt;
      const k = Math.min(1, game.timer / 1.0);
      const from = game.waterTarget + game.notch;
      game.waterY = Math.max(game.waterTarget, from + (game.waterTarget - from) * (k * k * (3 - 2 * k)));
      if (k >= 1) {
        game.waterY = game.waterTarget;
        afterTide();
      }
      break;
    }
    case 'sinking': {
      game.timer += dt;
      for (const t of tanks) if (t.sinking) t.sunk = Math.min(1, game.timer / 1.0);
      if (game.timer >= 1.1) {
        for (const t of tanks) if (t.sinking) t.out = true;
        finish();
      }
      break;
    }
  }
}
const sim = { acc: 0 };

// Behind the start card: the two tanks trade harmless shots, so the shore is alive before a touch.
const demoAim = [];
function updateDemo(dt) {
  if (game.phase === 'flight') return;
  if (game.phase === 'settle') {
    game.timer += dt;
    if (game.timer > 0.6) game.phase = 'idle';
    return;
  }
  game.demoTimer -= dt;
  if (game.demoTimer > 0) return;
  game.demoTimer = 2.6;
  if (terrain.carves > 26) {
    setupBattle(0, { seed: 4, demo: true });
    demoAim.length = 0;
  }
  const side = game.turn === PLAYER ? CPU : PLAYER;
  game.turn = side;
  // Each side plans once (a planning is too long for one phone frame), then wobbles round it.
  if (!demoAim[side]) demoAim[side] = plan(tanks[side], tanks[1 - side], { random: Math.random, weapon: 'shell', spreadAngle: 0, spreadPower: 0 });
  const s = demoAim[side];
  fire(side, 'shell', s.angle + (Math.random() - 0.5) * 0.12, Math.min(1, s.power * (0.92 + Math.random() * 0.16)));
  game.shots = 0;
}

// --- Drawing --------------------------------------------------------------------------------------

let dpr = 1;
const view = { cw: 0, ch: 0, s: 0.5, ox: 0, oy: 0 };
const HUD_BOTTOM = 62; // CSS px: the weapon buttons' row
const sky = { cache: null, clouds: [] };
for (let i = 0; i < 5; i++) sky.clouds.push({ x: Math.random() * W, y: 40 + Math.random() * 140, s: 0.6 + Math.random() * 0.8, v: 6 + Math.random() * 8 });

function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  view.cw = window.innerWidth;
  view.ch = window.innerHeight;
  ui.canvas.width = Math.round(view.cw * dpr);
  ui.canvas.height = Math.round(view.ch * dpr);
  const r = ui.safe.getBoundingClientRect();
  const rw = r.width || view.cw;
  // The bottom row of the HUD sits over the sea: the world is fitted above it, so no button ever
  // covers a tank.
  const rh = (r.height || view.ch) - HUD_BOTTOM;
  view.s = Math.min(rw / W, rh / H);
  view.ox = (r.left || 0) + (rw - W * view.s) / 2;
  view.oy = (r.top || 0) + rh - H * view.s;
  sky.cache = null;
  // A resize cancels a drag in progress.
  aim.pointer = null;
  aim.active = false;
}

function toWorld(cx, cy) {
  return { x: (cx - view.ox) / view.s, y: (cy - view.oy) / view.s };
}

function drawSky(f) {
  const c = ctx;
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (!sky.cache) {
    const g = c.createLinearGradient(0, 0, 0, view.ch);
    g.addColorStop(0, f.sky[0]);
    g.addColorStop(0.55, f.sky[1]);
    g.addColorStop(1, f.sky[2]);
    sky.cache = g;
  }
  c.fillStyle = sky.cache;
  c.fillRect(0, 0, view.cw, view.ch);
  // Sun or moon, clouds and far hills, in world units (with a little parallax).
  c.setTransform(dpr * view.s, 0, 0, dpr * view.s, dpr * view.ox, dpr * view.oy);
  c.fillStyle = f.sun.color;
  c.globalAlpha = 0.9;
  c.beginPath();
  c.arc(f.sun.x * W, f.sun.y * H, f.sun.r, 0, Math.PI * 2);
  c.fill();
  c.globalAlpha = 0.25;
  c.beginPath();
  c.arc(f.sun.x * W, f.sun.y * H, f.sun.r * 1.8, 0, Math.PI * 2);
  c.fill();
  c.globalAlpha = 0.55;
  c.fillStyle = '#ffffff';
  for (const cl of sky.clouds) {
    const x = ((cl.x % (W + 400)) + W + 400) % (W + 400) - 200;
    c.beginPath();
    c.ellipse(x, cl.y, 60 * cl.s, 16 * cl.s, 0, 0, Math.PI * 2);
    c.ellipse(x + 30 * cl.s, cl.y - 10 * cl.s, 34 * cl.s, 18 * cl.s, 0, 0, Math.PI * 2);
    c.ellipse(x - 26 * cl.s, cl.y - 6 * cl.s, 26 * cl.s, 13 * cl.s, 0, 0, Math.PI * 2);
    c.fill();
  }
  c.globalAlpha = 1;
  c.fillStyle = f.far;
  c.beginPath();
  const left = -view.ox / view.s;
  const right = (view.cw - view.ox) / view.s;
  c.moveTo(left, H);
  for (let x = left; x <= right + 20; x += 20) c.lineTo(x, H * 0.62 - Math.sin(x * 0.004 + 1) * 40 - Math.sin(x * 0.011) * 16);
  c.lineTo(right + 20, H);
  c.closePath();
  c.globalAlpha = 0.55;
  c.fill();
  c.globalAlpha = 1;
}

function drawTank(t) {
  const c = ctx;
  if (t.out && t.sunk >= 1) return;
  const flip = t.side === CPU ? -1 : 1;
  c.save();
  c.translate(t.x - Math.cos(t.aim) * 6 * t.recoil, t.y + t.sunk * 50);
  c.rotate(t.tilt);
  // The barrel, under the body, from the turret's pivot.
  c.save();
  c.translate(0, -TANK.pivot + 2);
  const local = -(t.ghostAim ?? t.aim) - t.tilt;
  c.rotate(local);
  if (ready(IMG.turret)) c.drawImage(IMG.turret, -2, -5.5, 40, 11);
  c.restore();
  c.scale(flip * TANK.k, TANK.k);
  const body = IMG.body[t.color];
  if (ready(IMG.tracks)) c.drawImage(IMG.tracks, -29, -20, 58, 20);
  if (ready(body)) c.drawImage(body, -32, -40, 64, 41);
  if (t.hitFlash > 0) {
    c.globalAlpha = t.hitFlash;
    c.fillStyle = '#ffffff';
    c.fillRect(-28, -38, 56, 34);
    c.globalAlpha = 1;
  }
  // The waterline mark on the hull.
  c.strokeStyle = 'rgba(255,255,255,0.75)';
  c.lineWidth = 1.6;
  c.setLineDash([4, 3]);
  c.beginPath();
  c.moveTo(-26, -TANK.hull / TANK.k);
  c.lineTo(26, -TANK.hull / TANK.k);
  c.stroke();
  c.setLineDash([]);
  c.restore();
}

function drawArmour(t) {
  if (t.out) return;
  const c = ctx;
  const x = t.x - 26;
  const y = t.y - 74;
  c.fillStyle = 'rgba(20,24,36,0.55)';
  c.beginPath();
  c.roundRect(x - 2, y - 2, 56, 10, 5);
  c.fill();
  c.fillStyle = t.side === PLAYER ? '#45d17e' : '#ff6b57';
  c.beginPath();
  c.roundRect(x, y, Math.max(2, 52 * (t.armour / t.maxArmour)), 6, 3);
  c.fill();
}

// The sea behind the ground: deep and opaque, so no sky shows through below the waterline.
function drawDeep(f) {
  const c = ctx;
  const left = -view.ox / view.s - 5;
  const right = (view.cw - view.ox) / view.s + 5;
  const bottom = (view.ch - view.oy) / view.s + 5;
  const y = game.waterY + 6;
  const g = c.createLinearGradient(0, y, 0, Math.max(y + 1, bottom));
  g.addColorStop(0, f.waterDeep);
  g.addColorStop(1, f.sky[0]);
  c.fillStyle = g;
  c.fillRect(left, y, right - left, bottom - y);
  // The island goes on below the world's bottom, under the sea.
  if (heights && bottom > H) {
    let l = 0;
    let r = W - 1;
    while (l < W && heights[l] >= H) l++;
    while (r > 0 && heights[r] >= H) r--;
    if (r > l) {
      c.fillStyle = f.ground[2];
      c.beginPath();
      c.moveTo(l, H - 1);
      c.lineTo(r, H - 1);
      c.lineTo(r + (bottom - H) * 0.35, bottom);
      c.lineTo(l - (bottom - H) * 0.35, bottom);
      c.closePath();
      c.fill();
    }
  }
}

function drawWater(f) {
  const c = ctx;
  const left = -view.ox / view.s - 5;
  const right = (view.cw - view.ox) / view.s + 5;
  const bottom = (view.ch - view.oy) / view.s + 5;
  const y = game.waterY;
  const t = game.time;
  c.fillStyle = f.water;
  c.beginPath();
  c.moveTo(left, bottom);
  for (let x = left; x <= right; x += 12) c.lineTo(x, y + Math.sin(x * 0.03 + t * 2) * 2.5 + Math.sin(x * 0.011 - t * 1.3) * 2);
  c.lineTo(right, bottom);
  c.closePath();
  c.fill();
  c.strokeStyle = f.foam;
  c.globalAlpha = 0.8;
  c.lineWidth = 2.5;
  c.beginPath();
  for (let x = left; x <= right; x += 12) c.lineTo(x, y + Math.sin(x * 0.03 + t * 2) * 2.5 + Math.sin(x * 0.011 - t * 1.3) * 2);
  c.stroke();
  c.globalAlpha = 1;
}

// A tank that the next notch would cover: a red ripple around its hull, and a bob.
function threatened(t) {
  if (t.out || game.mode !== 'battle' || game.waterY <= game.waterMin + 0.5) return false;
  return hullY(t) > Math.max(game.waterMin, game.waterY - game.notch);
}

function drawThreat(t) {
  if (!threatened(t)) return;
  const c = ctx;
  const k = (game.time * 1.4) % 1;
  c.strokeStyle = '#ff5a4a';
  c.lineWidth = 3;
  c.globalAlpha = 0.8 * (1 - k);
  c.beginPath();
  c.ellipse(t.x, hullY(t), 30 + k * 26, 7 + k * 6, 0, 0, Math.PI * 2);
  c.stroke();
  c.globalAlpha = 1;
}

function drawProjectile() {
  const p = game.projectile;
  if (!p) return;
  const c = ctx;
  if (p.mode === 'fly') {
    c.strokeStyle = 'rgba(255,255,255,0.5)';
    c.lineWidth = 2;
    c.beginPath();
    const tr = p.trace;
    for (let i = Math.max(0, tr.length - 12); i < tr.length; i++) c.lineTo(tr[i][0], tr[i][1]);
    c.lineTo(p.x, p.y);
    c.stroke();
  }
  const im = p.weapon === 'auger' ? IMG.auger : IMG.shell;
  c.save();
  c.translate(p.x, p.y);
  if (p.heavy) c.scale(1.7, 1.7);
  c.rotate(p.mode === 'drill' ? Math.PI / 2 : Math.atan2(p.vy, p.vx));
  if (ready(im)) c.drawImage(im, -im.naturalWidth / 4, -im.naturalHeight / 4, im.naturalWidth / 2, im.naturalHeight / 2);
  c.restore();
  // Above the top of the screen: a marker at the top edge.
  const topWorld = -view.oy / view.s;
  if (p.y < topWorld) {
    const y = topWorld + 10;
    c.fillStyle = '#ffffff';
    c.beginPath();
    c.moveTo(p.x, y - 6);
    c.lineTo(p.x - 7, y + 6);
    c.lineTo(p.x + 7, y + 6);
    c.closePath();
    c.fill();
  }
}

function drawAim() {
  const t = tanks[PLAYER];
  if (game.mode !== 'battle' || game.phase !== 'aim' || t.out) return;
  const c = ctx;
  // The last shot's trace.
  if (game.lastTrace) {
    c.strokeStyle = 'rgba(255,255,255,0.28)';
    c.lineWidth = 2;
    c.setLineDash([3, 6]);
    c.beginPath();
    for (const [x, y] of game.lastTrace) c.lineTo(x, y);
    c.stroke();
    c.setLineDash([]);
  }
  if (!aim.shown) return;
  drawAimVisuals(t, t.aim, t.power, 1);
}

// The power band (a stretched wedge from the barrel, as long as the pull) and the arc preview (the
// first part of the flight, without the wind). The ghost hand draws the same, so it teaches the real thing.
function drawAimVisuals(t, angle, power, alpha) {
  const c = ctx;
  const dir = { x: Math.cos(angle), y: -Math.sin(angle) };
  const nx = -dir.y;
  const ny = dir.x;
  const bx = t.x + dir.x * 20;
  const by = t.y - TANK.pivot + dir.y * 20;
  const len = 20 + 90 * power;
  c.globalAlpha = alpha;
  c.fillStyle = power > 0.98 ? 'rgba(255,214,90,0.75)' : 'rgba(255,255,255,0.6)';
  c.beginPath();
  c.moveTo(bx + nx * 2, by + ny * 2);
  c.lineTo(bx + dir.x * len + nx * (3 + 6 * power), by + dir.y * len + ny * (3 + 6 * power));
  c.lineTo(bx + dir.x * len - nx * (3 + 6 * power), by + dir.y * len - ny * (3 + 6 * power));
  c.lineTo(bx - nx * 2, by - ny * 2);
  c.closePath();
  c.fill();
  const p = { ...launch(t, angle, power), age: 0 };
  const until = estimateFlight(t, angle, power) * field().preview;
  c.fillStyle = '#ffffff';
  let i = 0;
  while (p.age < until && i < 1000) {
    p.vy += TUNING.gravity * SIM;
    p.x += p.vx * SIM;
    p.y += p.vy * SIM;
    p.age += SIM;
    if (i % 5 === 0) {
      c.globalAlpha = alpha * 0.9 * (1 - p.age / until);
      c.beginPath();
      c.arc(p.x, p.y, 3.2, 0, Math.PI * 2);
      c.fill();
    }
    if (terrain.solid(p.x, p.y)) break;
    i++;
  }
  c.globalAlpha = 1;
}

// How long the shot would fly with no wind (for the preview's fraction).
function estimateFlight(t, angle = t.aim, power = t.power) {
  const hit = { ...launch(t, angle, power), age: 0 };
  for (let i = 0; i < 1200; i++) {
    hit.vy += TUNING.gravity * SIM;
    hit.x += hit.vx * SIM;
    hit.y += hit.vy * SIM;
    hit.age += SIM;
    if (hit.y > game.waterY || terrain.solid(hit.x, hit.y) || hit.x < -80 || hit.x > W + 80) break;
  }
  return hit.age;
}

// Before the first aiming touch, a ghost hand acts out a turn beside your tank: it presses, pulls back
// (the barrel turns, the power band stretches and the arc shows, exactly as when you aim), lets go,
// and a faint shell flies off along the arc. It loops until your first aiming touch.
const GHOST = { cycle: 3.2, pull: { x: -125, y: 90 } };

function ghostPose() {
  if (store.taught || game.mode !== 'battle' || game.phase !== 'aim' || aim.active) return null;
  const t = tanks[PLAYER];
  const s = game.time % GHOST.cycle;
  const press = { x: t.x + 210, y: t.y - 85 };
  const ease = (k) => k * k * (3 - 2 * k);
  const k = s < 0.55 ? 0 : s < 1.6 ? ease((s - 0.55) / 1.05) : 1;
  const finger = { x: press.x + GHOST.pull.x * k, y: press.y + GHOST.pull.y * k };
  const angle = Math.atan2(GHOST.pull.y, -GHOST.pull.x);
  const power = 0.2 + 0.55 * k;
  const handIn = Math.min(1, s / 0.3);
  const handOut = s < 2.0 ? 1 : Math.max(0, 1 - (s - 2.0) / 0.35);
  return {
    t,
    s,
    press,
    finger,
    angle,
    power,
    pressing: s >= 0.4 && s < 2.0,
    aiming: s >= 0.55 && s < 2.0,
    alpha: handIn * handOut,
    shell: s >= 2.0 && s < 3.0 ? (s - 2.0) / 1.0 : -1,
  };
}

function drawHand(x, y, alpha) {
  const c = ctx;
  c.save();
  c.globalAlpha = alpha;
  c.translate(x, y);
  c.rotate(-0.4);
  c.fillStyle = 'rgba(255,255,255,0.95)';
  c.strokeStyle = 'rgba(20,24,36,0.7)';
  c.lineWidth = 2;
  for (const [rx, ry, rw, rh, rr] of [
    [12, 22, 11, 16, 5],
    [21, 25, 10, 14, 5],
    [-9, 26, 32, 30, 10],
    [-6, 0, 12, 36, 6],
  ]) {
    c.beginPath();
    c.roundRect(rx, ry, rw, rh, rr);
    c.fill();
    c.stroke();
  }
  c.restore();
}

function drawGhost(g) {
  if (!g) return;
  const c = ctx;
  const { t, press, finger } = g;
  if (g.aiming) {
    drawAimVisuals(t, g.angle, g.power, 0.9 * g.alpha);
    // The pull: from where the finger pressed to where it is now.
    c.globalAlpha = 0.6 * g.alpha;
    c.strokeStyle = '#ffffff';
    c.lineWidth = 2;
    c.setLineDash([4, 5]);
    c.beginPath();
    c.moveTo(press.x, press.y);
    c.lineTo(finger.x, finger.y);
    c.stroke();
    c.setLineDash([]);
  }
  if (g.pressing) {
    // The touch: a soft dot under the fingertip, and a ring as it lands.
    c.globalAlpha = 0.45 * g.alpha;
    c.fillStyle = '#ffffff';
    c.beginPath();
    c.arc(finger.x, finger.y, 9, 0, Math.PI * 2);
    c.fill();
    const r = (g.s - 0.4) / 0.35;
    if (r < 1) {
      c.globalAlpha = 0.8 * (1 - r) * g.alpha;
      c.strokeStyle = '#ffffff';
      c.lineWidth = 3;
      c.beginPath();
      c.arc(press.x, press.y, 10 + 18 * r, 0, Math.PI * 2);
      c.stroke();
    }
  }
  if (g.alpha > 0) drawHand(finger.x, finger.y + (g.pressing ? 0 : -8), g.alpha);
  // Let go: a faint shell flies off along the arc.
  if (g.shell >= 0) {
    const p = { ...launch(t, g.angle, g.power), age: 0 };
    const until = g.shell * 1.6;
    while (p.age < until) {
      p.vy += TUNING.gravity * SIM;
      p.x += p.vx * SIM;
      p.y += p.vy * SIM;
      p.age += SIM;
    }
    c.globalAlpha = 0.7 * (1 - g.shell);
    c.fillStyle = '#ffffff';
    c.beginPath();
    c.arc(p.x, p.y, 5, 0, Math.PI * 2);
    c.fill();
  }
  c.globalAlpha = 1;
}

function drawTexts() {
  const c = ctx;
  c.textAlign = 'center';
  c.font = '800 30px system-ui, -apple-system, sans-serif';
  for (const t of game.texts) {
    const k = t.age / 1.4;
    c.globalAlpha = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
    c.lineWidth = 5;
    c.strokeStyle = 'rgba(20,24,36,0.7)';
    const y = t.y - 40 * Math.min(1, k * 2);
    c.font = t.big ? '900 44px system-ui, -apple-system, sans-serif' : '800 30px system-ui, -apple-system, sans-serif';
    c.strokeText(t.text, t.x, y);
    c.fillStyle = t.color;
    c.fillText(t.text, t.x, y);
  }
  c.globalAlpha = 1;
}

function draw() {
  const f = field();
  drawSky(f);
  const shake = fx.shake();
  const sx = shake ? (Math.random() - 0.5) * 10 * shake : 0;
  const sy = shake ? (Math.random() - 0.5) * 10 * shake : 0;
  ctx.setTransform(dpr * view.s, 0, 0, dpr * view.s, dpr * (view.ox + sx), dpr * (view.oy + sy));
  drawStreaks();
  drawBirds(f);
  drawDeep(f);
  if (terrain) ctx.drawImage(terrain.canvas, 0, 0, W, H);
  drawCrate();
  drawPuffs();
  const ghost = ghostPose();
  if (tanks[PLAYER]) tanks[PLAYER].ghostAim = ghost && ghost.aiming ? ghost.angle : undefined;
  for (const t of tanks) drawTank(t);
  drawProjectile();
  fx.draw(ctx);
  drawWater(f);
  for (const t of tanks) {
    drawThreat(t);
    drawArmour(t);
  }
  drawAim();
  drawGhost(ghost);
  drawTexts();
}

// The wind, seen in the sky: streaks that run with it, longer and brighter the stronger it blows.
function drawStreaks() {
  const w = game.wind;
  if (!w) return;
  const c = ctx;
  const k = Math.min(1, Math.abs(w) / 150);
  c.strokeStyle = '#ffffff';
  c.lineWidth = 2;
  c.lineCap = 'round';
  for (const s of streaks) {
    c.globalAlpha = (0.12 + 0.3 * k) * (0.5 + 0.5 * Math.sin(game.time * 2 + s.y));
    c.beginPath();
    c.moveTo(s.x, s.y);
    c.lineTo(s.x - Math.sign(w) * (14 + 60 * k) * s.l, s.y);
    c.stroke();
  }
  c.globalAlpha = 1;
}

function drawBirds(f) {
  const c = ctx;
  c.strokeStyle = f.look === 'night' || f.look === 'slate' ? 'rgba(220,225,240,0.7)' : 'rgba(40,40,50,0.75)';
  c.lineWidth = 2.2;
  c.lineCap = 'round';
  for (const b of birds) {
    const wing = Math.sin(b.flap) * 5;
    c.beginPath();
    c.moveTo(b.x - 11, b.y - wing);
    c.quadraticCurveTo(b.x - 5, b.y - 5 - wing * 0.4, b.x, b.y);
    c.quadraticCurveTo(b.x + 5, b.y - 5 - wing * 0.4, b.x + 11, b.y - wing);
    c.stroke();
  }
}

function drawCrate() {
  const cr = game.crate;
  if (!cr) return;
  const c = ctx;
  if (!cr.landed) {
    // The parachute: a striped canopy with its lines.
    const sway = Math.sin(game.time * 2.5) * 0.12;
    c.save();
    c.translate(cr.x, cr.y - 42);
    c.rotate(sway);
    c.strokeStyle = 'rgba(255,255,255,0.8)';
    c.lineWidth = 1.2;
    c.beginPath();
    c.moveTo(-14, 0);
    c.lineTo(-26, -34);
    c.moveTo(14, 0);
    c.lineTo(26, -34);
    c.stroke();
    for (let i = 0; i < 4; i++) {
      c.fillStyle = i % 2 ? '#ffffff' : '#e5533d';
      c.beginPath();
      c.moveTo(0, -36);
      c.arc(0, -36, 30, Math.PI + (i * Math.PI) / 4, Math.PI + ((i + 1) * Math.PI) / 4);
      c.closePath();
      c.fill();
    }
    c.restore();
  }
  const im = IMG.crate[cr.kind];
  if (ready(im)) c.drawImage(im, cr.x - 22, cr.y - 44, 44, 44);
  // A slow glow, so it reads as a prize.
  c.globalAlpha = 0.25 + 0.2 * Math.sin(game.time * 4);
  c.strokeStyle = cr.kind === 'repair' ? '#7dffa8' : '#ffd23f';
  c.lineWidth = 3;
  c.strokeRect(cr.x - 24, cr.y - 46, 48, 48);
  c.globalAlpha = 1;
}

function drawPuffs() {
  const c = ctx;
  c.fillStyle = '#ffffff';
  for (const p of game.puffs) {
    const k = p.age / 0.9;
    c.globalAlpha = 0.35 * (1 - k);
    c.beginPath();
    c.arc(p.x, p.y, 3 + 9 * k, 0, Math.PI * 2);
    c.fill();
  }
  c.globalAlpha = 1;
}

// --- HUD and cards --------------------------------------------------------------------------------

function updateHud() {
  const inBattle = game.mode === 'battle';
  ui.hudTop.hidden = !inBattle;
  ui.hudBottom.hidden = !inBattle;
  if (!inBattle) return;
  const f = field();
  ui.fieldName.textContent = `${game.field + 1} · ${f.name}`;
  const w = game.wind;
  const max = 150;
  const bars = w === 0 ? 0 : Math.max(1, Math.round((Math.abs(w) / max) * 3));
  ui.wind.classList.toggle('calm', w === 0);
  ui.windArrow.style.transform = w < 0 ? 'scaleX(-1)' : '';
  ui.windBars.forEach((b, i) => b.classList.toggle('on', i < bars));
  ui.wind.setAttribute('aria-label', w === 0 ? 'No wind' : `Wind ${w > 0 ? 'right' : 'left'}, ${bars} of 3`);
  // The pips stop once the tide is at its top, unless a hull is under water: then it still pounds it.
  const done = game.waterY <= game.waterMin + 0.5 && !tanks.some(submerged);
  const left = TUNING.tideEvery - (game.shots % TUNING.tideEvery);
  const filled = game.phase === 'tide' ? TUNING.tideEvery : game.shots % TUNING.tideEvery;
  ui.pips.forEach((p, i) => p.classList.toggle('on', !done && i < filled));
  ui.tide.classList.toggle('soon', !done && left === 1);
  ui.tide.classList.toggle('done', done);
  ui.tide.setAttribute('aria-label', done ? 'The tide has stopped' : `The tide rises in ${left} shot${left === 1 ? '' : 's'}`);
  const myTurn = game.phase === 'aim';
  ui.augerBtn.hidden = !f.auger;
  ui.charges.textContent = String(tanks[PLAYER].augers);
  ui.augerBtn.classList.toggle('empty', tanks[PLAYER].augers === 0);
  ui.shellBtn.disabled = !myTurn;
  ui.augerBtn.disabled = !myTurn;
  ui.shellBtn.setAttribute('aria-pressed', String(game.weapon === 'shell'));
  ui.shellLabel.textContent = tanks[PLAYER].heavy ? 'Heavy' : 'Shell';
  ui.shellBtn.classList.toggle('heavy', !!tanks[PLAYER].heavy);
  ui.augerBtn.setAttribute('aria-pressed', String(game.weapon === 'auger'));
}

function setStars(list, n) {
  list.forEach((s, i) => s.classList.toggle('on', i < n));
}

let pick = 0;
function showStart() {
  demoAim.length = 0;
  game.mode = 'demo';
  game.phase = 'idle';
  setupBattle(0, { seed: 4, demo: true });
  const m = /^#(\d+)$/.exec(location.hash);
  const want = m ? Number(m[1]) - 1 : store.reached - 1;
  pick = Math.max(0, Math.min(store.reached - 1, want));
  renderPick();
  ui.result.hidden = true;
  ui.start.hidden = false;
  updateHud();
}

function renderPick() {
  ui.pickNum.textContent = String(pick + 1);
  ui.pickName.textContent = FIELDS[pick].name;
  setStars(ui.pickStars, store.stars[pick]);
  ui.prev.disabled = pick === 0;
  ui.next.disabled = pick >= store.reached - 1;
}

function showResult() {
  const o = game.outcome;
  const fi = game.field;
  const last = fi === FIELDS.length - 1;
  ui.resultTitle.textContent = o.win ? (last ? 'Shore cleared!' : 'You win') : 'Sunk';
  ui.resultStarsBox.hidden = !o.win;
  setStars(ui.resultStars, 0);
  requestAnimationFrame(() => setStars(ui.resultStars, o.stars));
  ui.resultDetail.textContent = o.win
    ? `${o.armour} armour left${o.stars < 3 ? ` · ${o.stars === 2 ? '60' : '30'} for the next star` : ''}`
    : `${FIELDS[fi].name}: the same hill again, or a new one?`;
  ui.resultNext.hidden = !o.win;
  ui.resultNext.textContent = last ? 'Pick a battle' : 'Next';
  ui.resultNew.hidden = o.win;
  ui.resultAgain.textContent = 'Again';
  ui.result.hidden = false;
  ui.banner.hidden = true;
  updateHud();
}

let bannerTimer = 0;
function showBanner(text) {
  ui.banner.textContent = text;
  ui.banner.hidden = false;
  ui.banner.style.animation = 'none';
  void ui.banner.offsetWidth;
  ui.banner.style.animation = '';
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => (ui.banner.hidden = true), 1800);
}

let stopMusic = null;
function startMusic() {
  if (!stopMusic) stopMusic = sound.loop('music', { gain: 0.28 });
}

ui.play.addEventListener('click', () => {
  sound.play('click');
  startBattle(pick);
});
ui.prev.addEventListener('click', () => {
  pick = Math.max(0, pick - 1);
  sound.play('click');
  renderPick();
});
ui.next.addEventListener('click', () => {
  pick = Math.min(store.reached - 1, pick + 1);
  sound.play('click');
  renderPick();
});
ui.resultNext.addEventListener('click', () => {
  sound.play('click');
  if (game.field >= FIELDS.length - 1) return showStart();
  startBattle(game.field + 1);
});
ui.resultAgain.addEventListener('click', () => {
  sound.play('click');
  startBattle(game.field, { seed: game.seed });
});
ui.resultNew.addEventListener('click', () => {
  sound.play('click');
  startBattle(game.field, { newHill: true });
});

function chooseWeapon(w) {
  if (game.phase !== 'aim') return;
  if (w === 'auger' && (!field().auger || tanks[PLAYER].augers === 0)) return;
  if (game.weapon !== w) sound.play('click');
  game.weapon = w;
  updateHud();
}
ui.shellBtn.addEventListener('click', () => chooseWeapon('shell'));
ui.augerBtn.addEventListener('click', () => chooseWeapon('auger'));

// --- Input: pull back and let go ------------------------------------------------------------------

const aim = { pointer: null, sx: 0, sy: 0, active: false, shown: false, len: 0 };

function canAim() {
  return game.mode === 'battle' && game.phase === 'aim' && !paused && !isPortrait();
}

ui.canvas.addEventListener('pointerdown', (e) => {
  if (paused) return resume();
  if (!canAim()) return;
  if (aim.pointer !== null) return; // the first finger owns the aim
  aim.pointer = e.pointerId;
  aim.sx = e.clientX;
  aim.sy = e.clientY;
  aim.active = true;
  aim.len = 0;
  try {
    ui.canvas.setPointerCapture(e.pointerId);
  } catch (err) {}
  if (!store.taught) {
    store.taught = true;
    saveStore();
  }
});

ui.canvas.addEventListener('pointermove', (e) => {
  if (e.pointerId !== aim.pointer || !canAim()) return;
  const dx = aim.sx - e.clientX;
  const dy = aim.sy - e.clientY;
  aim.len = Math.hypot(dx, dy);
  if (aim.len < TUNING.deadZone) return;
  const t = tanks[PLAYER];
  t.aim = Math.max(-0.2, Math.min(Math.PI + 0.2, Math.atan2(-dy, dx)));
  t.power = Math.min(aim.len, TUNING.dragCap) / TUNING.dragCap;
  aim.shown = true;
});

function endAim(e, fireIt) {
  if (e.pointerId !== aim.pointer) return;
  aim.pointer = null;
  aim.active = false;
  if (fireIt && canAim() && aim.len >= TUNING.deadZone) {
    fire(PLAYER, game.weapon, tanks[PLAYER].aim, tanks[PLAYER].power);
  }
  aim.len = 0;
}
ui.canvas.addEventListener('pointerup', (e) => endAim(e, true));
ui.canvas.addEventListener('pointercancel', (e) => endAim(e, false));

window.addEventListener('keydown', (e) => {
  if (paused && (e.key === ' ' || e.key === 'Enter')) {
    e.preventDefault();
    return resume();
  }
  if (!canAim()) return;
  const t = tanks[PLAYER];
  const big = e.shiftKey ? 5 : 1;
  switch (e.key) {
    case 'ArrowLeft':
      t.aim = Math.min(Math.PI + 0.2, t.aim + 0.0175 * big);
      break;
    case 'ArrowRight':
      t.aim = Math.max(-0.2, t.aim - 0.0175 * big);
      break;
    case 'ArrowUp':
      t.power = Math.min(1, t.power + 0.01 * big);
      break;
    case 'ArrowDown':
      t.power = Math.max(0.05, t.power - 0.01 * big);
      break;
    case 'q':
    case 'Q':
      chooseWeapon(game.weapon === 'shell' ? 'auger' : 'shell');
      return;
    case ' ':
      e.preventDefault();
      if (!aim.shown) return; // aim first: every turn starts from scratch
      if (!store.taught) {
        store.taught = true;
        saveStore();
      }
      fire(PLAYER, game.weapon, t.aim, t.power);
      return;
    default:
      return;
  }
  e.preventDefault();
  aim.shown = true;
  if (!store.taught) {
    store.taught = true;
    saveStore();
  }
});

// --- Pause, rotation, the loop --------------------------------------------------------------------

const portraitQuery = window.matchMedia('(orientation: portrait) and (max-width: 700px)');
function isPortrait() {
  return portraitQuery.matches;
}

function pause() {
  if (game.mode !== 'battle') return;
  paused = true;
  ui.paused.hidden = false;
  aim.pointer = null;
  aim.active = false;
}
function resume() {
  paused = false;
  ui.paused.hidden = true;
  sound.unlock();
  last = performance.now();
}

ui.paused.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  resume();
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    pause();
    sound.suspend();
  }
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

let last = performance.now();
function frame(now) {
  const t0 = performance.now();
  let dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
  last = now;
  // A direct hit plays in slow motion for a moment.
  if (game.slow > 0) {
    game.slow = Math.max(0, game.slow - dt);
    dt *= 0.3;
  }
  // Portrait pauses a battle like a hidden page (the shore behind the start card keeps moving).
  const held = paused || (isPortrait() && game.mode === 'battle');
  if (!manual && !held) {
    for (const cl of sky.clouds) cl.x += cl.v * dt;
    update(dt);
  } else if (!held) {
    for (const cl of sky.clouds) cl.x += cl.v * dt;
  }
  draw();
  frameTimes.push(performance.now() - t0);
  if (frameTimes.length > 600) frameTimes.shift();
  requestAnimationFrame(frame);
}

// --- Start ------------------------------------------------------------------------------------------

resize();
imagesLoaded.then(() => {
  showStart();
  requestAnimationFrame((t) => {
    last = t;
    requestAnimationFrame(frame);
  });
  // For the tests: the state, and a step() that advances the simulation without waiting for frames.
  window.__crumble = {
    game,
    store,
    TUNING,
    FIELDS,
    W,
    H,
    fx,
    frameTimes,
    carveTimes,
    view,
    get terrain() {
      return terrain;
    },
    get heights() {
      return heights;
    },
    get tanks() {
      return tanks;
    },
    get manual() {
      return manual;
    },
    set manual(v) {
      manual = v;
    },
    get paused() {
      return paused;
    },
    step(dt = 1 / 60) {
      update(dt);
    },
    startBattle,
    setupBattle,
    fire,
    plan,
    simulate,
    detonate,
    startTurn,
    hullY,
    threatened,
    augerShaft,
    setCpuRandom(seed) {
      cpuRandom = rng(seed);
    },
    showStart,
    isPortrait,
    aim,
    dropCrate,
    birds,
    // Start an Auger's drilling straight down at column x, as if it had just landed there.
    drillAt(x, owner = PLAYER) {
      const y = terrain.top(x);
      game.projectile = { x, y: y - 8, vx: 0, vy: 0, age: 0, weapon: 'auger', owner, trace: [], mode: 'drill', drillTo: y + augerShaft().depth, lastCarve: -999 };
      game.phase = 'flight';
    },
    // Put a shell in the air at (x, y) with velocity (vx, vy).
    shoot(x, y, vx, vy, weapon = 'shell', owner = PLAYER) {
      game.projectile = { x, y, vx, vy, age: 1, weapon, owner, trace: [], mode: 'fly', drillTo: 0, lastCarve: 0 };
      game.phase = 'flight';
    },
  };
});

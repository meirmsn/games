// Reef: eat the golden, green and pink fish, dodge everything with teeth, dive deeper.
//
// How the challenge is kept "just right" (flow), in one place so it can be tuned:
//  - Food is told by colour, not by reading sizes: golden, green and pink fish are food; the rest
//    have teeth and bite. You learn it in the first seconds, by doing.
//  - Levels get longer as you go: 4 fish to clear the first, then 7, 9, 11, 13, 15, 17, 20 and 5
//    more each after that, so the first win comes fast and the challenge builds from there.
//  - Each level is a new world, and new dangers come in slowly: pufferfish at L2, a gentle current
//    at L4, the anglerfish at L5, the rip current and eels at L6, the lightning fish and the
//    against-you current at L7, then the dark.
//  - Risk pays more: points go with (its size / yours)^2, so the bigger food is worth chasing.
//  - A hidden "assist" level rises when you get bitten and fades while you do well. It slows and
//    blinds predators a little and spawns fewer of them.
//  - Tension comes in waves: a long calm brings a hunter in; every half minute a school of small fish
//    passes by, a feast. Combos, close calls and an extra life at each new depth are the rewards.
import { mountShell } from '../shared/game-shell.js';
import { isEdgeStart } from '../shared/safe-zone.js';
import { FRAMES } from './atlas.js';

const { sound } = mountShell({
  sounds: {
    eat: 'sounds/eat.mp3',
    puff: 'sounds/puff.mp3',
    close: 'sounds/close.mp3',
    warn: 'sounds/warn.mp3',
    drip: 'sounds/drip.mp3',
    caught: 'sounds/caught.mp3',
    hurt: 'sounds/hurt.mp3',
    bonk: 'sounds/bonk.mp3',
    dive: 'sounds/dive.mp3',
    gameover: 'sounds/gameover.mp3',
    start: 'sounds/start.mp3',
    music: 'sounds/music.mp3',
  },
});

// Every game sound goes through here, which also keeps the last few names for the tests.
const heard = [];
function sfx(name, opts) {
  heard.push(name);
  if (heard.length > 20) heard.shift();
  sound.play(name, opts);
}

// ---------- Tuning ----------

// Food is always pink, green or orange, and always smaller than you. Everything else is a
// predator: drawn with teeth, always bigger than you. Sizes are relative to the player's size
// when the fish appears.
const FOOD = ['pink', 'green', 'orange'];
const SPECIES = {
  pink: { rel: [0.42, 0.58], speed: 78, school: [4, 7], skel: true },
  green: { rel: [0.55, 0.72], speed: 64, school: [3, 5], skel: true },
  orange: { rel: [0.68, 0.86], speed: 60, skel: true },
  // Each predator has its own mark: the blue one shark's jaws, the red one an anglerfish's glowing
  // lure and needle teeth, the grey one lightning crackling through its body. (The pufferfish's
  // mark is puffing up.)
  blue: { rel: [1.25, 1.6], speed: 66, skel: true, mark: 'jaws', mouth: [0.79, 0.985, 0.58] },
  red: { rel: [1.4, 1.8], speed: 56, skel: true, mark: 'lure', mouth: [0.8, 0.995, 0.66] },
  grey: { rel: [1.15, 1.4], speed: 100, mark: 'zap' },
};
const PUFFER = { min: 40, max: 58, speed: 32, puffed: 1.5 };

// Each depth looks clearly different from the one before: its water colour, its floor (flat,
// sloped, bare, overgrown, strewn with bones) and its plants. New dangers come in slowly, one or
// two at a time, so a new world on its own keeps things fresh.
const DEPTHS = [
  {
    name: 'Sunlit Shallows', goal: 4,
    top: [140, 224, 242], bottom: [58, 162, 212],
    food: ['pink', 'green'], danger: ['blue'],
    threat: 0.12, puffers: 0, eel: null, dark: 0, rays: 1, surface: true,
    ground: 'sand', weeds: ['green', 'grass', 'orange'], weedDensity: 0.9, rockCount: 1,
  },
  {
    name: 'Coral Garden', goal: 7,
    top: [255, 204, 178], bottom: [196, 88, 112], farTint: 0.8,
    food: ['pink', 'green', 'orange'], danger: ['blue'],
    threat: 0.13, puffers: 1, eel: null, dark: 0, rays: 0.9,
    ground: 'sand', weeds: ['pink', 'orange', 'pink', 'orange'], weedDensity: 3, rockCount: 3,
  },
  {
    name: 'Kelp Forest', goal: 9,
    top: [104, 186, 150], bottom: [20, 82, 78],
    food: ['pink', 'green', 'orange'], danger: ['blue'],
    threat: 0.15, puffers: 1, eel: null, dark: 0.06, rays: 0.6, kelp: true,
    ground: 'sand', weeds: ['green', 'green', 'grass'], weedDensity: 2.4, rockCount: 1,
  },
  {
    name: 'Seagrass Meadow', goal: 11,
    top: [240, 226, 160], bottom: [120, 152, 104], farTint: 0.75,
    food: ['pink', 'green', 'orange'], danger: ['blue'],
    threat: 0.16, puffers: 1, eel: null, dark: 0, rays: 1,
    current: { dir: 1, speed: 35, from: 0, to: 1 }, // a gentle drift across the whole meadow
    ground: 'sand', weeds: ['grass', 'grass', 'green'], weedDensity: 3.2, rockCount: 0,
  },
  {
    name: 'Twilight Slope', goal: 13,
    top: [110, 96, 176], bottom: [30, 20, 74], farTint: 0.7,
    food: ['pink', 'green', 'orange'], danger: ['blue', 'red'],
    threat: 0.18, puffers: 1, eel: null, dark: 0.2, rays: 0.25, slope: 0.34,
    ground: 'dirt', weeds: [], weedDensity: 0, rockCount: 6,
  },
  {
    name: 'Sunset Reef', goal: 15,
    top: [252, 172, 118], bottom: [122, 46, 92], farTint: 0.75,
    food: ['pink', 'green', 'orange'], danger: ['blue', 'red'],
    threat: 0.2, puffers: 2, eel: [22, 30], dark: 0, rays: 0.7,
    current: { dir: 1, speed: 120, from: 0, to: 0.36 }, // a rip current across the top third
    ground: 'sand', weeds: ['orange', 'pink', 'orange'], weedDensity: 1.4, rockCount: 4,
  },
  {
    name: 'Grey Caves', goal: 17,
    top: [128, 146, 152], bottom: [28, 38, 46], farTint: 0.8,
    food: ['pink', 'green', 'orange'], danger: ['blue', 'red', 'grey'],
    threat: 0.22, puffers: 2, eel: [18, 26], dark: 0.3, rays: 0.15,
    current: { dir: -1, speed: 60, from: 0, to: 1 }, // the whole sea flows left, against you
    ground: 'dirt', weeds: ['grass'], weedDensity: 0.5, rockCount: 9,
  },
  {
    name: 'The Deep', goal: 20,
    top: [16, 24, 40], bottom: [2, 4, 10],
    food: ['pink', 'green', 'orange'], danger: ['blue', 'red', 'grey'],
    threat: 0.25, puffers: 2, eel: [14, 22], dark: 0.66, rays: 0, bones: true,
    ground: 'dirt', weeds: ['grass'], weedDensity: 0.4, rockCount: 2,
  },
];

// Level codes, as on old arcade machines. A code names a level number, not a world, and the list
// only ever grows: never change or remove a code, or players' written-down codes stop working.
// LEVEL_CODES[n] opens level n + 1 (L1 needs none). Codes from earlier versions stay as aliases.
const LEVEL_CODES = ['', 'PERCH', 'KRILL', 'TROUT', 'GLOOM', 'BLENNY', 'GOBY', 'MOREL'];
const OLD_CODES = { PEARL: 2, SQUID: 3, MANTA: 4, ABYSS: 5 }; // level numbers
const codeFor = (n) => (n < LEVEL_CODES.length ? LEVEL_CODES[n] : 'REEF' + (n + 1));
function depthForCode(text) {
  const c = String(text || '').trim().toUpperCase();
  if (!c) return -1;
  const i = LEVEL_CODES.indexOf(c);
  if (i > 0) return i;
  if (OLD_CODES[c]) return OLD_CODES[c] - 1;
  const m = /^(?:REEF|DEEP)(\d{1,2})$/.exec(c); // DEEP6 and on, from an earlier version
  if (m && Number(m[1]) > 1) return Number(m[1]) - 1;
  return -1;
}

const PLAYER_BASE = 44; // length at the start of each depth
const PLAYER_GROWTH = 1.0; // ...and it grows to (1 + this) times that before diving deeper
const PLAYER_SPEED = 250;
const MAX_LIVES = 3;

// ---------- Setup ----------

const canvas = document.getElementById('sea');
const ctx = canvas.getContext('2d');
const atlas = new Image();
atlas.src = 'img/atlas.png';

const $ = (sel) => document.querySelector(sel);
const ui = {
  over: $('[data-screen="over"]'),
  again: $('[data-again]'),
  start: $('[data-screen="start"]'),
  play: $('[data-play]'),
  codeForm: $('[data-code-form]'),
  code: $('[data-code]'),
  codeMsg: $('[data-code-msg]'),
  levelCodeLabel: $('[data-level-code-label]'),
  levelCodeValue: $('[data-level-code-value]'),
  overTitle: $('[data-over-title]'),
  finalScore: $('[data-final-score]'),
  finalDetail: $('[data-final-detail]'),
  toast: $('[data-toast]'),
  toastTitle: $('[data-toast-title]'),
  toastText: $('[data-toast-text]'),
  mute: $('[data-mute]'),
};

const rand = (a, b) => a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(rand(a, b + 1));
const pick = (xs) => xs[Math.floor(Math.random() * xs.length)];
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const rgb = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const mix = (c1, c2, t) => [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)];

const store = {
  read() {
    try {
      return JSON.parse(localStorage.getItem('reef') || '{}');
    } catch (e) {
      return {};
    }
  },
  write(v) {
    try {
      localStorage.setItem('reef', JSON.stringify(v));
    } catch (e) {
      // Blocked storage: the best score lasts until the page closes.
    }
  },
};
const saved = store.read();

// The view: world units, scaled so a phone and a desktop show a similar amount of sea.
let cssW = 0, cssH = 0, dpr = 1, S = 1, W = 0, H = 0, groundY = 0, yMin = 0, yMax = 0;

// ---------- Sprites ----------

function frame(name) {
  return FRAMES[name];
}

// Draw a sprite centred on the origin, `len` units long (its crop's width).
function drawCentered(name, len, alpha = 1) {
  const f = FRAMES[name];
  const k = len / f[6];
  const w = f[6] * k, h = f[7] * k;
  if (alpha !== 1) ctx.globalAlpha = alpha;
  ctx.drawImage(atlas, f[0], f[1], f[2], f[3], -w / 2, -h / 2, w, h);
  if (alpha !== 1) ctx.globalAlpha = 1;
}

// Draw a sprite standing on the origin (seaweed, rocks), at `k` units per cell unit.
function drawStanding(name, k) {
  const f = FRAMES[name];
  const w = f[6] * k, h = f[7] * k;
  ctx.drawImage(atlas, f[0], f[1], f[2], f[3], -w / 2, -h, w, h);
}

// A solid-colour copy of a sprite, for the far-away fish.
const tintCache = new Map();
function tinted(name, color) {
  const key = name + color;
  let c = tintCache.get(key);
  if (c) return c;
  const f = FRAMES[name];
  c = document.createElement('canvas');
  c.width = f[2];
  c.height = f[3];
  const g = c.getContext('2d');
  g.drawImage(atlas, f[0], f[1], f[2], f[3], 0, 0, f[2], f[3]);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = color;
  g.fillRect(0, 0, c.width, c.height);
  tintCache.set(key, c);
  return c;
}

// ---------- State ----------

const game = {
  mode: 'title', // title | play | dive | over
  depth: 0,
  score: 0,
  lives: MAX_LIVES,
  xp: 0,
  chain: 0,
  lastEat: -10,
  assist: (saved.runs || 0) < 2 ? 0.3 : 0.12,
  calm: 0,
  feastIn: rand(24, 34),
  eelIn: 20,
  spawnIn: 0,
  diveT: 0,
  slowmo: 0,
  overIn: 0,
  closeCalls: 0,
  shake: 0,
  comboShow: 0,
};

let time = 0;
let npcs = [];
let bubbles = [];
let skeletons = [];
let popups = [];
let snow = [];
let streaks = []; // faint lines that show where a current flows
let farFish = [];
let eels = [];
let weedsFar = [];
let weedsMid = [];
let weedsFront = [];
let rocks = [];
let vents = [];
let rays = [];
let farIn = 2;
let bgCanvas = null;
let fgCanvas = null;
let shade = null;

const player = {
  x: 0, y: 0, vx: 0, vy: 0, size: PLAYER_BASE, face: 1, faceT: 1, angle: 0,
  invul: 0, stun: 0, gulp: 0, alive: false, trail: 0, hurt: 0, safe: null, waiting: false,
};

// The water's flow at height y, in units a second (positive is to the right). A current fills a
// band of the screen, fades out at its edges, and surges a little.
function currentAt(y) {
  const c = depthDef().current;
  if (!c) return 0;
  const f = y / H, edge = 0.06;
  const inBand = f < c.from ? 1 - (c.from - f) / edge : f > c.to ? 1 - (f - c.to) / edge : 1;
  if (inBand <= 0) return 0;
  return c.dir * c.speed * Math.min(1, inBand) * (1 + 0.25 * Math.sin(time * 0.6));
}

// The sea floor's height at x: flat, except on a sloped depth, where it rises to the right.
const groundAt = (x) => groundY - (depthDef().slope || 0) * H * clamp(x / W, 0, 1);
const depthDef = (n = game.depth) => DEPTHS[Math.min(n, DEPTHS.length - 1)];
const extraDepth = () => Math.max(0, game.depth - (DEPTHS.length - 1));
const threatBase = () => Math.min(0.38, depthDef().threat + 0.02 * extraDepth());
const speedMul = () => Math.min(1.3, 1 + 0.03 * game.depth);

// ---------- Layout and scenery ----------

function resize() {
  cssW = window.innerWidth;
  cssH = window.innerHeight;
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  S = Math.min(Math.min(cssW, cssH) / 420, Math.max(cssW, cssH) / 900);
  W = cssW / S;
  H = cssH / S;
  groundY = H - 84;
  yMin = 30;
  yMax = groundY + 4;
  if (atlas.complete && atlas.naturalWidth) buildScenery();
}

function buildScenery() {
  const d = depthDef();
  const seed = game.depth * 7919 + 13;
  let s = seed;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const rr = (a, b) => a + r() * (b - a);

  // Static background: water, far hills and rocks.
  bgCanvas = bgCanvas || document.createElement('canvas');
  bgCanvas.width = canvas.width;
  bgCanvas.height = canvas.height;
  const g = bgCanvas.getContext('2d');
  g.setTransform(dpr * S, 0, 0, dpr * S, 0, 0);
  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, rgb(d.top));
  grad.addColorStop(1, rgb(d.bottom));
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);

  // Far hills, faded into the water colour.
  const far = document.createElement('canvas');
  far.width = canvas.width;
  far.height = canvas.height;
  const fg2 = far.getContext('2d');
  fg2.setTransform(dpr * S, 0, 0, dpr * S, 0, 0);
  const T = 70;
  const hillTop = groundY - 60;
  for (let x = -T * 0.3, i = 0; x < W + T; x += T, i++) {
    const wob = Math.sin(i * 1.7 + seed) * 18;
    tile(fg2, 'background_terrain_top', x, hillTop + wob, T);
    for (let y = hillTop + wob + T - 1; y < H; y += T - 1) tile(fg2, 'background_terrain', x, y, T);
  }
  const nRocks = Math.max(2, Math.round(W / 260));
  for (let i = 0; i < nRocks; i++) {
    const name = r() < 0.5 ? 'background_rock_a' : 'background_rock_b';
    const f = FRAMES[name];
    const k = rr(0.55, 0.9);
    fg2.drawImage(atlas, f[0], f[1], f[2], f[3], rr(0, W) - (f[6] * k) / 2, hillTop + 30 - f[7] * k + 20, f[6] * k, f[7] * k);
  }
  fg2.globalCompositeOperation = 'source-atop';
  fg2.fillStyle = rgb(mix(d.top, d.bottom, 0.55), d.farTint || 0.35 + Math.min(game.depth, 4) * 0.1);
  fg2.fillRect(0, 0, W, H);
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalAlpha = 0.85;
  g.drawImage(far, 0, 0);
  g.globalAlpha = 1;

  // Foreground: the sea floor the fish swim over, and a lower band in front of them.
  fgCanvas = fgCanvas || document.createElement('canvas');
  fgCanvas.width = canvas.width;
  fgCanvas.height = canvas.height;
  const f = fgCanvas.getContext('2d');
  f.setTransform(dpr * S, 0, 0, dpr * S, 0, 0);
  f.clearRect(0, 0, W, H);
  const G = 64;
  const mat = d.ground;
  const top = 'abcdefgh';
  // A sloped floor is drawn flat and sheared, so it rises smoothly rather than in steps.
  const rise = (d.slope || 0) * H;
  f.save();
  f.transform(1, -rise / W, 0, 1, 0, 0);
  for (let x = 0, i = 0; x < W + G; x += G - 0.5, i++) {
    tile(f, `terrain_${mat}_top_${top[Math.floor(r() * 8)]}`, x, groundY - 14, G);
    for (let y = groundY - 14 + G - 0.5; y < H + rise + 2; y += G - 0.5) tile(f, `terrain_${mat}_${'abcd'[Math.floor(r() * 4)]}`, x, y, G);
  }
  f.restore();
  if (d.bones) {
    // The floor of The Deep is strewn with bones.
    const kinds = ['pink', 'green', 'orange', 'blue', 'red'];
    const n = Math.round(W / 22);
    for (let i = 0; i < n; i++) {
      const fr = FRAMES[`fish_${kinds[Math.floor(r() * 5)]}_skeleton`];
      const x = rr(-10, W + 10), y = groundAt(x) + rr(4, 40), len = rr(26, 70), h = (fr[7] / fr[6]) * len;
      f.save();
      f.translate(x, y);
      f.rotate(rr(-0.7, 0.7));
      if (r() < 0.5) f.scale(-1, 1);
      f.globalAlpha = rr(0.65, 0.95);
      f.drawImage(atlas, fr[0], fr[1], fr[2], fr[3], -len / 2, -h / 2, len, h);
      f.restore();
    }
  }
  // A darker front band of the other ground type, for depth.
  const front = mat === 'sand' ? 'dirt' : 'sand';
  const fy = H - 34;
  for (let x = -G * 0.5, i = 0; x < W + G; x += G - 0.5, i++) {
    tile(f, `terrain_${front}_top_${top[Math.floor(r() * 8)]}`, x, fy + Math.sin(i * 0.9) * 8, G);
  }
  if (game.depth >= 3) {
    // Deeper floors sit in shadow.
    f.globalCompositeOperation = 'source-atop';
    f.fillStyle = rgb(d.bottom, 0.25 + 0.1 * Math.min(game.depth - 3, 2));
    f.fillRect(0, 0, W, H);
    f.globalCompositeOperation = 'source-over';
  }

  // Animated scenery: seaweed in three layers, rocks with bubble vents, light rays.
  weedsFar = [];
  const nFar = Math.round((W / 55) * Math.min(1.5, d.weedDensity || 0.2));
  for (let i = 0; i < nFar; i++) {
    weedsFar.push({ name: 'background_seaweed_' + 'abcdefgh'[Math.floor(r() * 8)], x: rr(0, W), y: hillTop + rr(30, 70), k: rr(0.5, 0.8), ph: rr(0, 6) });
  }
  weedsMid = [];
  const nMid = Math.round((W / 70) * d.weedDensity);
  for (let i = 0; i < nMid; i++) {
    // Kelp towers halfway up the water; elsewhere seaweed stays low.
    const k = d.kelp ? rr(1.2, 2.3) : rr(0.45, 0.85);
    const x = rr(0, W);
    weedsMid.push({ name: weedName(pickR(d.weeds, r), r), x, y: groundAt(x) + rr(2, 22), k, ph: rr(0, 6) });
  }
  weedsMid.sort((a, b) => a.y - b.y);
  weedsFront = [];
  const nFront = d.weeds.length ? Math.max(2, Math.round(W / 320)) : 0;
  for (let i = 0; i < nFront; i++) {
    const side = i % 2 === 0 ? rr(0, W * 0.16) : rr(W * 0.84, W);
    weedsFront.push({ name: weedName(pickR(d.weeds, r), r), x: side, y: H + 6, k: rr(0.8, 1.1), ph: rr(0, 6) });
  }
  rocks = [];
  vents = [];
  const nR = Math.max(1, Math.round(d.rockCount * Math.max(1, W / 700)));
  for (let i = 0; i < nR; i++) {
    const rx = rr(W * 0.05, W * 0.95);
    const rock = { name: r() < 0.5 ? 'rock_a' : 'rock_b', x: rx, y: groundAt(rx) + rr(10, 24), k: rr(0.45, 0.8) };
    rocks.push(rock);
    vents.push({ x: rock.x + rr(-10, 10), y: rock.y - 22, t: rr(0, 3) });
  }
  rocks.sort((a, b) => a.y - b.y);
  rays = [];
  const nRays = Math.round(W / 220) + 2;
  for (let i = 0; i < nRays; i++) rays.push({ x: rr(-0.1, 1) * W, w: rr(30, 90), ph: rr(0, 6), sp: rr(0.1, 0.25) });

  // A current shows as faint streaks moving through its band.
  streaks = [];
  if (d.current) {
    const n = Math.round((W * H * (d.current.to - d.current.from)) / 9000);
    for (let i = 0; i < n; i++) {
      streaks.push({ x: rand(0, W), y: rand(d.current.from, d.current.to) * H, len: rand(30, 90), k: rand(1.1, 1.8), a: rand(0.12, 0.3) });
    }
  }
  snow = [];
  for (let i = 0; i < Math.round((W * H) / 9000); i++) snow.push({ x: rand(0, W), y: rand(0, H), r: rand(0.6, 1.8), vy: rand(3, 10), ph: rand(0, 6) });

  shade = shade || document.createElement('canvas');
  shade.width = canvas.width;
  shade.height = canvas.height;
}

function pickR(xs, r) {
  return xs[Math.floor(r() * xs.length)];
}

function weedName(kind, r) {
  const opts = {
    green: ['seaweed_green_a', 'seaweed_green_b', 'seaweed_green_c', 'seaweed_green_d'],
    pink: ['seaweed_pink_a', 'seaweed_pink_b', 'seaweed_pink_c', 'seaweed_pink_d'],
    orange: ['seaweed_orange_a', 'seaweed_orange_b'],
    grass: ['seaweed_grass_a', 'seaweed_grass_b'],
  }[kind];
  return opts[Math.floor(r() * opts.length)];
}

function tile(g, name, x, y, size) {
  const f = FRAMES[name];
  g.drawImage(atlas, f[0], f[1], f[2], f[3], x, y, size + 0.6, size + 0.6);
}

// ---------- Spawning ----------

function makeFish(species, size, side, y) {
  const sp = SPECIES[species];
  const dir = side < 0 ? 1 : -1;
  const x = side < 0 ? -size : W + size;
  const speed = sp.speed * rand(0.85, 1.15) * speedMul();
  return {
    kind: 'fish', species, size, x, y, vx: dir * speed, vy: 0, dir, speed,
    face: dir, faceT: dir, angle: 0, ph: rand(0, 6), state: 'wander', t: 0, cool: rand(0, 2),
    stamina: 1.4, leader: null, ox: 0, oy: 0, near: false, sated: 0, fade: 0, huntT: 0, prey: null,
  };
}

function makePuffer(side) {
  const size = rand(PUFFER.min, PUFFER.max);
  const dir = side < 0 ? 1 : -1;
  return {
    kind: 'puffer', species: 'puffer', size, x: side < 0 ? -size : W + size, y: rand(yMin + 60, groundY - 40),
    vx: dir * PUFFER.speed, vy: 0, dir, speed: PUFFER.speed, face: dir, faceT: dir, angle: 0, ph: rand(0, 6),
    state: 'wander', puff: 0, puffHold: 0, fade: 0, cool: 0, near: false, sated: 0, stamina: 0, leader: null,
  };
}

const effSize = (n) => (n.kind === 'puffer' ? n.size * lerp(0.72, PUFFER.puffed, n.puff) : n.size);
const radius = (n) => (n.kind === 'puffer' ? effSize(n) * 0.42 : n.size * 0.27);
const isFood = (n) => n.kind === 'fish' && FOOD.includes(n.species);
const isThreat = (n) => n.kind === 'fish' && !FOOD.includes(n.species);
// Fish to eat before diving deeper: 4, 7, 11, 15, 20, then 5 more at each depth after that.
const goal = () => depthDef().goal + 5 * extraDepth();

// Choose a species from this depth's food or predators, sized against the player.
function chooseFish(threat) {
  const p = player.alive ? player.size : PLAYER_BASE * 1.3;
  const d = depthDef();
  const species = pick(threat ? d.danger : d.food);
  const rel = SPECIES[species].rel;
  return { species, size: p * rand(rel[0], rel[1]) };
}

function spawnOne(forceThreat = null, aimAtPlayer = false) {
  const fishes = npcs.filter((n) => n.kind === 'fish');
  const threats = fishes.filter(isThreat).length;
  const share = player.alive ? threatBase() * (1 - 0.5 * game.assist) : 0.18;
  const threat = forceThreat ?? threats < Math.round(targetPop() * share + 0.35);
  const { species, size } = chooseFish(threat);
  let side = Math.random() < 0.5 ? -1 : 1;
  let y = rand(yMin + size * 0.4, groundY - size * 0.4);
  if (aimAtPlayer && player.alive) {
    side = player.x > W / 2 ? -1 : 1; // from the far side, so it is seen coming
    y = clamp(player.y + rand(-80, 80), yMin + 30, groundY - 30);
  }
  const sp = SPECIES[species];
  const lead = makeFish(species, size, side, y);
  npcs.push(lead);
  if (sp.school && Math.random() < 0.55) {
    const n = randi(sp.school[0], sp.school[1]) - 1;
    for (let i = 0; i < n; i++) {
      const m = makeFish(species, size * rand(0.88, 1.1), side, y);
      m.leader = lead;
      m.ox = (side < 0 ? -1 : 1) * rand(18, 40 + i * 14);
      m.oy = rand(-40, 40);
      m.x += m.ox;
      m.y = clamp(y + m.oy, yMin + 10, groundY - 10);
      m.speed = lead.speed;
      npcs.push(m);
    }
  }
  return lead;
}

// A passing school of small fish: a feast that rewards being in the right place.
function spawnFeast() {
  const p = player.size;
  const species = pick(depthDef().food);
  const sp = SPECIES[species];
  const side = Math.random() < 0.5 ? -1 : 1;
  const y = rand(yMin + 80, groundY - 80);
  const n = randi(8, 12);
  let lead = null;
  for (let i = 0; i < n; i++) {
    const size = p * rand(sp.rel[0], sp.rel[1]);
    const f = makeFish(species, size, side, y);
    if (!lead) lead = f;
    else {
      f.leader = lead;
      f.ox = (side < 0 ? -1 : 1) * rand(14, 90);
      f.oy = rand(-55, 55);
      f.x += f.ox;
      f.y = clamp(y + f.oy, yMin + 10, groundY - 10);
    }
    f.speed = lead.speed * 0.9;
    npcs.push(f);
  }
}

function targetPop() {
  return clamp(Math.round((W * H) / 30000), 8, 20);
}

// ---------- Effects ----------

function bubble(x, y, r = rand(2, 5), vy = rand(30, 55)) {
  if (bubbles.length > 160) return;
  bubbles.push({ x, y, r, vy, ph: rand(0, 6), life: 0 });
}

function burst(x, y, n, spread = 14) {
  for (let i = 0; i < n; i++) bubble(x + rand(-spread, spread), y + rand(-spread, spread), rand(2, 6), rand(40, 90));
}

function popup(x, y, text, big = false) {
  popups.push({ x, y, text: String(text), t: 0, big });
}

function onScreen(n) {
  return n.x > -20 && n.x < W + 20;
}

let toastTimer = 0;
function toast(title, text, secs = 3.2) {
  ui.toastTitle.textContent = title;
  ui.toastText.textContent = text || '';
  ui.toastText.hidden = !text;
  ui.toast.hidden = false;
  ui.toast.classList.remove('out');
  // Restart the entrance animation.
  ui.toast.style.animation = 'none';
  void ui.toast.offsetWidth;
  ui.toast.style.animation = '';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    ui.toast.classList.add('out');
    toastTimer = setTimeout(() => (ui.toast.hidden = true), 520);
  }, secs * 1000);
}

// ---------- Input ----------

const input = { target: null, keys: new Set(), drag: null };

function toWorld(e) {
  const rect = canvas.getBoundingClientRect();
  return { x: (e.clientX - rect.left) / S, y: (e.clientY - rect.top) / S };
}

canvas.addEventListener('pointerdown', (e) => {
  wake();
  if (e.pointerType === 'mouse') {
    input.target = toWorld(e);
    return;
  }
  // Touch steers relatively: drag anywhere and the fish follows the drag, so your finger never
  // covers it. Anywhere but the phone's edge strips, whose swipes are the phone's (shared/safe-zone.js).
  if (isEdgeStart(e)) return;
  canvas.setPointerCapture?.(e.pointerId);
  const p = toWorld(e);
  input.drag = { id: e.pointerId, x: p.x, y: p.y };
  if (!input.target) input.target = { x: player.x, y: player.y };
});

canvas.addEventListener('pointermove', (e) => {
  const p = toWorld(e);
  if (e.pointerType === 'mouse') {
    wake();
    input.target = p;
    return;
  }
  if (!input.drag || input.drag.id !== e.pointerId) return;
  const k = 1.7;
  const t = input.target || { x: player.x, y: player.y };
  // Start from wherever the fish is if the target ran ahead into a wall.
  t.x = clamp(t.x + (p.x - input.drag.x) * k, 10, W - 10);
  t.y = clamp(t.y + (p.y - input.drag.y) * k, yMin, yMax);
  input.target = t;
  input.drag.x = p.x;
  input.drag.y = p.y;
});

function endDrag(e) {
  if (input.drag && input.drag.id === e.pointerId) input.drag = null;
}
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);

const KEYS = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1], a: [-1, 0], d: [1, 0], w: [0, -1], s: [0, 1], A: [-1, 0], D: [1, 0], W: [0, -1], S: [0, 1] };
window.addEventListener('keydown', (e) => {
  // Typing a level code is typing, not steering.
  if (e.target instanceof Element && e.target.closest('input, textarea')) return;
  if (KEYS[e.key]) {
    input.keys.add(e.key);
    input.target = null;
    e.preventDefault();
    wake();
  } else if ((e.key === 'Enter' || e.key === ' ') && !e.target.closest?.('input, button')) {
    if (game.mode === 'over' && game.overIn <= 0) {
      e.preventDefault();
      showStart();
    } else if (game.mode === 'title') {
      e.preventDefault();
      startGame(0);
    }
  }
});
window.addEventListener('keyup', (e) => input.keys.delete(e.key));
window.addEventListener('blur', () => input.keys.clear());

// ---------- Game flow ----------

let stopMusic = null;

// The start card: Start, or a level code to jump to a depth reached before. The reef swims on
// behind it.
function showStart() {
  game.mode = 'title';
  player.alive = false;
  ui.over.hidden = true;
  ui.start.hidden = false;
  ui.codeForm.classList.remove('wrong');
  ui.code.value = '';
  ui.codeMsg.textContent = ''; // no reminder of past codes: remembering them is part of the game
}

function startGame(depth = 0) {
  ui.over.hidden = true;
  ui.start.hidden = true;
  game.mode = 'play';
  game.depth = depth;
  game.score = 0;
  game.lives = MAX_LIVES;
  game.xp = 0;
  game.chain = 0;
  game.calm = 0;
  game.closeCalls = 0;
  game.feastIn = rand(22, 30);
  game.eelIn = depthDef().eel ? rand(depthDef().eel[0], depthDef().eel[1]) * 0.6 : 20;
  game.spawnIn = 0;
  // A fresh run keeps some of the last run's assist, so a hard time eases the next one.
  game.assist = clamp(game.assist * 0.6 + ((saved.runs || 0) < 2 ? 0.25 : 0.05), 0, 0.7);
  saved.runs = (saved.runs || 0) + 1;
  store.write(saved);
  eels = [];
  skeletons = [];
  popups = [];
  tintCache.clear();
  buildScenery();
  resetPlayer();
  // No instructions: the fish waits, glowing softly, until you first move it. Nothing hunts it
  // until then.
  player.waiting = true;
  player.invul = Infinity;
  if (!stopMusic) stopMusic = sound.loop('music', { gain: 0.32 });
  // Start among food only; the first predators arrive from the edges, where you can see them coming.
  npcs = npcs.filter((n) => (!isThreat(n) || Math.hypot(n.x - player.x, n.y - player.y) > 320) && (n.kind !== 'puffer' || depthDef().puffers > 0));
  for (let i = 0; i < targetPop() * 0.4; i++) spawnOne(false).x = rand(W * 0.05, W * 0.95);
}

// The player's first move starts the game proper.
function wake() {
  if (!player.waiting || game.mode !== 'play') return;
  player.waiting = false;
  player.invul = 1;
  sfx('start', { gain: 0.8 });
}

function resetPlayer() {
  player.alive = true;
  player.x = W / 2;
  player.y = Math.max(yMin + 60, H * 0.35);
  player.vx = 0;
  player.vy = 0;
  player.invul = 1.5;
  player.stun = 0;
  player.hurt = 0;
  player.size = sizeFromXp();
  input.target = null;
}

function sizeFromXp() {
  return PLAYER_BASE * (1 + PLAYER_GROWTH * Math.min(game.xp / goal(), 1));
}

function eat(n) {
  const value = (effSize(n) / player.size) ** 2;
  game.xp += 1; // one fish, one notch on the bar
  game.chain = time - game.lastEat < 2.2 ? game.chain + 1 : 1;
  game.lastEat = time;
  const mult = Math.min(1 + (game.chain - 1) * 0.5, 4);
  const pts = Math.max(5, Math.round((value * 150 * mult) / 5) * 5);
  game.score += pts;
  if (game.chain > 1) game.comboShow = 1.6;
  popup(n.x, n.y - 10, '+' + pts, mult > 1);
  sfx('eat', { rate: 0.92 + 0.07 * Math.min(game.chain, 8) + rand(-0.03, 0.03) });
  player.gulp = 1;
  game.assist = Math.max(0, game.assist - 0.012);
  removeFish(n, true);
  if (game.xp >= goal()) beginDive();
}

function removeFish(n, eaten) {
  n.dead = true;
  for (const m of npcs) if (m.leader === n) m.leader = null;
  if (eaten) {
    burst(n.x, n.y, 5, n.size * 0.2);
    const sp = SPECIES[n.species];
    if (sp && sp.skel) {
      skeletons.push({ name: `fish_${n.species}_skeleton`, x: n.x, y: n.y, size: n.size * 0.85, face: n.face, rot: 0, vr: rand(-0.6, 0.6), vy: 22, rest: 0, alpha: 1 });
    }
  }
}

// The furthest point from every predator and eel, for the player to flee to after a bite.
function safeSpot() {
  let best = { x: W / 2, y: H * 0.35 }, bestD = -1;
  for (let i = 0; i < 40; i++) {
    const x = rand(W * 0.1, W * 0.9), y = rand(yMin + 40, yMax - 40);
    let d = 1e9;
    for (const n of npcs) if (isThreat(n) && n.state !== 'leave') d = Math.min(d, Math.hypot(n.x - x, n.y - y));
    for (const e of eels) d = Math.min(d, Math.abs(e.y - y) * 2);
    d -= Math.hypot(x - player.x, y - player.y) * 0.35; // not too far across the screen
    if (d > bestD) {
      bestD = d;
      best = { x, y };
    }
  }
  return best;
}

// A bite: the predator lunges and snaps, then swims away; the player tumbles and swims to safety.
function caught(by) {
  if (player.invul > 0 || !player.alive || player.hurt > 0) return;
  game.lives -= 1;
  game.lifeLost = { slot: game.lives, t: 0 }; // the HUD makes a show of the life going
  game.slowmo = 0.3;
  game.shake = 0.35;
  game.chain = 0;
  game.assist = Math.min(1, game.assist + 0.3);
  game.calm = 0;
  // A clear "oh no" without being harsh: the soft thud of the bite, then a falling diminished
  // figure on the steel drum (E, C#, Bb), tense rather than cheerful.
  sfx('caught');
  if (game.lives > 0) setTimeout(() => sfx('hurt', { gain: 0.75 }), 90); // the last bite gets the game-over jingle instead
  burst(player.x, player.y, 12, 18);
  if (by) {
    by.state = 'bite';
    by.t = 0.3;
    by.gulp = 1;
    by.biteX = player.x;
    by.biteY = player.y;
    by.leader = null;
  }
  if (game.lives <= 0) {
    player.alive = false;
    skeletons.push({ name: 'fish_orange_skeleton', x: player.x, y: player.y, size: player.size * 0.85, face: player.face, rot: 0, vr: 0.5, vy: 26, rest: 0, alpha: 1, keep: true });
    game.mode = 'over';
    game.overIn = 1.8;
    setTimeout(() => sfx('gameover'), 500);
    finishRun();
    return;
  }
  game.xp = Math.max(0, game.xp - 1);
  player.safe = safeSpot();
  // Long enough to get there, however far: the flee ends when the fish arrives.
  player.hurt = clamp(Math.hypot(player.safe.x - player.x, player.safe.y - player.y) / 280 + 0.5, 1, 2.5);
  player.invul = player.hurt + 1.8;
  input.target = null;
  input.drag = null;
}

function finishRun() {
  const best = saved.best || 0;
  const newBest = game.score > best;
  if (newBest) saved.best = game.score;
  store.write(saved);
  ui.overTitle.textContent = newBest && game.score > 0 ? 'New best!' : 'Eaten!';
  ui.finalScore.textContent = game.score.toLocaleString('en-US');
  const parts = [`Reached ${depthDef().name}`];
  if (!newBest && best) parts.push(`best ${best.toLocaleString('en-US')}`);
  if (game.closeCalls) parts.push(`${game.closeCalls} close call${game.closeCalls > 1 ? 's' : ''}`);
  ui.finalDetail.textContent = parts.join(' \u00b7 ');
  // The level code for the depth reached, to start there next time.
  if (game.depth > 0) {
    ui.levelCodeLabel.textContent = `Level code for L${game.depth + 1} \u00b7 ${depthDef().name}`;
    ui.levelCodeValue.textContent = codeFor(game.depth);
    ui.levelCodeValue.hidden = false;
  } else {
    ui.levelCodeLabel.textContent = 'Reach L2 to earn a level code';
    ui.levelCodeValue.hidden = true;
  }
}

function beginDive() {
  if (game.mode !== 'play') return;
  game.mode = 'dive';
  game.diveT = 0;
  game.swapped = false;
  sfx('dive');
  player.invul = 4;
}

function finishDiveSwap() {
  game.depth += 1;
  game.xp = 0;
  game.lives = Math.min(MAX_LIVES, game.lives + 1);
  game.calm = 0;
  game.feastIn = rand(20, 28);
  const eel = depthDef().eel;
  game.eelIn = eel ? rand(eel[0], eel[1]) * 0.6 : 99;
  npcs = [];
  eels = [];
  skeletons = [];
  tintCache.clear();
  buildScenery();
  player.size = sizeFromXp();
  player.x = W / 2;
  player.y = yMin + 40;
  for (let i = 0; i < targetPop() * 0.5; i++) {
    const f = spawnOne(false);
    f.x = rand(W * 0.05, W * 0.95);
  }
  const d = depthDef();
  setTimeout(() => toast(`L${game.depth + 1} \u00b7 ${d.name}`, '', 2.6), 300);
}

// ---------- Update ----------

function update(dt) {
  time += dt;
  const d = depthDef();
  const live = game.mode === 'play' || game.mode === 'dive';

  // Player
  if (player.alive && live) updatePlayer(dt);

  // Population
  if (game.mode !== 'dive') {
    game.spawnIn -= dt;
    const pop = npcs.filter((n) => n.kind === 'fish' && !n.leader).length;
    if (game.spawnIn <= 0 && pop < targetPop()) {
      spawnOne();
      game.spawnIn = rand(0.5, 1.4);
    }
    const puffers = npcs.filter((n) => n.kind === 'puffer').length;
    if (puffers < d.puffers && Math.random() < dt * 0.15) npcs.push(makePuffer(Math.random() < 0.5 ? -1 : 1));
  }

  if (game.mode === 'play' && !player.waiting) {
    // Pacing: a feast every so often; a hunter when it has been too calm; eels in deeper water.
    game.feastIn -= dt;
    if (game.feastIn <= 0) {
      spawnFeast();
      game.feastIn = rand(26, 38);
    }
    const nearThreat = npcs.some((n) => isThreat(n) && Math.hypot(n.x - player.x, n.y - player.y) < 260);
    game.calm = nearThreat ? 0 : game.calm + dt;
    game.assist = Math.max(0, game.assist - dt * 0.004);
    if (game.calm > 14 * (1 + game.assist)) {
      const h = spawnOne(true, true);
      h.huntPlayer = true;
      game.calm = 0;
    }
    if (d.eel) {
      game.eelIn -= dt;
      if (game.eelIn <= 0) {
        spawnEel();
        game.eelIn = rand(d.eel[0], d.eel[1]) * (1 + game.assist * 0.8) / (1 + 0.05 * extraDepth());
      }
    }
  }

  for (const n of npcs) updateNpc(n, dt);
  npcs = npcs.filter((n) => !n.dead);
  updateEels(dt);

  // Collisions with the player
  if (player.alive && game.mode === 'play') {
    for (const n of npcs) {
      if (n.dead || n.fade < 0.6) continue;
      const dx = n.x - player.x, dy = n.y - player.y;
      const dist = Math.hypot(dx, dy);
      const pr = player.size * 0.27, nr = radius(n);
      if (isFood(n)) {
        if (dist < pr + nr * 0.75) eat(n);
      } else if (n.kind === 'puffer' && n.puff > 0.25) {
        if (dist < nr * 0.9 + pr * 0.55 && player.invul <= 0 && player.stun <= 0) bonk(n, dx, dy, dist);
      } else if (isThreat(n) && n.state !== 'bite' && n.state !== 'leave') {
        if (dist < nr * 0.72 + pr * 0.45) {
          caught(n);
          break;
        }
        // Close calls: a chasing fish got within a whisker and you got away.
        if (n.state === 'chase' && dist < (nr + pr) * 1.45) n.near = true;
        else if (n.near && dist > (nr + pr) * 2.4) {
          n.near = false;
          game.closeCalls += 1;
          game.score += 50;
          popup(player.x, player.y - player.size * 0.5, 'close!');
          sfx('close', { gain: 0.8 });
        }
      }
    }
  }

  // Ambient life
  for (const v of vents) {
    v.t -= dt;
    if (v.t <= 0) {
      v.t = rand(2.5, 6);
      const n = randi(3, 7);
      for (let i = 0; i < n; i++) setTimeout(() => bubble(v.x + rand(-4, 4), v.y, rand(2, 5), rand(35, 60)), i * 110);
      if (game.mode === 'play' && Math.random() < 0.3) sfx('drip', { gain: 0.25, rate: rand(0.8, 1.2) });
    }
  }
  for (const b of bubbles) {
    b.life += dt;
    b.y -= b.vy * dt;
    b.x += (Math.sin(b.life * 3 + b.ph) * 12 + currentAt(b.y) * 0.7) * dt;
  }
  bubbles = bubbles.filter((b) => b.y > -10);
  for (const s of snow) {
    s.y += s.vy * dt;
    s.x += (Math.sin(time * 0.4 + s.ph) * 4 + currentAt(s.y) * 0.8) * dt;
    if (s.x < -10) s.x += W + 20;
    else if (s.x > W + 10) s.x -= W + 20;
    if (s.y > H) {
      s.y = -4;
      s.x = rand(0, W);
    }
  }
  updateFar(dt);
  for (const st of streaks) {
    st.x += currentAt(st.y) * st.k * dt;
    if (st.x < -100) st.x += W + 200;
    else if (st.x > W + 100) st.x -= W + 200;
  }
  for (const sk of skeletons) {
    if (sk.y < groundAt(sk.x) + 6) {
      sk.y += sk.vy * dt;
      sk.x += currentAt(sk.y) * 0.5 * dt;
      sk.rot += sk.vr * dt;
      sk.vr *= 1 - dt * 0.8;
    } else {
      sk.rest += dt;
      if (sk.rest > 3 && !sk.keep) sk.alpha -= dt * 0.6;
    }
  }
  skeletons = skeletons.filter((s) => s.alpha > 0);
  if (skeletons.length > 24) skeletons.shift();
  for (const p of popups) p.t += dt;
  popups = popups.filter((p) => p.t < 1.1);

  // Dive transition
  if (game.mode === 'dive') {
    game.diveT += dt;
    if (Math.random() < dt * 40) bubble(rand(0, W), H + 5, rand(2, 7), rand(260, 420));
    player.vy = lerp(player.vy, 140, dt * 2);
    if (game.diveT > 1.1 && !game.swapped) {
      game.swapped = true;
      finishDiveSwap();
    }
    if (game.diveT > 2.3) {
      game.mode = 'play';
      player.invul = 1.5;
    }
  }

  if (game.mode === 'over' && game.overIn > 0) {
    game.overIn -= dt;
    if (game.overIn <= 0) {
      ui.over.hidden = false;
      ui.again.focus({ preventScroll: true });
    }
  }
  if (game.comboShow > 0) game.comboShow -= dt;
  if (game.lifeLost && (game.lifeLost.t += dt) >= 1.45) game.lifeLost = null;
  if (game.shake > 0) game.shake -= dt;
}

function updatePlayer(dt) {
  let dx = 0, dy = 0;
  for (const k of input.keys) {
    dx += KEYS[k][0];
    dy += KEYS[k][1];
  }
  let tx = 0, ty = 0;
  const speed = PLAYER_SPEED * (player.stun > 0 ? 0.35 : 1);
  if (game.mode === 'dive') {
    tx = 0;
    ty = 0;
  } else if (player.hurt > 0) {
    // Bitten: the fish swims off to safety on its own, then hands control back.
    player.hurt -= dt;
    const ex = player.safe.x - player.x, ey = player.safe.y - player.y;
    const l = Math.hypot(ex, ey) || 1;
    const s = PLAYER_SPEED * 1.25 * Math.min(1, l / 50);
    tx = (ex / l) * s;
    ty = (ey / l) * s;
    if (l < 6) player.hurt = Math.min(player.hurt, 0.001); // arrived
    if (player.hurt <= 0) input.target = null;
  } else if (dx || dy) {
    const l = Math.hypot(dx, dy);
    tx = (dx / l) * speed;
    ty = (dy / l) * speed;
  } else if (input.target) {
    const ex = input.target.x - player.x, ey = input.target.y - player.y;
    const l = Math.hypot(ex, ey);
    if (l > 2) {
      const s = speed * Math.min(1, l / 70);
      tx = (ex / l) * s;
      ty = (ey / l) * s;
    }
  }
  const k = Math.min(1, dt * 7);
  player.vx += (tx - player.vx) * k;
  if (game.mode !== 'dive') player.vy += (ty - player.vy) * k;
  // A current carries the fish along with it; swimming against it is slow going.
  const flow = game.mode === 'play' && !player.waiting ? currentAt(player.y) : 0;
  player.x = clamp(player.x + (player.vx + flow) * dt, 12, W - 12);
  player.y = clamp(player.y + player.vy * dt, yMin, game.mode === 'dive' ? H + 80 : groundAt(player.x) + 4);
  // Keep a touch target from drifting off when the fish is pinned against a wall.
  if (input.target && !input.drag) {
    input.target.x = clamp(input.target.x, 12, W - 12);
    input.target.y = clamp(input.target.y, yMin, yMax);
  }

  const target = sizeFromXp();
  player.size = lerp(player.size, target, Math.min(1, dt * 3));
  if (Math.abs(player.vx) > 6) player.face = Math.sign(player.vx);
  player.faceT = lerp(player.faceT, player.face, Math.min(1, dt * 12));
  const sp = Math.hypot(player.vx, player.vy);
  const ang = clamp(Math.atan2(player.vy, Math.abs(player.vx) + 30), -0.6, 0.6);
  player.angle = lerp(player.angle, ang, Math.min(1, dt * 8));
  // A tumble while it flees from a bite.
  player.spin = player.hurt > 0.5 ? (player.spin || 0) + dt * 14 : 0;
  if (!player.waiting) player.invul = Math.max(0, player.invul - dt);
  player.stun = Math.max(0, player.stun - dt);
  player.gulp = Math.max(0, player.gulp - dt * 4);
  player.trail -= dt * (sp / 60);
  if (player.trail <= 0) {
    player.trail = 1;
    bubble(player.x - player.face * player.size * 0.45, player.y - 4, rand(1.5, 3), rand(25, 45));
  }
}

function bonk(n, dx, dy, dist) {
  const l = dist || 1;
  player.vx = (-dx / l) * 420;
  player.vy = (-dy / l) * 420;
  player.stun = 0.6;
  player.invul = 1;
  game.xp = Math.max(0, game.xp - 1);
  game.chain = 0;
  game.shake = 0.2;
  input.target = { x: player.x + (-dx / l) * 90, y: player.y + (-dy / l) * 90 };
  sfx('bonk');
  popup(player.x, player.y - 30, 'ouch');
}

function updateNpc(n, dt) {
  n.fade = Math.min(1, n.fade + dt * 2);
  n.cool = Math.max(0, n.cool - dt);
  n.sated = Math.max(0, n.sated - dt);
  n.gulp = Math.max(0, (n.gulp || 0) - dt * 3);
  const playing = player.alive && game.mode === 'play';
  const dx = player.x - n.x, dy = player.y - n.y;
  const dist = Math.hypot(dx, dy);
  const a = game.assist;
  let tvx = n.dir * n.speed;
  let tvy = Math.sin(time * 0.7 + n.ph) * n.speed * 0.25;
  let resp = 1.5;

  if (n.kind === 'puffer') {
    const close = playing && dist < 105 + n.size;
    if (close) n.puffHold = 2.2;
    else n.puffHold = Math.max(0, n.puffHold - dt);
    const want = n.puffHold > 0 ? 1 : 0;
    if (want && n.puff < 0.05 && onScreen(n)) sfx('puff', { gain: 0.7 });
    n.puff = clamp(n.puff + (want ? dt * 6 : -dt * 0.9), 0, 1);
    tvx *= 1 - n.puff * 0.8;
    tvy *= 0.5;
  } else {
    const food = playing && isFood(n);
    const threat = playing && isThreat(n) && n.sated <= 0;
    if (n.state === 'bite') {
      // The lunge and snap, then away.
      const bx = n.biteX - n.x, by = n.biteY - n.y, bl = Math.hypot(bx, by) || 1;
      tvx = (bx / bl) * 320;
      tvy = (by / bl) * 320;
      resp = 10;
      n.t -= dt;
      if (n.t <= 0) {
        n.state = 'leave';
        n.dir = Math.sign(n.x - player.x) || 1;
      }
    } else if (n.state === 'leave') {
      tvx = n.dir * Math.max(n.speed, 90) * 2;
      tvy = -10;
      resp = 3;
    } else if (n.state === 'flee') {
      const l = dist || 1;
      tvx = (-dx / l) * n.speed * 2.1 * (1 - 0.3 * a);
      tvy = (-dy / l) * n.speed * 2.1 * (1 - 0.3 * a);
      resp = 5;
      n.stamina -= dt;
      if (!food || dist > 260 || n.stamina <= 0) {
        n.state = 'wander';
        n.dir = Math.sign(n.vx) || n.dir;
      }
    } else if (n.state === 'chase') {
      // Lead the target a little.
      const px = player.x + player.vx * 0.25 - n.x, py = player.y + player.vy * 0.25 - n.y;
      const pl = Math.hypot(px, py) || 1;
      const chaseSpeed = Math.min(205, 150 + n.size * 0.3) * speedMul() * (1 - 0.3 * a);
      tvx = (px / pl) * chaseSpeed;
      tvy = (py / pl) * chaseSpeed;
      resp = 2.2 * (1 - 0.3 * a);
      n.t -= dt;
      if (n.t <= 0 || !threat || player.invul > 0) {
        n.state = 'tired';
        n.t = 2.4;
        n.dir = Math.sign(n.vx) || n.dir;
        n.cool = 3.5;
      }
    } else if (n.state === 'tired') {
      tvx *= 0.5;
      n.t -= dt;
      if (n.t <= 0) n.state = 'wander';
    } else if (n.state === 'hunt' && n.prey) {
      const p = n.prey;
      if (p.dead) n.state = 'wander';
      else {
        const hx = p.x - n.x, hy = p.y - n.y, hl = Math.hypot(hx, hy) || 1;
        tvx = (hx / hl) * n.speed * 1.9;
        tvy = (hy / hl) * n.speed * 1.9;
        resp = 2.5;
        n.huntT -= dt;
        if (hl < radius(n) + radius(p) * 0.6) {
          removeFish(p, true);
          n.gulp = 1;
          n.sated = 5;
          n.state = 'wander';
          n.dir = Math.sign(n.vx) || n.dir;
          if (onScreen(n) && game.mode !== 'title') sfx('eat', { gain: 0.25, rate: 0.7 });
        } else if (n.huntT <= 0) {
          n.state = 'wander';
          n.dir = Math.sign(n.vx) || n.dir;
        }
      }
    } else {
      // Wander, in a school if it has a leader.
      if (n.leader && !n.leader.dead) {
        const L = n.leader;
        const gx = L.x + n.ox * (L.dir === n.dir ? 1 : -1) - n.x;
        const gy = L.y + n.oy - n.y;
        tvx = L.vx + gx * 1.2;
        tvy = L.vy + gy * 1.2;
        n.dir = L.dir;
      }
      if (food && dist < 95 + n.size && n.stamina > 0.3) {
        n.state = 'flee';
        n.leader = null;
      }
      const sight = (170 + n.size * 0.9) * (1 - 0.35 * a) * (n.huntPlayer ? 1.8 : 1);
      if (threat && n.cool <= 0 && dist < sight && player.invul <= 0) {
        n.state = 'chase';
        n.t = 3.2 * (1 - 0.25 * a);
        n.leader = null;
        n.huntPlayer = false;
        burst(n.x + n.face * n.size * 0.4, n.y, 3, 4);
      } else if (isThreat(n) && n.sated <= 0 && n.cool <= 0 && onScreen(n) && Math.random() < dt * 0.6) {
        // Predators eat the food fish too: the reef goes on without you.
        for (const m of npcs) {
          if (m === n || m.dead || !isFood(m) || m.size > n.size / 1.2) continue;
          const hx = m.x - n.x, hy = m.y - n.y;
          if (Math.abs(hy) < 90 && Math.abs(hx) < 170 && Math.sign(hx) === n.dir) {
            n.state = 'hunt';
            n.prey = m;
            n.huntT = 1.6;
            n.leader = null;
            break;
          }
        }
      }
      n.stamina = Math.min(1.4, n.stamina + dt * 0.5);
    }
  }

  const k = Math.min(1, dt * resp);
  n.vx += (tvx - n.vx) * k;
  n.vy += (tvy - n.vy) * k;
  const flow = currentAt(n.y) * 0.5;
  const cap = Math.max(10, n.speed * 0.6); // drifted, but never swept off backwards
  n.x += (n.vx + clamp(flow, -cap, cap)) * dt;
  n.y += n.vy * dt;
  const r = radius(n);
  if (n.y < yMin + r * 0.5) {
    n.y = yMin + r * 0.5;
    n.vy = Math.abs(n.vy) * 0.5;
  }
  const floor = groundAt(n.x);
  if (n.y > floor - r * 0.4) {
    n.y = floor - r * 0.4;
    n.vy = -Math.abs(n.vy) * 0.5;
  }
  if (Math.abs(n.vx) > 4) n.face = Math.sign(n.vx);
  n.faceT = lerp(n.faceT, n.face, Math.min(1, dt * 8));
  n.angle = lerp(n.angle, clamp(Math.atan2(n.vy, Math.abs(n.vx) + 20), -0.5, 0.5), Math.min(1, dt * 5));
  // Leave by the far side (a fish still swimming in, like the tail of a school, stays).
  const m = n.size + 40;
  if ((n.x < -m && n.vx < 0) || (n.x > W + m && n.vx > 0)) {
    if (n.state === 'wander' || n.state === 'flee' || n.state === 'tired' || n.state === 'leave') removeFish(n, false);
    else n.x = clamp(n.x, -m, W + m);
  }
  if (Math.random() < dt * 0.08 && onScreen(n)) bubble(n.x + n.face * n.size * 0.45, n.y - 3, rand(1.5, 3));
}

function spawnEel() {
  const dir = Math.random() < 0.5 ? 1 : -1;
  const y = player.alive ? clamp(player.y + rand(-60, 60), yMin + 30, groundY - 30) : rand(yMin + 40, groundY - 40);
  eels.push({ dir, y, x: dir > 0 ? -260 : W + 260, t: 1.4 + game.assist * 0.6, state: 'warn', len: 230 });
  sfx('warn', { gain: 0.9 });
}

function updateEels(dt) {
  for (const e of eels) {
    if (e.state === 'warn') {
      e.t -= dt;
      if (Math.random() < dt * 28) bubble(e.dir > 0 ? rand(0, 24) : W - rand(0, 24), e.y + rand(-14, 14), rand(2, 5), rand(50, 80));
      if (e.t <= 0) e.state = 'go';
    } else {
      e.x += e.dir * 640 * speedMul() * (1 - 0.15 * game.assist) * dt;
      if ((e.dir > 0 && e.x > W + 300) || (e.dir < 0 && e.x < -300)) e.done = true;
      // The eel's body is a line from tail to head.
      if (player.alive && game.mode === 'play' && player.invul <= 0) {
        const tail = e.x - e.dir * e.len, head = e.x;
        const lo = Math.min(tail, head), hi = Math.max(tail, head);
        const cx = clamp(player.x, lo, hi);
        if (Math.hypot(player.x - cx, player.y - e.y) < 17 + player.size * 0.22) caught(null);
      }
      if (Math.random() < dt * 30) bubble(e.x - e.dir * rand(0, e.len), e.y + rand(-8, 8), rand(1.5, 3.5), rand(30, 50));
    }
  }
  eels = eels.filter((e) => !e.done);
}

function updateFar(dt) {
  farIn -= dt;
  if (farIn <= 0) {
    farIn = rand(5, 11);
    const dir = Math.random() < 0.5 ? 1 : -1;
    const y = rand(H * 0.15, groundY - 120);
    const d = depthDef();
    const name = 'fish_' + pick([...d.food, ...d.danger]);
    const n = randi(3, 8);
    const sp = rand(18, 34);
    const size = rand(16, 30);
    for (let i = 0; i < n; i++) {
      farFish.push({ name, x: (dir > 0 ? -40 : W + 40) - dir * rand(0, 140), y: y + rand(-30, 30), dir, sp: sp * rand(0.9, 1.1), size: size * rand(0.85, 1.15), ph: rand(0, 6) });
    }
  }
  for (const f of farFish) {
    f.x += f.dir * f.sp * dt;
    f.y += Math.sin(time * 0.6 + f.ph) * 4 * dt;
  }
  farFish = farFish.filter((f) => f.x > -200 && f.x < W + 200);
}

// ---------- Drawing ----------

function draw() {
  const d = depthDef();
  drawn.hud = false;
  drawn.wash = 0;
  drawn.marks = [];
  drawn.lifePop = 1;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (bgCanvas) ctx.drawImage(bgCanvas, 0, 0);
  let sx = 0, sy = 0;
  if (game.shake > 0) {
    sx = rand(-1, 1) * game.shake * 14;
    sy = rand(-1, 1) * game.shake * 14;
  }
  ctx.setTransform(dpr * S, 0, 0, dpr * S, sx * dpr, sy * dpr);

  // Light from the surface
  if (d.rays > 0) {
    for (const r of rays) {
      const x = r.x + Math.sin(time * r.sp + r.ph) * 40;
      const a = (0.07 + 0.04 * Math.sin(time * 0.5 + r.ph)) * d.rays;
      const g = ctx.createLinearGradient(0, 0, 0, H * 0.85);
      g.addColorStop(0, `rgba(255,255,255,${a})`);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(x, -10);
      ctx.lineTo(x + r.w, -10);
      ctx.lineTo(x + r.w * 1.8 + 120, H * 0.85);
      ctx.lineTo(x + 120, H * 0.85);
      ctx.closePath();
      ctx.fill();
    }
  }
  if (d.surface) drawSurface();

  // Far fish and seaweed
  const farColor = rgb(mix(d.top, d.bottom, 0.25), 1);
  ctx.globalAlpha = 0.35;
  for (const f of farFish) {
    const c = tinted(f.name, farColor);
    const fr = frame(f.name);
    const w = f.size, h = (fr[7] / fr[6]) * f.size;
    ctx.save();
    ctx.translate(f.x, f.y);
    ctx.scale(f.dir, 1);
    ctx.drawImage(c, -w / 2, -h / 2, w, h);
    ctx.restore();
  }
  // Far seaweed: silhouettes in a lighter shade of this depth's water.
  const weedColor = rgb(mix(d.top, [255, 255, 255], 0.18), 1);
  ctx.globalAlpha = 0.5;
  for (const w of weedsFar) drawWeed(w, 0.08, weedColor);
  ctx.globalAlpha = 1;

  // Marine snow behind
  drawSnow(false);

  // Mid seaweed and rocks
  for (const w of weedsMid) drawWeed(w, 0.12);
  for (const r of rocks) {
    ctx.save();
    ctx.translate(r.x, r.y);
    drawStanding(r.name, r.k);
    ctx.restore();
  }

  if (fgCanvas) {
    ctx.setTransform(1, 0, 0, 1, sx * dpr, sy * dpr);
    ctx.drawImage(fgCanvas, 0, 0);
    ctx.setTransform(dpr * S, 0, 0, dpr * S, sx * dpr, sy * dpr);
  }

  // Skeletons resting on the floor and sinking
  for (const s of skeletons) {
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.scale(s.face, 1);
    ctx.rotate(s.rot);
    drawCentered(s.name, s.size, s.alpha * 0.95);
    ctx.restore();
  }

  // Eels' warnings and bodies
  for (const e of eels) if (e.state === 'go') drawEel(e);

  // Fish, smallest on top so food is never hidden behind a predator
  npcs.sort((a, b) => b.size - a.size);
  for (const n of npcs) drawNpc(n);

  if (player.alive && game.mode !== 'title') drawPlayer();

  // Bubbles
  for (const b of bubbles) {
    const name = b.r > 4.5 ? 'bubble_c' : b.r > 3 ? 'bubble_a' : 'bubble_b';
    ctx.save();
    ctx.translate(b.x, b.y);
    drawCentered(name, b.r * 2 * (name === 'bubble_c' ? 1 : 1.6), 0.75);
    ctx.restore();
  }

  // The current's streaks
  if (streaks.length) {
    ctx.lineCap = 'round';
    ctx.lineWidth = 2;
    for (const st of streaks) {
      if (st.y > groundAt(st.x) - 6) continue; // water only, not the sea floor
      const dir = Math.sign(currentAt(st.y)) || 1;
      ctx.strokeStyle = `rgba(255,255,255,${st.a})`;
      ctx.beginPath();
      ctx.moveTo(st.x, st.y);
      ctx.lineTo(st.x - dir * st.len, st.y + Math.sin(st.x * 0.02) * 3);
      ctx.stroke();
    }
  }

  // Front seaweed sways in front of everything
  for (const w of weedsFront) drawWeed(w, 0.1);

  // Popups
  for (const p of popups) drawPopup(p);

  // Darkness in deep water, with the player's glow
  if (d.dark > 0) drawDark(d.dark);
  if (d.dark > 0.3) drawSnow(true);

  // Dive: a wash of the deeper colour
  if (game.mode === 'dive') {
    const t = game.diveT;
    const a = t < 1.1 ? t / 1.1 : Math.max(0, 1 - (t - 1.1) / 1.1);
    drawn.wash = a;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = rgb(depthDef(game.swapped ? game.depth : game.depth + 1).bottom, a * 0.92);
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  drawHud();
}

function drawSurface() {
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.beginPath();
  ctx.moveTo(0, -5);
  for (let x = 0; x <= W + 20; x += 20) ctx.lineTo(x, 14 + Math.sin(x * 0.03 + time * 1.2) * 4 + Math.sin(x * 0.011 - time * 0.7) * 3);
  ctx.lineTo(W, -5);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let x = 0; x <= W + 20; x += 20) {
    const y = 14 + Math.sin(x * 0.03 + time * 1.2) * 4 + Math.sin(x * 0.011 - time * 0.7) * 3;
    if (x === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

function drawWeed(w, amp, color) {
  // Plants lean with a current flowing past their tips.
  const tipY = w.y - FRAMES[w.name][7] * w.k * 0.8;
  const lean = -currentAt(tipY) / 600;
  const shear = Math.sin(time * 0.9 + w.ph) * amp + Math.sin(time * 2.1 + w.ph * 2) * amp * 0.25 + lean;
  ctx.save();
  ctx.transform(1, 0, shear, 1, w.x, w.y);
  if (color) {
    const f = FRAMES[w.name];
    const wd = f[6] * w.k, h = f[7] * w.k;
    ctx.drawImage(tinted(w.name, color), -wd / 2, -h, wd, h);
  } else drawStanding(w.name, w.k);
  ctx.restore();
}

function drawSnow(glow) {
  ctx.fillStyle = glow ? 'rgba(190,240,255,0.9)' : 'rgba(255,255,255,0.35)';
  if (glow) ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < snow.length; i++) {
    const s = snow[i];
    if (glow && i % 3) continue;
    const r = glow ? s.r * (0.6 + 0.4 * Math.sin(time * 2 + s.ph)) : s.r;
    ctx.beginPath();
    ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
}

function fishTransform(x, y, faceT, angle, size, ph, speedFrac, gulp) {
  ctx.translate(x, y);
  const wig = Math.sin(time * (6 + speedFrac * 10) + ph) * (0.03 + 0.06 * speedFrac);
  const g = 1 + (gulp || 0) * 0.12;
  ctx.scale(faceT * g, (1 + Math.sin(time * 5 + ph) * 0.025) * g);
  ctx.rotate(angle + wig);
  void size;
}

// The blue predator gets a small open mouth with a few teeth, painted onto a copy of its sprite in the
// pack's own flat style (the mouth is the fish's colour, darkened; the teeth are the pack's bone
// colour), so food and danger read at a glance.
const teethCache = new Map();
function withTeeth(species) {
  let c = teethCache.get(species);
  if (c) return c;
  const f = FRAMES['fish_' + species];
  const [m0, m1, my] = SPECIES[species].mouth;
  const w = f[2], h = f[3];
  c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  g.drawImage(atlas, f[0], f[1], w, h, 0, 0, w, h);
  g.globalCompositeOperation = 'source-atop';
  const x0 = lerp(m0, m1, 0.25) * w, x1 = m1 * w, y = my * h, gap = h * 0.085;
  // The open mouth: a wedge from the nose back, in the fish's own colour, darkened.
  const mouth = new Path2D();
  mouth.moveTo(x1 + 2, y - gap * 0.1);
  mouth.lineTo(x0, y - gap);
  mouth.quadraticCurveTo(x0 - gap * 0.6, y + gap * 0.1, x0 + gap * 0.3, y + gap * 0.9);
  mouth.closePath();
  g.fillStyle = 'rgba(30,10,30,0.55)';
  g.fill(mouth);
  // Two teeth on top, one below, in the skeletons' bone colour.
  g.save();
  g.clip(mouth);
  g.fillStyle = '#f3ead2';
  const L = x1 - x0;
  const tooth = (ax, ay, bx, by, tx, ty) => {
    g.beginPath();
    g.moveTo(ax, ay);
    g.lineTo(bx, by);
    g.lineTo(tx, ty);
    g.closePath();
    g.fill();
  };
  const topY = (x) => lerp(y - gap, y - gap * 0.1, (x - x0) / L);
  for (const t of [0.22, 0.55]) {
    const ax = x0 + L * t, bx = x0 + L * (t + 0.22);
    tooth(ax, topY(ax) - 2, bx, topY(bx) - 2, (ax + bx) / 2, (topY(ax) + topY(bx)) / 2 + gap * 0.85);
  }
  const ax = x0 + L * 0.3, bx = x0 + L * 0.52;
  const botY = (x) => lerp(y + gap * 0.9, y - gap * 0.1, (x - x0) / L);
  tooth(ax, botY(ax) + 2, bx, botY(bx) + 2, (ax + bx) / 2, (botY(ax) + botY(bx)) / 2 - gap * 0.75);
  g.restore();
  teethCache.set(species, c);
  return c;
}

// The red predator's mark: an anglerfish lure, a glowing bulb on a stalk that bobs over its head.
function drawLure(n) {
  const f = FRAMES['fish_' + n.species];
  const L = n.size, H = (f[7] / f[6]) * L;
  const bob = Math.sin(time * 3 + n.ph) * H * 0.06;
  const sx = L * 0.3, sy = -H * 0.36; // the stalk's root, on the forehead
  const bx = L * 0.62, by = -H * 0.72 + bob; // the bulb, out in front
  ctx.strokeStyle = '#a8352b';
  ctx.lineWidth = Math.max(2, L * 0.03);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.quadraticCurveTo(sx + L * 0.12, by - H * 0.25, bx, by);
  ctx.stroke();
  const r = L * 0.055 * (1 + Math.sin(time * 5 + n.ph) * 0.12);
  const g = ctx.createRadialGradient(bx, by, 0, bx, by, r * 4);
  g.addColorStop(0, 'rgba(255,240,150,0.85)');
  g.addColorStop(1, 'rgba(255,240,150,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(bx, by, r * 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fff6c2';
  ctx.beginPath();
  ctx.arc(bx, by, r, 0, Math.PI * 2);
  ctx.fill();
}

// The grey predator's mark: every second or so, yellow lightning crackles through its body for a
// moment and the fish flashes, like an electric eel.
function drawZap(n) {
  const cycle = 1.3, on = 0.35;
  const t = (time + n.ph) % cycle;
  if (t > on || Math.floor(time * 24) % 3 === 0) return; // between bursts, and flickering within one
  const f = FRAMES['fish_' + n.species];
  const a = n.size * 0.5, b = (f[7] / f[6]) * n.size * 0.5;
  let seed = (Math.floor(time * 24) * 9301 + Math.floor(n.ph * 1000) * 49297) % 233280;
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  ctx.save();
  // The body lights up.
  ctx.globalAlpha = 0.15;
  ctx.globalCompositeOperation = 'lighter';
  drawCentered('fish_' + n.species, n.size);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'miter';
  const bolt = (x0, x1, amp, steps) => {
    const pts = [];
    for (let i = 0; i <= steps; i++) {
      const x = lerp(x0, x1, i / steps);
      const y = i === 0 || i === steps ? 0 : (i % 2 ? 1 : -1) * amp * (0.2 + rnd() * 0.9);
      pts.push([x, y]);
    }
    for (const [w, col] of [[Math.max(4, n.size * 0.05), 'rgba(255,190,0,0.6)'], [Math.max(1.5, n.size * 0.02), '#fff6a0']]) {
      ctx.lineWidth = w;
      ctx.strokeStyle = col;
      ctx.beginPath();
      pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.stroke();
    }
  };
  bolt(-a * 0.85, a * 0.75, b * 0.55, 9); // tail to head through the body
  if (rnd() < 0.6) bolt(-a * 0.2, a * 0.35, b * 0.4, 4);
  ctx.restore();
}

// The red predator's teeth: an anglerfish's wide gape with long, thin needle teeth that cross it.
function withNeedles(species) {
  const key = species + ':needles';
  let c = teethCache.get(key);
  if (c) return c;
  const f = FRAMES['fish_' + species];
  const [m0, m1, my] = SPECIES[species].mouth;
  const w = f[2], h = f[3];
  c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  g.drawImage(atlas, f[0], f[1], w, h, 0, 0, w, h);
  g.globalCompositeOperation = 'source-atop';
  const x0 = m0 * w, x1 = m1 * w, y = my * h, gap = h * 0.13;
  const mouth = new Path2D();
  mouth.moveTo(x1 + 2, y - gap * 0.8);
  mouth.quadraticCurveTo(x0 + (x1 - x0) * 0.2, y - gap * 1.05, x0, y);
  mouth.quadraticCurveTo(x0 + (x1 - x0) * 0.2, y + gap * 1.05, x1 + 2, y + gap * 0.8);
  mouth.closePath();
  g.fillStyle = 'rgba(40,6,14,0.8)';
  g.fill(mouth);
  // Needles: long and narrow, upper ones reaching down past the lower jaw line and the other way.
  g.fillStyle = '#f6eed8';
  const L = x1 - x0;
  const needle = (x, yBase, dir, len) => {
    const half = Math.max(1.2, L * 0.035);
    g.beginPath();
    g.moveTo(x - half, yBase);
    g.lineTo(x + half, yBase);
    g.lineTo(x + dir * 0 + half * 0.3, yBase + dir * len);
    g.closePath();
    g.fill();
  };
  for (const [t, k] of [[0.3, 1], [0.48, 1.25], [0.66, 1.1], [0.84, 0.9]]) needle(x0 + L * t, y - gap * 0.92, 1, gap * 1.35 * k);
  for (const [t, k] of [[0.39, 1.05], [0.57, 1.2], [0.75, 1]]) needle(x0 + L * t, y + gap * 0.92, -1, gap * 1.3 * k);
  teethCache.set(key, c);
  return c;
}

// The orange food fish, recoloured golden yellow so it can't be mistaken for the player's orange
// fish: a hue shift toward yellow and a little lighter, done once on the sprite's pixels.
const recolourCache = new Map();
function golden(name) {
  let c = recolourCache.get(name);
  if (c) return c;
  const f = FRAMES[name];
  c = document.createElement('canvas');
  c.width = f[2];
  c.height = f[3];
  const g = c.getContext('2d');
  g.drawImage(atlas, f[0], f[1], f[2], f[3], 0, 0, f[2], f[3]);
  const img = g.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    if (!d[i + 3]) continue;
    let r = d[i] / 255, gr = d[i + 1] / 255, b = d[i + 2] / 255;
    const max = Math.max(r, gr, b), min = Math.min(r, gr, b), l = (max + min) / 2;
    let h = 0, sat = 0;
    if (max !== min) {
      const dd = max - min;
      sat = l > 0.5 ? dd / (2 - max - min) : dd / (max + min);
      h = max === r ? (gr - b) / dd + (gr < b ? 6 : 0) : max === gr ? (b - r) / dd + 2 : (r - gr) / dd + 4;
      h /= 6;
    }
    h = (h + 13 / 360) % 1; // orange to golden yellow
    const L = Math.min(1, l * 1.05);
    const hue = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = L < 0.5 ? L * (1 + sat) : L + sat - L * sat, p2 = 2 * L - q;
    d[i] = hue(p2, q, h + 1 / 3) * 255;
    d[i + 1] = hue(p2, q, h) * 255;
    d[i + 2] = hue(p2, q, h - 1 / 3) * 255;
  }
  g.putImageData(img, 0, 0);
  recolourCache.set(name, c);
  return c;
}

function drawNpc(n) {
  const sp = Math.hypot(n.vx, n.vy) / 200;
  ctx.save();
  ctx.globalAlpha = n.fade;
  if (n.kind === 'puffer') {
    const len = effSize(n);
    ctx.translate(n.x, n.y);
    ctx.scale(n.faceT, lerp(0.82, 1, n.puff));
    ctx.rotate(Math.sin(time * 2 + n.ph) * 0.08);
    drawCentered('fish_brown', len);
  } else {
    fishTransform(n.x, n.y, n.faceT, n.angle, n.size, n.ph, Math.min(1, sp), n.gulp);
    const mark = SPECIES[n.species].mark;
    if (mark && !drawn.marks.includes(mark)) drawn.marks.push(mark);
    if (mark === 'jaws' || mark === 'lure') {
      const c = mark === 'jaws' ? withTeeth(n.species) : withNeedles(n.species);
      const f = FRAMES['fish_' + n.species];
      const h = (f[7] / f[6]) * n.size;
      ctx.drawImage(c, -n.size / 2, -h / 2, n.size, h);
    } else if (n.species === 'orange') {
      const f = FRAMES.fish_orange;
      const h = (f[7] / f[6]) * n.size;
      ctx.drawImage(golden('fish_orange'), -n.size / 2, -h / 2, n.size, h);
    } else drawCentered('fish_' + n.species, n.size);
    if (mark === 'lure') drawLure(n);
    else if (mark === 'zap') drawZap(n);
  }
  ctx.restore();
}

function drawPlayer() {
  if (player.waiting) {
    // A soft pulse that says "this is you, move me".
    const t = (time % 1.6) / 1.6;
    ctx.save();
    ctx.strokeStyle = `rgba(255,236,150,${0.7 * (1 - t)})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(player.x, player.y, player.size * (0.6 + t * 0.9), 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  } else if (player.invul > 0 && game.mode === 'play' && player.hurt <= 0 && Math.floor(player.invul * 8) % 2 === 0) return;
  const sp = Math.hypot(player.vx, player.vy) / PLAYER_SPEED;
  ctx.save();
  // A soft halo so the player always stands out.
  const r = player.size * 0.75;
  const g = ctx.createRadialGradient(player.x, player.y, r * 0.2, player.x, player.y, r);
  g.addColorStop(0, 'rgba(255,240,170,0.28)');
  g.addColorStop(1, 'rgba(255,240,170,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(player.x, player.y, r, 0, Math.PI * 2);
  ctx.fill();
  fishTransform(player.x, player.y, player.faceT, player.angle, player.size, 0, Math.min(1, sp), player.gulp);
  if (player.stun > 0) ctx.rotate(Math.sin(time * 30) * 0.15);
  if (player.spin) ctx.rotate(player.spin);
  drawCentered('fish_orange_outline', player.size * 1.04);
  ctx.restore();
}

function drawEel(e) {
  const fa = FRAMES.fish_grey_long_a, fb = FRAMES.fish_grey_long_b;
  // Tail piece then head piece, end to end, in a cell where 128 units = one piece.
  const k = e.len / (fa[6] + fb[6]);
  ctx.save();
  ctx.translate(e.x, e.y);
  ctx.scale(e.dir, 1);
  ctx.rotate(Math.sin(time * 14) * 0.02);
  const hA = fa[7] * k, hB = fb[7] * k;
  const wA = fa[6] * k, wB = fb[6] * k;
  // Head at the origin, facing +x.
  const cellTop = -((fa[5] + fa[7] / 2) * k);
  ctx.drawImage(atlas, fb[0], fb[1], fb[2], fb[3], -wB, cellTop + fb[5] * k, wB, hB);
  ctx.drawImage(atlas, fa[0], fa[1], fa[2], fa[3], -wB - wA + 0.5, cellTop + fa[5] * k, wA, hA);
  ctx.restore();
}

function drawDark(amount) {
  const g = shade.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalCompositeOperation = 'source-over';
  g.clearRect(0, 0, shade.width, shade.height);
  g.fillStyle = `rgba(2,8,22,${amount})`;
  g.fillRect(0, 0, shade.width, shade.height);
  g.setTransform(dpr * S, 0, 0, dpr * S, 0, 0);
  g.globalCompositeOperation = 'destination-out';
  const lights = [];
  if (player.alive && game.mode !== 'title') lights.push([player.x, player.y, 150 + player.size * 1.2]);
  else lights.push([W / 2, H / 2, Math.min(W, H) * 0.45]);
  for (const [x, y, r] of lights) {
    const rg = g.createRadialGradient(x, y, r * 0.15, x, y, r);
    rg.addColorStop(0, 'rgba(0,0,0,1)');
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = rg;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  // Eels warn with bubbles you can see: a little light where they'll come from.
  for (const e of eels) {
    if (e.state !== 'warn') continue;
    const x = e.dir > 0 ? 0 : W;
    const rg = g.createRadialGradient(x, e.y, 5, x, e.y, 90);
    rg.addColorStop(0, 'rgba(0,0,0,0.8)');
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = rg;
    g.beginPath();
    g.arc(x, e.y, 90, 0, Math.PI * 2);
    g.fill();
  }
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(shade, 0, 0);
  ctx.restore();
  // In dark water the player's fish gives off its own soft light.
  if (amount > 0.4 && player.alive && game.mode !== 'title') {
    const r = 120 + player.size * 1.4;
    const g = ctx.createRadialGradient(player.x, player.y, 0, player.x, player.y, r);
    g.addColorStop(0, 'rgba(120,200,255,0.22)');
    g.addColorStop(1, 'rgba(120,200,255,0)');
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(player.x, player.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

// Digits from the pack's HUD numbers; anything else falls back to text.
function drawDigits(text, x, y, h, align = 'left', alpha = 1) {
  const chars = [...text].map((c) => (c === '+' ? 'hud_plus' : /\d/.test(c) ? 'hud_number_' + c : null));
  if (chars.some((c) => !c)) return drawText(text, x, y, h, align, alpha);
  const ws = chars.map((c) => (FRAMES[c][6] / FRAMES[c][7]) * h * 0.92);
  const total = ws.reduce((a, b) => a + b, 0) - (chars.length - 1) * h * 0.1;
  let cx = align === 'right' ? x - total : align === 'center' ? x - total / 2 : x;
  ctx.globalAlpha = alpha;
  for (let i = 0; i < chars.length; i++) {
    const f = FRAMES[chars[i]];
    const hh = chars[i] === 'hud_plus' ? h * 0.8 : h;
    ctx.drawImage(atlas, f[0], f[1], f[2], f[3], cx, y + (h - hh) / 2, ws[i] * (hh / h), hh);
    cx += ws[i] - h * 0.1;
  }
  ctx.globalAlpha = 1;
  return total;
}

function drawText(text, x, y, h, align, alpha = 1) {
  ctx.globalAlpha = alpha;
  ctx.font = `800 ${h * 0.8}px system-ui, -apple-system, sans-serif`;
  ctx.textAlign = align;
  ctx.textBaseline = 'top';
  ctx.lineWidth = Math.max(2, h * 0.14);
  ctx.strokeStyle = 'rgba(255,255,255,0.95)';
  ctx.lineJoin = 'round';
  ctx.strokeText(text, x, y + h * 0.1);
  ctx.fillStyle = '#f5b800';
  ctx.fillText(text, x, y + h * 0.1);
  ctx.globalAlpha = 1;
}

function drawPopup(p) {
  const t = p.t / 1.1;
  const y = p.y - t * 40;
  const a = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;
  const h = p.big ? 26 : 20;
  drawDigits(p.text, p.x, y - h / 2, h, 'center', a);
}

function digitsWidth(text, h) {
  let w = 0;
  for (const c of text) {
    const f = FRAMES[c === '+' ? 'hud_plus' : 'hud_number_' + c];
    if (f) w += (f[6] / f[7]) * h * 0.92 - h * 0.1;
  }
  return w + h * 0.1;
}

function drawHud() {
  if (game.mode === 'title') return;
  drawn.hud = true;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const narrow = cssW < 560;
  const top = 12 + safeTop();
  // Losing a life: the screen's edges flash red...
  const lost = game.lifeLost;
  if (lost && lost.t < 0.8) {
    const a = 0.55 * (1 - lost.t / 0.8);
    const g = ctx.createRadialGradient(cssW / 2, cssH / 2, Math.min(cssW, cssH) * 0.3, cssW / 2, cssH / 2, Math.max(cssW, cssH) * 0.75);
    g.addColorStop(0, 'rgba(230,30,40,0)');
    g.addColorStop(1, `rgba(230,30,40,${a})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, cssW, cssH);
  }
  // Lives: big fish, or skeletons for the ones lost.
  const lw = narrow ? 46 : 58;
  let x = 68 + safeLeft();
  for (let i = 0; i < MAX_LIVES; i++) {
    const alive = i < game.lives;
    let name = alive ? 'fish_orange_outline' : 'fish_orange_skeleton';
    let cx = x + lw / 2, cy = top + 22, scale = 1, glow = 0;
    if (lost && lost.slot === i) {
      // ...and the life that went pops out big, shakes as it turns to bones, and settles back.
      const t = lost.t;
      const pop = t < 0.2 ? t / 0.2 : t < 0.95 ? 1 : Math.max(0, 1 - (t - 0.95) / 0.5);
      const ease = pop * pop * (3 - 2 * pop);
      scale = 1 + 2.2 * ease;
      cx += ease * 40;
      cy += ease * 52;
      if (t > 0.2 && t < 0.95) {
        cx += Math.sin(t * 70) * 5;
        cy += Math.cos(t * 55) * 3;
      }
      if (t < 0.45) name = 'fish_orange_outline';
      glow = ease;
      drawn.lifePop = scale;
    }
    const f = FRAMES[name];
    const w = lw * scale, h = (f[7] / f[6]) * w;
    if (glow > 0) {
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, w * 0.75);
      g.addColorStop(0, `rgba(255,60,60,${0.6 * glow})`);
      g.addColorStop(1, 'rgba(255,60,60,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, w * 0.75, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = alive || glow > 0 ? 1 : 0.7;
    ctx.drawImage(atlas, f[0], f[1], f[2], f[3], cx - w / 2, cy - h / 2, w, h);
    x += lw + 6;
  }
  ctx.globalAlpha = 1;
  // Score: beside the mute button on wide screens, on the second row on narrow ones.
  const text = String(game.score);
  const sh = narrow ? 40 : 50;
  const right = narrow ? cssW - 16 - safeRight() : cssW - 68 - safeRight();
  const sy = narrow ? top + 52 : top - 3;
  drawDigits(text, right, sy, sh, 'right');
  if (game.comboShow > 0 && game.chain > 1) {
    const mult = Math.min(1 + (game.chain - 1) * 0.5, 4);
    drawText('combo \u00d7' + mult, right, sy + sh + 4, 22, 'right', Math.min(1, game.comboShow * 2));
  }
  // Progress: a thick bar with a notch for each fish still to eat before diving deeper.
  const bh = 24;
  let bx, bw, by;
  if (narrow) {
    bx = 16 + safeLeft();
    bw = Math.max(80, right - digitsWidth(text, sh) - 18 - bx);
    by = sy + (sh - bh) / 2;
  } else {
    bw = Math.min(440, cssW * 0.42);
    bx = (cssW - bw) / 2;
    by = top + 64;
  }
  const n = goal();
  const prog = Math.min(1, game.xp / n);
  ctx.fillStyle = 'rgba(10,30,60,0.35)';
  roundRect(bx - 3, by - 3, bw + 6, bh + 6, (bh + 6) / 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  roundRect(bx, by, bw, bh, bh / 2);
  ctx.fill();
  if (prog > 0) {
    ctx.fillStyle = '#ffd23f';
    roundRect(bx, by, Math.max(bh, bw * prog), bh, bh / 2);
    ctx.fill();
  }
  if (n <= 40) {
    ctx.fillStyle = 'rgba(10,30,60,0.28)';
    for (let i = 1; i < n; i++) ctx.fillRect(bx + (bw * i) / n - 1, by + 4, 2, bh - 8);
  }
  const f = FRAMES.fish_orange_outline;
  const iw = 42, ih = (f[7] / f[6]) * iw;
  ctx.drawImage(atlas, f[0], f[1], f[2], f[3], bx + bw * prog - iw / 2, by + bh / 2 - ih / 2, iw, ih);
  // The level: a number badge, then its name, large.
  const label = depthDef().name;
  const badge = 'L' + (game.depth + 1);
  const fs = narrow ? 20 : 24;
  ctx.textBaseline = 'middle';
  ctx.font = `800 ${fs}px system-ui, -apple-system, sans-serif`;
  const nameW = ctx.measureText(label).width;
  ctx.font = `800 ${fs * 0.72}px system-ui, -apple-system, sans-serif`;
  const badgeW = ctx.measureText(badge).width + fs * 0.6;
  const total = badgeW + 8 + nameW;
  const lx = narrow ? bx : bx + bw / 2 - total / 2;
  const ly = by + bh + 10 + fs * 0.6;
  ctx.fillStyle = '#ffd23f';
  roundRect(lx, ly - fs * 0.5, badgeW, fs, fs * 0.3);
  ctx.fill();
  ctx.fillStyle = '#3b2a00';
  ctx.textAlign = 'center';
  ctx.fillText(badge, lx + badgeW / 2, ly + 1);
  ctx.font = `800 ${fs}px system-ui, -apple-system, sans-serif`;
  ctx.textAlign = 'left';
  ctx.lineWidth = 4;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(10,30,60,0.35)';
  ctx.strokeText(label, lx + badgeW + 8, ly + 1);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(label, lx + badgeW + 8, ly + 1);
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

const insetProbe = document.createElement('div');
insetProbe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) 0 env(safe-area-inset-left)';
document.body.appendChild(insetProbe);
let insets = [0, 0, 0];
function readInsets() {
  const cs = getComputedStyle(insetProbe);
  insets = [parseFloat(cs.paddingTop) || 0, parseFloat(cs.paddingRight) || 0, parseFloat(cs.paddingLeft) || 0];
}
const safeTop = () => insets[0];
const safeRight = () => insets[1];
const safeLeft = () => insets[2];

// ---------- Loop ----------

let last = 0;
let running = true;
let manual = false; // tests drive the simulation themselves with step(); frames only draw
const drawn = { hud: false, wash: 0, marks: [], lifePop: 1 }; // what the last frame drew, for tests
function frameLoop(now) {
  if (!running) return;
  // Never below 0: a frame stamped before `last` (one already pending while start-up ran) would run
  // time backwards, and the waiting pulse's radius with it (specs/slow-tests-orbit-reef-runes.md).
  const raw = Math.min(0.05, Math.max(0, (now - last) / 1000 || 0));
  last = now;
  let dt = raw;
  if (game.slowmo > 0) {
    game.slowmo -= raw;
    dt = raw * 0.3;
  }
  if (atlas.complete && atlas.naturalWidth && bgCanvas) {
    if (!manual) update(dt);
    draw();
  }
  requestAnimationFrame(frameLoop);
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    running = false;
    sound.suspend();
  } else if (!running) {
    running = true;
    last = performance.now();
    sound.unlock();
    requestAnimationFrame(frameLoop);
  }
});

// ---------- UI ----------

ui.again.addEventListener('click', showStart);
ui.play.addEventListener('click', () => startGame(0));
ui.code.addEventListener('input', () => {
  ui.code.value = ui.code.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  ui.codeForm.classList.remove('wrong');
});
ui.codeForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const depth = depthForCode(ui.code.value);
  if (depth > 0) {
    ui.code.blur();
    startGame(depth);
    return;
  }
  ui.codeForm.classList.remove('wrong');
  void ui.codeForm.offsetWidth; // restart the shake
  ui.codeForm.classList.add('wrong');
  ui.codeMsg.textContent = ui.code.value ? 'That code doesn\u2019t open a level.' : 'Type a level code first.';
  sfx('bonk', { gain: 0.6 });
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

window.addEventListener('resize', () => {
  resize();
  readInsets();
});

atlas.decode().then(
  () => {
    resize();
    readInsets();
    // The reef is already alive behind the start card.
    for (let i = 0; i < targetPop(); i++) {
      const f = spawnOne(Math.random() < 0.15);
      f.x = rand(0, W);
      f.fade = 1;
    }
    showStart();
    farIn = 0.5;
    last = performance.now();
    requestAnimationFrame(frameLoop);
    // For tests and balance runs: read the state, and step the simulation without drawing.
    window.__reef = {
      game, player, input, startGame, showStart, codeFor, depthForCode, depths: DEPTHS, groundAt, currentAt, golden, frame, atlas, heard, dive: beginDive, step: update, isFood, isThreat, makePuffer, goal, chooseFish,
      npcs: () => npcs, eels: () => eels, world: () => ({ W, H, yMin, yMax }), drawn,
      set manual(v) { manual = v; },
      marks: () => Object.fromEntries(Object.entries(SPECIES).map(([k, v]) => [k, v.mark || null])),
    };
  },
  () => {}
);

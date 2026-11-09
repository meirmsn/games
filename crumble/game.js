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
  tideRises: 6, // rises until an undug tank's hull goes under
  tideDamage: 30,
  cpuDelay: 0.7,
  cpuSpreadAngle: [0.13, 0.08, 0.06], // radians, by battlefield, at assist 0
  cpuSpreadPower: [0.11, 0.07, 0.05],
  cpuWarmup: [1.6, 1.3, 1.0], // its first three shots of a battle are this much wider: it homes in
  assistSpread: 1.8, // spread × (1 + assist × this)
  assistStart: 0.25,
  assistUp: 0.35,
  assistDown: 0.2,
  digWeight: 0.6, // k: the CPU's value of a unit of drop against a point of damage
  sideMargin: 80,
  maxFlight: 8,
};

// A tank's size in world units: the art is drawn 1.2× its 64-unit base.
const TANK = { w: 77, half: 31, hull: 17, center: 24, radius: 28, pivot: 36, barrel: 38, k: 1.2 };

// The battlefields: each its own look and one new thing.
const FIELDS = [
  {
    name: 'Morning Beach',
    sky: ['#7cc7ee', '#bfe7f7', '#fff1d6'],
    far: '#b7ddd6',
    sun: { x: 0.78, y: 0.22, r: 38, color: '#fff6c4' },
    ground: ['#f2d9a6', '#dcb67d', '#a97d4b'],
    top: '#fbecc8',
    speck: '#b88a55',
    scorch: 'rgba(110,70,30,0.45)',
    water: 'rgba(52,160,200,0.78)',
    waterDeep: '#2a7ea8',
    foam: '#effcff',
    enemy: 'navy',
    debris: '#d9b47a',
    wind: 0,
    auger: false,
    girders: false,
    preview: 0.45,
    base: 0.66,
    rough: 1,
    mirror: true,
    slope: 0,
  },
  {
    name: 'Windy Point',
    sky: ['#4a3a78', '#d8705a', '#ffc98a'],
    far: '#7a4760',
    sun: { x: 0.2, y: 0.5, r: 46, color: '#ffdd9a' },
    ground: ['#d9834c', '#a9532f', '#6a3220'],
    top: '#a39250',
    speck: '#55291a',
    scorch: 'rgba(50,20,10,0.5)',
    water: 'rgba(58,104,146,0.8)',
    waterDeep: '#294a6c',
    foam: '#ffdcc0',
    enemy: 'desert',
    debris: '#b9693c',
    wind: 55,
    auger: true,
    girders: false,
    preview: 0.35,
    base: 0.68,
    rough: 0.8,
    mirror: false,
    slope: 0.36,
  },
  {
    name: 'Breakwater',
    sky: ['#121c3a', '#3a4a7c', '#d08a72'],
    far: '#25304f',
    sun: { x: 0.7, y: 0.18, r: 22, color: '#f3f0dc' },
    ground: ['#868b98', '#5e6370', '#363a45'],
    top: '#a9afba',
    speck: '#24272e',
    scorch: 'rgba(20,20,26,0.5)',
    water: 'rgba(28,66,98,0.82)',
    waterDeep: '#132c45',
    foam: '#c8dbee',
    enemy: 'grey',
    debris: '#7d8290',
    wind: 85,
    auger: true,
    girders: true,
    preview: 0.3,
    base: 0.66,
    rough: 0.9,
    mirror: true,
    slope: 0,
  },
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
  const d = { reached: 1, stars: [0, 0, 0], assist: TUNING.assistStart, taught: false };
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
};
const ready = (i) => i.complete && i.naturalWidth > 0;
const allImages = [...Object.values(IMG.body), IMG.tracks, IMG.turret, IMG.shell, IMG.auger, IMG.girder];
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
  return { side, x, y: 0, tilt: 0, vy: 0, falling: false, fallFrom: 0, armour: 100, aim: side === PLAYER ? 0.85 : Math.PI - 0.85, power: 0.6, augers: TUNING.augerCharges, sunk: 0, out: false, color, hitFlash: 0, swing: null };
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

function paintGirder(c, g) {
  c.save();
  c.globalCompositeOperation = 'source-over';
  const tile = g.w;
  for (let y = g.y; y < g.y + g.h - 0.5; y += tile) {
    const h = Math.min(tile, g.y + g.h - y);
    if (ready(IMG.girder)) c.drawImage(IMG.girder, 0, 0, IMG.girder.naturalWidth, (IMG.girder.naturalHeight * h) / tile, g.x, y, g.w, h);
    else {
      c.fillStyle = '#9aa3ad';
      c.fillRect(g.x, y, g.w, h);
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
  heights = makeHeights(W, H, { seed: game.seed, base: f.base, rough: f.rough, mirror: f.mirror, slope: f.slope, pads: [PX, CX] });
  terrain.fillFromHeights(heights);
  paintGround(f);
  terrain.steelPainter = paintGirder;
  if (f.girders) {
    for (const gx of [PX + 150, CX - 150]) {
      const top = Math.min(heights[gx - 22], heights[gx + 22]);
      terrain.addSteel({ x: gx - 20, y: top - 104, w: 40, h: 124 });
    }
  }
  tanks = [newTank(PLAYER, PX, 'green'), newTank(CPU, CX, f.enemy)];
  for (const t of tanks) {
    t.y = supportY(t).y;
    t.tilt = supportY(t).tilt;
  }
  // The tide: notches sized so an undug tank goes under after about TUNING.tideRises rises.
  const hulls = tanks.map(hullY);
  game.waterStart = H - 26;
  const avg = (hulls[0] + hulls[1]) / 2;
  game.notch = Math.max(12, (game.waterStart - avg) / TUNING.tideRises);
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
  const p = { ...launch(t, angle, power), age: 0, weapon, owner: side, trace: [], mode: 'fly', drillTo: 0, lastCarve: 0 };
  if (weapon === 'auger') t.augers = Math.max(0, t.augers - 1);
  t.shotsFired = (t.shotsFired || 0) + 1;
  game.projectile = p;
  game.phase = 'flight';
  game.shots++;
  sfx('fire', { rate: 0.95 + Math.random() * 0.1 });
  setTimeout(() => sfx('whoosh', { gain: 0.35, rate: 0.9 + Math.random() * 0.2 }), 80);
  fx.burst(p.x, p.y, { radius: 9, wind: game.wind, debris: null, power: 0.08 });
  updateHud();
}

function detonate(x, y, { direct = null, radius = TUNING.shellRadius, damage = TUNING.shellDamage, carve = true } = {}) {
  const t0 = performance.now();
  if (carve) terrain.carve(x, y, radius, { scorch: field().scorch });
  for (const t of tanks) settleTank(t, 0);
  carveTimes.push(performance.now() - t0);
  if (carveTimes.length > 300) carveTimes.shift();
  fx.burst(x, y, { radius, wind: game.wind, debris: field().debris });
  sfx('boom', { rate: 1.15 - radius / 120 + Math.random() * 0.1, gain: Math.min(1, radius / 36) });
  if (!game.damage) return;
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
      sfx('boom', { rate: 1.3, gain: 0.6 });
      endShot();
    }
    return;
  }
  if (p.trace.length === 0 || p.age - p.trace[p.trace.length - 1][2] > 0.03) p.trace.push([p.x, p.y, p.age]);
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
    detonate(hit.x, hit.y, { radius: p.weapon === 'auger' ? 18 : TUNING.shellRadius, damage: p.weapon === 'auger' ? 0 : TUNING.shellDamage });
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
  detonate(hit.x, hit.y, { direct: hit.kind === 'tank' ? hit.tank : null });
  endShot();
}

function endShot() {
  const p = game.projectile;
  if (p && p.owner === PLAYER) game.lastTrace = p.trace.map(([x, y]) => [x, y]);
  game.projectile = null;
  game.phase = 'settle';
  game.timer = 0;
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
function plan(shooter, target, { assist = store.assist, random = cpuRandom, weapon: forced, spreadAngle, spreadPower } = {}) {
  const f = field();
  const fi = game.field;
  const k = fi === 0 ? 0 : TUNING.digWeight;
  let weapon = forced || 'shell';
  if (!forced && f.auger && shooter.augers > 0 && game.mode === 'battle' && hullY(target) > game.waterY - game.notch) weapon = 'auger';
  const { depth } = augerShaft();
  const facing = target.x < shooter.x ? -1 : 1;
  let best = null;
  let bestLob = null;
  for (let a = 0.12; a <= 1.5; a += 0.02) {
    const angle = facing > 0 ? a : Math.PI - a;
    for (let pw = 0.25; pw <= 1.0001; pw += 0.025) {
      const hit = simulate(shooter, angle, pw);
      const dist = Math.abs(hit.x - target.x);
      if (!bestLob || dist < bestLob.dist) bestLob = { angle, power: pw, dist };
      if (hit.kind === 'out' || hit.kind === 'water') continue;
      let score = 0;
      const c = centerOf(target);
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
      if (score > 0 && (!best || score > best.score)) best = { angle, power: pw, score };
    }
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
    if (game.weapon === 'auger' && tanks[PLAYER].augers === 0) game.weapon = 'shell';
  } else {
    game.phase = 'cpu';
    game.timer = 0;
    const me = tanks[CPU];
    game.cpuPlan = plan(me, tanks[PLAYER]);
    me.swing = { from: me.aim, to: game.cpuPlan.angle };
  }
  updateHud();
}

function afterShot() {
  // Anyone out?
  const out = tanks.filter((t) => t.armour <= 0 && !t.out);
  if (out.length) return beginSinking(out);
  // The tide?
  if (game.mode === 'battle' && game.shots % TUNING.tideEvery === 0 && game.waterY > game.waterMin + 0.5) {
    game.waterTarget = Math.max(game.waterMin, game.waterY - game.notch);
    game.phase = 'tide';
    game.timer = 0;
    sfx('tide', { gain: 0.9 });
    updateHud();
    return;
  }
  startTurn(game.turn === PLAYER ? CPU : PLAYER);
}

function afterTide() {
  for (const t of tanks) if (!t.out && hullY(t) > game.waterY + 0.5) hurt(t, TUNING.tideDamage);
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
  if (field().auger && index === 1 && !store.stars[1]) {
    ui.augerBtn.classList.remove('pulse');
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
      if (me.swing) {
        const k = Math.min(1, game.timer / (TUNING.cpuDelay * 0.8));
        me.aim = me.swing.from + (me.swing.to - me.swing.from) * (1 - (1 - k) * (1 - k));
      }
      if (game.timer >= TUNING.cpuDelay) {
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
  if (terrain.carves > 26) setupBattle(0, { seed: 4, demo: true });
  const side = game.turn === PLAYER ? CPU : PLAYER;
  game.turn = side;
  const s = plan(tanks[side], tanks[1 - side], { assist: 1, random: Math.random, weapon: 'shell' });
  fire(side, 'shell', s.angle, s.power);
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
  c.translate(t.x, t.y + t.sunk * 50);
  c.rotate(t.tilt);
  // The barrel, under the body, from the turret's pivot.
  c.save();
  c.translate(0, -TANK.pivot + 2);
  const local = -(t.aim) - t.tilt;
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
  c.roundRect(x, y, Math.max(2, 52 * (t.armour / 100)), 6, 3);
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
  // Where the next notch will reach.
  if (game.mode === 'battle' && game.waterY > game.waterMin + 0.5) {
    const ny = Math.max(game.waterMin, game.waterY - game.notch);
    c.strokeStyle = f.foam;
    c.globalAlpha = 0.45;
    c.lineWidth = 1.5;
    c.setLineDash([10, 8]);
    c.beginPath();
    c.moveTo(left, ny);
    c.lineTo(right, ny);
    c.stroke();
    c.setLineDash([]);
    c.globalAlpha = 1;
  }
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
  // The power band: a stretched wedge from the barrel, as long as the pull.
  const dir = { x: Math.cos(t.aim), y: -Math.sin(t.aim) };
  const nx = -dir.y;
  const ny = dir.x;
  const bx = t.x + dir.x * 20;
  const by = t.y - TANK.pivot + dir.y * 20;
  const len = 20 + 90 * t.power;
  c.fillStyle = t.power > 0.98 ? 'rgba(255,214,90,0.75)' : 'rgba(255,255,255,0.6)';
  c.beginPath();
  c.moveTo(bx + nx * 2, by + ny * 2);
  c.lineTo(bx + dir.x * len + nx * (3 + 6 * t.power), by + dir.y * len + ny * (3 + 6 * t.power));
  c.lineTo(bx + dir.x * len - nx * (3 + 6 * t.power), by + dir.y * len - ny * (3 + 6 * t.power));
  c.lineTo(bx - nx * 2, by - ny * 2);
  c.closePath();
  c.fill();
  // The arc preview: the first part of the flight, without the wind.
  const p = { ...launch(t, t.aim, t.power), age: 0 };
  const flight = estimateFlight(t);
  const until = flight * field().preview;
  c.fillStyle = '#ffffff';
  let i = 0;
  while (p.age < until && i < 1000) {
    p.vy += TUNING.gravity * SIM;
    p.x += p.vx * SIM;
    p.y += p.vy * SIM;
    p.age += SIM;
    if (i % 5 === 0) {
      c.globalAlpha = 0.9 * (1 - p.age / until);
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
function estimateFlight(t) {
  const hit = { ...launch(t, t.aim, t.power), age: 0 };
  for (let i = 0; i < 1200; i++) {
    hit.vy += TUNING.gravity * SIM;
    hit.x += hit.vx * SIM;
    hit.y += hit.vy * SIM;
    hit.age += SIM;
    if (hit.y > game.waterY || terrain.solid(hit.x, hit.y) || hit.x < -80 || hit.x > W + 80) break;
  }
  return hit.age;
}

// Before the first aiming touch: a ghost finger pulls back beside the tank, the arc growing with it.
function drawGhost() {
  if (store.taught || game.mode !== 'battle' || game.phase !== 'aim' || aim.active) return;
  const t = tanks[PLAYER];
  const c = ctx;
  const cyc = (game.time % 2.2) / 2.2;
  const k = cyc < 0.15 ? 0 : cyc < 0.7 ? (cyc - 0.15) / 0.55 : 1;
  const ease = k * k * (3 - 2 * k);
  const sx = t.x + 260;
  const sy = t.y - 170;
  const x = sx - 110 * ease;
  const y = sy + 80 * ease;
  const alpha = cyc > 0.85 ? (1 - cyc) / 0.15 : Math.min(1, cyc / 0.1);
  c.globalAlpha = 0.85 * alpha;
  c.strokeStyle = 'rgba(255,255,255,0.7)';
  c.lineWidth = 2;
  c.setLineDash([4, 5]);
  c.beginPath();
  c.moveTo(sx, sy);
  c.lineTo(x, y);
  c.stroke();
  c.setLineDash([]);
  c.fillStyle = 'rgba(255,255,255,0.9)';
  c.beginPath();
  c.arc(x, y, 14, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = 'rgba(20,24,36,0.6)';
  c.lineWidth = 2;
  c.stroke();
  // The arc the ghost's pull would make: the start of it, as the real preview shows.
  const p = { ...launch(t, Math.atan2(80, 110), 0.25 + 0.5 * ease), age: 0 };
  c.fillStyle = '#ffffff';
  for (let i = 0; i < 40; i++) {
    p.vy += TUNING.gravity * SIM * 3;
    p.x += p.vx * SIM * 3;
    p.y += p.vy * SIM * 3;
    if (i % 2 === 0) {
      c.beginPath();
      c.arc(p.x, p.y, 2.8, 0, Math.PI * 2);
      c.fill();
    }
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
  drawDeep(f);
  if (terrain) ctx.drawImage(terrain.canvas, 0, 0, W, H);
  for (const t of tanks) drawTank(t);
  drawProjectile();
  fx.draw(ctx);
  drawWater(f);
  for (const t of tanks) {
    drawThreat(t);
    drawArmour(t);
  }
  drawAim();
  drawGhost();
  drawTexts();
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
  const max = 85;
  const bars = w === 0 ? 0 : Math.max(1, Math.round((Math.abs(w) / max) * 3));
  ui.wind.classList.toggle('calm', w === 0);
  ui.windArrow.style.transform = w < 0 ? 'scaleX(-1)' : '';
  ui.windBars.forEach((b, i) => b.classList.toggle('on', i < bars));
  ui.wind.setAttribute('aria-label', w === 0 ? 'No wind' : `Wind ${w > 0 ? 'right' : 'left'}, ${bars} of 3`);
  const done = game.waterY <= game.waterMin + 0.5;
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
  ui.augerBtn.setAttribute('aria-pressed', String(game.weapon === 'auger'));
}

function setStars(list, n) {
  list.forEach((s, i) => s.classList.toggle('on', i < n));
}

let pick = 0;
function showStart() {
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

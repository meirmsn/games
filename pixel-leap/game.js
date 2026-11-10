// Pixel Leap: build a monster, then run and jump through worlds drawn in different art styles.
//
// The rule (specs/pixel-leap.md): one tile is one world unit, every world draws its tiles at the
// same size on screen and all physics is in tiles; a world sets only its resolution (pixels per
// tile) and palette. Each level is its own world. A pixel world (Meadow and Frost at 18 px per
// tile, Ink at 16 in two colours) is drawn into a back buffer and scaled up with no smoothing, and
// the monster is baked to its grid; Candy is drawn smooth at 70 px per tile, and the HUD turns
// smooth with it. The leap between levels steps through the resolutions on screen.
import { mountShell } from '../shared/game-shell.js';
import { WORLDS, buildStage, T, ROWS, SOLID } from './worlds.js';
import { CANDY } from './candy-atlas.js';
import { MUSHROOM } from './mushroom-atlas.js';
import {
  PARTS, randomMonster, encode, decode, drawVector, bake, scaleFor, makeCanvas,
} from './monster.js';

// ---------------------------------------------------------------- movement (tiles, seconds)
export const MOVE = {
  top: 6.5, // run speed, tiles/s
  accel: 48,
  airAccel: 32,
  friction: 56,
  gravity: 37,
  jump: 15.7, // a held jump reaches jump² / 2g ≈ 3.3 tiles
  cut: 8.5, // letting go while rising caps the rise speed at this
  maxFall: 17,
  coyote: 0.1,
  buffer: 0.12,
  stomp: 11, // the bounce off a stomped walker; with jump held, `jump`
  spring: 21,
  jelly: 19.5,
  float: 3.2, // the ears' slow fall
  walker: 1.5,
  worm: 1.0,
  iceAccel: 22, // on ice you get going and stop more slowly
  iceFriction: 9,
  drip: 30, // a drip's fall
  hay: 13.6, // a haybale's bounce: about 2.5 tiles
  hayHigh: 19.2, // with jump held: about 5
  caps: [17.2, 21.1, 24.3], // a cap's launch, 4, 6 then 8 tiles, landing on cap after cap
  mover: 2, // moving platforms and lifts, tiles/s
  belt: 2.5, // conveyor belts
  swoop: 6, // a flyer's dive
  climb: 3, // a flyer's climb back
};
const CHAIN_MAX = 4; // the most extra coins one stomp in a chain pays
const LIVES = 3;
const ENEMY_SIZE = 1.5; // bad guys' size, in tiles
const MAX_SHIELDS = 2; // hearts you can hold: each takes one hit for you
const W_BOX = 0.7; // the monster's collision box, in tiles
const H_BOX = 1.3;
const STEP = 1 / 120;
const VERSION = 3; // best times are kept under this version of the levels
const KEY = 'pixel-leap';

// ---------------------------------------------------------------- the page
const canvas = document.getElementById('view');
const ctx = canvas.getContext('2d');
const deck = document.querySelector('[data-deck]');
const pad = document.querySelector('[data-pad]');
const jumpKey = document.querySelector('[data-jump]');
const hud = document.querySelector('[data-hud]');
const screens = {
  build: document.querySelector('[data-screen="build"]'),
  paused: document.querySelector('[data-screen="paused"]'),
  tally: document.querySelector('[data-screen="tally"]'),
};
const preview = document.querySelector('[data-preview]');
const pctx = preview.getContext('2d');

const SOUNDS = {};
for (const s of ['m', 'c']) {
  for (const n of ['jump', 'coin', 'stomp', 'poof', 'flag', 'land', 'music']) SOUNDS[`${s}-${n}`] = `sounds/${s}-${n}.mp3`;
}
for (const n of ['m-spring', 'm-part', 'c-crumble', 'c-bounce', 'pick', 'shuffle', 'leap', 'done', 'i-music', 'morph-up', 'morph-down']) SOUNDS[n] = `sounds/${n}.mp3`;
const { sound } = mountShell({ sounds: SOUNDS });
const heard = []; // the last sounds played, for tests
function play(name, opts) {
  heard.push(name);
  if (heard.length > 30) heard.shift();
  sound.play(name, opts);
}

const muteBtn = document.querySelector('[data-mute]');
function showMute() {
  muteBtn.setAttribute('aria-pressed', String(sound.muted));
  muteBtn.setAttribute('aria-label', sound.muted ? 'Unmute' : 'Mute');
}
muteBtn.addEventListener('click', () => {
  sound.muted = !sound.muted;
  showMute();
});
showMute();

// ---------------------------------------------------------------- memory (small, optional)
function readStore() {
  try {
    const v = JSON.parse(window.localStorage.getItem(KEY) || '{}');
    return v && typeof v === 'object' ? v : {};
  } catch (e) {
    return {};
  }
}
function writeStore(patch) {
  const v = { ...readStore(), ...patch };
  try {
    window.localStorage.setItem(KEY, JSON.stringify(v));
  } catch (e) {
    // Blocked storage: nothing is remembered, and nothing else changes.
  }
  return v;
}
const CODE_V = '1';
function codeOf(m) {
  return CODE_V + encode(m);
}
function monsterFromCode(code) {
  if (typeof code !== 'string' || code[0] !== CODE_V) return null;
  return decode(code.slice(1));
}

// ---------------------------------------------------------------- images
function loadImage(src) {
  const img = new Image();
  img.src = src;
  return img.decode().then(() => img);
}
const images = {};

// ---------------------------------------------------------------- state
const game = {
  mode: 'build', // build | play | paused | tally | wipe | leap | end
  world: 0,
  stage: 0,
  coins: 0, // this level's
  coinsTotal: 0, // this level's, out of (a heart counts as a coin too)
  time: 0, // this level's, counted only while playing
  lives: LIVES,
  shields: 0, // hearts held, at most MAX_SHIELDS
  runCoins: 0, // the whole run's, shown at its end
  runTime: 0,
  map: null, // the world map between levels: { from, to }
  ears: false, // the prize, found on this run
  earsThisWorld: false,
  deaths: 0, // lives lost since the last level cleared (game overs included): the hidden assist
  assist: 0,
  modeT: 0,
  leapFrom: 0,
  resumeFrom: 'play',
  t: 0,
};
let monster = randomMonster();
let stage = null; // the built stage, with live things
let baked = null; // the monster's frames for a pixel world: { worldId, ...bake() }
const player = {
  x: 0, y: 0, vx: 0, vy: 0, face: 1, ground: false, coyote: 0, buffer: 0, jumpHeld: false,
  invul: 0, poof: 0, land: 0, run: 0, checkpoint: null, onCookie: null, wasGround: false, airTime: 0,
};
const input = { left: false, right: false, jump: false, keys: new Set(), padDir: 0, padId: null, jumpId: null };
const cam = { x: 0, y: 0, lead: 0 };
const particles = [];
const view = { cssW: 0, cssH: 0, ratio: 2, W: 0, H: 0, k: 1, U: 18, tilesW: 1, tilesH: 1, bw: 0, bh: 0 };
let buffer = makeCanvas(1, 1);
let bctx = buffer.getContext('2d');
let renderRes = 18; // the resolution the last frame was drawn at, for tests
let manual = false; // tests own the clock
let stopMusic = () => {};
let builderPan = 0;

// ---------------------------------------------------------------- layout: the size of a tile
function isTouch() {
  return (window.matchMedia && matchMedia('(pointer: coarse)').matches) || navigator.maxTouchPoints > 0;
}
function layout() {
  document.body.classList.toggle('touch', isTouch());
  const r = canvas.getBoundingClientRect();
  view.cssW = Math.max(1, r.width);
  view.cssH = Math.max(1, r.height);
  view.ratio = Math.min(3, Math.max(2, window.devicePixelRatio || 1));
  view.W = Math.round(view.cssW * view.ratio);
  view.H = Math.round(view.cssH * view.ratio);
  canvas.width = view.W;
  canvas.height = view.H;
  // A tile is a whole multiple of 18 canvas pixels: about 13 across in portrait, 10 tall in landscape.
  let k;
  if (view.cssH >= view.cssW) {
    k = Math.max(1, Math.round(view.W / (13 * 18)));
    while (k > 1 && view.W / (18 * k) < 12) k--;
  } else {
    k = Math.max(1, Math.round(view.H / (10 * 18)));
    while (k > 1 && view.W / (18 * k) < 12) k--;
  }
  view.k = k;
  view.U = 18 * k;
  view.tilesW = view.W / view.U;
  view.tilesH = view.H / view.U;
  view.bw = Math.ceil(view.W / k);
  view.bh = Math.ceil(view.H / k);
  buffer = makeCanvas(view.bw, view.bh);
  bctx = buffer.getContext('2d');
}
let lastSize = '';
function onResize() {
  const size = `${window.innerWidth}x${window.innerHeight}`;
  if (size === lastSize) return;
  lastSize = size;
  layout();
  releaseAll();
  if (game.mode === 'play') pause();
  snapCamera();
}
window.addEventListener('resize', onResize);

// ---------------------------------------------------------------- stages
function world() {
  return WORLDS[game.world];
}
function loadStage(w, s) {
  game.world = w;
  game.stage = s;
  const st = buildStage(WORLDS[w].stages[s], WORLDS[w].rows);
  st.things = st.things.map((t, i) => ({
    ...t, id: i, sx: t.x, sy: t.y, alive: true, dir: -1, t: 0, state: t.type === 'flyer' ? 'hover' : 'whole', got: false,
    dx: 0, dy: 0, vx: 0,
  }));
  st.movers = st.things.filter((t) => t.type === 'mover');
  st.surfaces = st.things.filter((t) => t.type === 'mover' || t.type === 'cap');
  placeMovers(st, 0);
  stage = st;
  game.inNext = false;
  game.morphT = 0;
  player.checkpoint = { x: st.start.x, y: st.start.y };
  respawn(true);
  ensureBaked();
  showStyle();
}
function respawn(fresh = false) {
  player.x = player.checkpoint.x;
  player.y = player.checkpoint.y;
  player.vx = 0;
  player.vy = 0;
  player.ground = true;
  player.poof = 0;
  player.carry = 0;
  player.onMover = null;
  player.groundTile = T.GROUND;
  game.capChain = 0;
  game.stompChain = 0;
  player.invul = fresh ? 0 : 0.6;
  player.face = 1;
  snapCamera();
}
// The monster's baked frames for a pixel world, kept per world, so the glimpse of the next world
// can draw it in that world's style too.
const bakeCache = new Map();
function bakedFor(w) {
  if (!w || w.smooth) return null;
  const key = `${w.id}:${codeOf(monster)}:${game.ears}`;
  let b = bakeCache.get(key);
  if (!b) {
    b = { key, ...bake(images.monster, monster, w.res, { outline: w.outline, ears: game.ears, oneBit: w.oneBit, fixed: w.fixed }) };
    bakeCache.set(key, b);
    if (bakeCache.size > 16) bakeCache.delete(bakeCache.keys().next().value);
  }
  return b;
}
function ensureBaked() {
  // In a smooth world the HUD's life icons still come from the first world's frames.
  baked = bakedFor(world()) || bakedFor(WORLDS[0]);
}

// ---------------------------------------------------------------- collision
function tileAt(tx, ty) {
  if (tx < 0 || tx >= stage.cols) return T.GROUND; // the stage's ends are walls
  if (ty < 0) return T.AIR;
  if (ty >= stage.rows) return T.AIR;
  return stage.grid[ty * stage.cols + tx];
}
function solid(tx, ty) {
  return SOLID.has(tileAt(tx, ty));
}
function cookieAt(tx, ty) {
  for (const t of stage.things) {
    if (t.type === 'cookie' && t.state !== 'gone' && Math.floor(t.x) === tx && t.y === ty) return t;
  }
  return null;
}
function topSurface(tx, ty) {
  const t = tileAt(tx, ty);
  return SOLID.has(t) || t === T.ONEWAY || Boolean(cookieAt(tx, ty));
}

// Feet that clip a ledge's corner, a hair below its top, are lifted onto it instead of stopping.
function stepUp(tx, ty) {
  const p = player;
  const below = p.y - ty;
  if (p.vy < 0 || below <= 0 || below > 0.3 * (1 + game.assist)) return false;
  if (solid(tx, ty - 1) || solid(tx, ty - 2)) return false;
  p.y = ty;
  p.vy = 0;
  return true;
}

function movePlayer(dt) {
  const p = player;
  // Horizontal: your own speed, plus what carries you (a belt underfoot, or a platform you jumped off).
  p.x += (p.vx + (p.carry || 0)) * dt;
  const top = p.y - H_BOX;
  const r0 = Math.floor(top + 0.01);
  const r1 = Math.floor(p.y - 0.01);
  if (p.vx > 0) {
    const tx = Math.floor(p.x + W_BOX / 2);
    for (let ty = r0; ty <= r1; ty++) {
      if (solid(tx, ty)) {
        if (stepUp(tx, ty)) break;
        p.x = tx - W_BOX / 2 - 0.001;
        p.vx = 0;
        break;
      }
    }
  } else if (p.vx < 0) {
    const tx = Math.floor(p.x - W_BOX / 2);
    for (let ty = r0; ty <= r1; ty++) {
      if (solid(tx, ty)) {
        if (stepUp(tx, ty)) break;
        p.x = tx + 1 + W_BOX / 2 + 0.001;
        p.vx = 0;
        break;
      }
    }
  }
  // Vertical.
  const prevY = p.y;
  p.y += p.vy * dt;
  const c0 = Math.floor(p.x - W_BOX / 2 + 0.01);
  const c1 = Math.floor(p.x + W_BOX / 2 - 0.01);
  p.ground = false;
  p.onCookie = null;
  p.onMover = null;
  p.onCap = null;
  if (p.vy >= 0) {
    const ty = Math.floor(p.y);
    if (ty >= 0 && ty < stage.rows && Math.floor(prevY - 0.001) < ty + 0.5) {
      for (let tx = c0; tx <= c1; tx++) {
        const t = tileAt(tx, ty);
        const ck = cookieAt(tx, ty);
        const oneWayOk = prevY <= ty + landingGrace();
        if (SOLID.has(t) || ((t === T.ONEWAY || ck) && oneWayOk)) {
          p.y = ty;
          p.vy = 0;
          p.ground = true;
          p.groundTile = ck ? T.ONEWAY : t;
          if (ck) p.onCookie = ck;
          break;
        }
      }
    }
    // Moving platforms, lifts and caps: landed on from above, like a one-way ledge.
    for (const m of stage.surfaces) {
      if (p.x + W_BOX / 2 - 0.02 <= m.x || p.x - W_BOX / 2 + 0.02 >= m.x + m.w) continue;
      if (prevY > m.y + landingGrace() || p.y < m.y) continue;
      if (p.ground && p.y <= m.y) continue;
      p.y = m.y;
      p.vy = 0;
      p.ground = true;
      p.onCookie = null;
      p.groundTile = T.ONEWAY;
      if (m.type === 'mover') p.onMover = m;
      else p.onCap = m;
    }
  } else {
    const ty = Math.floor(p.y - H_BOX);
    for (let tx = c0; tx <= c1; tx++) {
      if (solid(tx, ty)) {
        p.y = ty + 1 + H_BOX;
        p.vy = 0;
        break;
      }
    }
  }
}

// The hurtbox is smaller than the drawing, so a brush with a spike's tip isn't a poof.
function hurtbox() {
  return { l: player.x - W_BOX * 0.36, r: player.x + W_BOX * 0.36, t: player.y - H_BOX * 0.8, b: player.y - 0.05 };
}
function overlaps(a, l, t, r, b) {
  return a.l < r && a.r > l && a.t < b && a.b > t;
}

// ---------------------------------------------------------------- the simulation
function update(dt) {
  game.t += dt;
  game.modeT += dt;
  for (const p of particles) {
    p.t += dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += (p.g || 0) * dt;
  }
  for (let i = particles.length - 1; i >= 0; i--) if (particles[i].t > particles[i].life) particles.splice(i, 1);
  if (game.mode === 'build') {
    builderPan += dt;
    animateThings(dt, false);
    cam.x = Math.max(0, Math.min(stage.cols - view.tilesW, 2 + (Math.sin(builderPan * 0.12 - Math.PI / 2) + 1) * 8));
    cam.y = stage.rows - 1.2 - view.tilesH;
    return;
  }
  if (game.mode === 'map') {
    if (game.modeT >= MAP.enter) {
      // Into the world: the leap's steps from the map's pixels to the world's own rule.
      startWorld(game.map.to, game.map.to === 0);
      game.leapFrom = 0;
      game.leapt = true;
      setMode('leap');
      play('leap', { gain: 0.7 });
    } else if (game.modeT >= MAP.paint && !game.map.painted) {
      game.map.painted = true;
      play('m-part', { gain: 0.5 });
    }
    return;
  }
  if (game.mode === 'leap') {
    if (game.modeT >= 0.3 && !game.leapt) {
      game.leapt = true;
      startWorld(game.world + 1);
    }
    if (game.modeT >= 1.6) {
      setMode('play');
      music();
      showBanner();
    }
    return;
  }
  if (game.mode !== 'play') return;
  game.time += dt;
  placeMovers(stage, dt);
  stepPlayer(dt);
  crossing(dt);
  animateThings(dt, true);
  updateCamera(dt);
}

// Stepping into the glimpse of the next world redraws the monster in that world's style: it steps
// through the resolutions between the two (MORPH s), with a rising sound into a smooth world and a
// falling one out of it. Stepping back out does the same the other way.
const MORPH = 0.5;
function crossing(dt) {
  game.morphT = Math.max(0, (game.morphT || 0) - dt);
  const w = world();
  const wn = WORLDS[game.world + 1];
  if (!wn) return;
  const inNext = player.x >= stage.next;
  if (inNext === game.inNext) return;
  game.inNext = inNext;
  const from = inNext ? w : wn;
  const to = inNext ? wn : w;
  // Only a change between pixels and smooth steps through resolutions; between two pixel worlds
  // (even Pico's 8 into Ink's 16) the monster is redrawn straight in the new style.
  if (from.smooth === to.smooth) return;
  game.morphT = MORPH;
  game.morphFrom = from;
  play(to.smooth ? 'morph-up' : 'morph-down', { gain: 0.8 });
}

function setMode(m) {
  game.mode = m;
  game.modeT = 0;
  showScreens();
}

function coyoteTime() {
  return MOVE.coyote * (1 + game.assist);
}
// Feet that just passed a ledge's top still land on it; the hidden assist widens this.
function landingGrace() {
  return 0.12 * (1 + game.assist);
}
function bufferTime() {
  return MOVE.buffer * (1 + game.assist);
}

function stepPlayer(dt) {
  const p = player;
  p.invul = Math.max(0, p.invul - dt);
  p.land = Math.max(0, p.land - dt);
  if (p.poof > 0) {
    p.poof -= dt;
    if (p.poof <= 0) afterLostLife();
    return;
  }
  // A platform or lift you stand on carries you with it; a belt underfoot carries you its way.
  if (p.onMover && p.ground) {
    p.x += p.onMover.dx;
    p.y += p.onMover.dy;
  }
  if (p.ground) {
    const belt = p.groundTile === T.BELTR ? 1 : p.groundTile === T.BELTL ? -1 : 0;
    p.carry = belt * MOVE.belt;
  }
  const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  const ice = world().ice && p.ground;
  const accel = p.ground ? (ice ? MOVE.iceAccel : MOVE.accel) : MOVE.airAccel;
  if (dir) {
    p.vx += dir * accel * dt;
    p.vx = Math.max(-MOVE.top, Math.min(MOVE.top, p.vx));
    p.face = dir;
  } else if (p.ground) {
    const f = (ice ? MOVE.iceFriction : MOVE.friction) * dt;
    p.vx = Math.abs(p.vx) <= f ? 0 : p.vx - Math.sign(p.vx) * f;
  } else {
    p.vx *= 1 - 2 * dt;
  }
  // Jump: buffered presses and coyote time.
  p.buffer = Math.max(0, p.buffer - dt);
  p.coyote = p.ground ? coyoteTime() : Math.max(0, p.coyote - dt);
  if (p.buffer > 0 && p.coyote > 0) {
    p.vy = -MOVE.jump;
    p.ownJump = true;
    p.buffer = 0;
    p.coyote = 0;
    p.ground = false;
    p.airTime = 0;
    // A jump off a moving platform keeps its sideways motion.
    if (p.onMover) p.carry = p.onMover.vx;
    play(`${world().sound}-jump`, { rate: 0.96 + Math.random() * 0.08 });
    dust(p.x, p.y, 4);
  }
  // Letting go cuts your own jump short; a spring's or a stomp's launch isn't cut.
  if (p.vy >= 0) p.ownJump = false;
  if (p.ownJump && !input.jump && p.vy < -MOVE.cut) p.vy = -MOVE.cut;
  // Gravity; the ears float you down while jump is held.
  p.vy += MOVE.gravity * dt;
  const floating = game.ears && input.jump && p.vy > 0;
  p.vy = Math.min(p.vy, floating ? MOVE.float : MOVE.maxFall);
  p.floating = floating;
  const wasGround = p.ground;
  const fallSpeed = p.vy;
  movePlayer(dt);
  if (!p.ground) p.airTime += dt;
  if (p.ground && !wasGround) {
    game.stompChain = 0; // a landing ends a stomp chain
    if (!p.onMover) p.carry = 0;
    if (p.onCap) {
      // A cap launches you: higher for each cap you land on without touching anything else.
      const v = MOVE.caps[Math.min(MOVE.caps.length - 1, game.capChain)];
      game.capChain++;
      bounceOff(v, p.onCap);
      play('c-bounce', { rate: 0.9 + Math.min(2, game.capChain - 1) * 0.12 });
      return afterMove(dt);
    }
    game.capChain = 0;
    if (p.groundTile === T.HAY) {
      bounceOff(input.jump ? MOVE.hayHigh : MOVE.hay, null);
      play('m-spring', { rate: 0.8, gain: 0.8 });
      dust(p.x, p.y, 5);
      return afterMove(dt);
    }
  }
  if (p.ground && !wasGround && p.airTime > 0.12) {
    p.land = 0.12;
    if (fallSpeed > 6) {
      play(`${world().sound}-land`, { gain: Math.min(1, fallSpeed / 16) });
      dust(p.x, p.y, 5);
    }
  }
  if (p.ground) {
    p.airTime = 0;
    p.coyote = coyoteTime();
  }
  return afterMove(dt);
}

// A bounce off a haybale or a cap: an automatic launch, not cut short by letting go of jump.
function bounceOff(v, thing) {
  const p = player;
  p.vy = -v;
  p.ground = false;
  p.ownJump = false;
  p.airTime = 0;
  p.coyote = 0;
  p.onMover = null;
  if (thing) thing.boing = 0.3;
}

function afterMove(dt) {
  const p = player;
  if (p.ground && Math.abs(p.vx) > 0.5) p.run += (Math.abs(p.vx) / MOVE.top) * dt * 2.6;
  // A cookie you stand on starts to crumble.
  if (p.onCookie && p.onCookie.state === 'whole') {
    p.onCookie.state = 'shaking';
    p.onCookie.t = 0;
  }
  // Falling off the bottom: no heart saves you from that.
  if (p.y > stage.rows + 1.5) return loseLife();
  // Spikes.
  const hb = hurtbox();
  for (let ty = Math.floor(hb.t); ty <= Math.floor(hb.b); ty++) {
    for (let tx = Math.floor(hb.l); tx <= Math.floor(hb.r); tx++) {
      if (tileAt(tx, ty) === T.SPIKES && overlaps(hb, tx + 0.12, ty + 0.45, tx + 0.88, ty + 1)) return hit(tx + 0.5);
    }
  }
  touchThings(hb);
}

function touchThings(hb) {
  const p = player;
  const s = world().sound;
  for (const t of stage.things) {
    if (!t.alive) continue;
    switch (t.type) {
      case 'coin':
        if (!t.got && Math.abs(t.x - p.x) < 0.75 && t.y > p.y - H_BOX - 0.45 && t.y < p.y + 0.3) {
          t.got = true;
          t.alive = false;
          game.coins++;
          game.chain = game.t - (game.lastCoin || -9) < 0.7 ? (game.chain || 0) + 1 : 0;
          game.lastCoin = game.t;
          play(`${s}-coin`, { rate: 1 + Math.min(game.chain, 8) * 0.05, gain: 0.8 });
          sparkle(t.x, t.y);
        }
        break;
      case 'heart':
        // A heart is a coin that also shields you from one hit, if you have room for it.
        if (Math.abs(t.x - p.x) < 0.75 && t.y > p.y - H_BOX - 0.45 && t.y < p.y + 0.3) {
          t.alive = false;
          game.coins++;
          if (game.shields < MAX_SHIELDS) {
            game.shields++;
            play(`${s}-flag`, { gain: 0.8 });
          } else play(`${s}-coin`, { gain: 0.8 });
          sparkle(t.x, t.y);
        }
        break;
      case 'drip':
        if (overlaps(hb, t.x - 0.3, t.y, t.x + 0.3, t.y + 0.8)) return hit(t.x);
        break;
      case 'ears':
        if (Math.abs(t.x - p.x) < 0.8 && t.y > p.y - H_BOX - 0.6 && t.y < p.y + 0.4) {
          t.alive = false;
          game.ears = true;
          game.earsThisWorld = true;
          baked = null;
          ensureBaked();
          play('m-part');
          for (let i = 0; i < 3; i++) sparkle(t.x, t.y);
        }
        break;
      case 'spring':
      case 'jelly':
        if (p.vy >= 0 && Math.abs(t.x - p.x) < 0.7 && p.y > t.y - 0.65 && p.y <= t.y + 0.05) {
          p.y = t.y - 0.6;
          p.vy = -(t.type === 'spring' ? MOVE.spring : MOVE.jelly);
          p.airTime = 0;
          p.coyote = 0;
          t.t = 0;
          t.boing = 0.3;
          play(t.type === 'spring' ? 'm-spring' : 'c-bounce');
        }
        break;
      case 'walker':
      case 'flyer':
      case 'worm': {
        const hw = t.type === 'worm' ? 0.7 : 0.4 * ENEMY_SIZE;
        const hh = t.type === 'worm' ? 0.55 : (t.type === 'flyer' ? 0.7 : 0.8) * ENEMY_SIZE;
        if (!overlaps({ l: p.x - W_BOX / 2, r: p.x + W_BOX / 2, t: p.y - H_BOX, b: p.y }, t.x - hw, t.y - hh, t.x + hw, t.y)) break;
        // A stomp: falling, with your feet above its middle. A spiky walker can't be stomped.
        if (t.kind !== 'spiky' && p.vy > 0 && p.y - p.vy * STEP <= t.y - hh * 0.5 + 0.15) {
          t.alive = false;
          t.squash = 0;
          p.vy = -(input.jump ? MOVE.jump : MOVE.stomp);
          p.airTime = 0;
          play(`${s}-stomp`, { rate: 1 + Math.min(game.stompChain, 5) * 0.08 });
          dust(t.x, t.y - 0.2, 6);
          // A stomp chain: each stomp after the first before you land pays extra, in a world whose
          // rule it is (Pico).
          game.stompChain++;
          const extra = world().chain ? Math.min(CHAIN_MAX, game.stompChain - 1) : 0;
          if (extra > 0) {
            game.coins += extra;
            game.chainPaid = (game.chainPaid || 0) + extra;
            particles.push({ x: t.x, y: t.y - 1.6, vx: 0, vy: -1.5, t: 0, life: 0.9, kind: 'text', text: `+${extra}`, size: 0.6 });
            play(`${s}-coin`, { rate: 1.2 + extra * 0.08 });
          }
        } else if (overlaps(hb, t.x - hw * 0.8, t.y - hh * 0.85, t.x + hw * 0.8, t.y)) {
          return hit(t.x);
        }
        break;
      }
      case 'portal':
        // Anywhere in the doorway, two tiles tall: a jump through it counts too.
        if (Math.abs(t.x - p.x) < 0.7 && p.y > t.y - 2.4 && p.y < t.y + 0.5) {
          enterPortal();
          return;
        }
        break;
      default:
    }
  }
}

// Touching a hazard: a heart takes the hit if you hold one (you're knocked back and safe for a
// moment); otherwise it costs a life.
function hit(fromX) {
  const p = player;
  if (p.invul > 0 || p.poof > 0) return;
  game.stompChain = 0; // a hit ends a stomp chain
  if (game.shields > 0) {
    game.shields--;
    p.invul = 1.2;
    p.vy = -9;
    p.vx = (p.x < fromX ? -1 : 1) * 5;
    p.ground = false;
    p.ownJump = false;
    game.shieldPop = 0.6;
    play(`${world().sound}-stomp`, { rate: 0.7 });
    sparkle(p.x, p.y - 0.8);
    return;
  }
  loseLife();
}

// A life lost: a poof, then the level starts again from its beginning; with none left, game over.
function loseLife() {
  const p = player;
  if (p.poof > 0) return;
  p.poof = 0.6;
  p.vx = 0;
  p.vy = 0;
  game.lives--;
  game.deaths++;
  game.lifePop = 0.8;
  // The hidden assist: after 2 lives lost since the last level cleared, a little more coyote, buffer
  // and landing grace. It never touches enemies or hazards.
  if (game.deaths >= 2) game.assist = Math.min(1, (game.deaths - 1) * 0.34);
  play(`${world().sound}-poof`);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    particles.push({ x: p.x, y: Math.min(p.y, stage.rows) - 0.7, vx: Math.cos(a) * 3.2, vy: Math.sin(a) * 3.2, t: 0, life: 0.45, kind: 'puff', size: 0.32 });
  }
}
function afterLostLife() {
  if (game.lives <= 0) return gameOver();
  restartLevel();
}
function restartLevel() {
  game.coins = 0;
  game.time = 0;
  game.shields = Math.min(game.shields, MAX_SHIELDS);
  game.ears = game.earsBefore; // the ears found in this level are lost with it
  game.earsThisWorld = false;
  baked = null;
  loadStage(game.world, 0);
  player.invul = 0.6;
}

function animateThings(dt, live) {
  for (const t of stage.things) {
    t.t += dt;
    if (t.boing) t.boing = Math.max(0, t.boing - dt);
    if (t.type === 'cookie') {
      if (t.state === 'shaking' && t.t >= 0.5) {
        t.state = 'gone';
        t.t = 0;
        if (live) play('c-crumble', { gain: 0.8 });
        for (let i = 0; i < 5; i++) particles.push({ x: t.x + (Math.random() - 0.5) * 0.8, y: t.y + 0.2, vx: (Math.random() - 0.5) * 2, vy: -1 - Math.random() * 2, g: 20, t: 0, life: 0.8, kind: 'crumb', size: 0.18 });
      } else if (t.state === 'gone' && t.t >= 3) {
        const p = player;
        const inside = Math.abs(p.x - t.x) < 0.9 && p.y > t.y && p.y - H_BOX < t.y + 1;
        if (!inside) {
          t.state = 'whole';
          t.t = 0;
        }
      }
    }
    if (t.type === 'drip' && t.alive && live) {
      // A drip lets go as you come near, so it lands just ahead of a monster running at full
      // speed; slow down under it, or jump up into it, and it catches you. It shatters on the ground.
      const p = player;
      if (!t.falling && t.x - p.x < 4.5 && t.x - p.x > -0.5 && p.y > t.y) t.falling = true;
      if (t.falling) {
        t.vy = (t.vy || 0) + MOVE.drip * dt;
        t.y += t.vy * dt;
        if (topSurface(Math.floor(t.x), Math.floor(t.y + 0.8)) || t.y > stage.rows) {
          t.alive = false;
          for (let i = 0; i < 4; i++) particles.push({ x: t.x, y: t.y + 0.6, vx: (Math.random() - 0.5) * 4, vy: -2 - Math.random() * 2, g: 25, t: 0, life: 0.5, kind: 'crumb', size: 0.15 });
        }
      }
    }
    if (t.type === 'flyer' && t.alive && live) flyerStep(t, dt);
    if ((t.type === 'walker' || t.type === 'worm') && t.alive && live) {
      const speed = t.type === 'worm' ? MOVE.worm : MOVE.walker;
      const nx = t.x + t.dir * speed * dt;
      const ahead = Math.floor(nx + t.dir * 0.5);
      const row = Math.round(t.y);
      const blocked = solid(ahead, row - 1) || !topSurface(ahead, row);
      if (blocked) t.dir = -t.dir;
      else t.x = nx;
    }
  }
}

// Moving platforms and lifts: back and forth along their track at MOVE.mover tiles/s, starting at
// `phase` of the way along it. Each keeps how far it moved this step, to carry what stands on it.
function placeMovers(st, dt) {
  for (const m of st.movers) {
    m.mt = (m.mt || 0) + dt;
    const f = (((m.mt * MOVE.mover) / m.range + 2 * m.phase) % 2 + 2) % 2;
    const u = (f < 1 ? f : 2 - f) * m.range;
    const nx = m.axis === 'x' ? m.sx + u : m.sx;
    const ny = m.axis === 'y' ? m.sy - u : m.sy;
    m.dx = nx - m.x;
    m.dy = ny - m.y;
    m.vx = dt > 0 ? m.dx / dt : 0;
    m.x = nx;
    m.y = ny;
  }
}

// A flyer hovers where it was put, bobbing; when the monster, on the ground, comes within 5 tiles
// ahead of it, it swoops at where the monster stood, then climbs back home and waits a moment before the next.
function flyerStep(t, dt) {
  const p = player;
  if (t.state === 'hover') {
    t.wait = Math.max(0, (t.wait || 0) - dt);
    t.y = t.sy + Math.sin(game.t * 3 + t.id) * 0.15;
    t.x = t.sx;
    const ahead = t.x - p.x;
    // It dives only at a monster on the ground, at where it stands: keep moving and it misses.
    if (!t.wait && p.ground && ahead > 0 && ahead <= 5 && p.y > t.y && p.y - t.y < 8 && p.poof <= 0) {
      t.state = 'swoop';
      t.tx = p.x;
      t.ty = p.y;
      t.dir = p.x < t.x ? -1 : 1;
    }
  } else {
    const back = t.state === 'return';
    const gx = back ? t.sx : t.tx;
    const gy = back ? t.sy : t.ty;
    const dx = gx - t.x;
    const dy = gy - t.y;
    const d = Math.hypot(dx, dy);
    const step = (back ? MOVE.climb : MOVE.swoop) * dt;
    if (d <= step || (!back && t.y >= gy)) {
      if (back) {
        t.state = 'hover';
        t.wait = 1.2;
        t.x = t.sx;
        t.y = t.sy;
      } else t.state = 'return';
    } else {
      t.x += (dx / d) * step;
      t.y += (dy / d) * step;
      if (Math.abs(dx) > 0.05) t.dir = Math.sign(dx);
    }
  }
}

function updateCamera(dt) {
  const p = player;
  const want = Math.max(-1, Math.min(1, p.vx / MOVE.top)) * Math.min(3, view.tilesW * 0.22);
  cam.lead += (want - cam.lead) * Math.min(1, dt * 2.5);
  const tx = p.x - view.tilesW / 2 + cam.lead;
  // Launched up hard (a spring, a cap), the camera looks up ahead of you, so the landing is in view.
  const ty = p.y - view.tilesH * (p.vy < -12 ? 0.8 : 0.62);
  cam.x += (tx - cam.x) * Math.min(1, dt * 8);
  cam.y += (ty - cam.y) * Math.min(1, dt * (p.vy < -12 ? 9 : 5));
  clampCamera();
}
function clampCamera() {
  cam.x = Math.max(0, Math.min(stage.cols - view.tilesW, cam.x));
  // Show at most a tile and a bit below the usual ground line's depth: pits still read as bottomless.
  cam.y = Math.min(stage.rows - 1.2 - view.tilesH, cam.y);
  if (stage.cols < view.tilesW) cam.x = (stage.cols - view.tilesW) / 2;
}
function snapCamera() {
  if (!stage) return;
  cam.lead = 0;
  cam.x = player.x - view.tilesW / 2;
  cam.y = player.y - view.tilesH * 0.62;
  clampCamera();
}

function dust(x, y, n) {
  for (let i = 0; i < n; i++) {
    particles.push({ x: x + (Math.random() - 0.5) * 0.6, y: y - 0.1, vx: (Math.random() - 0.5) * 3, vy: -Math.random() * 1.5, t: 0, life: 0.35, kind: 'dust', size: 0.16 });
  }
}
function sparkle(x, y) {
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    particles.push({ x, y, vx: Math.cos(a) * 2.4, vy: Math.sin(a) * 2.4, t: 0, life: 0.35, kind: 'spark', size: 0.12 });
  }
}

// ---------------------------------------------------------------- worlds, the tally and the leap
function startWorld(w, keepAssist = true) {
  game.coins = 0;
  game.time = 0;
  if (!keepAssist) {
    game.deaths = 0;
    game.assist = 0;
  }
  game.earsThisWorld = false;
  game.earsBefore = game.ears;
  const built = buildStage(WORLDS[w].stages[0], WORLDS[w].rows);
  game.coinsTotal = built.coins + built.things.filter((t) => t.type === 'heart').length;
  loadStage(w, 0);
}
// A new run: three lives, no hearts, from the first level.
function newRun() {
  game.lives = LIVES;
  game.shields = 0;
  game.ears = false;
  game.runCoins = 0;
  game.runTime = 0;
  baked = null;
  startWorld(0, true); // a game over keeps the assist it earned
  showMap(-1, 0);
}

// The world map: the levels as cells on a path carved into a wall. The cells you've been to, and
// the one you're heading for, are lit; the rest are dark hollows in the wall. Between levels the
// path to the next cell is painted in, the monster walks along it and steps in, and the world opens.
// A tap or a key skips ahead to the step in.
const MAP = { paint: 0.5, walk: 1.3, arrive: 2.4, enter: 2.8 };
function showMap(from, to) {
  stopMusic();
  banner.hidden = true;
  game.map = { from, to, painted: false };
  setMode('map');
}
function skipMap() {
  if (game.mode === 'map' && game.modeT < MAP.arrive) game.modeT = MAP.arrive;
}
// The run's statistics, shown only at its end: game over, or past the last level's door.
function showStats(title, note) {
  const best = (readStore().best || {})[`${VERSION}:run`];
  document.querySelector('[data-tally-title]').textContent = title;
  document.querySelector('[data-tally-coins]').textContent = String(game.runCoins);
  document.querySelector('[data-tally-time]').textContent = clock(game.runTime);
  document.querySelector('[data-tally-prize]').textContent = game.ears ? 'Ears!' : '—';
  document.querySelector('[data-tally-best]').textContent = clock(best);
  document.querySelector('[data-tally-note]').textContent = note;
  document.querySelector('[data-leap]').textContent = 'Play again';
  document.querySelector('[data-rebuild]').hidden = false;
  setMode('tally');
}
function gameOver() {
  stopMusic();
  play('done', { rate: 0.7 });
  game.runCoins += game.coins;
  game.runTime += game.time;
  game.over = true;
  game.last = false;
  showStats('Game over', `You reached level ${game.world + 1}, ${world().name}.`);
}

// Through a level's door: its time is kept as a best, and the map shows the way on (no numbers
// between levels). Past the last door, the run's statistics.
function enterPortal() {
  const w = world();
  play('done');
  stopMusic();
  const store = readStore();
  const best = { ...(store.best || {}) };
  const key = `${VERSION}:${w.id}`;
  if (!best[key] || game.time < best[key]) best[key] = Math.round(game.time * 10) / 10;
  game.runCoins += game.coins;
  game.runTime += game.time;
  const last = game.world === WORLDS.length - 1;
  game.over = false;
  game.last = last;
  if (last) {
    const runKey = `${VERSION}:run`;
    const isBest = !best[runKey] || game.runTime < best[runKey];
    if (isBest) best[runKey] = Math.round(game.runTime * 10) / 10;
    writeStore({ best });
    showStats(`${w.name}: the end of the road, for now`, isBest ? 'A new best run! More worlds are on their way.' : 'More worlds are on their way.');
    return;
  }
  writeStore({ best });
  game.deaths = 0; // a cleared level resets the hidden assist
  game.assist = 0;
  showMap(game.world, game.world + 1);
}
function clock(s) {
  if (s == null) return '—';
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${String(r).padStart(2, '0')}`;
}
// The stats card's Play again: the same monster starts a new run from the first level.
function leap() {
  if (game.mode !== 'tally') return;
  newRun();
}
document.querySelector('[data-leap]').addEventListener('click', leap);
document.querySelector('[data-rebuild]').addEventListener('click', () => {
  monster = randomMonster();
  toBuilder();
});

// ---------------------------------------------------------------- music
function music() {
  stopMusic();
  const name = world().music || `${world().sound}-music`;
  heard.push(`loop:${name}`);
  stopMusic = sound.loop(name, { gain: 0.35 });
}

// ---------------------------------------------------------------- drawing
// Tile indices in each pack's sheet.
const PP = {
  // Pixel Platformer (18 px): the Meadow's grass and Frost's snow.
  meadow: { top: [1, 2, 3, 0], dirt: [121, 122, 123, 120], decor: [124, 125, 126, 128, 124], walker: [18, 19], bgX: 144 },
  frost: { top: [81, 82, 83, 80], dirt: [121, 122, 123, 120], decor: [126, 145, 126, 124, 126], walker: [18, 19], bgX: 0 },
  block: 6,
  oneway: [48, 49, 50],
  spikes: 68,
  coin: [151, 152],
  heart: 44,
  spring: 108,
  door: [130, 150],
  spiky: [15, 16],
};
const INK = {
  // The 1-Bit Platformer pack (16 px), drawn in ink on dark.
  top: [160, 161, 162, 161],
  block: 11,
  oneway: [104, 105, 106],
  spikes: 183,
  coin: [2, 1],
  heart: 41,
  spring: [164, 165],
  ghost: [320, 321],
  drip: 166,
  door: 56,
  decor: [36, 37, 58, 38, 36],
};
// The Pixel Platformer's Farm and Industrial expansions (18 px, 16 to a row), and the Pico-8
// Platformer (8 px, 15 to a row, in PICO-8's 16 colours).
const FARM = {
  top: [1, 2, 3, 0], dirt: [33, 34, 35, 32], oneway: [13, 14, 15, 12], block: 6, hay: 10,
  decor: [20, 4, 56, 58, 73, 5, 57, 75],
};
const IND = {
  top: [1, 2, 3, 0], dirt: [33, 34, 35, 32], oneway: [4, 5, 6, 5], block: 38, belt: [100, 101, 102, 85],
  mover: [87, 88, 90], decor: [9, 10, 41, 42, 9, 26],
};
const PICO = {
  top: 34, fill: [2, 2, 17, 2, 32, 2, 9], oneway: [48, 49, 50, 49], block: 19, spikes: 75, spring: [30, 15],
  coin: 88, heart: 132, walker: [105, 106], walker2: [90, 91], flyer: [112, 113], door: [101, 116],
  decor: [65, 80, 72, 87, 65], cloud: 81, edge: '#ffa300',
};
function sheetTile(g, img, cols, ts, idx, x, y, res) {
  g.drawImage(img, (idx % cols) * ts, Math.floor(idx / cols) * ts, ts, ts, Math.round(x), Math.round(y), res, res);
}
const farmTile = (g, idx, x, y, res) => sheetTile(g, images.farm, 16, 18, idx, x, y, res);
const indTile = (g, idx, x, y, res) => sheetTile(g, images.ind, 16, 18, idx, x, y, res);
const picoTile = (g, idx, x, y, res) => sheetTile(g, images.pico, 15, 8, idx, x, y, res);
function mushTile(g, name, x, y, res, w = 1, h = 1) {
  const f = MUSHROOM[name];
  g.drawImage(images.mushroom, f[0], f[1], f[2], f[3], x, y, res * w + seam, res * h + seam);
}
// Worlds drawn with the Pixel Platformer's own coins, hearts, springs, spikes, doors and walkers.
const ppLike = (w) => w.pack === 'pp' || w.pack === 'farm' || w.pack === 'ind';

function ppTile(g, idx, x, y, res) {
  const sx = (idx % 20) * 18;
  const sy = Math.floor(idx / 20) * 18;
  g.drawImage(images.meadowTiles, sx, sy, 18, 18, Math.round(x), Math.round(y), res, res);
}
function inkTile(g, idx, x, y, res) {
  const sx = (idx % 20) * 16;
  const sy = Math.floor(idx / 20) * 16;
  g.drawImage(images.ink, sx, sy, 16, 16, Math.round(x), Math.round(y), res, res);
}
let seam = 0; // smooth tiles overlap by a hair, so no hairline shows between them
function candyTile(g, name, x, y, res, w = 1, h = 1) {
  const f = CANDY[name];
  g.drawImage(images.candy, f[0], f[1], f[2], f[3], x, y, res * w + seam, res * h + seam);
}
function hash(x) {
  const s = Math.sin(x * 127.1) * 43758.5453;
  return s - Math.floor(s);
}

// Draws the level at `res` pixels per tile into g, whose origin is the view's top-left corner. From
// the level's `next` column on, the ground and sky are the next world's: a glimpse of where the
// door leads, drawn by the next world's own rule at this resolution.
// region: 'all' (no glimpse), 'main' (this world, up to the glimpse) or 'next' (the glimpse, drawn
// by the next world's own rule; the caller clips it).
function drawScene(g, res, wi, pixel, vw = g.canvas.width, vh = g.canvas.height, region = 'all') {
  const w = region === 'next' ? WORLDS[wi + 1] : WORLDS[wi];
  const wn = region === 'main' ? WORLDS[wi + 1] : null;
  let ox = cam.x * res;
  let oy = cam.y * res;
  if (pixel) {
    ox = Math.round(ox);
    oy = Math.round(oy);
  }
  const c0 = Math.max(0, Math.floor(cam.x) - 1);
  const c1 = Math.min(stage.cols - 1, Math.ceil(cam.x + vw / res) + 1);
  const layer = (lw, from, to, clipX) => {
    g.save();
    if (clipX !== undefined) {
      g.beginPath();
      g.rect(clipX, 0, vw - clipX, vh);
      g.clip();
    }
    // A pixel pack drawn into a smooth frame keeps its hard edges.
    const sm = g.imageSmoothingEnabled;
    if (!lw.smooth) g.imageSmoothingEnabled = false;
    drawBackground(g, lw, res, ox, oy, vw, vh, pixel);
    g.translate(-ox, -oy);
    for (let x = from; x <= to; x++) {
      const gy = stage.ground[x];
      if (gy >= stage.rows || tileAt(x, gy - 1) !== T.AIR) continue;
      const h = hash(x + WORLDS.indexOf(lw) * 31);
      if (h < 0.3) drawDecor(g, lw, x, gy - 1, res, h);
    }
    for (let y = Math.max(0, Math.floor(cam.y)); y < Math.min(stage.rows, Math.ceil(cam.y + vh / res) + 1); y++) {
      for (let x = from; x <= to; x++) {
        const t = stage.grid[y * stage.cols + x];
        if (t !== T.AIR) drawTile(g, lw, t, x, y, res);
      }
    }
    g.imageSmoothingEnabled = sm;
    g.restore();
  };
  // The main world draws one column past the line, under the glimpse, so no gap can show.
  if (region === 'next') layer(w, Math.max(c0, stage.next), c1);
  else layer(w, c0, Math.min(c1, wn ? stage.next : c1));
  const mine = (x) => region === 'all' || (region === 'main' ? x < stage.next : x >= stage.next);
  g.save();
  g.translate(-ox, -oy);
  drawThings(g, w, res, pixel, mine);
  if (mine(player.x)) drawPlayer(g, w, res, pixel);
  drawParticles(g, w, res, pixel);
  g.restore();
}

function edgeIndex(x, y, kind) {
  const left = tileAt(x - 1, y) === kind;
  const right = tileAt(x + 1, y) === kind;
  return left && right ? 1 : left ? 2 : right ? 0 : 3;
}

function drawTile(g, w, t, x, y, res) {
  const px = x * res;
  const py = y * res;
  if (w.pack === 'farm' || w.pack === 'ind' || w.pack === 'pico' || w.pack === 'mush') return drawTileNew(g, w, t, x, y, res, px, py);
  if (w.id === 'meadow' || w.id === 'frost') {
    const set = PP[w.id];
    if (t === T.GROUND) {
      const top = tileAt(x, y - 1) !== T.GROUND;
      const e = edgeIndex(x, y, T.GROUND);
      ppTile(g, top ? set.top[e] : set.dirt[e], px, py, res);
    } else if (t === T.BLOCK) ppTile(g, PP.block, px, py, res);
    else if (t === T.ONEWAY) {
      const e = edgeIndex(x, y, T.ONEWAY);
      ppTile(g, PP.oneway[e === 3 ? 1 : e], px, py, res);
    } else if (t === T.SPIKES) ppTile(g, PP.spikes, px, py, res);
  } else if (w.id === 'ink') {
    const { ink, dark } = w.oneBit;
    const u = Math.max(1, Math.round(res / 16));
    if (t === T.GROUND) {
      const top = tileAt(x, y - 1) !== T.GROUND;
      g.fillStyle = dark;
      g.fillRect(Math.round(px), Math.round(py), res, res);
      g.fillStyle = ink;
      if (tileAt(x - 1, y) !== T.GROUND) g.fillRect(Math.round(px), Math.round(py), u, res);
      if (tileAt(x + 1, y) !== T.GROUND) g.fillRect(Math.round(px + res - u), Math.round(py), u, res);
      if (top) inkTile(g, INK.top[edgeIndex(x, y, T.GROUND)], px, py, res);
      else if (hash(x * 7 + y) < 0.18) g.fillRect(Math.round(px + res * hash(x + y * 3)), Math.round(py + res * hash(y + x * 5)), u, u);
    } else if (t === T.BLOCK) inkTile(g, INK.block, px, py, res);
    else if (t === T.ONEWAY) inkTile(g, INK.oneway[Math.min(2, edgeIndex(x, y, T.ONEWAY))], px, py, res);
    else if (t === T.SPIKES) inkTile(g, INK.spikes, px, py, res);
  } else {
    if (t === T.GROUND) {
      const top = tileAt(x, y - 1) !== T.GROUND;
      const e = edgeIndex(x, y, T.GROUND);
      const name = top ? ['cakeLeft', 'cakeMid', 'cakeRight', 'cake'][e] : 'cakeCenter';
      candyTile(g, name, px, py, res);
    } else if (t === T.BLOCK) candyTile(g, 'choco', px, py, res);
    else if (t === T.ONEWAY) {
      const e = edgeIndex(x, y, T.ONEWAY);
      candyTile(g, ['cakeHalfLeft', 'cakeHalfMid', 'cakeHalfRight', 'cakeHalf'][e], px, py, res);
    } else if (t === T.SPIKES) candyTile(g, 'canePinkSmall', px, py, res);
  }
}

// The new worlds' tiles: Farm's straw-topped soil, crates and haybales; Industrial's steel, girders
// and belts; Pico's dark rock edged in orange; Mushroom's soft tan caps over soil.
function drawTileNew(g, w, t, x, y, res, px, py) {
  const top = (k) => tileAt(x, y - 1) !== T.GROUND && tileAt(x, y - 1) !== k;
  if (w.pack === 'farm' || w.pack === 'ind') {
    const set = w.pack === 'farm' ? FARM : IND;
    const tile = w.pack === 'farm' ? farmTile : indTile;
    if (t === T.GROUND) tile(g, top(T.GROUND) ? set.top[edgeIndex(x, y, T.GROUND)] : set.dirt[edgeIndex(x, y, T.GROUND)], px, py, res);
    else if (t === T.BLOCK) tile(g, set.block, px, py, res);
    else if (t === T.ONEWAY) tile(g, set.oneway[edgeIndex(x, y, T.ONEWAY)], px, py, res);
    else if (t === T.SPIKES) ppTile(g, PP.spikes, px, py, res);
    else if (t === T.HAY) tile(g, FARM.hay, px, py, res);
    else if (t === T.BELTL || t === T.BELTR) {
      const l = tileAt(x - 1, y) === t;
      const r = tileAt(x + 1, y) === t;
      tile(g, IND.belt[l && r ? 1 : l ? 2 : r ? 0 : 1], px, py, res);
      // Arrows running along the belt the way it carries.
      const u = Math.max(1, Math.round(res / 18));
      const dir = t === T.BELTR ? 1 : -1;
      const off = (((game.t * MOVE.belt * dir) % 1) + 1) % 1;
      g.fillStyle = '#ffd23f';
      for (let k = 0; k < 2; k++) {
        const ax = Math.round(px + ((off + k * 0.5) % 1) * res);
        const ay = Math.round(py + res * 0.42);
        for (let i = 0; i < 3; i++) g.fillRect(ax + (dir > 0 ? i : -i) * u, ay - (2 - i) * u, u, (2 - i) * 2 * u + u);
      }
    }
  } else if (w.pack === 'pico') {
    const u = Math.max(1, Math.round(res / 8));
    if (t === T.GROUND) {
      picoTile(g, top(T.GROUND) ? PICO.top : PICO.fill[Math.floor(hash(x * 3 + y * 7) * PICO.fill.length)], px, py, res);
      g.fillStyle = PICO.edge;
      if (tileAt(x - 1, y) === T.AIR || tileAt(x - 1, y) === T.SPIKES) g.fillRect(Math.round(px), Math.round(py), u, res);
      if (tileAt(x + 1, y) === T.AIR || tileAt(x + 1, y) === T.SPIKES) g.fillRect(Math.round(px + res - u), Math.round(py), u, res);
    } else if (t === T.BLOCK) picoTile(g, PICO.block, px, py, res);
    else if (t === T.ONEWAY) picoTile(g, PICO.oneway[edgeIndex(x, y, T.ONEWAY)], px, py, res);
    else if (t === T.SPIKES) picoTile(g, PICO.spikes, px, py, res);
    else picoTile(g, PICO.block, px, py, res);
  } else {
    // Mushroom: smooth.
    if (t === T.GROUND) {
      if (top(T.GROUND)) {
        const e = edgeIndex(x, y, T.GROUND);
        mushTile(g, ['shroomTanLeft', 'shroomTanMid', 'shroomTanRight', 'shroomTanMid'][e], px, py, res);
      } else {
        g.fillStyle = '#7a5a3f';
        g.fillRect(px, py, res + seam, res + seam);
        g.fillStyle = '#8c6a4c';
        const h = hash(x * 7 + y * 13);
        g.beginPath();
        g.arc(px + res * (0.2 + h * 0.6), py + res * (0.25 + hash(x + y) * 0.5), res * 0.09, 0, Math.PI * 2);
        g.fill();
      }
    } else if (t === T.BLOCK) mushTile(g, 'shroomTanMidAlt', px, py, res);
    else if (t === T.ONEWAY) {
      const e = edgeIndex(x, y, T.ONEWAY);
      mushTile(g, ['shroomBrownLeft', 'shroomBrownMid', 'shroomBrownRight', 'shroomBrownMidAlt'][e], px, py, res);
    } else candyTile(g, 'canePinkSmall', px, py, res);
  }
  return undefined;
}

function drawDecor(g, w, x, y, res, h) {
  const pick = (list) => list[Math.floor(h * 16) % list.length];
  if (w.pack === 'farm') return farmTile(g, pick(FARM.decor), x * res, y * res, res);
  if (w.pack === 'ind') return indTile(g, pick(IND.decor), x * res, y * res, res);
  if (w.pack === 'pico') return picoTile(g, pick(PICO.decor), x * res, y * res, res);
  if (w.pack === 'mush') {
    const n = pick(['tinyShroom_red', 'tinyShroom_tan', 'bush', 'tinyShroom_brown', 'tinyShroom_tan']);
    if (n === 'bush') return mushTile(g, n, x * res - res, y * res + res * 0.35, res, 3, 0.65);
    return mushTile(g, n, x * res, y * res, res);
  }
  if (w.id === 'meadow' || w.id === 'frost') ppTile(g, pick(PP[w.id].decor), x * res, y * res, res);
  else if (w.id === 'ink') inkTile(g, pick(INK.decor), x * res, y * res, res);
  else {
    const n = pick(['lollipopRed', 'canePinkSmall', 'lollipopGreen', 'creamPink', 'lollipopWhiteRed']);
    g.globalAlpha = 0.95;
    if (n.startsWith('lollipop')) {
      candyTile(g, 'lollipopBase', x * res, y * res, res);
      candyTile(g, n, x * res, (y - 1) * res, res);
    } else candyTile(g, n, x * res, y * res, res);
    g.globalAlpha = 1;
  }
}

function drawBackground(g, w, res, ox, oy, vw, vh, pixel) {
  const grad = g.createLinearGradient(0, 0, 0, vh);
  grad.addColorStop(0, w.sky[0]);
  grad.addColorStop(1, w.sky[1]);
  g.fillStyle = grad;
  g.fillRect(0, 0, vw, vh);
  const groundY = stage.base * res - oy; // the usual ground line on screen
  if (w.pack === 'ind' || w.pack === 'pico' || w.pack === 'mush') return drawBackgroundNew(g, w, res, ox, oy, vw, vh, groundY);
  if (w.id === 'meadow' || w.id === 'frost' || w.id === 'farm') {
    // The pack's background panel (green for the Meadow and the Farm, icy blue for Frost), with parallax.
    const bg = w.id === 'frost' ? 'frost' : 'meadow';
    const s = res / 18;
    const tw = 24 * s;
    const par = Math.round(ox * 0.35 + game.t * 2 * s);
    const baseY = Math.round(groundY - 24 * s * 2.2);
    g.fillStyle = images.bgFill[bg];
    g.fillRect(0, baseY + 3 * tw - 1, vw, vh);
    for (let x = -((par % (2 * tw)) + 2 * tw) % (2 * tw) - 2 * tw; x < vw; x += 2 * tw) {
      for (let r = 0; r < 3; r++) {
        g.drawImage(images.meadowBg, PP[bg].bgX, r * 24, 48, 24, Math.round(x), baseY + r * tw, 2 * tw, tw);
      }
    }
    // Clouds drifting by (Frost: falling snow too).
    g.fillStyle = 'rgba(255,255,255,0.85)';
    const u = Math.max(1, Math.round(res / 9));
    for (let i = 0; i < 9; i++) {
      const cx = ((i * 7.9 + game.t * (0.2 + (i % 3) * 0.08) - cam.x * 0.15) % 44 + 44) % 44;
      const px = Math.round((cx - 6) * res * 0.9);
      const py = Math.round(groundY - res * (5.5 + ((i * 5) % 9) * 1.45));
      g.fillRect(px, py, u * 10, u * 3);
      g.fillRect(px + u * 2, py - u * 2, u * 5, u * 2);
    }
    if (w.id === 'frost') {
      g.fillStyle = '#ffffff';
      for (let i = 0; i < 40; i++) {
        const fx = ((hash(i) * vw + game.t * res * 0.4 * (0.5 + hash(i + 9)) - ox * 0.5) % vw + vw) % vw;
        const fy = ((hash(i + 3) * vh + game.t * res * (0.8 + hash(i + 5))) % vh + vh) % vh;
        g.fillRect(Math.round(fx), Math.round(fy), u, u);
      }
    }
  } else if (w.id === 'ink') {
    // Stars, and far pillars drawn in outline.
    const { ink } = w.oneBit;
    const u = Math.max(1, Math.round(res / 16));
    g.fillStyle = ink;
    for (let i = 0; i < 40; i++) {
      const sx = ((hash(i) * vw * 1.5 - ox * 0.1) % vw + vw) % vw;
      const sy = hash(i + 7) * (groundY - res * 2);
      if (Math.sin(game.t * 2 + i) > -0.6) g.fillRect(Math.round(sx), Math.round(sy), u, u);
    }
    g.globalAlpha = 0.35;
    const par = ox * 0.3;
    for (let i = -1; i < vw / (res * 5) + 2; i++) {
      const idx = i + Math.floor(par / (res * 5));
      const px = Math.round(i * res * 5 - (par % (res * 5)));
      const h = res * (3 + hash(idx) * 4);
      g.fillRect(px, Math.round(groundY - h), u, Math.round(h + res * 4));
      g.fillRect(px + Math.round(res * 1.5), Math.round(groundY - h), u, Math.round(h + res * 4));
      g.fillRect(px, Math.round(groundY - h), Math.round(res * 1.5) + u, u);
    }
    g.globalAlpha = 1;
  } else {
    // Soft hills and big lollipops far away.
    g.fillStyle = '#ffc4df';
    const par = ox * 0.3;
    for (let i = -1; i < vw / (res * 4) + 2; i++) {
      const hx = i * res * 4 - (par % (res * 4));
      g.beginPath();
      g.arc(hx, groundY + res * 0.6, res * (2.4 + hash(i + Math.floor(par / (res * 4))) * 1.4), Math.PI, 0);
      g.fill();
    }
    // Below the ground line the background deepens, so a pit reads as a drop.
    const deep = g.createLinearGradient(0, groundY, 0, groundY + res * 4);
    deep.addColorStop(0, '#f7a8cb');
    deep.addColorStop(1, '#c95b8f');
    g.fillStyle = deep;
    g.fillRect(0, groundY + res * 0.55, vw, vh);
    // Cotton-candy clouds drifting high up.
    g.fillStyle = 'rgba(255,255,255,0.7)';
    for (let i = 0; i < 8; i++) {
      const cx = ((i * 8.3 + game.t * (0.18 + (i % 3) * 0.07) - cam.x * 0.12) % 44 + 44) % 44;
      const px = (cx - 6) * res * 0.9;
      const py = groundY - res * (6 + ((i * 5) % 9) * 1.4);
      g.beginPath();
      g.arc(px, py, res * 0.55, 0, Math.PI * 2);
      g.arc(px + res * 0.6, py - res * 0.25, res * 0.7, 0, Math.PI * 2);
      g.arc(px + res * 1.3, py, res * 0.5, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 0.45;
    const par2 = ox * 0.15;
    for (let i = -1; i < vw / (res * 7) + 2; i++) {
      const idx = i + Math.floor(par2 / (res * 7));
      const lx = i * res * 7 - (par2 % (res * 7)) + res * 2;
      const n = ['lollipopRed', 'lollipopGreen', 'lollipopWhiteRed'][Math.abs(idx) % 3];
      candyTile(g, 'lollipopBase', lx, groundY - res * 1.6, res * 0.8, 1, 1);
      candyTile(g, n, lx - res * 0.2, groundY - res * 3, res * 1.2, 1, 1);
    }
    g.globalAlpha = 1;
  }
}

// Industrial: a far skyline of factories with chimneys, in pixels. Pico: PICO-8's peach sky and
// its pack's clouds, nothing else. Mushroom: soft hills and giant mushrooms far away, smooth.
function drawBackgroundNew(g, w, res, ox, oy, vw, vh, groundY) {
  if (w.pack === 'ind') {
    const u = Math.max(1, Math.round(res / 18));
    const par = ox * 0.3;
    const span = res * 4;
    for (const [layer, col, f, hgt] of [[0, '#b7c2cd', 0.18, 5.5], [1, '#8d9aa8', 0.32, 3.6]]) {
      g.fillStyle = col;
      const p2 = ox * f;
      for (let i = -1; i < vw / span + 2; i++) {
        const idx = i + Math.floor(p2 / span) + layer * 17;
        const bx = Math.round(i * span - (p2 % span));
        const bh = Math.round(res * (hgt * (0.6 + hash(idx) * 0.6)));
        g.fillRect(bx, Math.round(groundY - bh), Math.round(span * 0.8), bh + vh);
        if (hash(idx + 3) < 0.55) {
          const cx = bx + Math.round(span * 0.2 + hash(idx + 5) * span * 0.4);
          const chH = Math.round(res * (1.2 + hash(idx + 7) * 1.5));
          g.fillRect(cx, Math.round(groundY - bh - chH), Math.round(res * 0.35), chH + 1);
          // A puff of smoke drifting up from the chimney.
          if (layer === 1) {
            g.fillStyle = 'rgba(240,244,248,0.8)';
            const k = (game.t * 0.4 + hash(idx)) % 1;
            const sz = Math.round(res * (0.25 + k * 0.4));
            g.fillRect(cx - Math.round(k * res * 0.4), Math.round(groundY - bh - chH - k * res * 2.2 - sz), sz, sz);
            g.fillStyle = col;
          }
        }
      }
    }
    void par;
    g.fillStyle = '#5d6a78';
    g.fillRect(0, Math.round(groundY + res * 0.5), vw, vh);
    void u;
  } else if (w.pack === 'pico') {
    const u = Math.max(1, Math.round(res / 8));
    g.fillStyle = w.sky[0];
    g.fillRect(0, 0, vw, vh);
    for (let i = 0; i < 7; i++) {
      const cx = ((i * 9.7 + game.t * (0.15 + (i % 3) * 0.06) - cam.x * 0.2) % 48 + 48) % 48;
      const px = Math.round((cx - 6) * res);
      const py = Math.round(groundY - res * (5 + ((i * 5) % 7) * 1.3));
      picoTile(g, PICO.cloud, px, py, res);
      picoTile(g, PICO.cloud, px + res, py, res);
    }
    // Far pink trees in a row, as in the pack's sample.
    const par = ox * 0.4;
    const span = res * 6;
    for (let i = -1; i < vw / span + 2; i++) {
      const idx = i + Math.floor(par / span);
      const tx = Math.round(i * span - (par % span) + hash(idx) * res * 3);
      const th = 2 + Math.floor(hash(idx + 1) * 3);
      for (let k = 0; k < th; k++) picoTile(g, 38, tx, Math.round(groundY - res * (k + 1)), res);
      picoTile(g, 23, tx, Math.round(groundY - res * (th + 1)), res);
      picoTile(g, 8, tx, Math.round(groundY - res * (th + 2)), res);
    }
    void u;
  } else {
    // Mushroom: far hills and giant mushrooms, faded. In a tall level they sit on a horizon that
    // moves slowly as the camera climbs, so the climb reads as height.
    const hz = vh * 0.78 + (groundY - vh * 0.78) * 0.12;
    g.fillStyle = '#b6e083';
    const par = ox * 0.25;
    for (let i = -1; i < vw / (res * 4) + 2; i++) {
      const hx = i * res * 4 - (par % (res * 4));
      g.beginPath();
      g.arc(hx, hz + res * 0.6, res * (2.6 + hash(i + Math.floor(par / (res * 4))) * 1.6), Math.PI, 0);
      g.fill();
    }
    g.fillRect(0, hz + res * 0.5, vw, vh);
    g.globalAlpha = 0.4;
    const par2 = ox * 0.15;
    for (let i = -1; i < vw / (res * 6) + 2; i++) {
      const idx = i + Math.floor(par2 / (res * 6));
      const lx = i * res * 6 - (par2 % (res * 6)) + res * hash(idx) * 2;
      const n = ['tallShroom_red', 'tallShroom_tan', 'tallShroom_brown'][Math.abs(idx) % 3];
      const sz = res * (2 + hash(idx + 4) * 2);
      mushTile(g, n, lx, hz - sz + res * 0.6, sz);
    }
    g.globalAlpha = 1;
    const deep = g.createLinearGradient(0, groundY, 0, groundY + res * 4);
    deep.addColorStop(0, '#6a9a3f');
    deep.addColorStop(1, '#2f4d22');
    g.fillStyle = deep;
    g.fillRect(0, groundY + res * 0.55, vw, vh);
  }
  return undefined;
}

// A heart you can't hold (you already hold two) shows as a coin.
function heartAsCoin() {
  return game.shields >= MAX_SHIELDS;
}

function drawThings(g, w, res, pixel, mine) {
  for (const t of stage.things) {
    if (!mine(t.x)) continue;
    const tw = w;
    const px = t.x * res;
    const py = t.y * res;
    const pp = ppLike(tw);
    const ink = tw.id === 'ink';
    const pico = tw.pack === 'pico';
    const mush = tw.pack === 'mush';
    const sm = g.imageSmoothingEnabled;
    if (!tw.smooth) g.imageSmoothingEnabled = false;
    switch (t.type) {
      case 'coin':
      case 'heart': {
        if (!t.alive) break;
        // A hidden pocket's coins show only once you come within 3 tiles; until then a faint glint
        // marks the pocket every 2 s.
        if (t.hidden && !t.found) {
          if (Math.hypot(t.x - player.x, t.y - (player.y - H_BOX / 2)) <= POCKET_NEAR) t.found = true;
          else {
            const first = stage.things.find((c) => c.pocket === t.pocket);
            if (first === t && glintOn(t)) drawGlint(g, tw, px, py, res, pixel);
            break;
          }
        }
        const asCoin = t.type === 'coin' || heartAsCoin();
        const bob = t.type === 'heart' ? Math.round(Math.sin(game.t * 3 + t.id) * res * 0.08) : 0;
        if (pico) picoTile(g, asCoin ? PICO.coin : PICO.heart, px - res / 2, py - res / 2 + bob, res);
        else if (mush) {
          const b2 = Math.sin(game.t * 3 + t.id) * res * 0.06;
          if (asCoin) drawSmoothCoin(g, px, py + b2, res);
          else candyTile(g, 'heart', px - res * 0.45, py - res * 0.45 + b2, res * 0.9, 1, 1);
        } else if (pp) ppTile(g, asCoin ? PP.coin[Math.floor(game.t * 4 + t.id) % 2] : PP.heart, px - res / 2, py - res / 2 + bob, res);
        else if (ink) inkTile(g, asCoin ? INK.coin[Math.floor(game.t * 4 + t.id) % 2] : INK.heart, px - res / 2, py - res / 2 + bob, res);
        else {
          const b2 = Math.sin(game.t * 3 + t.id) * res * 0.06;
          if (asCoin) candyTile(g, 'cherry', px - res * 0.36, py - res * 0.4 + b2, res * 0.72, 1, 1);
          else candyTile(g, 'heart', px - res * 0.45, py - res * 0.45 + b2, res * 0.9, 1, 1);
        }
        break;
      }
      case 'spring': {
        const up = t.boing ? Math.round(res * 0.15) : 0;
        if (ink) inkTile(g, INK.spring[t.boing ? 1 : 0], px - res / 2, py - res, res);
        else if (pico) picoTile(g, PICO.spring[t.boing ? 1 : 0], px - res / 2, py - res, res);
        else if (pp) ppTile(g, PP.spring, px - res / 2, py - res - up, res);
        else candyTile(g, 'candyBlue', px - res * 0.6, py - res, res * 1.2, 1, 1);
        break;
      }
      case 'jelly': {
        const s = 1 + (t.boing ? Math.sin(t.boing * 30) * t.boing * 0.6 : 0);
        candyTile(g, 'candyBlue', px - (res * 1.2 * (2 - s)) / 2, py - res * 1.05 * s, res * 1.2 * (2 - s), s * 1.05, 1);
        break;
      }
      case 'cookie': {
        if (t.state === 'gone') break;
        const shake = t.state === 'shaking' ? Math.sin(t.t * 70) * res * 0.05 : 0;
        candyTile(g, 'cookieBrown', px - res / 2 + shake, py - res * 0.38, res, 1, 1);
        break;
      }
      case 'drip':
        if (t.alive) inkTile(g, INK.drip, px - res / 2, py - (t.falling ? 0 : Math.round(Math.sin(game.t * 9 + t.id) * res * 0.03)), res);
        break;
      case 'walker': {
        if (!t.alive) break;
        const f = Math.floor(game.t * 6) % 2;
        g.save();
        g.translate(Math.round(px), Math.round(py));
        if (t.dir > 0) g.scale(-1, 1);
        // Bad guys are drawn half again as big as a tile, so they read at a glance.
        const z = ENEMY_SIZE;
        if (t.kind === 'ghost') {
          const r2 = Math.round(res * z);
          inkTile(g, INK.ghost[f], -r2 / 2, -r2 + Math.round(Math.sin(game.t * 4 + t.id) * res * 0.06), r2);
        } else if (pico) {
          const r2 = Math.round(res * z);
          picoTile(g, (t.id % 3 ? PICO.walker : PICO.walker2)[f], -r2 / 2, -r2, r2);
        } else if (tw.smooth) {
          // Candy's bad guys: the New Platformer Pack's slimes, purple (stomp it) or green with a spike (don't).
          const col = (t.kind === 'spiky' ? 3 : 0) + f;
          const sz = res * z;
          g.drawImage(images.slimes, col * 128, 0, 128, 128, -sz / 2, -sz + res * 0.04, sz, sz);
        } else {
          const idx = t.kind === 'spiky' ? PP.spiky[f] : PP.meadow.walker[f];
          const sx = (idx % 9) * 24;
          const sy = Math.floor(idx / 9) * 24;
          const s = Math.round((res / 18) * z * 2) / 2;
          g.drawImage(images.meadowChars, sx, sy, 24, 24, Math.round(-12 * s), Math.round(-24 * s + 2 * s), Math.round(24 * s), Math.round(24 * s));
        }
        g.restore();
        break;
      }
      case 'flyer': {
        if (!t.alive) break;
        // A flyer: the Pico pack's winged one, flapping (fast while it swoops).
        const f = Math.floor(game.t * (t.state === 'swoop' ? 14 : 7)) % 2;
        const r2 = Math.round(res * ENEMY_SIZE);
        g.save();
        g.translate(Math.round(px), Math.round(py));
        if (t.dir > 0) g.scale(-1, 1);
        if (pico) picoTile(g, PICO.flyer[f], -r2 / 2, -r2, r2);
        else inkTile(g, INK.ghost[f], -r2 / 2, -r2, r2);
        g.restore();
        break;
      }
      case 'cap': {
        // A bouncy cap on its stem down to the ground (or the level's bottom), squashing as it launches.
        const sq = t.boing ? Math.sin(t.boing * 20) * t.boing * 0.5 : 0;
        const cx = t.x * res;
        let gy = t.y + 1;
        const col = Math.floor(t.x + 1);
        while (gy < stage.rows && !SOLID.has(tileAt(col, gy))) gy++;
        if (mush) {
          for (let y = t.y + 1; y < gy; y++) mushTile(g, y === gy - 1 && gy < stage.rows ? 'stemBase' : y === t.y + 1 ? 'stemTop' : 'stem', cx + res, y * res, res);
          const h = res * (1 - sq * 0.4);
          const ww = res * (1 + sq * 0.15);
          const x0 = cx - (ww - res) * 1.5;
          mushTile(g, 'shroomRedLeft', x0, py + res - h, ww, 1, h / ww);
          mushTile(g, 'shroomRedMid', x0 + ww, py + res - h, ww, 1, h / ww);
          mushTile(g, 'shroomRedRight', x0 + ww * 2, py + res - h, ww, 1, h / ww);
        } else {
          g.fillStyle = '#e8d8b8';
          g.fillRect(cx + res * 1.3, py + res, res * 0.4, (gy - t.y - 1) * res);
          g.fillStyle = '#d6453d';
          g.fillRect(cx, py, res * 3, res * 0.6);
        }
        break;
      }
      case 'mover': {
        // A moving platform or lift: the Industrial pack's striped plates (its track drawn faintly).
        const x0 = Math.round(t.x * res);
        const y0 = Math.round(t.y * res);
        if (tw.pack === 'ind') {
          g.fillStyle = 'rgba(38,35,56,0.25)';
          const u = Math.max(1, Math.round(res / 18));
          if (t.axis === 'x') g.fillRect(Math.round(t.sx * res), Math.round(t.sy * res + res * 0.5), Math.round((t.range + 3) * res), u);
          else g.fillRect(Math.round((t.sx + 1.5) * res), Math.round((t.sy - t.range) * res), u, Math.round(t.range * res));
          for (let i = 0; i < 3; i++) indTile(g, IND.mover[i], x0 + i * res, y0, res);
        } else if (pico) for (let i = 0; i < 3; i++) picoTile(g, PICO.oneway[i], x0 + i * res, y0, res);
        else if (pp) for (let i = 0; i < 3; i++) ppTile(g, PP.oneway[i], x0 + i * res, y0, res);
        else for (let i = 0; i < 3; i++) candyTile(g, ['cakeHalfLeft', 'cakeHalfMid', 'cakeHalfRight'][i], x0 + i * res, y0, res);
        break;
      }
      case 'worm': {
        if (!t.alive) break;
        const wig = Math.sin(game.t * 8 + t.id) * res * 0.05;
        g.save();
        g.translate(px, py);
        if (t.dir > 0) g.scale(-1, 1);
        candyTile(g, 'gummyWormGreenHead', -res, -res + wig, res, 1, 1);
        candyTile(g, 'gummyWormGreenEnd', 0, -res - wig, res, 1, 1);
        g.restore();
        break;
      }
      case 'ears': {
        if (!t.alive) break;
        const bob = Math.sin(game.t * 2.5) * 0.12;
        drawEarsPrize(g, tw, px, py + bob * res, res, pixel);
        break;
      }
      case 'portal':
        drawPortal(g, tw, px, py, res, pixel);
        break;
      default:
    }
    g.imageSmoothingEnabled = sm;
  }
}

const POCKET_NEAR = 3; // a hidden pocket's coins show once the monster is this near (tiles)
function glintOn(t) {
  return ((game.t + t.pocket * 0.7) % 2) < 0.35;
}
// The glint over a hidden pocket: a little four-pointed twinkle.
function drawGlint(g, w, px, py, res, pixel) {
  const u = pixel ? Math.max(1, Math.round(res / (w.res || 18))) : res / 18;
  g.fillStyle = w.pack === 'pico' ? '#fff1e8' : 'rgba(255,255,240,0.9)';
  g.fillRect(Math.round(px - u / 2), Math.round(py - 3 * u), Math.max(1, Math.round(u)), Math.round(6 * u));
  g.fillRect(Math.round(px - 3 * u), Math.round(py - u / 2), Math.round(6 * u), Math.max(1, Math.round(u)));
}
// Mushroom's coin: a smooth gold disc (the pack has none of its own).
function drawSmoothCoin(g, px, py, res) {
  const r = res * 0.3;
  const sq = Math.abs(Math.cos(game.t * 3 + px));
  g.fillStyle = '#e8a417';
  g.beginPath();
  g.ellipse(px, py, r * (0.35 + sq * 0.65), r, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#ffd23f';
  g.beginPath();
  g.ellipse(px, py, r * (0.35 + sq * 0.65) * 0.72, r * 0.72, 0, 0, Math.PI * 2);
  g.fill();
}

// The door at a level's end, in the style of the world it leads to (it stands in the glimpse).
function drawPortal(g, w, px, py, res, pixel) {
  const glow = 0.5 + 0.5 * Math.sin(game.t * 4);
  if (w.pack === 'pico') {
    // Pico's own door, and a twinkle in its colours only (the world stays in its 16).
    picoTile(g, PICO.door[0], px - res / 2, py - 2 * res, res);
    picoTile(g, PICO.door[1], px - res / 2, py - res, res);
    g.fillStyle = '#fff1e8';
    const u = Math.max(1, Math.round(res / 8));
    const a = game.t * 2;
    g.fillRect(Math.round(px + Math.cos(a) * res * 0.9), Math.round(py - res * 1.1 + Math.sin(a) * res * 1.1), u, u);
    return;
  }
  if (w.pack === 'mush') {
    // A tall red mushroom, glowing: the way on.
    g.fillStyle = `rgba(255,255,220,${0.25 + glow * 0.25})`;
    g.beginPath();
    g.arc(px, py - res * 1.1, res * 1.3, 0, Math.PI * 2);
    g.fill();
    mushTile(g, 'tallShroom_red', px - res * 1.1, py - res * 2.2, res * 2.2);
    return;
  }
  if (w.pack === 'farm' || w.pack === 'ind') {
    ppTile(g, PP.door[0], px - res / 2, py - 2 * res, res);
    ppTile(g, PP.door[1], px - res / 2, py - res, res);
  } else if (w.id === 'meadow' || w.id === 'frost') {
    ppTile(g, PP.door[0], px - res / 2, py - 2 * res, res);
    ppTile(g, PP.door[1], px - res / 2, py - res, res);
  } else if (w.id === 'ink') {
    inkTile(g, INK.door, px - res / 2, py - res, res);
    inkTile(g, INK.door, px - res / 2, py - 2 * res, res);
  } else {
    g.save();
    g.translate(px, py - res * 1.2);
    g.rotate(game.t * 1.5);
    candyTile(g, 'lollipopWhiteRed', -res * 1.1, -res * 1.1, res * 2.2, 1, 1);
    g.restore();
  }
  // A soft pulse of light over the door, so it reads as the way on.
  g.fillStyle = `rgba(255,255,255,${0.15 + glow * 0.2})`;
  const u = pixel ? Math.max(1, Math.round(res / 18)) : 1;
  for (let i = 0; i < 6; i++) {
    const a = game.t * 2 + (i * Math.PI) / 3;
    g.fillRect(Math.round(px + Math.cos(a) * res * 0.9) - u, Math.round(py - res * 1.1 + Math.sin(a) * res * 1.1) - u, u * 2, u * 2);
  }
}

function drawEarsPrize(g, w, px, py, res, pixel) {
  // The prize glints: it is meant to be seen from the main path.
  const glow = 0.5 + 0.5 * Math.sin(game.t * 5);
  if (pixel) {
    const u = Math.max(1, Math.round(res / 18));
    g.fillStyle = `rgba(255,255,255,${0.35 + glow * 0.4})`;
    g.fillRect(Math.round(px - res * 0.75), Math.round(py - res * 0.8), Math.round(res * 1.5), Math.round(res * 1.2));
    g.fillStyle = '#ffd23f';
    for (let i = 0; i < 4; i++) {
      const a = game.t * 3 + (i * Math.PI) / 2;
      g.fillRect(Math.round(px + Math.cos(a) * res * 0.9) - u, Math.round(py - res * 0.2 + Math.sin(a) * res * 0.7) - u, u * 2, u * 2);
    }
  } else {
    g.fillStyle = `rgba(255,255,255,${0.35 + glow * 0.4})`;
    g.beginPath();
    g.arc(px, py - res * 0.2, res * 0.75, 0, Math.PI * 2);
    g.fill();
  }
  const col = ['green', 'blue', 'red', 'yellow', 'white', 'dark'][monster.colour];
  const f = MONSTER_FRAMES[`detail_${col}_ear_round`];
  const s = (res * 0.6) / f[3];
  g.drawImage(images.monster, f[0], f[1], f[2], f[3], Math.round(px - res * 0.65), Math.round(py - res * 0.55), Math.round(f[2] * s), Math.round(f[3] * s));
  g.save();
  g.translate(Math.round(px + res * 0.65), Math.round(py - res * 0.55));
  g.scale(-1, 1);
  g.drawImage(images.monster, f[0], f[1], f[2], f[3], 0, 0, Math.round(f[2] * s), Math.round(f[3] * s));
  g.restore();
}

function poseName() {
  const p = player;
  if (p.land > 0) return 'land';
  if (!p.ground) return p.vy < 0 ? 'rise' : 'fall';
  if (Math.abs(p.vx) > 0.5) return `run${Math.floor(p.run * 4) % 4}`;
  return Math.floor(game.t * 1.5) % 2 ? 'stand1' : 'stand0';
}

const morphCanvas = makeCanvas(1, 1);
function drawPlayer(g, w, res, pixel) {
  const p = player;
  if (p.poof > 0) return;
  if (p.invul > 0 && Math.floor(game.t * 16) % 2) return;
  const fx = p.x * res;
  const fy = p.y * res;
  const pose = {
    run: p.run,
    moving: p.ground ? Math.min(1, Math.abs(p.vx) / MOVE.top) : 0,
    air: p.ground ? 0 : p.vy < 0 ? -1 : 1,
    squash: p.land > 0 ? 0.4 : !p.ground && p.vy < -8 ? -0.25 : 0,
    look: p.face,
    ears: game.ears,
    blink: Math.sin(game.t * 0.9) > 0.985 ? 1 : 0,
  };
  // Mid-change between a pixel and a smooth world: the monster steps through the resolutions in
  // between, drawn small and scaled up without smoothing.
  if (game.morphT > 0 && game.morphFrom) {
    const k = 1 - game.morphT / MORPH;
    const steps = w.smooth ? [18, 35] : [35, 18];
    if (k < 0.66) {
      const rm = k < 0.33 ? steps[0] : steps[1];
      const bw = Math.ceil(rm * 4);
      const bh = Math.ceil(rm * 3.6);
      morphCanvas.width = bw;
      morphCanvas.height = bh;
      const mg = morphCanvas.getContext('2d');
      drawVector(mg, images.monster, monster, bw / 2, bh - 2, scaleFor(monster, rm), pose);
      const s = res / rm;
      const sm = g.imageSmoothingEnabled;
      g.imageSmoothingEnabled = false;
      g.drawImage(morphCanvas, fx - (bw / 2) * s, fy - (bh - 2) * s, bw * s, bh * s);
      g.imageSmoothingEnabled = sm;
      game.morphRes = rm;
      return;
    }
  }
  game.morphRes = 0;
  const own = pixel ? bakedFor(w) : null;
  if (own) {
    const f = own.frames[poseName()];
    g.save();
    g.translate(Math.round(fx), Math.round(fy));
    if (p.face < 0) g.scale(-1, 1);
    g.drawImage(f, -own.footX, -own.footY);
    g.restore();
  } else {
    drawVector(g, images.monster, monster, fx, fy, scaleFor(monster, res), pose);
  }
}

function drawParticles(g, w, res, pixel) {
  const ink = w.oneBit ? w.oneBit.ink : null;
  for (const p of particles) {
    const a = 1 - p.t / p.life;
    const s = p.size * res * (p.kind === 'puff' ? 1 + p.t * 2 : 1);
    g.globalAlpha = pixel ? 1 : Math.max(0, a);
    if (pixel && a < 0.25) continue;
    if (p.kind === 'text') {
      // A stomp chain's "+n", in the world's lettering.
      g.globalAlpha = 1;
      g.font = `${Math.round(res * p.size)}px 'Kenney Pixel', monospace`;
      g.textAlign = 'center';
      g.lineWidth = Math.max(1, res / 8);
      g.strokeStyle = '#000000';
      g.fillStyle = '#ffec27';
      g.strokeText(p.text, Math.round(p.x * res), Math.round(p.y * res));
      g.fillText(p.text, Math.round(p.x * res), Math.round(p.y * res));
      continue;
    }
    g.fillStyle = ink || (p.kind === 'spark' ? '#fff6b0' : p.kind === 'crumb' ? '#5b3a29' : p.kind === 'puff' ? '#ffffff' : w.id === 'meadow' ? '#e8d5b5' : '#fff');
    if (pixel) {
      const u = Math.max(1, Math.round(s));
      g.fillRect(Math.round(p.x * res - u / 2), Math.round(p.y * res - u / 2), u, u);
    } else {
      g.beginPath();
      g.arc(p.x * res, p.y * res, s / 2, 0, Math.PI * 2);
      g.fill();
    }
  }
  g.globalAlpha = 1;
}

// The resolutions the leap steps through, from one world to the next: into a smooth world it goes
// 18, 35, then smooth; out of one, 35, 18, then the new world's own; between pixel worlds, straight.
function leapSteps(from, to) {
  if (to.smooth) return [18, 35, to.res];
  if (from.smooth) return [35, 18, to.res];
  return [to.res, to.res, to.res];
}

// One frame: the world's rule decides how it reaches the screen.
function render() {
  if (!stage) return;
  if (game.mode === 'map') return drawMap();
  const w = world();
  let res = w.res;
  let overlay = 0;
  if (game.mode === 'leap') {
    const t = game.modeT;
    const steps = leapSteps(WORLDS[game.leapFrom], w);
    if (t < 0.3) {
      res = WORLDS[game.leapFrom].res;
      overlay = t / 0.3;
    } else if (t < 0.75) {
      res = steps[0];
      overlay = Math.max(0, 1 - (t - 0.3) / 0.2);
    } else if (t < 1.2) res = steps[1];
    else res = steps[2];
  }
  // The glimpse of the next world is drawn separately, by that world's own rule.
  const wn = WORLDS[game.world + 1];
  // Where the main world's drawing puts the line, to the pixel (a pixel world's camera is snapped).
  const pxCam = !w.smooth && res === w.res ? Math.round(cam.x * res) / res : cam.x;
  const glimpse = wn && game.mode !== 'leap' && game.mode !== 'build' && game.mode !== 'map' ? Math.round((stage.next - pxCam) * view.U) : Infinity;
  const region = glimpse < view.W ? 'main' : 'all';
  const pixel = !w.smooth && res === w.res;
  if (pixel || res !== w.res) {
    // Drawn small and scaled up by U / res without smoothing.
    const scale = view.U / res;
    const bw = Math.ceil(view.W / scale);
    const bh = Math.ceil(view.H / scale);
    if (buffer.width !== bw || buffer.height !== bh) {
      buffer.width = bw;
      buffer.height = bh;
    }
    bctx.imageSmoothingEnabled = false;
    bctx.setTransform(1, 0, 0, 1, 0, 0);
    drawScene(bctx, res, game.world, pixel, bw, bh, region);
    ctx.imageSmoothingEnabled = false;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // A tile is U canvas pixels: when res doesn't divide U (Ink's 16), the buffer is scaled to fit.
    ctx.drawImage(buffer, 0, 0, bw * scale, bh * scale);
  } else {
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    const s = view.U / res;
    ctx.setTransform(s, 0, 0, s, 0, 0);
    drawSceneScaled(res, s, region);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
  if (region === 'main') {
    ctx.save();
    ctx.beginPath();
    ctx.rect(Math.max(0, glimpse), 0, view.W, view.H);
    ctx.clip();
    if (wn.smooth) {
      ctx.imageSmoothingEnabled = true;
      const s = view.U / wn.res;
      ctx.setTransform(s, 0, 0, s, 0, 0);
      drawSceneScaled(wn.res, s, 'next');
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    } else {
      const scale = view.U / wn.res;
      const bw = Math.ceil(view.W / scale);
      const bh = Math.ceil(view.H / scale);
      if (buffer2.width !== bw || buffer2.height !== bh) {
        buffer2.width = bw;
        buffer2.height = bh;
      }
      b2ctx.imageSmoothingEnabled = false;
      b2ctx.setTransform(1, 0, 0, 1, 0, 0);
      drawScene(b2ctx, wn.res, game.world, true, bw, bh, 'next');
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(buffer2, 0, 0, bw * scale, bh * scale);
    }
    ctx.restore();
  }
  renderRes = res;
  if (overlay > 0) {
    ctx.fillStyle = '#ffffff';
    ctx.globalAlpha = Math.min(1, overlay) * 0.9;
    ctx.fillRect(0, 0, view.W, view.H);
    ctx.globalAlpha = 1;
  }
}
// The smooth path draws straight to the screen, at res pixels per tile scaled by s.
function drawSceneScaled(res, s, region = 'all') {
  seam = 0.8 / s;
  drawScene(ctx, res, game.world, false, view.W / s, view.H / s, region);
  seam = 0;
}
const buffer2 = makeCanvas(1, 1); // the glimpse of a pixel world
const b2ctx = buffer2.getContext('2d');

// ---------------------------------------------------------------- the world map
// Cells along a snaking path in rows, the start first: three across going up the screen in
// portrait, four across in landscape. Returns the nodes (in tiles) and the cells' size (in tiles).
function mapLayout() {
  const portrait = view.H >= view.W;
  const across = portrait ? 3 : 4;
  const rows = Math.ceil(WORLDS.length / across);
  const top = portrait ? 0.2 : 0.24;
  const bottom = portrait ? 0.7 : 0.62;
  const nodes = [portrait ? { x: 0.5, y: 0.9 } : { x: 0.05, y: 0.9 }];
  for (let i = 0; i < WORLDS.length; i++) {
    const r = Math.floor(i / across);
    const c = r % 2 ? across - 1 - (i % across) : i % across;
    const x = across === 1 ? 0.5 : 0.17 + (c * 0.66) / (across - 1);
    nodes.push({ x: portrait ? x : 0.14 + (c * 0.72) / (across - 1), y: rows === 1 ? bottom : bottom - (r * (bottom - top)) / (rows - 1) });
  }
  const colGap = ((portrait ? 0.33 : 0.24) * view.tilesW);
  const rowGap = ((bottom - top) / Math.max(1, rows - 1)) * view.tilesH;
  const cs = Math.max(1.2, Math.min(3, colGap * 0.78, rowGap * 0.62));
  return { nodes: nodes.map((p) => ({ x: p.x * view.tilesW, y: p.y * view.tilesH })), cs };
}
function mapNodes() {
  return mapLayout().nodes;
}
// A world's cell picture: a little scene drawn by that world's own rule.
const thumbs = {};
function thumbFor(wi) {
  if (thumbs[wi]) return thumbs[wi];
  const w = WORLDS[wi];
  const res = w.smooth ? 70 : w.res;
  const c = makeCanvas(res * 3, res * 3);
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = Boolean(w.smooth);
  const grad = g.createLinearGradient(0, 0, 0, res * 3);
  grad.addColorStop(0, w.sky[0]);
  grad.addColorStop(1, w.sky[1]);
  g.fillStyle = grad;
  g.fillRect(0, 0, res * 3, res * 3);
  for (let x = 0; x < 3; x++) {
    if (w.pack === 'farm' || w.pack === 'ind') {
      const set = w.pack === 'farm' ? FARM : IND;
      const tile = w.pack === 'farm' ? farmTile : indTile;
      tile(g, set.top[x === 0 ? 0 : x === 2 ? 2 : 1], x * res, res * 2, res);
      if (x !== 1) tile(g, set.decor[x], x * res, res, res);
    } else if (w.pack === 'pico') {
      picoTile(g, PICO.top, x * res, res * 2, res);
      if (x === 0) picoTile(g, PICO.decor[0], x * res, res, res);
    } else if (w.pack === 'mush') {
      mushTile(g, ['shroomTanLeft', 'shroomTanMid', 'shroomTanRight'][x], x * res, res * 2, res);
    } else if (w.id === 'meadow' || w.id === 'frost') {
      ppTile(g, PP[w.id].top[x === 0 ? 0 : x === 2 ? 2 : 1], x * res, res * 2, res);
      ppTile(g, PP[w.id].decor[x], x * res, res, res);
    } else if (w.id === 'ink') {
      inkTile(g, INK.top[1], x * res, res * 2, res);
      if (x !== 1) inkTile(g, INK.decor[x], x * res, res, res);
    } else {
      candyTile(g, ['cakeLeft', 'cakeMid', 'cakeRight'][x], x * res, res * 2, res);
    }
  }
  if (w.id === 'candy') {
    candyTile(g, 'lollipopBase', 0, res, res);
    candyTile(g, 'lollipopRed', 0, 0, res);
    g.drawImage(images.slimes, 0, 0, 128, 128, res * 1.6, res * 1.1, res * 1.1, res * 1.1);
  }
  if (w.id === 'ink') inkTile(g, INK.ghost[0], res, res, res);
  if (w.pack === 'farm') farmTile(g, FARM.hay, res, res, res);
  if (w.pack === 'ind') for (let i = 0; i < 3; i++) indTile(g, IND.mover[i], i * res, res * 0.4, res);
  if (w.pack === 'pico') {
    picoTile(g, PICO.flyer[0], res, 0, res);
    picoTile(g, PICO.walker[0], res * 2, res, res);
  }
  if (w.pack === 'mush') {
    mushTile(g, 'shroomRedMid', res, res * 0.6, res);
    mushTile(g, 'stem', res, res * 1.6, res, 1, 0.4);
  }
  thumbs[wi] = c;
  return c;
}
// The cells' names: in proportion to the cells, never under 13 CSS px.
function mapFont(cs) {
  return Math.round(Math.max(13 * view.ratio, view.U * 0.3 * cs));
}
function drawMap() {
  const { from, to } = game.map;
  const U = view.U;
  const k = view.k;
  const t = game.modeT;
  const { nodes, cs } = mapLayout();
  // The wall: a dark stone face, drawn in the Meadow's pixels (18 per tile).
  const bw = Math.ceil(view.W / k);
  const bh = Math.ceil(view.H / k);
  if (buffer.width !== bw || buffer.height !== bh) {
    buffer.width = bw;
    buffer.height = bh;
  }
  const g = bctx;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.imageSmoothingEnabled = false;
  g.fillStyle = '#3a3448';
  g.fillRect(0, 0, bw, bh);
  g.fillStyle = '#332d40';
  for (let y = 0; y < bh; y += 9) {
    const off = (y / 9) % 2 ? 9 : 0;
    for (let x = -off; x < bw; x += 18) g.fillRect(x, y, 17, 8);
  }
  const P = (n) => ({ x: Math.round(n.x * 18), y: Math.round(n.y * 18) });
  // The path: carved grooves, painted gold where it's open; the leg being opened paints in.
  const paint = Math.max(0, Math.min(1, (t - MAP.paint) / (MAP.walk - MAP.paint)));
  for (let i = 0; i < nodes.length - 1; i++) {
    const a = P(nodes[i]);
    const b = P(nodes[i + 1]);
    // Leg i leads into cell i: lit if that cell was reached before, painting in if it's the next.
    const open = i <= from ? 1 : i === to ? paint : 0;
    const steps = Math.max(2, Math.round(Math.hypot(b.x - a.x, b.y - a.y) / 6));
    for (let s = 1; s < steps; s++) {
      const q = s / steps;
      const x = Math.round(a.x + (b.x - a.x) * q);
      const y = Math.round(a.y + (b.y - a.y) * q);
      const lit = q <= open;
      g.fillStyle = '#231f2e';
      g.fillRect(x - 2, y - 2, 4, 4);
      if (lit) {
        g.fillStyle = '#ffd23f';
        g.fillRect(x - 2, y - 2, 3, 3);
      }
    }
  }
  // The start: a little stone pad.
  const s0 = P(nodes[0]);
  g.fillStyle = '#231f2e';
  g.fillRect(s0.x - 10, s0.y - 4, 20, 8);
  g.fillStyle = '#6d6482';
  g.fillRect(s0.x - 10, s0.y - 5, 20, 6);
  // The cells: hollows in the wall, lit once reached.
  const cell = Math.round(cs * 18);
  const lit = (i) => i <= from || i === to;
  for (let i = 0; i < WORLDS.length; i++) {
    const c = P(nodes[i + 1]);
    g.fillStyle = '#1c1826';
    g.fillRect(c.x - cell / 2 - 3, c.y - cell / 2 - 3, cell + 6, cell + 6);
    g.fillStyle = lit(i) ? '#ffd23f' : '#4a435a';
    g.fillRect(c.x - cell / 2 - 3, c.y + cell / 2, cell + 6, 3);
    g.fillRect(c.x + cell / 2, c.y - cell / 2 - 3, 3, cell + 6);
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(buffer, 0, 0, bw * k, bh * k);
  // Each lit cell's picture, drawn by its world's own rule, straight onto the screen.
  for (let i = 0; i < WORLDS.length; i++) {
    if (!lit(i)) continue;
    const c = nodes[i + 1];
    const img = thumbFor(i);
    ctx.imageSmoothingEnabled = Boolean(WORLDS[i].smooth);
    const pop = i === to && t > MAP.arrive ? 1 + Math.sin(Math.min(1, (t - MAP.arrive) / (MAP.enter - MAP.arrive)) * Math.PI) * 0.12 : 1;
    const sz = cs * U * pop;
    ctx.drawImage(img, c.x * U - sz / 2, c.y * U - sz / 2, sz, sz);
    ctx.font = `${mapFont(cs)}px 'Kenney Pixel', monospace`;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fffdf2';
    ctx.lineWidth = Math.max(2, Math.round(U / 9));
    ctx.strokeStyle = '#1c1826';
    ctx.strokeText(`${i + 1} ${WORLDS[i].name}`, c.x * U, c.y * U + U * (cs / 2 + 0.2) + mapFont(cs) * 0.75);
    ctx.fillText(`${i + 1} ${WORLDS[i].name}`, c.x * U, c.y * U + U * (cs / 2 + 0.2) + mapFont(cs) * 0.75);
  }
  // The monster, walking from where it was to the next cell, and stepping in.
  const a = from < 0 ? nodes[0] : nodes[from + 1];
  const b = nodes[to + 1];
  const q = Math.max(0, Math.min(1, (t - MAP.walk) / (MAP.arrive - MAP.walk)));
  const ease = q * q * (3 - 2 * q);
  const mx = a.x + (b.x - a.x) * ease;
  const my = a.y + (b.y - a.y) * ease - Math.abs(Math.sin(q * Math.PI * 4)) * 0.25 * (q > 0 && q < 1 ? 1 : 0);
  const bk = bakedFor(WORLDS[0]);
  if (bk && t < MAP.enter - 0.15) {
    const walking = q > 0 && q < 1;
    const f = bk.frames[walking ? `run${Math.floor(t * 10) % 4}` : Math.floor(t * 1.5) % 2 ? 'stand1' : 'stand0'];
    const sc = U / 18;
    const shrink = t > MAP.arrive ? 1 - (t - MAP.arrive) / (MAP.enter - MAP.arrive) : 1;
    ctx.save();
    ctx.translate(Math.round(mx * U), Math.round((my + 1.2) * U));
    if (b.x < a.x) ctx.scale(-1, 1);
    ctx.scale(sc * shrink, sc * shrink);
    ctx.drawImage(f, -bk.footX, -bk.footY);
    ctx.restore();
  }
  renderRes = 18;
}

// ---------------------------------------------------------------- the builder
const partsEl = document.querySelector('[data-parts]');
for (const p of PARTS) {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = p.label;
  b.dataset.part = p.key;
  b.addEventListener('click', () => {
    monster[p.key] = (monster[p.key] + 1) % p.n;
    changed();
  });
  partsEl.appendChild(b);
}
document.querySelector('[data-shuffle]').addEventListener('click', () => {
  const before = codeOf(monster);
  do monster = randomMonster();
  while (codeOf(monster) === before);
  play('shuffle');
  changed(false);
});
let wiggle = 0;
function changed(click = true) {
  if (click) play('pick', { rate: 0.9 + Math.random() * 0.2 });
  wiggle = 0.5;
  baked = null;
  ensureBaked();
  history.replaceState(null, '', `#m=${codeOf(monster)}`);
}
function go() {
  if (game.mode !== 'build') return;
  writeStore({ code: codeOf(monster) });
  history.replaceState(null, '', `#m=${codeOf(monster)}`);
  play('shuffle', { gain: 0.6 });
  newRun();
}
document.querySelector('[data-go]').addEventListener('click', go);

function toBuilder() {
  stopMusic();
  game.ears = false;
  baked = null;
  loadStage(0, 0);
  player.x = 4;
  builderPan = 0;
  setMode('build');
}

// The builder shows the monster as the first world will draw it: baked, in pixels, scaled up by a
// whole number. A change makes it hop through its running frames.
function drawPreview(dt) {
  if (!baked) return;
  wiggle = Math.max(0, wiggle - dt);
  const f = baked.frames[wiggle > 0 ? `run${Math.floor(wiggle * 16) % 4}` : Math.floor(game.t * 1.5) % 2 ? 'stand1' : 'stand0'];
  // A window around the standing monster, with room above its head for a hop.
  const k = 4;
  const x0 = Math.round(baked.w * 0.2);
  const y0 = Math.round(baked.h * 0.22);
  const cw = baked.w - 2 * x0;
  const ch = baked.h - y0;
  if (preview.width !== cw * k || preview.height !== ch * k) {
    preview.width = cw * k;
    preview.height = ch * k;
  }
  pctx.setTransform(1, 0, 0, 1, 0, 0);
  pctx.imageSmoothingEnabled = false;
  pctx.clearRect(0, 0, preview.width, preview.height);
  const hop = wiggle > 0 ? Math.round(Math.abs(Math.sin(wiggle * 12)) * 3) : 0;
  pctx.drawImage(f, x0, y0 - hop, cw, ch, 0, 0, cw * k, ch * k);
}

// ---------------------------------------------------------------- screens and the HUD
function showScreens() {
  const m = game.mode;
  screens.build.hidden = m !== 'build';
  screens.paused.hidden = m !== 'paused';
  screens.tally.hidden = m !== 'tally';
  hud.hidden = m === 'build';
  document.body.classList.toggle('building', m === 'build');
  showStyle();
}
// The cards, buttons and HUD follow the world's rule too: pixels in a pixel world, smooth in a
// smooth one. The builder is in the first world, the Meadow.
function showStyle() {
  const w = game.mode === 'build' ? WORLDS[0] : world();
  document.body.classList.toggle('smooth', Boolean(w && w.smooth));
  document.body.classList.toggle('ink', Boolean(w && w.oneBit));
}
const hudStage = document.querySelector('[data-hud-stage]');
const hudCoins = document.querySelector('[data-hud-coins]');
const hudLives = document.querySelector('[data-hud-lives]');
const hudHearts = document.querySelector('[data-hud-hearts]');
const hudCoinIcon = document.querySelector('[data-hud-coin-icon]');
let hudKey = '';
function updateHud() {
  if (hud.hidden) return;
  const w = world();
  const label = `${game.world + 1} ${w.name}`;
  if (hudStage.textContent !== label) hudStage.textContent = label;
  const c = String(game.coins);
  if (hudCoins.textContent !== c) hudCoins.textContent = c;
  game.lifePop = Math.max(0, (game.lifePop || 0) - 1 / 60);
  game.shieldPop = Math.max(0, (game.shieldPop || 0) - 1 / 60);
  const key = `${game.lives}:${game.shields}:${baked ? baked.key : ''}:${w.id}`;
  if (key !== hudKey) {
    hudKey = key;
    hudCoinIcon.textContent = '';
    hudCoinIcon.appendChild(icon('coin', true));
    hudLives.dataset.lives = String(game.lives);
    hudLives.textContent = '';
    for (let i = 0; i < LIVES; i++) hudLives.appendChild(icon('life', i < game.lives));
    hudHearts.dataset.hearts = String(game.shields);
    hudHearts.textContent = '';
    for (let i = 0; i < MAX_SHIELDS; i++) hudHearts.appendChild(icon('heart', i < game.shields));
  }
  hudLives.classList.toggle('pop', game.lifePop > 0);
  hudHearts.classList.toggle('pop', game.shieldPop > 0);
}
// A small HUD icon: a life is the monster itself (its baked frame, cropped to it), a heart the
// world's heart.
function opaqueBox(c) {
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  let x0 = c.width;
  let y0 = c.height;
  let x1 = 0;
  let y1 = 0;
  for (let y = 0; y < c.height; y++) {
    for (let x = 0; x < c.width; x++) {
      if (d[(y * c.width + x) * 4 + 3]) {
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x);
        y1 = Math.max(y1, y);
      }
    }
  }
  return { x: x0, y: y0, w: Math.max(1, x1 - x0 + 1), h: Math.max(1, y1 - y0 + 1) };
}
// The level's name, big, for a moment as it opens.
const banner = document.querySelector('[data-banner]');
let bannerTimer = 0;
function showBanner() {
  banner.textContent = `${game.world + 1} ${world().name}`;
  banner.hidden = false;
  banner.classList.remove('go');
  void banner.offsetWidth;
  banner.classList.add('go');
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => {
    banner.hidden = true;
  }, 1800);
}
function icon(kind, on) {
  const c = document.createElement('canvas');
  c.className = `hud-icon ${on ? 'on' : 'off'}`;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  if (kind === 'life' && baked) {
    const f = baked.frames.stand0;
    const box = baked.box || (baked.box = opaqueBox(f));
    c.width = box.w;
    c.height = box.h;
    g.drawImage(f, box.x, box.y, box.w, box.h, 0, 0, box.w, box.h);
  } else if (kind === 'life') {
    c.width = 16;
    c.height = 16;
    g.fillStyle = '#ff7a59';
    g.fillRect(3, 3, 10, 10);
  } else if (kind === 'coin') {
    const w = world();
    if (w.pack === 'pico') {
      c.width = 8;
      c.height = 8;
      picoTile(g, PICO.coin, 0, 0, 8);
    } else if (w.pack === 'mush') {
      c.width = 70;
      c.height = 70;
      g.imageSmoothingEnabled = true;
      drawSmoothCoin(g, 35, 35, 100);
    } else if (w.oneBit) {
      c.width = 16;
      c.height = 16;
      inkTile(g, INK.coin[0], 0, 0, 16);
    } else if (w.smooth) {
      c.width = 70;
      c.height = 70;
      g.imageSmoothingEnabled = true;
      candyTile(g, 'cherry', 0, 0, 70);
    } else {
      c.width = 18;
      c.height = 18;
      ppTile(g, PP.coin[0], 0, 0, 18);
    }
  } else if (world().pack === 'pico') {
    c.width = 8;
    c.height = 8;
    picoTile(g, PICO.heart, 0, 0, 8);
  } else if (world().oneBit) {
    c.width = 16;
    c.height = 16;
    inkTile(g, INK.heart, 0, 0, 16);
  } else if (world().smooth) {
    c.width = 70;
    c.height = 70;
    g.imageSmoothingEnabled = true;
    candyTile(g, 'heart', 0, 0, 70);
  } else {
    c.width = 18;
    c.height = 18;
    ppTile(g, PP.heart, 0, 0, 18);
  }
  return c;
}

// ---------------------------------------------------------------- pause
function pause() {
  if (game.mode !== 'play') return;
  setMode('paused');
  releaseAll();
  stopMusic();
}
function resume() {
  if (game.mode !== 'paused') return;
  setMode('play');
  player.invul = Math.max(player.invul, 0.5);
  releaseAll();
  music();
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    pause();
    sound.suspend();
  }
  last = performance.now();
});
window.addEventListener('blur', pause);
// A tap anywhere resumes; that tap doesn't also jump or run.
window.addEventListener(
  'pointerdown',
  (e) => {
    if (game.mode !== 'paused') return;
    if (e.target.closest && e.target.closest('.mute, .shell-back')) return;
    e.preventDefault();
    e.stopPropagation();
    swallowed.add(e.pointerId);
    resume();
  },
  { capture: true }
);
const swallowed = new Set();
canvas.addEventListener('pointerdown', () => skipMap());
deck.addEventListener('pointerdown', () => skipMap(), { capture: true });

// ---------------------------------------------------------------- input
function releaseAll() {
  input.keys.clear();
  input.padDir = 0;
  input.padId = null;
  input.jumpId = null;
  input.jump = false;
  input.left = false;
  input.right = false;
  pad.dataset.dir = '0';
  jumpKey.classList.remove('on');
}
function sync() {
  const k = input.keys;
  input.left = k.has('left') || input.padDir < 0;
  input.right = k.has('right') || input.padDir > 0;
  const jump = k.has('jump') || input.jumpId !== null;
  if (jump && !input.jump) player.buffer = bufferTime();
  input.jump = jump;
  pad.dataset.dir = String(input.left && !input.right ? -1 : input.right && !input.left ? 1 : 0);
  jumpKey.classList.toggle('on', jump);
}
const KEYS = {
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
  Space: 'jump', ArrowUp: 'jump', KeyW: 'jump', KeyZ: 'jump',
};
// On the capture phase, so a pause can take Escape before the shell's back handler sees it.
window.addEventListener('keydown', (e) => {
  if (e.target instanceof Element && e.target.closest('input, textarea')) return;
  if (game.mode === 'map' && (KEYS[e.code] || e.code === 'Enter')) {
    e.preventDefault();
    skipMap();
    return;
  }
  if (game.mode === 'paused' && !e.repeat && e.code !== 'Escape') {
    if (KEYS[e.code] || e.code === 'KeyP' || e.code === 'Enter') {
      e.preventDefault();
      resume();
    }
    return;
  }
  if (game.mode === 'play' && (e.code === 'Escape' || e.code === 'KeyP')) {
    e.preventDefault();
    pause();
    return;
  }
  if (game.mode === 'paused' && e.code === 'Escape') {
    e.preventDefault(); // Escape from the Paused card goes back to the builder, not off the page.
    toBuilder();
    return;
  }
  if (game.mode === 'build' && (e.code === 'Enter') && !(e.target instanceof HTMLButtonElement)) {
    e.preventDefault();
    go();
    return;
  }
  if (game.mode === 'tally' && (e.code === 'Enter' || e.code === 'Space') && !(e.target instanceof HTMLButtonElement)) {
    e.preventDefault();
    leap();
    return;
  }
  const k = KEYS[e.code];
  if (!k) return;
  if (game.mode === 'play' || game.mode === 'leap') e.preventDefault();
  if (e.repeat) return;
  input.keys.add(k);
  sync();
}, { capture: true });
window.addEventListener('keyup', (e) => {
  const k = KEYS[e.code];
  if (!k) return;
  input.keys.delete(k);
  sync();
});

// The deck: a touch belongs to the half it began in until it lifts; one touch per half counts.
function padDirFor(e) {
  const r = pad.getBoundingClientRect();
  const dx = e.clientX - (r.left + r.width / 2);
  const dead = Math.min(14, r.width * 0.08);
  return dx > dead ? 1 : dx < -dead ? -1 : 0;
}
pad.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  if (swallowed.has(e.pointerId) || input.padId !== null) return;
  input.padId = e.pointerId;
  try {
    pad.setPointerCapture(e.pointerId);
  } catch (err) {
    // A synthetic pointer can't be captured; the window's listeners still see it.
  }
  input.padDir = padDirFor(e);
  sync();
});
jumpKey.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  if (swallowed.has(e.pointerId) || input.jumpId !== null) return;
  input.jumpId = e.pointerId;
  try {
    jumpKey.setPointerCapture(e.pointerId);
  } catch (err) {
    // As above.
  }
  sync();
});
window.addEventListener('pointermove', (e) => {
  if (e.pointerId === input.padId) {
    const d = padDirFor(e);
    if (d !== input.padDir) {
      input.padDir = d;
      sync();
    }
  }
});
function lift(e) {
  swallowed.delete(e.pointerId);
  if (e.pointerId === input.padId) {
    input.padId = null;
    input.padDir = 0;
    sync();
  }
  if (e.pointerId === input.jumpId) {
    input.jumpId = null;
    sync();
  }
}
window.addEventListener('pointerup', lift);
window.addEventListener('pointercancel', lift);
deck.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

// ---------------------------------------------------------------- the loop
// Physics runs in fixed steps whatever the display's rate, so it is the same at 60 and 120 Hz.
function advance(dt) {
  acc += dt;
  while (acc >= STEP - 1e-9) {
    update(STEP);
    acc -= STEP;
  }
}
let last = performance.now();
let acc = 0;
const frameWork = []; // milliseconds of update + draw per frame, for the performance test
function frameLoop(now) {
  const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
  last = now;
  const t0 = performance.now();
  if (!manual) advance(dt);
  render();
  if (game.mode === 'build') drawPreview(dt);
  updateHud();
  frameWork.push(performance.now() - t0);
  if (frameWork.length > 600) frameWork.shift();
  requestAnimationFrame(frameLoop);
}

// ---------------------------------------------------------------- start
let MONSTER_FRAMES = null;
Promise.all([
  loadImage('img/meadow-tiles.png'),
  loadImage('img/meadow-chars.png'),
  loadImage('img/meadow-bg.png'),
  loadImage('img/candy.png'),
  loadImage('img/monster.png'),
  loadImage('img/ink-tiles.png'),
  loadImage('img/candy-slimes.png'),
  import('./monster-atlas.js'),
  loadImage('img/farm-tiles.png'),
  loadImage('img/industrial-tiles.png'),
  loadImage('img/pico-tiles.png'),
  loadImage('img/mushroom.png'),
]).then(([meadowTiles, meadowChars, meadowBg, candy, monsterImg, inkImg, slimes, atlas, farm, ind, pico, mushroom]) => {
  Object.assign(images, { meadowTiles, meadowChars, meadowBg, candy, monster: monsterImg, slimes, farm, ind, pico, mushroom });
  MONSTER_FRAMES = atlas.MONSTER;
  // The colour under each background panel's hills, to fill below them.
  images.bgFill = {};
  for (const [id, x] of [['meadow', PP.meadow.bgX], ['frost', PP.frost.bgX]]) {
    const c = makeCanvas(1, 1).getContext('2d');
    c.drawImage(meadowBg, x, 71, 1, 1, 0, 0, 1, 1);
    const d = c.getImageData(0, 0, 1, 1).data;
    images.bgFill[id] = `rgb(${d[0]},${d[1]},${d[2]})`;
  }
  // The 1-Bit pack is white on clear: tint it to the Ink world's ink.
  const inkWorld = WORLDS.find((w) => w.oneBit);
  const tinted = makeCanvas(inkImg.width, inkImg.height);
  const tg = tinted.getContext('2d');
  tg.drawImage(inkImg, 0, 0);
  tg.globalCompositeOperation = 'source-in';
  tg.fillStyle = inkWorld.oneBit.ink;
  tg.fillRect(0, 0, tinted.width, tinted.height);
  images.ink = tinted;
  // A monster from the link, else the last one, else a new one.
  const fromLink = monsterFromCode((location.hash.match(/m=([^&]*)/) || [])[1]);
  const stored = monsterFromCode(readStore().code);
  monster = fromLink || stored || randomMonster();
  layout();
  lastSize = `${window.innerWidth}x${window.innerHeight}`;
  toBuilder();
  history.replaceState(null, '', `#m=${codeOf(monster)}`);
  last = performance.now();
  requestAnimationFrame(frameLoop);
  window.__leap = {
    game, player, input, cam, view, MOVE, WORLDS, T, ROWS,
    stage: () => stage,
    monster: () => ({ ...monster }),
    code: () => codeOf(monster),
    baked: () => baked,
    renderRes: () => renderRes,
    heard,
    frameWork,
    step: (dt = STEP) => update(dt),
    advance,
    steps: (n) => {
      for (let i = 0; i < n; i++) update(STEP);
    },
    render,
    set manual(v) {
      manual = v;
    },
    loadStage,
    startWorld,
    newRun,
    hit,
    loseLife,
    go,
    toBuilder,
    pause,
    resume,
    leap,
    skipMap,
    mapLayout,
    mapFont,
    clearParticles: () => {
      particles.length = 0;
    },
    MAP,
    tileAt,
    sync,
    layout,
    store: readStore,
  };
});

// Googly Faces: tap the shape characters and watch their googly eyes wobble.
//
// Tap only, no fail state, no reading. Faces pop up around the screen; a tap makes one jump with a
// squash and stretch, change its expression and make a funny sound, then it ducks away and another
// appears. Each round fills a row of dots at the top, one per face tapped, and ends with a small
// party and a play-again button.
//
// The hook is the pupils. Each one is a little disc rolling loose inside its eye, simulated in
// screen space at 240 steps a second: it feels gravity (down, or the way the device tilts), the
// eye's own acceleration as the face moves (so it lags, floats while the face is in the air and
// slams down when it lands), bounces off the rim, and rolls to rest under friction.
import { mountShell } from '../shared/game-shell.js';

// ---------------------------------------------------------------------------------------------
// Sound: groups of short sounds, a different one each time, with the pitch varied a little.

const GROUPS = { pop: 4, boing: 4, giggle: 5, squeak: 2, boop: 2, drip: 2, flourish: 2 };
const files = { finale: 'sounds/finale.mp3' };
for (const [group, n] of Object.entries(GROUPS)) {
  for (let i = 1; i <= n; i++) files[`${group}-${i}`] = `sounds/${group}-${i}.mp3`;
}
const { sound } = mountShell({ sounds: files });

// Nothing plays before the first tap: a sound started while audio is still locked would wait and
// then play late, all at once, when that tap unlocks it.
let activated = false;
for (const type of ['pointerdown', 'keydown']) {
  window.addEventListener(type, () => (activated = true), { capture: true, passive: true });
}

const lastPicked = {};
function play(group, { rate = 1, gain = 1, spread = 0.14 } = {}) {
  if (!activated) return;
  let name = group;
  const n = GROUPS[group];
  if (n) {
    let i;
    do i = 1 + Math.floor(Math.random() * n);
    while (n > 1 && i === lastPicked[group]);
    lastPicked[group] = i;
    name = `${group}-${i}`;
  }
  sound.play(name, { rate: rate * (1 - spread / 2 + Math.random() * spread), gain });
}

const soundBtn = document.querySelector('[data-sound-toggle]');
function showSound(muted) {
  soundBtn.setAttribute('aria-pressed', String(muted));
  const label = muted ? 'Sound off' : 'Sound on';
  soundBtn.setAttribute('aria-label', `${label} (${muted ? 'unmute' : 'mute'})`);
  soundBtn.setAttribute('title', label);
}
showSound(sound.muted);
sound.onchange = showSound;
soundBtn.addEventListener('click', () => {
  sound.muted = !sound.muted;
  play('pop', { gain: 0.6 });
});

// ---------------------------------------------------------------------------------------------
// Art

const COLORS = {
  blue: '#7b8ff0',
  green: '#64c47c',
  pink: '#ff8ac6',
  purple: '#9a68e6',
  red: '#e0607a',
  yellow: '#fdb940',
};
const SHAPES = ['circle', 'squircle', 'square', 'rhombus'];
const MOUTHS = ['happy', 'smirk', 'sad', 'grin'];
const INK = '#3d465d'; // the pack's face colour

// Where the face sits on each body, as fractions of the body's size, measured up from its feet.
const LAYOUT = {
  circle: { eyeX: 0.2, eyeY: 0.6, eyeR: 0.165, mouthY: 0.3, mouthW: 0.32 },
  squircle: { eyeX: 0.21, eyeY: 0.61, eyeR: 0.17, mouthY: 0.29, mouthW: 0.34 },
  square: { eyeX: 0.21, eyeY: 0.62, eyeR: 0.17, mouthY: 0.29, mouthW: 0.34 },
  rhombus: { eyeX: 0.15, eyeY: 0.56, eyeR: 0.13, mouthY: 0.32, mouthW: 0.22 },
};

// The googly eye layers are 320 px squares that line up: the white, the pupil and the shine.
const EYE_C = 158.5; // centre of the white
const EYE_R = 145.5; // radius of the white
const PUPIL_C = 159.5;
const PUPIL_R = 88.5;
const TRAVEL = (EYE_R - PUPIL_R) / EYE_R; // how far the pupil's centre can roll, in eye radii

const img = {};
function load(key, src) {
  return new Promise((resolve) => {
    const im = new Image();
    im.onload = () => {
      img[key] = im;
      resolve();
    };
    im.onerror = () => resolve();
    im.src = src;
  });
}
const loading = [
  load('white', 'art/eye-white.png'),
  load('pupil', 'art/eye-pupil.png'),
  load('shine', 'art/eye-shine.png'),
  load('shadow', 'art/shadow.png'),
  load('brow-a', 'art/facial_part_eyebrow_a.png'),
  load('brow-b', 'art/facial_part_eyebrow_b.png'),
  load('happy', 'art/facial_part_mouth_happy.png'),
  load('smirk', 'art/facial_part_mouth_smirk.png'),
  load('sad', 'art/facial_part_mouth_sad.png'),
  load('grin', 'art/facial_part_mouth_angry.png'),
];
for (const c of Object.keys(COLORS)) {
  for (const s of SHAPES) loading.push(load(`${c}-${s}`, `art/${c}_body_${s}.png`));
}

// ---------------------------------------------------------------------------------------------
// Tuning

const ROUND = 12; // faces to tap in a round
const STEP = 1 / 240; // physics step, seconds

const PUPIL_G = 70; // gravity on a pupil, in eye radii per s²
const PUPIL_DAMP = 0.9; // drag from the back of the eye, per s
const PUPIL_ROLL = 1.6; // rolling friction against the rim, per s
const PUPIL_BOUNCE = 0.45; // restitution off the rim
const MS2_TO_G = PUPIL_G / 9.81; // device acceleration (m/s²) into the same units

const HOP_G = 18; // a face's own gravity, in body sizes per s²

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (list) => list[Math.floor(Math.random() * list.length)];

// A damped spring towards a target; k is stiffness, c damping.
function spring(x, k, c) {
  return { x, v: 0, to: x, k, c };
}
function stepSpring(s, h) {
  s.v += (-s.k * (s.x - s.to) - s.c * s.v) * h;
  s.x += s.v * h;
}

// ---------------------------------------------------------------------------------------------
// Stage

const canvas = document.querySelector('.gf-stage');
const ctx = canvas.getContext('2d');
const safeProbe = document.querySelector('.gf-safe');
const againBtn = document.querySelector('[data-play-again]');

let W = 0;
let H = 0;
let DPR = 1;
const safe = { t: 0, r: 0, b: 0, l: 0 };
let baseSize = 120;
let capacity = 3;
let bg = null; // the background, drawn once per size and theme
const palette = {};

function readPalette() {
  const cs = getComputedStyle(document.documentElement);
  for (const k of ['sky-top', 'sky-bottom', 'glow', 'pip-empty', 'ring']) {
    palette[k] = cs.getPropertyValue(`--gf-${k}`).trim();
  }
  palette.dark = cs.colorScheme === 'dark';
}

function paintBackground() {
  bg = document.createElement('canvas');
  bg.width = Math.round(W * DPR);
  bg.height = Math.round(H * DPR);
  const b = bg.getContext('2d');
  b.scale(DPR, DPR);
  const grad = b.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, palette['sky-top']);
  grad.addColorStop(1, palette['sky-bottom']);
  b.fillStyle = grad;
  b.fillRect(0, 0, W, H);
  // A few large, soft glows for depth.
  const glows = [
    [0.18, 0.22, 0.55],
    [0.86, 0.38, 0.45],
    [0.4, 0.92, 0.6],
  ];
  for (const [gx, gy, gr] of glows) {
    const r = gr * Math.max(W, H);
    const g = b.createRadialGradient(gx * W, gy * H, 0, gx * W, gy * H, r);
    g.addColorStop(0, palette.glow);
    g.addColorStop(1, 'rgb(255 255 255 / 0%)');
    b.fillStyle = g;
    b.fillRect(0, 0, W, H);
  }
}

function resize() {
  W = window.innerWidth;
  H = window.innerHeight;
  DPR = Math.min(window.devicePixelRatio || 1, 3);
  canvas.width = Math.round(W * DPR);
  canvas.height = Math.round(H * DPR);
  const cs = getComputedStyle(safeProbe);
  safe.t = parseFloat(cs.paddingTop) || 0;
  safe.r = parseFloat(cs.paddingRight) || 0;
  safe.b = parseFloat(cs.paddingBottom) || 0;
  safe.l = parseFloat(cs.paddingLeft) || 0;
  baseSize = clamp(Math.min(W * 0.38, H * 0.3, Math.sqrt(W * H) * 0.24), 100, 220);
  const area = (W - safe.l - safe.r) * (H - safe.t - safe.b - 70);
  capacity = clamp(Math.floor(area / (baseSize * baseSize * 3.2)), 1, 5);
  readPalette();
  paintBackground();
  for (const f of faces) {
    const b = bounds(f.s);
    f.x = clamp(f.x, b.x0, b.x1);
    f.y = clamp(f.y, b.y0, b.y1);
    for (const e of f.eyes) e.fresh = true;
  }
}

// Where a face of size s may stand (its feet), clear of the edges, the notch and the top row.
function bounds(s) {
  const m = 10 + s * 0.08;
  return {
    x0: safe.l + m + s * 0.5,
    x1: W - safe.r - m - s * 0.5,
    y0: safe.t + 64 + s * 1.35, // room to jump without covering the top row
    y1: H - safe.b - m - s * 0.1,
  };
}

// ---------------------------------------------------------------------------------------------
// Faces

const faces = [];
let nextId = 1;
let lastLook = null;

function makeEyes(shape) {
  const L = LAYOUT[shape];
  const r = Math.random();
  let eyes;
  if (r < 0.64 || (shape === 'rhombus' && r > 0.9)) {
    eyes = [
      { x: -L.eyeX, y: L.eyeY, r: L.eyeR },
      { x: L.eyeX, y: L.eyeY, r: L.eyeR },
    ];
  } else if (r < 0.8) {
    // One big, one small.
    const big = Math.random() < 0.5 ? -1 : 1;
    eyes = [
      { x: -L.eyeX - 0.01 * big, y: L.eyeY + 0.01, r: L.eyeR * (big < 0 ? 1.2 : 0.78) },
      { x: L.eyeX - 0.01 * big, y: L.eyeY - 0.01, r: L.eyeR * (big > 0 ? 1.2 : 0.78) },
    ];
  } else if (r < 0.9) {
    // One big eye.
    eyes = [{ x: 0, y: L.eyeY + 0.01, r: L.eyeR * 1.55 }];
  } else {
    // Three small eyes.
    eyes = [
      { x: -0.23, y: L.eyeY - 0.02, r: 0.125 },
      { x: 0, y: L.eyeY + 0.08, r: 0.125 },
      { x: 0.23, y: L.eyeY - 0.02, r: 0.125 },
    ];
  }
  for (const e of eyes) {
    e.px = rand(-0.1, 0.1);
    e.py = TRAVEL * 0.9;
    e.pvx = 0;
    e.pvy = 0;
    e.fresh = true;
  }
  return eyes;
}

function newLook(avoid = []) {
  let color;
  let shape;
  do {
    color = pick(Object.keys(COLORS).filter((c) => !avoid.includes(c)));
    shape = pick(SHAPES);
  } while (lastLook && (color === lastLook.color || shape === lastLook.shape) && Math.random() < 0.85);
  lastLook = { color, shape };
  return lastLook;
}

function createFace(x, y, s, { party = false } = {}) {
  // The party row has a colour each.
  const avoid = party ? faces.filter((o) => o.party && o.phase !== 'out').map((o) => o.color) : [];
  const { color, shape } = newLook(avoid);
  const f = {
    id: nextId++,
    color,
    shape,
    x,
    y,
    s,
    voice: rand(0.9, 1.12) * clamp(Math.pow(baseSize / s, 0.35), 0.85, 1.2),
    eyes: makeEyes(shape),
    mouth: pick(['happy', 'happy', 'smirk', 'o']),
    flip: Math.random() < 0.5 ? -1 : 1,
    brow: pick(['brow-a', 'brow-b']),
    scale: spring(0, 170, 11),
    squash: spring(0, 420, 10),
    tilt: spring(0, 180, 8),
    open: spring(0, 260, 18), // the "o" mouth
    browUp: spring(0, 300, 16),
    hop: 0, // height above the feet, px
    hopV: 0,
    phase: 'in',
    t: 0,
    life: 0,
    wiggleAt: rand(1.2, 3),
    reactT: 0,
    tapped: false,
    party,
    airborne: false,
  };
  if (f.mouth === 'o') f.open.x = f.open.to = 1;
  f.scale.to = 1;
  f.hopV = 2 * s; // a little jump as it pops up
  f.tilt.v = rand(-2.5, 2.5);
  faces.push(f);
  play('pop', { rate: f.voice, gain: 0.55 });
  return f;
}

function spawnFace() {
  const s = baseSize * rand(0.9, 1.08);
  const b = bounds(s);
  if (b.x1 < b.x0 || b.y1 < b.y0) return null;
  let best = null;
  let bestScore = -Infinity;
  for (let i = 0; i < 40; i++) {
    const x = rand(b.x0, b.x1);
    const y = rand(b.y0, b.y1);
    let near = Infinity;
    for (const o of faces) {
      const d = Math.hypot(o.x - x, o.y - o.s / 2 - (y - s / 2)) - (o.s + s) * 0.5;
      near = Math.min(near, d);
    }
    const score = Math.min(near, s * 1.5) + Math.random() * s * 0.3;
    if (score > bestScore) {
      bestScore = score;
      best = { x, y };
    }
  }
  if (!best || bestScore < s * 0.1) return null;
  return createFace(best.x, best.y, s);
}

function tapFace(f) {
  if (f.phase === 'out') return;
  const first = !f.tapped;
  f.tapped = true;
  f.phase = f.party ? 'party' : 'react';
  f.reactT = 0;
  f.t = 0;
  // Up about half its size, less near the top so it stays clear of the dots and buttons.
  const room = (f.y - f.s * 1.05 - (safe.t + 60)) / f.s;
  f.hopV = Math.sqrt(2 * HOP_G * clamp(room, 0.18, 0.5)) * f.s;
  f.airborne = true;
  f.squash.v = -4; // stretch tall as it leaves the ground
  f.tilt.v += rand(3, 6) * (Math.random() < 0.5 ? -1 : 1);
  f.mouth = 'o';
  f.open.to = 1;
  f.browUp.to = 1;
  // A kick to the pupils too, so even a fast double-tap sends them flying.
  for (const e of f.eyes) {
    e.pvx += rand(-3, 3);
    e.pvy -= rand(1, 3);
  }

  play('boing', { rate: f.voice, gain: 0.9 });
  const r = Math.random();
  if (r < 0.62) setTimeout(() => play('giggle', { rate: f.voice * 1.05, gain: 0.65 }), 120);
  else if (r < 0.78) setTimeout(() => play('flourish', { rate: f.voice, gain: 0.4 }), 140);

  if (first && !f.party && game.state === 'play') {
    game.taps++;
    pips[game.taps - 1] = { color: COLORS[f.color], s: spring(0, 300, 12) };
    pips[game.taps - 1].s.to = 1;
    if (game.taps >= ROUND) endRound();
  }
}

function land(f, speed) {
  f.airborne = false;
  const impact = speed / f.s; // in sizes per second
  f.squash.v += impact * 1.25; // flatten
  if (impact > 1.5) {
    play('boop', { rate: f.voice, gain: clamp(impact / 8, 0.15, 0.5) });
    if (Math.random() < 0.35) play('squeak', { rate: f.voice * rand(1.25, 1.6), gain: 0.3 });
  }
  if (impact > 2.5) {
    f.hopV = speed * 0.28; // a smaller second bounce
    f.airborne = true;
  }
  if (f.mouth === 'o' && (f.phase === 'react' || f.phase === 'party') && f.reactT > 0.15) {
    const options = ['grin', 'happy', 'smirk', 'happy', 'sad'];
    f.mouth = pick(options);
    f.flip = Math.random() < 0.5 ? -1 : 1;
    f.open.to = 0;
  }
}

function duck(f) {
  if (f.phase === 'out') return;
  f.phase = 'out';
  f.t = 0;
  f.squash.v += 4;
  f.hopV = Math.max(f.hopV, 1.2 * f.s);
  f.airborne = true;
  f.browUp.to = 0;
  play('drip', { rate: f.voice, gain: 0.4 });
}

// Where an eye is on screen, given the face's current transform.
function eyeWorld(f, e, out) {
  const sc = f.scale.x;
  const sx = sc * (1 + f.squash.x);
  const sy = sc * (1 - f.squash.x * 0.85);
  const lx = e.x * f.s * sx;
  const ly = -e.y * f.s * sy;
  const c = Math.cos(f.tilt.x);
  const s = Math.sin(f.tilt.x);
  out.x = f.x + lx * c - ly * s;
  out.y = f.y - f.hop + lx * s + ly * c;
  out.r = Math.max(e.r * f.s * Math.sqrt(Math.max(sx * sy, 0.16)), 2);
}

const tmp = { x: 0, y: 0, r: 0 };

function stepFace(f, h) {
  f.t += h;
  stepSpring(f.scale, h);
  stepSpring(f.squash, h);
  stepSpring(f.tilt, h);
  stepSpring(f.open, h);
  stepSpring(f.browUp, h);
  f.squash.x = clamp(f.squash.x, -0.45, 0.45);

  // Stretched along the jump while in the air, more the faster it moves.
  f.squash.to = f.airborne ? -Math.min(Math.abs(f.hopV) / (f.s * 26), 0.14) : 0;
  if (f.airborne) {
    f.hopV -= HOP_G * f.s * h;
    f.hop += f.hopV * h;
    if (f.hop <= 0) {
      f.hop = 0;
      const v = -f.hopV;
      f.hopV = 0;
      land(f, v);
    }
  }

  // The pupils.
  for (const e of f.eyes) {
    eyeWorld(f, e, tmp);
    let ax = 0;
    let ay = 0;
    if (e.fresh) {
      e.fresh = false;
      e.vx = 0;
      e.vy = 0;
    } else {
      const vx = (tmp.x - e.wx) / h;
      const vy = (tmp.y - e.wy) / h;
      ax = (vx - e.vx) / h;
      ay = (vy - e.vy) / h;
      e.vx = vx;
      e.vy = vy;
    }
    e.wx = tmp.x;
    e.wy = tmp.y;
    // Forces in eye radii per s²: gravity, the eye's own acceleration felt backwards, a shake.
    let fx = PUPIL_G * gravity.x + shake.x - ax / tmp.r;
    let fy = PUPIL_G * gravity.y + shake.y - ay / tmp.r;
    const fm = Math.hypot(fx, fy);
    if (fm > 4000) {
      fx *= 4000 / fm;
      fy *= 4000 / fm;
    }
    e.pvx += (fx - PUPIL_DAMP * e.pvx) * h;
    e.pvy += (fy - PUPIL_DAMP * e.pvy) * h;
    e.px += e.pvx * h;
    e.py += e.pvy * h;
    const d = Math.hypot(e.px, e.py);
    if (d > TRAVEL) {
      const nx = e.px / d;
      const ny = e.py / d;
      e.px = nx * TRAVEL;
      e.py = ny * TRAVEL;
      const vn = e.pvx * nx + e.pvy * ny;
      if (vn > 0) {
        // Bounce off the rim, or settle against it when slow.
        const k = vn > 0.8 ? 1 + PUPIL_BOUNCE : 1;
        e.pvx -= k * vn * nx;
        e.pvy -= k * vn * ny;
      }
      // Roll along the rim, slowing.
      const keep = Math.exp(-PUPIL_ROLL * h);
      const vt = -e.pvx * ny + e.pvy * nx;
      const vn2 = e.pvx * nx + e.pvy * ny;
      e.pvx = vn2 * nx - vt * keep * ny;
      e.pvy = vn2 * ny + vt * keep * nx;
    }
  }
}

function updateFace(f, dt) {
  const p = game.taps / ROUND;
  if (f.phase === 'in' && f.t > 0.45) {
    f.phase = f.party ? 'party' : 'idle';
    f.t = 0;
    f.life = lerp(7.5, 4.5, p) * rand(0.85, 1.15);
  } else if (f.phase === 'idle') {
    if (f.t > f.life && game.state === 'play') duck(f);
  } else if (f.phase === 'react') {
    f.reactT += dt;
    if (f.reactT > 0.3) f.browUp.to = 0;
    if (f.reactT > 1.25 && !f.airborne) duck(f);
  } else if (f.phase === 'party') {
    f.reactT += dt;
    if (f.reactT > 0.3) f.browUp.to = 0;
  } else if (f.phase === 'out') {
    if (f.t > 0.12) {
      f.scale.k = 260;
      f.scale.c = 24;
      f.scale.to = 0;
    }
  }

  // Idle life: small hops, wobbles and tilts, so the pupils keep rolling.
  if ((f.phase === 'idle' || f.phase === 'party') && !f.airborne) {
    f.wiggleAt -= dt;
    if (f.wiggleAt <= 0) {
      f.wiggleAt = rand(1.6, 3.6);
      const k = reduceMotion ? 0.5 : 1;
      const r = Math.random();
      if (r < 0.4) {
        f.hopV = Math.sqrt(2 * HOP_G * 0.06 * k) * f.s;
        f.airborne = true;
      } else if (r < 0.75) {
        f.tilt.v += rand(2.5, 4) * k * (Math.random() < 0.5 ? -1 : 1);
      } else {
        f.squash.v += rand(-3, 3) * k;
      }
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Gravity and shakes from the device, when it has motion sensors.

const gravity = { x: 0, y: 1 };
const tiltTarget = { x: 0, y: 1 };
const shake = { x: 0, y: 0 };
const shakeTarget = { x: 0, y: 0 };
const D2R = Math.PI / 180;

function screenAngle() {
  const o = window.screen && window.screen.orientation;
  if (o && typeof o.angle === 'number') return o.angle;
  return typeof window.orientation === 'number' ? window.orientation : 0;
}

// Device axes (x right, y up the screen) to screen axes (x right, y down), for the current rotation.
function toScreen(x, y) {
  const a = screenAngle() * D2R;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const sx = x;
  const sy = -y;
  return { x: sx * c + sy * s, y: -sx * s + sy * c };
}

let listening = false;
function listenForMotion() {
  if (listening) return;
  listening = true;
  window.addEventListener('deviceorientation', (e) => {
    if (e.beta == null || e.gamma == null) return;
    const b = e.beta * D2R;
    const g = e.gamma * D2R;
    // Gravity in device axes is (sin γ cos β, −sin β, −cos β cos γ); only the screen's plane counts.
    const v = toScreen(Math.sin(g) * Math.cos(b), -Math.sin(b));
    tiltTarget.x = v.x;
    tiltTarget.y = v.y;
  });
  window.addEventListener('devicemotion', (e) => {
    const a = e.acceleration;
    if (!a || a.x == null || a.y == null) return;
    const v = toScreen(a.x, a.y);
    const m = Math.hypot(v.x, v.y);
    // Shakes only: ignore sensor noise.
    const k = m < 0.6 ? 0 : -MS2_TO_G * 0.8;
    shakeTarget.x = v.x * k;
    shakeTarget.y = v.y * k;
  });
}

const touchDevice = window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
const needsPermission =
  typeof window.DeviceOrientationEvent !== 'undefined' &&
  typeof window.DeviceOrientationEvent.requestPermission === 'function';
if (touchDevice && !needsPermission) listenForMotion();

// iOS asks once, and only from a tap.
let asked = false;
function askForMotion() {
  if (asked || !needsPermission) return;
  asked = true;
  window.DeviceOrientationEvent.requestPermission()
    .then((state) => {
      if (state === 'granted') listenForMotion();
    })
    .catch(() => {});
  const DME = window.DeviceMotionEvent;
  if (DME && typeof DME.requestPermission === 'function') DME.requestPermission().catch(() => {});
}

// ---------------------------------------------------------------------------------------------
// The round

const game = { state: 'play', taps: 0, round: 1, t: 0, nextSpawn: 0.6, endT: 0 };
let pips = [];
const ripples = [];

function aliveCount() {
  let n = 0;
  for (const f of faces) if (f.phase !== 'out') n++;
  return n;
}

function endRound() {
  game.state = 'end';
  game.endT = 0;
}

function startRound() {
  againBtn.hidden = true;
  for (const f of faces) duck(f);
  game.state = 'play';
  game.taps = 0;
  game.round++;
  game.nextSpawn = game.t + 0.8;
  pips = [];
}

function partyTime() {
  const n = W < 520 ? 3 : 4;
  const s = Math.min(baseSize, (W - safe.l - safe.r - 32) / (n * 1.18));
  const gap = s * 1.18;
  const y = clamp(H * 0.52 + s * 0.5, safe.t + 70 + s * 1.2, H - safe.b - 150);
  for (let i = 0; i < n; i++) {
    const x = W / 2 + (i - (n - 1) / 2) * gap;
    setTimeout(() => {
      const f = createFace(x, y, s * rand(0.94, 1.04), { party: true });
      f.mouth = 'happy';
      f.open.to = 0;
      f.open.x = 0;
    }, i * 110);
  }
  // A happy wave along the row, twice.
  for (let w = 0; w < 2; w++) {
    for (let i = 0; i < n; i++) {
      setTimeout(
        () => {
          const party = faces.filter((f) => f.party && f.phase !== 'out');
          const f = party[i];
          if (!f || f.airborne) return;
          f.hopV = Math.sqrt(2 * HOP_G * 0.22) * f.s;
          f.airborne = true;
          f.squash.v -= 5;
        },
        900 + w * 1300 + i * 140
      );
    }
  }
}

function updateGame(dt) {
  game.t += dt;
  const p = game.taps / ROUND;

  if (game.state === 'play') {
    const want = Math.min(capacity, 1 + Math.floor(game.taps / 3));
    if (aliveCount() < want && game.t >= game.nextSpawn) {
      const f = spawnFace();
      game.nextSpawn = game.t + (f ? lerp(0.9, 0.35, p) : 0.25);
    }
  } else if (game.state === 'end') {
    const before = game.endT;
    game.endT += dt;
    const crossed = (t) => before < t && game.endT >= t;
    if (crossed(0.55)) for (const f of faces) if (!f.party) duck(f);
    if (crossed(1.0)) {
      play('finale', { gain: 0.8, spread: 0 });
      partyTime();
    }
    if (crossed(2.4)) {
      againBtn.hidden = false;
      game.state = 'party';
    }
  }

  for (const f of faces) updateFace(f, dt);
  for (let i = faces.length - 1; i >= 0; i--) {
    const f = faces[i];
    if (f.phase === 'out' && f.t > 0.3 && f.scale.x < 0.03) faces.splice(i, 1);
  }
  for (let i = ripples.length - 1; i >= 0; i--) {
    ripples[i].t += dt;
    if (ripples[i].t > 0.6) ripples.splice(i, 1);
  }

  // Ease the sensor readings in, so the pupils roll rather than jump.
  const kg = 1 - Math.exp(-dt * 10);
  gravity.x += (tiltTarget.x - gravity.x) * kg;
  gravity.y += (tiltTarget.y - gravity.y) * kg;
  const ks = 1 - Math.exp(-dt * 25);
  shake.x += (shakeTarget.x - shake.x) * ks;
  shake.y += (shakeTarget.y - shake.y) * ks;
}

againBtn.addEventListener('click', () => {
  play('pop', { gain: 0.7 });
  startRound();
});

// ---------------------------------------------------------------------------------------------
// Input

function faceAt(x, y) {
  let best = null;
  let bestD = Infinity;
  for (const f of faces) {
    if (f.phase === 'out' || f.scale.x < 0.3) continue;
    const cy = f.y - f.hop - f.s * 0.5;
    const d = Math.hypot(x - f.x, y - cy);
    if (d < f.s * 0.66 && d < bestD) {
      best = f;
      bestD = d;
    }
  }
  return best;
}

function tapAt(x, y) {
  const f = faceAt(x, y);
  if (f) {
    tapFace(f);
    return;
  }
  // An empty tap: a soft ring, and every pupil gives a little start.
  ripples.push({ x, y, t: 0 });
  play('boop', { rate: 1.15, gain: 0.35 });
  for (const o of faces) {
    const d = Math.hypot(o.x - x, o.y - o.s / 2 - y);
    const k = clamp(1 - d / (Math.max(W, H) * 0.7), 0.15, 1);
    for (const e of o.eyes) {
      e.pvx += ((o.x - x) / (d || 1)) * 4 * k;
      e.pvy += ((o.y - o.s / 2 - y) / (d || 1)) * 4 * k - 1.5 * k;
    }
    if (!o.airborne && o.phase !== 'out') o.tilt.v += clamp((o.x - x) / 200, -1, 1) * 2.5 * k;
  }
}

canvas.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  tapAt(e.clientX, e.clientY);
});
canvas.addEventListener('pointerup', askForMotion);
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

// Space or Enter taps a face, for a keyboard.
window.addEventListener('keydown', (e) => {
  if (e.key !== ' ' && e.key !== 'Enter') return;
  if (e.target instanceof Element && e.target.closest('button, a, input')) return;
  e.preventDefault();
  if (e.repeat) return;
  const ready = faces.filter((f) => f.phase !== 'out' && f.scale.x > 0.3);
  const f = ready.find((o) => !o.tapped) || ready[0];
  if (f) tapFace(f);
  else tapAt(W / 2, H / 2);
});

// ---------------------------------------------------------------------------------------------
// Drawing

function drawFace(f) {
  const s = f.s;
  const sc = f.scale.x;
  if (sc <= 0.01) return;
  const breathe = f.phase === 'idle' || f.phase === 'party' ? Math.sin(game.t * 2.4 + f.id) * 0.012 : 0;
  const sq = f.squash.x + breathe;
  const sx = sc * (1 + sq);
  const sy = sc * (1 - sq * 0.85);

  // Shadow on the ground, smaller and fainter as the face rises.
  const lift = clamp(f.hop / s, 0, 1.2);
  const shw = s * 0.78 * sc * (1 - lift * 0.35);
  ctx.globalAlpha = (palette.dark ? 0.5 : 0.32) * (1 - lift * 0.5) * clamp(sc, 0, 1);
  if (img.shadow) ctx.drawImage(img.shadow, f.x - shw / 2, f.y - shw * 0.18, shw, shw * 0.36);
  ctx.globalAlpha = 1;

  ctx.save();
  ctx.translate(f.x, f.y - f.hop);
  ctx.rotate(f.tilt.x);
  ctx.scale(sx, sy);

  const body = img[`${f.color}-${f.shape}`];
  if (body) ctx.drawImage(body, -s / 2, -s, s, s);

  const L = LAYOUT[f.shape];
  const c = Math.cos(-f.tilt.x);
  const sn = Math.sin(-f.tilt.x);
  for (const e of f.eyes) {
    const ex = e.x * s;
    const ey = -e.y * s;
    const r = e.r * s;
    const k = r / EYE_R;
    const size = 320 * k;
    if (img.white) ctx.drawImage(img.white, ex - EYE_C * k, ey - EYE_C * k, size, size);
    // The pupil rolls in screen space; turn it into the face's frame.
    const px = (e.px * c - e.py * sn) * r;
    const py = (e.px * sn + e.py * c) * r;
    if (img.pupil) ctx.drawImage(img.pupil, ex + px - PUPIL_C * k, ey + py - PUPIL_C * k, size, size);
    if (img.shine) ctx.drawImage(img.shine, ex - EYE_C * k, ey - EYE_C * k, size, size);
  }

  // Eyebrows pop up with surprise.
  const bu = f.browUp.x;
  const brow = img[f.brow];
  if (bu > 0.04 && brow) {
    ctx.globalAlpha = clamp(bu, 0, 1);
    for (const e of f.eyes) {
      const w = e.r * s * 1.25;
      const hgt = (w * brow.height) / brow.width;
      const by = -e.y * s - e.r * s - s * 0.03 - bu * s * 0.07;
      ctx.save();
      ctx.translate(e.x * s, by);
      ctx.rotate(e.x === 0 ? 0 : Math.sign(e.x) * 0.18 * bu);
      ctx.drawImage(brow, -w / 2, -hgt / 2, w, hgt);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  // The mouth: an "o" that opens and closes, or one of the pack's mouths.
  const my = -L.mouthY * s;
  const open = clamp(f.open.x, 0, 1.3);
  if (open > 0.05) {
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.ellipse(0, my, s * 0.05 * open + 0.5, s * 0.065 * open + 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  if (f.mouth !== 'o' && open < 0.6) {
    const m = img[f.mouth];
    if (m) {
      const w = L.mouthW * s * (f.mouth === 'grin' ? 1.25 : f.mouth === 'smirk' ? 0.7 : 1);
      const hgt = (w * m.height) / m.width;
      ctx.save();
      ctx.globalAlpha = clamp(1 - open * 1.6, 0, 1);
      ctx.translate(0, my);
      ctx.scale(f.flip, 1);
      ctx.drawImage(m, -w / 2, -hgt / 2, w, hgt);
      ctx.restore();
    }
  }
  ctx.restore();
}

function drawPips() {
  const d = W < 360 ? 10 : 12;
  const gap = W < 360 ? 6 : 8;
  const total = ROUND * d + (ROUND - 1) * gap;
  const x0 = W / 2 - total / 2 + d / 2;
  const y = safe.t + 34;
  for (let i = 0; i < ROUND; i++) {
    const x = x0 + i * (d + gap);
    ctx.fillStyle = palette['pip-empty'];
    ctx.beginPath();
    ctx.arc(x, y, d / 2, 0, Math.PI * 2);
    ctx.fill();
    const p = pips[i];
    if (p) {
      let k = p.s.x;
      if (game.state !== 'play') k *= 1 + 0.18 * Math.max(0, Math.sin(game.endT * 5 - i * 0.45));
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(x, y, Math.max(0, (d / 2) * k), 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function draw() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  if (bg) ctx.drawImage(bg, 0, 0, W, H);

  for (const r of ripples) {
    const k = r.t / 0.6;
    ctx.strokeStyle = palette.ring;
    ctx.globalAlpha = 1 - k;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(r.x, r.y, 10 + k * 46, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  const order = faces.slice().sort((a, b) => a.y - b.y);
  for (const f of order) drawFace(f);
  drawPips();
}

// ---------------------------------------------------------------------------------------------
// Loop

let last = 0;
let acc = 0;
function frame(now) {
  const dt = last ? Math.min((now - last) / 1000, 1 / 20) : 1 / 60;
  last = now;
  updateGame(dt);
  for (const p of pips) if (p) stepSpring(p.s, dt);
  acc += dt;
  while (acc >= STEP) {
    for (const f of faces) stepFace(f, STEP);
    acc -= STEP;
  }
  draw();
  requestAnimationFrame(frame);
}

document.addEventListener('visibilitychange', () => {
  last = 0;
});
window.addEventListener('resize', resize);
window
  .matchMedia('(prefers-color-scheme: dark)')
  .addEventListener('change', () => {
    readPalette();
    paintBackground();
  });

// For the tests: what is on screen, without reaching into the drawing.
window.googly = {
  get state() {
    return {
      state: game.state,
      taps: game.taps,
      round: game.round,
      faces: faces.map((f) => ({
        id: f.id,
        x: f.x,
        y: f.y - f.hop - f.s * 0.5,
        size: f.s,
        phase: f.phase,
        mouth: f.mouth,
        hop: f.hop,
        squash: f.squash.x,
        pupils: f.eyes.map((e) => ({ x: e.px, y: e.py })),
      })),
    };
  },
};

resize();
Promise.all(loading).then(() => {
  document.documentElement.dataset.ready = 'true';
  requestAnimationFrame(frame);
});

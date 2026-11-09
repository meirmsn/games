// Orbit: fling a probe off one planet, let gravity bend it round the others, and catch the next
// planet's orbit ring. One canvas; the physics lives in physics.js and the systems in levels.js.
// The spec is specs/orbit.md. Tests reach the game through window.__orbit.
import { mountShell } from '../shared/game-shell.js';
import {
  FIELD,
  DT,
  MAX_FLIGHT,
  SKIM,
  ASSIST_BAND,
  CATCH_WIDTH,
  bodyAt,
  bodyVel,
  positions,
  park,
  launch,
  step,
  brake,
  preview,
  catchLimit,
  relSpeed,
} from './physics.js';
import { SYSTEMS } from './levels.js';

const SOUNDS = ['launch', 'brake', 'skim', 'mote', 'capture', 'crash', 'lost', 'tick', 'done', 'drone'];
const { sound } = mountShell({ sounds: Object.fromEntries(SOUNDS.map((n) => [n, `sounds/${n}.mp3`])) });
const GAIN = { launch: 1.8, lost: 1.6, tick: 0.35, mote: 0.55, skim: 0.5, crash: 0.8, capture: 0.8, brake: 0.7, done: 0.7 };
const heard = []; // what played, for tests
function sfx(name, opts = {}) {
  heard.push(name);
  if (heard.length > 50) heard.shift();
  sound.play(name, { gain: GAIN[name] ?? 1, ...opts });
}

const $ = (s) => document.querySelector(s);
const canvas = $('#space');
const ctx = canvas.getContext('2d');
const ui = {
  hud: $('[data-hud]'),
  sysName: $('[data-sys-name]'),
  legs: $('[data-legs]'),
  dust: $('[data-dust]'),
  dustOf: $('[data-dust-of]'),
  dustBox: $('.dust'),
  mute: $('[data-mute]'),
  intro: $('[data-screen="intro"]'),
  introNum: $('[data-intro-num]'),
  introName: $('[data-intro-name]'),
  introPar: $('[data-intro-par]'),
  introBest: $('[data-intro-best]'),
  done: $('[data-screen="done"]'),
  medal: $('[data-medal]'),
  doneTitle: $('[data-done-title]'),
  doneDust: $('[data-done-dust]'),
  doneLaunches: $('[data-done-launches]'),
  badge: $('[data-badge]'),
  retry: $('[data-retry]'),
  next: $('[data-next]'),
  resume: $('[data-resume]'),
};

// ---------- Images ----------

const images = {};
function loadImage(key, src) {
  const img = new Image();
  img.src = src;
  images[key] = img;
  return img.decode().catch(() => {});
}
// Everything loads now, so the whole tour plays offline after one visit.
const loading = [];
for (let i = 0; i < 10; i++) loading.push(loadImage(`planet${i}`, `img/planet${i}.png`));
for (const c of ['05', '10', '14', '22']) loading.push(loadImage(`cloud${c}`, `img/cloud-${c}.png`));
for (const n of ['galaxy', 'nebula', 'band']) loading.push(loadImage(`nebula-${n}`, `img/nebula-${n}.jpg`));

// ---------- Storage (blocked storage costs only the bests) ----------

const store = {
  get(key, fallback) {
    try {
      const v = window.localStorage.getItem(key);
      return v === null ? fallback : JSON.parse(v);
    } catch (e) {
      return fallback;
    }
  },
  set(key, value) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      // blocked: the value lasts until the page closes
    }
  },
};
const MEDALS = ['', 'bronze', 'silver', 'gold'];

// ---------- Layout ----------

let W = 0;
let H = 0;
let dpr = 1;
const view = { x: 0, y: 0, s: 1 }; // field → CSS px: px = view.x + wx * view.s
const insets = { top: 0, bottom: 0, left: 0, right: 0 };
const EDGE = 24; // touches starting this close to the bottom (plus the safe area) are the phone's

function readInsets() {
  const probe = document.createElement('div');
  probe.style.cssText =
    'position:fixed;top:env(safe-area-inset-top);bottom:env(safe-area-inset-bottom);left:env(safe-area-inset-left);right:env(safe-area-inset-right);pointer-events:none;visibility:hidden';
  document.body.appendChild(probe);
  const r = probe.getBoundingClientRect();
  insets.top = r.top;
  insets.bottom = window.innerHeight - r.bottom;
  insets.left = r.left;
  insets.right = window.innerWidth - r.right;
  probe.remove();
}

function resize() {
  readInsets();
  W = window.innerWidth;
  H = window.innerHeight;
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  // The field sits below the buttons (12 + 44 + 10 px) and above the bottom edge strip.
  const top = insets.top + 66;
  const bottom = insets.bottom + EDGE;
  const side = 8;
  const aw = W - insets.left - insets.right - 2 * side;
  const ah = H - top - bottom;
  view.s = Math.max(0.05, Math.min(aw / FIELD.w, ah / FIELD.h));
  view.x = insets.left + side + (aw - FIELD.w * view.s) / 2;
  view.y = top + (ah - FIELD.h * view.s) / 2;
  makeStars();
  if (input.active) cancelAim(); // a rotation mid-drag launches nothing
}

const sx = (x) => view.x + x * view.s;
const sy = (y) => view.y + y * view.s;
const toWorld = (px, py) => ({ x: (px - view.x) / view.s, y: (py - view.y) / view.s });

// ---------- Stars ----------

let starLayer = null;
let twinklers = [];
function makeStars() {
  starLayer = document.createElement('canvas');
  starLayer.width = canvas.width;
  starLayer.height = canvas.height;
  const c = starLayer.getContext('2d');
  c.scale(dpr, dpr);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const n = Math.round((W * H) / 2600);
  for (let i = 0; i < n; i++) {
    const x = rnd() * W;
    const y = rnd() * H;
    const big = rnd() < 0.08;
    c.globalAlpha = big ? 0.55 + rnd() * 0.3 : 0.12 + rnd() * 0.3;
    c.fillStyle = rnd() < 0.15 ? '#ffe9c4' : rnd() < 0.3 ? '#c9dcff' : '#fff';
    c.beginPath();
    c.arc(x, y, big ? 0.9 + rnd() * 0.5 : 0.35 + rnd() * 0.45, 0, Math.PI * 2);
    c.fill();
  }
  twinklers = [];
  for (let i = 0; i < Math.round(n / 12); i++) {
    twinklers.push({ x: rnd() * W, y: rnd() * H, r: 0.6 + rnd() * 0.8, f: 0.3 + rnd() * 1.2, p: rnd() * 6.28 });
  }
}

// ---------- Game state ----------

const game = {
  sys: 0,
  level: SYSTEMS[0],
  leg: 0,
  mode: 'idle', // idle | aim | fly | rewind | capture | done
  clock: 0, // the system's clock: where the moons are
  legStart: 0, // the clock at this leg's start (the previous capture)
  idleAge: 0, // seconds this leg has idled (the probe circling)
  park: { r: 0, period: 1, phase: 0, dir: 1 },
  parkBody: 0, // the body the probe circles when it isn't flying
  taken: new Set(), // motes caught this system
  launches: 0,
  fails: 0,
  legFails: 0,
  skims: 0,
  flight: null,
  ghost: null, // the last failed flight: { pts, angle, power }
  trail: [], // [x, y, ok, …] of the current flight
  rewindFrom: 0,
  rewindT: 0,
  capture: null, // { t, x0, y0 } while spiralling in
  slowmo: 0, // seconds of slow motion left
  slowmoUsed: false,
  braked: store.get('orbit.braked', false),
  burst: [], // little effects: { x, y, t, kind }
  skimFlash: new Map(), // body index → seconds of flare left
  paused: false,
  intro: false,
  acc: 0, // fixed steps owed to the flight
};
const input = { active: false, id: null, x0: 0, y0: 0, angle: -Math.PI / 2, power: 0, keyboard: false, lastTick: 0 };
let manual = false; // tests own the clock

function assistNow() {
  return Math.min(1, Math.max(0, (game.legFails - 2) / 3));
}

function legOf() {
  return game.level.legs[game.leg];
}

function bodyPos(i, t = game.clock) {
  return bodyAt(game.level.bodies, i, t);
}

function probeParked(t = game.clock) {
  const b = bodyPos(game.parkBody, t);
  const a = game.park.phase + game.park.dir * ((2 * Math.PI * (t - game.legStart)) / game.park.period);
  return { x: b.x + Math.cos(a) * game.park.r, y: b.y + Math.sin(a) * game.park.r };
}

// ---------- Systems and legs ----------

function startSystem(i) {
  game.sys = Math.max(0, Math.min(SYSTEMS.length - 1, i));
  game.level = SYSTEMS[game.sys];
  game.leg = 0;
  game.clock = 0;
  game.legStart = 0;
  game.taken = new Set();
  game.launches = 0;
  game.fails = 0;
  game.skims = 0;
  game.ghost = null;
  game.trail = [];
  game.flight = null;
  game.burst = [];
  const p = park(game.level, legOf().from);
  game.park = { r: p.r, period: p.period, phase: Math.PI / 2, dir: -1 };
  game.parkBody = legOf().from;
  beginLeg();
  hideDone();
  showIntro();
  buildLegDots();
  updateHud();
  const hash = `#s${game.sys + 1}`;
  if (location.hash !== hash) history.replaceState(null, '', hash);
}

function beginLeg() {
  game.mode = 'idle';
  game.legFails = 0;
  game.idleAge = 0;
  game.ghost = null;
  game.slowmoUsed = false;
}

function systemFromHash() {
  const m = /^#s([1-9])$/.exec(location.hash);
  const n = m ? Number(m[1]) : 1;
  return n >= 1 && n <= SYSTEMS.length ? n - 1 : 0;
}

// ---------- Aim and launch ----------

function aimAngleToTarget() {
  const a = bodyPos(legOf().from);
  const b = bodyPos(legOf().to);
  return Math.atan2(b.y - a.y, b.x - a.x);
}

function launchPoint(angle) {
  const b = bodyPos(legOf().from);
  return { x: b.x + Math.cos(angle) * game.park.r, y: b.y + Math.sin(angle) * game.park.r };
}

function startAim(px, py, id) {
  input.active = true;
  input.keyboard = false;
  input.id = id;
  input.x0 = px;
  input.y0 = py;
  input.power = 0;
  input.lastTick = 0;
  game.mode = 'aim';
  fadeIntro();
}

function fullDrag() {
  return Math.max(60, 0.35 * FIELD.w * view.s);
}
const DEAD = 0.06; // a drag shorter than this share of full power launches nothing

function moveAim(px, py) {
  const dx = input.x0 - px;
  const dy = input.y0 - py;
  const len = Math.hypot(dx, dy);
  input.power = Math.min(1, len / fullDrag());
  if (len > 2) input.angle = Math.atan2(dy, dx);
  tickPower();
}

function tickPower() {
  const step = Math.floor(input.power * 5);
  if (step !== input.lastTick && input.power > DEAD) {
    if (step > input.lastTick) sfx('tick', { rate: 0.8 + step * 0.12 });
    input.lastTick = step;
  }
}

function cancelAim() {
  input.active = false;
  input.keyboard = false;
  input.id = null;
  if (game.mode === 'aim') game.mode = 'idle';
}

function releaseAim() {
  const power = input.power;
  input.active = false;
  input.id = null;
  input.keyboard = false;
  if (power <= DEAD) {
    if (game.mode === 'aim') game.mode = 'idle';
    return;
  }
  fire(input.angle, power);
}

// Launch at the aim; the power scales between the dead zone and full.
function fire(angle, power) {
  const pw = (power - DEAD) / (1 - DEAD);
  game.flight = launch(game.level, game.leg, angle, pw, game.clock, assistNow());
  game.flight.angle = angle;
  game.flight.power = power;
  game.lastLaunch = { angle, power, x: game.flight.x, y: game.flight.y, vx: game.flight.vx, vy: game.flight.vy, t: game.clock };
  game.flight.slowmoDone = false;
  game.trail = [];
  game.acc = 0;
  game.launches++;
  game.mode = 'fly';
  game.skimFlash.clear();
  sfx('launch', { rate: 0.9 + pw * 0.25 });
}

// What the preview shows for an aim: [x, y, ok, …].
function previewFor(angle, power) {
  const pw = (power - DEAD) / (1 - DEAD);
  const pts = preview(game.level, game.leg, angle, Math.max(0, pw), game.clock);
  return pts;
}

// ---------- Flight ----------

function simStep() {
  const f = game.flight;
  const before = f.caught.length;
  const skimsBefore = f.skims.length;
  step(f, game.level, game.taken);
  // trail, coloured by whether the probe is slow enough for the target ring
  const ok = relSpeed(game.level, f.to, f.t, f.vx, f.vy) < catchLimit(game.level, f.to, f.assist);
  if (Math.round(f.age / DT) % 3 === 0) {
    game.trail.push(f.x, f.y, ok ? 1 : 0);
    if (game.trail.length > 3 * 260) game.trail.splice(0, 3);
  }
  for (let k = before; k < f.caught.length; k++) {
    const i = f.caught[k];
    game.taken.add(i);
    const m = game.level.motes[i];
    game.burst.push({ x: m.x, y: m.y, t: 0, kind: 'mote' });
    sfx('mote', { rate: 1 + 0.08 * k });
    updateHud(true);
  }
  for (let k = skimsBefore; k < f.skims.length; k++) {
    game.skims++;
    game.skimFlash.set(f.skims[k], 0.8);
    sfx('skim');
  }
  // The brake's first lesson: near the ring, too fast, brake unused.
  if (
    game.sys === 1 &&
    game.leg === 0 &&
    !game.braked &&
    !f.slowmoDone &&
    f.brakeLeft > 0 &&
    !f.result
  ) {
    const tp = bodyPos(f.to, f.t);
    const tb = game.level.bodies[f.to];
    if (Math.hypot(f.x - tp.x, f.y - tp.y) < tb.ring * 2.2 && !ok) {
      f.slowmoDone = true;
      game.slowmo = 0.6;
    }
  }
  game.clock = f.t;
  if (f.result) endFlight();
}

function endFlight() {
  const f = game.flight;
  game.lastResult = { result: f.result, why: f.why, x: f.x, y: f.y, age: f.age, caught: f.caught.length };
  if (f.result === 'captured') {
    sfx('capture');
    const tp = bodyPos(f.to, f.t);
    game.capture = { t: 0, x0: f.x, y0: f.y, a0: Math.atan2(f.y - tp.y, f.x - tp.x) };
    // circle the way it arrived
    const v = bodyVel(game.level.bodies, f.to, f.t);
    const cross = (f.x - tp.x) * (f.vy - v.y) - (f.y - tp.y) * (f.vx - v.x);
    game.capture.dir = cross >= 0 ? 1 : -1;
    game.mode = 'capture';
    return;
  }
  game.fails++;
  game.legFails++;
  if (f.why === 'hit') {
    game.burst.push({ x: f.x, y: f.y, t: 0, kind: 'crash' });
    sfx('crash');
  } else {
    game.burst.push({ x: f.x, y: f.y, t: 0, kind: 'fizzle' });
    sfx('lost');
  }
  startRewind(f);
}

function startRewind(f) {
  const pts = [];
  for (let i = 0; i < game.trail.length; i += 3) pts.push(game.trail[i], game.trail[i + 1]);
  game.ghost = f ? { pts, angle: f.angle, power: f.power } : game.ghost;
  game.mode = 'rewind';
  game.rewindFrom = game.clock;
  game.rewindT = 0;
}

const REWIND = 0.7;
function updateRewind(dt) {
  game.rewindT += dt;
  const k = Math.min(1, game.rewindT / REWIND);
  const e = k * k * (3 - 2 * k);
  game.clock = game.rewindFrom + (game.legStart - game.rewindFrom) * e;
  if (k >= 1) {
    game.clock = game.legStart;
    game.flight = null;
    game.trail = [];
    game.mode = 'idle';
    game.idleAge = 0;
  }
}

const SPIRAL = 0.4;
function updateCapture(dt) {
  const c = game.capture;
  c.t += dt;
  game.clock += dt;
  if (c.t >= SPIRAL) finishCapture();
}

function finishCapture() {
  const c = game.capture;
  const leg = legOf();
  const tb = game.level.bodies[leg.to];
  const p = park(game.level, leg.to);
  // where the spiral ends: the ring, a little on from where it was caught
  const a = c.a0 + c.dir * (2 * Math.PI * c.t) / p.period;
  game.flight = null;
  game.capture = null;
  game.trail = [];
  game.parkBody = leg.to;
  if (game.leg + 1 >= game.level.legs.length) {
    game.park = { r: tb.ring, period: p.period, phase: a, dir: c.dir };
    game.legStart = game.clock;
    finishSystem();
    return;
  }
  game.leg++;
  game.legStart = game.clock;
  game.park = { r: p.r, period: p.period, phase: a, dir: c.dir };
  beginLeg();
  buildLegDots();
}

// ---------- End of a system ----------

function medalFor(got, total, launches, par) {
  if (got >= 0.9 * total && launches <= par) return 3;
  if (got >= 0.7 * total && launches <= 2 * par) return 2;
  return 1;
}

function finishSystem() {
  game.mode = 'done';
  const total = game.level.motes.length;
  const par = game.level.legs.length + 2;
  const got = game.taken.size;
  const medal = medalFor(got, total, game.launches, par);
  const bests = store.get('orbit.best', {});
  if ((bests[game.sys] || 0) < medal) {
    bests[game.sys] = medal;
    store.set('orbit.best', bests);
  }
  ui.medal.dataset.kind = MEDALS[medal];
  const last = game.sys + 1 >= SYSTEMS.length;
  ui.doneTitle.textContent = last ? 'Tour complete' : `${game.level.name} done`;
  ui.doneDust.textContent = `${got} / ${total}`;
  ui.doneLaunches.textContent = `${game.launches} / ${par}`;
  ui.done.querySelector('[data-skims]')?.remove();
  const sk = document.createElement('div');
  sk.dataset.skims = '';
  sk.innerHTML = `<dt>Skims</dt><dd>${game.skims}</dd>`;
  ui.done.querySelector('.stats').appendChild(sk);
  ui.badge.hidden = game.fails > 0;
  ui.next.textContent = last ? 'Play again' : 'Next';
  ui.done.hidden = false;
  sfx('done');
  buildLegDots();
  setTimeout(() => ui.next.focus({ preventScroll: true }), 50);
}

function hideDone() {
  ui.done.hidden = true;
}

ui.next.addEventListener('click', () => {
  const last = game.sys + 1 >= SYSTEMS.length;
  startSystem(last ? 0 : game.sys + 1);
});
ui.retry.addEventListener('click', () => startSystem(game.sys));

// ---------- HUD and intro ----------

function buildLegDots() {
  ui.legs.innerHTML = '';
  for (let i = 0; i < game.level.legs.length; i++) {
    const d = document.createElement('i');
    if (i < game.leg || game.mode === 'done') d.className = 'done';
    else if (i === game.leg) d.className = 'now';
    ui.legs.appendChild(d);
  }
}

function updateHud(pop = false) {
  ui.sysName.textContent = game.level.name;
  ui.dust.textContent = game.taken.size;
  ui.dustOf.textContent = game.level.motes.length;
  if (pop) {
    ui.dustBox.classList.remove('pop');
    void ui.dustBox.offsetWidth;
    ui.dustBox.classList.add('pop');
  }
}

function showIntro() {
  game.intro = true;
  ui.introNum.textContent = `System ${game.sys + 1}`;
  ui.introName.textContent = game.level.name;
  ui.introPar.textContent = game.level.legs.length + 2;
  const best = store.get('orbit.best', {})[game.sys] || 0;
  ui.introBest.textContent = best ? `Best: ${MEDALS[best]}` : '';
  ui.intro.dataset.best = MEDALS[best];
  ui.intro.classList.remove('fade');
  ui.intro.hidden = false;
}

function fadeIntro() {
  if (!game.intro) return;
  game.intro = false;
  ui.intro.classList.add('fade');
  setTimeout(() => {
    if (!game.intro) ui.intro.hidden = true;
  }, 520);
}

// ---------- Update ----------

function update(dt) {
  if (game.paused) return;
  for (const b of game.burst) b.t += dt;
  game.burst = game.burst.filter((b) => b.t < 1.2);
  for (const [k, v] of game.skimFlash) {
    if (v - dt <= 0) game.skimFlash.delete(k);
    else game.skimFlash.set(k, v - dt);
  }
  switch (game.mode) {
    case 'idle':
      game.clock += dt;
      game.idleAge += dt;
      break;
    case 'aim':
      break; // the clock waits while you aim
    case 'fly': {
      let scale = 1;
      if (game.slowmo > 0) {
        game.slowmo -= dt;
        scale = 0.4;
      }
      // whole fixed steps, counted in steps so 60 and 120 Hz frames never drift apart
      game.acc += (dt * scale) / DT;
      while (game.acc >= 1 - 1e-6 && game.mode === 'fly') {
        game.acc -= 1;
        simStep();
      }
      break;
    }
    case 'rewind':
      updateRewind(dt);
      break;
    case 'capture':
      updateCapture(dt);
      break;
    case 'done':
      game.clock += dt;
      break;
  }
}

// ---------- Drawing ----------

let time = 0;
const COOL = '150, 225, 255';
const AMBER = '255, 179, 71';

function draw() {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  drawSky();
  const pos = positions(game.level.bodies, game.clock);
  drawRings(pos);
  for (let i = 0; i < game.level.bodies.length; i++) drawBody(i, pos[i * 2], pos[i * 2 + 1]);
  drawMotes();
  drawGhost();
  drawTrail();
  drawAim();
  drawProbe();
  drawBursts();
}

function drawSky() {
  const neb = images[`nebula-${game.level.nebula}`];
  if (neb && neb.complete && neb.naturalWidth) {
    const s = Math.max(W / neb.naturalWidth, H / neb.naturalHeight);
    const w = neb.naturalWidth * s;
    const h = neb.naturalHeight * s;
    ctx.globalAlpha = 0.2;
    ctx.drawImage(neb, (W - w) / 2, (H - h) / 2, w, h);
    ctx.globalAlpha = 1;
    // keep it pitch black at the middle, the nebula only a breath at the edges
    const g = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.7);
    g.addColorStop(0, 'rgba(0,0,0,0.75)');
    g.addColorStop(1, 'rgba(0,0,0,0.2)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
  if (starLayer) ctx.drawImage(starLayer, 0, 0, W, H);
  ctx.fillStyle = '#fff';
  for (const s of twinklers) {
    ctx.globalAlpha = 0.25 + 0.55 * (0.5 + 0.5 * Math.sin(time * s.f + s.p));
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// The target's ring (dashed, turning), and a faint parking ring round the probe's planet.
function drawRings(pos) {
  const leg = legOf();
  if (game.mode !== 'done') {
    const i = leg.to;
    const b = game.level.bodies[i];
    const x = sx(pos[i * 2]);
    const y = sy(pos[i * 2 + 1]);
    const r = b.ring * view.s;
    let glow = 0.55 + 0.15 * Math.sin(time * 2.4);
    let col = COOL;
    const f = game.flight;
    if (f && game.mode === 'fly') {
      const ok = relSpeed(game.level, f.to, f.t, f.vx, f.vy) < catchLimit(game.level, f.to, f.assist);
      const d = Math.hypot(f.x - pos[i * 2], f.y - pos[i * 2 + 1]);
      if (d < b.ring * 2.5) {
        if (ok) glow = 1;
        else if (f.fastPass) {
          col = AMBER;
          glow = 0.5 + 0.5 * Math.sin(time * 40);
        }
      }
    }
    if (game.mode === 'capture') glow = 1;
    // soft glow band (where a catch counts)
    ctx.strokeStyle = `rgba(${col}, ${0.1 * glow})`;
    ctx.lineWidth = Math.max(4, CATCH_WIDTH * view.s * 1.2);
    ctx.beginPath();
    ctx.arc(x, y, r + (CATCH_WIDTH * view.s) / 2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(time * 0.25);
    ctx.setLineDash([Math.max(4, r * 0.18), Math.max(4, r * 0.12)]);
    ctx.strokeStyle = `rgba(${col}, ${0.45 + 0.5 * glow})`;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
  if (game.mode === 'idle' || game.mode === 'aim') {
    const i = leg.from;
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(sx(pos[i * 2]), sy(pos[i * 2 + 1]), game.park.r * view.s, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawBody(i, wx, wy) {
  const b = game.level.bodies[i];
  const x = sx(wx);
  const y = sy(wy);
  const r = b.r * view.s;
  // atmosphere glow: the skim zone
  const flare = game.skimFlash.get(i) || 0;
  const g = ctx.createRadialGradient(x, y, r * 0.95, x, y, r * SKIM);
  g.addColorStop(0, `rgba(${b.glow || '170, 210, 255'}, ${0.22 + flare * 0.6})`);
  g.addColorStop(1, `rgba(${b.glow || '170, 210, 255'}, 0)`);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r * SKIM, 0, Math.PI * 2);
  ctx.fill();
  const img = images[`planet${b.img}`];
  const size = (r / 0.8) * 2; // the body fills 80% of its sprite
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate((time * (b.spin || 1) * Math.PI * 2) / 60);
  if (img && img.complete && img.naturalWidth) ctx.drawImage(img, -size / 2, -size / 2, size, size);
  ctx.restore();
  // clouds, turning a little faster the other way
  const cloud = images[`cloud${b.cloud}`];
  if (cloud && cloud.complete && cloud.naturalWidth) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r * 0.99, 0, Math.PI * 2);
    ctx.clip();
    ctx.translate(x, y);
    ctx.rotate((-time * (b.spin || 1) * 1.6 * Math.PI * 2) / 60);
    ctx.globalAlpha = 0.28;
    ctx.drawImage(cloud, -r, -r, 2 * r, 2 * r);
    ctx.restore();
  }
  // shadow on the side away from the sun (up and to the left)
  const sh = ctx.createLinearGradient(x - r * 0.7, y - r * 0.7, x + r * 0.7, y + r * 0.7);
  sh.addColorStop(0, 'rgba(0,0,0,0)');
  sh.addColorStop(0.55, 'rgba(0,0,0,0.12)');
  sh.addColorStop(1, 'rgba(0,0,8,0.62)');
  ctx.fillStyle = sh;
  ctx.beginPath();
  ctx.arc(x, y, r * 1.0, 0, Math.PI * 2);
  ctx.fill();
}

function drawMotes() {
  const motes = game.level.motes;
  for (let i = 0; i < motes.length; i++) {
    if (game.taken.has(i)) continue;
    const m = motes[i];
    const current = m.leg === game.leg && game.mode !== 'done';
    const x = sx(m.x);
    const y = sy(m.y + Math.sin(time * 1.6 + i) * 3);
    const s = Math.max(2.2, 7 * view.s) * (current ? 1 : 0.7);
    ctx.globalAlpha = current ? 0.9 : 0.25;
    const g = ctx.createRadialGradient(x, y, 0, x, y, s * 2.6);
    g.addColorStop(0, 'rgba(255, 220, 140, 0.9)');
    g.addColorStop(1, 'rgba(255, 190, 80, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, s * 2.6, 0, Math.PI * 2);
    ctx.fill();
    // a four-point sparkle
    ctx.fillStyle = '#fff6dc';
    const tw = 1 + 0.25 * Math.sin(time * 3 + i * 1.7);
    ctx.beginPath();
    ctx.moveTo(x, y - s * 1.4 * tw);
    ctx.quadraticCurveTo(x, y, x + s * 1.4 * tw, y);
    ctx.quadraticCurveTo(x, y, x, y + s * 1.4 * tw);
    ctx.quadraticCurveTo(x, y, x - s * 1.4 * tw, y);
    ctx.quadraticCurveTo(x, y, x, y - s * 1.4 * tw);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawGhost() {
  const gh = game.ghost;
  if (!gh || game.mode === 'fly' || game.mode === 'capture') return;
  ctx.strokeStyle = 'rgba(255,255,255,0.16)';
  ctx.lineWidth = 1;
  ctx.setLineDash([2, 5]);
  ctx.beginPath();
  for (let i = 0; i < gh.pts.length; i += 2) {
    const x = sx(gh.pts[i]);
    const y = sy(gh.pts[i + 1]);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.setLineDash([]);
  if (game.mode === 'idle' || game.mode === 'aim') {
    const p = launchPoint(gh.angle);
    drawBand(p.x, p.y, gh.angle, gh.power, 0.25);
  }
}

function drawTrail() {
  const t = game.trail;
  const n = t.length / 3;
  if (n < 2) return;
  ctx.lineCap = 'round';
  const dim = timeoutDim();
  for (let k = 1; k < n; k++) {
    const a = (k / n) ** 1.4;
    ctx.strokeStyle = `rgba(${t[k * 3 + 2] ? COOL : AMBER}, ${0.75 * a * dim})`;
    ctx.lineWidth = Math.max(1, 2.4 * a);
    ctx.beginPath();
    ctx.moveTo(sx(t[(k - 1) * 3]), sy(t[(k - 1) * 3 + 1]));
    ctx.lineTo(sx(t[k * 3]), sy(t[k * 3 + 1]));
    ctx.stroke();
  }
}

function drawAim() {
  if (game.mode !== 'aim' || input.power <= DEAD) return;
  const p = launchPoint(input.angle);
  // the preview thread, coloured by speed against the target's limit, fading out
  const pts = previewFor(input.angle, input.power);
  const n = pts.length / 2;
  const okAt = previewColours(input.angle, input.power);
  ctx.lineCap = 'round';
  for (let k = 1; k < n; k++) {
    const a = 1 - k / n;
    ctx.strokeStyle = `rgba(${okAt[k] ? COOL : AMBER}, ${0.9 * a})`;
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(sx(pts[(k - 1) * 2]), sy(pts[(k - 1) * 2 + 1]));
    ctx.lineTo(sx(pts[k * 2]), sy(pts[k * 2 + 1]));
    ctx.stroke();
  }
  drawBand(p.x, p.y, input.angle, input.power, 0.85);
}

// The pull: a band behind the probe, opposite the aim, longer and brighter with more power.
function drawBand(wx, wy, angle, power, alpha) {
  const x = sx(wx);
  const y = sy(wy);
  const len = 10 + power * 56;
  const ex = x - Math.cos(angle) * len;
  const ey = y - Math.sin(angle) * len;
  const g = ctx.createLinearGradient(x, y, ex, ey);
  g.addColorStop(0, `rgba(255,255,255,${alpha})`);
  g.addColorStop(1, `rgba(255,255,255,${alpha * 0.15})`);
  ctx.strokeStyle = g;
  ctx.lineCap = 'round';
  ctx.lineWidth = 2 + power * 3;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(ex, ey);
  ctx.stroke();
  // a small knob where the pull ends
  ctx.fillStyle = `rgba(255,255,255,${alpha * 0.5})`;
  ctx.beginPath();
  ctx.arc(ex, ey, 2.5 + power * 2, 0, Math.PI * 2);
  ctx.fill();
}

// For each preview point: is the probe there slow enough for the target ring (with the assist)?
function previewColours(angle, power) {
  const pw = Math.max(0, (power - DEAD) / (1 - DEAD));
  const f = launch(game.level, game.leg, angle, pw, game.clock, assistNow());
  const limit = catchLimit(game.level, f.to, assistNow());
  const out = [relSpeed(game.level, f.to, f.t, f.vx, f.vy) < limit];
  const pts = previewFor(angle, power);
  // walk the same flight, 3 steps per preview point
  for (let k = 1; k < pts.length / 2; k++) {
    for (let s = 0; s < 3 && !f.result; s++) step(f, game.level);
    out.push(relSpeed(game.level, f.to, f.t, f.vx, f.vy) < limit);
  }
  return out;
}

function timeoutDim() {
  const f = game.flight;
  if (!f || game.mode !== 'fly') return 1;
  return Math.max(0.15, Math.min(1, (MAX_FLIGHT - f.age) / 2));
}

function probeWorld() {
  if (game.mode === 'fly' && game.flight) return { x: game.flight.x, y: game.flight.y };
  if (game.mode === 'aim') return launchPoint(input.angle);
  if (game.mode === 'capture' && game.flight) {
    const leg = legOf();
    const c = game.capture;
    const tp = bodyPos(leg.to);
    const p = park(game.level, leg.to);
    const k = Math.min(1, c.t / SPIRAL);
    const e = 1 - (1 - k) * (1 - k);
    const a = c.a0 + (c.dir * (2 * Math.PI * c.t)) / p.period;
    const r0 = Math.hypot(c.x0 - tp.x, c.y0 - tp.y);
    const r = r0 + (p.r - r0) * e;
    return { x: tp.x + Math.cos(a) * r, y: tp.y + Math.sin(a) * r };
  }
  if (game.mode === 'rewind') return null;
  return probeParked();
}

function drawProbe() {
  const p = probeWorld();
  if (!p) return;
  const x = sx(p.x);
  const y = sy(p.y);
  const dim = timeoutDim();
  const pulse = game.mode === 'idle' ? 1 + 0.25 * Math.sin(time * 4) : 1;
  const off = x < -4 || x > W + 4 || y < -4 || y > H + 4;
  if (off) {
    // an arrow at the edge, pointing to where it went
    const cx = Math.max(14, Math.min(W - 14, x));
    const cy = Math.max(14, Math.min(H - 14, y));
    const a = Math.atan2(y - cy, x - cx);
    ctx.fillStyle = `rgba(${COOL}, 0.8)`;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * 9, cy + Math.sin(a) * 9);
    ctx.lineTo(cx + Math.cos(a + 2.4) * 8, cy + Math.sin(a + 2.4) * 8);
    ctx.lineTo(cx + Math.cos(a - 2.4) * 8, cy + Math.sin(a - 2.4) * 8);
    ctx.closePath();
    ctx.fill();
    return;
  }
  const r = Math.max(2.6, 6 * view.s);
  const g = ctx.createRadialGradient(x, y, 0, x, y, r * 5 * pulse);
  g.addColorStop(0, `rgba(220, 245, 255, ${0.9 * dim})`);
  g.addColorStop(0.3, `rgba(${COOL}, ${0.35 * dim})`);
  g.addColorStop(1, `rgba(${COOL}, 0)`);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r * 5 * pulse, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = `rgba(255,255,255,${dim})`;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  // the brake: a small flame pip ahead of the probe while it's unused; a flare when fired
  const f = game.flight;
  if (f && game.mode === 'fly') {
    const sp = Math.hypot(f.vx, f.vy) || 1;
    const ux = f.vx / sp;
    const uy = f.vy / sp;
    if (f.brakeLeft > 0) {
      const big = game.slowmo > 0 ? 1.8 + 0.6 * Math.sin(time * 18) : 1;
      ctx.fillStyle = `rgba(${AMBER}, ${0.75 * dim})`;
      ctx.beginPath();
      ctx.arc(x + ux * r * 2.6, y + uy * r * 2.6, r * 0.55 * big, 0, Math.PI * 2);
      ctx.fill();
    } else if (f.brakeAge >= 0 && f.age - f.brakeAge < 0.35) {
      const k = 1 - (f.age - f.brakeAge) / 0.35;
      ctx.strokeStyle = `rgba(${AMBER}, ${k})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x + ux * r, y + uy * r);
      ctx.lineTo(x + ux * r * (3 + 5 * k), y + uy * r * (3 + 5 * k));
      ctx.stroke();
    }
  }
}

function drawBursts() {
  for (const b of game.burst) {
    const x = sx(b.x);
    const y = sy(b.y);
    const k = b.t / (b.kind === 'mote' ? 0.5 : 1.0);
    if (k >= 1) continue;
    const col = b.kind === 'mote' ? '255, 220, 140' : b.kind === 'crash' ? '255, 170, 110' : COOL;
    ctx.strokeStyle = `rgba(${col}, ${1 - k})`;
    ctx.lineWidth = 2 * (1 - k) + 0.5;
    ctx.beginPath();
    ctx.arc(x, y, 4 + k * (b.kind === 'mote' ? 18 : 34), 0, Math.PI * 2);
    ctx.stroke();
    if (b.kind === 'crash') {
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + 0.3;
        const d = 6 + k * 40;
        ctx.fillStyle = `rgba(${col}, ${1 - k})`;
        ctx.beginPath();
        ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}

// ---------- Input ----------

function onDown(e) {
  if (game.paused) {
    resumeGame();
    return;
  }
  if (input.id !== null && e.pointerId !== input.id) return; // a second finger
  if (e.clientY > H - insets.bottom - EDGE) return; // the phone's swipe strip
  if (game.mode === 'fly') {
    if (game.level.brake && game.flight && brake(game.flight, game.level)) {
      sfx('brake');
      game.slowmo = 0;
      if (!game.braked) {
        game.braked = true;
        store.set('orbit.braked', true);
      }
    }
    return;
  }
  if (game.mode !== 'idle') return;
  try {
    canvas.setPointerCapture(e.pointerId);
  } catch (err) {
    // a synthetic or already-lifted pointer: the drag still works without capture
  }
  startAim(e.clientX, e.clientY, e.pointerId);
}

function onMove(e) {
  if (!input.active || e.pointerId !== input.id || input.keyboard) return;
  moveAim(e.clientX, e.clientY);
}

function onUp(e) {
  if (!input.active || e.pointerId !== input.id) return;
  moveAim(e.clientX, e.clientY);
  releaseAim();
}

function onCancel(e) {
  if (e.pointerId === input.id) cancelAim();
}

canvas.addEventListener('pointerdown', onDown);
canvas.addEventListener('pointermove', onMove);
canvas.addEventListener('pointerup', onUp);
canvas.addEventListener('pointercancel', onCancel);
canvas.addEventListener('lostpointercapture', onCancel);
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

const keysDown = new Set();
window.addEventListener('keydown', (e) => {
  if (e.target instanceof Element && e.target.closest('button') && (e.key === ' ' || e.key === 'Enter')) return;
  if (game.paused) {
    if (e.key === ' ' || e.key === 'Enter') resumeGame();
    return;
  }
  const k = e.key;
  if (k === 'r' || k === 'R') {
    rewindByHand();
    return;
  }
  if (k === ' ') {
    e.preventDefault();
    if (game.mode === 'fly') {
      onDown({ pointerId: -2, clientY: 0 });
      return;
    }
    if (game.mode === 'idle') keyAimStart();
    if (game.mode === 'aim' && input.keyboard) {
      if (input.power <= DEAD) input.power = 0.5;
      releaseAim();
    }
    return;
  }
  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(k)) {
    e.preventDefault();
    if (game.mode === 'idle') keyAimStart();
    if (game.mode !== 'aim' || !input.keyboard) return;
    keysDown.add(k);
    if (k === 'ArrowLeft') input.angle -= (e.shiftKey ? 5 : 0.5) * (Math.PI / 180);
    if (k === 'ArrowRight') input.angle += (e.shiftKey ? 5 : 0.5) * (Math.PI / 180);
    if (k === 'ArrowUp') input.power = Math.min(1, input.power + (e.shiftKey ? 0.05 : 0.01));
    if (k === 'ArrowDown') input.power = Math.max(DEAD + 0.01, input.power - (e.shiftKey ? 0.05 : 0.01));
    tickPower();
  }
});
window.addEventListener('keyup', (e) => keysDown.delete(e.key));

function keyAimStart() {
  input.active = true;
  input.keyboard = true;
  input.id = null;
  input.angle = game.ghost ? game.ghost.angle : aimAngleToTarget();
  input.power = game.ghost ? game.ghost.power : 0.5;
  input.lastTick = Math.floor(input.power * 5);
  game.mode = 'aim';
  fadeIntro();
}

// R: back to the leg's start. In flight it counts as a failed flight.
function rewindByHand() {
  if (game.mode === 'fly' && game.flight) {
    game.fails++;
    game.legFails++;
    sfx('lost');
    startRewind(game.flight);
  } else if (game.mode === 'aim') {
    cancelAim();
  }
}

// ---------- Pause ----------

function pauseGame() {
  if (game.paused) return;
  if (input.active) cancelAim();
  if (game.mode === 'capture') finishCapture();
  if (game.mode === 'fly' && game.flight) {
    // the flight is undone: its launch doesn't count, its motes stay
    game.launches--;
    game.flight = null;
    game.trail = [];
    game.clock = game.legStart;
    game.mode = 'idle';
  }
  if (game.mode === 'rewind') {
    game.clock = game.legStart;
    game.flight = null;
    game.trail = [];
    game.mode = 'idle';
  }
  if (game.mode === 'idle') game.clock = game.legStart;
  game.paused = true;
  sound.suspend();
  stopDrone();
}

function resumeGame() {
  if (!game.paused) return;
  game.paused = false;
  ui.resume.hidden = true;
  sound.unlock();
  startDrone();
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    pauseGame();
  } else if (game.paused) {
    ui.resume.hidden = game.mode === 'done';
    if (game.mode === 'done') resumeGame();
    last = performance.now();
  }
});
ui.resume.addEventListener('click', resumeGame);

// ---------- Sound bed ----------

let stopDroneFn = null;
function startDrone() {
  if (!stopDroneFn) stopDroneFn = sound.loop('drone', { gain: 0.16 });
}
function stopDrone() {
  if (stopDroneFn) stopDroneFn();
  stopDroneFn = null;
}
window.addEventListener('pointerdown', startDrone, { once: true, capture: true });
window.addEventListener('keydown', startDrone, { once: true, capture: true });

function syncMute() {
  ui.mute.setAttribute('aria-pressed', String(sound.muted));
  ui.mute.setAttribute('aria-label', sound.muted ? 'Unmute' : 'Mute');
}
ui.mute.addEventListener('click', () => {
  sound.muted = !sound.muted;
  syncMute();
});
syncMute();

// ---------- Loop ----------

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
  last = now;
  time += dt;
  if (!manual) update(dt);
  draw();
  requestAnimationFrame(frame);
}

window.addEventListener('resize', resize);
window.addEventListener('hashchange', () => startSystem(systemFromHash()));

resize();
startSystem(systemFromHash());
Promise.all(loading).then(() => {
  document.body.dataset.ready = '';
});
requestAnimationFrame(frame);

// For tests and tuning: read the state, drive it, and step the clock without drawing.
window.__orbit = {
  game,
  input,
  heard,
  systems: SYSTEMS,
  view,
  images,
  startSystem,
  fire,
  update,
  draw,
  pauseGame,
  resumeGame,
  assistNow,
  previewFor,
  previewColours,
  medalFor,
  probeWorld,
  launchPoint,
  timeoutDim,
  resize,
  tap: (y = 100) => onDown({ pointerId: -3, clientY: y }),
  rewindByHand,
  set manual(v) {
    manual = v;
  },
  get manual() {
    return manual;
  },
};

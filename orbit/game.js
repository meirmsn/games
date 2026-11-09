// Orbit: fling a probe off one planet, let gravity bend it round the others, and catch the next
// planet's orbit ring. One canvas; the physics lives in physics.js and the systems in levels.js.
// The spec is specs/orbit.md. Tests reach the game through window.__orbit.
import { mountShell } from '../shared/game-shell.js';
import {
  FIELD,
  DT,
  MAX_FLIGHT,
  ASSIST_BAND,
  bodyAt,
  bodyVel,
  positions,
  park,
  launch,
  step,
  catchLimit,
  relSpeed,
  settlePlan,
  settleStep,
  SLING_ANGLE,
} from './physics.js';
import { SYSTEMS } from './levels.js';

const SOUNDS = ['launch', 'sling', 'skim', 'mote', 'capture', 'crash', 'lost', 'tick', 'done', 'drone'];
const { sound } = mountShell({ sounds: Object.fromEntries(SOUNDS.map((n) => [n, `sounds/${n}.mp3`])) });
const GAIN = { launch: 0.8, lost: 0.6, tick: 0.25, mote: 0.5, skim: 0.7, crash: 0.9, capture: 0.8, sling: 0.8, done: 0.8 };
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
  jump: $('[data-jump]'),
  legs: $('[data-legs]'),
  slings: $('[data-slings]'),
  slingsBox: $('.slings'),
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
  doneSlings: $('[data-done-slings]'),
  badge: $('[data-badge]'),
  retry: $('[data-retry]'),
  next: $('[data-next]'),
  resume: $('[data-resume]'),
  boost: $('[data-boost]'),
  boostTrack: $('[data-boost-track]'),
  boostValue: $('[data-boost-value]'),
  boostGhost: $('[data-boost-ghost]'),
  hint: $('[data-hint]'),
  probes: $('[data-probes]'),
  probesBox: $('.probes'),
  probePips: $('[data-probe-pips]'),
  out: $('[data-screen="out"]'),
  outText: $('[data-out-text]'),
  outRetry: $('[data-out-retry]'),
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
const PROBES = 10; // launches per system; when they're spent, the system starts over
const SLING_WORTH = 3; // a slingshot counts as this many motes toward the medal

// ---------- Layout ----------

let W = 0;
let H = 0;
let dpr = 1;
const view = { x: 0, y: 0, s: 1 }; // field → CSS px: px = view.x + wx * view.s
const insets = { top: 0, bottom: 0, left: 0, right: 0 };
const EDGE = 24; // touches starting this close to the bottom (plus the safe area) are the phone's
const BAR_SPACE = 82; // room under the field for the booster bar and the probes left above it

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
  const bottom = insets.bottom + EDGE + BAR_SPACE; // the booster bar sits below the field
  const side = 8;
  const aw = W - insets.left - insets.right - 2 * side;
  const ah = H - top - bottom;
  view.s = Math.max(0.05, Math.min(aw / FIELD.w, ah / FIELD.h));
  view.x = insets.left + side + (aw - FIELD.w * view.s) / 2;
  view.y = top + (ah - FIELD.h * view.s) / 2;
  makeStars();
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
  slings: 0, // slingshots banked this system (on caught flights)
  flight: null,
  ghost: null, // the last failed flight: { pts, angle, power }
  trail: [], // [x, y, ok, …] of the current flight
  rewindFrom: 0,
  rewindT: 0,
  capture: null, // { t, x0, y0 } while spiralling in
  burst: [], // little effects: { x, y, t, kind }
  slingFx: [], // "Slingshot!" labels: { body, x, y, t }
  slingBank: null, // "+1 slingshot" on a catch: { n, x, y, t }
  skimFlash: new Map(), // body index → seconds of flare left
  paused: false,
  intro: false,
  acc: 0, // fixed steps owed to the flight
};
// The booster power on the bar, kept between visits (a convenience; losing it costs nothing).
const input = { power: Math.min(1, Math.max(0, Number(store.get('orbit.power', 0.25)) || 0)), lastTick: -1 };
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
  // just after a catch it may sit a hair off the ring; it drifts onto it within a fraction of a second
  const r = game.park.r + (game.park.rOff || 0) * Math.exp(-6 * Math.max(0, t - game.legStart));
  return { x: b.x + Math.cos(a) * r, y: b.y + Math.sin(a) * r };
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
  game.slings = 0;
  game.ghost = null;
  game.trail = [];
  game.flight = null;
  game.burst = [];
  game.slingFx = [];
  game.slingBank = null;
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
}

function systemFromHash() {
  const m = /^#s([1-9])$/.exec(location.hash);
  const n = m ? Number(m[1]) : 1;
  return n >= 1 && n <= SYSTEMS.length ? n - 1 : 0;
}

// ---------- Booster power and release ----------

// Where the probe is on its parking orbit now (its angle round the planet) and which way it moves.
function orbitAngle(t = game.clock) {
  return game.park.phase + game.park.dir * ((2 * Math.PI * (t - game.legStart)) / game.park.period);
}

// The release point: where the probe is now on its orbit.
function launchPoint() {
  return probeParked();
}

// The booster power on the bar (0..1). Ticks softly as it crosses each tenth.
function setPower(p) {
  const v = Math.min(1, Math.max(0, p));
  const step = Math.round(v * 10);
  if (step !== input.lastTick) {
    if (game.mode === 'idle') sfx('tick', { rate: 0.8 + step * 0.06 });
    input.lastTick = step;
  }
  input.power = v;
  store.set('orbit.power', Math.round(v * 100) / 100);
  syncBoost();
}

// Fire the boosters: the probe leaves along its orbit, the way it's moving, at this power. Tests
// can pass `at` (an angle on the orbit) to release from a chosen point.
function fire(power = input.power, at) {
  if (game.launches >= PROBES) return;
  if (at !== undefined) {
    // put the probe at `at` now
    game.park.phase = at - game.park.dir * ((2 * Math.PI * (game.clock - game.legStart)) / game.park.period);
  }
  const a = orbitAngle();
  game.flight = launch(game.level, game.leg, a, power, game.clock, assistNow(), game.park.dir);
  game.flight.at = a;
  game.flight.power = power;
  game.lastLaunch = { at: a, power, dir: game.park.dir, x: game.flight.x, y: game.flight.y, vx: game.flight.vx, vy: game.flight.vy, t: game.clock };
  game.trail = [];
  game.acc = 0;
  game.launches++;
  game.mode = 'fly';
  game.skimFlash.clear();
  fadeIntro();
  hideHint(true);
  syncBoost();
  updateHud();
  game.missShown = false;
  game.slingFx = [];
  sfx('launch', { rate: 0.9 + power * 0.25 });
}

// ---------- Flight ----------

function simStep() {
  const f = game.flight;
  const before = f.caught.length;
  const skimsBefore = f.skims.length;
  const slingsBefore = f.slings.length;
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
  // a slingshot round another planet: said by the planet as it happens; banked if the probe is caught
  for (let k = slingsBefore; k < f.slings.length; k++) {
    const i = f.slings[k];
    const bp = bodyPos(i, f.t);
    const b = game.level.bodies[i];
    game.slingFx.push({ body: i, t: 0, x: bp.x, y: bp.y - b.r * 1.5 - 14 });
    sfx('sling', { rate: 1 + 0.12 * k });
  }
  // Crossing the ring without being caught: say why, once per pass.
  if (f.inBand && f.missWhy && !f.result && !game.missShown) {
    game.missShown = true;
    const tp = bodyPos(f.to, f.t);
    const a = Math.atan2(f.y - tp.y, f.x - tp.x);
    const rr = game.level.bodies[f.to].ring + 34;
    game.miss = { text: { fast: 'Too fast', steep: 'Too steep', close: 'Too close' }[f.missWhy], x: tp.x + Math.cos(a) * rr, y: tp.y + Math.sin(a) * rr, t: 0 };
  }
  if (!f.inBand) game.missShown = false;
  game.clock = f.t;
  if (f.result) endFlight();
}

function endFlight() {
  const f = game.flight;
  game.lastResult = { result: f.result, why: f.why, x: f.x, y: f.y, age: f.age, caught: f.caught.length };
  if (f.result === 'captured') {
    sfx('capture');
    if (f.slings.length) {
      game.slings += f.slings.length;
      const tp = bodyPos(f.to, f.t);
      const tb = game.level.bodies[f.to];
      game.slingBank = { n: f.slings.length, t: 0, x: tp.x, y: tp.y - tb.ring - 30 };
      updateHud();
      ui.slingsBox.classList.remove('pop');
      void ui.slingsBox.offsetWidth;
      ui.slingsBox.classList.add('pop');
    }
    // The probe eases into the ring (physics.js settlePlan), carrying on the way it was flying.
    game.capture = settlePlan(game.level, f.to, f.t, f.x, f.y, f.vx, f.vy);
    game.capture.acc = 0;
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
  game.ghost = f ? { pts, at: f.at, power: f.power } : game.ghost;
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
    if (game.launches >= PROBES) outOfProbes();
  }
}

// All the system's probes are spent: a card, and the system starts over.
function outOfProbes() {
  game.mode = 'out';
  ui.outText.textContent = `All ${PROBES} probes are spent in ${game.level.name}.`;
  ui.out.hidden = false;
  ui.hint.hidden = true;
  sfx('lost', { rate: 0.8 });
  setTimeout(() => ui.outRetry.focus({ preventScroll: true }), 50);
}
ui.outRetry.addEventListener('click', () => {
  ui.out.hidden = true;
  startSystem(game.sys);
});

function updateCapture(dt) {
  const c = game.capture;
  c.acc += dt / DT;
  while (c.acc >= 1 - 1e-6 && !c.done) {
    c.acc -= 1;
    settleStep(game.level, c);
  }
  game.clock = c.t;
  game.trail.push(c.x, c.y, 1);
  if (c.done) finishCapture();
}

function finishCapture() {
  const c = game.capture;
  const leg = legOf();
  const tb = game.level.bodies[leg.to];
  const p = park(game.level, leg.to);
  const a = c.a; // where the settle ended
  const tp = bodyPos(leg.to);
  const rOff = Math.hypot(c.x - tp.x, c.y - tp.y) - tb.ring; // within a hair of the ring; drifts onto it
  game.flight = null;
  game.capture = null;
  game.trail = [];
  game.parkBody = leg.to;
  if (game.leg + 1 >= game.level.legs.length) {
    game.park = { r: tb.ring, period: p.period, phase: a, dir: c.dir, rOff };
    game.legStart = game.clock;
    finishSystem();
    return;
  }
  game.leg++;
  game.legStart = game.clock;
  game.park = { r: p.r, period: p.period, phase: a, dir: c.dir, rOff };
  beginLeg();
  buildLegDots();
  updateHud();
}

// ---------- End of a system ----------

// A slingshot counts as SLING_WORTH motes, so a bold route can make up for motes missed.
function medalFor(got, total, launches, par, slings = 0) {
  got = Math.min(total, got + SLING_WORTH * slings);
  if (got >= 0.9 * total && launches <= par) return 3;
  if (got >= 0.7 * total && launches <= 2 * par) return 2;
  return 1;
}

function finishSystem() {
  game.mode = 'done';
  const total = game.level.motes.length;
  const par = game.level.legs.length + 2;
  const got = game.taken.size;
  const medal = medalFor(got, total, game.launches, par, game.slings);
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
  ui.doneSlings.textContent = game.slings;
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
  ui.out.hidden = true;
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
  ui.sysName.textContent = `System ${game.sys + 1} · ${game.level.name}`;
  const legs = game.level.legs.length;
  ui.jump.textContent = `Jump ${Math.min(legs, game.leg + 1)} of ${legs}`;
  ui.slings.textContent = game.slings;
  ui.slingsBox.hidden = game.slings === 0;
  ui.dust.textContent = game.taken.size;
  ui.dustOf.textContent = game.level.motes.length;
  const left = Math.max(0, PROBES - game.launches);
  ui.probes.textContent = left;
  ui.probesBox.classList.toggle('low', left <= 3);
  ui.probesBox.setAttribute('aria-label', `${left} probes left`);
  if (ui.probePips.children.length !== PROBES) {
    ui.probePips.innerHTML = '';
    for (let i = 0; i < PROBES; i++) ui.probePips.appendChild(document.createElement('i'));
  }
  [...ui.probePips.children].forEach((pip, i) => pip.classList.toggle('spent', i >= left));
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

let lastMode = '';
function update(dt) {
  if (game.paused) return;
  if (game.mode !== lastMode) {
    lastMode = game.mode;
    syncBoost(); // the bar dims while the probe isn't on its orbit
    if (game.mode !== 'idle') ui.hint.hidden = true;
  }
  for (const b of game.burst) b.t += dt;
  if (game.miss) game.miss.t += dt;
  for (const fx of game.slingFx) fx.t += dt;
  game.slingFx = game.slingFx.filter((fx) => fx.t < 1.8);
  if (game.slingBank) {
    game.slingBank.t += dt;
    if (game.slingBank.t > 2) game.slingBank = null;
  }
  game.burst = game.burst.filter((b) => b.t < 1.2);
  for (const [k, v] of game.skimFlash) {
    if (v - dt <= 0) game.skimFlash.delete(k);
    else game.skimFlash.set(k, v - dt);
  }
  switch (game.mode) {
    case 'idle':
      game.clock += dt;
      game.idleAge += dt;
      keyPower(dt);
      maybeHint();
      break;
    case 'fly': {
      // whole fixed steps, counted in steps so 60 and 120 Hz frames never drift apart
      game.acc += dt / DT;
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
  drawSwing(pos);
  drawTrail();
  drawProbe();
  drawBursts();
  drawMiss();
  drawSling();
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
  // a moon's path, faintly, so its motion reads before it moves
  ctx.strokeStyle = 'rgba(255,255,255,0.07)';
  ctx.lineWidth = 1;
  game.level.bodies.forEach((b) => {
    if (!b.orbit) return;
    const c = b.orbit.around;
    ctx.beginPath();
    ctx.arc(sx(pos[c * 2]), sy(pos[c * 2 + 1]), b.orbit.r * view.s, 0, Math.PI * 2);
    ctx.stroke();
  });
  if (game.mode !== 'done') {
    const i = leg.to;
    const b = game.level.bodies[i];
    const lit = game.mode === 'capture' ? 0.75 : 0.32 + 0.06 * Math.sin(time * 2);
    ctx.strokeStyle = `rgba(${COOL}, ${lit})`;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(sx(pos[i * 2]), sy(pos[i * 2 + 1]), b.ring * view.s, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawBody(i, wx, wy) {
  const b = game.level.bodies[i];
  const x = sx(wx);
  const y = sy(wy);
  const r = b.r * view.s;
  // a skim: the planet's air glows softly for a moment (no line, so it can't pass for a ring)
  const flare = game.skimFlash.get(i) || 0;
  if (flare > 0) {
    const g = ctx.createRadialGradient(x, y, r * 0.95, x, y, r * 1.35);
    g.addColorStop(0, `rgba(${b.glow || '170, 210, 255'}, ${flare * 0.45})`);
    g.addColorStop(1, `rgba(${b.glow || '170, 210, 255'}, 0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r * 1.35, 0, Math.PI * 2);
    ctx.fill();
  }
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
    const m = motes[i];
    if (game.taken.has(i) || (m.leg < game.leg && game.mode !== 'done')) continue; // caught, or out of reach
    const current = m.leg === game.leg && game.mode !== 'done';
    const x = sx(m.x);
    const y = sy(m.y + Math.sin(time * 1.6 + i) * 3);
    const s = Math.max(1.8, 4.5 * view.s) * (current ? 1 : 0.75);
    ctx.globalAlpha = current ? 0.95 : 0.3;
    ctx.fillStyle = 'rgba(255, 214, 140, 0.18)';
    ctx.beginPath();
    ctx.arc(x, y, s * 2.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffe2a8';
    ctx.beginPath();
    ctx.arc(x, y, s, 0, Math.PI * 2);
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
  if (game.mode === 'idle') {
    // where the last release fired from: a small hollow mark on the orbit
    const b = bodyPos(game.parkBody);
    const x = sx(b.x + Math.cos(gh.at) * game.park.r);
    const y = sy(b.y + Math.sin(gh.at) * game.park.r);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.stroke();
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
    ctx.strokeStyle = `rgba(${COOL}, ${0.6 * a * dim})`;
    ctx.lineWidth = Math.max(0.8, 1.8 * a);
    ctx.beginPath();
    ctx.moveTo(sx(t[(k - 1) * 3]), sy(t[(k - 1) * 3 + 1]));
    ctx.lineTo(sx(t[k * 3]), sy(t[k * 3 + 1]));
    ctx.stroke();
  }
}

function timeoutDim() {
  const f = game.flight;
  if (!f || game.mode !== 'fly') return 1;
  return Math.max(0.15, Math.min(1, (MAX_FLIGHT - f.age) / 2));
}

function probeWorld() {
  if (game.mode === 'fly' && game.flight) return { x: game.flight.x, y: game.flight.y };
  if (game.mode === 'capture' && game.capture) return { x: game.capture.x, y: game.capture.y };
  if (game.mode === 'rewind') return null;
  return probeParked();
}

// Which way the probe points: along its orbit while parked, along its velocity in flight, and
// along its turn round the planet while it eases into a ring.
function probeHeading() {
  if (game.mode === 'fly' && game.flight) return Math.atan2(game.flight.vy, game.flight.vx);
  if (game.mode === 'capture' && game.capture) return Math.atan2(game.capture.vy, game.capture.vx);
  const a = orbitAngle();
  return a + (game.park.dir * Math.PI) / 2;
}

// A flame out of the ship, behind it, when the boosters push.
function drawFlame(x, y, ux, uy, len, width, alpha) {
  const flick = 0.85 + 0.15 * Math.sin(time * 47) + 0.08 * Math.sin(time * 83);
  const ex = x + ux * len * flick;
  const ey = y + uy * len * flick;
  const g = ctx.createLinearGradient(x, y, ex, ey);
  g.addColorStop(0, `rgba(255, 236, 190, ${alpha})`);
  g.addColorStop(0.35, `rgba(${AMBER}, ${alpha * 0.9})`);
  g.addColorStop(1, `rgba(255, 90, 40, 0)`);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(x - uy * width, y + ux * width);
  ctx.lineTo(ex, ey);
  ctx.lineTo(x + uy * width, y - ux * width);
  ctx.closePath();
  ctx.fill();
}

function drawProbe() {
  const p = probeWorld();
  if (!p) return;
  const x = sx(p.x);
  const y = sy(p.y);
  const dim = timeoutDim();
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
  const L = Math.max(10, 18 * view.s); // the ship's length on screen
  const h = probeHeading();
  const ux = Math.cos(h);
  const uy = Math.sin(h);
  // the boosters' flame for a moment after firing
  const f = game.flight;
  if (f && game.mode === 'fly' && f.age < 0.45) {
    drawFlame(x - ux * L * 0.4, y - uy * L * 0.4, -ux, -uy, L * (1.1 + f.power) * (1 - f.age / 0.45), L * 0.2, dim);
  }
  // a soft glow, so it reads against the dark
  const g = ctx.createRadialGradient(x, y, 0, x, y, L * 1.3);
  g.addColorStop(0, `rgba(${COOL}, ${0.3 * dim})`);
  g.addColorStop(1, `rgba(${COOL}, 0)`);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, L * 1.3, 0, Math.PI * 2);
  ctx.fill();
  // the hull: a slim dart with swept fins, nose forward
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(h);
  ctx.globalAlpha = dim;
  ctx.fillStyle = '#eaf6ff';
  ctx.beginPath();
  ctx.moveTo(L * 0.55, 0);
  ctx.lineTo(-L * 0.4, L * 0.34);
  ctx.lineTo(-L * 0.22, 0);
  ctx.lineTo(-L * 0.4, -L * 0.34);
  ctx.closePath();
  ctx.fill();
  // a cyan cockpit stripe
  ctx.fillStyle = '#7fd8ff';
  ctx.beginPath();
  ctx.moveTo(L * 0.34, 0);
  ctx.lineTo(L * 0.02, L * 0.08);
  ctx.lineTo(L * 0.02, -L * 0.08);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// "Too fast" / "Too steep" by the ring, fading out
function drawMiss() {
  const m = game.miss;
  if (!m) return;
  const k = m.t / 1.6;
  if (k >= 1) {
    game.miss = null;
    return;
  }
  ctx.globalAlpha = k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85;
  ctx.fillStyle = '#ffa64d';
  ctx.font = '600 13px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(m.text, Math.max(40, Math.min(W - 40, sx(m.x))), sy(m.y) - k * 8);
  ctx.globalAlpha = 1;
}

// A swing round another planet, as it happens: a gold arc round the planet traces the angle swept,
// from a third of the way to a slingshot; it brightens once the swing counts.
const SWING_SHOW = (40 * Math.PI) / 180;
const SWING_FULL = (SLING_ANGLE * Math.PI) / 180;
function drawSwing(pos) {
  const f = game.flight;
  if (!f || game.mode !== 'fly') return;
  game.level.bodies.forEach((b, i) => {
    const sw = f.sling[i];
    if (!f.slingIn[i] || Math.abs(sw) < SWING_SHOW) return;
    const done = f.slings.includes(i);
    const k = Math.min(1, Math.abs(sw) / SWING_FULL);
    const x = sx(pos[i * 2]);
    const y = sy(pos[i * 2 + 1]);
    const r = (b.r + 16) * view.s + 6;
    const a0 = f.slingFrom[i];
    ctx.strokeStyle = done ? 'rgba(255, 217, 138, 0.9)' : `rgba(255, 217, 138, ${0.2 + 0.4 * k})`;
    ctx.lineWidth = done ? 3 : 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(x, y, r, a0, a0 + sw, sw < 0);
    ctx.stroke();
    ctx.lineCap = 'butt';
  });
}

// "Slingshot!" by the planet the moment a swing counts, and "+1 slingshot" by the ring on the catch
function drawSling() {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const fx of game.slingFx) {
    const k = fx.t / 1.8;
    const grow = Math.min(1, fx.t / 0.18);
    ctx.globalAlpha = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
    ctx.fillStyle = '#ffd98a';
    ctx.font = `700 ${Math.round(13 + 5 * grow)}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
    ctx.fillText('Slingshot!', Math.max(50, Math.min(W - 50, sx(fx.x))), Math.max(70, sy(fx.y)) - k * 10);
  }
  const bank = game.slingBank;
  if (bank) {
    const k = bank.t / 2;
    ctx.globalAlpha = k < 0.75 ? 1 : 1 - (k - 0.75) / 0.25;
    ctx.fillStyle = '#ffd98a';
    ctx.font = '600 14px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
    const text = bank.n > 1 ? `+${bank.n} slingshots` : '+1 slingshot';
    ctx.fillText(text, Math.max(60, Math.min(W - 60, sx(bank.x))), Math.max(70, sy(bank.y)) - k * 12);
  }
  ctx.globalAlpha = 1;
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

// A tap anywhere on the space (not the bar) fires the boosters; in flight it does nothing.
function onDown(e) {
  if (game.paused) {
    resumeGame();
    return;
  }
  if (!e.isPrimary && e.pointerType === 'touch') return; // a second finger
  if (e.clientY > H - insets.bottom - EDGE) return; // the phone's swipe strip
  if (game.mode === 'idle') fire();
}

canvas.addEventListener('pointerdown', onDown);
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

// The booster bar: tap a point on it to set the power there, or drag along it.
let barDrag = null;
function powerAt(clientX) {
  const r = ui.boostTrack.getBoundingClientRect();
  return (clientX - r.left) / r.width;
}
ui.boost.addEventListener('pointerdown', (e) => {
  e.stopPropagation();
  if (game.paused) {
    resumeGame();
    return;
  }
  if (barDrag !== null) return; // a second finger
  barDrag = e.pointerId;
  try {
    ui.boost.setPointerCapture(e.pointerId);
  } catch (err) {
    // a synthetic pointer: the drag still works
  }
  setPower(powerAt(e.clientX));
  fadeIntro();
});
ui.boost.addEventListener('pointermove', (e) => {
  if (e.pointerId === barDrag) setPower(powerAt(e.clientX));
});
const endBar = (e) => {
  if (e.pointerId === barDrag) barDrag = null;
};
ui.boost.addEventListener('pointerup', endBar);
ui.boost.addEventListener('pointercancel', endBar);
ui.boost.addEventListener('lostpointercapture', endBar);

// The bar's zones: slate for gentle, green, orange, and red for the last tenth (style.css matches).
function zoneColour(p) {
  if (p >= 0.9) return '#ff5a4f';
  if (p >= 0.7) return '#ffa64d';
  if (p >= 0.3) return '#4fd18b';
  return '#9fb3cf';
}

function syncBoost() {
  const pct = Math.round(input.power * 100);
  ui.boost.style.setProperty('--power', input.power);
  ui.boost.style.setProperty('--zone-colour', zoneColour(input.power));
  ui.boost.setAttribute('aria-valuenow', String(pct));
  ui.boostValue.textContent = `${pct}%`;
  ui.boost.classList.toggle('is-off', game.mode !== 'idle');
  if (game.ghost && game.mode === 'idle') {
    ui.boostGhost.hidden = false;
    ui.boostGhost.style.left = `${game.ghost.power * 100}%`;
  } else {
    ui.boostGhost.hidden = true;
  }
}

// Keys: Space fires; left and right (or down and up) set the power. A tap
// nudges it by 2%; a held key slides it smoothly, easing in over a third of a second (keyPower).
const keysDown = new Map(); // held arrow -> seconds held
const KEY_LESS = ['ArrowLeft', 'ArrowDown'];
const KEY_MORE = ['ArrowRight', 'ArrowUp'];
const TAP_POWER = 0.02;
const POWER_RATE = 0.9; // of full power per second, at full speed
let slowKeys = false;
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
    if (!e.repeat) onDown({ isPrimary: true, clientY: 0 });
    return;
  }
  if (KEY_LESS.includes(k) || KEY_MORE.includes(k)) {
    e.preventDefault();
    if (e.repeat) return; // a held key slides smoothly in keyPower(), not by the key's repeat
    keysDown.set(k, 0);
    setPower(input.power + (KEY_MORE.includes(k) ? TAP_POWER : -TAP_POWER));
    fadeIntro();
  }
  if (k === 'Shift') slowKeys = true;
});
window.addEventListener('keyup', (e) => {
  keysDown.delete(e.key);
  if (e.key === 'Shift') slowKeys = false;
});
window.addEventListener('blur', () => keysDown.clear());

function keyPower(dt) {
  if (!keysDown.size) return;
  const slow = slowKeys ? 0.25 : 1;
  let p = input.power;
  for (const [k, held] of keysDown) {
    const t = held + dt;
    keysDown.set(k, t);
    if (t < 0.18) continue; // a tap is a tap
    const ramp = Math.min(1, (t - 0.18) / 0.35) * slow * dt * POWER_RATE;
    p += KEY_MORE.includes(k) ? ramp : -ramp;
  }
  if (p !== input.power) setPower(p);
}

// The first level's hint, shown only until the boosters have been fired once (ever, in this
// browser): if the probe has circled for a few seconds untouched, a line says how to fire.
const HINT_AFTER = 4;
let fired = Boolean(store.get('orbit.fired', false));
function maybeHint() {
  if (fired || game.sys !== 0 || game.leg !== 0 || !ui.hint.hidden || game.idleAge < HINT_AFTER) return;
  const fine = window.matchMedia && window.matchMedia('(pointer: fine)').matches;
  ui.hint.textContent = fine ? 'Click or press Space to fire the boosters' : 'Tap to fire the boosters';
  ui.hint.hidden = false;
}
function hideHint(forGood) {
  ui.hint.hidden = true;
  if (forGood && !fired) {
    fired = true;
    store.set('orbit.fired', true);
  }
}

// R: back to the leg's start. In flight it counts as a failed flight.
function rewindByHand() {
  if (game.mode === 'fly' && game.flight) {
    game.fails++;
    game.legFails++;
    sfx('lost');
    startRewind(game.flight);
  }
}

// ---------- Pause ----------

function pauseGame() {
  if (game.paused) return;
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
syncBoost();
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
  medalFor,
  probeWorld,
  launchPoint,
  timeoutDim,
  resize,
  tap: (y = 100) => onDown({ isPrimary: true, clientY: y }),
  setPower,
  orbitAngle,
  probeHeading,
  zoneColour,
  PROBES,
  rewindByHand,
  set manual(v) {
    manual = v;
  },
  get manual() {
    return manual;
  },
};

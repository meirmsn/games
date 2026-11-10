// Beacon: the page. Draws the night that sim.js runs, feeds it the player's beam, and keeps the
// cards, the sounds and the small memory (the best per coast, the coasts opened).
import { mountShell } from '../shared/game-shell.js';
import { createIso, sortByDepth } from '../shared/iso.js';
import { ATLAS } from './atlas.js';
import {
  TUNE,
  COASTS,
  createNight,
  step as simStep,
  inBeam,
  fogOn,
  galeOn,
  galeWarn,
  reachOf,
  leftAt,
  rightAt,
  bearingOf,
  beamLimits,
  autopilotTarget,
  starsOf,
} from './sim.js';

// --- Page, shell and sound -----------------------------------------------------------------------
const canvas = document.getElementById('sea');
const ctx = canvas.getContext('2d');
const $ = (sel) => document.querySelector(sel);
const screens = { start: $('[data-screen="start"]'), pause: $('[data-screen="pause"]'), dawn: $('[data-screen="dawn"]') };
const hud = $('[data-hud]');
const muteBtn = $('[data-mute]');

const SOUNDS = {};
for (const n of ['horn', 'bell', 'bump', 'splash', 'lowbell', 'gust', 'fanfare', 'sea']) SOUNDS[n] = `sounds/${n}.mp3`;
let mode = 'start'; // start (the night runs behind the card), night, paused, dawn
const { sound } = mountShell({ sounds: SOUNDS, unsaved: () => mode === 'night' || mode === 'paused' });
const played = []; // the last sounds played, for tests
function play(name, opts) {
  if (mode !== 'night') return; // the night behind the start card is silent
  played.push(name);
  if (played.length > 60) played.shift();
  sound.play(name, opts);
}
function syncMute() {
  muteBtn.setAttribute('aria-pressed', String(sound.muted));
  muteBtn.setAttribute('aria-label', sound.muted ? 'Unmute' : 'Mute');
}
muteBtn.addEventListener('click', () => {
  sound.muted = !sound.muted;
  syncMute();
});
syncMute();
let stopSea = null;

const atlas = new Image();
atlas.src = 'img/atlas.png';

// --- Small memory ----------------------------------------------------------------------------------
const KEY = 'beacon.v1';
function readMem() {
  try {
    const m = JSON.parse(localStorage.getItem(KEY) || '{}') || {};
    return { open: 0, best: {}, plays: {}, assist: {}, touched: false, ...m };
  } catch {
    return { open: 0, best: {}, plays: {}, assist: {}, touched: false };
  }
}
let mem = readMem();
function saveMem() {
  try {
    localStorage.setItem(KEY, JSON.stringify(mem));
  } catch {}
}

// --- View --------------------------------------------------------------------------------------------
// The sea plane is squashed 2:1 on screen: the isometric look, and the Kenney boats' own angle.
const iso = createIso({ tileW: 64, tileH: 32 });
let W = 0;
let H = 0;
let dpr = 1;
let k = 4; // CSS px per sea unit across
let ox = 0;
let oy = 0;
const FIELD_SCREEN_H = TUNE.fieldH / 2; // in sea units, squashed
function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  const top = 64; // room for the back and mute buttons above the bay
  k = Math.min(W / TUNE.fieldW, (H - top) / FIELD_SCREEN_H);
  ox = (W - TUNE.fieldW * k) / 2;
  oy = H - FIELD_SCREEN_H * k;
}
window.addEventListener('resize', resize);
const P = (x, y) => ({ x: ox + x * k, y: oy + (y * k) / 2 });
// The screen point back to the sea (for the pointer).
const toSea = (sx, sy) => ({ x: (sx - ox) / k, y: ((sy - oy) * 2) / k });

// Sprite frame for a heading on the sea: Kenney's frames start up-left on screen and go clockwise.
function frameOf(h) {
  const g = iso.screenDirToGrid(Math.cos(h), Math.sin(h) / 2);
  return (iso.facing(g.x, g.y) + 3) % 8;
}
const SPRITE = { freighter: 'traffic6_', cutter: 'traffic19_', lifeboat: 'traffic29_' };
const LENGTH = { freighter: 11, cutter: 7, lifeboat: 4.5 }; // sea units, nose to tail
const LANTERN = { freighter: '#ffd27a', cutter: '#8fe8ff', lifeboat: '#ffb15c' };

function sprite(name, x, y, w, alpha = 1, rot = 0) {
  const a = ATLAS[name];
  if (!a || !atlas.complete) return;
  const [sx, sy, sw, sh, ay] = a;
  const scale = w / sw;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.translate(x, y);
  if (rot) ctx.rotate(rot);
  ctx.drawImage(atlas, sx, sy, sw, sh, (-sw * scale) / 2, -sh * scale * ay, sw * scale, sh * scale);
  ctx.restore();
}
function shipWidth(kind) {
  const a = ATLAS[SPRITE[kind] + '1'];
  // The diagonal frame's width covers the hull's length projected: about 0.9 of it.
  return a ? LENGTH[kind] * k * 0.9 : 20;
}

// --- The night ------------------------------------------------------------------------------------------
let coastIndex = 0;
let night = null;
let input = { hold: false, target: null, swing: 0 };
let shake = 0;
let flashes = []; // brief flashes where a ship wrecked
let shownHome = 0; // the windows lit so far (they light one by one)
let windowT = 0;
let clock = 0; // for animation

function openCoast(i) {
  coastIndex = Math.max(0, Math.min(mem.open, i | 0));
  const hash = `#coast=${coastIndex + 1}`;
  if (location.hash !== hash) history.replaceState(null, '', hash);
}
function coastFromHash() {
  const m = /^#coast=(\d+)$/.exec(location.hash);
  const n = m ? Number(m[1]) - 1 : 0;
  return n >= 0 && n < COASTS.length && n <= mem.open ? n : 0;
}

function newNight(i, n) {
  night = createNight(i, n, { assist: mem.assist[i] ? 1 : 0 });
  shownHome = 0;
  windowT = 0;
  flashes = [];
}

function startNight({ coast = coastIndex, night: n } = {}) {
  openCoast(coast);
  mem.plays[coastIndex] = (mem.plays[coastIndex] || 0) + 1;
  saveMem();
  newNight(coastIndex, n ?? mem.plays[coastIndex]);
  mode = 'night';
  input = { hold: false, target: null, swing: 0 };
  showScreen(null);
  hud.hidden = false;
  renderHud();
  sound.unlock();
  if (!stopSea) stopSea = sound.loop('sea', { gain: 0.35 });
}

function showScreen(name) {
  for (const [key, el] of Object.entries(screens)) el.hidden = key !== name;
}

const STAR = (n) => [0, 1, 2].map((i) => (i < n ? '★' : '<span class="off">★</span>')).join('');

function showStart() {
  mode = 'start';
  hud.hidden = true;
  openCoast(coastFromHash());
  newNight(coastIndex, 1);
  renderStart();
  showScreen('start');
}
function renderStart() {
  $('[data-coast-name]').textContent = COASTS[coastIndex].name;
  const b = mem.best[coastIndex];
  $('[data-coast-best]').innerHTML = b ? STAR(b.stars) : '';
  $('[data-prev]').disabled = coastIndex <= 0;
  $('[data-next]').disabled = coastIndex >= Math.min(mem.open, COASTS.length - 1);
}
function pickCoast(d) {
  openCoast(coastIndex + d);
  newNight(coastIndex, 1);
  renderStart();
}
$('[data-prev]').addEventListener('click', () => pickCoast(-1));
$('[data-next]').addEventListener('click', () => pickCoast(1));
$('[data-start]').addEventListener('click', () => startNight());
$('[data-again]').addEventListener('click', () => startNight());
$('[data-next-coast]').addEventListener('click', () => startNight({ coast: coastIndex + 1 }));
window.addEventListener('hashchange', () => {
  if (mode === 'start') showStart(); // during a night it waits for the start card
});

function renderHud() {
  $('[data-home]').textContent = String(night.home);
  $('[data-total]').textContent = String(night.total);
}

function dawn() {
  mode = 'dawn';
  const s = night;
  const stars = starsOf(s);
  const prev = mem.best[coastIndex];
  if (!prev || stars > prev.stars || (stars === prev.stars && s.home > prev.home)) mem.best[coastIndex] = { stars, home: s.home, total: s.total };
  if (stars >= 1) {
    mem.open = Math.max(mem.open, Math.min(COASTS.length - 1, coastIndex + 1));
    delete mem.assist[coastIndex];
  } else {
    mem.assist[coastIndex] = 1;
  }
  saveMem();
  $('[data-stars]').innerHTML = STAR(stars);
  $('[data-stars]').setAttribute('aria-label', `${stars} of 3 stars`);
  $('[data-tally-home]').textContent = String(s.home);
  $('[data-tally-total]').textContent = String(s.total);
  const cc = $('[data-close-calls]');
  cc.hidden = !s.closeCalls;
  cc.textContent = `+${s.closeCalls} close calls`;
  const best = mem.best[coastIndex];
  $('[data-best]').textContent = `${COASTS[coastIndex].name} · best ${best.home} of ${best.total}`;
  const next = $('[data-next-coast]');
  next.hidden = coastIndex >= COASTS.length - 1 || mem.open <= coastIndex;
  $('[data-again]').classList.toggle('play', next.hidden);
  $('[data-again]').classList.toggle('link', !next.hidden);
  hud.hidden = true;
  showScreen('dawn');
}

// --- Input: a relative sideways drag swings the beam; arrow keys too ------------------------------------
let pointerId = null;
let lastX = 0;
canvas.addEventListener('pointerdown', (e) => {
  if (mode !== 'night' || pointerId !== null) return; // a second finger is ignored
  pointerId = e.pointerId;
  lastX = e.clientX;
  canvas.setPointerCapture?.(e.pointerId);
  input.hold = true;
  input.target = night.beam.a;
  touch();
});
canvas.addEventListener('pointermove', (e) => {
  if (e.pointerId !== pointerId || mode !== 'night') return;
  const dx = e.clientX - lastX;
  lastX = e.clientX;
  input.target = (input.target ?? night.beam.a) - dx * TUNE.dragPerPx;
  const [lo, hi] = beamLimits(night);
  input.target = Math.max(lo, Math.min(hi, input.target));
});
function release(e) {
  if (e.pointerId !== pointerId) return;
  pointerId = null;
  input.hold = false;
  input.target = null;
}
canvas.addEventListener('pointerup', release);
canvas.addEventListener('pointercancel', release);
const keys = { left: false, right: false };
window.addEventListener('keydown', (e) => {
  if (mode !== 'night') return;
  if (e.key === 'ArrowLeft' || e.key === 'a') keys.left = true;
  else if (e.key === 'ArrowRight' || e.key === 'd') keys.right = true;
  else return;
  e.preventDefault();
  touch();
});
window.addEventListener('keyup', (e) => {
  if (e.key === 'ArrowLeft' || e.key === 'a') keys.left = false;
  if (e.key === 'ArrowRight' || e.key === 'd') keys.right = false;
});
function touch() {
  if (!mem.touched) {
    mem.touched = true;
    saveMem();
  }
}
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

// --- Pause when hidden; resume on a tap ----------------------------------------------------------------
function pause() {
  if (mode !== 'night') return;
  mode = 'paused';
  pointerId = null;
  input = { hold: false, target: null, swing: 0 };
  keys.left = keys.right = false;
  showScreen('pause');
  sound.suspend?.();
}
$('[data-resume]').addEventListener('click', () => {
  if (mode !== 'paused') return;
  mode = 'night';
  showScreen(null);
  sound.unlock();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) pause();
});

// --- Step ----------------------------------------------------------------------------------------------
function advance(dt) {
  if (!night || mode === 'paused' || mode === 'dawn') return;
  if (mode === 'start' || mode === 'tile') {
    // Behind the start card the night runs on its own, the lamp sweeping; a new one when it ends.
    simStep(night, dt, {});
    night.events.length = 0;
    if (night.over || night.t > 60) newNight(coastIndex, 1 + ((night.night + 1) % 50));
    return;
  }
  const swing = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
  simStep(night, dt, swing ? { swing } : input.hold ? { hold: true, target: input.target } : {});
  for (const e of night.events.splice(0)) onEvent(e);
  if (night.over) dawn();
}

function onEvent(e) {
  if (e.type === 'horn') play('horn', { gain: 0.5, rate: e.kind === 'cutter' ? 1.25 : 1 });
  else if (e.type === 'home') {
    play('bell', { gain: e.threaded ? 1 : 0.8, rate: e.threaded ? 1.5 : 1 });
    renderHud();
  } else if (e.type === 'wreck') {
    play('bump');
    play('splash', { gain: 0.8 });
    shake = 0.15;
    flashes.push({ x: e.x, y: e.y, t: 0 });
  } else if (e.type === 'lost') play('lowbell');
  else if (e.type === 'galeWarn') play('gust');
  else if (e.type === 'gale') shake = 0.12;
  else if (e.type === 'gap') play('bell', { gain: 0.4, rate: 2 });
  else if (e.type === 'dawn') play('fanfare', { gain: 0.8 });
}

// --- Drawing -------------------------------------------------------------------------------------------
const streaks = Array.from({ length: 70 }, (_, i) => ({ x: (i * 37.3) % 100, y: (i * 71.7) % 300, l: 3 + (i % 4) }));

function draw(dt) {
  clock += dt;
  const s = night;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  let sx = 0;
  let sy = 0;
  if (shake > 0) {
    shake -= dt;
    sx = (Math.random() - 0.5) * 6;
    sy = (Math.random() - 0.5) * 6;
  }
  ctx.translate(sx, sy);
  drawSea(s, dt);
  drawLand(s);
  const items = [];
  for (const r of s.coast.rocks) items.push({ depth: r.y, draw: () => drawRock(r) });
  for (const w of s.wrecks) if (s.t - w.t < 3) items.push({ depth: w.y, draw: () => drawWreck(s, w) });
  for (const m of s.moored) items.push({ depth: 300 + m.slot * 0.01, draw: () => drawMoored(s, m) });
  for (const b of s.ships) items.push({ depth: b.y, draw: () => drawShip(b, false) });
  for (const it of sortByDepth(items)) it.draw();

  // Night falls over everything; the beam, the lanterns and the lit windows shine through it.
  const dawnF = Math.min(1, s.t / TUNE.night);
  ctx.fillStyle = `rgba(6, 12, 30, ${0.5 - dawnF * 0.22})`;
  ctx.fillRect(-10, -10, W + 20, H + 20);
  drawBeam(s);
  for (const b of s.ships) if (b.lit) drawShip(b, true);
  drawFoam(s);
  if (fogOn(s)) drawFog(s);
  drawLanterns(s);
  drawLighthouse(s);
  drawTown(s, dt);
  drawGale(s);
  drawRain(s, dt);
  for (const f of flashes) {
    f.t += dt;
    const p = P(f.x, f.y);
    const a = Math.max(0, 1 - f.t / 0.15);
    if (a > 0) {
      ctx.fillStyle = `rgba(255, 245, 220, ${0.8 * a})`;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, 14 + 30 * f.t, 7 + 15 * f.t, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  flashes = flashes.filter((f) => f.t < 0.6);
  drawSky(s);
  if (mode === 'night' && !mem.touched) drawGhost(s);
}

function drawSea(s, dt) {
  const g = ctx.createLinearGradient(0, oy, 0, H);
  g.addColorStop(0, '#1d3157');
  g.addColorStop(1, '#2a4a76');
  ctx.fillStyle = g;
  ctx.fillRect(-10, -10, W + 20, H + 20);
  // The current, as streaks drifting across the water; fast and sideways in the gale.
  const c = s.current;
  const gx = galeOn(s) ? s.gale.side * TUNE.gale.push : 0;
  const vx = Math.cos(c.dir) * c.speed * 5 + gx * 4;
  const vy = Math.sin(c.dir) * c.speed * 5;
  ctx.strokeStyle = 'rgba(200, 225, 255, 0.13)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  for (const st of streaks) {
    if (mode !== 'paused' && mode !== 'dawn') {
      st.x = (((st.x + vx * dt) % 100) + 100) % 100;
      st.y = (((st.y + vy * dt) % 300) + 300) % 300;
    }
    const a = P(st.x, st.y);
    const len = st.l * (1 + Math.abs(gx) / 3);
    const dx = (Math.cos(c.dir) * len + Math.sign(gx) * len * 2) * k * 0.4;
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(a.x + dx, a.y + Math.sin(c.dir) * len * k * 0.2);
  }
  ctx.stroke();
}

function landPath(side, s) {
  const pts = side < 0 ? s.coast.left : s.coast.right;
  const far = side < 0 ? -2000 : 2100; // past the screen's edge on any shape of screen
  ctx.beginPath();
  let p = P(far, -400);
  ctx.moveTo(p.x, p.y);
  p = P(pts[0][1], -400);
  ctx.lineTo(p.x, p.y);
  for (const [y, x] of pts) {
    p = P(x, y);
    ctx.lineTo(p.x, p.y);
  }
  p = P(far, TUNE.seaH);
  ctx.lineTo(p.x, p.y);
  ctx.closePath();
}

function drawLand(s) {
  // The cliffs either side of the bay.
  for (const side of [-1, 1]) {
    landPath(side, s);
    ctx.fillStyle = '#3b5444';
    ctx.fill();
  }
  // The shore below the breakwater: quays round the harbour, and the town's strip.
  const a = P(-2000, TUNE.seaH);
  ctx.fillStyle = '#3a4d40';
  ctx.fillRect(-10, a.y, W + 20, H - a.y + 10);
  const b1 = P(28, TUNE.seaH + 2);
  const b2 = P(72, TUNE.seaH + 32);
  ctx.fillStyle = '#22406a';
  ctx.fillRect(b1.x, b1.y, b2.x - b1.x, b2.y - b1.y);
  // The quay's edge.
  ctx.fillStyle = '#7e8a99';
  ctx.fillRect(b1.x - 2, b2.y, b2.x - b1.x + 4, 3);
  // The breakwater, with the mouth in it.
  const m = s.coast.mouth;
  for (const [x0, x1] of [
    [-2000, TUNE.lamp.x - m],
    [TUNE.lamp.x + m, 2100],
  ]) {
    const p0 = P(x0, TUNE.seaH - 3);
    const p1 = P(x1, TUNE.seaH + 2);
    ctx.fillStyle = '#9aa6b5';
    ctx.fillRect(p0.x, p0.y, p1.x - p0.x, p1.y - p0.y);
    ctx.fillStyle = '#5f6a7a';
    ctx.fillRect(p0.x, p1.y, p1.x - p0.x, 4);
  }
  // Trees on the cliffs.
  for (const side of [-1, 1])
    for (let y = 30; y < 290; y += 46) {
      const edge = side < 0 ? leftAt(s.coast, y) : rightAt(s.coast, y);
      const x = edge + side * (5 + ((y * 7) % 9));
      const p = P(x, y);
      sprite(['tree167', 'tree168', 'tree073'][y % 3], p.x, p.y, 5.5 * k, 0.95);
    }
}

function drawRock(r) {
  const p = P(r.x, r.y);
  const names = ['rock035', 'rock036', 'rock037', 'rock025'];
  sprite(names[Math.round(r.x + r.y) % names.length], p.x, p.y, r.r * 2.1 * k);
}

function drawFoam(s) {
  // Surf: always white, so every rock and cliff reads with or without the beam.
  ctx.lineWidth = 1.6;
  for (const r of s.coast.rocks) {
    const p = P(r.x, r.y);
    const pulse = 1 + 0.06 * Math.sin(clock * 2.4 + r.x);
    ctx.strokeStyle = 'rgba(240, 248, 255, 0.75)';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, r.r * k * pulse, (r.r * k * pulse) / 2, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(240, 248, 255, 0.3)';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, r.r * k * pulse + 4, (r.r * k * pulse) / 2 + 2, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(240, 248, 255, 0.55)';
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 5]);
  ctx.lineDashOffset = -clock * 8;
  for (const side of [-1, 1]) {
    const pts = side < 0 ? s.coast.left : s.coast.right;
    ctx.beginPath();
    pts.forEach(([y, x], i) => {
      const p = P(x, y);
      if (i) ctx.lineTo(p.x, p.y);
      else ctx.moveTo(p.x, p.y);
    });
    ctx.stroke();
  }
  ctx.beginPath();
  const m = s.coast.mouth;
  for (const [x0, x1] of [
    [-2000, TUNE.lamp.x - m],
    [TUNE.lamp.x + m, 2100],
  ]) {
    const a = P(x0, TUNE.seaH - 3.5);
    const b = P(x1, TUNE.seaH - 3.5);
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
  }
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawShip(b, lit) {
  const p = P(b.x, b.y);
  if (lit) {
    // In the light: a pale glow on the water under her, and her full colours.
    ctx.fillStyle = 'rgba(255, 244, 210, 0.35)';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, LENGTH[b.kind] * k * 0.55, LENGTH[b.kind] * k * 0.28, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  sprite(SPRITE[b.kind] + frameOf(b.h), p.x, p.y, shipWidth(b.kind));
}

function drawWreck(s, w) {
  const p = P(w.x, w.y);
  const f = (s.t - w.t) / 3;
  sprite(SPRITE[w.kind] + frameOf(w.h), p.x, p.y + f * 8, shipWidth(w.kind), 1 - f, 0.35 * Math.min(1, f * 4));
}

function drawMoored(s, m) {
  // From the mouth to a mooring inside the harbour, in a second and a half.
  const slot = m.slot % 12;
  const side = slot % 2 ? 1 : -1;
  const row = Math.floor(slot / 2);
  const tx = TUNE.lamp.x + side * (12 + (row % 3) * 5.5);
  const ty = TUNE.seaH + 9 + Math.floor(row / 3) * 9;
  const f = Math.min(1, (s.t - m.t) / 1.5);
  const e = f * f * (3 - 2 * f);
  const x = m.x + (tx - m.x) * e;
  const y = m.y + (ty - m.y) * e;
  const p = P(x, y);
  const h = f < 1 ? Math.atan2(ty - m.y, tx - m.x) : side < 0 ? Math.PI : 0;
  sprite(SPRITE[m.kind] + frameOf(h), p.x, p.y, shipWidth(m.kind) * 0.55);
}

function drawBeam(s) {
  const L = P(TUNE.lamp.x, TUNE.lamp.y);
  const reach = reachOf(s);
  const half = s.beamHalf;
  const ray = (a, d) => P(TUNE.lamp.x + Math.cos(a) * d, TUNE.lamp.y - Math.sin(a) * d);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const [w, alpha] of [
    [half * 2.2, 0.07],
    [half, 0.26],
  ]) {
    const a = ray(s.beam.a - w, reach);
    const b = ray(s.beam.a + w, reach);
    const end = ray(s.beam.a, reach);
    const g = ctx.createLinearGradient(L.x, L.y, end.x, end.y);
    g.addColorStop(0, `rgba(255, 228, 160, ${alpha * 1.6})`);
    g.addColorStop(0.5, `rgba(255, 222, 150, ${alpha})`);
    g.addColorStop(1, 'rgba(255, 222, 150, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(L.x, L.y - 6);
    ctx.lineTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function glow(x, y, r, color, alpha) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.globalAlpha = alpha;
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

function drawLanterns(s) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const b of s.ships) {
    const p = P(b.x, b.y);
    const up = b.kind === 'freighter' ? 18 : b.kind === 'cutter' ? 9 : 5;
    let a = 0.95;
    if (b.kind === 'lifeboat') a = Math.max(0.12, 1 - b.dark / TUNE.lifeDark);
    glow(p.x, p.y - up * (k / 4), 10 + 6 * a, LANTERN[b.kind], a);
  }
  for (const q of s.pending) {
    const p = P(q.x, 0);
    const pulse = 0.6 + 0.4 * Math.sin(clock * 8);
    glow(p.x, p.y + 4, 14, LANTERN[q.kind], pulse);
  }
  ctx.restore();
  // A lifeboat's lantern runs down while it's in the dark: a ring round it shows what's left.
  for (const b of s.ships) {
    if (b.kind !== 'lifeboat') continue;
    const p = P(b.x, b.y);
    const left = 1 - b.dark / TUNE.lifeDark;
    ctx.strokeStyle = left < 0.35 ? '#ff7a5c' : '#ffd27a';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(p.x, p.y - 3, 11, -Math.PI / 2, -Math.PI / 2 + left * Math.PI * 2);
    ctx.stroke();
  }
}

function drawLighthouse(s) {
  const L = P(TUNE.lamp.x, TUNE.lamp.y);
  const u = k / 4; // drawing scale
  ctx.save();
  ctx.translate(L.x, L.y);
  ctx.fillStyle = '#6c7787';
  ctx.beginPath();
  ctx.ellipse(0, 2 * u, 9 * u, 4 * u, 0, 0, Math.PI * 2);
  ctx.fill();
  // The tower, white with red bands.
  ctx.fillStyle = '#f4f1ea';
  ctx.beginPath();
  ctx.moveTo(-6 * u, 0);
  ctx.lineTo(-4 * u, -36 * u);
  ctx.lineTo(4 * u, -36 * u);
  ctx.lineTo(6 * u, 0);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#d4553f';
  for (const y0 of [-8, -24]) {
    ctx.beginPath();
    ctx.moveTo(-5.6 * u + (y0 / -36) * 2 * u, y0 * u);
    ctx.lineTo(-5.2 * u + ((y0 - 6) / -36) * 2 * u, (y0 - 6) * u);
    ctx.lineTo(5.2 * u - ((y0 - 6) / -36) * 2 * u, (y0 - 6) * u);
    ctx.lineTo(5.6 * u - (y0 / -36) * 2 * u, y0 * u);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = '#2d3646';
  ctx.fillRect(-5 * u, -44 * u, 10 * u, 8 * u);
  ctx.beginPath();
  ctx.moveTo(-6 * u, -44 * u);
  ctx.lineTo(0, -50 * u);
  ctx.lineTo(6 * u, -44 * u);
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  glow(L.x, L.y - 40 * u, 26 * u, '#ffe7a0', 0.95);
  ctx.restore();
  ctx.fillStyle = '#fff6d8';
  ctx.beginPath();
  ctx.arc(L.x, L.y - 40 * u, 2.6 * u, 0, Math.PI * 2);
  ctx.fill();
}

// The town: one window for every sailor out tonight; a crew home lights theirs.
function drawTown(s, dt) {
  if (mode === 'night' || mode === 'dawn') {
    windowT += dt;
    while (shownHome < s.home && windowT > 0.1) {
      shownHome++;
      windowT -= 0.1;
    }
    if (shownHome >= s.home) windowT = Math.min(windowT, 0.1);
  } else shownHome = s.home;
  const per = 6;
  const houses = Math.ceil(s.total / per);
  const y0 = TUNE.seaH + 40;
  const span = 92;
  const hw = span / houses;
  const lostFrom = s.total - s.lost;
  let n = 0;
  for (let i = 0; i < houses; i++) {
    const x = 4 + i * hw;
    const bob = (i % 2) * 6;
    const a = P(x + hw * 0.08, y0 + bob);
    const b = P(x + hw * 0.92, y0 + bob + 22);
    const wpx = b.x - a.x;
    const hpx = b.y - a.y;
    ctx.fillStyle = ['#5c4a5f', '#4a5a6e', '#6a5442', '#4d5f52'][i % 4];
    ctx.fillRect(a.x, a.y, wpx, hpx);
    ctx.fillStyle = ['#8c3b35', '#344257', '#7a4a2a', '#3f4f3c'][i % 4];
    ctx.beginPath();
    ctx.moveTo(a.x - 2, a.y);
    ctx.lineTo(a.x + wpx / 2, a.y - hpx * 0.55);
    ctx.lineTo(a.x + wpx + 2, a.y);
    ctx.closePath();
    ctx.fill();
    for (let r = 0; r < 2; r++)
      for (let c = 0; c < 3; c++) {
        if (n >= s.total) break;
        const wx = a.x + wpx * (0.14 + c * 0.28);
        const wy = a.y + hpx * (0.18 + r * 0.42);
        const ww = wpx * 0.18;
        const wh = hpx * 0.26;
        if (n < shownHome) {
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          glow(wx + ww / 2, wy + wh / 2, ww * 1.6, '#ffcf5a', 0.55);
          ctx.restore();
          ctx.fillStyle = '#ffd76a';
        } else ctx.fillStyle = n >= lostFrom ? '#0c111c' : '#1c2840';
        ctx.fillRect(wx, wy, ww, wh);
        n++;
      }
  }
}

function drawFog(s) {
  const L = P(TUNE.lamp.x, TUNE.lamp.y);
  const reach = reachOf(s);
  // Mist over the sea beyond the beam's reach; the harbour and the town stay clear.
  ctx.save();
  ctx.beginPath();
  ctx.rect(-10, -10, W + 20, L.y + 10);
  ctx.clip();
  ctx.fillStyle = 'rgba(150, 165, 185, 0.45)';
  ctx.beginPath();
  ctx.rect(-10, -10, W + 20, L.y + 10);
  ctx.ellipse(L.x, L.y, reach * k, (reach * k) / 2, 0, 0, Math.PI * 2);
  ctx.fill('evenodd');
  ctx.restore();
}

function drawGale(s) {
  if (!galeWarn(s) && !galeOn(s)) return;
  // Whitecaps sweeping in from the windward side, then the shove.
  const f = galeWarn(s) ? (s.t - (TUNE.gale.at - TUNE.gale.warn)) / TUNE.gale.warn : 1;
  const x = s.gale.side > 0 ? f * 100 : 100 - f * 100;
  ctx.strokeStyle = `rgba(255, 255, 255, ${galeOn(s) ? 0.25 : 0.7})`;
  ctx.lineWidth = 2;
  for (let y = 4; y < 296; y += 12) {
    const p = P(x + Math.sin(y + clock * 6) * 2, y);
    ctx.beginPath();
    ctx.arc(p.x, p.y, 5, Math.PI * 1.1, Math.PI * 1.9);
    ctx.stroke();
  }
}

// Rain, slanting with the current, harder in the gale.
const drops = Array.from({ length: 90 }, (_, i) => ({ x: (i * 97.13) % 1, y: (i * 53.71) % 1, l: 0.6 + ((i * 7) % 5) / 10 }));
function drawRain(s, dt) {
  const slant = Math.cos(s.current.dir) * 0.25 + (galeOn(s) ? s.gale.side * 0.6 : 0);
  ctx.strokeStyle = 'rgba(190, 210, 240, 0.16)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (const d of drops) {
    if (dt) {
      d.y += dt * 1.4 * d.l;
      d.x += dt * 1.4 * d.l * slant * (H / W);
      if (d.y > 1) (d.y -= 1), (d.x = (d.x + 0.37) % 1);
      d.x = ((d.x % 1) + 1) % 1;
    }
    const x = d.x * W;
    const y = d.y * H;
    ctx.moveTo(x, y);
    ctx.lineTo(x + slant * 14 * d.l, y + 14 * d.l);
  }
  ctx.stroke();
}

function drawSky(s) {
  // Above the bay: the sky, brightening towards dawn.
  if (oy < 8) return;
  const f = Math.min(1, s.t / TUNE.night);
  const g = ctx.createLinearGradient(0, 0, 0, oy);
  const mix = (a, b) => a.map((v, i) => Math.round(v + (b[i] - v) * f));
  const top = mix([8, 12, 26], [74, 106, 160]);
  const low = mix([22, 34, 62], [240, 176, 120]);
  g.addColorStop(0, `rgb(${top})`);
  g.addColorStop(1, `rgb(${low})`);
  ctx.fillStyle = g;
  ctx.fillRect(-10, -10, W + 20, oy + 10);
}

function drawGhost(s) {
  // Until the first touch: a finger dragging sideways across the lower sea.
  const t = clock % 2.4;
  const f = Math.sin((t / 2.4) * Math.PI * 2);
  const c = P(50 + f * 18, 230);
  ctx.save();
  ctx.globalAlpha = 0.75;
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.beginPath();
  ctx.arc(c.x, c.y, 13, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(c.x - 40, c.y);
  ctx.lineTo(c.x + 40, c.y);
  ctx.stroke();
  for (const d of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(c.x + d * 40, c.y);
    ctx.lineTo(c.x + d * 32, c.y - 6);
    ctx.lineTo(c.x + d * 32, c.y + 6);
    ctx.closePath();
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fill();
  }
  ctx.restore();
}

// --- Loop --------------------------------------------------------------------------------------------
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (!api.manual) advance(dt);
  draw(mode === 'paused' ? 0 : dt);
  requestAnimationFrame(frame);
}

// --- Test hook -----------------------------------------------------------------------------------------
const api = {
  manual: false,
  get s() {
    return night;
  },
  get mode() {
    return mode;
  },
  get mem() {
    return mem;
  },
  TUNE,
  COASTS,
  played,
  start: (o) => startNight(o),
  step: (dt) => advance(dt),
  draw: (dt = 0) => draw(dt),
  inBeam: (x, y, r) => inBeam(night, x, y, r),
  bearingOf,
  beamLimits: () => beamLimits(night),
  autopilotTarget: () => autopilotTarget(night),
  setInput: (i) => {
    input = { hold: false, target: null, swing: 0, ...i };
  },
  ghostShown: () => mode === 'night' && !mem.touched,
  toScreen: (x, y) => P(x, y),
  toSea,
  pose: () => {
    mode = 'tile';
    for (const el of Object.values(screens)) el.hidden = true;
    hud.hidden = true;
  },
};
window.__beacon = api;

resize();
showStart();
requestAnimationFrame(frame);

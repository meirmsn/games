// Trundle: place green parts so the ball Trundle kicks off rolls into the exit.
//
// sim.js runs the physics (one run of one room, deterministic); this module draws, takes input,
// keeps progress and plays the floor run. The page exposes window.__trundle for the tests: with
// __trundle.manual set, the page's frames only draw, and __trundle.frame(ms) advances the game the
// way one display frame of that length would.
import { mountShell } from '../shared/game-shell.js';
import { createRun, overlaps, partPoly, rectPoly, flapBox, robotBox, W, H, S, STEP, TOUCH_R, BALL_R, PARTS } from './sim.js';
import { ROOMS, FLOOR } from './rooms.js';
import * as SIM from './sim.js';

const SOUNDS = ['plank', 'wood', 'metal', 'crate', 'place', 'turn', 'star', 'key', 'unlock', 'kick', 'miss', 'win', 'floor', 'exit', 'toggle'];
const { sound } = mountShell({ sounds: Object.fromEntries(SOUNDS.map((n) => [n, `sounds/${n}.mp3`])) });

function play(name, opts = {}) {
  sound.play(name, { rate: (opts.rate || 1) * (0.94 + Math.random() * 0.12), gain: opts.gain ?? 1 });
}

// ---------------------------------------------------------------------------------------------
// Images: every image of the floor loads now, so each room plays offline once the game has opened.

const IMG = {};
for (const n of ['background_brown', 'ball_red_large', 'block_narrow', 'block_corner', 'hole_large_end', 'hole_large_end_locked', 'hole_start', 'key', 'star', 'star_outline', 'particle_2', 'robot_blueDrive1', 'robot_blueDrive2', 'robot_blueHurt', 'robot_blueJump', 'crate']) {
  IMG[n] = new Image();
  IMG[n].src = `img/${n}.png`;
}
const ready = (im) => im && im.complete && im.naturalWidth > 0;

// ---------------------------------------------------------------------------------------------
// Storage: one key per room, so one unreadable room never costs the others; every access guarded.

const KEY = (i) => `trundle-v1-room-${i + 1}`;
const memory = new Map(); // what's kept when localStorage is blocked: lasts until the page reloads

function loadRoom(i) {
  if (memory.has(i)) return memory.get(i);
  let data = null;
  try {
    const raw = localStorage.getItem(KEY(i));
    if (raw) {
      const d = JSON.parse(raw);
      if (d && typeof d === 'object' && Array.isArray(d.layout)) data = sanitize(i, d);
    }
  } catch (e) {
    data = null; // unreadable: this room starts fresh
  }
  memory.set(i, data);
  return data;
}

function sanitize(i, d) {
  const okPart = (p) => p && PARTS[p.type] && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.a);
  const layout = d.layout.filter(okPart).map(({ type, x, y, a }) => ({ type, x, y, a }));
  const best =
    d.best && Array.isArray(d.best.rec) && d.best.rec.length > 1 && Number.isFinite(d.best.stars)
      ? { stars: d.best.stars, kick: d.best.kick === 'hard' ? 'hard' : 'soft', rec: d.best.rec }
      : null;
  return { layout: fitTray(i, layout), kick: d.kick === 'hard' ? 'hard' : 'soft', best };
}

// Never more parts of a type than the room's tray holds.
function fitTray(i, layout) {
  const left = {};
  for (const t of ROOMS[i].tray) left[t] = (left[t] || 0) + 1;
  return layout.filter((p) => left[p.type]-- > 0);
}

function saveRoom(i, data) {
  memory.set(i, data);
  try {
    localStorage.setItem(KEY(i), JSON.stringify(data));
  } catch (e) {
    // Blocked or full: the memory copy keeps it until the page reloads.
  }
}

// ---------------------------------------------------------------------------------------------
// State

const G = {
  ri: 0,
  room: ROOMS[0],
  layout: [],
  kick: 'soft',
  mode: 'edit', // 'demo' | 'edit' | 'run' | 'done' | 'floor'
  run: null,
  acc: 0,
  trail: [],
  marker: null,
  sel: null,
  drag: null,
  misses: ROOMS.map(() => 0),
  paused: false,
  time: 0,
  robot: { state: 'idle', t: 0 },
  ballIn: null, // {x, y, t}: the ball dropping into the exit
  parts: [], // particles
  shake: null, // {part, t}
  floor: null,
  stepsTotal: 0,
};

let k = 30; // CSS px per unit
let bx = 0;
let by = 0;
let vw = 0;
let vh = 0;
let dpr = 1;
let playTop = 60;
let barH = 90;

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const $ = (s) => document.querySelector(s);
const ui = {
  roomNo: $('[data-room-no]'),
  roomName: $('[data-room-name]'),
  roomStars: $('[data-room-stars]'),
  bar: $('[data-bar]'),
  tray: $('[data-tray]'),
  turnL: $('[data-turn="-15"]'),
  turnR: $('[data-turn="15"]'),
  go: $('[data-go]'),
  done: $('[data-card="done"]'),
  doneTitle: $('[data-done-title]'),
  doneStars: $('[data-done-stars]'),
  next: $('[data-next]'),
  again: $('[data-again]'),
  floorCard: $('[data-card="floor"]'),
  floorStars: $('[data-floor-stars]'),
  rooms: $('[data-card="rooms"]'),
  roomGrid: $('[data-room-grid]'),
  floorRun: $('[data-floor-run]'),
  paused: $('[data-paused]'),
  mute: $('[data-mute]'),
};

// ---------------------------------------------------------------------------------------------
// Layout: the board keeps its 10 × 16 shape, between the top bar and the bottom bar.

function layout() {
  vw = window.innerWidth;
  vh = window.innerHeight;
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(vw * dpr);
  canvas.height = Math.round(vh * dpr);
  const top = document.querySelector('.top').getBoundingClientRect().bottom + 10;
  // The board keeps its place when the bar hides (room done), so it doesn't jump.
  if (!ui.bar.hidden) barH = vh - ui.bar.getBoundingClientRect().top;
  const barTop = vh - barH - 8;
  playTop = top;

  const availW = vw - 32;
  const availH = Math.max(100, (G.mode === 'floor' ? vh - 16 : barTop) - top);
  k = Math.min(availW / W, availH / H);
  bx = Math.round((vw - W * k) / 2);
  by = Math.round(top + (availH - H * k) / 2);
}

const toBoard = (px, py) => ({ x: (px - bx) / k, y: (py - by) / k });
const snap = (v, s = 0.25) => Math.round(v / s) * s;

// ---------------------------------------------------------------------------------------------
// Rooms

function roomFromHash() {
  const m = /^#1-([1-6])$/.exec(location.hash);
  return m ? +m[1] - 1 : 0;
}

function openRoom(i) {
  stopRun();
  G.ri = i;
  G.room = ROOMS[i];
  const saved = loadRoom(i);
  G.layout = saved ? saved.layout.map((p) => ({ ...p })) : [];
  G.kick = saved ? saved.kick : 'soft';
  G.trail = [];
  G.marker = null;
  G.sel = null;
  G.drag = null;
  G.ballIn = null;
  G.parts = [];
  G.floor = null;
  G.robot = { state: 'idle', t: 0 };
  hideCards();
  try {
    if (location.hash !== `#1-${i + 1}`) history.replaceState(null, '', `#1-${i + 1}`);
  } catch (e) {
    // a sandboxed page can refuse it
  }
  ui.roomNo.textContent = String(i + 1);
  ui.roomName.textContent = G.room.name;
  renderStars();
  if (saved) setMode('edit');
  else startRun(true); // a room never played opens with Trundle's demo kick
  renderTray();
}

function hideCards() {
  ui.done.hidden = true;
  ui.floorCard.hidden = true;
  ui.rooms.hidden = true;
}

function setMode(mode) {
  G.mode = mode;
  ui.bar.hidden = mode === 'done' || mode === 'floor';
  ui.go.classList.toggle('running', mode === 'run' || mode === 'demo');
  ui.go.setAttribute('aria-label', mode === 'run' || mode === 'demo' ? 'Stop' : 'Go');
  updateTurn();
  layout();
  if (ui.tray.childElementCount) renderTray();
}

function persist() {
  const old = loadRoom(G.ri);
  saveRoom(G.ri, {
    layout: G.layout.map(({ type, x, y, a }) => ({ type, x, y, a })),
    kick: G.kick,
    best: old ? old.best : null,
  });
}

function bestStars(i) {
  const d = loadRoom(i);
  return d && d.best ? d.best.stars : -1; // -1: not solved yet
}

function starImgs(n, size) {
  let html = '';
  for (let s = 0; s < 3; s++) html += `<img src="img/${s < n ? 'star' : 'star_outline'}.png" alt="" width="${size}" height="${size}" />`;
  return html;
}

function renderStars() {
  const b = Math.max(0, bestStars(G.ri));
  ui.roomStars.innerHTML = starImgs(b, 20);
  ui.roomStars.setAttribute('aria-label', `Best: ${b} of 3 stars`);
}

// ---------------------------------------------------------------------------------------------
// The tray

const TRAY_ICON = { plank: 'block_narrow', wedge: 'block_corner' };

function trayLeft() {
  const left = {};
  for (const t of G.room.tray) left[t] = (left[t] || 0) + 1;
  for (const p of G.layout) left[p.type]--;
  if (G.drag && G.drag.isNew) left[G.drag.part.type]--;
  return left;
}

function renderTray() {
  const left = trayLeft();
  const types = [...new Set(G.room.tray)];
  ui.tray.innerHTML = '';
  for (const t of types) {
    const b = document.createElement('button');
    b.type = 'button';
    const hint = G.mode === 'edit' && !G.layout.length && !G.drag && bestStars(G.ri) < 0 && left[t] > 0 && t === G.room.tray[0];
    b.className = 'part' + (left[t] > 0 ? '' : ' empty') + (hint ? ' hint' : '');
    b.dataset.part = t;
    b.setAttribute('aria-label', `${t === 'plank' ? 'Plank' : 'Wedge'}: ${left[t]} left`);
    b.innerHTML = `<img src="img/${TRAY_ICON[t]}.png" alt="" style="${t === 'plank' ? 'transform:rotate(-60deg)' : ''}" /><span class="count">${left[t]}</span>`;
    b.addEventListener('pointerdown', (e) => trayDown(e, t));
    b.addEventListener('click', (e) => {
      if (e.detail === 0) keyboardPlace(t); // Enter or Space on a focused tray button
    });
    ui.tray.appendChild(b);
  }
}

function updateTurn() {
  const can = G.mode === 'edit' && !!G.sel;
  ui.turnL.disabled = !can;
  ui.turnR.disabled = !can;
}

// A part placed from the keyboard goes to the first free spot near the board's middle.
function keyboardPlace(type) {
  if (trayLeft()[type] <= 0) return;
  editNow();
  for (let r = 0; r < 12; r++) {
    for (let a = 0; a < 8; a++) {
      const p = { type, x: snap(5 + Math.cos(a) * r * 0.5), y: snap(8 + Math.sin(a) * r * 0.5), a: 0 };
      if (!overlaps(G.room, p, G.layout)) {
        G.layout.push(p);
        select(p);
        play('place');
        afterEdit();
        return;
      }
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Runs

function startRun(demo = false) {
  G.sel = null;
  G.marker = null;
  G.ballIn = null;
  const assist = demo ? 0 : assistFor(G.ri);
  G.run = createRun(G.room, demo ? [] : G.layout, { kick: demo ? 'soft' : G.kick, assist });
  G.run.demo = demo;
  G.acc = 0;
  G.trail = G.run.trail;
  G.robot = { state: 'kick', t: 0 };
  play('kick', { gain: demo ? 0.6 : 1 });
  setMode(demo ? 'demo' : 'run');
}

// The hidden assist: from the 4th missed run in a room, the exit takes the ball from 5% further
// away per miss, up to 20%. It resets when the room is done and when the page reloads.
function assistFor(i) {
  return Math.min(0.2, Math.max(0, G.misses[i] - 3) * 0.05);
}

function stopRun() {
  if (G.run && !G.run.result) G.trail = G.run.trail.slice();
  G.run = null;
  G.acc = 0;
}

// Any edit or touch while a run plays ends it, and takes you back to editing.
function editNow() {
  if (G.mode === 'run' || G.mode === 'demo') {
    stopRun();
    G.robot = { state: 'idle', t: 0 };
    setMode('edit');
  }
  G.marker = null;
}

function onRunEvent(e) {
  const run = G.run;
  if (e.type === 'hit') {
    const g = Math.max(0.12, Math.min(1, e.speed / 9));
    if (e.on === 'plank' || e.on === 'wedge') play('plank', { gain: g });
    else if (e.on === 'crate' || e.by === 'crate') play(e.by === 'crate' ? 'wood' : 'crate', { gain: g });
    else if (e.on === 'flap') play('metal', { gain: g, rate: 1.3 });
    else play('metal', { gain: g * 0.8 });
    if (e.speed > 4) dust(run.pose().x, run.pose().y, 4);
  } else if (e.type === 'star') {
    play('star', { rate: 1 + run.stars.size * 0.12 });
    const s = G.room.stars[e.i];
    burst(s.x, s.y, '#ffd400', 14);
  } else if (e.type === 'key') {
    play('key');
    setTimeout(() => play('unlock'), 220);
    burst(G.room.key.x, G.room.key.y, '#ffb400', 12);
  }
}

function finishRun() {
  const run = G.run;
  if (run.result === 'won') {
    const p = run.pose();
    G.ballIn = { x: p.x, y: p.y, t: 0 };
    play('exit');
    setTimeout(() => play('win'), 380);
    G.robot = { state: 'cheer', t: 0 };
    burst(G.room.exit.x, G.room.exit.y, '#ffffff', 18);
    G.misses[G.ri] = 0;
    const wasComplete = floorComplete();
    const old = loadRoom(G.ri);
    const stars = run.stars.size;
    let best = old && old.best;
    // The best run is the one with the most stars; a tie goes to the latest.
    if (!best || stars >= best.stars) best = { stars, kick: run.kick, rec: run.rec };
    saveRoom(G.ri, { layout: G.layout.map(({ type, x, y, a }) => ({ type, x, y, a })), kick: G.kick, best });
    G.trail = run.trail;
    G.run = null;
    G.lastStars = stars;
    setMode('done');
    renderStars();
    const nowComplete = floorComplete();
    setTimeout(() => {
      if (G.mode !== 'done') return;
      if (!wasComplete && nowComplete) startFloorRun();
      else showDone(stars);
    }, 1100);
  } else {
    G.trail = run.trail;
    if (!run.demo) {
      G.misses[G.ri]++;
      G.marker = { x: run.closest.x, y: run.closest.y, t: 0 };
      play('miss', { gain: 0.7 });
      G.robot = { state: 'wince', t: 0 };
    } else {
      G.robot = { state: 'idle', t: 0 };
    }
    G.run = null;
    setMode('edit');
  }
}

function floorComplete() {
  return ROOMS.every((_, i) => bestStars(i) >= 0);
}

function showDone(stars) {
  ui.doneTitle.textContent = stars === 3 ? 'All three stars!' : 'Room done!';
  ui.doneStars.innerHTML = '';
  for (let s = 0; s < 3; s++) {
    const im = document.createElement('img');
    im.src = `img/${s < stars ? 'star' : 'star_outline'}.png`;
    im.alt = '';
    if (s < stars) im.className = 'got';
    ui.doneStars.appendChild(im);
  }
  ui.doneStars.setAttribute('aria-label', `${stars} of 3 stars`);
  ui.next.textContent = floorComplete() && nextRoom() === null ? 'Floor run' : 'Next';
  ui.done.hidden = false;
}

// The next room: the one after this, or the first not yet solved once at the end.
function nextRoom() {
  if (G.ri < ROOMS.length - 1) return G.ri + 1;
  const open = ROOMS.findIndex((_, i) => bestStars(i) < 0);
  return open >= 0 ? open : null;
}

// ---------------------------------------------------------------------------------------------
// The floor run: each room's best run, played back in order, the camera following the ball down.
// It never steps the physics.

const GAP = 3; // units between rooms: the pipe

function startFloorRun() {
  stopRun();
  hideCards();
  const segs = ROOMS.map((room, i) => {
    const d = loadRoom(i);
    const rec = d && d.best ? d.best.rec : null;
    return { room, i, rec, kick: d && d.best ? d.best.kick : 'soft', layout: d ? d.layout : [], stars: d && d.best ? d.best.stars : 0 };
  });
  // The layout drawn is the one saved; the run is the recording, so the floor run can't fail.
  G.floor = { segs: segs.filter((s) => s.rec), si: 0, t: 0, phase: 'pipe', phaseT: 0.6, camY: 0, end: false, kicked: -1 };
  G.floor.total = segs.reduce((n, s) => n + Math.max(0, s.stars), 0);
  G.sel = null;
  setMode('floor');
  ui.roomNo.textContent = String(FLOOR.n);
  ui.roomName.textContent = FLOOR.name;
  ui.roomStars.innerHTML = '';
  play('floor', { gain: 0.8 });
}

function floorPose(seg, t) {
  const f = Math.min(seg.rec.length - 1, t * 30);
  const i = Math.floor(f);
  const j = Math.min(seg.rec.length - 1, i + 1);
  const u = f - i;
  const A = seg.rec[i];
  const B = seg.rec[j];
  return A.map((v, n) => v + (B[n] - v) * u);
}

function segDur(seg) {
  return (seg.rec.length - 1) / 30;
}

function tickFloor(dt0) {
  const F = G.floor;
  if (!F || F.end) return;
  const dt = dt0 * 1.3; // a little faster than life: you've seen each room already
  const seg = F.segs[F.si];
  if (F.phase === 'pipe') {
    F.phaseT -= dt;
    if (F.phaseT <= 0) {
      F.phase = 'play';
      F.t = 0;
      F.robotT = 0;
      play('kick', { gain: 0.7 });
    }
  } else if (F.phase === 'play') {
    const before = F.t;
    F.t += dt;
    F.robotT = (F.robotT || 0) + dt;
    // stars and the key as the ball reaches them
    const pose = floorPose(seg, F.t);
    seg.room.stars.forEach((s, n) => {
      if (Math.hypot(s.x - pose[0], s.y - pose[1]) < TOUCH_R && !(seg.taken || (seg.taken = new Set())).has(n)) {
        seg.taken.add(n);
        play('star', { rate: 1 + seg.taken.size * 0.12 });
        burst(s.x, s.y + oy(F.si), '#ffd400', 12);
      }
    });
    if (seg.room.key && !seg.keyed && Math.hypot(seg.room.key.x - pose[0], seg.room.key.y - pose[1]) < TOUCH_R) {
      seg.keyed = true;
      play('key');
    }
    if (before < segDur(seg) && F.t >= segDur(seg)) {
      play('exit', { gain: 0.8 });
      burst(seg.room.exit.x, seg.room.exit.y + oy(F.si), '#ffffff', 14);
      F.phase = 'sink';
      F.phaseT = 0.35;
    }
  } else if (F.phase === 'sink') {
    F.phaseT -= dt;
    if (F.phaseT <= 0) {
      if (F.si < F.segs.length - 1) {
        F.si++;
        F.phase = 'pipe';
        F.phaseT = 0.7;
      } else {
        F.phase = 'outro';
        F.phaseT = 1.6;
        play('win');
      }
    }
  } else if (F.phase === 'outro') {
    F.phaseT -= dt;
    if (F.phaseT <= 0) {
      F.end = true;
      ui.floorStars.textContent = String(F.total);
      ui.floorCard.hidden = false;
    }
  }
  // camera: centre on the ball, eased
  const target = floorBallWorldY();
  const viewH = (vh - playTop - 16) / k;
  const maxY = oy(ROOMS.length) + 3 + viewH * 0.3; // the door ends up high, clear of the card
  const want = Math.max(viewH / 2 - 0.5, Math.min(maxY, target));
  F.camY += (want - F.camY) * Math.min(1, dt * 4);
}

const oy = (i) => i * (H + GAP);

function floorBallWorldY() {
  const F = G.floor;
  const seg = F.segs[F.si];
  if (F.phase === 'outro') return oy(ROOMS.length) + 3 + ((vh - playTop) / k) * 0.3;
  if (F.phase === 'pipe') return oy(seg.i) + seg.room.ball.y;
  return oy(seg.i) + floorPose(seg, F.phase === 'sink' ? segDur(seg) : F.t)[1];
}

// ---------------------------------------------------------------------------------------------
// The frame loop: the physics steps at a fixed 1/120 s whatever the display rate; a frame takes at
// most 8 steps, so after a stall the run slows down instead of jumping.

let last = 0;
function frame(now) {
  const dt = last ? Math.min(0.25, (now - last) / 1000) : 1 / 60;
  last = now;
  if (!api.manual) tick(dt);
  draw();
  requestAnimationFrame(frame);
}

function tick(dt) {
  if (G.paused) return;
  G.time += dt;
  if (G.run && !G.run.result) {
    G.acc += dt;
    let n = Math.floor(G.acc / STEP + 1e-9);
    if (n > 8) {
      n = 8;
      G.acc = 8 * STEP;
    }
    for (let s = 0; s < n; s++) {
      G.run.step();
      G.stepsTotal++;
      for (const e of G.run.events) onRunEvent(e);
      if (G.run.result) break;
    }
    G.acc -= n * STEP;
    if (G.run && G.run.result) finishRun();
  }
  if (G.mode === 'floor') tickFloor(dt);
  G.robot.t += dt;
  if (G.ballIn) G.ballIn.t += dt;
  if (G.marker) G.marker.t += dt;
  if (G.shake) {
    G.shake.t += dt;
    if (G.shake.t > 0.35) G.shake = null;
  }
  for (const p of G.parts) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 9 * dt;
    p.life -= dt;
  }
  G.parts = G.parts.filter((p) => p.life > 0);
}

function burst(x, y, color, n) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.random() * 0.4;
    const v = 2 + Math.random() * 3;
    G.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 2, life: 0.5 + Math.random() * 0.4, color, r: 0.07 + Math.random() * 0.06 });
  }
}

function dust(x, y, n) {
  for (let i = 0; i < n; i++) {
    G.parts.push({ x, y: y + BALL_R, vx: (Math.random() - 0.5) * 3, vy: -Math.random() * 2, life: 0.35, color: 'rgba(255,255,255,0.8)', r: 0.05 });
  }
}

// ---------------------------------------------------------------------------------------------
// Drawing

const COL = {
  yellow: '#ffcc00',
  yellowEdge: '#e0a400',
  yellowHi: '#ffe066',
  green: '#3ed37a',
  greenEdge: '#23a457',
  greenHi: '#8bf0b0',
  blue: '#5ab0ff',
  blueEdge: '#2f84d6',
  frame: '#fffdf8',
};

function pathPoly(pts) {
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.closePath();
}

// A block in the pack's style: a fill, a darker rim, a light top edge and a rivet in each corner.
function drawBlock(pts, fill, edge, hi, rivets = true) {
  pathPoly(pts);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineJoin = 'round';
  ctx.lineWidth = 0.09;
  ctx.strokeStyle = edge;
  ctx.stroke();
  // inner highlight along the first edge
  ctx.beginPath();
  const c = centroid(pts);
  const inset = (p) => ({ x: p.x + (c.x - p.x) * 0.18, y: p.y + (c.y - p.y) * 0.18 });
  if (pts.length === 4) {
    const top = [...pts].sort((a, b) => a.y - b.y).slice(0, 2);
    const a = inset(top[0]);
    const b = inset(top[1]);
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.lineWidth = 0.06;
    ctx.strokeStyle = hi;
    ctx.stroke();
  }
  if (rivets) {
    ctx.fillStyle = edge;
    for (const p of pts) {
      const q = { x: p.x + (c.x - p.x) * 0.0, y: p.y };
      const d = Math.hypot(c.x - p.x, c.y - p.y);
      const r = Math.min(0.22, d * 0.35) / d;
      q.x = p.x + (c.x - p.x) * r;
      q.y = p.y + (c.y - p.y) * r;
      ctx.beginPath();
      ctx.arc(q.x, q.y, 0.045, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function centroid(pts) {
  let x = 0;
  let y = 0;
  for (const p of pts) {
    x += p.x;
    y += p.y;
  }
  return { x: x / pts.length, y: y / pts.length };
}

function keyhole(b) {
  if (Math.min(b.w, b.h) < 0.9) return;
  ctx.save();
  ctx.translate(b.x, b.y);
  ctx.rotate(((b.a || 0) * Math.PI) / 180);
  ctx.fillStyle = 'rgba(70,40,0,0.55)';
  ctx.beginPath();
  ctx.arc(0, -0.06, 0.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-0.05, 0);
  ctx.lineTo(0.05, 0);
  ctx.lineTo(0.08, 0.2);
  ctx.lineTo(-0.08, 0.2);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawImg(im, x, y, w, h, rot = 0, flip = 1, alpha = 1) {
  if (!ready(im)) return;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.translate(x, y);
  if (rot) ctx.rotate(rot);
  if (flip < 0) ctx.scale(-1, 1);
  ctx.drawImage(im, -w / 2, -h / 2, w, h);
  ctx.restore();
}

let pattern = null;
let patternK = 0;
function boardPattern() {
  if (!ready(IMG.background_brown)) return '#e8a96a';
  if (!pattern || patternK !== k) {
    pattern = ctx.createPattern(IMG.background_brown, 'repeat');
    patternK = k;
  }
  // one check per unit: the tile is 2 × 2 checks
  pattern.setTransform(new DOMMatrix().scale(2 / IMG.background_brown.naturalWidth));
  return pattern;
}

// A room at vertical offset y0 (units). dyn: what moves: ball, flap and crate poses, stars taken.
function drawRoom(room, layoutParts, dyn, y0 = 0, opts = {}) {
  ctx.save();
  ctx.translate(0, y0);
  // the board: the pack's warm checks, in a white frame
  ctx.fillStyle = COL.frame;
  roundRect(-0.22, -0.22, W + 0.44, H + 0.44, 0.35);
  ctx.fill();
  ctx.save();
  roundRect(0, 0, W, H, 0.2);
  ctx.clip();
  ctx.fillStyle = boardPattern();
  ctx.fillRect(0, 0, W, H);
  // a soft shade toward the open floor, where the ball falls out
  const g = ctx.createLinearGradient(0, H - 2, 0, H);
  g.addColorStop(0, 'rgba(60,30,10,0)');
  g.addColorStop(1, 'rgba(60,30,10,0.22)');
  ctx.fillStyle = g;
  ctx.fillRect(0, H - 2, W, 2);

  // the trail of the last run
  if (opts.trail && opts.trail.length > 4) {
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    for (let i = 0; i < opts.trail.length; i += 4) {
      ctx.beginPath();
      ctx.arc(opts.trail[i], opts.trail[i + 1], 0.055, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // the exit: locked until the key is touched
  const locked = room.key && !dyn.keyed;
  const pulse = 1 + 0.05 * Math.sin(G.time * 3);
  if (dyn.pipeIn) drawImg(IMG.hole_start, room.ball.x, room.ball.y, 0.9, 0.9);
  drawImg(locked ? IMG.hole_large_end_locked : IMG.hole_large_end, room.exit.x, room.exit.y, 1.25 * pulse, 1.25 * pulse);

  for (const b of room.fixed) {
    drawBlock(rectPoly(b), COL.yellow, COL.yellowEdge, COL.yellowHi);
    keyhole(b);
  }

  // stars and the key
  room.stars.forEach((s, i) => {
    if (dyn.taken && dyn.taken.has(i)) return;
    const tw = 1 + 0.07 * Math.sin(G.time * 2.4 + i * 1.7);
    drawImg(IMG.star, s.x, s.y + Math.sin(G.time * 1.6 + i) * 0.05, 0.78 * tw, 0.78 * tw, Math.sin(G.time + i) * 0.12);
  });
  if (room.key && !dyn.keyed) drawImg(IMG.key, room.key.x, room.key.y + Math.sin(G.time * 2) * 0.06, 0.8, 0.75, -0.3);

  // the crate
  if (room.crate) {
    const c = dyn.crate || { x: room.crate.x, y: room.crate.y, a: 0 };
    drawImg(IMG.crate, c.x, c.y, room.crate.w, room.crate.h, c.a);
  }

  // parts
  for (const p of layoutParts) drawPart(p, opts);

  // the flap: blue, hinged at its top
  if (room.flap) {
    const f = room.flap;
    const a = dyn.flap || 0;
    ctx.save();
    drawBlock(rectPoly(flapBox(f, a)), COL.blue, COL.blueEdge, '#a9d6ff', false);
    ctx.fillStyle = '#e8eef5';
    ctx.strokeStyle = '#7d8a99';
    ctx.lineWidth = 0.05;
    ctx.beginPath();
    ctx.arc(f.x, f.y, 0.14, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  drawRobot(room, dyn.robot || { state: 'idle', t: 0 }, opts.kickChip ? dyn.kick : null);

  // the ball
  if (dyn.ball && !dyn.ballGone) {
    const s = dyn.ballScale ?? 1;
    drawImg(IMG.ball_red_large, dyn.ball.x, dyn.ball.y, BALL_R * 2 * s, BALL_R * 2 * s, dyn.ball.spin || 0);
  }

  // the near-miss marker: where the ball came closest to the exit
  if (opts.marker) {
    const m = opts.marker;
    const r = 0.42 + 0.06 * Math.sin(m.t * 6);
    ctx.save();
    ctx.globalAlpha = Math.min(1, m.t * 4);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 0.08;
    ctx.setLineDash([0.12, 0.1]);
    ctx.beginPath();
    ctx.arc(m.x, m.y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = 'rgba(239,79,90,0.9)';
    ctx.lineWidth = 0.06;
    ctx.beginPath();
    ctx.moveTo(m.x - 0.16, m.y - 0.16);
    ctx.lineTo(m.x + 0.16, m.y + 0.16);
    ctx.moveTo(m.x + 0.16, m.y - 0.16);
    ctx.lineTo(m.x - 0.16, m.y + 0.16);
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore(); // clip
  ctx.restore();
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

function drawPart(p, opts = {}) {
  let dx = 0;
  if (G.shake && G.shake.part === p) dx = Math.sin(G.shake.t * 60) * 0.12 * (1 - G.shake.t / 0.35);
  const pts = partPoly({ ...p, x: p.x + dx });
  const bad = G.drag && G.drag.part === p && G.drag.bad;
  ctx.save();
  if (G.drag && G.drag.part === p) {
    ctx.shadowColor = 'rgba(0,0,0,0.3)';
    ctx.shadowBlur = 0.4 * k;
    ctx.shadowOffsetY = 0.12 * k;
  }
  drawBlock(pts, bad ? '#ff8a8a' : COL.green, bad ? '#d24a4a' : COL.greenEdge, bad ? '#ffd0d0' : COL.greenHi);
  ctx.restore();
  if (opts.select && G.sel === p) {
    pathPoly(pts);
    ctx.lineWidth = 0.08;
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.setLineDash([0.2, 0.12]);
    ctx.lineDashOffset = -G.time * 0.6;
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

// Trundle: drives into the ball to kick it, cheers at the exit, winces at a miss, and leans toward
// the ball while it runs. The chip over Trundle shows the kick: one chevron soft, two hard.
function drawRobot(room, R, kick) {
  const r = room.robot;
  const dir = r.dir || 1;
  let x = r.x;
  let y = r.y;
  let im = IMG.robot_blueDrive1;
  let rot = 0;
  const t = R.t;
  if (R.state === 'kick') {
    const u = t < 0.12 ? t / 0.12 : Math.max(0, 1 - (t - 0.12) / 0.35);
    x += dir * 0.3 * u;
    im = Math.floor(t * 16) % 2 ? IMG.robot_blueDrive2 : IMG.robot_blueDrive1;
  } else if (R.state === 'cheer') {
    im = IMG.robot_blueJump;
    y -= Math.abs(Math.sin(t * 7)) * 0.45 * Math.max(0, 1 - t / 1.6);
  } else if (R.state === 'wince') {
    im = t < 1.1 ? IMG.robot_blueHurt : IMG.robot_blueDrive1;
    if (t < 0.4) x += Math.sin(t * 50) * 0.05;
  } else {
    y -= Math.abs(Math.sin(G.time * 2.2)) * 0.03;
  }
  if (R.look != null) rot = Math.max(-0.18, Math.min(0.18, R.look));
  const w = 1.5;
  const h = (w * 150) / 184;
  ctx.save();
  ctx.translate(x, y - h / 2);
  ctx.rotate(rot);
  if (dir < 0) ctx.scale(-1, 1);
  if (ready(im)) ctx.drawImage(im, -w / 2, -h / 2, w, h);
  ctx.restore();
  if (kick) {
    // the kick chip
    const cx = r.x + dir * 0.15;
    const cy = r.y - h - 0.45 + Math.sin(G.time * 3) * 0.04;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = 'rgba(255,253,248,0.95)';
    roundRect(-0.42, -0.24, 0.84, 0.48, 0.24);
    ctx.fill();
    ctx.strokeStyle = kick === 'hard' ? '#ef4f5a' : '#23a457';
    ctx.lineWidth = 0.09;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const n = kick === 'hard' ? 2 : 1;
    for (let i = 0; i < n; i++) {
      const ox = (i - (n - 1) / 2) * 0.22;
      ctx.beginPath();
      ctx.moveTo(ox - dir * 0.08, -0.12);
      ctx.lineTo(ox + dir * 0.08, 0);
      ctx.lineTo(ox - dir * 0.08, 0.12);
      ctx.stroke();
    }
    ctx.restore();
  }
}

function drawParticles(y0 = 0) {
  for (const p of G.parts) {
    ctx.globalAlpha = Math.max(0, Math.min(1, p.life * 2.5));
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y + y0, p.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function draw() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#3a8fd9';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  // faint workshop stripes behind the board
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  for (let x = -vh; x < vw; x += 46) {
    ctx.beginPath();
    ctx.moveTo(x, vh);
    ctx.lineTo(x + vh * 0.5, 0);
    ctx.lineTo(x + vh * 0.5 + 18, 0);
    ctx.lineTo(x + 18, vh);
    ctx.fill();
  }
  if (G.mode === 'floor' && G.floor) return drawFloor();

  ctx.setTransform(dpr * k, 0, 0, dpr * k, dpr * bx, dpr * by);
  const run = G.run;
  const dyn = { robot: G.robot, kick: G.kick, keyed: !G.room.key };
  if (run) {
    const p = run.pose();
    dyn.ball = { x: p.x, y: p.y, spin: p.x / BALL_R };
    dyn.taken = run.stars;
    dyn.keyed = run.keyed;
    if (run.flap) dyn.flap = run.flap.angle;
    if (run.crate) dyn.crate = { x: run.crate.position.x / S, y: run.crate.position.y / S, a: run.crate.angle };
    G.robot.look = (p.x - G.room.robot.x) * 0.02 * (G.room.robot.dir || 1);
  } else if (G.ballIn) {
    const u = Math.min(1, G.ballIn.t / 0.35);
    const ex = G.room.exit;
    dyn.ball = { x: G.ballIn.x + (ex.x - G.ballIn.x) * u, y: G.ballIn.y + (ex.y - G.ballIn.y) * u, spin: 0 };
    dyn.ballScale = 1 - u * 0.8;
    dyn.ballGone = u >= 1;
    dyn.keyed = true;
  } else {
    dyn.ball = { x: G.room.ball.x, y: G.room.ball.y, spin: 0 };
    G.robot.look = null;
  }
  if (G.mode === 'done' && G.lastStars != null) dyn.taken = new Set(); // stars hidden only during a run
  const parts = G.layout.slice();
  if (G.drag && G.drag.isNew) parts.push(G.drag.part);
  drawRoom(G.room, parts, dyn, 0, {
    trail: G.mode === 'run' || G.mode === 'demo' ? G.run && G.run.trail : G.trail,
    marker: G.marker,
    select: G.mode === 'edit',
    kickChip: G.mode !== 'floor',
  });
  drawParticles();
}

function drawFloor() {
  const F = G.floor;
  const camTop = F.camY - (vh - playTop - 16) / k / 2;
  ctx.setTransform(dpr * k, 0, 0, dpr * k, dpr * bx, dpr * (playTop - camTop * k));
  const viewH = (vh - playTop) / k;
  for (const seg of F.segs) {
    const y0 = oy(seg.i);
    if (y0 > camTop + viewH + 1 || y0 + H < camTop - 1) continue;
    const dyn = { robot: { state: 'idle', t: 0 }, keyed: !seg.room.key || seg.keyed, taken: seg.taken, pipeIn: seg.i > 0 };
    const active = F.segs[F.si] === seg;
    const doneSeg = F.segs.indexOf(seg) < F.si || (active && (F.phase === 'sink' || F.phase === 'outro'));
    if (active && F.phase === 'play') {
      const p = floorPose(seg, F.t);
      dyn.ball = { x: p[0], y: p[1], spin: p[0] / BALL_R };
      let n = 3;
      if (seg.room.flap) dyn.flap = p[n++];
      if (seg.room.crate) dyn.crate = { x: p[n], y: p[n + 1], a: p[n + 2] };
      dyn.robot = { state: F.robotT < 0.5 ? 'kick' : 'idle', t: F.robotT };
    } else if (active && F.phase === 'pipe') {
      dyn.ball = { x: seg.room.ball.x, y: seg.room.ball.y, spin: 0 };
      dyn.ballScale = Math.max(0.2, 1 - F.phaseT);
    } else if (doneSeg) {
      const p = floorPose(seg, segDur(seg));
      let n = 3;
      if (seg.room.flap) dyn.flap = p[n++];
      if (seg.room.crate) dyn.crate = { x: p[n], y: p[n + 1], a: p[n + 2] };
      dyn.keyed = true;
      if (active && F.phase === 'sink') {
        const u = 1 - F.phaseT / 0.35;
        dyn.ball = { x: p[0] + (seg.room.exit.x - p[0]) * u, y: p[1] + (seg.room.exit.y - p[1]) * u };
        dyn.ballScale = 1 - u * 0.8;
      }
    } else {
      dyn.ball = { x: seg.room.ball.x, y: seg.room.ball.y, spin: 0 };
    }
    drawRoom(seg.room, seg.layout, dyn, y0, {});
    // the pipe down to the next room
    if (seg.i < ROOMS.length) {
      ctx.fillStyle = 'rgba(16,40,70,0.35)';
      roundRect(W / 2 - 0.35, y0 + H + 0.3, 0.7, GAP - 0.6, 0.3);
      ctx.fill();
    }
  }
  // floor 2's locked door, below the last room
  const y2 = oy(ROOMS.length);
  ctx.fillStyle = 'rgba(16,40,70,0.45)';
  roundRect(0, y2, W, 6, 0.4);
  ctx.fill();
  drawImg(IMG.hole_large_end_locked, W / 2, y2 + 3, 2, 2);
  ctx.fillStyle = '#fffdf8';
  ctx.font = `800 0.8px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText('2', W / 2, y2 + 1.4);
  if (F.phase === 'outro' || F.end) {
    const t = F.end ? 2 : 1.6 - F.phaseT;
    drawRobot({ robot: { x: W / 2 - 2.4, y: y2 + 4.6, dir: 1 } }, { state: 'cheer', t: t % 1.6 }, null);
  }
  drawParticles(0);
}

// ---------------------------------------------------------------------------------------------
// Input: one finger at a time; a second is ignored and the first carries on.

let activePointer = null;

function hitPart(pt) {
  const tol = Math.max(0.35, 24 / k);
  for (let i = G.layout.length - 1; i >= 0; i--) {
    const p = G.layout[i];
    if (distToPoly(pt, partPoly(p)) <= tol) return p;
  }
  return null;
}

function distToPoly(pt, pts) {
  let inside = false;
  let d = Infinity;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i];
    const b = pts[j];
    if (a.y > pt.y !== b.y > pt.y && pt.x < ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
    const vx = b.x - a.x;
    const vy = b.y - a.y;
    const u = Math.max(0, Math.min(1, ((pt.x - a.x) * vx + (pt.y - a.y) * vy) / (vx * vx + vy * vy)));
    d = Math.min(d, Math.hypot(a.x + vx * u - pt.x, a.y + vy * u - pt.y));
  }
  return inside ? 0 : d;
}

function hitRobot(pt) {
  const b = robotBox(G.room);
  return Math.abs(pt.x - b.x) < b.w / 2 + 0.4 && Math.abs(pt.y - (b.y - 0.3)) < b.h / 2 + 0.7;
}

function select(p) {
  G.sel = p;
  updateTurn();
}

canvas.addEventListener('pointerdown', (e) => {
  if (activePointer !== null) return;
  if (G.paused) return;
  if (G.mode === 'floor') {
    // a tap skips to the end of the floor run
    if (G.floor && !G.floor.end) skipFloor();
    return;
  }
  if (G.mode === 'run' || G.mode === 'demo') {
    editNow();
    return;
  }
  if (G.mode !== 'edit') return;
  const pt = toBoard(e.clientX, e.clientY);
  const p = hitPart(pt);
  if (p) {
    activePointer = e.pointerId;
    G.marker = null;
    select(p);
    G.drag = { part: p, isNew: false, px0: e.clientX, py0: e.clientY, orig: { x: p.x, y: p.y, a: p.a }, moved: false, bad: false };
    return;
  }
  if (hitRobot(pt)) {
    G.kick = G.kick === 'soft' ? 'hard' : 'soft';
    G.robot = { state: 'kick', t: 0.3 };
    play('toggle');
    G.marker = null;
    persist();
    return;
  }
  select(null);
});

function trayDown(e, type) {
  if (activePointer !== null || G.paused) return;
  if (G.mode === 'done' || G.mode === 'floor') return;
  editNow();
  if (trayLeft()[type] <= 0) return;
  e.preventDefault();
  activePointer = e.pointerId;
  const lift = e.pointerType === 'mouse' ? 0 : 64; // a finger never hides the part it carries
  const pt = toBoard(e.clientX, e.clientY - lift);
  const part = { type, x: snap(pt.x), y: snap(pt.y), a: type === 'plank' ? 0 : 0 };
  G.drag = { part, isNew: true, lift, moved: true, bad: true };
  select(null);
  renderTray();
}

window.addEventListener('pointermove', (e) => {
  if (e.pointerId !== activePointer || !G.drag) return;
  const D = G.drag;
  const p = D.part;
  if (D.isNew) {
    const pt = toBoard(e.clientX, e.clientY - D.lift);
    p.x = clampX(snap(pt.x));
    p.y = clampY(snap(pt.y));
  } else {
    const dx = (e.clientX - D.px0) / k;
    const dy = (e.clientY - D.py0) / k;
    if (Math.hypot(e.clientX - D.px0, e.clientY - D.py0) > 6) D.moved = true;
    if (!D.moved) return;
    p.x = clampX(snap(D.orig.x + dx));
    p.y = clampY(snap(D.orig.y + dy));
  }
  D.bad = overlaps(G.room, p, G.layout.filter((q) => q !== p));
  D.overBar = e.clientY > ui.bar.getBoundingClientRect().top;
});

const clampX = (x) => Math.max(0.25, Math.min(W - 0.25, x));
const clampY = (y) => Math.max(0.25, Math.min(H - 0.25, y));

function endDrag(e) {
  if (e.pointerId !== activePointer) return;
  activePointer = null;
  const D = G.drag;
  G.drag = null;
  if (!D) return;
  const p = D.part;
  const overBar = e.clientY > ui.bar.getBoundingClientRect().top;
  if (!D.isNew && !D.moved) return; // a tap: just selected it
  if (overBar) {
    // back to the tray
    G.layout = G.layout.filter((q) => q !== p);
    select(null);
    play('turn', { rate: 0.8 });
    afterEdit();
    return;
  }
  if (overlaps(G.room, p, G.layout.filter((q) => q !== p))) {
    play('turn', { rate: 0.6, gain: 0.8 });
    if (D.isNew) {
      select(null);
    } else {
      Object.assign(p, D.orig);
      G.shake = { part: p, t: 0 };
    }
    afterEdit();
    return;
  }
  if (D.isNew) G.layout.push(p);
  select(p);
  play('place');
  afterEdit();
}
window.addEventListener('pointerup', endDrag);
window.addEventListener('pointercancel', (e) => {
  if (e.pointerId !== activePointer) return;
  const D = G.drag;
  activePointer = null;
  G.drag = null;
  if (D && !D.isNew) Object.assign(D.part, D.orig);
  renderTray();
});

function afterEdit() {
  G.marker = null;
  renderTray();
  updateTurn();
  persist();
}

function turn(deg) {
  const p = G.sel;
  if (!p || G.mode !== 'edit') return;
  const before = p.a;
  p.a = (((p.a + deg) % 360) + 360) % 360;
  if (overlaps(G.room, p, G.layout.filter((q) => q !== p))) {
    p.a = before;
    G.shake = { part: p, t: 0 };
    play('turn', { rate: 0.6, gain: 0.8 });
    return;
  }
  play('turn');
  afterEdit();
}

function nudge(dx, dy) {
  const p = G.sel;
  if (!p || G.mode !== 'edit') return;
  const o = { x: p.x, y: p.y };
  p.x = clampX(p.x + dx);
  p.y = clampY(p.y + dy);
  if (overlaps(G.room, p, G.layout.filter((q) => q !== p))) {
    Object.assign(p, o);
    G.shake = { part: p, t: 0 };
    return;
  }
  afterEdit();
}

function go() {
  if (G.drag) return; // a drag in progress ends first
  if (G.mode === 'run' || G.mode === 'demo') {
    editNow();
    return;
  }
  if (G.mode !== 'edit') return;
  startRun(false);
}

ui.turnL.addEventListener('click', () => turn(-15));
ui.turnR.addEventListener('click', () => turn(15));
ui.go.addEventListener('click', go);
canvas.addEventListener(
  'wheel',
  (e) => {
    if (!G.sel) return;
    e.preventDefault();
    turn(e.deltaY > 0 ? 15 : -15);
  },
  { passive: false }
);

window.addEventListener('keydown', (e) => {
  const t = e.target;
  if (t instanceof Element && t.closest('input, textarea')) return;
  if (G.paused && (e.key === ' ' || e.key === 'Enter')) {
    resume();
    e.preventDefault();
    return;
  }
  if (e.key === 'Escape' && G.sel) {
    select(null);
    e.preventDefault(); // let go of the part; leave the game only when nothing is selected
    return;
  }
  if (e.key === 'Escape' && !ui.rooms.hidden) {
    closeRooms();
    e.preventDefault();
    return;
  }
  if (G.mode === 'floor') {
    if (e.key === ' ' || e.key === 'Enter') {
      skipFloor();
      e.preventDefault();
    }
    return;
  }
  const onButton = t instanceof HTMLButtonElement;
  if (e.key === ' ' && !onButton) {
    e.preventDefault();
    go();
  } else if (e.key === 'q' || e.key === 'Q') turn(-15);
  else if (e.key === 'e' || e.key === 'E') turn(15);
  else if (e.key === 'k' || e.key === 'K') {
    if (G.mode === 'edit') {
      G.kick = G.kick === 'soft' ? 'hard' : 'soft';
      play('toggle');
      persist();
    }
  } else if (e.key === 'n' || e.key === 'N') {
    if (G.mode === 'edit' && G.layout.length) {
      const i = G.layout.indexOf(G.sel);
      select(G.layout[(i + 1) % G.layout.length]);
    }
  } else if ((e.key === 'Delete' || e.key === 'Backspace') && G.sel && G.mode === 'edit') {
    G.layout = G.layout.filter((q) => q !== G.sel);
    select(null);
    afterEdit();
  } else if (e.key.startsWith('Arrow') && G.sel) {
    e.preventDefault();
    const d = 0.25;
    if (e.key === 'ArrowLeft') nudge(-d, 0);
    if (e.key === 'ArrowRight') nudge(d, 0);
    if (e.key === 'ArrowUp') nudge(0, -d);
    if (e.key === 'ArrowDown') nudge(0, d);
  }
});

// Cards
ui.again.addEventListener('click', () => {
  hideCards();
  G.ballIn = null;
  G.robot = { state: 'idle', t: 0 };
  setMode('edit');
});
ui.next.addEventListener('click', () => {
  const n = nextRoom();
  if (n === null) startFloorRun();
  else openRoom(n);
});
$('[data-replay]').addEventListener('click', startFloorRun);
$('[data-floor-rooms]').addEventListener('click', showRooms);
$('[data-rooms]').addEventListener('click', () => (ui.rooms.hidden ? showRooms() : closeRooms()));
$('[data-close-rooms]').addEventListener('click', closeRooms);

// Closing the list puts back the card it covered.
function closeRooms() {
  ui.rooms.hidden = true;
  ui.bar.hidden = G.mode === 'done' || G.mode === 'floor';
  if (G.mode === 'done') showDone(G.lastStars);
  else if (G.mode === 'floor' && G.floor && G.floor.end) ui.floorCard.hidden = false;
}
ui.floorRun.addEventListener('click', startFloorRun);

function showRooms() {
  if (G.mode === 'run' || G.mode === 'demo') editNow();
  ui.roomGrid.innerHTML = '';
  ROOMS.forEach((room, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = i === G.ri ? 'current' : '';
    const s = bestStars(i);
    b.innerHTML = `<b>${i + 1}</b><span class="mini">${starImgs(Math.max(0, s), 16)}</span>`;
    b.setAttribute('aria-label', `Room ${i + 1}, ${room.name}: ${s < 0 ? 'not solved' : `${s} of 3 stars`}`);
    b.addEventListener('click', () => openRoom(i));
    ui.roomGrid.appendChild(b);
  });
  ui.floorRun.hidden = !floorComplete();
  ui.floorCard.hidden = true;
  ui.done.hidden = true;
  ui.rooms.hidden = false;
  ui.bar.hidden = true;
}

function skipFloor() {
  const F = G.floor;
  if (!F) return;
  F.end = true;
  F.si = F.segs.length - 1;
  F.phase = 'outro';
  F.phaseT = 0;
  F.camY = oy(ROOMS.length) + 3 + ((vh - playTop) / k) * 0.3;
  ui.floorStars.textContent = String(F.total);
  ui.floorCard.hidden = false;
}

// Mute
function renderMute() {
  ui.mute.setAttribute('aria-pressed', String(sound.muted));
  ui.mute.setAttribute('aria-label', sound.muted ? 'Unmute' : 'Mute');
}
ui.mute.addEventListener('click', () => {
  sound.muted = !sound.muted;
  renderMute();
});
renderMute();

// Pause when hidden; resume only on a tap, never on its own.
function moving() {
  return G.mode === 'run' || G.mode === 'demo' || (G.mode === 'floor' && G.floor && !G.floor.end);
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    sound.suspend();
    if (moving()) {
      G.paused = true;
      ui.paused.hidden = false;
    }
  }
});
function resume() {
  G.paused = false;
  ui.paused.hidden = true;
  last = 0;
  sound.unlock();
}
ui.paused.addEventListener('click', resume);

window.addEventListener('resize', layout);
window.addEventListener('hashchange', () => {
  const i = roomFromHash();
  if (i !== G.ri || G.mode === 'floor') openRoom(i);
});

// ---------------------------------------------------------------------------------------------
// The test hook

const api = {
  G,
  ROOMS,
  FLOOR,
  SIM,
  manual: false,
  frame: (ms) => tick(ms / 1000),
  openRoom,
  go,
  turn,
  startRun,
  showRooms,
  startFloorRun,
  loadRoom,
  view: () => ({ k, bx, by }),
  toScreen: (x, y) => ({ x: bx + x * k, y: by + y * k }),
  // Place parts directly (tests and the solution replays): [{type, x, y, a}]
  setLayout(parts, kick) {
    editNow();
    G.layout = parts.map((p) => ({ ...p }));
    if (kick) G.kick = kick;
    afterEdit();
  },
};
window.__trundle = api;

layout();
openRoom(roomFromHash());
requestAnimationFrame(frame);

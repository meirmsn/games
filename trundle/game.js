// Trundle: rebuild the machine under the falling balls, so they reach the exit.
//
// sim.js runs the physics (one attempt at one room, deterministic, every edit logged with its
// step); this module draws, takes input, keeps progress and plays the floor run. The page exposes
// window.__trundle for the tests: with __trundle.manual set, the page's frames only draw, and
// __trundle.frame(ms) advances the game the way one display frame of that length would.
import { mountShell } from '../shared/game-shell.js';
import { createAttempt, replay, overlaps, partPoly, rectPoly, flapBox, girderBox, W, H, S, STEP, BALL_R, PARTS } from './sim.js';
import { ROOMS, FLOOR } from './rooms.js';
import * as SIM from './sim.js';

const SOUNDS = ['plank', 'wood', 'metal', 'crate', 'place', 'turn', 'star', 'key', 'unlock', 'kick', 'miss', 'win', 'floor', 'exit', 'toggle', 'pop'];
const { sound } = mountShell({ sounds: Object.fromEntries(SOUNDS.map((n) => [n, `sounds/${n}.mp3`])) });

function play(name, opts = {}) {
  sound.play(name, { rate: (opts.rate || 1) * (0.94 + Math.random() * 0.12), gain: opts.gain ?? 1 });
}

// ---------------------------------------------------------------------------------------------
// Images: every image of the floor loads now, so each room plays offline once the game has opened.

const IMG = {};
for (const n of ['background_brown', 'ball_red_large', 'block_narrow', 'block_corner', 'hole_large_end', 'hole_large_end_locked', 'key', 'star', 'star_outline', 'robot_blueDrive1', 'robot_blueDrive2', 'robot_blueHurt', 'robot_blueJump', 'crate']) {
  IMG[n] = new Image();
  IMG[n].src = `img/${n}.png`;
}
const ready = (im) => im && im.complete && im.naturalWidth > 0;

// ---------------------------------------------------------------------------------------------
// Storage: one key per room, so one unreadable room never costs the others; every access guarded.

const KEY = (i) => `trundle-v2-room-${i + 1}`;
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

const okPart = (p) => p && PARTS[p.type] && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.a) && Number.isInteger(p.id);
const cleanParts = (i, l) => fitTray(i, l.filter(okPart).map(({ id, type, x, y, a }) => ({ id, type, x, y, a })));

function sanitize(i, d) {
  const b = d.best;
  const best =
    b && Number.isFinite(b.stars) && Number.isFinite(b.inCount) && Array.isArray(b.layout) && Array.isArray(b.log)
      ? { stars: b.stars, inCount: b.inCount, layout: cleanParts(i, b.layout), log: b.log.filter((e) => e && Number.isInteger(e.s) && typeof e.op === 'string') }
      : null;
  return { layout: cleanParts(i, d.layout), best };
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
  layout: [], // the player's parts: {id, type, x, y, a}
  nextId: 1,
  mode: 'run', // 'run' | 'failed' | 'done' | 'floor'
  att: null, // the attempt playing (or just finished)
  layout0: [], // the layout the attempt started from
  acc: 0,
  sel: null,
  drag: null,
  fails: ROOMS.map(() => 0),
  paused: false,
  time: 0,
  robot: { state: 'idle', t: 0 },
  sinks: [], // balls dropping into an exit: {x, y, ex, ey, t}
  parts: [], // particles
  shake: null, // {part, t}
  floor: null,
  stepsTotal: 0,
  lastStars: null,
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
  balls: $('[data-balls]'),
  bar: $('[data-bar]'),
  tray: $('[data-tray]'),
  turnL: $('[data-turn="-15"]'),
  turnR: $('[data-turn="15"]'),
  restart: $('[data-restart]'),
  done: $('[data-card="done"]'),
  doneTitle: $('[data-done-title]'),
  doneStars: $('[data-done-stars]'),
  doneCount: $('[data-done-count]'),
  next: $('[data-next]'),
  again: $('[data-again]'),
  failed: $('[data-card="failed"]'),
  failedCount: $('[data-failed-count]'),
  retry: $('[data-retry]'),
  floorCard: $('[data-card="floor"]'),
  floorStars: $('[data-floor-stars]'),
  floorTotal: $('[data-floor-total]'),
  rooms: $('[data-card="rooms"]'),
  roomGrid: $('[data-room-grid]'),
  floorRun: $('[data-floor-run]'),
  paused: $('[data-paused]'),
  mute: $('[data-mute]'),
};

// ---------------------------------------------------------------------------------------------
// Layout: the board keeps its 10 × 16 shape, between the ball counter and the bottom bar.

function layout() {
  vw = window.innerWidth;
  vh = window.innerHeight;
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(vw * dpr);
  canvas.height = Math.round(vh * dpr);
  const top = document.querySelector('.top').getBoundingClientRect().bottom + 30; // room for the ball counter
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
// Rooms open one by one: a room opens once the room before it is solved.

function bestStars(i) {
  const d = loadRoom(i);
  return d && d.best ? d.best.stars : -1; // -1: not solved yet
}

function unlocked(i) {
  return i === 0 || bestStars(i - 1) >= 0;
}

// The furthest room open: the first one not yet solved, or the last.
function furthest() {
  let i = 0;
  while (i < ROOMS.length - 1 && bestStars(i) >= 0) i++;
  return i;
}

function floorComplete() {
  return ROOMS.every((_, i) => bestStars(i) >= 0);
}

// The hash opens a room you've reached; a locked room, a bad hash or none opens the furthest one.
function roomFromHash() {
  const m = /^#1-([1-8])$/.exec(location.hash);
  const i = m ? +m[1] - 1 : -1;
  return i >= 0 && unlocked(i) ? i : furthest();
}

function openRoom(i) {
  G.paused = false;
  ui.paused.hidden = true;
  G.ri = i;
  G.room = ROOMS[i];
  const saved = loadRoom(i);
  G.layout = saved ? saved.layout.map((p) => ({ ...p })) : [];
  G.nextId = 1 + G.layout.reduce((m, p) => Math.max(m, p.id), 0);
  G.sel = null;
  G.drag = null;
  G.floor = null;
  hideCards();
  try {
    if (location.hash !== `#1-${i + 1}`) history.replaceState(null, '', `#1-${i + 1}`);
  } catch (e) {
    // a sandboxed page can refuse it
  }
  ui.roomNo.textContent = String(i + 1);
  ui.roomName.textContent = G.room.name;
  renderStars();
  startAttempt(); // a room opens running
}

function hideCards() {
  ui.done.hidden = true;
  ui.failed.hidden = true;
  ui.floorCard.hidden = true;
  ui.rooms.hidden = true;
}

function setMode(mode) {
  G.mode = mode;
  ui.bar.hidden = mode === 'done' || mode === 'floor';
  ui.balls.hidden = mode === 'floor';
  updateTurn();
  layout();
  if (ui.tray.childElementCount) renderTray();
}

function persist() {
  const old = loadRoom(G.ri);
  saveRoom(G.ri, { layout: G.layout.map(({ id, type, x, y, a }) => ({ id, type, x, y, a })), best: old ? old.best : null });
}

function starImgs(n, size) {
  let html = '';
  for (let s = 0; s < 3; s++) html += `<img src="img/${s < n ? 'star' : 'star_outline'}.png" alt="" width="${size}" height="${size}" />`;
  return html;
}

function renderStars() {
  const b = Math.max(0, bestStars(G.ri));
  ui.roomStars.innerHTML = starImgs(b, 15);
  ui.roomStars.setAttribute('aria-label', `Best: ${b} of 3 stars`);
}

// The ball counter: one mark per ball, waiting, falling, in an exit or lost, and the quota.
function renderBalls() {
  const att = G.att;
  if (!att) return;
  let html = '';
  for (let n = 0; n < att.total; n++) {
    const b = att.balls[n];
    const st = b ? b.state : 'wait';
    html += `<i class="b ${st}${n === att.quota - 1 ? ' q' : ''}"></i>`;
  }
  html += `<span class="count">${att.inCount}/${att.quota}</span>`;
  if (ui.balls.dataset.html !== html) {
    ui.balls.innerHTML = html;
    ui.balls.dataset.html = html;
    ui.balls.setAttribute('aria-label', `${att.inCount} of ${att.quota} balls in; ${att.total - att.dropped} still to drop`);
  }
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
    // In a room not yet solved, until a part is placed, the tray's part bobs: the screen says where to
    // start, with no words.
    const hint = !G.layout.length && !G.drag && bestStars(G.ri) < 0 && left[t] > 0 && t === G.room.tray[0];
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
  const can = G.mode !== 'floor' && G.mode !== 'done' && !!G.sel;
  ui.turnL.disabled = !can;
  ui.turnR.disabled = !can;
}

// A part placed from the keyboard goes to the first free spot near the board's middle.
function keyboardPlace(type) {
  if (trayLeft()[type] <= 0 || !editable()) return;
  for (let r = 0; r < 12; r++) {
    for (let a = 0; a < 8; a++) {
      const p = { id: G.nextId, type, x: snap(5 + Math.cos(a) * r * 0.5), y: snap(8 + Math.sin(a) * r * 0.5), a: 0 };
      if (!overlaps(G.room, p, G.layout)) {
        G.nextId++;
        G.layout.push(p);
        sendSet(p);
        select(p);
        play('place');
        afterEdit();
        return;
      }
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Attempts

function startAttempt() {
  const assist = assistFor(G.ri);
  G.layout0 = G.layout.map((p) => ({ ...p }));
  G.att = createAttempt(G.room, G.layout0, { assist });
  G.acc = 0;
  G.sinks = [];
  G.robot = { state: 'idle', t: 0 };
  hideCards();
  setMode('run');
  renderBalls();
}

// The hidden assist: from the 4th failed attempt in a room, the exits take a ball from 5% further
// away per failed attempt, up to 20%. It resets when the room is done and when the page reloads.
function assistFor(i) {
  return Math.min(0.2, Math.max(0, G.fails[i] - 3) * 0.05);
}

const editable = () => G.mode === 'run' || G.mode === 'failed';
const live = () => G.mode === 'run' && G.att && !G.att.result;

// An edit reaches the running attempt at its next step; between attempts it only changes the
// layout the next one starts from.
function sendSet(p) {
  if (live()) G.att.edit({ op: 'set', id: p.id, type: p.type, x: p.x, y: p.y, a: p.a });
}
function sendLift(p) {
  if (live()) G.att.edit({ op: 'lift', id: p.id });
}
function sendDel(p) {
  if (live()) G.att.edit({ op: 'del', id: p.id });
}

function turnTrundle() {
  if (!live()) return;
  G.att.edit({ op: 'turn' });
  G.robot = { state: 'turn', t: 0 };
  play('toggle');
}

function onEvent(e) {
  const att = G.att;
  if (e.type === 'hit') {
    const g = Math.max(0.12, Math.min(1, e.speed / 9));
    if (e.on === 'plank' || e.on === 'wedge') play('plank', { gain: g });
    else if (e.on === 'crate' || e.by === 'crate') play(e.by === 'crate' ? 'wood' : 'crate', { gain: g });
    else if (e.on === 'flap') play('metal', { gain: g, rate: 1.3 });
    else play('metal', { gain: g * 0.8 });
  } else if (e.type === 'drop') {
    play('kick', { gain: 0.55, rate: 1.2 });
    G.robot = { state: 'drop', t: 0 };
  } else if (e.type === 'star') {
    play('star', { rate: 1 + att.stars.size * 0.12 });
    const s = G.room.stars[e.i];
    burst(s.x, s.y, '#ffd400', 14);
  } else if (e.type === 'key') {
    play('key');
    setTimeout(() => play('unlock'), 220);
    burst(G.room.key.x, G.room.key.y, '#ffb400', 12);
  } else if (e.type === 'exit') {
    play('exit', { gain: 0.8, rate: 1 + att.inCount * 0.05 });
    G.sinks.push({ x: e.x, y: e.y, ex: e.ex, ey: e.ey, t: 0 });
    burst(e.ex, e.ey, '#ffffff', 10);
  } else if (e.type === 'lost') {
    play('pop', { gain: 0.7 });
    burst(Math.max(0.3, Math.min(W - 0.3, e.x)), Math.min(H - 0.3, e.y), 'rgba(255,255,255,0.9)', 8);
  }
}

function finishAttempt() {
  const att = G.att;
  renderBalls();
  if (att.result === 'won') {
    play('win');
    G.robot = { state: 'cheer', t: 0 };
    G.fails[G.ri] = 0;
    const old = loadRoom(G.ri);
    const stars = att.stars.size;
    let best = old && old.best;
    // The best attempt has the most stars, then the most balls in; a tie goes to the latest.
    if (!best || stars > best.stars || (stars === best.stars && att.inCount >= best.inCount)) {
      best = { stars, inCount: att.inCount, layout: G.layout0.map((p) => ({ ...p })), log: att.log.map((e) => ({ ...e })) };
    }
    const wasComplete = floorComplete();
    saveRoom(G.ri, { layout: G.layout.map(({ id, type, x, y, a }) => ({ id, type, x, y, a })), best });
    G.lastStars = stars;
    G.sel = null;
    setMode('done');
    renderStars();
    const nowComplete = floorComplete();
    setTimeout(() => {
      if (G.mode !== 'done') return;
      if (!wasComplete && nowComplete) startFloorRun();
      else showDone(stars, att.inCount, att.total);
    }, 1100);
  } else {
    G.fails[G.ri]++;
    play('miss', { gain: 0.7 });
    G.robot = { state: 'wince', t: 0 };
    ui.failedCount.textContent = `${att.inCount} of ${att.quota} in`;
    setMode('failed');
    ui.failed.hidden = false;
  }
}

function showDone(stars, inCount, total) {
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
  ui.doneCount.textContent = `${inCount} of ${total} balls in`;
  ui.next.textContent = nextRoom() === null ? 'Floor run' : 'Next';
  ui.done.hidden = false;
}

function nextRoom() {
  return G.ri < ROOMS.length - 1 ? G.ri + 1 : null;
}

// ---------------------------------------------------------------------------------------------
// The floor run: each room's best attempt, replayed in order three times faster than life, the
// camera moving down from room to room. It re-runs the logged attempt: exact on this browser.

const GAP = 3; // units between rooms: the pipe
const FLOOR_SPEED = 3;
const oy = (i) => i * (H + GAP);

function startFloorRun() {
  hideCards();
  const segs = ROOMS.map((room, i) => {
    const d = loadRoom(i);
    return d && d.best ? { room, i, best: d.best } : null;
  }).filter(Boolean);
  G.floor = { segs, si: 0, att: null, phase: 'pan', phaseT: 0.7, camY: viewH() / 2 - 0.5, end: false, log: 0 };
  G.floor.total = segs.reduce((n, s) => n + s.best.stars, 0);
  G.sel = null;
  G.att = null;
  G.sinks = [];
  setMode('floor');
  ui.roomNo.textContent = String(FLOOR.n);
  ui.roomName.textContent = FLOOR.name;
  ui.roomStars.innerHTML = '';
  play('floor', { gain: 0.8 });
}

const viewH = () => (vh - playTop - 16) / k;

function tickFloor(dt) {
  const F = G.floor;
  if (!F || F.end) return;
  const seg = F.segs[F.si];
  if (F.phase === 'pan') {
    F.phaseT -= dt;
    if (F.phaseT <= 0) {
      F.phase = 'play';
      F.att = createAttempt(seg.room, seg.best.layout.map((p) => ({ ...p })));
      F.log = 0;
      F.acc = 0;
    }
  } else if (F.phase === 'play') {
    const att = F.att;
    F.acc += dt * FLOOR_SPEED;
    let n = Math.min(24, Math.floor(F.acc / STEP + 1e-9));
    F.acc -= n * STEP;
    while (n-- > 0 && !att.result) {
      while (F.log < seg.best.log.length && seg.best.log[F.log].s === att.steps) {
        const { s, ...e } = seg.best.log[F.log++];
        void s;
        att.edit(e);
      }
      att.step();
      for (const e of att.events) {
        if (e.type === 'star') burst(seg.room.stars[e.i].x, seg.room.stars[e.i].y + oy(seg.i), '#ffd400', 10);
        if (e.type === 'exit') burst(e.ex, e.ey + oy(seg.i), '#ffffff', 8);
      }
      if (att.events.some((e) => e.type === 'star')) play('star', { gain: 0.6, rate: 1 + att.stars.size * 0.12 });
      if (att.events.some((e) => e.type === 'exit')) play('exit', { gain: 0.4 });
    }
    if (att.result) {
      seg.final = att;
      if (F.si < F.segs.length - 1) {
        F.si++;
        F.phase = 'pan';
        F.phaseT = 0.8;
      } else {
        F.phase = 'outro';
        F.phaseT = 1.6;
        play('win');
      }
    }
  } else if (F.phase === 'outro') {
    F.phaseT -= dt;
    if (F.phaseT <= 0) endFloor();
  }
  // the camera: the room playing, or floor 2's door at the end
  const target = F.phase === 'outro' ? oy(ROOMS.length) + 3 + viewH() * 0.3 : oy(F.segs[F.si].i) + H / 2;
  F.camY += (target - F.camY) * Math.min(1, dt * 3);
}

function endFloor() {
  const F = G.floor;
  F.end = true;
  F.phase = 'outro';
  F.si = F.segs.length - 1;
  F.camY = oy(ROOMS.length) + 3 + viewH() * 0.3;
  ui.floorStars.textContent = String(F.total);
  ui.floorTotal.textContent = String(ROOMS.length * 3);
  ui.floorCard.hidden = false;
}

// ---------------------------------------------------------------------------------------------
// The frame loop: the physics steps at a fixed 1/120 s whatever the display rate; a frame takes at
// most 8 steps, so after a stall the attempt slows down instead of jumping.

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
  if (live()) {
    G.acc += dt;
    let n = Math.floor(G.acc / STEP + 1e-9);
    if (n > 8) {
      n = 8;
      G.acc = 8 * STEP;
    }
    for (let s = 0; s < n; s++) {
      G.att.step();
      G.stepsTotal++;
      for (const e of G.att.events) onEvent(e);
      if (G.att.result) break;
    }
    G.acc -= n * STEP;
    renderBalls();
    if (G.att.result) finishAttempt();
  }
  if (G.mode === 'floor') tickFloor(dt);
  G.robot.t += dt;
  for (const s of G.sinks) s.t += dt;
  G.sinks = G.sinks.filter((s) => s.t < 0.4);
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
  const c = centroid(pts);
  const inset = (p) => ({ x: p.x + (c.x - p.x) * 0.18, y: p.y + (c.y - p.y) * 0.18 });
  if (pts.length === 4) {
    const top = [...pts].sort((a, b) => a.y - b.y).slice(0, 2);
    const a = inset(top[0]);
    const b = inset(top[1]);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.lineWidth = 0.06;
    ctx.strokeStyle = hi;
    ctx.stroke();
  }
  if (rivets) {
    ctx.fillStyle = edge;
    for (const p of pts) {
      const d = Math.hypot(c.x - p.x, c.y - p.y);
      const r = Math.min(0.22, d * 0.35) / d;
      ctx.beginPath();
      ctx.arc(p.x + (c.x - p.x) * r, p.y + (c.y - p.y) * r, 0.045, 0, Math.PI * 2);
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

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// A room at vertical offset y0 (units), with an attempt's state (att: may be null), the parts to
// draw and what the player is doing.
function drawRoom(room, att, parts, y0 = 0, opts = {}) {
  ctx.save();
  ctx.translate(0, y0);
  ctx.fillStyle = COL.frame;
  roundRect(-0.22, -0.22, W + 0.44, H + 0.44, 0.35);
  ctx.fill();
  ctx.save();
  roundRect(0, 0, W, H, 0.2);
  ctx.clip();
  ctx.fillStyle = boardPattern();
  ctx.fillRect(0, 0, W, H);
  // a soft shade toward the open floor, where balls fall out
  const g = ctx.createLinearGradient(0, H - 2, 0, H);
  g.addColorStop(0, 'rgba(60,30,10,0)');
  g.addColorStop(1, 'rgba(60,30,10,0.22)');
  ctx.fillStyle = g;
  ctx.fillRect(0, H - 2, W, 2);

  // the balls' trails: where this attempt's balls went
  if (att && opts.trails) {
    for (const b of att.balls) {
      const t = b.trail;
      ctx.fillStyle = b.state === 'in' ? 'rgba(170,255,200,0.55)' : 'rgba(255,255,255,0.45)';
      for (let i = 0; i < t.length; i += 6) {
        ctx.beginPath();
        ctx.arc(t[i], t[i + 1], 0.045, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // the exits: locked until the key is touched
  const keyed = att ? att.keyed : !room.key;
  const pulse = 1 + 0.05 * Math.sin(G.time * 3);
  for (const e of room.exits) drawImg(keyed ? IMG.hole_large_end : IMG.hole_large_end_locked, e.x, e.y, 1.25 * pulse, 1.25 * pulse);

  for (const b of room.fixed) {
    drawBlock(rectPoly(b), COL.yellow, COL.yellowEdge, COL.yellowHi);
    keyhole(b);
  }
  // Trundle's girder, with the hopper's chute under his track
  drawBlock(rectPoly(girderBox(room)), COL.yellow, COL.yellowEdge, COL.yellowHi);

  // stars and the key
  room.stars.forEach((s, i) => {
    if (att && att.stars.has(i)) return;
    const tw = 1 + 0.07 * Math.sin(G.time * 2.4 + i * 1.7);
    drawImg(IMG.star, s.x, s.y + Math.sin(G.time * 1.6 + i) * 0.05, 0.78 * tw, 0.78 * tw, Math.sin(G.time + i) * 0.12);
  });
  if (room.key && !keyed) drawImg(IMG.key, room.key.x, room.key.y + Math.sin(G.time * 2) * 0.06, 0.8, 0.75, -0.3);

  if (room.crate) {
    const c = att && att.crate ? { x: att.crate.position.x / S, y: att.crate.position.y / S, a: att.crate.angle } : { x: room.crate.x, y: room.crate.y, a: 0 };
    drawImg(IMG.crate, c.x, c.y, room.crate.w, room.crate.h, c.a);
  }

  for (const p of parts) drawPart(p, att, opts);

  if (room.flap) {
    const f = room.flap;
    const a = att && att.flap ? att.flap.angle : 0;
    drawBlock(rectPoly(flapBox(f, a)), COL.blue, COL.blueEdge, '#a9d6ff', false);
    ctx.fillStyle = '#e8eef5';
    ctx.strokeStyle = '#7d8a99';
    ctx.lineWidth = 0.05;
    ctx.beginPath();
    ctx.arc(f.x, f.y, 0.14, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  const tr = att ? att.trundle : { x: room.trundle.x, dir: room.trundle.dir || 1, speed: room.trundle.speed };
  drawRobot(room, tr, opts.robot || { state: 'idle', t: 0 }, opts.chevron);

  // the balls
  if (att) {
    for (const b of att.balls) {
      if (b.state !== 'live') continue;
      const x = b.body.position.x / S;
      const y = b.body.position.y / S;
      drawImg(IMG.ball_red_large, x, y, BALL_R * 2, BALL_R * 2, x / BALL_R);
    }
  }
  for (const s of opts.sinks || []) {
    const u = Math.min(1, s.t / 0.35);
    drawImg(IMG.ball_red_large, s.x + (s.ex - s.x) * u, s.y + (s.ey - s.y) * u, BALL_R * 2 * (1 - u * 0.8), BALL_R * 2 * (1 - u * 0.8));
  }
  ctx.restore(); // clip
  ctx.restore();
}

function drawPart(p, att, opts = {}) {
  let dx = 0;
  if (G.shake && G.shake.part === p) dx = Math.sin(G.shake.t * 60) * 0.12 * (1 - G.shake.t / 0.35);
  const pts = partPoly({ ...p, x: p.x + dx });
  const held = G.drag && G.drag.part === p;
  const bad = held && G.drag.bad;
  // a ghost: held, or let go on a ball and waiting for it to pass
  const sp = att && att.parts.get(p.id);
  const ghost = held || (sp && sp.ghost);
  ctx.save();
  if (ghost) ctx.globalAlpha = held ? 0.75 : 0.45 + 0.25 * Math.sin(G.time * 14);
  if (held) {
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

// Trundle on his girder: drives along it (his tracks turning), bobs as a ball drops from his
// hopper, cheers when the room is done, winces when an attempt fails. The chevron over him shows
// which way he's heading.
function drawRobot(room, tr, R, chevron) {
  const g = room.girder;
  const dir = tr.dir;
  let x = tr.x;
  let y = g.y;
  let im = tr.speed && Math.floor(G.time * 10) % 2 ? IMG.robot_blueDrive2 : IMG.robot_blueDrive1;
  const t = R.t;
  if (R.state === 'drop' && t < 0.3) y += Math.sin((t / 0.3) * Math.PI) * 0.08;
  else if (R.state === 'cheer') {
    im = IMG.robot_blueJump;
    y -= Math.abs(Math.sin(t * 7)) * 0.4 * Math.max(0, 1 - t / 1.6);
  } else if (R.state === 'wince') {
    im = t < 1.1 ? IMG.robot_blueHurt : im;
    if (t < 0.4) x += Math.sin(t * 50) * 0.05;
  } else if (R.state === 'turn' && t < 0.25) y -= Math.sin((t / 0.25) * Math.PI) * 0.15;
  const w = 1.3;
  const h = (w * 150) / 184;
  ctx.save();
  ctx.translate(x, y - h / 2);
  if (dir < 0) ctx.scale(-1, 1);
  if (ready(im)) ctx.drawImage(im, -w / 2, -h / 2, w, h);
  ctx.restore();
  if (chevron && tr.speed) {
    // which way he's heading: tap him to turn him around
    ctx.save();
    ctx.translate(x + dir * 0.95, y - h * 0.55);
    ctx.strokeStyle = 'rgba(255,253,248,0.95)';
    ctx.lineWidth = 0.1;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(-dir * 0.1, -0.16);
    ctx.lineTo(dir * 0.1, 0);
    ctx.lineTo(-dir * 0.1, 0.16);
    ctx.stroke();
    ctx.restore();
  }
}

function drawParticles() {
  for (const p of G.parts) {
    ctx.globalAlpha = Math.max(0, Math.min(1, p.life * 2.5));
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
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
  const parts = G.layout.slice();
  if (G.drag && G.drag.isNew) parts.push(G.drag.part);
  drawRoom(G.room, G.att, parts, 0, { trails: G.mode !== 'run', select: editable(), robot: G.robot, chevron: G.mode === 'run', sinks: G.sinks });
  drawParticles();
}

function drawFloor() {
  const F = G.floor;
  const camTop = F.camY - viewH() / 2;
  ctx.setTransform(dpr * k, 0, 0, dpr * k, dpr * bx, dpr * (playTop - camTop * k));
  for (const seg of F.segs) {
    const y0 = oy(seg.i);
    if (y0 > camTop + viewH() + 1 || y0 + H < camTop - 1) continue;
    const active = F.segs[F.si] === seg && F.phase === 'play';
    const att = active ? F.att : seg.final || null;
    const parts = active || seg.final ? [...(att ? att.parts.values() : [])].filter((p) => !p.held) : seg.best.layout;
    drawRoom(seg.room, att, parts, y0, { robot: { state: active ? 'drop' : 'idle', t: 1 } });
    ctx.fillStyle = 'rgba(16,40,70,0.35)';
    roundRect(W / 2 - 0.35, y0 + H + 0.3, 0.7, GAP - 0.6, 0.3);
    ctx.fill();
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
  if (F.phase === 'outro') {
    const room = { girder: { x1: W / 2 - 2.4, x2: W / 2 - 2.4, y: y2 + 4.6 } };
    drawRobot(room, { x: W / 2 - 2.4, dir: 1, speed: 0 }, { state: 'cheer', t: (G.time % 1.6) + 0.01 }, false);
  }
  ctx.setTransform(dpr * k, 0, 0, dpr * k, dpr * bx, dpr * (playTop - camTop * k));
  drawParticles();
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

// Trundle's hit area: at least 64 px across, around him on his girder.
function hitTrundle(pt) {
  const tr = G.att ? G.att.trundle : G.room.trundle;
  const r = Math.max(1, 32 / k);
  return Math.abs(pt.x - tr.x) < r && pt.y > G.room.girder.y - 1.3 - r / 2 && pt.y < G.room.girder.y + 0.6;
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
    if (G.floor && !G.floor.end) endFloor();
    return;
  }
  if (!editable()) return;
  const pt = toBoard(e.clientX, e.clientY);
  if (hitTrundle(pt) && G.room.trundle.speed) {
    turnTrundle();
    return;
  }
  const p = hitPart(pt);
  if (p) {
    activePointer = e.pointerId;
    select(p);
    G.drag = { part: p, isNew: false, px0: e.clientX, py0: e.clientY, orig: { x: p.x, y: p.y, a: p.a }, moved: false, bad: false };
    return;
  }
  select(null);
});

function trayDown(e, type) {
  if (activePointer !== null || G.paused || !editable()) return;
  if (trayLeft()[type] <= 0) return;
  e.preventDefault();
  activePointer = e.pointerId;
  const lift = e.pointerType === 'mouse' ? 0 : 64; // a finger never hides the part it carries
  const pt = toBoard(e.clientX, e.clientY - lift);
  const part = { id: G.nextId++, type, x: snap(pt.x), y: snap(pt.y), a: 0 };
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
    if (Math.hypot(e.clientX - D.px0, e.clientY - D.py0) > 6 && !D.moved) {
      D.moved = true;
      sendLift(p); // picked up: the balls pass through it until it's let go
    }
    if (!D.moved) return;
    p.x = clampX(snap(D.orig.x + (e.clientX - D.px0) / k));
    p.y = clampY(snap(D.orig.y + (e.clientY - D.py0) / k));
  }
  D.bad = overlaps(G.room, p, G.layout.filter((q) => q !== p));
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
  if (!D.isNew && !D.moved) return; // a tap: just selected it
  if (e.clientY > ui.bar.getBoundingClientRect().top) {
    // back to the tray
    if (!D.isNew) sendDel(p);
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
      sendSet(p);
      G.shake = { part: p, t: 0 };
    }
    afterEdit();
    return;
  }
  if (D.isNew) G.layout.push(p);
  sendSet(p);
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
  if (D && !D.isNew && D.moved) {
    Object.assign(D.part, D.orig);
    sendSet(D.part);
  }
  renderTray();
});

function afterEdit() {
  renderTray();
  updateTurn();
  persist();
}

function turn(deg) {
  const p = G.sel;
  if (!p || !editable()) return;
  const before = p.a;
  p.a = (((p.a + deg) % 360) + 360) % 360;
  if (overlaps(G.room, p, G.layout.filter((q) => q !== p))) {
    p.a = before;
    G.shake = { part: p, t: 0 };
    play('turn', { rate: 0.6, gain: 0.8 });
    return;
  }
  sendSet(p);
  play('turn');
  afterEdit();
}

function nudge(dx, dy) {
  const p = G.sel;
  if (!p || !editable()) return;
  const o = { x: p.x, y: p.y };
  p.x = clampX(p.x + dx);
  p.y = clampY(p.y + dy);
  if (overlaps(G.room, p, G.layout.filter((q) => q !== p))) {
    Object.assign(p, o);
    G.shake = { part: p, t: 0 };
    return;
  }
  sendSet(p);
  afterEdit();
}

function restart() {
  if (G.drag || G.mode === 'floor') return; // a drag in progress ends first
  startAttempt();
}

ui.turnL.addEventListener('click', () => turn(-15));
ui.turnR.addEventListener('click', () => turn(15));
ui.restart.addEventListener('click', restart);
ui.retry.addEventListener('click', restart);
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
      endFloor();
      e.preventDefault();
    }
    return;
  }
  const onButton = t instanceof HTMLButtonElement;
  if (e.key === ' ' && !onButton) {
    e.preventDefault();
    restart();
  } else if (e.key === 'q' || e.key === 'Q') turn(-15);
  else if (e.key === 'e' || e.key === 'E') turn(15);
  else if (e.key === 't' || e.key === 'T') turnTrundle();
  else if (e.key === 'n' || e.key === 'N') {
    if (G.layout.length) {
      const i = G.layout.indexOf(G.sel);
      select(G.layout[(i + 1) % G.layout.length]);
    }
  } else if ((e.key === 'Delete' || e.key === 'Backspace') && G.sel && editable()) {
    sendDel(G.sel);
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
ui.again.addEventListener('click', restart);
ui.next.addEventListener('click', () => {
  const n = nextRoom();
  if (n === null) startFloorRun();
  else openRoom(n);
});
$('[data-replay]').addEventListener('click', startFloorRun);
$('[data-floor-rooms]').addEventListener('click', showRooms);
$('[data-rooms]').addEventListener('click', () => (ui.rooms.hidden ? showRooms() : closeRooms()));
$('[data-close-rooms]').addEventListener('click', closeRooms);
ui.floorRun.addEventListener('click', startFloorRun);

// Closing the list puts back what it covered.
function closeRooms() {
  ui.rooms.hidden = true;
  ui.bar.hidden = G.mode === 'done' || G.mode === 'floor';
  if (G.mode === 'done') showDone(G.lastStars, G.att ? G.att.inCount : 0, G.room.balls);
  else if (G.mode === 'failed') ui.failed.hidden = false;
  else if (G.mode === 'floor' && G.floor && G.floor.end) ui.floorCard.hidden = false;
  if (G.paused && G.mode === 'run') ui.paused.hidden = false;
}

function showRooms() {
  // the attempt waits while the list is open
  if (G.mode === 'run' || (G.mode === 'floor' && G.floor && !G.floor.end)) {
    G.paused = true;
  }
  ui.roomGrid.innerHTML = '';
  ROOMS.forEach((room, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = i === G.ri ? 'current' : '';
    const s = bestStars(i);
    const open = unlocked(i);
    b.disabled = !open;
    b.innerHTML = open
      ? `<b>${i + 1}</b><span class="mini">${starImgs(Math.max(0, s), 16)}</span>`
      : `<b>${i + 1}</b><svg class="lock" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10.5" width="14" height="10" rx="2" /><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" fill="none" /></svg>`;
    b.setAttribute('aria-label', `Room ${i + 1}, ${room.name}: ${!open ? 'locked' : s < 0 ? 'not solved' : `${s} of 3 stars`}`);
    if (open) b.addEventListener('click', () => openRoom(i));
    ui.roomGrid.appendChild(b);
  });
  ui.floorRun.hidden = !floorComplete();
  ui.floorCard.hidden = true;
  ui.done.hidden = true;
  ui.failed.hidden = true;
  ui.paused.hidden = true;
  ui.rooms.hidden = false;
  ui.bar.hidden = true;
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
  return live() || (G.mode === 'floor' && G.floor && !G.floor.end);
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
  restart,
  turn,
  turnTrundle,
  showRooms,
  startFloorRun,
  endFloor,
  loadRoom,
  replay,
  view: () => ({ k, bx, by }),
  toScreen: (x, y) => ({ x: bx + x * k, y: by + y * k }),
  // Set the parts (tests): [{id, type, x, y, a}], then start a new attempt from them.
  setLayout(parts) {
    G.layout = parts.map((p) => ({ ...p }));
    G.nextId = 1 + G.layout.reduce((m, p) => Math.max(m, p.id), 0);
    G.sel = null;
    persist();
    renderTray();
    startAttempt();
  },
};
window.__trundle = api;

layout();
renderTray();
openRoom(roomFromHash());
requestAnimationFrame(frame);

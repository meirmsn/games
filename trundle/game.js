// Trundle: tap the green planks to flip them, and roll the robot's balls into the cup of their
// colour.
//
// sim.js runs the physics (one attempt at one room, deterministic, every tap logged with its
// step); this module draws, takes taps, keeps progress and plays the floor run. The page exposes
// window.__trundle for the tests: with __trundle.manual set, the page's frames only draw, and
// __trundle.frame(ms) advances the game the way one display frame of that length would.
import { mountShell } from '../shared/game-shell.js';
import { createAttempt, replay, rectPoly, plankBox, flapBox, girderBox, distToPoly, W, H, S, STEP, BALL_R } from './sim.js';
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
for (const n of ['background_brown', 'ball_red_large', 'ball_blue_large', 'hole_large_end', 'hole_large_end_locked', 'key', 'star', 'star_outline', 'robot_blueDrive1', 'robot_blueDrive2', 'robot_blueHurt', 'robot_blueJump', 'crate']) {
  IMG[n] = new Image();
  IMG[n].src = `img/${n}.png`;
}
const ready = (im) => im && im.complete && im.naturalWidth > 0;
const BALL_IMG = { r: 'ball_red_large', b: 'ball_blue_large' };
const CUP_COL = { r: '#ef4f5a', b: '#3d8ef0' };

// ---------------------------------------------------------------------------------------------
// Storage: one key per room, so one unreadable room never costs the others; every access guarded.

const KEY = (i) => `trundle-v3-room-${i + 1}`;
const memory = new Map(); // what's kept when localStorage is blocked: lasts until the page reloads

function loadRoom(i) {
  if (memory.has(i)) return memory.get(i);
  let data = null;
  try {
    const raw = localStorage.getItem(KEY(i));
    if (raw) {
      const d = JSON.parse(raw);
      const b = d && d.best;
      if (b && Number.isFinite(b.stars) && Array.isArray(b.log)) {
        data = { best: { stars: b.stars, log: b.log.filter((e) => e && Number.isInteger(e.s) && e.op === 'flip' && Number.isInteger(e.i)) } };
      }
    }
  } catch (e) {
    data = null; // unreadable: this room starts fresh
  }
  memory.set(i, data);
  return data;
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
  mode: 'run', // 'run' | 'failed' | 'done' | 'floor'
  att: null,
  acc: 0,
  fails: ROOMS.map(() => 0),
  paused: false,
  time: 0,
  robot: { state: 'idle', t: 0 },
  sinks: [], // balls dropping into a cup: {x, y, ex, ey, color, t}
  parts: [], // particles
  hint: 0, // seconds left of the planks' first pulse
  floor: null,
  stepsTotal: 0,
  lastStars: 0,
};

let k = 30; // CSS px per unit
let bx = 0;
let by = 0;
let vw = 0;
let vh = 0;
let dpr = 1;
let playTop = 60;

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const $ = (s) => document.querySelector(s);
const ui = {
  roomNo: $('[data-room-no]'),
  roomName: $('[data-room-name]'),
  roomStars: $('[data-room-stars]'),
  done: $('[data-card="done"]'),
  doneTitle: $('[data-done-title]'),
  doneStars: $('[data-done-stars]'),
  doneWhy: $('[data-done-why]'),
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
// Layout: the board keeps its 10 × 16 shape, under the top bar.

function layout() {
  vw = window.innerWidth;
  vh = window.innerHeight;
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(vw * dpr);
  canvas.height = Math.round(vh * dpr);
  const top = document.querySelector('.top').getBoundingClientRect().bottom + 10;
  const bottom = vh - 16;
  playTop = top;
  const availW = vw - 32;
  const availH = Math.max(100, bottom - top);
  k = Math.min(availW / W, availH / H);
  bx = Math.round((vw - W * k) / 2);
  by = Math.round(top + (availH - H * k) / 2);
}

const toBoard = (px, py) => ({ x: (px - bx) / k, y: (py - by) / k });

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
  G.hint = bestStars(i) < 0 ? 3 : 0; // a room not yet solved: the planks pulse to say "tap me"
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
  layout();
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

// ---------------------------------------------------------------------------------------------
// Attempts

function startAttempt() {
  G.att = createAttempt(G.room, { assist: assistFor(G.ri) });
  G.acc = 0;
  G.sinks = [];
  G.robot = { state: 'idle', t: 0 };
  hideCards();
  setMode('run');
}

// The hidden assist: from the 4th failed attempt in a room, the cups are 5% wider per failed
// attempt, up to 20%. It resets when the room is done and when the page reloads.
function assistFor(i) {
  return Math.min(0.2, Math.max(0, G.fails[i] - 3) * 0.05);
}

const live = () => G.mode === 'run' && G.att && !G.att.result;

// A tap on a plank flips it, at the attempt's next step.
function flip(i) {
  if (!live() || !G.room.planks[i]) return;
  G.att.edit({ op: 'flip', i });
  G.hint = 0;
}

function onEvent(e) {
  const att = G.att;
  if (e.type === 'hit') {
    const g = Math.max(0.12, Math.min(1, e.speed / 9));
    if (e.on === 'plank') play('plank', { gain: g });
    else if (e.on === 'crate' || e.by === 'crate') play(e.by === 'crate' ? 'wood' : 'crate', { gain: g });
    else if (e.on === 'flap') play('metal', { gain: g, rate: 1.3 });
    else play('metal', { gain: g * 0.8 });
  } else if (e.type === 'flip') {
    play('turn', { rate: 0.9 });
  } else if (e.type === 'flick') {
    play('toggle', { rate: 1.3 });
  } else if (e.type === 'drop') {
    play('kick', { gain: 0.5, rate: 1.2 });
    G.robot = { state: 'drop', t: 0 };
  } else if (e.type === 'star') {
    play('star', { rate: 1.2 });
    burst(G.room.star.x, G.room.star.y, '#ffd400', 16);
  } else if (e.type === 'key') {
    play('key');
    setTimeout(() => play('unlock'), 220);
    burst(G.room.key.x, G.room.key.y, '#ffb400', 12);
  } else if (e.type === 'cup') {
    const c = G.room.cups[e.cup];
    play('exit', { gain: 0.8, rate: 1 + att.filled[e.cup] * 0.06 });
    G.sinks.push({ x: e.x, y: e.y, ex: c.x, ey: c.y, color: c.color, t: 0 });
    burst(c.x, c.y, '#ffffff', 10);
    G.robot = { state: 'hop', t: 0 };
  } else if (e.type === 'lost') {
    play('pop', { gain: 0.7 });
    burst(Math.max(0.3, Math.min(W - 0.3, e.x)), Math.min(H - 0.3, e.y), 'rgba(255,255,255,0.9)', 8);
    if (e.why === 'wrong') G.robot = { state: 'wince', t: 0 };
  }
}

function finishAttempt() {
  const att = G.att;
  if (att.result === 'won') {
    play('win');
    G.robot = { state: 'cheer', t: 0 };
    G.fails[G.ri] = 0;
    const stars = att.starCount();
    const old = loadRoom(G.ri);
    let best = old && old.best;
    // The best attempt has the most stars; a tie goes to the latest.
    if (!best || stars >= best.stars) best = { stars, log: att.log.map((e) => ({ s: e.s, op: e.op, i: e.i })) };
    const wasComplete = floorComplete();
    saveRoom(G.ri, { best });
    G.lastStars = stars;
    setMode('done');
    renderStars();
    const nowComplete = floorComplete();
    setTimeout(() => {
      if (G.mode !== 'done') return;
      if (!wasComplete && nowComplete) startFloorRun();
      else showDone(att);
    }, 1100);
  } else {
    G.fails[G.ri]++;
    play('miss', { gain: 0.7 });
    G.robot = { state: 'wince', t: 0 };
    const need = att.need();
    ui.failedCount.textContent = `${att.inCount()} of ${need} in`;
    setMode('failed');
    ui.failed.hidden = false;
  }
}

function showDone(att) {
  const stars = att.starCount();
  ui.doneTitle.textContent = stars === 3 ? 'All three stars!' : 'Room done!';
  ui.doneStars.innerHTML = '';
  // The three stars and what each is for: the room, at most one ball lost, the room's star.
  const why = ['Done', att.lostCount <= 1 ? 'No balls wasted' : `${att.lostCount} balls lost`, att.gotStar ? 'Star caught' : 'Star missed'];
  const got = [true, att.lostCount <= 1, att.gotStar];
  for (let s = 0; s < 3; s++) {
    const im = document.createElement('img');
    im.src = `img/${got[s] ? 'star' : 'star_outline'}.png`;
    im.alt = '';
    if (got[s]) im.className = 'got';
    ui.doneStars.appendChild(im);
  }
  ui.doneStars.setAttribute('aria-label', `${stars} of 3 stars`);
  ui.doneWhy.textContent = why.slice(1).join(' · ');
  ui.next.textContent = nextRoom() === null ? 'Floor run' : 'Next';
  ui.done.hidden = false;
}

function nextRoom() {
  return G.ri < ROOMS.length - 1 ? G.ri + 1 : null;
}

// ---------------------------------------------------------------------------------------------
// The floor run: each room's best attempt, replayed in order twice as fast as life, the camera
// moving down from room to room. It re-runs the logged taps: exact on this browser.

const GAP = 3; // units between rooms: the pipe
const FLOOR_SPEED = 2;
const oy = (i) => i * (H + GAP);
const viewH = () => (vh - playTop - 16) / k;

function startFloorRun() {
  hideCards();
  const segs = ROOMS.map((room, i) => {
    const d = loadRoom(i);
    return d && d.best ? { room, i, best: d.best } : null;
  }).filter(Boolean);
  G.floor = { segs, si: 0, att: null, phase: 'pan', phaseT: 0.7, camY: viewH() / 2 - 0.5, end: false, li: 0 };
  G.floor.total = segs.reduce((n, s) => n + s.best.stars, 0);
  G.att = null;
  G.sinks = [];
  setMode('floor');
  ui.roomNo.textContent = String(FLOOR.n);
  ui.roomName.textContent = FLOOR.name;
  ui.roomStars.innerHTML = '';
  play('floor', { gain: 0.8 });
}

function tickFloor(dt) {
  const F = G.floor;
  if (!F || F.end) return;
  const seg = F.segs[F.si];
  if (F.phase === 'pan') {
    F.phaseT -= dt;
    if (F.phaseT <= 0) {
      F.phase = 'play';
      F.att = createAttempt(seg.room);
      F.li = 0;
      F.acc = 0;
    }
  } else if (F.phase === 'play') {
    const att = F.att;
    F.acc += dt * FLOOR_SPEED;
    let n = Math.min(16, Math.floor(F.acc / STEP + 1e-9));
    F.acc -= n * STEP;
    while (n-- > 0 && !att.result) {
      while (F.li < seg.best.log.length && seg.best.log[F.li].s === att.steps) {
        const { s, ...e } = seg.best.log[F.li++];
        void s;
        att.edit(e);
      }
      att.step();
      for (const e of att.events) {
        if (e.type === 'star') {
          burst(seg.room.star.x, seg.room.star.y + oy(seg.i), '#ffd400', 10);
          play('star', { gain: 0.6, rate: 1.2 });
        }
        if (e.type === 'cup') {
          const c = seg.room.cups[e.cup];
          burst(c.x, c.y + oy(seg.i), '#ffffff', 8);
          play('exit', { gain: 0.4 });
        }
        if (e.type === 'flip') play('turn', { gain: 0.5 });
      }
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
  if (G.hint > 0) G.hint = Math.max(0, G.hint - dt);
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
    if (G.att.result) finishAttempt();
  }
  if (G.mode === 'floor') tickFloor(dt);
  G.robot.t += dt;
  for (const s of G.sinks) s.t += dt;
  G.sinks = G.sinks.filter((s) => s.t < 0.4);
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
  const top = [...pts].sort((a, b) => a.y - b.y).slice(0, 2);
  const a = inset(top[0]);
  const b = inset(top[1]);
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.lineWidth = 0.06;
  ctx.strokeStyle = hi;
  ctx.stroke();
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

function drawImg(im, x, y, w, h, rot = 0) {
  if (!ready(im)) return;
  ctx.save();
  ctx.translate(x, y);
  if (rot) ctx.rotate(rot);
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

// A cup: a hole ringed in its colour, with a slot for each ball it needs, filled as balls go in.
function drawCup(c, filled, keyed) {
  const locked = c.locked && !keyed;
  ctx.fillStyle = 'rgba(60,30,10,0.18)';
  roundRect(c.x - 0.85, c.y - 0.35, 1.7, 1.05, 0.2);
  ctx.fill();
  drawImg(locked ? IMG.hole_large_end_locked : IMG.hole_large_end, c.x, c.y, 1.3, 1.3);
  ctx.strokeStyle = CUP_COL[c.color];
  ctx.lineWidth = 0.14;
  ctx.beginPath();
  ctx.arc(c.x, c.y, 0.66, 0, Math.PI * 2);
  ctx.stroke();
  // the slots, under the cup
  const gap = 0.42;
  for (let i = 0; i < c.need; i++) {
    const x = c.x + (i - (c.need - 1) / 2) * gap;
    const y = c.y + 1.0;
    ctx.beginPath();
    ctx.arc(x, y, 0.15, 0, Math.PI * 2);
    if (i < filled) {
      ctx.fillStyle = CUP_COL[c.color];
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 0.05;
    ctx.stroke();
  }
}

// A room at vertical offset y0 (units), with an attempt's state (att: may be null).
function drawRoom(room, att, y0 = 0, opts = {}) {
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
  const g = ctx.createLinearGradient(0, H - 2, 0, H);
  g.addColorStop(0, 'rgba(60,30,10,0)');
  g.addColorStop(1, 'rgba(60,30,10,0.22)');
  ctx.fillStyle = g;
  ctx.fillRect(0, H - 2, W, 2);

  // the balls' trails, once an attempt is over
  if (att && opts.trails) {
    for (const b of att.balls) {
      const t = b.trail;
      ctx.fillStyle = b.state === 'in' ? 'rgba(170,255,200,0.6)' : 'rgba(255,255,255,0.5)';
      for (let i = 0; i < t.length; i += 6) {
        ctx.beginPath();
        ctx.arc(t[i], t[i + 1], 0.045, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  const keyed = att ? att.keyed : !room.key;
  room.cups.forEach((c, i) => drawCup(c, att ? att.filled[i] : 0, keyed));
  for (const b of room.fixed) drawBlock(rectPoly(b), COL.yellow, COL.yellowEdge, COL.yellowHi);
  drawBlock(rectPoly(girderBox(room)), COL.yellow, COL.yellowEdge, COL.yellowHi);

  if (room.star && !(att && att.gotStar)) {
    const tw = 1 + 0.07 * Math.sin(G.time * 2.4);
    drawImg(IMG.star, room.star.x, room.star.y + Math.sin(G.time * 1.6) * 0.05, 0.8 * tw, 0.8 * tw, Math.sin(G.time) * 0.12);
  }
  if (room.key && !keyed) drawImg(IMG.key, room.key.x, room.key.y + Math.sin(G.time * 2) * 0.06, 0.8, 0.75, -0.3);

  if (room.crate) {
    const c = att && att.crate ? { x: att.crate.position.x / S, y: att.crate.position.y / S, a: att.crate.angle } : { x: room.crate.x, y: room.crate.y, a: 0 };
    drawImg(IMG.crate, c.x, c.y, room.crate.w, room.crate.h, c.a);
  }

  // the planks: green, on a bolt, with a faint ghost of where a tap sends them
  room.planks.forEach((p, i) => {
    const pk = att ? att.planks[i] : { state: p.up ? 1 : 0, angle: p.up ? p.a1 : p.a0 };
    const other = pk.state ? p.a0 : p.a1;
    const pulse = G.hint > 0 ? 0.5 + 0.5 * Math.sin(G.time * 8) : 0;
    ctx.save();
    ctx.globalAlpha = 0.28 + pulse * 0.35;
    pathPoly(rectPoly(plankBox(p, other)));
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.setLineDash([0.16, 0.12]);
    ctx.lineWidth = 0.06;
    ctx.strokeStyle = COL.greenEdge;
    ctx.stroke();
    ctx.restore();
    drawBlock(rectPoly(plankBox(p, pk.angle)), COL.green, COL.greenEdge, COL.greenHi, false);
    // the bolt it turns on
    ctx.fillStyle = '#e8eef5';
    ctx.strokeStyle = '#6b7684';
    ctx.lineWidth = 0.05;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 0.16 + pulse * 0.05, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  });

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

  drawRobot(room, att, opts.robot || { state: 'idle', t: 0 });

  if (att) {
    for (const b of att.balls) {
      if (b.state !== 'live') continue;
      const x = b.body.position.x / S;
      const y = b.body.position.y / S;
      drawImg(IMG[BALL_IMG[b.color]], x, y, BALL_R * 2, BALL_R * 2, x / BALL_R);
    }
  }
  for (const s of opts.sinks || []) {
    const u = Math.min(1, s.t / 0.35);
    const r = BALL_R * 2 * (1 - u * 0.8);
    drawImg(IMG[BALL_IMG[s.color]], s.x + (s.ex - s.x) * u, s.y + (s.ey - s.y) * u, r, r);
  }
  ctx.restore(); // clip
  ctx.restore();
}

// Trundle on his girder, with the balls still to drop in a row beside him, the next one nearest. He bobs as a ball drops, hops when one lands in a cup, cheers when the room is done and
// winces at a loss.
function drawRobot(room, att, R) {
  const g = room.girder;
  const tr = att ? att.trundle : { x: room.trundle.x, dir: room.trundle.dir || 1, speed: room.trundle.speed };
  const dir = tr.dir;
  let x = tr.x;
  let y = g.y;
  let im = tr.speed && Math.floor(G.time * 10) % 2 ? IMG.robot_blueDrive2 : IMG.robot_blueDrive1;
  const t = R.t;
  if (R.state === 'drop' && t < 0.3) y += Math.sin((t / 0.3) * Math.PI) * 0.08;
  else if (R.state === 'hop' && t < 0.35) y -= Math.sin((t / 0.35) * Math.PI) * 0.2;
  else if (R.state === 'cheer') {
    im = IMG.robot_blueJump;
    y -= Math.abs(Math.sin(t * 7)) * 0.4 * Math.max(0, 1 - t / 1.6);
  } else if (R.state === 'wince') {
    im = t < 0.9 ? IMG.robot_blueHurt : im;
    if (t < 0.4) x += Math.sin(t * 50) * 0.05;
  }
  const w = 1.3;
  const h = (w * 150) / 184;
  ctx.save();
  ctx.translate(x, y - h / 2);
  if (dir < 0) ctx.scale(-1, 1);
  if (ready(im)) ctx.drawImage(im, -w / 2, -h / 2, w, h);
  ctx.restore();
  // the hopper: the balls still to come wait in a row beside him, the next one nearest
  const seq = att ? att.seq.slice(att.dropped) : room.balls;
  const r = 0.2;
  const side = x < W / 2 ? 1 : -1; // toward the side with room for them
  for (let i = 0; i < seq.length; i++) {
    const bxp = x + side * (0.95 + i * r * 2.1);
    drawImg(IMG[BALL_IMG[seq[i]]], bxp, g.y - r, r * 2, r * 2);
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
  drawRoom(G.room, G.att, 0, { trails: G.mode !== 'run', robot: G.robot, sinks: G.sinks });
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
    drawRoom(seg.room, active ? F.att : seg.final || null, y0, {});
    ctx.fillStyle = 'rgba(16,40,70,0.35)';
    roundRect(W / 2 - 0.35, y0 + H + 0.3, 0.7, GAP - 0.6, 0.3);
    ctx.fill();
  }
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
    const room = { girder: { x1: W / 2 - 2.4, x2: W / 2 - 2.4, y: y2 + 4.6 }, trundle: { x: W / 2 - 2.4, dir: 1, speed: 0 }, balls: '' };
    drawRobot(room, null, { state: 'cheer', t: (G.time % 1.6) + 0.01 });
  }
  drawParticles();
}

// ---------------------------------------------------------------------------------------------
// Input: a tap flips the nearest plank (within 40 px). Keys 1–3 flip the planks too; R retries.

function plankAt(pt) {
  const tol = Math.max(0.6, 40 / k);
  let best = -1;
  let bd = Infinity;
  G.room.planks.forEach((p, i) => {
    const pk = G.att.planks[i];
    const d = distToPoly(pt, rectPoly(plankBox(p, pk.angle)));
    if (d < bd) (bd = d), (best = i);
  });
  return bd <= tol ? best : -1;
}

canvas.addEventListener('pointerdown', (e) => {
  if (G.paused) return;
  if (G.mode === 'floor') {
    if (G.floor && !G.floor.end) endFloor(); // a tap skips to the end of the floor run
    return;
  }
  if (!live()) return;
  const i = plankAt(toBoard(e.clientX, e.clientY));
  if (i >= 0) flip(i);
});

function restart() {
  if (G.mode === 'floor') return;
  startAttempt();
}

window.addEventListener('keydown', (e) => {
  if (G.paused && (e.key === ' ' || e.key === 'Enter')) {
    resume();
    e.preventDefault();
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
  if (/^[1-9]$/.test(e.key)) flip(+e.key - 1);
  else if (e.key === 'r' || e.key === 'R') restart();
});

ui.again.addEventListener('click', restart);
ui.retry.addEventListener('click', restart);
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
  if (G.mode === 'done') showDone(G.att);
  else if (G.mode === 'failed') ui.failed.hidden = false;
  else if (G.mode === 'floor' && G.floor && G.floor.end) ui.floorCard.hidden = false;
  if (G.paused) ui.paused.hidden = false;
}

function showRooms() {
  // the attempt waits while the list is open
  if (G.mode === 'run' || (G.mode === 'floor' && G.floor && !G.floor.end)) G.paused = true;
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
}

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
  flip,
  showRooms,
  startFloorRun,
  endFloor,
  loadRoom,
  replay,
  view: () => ({ k, bx, by }),
  toScreen: (x, y) => ({ x: bx + x * k, y: by + y * k }),
};
window.__trundle = api;

layout();
openRoom(roomFromHash());
requestAnimationFrame(frame);

// Island Hop: the page. Draws the archipelago that rules.js runs, feeds it the stick (a drag
// anywhere, or the arrow keys and WASD), and keeps the cards, the HUD, the sounds and the small
// memory (each mission's best time, medal and splits, and the missions opened).
import { mountShell } from '../shared/game-shell.js';
import { createCamera, sortByDepth } from '../shared/iso.js';
import { isEdgeStart } from '../shared/safe-zone.js';
import { ATLAS } from './atlas.js';
import { ROWS, MOORED, BUOYS, SEA_ROCKS, TRAFFIC, LEISURE, YOUR_BOATS } from './map.js';
import {
  RULES,
  MISSIONS,
  MAP_VERSION,
  WORLD,
  iso,
  SIZE,
  createMission,
  step as rulesStep,
  youAt,
  youBoat,
  isLand,
  isRoad,
  isShallow,
  isBuilding,
  trafficAt,
  leisureAt,
  medalFor,
  medalTimes,
  runPilot,
  createPilot,
  pilotStick,
  canTick,
  stickToGrid,
  gridToStick,
  walkDir,
} from './rules.js';

// --- Page, shell and sound -----------------------------------------------------------------------
const canvas = document.getElementById('world');
const ctx = canvas.getContext('2d');
const $ = (sel) => document.querySelector(sel);
const screens = { start: $('[data-screen="start"]'), pause: $('[data-screen="pause"]'), finish: $('[data-screen="finish"]') };
const hud = $('[data-hud]');
const muteBtn = $('[data-mute]');
const mapBtn = $('[data-map]');
const restartBtn = $('[data-restart]');

const SOUNDS = {};
for (const n of ['step', 'door', 'creak', 'bump', 'chime', 'jingle', 'nope', 'sea', 'land', 'engine', 'motor']) SOUNDS[n] = `sounds/${n}.mp3`;
let world = null; // the rules' state
let paused = false;
const { sound } = mountShell({ sounds: SOUNDS, unsaved: () => !!world && world.started && world.phase === 'play' });
const played = []; // the last sounds played, for tests
function play(name, opts) {
  played.push(name);
  if (played.length > 80) played.shift();
  sound.play(name, opts);
}
function syncMute() {
  muteBtn.setAttribute('aria-pressed', String(sound.muted));
  muteBtn.setAttribute('aria-label', sound.muted ? 'Unmute' : 'Mute');
}
muteBtn.addEventListener('click', () => {
  sound.muted = !sound.muted;
  syncMute();
  syncMusic(0);
});
syncMute();
const loops = { sea: null, land: null, engine: null, motor: null };
function loopOn(name, on, gain = 1) {
  on = on && !sound.muted; // muted, no loop runs at all; unmuted, the next frame starts it again
  if (on && !loops[name]) {
    loops[name] = sound.loop(name, { gain });
    played.push(`loop:${name}`); // for tests: which loops started
  }
  if (!on && loops[name]) {
    loops[name]();
    loops[name] = null;
  }
}

// The music: the owner's two tracks, the sea's afloat and the island's ashore (owner, 2026-11-11:
// "We're missing background music in here"), crossfading as you dock or set off. Each plays from
// an <audio> element fed a copy fetched as the page loads, so it's cached for offline play and
// never decoded whole. It starts on the first tap or key (a browser plays nothing before one), and
// stops while muted, paused or hidden, carrying on where it was.
const MUSIC_VOLUME = 0.3;
const MUSIC_FADE = 0.8; // seconds for a full crossfade
const music = {};
for (const name of ['sea', 'land']) {
  const el = new Audio();
  el.loop = true;
  el.preload = 'auto';
  el.volume = 0;
  const url = `sounds/music-${name}.mp3`;
  fetch(url)
    .then((r) => (r.ok ? r.blob() : null))
    .then((b) => {
      el.src = b ? URL.createObjectURL(b) : url;
    })
    .catch(() => {
      el.src = url;
    });
  music[name] = { el, level: 0, on: false };
}
let musicAllowed = false; // a tap or key has let it play
function syncMusic(dt) {
  const go = musicAllowed && !sound.muted && !paused && !document.hidden && !!world;
  const want = world && world.mode === 'boat' ? 'sea' : 'land';
  for (const [name, m] of Object.entries(music)) {
    const target = go && name === want ? 1 : 0;
    const step = dt / MUSIC_FADE;
    m.level = go ? Math.min(1, Math.max(0, target > m.level ? Math.min(target, m.level + step) : Math.max(target, m.level - step))) : 0;
    m.el.volume = m.level * MUSIC_VOLUME;
    const on = go && m.level > 0;
    if (on && !m.on && m.el.src) {
      played.push(`music:${name}`); // for tests: which track started
      const p = m.el.play();
      if (p && p.catch) p.catch(() => {});
      m.on = true;
    } else if (!on && m.on) {
      m.el.pause();
      m.on = false;
    }
  }
}
for (const type of ['pointerdown', 'keydown'])
  addEventListener(
    type,
    () => {
      musicAllowed = true;
      syncMusic(0);
    },
    { capture: true }
  );

const atlas = new Image();
atlas.src = 'img/atlas.png';

// --- Small memory: per mission, the best time, its medal and splits ----------------------------------------
const SAVE_SLOT = 'island-hop.v1';
function readMem() {
  const blank = { map: MAP_VERSION, open: 0, best: {} };
  try {
    const m = JSON.parse(localStorage.getItem(SAVE_SLOT) || 'null');
    if (!m) return blank;
    // Runs saved on another version of the map are thrown away; the missions opened stay open.
    if (m.map !== MAP_VERSION) return { ...blank, open: m.open | 0 };
    return { ...blank, ...m };
  } catch {
    return blank;
  }
}
let mem = readMem();
function saveMem() {
  try {
    localStorage.setItem(SAVE_SLOT, JSON.stringify(mem));
  } catch {}
}

// --- View ----------------------------------------------------------------------------------------------
const LAND_Z = 16; // land blocks stand 16 px above the water
const JETTY_Z = 9;
const TILE = iso.tileW;
let W = 0;
let H = 0;
let dpr = 1;
const cam = createCamera({ zoom: 0.3, minZoom: 0.02, maxZoom: 4 });
const ACROSS = { boat: 14, car: 11, walk: 7 };
let across = ACROSS.boat; // tiles across the screen, eased
let lead = { x: 0, y: 0 };
function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  cam.resize(W, H);
}
window.addEventListener('resize', resize);
resize();

// The whole archipelago in the iso plane, for the map view and the finish.
const MAP_BOUNDS = (() => {
  const pts = [iso.toScreen(0, 0), iso.toScreen(SIZE, 0), iso.toScreen(0, SIZE), iso.toScreen(SIZE, SIZE)];
  // Trim the open sea at the corners: the islands lie on the diagonal.
  const isl = [iso.toScreen(0, 0), iso.toScreen(SIZE, SIZE), iso.toScreen(2, 21), iso.toScreen(46, 0), iso.toScreen(37, 58), iso.toScreen(58, 30)];
  void pts;
  return {
    minX: Math.min(...isl.map((p) => p.x)) - 40,
    maxX: Math.max(...isl.map((p) => p.x)) + 40,
    minY: Math.min(...isl.map((p) => p.y)) - 40,
    maxY: Math.max(...isl.map((p) => p.y)) + 40,
  };
})();

function sprite(name, sx, sy, scale = 1, alpha = 1) {
  const a = ATLAS[name];
  if (!a || !atlas.complete) return;
  const [ax0, ay0, w, h, fx, fy] = a;
  const prev = ctx.globalAlpha;
  if (alpha !== 1) ctx.globalAlpha = prev * alpha;
  ctx.drawImage(atlas, ax0, ay0, w, h, sx - w * fx * scale, sy - h * fy * scale, w * scale, h * scale);
  ctx.globalAlpha = prev;
}
function spriteBox(name, sx, sy, scale = 1) {
  const a = ATLAS[name];
  if (!a) return null;
  const [, , w, h, fx, fy] = a;
  return { x0: sx - w * fx * scale, y0: sy - h * fy * scale, x1: sx + w * (1 - fx) * scale, y1: sy + h * (1 - fy) * scale };
}
// Kenney's 8 frames start up-left on screen and go clockwise; iso.facing starts at screen right.
const frameOf = (gx, gy) => (iso.facing(gx, gy) + 3) % 8;

// --- What each tile draws as ---------------------------------------------------------------------------------
const hash = (x, y) => ((x * 73856093) ^ (y * 19349663)) >>> 0;
const BUILDINGS = Object.keys(ATLAS).filter((n) => n.startsWith('bld'));
const STOP_BUILDING = { A: 'bld018', B: 'bld002', C: 'bld025', D: 'bld030', E: 'bld021', F: 'bld004', G: 'bld019', I: 'bld020', J: 'bld033', K: 'bld034', L: 'bld041', N: 'bld029', V: 'bld022', W: 'bld036', X: 'bld040', Y: 'bld037', Z: 'bld026' };
const TREES = ['tree062', 'tree065', 'tree068', 'tree070', 'tree084', 'tree088', 'tree139', 'tree148', 'tree159', 'tree163'];
const PALMS = ['tree061', 'tree167'];
const ch = (x, y) => (x < 0 || y < 0 || x >= SIZE || y >= SIZE ? '~' : ROWS[y][x]);
function roadMask(x, y) {
  let m = 0;
  if (isRoad(ch(x, y - 1))) m |= 1;
  if (isRoad(ch(x + 1, y))) m |= 2;
  if (isRoad(ch(x, y + 1))) m |= 4;
  if (isRoad(ch(x - 1, y))) m |= 8;
  return m;
}
const SEA = 'rgb(156, 212, 226)'; // the top of Kenney's water block
const smallIsland = (x, y) => (x < 10 && y > 15) || (x > 32 && y < 21) || (x > 38 && y > 45);
function groundSprite(x, y) {
  const c = ROWS[y][x];
  if (c === '#') return 'road' + roadMask(x, y);
  if (c === 'P' || c === 'c') return 'paving';
  if (c === 'o') return 'paving';
  if (c === '*') return 'fountain';
  if (c === ':') return 'sand';
  if (isBuilding(c)) return null;
  return 'grass';
}
function buildingSprite(x, y) {
  const c = ROWS[y][x];
  return STOP_BUILDING[c] || BUILDINGS[hash(x, y) % BUILDINGS.length];
}
function treeSprite(x, y) {
  return smallIsland(x, y) || ROWS[y][x] === ':' ? PALMS[hash(x, y) % 2] : TREES[hash(x, y) % TREES.length];
}

// --- Input: one finger is the stick; the keys too ----------------------------------------------------------------
const STICK_R = 56; // px of drag for a full stick
let pointer = null; // { id, x0, y0, x, y }
let keyStick = { x: 0, y: 0 };
const keys = new Set();
// Afloat, the stick turns to the nearest of the 8 grid directions, as on foot, so the boat sails
// along the grid's lines (and its picture, drawn at those 8 headings, points where it goes) (owner,
// 2026-11-11: "on the boat, there seems to be an offset ... it has to be moving with the grid").
function stick() {
  const s = rawStick();
  if (!world || world.mode !== 'boat') return s;
  const g = stickToGrid(s);
  if (!g.len) return s;
  const d = walkDir(g);
  return gridToStick(d.x, d.y, g.len);
}
function rawStick() {
  if (pointer) {
    const dx = pointer.x - pointer.x0;
    const dy = pointer.y - pointer.y0;
    const len = Math.hypot(dx, dy);
    if (len < 6) return { x: 0, y: 0 };
    const k = Math.min(1, len / STICK_R) / len;
    return { x: dx * k, y: dy * k };
  }
  return keyStick;
}
canvas.addEventListener('pointerdown', (e) => {
  if (pointer) return; // a second finger is ignored
  if (!world || world.phase !== 'play' || paused) return;
  if (isEdgeStart(e)) return; // the phone's edge gestures start there (shared/safe-zone.js)
  pointer = { id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, t0: performance.now() };
  canvas.setPointerCapture?.(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  if (!pointer || e.pointerId !== pointer.id) return;
  pointer.x = e.clientX;
  pointer.y = e.clientY;
});
// A tap (a short press that hardly moves) while driving gets you out of the car.
let getOut = false;
function lift(e) {
  if (!pointer || e.pointerId !== pointer.id) return;
  const tap = performance.now() - pointer.t0 < 300 && Math.hypot(pointer.x - pointer.x0, pointer.y - pointer.y0) < 10;
  if (tap && e.type === 'pointerup' && world && world.mode === 'car' && !world.trans) getOut = true;
  pointer = null;
}
canvas.addEventListener('pointerup', lift);
canvas.addEventListener('pointercancel', lift);
const KEYMAP = { ArrowUp: [0, -1], KeyW: [0, -1], ArrowDown: [0, 1], KeyS: [0, 1], ArrowLeft: [-1, 0], KeyA: [-1, 0], ArrowRight: [1, 0], KeyD: [1, 0] };
function syncKeys() {
  let x = 0;
  let y = 0;
  for (const k of keys) {
    x += KEYMAP[k][0];
    y += KEYMAP[k][1];
  }
  const len = Math.hypot(x, y);
  keyStick = len ? { x: x / len, y: y / len } : { x: 0, y: 0 };
}
window.addEventListener('keydown', (e) => {
  if ((e.code === 'Space' || e.code === 'Enter') && world && world.mode === 'car' && !world.trans && !e.target.closest?.('button')) {
    e.preventDefault();
    getOut = true;
    return;
  }
  if (!KEYMAP[e.code]) return;
  e.preventDefault();
  keys.add(e.code);
  syncKeys();
});
window.addEventListener('keyup', (e) => {
  if (!KEYMAP[e.code]) return;
  keys.delete(e.code);
  syncKeys();
});
window.addEventListener('blur', () => {
  keys.clear();
  syncKeys();
  pointer = null;
});

// --- Missions: the card, start, restart, finish ----------------------------------------------------------------
let missionIndex = 0;
const ITEMS = { fish: '🐟', cake: '🎂', coconut: '🥥', lamp: '🏮' };
const iconOf = (st) => (st.gives ? ITEMS[st.gives] : WORLD.stops[st.at].icon);
const fmt = (t) => {
  const s = Math.max(0, t);
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return `${m}:${r < 10 ? '0' : ''}${r.toFixed(1)}`;
};
const fmtClock = (t) => {
  const s = Math.floor(Math.max(0, t));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
const MEDAL = { gold: '🥇', silver: '🥈', bronze: '🥉' };

function stopItem(st, cls) {
  const li = document.createElement('li');
  li.textContent = iconOf(st);
  li.title = WORLD.stops[st.at].name;
  if (st.needs) {
    li.classList.add('then');
    const n = document.createElement('span');
    n.className = 'needs';
    n.textContent = ITEMS[st.needs];
    li.appendChild(n);
  }
  if (cls) li.classList.add(cls);
  return li;
}
function show(name) {
  for (const [k, el] of Object.entries(screens)) el.hidden = k !== name;
}
function showCard(i) {
  missionIndex = Math.max(0, Math.min(mem.open, MISSIONS.length - 1, i | 0));
  const hash = `#m=${missionIndex + 1}`;
  if (location.hash !== hash) history.replaceState(null, '', hash);
  const m = MISSIONS[missionIndex];
  world = createMission(missionIndex, { phase: 'card' });
  $('[data-mission-num]').textContent = `Mission ${missionIndex + 1}`;
  $('[data-mission-name]').textContent = m.name;
  const list = $('[data-card-stops]');
  list.replaceChildren(...m.stops.map((st) => stopItem(st)));
  const best = mem.best[missionIndex];
  $('[data-card-best]').textContent = best ? `Best ${fmt(best.time)} ${best.medal ? MEDAL[best.medal] : ''}` : '';
  $('[data-prev]').disabled = missionIndex === 0;
  $('[data-next]').disabled = missionIndex >= Math.min(mem.open, MISSIONS.length - 1);
  hud.hidden = true;
  mapBtn.hidden = true;
  restartBtn.hidden = true;
  show('start');
  finishView = null;
  snapCamera();
}
let pilot = null; // tests and the demo can let the autopilot drive
// The goal, big and clear, when the mission hands you control.
let bannerT = 0;
function showBanner() {
  const el = $('[data-banner]');
  el.hidden = false;
  el.classList.remove('show');
  void el.offsetWidth;
  el.classList.add('show');
  bannerT = 2.6;
}
function start(i, { fly = true } = {}) {
  missionIndex = i;
  world = createMission(i, { phase: fly ? 'fly' : 'play' });
  paused = false;
  pointer = null;
  finishView = null;
  show(null);
  hud.hidden = false;
  mapBtn.hidden = false;
  restartBtn.hidden = false;
  renderHud();
  snapCamera();
  $('[data-banner]').hidden = true;
  bannerT = 0;
  if (!fly) showBanner();
}
let finishView = null; // { route, gold } polylines drawn over the map at the finish
function finish() {
  const i = world.mission;
  const time = world.clock;
  const medal = medalFor(i, time);
  const prev = mem.best[i];
  const better = !prev || time < prev.time;
  if (better) mem.best[i] = { time, medal, splits: world.ticked.map(([, c]) => Math.round(c * 100) / 100) };
  mem.open = Math.max(mem.open, Math.min(MISSIONS.length - 1, i + 1));
  mem.map = MAP_VERSION;
  saveMem();
  play('jingle');
  loopOn('engine', false);
  loopOn('motor', false);
  loopOn('land', false);
  const best = mem.best[i];
  $('[data-medal]').textContent = medal ? MEDAL[medal] : '🏁';
  $('[data-medal]').setAttribute('aria-label', medal ? `${medal} medal` : 'No medal');
  $('[data-time]').textContent = fmt(time);
  const pars = medalTimes(i);
  $('[data-pars]').replaceChildren(
    ...['gold', 'silver', 'bronze'].map((k) => {
      const li = document.createElement('li');
      li.textContent = `${MEDAL[k]} ${fmt(pars[k])}`;
      if (medal === k) li.classList.add('got');
      return li;
    })
  );
  $('[data-best]').textContent = better && prev ? `New best! Was ${fmt(prev.time)}` : `Best ${fmt(best.time)}`;
  $('[data-next-mission]').hidden = i >= MISSIONS.length - 1;
  hud.hidden = true;
  mapBtn.hidden = true;
  restartBtn.hidden = true;
  show('finish');
  // The gold route, flown by the autopilot, beside yours.
  const goldRun = runPilot(i, MISSIONS[i].gold, { fly: false });
  // First the camera follows your route from the start, drawing it as it goes, beside the gold route;
  // then it pulls back to the whole map with both (owner, 2026-11-12: "it's, you know, almost
  // impossible to see. So maybe what you can do is that while you're showing the score, just move
  // the camera ... tracking from the beginning, the path"). About five times the run's speed, 4–9 s.
  const route = world.trail.slice();
  finishView = { route, gold: goldRun.trail, t: 0, dur: Math.min(REPLAY_MAX, Math.max(REPLAY_MIN, (route.length * RULES.trailEvery) / 5)) };
}
const REPLAY_MIN = 4;
const REPLAY_MAX = 9;
const REPLAY_ACROSS = 16; // tiles across the screen while the camera follows the route
// Where along your route the replay is: the point, and how many of the route's points are behind it.
function replayHead() {
  const r = finishView.route;
  if (r.length < 2) return null;
  const f = Math.min(1, finishView.t / finishView.dur) * (r.length - 1);
  const i = Math.min(r.length - 2, Math.floor(f));
  const k = f - i;
  return { x: r[i][0] + (r[i + 1][0] - r[i][0]) * k, y: r[i][1] + (r[i + 1][1] - r[i][1]) * k, n: i + 1 };
}
const replaying = () => finishView && finishView.t < finishView.dur && finishView.route.length >= 2;
$('[data-start]').addEventListener('click', () => start(missionIndex));
$('[data-prev]').addEventListener('click', () => showCard(missionIndex - 1));
$('[data-next]').addEventListener('click', () => showCard(missionIndex + 1));
$('[data-next-mission]').addEventListener('click', () => showCard(missionIndex + 1));
$('[data-again]').addEventListener('click', () => start(missionIndex, { fly: false }));
restartBtn.addEventListener('click', () => start(missionIndex, { fly: false }));
$('[data-restart-pause]').addEventListener('click', () => start(missionIndex, { fly: false }));
$('[data-resume]').addEventListener('click', () => {
  paused = false;
  show(null);
  last = performance.now();
});

// Hiding the page pauses the mission, its clock and a fly-over; a tap on Go on resumes it.
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && document.visibilityState !== 'hidden') return;
  sound.suspend();
  if (world && (world.phase === 'fly' || world.phase === 'play') && !paused) {
    paused = true;
    pointer = null;
    keys.clear();
    syncKeys();
    show('pause');
  }
  syncMusic(0); // no frames come while hidden: stop the music now
});

// The map button shows the whole archipelago while held; the clock keeps running.
let mapHeld = false;
function holdMap(on) {
  mapHeld = on;
  mapBtn.classList.toggle('held', on);
}
mapBtn.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  holdMap(true);
});
for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) mapBtn.addEventListener(ev, () => holdMap(false));
mapBtn.addEventListener('keydown', (e) => {
  if (e.key === ' ' || e.key === 'Enter') holdMap(true);
});
mapBtn.addEventListener('keyup', () => holdMap(false));

// --- HUD ------------------------------------------------------------------------------------------------
let splitTimer = 0;
function renderHud() {
  const list = $('[data-stops]');
  list.replaceChildren(...world.stops.map((st) => stopItem(st, st.done ? 'done' : null)));
  $('[data-carrying]').replaceChildren(
    ...world.carrying.map((it) => {
      const sp = document.createElement('span');
      sp.textContent = ITEMS[it];
      sp.dataset.item = it;
      return sp;
    })
  );
}
function showSplit(k, clock) {
  const best = mem.best[world.mission];
  const el = $('[data-split]');
  if (!best || best.splits[k] === undefined) {
    el.hidden = true;
    return;
  }
  const d = clock - best.splits[k];
  el.textContent = `${d < 0 ? '−' : '+'}${Math.abs(d).toFixed(1)}`;
  el.className = `split ${d <= 0 ? 'ahead' : 'behind'}`;
  el.hidden = false;
  splitTimer = 3;
}
let pulse = {}; // stop index -> time left pulsing (an ordered stop walked onto too soon)
function handleEvents() {
  for (const e of world.events.splice(0)) {
    if (e.type === 'dock') play('creak');
    else if (e.type === 'board') play('creak', { rate: 1.15 });
    else if (e.type === 'door') play('door');
    else if (e.type === 'bump') play('bump');
    else if (e.type === 'step') play('step', { rate: 0.9 + Math.random() * 0.2, gain: 0.5 });
    else if (e.type === 'stop') {
      play('chime');
      renderHud();
      showSplit(world.ticked.length - 1, e.clock);
    } else if (e.type === 'locked') {
      if (!pulse[e.stop]) play('nope');
      pulse[e.stop] = 1.5;
      const li = $('[data-stops]').children[e.stop];
      li?.classList.remove('flash');
      void li?.offsetWidth;
      li?.classList.add('flash');
      const need = world.stops.find((st) => st.gives === e.needs);
      const needLi = need && $('[data-stops]').children[world.stops.indexOf(need)];
      needLi?.classList.remove('flash');
      void needLi?.offsetWidth;
      needLi?.classList.add('flash');
    } else if (e.type === 'finish') finish();
  }
}

// --- Camera -----------------------------------------------------------------------------------------------
function youScreen() {
  const p = youAt(world);
  const z = world.mode === 'boat' ? 0 : LAND_Z;
  return iso.toScreen(p.x, p.y, z);
}
function wantZoom() {
  return W / (across * TILE);
}
function snapCamera() {
  across = ACROSS[world.mode] || ACROSS.boat;
  cam.zoom = wantZoom();
  lead = { x: 0, y: 0 };
  const p = youScreen();
  cam.lookAt({ x: p.x, y: p.y + (0.15 * H) / cam.zoom });
}
let viewTilesAcross = ACROSS.boat; // what the camera shows now, for tests
function updateCamera(dt) {
  if (finishView) finishView.t += dt;
  if (replaying() && !mapHeld) {
    // The replay: the camera follows the head of your route, in the space above the card.
    const top = 8;
    const bottom = Math.max(top + 120, screens.finish.getBoundingClientRect().top - 8);
    const z = W / (REPLAY_ACROSS * TILE);
    const k = 1 - Math.exp(-dt / 0.12);
    cam.zoom += (z - cam.zoom) * k;
    const h = replayHead();
    const p = iso.toScreen(h.x, h.y, LAND_Z / 2);
    cam.follow({ x: p.x, y: p.y + (H / 2 - (top + bottom) / 2) / z }, finishView.t < dt * 1.5 ? 1 : k);
    viewTilesAcross = W / (cam.zoom * TILE);
    return;
  }
  if (finishView || mapHeld) {
    // The whole archipelago; at the finish, in the space above the card.
    const top = mapHeld ? 64 : 8;
    const bottom = finishView ? Math.max(top + 120, screens.finish.getBoundingClientRect().top - 8) : H - 8;
    const avail = bottom - top;
    const z = Math.min(W / (MAP_BOUNDS.maxX - MAP_BOUNDS.minX), avail / (MAP_BOUNDS.maxY - MAP_BOUNDS.minY)) * 0.96;
    const k = 1 - Math.exp(-dt / 0.12);
    cam.zoom += (z - cam.zoom) * k;
    const cy = (MAP_BOUNDS.minY + MAP_BOUNDS.maxY) / 2 + (H / 2 - (top + bottom) / 2) / z;
    cam.follow({ x: (MAP_BOUNDS.minX + MAP_BOUNDS.maxX) / 2, y: cy }, k);
    viewTilesAcross = W / (cam.zoom * TILE);
    return;
  }
  // The fly-over: over every stop in turn, then back to the boat.
  if (world.phase === 'fly') {
    const stops = world.stops.map((st) => WORLD.stops[st.at]);
    const f = world.fly / RULES.flyover;
    const legs = stops.length + 1;
    const pos = Math.min(legs - 0.001, f * legs);
    const a = pos < 1 ? youScreen() : iso.toScreen(stops[Math.floor(pos) - 1].x + 0.5, stops[Math.floor(pos) - 1].y + 0.5, LAND_Z);
    const bIdx = Math.floor(pos);
    const b = bIdx < stops.length ? iso.toScreen(stops[bIdx].x + 0.5, stops[bIdx].y + 0.5, LAND_Z) : youScreen();
    const t = pos - Math.floor(pos);
    const e = t * t * (3 - 2 * t);
    const target = { x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e };
    const z = W / (20 * TILE);
    const k = 1 - Math.exp(-dt / 0.15);
    cam.zoom += (z - cam.zoom) * k;
    cam.follow(target, k);
    viewTilesAcross = W / (cam.zoom * TILE);
    return;
  }
  const goal = ACROSS[world.mode] || ACROSS.boat;
  across += (goal - across) * (1 - Math.exp(-dt / 0.17)); // eased over about 0.5 s
  const z = wantZoom();
  cam.zoom += (z - cam.zoom) * (1 - Math.exp(-dt / 0.12));
  // Lead a quarter of the view in the direction of travel.
  const p = youAt(world);
  let vx = 0;
  let vy = 0;
  if (world.mode === 'boat') {
    const b = youBoat(world);
    vx = Math.cos(b.h) * b.v;
    vy = Math.sin(b.h) * b.v;
  } else if (prevPos) {
    vx = (p.x - prevPos.x) / Math.max(dt, 1e-3);
    vy = (p.y - prevPos.y) / Math.max(dt, 1e-3);
  }
  prevPos = { x: p.x, y: p.y };
  const sv = { x: (vx - vy) * (TILE / 2), y: (vx + vy) * (TILE / 4) };
  const sl = Math.hypot(sv.x, sv.y);
  const want = sl > 1 ? { x: (sv.x / sl) * 0.25 * (W / cam.zoom), y: (sv.y / sl) * 0.25 * (H / cam.zoom) } : { x: 0, y: 0 };
  const lk = 1 - Math.exp(-dt / 0.6);
  lead.x += (want.x - lead.x) * lk;
  lead.y += (want.y - lead.y) * lk;
  const s = youScreen();
  // The thumb is low: you sit 15% above the centre; the lead never pushes you under the HUD or off
  // the sides (you stay within 35%–75% of the height and 20%–80% of the width).
  const offY = Math.max(-0.25 * H, Math.min(0.15 * H, lead.y * cam.zoom + 0.15 * H)) / cam.zoom;
  const offX = Math.max(-0.3 * W, Math.min(0.3 * W, lead.x * cam.zoom)) / cam.zoom;
  cam.follow({ x: s.x + offX, y: s.y + offY }, 1 - Math.exp(-dt / 0.12));
  viewTilesAcross = W / (cam.zoom * TILE);
}
let prevPos = null;

// --- Drawing -------------------------------------------------------------------------------------------------
let clock = 0; // animation time
const PERSON_H = 30; // iso px: about a third of a tile tall
function drawPerson(x, y, z) {
  const p = iso.toScreen(x, y, z);
  peopleDrawn++;
  ctx.save();
  // The bright ring under them.
  ctx.strokeStyle = '#fff36b';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(p.x, p.y, 15, 7.5, 0, 0, Math.PI * 2);
  ctx.stroke();
  const bob = world.mode === 'walk' ? Math.abs(Math.sin(clock * 10)) * 1.5 : 0;
  ctx.fillStyle = '#ff5e9a';
  ctx.beginPath();
  ctx.roundRect(p.x - 7, p.y - PERSON_H + 11 - bob, 14, 19, 5);
  ctx.fill();
  ctx.fillStyle = '#ffd8b0';
  ctx.beginPath();
  ctx.arc(p.x, p.y - PERSON_H + 5 - bob, 7, 0, Math.PI * 2);
  ctx.fill();
  // Pickups ride above the head.
  if (world.carrying.length) {
    ctx.font = '14px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(world.carrying.map((c) => ITEMS[c]).join(''), p.x, p.y - PERSON_H - 4 - bob);
  }
  ctx.restore();
}
function drawJetty(x, y) {
  const c = iso.toScreen(x + 0.5, y + 0.5, JETTY_Z);
  // Planks across a narrow deck along the jetty's line, on posts.
  const along = ROWS[y][x - 1] === '=' || ROWS[y][x + 1] === '=' || isLand(ch(x - 1, y)) || isLand(ch(x + 1, y)) ? 'x' : 'y';
  const half = 0.5;
  const w = 0.32;
  const corner = (u, v) => iso.toScreen(x + 0.5 + (along === 'x' ? u : v), y + 0.5 + (along === 'x' ? v : u), JETTY_Z);
  ctx.fillStyle = '#6b4a2b';
  for (const [u, v] of [[-0.4, -w], [-0.4, w], [0.4, -w], [0.4, w]]) {
    const p = corner(u, v);
    ctx.fillRect(p.x - 2, p.y, 4, 12);
  }
  ctx.fillStyle = '#c99a62';
  ctx.beginPath();
  const q = [corner(-half, -w), corner(half, -w), corner(half, w), corner(-half, w)];
  ctx.moveTo(q[0].x, q[0].y);
  for (const p of q.slice(1)) ctx.lineTo(p.x, p.y);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(90,60,30,0.55)';
  ctx.lineWidth = 1;
  for (let k = -0.375; k < 0.5; k += 0.125) {
    const a = corner(k, -w);
    const b = corner(k, w);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  void c;
}
function drawFootbridge(x, y) {
  // A low wooden footbridge along y, with rails.
  const corner = (u, v, z) => iso.toScreen(x + 0.5 + v, y + 0.5 + u, z);
  ctx.fillStyle = '#b5834f';
  ctx.beginPath();
  const q = [corner(-0.5, -0.36, JETTY_Z), corner(0.5, -0.36, JETTY_Z), corner(0.5, 0.36, JETTY_Z), corner(-0.5, 0.36, JETTY_Z)];
  ctx.moveTo(q[0].x, q[0].y);
  for (const p of q.slice(1)) ctx.lineTo(p.x, p.y);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#7a5531';
  ctx.lineWidth = 2;
  for (const v of [-0.36, 0.36]) {
    const a = corner(-0.5, v, JETTY_Z + 9);
    const b = corner(0.5, v, JETTY_Z + 9);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
}
function diamond(x, y, z, fill) {
  const a = iso.toScreen(x, y, z);
  const b = iso.toScreen(x + 1, y, z);
  const c = iso.toScreen(x + 1, y + 1, z);
  const d = iso.toScreen(x, y + 1, z);
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.lineTo(c.x, c.y);
  ctx.lineTo(d.x, d.y);
  ctx.closePath();
  ctx.fill();
}
const drawn = new Set(); // sprite names drawn this frame, for tests
let peopleDrawn = 0; // people drawn this frame, for tests: you, and never a ghost
const drawOrder = []; // for tests: buildings, your boats and (when asked) the ground, in drawing order
let recordGround = false;
function spr(name, sx, sy, scale, alpha) {
  drawn.add(name);
  sprite(name, sx, sy, scale, alpha);
}
// Boats are drawn at the atlas's scale: the motorboat about 1.5 tiles long.
function drawBoat(craft, x, y, h, alpha = 1) {
  const f = frameOf(Math.cos(h), Math.sin(h));
  const p = iso.toScreen(x, y, 0);
  spr(`craft${craft}_${f}`, p.x, p.y + 4, 1, alpha);
}

function draw() {
  drawn.clear();
  peopleDrawn = 0;
  drawOrder.length = 0;
  arrowsNow = [];
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = SEA;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(...cam.transform(dpr));
  const r = cam.tileRange(iso, 1, 200);
  const x0 = Math.max(0, r.x0);
  const y0 = Math.max(0, r.y0);
  const x1 = Math.min(SIZE - 1, r.x1);
  const y1 = Math.min(SIZE - 1, r.y1);
  const coarse = cam.zoom < 0.12; // the map view: skip the small things
  // 1. The sea: Kenney's water block on every water tile, the shallows lighter, a few glints.
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const c = ROWS[y][x];
      if (isLand(c) && c !== '=') continue;
      const p = iso.toScreen(x + 0.5, y + 0.5, 0);
      // Open sea is the water block's own colour; in the shallows the blocks show, sandier.
      if (isShallow(c)) {
        spr('water', p.x, p.y);
        diamond(x, y, 0.5, 'rgba(255, 236, 170, 0.35)');
      }
      if (!coarse && (hash(x, y) + Math.floor(clock * 0.7)) % 23 === 0) {
        const g = (clock * 0.7) % 1;
        ctx.strokeStyle = `rgba(255,255,255,${0.55 * Math.sin(g * Math.PI)})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(p.x - 14, p.y - 2);
        ctx.quadraticCurveTo(p.x, p.y - 6, p.x + 14, p.y - 2);
        ctx.stroke();
      }
    }
  // 2. Jetties and the footbridge: drawn in code from planks (no pack has a jetty).
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const c = ROWS[y][x];
      if (c === '=') drawJetty(x, y);
      else if (c === 'f') drawFootbridge(x, y);
    }
  // 3. Everything that stands, back to front: land blocks, buildings, trees, boats, cars, you.
  const items = [];
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const c = ROWS[y][x];
      if (!isLand(c)) continue;
      const p = iso.toScreen(x + 0.5, y + 0.5, LAND_Z);
      const depth = iso.depth(x + 0.5, y + 0.5);
      if (isBuilding(c)) {
        const name = buildingSprite(x, y);
        items.push({ depth, stand: true, building: true, tag: `building:${x},${y}`, box: spriteBox(name, p.x, p.y), draw: (a) => spr(name, p.x, p.y, 1, a) });
        continue;
      }
      const g = groundSprite(x, y);
      const drawGround = () => {
        spr(g, p.x, p.y);
        if (c === 'm') diamondMat(x, y);
      };
      items.push({ depth, ground: true, x, y, draw: drawGround });
      if (c === 'T' && !coarse) {
        const t = treeSprite(x, y);
        items.push({ depth: depth + 0.01, stand: true, building: true, box: spriteBox(t, p.x, p.y), draw: (a) => spr(t, p.x, p.y, 1, a) });
      }
    }
  for (const m of MOORED) items.push({ sea: m, depth: iso.depth(m.x, m.y), draw: () => drawBoat(m.craft, m.x, m.y, frameHeading(m.frame)) });
  for (const b of BUOYS) {
    const bob = Math.sin(clock * 2 + b.x) * 1.5;
    items.push({ sea: b, depth: iso.depth(b.x, b.y), draw: () => spr('craft27_1', iso.toScreen(b.x, b.y).x, iso.toScreen(b.x, b.y).y + 4 + bob) });
  }
  for (const rk of SEA_ROCKS) items.push({ sea: rk, depth: iso.depth(rk.x, rk.y), draw: () => spr('rock' + rk.rock, iso.toScreen(rk.x, rk.y).x, iso.toScreen(rk.x, rk.y).y + 6) });
  for (const [i, l] of LEISURE.entries()) {
    const t = leisureAt(i, world.tt);
    items.push({ sea: t, depth: iso.depth(t.x, t.y), draw: () => drawBoat(l.craft, t.x, t.y, t.h) });
  }
  for (const id of world.traffic) {
    const t = trafficAt(id, world.tt);
    items.push({ sea: t, depth: iso.depth(t.x, t.y), draw: () => drawBoat(TRAFFIC[id].craft, t.x, t.y, t.h) });
  }
  const tr = world.trans;
  for (const b of world.boats) {
    items.push({ sea: b, tag: `boat:${b.kind}`, depth: iso.depth(b.x, b.y), draw: () => drawBoat(YOUR_BOATS[b.kind].craft, b.x, b.y, b.h) });
  }
  for (const c of world.cars) {
    const p = iso.toScreen(c.x, c.y, LAND_Z);
    const kind = c.kind;
    const f = frameOf(c.dir.x, c.dir.y);
    items.push({ depth: iso.depth(c.x, c.y) + 0.002, stand: true, draw: () => spr(`${kind}${f}`, p.x, p.y + 3) });
  }
  let personDepth = null;
  let personBox = null;
  const inCar = world.mode === 'car' && !(tr && tr.kind === 'carOut');
  const inBoat = world.mode === 'boat' && !(tr && tr.kind === 'board');
  if (world.phase !== 'card' && ((!inCar && !inBoat) || (tr && (tr.kind === 'carIn' || tr.kind === 'board')))) {
    const p = world.person;
    const onJetty = ROWS[Math.floor(p.y)]?.[Math.floor(p.x)] === '=' || ROWS[Math.floor(p.y)]?.[Math.floor(p.x)] === 'f';
    const z = onJetty ? JETTY_Z : LAND_Z;
    personDepth = iso.depth(p.x, p.y) + 0.003;
    const sp = iso.toScreen(p.x, p.y, z);
    personBox = { x: sp.x, y: sp.y - PERSON_H / 2 };
    items.push({ depth: personDepth, stand: true, draw: () => drawPerson(p.x, p.y, z) });
  }
  // Two passes. First the land's ground, back to front, with whatever at sea is behind land (a land
  // tile near it that is not behind it on either axis), so a cliff in front hides a boat behind the
  // island. Then everything else back to front: buildings, trees, cars, you, and what's at sea in
  // the open, so a flat ground tile in front never cuts across the person's feet and a boat in front
  // of a building on the shore covers it. Nothing is drawn twice.
  const behindLand = (o) => {
    for (let dy = 0; dy <= 2; dy++)
      for (let dx = 0; dx <= 2; dx++) {
        const tx = Math.floor(o.x) + dx;
        const ty = Math.floor(o.y) + dy;
        if (isLand(ROWS[ty]?.[tx]) && tx >= o.x - 0.3 && ty >= o.y - 0.3) return true;
      }
    return false;
  };
  for (const it of items) if (it.sea) it.first = behindLand(it.sea);
  const order = [...sortByDepth(items.filter((it) => it.ground || it.first)), ...sortByDepth(items.filter((it) => !it.ground && !it.first))];
  for (const it of order) {
    // A building drawn after you whose shape covers you fades to 35%.
    let a = 1;
    if (it.building && personBox && it.depth > personDepth && it.box) {
      const b = it.box;
      if (personBox.x > b.x0 && personBox.x < b.x1 && personBox.y > b.y0 && personBox.y < b.y1) {
        a = 0.35;
        fadedNow = true;
      }
    }
    it.draw(a);
    if (it.tag) drawOrder.push(it.tag);
    else if (it.ground && recordGround) drawOrder.push(`ground:${it.x},${it.y}`);
  }
  // 4. The open stops' beams, over everything.
  if (world.phase !== 'card') drawBeams();
  // 5. The finish: your route and the gold route.
  if (finishView) {
    drawRoute(finishView.gold, '#f5c542', 7);
    if (replaying()) {
      const h = replayHead();
      drawRoute([...finishView.route.slice(0, h.n), [h.x, h.y]], '#ff5e9a', 4);
      const p = iso.toScreen(h.x, h.y, LAND_Z / 2);
      ctx.fillStyle = '#ff5e9a';
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 3 / cam.zoom;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 9 / cam.zoom, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else drawRoute(finishView.route, '#ff5e9a', 4);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (world.phase === 'play' && !finishView && !mapHeld) drawEdgeArrows();
  if (pointer && world.phase === 'play') drawStick();
}
let fadedNow = false;
const frameHeading = (f) => {
  // A Kenney frame back to a grid heading that draws as it.
  const ang = ((f + 5) % 8) * (Math.PI / 4); // screen angle, 0 = right
  const g = iso.screenDirToGrid(Math.cos(ang), Math.sin(ang));
  return Math.atan2(g.y, g.x);
};
function diamondMat(x, y) {
  const inset = 0.22;
  const a = iso.toScreen(x + inset, y + inset, LAND_Z);
  const b = iso.toScreen(x + 1 - inset, y + inset, LAND_Z);
  const c = iso.toScreen(x + 1 - inset, y + 1 - inset, LAND_Z);
  const d = iso.toScreen(x + inset, y + 1 - inset, LAND_Z);
  ctx.fillStyle = '#b8423a';
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.lineTo(c.x, c.y);
  ctx.lineTo(d.x, d.y);
  ctx.closePath();
  ctx.fill();
}
function drawBeams() {
  for (const [k, st] of world.stops.entries()) {
    if (st.done) continue;
    const s = WORLD.stops[st.at];
    const base = iso.toScreen(s.x + 0.5, s.y + 0.5, LAND_Z + 40);
    const height = 520;
    const pulsing = pulse[k] > 0;
    const open = canTick(world, st);
    const w = pulsing ? 34 + Math.sin(clock * 18) * 10 : 30;
    const grad = ctx.createLinearGradient(0, base.y, 0, base.y - height);
    grad.addColorStop(0, hexA(s.color, open ? 0.55 : 0.3));
    grad.addColorStop(1, hexA(s.color, 0));
    ctx.fillStyle = grad;
    ctx.fillRect(base.x - w / 2, base.y - height, w, height);
    // The icon on top, in a disc, sized to stay readable when zoomed out.
    const r = Math.max(22, 13 / cam.zoom);
    const top = { x: base.x, y: base.y - 70 - r };
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.beginPath();
    ctx.arc(top.x, top.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = Math.max(3, 2 / cam.zoom);
    ctx.strokeStyle = s.color;
    ctx.stroke();
    ctx.font = `${Math.round(r * 1.15)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#000';
    ctx.fillText(iconOf(st), top.x, top.y + r * 0.08);
  }
}
function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
}
function drawRoute(pts, color, width) {
  if (!pts || pts.length < 2) return;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width / cam.zoom;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.globalAlpha = 0.9;
  ctx.beginPath();
  pts.forEach(([x, y], i) => {
    const p = iso.toScreen(x, y, LAND_Z / 2);
    if (i) ctx.lineTo(p.x, p.y);
    else ctx.moveTo(p.x, p.y);
  });
  ctx.stroke();
  ctx.restore();
}
let arrowsNow = [];
function drawEdgeArrows() {
  arrowsNow = [];
  const you = youAt(world);
  const m = 34;
  const top = 200; // under the HUD and the buttons
  for (const [k, st] of world.stops.entries()) {
    if (st.done) continue;
    const s = WORLD.stops[st.at];
    const v = cam.toView(iso.toScreen(s.x + 0.5, s.y + 0.5, LAND_Z).x, iso.toScreen(s.x + 0.5, s.y + 0.5, LAND_Z).y);
    if (v.x > 0 && v.x < W && v.y > top - 40 && v.y < H) continue;
    const cx = W / 2;
    const cy = (top + H) / 2;
    const dx = v.x - cx;
    const dy = v.y - cy;
    const kx = (W / 2 - m) / Math.max(1e-6, Math.abs(dx));
    const ky = ((H - top) / 2 - m) / Math.max(1e-6, Math.abs(dy));
    const kk = Math.min(kx, ky);
    const ax = cx + dx * kk;
    const ay = cy + dy * kk;
    const ang = Math.atan2(dy, dx);
    ctx.save();
    ctx.translate(ax, ay);
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.beginPath();
    ctx.arc(0, 0, 20, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = s.color;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.rotate(ang);
    ctx.fillStyle = s.color;
    ctx.beginPath();
    ctx.moveTo(28, 0);
    ctx.lineTo(20, -7);
    ctx.lineTo(20, 7);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.font = '20px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#000';
    ctx.fillText(iconOf(st), ax, ay + 1);
    const d = Math.round(Math.hypot(s.mat.x + 0.5 - you.x, s.mat.y + 0.5 - you.y));
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 3;
    ctx.strokeText(`${d}`, ax, ay + 30);
    ctx.fillText(`${d}`, ax, ay + 30);
    arrowsNow.push({ stop: k, x: ax, y: ay, icon: iconOf(st), dist: d });
  }
}
function drawStick() {
  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(pointer.x0, pointer.y0, STICK_R, 0, Math.PI * 2);
  ctx.stroke();
  const s = rawStick(); // the knob sits under the finger
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(pointer.x0 + s.x * STICK_R, pointer.y0 + s.y * STICK_R, 18, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
// The loops: the boat's engine while it moves; in the car its engine, moving or not; afloat the sea,
// ashore the island's breeze.
function syncLoops() {
  const b = youBoat(world);
  const playing = world.phase === 'play' || world.phase === 'fly';
  loopOn('engine', world.phase === 'play' && world.mode === 'boat' && b.v > 0.3, 0.35);
  loopOn('motor', world.phase === 'play' && world.mode === 'car', 0.4);
  loopOn('sea', playing && world.mode === 'boat', 0.5);
  loopOn('land', playing && world.mode !== 'boat', 0.45);
}

// --- The loop -------------------------------------------------------------------------------------------------
let last = performance.now();
let frames = 0;
let fpsT = 0;
let fps = 0;
function frame(now) {
  const dt = Math.max(0, Math.min(0.1, (now - last) / 1000)); // never back in time: a resume sets `last` after this frame's stamp
  last = now;
  advance(dt);
  fadedNow = false;
  draw();
  frames++;
  fpsT += dt;
  if (fpsT >= 1) {
    fps = frames / fpsT;
    frames = 0;
    fpsT = 0;
  }
  requestAnimationFrame(frame);
}
let manual = false; // tests drive the world with __hop.step instead of the frame loop
function advance(dt) {
  if (!world) return;
  clock += dt;
  if (!paused && !manual) {
    let input = pilot ? (st) => (st.phase === 'play' ? pilotStick(st, pilot) : null) : stick();
    if (getOut && !pilot) input = { ...input, out: true };
    getOut = false;
    const wasFlying = world.phase === 'fly';
    rulesStep(world, dt, input);
    if (wasFlying && world.phase === 'play') showBanner();
    if (bannerT > 0) {
      bannerT -= dt;
      if (bannerT <= 0) $('[data-banner]').hidden = true;
    }
    handleEvents();
    if (world.phase === 'play' || world.phase === 'done') {
      $('[data-clock]').textContent = fmtClock(world.clock);
    }
    if (world.phase === 'fly') $('[data-clock]').textContent = '0:00';
    for (const k of Object.keys(pulse)) pulse[k] = Math.max(0, pulse[k] - dt);
    if (splitTimer > 0) {
      splitTimer -= dt;
      if (splitTimer <= 0) $('[data-split]').hidden = true;
    }
    syncLoops();
  }
  syncMusic(dt);
  updateCamera(dt);
}

// --- Start up ---------------------------------------------------------------------------------------------------
function fromHash() {
  const m = /m=(\d+)/.exec(location.hash);
  const n = m ? Number(m[1]) - 1 : 0;
  return n >= 0 && n <= mem.open && n < MISSIONS.length ? n : 0;
}
showCard(fromHash());
requestAnimationFrame(frame);

// The test hook: the state, start, restart, a step without drawing, and what was drawn and played.
window.__hop = {
  get state() {
    return world;
  },
  get paused() {
    return paused;
  },
  get mem() {
    return mem;
  },
  get view() {
    return { tilesAcross: viewTilesAcross, zoom: cam.zoom, x: cam.x, y: cam.y, mapHeld, finished: !!finishView, replay: replaying() ? { t: finishView.t, dur: finishView.dur, head: replayHead() } : null };
  },
  get drawn() {
    return [...drawn];
  },
  get people() {
    return peopleDrawn;
  },
  get music() {
    return Object.fromEntries(Object.entries(music).map(([k, m]) => [k, { level: m.level, playing: !m.el.paused, ready: !!m.el.src }]));
  },
  get order() {
    return drawOrder.slice();
  },
  set recordGround(v) {
    recordGround = !!v;
  },
  get faded() {
    return fadedNow;
  },
  get arrows() {
    return arrowsNow.slice();
  },
  get fps() {
    return fps;
  },
  played,
  get loops() {
    return Object.keys(loops).filter((k) => loops[k]);
  },
  ITEMS,
  set manual(v) {
    manual = !!v;
  },
  start(i, opts) {
    start(i, opts);
  },
  card(i) {
    showCard(i);
  },
  // Advance without drawing: n seconds in steps of dt, with a fixed stick (screen terms) or the
  // autopilot on a route ('gold', 'alt' or a list of legs).
  step(secs, stickIn = null, dt = 1 / 60) {
    const n = Math.round(secs / dt);
    for (let i = 0; i < n; i++) {
      if (paused) break;
      const input = pilot ? (st) => (st.phase === 'play' ? pilotStick(st, pilot) : null) : stickIn;
      rulesStep(world, dt, input);
      handleEvents();
      syncLoops();
      syncMusic(dt);
      updateCamera(dt);
      if (world.phase === 'done') break;
    }
    $('[data-clock]').textContent = fmtClock(world.clock);
  },
  autopilot(route) {
    pilot = route ? createPilot(Array.isArray(route) ? route : MISSIONS[world.mission][route]) : null;
  },
  draw() {
    fadedNow = false;
    draw();
  },
};

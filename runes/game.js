// Runes: draw one line of light through every stone; runes raise and sink stones as it passes.
// The rules live in rules.js; this file draws the pool, reads touch, mouse and keys, and keeps the
// level list. Tests drive it through window.__runes (see the end of this file).
import { mountShell } from '../shared/game-shell.js';
import * as R from './rules.js';
import { LEVELS, CHAPTERS } from './levels.js';

// ---------------------------------------------------------------------------------------------
// Knobs (tuned by playing; specs/runes.md has the targets).
const KNOBS = {
  stepCells: 0.6, // drag this many cells along the leading axis to step
  stepMinPx: 28, // ... but at least this many pixels
  axisLead: 1.5, // an axis leads once it is this many times the other
  clampCells: 0.3, // movement against a wall is held to this
  backCells: 0.8, // movement toward the previous stone that takes a step back
  tapPx: 10, // a tap moves less than this ...
  tapMs: 300, // ... and lasts less than this
  ghostDelay: 4000, // level 1: the ghost light first shows after this long without input
  ghostRepeat: 8000, // ... and again this long after
  previewAlpha: 0.4, // how strongly a rune's coming effect shows
  deadBudget: 2e5, // the search that decides whether the line can still finish
  riseMs: 420, // a stone rising or sinking
  chimeLow: 0.5, // the chime's rate on the source; it climbs a pentatonic scale to the gate
};

const PENTA = [1, 9 / 8, 5 / 4, 3 / 2, 5 / 3];

// Each chapter's sky and water.
const THEMES = {
  dawn: {
    skyTop: '#f3c3a8',
    skyBottom: '#7fb9b9',
    water: '#1d4a55',
    waterDeep: '#123640',
    mote: '255, 236, 210',
    meta: '#7fb9b9',
  },
  tide: {
    skyTop: '#16213f',
    skyBottom: '#4d6c9a',
    water: '#11253d',
    waterDeep: '#09182a',
    mote: '210, 225, 255',
    meta: '#16213f',
  },
};

const HUES = { rise: '255, 201, 90', sink: '186, 150, 255', light: '255, 216, 138' };

// ---------------------------------------------------------------------------------------------
// Shell, sound, page parts.
const { sound } = mountShell({
  sounds: {
    chime: 'sounds/chime.mp3',
    rise: 'sounds/rise.mp3',
    sink: 'sounds/sink.mp3',
    bell: 'sounds/bell.mp3',
    drip: 'sounds/drip.mp3',
    solved: 'sounds/solved.mp3',
    dim: 'sounds/dim.mp3',
    music: 'sounds/music.mp3',
  },
});

const $ = (q) => document.querySelector(q);
const ui = {
  canvas: $('#pool'),
  chapter: $('[data-chapter]'),
  num: $('[data-num]'),
  name: $('[data-name]'),
  mute: $('[data-mute]'),
  levelsBtn: $('[data-levels]'),
  restart: $('[data-restart]'),
  hint: $('[data-hint]'),
  guidance: $('[data-guidance]'),
  bar: $('.bar'),
  result: $('[data-result]'),
  resultKicker: $('[data-result-kicker]'),
  resultTitle: $('[data-result-title]'),
  resultText: $('[data-result-text]'),
  resultTip: $('[data-result-tip]'),
  next: $('[data-next]'),
  again: $('[data-again]'),
  resultLevels: $('[data-result-levels]'),
  levels: $('[data-screen="levels"]'),
  chapters: $('[data-chapters]'),
  closeLevels: $('[data-close-levels]'),
};
const ctx = ui.canvas.getContext('2d');

// ---------------------------------------------------------------------------------------------
// Memory: which levels are solved. Blocked storage plays as a fresh browser.
const SAVE_KEY = 'runes-solved';
let solvedSet = new Set();
try {
  const raw = window.localStorage.getItem(SAVE_KEY);
  if (raw) solvedSet = new Set(JSON.parse(raw).filter((n) => Number.isInteger(n)));
} catch (e) {
  solvedSet = new Set();
}
function markSolved(i) {
  solvedSet.add(i);
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify([...solvedSet]));
  } catch (e) {
    // Blocked storage: the mark lasts until the page reloads.
  }
}

// Guidance (opt-in): while it is on, the gate dims the moment the line can no longer finish and
// stones it cut off crack. Off, nothing tells you until the line is done. Kept in this browser.
const GUIDE_KEY = 'runes-guidance';
let guidance = false;
try {
  guidance = window.localStorage.getItem(GUIDE_KEY) === 'on';
} catch (e) {
  guidance = false;
}
function setGuidance(on) {
  guidance = Boolean(on);
  try {
    if (guidance) window.localStorage.setItem(GUIDE_KEY, 'on');
    else window.localStorage.removeItem(GUIDE_KEY);
  } catch (e) {
    // Blocked storage: the setting lasts until the page reloads.
  }
  ui.guidance.setAttribute('aria-pressed', String(guidance));
  ui.guidance.title = guidance ? 'Guidance is on: showing tiles that become unreachable' : 'Guidance: show tiles that become unreachable';
  if (guidance) checkDead(game.s.path.join(','));
  else {
    game.dead = false;
    game.stranded = [];
  }
}

const chapterOf = (i) => CHAPTERS.find((c) => i >= c.from && i < c.to);
// Levels open one at a time: each is locked until the one before it is solved.
const locked = (i) => i > 0 && !solvedSet.has(i - 1);
// The furthest level open: where a link to a locked level lands.
function frontier() {
  let i = 0;
  while (i + 1 < LEVELS.length && !locked(i + 1)) i++;
  return i;
}
// What Next opens after level i: the next level, or -1 (the level select) after the last one.
function nextAfter(i) {
  const k = i + 1;
  return k < LEVELS.length && !locked(k) ? k : -1;
}

// ---------------------------------------------------------------------------------------------
// The game state.
const game = {
  index: 0,
  level: null,
  s: null,
  solutions: [],
  done: false, // solved
  failed: false, // the line ended without lighting every stone
  tip: '',
  dead: false, // the line can no longer finish (shown only with guidance on)
  deadKnown: true,
  stranded: [],
  hintCell: -1,
  hintAt: 0,
  anims: new Map(), // cell -> { t, up }
  rings: [], // { x, y, t, hue }
  lastInput: 0,
  ghost: { shows: 0, t: -1 },
  openedAt: 0,
  theme: THEMES.dawn,
  overlay: null, // 'levels' | null
};
const ended = () => game.done || game.failed;

function loadLevel(i, { push = true, rows = null } = {}) {
  if (!(i >= 0 && i < LEVELS.length)) i = 0;
  game.index = i;
  game.level = R.parse(rows || LEVELS[i].rows);
  game.s = R.newState(game.level);
  game.solutions = R.solve(game.level, { max: 3 }).solutions;
  game.done = false;
  game.failed = false;
  game.tip = '';
  game.dead = false;
  game.stranded = [];
  game.hintCell = -1;
  game.anims.clear();
  game.rings = [];
  game.openedAt = performance.now();
  game.lastInput = game.openedAt;
  game.ghost = { shows: 0, t: -1 };
  game.theme = THEMES[chapterOf(i).id];
  document.querySelector('meta[name="theme-color"]').setAttribute('content', game.theme.meta);
  document.body.dataset.chapter = chapterOf(i).id;
  const ch = chapterOf(i);
  ui.chapter.textContent = `${ch.name} (${ch.level})`;
  ui.num.textContent = String(i + 1);
  ui.name.textContent = LEVELS[i].name;
  if (push && location.hash !== `#${i + 1}`) history.replaceState(null, '', `#${i + 1}`);
  showOverlay(null);
  showResult(null);
  updateButtons();
}

// The level a URL names: a bad hash means level 1, a locked level the furthest one open.
function levelFromHash() {
  const m = /^#(\d{1,3})$/.exec(location.hash);
  const n = m ? Number(m[1]) : NaN;
  if (!(n >= 1 && n <= LEVELS.length)) return -1;
  return locked(n - 1) ? frontier() : n - 1;
}

// ---------------------------------------------------------------------------------------------
// Layout: the board centred between the title and the bar, cells square, 16 px clear of the sides.
let W = 0;
let H = 0;
let dpr = 1;
const box = { cell: 48, ox: 0, oy: 0 };

function layout() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth;
  H = window.innerHeight;
  ui.canvas.width = Math.round(W * dpr);
  ui.canvas.height = Math.round(H * dpr);
  if (!game.level) return;
  const top = ui.levelsBtn ? document.querySelector('.title').getBoundingClientRect().bottom + 16 : 80;
  // The result panel, while it shows, takes the bar's place: the board moves up to stay in view.
  const below = ui.result.hidden ? ui.bar : ui.result;
  const bottom = below.getBoundingClientRect().top - 16;
  const L = game.level;
  const availW = Math.min(W - 40, 520);
  const availH = Math.max(120, bottom - top);
  // The stone's front edge (a fifth of a cell) shows below the last row.
  const cell = Math.floor(Math.min(availW / L.w, availH / (L.h + 0.2), 84));
  box.cell = cell;
  box.ox = Math.round((W - cell * L.w) / 2);
  box.oy = Math.round(top + (availH - cell * (L.h + 0.2)) / 2);
}

const cx = (c) => box.ox + ((c % game.level.w) + 0.5) * box.cell;
const cy = (c) => box.oy + (((c / game.level.w) | 0) + 0.5) * box.cell;
function cellAt(x, y) {
  const gx = Math.floor((x - box.ox) / box.cell);
  const gy = Math.floor((y - box.oy) / box.cell);
  if (gx < 0 || gy < 0 || gx >= game.level.w || gy >= game.level.h) return -1;
  return gy * game.level.w + gx;
}

// ---------------------------------------------------------------------------------------------
// Moves.
function totalStones() {
  let n = 0;
  for (let i = 0; i < game.s.up.length; i++) if (game.s.up[i]) n++;
  return n;
}

function chimeRate(len) {
  // From the source's note to an octave and a half above at the gate, on a pentatonic scale.
  const span = 8;
  const total = Math.max(2, totalStones());
  const k = Math.round(((len - 1) / Math.max(1, total - 1)) * span);
  return KNOBS.chimeLow * PENTA[k % 5] * 2 ** Math.floor(k / 5);
}

function applied(st, { quiet = false } = {}) {
  const now = performance.now();
  for (const [c] of st.changes) {
    game.anims.set(c, { t: now, up: game.s.up[c] });
    game.rings.push({ x: cx(c), y: cy(c), t: now, hue: game.s.up[c] ? HUES.rise : HUES.sink });
  }
  if (quiet) return;
  const k = game.level.kind[st.cell];
  if (k === 'rise') sound.play('bell', { gain: 0.55 });
  if (st.changes.some(([c]) => game.s.up[c])) sound.play('rise', { gain: 0.8 });
  if (st.changes.some(([c]) => !game.s.up[c])) sound.play('sink', { gain: 0.9 });
}

function stepTo(cell) {
  if (ended()) return false;
  // The player may step onto the gate before every stone is lit: that ends the attempt.
  const st = R.step(game.s, cell, { early: true });
  if (!st) return false;
  sound.play('chime', { rate: chimeRate(game.s.path.length), gain: 0.7 });
  applied(st);
  afterChange();
  return true;
}

function stepBack() {
  if (game.done) return false;
  reopen();
  const len = game.s.path.length;
  const st = R.back(game.s);
  if (!st) return false;
  sound.play('chime', { rate: chimeRate(len) * 0.94, gain: 0.45 });
  for (const [c, was] of st.changes) {
    game.anims.set(c, { t: performance.now(), up: was });
  }
  if (st.changes.length) sound.play('drip', { gain: 0.6 });
  afterChange();
  return true;
}

// Cut the line back to `cell` (a tap on a lit stone, Hint, Restart).
function cutTo(cell) {
  if (game.done) return false;
  const idx = game.s.path.indexOf(cell);
  if (idx < 0 || idx === game.s.path.length - 1) return false;
  reopen();
  const len = game.s.path.length;
  while (game.s.path.length > idx + 1) {
    const st = R.back(game.s);
    for (const [c, was] of st.changes) game.anims.set(c, { t: performance.now(), up: was });
  }
  sound.play('chime', { rate: chimeRate(len) * 0.9, gain: 0.4 });
  sound.play('drip', { gain: 0.5 });
  afterChange();
  return true;
}

// After a failed attempt, any change to the line (Restart, Hint) takes the result panel away again.
function reopen() {
  if (!game.failed) return;
  game.failed = false;
  game.tip = '';
  showResult(null);
}

function restart() {
  if (game.done || game.s.path.length < 2) return false;
  return cutTo(game.level.source);
}

// Hint: cut back to the longest start shared with a stored solution, and show its next stone.
function hint() {
  if (game.done || !game.solutions.length) return false;
  reopen();
  const p = game.s.path;
  let best = null;
  let bestLen = -1;
  for (const sol of game.solutions) {
    let n = 0;
    while (n < p.length && n < sol.length && p[n] === sol[n]) n++;
    if (n > bestLen) {
      best = sol;
      bestLen = n;
    }
  }
  if (bestLen < p.length) cutTo(p[bestLen - 1]);
  game.hintCell = best[bestLen] ?? -1;
  game.hintAt = performance.now();
  sound.play('bell', { gain: 0.3, rate: 1.5 });
  return true;
}

function afterChange() {
  game.lastInput = performance.now();
  game.hintCell = game.s.path.includes(game.hintCell) ? -1 : game.hintCell;
  if (R.solved(game.s)) {
    solvedNow();
  } else if (R.head(game.s) === game.level.gate || !playerMoves().length) {
    failedNow();
  } else if (guidance) {
    // Decide after this frame is drawn, so the step itself never waits on the search.
    game.deadKnown = false;
    const token = game.s.path.join(',');
    requestAnimationFrame(() => setTimeout(() => checkDead(token), 0));
  } else {
    game.dead = false;
    game.stranded = [];
  }
  updateButtons();
}

// The stones the player can step to now (the gate too, even early).
function playerMoves() {
  const out = [];
  for (let d = 0; d < 4; d++) {
    const n = R.neighbour(game.level, R.head(game.s), d);
    if (n >= 0 && !R.blocked(game.s, n)) out.push(n);
  }
  return out;
}

// The stones an unsolved attempt left dark: they are outlined on the board.
function missed() {
  if (!game.failed) return [];
  const out = [];
  for (let i = 0; i < game.s.up.length; i++) if (game.s.up[i] && !game.s.lit[i]) out.push(i);
  return out;
}

// Why the line ended unsolved, as a tip for next time.
const TIPS = {
  gate: 'Light every stone before you step on the gate: the gate is always the last stone.',
  rise: 'Stones a Rise brings up count too: leave yourself a way back to them.',
  sink: 'A Sink drowns the stones around it as you leave it: light the ones you need first, or let it take the ones you can’t reach.',
  plain: 'Every stone needs a way in and a way out: plan a line that leaves none behind and ends on the gate.',
};
function whyFailed() {
  const s = game.s;
  if (R.head(s) === game.level.gate) return 'gate';
  const dark = (c) => s.up[c] && !s.lit[c];
  const raisedDark = s.steps.some((st) => st.changes.some(([c, was]) => !was && dark(c)));
  if (raisedDark) return 'rise';
  if (s.steps.some((st) => st.changes.some(([, was]) => was))) return 'sink';
  return 'plain';
}

function failedNow() {
  game.failed = true;
  game.dead = false;
  game.stranded = [];
  game.tip = whyFailed();
  sound.play('dim', { gain: 0.9 });
  const left = R.left(game.s);
  ui.resultKicker.textContent = 'Not this time';
  ui.resultTitle.textContent = 'You didn’t make it';
  ui.resultText.textContent = `${left} ${left === 1 ? 'stone is' : 'stones are'} still dark.`;
  ui.resultTip.textContent = TIPS[game.tip];
  ui.resultTip.hidden = false;
  showResult('failed');
}

function checkDead(token) {
  if (!guidance || token !== game.s.path.join(',') || ended()) return;
  const res = R.solve(game.level, { from: game.s, max: 1, limit: KNOBS.deadBudget });
  const wasDead = game.dead;
  game.dead = !res.solutions.length && !res.cut;
  game.stranded = game.dead ? R.stranded(game.s) : [];
  game.deadKnown = true;
  if (game.dead && !wasDead) sound.play('dim', { gain: 0.7 });
}

function solvedNow() {
  game.done = true;
  game.dead = false;
  game.stranded = [];
  markSolved(game.index);
  sound.play('solved', { gain: 0.9 });
  game.rings.push({ x: cx(game.level.gate), y: cy(game.level.gate), t: performance.now(), hue: HUES.light, big: true });
  const at = game.index;
  ui.resultKicker.textContent = LEVELS[at].name;
  ui.resultTitle.textContent = 'Solved!';
  ui.resultText.textContent = 'Every stone is lit.';
  ui.resultTip.hidden = true;
  const next = nextAfter(at);
  ui.next.textContent = next >= 0 ? `Next: level ${next + 1}` : 'Choose a level';
  showResult('solved');
}

function updateButtons() {
  ui.restart.disabled = game.done || game.s.path.length < 2;
  ui.hint.disabled = game.done;
}

// The result panel below the board: loud, and never over the line you drew.
function showResult(kind) {
  ui.result.hidden = !kind;
  ui.bar.hidden = Boolean(kind);
  if (kind) {
    ui.result.dataset.kind = kind;
    ui.next.hidden = kind !== 'solved';
    ui.again.hidden = kind !== 'failed';
  }
  layout();
  if (kind === 'solved') ui.next.focus({ preventScroll: true });
  if (kind === 'failed') ui.again.focus({ preventScroll: true });
}

// ---------------------------------------------------------------------------------------------
// Overlays: the solved card and the level select.
function showOverlay(which) {
  game.overlay = which;
  ui.levels.hidden = which !== 'levels';
  if (which === 'levels') {
    buildLevels();
    centreOnBoard(ui.levels);
  }
}

// Centre a card on the board (not the window), kept inside the screen.
function centreOnBoard(card) {
  if (!game.level) return;
  const h = card.getBoundingClientRect().height;
  const mid = box.oy + (box.cell * (game.level.h + 0.2)) / 2;
  const top = Math.max(16 + h / 2, Math.min(H - 16 - h / 2, mid));
  card.style.top = `${Math.round(top)}px`;
}

const LOCK_SVG =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>';

function buildLevels() {
  ui.chapters.textContent = '';
  for (const ch of CHAPTERS) {
    const wrap = document.createElement('section');
    wrap.className = 'ch';
    const h = document.createElement('p');
    h.className = 'ch-name';
    h.innerHTML = `${ch.name} <span class="ch-level">(${ch.level})</span>`;
    const row = document.createElement('div');
    row.className = 'ch-row';
    for (let i = ch.from; i < ch.to; i++) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'lv';
      b.dataset.level = String(i + 1);
      const isLocked = locked(i);
      const isSolved = solvedSet.has(i);
      if (isLocked) {
        b.classList.add('is-locked');
        b.innerHTML = LOCK_SVG;
      } else {
        b.textContent = String(i + 1);
      }
      if (isSolved) b.classList.add('is-solved');
      if (i === game.index) b.classList.add('is-current');
      b.setAttribute('aria-disabled', String(isLocked));
      const name = `Level ${i + 1}, ${LEVELS[i].name}`;
      const state = isLocked ? `locked: solve level ${i} first` : isSolved ? 'solved' : '';
      b.setAttribute('aria-label', state ? `${name}, ${state}` : name);
      b.title = state ? `${name} (${state})` : name;
      b.addEventListener('click', () => {
        if (isLocked) {
          sound.play('dim', { gain: 0.6 });
          return;
        }
        loadLevel(i);
      });
      row.appendChild(b);
    }
    wrap.append(h, row);
    ui.chapters.appendChild(wrap);
  }
}

ui.levelsBtn.addEventListener('click', () => showOverlay(game.overlay === 'levels' ? null : 'levels'));
ui.closeLevels.addEventListener('click', () => showOverlay(null));
ui.resultLevels.addEventListener('click', () => showOverlay('levels'));
ui.next.addEventListener('click', () => {
  const n = nextAfter(game.index);
  if (n >= 0) loadLevel(n);
  else showOverlay('levels');
});
ui.again.addEventListener('click', () => restart());
ui.guidance.addEventListener('click', () => setGuidance(!guidance));
ui.restart.addEventListener('click', () => restart());
ui.hint.addEventListener('click', () => hint());
window.addEventListener('hashchange', () => {
  const i = levelFromHash();
  if (i < 0) {
    history.replaceState(null, '', '#1');
    loadLevel(0, { push: false });
  } else if (i !== game.index) loadLevel(i);
  else if (location.hash !== `#${i + 1}`) history.replaceState(null, '', `#${i + 1}`);
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

// ---------------------------------------------------------------------------------------------
// Input: relative drag anywhere, taps on stones, keys.
const drag = { id: null, x: 0, y: 0, sx: 0, sy: 0, t: 0, ax: 0, ay: 0, moved: false };

function dirCell(d) {
  return R.neighbour(game.level, R.head(game.s), d);
}

// Feed drag movement; steps as it crosses the thresholds. Returns the number of moves made.
function feed(dx, dy) {
  drag.ax += dx;
  drag.ay += dy;
  let moves = 0;
  for (let guard = 0; guard < 8; guard++) {
    const ax = Math.abs(drag.ax);
    const ay = Math.abs(drag.ay);
    const horizontal = ax >= ay;
    const lead = horizontal ? ax : ay;
    const other = horizontal ? ay : ax;
    if (lead < KNOBS.axisLead * other) break;
    const d = horizontal ? (drag.ax > 0 ? 1 : 3) : drag.ay > 0 ? 2 : 0;
    const target = dirCell(d);
    const p = game.s.path;
    const prev = p.length > 1 ? p[p.length - 2] : -2;
    const stepPx = Math.max(KNOBS.stepMinPx, KNOBS.stepCells * box.cell);
    if (target === prev) {
      if (lead < KNOBS.backCells * box.cell) break;
      stepBack();
    } else if (target >= 0 && !R.blocked(game.s, target)) {
      if (lead < stepPx) break;
      stepTo(target);
    } else {
      // A wall: hold the movement so it stores nothing.
      const cap = KNOBS.clampCells * box.cell;
      if (horizontal) drag.ax = Math.sign(drag.ax) * Math.min(ax, cap);
      else drag.ay = Math.sign(drag.ay) * Math.min(ay, cap);
      break;
    }
    moves++;
    drag.ax = 0;
    drag.ay = 0;
    if (ended()) break;
  }
  return moves;
}

function tap(x, y) {
  const c = cellAt(x, y);
  if (c < 0) return;
  if (game.s.lit[c]) {
    cutTo(c);
    return;
  }
  const h = R.head(game.s);
  if (R.dirOf(game.level, h, c) >= 0) {
    if (!stepTo(c)) bump(c);
  }
}

function bump(c) {
  game.rings.push({ x: cx(c), y: cy(c), t: performance.now(), hue: '255, 255, 255', small: true });
}

ui.canvas.addEventListener('pointerdown', (e) => {
  if (drag.id !== null || game.overlay || ended()) return; // a second finger moves nothing
  drag.id = e.pointerId;
  drag.x = drag.sx = e.clientX;
  drag.y = drag.sy = e.clientY;
  drag.t = performance.now();
  drag.ax = drag.ay = 0;
  drag.moved = false;
  game.lastInput = performance.now();
  try {
    ui.canvas.setPointerCapture(e.pointerId);
  } catch (err) {
    // Synthetic pointers in tests can't be captured; the drag still works.
  }
  startMusic();
});
ui.canvas.addEventListener('pointermove', (e) => {
  if (e.pointerId !== drag.id) return;
  const dx = e.clientX - drag.x;
  const dy = e.clientY - drag.y;
  drag.x = e.clientX;
  drag.y = e.clientY;
  if (!drag.moved && Math.hypot(drag.x - drag.sx, drag.y - drag.sy) >= KNOBS.tapPx) {
    // No longer a tap: the whole movement so far counts toward the drag.
    drag.moved = true;
    if (!ended()) feed(drag.x - drag.sx, drag.y - drag.sy);
  } else if (drag.moved && !ended()) feed(dx, dy);
  ui.canvas.style.cursor = drag.moved ? 'grabbing' : 'pointer';
});
function endDrag(e, cancelled) {
  if (e && e.pointerId !== drag.id) return;
  const wasTap = !drag.moved && performance.now() - drag.t < KNOBS.tapMs;
  if (!cancelled && wasTap && e && !ended()) tap(drag.sx, drag.sy);
  drag.id = null;
  if (e) hover(e.clientX, e.clientY);
}

// The mouse cursor: a hand over a stone the line can act on (step to, cut back to, or drag from
// the head), a closed hand while dragging, the usual arrow everywhere else.
function actionable(c) {
  if (c < 0 || ended() || game.overlay) return false;
  const s = game.s;
  if (s.lit[c]) return true; // the head (drag from it) or a lit stone (cut back to it)
  return R.dirOf(game.level, R.head(s), c) >= 0 && !R.blocked(s, c);
}
function hover(x, y) {
  if (drag.id !== null) return;
  ui.canvas.style.cursor = actionable(cellAt(x, y)) ? 'pointer' : '';
}
ui.canvas.addEventListener('pointermove', (e) => {
  if (e.pointerType === 'mouse') hover(e.clientX, e.clientY);
});
ui.canvas.addEventListener('pointerup', (e) => endDrag(e, false));
ui.canvas.addEventListener('pointercancel', (e) => endDrag(e, true));

window.addEventListener('keydown', (e) => {
  if (e.target instanceof Element && e.target.closest('input, textarea')) return;
  if (game.overlay) return;
  const keys = { ArrowUp: 0, ArrowRight: 1, ArrowDown: 2, ArrowLeft: 3, w: 0, d: 1, s: 2, a: 3, W: 0, D: 1, S: 2, A: 3 };
  if (e.key in keys) {
    e.preventDefault();
    if (ended()) return;
    startMusic();
    const t = dirCell(keys[e.key]);
    const p = game.s.path;
    if (p.length > 1 && t === p[p.length - 2]) stepBack();
    else if (t >= 0 && !stepTo(t)) bump(t);
    return;
  }
  if (e.key === 'r' || e.key === 'R') {
    e.preventDefault();
    restart();
  }
});

let stopMusic = null;
function startMusic() {
  if (!stopMusic) stopMusic = sound.loop('music', { gain: 0.22 });
}

// ---------------------------------------------------------------------------------------------
// Drawing.
const atlas = new Image();
atlas.src = 'img/stones.png';
const TILE = { stone: 0, rise: 1, sink: 2, source: 3, gate: 4 };
const ROW = { blue: 0, grey: 1, black: 2 };

// Lit versions of each stone, made once the atlas loads: the stone washed in the light's warm
// colour (or the rune's own), so a lit stone glows from within without losing its glyph.
const litTiles = {};
atlas.addEventListener('load', () => {
  const tints = { stone: '#f5c36b', source: '#f5c36b', gate: '#f5c36b', rise: '#ffbf3d', sink: '#a98cff' };
  for (const [name, tint] of Object.entries(tints)) {
    const cv = document.createElement('canvas');
    cv.width = 100;
    cv.height = 120;
    const g = cv.getContext('2d');
    g.drawImage(atlas, TILE[name] * 100, (name === 'stone' ? ROW.grey : ROW.blue) * 120, 100, 120, 0, 0, 100, 120);
    g.globalCompositeOperation = 'source-atop';
    g.globalAlpha = 0.5;
    g.fillStyle = tint;
    g.fillRect(0, 0, 100, 120);
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = 0.18;
    g.fillRect(0, 0, 100, 100);
    litTiles[name] = cv;
  }
});

function tile(name, row, x, y, size, alpha = 1) {
  if (!atlas.complete || !atlas.naturalWidth) return;
  ctx.globalAlpha = alpha;
  if (row === 'lit' && litTiles[name]) ctx.drawImage(litTiles[name], x, y, size, size * 1.2);
  else ctx.drawImage(atlas, TILE[name] * 100, ROW[row === 'lit' ? 'blue' : row] * 120, 100, 120, x, y, size, size * 1.2);
  ctx.globalAlpha = 1;
}

function glow(x, y, r, rgb, a) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(${rgb}, ${a})`);
  g.addColorStop(1, `rgba(${rgb}, 0)`);
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

const motes = Array.from({ length: 26 }, (_, i) => ({ x: (i * 0.618) % 1, y: (i * 0.377) % 1, s: 0.4 + ((i * 7) % 5) / 6 }));

function preview() {
  // The cells a rune near the head would change, as { cells, kind }.
  const s = game.s;
  const L = game.level;
  const h = R.head(s);
  if (ended()) return { cells: [], kind: null };
  if (L.kind[h] === 'sink') return { cells: R.effect(s, h, -1, -1).map(([c]) => c), kind: 'sink' };
  const cells = [];
  for (let d = 0; d < 4; d++) {
    const n = R.neighbour(L, h, d);
    if (n < 0 || L.kind[n] !== 'rise' || s.lit[n] || !s.up[n]) continue;
    for (const [c] of R.effect(s, n, d)) if (!cells.includes(c)) cells.push(c);
  }
  return { cells, kind: cells.length ? 'rise' : null };
}

function draw(now) {
  const L = game.level;
  const s = game.s;
  const th = game.theme;
  const t = now / 1000;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // Sky.
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, th.skyTop);
  sky.addColorStop(1, th.skyBottom);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  // The pool: a rounded basin of dark water a little larger than the board.
  const c = box.cell;
  const pad = c * 0.35;
  const px = box.ox - pad;
  const py = box.oy - pad;
  const pw = L.w * c + pad * 2;
  const ph = (L.h + 0.2) * c + pad * 2;
  const water = ctx.createLinearGradient(0, py, 0, py + ph);
  water.addColorStop(0, th.water);
  water.addColorStop(1, th.waterDeep);
  ctx.fillStyle = water;
  ctx.beginPath();
  ctx.roundRect(px, py, pw, ph, c * 0.45);
  ctx.fill();
  ctx.save();
  ctx.clip();
  // Slow ripples across the water.
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 9; i++) {
    const yy = py + ((i + 0.5) / 9) * ph;
    ctx.beginPath();
    for (let x = px; x <= px + pw; x += 8) {
      const yv = yy + Math.sin(x * 0.045 + t * 0.9 + i * 1.7) * 3 + Math.sin(x * 0.013 - t * 0.5 + i) * 4;
      if (x === px) ctx.moveTo(x, yv);
      else ctx.lineTo(x, yv);
    }
    ctx.stroke();
  }
  // Motes drifting up through the water.
  for (const m of motes) {
    const mx = px + ((m.x + Math.sin(t * 0.2 + m.y * 9) * 0.02) % 1) * pw;
    const my = py + ph - ((m.y + t * 0.025 * m.s) % 1) * ph;
    ctx.fillStyle = `rgba(${th.mote}, ${0.18 + 0.15 * Math.sin(t * 2 + m.x * 20)})`;
    ctx.beginPath();
    ctx.arc(mx, my, 1.2 + m.s, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  const pv = preview();
  const pvSet = new Set(pv.cells);
  const strandedSet = new Set(guidance ? game.stranded : []);
  const missedSet = new Set(missed());
  const lineIdx = new Map(s.path.map((cell, i) => [cell, i]));
  const head = R.head(s);

  // Idle runes breathe their effect: bubbles over the water beside a Rise, rings round a Sink.
  for (let i = 0; i < L.kind.length; i++) {
    const k = L.kind[i];
    if ((k !== 'rise' && k !== 'sink') || s.lit[i]) continue;
    if (k === 'rise') {
      for (let d = 0; d < 4; d++) {
        const n = R.neighbour(L, i, d);
        if (n < 0 || s.up[n]) continue;
        for (let b = 0; b < 2; b++) {
          const ph2 = (t * 0.6 + b * 0.5 + n * 0.37) % 1;
          ctx.fillStyle = `rgba(${HUES.rise}, ${0.35 * (1 - ph2)})`;
          ctx.beginPath();
          ctx.arc(cx(n) + Math.sin(ph2 * 6 + b) * c * 0.15, cy(n) + c * 0.25 - ph2 * c * 0.5, c * 0.04 + b, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    } else {
      const ph2 = (t * 0.35 + i * 0.13) % 1;
      ctx.strokeStyle = `rgba(${HUES.sink}, ${0.3 * (1 - ph2)})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(cx(i), cy(i) + c * 0.1, c * (0.45 + ph2 * 0.6), c * (0.3 + ph2 * 0.4), 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // Stones, row by row, so each row's front edge tucks under the next.
  for (let i = 0; i < L.kind.length; i++) {
    const anim = game.anims.get(i);
    let p = s.up[i] ? 1 : 0;
    if (anim) {
      const k = Math.min(1, (now - anim.t) / KNOBS.riseMs);
      const e = 1 - (1 - k) ** 3;
      p = anim.up ? e : 1 - e;
      if (k >= 1) game.anims.delete(i);
    }
    const x = box.ox + (i % L.w) * c;
    const y0 = box.oy + ((i / L.w) | 0) * c;
    const k = L.kind[i];
    if (p <= 0.01) {
      if (pvSet.has(i) && pv.kind === 'rise') {
        // A ghost of the stone the Rise would bring up.
        tile('stone', 'grey', x + c * 0.06, y0 + c * 0.1, c * 0.88, KNOBS.previewAlpha + 0.1 * Math.sin(t * 5));
        ctx.save();
        ctx.setLineDash([c * 0.08, c * 0.06]);
        ctx.strokeStyle = `rgba(${HUES.rise}, ${0.55 + 0.25 * Math.sin(t * 5)})`;
        ctx.lineWidth = Math.max(1.5, c * 0.035);
        ctx.beginPath();
        ctx.roundRect(x + c * 0.08, y0 + c * 0.1, c * 0.84, c * 0.84, c * 0.1);
        ctx.stroke();
        ctx.restore();
      }
      continue;
    }
    let y = y0 + (1 - p) * c * 0.45;
    let xx = x;
    if (pvSet.has(i) && pv.kind === 'sink') {
      xx += Math.sin(t * 40 + i) * c * 0.025;
      y += Math.abs(Math.sin(t * 9 + i)) * c * 0.03;
    }
    const name = k === 'rise' || k === 'sink' || k === 'source' || k === 'gate' ? k : 'stone';
    const row = s.lit[i] && p > 0.5 ? 'lit' : name === 'stone' ? 'grey' : 'blue';
    tile(name, row, xx, y, c, p);
    if (pvSet.has(i) && pv.kind === 'sink') {
      ctx.fillStyle = `rgba(${HUES.sink}, ${KNOBS.previewAlpha * 0.7})`;
      ctx.fillRect(xx + c * 0.06, y + c * 0.06, c * 0.88, c * 0.88);
    }
    if (missedSet.has(i)) {
      // The attempt is over: the stones it missed pulse, so you see what was left dark.
      ctx.strokeStyle = `rgba(255, 120, 110, ${0.55 + 0.35 * Math.sin(t * 4)})`;
      ctx.lineWidth = Math.max(2, c * 0.05);
      ctx.beginPath();
      ctx.roundRect(xx + c * 0.05, y + c * 0.05, c * 0.9, c * 0.9, c * 0.12);
      ctx.stroke();
    }
    if (strandedSet.has(i)) {
      ctx.fillStyle = 'rgba(10, 14, 24, 0.32)';
      ctx.fillRect(xx + c * 0.04, y + c * 0.04, c * 0.92, c * 0.96);
      ctx.strokeStyle = 'rgba(30, 30, 40, 0.6)';
      ctx.lineWidth = Math.max(1.2, c * 0.022);
      ctx.beginPath();
      ctx.moveTo(xx + c * 0.3, y + c * 0.12);
      ctx.lineTo(xx + c * 0.48, y + c * 0.42);
      ctx.lineTo(xx + c * 0.38, y + c * 0.6);
      ctx.lineTo(xx + c * 0.62, y + c * 0.9);
      ctx.stroke();
    }
    // Lit stones glow from within.
    if (s.lit[i] && p > 0.5) {
      const order = lineIdx.get(i) ?? 0;
      const fresh = Math.max(0, 1 - (now - (anim ? anim.t : 0)) / 600);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const hue = k === 'rise' ? HUES.rise : k === 'sink' ? HUES.sink : HUES.light;
      glow(xx + c / 2, y + c * 0.45, c * 0.5, hue, 0.1 + 0.05 * Math.sin(t * 2.4 - order * 0.5) + fresh * 0.35);
      ctx.restore();
    } else if ((k === 'rise' || k === 'sink') && !s.lit[i]) {
      // An unlit rune breathes in its colour.
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      glow(xx + c / 2, y + c * 0.45, c * 0.42, k === 'rise' ? HUES.rise : HUES.sink, 0.12 + 0.08 * Math.sin(t * 1.6 + i));
      ctx.restore();
    }
  }

  // Seams of light across each shared edge of the line, and the head.
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  for (let i = 1; i < s.path.length; i++) {
    const a = s.path[i - 1];
    const b = s.path[i];
    const mx = (cx(a) + cx(b)) / 2;
    const my = (cy(a) + cy(b)) / 2 - c * 0.05;
    const vx = (cx(b) - cx(a)) / c;
    const vy = (cy(b) - cy(a)) / c;
    ctx.strokeStyle = `rgba(${HUES.light}, 0.75)`;
    ctx.lineWidth = Math.max(2.5, c * 0.06);
    ctx.beginPath();
    ctx.moveTo(mx - vx * c * 0.1, my - vy * c * 0.1);
    ctx.lineTo(mx + vx * c * 0.1, my + vy * c * 0.1);
    ctx.stroke();
    glow(mx, my, c * 0.16, HUES.light, 0.3);
  }
  // The source's flame and the gate's light.
  const sxp = cx(L.source);
  const syp = cy(L.source) - c * 0.05;
  glow(sxp, syp, c * (0.5 + 0.06 * Math.sin(t * 3)), HUES.light, s.path.length < 2 ? 0.3 + 0.2 * Math.sin(t * 4) : 0.12);
  const gx = cx(L.gate);
  const gy = cy(L.gate) - c * 0.05;
  if (game.done) {
    glow(gx, gy, c * 1.1, HUES.light, 0.8);
  } else if (game.failed || (guidance && game.dead)) {
    glow(gx, gy, c * 0.4, '140, 150, 170', 0.15);
  } else {
    glow(gx, gy, c * (0.5 + 0.05 * Math.sin(t * 2)), '170, 225, 255', 0.42);
  }
  // The head: a soft orb that breathes.
  // The head: a ring of light round its stone that breathes.
  if (!ended() && s.path.length > 1) {
    ctx.strokeStyle = `rgba(255, 244, 214, ${0.55 + 0.25 * Math.sin(t * 5)})`;
    ctx.lineWidth = Math.max(2, c * 0.05);
    ctx.beginPath();
    ctx.roundRect(cx(head) - c * 0.47, cy(head) - c * 0.47, c * 0.94, c * 0.94, c * 0.12);
    ctx.stroke();
  }
  // The hint's next stone glimmers.
  if (game.hintCell >= 0) {
    const k = (now - game.hintAt) / 1000;
    glow(cx(game.hintCell), cy(game.hintCell), c * 0.55, '255, 255, 255', 0.35 + 0.3 * Math.sin(k * 6));
  }
  ctx.restore();


  // Rings: splashes where stones rose or sank, the gate opening, bumps.
  game.rings = game.rings.filter((r) => now - r.t < (r.big ? 1400 : 700));
  for (const r of game.rings) {
    const k = (now - r.t) / (r.big ? 1400 : 700);
    ctx.strokeStyle = `rgba(${r.hue}, ${(1 - k) * (r.small ? 0.5 : 0.7)})`;
    ctx.lineWidth = r.big ? 4 : 2;
    ctx.beginPath();
    const rad = c * (r.small ? 0.2 + k * 0.25 : r.big ? 0.4 + k * 2.4 : 0.3 + k * 0.6);
    ctx.ellipse(r.x, r.y + c * 0.1, rad, rad * 0.65, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Level 1's ghost light: shows the first steps until the line moves.
  ghostDraw(now);
}

function ghostDraw(now) {
  const g = game.ghost;
  if (game.index !== 0 || game.s.path.length > 1 || ended() || !game.solutions.length) {
    g.t = -1;
    return;
  }
  const idle = now - game.lastInput;
  if (g.t < 0 && idle >= (g.shows === 0 ? KNOBS.ghostDelay : KNOBS.ghostRepeat)) {
    g.t = now;
    g.shows++;
  }
  if (g.t < 0) return;
  const k = (now - g.t) / 1600;
  if (k >= 1) {
    g.t = -1;
    game.lastInput = now; // the next show waits the repeat delay
    return;
  }
  const sol = game.solutions[0];
  const seg = Math.min(2, sol.length - 1);
  const f = k * seg;
  const a = sol[Math.floor(f)];
  const b = sol[Math.min(seg, Math.floor(f) + 1)];
  const u = f - Math.floor(f);
  const x = cx(a) + (cx(b) - cx(a)) * u;
  const y = cy(a) + (cy(b) - cy(a)) * u;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  glow(x, y, box.cell * 0.45, '255, 244, 214', 0.6 * Math.sin(Math.PI * k));
  ctx.restore();
}

// ---------------------------------------------------------------------------------------------
// The loop, and pausing while hidden.
let running = true;
function frame(now) {
  if (!running) return;
  draw(now);
  requestAnimationFrame(frame);
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    running = false;
    drag.id = null; // the gesture ends; the line stays
    sound.suspend();
  } else if (!running) {
    running = true;
    game.lastInput = performance.now();
    requestAnimationFrame(frame);
  }
});

window.addEventListener('resize', layout);

// ---------------------------------------------------------------------------------------------
// Start, and the test hook.
const first = levelFromHash();
if (first < 0 && location.hash) history.replaceState(null, '', '#1');
loadLevel(first < 0 ? 0 : first); // rewrites the hash to the level it opened
setGuidance(guidance);
requestAnimationFrame(frame);

window.__runes = {
  game,
  rules: R,
  levels: LEVELS,
  knobs: KNOBS,
  box,
  sound,
  loadLevel,
  // Tests: play a board of their own in the current level's place.
  loadBoard: (rows) => loadLevel(game.index, { push: false, rows }),
  dragging: () => drag.id !== null,
  stepTo,
  stepBack,
  restart,
  hint,
  cutTo,
  preview,
  feed,
  locked,
  nextAfter,
  center: (cell) => ({ x: cx(cell), y: cy(cell) }),
  solvedSet: () => [...solvedSet],
  // Run the dead-line check now instead of after the next frame.
  checkDead: () => checkDead(game.s.path.join(',')),
  setGuidance,
  guidance: () => guidance,
  tips: TIPS,
  missed,
};

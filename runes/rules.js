// Runes: the rules, with no drawing, so the page, the tests and the level tools share them.
//
// A level is a grid of characters, one string per row:
//   .  water         o  stone        S  the source    G  the gate
//   R  rise rune     K  sink rune    Z  spark rune
// The line of light starts on the source and steps to orthogonal neighbours. Each stone holds the
// light at most once. A rune fires once, on cells the light doesn't hold: a rise, when the light
// enters it, raises its water neighbours into stones; a sink, when the light leaves it, sinks its
// plain-stone neighbours (never a rune, the source or the gate) except the one the light goes on to;
// a spark, when the light enters it, raises the water straight on in the direction the light
// entered it, up to the next stone or the edge. The level is solved when every stone is lit and the line ends on the gate.
// Every step can be taken back, in the reverse order, undoing exactly what it changed.

export const RUNES = { R: 'rise', K: 'sink', Z: 'spark' };

export const DIRS = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

export function parse(rows) {
  const h = rows.length;
  const w = rows[0].length;
  const kind = [];
  const up = [];
  let source = -1;
  let gate = -1;
  for (let y = 0; y < h; y++) {
    if (rows[y].length !== w) throw new Error(`row ${y} is ${rows[y].length} wide, not ${w}`);
    for (let x = 0; x < w; x++) {
      const c = rows[y][x];
      const i = y * w + x;
      if (c === '.' || c === 'o') {
        kind.push(null);
        up.push(c === 'o');
      } else if (c === 'S' || c === 'G') {
        kind.push(c === 'S' ? 'source' : 'gate');
        up.push(true);
        if (c === 'S') source = i;
        else gate = i;
      } else if (RUNES[c]) {
        kind.push(RUNES[c]);
        up.push(true);
      } else throw new Error(`unknown cell '${c}'`);
    }
  }
  if (source < 0 || gate < 0) throw new Error('a level needs a source and a gate');
  return { w, h, kind, up, source, gate, rows };
}

export const isRune = (k) => k === 'rise' || k === 'sink' || k === 'spark';

export function newState(level) {
  const s = {
    level,
    up: level.up.slice(),
    lit: new Uint8Array(level.w * level.h),
    path: [level.source],
    steps: [], // one per step: { cell, dir, changes: [[cell, wasUp], ...] }
  };
  s.lit[level.source] = 1;
  return s;
}

export const head = (s) => s.path[s.path.length - 1];

// Stones still to light (the gate counts until the line is on it).
export function left(s) {
  let n = 0;
  for (let i = 0; i < s.up.length; i++) if (s.up[i] && !s.lit[i]) n++;
  return n;
}

export const solved = (s) => head(s) === s.level.gate && left(s) === 0;

export function dirOf(level, a, b) {
  const dx = (b % level.w) - (a % level.w);
  const dy = ((b / level.w) | 0) - ((a / level.w) | 0);
  for (let d = 0; d < 4; d++) if (DIRS[d][0] === dx && DIRS[d][1] === dy) return d;
  return -1;
}

export function neighbour(level, cell, d) {
  const x = (cell % level.w) + DIRS[d][0];
  const y = ((cell / level.w) | 0) + DIRS[d][1];
  if (x < 0 || y < 0 || x >= level.w || y >= level.h) return -1;
  return y * level.w + x;
}

// Why the light can't step from the head to `to`, or '' as far as the cells go. The gate also takes
// the light only as the last stone, counted after the step's own effects: step() checks that.
export function blocked(s, to) {
  const L = s.level;
  const h = head(s);
  if (h === L.gate) return 'done';
  if (to < 0 || to >= L.w * L.h) return 'off';
  if (dirOf(L, h, to) < 0) return 'far';
  if (s.lit[to]) return 'lit';
  if (!s.up[to]) return 'water';
  return '';
}

function setUp(s, cell, value, changes) {
  if (s.up[cell] === value) return;
  changes.push([cell, s.up[cell]]);
  s.up[cell] = value;
}

// What a rune would change, as [[cell, newUp], ...], without changing it: a rise or a spark as the
// light enters it from direction `d`, a sink as the light leaves it for cell `next` (-1: every
// neighbour, which is what the player is shown while the light stands on it).
export function effect(s, cell, d, next = -1) {
  const L = s.level;
  const k = L.kind[cell];
  const out = [];
  if (k === 'rise' || k === 'sink') {
    for (let e = 0; e < 4; e++) {
      const n = neighbour(L, cell, e);
      if (n < 0 || s.lit[n] || n === next) continue;
      if (k === 'rise' && !s.up[n]) out.push([n, true]);
      if (k === 'sink' && s.up[n] && L.kind[n] == null) out.push([n, false]);
    }
  } else if (k === 'spark' && d >= 0) {
    let n = neighbour(L, cell, d);
    while (n >= 0 && !s.up[n] && !s.lit[n]) {
      out.push([n, true]);
      n = neighbour(L, n, d);
    }
  }
  return out;
}

// Step the light from the head to `to`. Returns the step ({ cell, dir, changes }) or null.
// The player may step onto the gate early ({ early: true }), which ends the attempt unsolved; the
// solver never does.
export function step(s, to, { early = false } = {}) {
  if (blocked(s, to)) return null;
  const from = head(s);
  const d = dirOf(s.level, from, to);
  const changes = [];
  s.lit[to] = 1;
  s.path.push(to);
  if (s.level.kind[from] === 'sink') for (const [c, v] of effect(s, from, d, to)) setUp(s, c, v, changes);
  if (s.level.kind[to] !== 'sink') for (const [c, v] of effect(s, to, d)) setUp(s, c, v, changes);
  const st = { cell: to, dir: d, changes };
  s.steps.push(st);
  // The gate ends the line, so it solves the level only when no other stone is left dark. Unless
  // the caller allows it, a step that would arrive early is refused and leaves no trace.
  if (!early && to === s.level.gate && left(s) > 0) {
    back(s);
    return null;
  }
  return st;
}

// Would stepping to `to` be refused only because the gate isn't last? ('early'), else blocked().
export function why(s, to) {
  const b = blocked(s, to);
  if (b) return b;
  if (to !== s.level.gate) return '';
  if (!step(s, to)) return 'early';
  back(s);
  return '';
}

// Take the last step back, undoing what it raised or sank. Returns the step, or null at the source.
export function back(s) {
  const st = s.steps.pop();
  if (!st) return null;
  for (let i = st.changes.length - 1; i >= 0; i--) s.up[st.changes[i][0]] = st.changes[i][1];
  s.lit[st.cell] = 0;
  s.path.pop();
  return st;
}

// Cut the line back so that `cell` is its head. Returns how many steps were taken back.
export function cutTo(s, cell) {
  if (!s.lit[cell]) return 0;
  let n = 0;
  while (head(s) !== cell && back(s)) n++;
  return n;
}

export function moves(s) {
  const out = [];
  for (let d = 0; d < 4; d++) {
    const n = neighbour(s.level, head(s), d);
    if (n >= 0 && !why(s, n)) out.push(n);
  }
  return out;
}

// Can the line still possibly finish? A cheap, safe test used to cut the search and to show the
// player why a line is lost. Water beside a rise still to fire counts as a stone that may come. A
// dark stone is stranded when it can't be reached from the head through dark stones, or when it has
// fewer than two ways in and out (dark stones, the head, the gate) and so would trap the line. A
// stone a sink still to fire could take away is never counted. Returns the stranded stones.
export function stranded(s) {
  const L = s.level;
  const n = L.w * L.h;
  const h = head(s);
  const sinkable = new Uint8Array(n);
  const may = new Uint8Array(n); // water a rise still to fire could raise
  for (let i = 0; i < n; i++) {
    // A sink still to fire: one not yet lit, or the one the light stands on (it fires on leaving).
    if (!s.up[i] || (s.lit[i] && i !== h)) continue;
    const k = L.kind[i];
    if (!s.lit[i] && k === 'spark') return []; // a spark reaches far: no claims while one waits
    for (let d = 0; d < 4; d++) {
      const m = neighbour(L, i, d);
      if (m < 0) continue;
      if (k === 'sink') sinkable[m] = 1;
      if (k === 'rise' && !s.lit[i] && !s.up[m] && !s.lit[m]) may[m] = 1;
    }
  }
  // A dark stone, or water that may yet become one.
  const dark = (m) => m >= 0 && !s.lit[m] && (s.up[m] || may[m]);
  const seen = new Uint8Array(n);
  const stack = [h];
  seen[h] = 1;
  while (stack.length) {
    const c = stack.pop();
    for (let d = 0; d < 4; d++) {
      const m = neighbour(L, c, d);
      if (!dark(m) || seen[m]) continue;
      seen[m] = 1;
      if (m !== L.gate) stack.push(m); // the line ends on the gate, so it leads nowhere
    }
  }
  const out = [];
  for (let i = 0; i < n; i++) {
    if (!dark(i) || !s.up[i] || sinkable[i]) continue;
    if (!seen[i]) {
      out.push(i);
      continue;
    }
    if (i === L.gate) continue;
    let ways = 0;
    for (let d = 0; d < 4; d++) {
      const m = neighbour(L, i, d);
      if (m === h || dark(m)) ways++;
    }
    if (ways < 2) out.push(i);
  }
  return out;
}

// Search every line from the current state. Returns { solutions: [cells…] (up to `max`), nodes,
// cut }, each solution the whole line from the source. Stops after `limit` nodes (then cut).
export function solve(level, { from = null, limit = 3e6, max = 20 } = {}) {
  const s = from ? from : newState(level);
  const res = { solutions: [], nodes: 0, cut: false };
  const dead = new Set();
  const key = () => head(s) + ':' + s.lit.join('') + s.up.map((u) => (u ? 1 : 0)).join('');
  function dfs() {
    if (++res.nodes > limit) {
      res.cut = true;
      return false;
    }
    if (head(s) === level.gate) {
      if (left(s) === 0) {
        res.solutions.push(s.path.slice());
        return true;
      }
      return false;
    }
    if (stranded(s).length) return false;
    const k = key();
    if (dead.has(k)) return false;
    let found = false;
    for (const m of moves(s)) {
      step(s, m);
      if (dfs()) found = true;
      back(s);
      if (res.cut || res.solutions.length >= max) return found;
    }
    if (!found) dead.add(k);
    return found;
  }
  dfs();
  return res;
}

// Level lab: solve Runes boards and print what a level designer needs to judge them.
//   node scripts/runes/lab.mjs              every level in runes/levels.js
//   node scripts/runes/lab.mjs 'So.oG' ...  one board, its rows as arguments
import * as R from '../../runes/rules.js';

// A greedy player: fires every rise and spark it can reach, avoids sinks, and otherwise takes the
// first open neighbour. True if that line happens to solve the level.
export function greedy(level) {
  const s = R.newState(level);
  const score = (c) => {
    const k = level.kind[c];
    return k === 'rise' || k === 'spark' ? 2 : k === 'sink' ? -2 : c === level.gate ? -1 : 0;
  };
  for (;;) {
    const m = R.moves(s);
    if (!m.length) return R.solved(s);
    m.sort((a, b) => score(b) - score(a));
    R.step(s, m[0]);
  }
}

// Of the lines 4 steps long, how many can no longer finish: a rough count of tempting wrong turns.
function traps(level) {
  const s = R.newState(level);
  let dead = 0;
  let all = 0;
  function walk(depth) {
    const m = R.moves(s);
    if (depth === 4 || !m.length) {
      all++;
      if (!R.solve(level, { from: s, max: 1, limit: 2e5 }).solutions.length) dead++;
      return;
    }
    for (const n of m) {
      R.step(s, n);
      walk(depth + 1);
      R.back(s);
    }
  }
  walk(0);
  return `${dead}/${all}`;
}

export function report(rows, name = '') {
  const L = R.parse(rows);
  const t = Date.now();
  const r = R.solve(L, { max: 50 });
  const out = {
    name,
    size: `${L.w}x${L.h}`,
    runes: L.kind.filter(R.isRune).length,
    solutions: r.cut ? `${r.solutions.length}+ (cut)` : r.solutions.length,
    greedy: greedy(L) ? 'SOLVES' : 'fails',
    traps: traps(L),
    nodes: r.nodes,
    ms: Date.now() - t,
  };
  return { out, r, L };
}

export function draw(L, path) {
  const order = new Map(path.map((c, i) => [c, i]));
  const lines = [];
  for (let y = 0; y < L.h; y++) {
    let line = '';
    for (let x = 0; x < L.w; x++) {
      const o = order.get(y * L.w + x);
      line += (o == null ? '  ' + L.rows[y][x] : String(o).padStart(3)) + ' ';
    }
    lines.push(line);
  }
  return lines.join('\n');
}

const main = import.meta.url === `file://${process.argv[1]}`;
if (main && process.argv.length > 2) {
  const { out, r, L } = report(process.argv.slice(2));
  console.log(out);
  for (const p of r.solutions.slice(0, 2)) console.log(draw(L, p) + '\n');
} else if (main) {
  const { LEVELS } = await import('../../runes/levels.js');
  for (const [i, lv] of LEVELS.entries()) {
    const { out } = report(lv.rows, `${i + 1} ${lv.name}`);
    console.log(JSON.stringify(out));
  }
}

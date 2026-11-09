// High Seas: the archipelago, generated from a seed. Pure (no DOM), so tests can run it in Node.
//
// The grid is W × H tiles. Each tile is one of DEEP, SHALLOW, SAND or GRASS; rocks stand on deep
// or shallow tiles. Positions are in tile units, (x, y) on the grid, tile (i, j) covering
// [i, i+1) × [j, j+1). Angles are grid angles: atan2(dy, dx).

export const DEEP = 0;
export const SHALLOW = 1;
export const SAND = 2;
export const GRASS = 3;

export const W = 44;
export const H = 44;

// Port names: made up for this game.
const NAMES = ['Saltby', 'Gull Quay', 'Merrow Bay', 'Tern Harbour', 'Brackwater', 'Pebble Cove', 'Kelpton', 'Driftwick'];
export const PORT_COLOURS = ['#e8604c', '#f2c14e', '#5fb36b', '#8e6fd1'];

// A small seeded random generator (mulberry32) and a string hash for seeds.
export function hashSeed(s) {
  let h = 1779033703 ^ s.length;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}

export function rng(seed) {
  let a = typeof seed === 'number' ? seed >>> 0 : hashSeed(String(seed));
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A new seed for a new voyage: five letters, easy to share.
export function newSeed(rand = Math.random) {
  const A = 'BCDFGHJKLMNPQRSTVWXZ';
  const V = 'AEIOU';
  let s = '';
  for (let i = 0; i < 5; i++) s += i % 2 ? V[Math.floor(rand() * V.length)] : A[Math.floor(rand() * A.length)];
  return s;
}

export const wrap = (a) => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};

const idx = (i, j) => j * W + i;
const inside = (i, j) => i >= 0 && j >= 0 && i < W && j < H;

// --- Generation ---------------------------------------------------------------------------

function blob(rand, cx, cy, R) {
  // An island outline: a radius that wobbles with the angle.
  const waves = [1, 2, 3, 5].map((k) => ({ k, a: (rand() * 0.22) / Math.sqrt(k), p: rand() * Math.PI * 2 }));
  return (x, y) => {
    const dx = x - cx;
    const dy = y - cy;
    const th = Math.atan2(dy, dx);
    let r = R;
    for (const w of waves) r += R * w.a * Math.sin(w.k * th + w.p);
    return Math.hypot(dx, dy) / r; // < 1 inside
  };
}

export const fails = {};
const fail = (k) => { fails[k] = (fails[k] || 0) + 1; return null; };
function attempt(seed) {
  const rand = rng(seed);
  const tiles = new Uint8Array(W * H); // all DEEP
  const islands = [];
  // The lighthouse island sits near one edge, far out; the shipyard near the middle; the other
  // islands spread between, with room for channels.
  const edge = Math.floor(rand() * 4);
  const lh = [
    [W / 2 + (rand() - 0.5) * 12, 5],
    [W - 5, H / 2 + (rand() - 0.5) * 12],
    [W / 2 + (rand() - 0.5) * 12, H - 5],
    [5, H / 2 + (rand() - 0.5) * 12],
  ][edge];
  islands.push({ x: lh[0], y: lh[1], r: 1.9, kind: 'lighthouse' });
  const opposite = [
    [W / 2, H - 15],
    [15, H / 2],
    [W / 2, 15],
    [W - 15, H / 2],
  ][edge];
  islands.push({ x: opposite[0] + (rand() - 0.5) * 6, y: opposite[1] + (rand() - 0.5) * 6, r: 3.4 + rand(), kind: 'shipyard' });
  let tries = 0;
  while (islands.length < 9 && tries++ < 400) {
    const r = 2.2 + rand() * 2.6;
    const x = 4 + r + rand() * (W - 8 - 2 * r);
    const y = 4 + r + rand() * (H - 8 - 2 * r);
    if (islands.every((o) => Math.hypot(o.x - x, o.y - y) > o.r + r + 5)) islands.push({ x, y, r, kind: 'island' });
  }
  for (const is of islands) {
    is.f = blob(rand, is.x, is.y, is.r);
    for (let j = 0; j < H; j++)
      for (let i = 0; i < W; i++) {
        const d = is.f(i + 0.5, j + 0.5);
        if (d < 0.62 && is.r > 2) tiles[idx(i, j)] = GRASS;
        else if (d < 1) tiles[idx(i, j)] = Math.max(tiles[idx(i, j)], SAND);
      }
  }
  // Shallows: a ring of one tile round every island, wider on one side, plus a sandbank or two
  // between islands: the dinghy's shortcuts.
  const dist = landDistance(tiles);
  for (let j = 0; j < H; j++)
    for (let i = 0; i < W; i++) if (tiles[idx(i, j)] === DEEP && dist[idx(i, j)] <= 1) tiles[idx(i, j)] = SHALLOW;
  const banks = 1 + Math.floor(rand() * 2);
  for (let b = 0; b < banks; b++) {
    const a = islands[2 + Math.floor(rand() * (islands.length - 2))];
    const c = islands[1 + Math.floor(rand() * (islands.length - 1))];
    if (!a || !c || a === c) continue;
    const n = 14;
    for (let k = 3; k <= n - 3; k++) {
      const x = a.x + ((c.x - a.x) * k) / n;
      const y = a.y + ((c.y - a.y) * k) / n;
      for (let dj = -1; dj <= 1; dj++)
        for (let di = -1; di <= 1; di++) {
          const i = Math.floor(x + di);
          const j = Math.floor(y + dj);
          if (inside(i, j) && tiles[idx(i, j)] === DEEP && rand() < 0.8) tiles[idx(i, j)] = SHALLOW;
        }
    }
  }
  // Ports: on the shipyard and the three biggest other islands, on a coast tile that faces open
  // water. The quay is the land tile, the berth the water tile beside it.
  const portIslands = [islands[1], ...islands.slice(2).sort((p, q) => q.r - p.r).slice(0, 3)];
  if (portIslands.length < 4) return fail("islands");
  const names = NAMES.slice();
  const ports = [];
  for (const [k, is] of portIslands.entries()) {
    const p = placeQuay(tiles, is, rand);
    if (!p) return fail("quay");
    const name = k === 0 ? 'Shipyard' : names.splice(Math.floor(rand() * names.length), 1)[0];
    ports.push({ id: k, name, colour: k === 0 ? '#d9d4c7' : PORT_COLOURS[k - 1], island: is, ...p });
  }
  const lhPort = placeQuay(tiles, islands[0], rand);
  if (!lhPort) return fail("lhquay");
  const lighthouse = { id: 'lighthouse', name: 'The Lighthouse', colour: '#ffffff', island: islands[0], ...lhPort };
  // Rocks: a few in open water between islands, never near a berth or a beach.
  const rocks = [];
  let rt = 0;
  const want = 7 + Math.floor(rand() * 5);
  while (rocks.length < want && rt++ < 500) {
    // Clear of the chart's edge as well as of land: the edge is a shore too.
    const i = 4 + Math.floor(rand() * (W - 8));
    const j = 4 + Math.floor(rand() * (H - 8));
    const t = tiles[idx(i, j)];
    if (t !== DEEP && t !== SHALLOW) continue;
    // In open water, with room to pass on either side: never wedged against a beach.
    if (dist[idx(i, j)] < 3) continue;
    if ([...ports, lighthouse].some((p) => Math.hypot(p.bx - i - 0.5, p.by - j - 0.5) < 5)) continue;
    if (rocks.some((r) => Math.hypot(r.x - i - 0.5, r.y - j - 0.5) < 3)) continue;
    rocks.push({ x: i + 0.5, y: j + 0.5, i, j, kind: rand() < 0.6 ? 'rock035' : rand() < 0.5 ? 'rock036' : 'rock025' });
  }
  // Props on land: palms and pines, and a few houses at each port.
  const props = [];
  for (const is of islands) {
    if (is.kind === 'lighthouse') continue;
    const n = Math.round(is.r * 1.6);
    for (let k = 0; k < n; k++) {
      const a = rand() * Math.PI * 2;
      const rr = rand() * is.r * 0.75;
      const x = is.x + Math.cos(a) * rr;
      const y = is.y + Math.sin(a) * rr;
      const t = tiles[idx(Math.floor(x), Math.floor(y))];
      if (t !== GRASS && t !== SAND) continue;
      if (ports.some((p) => Math.hypot(p.qx - x, p.qy - y) < 2.2)) continue;
      const kind = t === SAND ? 'tree' + ['167', '168', '169'][Math.floor(rand() * 3)] : 'tree' + ['073', '081', '084', '168'][Math.floor(rand() * 4)];
      props.push({ x, y, kind });
    }
  }
  const world = { seed, tiles, islands, ports, lighthouse, rocks, props };
  world.deep = navigable(world, true);
  world.light = navigable(world, false);
  return world;
}

// For every tile, the Chebyshev distance to the nearest land tile (up to 9).
function landDistance(tiles) {
  const d = new Uint8Array(W * H).fill(9);
  const q = [];
  for (let j = 0; j < H; j++)
    for (let i = 0; i < W; i++)
      if (tiles[idx(i, j)] >= SAND) {
        d[idx(i, j)] = 0;
        q.push([i, j]);
      }
  for (let h = 0; h < q.length; h++) {
    const [i, j] = q[h];
    for (let dj = -1; dj <= 1; dj++)
      for (let di = -1; di <= 1; di++) {
        const a = i + di;
        const b = j + dj;
        if (inside(a, b) && d[idx(a, b)] > d[idx(i, j)] + 1) {
          d[idx(a, b)] = d[idx(i, j)] + 1;
          q.push([a, b]);
        }
      }
  }
  return d;
}

// A quay on an island's coast: the land tile with open deep water beyond it, facing outwards.
function placeQuay(tiles, is, rand) {
  const cands = [];
  for (let j = 1; j < H - 1; j++)
    for (let i = 1; i < W - 1; i++) {
      if (tiles[idx(i, j)] < SAND) continue;
      if (Math.hypot(i + 0.5 - is.x, j + 0.5 - is.y) > is.r + 1.5) continue;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        // Two tiles out: the berth, past the shallow ring, in deep water with deep water round it.
        const bi = i + 2 * di;
        const bj = j + 2 * dj;
        if (!inside(bi, bj) || tiles[idx(i + di, j + dj)] >= SAND) continue;
        if (tiles[idx(bi, bj)] >= SAND) continue;
        let open = true;
        for (let y = -1; y <= 1 && open; y++)
          for (let x = -1; x <= 1 && open; x++) {
            const a = bi + di + x;
            const b = bj + dj + y;
            if (!inside(a, b) || tiles[idx(a, b)] !== DEEP) open = false;
          }
        if (open) cands.push({ i, j, di, dj });
      }
    }
  if (!cands.length) return null;
  const c = cands[Math.floor(rand() * cands.length)];
  // The quay's tile becomes sand with a jetty over the shallow tile to the berth.
  tiles[idx(c.i, c.j)] = SAND;
  tiles[idx(c.i + c.di, c.j + c.dj)] = SHALLOW;
  return {
    qi: c.i,
    qj: c.j,
    qx: c.i + 0.5,
    qy: c.j + 0.5,
    dir: [c.di, c.dj],
    bx: c.i + 2 * c.di + 0.5, // the berth, where the boat ties up
    by: c.j + 2 * c.dj + 0.5,
    rx: c.i + 3 * c.di + 0.5, // the centre of the docking ring
    ry: c.j + 3 * c.dj + 0.5,
  };
}

// Tiles a boat's centre can be in. The galleon (deep) needs deep water with deep water all round
// (so its channels are at least 3 tiles wide); the dinghy any water. Rocks block both.
function navigable(world, deep) {
  const ok = new Uint8Array(W * H);
  const rock = new Set(world.rocks.map((r) => idx(r.i, r.j)));
  for (let j = 0; j < H; j++)
    for (let i = 0; i < W; i++) {
      const t = world.tiles[idx(i, j)];
      if (t >= SAND || rock.has(idx(i, j))) continue;
      if (!deep) {
        ok[idx(i, j)] = 1;
        continue;
      }
      let good = t === DEEP;
      for (let y = -1; y <= 1 && good; y++)
        for (let x = -1; x <= 1 && good; x++) {
          const a = i + x;
          const b = j + y;
          if (!inside(a, b) || world.tiles[idx(a, b)] !== DEEP || rock.has(idx(a, b))) good = false;
        }
      if (good) ok[idx(i, j)] = 1;
    }
  return ok;
}

// Shortest path length in tiles (8-way) between two points over a navigability map, or Infinity.
export function routeLength(nav, ax, ay, bx, by) {
  const s = idx(Math.floor(ax), Math.floor(ay));
  const t = idx(Math.floor(bx), Math.floor(by));
  if (!nav[s] || !nav[t]) return Infinity;
  const dist = new Float32Array(W * H).fill(Infinity);
  dist[s] = 0;
  // Dijkstra on a small grid with a simple bucket queue.
  const open = [s];
  while (open.length) {
    let bi = 0;
    for (let k = 1; k < open.length; k++) if (dist[open[k]] < dist[open[bi]]) bi = k;
    const u = open.splice(bi, 1)[0];
    if (u === t) return dist[u];
    const ui = u % W;
    const uj = (u - ui) / W;
    for (let dj = -1; dj <= 1; dj++)
      for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const a = ui + di;
        const b = uj + dj;
        if (!inside(a, b) || !nav[idx(a, b)]) continue;
        if (di && dj && (!nav[idx(ui + di, uj)] || !nav[idx(ui, uj + dj)])) continue;
        const nd = dist[u] + (di && dj ? Math.SQRT2 : 1);
        if (nd < dist[idx(a, b)]) {
          if (dist[idx(a, b)] === Infinity) open.push(idx(a, b));
          dist[idx(a, b)] = nd;
        }
      }
  }
  return Infinity;
}

// The ring's centre is where routes start and end.
const ringOf = (p) => [p.rx, p.ry];

// Check a generated sea; returns the starting wind (the direction it blows towards) or null.
function check(world, polarAt, topSpeed, firstLimit) {
  const all = [...world.ports, world.lighthouse];
  const [sx, sy] = ringOf(world.ports[0]);
  for (const p of all) if (routeLength(world.deep, sx, sy, ...ringOf(p)) === Infinity) return null;
  // The finale is a real passage.
  if (routeLength(world.deep, sx, sy, ...ringOf(world.lighthouse)) < 44) return null;
  for (const p of world.ports) if (routeLength(world.light, sx, sy, ...ringOf(p)) === Infinity) return null;
  // The first contract: the nearest port, put on a beam reach by the starting wind.
  let best = null;
  for (const p of world.ports.slice(1)) {
    const len = routeLength(world.light, sx, sy, ...ringOf(p));
    if (len < 8) return null; // ports this close make a dull first hop
    if (!best || len < best.len) best = { p, len };
  }
  const bearing = Math.atan2(best.p.ry - sy, best.p.rx - sx);
  const wind = wrap(bearing + Math.PI / 2 * (hashSeed(String(world.seed)) & 1 ? 1 : -1));
  const off = Math.abs(wrap(bearing - (wind + Math.PI)));
  const time = best.len / (topSpeed * polarAt(off));
  if (time >= firstLimit) return null;
  world.first = { port: best.p.id, len: best.len, time };
  return wind;
}

// The archipelago for a seed: the same every time. Tries seed, seed:1, seed:2 … until one checks
// out. polarAt(angleOffWind) is the dinghy's speed fraction; topSpeed in tiles a second.
export function makeWorld(seed, { polarAt, topSpeed, firstLimit = 40 }) {
  let last = null;
  for (let k = 0; k < 50; k++) {
    const s = k ? `${seed}:${k}` : String(seed);
    const w = attempt(s);
    if (!w) continue;
    last = w;
    const wind = check(w, polarAt, topSpeed, firstLimit);
    if (wind === null) continue;
    w.seed = String(seed);
    w.attempt = k;
    w.wind = wind;
    return w;
  }
  // Never seen in testing; a sea that at least plays.
  last.seed = String(seed);
  last.wind = 0;
  last.attempt = 50;
  return last;
}

export const tileAt = (world, x, y) => {
  const i = Math.floor(x);
  const j = Math.floor(y);
  return inside(i, j) ? world.tiles[idx(i, j)] : SAND; // the edge of the chart is land
};
export const navAt = (nav, x, y) => {
  const i = Math.floor(x);
  const j = Math.floor(y);
  return inside(i, j) ? nav[idx(i, j)] === 1 : false;
};

// The nearest tile centre to (x, y) on a navigability map (for a spilled crate), at least
// `clearOf` tiles from every point in `avoid` (the rocks), so fetching it never means hitting one.
export function nearestNav(nav, x, y, avoid = [], clearOf = 0) {
  let best = null;
  for (let r = 0; r < 12 && !best; r++)
    for (let j = Math.floor(y) - r; j <= Math.floor(y) + r; j++)
      for (let i = Math.floor(x) - r; i <= Math.floor(x) + r; i++) {
        if (!inside(i, j) || !nav[idx(i, j)]) continue;
        if (avoid.some((q) => Math.hypot(q.x - i - 0.5, q.y - j - 0.5) < clearOf)) continue;
        const d = Math.hypot(i + 0.5 - x, j + 0.5 - y);
        if (!best || d < best.d) best = { x: i + 0.5, y: j + 0.5, d };
      }
  return best ? { x: best.x, y: best.y } : { x, y };
}

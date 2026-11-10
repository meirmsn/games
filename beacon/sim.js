// Beacon's rules: a storm night on one coast, with no DOM, so tests and the playtest autopilot run
// it in Node. The game (game.js) draws it and feeds it the player's input.
//
//   const s = createNight(0, 1);                  // coast 0, night 1 (the seed)
//   step(s, dt, { target, swing });               // target: a beam angle to swing to; swing: -1, 0, 1 (keys)
//   for (const e of s.events.splice(0)) ...       // what happened: horn, home, wreck, lost, gale, fog, dawn
//
// The sea is a plane in "sea units": x across (0 to 100), y down from the field's top edge (0) to
// the breakwater (300), then the harbour and the town. It is isotropic: the game squashes it 2:1 on
// screen, the isometric look. Angles are on the plane: a heading h points along (cos h, sin h), so
// π/2 runs down the screen. The beam's angle a is its elevation, 0 pointing right along the
// breakwater, π/2 straight up the bay, so it points along (cos a, -sin a).

const D = Math.PI / 180;

// Every knob in one place. Times in seconds, distances in sea units, angles in radians.
export const TUNE = {
  fieldW: 100,
  seaH: 300, // the breakwater's line; the mouth is a gap in it
  fieldH: 380, // down to the bottom of the town
  lamp: { x: 50, y: 303 }, // just inside the mouth, on the lighthouse pier
  beamHalf: 8 * D,
  swingMax: 120 * D, // a second
  dragPerPx: 0.4 * D,
  keySwing: 90 * D,
  sweep: 45 * D, // a second: the lamp turns on its own while nobody holds it
  sweepResume: 0.6, // after letting go, the lamp waits this long before it turns on its own
  reach: 360,
  fogReach: 0.5, // of the reach, in fog
  night: 210,
  lastArrival: 190,
  hardEnd: 240,
  warn: 2, // an arrival's lantern shows this long before it comes in
  fairAhead: 4, // no ship comes in on a heading that, left alone, reaches a hazard this soon
  fairAheadFog: 8,
  calmUntil: 25, // left alone, no ship wrecks before this
  maxOnSea: 4,
  maxInWave: 5,
  ships: {
    freighter: { speed: 12, turn: 25 * D, crew: 3, r: 4 },
    cutter: { speed: 22, turn: 90 * D, crew: 2, r: 2.5 },
    lifeboat: { speed: 9, turn: Infinity, crew: 0, r: 1.6 },
  },
  lifeDark: 12, // a lifeboat's lantern is out after this long in the dark, in all
  demoY: 236, // the first freighter starts here, in the beam: home in about 6 s
  demoHold: 6,
  fog: { at: 90, dur: 30 },
  gale: { at: 150, warn: 2, dur: 6, push: 7 },
  wave: [172, 190],
  stars: [0.6, 0.85],
  assistBeam: 1 * D,
  assistCurrent: 0.9,
  dt: 1 / 120,
};

// The five coasts, hand-made: each a bay with cliffs ([y, x] points, the land beyond them), rocks
// ({x, y, r}: r is the surf ring a ship touches), one gap (two rock indices) a ship can thread for
// a close call, and a current: the way it flows (an angle), its speed and how fast it turns an
// unlit ship's heading.
export const COASTS = [
  {
    name: 'Lantern Cove',
    mouth: 9,
    current: { dir: 0, speed: 1.0, bend: 4.5 * D },
    left: [[0, 2], [100, 6], [200, 4], [300, 8]],
    right: [[0, 98], [100, 93], [200, 96], [300, 92]],
    rocks: [{ x: 22, y: 150, r: 5 }, { x: 82, y: 200, r: 6 }, { x: 72, y: 84, r: 4 }, { x: 26.2, y: 242.7, r: 2 }, { x: 37.8, y: 239.3, r: 2 }],
    gap: [3, 4],
  },
  {
    name: 'Twin Reefs',
    mouth: 8.5,
    current: { dir: Math.PI, speed: 1.2, bend: 5 * D },
    left: [[0, 3], [90, 8], [180, 5], [300, 10]],
    right: [[0, 97], [110, 94], [220, 92], [300, 90]],
    rocks: [{ x: 24, y: 96, r: 5 }, { x: 76, y: 128, r: 5 }, { x: 20, y: 236, r: 4 }, { x: 80, y: 246, r: 5 }, { x: 61.1, y: 224.7, r: 2 }, { x: 72.9, y: 227.3, r: 2 }],
    gap: [4, 5],
  },
  {
    name: 'The Narrows',
    mouth: 8.5,
    current: { dir: 0, speed: 1.4, bend: 5.5 * D },
    left: [[0, 2], [110, 8], [160, 24], [210, 10], [300, 6]],
    right: [[0, 98], [110, 92], [160, 76], [210, 90], [300, 94]],
    rocks: [{ x: 72, y: 60, r: 5 }, { x: 24, y: 246, r: 4 }, { x: 76, y: 250, r: 4 }, { x: 33.0, y: 203.7, r: 2 }, { x: 45.0, y: 202.3, r: 2 }],
    gap: [3, 4],
  },
  {
    name: 'Rock Garden',
    mouth: 8,
    current: { dir: Math.PI, speed: 1.2, bend: 5 * D },
    left: [[0, 3], [100, 6], [200, 9], [300, 6]],
    right: [[0, 97], [100, 95], [200, 91], [300, 94]],
    rocks: [
      { x: 22, y: 70, r: 4 },
      { x: 60, y: 150, r: 3 },
      { x: 80, y: 96, r: 5 },
      { x: 30, y: 136, r: 5 },
      { x: 72, y: 170, r: 4 },
      { x: 20, y: 200, r: 4 },
      { x: 65.3, y: 236.2, r: 2 },
      { x: 76.7, y: 239.8, r: 2 },
      { x: 86, y: 270, r: 3 },
    ],
    gap: [6, 7],
  },
  {
    name: 'Gale Point',
    mouth: 7.5,
    current: { dir: 0, speed: 1.5, bend: 5 * D },
    left: [[0, 2], [80, 10], [150, 4], [230, 12], [300, 8]],
    right: [[0, 98], [70, 90], [160, 96], [240, 88], [300, 92]],
    rocks: [{ x: 28, y: 92, r: 5 }, { x: 76, y: 132, r: 5 }, { x: 24, y: 214, r: 4 }, { x: 78, y: 224, r: 4 }, { x: 26.4, y: 252.1, r: 2 }, { x: 37.6, y: 247.9, r: 2 }],
    gap: [4, 5],
  },
];

// The night's arrivals before the seed jitters them: [time, kind]. Quieter spells come before each
// set piece (the first cutter at 45 s, fog at 90 s, the gale at 150 s, the last wave at 180 s).
const SCHEDULE = [
  [0, 'freighter'],
  [10, 'freighter'],
  [16, 'freighter'],
  [24, 'freighter'],
  [31, 'freighter'],
  [41, 'cutter'],
  [52, 'freighter'],
  [58, 'freighter'],
  [64, 'cutter'],
  [71, 'freighter'],
  [77, 'freighter'],
  [93, 'freighter'],
  [101, 'cutter'],
  [108, 'freighter'],
  [115, 'freighter'],
  [128, 'freighter'],
  [136, 'cutter'],
  [152, 'freighter'],
  [158, 'freighter'],
  [164, 'cutter'],
  [172, 'freighter'],
  [175, 'cutter'],
  [178, 'freighter'],
  [181, 'cutter'],
  [184, 'freighter'],
];

// A small seeded random: the same coast and night always give the same arrivals.
export function rng(seed) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// Where the land starts on each side at a depth y.
function edgeAt(points, y) {
  if (y <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) {
    const [y1, x1] = points[i];
    const [y0, x0] = points[i - 1];
    if (y <= y1) return x0 + ((x1 - x0) * (y - y0)) / (y1 - y0);
  }
  return points[points.length - 1][1];
}
export const leftAt = (coast, y) => edgeAt(coast.left, y);
export const rightAt = (coast, y) => edgeAt(coast.right, y);

export function createNight(coastIndex = 0, night = 1, { assist = 0 } = {}) {
  const coast = COASTS[coastIndex] || COASTS[0];
  const seed = (coastIndex + 1) * 7919 + night * 104729;
  const rand = rng(seed);
  const a = Math.min(1, assist);
  const current = {
    dir: coast.current.dir,
    speed: coast.current.speed * (a ? TUNE.assistCurrent : 1),
    bend: coast.current.bend * (a ? TUNE.assistCurrent : 1),
  };
  const queue = SCHEDULE.map(([t, kind], i) => ({
    t: i < 2 || t >= TUNE.wave[0] ? t : t + (rand() - 0.5) * 3,
    kind,
    crew: TUNE.ships[kind].crew,
  }));
  const total = queue.reduce((n, q) => n + q.crew, 0);
  const s = {
    coastIndex,
    coast,
    night,
    seed,
    rand,
    current,
    beamHalf: TUNE.beamHalf + a * TUNE.assistBeam,
    assist: a,
    t: 0,
    acc: 0,
    beam: { a: Math.PI / 2, target: Math.PI / 2, dir: 1, free: 0 },
    ships: [], // on the sea: ships and lifeboats
    pending: [], // lanterns at the top edge, about to come in
    moored: [], // home, in the harbour
    wrecks: [], // for drawing: where ships went down, and when
    queue,
    total,
    home: 0, // sailors home (the windows)
    closeCalls: 0, // the crews of ships home through the coast's gap
    lost: 0,
    wrecked: 0,
    threaded: 0,
    gale: { side: rand() < 0.5 ? -1 : 1 },
    events: [],
    nextId: 1,
    over: false,
    firstWreckT: null,
  };
  // The first freighter starts in the beam, close to home: it shows what the beam does.
  const first = s.queue.shift();
  const x = 50 + (rand() - 0.5) * 10;
  const ship = addShip(s, first.kind, x, TUNE.demoY, 0, first.crew);
  ship.h = Math.atan2(TUNE.lamp.y - ship.y, TUNE.lamp.x - ship.x);
  s.beam.a = s.beam.target = clampBeam(s, bearingOf(ship.x, ship.y));
  // The lamp holds on it until it's home, then starts to turn.
  s.beam.free = -TUNE.demoHold;
  return s;
}

function addShip(s, kind, x, y, h, crew) {
  const ship = { id: s.nextId++, kind, x, y, h, crew, lit: false, dark: 0, gapSide: null, threaded: false, born: s.t };
  s.ships.push(ship);
  return ship;
}

// The beam's angle that points at a sea point.
export function bearingOf(x, y) {
  return Math.atan2(TUNE.lamp.y - y, x - TUNE.lamp.x);
}

export function reachOf(s) {
  return TUNE.reach * (fogOn(s) ? TUNE.fogReach : 1);
}
export const fogOn = (s) => s.t >= TUNE.fog.at && s.t < TUNE.fog.at + TUNE.fog.dur;
export const galeWarn = (s) => s.t >= TUNE.gale.at - TUNE.gale.warn && s.t < TUNE.gale.at;
export const galeOn = (s) => s.t >= TUNE.gale.at && s.t < TUNE.gale.at + TUNE.gale.dur;

// Is a point (with a radius) in the beam?
export function inBeam(s, x, y, r = 0) {
  const d = Math.hypot(x - TUNE.lamp.x, y - TUNE.lamp.y);
  if (d > reachOf(s) || y > TUNE.seaH + 4) return false;
  const off = Math.abs(wrapAngle(bearingOf(x, y) - s.beam.a));
  return off <= s.beamHalf + Math.atan2(r, Math.max(d, 1));
}

// What a ship would hit, if anything: 'rock' (with the rock), 'cliff', 'wall'; or 'home'.
function hazardAt(s, x, y, r) {
  const c = s.coast;
  for (const rock of c.rocks) if (Math.hypot(x - rock.x, y - rock.y) < rock.r + r) return { kind: 'rock', rock };
  if (y > 2) {
    if (x - r < leftAt(c, y)) return { kind: 'cliff', side: -1 };
    if (x + r > rightAt(c, y)) return { kind: 'cliff', side: 1 };
  }
  if (y >= TUNE.seaH && Math.abs(x - TUNE.lamp.x) <= c.mouth) return { kind: 'home' };
  // The breakwater: a ship whose middle is outside the mouth as she reaches it hits the wall.
  if (y + r * 0.5 >= TUNE.seaH && y < TUNE.seaH + r && Math.abs(x - TUNE.lamp.x) > c.mouth) return { kind: 'wall' };
  return null;
}

// Where a ship left alone would be in `secs`, and whether it hits something first. For the
// fairness check and the autopilot.
export function driftHits(s, kind, x, y, h, secs) {
  return driftClear(s, kind, x, y, h, secs) < secs;
}

// How long a ship left alone stays clear of trouble, up to `secs`.
export function driftClear(s, kind, x, y, h, secs) {
  const sp = TUNE.ships[kind];
  const dt = 1 / 20;
  for (let t = 0; t < secs; t += dt) {
    h = turnTowards(h, s.current.dir, s.current.bend * dt);
    x += (Math.cos(h) * sp.speed + Math.cos(s.current.dir) * s.current.speed) * dt;
    y += (Math.sin(h) * sp.speed + Math.sin(s.current.dir) * s.current.speed) * dt;
    const hz = hazardAt(s, x, y, sp.r);
    if (hz?.kind === 'home') return secs;
    if (hz) return t;
  }
  return secs;
}

export function turnTowards(h, target, max) {
  const d = wrapAngle(target - h);
  return Math.abs(d) <= max ? target : h + Math.sign(d) * max;
}

// Ships on the sea, counting lanterns about to come in.
export const onSea = (s) => s.ships.length + s.pending.length;

export function step(s, dt, input = {}) {
  if (s.over) return;
  s.acc += Math.min(dt, 0.25);
  // Held (a finger, the mouse or a key) the beam goes where it's sent; let go, it sweeps on its own.
  const held = !!input.hold || !!input.swing || (input.target !== undefined && input.target !== null);
  s.beam.held = held;
  if (input.target !== undefined && input.target !== null) s.beam.target = clampBeam(s, input.target);
  if (input.swing) {
    s.beam.target = clampBeam(s, s.beam.a - input.swing * TUNE.keySwing * Math.min(dt, 0.25));
    s.beam.dir = -Math.sign(input.swing);
  }
  const h = s.fixedDt || TUNE.dt;
  while (s.acc >= h && !s.over) {
    s.acc -= h;
    tick(s, h);
  }
}

// The beam reaches only as low as the mouth lets a ship through: a ship steering for the lamp from
// any bearing in the beam clears the breakwater.
export function beamLimits(s) {
  const lim = Math.atan2(TUNE.lamp.y - TUNE.seaH, s.coast.mouth - TUNE.ships.freighter.r) + s.beamHalf;
  return [lim, Math.PI - lim];
}
export function clampBeam(s, a) {
  const [lo, hi] = beamLimits(s);
  return Math.max(lo, Math.min(hi, a));
}

function tick(s, dt) {
  s.t += dt;
  // The beam follows its target, no faster than the cap.
  const bm = s.beam;
  if (bm.held) {
    bm.free = 0;
    const was = bm.a;
    bm.a = clampBeam(s, turnTowards(bm.a, bm.target, TUNE.swingMax * dt));
    if (bm.a !== was) bm.dir = Math.sign(bm.a - was);
  } else {
    bm.free += dt;
    if (bm.free >= TUNE.sweepResume) {
      const [lo, hi] = beamLimits(s);
      bm.a += bm.dir * TUNE.sweep * dt;
      if (bm.a >= hi) (bm.a = hi), (bm.dir = -1);
      if (bm.a <= lo) (bm.a = lo), (bm.dir = 1);
    }
    bm.target = bm.a;
  }

  const crossed = (at) => s.t >= at && s.t - dt < at;
  if (crossed(TUNE.gale.at - TUNE.gale.warn)) s.events.push({ type: 'galeWarn', side: s.gale.side });
  if (crossed(TUNE.gale.at)) s.events.push({ type: 'gale', side: s.gale.side });
  if (crossed(TUNE.fog.at)) s.events.push({ type: 'fog' });

  const cur = s.current;
  const cx = Math.cos(cur.dir) * cur.speed;
  const cy = Math.sin(cur.dir) * cur.speed;
  const gx = galeOn(s) ? s.gale.side * TUNE.gale.push : 0;
  for (const ship of [...s.ships]) {
    const sp = TUNE.ships[ship.kind];
    ship.lit = inBeam(s, ship.x, ship.y, sp.r);
    const px = ship.x;
    const py = ship.y;
    if (ship.kind === 'lifeboat') {
      if (ship.lit) {
        ship.h = Math.atan2(TUNE.lamp.y - ship.y, TUNE.lamp.x - ship.x);
        ship.x += Math.cos(ship.h) * sp.speed * dt;
        ship.y += Math.sin(ship.h) * sp.speed * dt;
      } else {
        ship.dark += dt;
      }
      ship.x += (cx + gx) * dt;
      ship.y = Math.max(1, ship.y + cy * dt);
    } else {
      if (ship.lit) ship.h = turnTowards(ship.h, Math.atan2(TUNE.lamp.y - ship.y, TUNE.lamp.x - ship.x), sp.turn * dt);
      else ship.h = turnTowards(ship.h, cur.dir, cur.bend * dt);
      ship.x += (Math.cos(ship.h) * sp.speed + cx + gx) * dt;
      ship.y += (Math.sin(ship.h) * sp.speed + cy) * dt;
    }
    checkGap(s, ship, px, py);
    const hz = hazardAt(s, ship.x, ship.y, sp.r);
    if (hz?.kind === 'home') comeHome(s, ship);
    else if (hz && ship.kind === 'lifeboat') slide(s, ship, hz, sp.r, px, py);
    else if (hz) wreck(s, ship, hz);
    else if (ship.kind === 'lifeboat' && ship.dark >= TUNE.lifeDark) loseLifeboat(s, ship);
  }
  arrivals(s); // after the ships move, so a ship coming home never leaves the sea empty for a tick
  // Ships never wreck each other: two that touch are eased apart.
  for (let i = 0; i < s.ships.length; i++)
    for (let j = i + 1; j < s.ships.length; j++) {
      const a = s.ships[i];
      const b = s.ships[j];
      const min = TUNE.ships[a.kind].r + TUNE.ships[b.kind].r;
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d < min && d > 0) {
        const push = (min - d) / 2;
        a.x += ((a.x - b.x) / d) * push;
        a.y += ((a.y - b.y) / d) * push;
        b.x -= ((a.x - b.x) / d) * push;
        b.y -= ((a.y - b.y) / d) * push;
      }
    }
  // Dawn: at the night's length once the sea is empty, or at the hard end whatever is left.
  if ((s.t >= TUNE.night && onSea(s) === 0 && !s.queue.length) || s.t >= TUNE.hardEnd) {
    s.over = true;
    s.stars = starsOf(s);
    s.events.push({ type: 'dawn', stars: s.stars });
  }
}

export function starsOf(s) {
  const f = s.total ? s.home / s.total : 0;
  if (s.home === s.total && s.wrecked === 0) return 3;
  if (f >= TUNE.stars[1]) return 2;
  if (f >= TUNE.stars[0]) return 1;
  return 0;
}

// Keep the sea busy but never crowded, and show each arrival's lantern before it comes in.
function arrivals(s) {
  const next = s.queue[0];
  if (next && s.t < TUNE.lastArrival) {
    // An empty sea brings the next lantern now (it counts as on the sea from the moment it shows).
    if (onSea(s) === 0 && next.t - TUNE.warn > s.t) next.t = s.t + TUNE.warn;
    const cap = next.t >= TUNE.wave[0] ? TUNE.maxInWave : TUNE.maxOnSea;
    if (onSea(s) >= cap && next.t - TUNE.warn <= s.t) next.t = s.t + TUNE.warn + 0.1;
  }
  if (next && s.t >= next.t - TUNE.warn) {
    const entry = fairEntry(s, next.kind);
    // No fair way in just now: try again in a moment, unless the sea would be empty.
    if (!entry.fair && onSea(s) > 0) {
      next.t = s.t + TUNE.warn + 0.5;
      return;
    }
    s.queue.shift();
    const { x, h } = entry;
    s.pending.push({ ...next, t: Math.max(next.t, s.t + TUNE.warn), x, h });
    s.events.push({ type: 'horn', x, kind: next.kind });
  }
  for (const p of [...s.pending])
    if (s.t >= p.t) {
      s.pending.splice(s.pending.indexOf(p), 1);
      addShip(s, p.kind, p.x, -TUNE.ships[p.kind].r, p.h, p.crew);
    }
}

function fairEntry(s, kind) {
  const enter = s.t + TUNE.warn;
  // Left alone, nothing wrecks before calmUntil; in fog the beam can't reach the top, so longer.
  let ahead = Math.max(TUNE.fairAhead, TUNE.calmUntil - enter);
  if (enter + ahead > TUNE.fog.at && enter < TUNE.fog.at + TUNE.fog.dur) ahead = Math.max(ahead, TUNE.fairAheadFog);
  const y = -TUNE.ships[kind].r;
  let best = null;
  for (let k = 0; k < 120; k++) {
    const x = 18 + s.rand() * 64;
    // Heading in, sometimes a little against the current, sometimes for the lamp.
    const h =
      k % 3 === 2
        ? Math.atan2(TUNE.lamp.y - y, TUNE.lamp.x - x) + (s.rand() - 0.5) * 0.2
        : Math.PI / 2 - Math.cos(s.current.dir) * (s.rand() * 0.5) + (s.rand() - 0.5) * 0.3;
    const clear = driftClear(s, kind, x, y, h, ahead);
    if (clear >= ahead) return { x, h, fair: true };
    if (!best || clear > best.clear) best = { x, h, clear };
  }
  return best;
}

// A ship crossing the line between the gap's two rocks has threaded it.
function checkGap(s, ship, px, py) {
  const [a, b] = s.coast.gap.map((i) => s.coast.rocks[i]);
  const side = (x, y) => Math.sign((b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x));
  const s0 = side(px, py);
  const s1 = side(ship.x, ship.y);
  if (s0 !== s1 && s0 !== 0) {
    // Between the rocks, not round the outside of one.
    const t = ((ship.x - a.x) * (b.x - a.x) + (ship.y - a.y) * (b.y - a.y)) / ((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
    if (t > 0 && t < 1 && !ship.threaded) {
      ship.threaded = true;
      s.events.push({ type: 'gap', id: ship.id, x: ship.x, y: ship.y });
    }
  }
}

function comeHome(s, ship) {
  s.ships.splice(s.ships.indexOf(ship), 1);
  const from = s.home;
  s.home += ship.crew;
  if (ship.threaded) {
    s.threaded++;
    s.closeCalls += ship.crew;
  }
  s.moored.push({ id: ship.id, kind: ship.kind, x: ship.x, y: ship.y, h: ship.h, t: s.t, slot: s.moored.length });
  s.events.push({ type: 'home', id: ship.id, kind: ship.kind, crew: ship.crew, from, threaded: ship.threaded });
}

function wreck(s, ship, hz) {
  s.ships.splice(s.ships.indexOf(ship), 1);
  s.wrecked++;
  if (s.firstWreckT === null) s.firstWreckT = s.t;
  s.wrecks.push({ id: ship.id, kind: ship.kind, x: ship.x, y: ship.y, h: ship.h, t: s.t });
  // The crew put off in a lifeboat, clear of what she hit.
  let x = ship.x;
  let y = ship.y;
  const r = TUNE.ships.lifeboat.r;
  if (hz.kind === 'rock') {
    const d = Math.hypot(x - hz.rock.x, y - hz.rock.y) || 1;
    const k = hz.rock.r + r + 3;
    x = hz.rock.x + ((x - hz.rock.x) / d) * k;
    y = hz.rock.y + ((y - hz.rock.y) / d) * k;
  } else if (hz.kind === 'cliff') {
    x -= hz.side * (TUNE.ships[ship.kind].r + 4);
  } else {
    y = TUNE.seaH - r - 4;
  }
  const boat = addShip(s, 'lifeboat', x, Math.max(2, y), ship.h, ship.crew);
  if (hazardAt(s, boat.x, boat.y, r)) slide(s, boat, hazardAt(s, boat.x, boat.y, r), r, boat.x, boat.y);
  s.events.push({ type: 'wreck', id: ship.id, kind: ship.kind, x: ship.x, y: ship.y, crew: ship.crew, boat: boat.id });
}

// A lifeboat bumps along rocks, cliffs and the breakwater instead of wrecking.
function slide(s, boat, hz, r, px, py) {
  if (hz.kind === 'rock') {
    const d = Math.hypot(boat.x - hz.rock.x, boat.y - hz.rock.y) || 1;
    boat.x = hz.rock.x + ((boat.x - hz.rock.x) / d) * (hz.rock.r + r + 0.01);
    boat.y = hz.rock.y + ((boat.y - hz.rock.y) / d) * (hz.rock.r + r + 0.01);
  } else if (hz.kind === 'cliff') {
    boat.x = hz.side < 0 ? leftAt(s.coast, boat.y) + r + 0.01 : rightAt(s.coast, boat.y) - r - 0.01;
  } else if (hz.kind === 'wall') {
    boat.y = Math.min(py, TUNE.seaH - r - 0.01);
  }
  boat.y = Math.max(boat.y, 1);
}

function loseLifeboat(s, boat) {
  s.ships.splice(s.ships.indexOf(boat), 1);
  s.lost += boat.crew;
  s.events.push({ type: 'lost', id: boat.id, crew: boat.crew, x: boat.x, y: boat.y });
}

// --- The autopilot: the playtest's and the tests' player. It looks ahead with copies of the night.
// Each half second it tries holding the beam on each ship in turn for a while and picks the choice
// that saves the most.
export function cloneNight(s) {
  const c = structuredClone({ ...s, rand: null, events: [] });
  c.rand = () => 0.5;
  c.coast = s.coast;
  c.fixedDt = 1 / 30; // coarser: it's only looking ahead
  return c;
}

function score(s) {
  let v = s.home * 10 - s.wrecked * 8 - s.lost * 10;
  for (const b of s.ships) {
    if (b.kind === 'lifeboat') v -= b.dark * 0.6;
    // A ship left heading for trouble counts against the choice.
    else if (driftHits(s, b.kind, b.x, b.y, b.h, 3)) v -= 4;
  }
  return v;
}

export function autopilotTarget(s, { look = 7 } = {}) {
  const options = s.ships.filter((b) => b.y > -2);
  if (!options.length) return null;
  let best = null;
  const tries = [];
  for (const ship of options) for (const hold of [1, 2.5]) tries.push({ ship, hold });
  tries.push({ ship: null, hold: 0 }); // let the lamp sweep
  for (const { ship, hold } of tries) {
    const c = cloneNight(s);
    c.queue = [];
    c.pending = [];
    for (let t = 0; t < look; t += 1 / 20) {
      const b = ship && c.ships.find((x) => x.id === ship.id);
      step(c, 1 / 20, b && t < hold ? { hold: true, target: bearingOf(b.x, b.y) } : {});
      if (c.over) break;
    }
    const v = score(c) - hold * 0.01;
    if (!best || v > best.v) best = { v, ship };
  }
  return best.ship ? bearingOf(best.ship.x, best.ship.y) : null;
}

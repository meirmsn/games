// Trundle's physics: one attempt at one room, deterministic, with no DOM.
//
// Matter.js (vendored, matter.min.js) does the physics; it's loaded as a classic script before
// this module, so it's on globalThis. An attempt rebuilds the world from scratch and resets
// Matter's id counter, then steps at a fixed 1/120 s whatever the display rate.
//
// Trundle drives along his girder (or stands still) and drops the room's balls, red and blue, one
// every 2.5 s. The rooms' green planks are switches: each pivots on its bolt between two angles, and
// a tap flips it. A ball touching a plank as it flips is thrown with the plank's surface speed: the
// flick. Every tap is applied at the start of the next step and logged with that step's number, so
// replaying the room and the log gives the same attempt, step for step.
//
// Room units: the board is W × H units, y grows downward; physics uses S px a unit.

export const W = 10;
export const H = 16;
export const S = 50;
export const STEP = 1 / 120;
export const VMAX = 18; // a ball's top speed, units a second
export const BALL_R = 0.3;
export const CUP_W = 0.65; // a ball whose centre is between a cup's lips, below its rim, is in
export const TOUCH_R = 0.6; // ball centre to a star or the key
export const REST_SPEED = 0.5;
export const REST_TIME = 1.2; // seconds at rest (or rocking in place) before a ball pops
export const FIRST_DROP = 90; // steps: the first ball drops after 0.75 s
export const DROP_EVERY = 300; // steps: then one every 2.5 s
export const LAST_BALL_TIME = 10; // seconds a ball may live after the last one drops
export const GIRDER_H = 0.5;
export const PLANK = { w: 2.6, h: 0.5 };
export const SWING = 8; // steps a flip takes (about 67 ms)
export const FLICK = 1.15; // how much of the plank's surface speed a touching ball takes

const M = () => globalThis.Matter;
const rad = (deg) => (deg * Math.PI) / 180;
const r3 = (v) => Math.round(v * 1000) / 1000;

export function rectPoly(b) {
  const c = Math.cos(rad(b.a || 0));
  const s = Math.sin(rad(b.a || 0));
  return [
    [-b.w / 2, -b.h / 2],
    [b.w / 2, -b.h / 2],
    [b.w / 2, b.h / 2],
    [-b.w / 2, b.h / 2],
  ].map(([px, py]) => ({ x: b.x + px * c - py * s, y: b.y + px * s + py * c }));
}

// A plank at angle a (degrees): its box.
export function plankBox(p, a) {
  return { x: p.x, y: p.y, w: p.w || PLANK.w, h: PLANK.h, a };
}

function polyBody(poly, opts) {
  const { Bodies, Vertices } = M();
  const verts = poly.map((p) => ({ x: p.x * S, y: p.y * S }));
  const c = Vertices.centre(verts);
  return Bodies.fromVertices(c.x, c.y, [verts], opts);
}

// Trundle's girder: a fixed block along the top that he drives along.
export function girderBox(room) {
  const g = room.girder;
  return { x: (g.x1 + g.x2) / 2, y: g.y + GIRDER_H / 2, w: g.x2 - g.x1 + 1.6, h: GIRDER_H };
}

// The blue flap hangs from its pin at (x, y); at angle a (radians) its centre is len/2 below.
export const FLAP_W = 0.5;
export function flapBox(f, a = 0) {
  return { x: f.x - Math.sin(a) * (f.len / 2), y: f.y + Math.cos(a) * (f.len / 2), w: FLAP_W, h: f.len, a: (a * 180) / Math.PI };
}

const STATIC = { isStatic: true, friction: 0.08, frictionStatic: 0, restitution: 0.25 };

// Distance from a point to a polygon's edge (0 inside).
export function distToPoly(pt, pts) {
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

// One attempt. Taps, each applied at the start of the next step and logged as {s, op: 'flip', i}.
// assist: 0..0.2, the cups' extra width share. probe: run every ball out, whatever the cups (for
// designing rooms).
export function createAttempt(room, { assist = 0, probe = false } = {}) {
  const { Engine, Bodies, Body, Composite, Constraint, Events, Common } = M();
  Common._nextId = 0;
  Common._seed = 0;
  const engine = Engine.create({ enableSleeping: false, positionIterations: 10, velocityIterations: 8 });
  engine.gravity.y = 1;
  const world = engine.world;
  const add = (b, kind) => {
    b.kind = kind;
    Composite.add(world, b);
    return b;
  };
  for (const f of room.fixed) add(polyBody(rectPoly(f), STATIC), 'fixed');
  add(polyBody(rectPoly(girderBox(room)), STATIC), 'fixed');
  add(Bodies.rectangle(-0.5 * S, (H / 2) * S, S, H * 2 * S, STATIC), 'wall');
  add(Bodies.rectangle((W + 0.5) * S, (H / 2) * S, S, H * 2 * S, STATIC), 'wall');
  add(Bodies.rectangle((W / 2) * S, -0.5 * S, W * 3 * S, S, STATIC), 'wall');
  // Each cup has a lip on either side, so a ball rolling fast still drops in rather than skipping.
  for (const c of room.cups) {
    add(Bodies.rectangle((c.x - 0.75) * S, (c.y + 0.1) * S, 0.2 * S, 0.9 * S, STATIC), 'fixed');
    add(Bodies.rectangle((c.x + 0.75) * S, (c.y + 0.1) * S, 0.2 * S, 0.9 * S, STATIC), 'fixed');
    add(Bodies.rectangle(c.x * S, (c.y + 0.6) * S, 1.7 * S, 0.2 * S, STATIC), 'fixed');
  }

  // The planks: static bodies, turned by the flips.
  const planks = room.planks.map((p, i) => {
    const a0 = p.up ? p.a1 : p.a0;
    const body = add(Bodies.rectangle(p.x * S, p.y * S, (p.w || PLANK.w) * S, PLANK.h * S, { ...STATIC, angle: rad(a0) }), 'plank');
    return { i, body, state: p.up ? 1 : 0, angle: a0, from: a0, to: a0, swing: 0 };
  });

  let flap = null;
  if (room.flap) {
    const f = room.flap;
    flap = add(
      Bodies.rectangle(f.x * S, (f.y + f.len / 2) * S, FLAP_W * S, f.len * S, {
        friction: 0.05,
        frictionStatic: 0,
        restitution: 0.15,
        frictionAir: 0.02,
        density: f.density || 0.0025,
        collisionFilter: { category: 0x0002, mask: 0x0004 },
      }),
      'flap'
    );
    Composite.add(world, Constraint.create({ pointA: { x: f.x * S, y: f.y * S }, bodyB: flap, pointB: { x: 0, y: (-f.len / 2) * S }, length: 0, stiffness: 1 }));
  }
  let crate = null;
  if (room.crate) {
    const c = room.crate;
    crate = add(Bodies.rectangle(c.x * S, c.y * S, c.w * S, c.h * S, { friction: 0.3, frictionStatic: 0.3, restitution: 0.1, density: c.density || 0.0008 }), 'crate');
  }

  const g = room.girder;
  const att = {
    room,
    steps: 0,
    t: 0,
    result: null, // 'won' | 'failed'
    trundle: { x: room.trundle.x, dir: room.trundle.dir || 1, speed: room.trundle.speed || 0 },
    seq: room.balls, // the colours, in drop order: 'r' red, 'b' blue
    balls: [], // {n, color, body, state: 'live' | 'in' | 'lost', trail, spots, restT}
    dropped: 0,
    filled: room.cups.map(() => 0),
    lostCount: 0,
    gotStar: false,
    keyed: !room.key,
    planks,
    log: [],
    pending: [],
    events: [],
    cupW: CUP_W * (1 + Math.min(0.2, Math.max(0, assist))),
    flap,
    crate,
    engine,
  };
  const lastHit = new Map();

  Events.on(engine, 'collisionStart', (e) => {
    for (const pair of e.pairs) {
      const a = pair.bodyA.parent || pair.bodyA;
      const b = pair.bodyB.parent || pair.bodyB;
      const ballA = a.kind === 'ball';
      const ballB = b.kind === 'ball';
      const crateHit = !ballA && !ballB && (a === crate || b === crate);
      if (!ballA && !ballB && !crateHit) continue;
      const other = ballA ? b : ballB ? a : a === crate ? b : a;
      const key = a.id + ':' + b.id;
      const last = lastHit.get(key);
      if (last != null && att.steps - last < 12) continue; // 100 ms
      lastHit.set(key, att.steps);
      const rel = Math.hypot(a.velocity.x - b.velocity.x, a.velocity.y - b.velocity.y) * (60 / S);
      if (rel < 0.6) continue;
      att.events.push({ type: 'hit', on: other.kind, by: crateHit ? 'crate' : 'ball', speed: rel });
    }
  });

  att.need = () => room.cups.reduce((n, c) => n + c.need, 0);
  att.inCount = () => att.filled.reduce((a, b) => a + b, 0);

  function flip(i) {
    const pk = planks[i];
    if (!pk) return;
    const p = room.planks[i];
    pk.state = 1 - pk.state;
    pk.from = pk.angle;
    pk.to = pk.state ? p.a1 : p.a0;
    pk.swing = SWING;
    // The flick: a ball touching the plank takes the plank's surface speed where it touches.
    const omega = rad(pk.to - pk.from) / (SWING * STEP); // radians a second
    const poly = rectPoly(plankBox(p, pk.angle));
    for (const b of att.balls) {
      if (b.state !== 'live') continue;
      const bx = b.body.position.x / S;
      const by = b.body.position.y / S;
      if (distToPoly({ x: bx, y: by }, poly) > BALL_R + 0.08) continue;
      const rx = bx - p.x;
      const ry = by - p.y;
      const vx = -omega * ry * FLICK;
      const vy = omega * rx * FLICK;
      Body.setVelocity(b.body, { x: b.body.velocity.x + (vx * S) / 60, y: b.body.velocity.y + (vy * S) / 60 });
      att.events.push({ type: 'flick', i, n: b.n });
    }
    att.events.push({ type: 'flip', i });
  }

  att.edit = (e) => {
    if (att.result) return;
    att.pending.push(e);
  };

  function dropBall() {
    const x = att.trundle.x;
    const color = att.seq[att.dropped];
    const body = add(
      Bodies.circle(x * S, (g.y + GIRDER_H + BALL_R + 0.05) * S, BALL_R * S, {
        friction: 0,
        frictionStatic: 0,
        frictionAir: 0.0015,
        restitution: 0.38,
        density: 0.008,
        inertia: Infinity, // it slides; the drawing spins it by the distance it travels
        collisionFilter: { category: 0x0004, mask: 0xffff },
      }),
      'ball'
    );
    Body.setVelocity(body, { x: (att.trundle.dir * att.trundle.speed * 0.5 * S) / 60, y: 0 });
    att.balls.push({ n: att.dropped, color, body, state: 'live', trail: [], spots: [], restT: 0 });
    att.dropped++;
    att.events.push({ type: 'drop', x, color });
  }

  function lose(b, why) {
    b.state = 'lost';
    Composite.remove(world, b.body);
    att.lostCount++;
    att.events.push({ type: 'lost', n: b.n, why, x: b.body.position.x / S, y: b.body.position.y / S });
  }

  att.step = () => {
    if (att.result) return;
    att.events = [];
    for (const e of att.pending) {
      att.log.push({ s: att.steps, ...e });
      if (e.op === 'flip') flip(e.i);
    }
    att.pending = [];

    // planks swing to their new angle
    for (const pk of planks) {
      if (!pk.swing) continue;
      pk.swing--;
      pk.angle = pk.to + (pk.from - pk.to) * (pk.swing / SWING);
      Body.setAngle(pk.body, rad(pk.angle));
    }

    const tr = att.trundle;
    if (tr.speed) {
      tr.x += tr.dir * tr.speed * STEP;
      if (tr.x > g.x2) (tr.x = g.x2), (tr.dir = -1);
      if (tr.x < g.x1) (tr.x = g.x1), (tr.dir = 1);
    }
    if (att.dropped < att.seq.length && att.steps >= FIRST_DROP && (att.steps - FIRST_DROP) % DROP_EVERY === 0) dropBall();

    Engine.update(engine, 1000 * STEP);
    att.steps++;
    att.t = att.steps * STEP;

    const covered = (c) => crate && Math.hypot(crate.position.x / S - c.x, crate.position.y / S - c.y) < 0.9;
    for (const b of att.balls) {
      if (b.state !== 'live') continue;
      const body = b.body;
      const sp = body.speed * (60 / S);
      if (sp > VMAX) {
        const k = VMAX / sp;
        Body.setVelocity(body, { x: body.velocity.x * k, y: body.velocity.y * k });
      }
      const x = body.position.x / S;
      const y = body.position.y / S;
      if (att.steps % 3 === 0) b.trail.push(r3(x), r3(y));
      if (room.star && !att.gotStar && Math.hypot(room.star.x - x, room.star.y - y) < TOUCH_R) {
        att.gotStar = true;
        att.events.push({ type: 'star' });
      }
      if (!att.keyed && Math.hypot(room.key.x - x, room.key.y - y) < TOUCH_R) {
        att.keyed = true;
        att.events.push({ type: 'key' });
      }
      // In a cup: between its lips, below its rim; or falling over its mouth, just above the rim.
      const ci = room.cups.findIndex(
        (c) => Math.abs(c.x - x) < att.cupW && y < c.y + 0.7 && (y > c.y - 0.3 || (y > c.y - 0.6 && body.velocity.y > 0)) && !covered(c) && (!c.locked || att.keyed)
      );
      if (ci >= 0) {
        const c = room.cups[ci];
        Composite.remove(world, body);
        if (c.color === b.color && att.filled[ci] < c.need) {
          b.state = 'in';
          b.cup = ci;
          att.filled[ci]++;
          att.events.push({ type: 'cup', n: b.n, cup: ci, x, y });
        } else {
          // the wrong colour, or a full cup: spat out, lost
          b.state = 'lost';
          att.lostCount++;
          att.events.push({ type: 'lost', n: b.n, why: 'wrong', x, y });
        }
        continue;
      }
      if (y > H + 1 || x < -1 || x > W + 1) {
        lose(b, 'out');
        continue;
      }
      if (att.steps % 60 === 0) b.spots.push(x, y);
      const n = b.spots.length;
      const rocking = n >= 8 && Math.max(...[2, 4, 6].map((k) => Math.hypot(b.spots[n - 2] - b.spots[n - 2 - k], b.spots[n - 1] - b.spots[n - 1 - k]))) < 0.4;
      b.restT = sp < REST_SPEED || (rocking && sp < 2) ? b.restT + STEP : 0; // a fast ball is never resting
      // A ball resting on a plank waits for a flick; it pops only after twice as long.
      const onPlank = planks.some((pk) => distToPoly({ x, y }, rectPoly(plankBox(room.planks[pk.i], pk.angle))) < BALL_R + 0.08);
      if (b.restT >= (onPlank ? REST_TIME * 2.5 : REST_TIME)) lose(b, 'rest');
    }

    const lastDropStep = FIRST_DROP + (att.seq.length - 1) * DROP_EVERY;
    if (att.steps > lastDropStep + LAST_BALL_TIME / STEP) for (const b of att.balls) if (b.state === 'live') lose(b, 'time');
    // The end: every cup full, or a cup can no longer be filled with the balls still to come.
    const live = att.balls.filter((b) => b.state === 'live');
    const done = room.cups.every((c, i) => att.filled[i] >= c.need);
    const left = (color) => att.seq.slice(att.dropped).split('').filter((c) => c === color).length + live.filter((b) => b.color === color).length;
    const hopeless = room.cups.some((c, i) => att.filled[i] + left(c.color) < c.need);
    if (probe) {
      // designing rooms: just run every ball out
      if (att.dropped === att.seq.length && !live.length) att.result = 'failed';
    } else if (done) {
      att.result = 'won';
      att.events.push({ type: 'won' });
    } else if (hopeless) {
      att.result = 'failed';
      att.events.push({ type: 'failed' });
    }
  };

  // The stars an attempt earns: the room cleared, at most one ball lost, the room's star touched.
  att.starCount = () => (att.result === 'won' ? 1 + (att.lostCount <= 1 ? 1 : 0) + (att.gotStar ? 1 : 0) : 0);
  return att;
}

// Replay a room from an edit log, to its end (or to step `until`).
export function replay(room, log, opts = {}, until = Infinity) {
  const att = createAttempt(room, opts);
  let i = 0;
  while (!att.result && att.steps < until) {
    while (i < log.length && log[i].s === att.steps) {
      const { s, ...e } = log[i++];
      void s;
      att.edit(e);
    }
    att.step();
  }
  return att;
}

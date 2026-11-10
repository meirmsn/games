// Trundle's physics: one attempt at one room, deterministic, with no DOM.
//
// Matter.js (vendored, matter.min.js) does the physics; it's loaded as a classic script before
// this module, so it's on globalThis. An attempt rebuilds the world from scratch and resets
// Matter's id counter, then steps at a fixed 1/120 s whatever the display rate.
//
// Trundle drives along his girder and drops a ball every 3 s. The player edits parts while balls
// fall: every edit is applied at the start of the next step and logged with that step's number, so
// replaying the room, its starting layout and the log gives the same attempt, step for step.
//
// Room units: the board is W × H units, y grows downward; physics uses S px a unit.

export const W = 10;
export const H = 16;
export const S = 50;
export const STEP = 1 / 120;
export const VMAX = 18; // a ball's top speed, units a second
export const BALL_R = 0.3;
export const EXIT_R = 0.5; // how close a ball's centre must come to an exit's
export const TOUCH_R = 0.6; // ball centre to a star or the key
export const REST_SPEED = 0.5;
export const REST_TIME = 1.2; // seconds at rest (or rocking in place) before a ball pops
export const FIRST_DROP = 120; // steps: the first ball drops after 1 s
export const DROP_EVERY = 360; // steps: then one every 3 s
export const LAST_BALL_TIME = 12; // seconds a ball may live after the last one drops
export const GIRDER_H = 0.5;

export const PARTS = {
  plank: { w: 2.4, h: 0.6 },
  wedge: { w: 1.6, h: 1.6 },
};

const M = () => globalThis.Matter;
const rad = (deg) => (deg * Math.PI) / 180;
const r3 = (v) => Math.round(v * 1000) / 1000;

// A part's polygon in room units: plank is a rectangle; the wedge is a right triangle with its right
// angle at the bottom-left, as the pack's corner block draws it. (x, y) is the box's centre.
export function partPoly(p) {
  const { w, h } = PARTS[p.type];
  const pts =
    p.type === 'wedge'
      ? [
          [-w / 2, -h / 2],
          [w / 2, h / 2],
          [-w / 2, h / 2],
        ]
      : [
          [-w / 2, -h / 2],
          [w / 2, -h / 2],
          [w / 2, h / 2],
          [-w / 2, h / 2],
        ];
  return rotPts(pts, p.x, p.y, p.a || 0);
}

export function rectPoly(b) {
  return rotPts(
    [
      [-b.w / 2, -b.h / 2],
      [b.w / 2, -b.h / 2],
      [b.w / 2, b.h / 2],
      [-b.w / 2, b.h / 2],
    ],
    b.x,
    b.y,
    b.a || 0
  );
}

function rotPts(pts, x, y, deg) {
  const c = Math.cos(rad(deg));
  const s = Math.sin(rad(deg));
  return pts.map(([px, py]) => ({ x: x + px * c - py * s, y: y + px * s + py * c }));
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

// Where Trundle drives, above his girder: no part may go there.
function trundleZone(room) {
  const g = room.girder;
  return { x: (g.x1 + g.x2) / 2, y: g.y - 0.8, w: g.x2 - g.x1 + 1.8, h: 1.6 };
}

const STATIC = { isStatic: true, friction: 0.08, frictionStatic: 0, restitution: 0.25 };

// Things a placed part must not overlap, as Matter bodies (for Query.collides).
export function blockers(room) {
  const { Bodies } = M();
  const out = [];
  for (const b of room.fixed) out.push(polyBody(rectPoly(b), STATIC));
  out.push(polyBody(rectPoly(girderBox(room)), STATIC));
  out.push(polyBody(rectPoly(trundleZone(room)), STATIC));
  const circle = (x, y, r) => out.push(Bodies.circle(x * S, y * S, r * S, { isStatic: true }));
  for (const e of room.exits) circle(e.x, e.y, 0.55);
  for (const s of room.stars) circle(s.x, s.y, 0.3);
  if (room.key) circle(room.key.x, room.key.y, 0.3);
  if (room.flap) out.push(polyBody(rectPoly(flapBox(room.flap, 0, 0.5)), STATIC));
  if (room.crate) out.push(polyBody(rectPoly({ ...room.crate, w: room.crate.w + 0.1, h: room.crate.h + 0.1 }), STATIC));
  return out;
}

// The blue flap hangs from its pin at (x, y); at angle a (radians) its centre is len/2 below,
// turned. pad widens it, for the space it swings through.
export function flapBox(f, a = 0, pad = 0) {
  return {
    x: f.x - Math.sin(a) * (f.len / 2),
    y: f.y + Math.cos(a) * (f.len / 2),
    w: FLAP_W + pad * 2,
    h: f.len + pad,
    a: (a * 180) / Math.PI,
  };
}
export const FLAP_W = 0.5;

export function partBody(p) {
  return polyBody(partPoly(p), STATIC);
}

// Does part p overlap a blocker or one of the other parts? Outside the board counts too.
export function overlaps(room, p, others = []) {
  const { Query } = M();
  const poly = partPoly(p);
  if (poly.some((v) => v.x < 0 || v.x > W || v.y < 0 || v.y > H)) return true;
  const body = partBody(p);
  const against = blockers(room).concat(others.map(partBody));
  return Query.collides(body, against).length > 0;
}

// One attempt. layout: [{id, type, x, y, a}]. assist: 0..0.2, the exits' extra capture share.
//
// Edits, each applied at the start of the next step and logged as {s, ...}:
//   {op: 'set', id, type, x, y, a}  place a part (new or moved); a ghost while it overlaps a ball
//   {op: 'lift', id}                pick a part up: a ghost the balls pass through
//   {op: 'del', id}                 back to the tray
//   {op: 'turn'}                    Trundle turns around
export function createAttempt(room, layout, { assist = 0 } = {}) {
  const { Engine, Bodies, Body, Composite, Constraint, Events, Common, Query } = M();
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
  // The room's walls: left, right and a ceiling; the floor is open.
  add(Bodies.rectangle(-0.5 * S, (H / 2) * S, S, H * 2 * S, STATIC), 'wall');
  add(Bodies.rectangle((W + 0.5) * S, (H / 2) * S, S, H * 2 * S, STATIC), 'wall');
  add(Bodies.rectangle((W / 2) * S, -0.5 * S, W * 3 * S, S, STATIC), 'wall');

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
        // It hangs from a fixed block, so it touches only the balls, or it would jam against it.
        collisionFilter: { category: 0x0002, mask: 0x0004 },
      }),
      'flap'
    );
    Composite.add(
      world,
      Constraint.create({ pointA: { x: f.x * S, y: f.y * S }, bodyB: flap, pointB: { x: 0, y: (-f.len / 2) * S }, length: 0, stiffness: 1 })
    );
  }
  let crate = null;
  if (room.crate) {
    const c = room.crate;
    crate = add(
      Bodies.rectangle(c.x * S, c.y * S, c.w * S, c.h * S, { friction: 0.3, frictionStatic: 0.3, restitution: 0.1, density: c.density || 0.0008 }),
      'crate'
    );
  }

  const g = room.girder;
  const att = {
    room,
    steps: 0,
    t: 0,
    result: null, // 'won' | 'failed' once the attempt is over
    trundle: { x: room.trundle.x, dir: room.trundle.dir || 1, speed: room.trundle.speed || 0 },
    balls: [], // {n, body, state: 'live' | 'in' | 'lost', trail, spots, restT}
    total: room.balls,
    quota: room.quota,
    dropped: 0,
    inCount: 0,
    lostCount: 0,
    stars: new Set(),
    keyed: !room.key,
    parts: new Map(), // id → {id, type, x, y, a, body, ghost, held}
    log: [], // the edits, with the step each took effect: {s, op, ...}
    pending: [],
    events: [], // what happened this step, for sound and effects
    exitR: EXIT_R * (1 + Math.min(0.2, Math.max(0, assist))),
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
      if (ballA && ballB) continue;
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

  const liveBodies = () => att.balls.filter((b) => b.state === 'live').map((b) => b.body);
  const ballOverlap = (body) => {
    const live = liveBodies();
    if (!live.length) return false;
    // a ball's circle with a little room to spare
    return live.some((bb) => Query.collides(body, [Bodies.circle(bb.position.x, bb.position.y, (BALL_R + 0.06) * S, { isStatic: true })]).length > 0);
  };

  function place(id, p) {
    const old = att.parts.get(id);
    if (old && old.body) Composite.remove(world, old.body);
    const part = { id, type: p.type, x: p.x, y: p.y, a: p.a || 0, body: null, ghost: true, held: false };
    att.parts.set(id, part);
    const body = partBody(part);
    body.kind = part.type;
    part.pending = body;
    trySolid(part);
  }
  function trySolid(part) {
    if (!part.pending || ballOverlap(part.pending)) return;
    part.body = part.pending;
    part.pending = null;
    part.ghost = false;
    Composite.add(world, part.body);
  }

  function applyEdit(e) {
    if (e.op === 'turn') att.trundle.dir *= -1;
    else if (e.op === 'set') place(e.id, e);
    else if (e.op === 'lift' || e.op === 'del') {
      const part = att.parts.get(e.id);
      if (!part) return;
      if (part.body) Composite.remove(world, part.body);
      part.body = null;
      part.pending = null;
      part.ghost = true;
      part.held = e.op === 'lift';
      if (e.op === 'del') att.parts.delete(e.id);
    }
  }

  // The player's edits: queued for the next step, which logs them.
  att.edit = (e) => {
    if (att.result) return;
    att.pending.push(e);
  };

  for (const p of layout) place(p.id, p);

  function dropBall() {
    const x = att.trundle.x;
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
    att.balls.push({ n: att.dropped, body, state: 'live', trail: [], spots: [], restT: 0 });
    att.dropped++;
    att.events.push({ type: 'drop', x });
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
      applyEdit(e);
    }
    att.pending = [];

    // Trundle drives; he turns at the girder's ends.
    const tr = att.trundle;
    if (tr.speed) {
      tr.x += tr.dir * tr.speed * STEP;
      if (tr.x > g.x2) (tr.x = g.x2), (tr.dir = -1);
      if (tr.x < g.x1) (tr.x = g.x1), (tr.dir = 1);
    }
    if (att.dropped < att.total && att.steps >= FIRST_DROP && (att.steps - FIRST_DROP) % DROP_EVERY === 0) dropBall();

    Engine.update(engine, 1000 * STEP);
    att.steps++;
    att.t = att.steps * STEP;

    for (const part of att.parts.values()) if (part.pending && !part.held) trySolid(part);

    const covered = crate && room.exits.some((e) => Math.hypot(crate.position.x / S - e.x, crate.position.y / S - e.y) < 0.8);
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
      room.stars.forEach((s, i) => {
        if (!att.stars.has(i) && Math.hypot(s.x - x, s.y - y) < TOUCH_R) {
          att.stars.add(i);
          att.events.push({ type: 'star', i });
        }
      });
      if (!att.keyed && Math.hypot(room.key.x - x, room.key.y - y) < TOUCH_R) {
        att.keyed = true;
        att.events.push({ type: 'key' });
      }
      const exit = att.keyed && !covered ? room.exits.find((e) => Math.hypot(e.x - x, e.y - y) < att.exitR) : null;
      if (exit) {
        b.state = 'in';
        b.exit = exit;
        Composite.remove(world, body);
        att.inCount++;
        att.events.push({ type: 'exit', n: b.n, x, y, ex: exit.x, ey: exit.y });
        continue;
      }
      if (y > H + 1 || x < -1 || x > W + 1) {
        lose(b, 'out');
        continue;
      }
      // At rest, or rocking in one place (against the flap, in a dip): within 0.4 units for 1.5 s.
      if (att.steps % 60 === 0) b.spots.push(x, y);
      const n = b.spots.length;
      const rocking = n >= 8 && Math.max(...[2, 4, 6].map((k) => Math.hypot(b.spots[n - 2] - b.spots[n - 2 - k], b.spots[n - 1] - b.spots[n - 1 - k]))) < 0.4;
      b.restT = sp < REST_SPEED || rocking ? b.restT + STEP : 0;
      if (b.restT >= REST_TIME) lose(b, 'rest');
    }

    // The end: every ball done, or the quota out of reach. Balls still alive after the last drop's
    // grace time are lost.
    const lastDropStep = FIRST_DROP + (att.total - 1) * DROP_EVERY;
    if (att.steps > lastDropStep + LAST_BALL_TIME / STEP) for (const b of att.balls) if (b.state === 'live') lose(b, 'time');
    const live = att.balls.filter((b) => b.state === 'live').length;
    const left = att.total - att.dropped + live;
    if (att.inCount + left < att.quota) {
      att.result = 'failed';
      att.events.push({ type: 'failed' });
    } else if (att.dropped === att.total && live === 0) {
      att.result = att.inCount >= att.quota ? 'won' : 'failed';
      att.events.push({ type: att.result });
    }
  };

  // The ball that falls next drops here; balls live now, with their poses.
  att.live = () => att.balls.filter((b) => b.state === 'live');
  return att;
}

// Replay a room from its starting layout and an edit log, to its end (or to step `until`).
export function replay(room, layout, log, opts = {}, until = Infinity) {
  const att = createAttempt(room, layout, opts);
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

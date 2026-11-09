// Trundle's physics: one run of one room, deterministic, with no DOM.
//
// Matter.js (vendored, matter.min.js) does the physics; it's loaded as a classic script before
// this module, so it's on globalThis. A run rebuilds the world from scratch and resets Matter's id
// counter, then steps at a fixed 1/120 s, so the same layout gives the same run whatever the
// display rate. Room units: the board is W × H units, y grows downward; physics uses S px a unit.

export const W = 10;
export const H = 16;
export const S = 50;
export const STEP = 1 / 120;
export const KICK = { soft: 3.2, hard: 6.2 }; // the ball's launch speed, units a second
export const VMAX = 18; // the ball's top speed, units a second
export const BALL_R = 0.3;
export const EXIT_R = 0.5; // how close the ball's centre must come to the exit's
export const TOUCH_R = 0.6; // ball centre to a star or the key
export const REST_SPEED = 0.12;
export const LINGER = 0.75; // seconds a resting or lost ball is watched before the run ends
export const MAX_TIME = 12;
export const REC_EVERY = 4; // record a pose every 4 steps: 30 Hz

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

// The robot's box, standing on room.robot (its feet).
export function robotBox(room) {
  return { x: room.robot.x, y: room.robot.y - 0.55, w: 1.3, h: 1.1 };
}

const STATIC = { isStatic: true, friction: 0.08, frictionStatic: 0, restitution: 0.25 };

// Things a placed part must not overlap, as Matter bodies (for Query.collides).
export function blockers(room) {
  const { Bodies } = M();
  const out = [];
  for (const b of room.fixed) out.push(polyBody(rectPoly(b), STATIC));
  out.push(polyBody(rectPoly(robotBox(room)), STATIC));
  const circle = (x, y, r) => out.push(Bodies.circle(x * S, y * S, r * S, { isStatic: true }));
  circle(room.ball.x, room.ball.y, BALL_R + 0.1);
  circle(room.exit.x, room.exit.y, 0.55);
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

// One run. kick: 'soft' | 'hard'. assist: 0..0.2, the exit's extra capture radius share.
export function createRun(room, layout, { kick = 'soft', assist = 0 } = {}) {
  const { Engine, Bodies, Body, Composite, Constraint, Events, Common } = M();
  Common._nextId = 0;
  Common._seed = 0;
  const engine = Engine.create({ enableSleeping: false, positionIterations: 10, velocityIterations: 8 });
  engine.gravity.y = 1;
  const world = engine.world;
  const bodies = [];
  const add = (b, kind) => {
    b.kind = kind;
    bodies.push(b);
    Composite.add(world, b);
    return b;
  };
  for (const f of room.fixed) add(polyBody(rectPoly(f), STATIC), 'fixed');
  add(polyBody(rectPoly(robotBox(room)), STATIC), 'robot');
  // The room's walls: left, right and a ceiling; the floor is open.
  add(Bodies.rectangle(-0.5 * S, (H / 2) * S, S, H * 2 * S, STATIC), 'wall');
  add(Bodies.rectangle((W + 0.5) * S, (H / 2) * S, S, H * 2 * S, STATIC), 'wall');
  add(Bodies.rectangle((W / 2) * S, -0.5 * S, W * 3 * S, S, STATIC), 'wall');
  for (const p of layout) add(partBody(p), p.type);

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
        // It hangs from a fixed block, so it touches only the ball, or it would jam against it.
        collisionFilter: { category: 0x0002, mask: 0x0004 },
      }),
      'flap'
    );
    Composite.add(
      world,
      Constraint.create({
        pointA: { x: f.x * S, y: f.y * S },
        bodyB: flap,
        pointB: { x: 0, y: (-f.len / 2) * S },
        length: 0,
        stiffness: 1,
      })
    );
  }
  let crate = null;
  if (room.crate) {
    const c = room.crate;
    crate = add(
      Bodies.rectangle(c.x * S, c.y * S, c.w * S, c.h * S, {
        friction: 0.3,
        frictionStatic: 0.3,
        restitution: 0.1,
        density: c.density || 0.0008,
      }),
      'crate'
    );
  }

  const ball = add(
    Bodies.circle(room.ball.x * S, room.ball.y * S, BALL_R * S, {
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
  const dir = room.robot.dir || 1;
  const v0 = (KICK[kick] || KICK.soft) * dir;
  Body.setVelocity(ball, { x: (v0 * S) / 60, y: 0 });

  const run = {
    room,
    kick,
    steps: 0,
    t: 0,
    result: null, // 'won' | 'missed' once the run is over
    ending: null, // 'rest' | 'out' while lingering
    lingerT: 0,
    stars: new Set(),
    keyed: !room.key,
    closest: { d: Infinity, x: room.ball.x, y: room.ball.y },
    trail: [],
    rec: [], // [ball x, y, angle, (spinner angle), (crate x, y, angle)] at 30 Hz
    events: [], // what happened this step, for sound and effects: {type, ...}
    ball,
    flap,
    crate,
    engine,
  };
  const exitR = EXIT_R * (1 + Math.min(0.2, Math.max(0, assist)));
  run.exitR = exitR;
  const lastHit = new Map();

  Events.on(engine, 'collisionStart', (e) => {
    for (const pair of e.pairs) {
      const a = pair.bodyA.parent || pair.bodyA;
      const b = pair.bodyB.parent || pair.bodyB;
      const other = a === ball ? b : b === ball ? a : null;
      const crateHit = !other && (a === crate || b === crate) ? (a === crate ? b : a) : null;
      const what = other || crateHit;
      if (!what) continue;
      const key = a.id + ':' + b.id;
      const last = lastHit.get(key);
      if (last != null && run.steps - last < 12) continue; // 100 ms
      lastHit.set(key, run.steps);
      const rel = Math.hypot(a.velocity.x - b.velocity.x, a.velocity.y - b.velocity.y) * (60 / S);
      if (rel < 0.6) continue;
      run.events.push({ type: 'hit', on: other ? what.kind : 'crate', by: other ? 'ball' : what.kind, speed: rel });
    }
  });

  function record() {
    const f = [r3(ball.position.x / S), r3(ball.position.y / S), r3(ball.angle)];
    if (flap) f.push(r3(flap.angle));
    if (crate) f.push(r3(crate.position.x / S), r3(crate.position.y / S), r3(crate.angle));
    run.rec.push(f);
  }
  record();

  run.pose = () => ({ x: ball.position.x / S, y: ball.position.y / S, a: ball.angle });

  run.step = () => {
    if (run.result) return;
    run.events = [];
    Engine.update(engine, 1000 * STEP);
    run.steps++;
    run.t = run.steps * STEP;
    const sp = ball.speed * (60 / S);
    if (sp > VMAX) {
      const k = VMAX / sp;
      Body.setVelocity(ball, { x: ball.velocity.x * k, y: ball.velocity.y * k });
    }
    const x = ball.position.x / S;
    const y = ball.position.y / S;
    if (run.steps % REC_EVERY === 0) record();
    if (run.steps % 3 === 0) run.trail.push(r3(x), r3(y));

    room.stars.forEach((s, i) => {
      if (!run.stars.has(i) && Math.hypot(s.x - x, s.y - y) < TOUCH_R) {
        run.stars.add(i);
        run.events.push({ type: 'star', i });
      }
    });
    if (!run.keyed && Math.hypot(room.key.x - x, room.key.y - y) < TOUCH_R) {
      run.keyed = true;
      run.events.push({ type: 'key' });
    }
    const de = Math.hypot(room.exit.x - x, room.exit.y - y);
    if (de < run.closest.d) run.closest = { d: de, x, y };
    // A crate still sitting on the exit covers it.
    const covered = crate && Math.hypot(crate.position.x / S - room.exit.x, crate.position.y / S - room.exit.y) < 0.8;
    if (run.keyed && !covered && de < exitR) {
      run.result = 'won';
      record();
      run.events.push({ type: 'exit' });
      return;
    }
    const out = y > H + 1 || x < -1 || x > W + 1;
    if (!run.ending) {
      if (out) run.ending = 'out';
      else if (sp < REST_SPEED && run.t > 0.5) run.ending = 'rest';
      if (run.ending) {
        run.lingerT = 0;
        if (run.ending === 'out') run.events.push({ type: 'out' });
      }
    } else if (run.ending === 'rest' && sp >= REST_SPEED * 2) {
      run.ending = null; // it was only pausing at the top of a swing
    }
    if (run.ending) run.lingerT += STEP;
    if ((run.ending && run.lingerT >= LINGER) || run.t >= MAX_TIME) {
      run.result = 'missed';
      run.events.push({ type: 'missed' });
    }
  };

  return run;
}

// Run a room to its end, headless. Returns the finished run.
export function runToEnd(room, layout, opts) {
  const run = createRun(room, layout, opts);
  while (!run.result) run.step();
  return run;
}

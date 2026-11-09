// Orbit's physics, shared by the game and the headless level checks (tests/orbit-levels.test.mjs,
// scripts/orbit/solve.mjs). No DOM here: plain numbers in, plain numbers out.
//
// World units: a system is a fixed portrait field FIELD.w × FIELD.h; the page scales it to fit.
// Gravity is softened inverse-square (a = mu / r²) from every body. The simulation steps at a fixed
// DT whatever the display's frame rate, so a flight is the same at 60 Hz and 120 Hz, and the same
// aim at the same leg time always gives the same flight.

export const FIELD = { w: 1000, h: 1800 };
export const DT = 1 / 240;
export const MAX_FLIGHT = 8; // seconds without a capture, then the probe is called lost
export const LOST_MARGIN = 200; // how far past the field's edge the probe may swing
export const MOTE_RADIUS = 30; // how close the probe must pass to pick up a mote
export const SKIM = 1.35; // passing within SKIM × a body's radius without touching is a skim
export const BRAKE = 0.35; // a brake takes this fraction off the current speed (relative to the target)
export const LAUNCH_MIN = 120; // slowest launch, world units per second (at the dead zone's edge)
export const LAUNCH_MAX = 660; // fastest launch (full drag)
export const MAX_SPEED = 1400; // speed is clamped here, so a close pass never tunnels
export const CATCH_WIDTH = 26; // the capture band reaches this far outside the drawn ring
export const CATCH_SPEED = 1.75; // capture needs speed (relative to the target) under this × escape speed at the ring
export const ASSIST_BAND = 0.15; // the hidden assist widens the band by up to 15% (inside the ring's glow)
export const ASSIST_SPEED = 0.25; // and raises the speed limit by up to 25%

// Where body i is at leg time t. A body sits still or circles a parent: orbit { around, r, period, phase }.
export function bodyAt(bodies, i, t, out = { x: 0, y: 0 }) {
  const b = bodies[i];
  if (!b.orbit) {
    out.x = b.x;
    out.y = b.y;
    return out;
  }
  bodyAt(bodies, b.orbit.around, t, out);
  const a = b.orbit.phase + (2 * Math.PI * t) / b.orbit.period;
  out.x += Math.cos(a) * b.orbit.r;
  out.y += Math.sin(a) * b.orbit.r;
  return out;
}

// Velocity of body i at time t (finite difference; exact enough for circular motion).
export function bodyVel(bodies, i, t, out = { x: 0, y: 0 }) {
  if (!bodies[i].orbit) {
    out.x = 0;
    out.y = 0;
    return out;
  }
  const h = 1e-3;
  const a = bodyAt(bodies, i, t - h, { x: 0, y: 0 });
  const b = bodyAt(bodies, i, t + h, { x: 0, y: 0 });
  out.x = (b.x - a.x) / (2 * h);
  out.y = (b.y - a.y) / (2 * h);
  return out;
}

// Positions of every body at time t, as a flat [x0, y0, x1, y1, …] array.
export function positions(bodies, t, out = new Float64Array(bodies.length * 2)) {
  const tmp = { x: 0, y: 0 };
  for (let i = 0; i < bodies.length; i++) {
    bodyAt(bodies, i, t, tmp);
    out[i * 2] = tmp.x;
    out[i * 2 + 1] = tmp.y;
  }
  return out;
}

export function gravity(bodies, pos, x, y, acc) {
  acc.x = 0;
  acc.y = 0;
  for (let i = 0; i < bodies.length; i++) {
    const mu = bodies[i].mu;
    if (!mu) continue;
    const dx = pos[i * 2] - x;
    const dy = pos[i * 2 + 1] - y;
    const r2 = dx * dx + dy * dy + 400; // softened, so a grazing pass never blows up
    const inv = mu / (r2 * Math.sqrt(r2));
    acc.x += dx * inv;
    acc.y += dy * inv;
  }
  return acc;
}

// Escape speed from body b at distance r.
export const escapeSpeed = (b, r) => Math.sqrt((2 * b.mu) / r);

// The probe's parking orbit around body i: radius and period (it circles at the body's ring radius).
export function park(level, i) {
  const b = level.bodies[i];
  const r = b.ring;
  const v = Math.sqrt(b.mu / r);
  return { r, period: (2 * Math.PI * r) / v };
}

// Launch speed for a drag of the given fraction (0..1) of full power.
export const launchSpeed = (power) => LAUNCH_MIN + (LAUNCH_MAX - LAUNCH_MIN) * Math.min(1, Math.max(0, power));

// The launch: the probe leaves its parking orbit at the point that faces the aim (so where it
// starts depends on the aim alone), with the aim's speed plus the planet's own motion.
export function launchState(level, legIndex, angle, power, t0) {
  const leg = level.legs[legIndex];
  const p = bodyAt(level.bodies, leg.from, t0);
  const pv = bodyVel(level.bodies, leg.from, t0);
  const { r } = park(level, leg.from);
  const s = launchSpeed(power);
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);
  return { x: p.x + ux * r, y: p.y + uy * r, vx: ux * s + pv.x, vy: uy * s + pv.y };
}

// A flight in progress. Call step(f, level) at DT until f.result is set.
export function launch(level, legIndex, angle, power, t0 = 0, assist = 0) {
  const s = launchState(level, legIndex, angle, power, t0);
  const leg = level.legs[legIndex];
  return {
    ...s,
    t: t0, // the leg's clock: moving bodies carry on from where they were at the aim
    age: 0,
    legIndex,
    from: leg.from,
    to: leg.to,
    assist,
    brakeLeft: level.brake ? 1 : 0,
    brakeAge: -1,
    caught: [], // motes picked up on this flight
    skims: [], // bodies skimmed on this flight
    fastPass: false, // crossed the ring band too fast to be caught
    result: null, // 'captured' | 'crashed' | 'lost'
    why: '', // 'hit' | 'away' | 'stuck' | 'time'
    hit: -1,
    sweep: 0, // angle swept around the body the probe is bound to
    sweepBody: -1,
    lastAngle: 0,
    pos: positions(level.bodies, t0),
  };
}

// The target ring's speed limit (relative to the target), with the assist.
export function catchLimit(level, to, assist = 0) {
  const b = level.bodies[to];
  return (b.catchSpeed ?? level.catchSpeed ?? CATCH_SPEED) * (1 + ASSIST_SPEED * Math.min(1, assist)) * escapeSpeed(b, b.ring);
}

// The probe's speed relative to the target, and whether it's under the ring's limit: the trail and
// the preview are drawn cool when it is and amber when it isn't.
export function relSpeed(level, to, t, vx, vy) {
  const v = bodyVel(level.bodies, to, t, { x: 0, y: 0 });
  return Math.hypot(vx - v.x, vy - v.y);
}

// One brake: BRAKE less speed relative to the target. Returns false if none is left.
export function brake(f, level) {
  if (f.result || f.brakeLeft <= 0) return false;
  f.brakeLeft--;
  const v = bodyVel(level.bodies, f.to, f.t, { x: 0, y: 0 });
  f.vx = v.x + (f.vx - v.x) * (1 - BRAKE);
  f.vy = v.y + (f.vy - v.y) * (1 - BRAKE);
  f.brakeAge = f.age;
  f.sweep = 0;
  return true;
}

const acc = { x: 0, y: 0 };
const tv = { x: 0, y: 0 };

export function step(f, level, taken = null) {
  if (f.result) return f;
  const bodies = level.bodies;
  f.t += DT;
  f.age += DT;
  positions(bodies, f.t, f.pos);
  gravity(bodies, f.pos, f.x, f.y, acc);
  f.vx += acc.x * DT;
  f.vy += acc.y * DT;
  const sp = Math.hypot(f.vx, f.vy);
  if (sp > MAX_SPEED) {
    f.vx *= MAX_SPEED / sp;
    f.vy *= MAX_SPEED / sp;
  }
  f.x += f.vx * DT;
  f.y += f.vy * DT;

  // Surfaces and skims; and which body pulls hardest, for the stuck check.
  let strongest = -1;
  let pull = 0;
  for (let i = 0; i < bodies.length; i++) {
    const dx = f.x - f.pos[i * 2];
    const dy = f.y - f.pos[i * 2 + 1];
    const d = Math.hypot(dx, dy);
    const b = bodies[i];
    if (d < b.r) {
      f.result = 'crashed';
      f.why = 'hit';
      f.hit = i;
      return f;
    }
    if (d < b.r * SKIM && i !== f.from && !f.skims.includes(i)) f.skims.push(i);
    const g = b.mu / (d * d);
    if (g > pull) {
      pull = g;
      strongest = i;
    }
  }

  // Motes along the way.
  const motes = level.motes;
  if (motes) {
    for (let i = 0; i < motes.length; i++) {
      const m = motes[i];
      if (m.leg !== f.legIndex || f.caught.includes(i) || (taken && taken.has(i))) continue;
      if (Math.hypot(f.x - m.x, f.y - m.y) < MOTE_RADIUS) f.caught.push(i);
    }
  }

  // Capture: inside the target's band, slow enough relative to it.
  const tb = bodies[f.to];
  const tx = f.pos[f.to * 2];
  const ty = f.pos[f.to * 2 + 1];
  const d = Math.hypot(f.x - tx, f.y - ty);
  if (d < tb.ring * (1 + ASSIST_BAND * Math.min(1, f.assist)) + CATCH_WIDTH) {
    bodyVel(bodies, f.to, f.t, tv);
    const rel = Math.hypot(f.vx - tv.x, f.vy - tv.y);
    if (rel < catchLimit(level, f.to, f.assist)) {
      f.result = 'captured';
      return f;
    }
    f.fastPass = true;
  }

  // Stuck: bound to one body (not the target) and swept a full loop around it.
  if (strongest !== f.to && strongest >= 0) {
    const b = bodies[strongest];
    const dx = f.x - f.pos[strongest * 2];
    const dy = f.y - f.pos[strongest * 2 + 1];
    bodyVel(bodies, strongest, f.t, tv);
    const v2 = (f.vx - tv.x) ** 2 + (f.vy - tv.y) ** 2;
    const bound = v2 / 2 - b.mu / Math.hypot(dx, dy) < 0;
    const ang = Math.atan2(dy, dx);
    if (bound && f.sweepBody === strongest) {
      let da = ang - f.lastAngle;
      if (da > Math.PI) da -= 2 * Math.PI;
      if (da < -Math.PI) da += 2 * Math.PI;
      f.sweep += da;
      if (Math.abs(f.sweep) > 2 * Math.PI) {
        f.result = 'lost';
        f.why = 'stuck';
        return f;
      }
    } else {
      f.sweep = 0;
    }
    f.sweepBody = bound ? strongest : -1;
    f.lastAngle = ang;
  } else {
    f.sweepBody = -1;
    f.sweep = 0;
  }

  if (f.x < -LOST_MARGIN || f.x > FIELD.w + LOST_MARGIN || f.y < -LOST_MARGIN || f.y > FIELD.h + LOST_MARGIN) {
    f.result = 'lost';
    f.why = 'away';
  } else if (f.age > MAX_FLIGHT) {
    f.result = 'lost';
    f.why = 'time';
  }
  return f;
}

// Run a whole flight headless. brakeAt: the flight age to brake at (or -1 for none).
export function fly(level, legIndex, angle, power, t0 = 0, { brakeAt = -1, assist = 0, trail = null } = {}) {
  const f = launch(level, legIndex, angle, power, t0, assist);
  let n = 0;
  while (!f.result) {
    if (brakeAt >= 0 && f.brakeLeft > 0 && f.age >= brakeAt) brake(f, level);
    step(f, level);
    if (trail && n++ % 4 === 0) trail.push(f.x, f.y);
  }
  return f;
}

// The preview: the path from the launch until the first close pass of a body other than the
// launch planet (its closest approach), at most PREVIEW_MAX seconds. Returns [x, y, …].
export const PREVIEW_MAX = 1.3;
export function preview(level, legIndex, angle, power, t0) {
  const f = launch(level, legIndex, angle, power, t0);
  const pts = [f.x, f.y];
  let prevD = Infinity;
  let near = -1;
  let n = 0;
  while (!f.result && f.age < PREVIEW_MAX) {
    step(f, level);
    if (n++ % 3 === 0) pts.push(f.x, f.y);
    // nearest body other than the launch planet, in units of its radius
    let best = Infinity;
    let bi = -1;
    for (let i = 0; i < level.bodies.length; i++) {
      if (i === f.from) continue;
      const d = Math.hypot(f.x - f.pos[i * 2], f.y - f.pos[i * 2 + 1]) / level.bodies[i].r;
      if (d < best) {
        best = d;
        bi = i;
      }
    }
    if (bi === near && best > prevD && best < 4.5) break; // just passed its closest approach
    near = bi;
    prevD = best;
  }
  pts.push(f.x, f.y);
  return pts;
}

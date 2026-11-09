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
export const BOOST_MAX = 420; // full power adds this much speed on top of the escape speed
export const MAX_SPEED = 1400; // speed is clamped here, so a close pass never tunnels
export const CATCH_WIDTH = 26; // the capture band reaches this far outside the drawn ring
export const CATCH_SPEED = 1.75; // capture needs speed (relative to the target) under this × escape speed at the ring
export const CATCH_ANGLE = 30; // capture needs the path within this many degrees of running along the ring
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
export const PARK_PERIOD = 7; // seconds per lap of the parking orbit: slow enough to time a release
export function park(level, i) {
  // The launch doesn't depend on how fast the probe circles (it leaves at escape speed plus the
  // boost), so the lap is set for a fair timing game rather than by the planet's pull.
  return { r: level.bodies[i].ring, period: PARK_PERIOD };
}

// The release: the probe is on its parking orbit at angle `at` round its planet, circling in
// direction `dir` (+1 or -1, the way the angle turns). Firing the boosters keeps it going the way it
// was moving, along the orbit's tangent, at the planet's escape speed (so every release leaves the
// planet: no weak boost that only stretches the orbit) plus `power` (0..1) of BOOST_MAX, plus the
// planet's own motion. Where it is on the orbit when you fire is what aims it.
export function launchState(level, legIndex, at, power, t0, dir = 1) {
  const leg = level.legs[legIndex];
  const b = level.bodies[leg.from];
  const p = bodyAt(level.bodies, leg.from, t0);
  const pv = bodyVel(level.bodies, leg.from, t0);
  const { r } = park(level, leg.from);
  const s = escapeSpeed(b, r) * 1.02 + BOOST_MAX * Math.min(1, Math.max(0, power));
  const tx = -Math.sin(at) * dir;
  const ty = Math.cos(at) * dir;
  return { x: p.x + Math.cos(at) * r, y: p.y + Math.sin(at) * r, vx: tx * s + pv.x, vy: ty * s + pv.y };
}

// A flight in progress. Call step(f, level) at DT until f.result is set.
export function launch(level, legIndex, at, power, t0 = 0, assist = 0, dir = 1) {
  const s = launchState(level, legIndex, at, power, t0, dir);
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

// The probe's speed relative to the target (for the brake's first lesson: too fast near the ring).
export function relSpeed(level, to, t, vx, vy) {
  const v = bodyVel(level.bodies, to, t, { x: 0, y: 0 });
  return Math.hypot(vx - v.x, vy - v.y);
}

// Which way a caught probe circles its new planet: the sign of its turn round it at the catch
// (the game parks it going that way, and that's the way the next leg's release goes).
export function arrivalDir(f, level) {
  const p = bodyAt(level.bodies, f.to, f.t);
  const v = bodyVel(level.bodies, f.to, f.t);
  const w = (f.x - p.x) * (f.vy - v.y) - (f.y - p.y) * (f.vx - v.x);
  return w >= 0 ? 1 : -1;
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
  const sp = Math.sqrt(f.vx * f.vx + f.vy * f.vy);
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
    const d = Math.sqrt(dx * dx + dy * dy);
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
      if (Math.sqrt((f.x - m.x) * (f.x - m.x) + (f.y - m.y) * (f.y - m.y)) < MOTE_RADIUS) f.caught.push(i);
    }
  }

  // Capture: inside the target's band, slow enough relative to it.
  const tb = bodies[f.to];
  const tx = f.pos[f.to * 2];
  const ty = f.pos[f.to * 2 + 1];
  const d = Math.sqrt((f.x - tx) * (f.x - tx) + (f.y - ty) * (f.y - ty));
  if (d < tb.ring * (1 + ASSIST_BAND * Math.min(1, f.assist)) + CATCH_WIDTH) {
    bodyVel(bodies, f.to, f.t, tv);
    const rvx = f.vx - tv.x;
    const rvy = f.vy - tv.y;
    const rel = Math.sqrt(rvx * rvx + rvy * rvy);
    // along the ring, not into it: the part of the speed heading in or out must be small
    const radial = Math.abs((rvx * (f.x - tx) + rvy * (f.y - ty)) / (d || 1));
    const along = radial <= rel * Math.sin((CATCH_ANGLE * Math.PI) / 180);
    if (rel < catchLimit(level, f.to, f.assist) && along) {
      f.result = 'captured';
      return f;
    }
    f.fastPass = true;
  }

  // Stuck: bound to one body (not the target, nor the body the target circles) and swept a full
  // loop around it. Swinging round a moon's planet while chasing the moon is fair play.
  const parent = tb.orbit ? tb.orbit.around : -1;
  if (strongest !== f.to && strongest !== parent && strongest >= 0) {
    const b = bodies[strongest];
    const dx = f.x - f.pos[strongest * 2];
    const dy = f.y - f.pos[strongest * 2 + 1];
    bodyVel(bodies, strongest, f.t, tv);
    const v2 = (f.vx - tv.x) ** 2 + (f.vy - tv.y) ** 2;
    const bound = v2 / 2 - b.mu / Math.sqrt(dx * dx + dy * dy) < 0;
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
export function fly(level, legIndex, at, power, t0 = 0, { brakeAt = -1, assist = 0, trail = null, dir = 1 } = {}) {
  const f = launch(level, legIndex, at, power, t0, assist, dir);
  let n = 0;
  while (!f.result) {
    if (brakeAt >= 0 && f.brakeLeft > 0 && f.age >= brakeAt) brake(f, level);
    step(f, level);
    if (trail && n++ % 4 === 0) trail.push(f.x, f.y);
  }
  return f;
}

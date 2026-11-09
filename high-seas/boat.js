// High Seas: the boats. Their polars (speed by angle off the wind), steering, heel, and the
// dinghy drawn in code as a small low-poly hull projected through the isometric transform, so it
// turns smoothly and its sail swings with the wind.
//
// Angles are grid angles (atan2 on the grid). The wind's angle is the way it blows towards; the
// angle "off the wind" is between the heading and where the wind comes from: 0 is straight into
// it, π dead downwind.
import { wrap } from './world.js';

const D = Math.PI / 180;

// Polars: [degrees off the wind, fraction of top speed], interpolated; below the wedge the boat
// is in irons. top is in tiles a second at wind strength 1.
export const BOATS = {
  dinghy: {
    top: 1.6,
    turn: 150 * D,
    wedge: 50 * D,
    cargo: 1,
    length: 0.9,
    radius: 0.28,
    polar: [[50, 0.7], [70, 0.9], [90, 1.0], [135, 0.85], [180, 0.65]],
  },
  keel: {
    // The dinghy with the keel: points higher and heels half as much.
    wedge: 38 * D,
    polar: [[38, 0.72], [60, 0.9], [90, 1.0], [135, 0.85], [180, 0.65]],
  },
  spinnaker: {
    // The spinnaker downwind, on the keel's polar or the plain dinghy's.
    polar: [[38, 0.72], [60, 0.9], [90, 1.0], [130, 1.05], [180, 1.15]],
    plain: [[50, 0.7], [70, 0.9], [90, 1.0], [130, 1.05], [180, 1.15]],
  },
  galleon: {
    top: 1.75,
    turn: 55 * D,
    wedge: 65 * D,
    cargo: 3,
    length: 2.4,
    radius: 0.7,
    polar: [[65, 0.5], [90, 0.72], [130, 1.0], [180, 0.95]],
  },
};

// The rig a boat sails with: the galleon, or the dinghy with what it has bought.
export function rig({ galleon, keel, spinnaker }) {
  if (galleon) return { name: 'galleon', ...BOATS.galleon };
  const r = { name: 'dinghy', ...BOATS.dinghy };
  if (keel) Object.assign(r, BOATS.keel);
  if (spinnaker) r.polar = keel ? BOATS.spinnaker.polar : BOATS.spinnaker.plain;
  r.keel = Boolean(keel);
  r.spinnaker = Boolean(spinnaker);
  return r;
}

export function polarAt(r, off) {
  const deg = Math.abs(off) / D;
  const p = r.polar;
  // In irons, inside the wedge: drifting to a stop. Its edge itself (where a clamped heading sits,
  // give or take rounding) sails at the polar's first value.
  if (deg < p[0][0] - 0.25) return 0.25 * (deg / p[0][0]) ** 2;
  if (deg <= p[0][0]) return p[0][1];
  for (let k = 1; k < p.length; k++)
    if (deg <= p[k][0]) {
      const t = (deg - p[k - 1][0]) / (p[k][0] - p[k - 1][0]);
      return p[k - 1][1] + t * (p[k][1] - p[k - 1][1]);
    }
  return p[p.length - 1][1];
}

// Angle off the wind for a heading (0..π).
export const offWind = (heading, wind) => Math.abs(wrap(heading - (wind + Math.PI)));

// Where the boat should point for a wanted heading: outside the wedge, on the nearer edge.
export function clampToWedge(r, want, wind) {
  const from = wind + Math.PI;
  const rel = wrap(want - from);
  if (Math.abs(rel) >= r.wedge) return wrap(want);
  return wrap(from + (rel >= 0 ? r.wedge : -r.wedge));
}

// Turn towards a target heading at the boat's turn rate. Returns the new heading.
export function turnTowards(h, target, rate, dt) {
  const d = wrap(target - h);
  const step = rate * dt;
  return Math.abs(d) <= step ? wrap(target) : wrap(h + Math.sign(d) * step);
}

// Heel's target: the push of a strong gust across the boat. 0 in wind up to 1.15× (and always 0
// for the galleon); about 1 beam-on in a 1.5× gust; the keel halves it.
export function heelTarget(r, off, gust) {
  if (r.name === 'galleon') return 0;
  const push = Math.max(0, (gust - 1.15) / 0.35);
  return push * Math.sin(off) ** 2 * (r.keel ? 0.5 : 1);
}

// --- Drawing the dinghy -------------------------------------------------------------------------

// The hull's outline in boat space (x forward, y to starboard), in tiles.
const HULL = [
  [0.46, 0],
  [0.3, 0.13],
  [0.05, 0.18],
  [-0.3, 0.16],
  [-0.42, 0.11],
  [-0.42, -0.11],
  [-0.3, -0.16],
  [0.05, -0.18],
  [0.3, -0.13],
];
const DECK = 0.1; // the gunwale's height above the water, in tiles
const MAST = 0.95;

function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.max(0, Math.min(255, Math.round(v * k)));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

// Draw the dinghy at (x, y) on the grid. s: { heading, heel (−1..1, + to port), boom (radians off
// the centreline, + to starboard), fill (0 limp … 1 full), luff (0 … 1 flapping), t (seconds),
// keel, spinnaker, spinFill, cargo: [{ colour, mail }] }. iso: the shared projection; zs: px per
// tile of height.
export function drawDinghy(ctx, iso, x, y, s, zs = 32) {
  const ch = Math.cos(s.heading);
  const sh = Math.sin(s.heading);
  const heel = s.heel || 0;
  // Boat space (bx forward, by starboard, bz up) to the screen, with the heel rolling it.
  const P = (bx, by, bz) => {
    const cy = by * Math.cos(heel) - bz * Math.sin(heel);
    const cz = by * Math.sin(heel) + bz * Math.cos(heel);
    const gx = x + bx * ch - cy * sh;
    const gy = y + bx * sh + cy * ch;
    return iso.toScreen(gx, gy, cz * zs);
  };
  // Light comes from the upper left of the screen: a face is lit by how much it faces grid −x−y.
  const light = (nx, ny) => {
    const gx = nx * ch - ny * sh;
    const gy = nx * sh + ny * ch;
    return 0.75 + 0.3 * Math.max(-1, Math.min(1, -(gx + gy) / Math.SQRT2));
  };
  const hullCol = s.keel ? '#2f6f9f' : '#c9553f';
  // Hull sides: each segment from waterline to gunwale, the ones facing the viewer (grid +x+y).
  const n = HULL.length;
  const faces = [];
  for (let k = 0; k < n; k++) {
    const a = HULL[k];
    const b = HULL[(k + 1) % n];
    // Outward normal in boat space.
    let nx = b[1] - a[1];
    let ny = -(b[0] - a[0]);
    const len = Math.hypot(nx, ny) || 1;
    nx /= len;
    ny /= len;
    const gx = nx * ch - ny * sh;
    const gy = nx * sh + ny * ch;
    if (gx + gy < -0.05) continue; // faces away
    faces.push({ a, b, k: light(nx, ny), d: gx + gy });
  }
  // Waterline shadow.
  ctx.fillStyle = 'rgba(20,60,90,0.25)';
  ctx.beginPath();
  for (const [bx, by] of HULL) {
    const p = P(bx * 1.05, by * 1.15, -0.02);
    ctx.lineTo(p.x, p.y);
  }
  ctx.fill();
  for (const f of faces.sort((p, q) => p.d - q.d)) {
    const p1 = P(f.a[0], f.a[1], -0.01);
    const p2 = P(f.b[0], f.b[1], -0.01);
    const p3 = P(f.b[0] * 1.04, f.b[1] * 1.08, DECK);
    const p4 = P(f.a[0] * 1.04, f.a[1] * 1.08, DECK);
    ctx.fillStyle = shade(hullCol, f.k);
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.lineTo(p3.x, p3.y);
    ctx.lineTo(p4.x, p4.y);
    ctx.fill();
  }
  // Deck: a wooden floor inside a white gunwale.
  ctx.fillStyle = '#f3efe4';
  ctx.beginPath();
  for (const [bx, by] of HULL) {
    const p = P(bx * 1.04, by * 1.08, DECK);
    ctx.lineTo(p.x, p.y);
  }
  ctx.fill();
  ctx.fillStyle = '#c8935a';
  ctx.beginPath();
  for (const [bx, by] of HULL) {
    const p = P(bx * 0.86, by * 0.78, DECK);
    ctx.lineTo(p.x, p.y);
  }
  ctx.fill();
  // A thwart.
  ctx.strokeStyle = '#a8763f';
  ctx.lineWidth = 0.05 * zs;
  ctx.beginPath();
  let p = P(-0.12, -0.13, DECK);
  ctx.moveTo(p.x, p.y);
  p = P(-0.12, 0.13, DECK);
  ctx.lineTo(p.x, p.y);
  ctx.stroke();
  // Cargo: a crate (or a mail sack) per load, aft of the mast.
  (s.cargo || []).forEach((c, k) => {
    const cx = -0.26 + k * 0.0;
    const q = P(cx, 0, DECK + 0.07);
    const w = 0.15 * zs;
    ctx.fillStyle = c.mail ? '#f6f1e3' : '#b98245';
    ctx.strokeStyle = c.colour;
    ctx.lineWidth = 0.035 * zs;
    ctx.beginPath();
    ctx.rect(q.x - w / 2, q.y - w / 2, w, w * 0.8);
    ctx.fill();
    ctx.stroke();
  });
  // Mast and sail. The boom swings from the mast to leeward; the sail is a triangle from the
  // masthead, its foot along the boom, bellied by the wind (or fluttering when it luffs).
  const mx = 0.12;
  const foot = P(mx, 0, DECK + 0.06);
  const head = P(mx, 0, DECK + MAST);
  const boomLen = 0.5;
  const bx = mx - Math.cos(s.boom) * boomLen;
  const by = Math.sin(s.boom) * boomLen;
  const clew = P(bx, by, DECK + 0.1);
  const flap = (s.luff || 0) * Math.sin(s.t * 38) * 0.12;
  const belly = (s.fill || 0) * 0.16 * Math.sign(s.boom || 1) + flap;
  // The sail's middle pushed out to leeward, perpendicular to the boom.
  const mid = P(mx - Math.cos(s.boom) * boomLen * 0.42 + Math.sin(s.boom) * 0 - Math.sin(s.boom) * belly, Math.sin(s.boom) * boomLen * 0.42 + Math.cos(s.boom) * belly, DECK + 0.38);
  // Which side of the sail faces the viewer decides its shade.
  const sideLit = Math.sign((clew.x - foot.x) * (head.y - foot.y) - (clew.y - foot.y) * (head.x - foot.x));
  ctx.fillStyle = sideLit > 0 ? '#fbf6ea' : '#e6dcc4';
  ctx.beginPath();
  ctx.moveTo(head.x, head.y);
  ctx.quadraticCurveTo(mid.x, mid.y, clew.x, clew.y);
  ctx.lineTo(foot.x, foot.y);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(120,100,70,0.5)';
  ctx.lineWidth = 0.02 * zs;
  ctx.stroke();
  // Spinnaker: a big striped balloon ahead of the mast when running.
  if (s.spinnaker && s.spinFill > 0.05) {
    const f = s.spinFill;
    const sx = P(0.62 + 0.25 * f, 0, DECK + 0.45);
    const top = P(mx + 0.02, 0, DECK + MAST * 0.95);
    const l = P(0.44, -0.3 * f, DECK + 0.12);
    const r = P(0.44, 0.3 * f, DECK + 0.12);
    ctx.globalAlpha = Math.min(1, f * 1.5);
    ctx.fillStyle = '#e8604c';
    ctx.beginPath();
    ctx.moveTo(top.x, top.y);
    ctx.quadraticCurveTo(sx.x - (r.x - l.x) * 0.9, sx.y, l.x, l.y);
    ctx.quadraticCurveTo(sx.x, sx.y + 0.1 * zs, r.x, r.y);
    ctx.quadraticCurveTo(sx.x + (r.x - l.x) * 0.9, sx.y, top.x, top.y);
    ctx.fill();
    ctx.fillStyle = '#fbf6ea';
    ctx.beginPath();
    ctx.moveTo(top.x, top.y);
    ctx.quadraticCurveTo(sx.x, sx.y - 0.05 * zs, (l.x + r.x) / 2, (l.y + r.y) / 2 + 0.03 * zs);
    ctx.quadraticCurveTo(sx.x + (r.x - l.x) * 0.25, sx.y, top.x, top.y);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  ctx.strokeStyle = '#6b4a2b';
  ctx.lineWidth = 0.04 * zs;
  ctx.beginPath();
  ctx.moveTo(foot.x, foot.y);
  ctx.lineTo(head.x, head.y);
  ctx.moveTo(foot.x, foot.y);
  const boomEnd = P(bx, by, DECK + 0.08);
  ctx.lineTo(boomEnd.x, boomEnd.y);
  ctx.stroke();
  // A pennant at the masthead, streaming downwind (in screen space, given by s.vane).
  if (s.vane) {
    ctx.strokeStyle = '#e8604c';
    ctx.lineWidth = 0.035 * zs;
    ctx.beginPath();
    ctx.moveTo(head.x, head.y);
    const wob = Math.sin(s.t * 12) * 0.12;
    ctx.lineTo(head.x + s.vane.x * 0.22 * zs - s.vane.y * wob * zs * 0.3, head.y + s.vane.y * 0.22 * zs + s.vane.x * wob * zs * 0.3);
    ctx.stroke();
  }
}

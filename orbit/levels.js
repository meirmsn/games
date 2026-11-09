// Orbit's systems. Coordinates are world units in a FIELD of 1000 × 1800 (y down).
// A body: { x, y, r (surface radius), mu (gravity), ring (its orbit ring's radius), img (planet
// sprite 0–9), cloud (cloud layer), spin (turns per minute) } and, for a moon, orbit { around, r,
// period, phase }. A leg goes from one body to the next; each body's ring is both where the probe
// parks on it and where it's caught. motes: { x, y, leg }, grouped in lines (line 'close' or 'wide').
// tune: scripts/orbit/solve.mjs measures every leg; tests/orbit-levels.test.mjs pins the targets.

// A line of motes along a gentle arc from (x0, y0) through (xm, ym) to (x1, y1).
function arc(leg, line, n, x0, y0, xm, ym, x1, y1) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : i / (n - 1);
    const a = (1 - t) * (1 - t);
    const b = 2 * (1 - t) * t;
    const c = t * t;
    out.push({ leg, line, x: a * x0 + b * xm + c * x1, y: a * y0 + b * ym + c * y1 });
  }
  return out;
}

export const SYSTEMS = [
  {
    name: 'First Light',
    nebula: 'galaxy',
    hue: 200,
    brake: false,
    catchSpeed: 2.4,
    bodies: [
      { x: 500, y: 1530, r: 70, mu: 5.0e6, ring: 150, img: 3, cloud: '10', spin: 1.2 },
      { x: 260, y: 1060, r: 58, mu: 4.0e6, ring: 160, img: 5, cloud: '05', spin: -1 },
      { x: 730, y: 700, r: 64, mu: 4.6e6, ring: 140, img: 0, cloud: '14', spin: 0.8 },
      { x: 300, y: 370, r: 56, mu: 4.0e6, ring: 125, img: 8, cloud: '22', spin: 1.4 },
      { x: 700, y: 150, r: 50, mu: 3.4e6, ring: 115, img: 1, cloud: '10', spin: -1.2 },
    ],
    legs: [
      { from: 0, to: 1 },
      { from: 1, to: 2 },
      { from: 2, to: 3 },
      { from: 3, to: 4 },
    ],
    motes: [],
  },
];

export const legTarget = (sys, i) => sys.legs[i].to;
export { arc };

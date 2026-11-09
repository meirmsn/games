// Measure Orbit's legs headless, with the game's own physics: how many roughly-aimed flicks
// capture, whether a brake is needed, and the most motes one flight can take.
// Run: node scripts/orbit/solve.mjs [system index]
import { SYSTEMS } from '../../orbit/levels.js';
import { fly, bodyAt, park } from '../../orbit/physics.js';

export function measure(sys, legIndex, { samples = 1500, seed = 1, t0s = [0] } = {}) {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const leg = sys.legs[legIndex];
  const a = bodyAt(sys.bodies, leg.from, 0);
  const b = bodyAt(sys.bodies, leg.to, 0);
  const direct = Math.atan2(b.y - a.y, b.x - a.x);
  let ok = 0;
  let okBrake = 0;
  const why = {};
  let bestMotes = 0;
  const legMotes = (sys.motes || []).filter((m) => m.leg === legIndex).length;
  // "roughly aimed": within 35° of the straight line to the target, any power above a quarter
  for (let k = 0; k < samples; k++) {
    const ang = direct + (rnd() - 0.5) * (70 * Math.PI) / 180;
    const pow = 0.25 + rnd() * 0.75;
    const t0 = t0s[Math.floor(rnd() * t0s.length)];
    const f = fly(sys, legIndex, ang, pow, t0);
    if (f.result === 'captured') ok++;
    else why[f.why + (f.fastPass ? '/fast' : '')] = (why[f.why + (f.fastPass ? '/fast' : '')] || 0) + 1;
    let fb = f;
    if (sys.brake && f.result !== 'captured') {
      for (let bt = 0.3; bt < 5; bt += 0.3) {
        const g = fly(sys, legIndex, ang, pow, t0, { brakeAt: bt });
        if (g.result === 'captured') {
          fb = g;
          break;
        }
      }
    }
    if (fb.result === 'captured') {
      okBrake++;
      bestMotes = Math.max(bestMotes, fb.caught.length);
    }
  }
  return { leg: legIndex, rate: ok / samples, rateBrake: okBrake / samples, why, bestMotes, legMotes };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const only = process.argv[2] !== undefined ? [Number(process.argv[2])] : SYSTEMS.map((_, i) => i);
  for (const i of only) {
    const sys = SYSTEMS[i];
    console.log(`== ${sys.name}`);
    for (let l = 0; l < sys.legs.length; l++) {
      const m = measure(sys, l);
      console.log(
        `leg ${l + 1}: ${(m.rate * 100).toFixed(0)}% capture` +
          (sys.brake ? `, ${(m.rateBrake * 100).toFixed(0)}% with a brake` : '') +
          `, motes ${m.bestMotes}/${m.legMotes}  fails ${JSON.stringify(m.why)}`
      );
    }
  }
}

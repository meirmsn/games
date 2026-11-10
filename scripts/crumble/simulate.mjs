// Crumble's difficulty by level, from simulated battles (how the levels were tuned, specs/crumble.md).
//
// Usage: node scripts/crumble/simulate.mjs [runs per level = 5] [assist = 0.25]
// Needs Playwright's Chromium (scripts/setup.sh). It serves the repo, opens crumble/, and plays each
// level `runs` times on fresh hills against the CPU with a simulated player who aims like a person:
// it knows the right shot (the CPU's own planner) but misses by 0.05 rad and 4.5% of power, twice
// that on its first two shots, and drills with the Auger when the enemy is within 2.5 notches of the
// water. It prints each level's wins and average battle length (counting 4 s to aim each shot).
//
// Recorded on 2026-11-10, 5 runs per level:
//   assist 0.25: L1 5/5 · L2 5/5 · L3 5/5 · L4 5/5 · L5 3/5 · L6 5/5 · L7 4/5 · L8 1/5 · L9 1/5 · L10 1/5
//   assist 1:    L1 5/5 · L2 5/5 · L3 5/5 · L4 5/5 · L5 4/5 · L6 5/5 · L7 5/5 · L8 4/5 · L9 4/5 · L10 2/5
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const runs = Number(process.argv[2] || 5);
const assist = Number(process.argv[3] ?? 0.25);
const PORT = 9700 + Math.floor(Math.random() * 100);
const server = spawn('python3', ['-m', 'http.server', '--bind', '127.0.0.1', String(PORT)], { cwd: new URL('../..', import.meta.url).pathname, stdio: 'ignore' });
for (let i = 0; i < 50; i++) {
  try {
    if ((await fetch(`http://127.0.0.1:${PORT}/`)).ok) break;
  } catch {}
  await new Promise((r) => setTimeout(r, 100));
}
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 844, height: 390 } });
  await page.goto(`http://127.0.0.1:${PORT}/crumble/`);
  await page.waitForFunction(() => window.__crumble);
  const rows = await page.evaluate(
    ({ runs, assist }) => {
      const c = window.__crumble;
      c.manual = true;
      const out = [];
      for (let field = 0; field < c.FIELDS.length; field++) {
        let wins = 0;
        let secs = 0;
        for (let run = 0; run < runs; run++) {
          c.store.assist = assist;
          c.startBattle(field, { newHill: run > 0 });
          let t = 0;
          let shots = 0;
          let seed = run * 99 + field + 1;
          const random = () => {
            seed = (seed * 1664525 + 1013904223) >>> 0;
            return seed / 4294967296;
          };
          while (c.game.mode === 'battle' && t < 900) {
            if (c.game.phase === 'aim') {
              const wide = shots < 2 ? 2.2 : 1;
              const dig = c.FIELDS[field].auger && c.tanks[0].augers > 0 && c.hullY(c.tanks[1]) > c.game.waterY - c.game.notch * 2.5;
              const p = c.plan(c.tanks[0], c.tanks[1], { random, weapon: dig ? 'auger' : 'shell', spreadAngle: 0.05 * wide, spreadPower: 0.045 * wide });
              c.fire(0, p.weapon, p.angle, p.power);
              shots++;
              t += 4;
            }
            c.step(1 / 30);
            t += 1 / 30;
          }
          if (c.game.outcome?.win) wins++;
          secs += t;
          c.showStart();
          c.manual = true;
        }
        out.push(`L${field + 1} ${c.FIELDS[field].name}: ${wins}/${runs} won, ${Math.round(secs / runs)} s a battle`);
      }
      return out;
    },
    { runs, assist }
  );
  console.log(`assist ${assist}, ${runs} runs per level`);
  for (const r of rows) console.log(r);
} finally {
  await browser.close();
  server.kill();
}

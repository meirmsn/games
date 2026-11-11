// Island Hop's timed playtest (specs/island-hop.md AC-20): each mission's autopilot time on its gold
// route against its band, the other order's time against gold, and the frame rate at 390 × 844 while
// the autopilot drives round Port Town, the largest island's town.
// Run: node scripts/island-hop/playtest.mjs   (needs Playwright's Chromium, like scripts/check-slow.sh)
// Exits 1 if any mission misses its band or its gold, or the frame rate is under 50.
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import { MISSIONS, runPilot, medalTimes } from '../../island-hop/rules.js';

const BANDS = [[25, 50], [40, 75], [60, 110], [65, 120], [75, 130], [80, 140]];
let ok = true;
console.log('mission  gold route  band       other order  gold medal');
for (const [i, m] of MISSIONS.entries()) {
  const gold = runPilot(i, m.gold);
  const alt = runPilot(i, m.alt);
  const [lo, hi] = BANDS[i];
  const g = medalTimes(i).gold;
  const pass = gold.phase === 'done' && gold.clock >= lo && gold.clock <= hi && alt.clock > g;
  ok &&= pass;
  console.log(
    `${String(i + 1).padEnd(9)}${gold.clock.toFixed(1).padStart(8)} s  ${`${lo}–${hi} s`.padEnd(11)}${alt.clock.toFixed(1).padStart(9)} s  ${g.toFixed(1).padStart(8)} s  ${pass ? 'ok' : 'MISSED'}`
  );
}

const root = new URL('../..', import.meta.url).pathname;
const PORT = 8950 + Math.floor(Math.random() * 40);
const server = spawn('python3', ['-m', 'http.server', '--bind', '127.0.0.1', String(PORT)], { cwd: root, stdio: 'ignore' });
for (let i = 0; i < 50; i++) {
  try {
    if ((await fetch(`http://127.0.0.1:${PORT}/`)).ok) break;
  } catch {}
  await new Promise((r) => setTimeout(r, 100));
}
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await page.goto(`http://127.0.0.1:${PORT}/island-hop/`);
  await page.waitForFunction(() => window.__hop);
  // Mission 2's gold route: docked in Port Town by about 32 s, then on foot and by car.
  await page.evaluate(() => {
    __hop.manual = true;
    __hop.start(1, { fly: false });
    __hop.autopilot('gold');
    __hop.step(33);
    __hop.manual = false;
  });
  await page.waitForTimeout(1500);
  const fps = await page.evaluate(
    () =>
      new Promise((resolve) => {
        let n = 0;
        const t0 = performance.now();
        const tick = () => {
          n++;
          if (performance.now() - t0 < 5000) requestAnimationFrame(tick);
          else resolve((n * 1000) / (performance.now() - t0));
        };
        requestAnimationFrame(tick);
      })
  );
  const mode = await page.evaluate(() => __hop.state.mode);
  const pass = fps >= 50;
  ok &&= pass;
  console.log(`frame rate in Port Town (${mode}, 390 × 844 at 2×): ${fps.toFixed(1)} fps ${pass ? 'ok' : 'LOW'}`);
} finally {
  await browser.close();
  server.kill();
}
console.log(ok ? 'All targets met' : 'Targets missed');
process.exit(ok ? 0 : 1);

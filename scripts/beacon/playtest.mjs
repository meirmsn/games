// Beacon's timed playtest (specs/beacon.md, AC-21): an autopilot plays whole nights in the real page
// at 390 × 844, on every coast, and prints the tuning targets: when the first ship comes home (the
// first freighter, in the beam from the start), the first ship the player brought home, the first
// cutter, the first wreck, and the sailors home, beside a night with no input at all.
// Run: node scripts/beacon/playtest.mjs [nights per coast, default 2]
// (needs Playwright's Chromium, like scripts/check-slow.sh)
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const root = new URL('../..', import.meta.url).pathname;
const nights = Number(process.argv[2] || 2);
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
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(`http://127.0.0.1:${PORT}/beacon/`);
  await page.waitForFunction(() => window.__beacon);
  const rows = [];
  for (let coast = 0; coast < 5; coast++)
    for (let n = 1; n <= nights; n++)
      for (const pilot of [true, false]) {
        const r = await page.evaluate(
          ({ coast, n, pilot }) => {
            const b = window.__beacon;
            b.mem.open = 4;
            b.start({ coast, night: n });
            b.manual = true;
            const out = { coast: b.COASTS[coast].name, night: n, pilot, firstHome: null, playerHome: null, cutter: null, wreck: null };
            const seen = new Set(b.s.ships.map((x) => x.id));
            const demo = b.s.ships[0].id;
            let k = 0;
            while (b.mode === 'night') {
              if (pilot && k % 15 === 0) {
                const t = b.autopilotTarget();
                b.setInput(t === null ? {} : { hold: true, target: t });
              }
              k++;
              const home = b.s.home;
              const wrecked = b.s.wrecked;
              const moored = b.s.moored.length;
              b.step(1 / 60);
              const t = Math.round(b.s.t * 10) / 10;
              if (b.s.home > home && out.firstHome === null) out.firstHome = t;
              if (b.s.moored.length > moored && b.s.moored.at(-1).id !== demo && out.playerHome === null) out.playerHome = t;
              if (b.s.wrecked > wrecked && out.wreck === null) out.wreck = t;
              for (const x of b.s.ships)
                if (!seen.has(x.id)) {
                  seen.add(x.id);
                  if (x.kind === 'cutter' && out.cutter === null) out.cutter = t;
                }
            }
            const s = b.s;
            return { ...out, home: s.home, total: s.total, wrecked: s.wrecked, lost: s.lost, closeCalls: s.closeCalls, stars: s.stars, end: Math.round(s.t) };
          },
          { coast, n, pilot }
        );
        rows.push(r);
        console.log(
          `${r.coast.padEnd(13)} night ${r.night} ${r.pilot ? 'autopilot' : 'no input '}  home ${String(r.home).padStart(2)}/${r.total} (${Math.round((100 * r.home) / r.total)}%)  ★${r.stars}  wrecks ${r.wrecked}  lost ${r.lost}  first home ${r.firstHome}s  player's first ${r.playerHome}s  first cutter ${r.cutter}s  first wreck ${r.wreck}s  dawn ${r.end}s`
        );
      }
  // The targets (specs/beacon.md): any miss is printed, and the script exits 1.
  const misses = [];
  for (const r of rows) {
    const at = `${r.coast} night ${r.night} ${r.pilot ? 'autopilot' : 'no input'}`;
    if (!(r.firstHome <= 8)) misses.push(`${at}: first ship home at ${r.firstHome}s, not by 8 s`);
    if (!(r.cutter <= 45)) misses.push(`${at}: first cutter at ${r.cutter}s, not by 45 s`);
    if (r.pilot && !(r.playerHome <= 40)) misses.push(`${at}: the player's first ship home at ${r.playerHome}s, not by about 35 s`);
  }
  console.log('\nAverages per coast (autopilot / no input):');
  for (const name of new Set(rows.map((r) => r.coast))) {
    const pct = (pilot) => {
      const rs = rows.filter((r) => r.coast === name && r.pilot === pilot);
      return Math.round((100 * rs.reduce((n, r) => n + r.home, 0)) / rs.reduce((n, r) => n + r.total, 0));
    };
    console.log(`  ${name.padEnd(13)} ${pct(true)}% / ${pct(false)}%`);
    if (pct(true) < 80) misses.push(`${name}: the autopilot brought home ${pct(true)}%, under 80%`);
    if (pct(false) >= 45) misses.push(`${name}: no input brought home ${pct(false)}%, 45% or more`);
  }
  console.log(misses.length ? `\nMISSED:\n  ${misses.join('\n  ')}` : '\nAll targets met.');
  process.exitCode = misses.length ? 1 : 0;
} finally {
  await browser.close();
  server.kill();
}

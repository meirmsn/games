// Renders Beacon's landing tile (assets/tiles/beacon.png) with the game's own drawing code: the
// lighthouse's beam on a freighter coming in, past the rocks, with the town's windows lighting.
// Run: node scripts/beacon/make-tile.mjs   (needs Playwright's Chromium, like scripts/check-slow.sh)
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const root = new URL('../..', import.meta.url).pathname;
const PORT = 8900 + Math.floor(Math.random() * 100);
const server = spawn('python3', ['-m', 'http.server', '--bind', '127.0.0.1', String(PORT)], { cwd: root, stdio: 'ignore' });
for (let i = 0; i < 50; i++) {
  try {
    if ((await fetch(`http://127.0.0.1:${PORT}/`)).ok) break;
  } catch {}
  await new Promise((r) => setTimeout(r, 100));
}

const browser = await chromium.launch();
try {
  // A tall view, cropped to the tile's 320 × 200 CSS px at 2x (640 × 400): the lower bay, the
  // lighthouse and the town.
  const page = await browser.newPage({ viewport: { width: 320, height: 560 }, deviceScaleFactor: 2 });
  await page.goto(`http://127.0.0.1:${PORT}/beacon/`);
  await page.waitForFunction(() => window.__beacon && performance.getEntriesByType('resource').some((r) => r.name.endsWith('atlas.png')));
  await page.addStyleTag({ content: 'body > :not(canvas) { display: none !important; }' });
  await page.evaluate(() => {
    const b = window.__beacon;
    b.mem.touched = true;
    b.start({ coast: 0, night: 3 });
    b.manual = true;
    // Play the first minute with the autopilot, so ships are on the sea and windows are lit.
    let n = 0;
    while (b.s.t < 58) {
      if (n++ % 6 === 0) {
        const t = b.autopilotTarget();
        b.setInput(t === null ? {} : { hold: true, target: t });
      }
      b.step(1 / 60);
    }
    // The beam on the ship nearest home.
    const ship = [...b.s.ships].filter((x) => x.kind !== 'lifeboat').sort((p, q) => q.y - p.y)[0];
    if (ship) b.s.beam.a = Math.max(b.beamLimits()[0], Math.min(b.beamLimits()[1], b.bearingOf(ship.x, ship.y)));
    b.pose();
    b.draw(2);
  });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${root}assets/tiles/beacon.png`, clip: { x: 0, y: 332, width: 320, height: 200 } });
  console.log('wrote assets/tiles/beacon.png');
} finally {
  await browser.close();
  server.kill();
}

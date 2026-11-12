// Renders Island Hop's landing tile (assets/tiles/island-hop.png) with the game itself: Port Town's
// harbour mid-mission, the car on the ring road, the boats and the stops' beams, the HUD hidden.
// Run: node scripts/island-hop/make-tile.mjs   (needs Playwright's Chromium, like scripts/check-slow.sh)
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
  // 320 × 200 CSS pixels at 2x: the tile's 640 × 400.
  const page = await browser.newPage({ viewport: { width: 320, height: 200 }, deviceScaleFactor: 2 });
  await page.goto(`http://127.0.0.1:${PORT}/island-hop/`);
  await page.waitForFunction(() => window.__hop);
  await page.evaluate(() => new Promise((r) => (document.querySelector('img') || { complete: true }).complete ? r() : setTimeout(r, 500)));
  await page.addStyleTag({ content: '.hud, .card, .round, .shell-back { display: none !important; }' });
  await page.evaluate(() => {
    __hop.start(1, { fly: false });
    __hop.autopilot('gold');
    __hop.step(26.2);
    __hop.autopilot(null);
  });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${root}assets/tiles/island-hop.png` });
  console.log('wrote assets/tiles/island-hop.png');
} finally {
  await browser.close();
  server.kill();
}

// Renders High Seas' landing tile (assets/tiles/high-seas.png) with the game's own drawing code:
// an islet with palms, the galleon, and the dinghy running under its spinnaker.
// Run: node scripts/high-seas/make-tile.mjs   (needs Playwright's Chromium, like scripts/check-slow.sh)
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
  await page.goto(`http://127.0.0.1:${PORT}/high-seas/#TILE`);
  await page.waitForFunction(() => window.__seas);
  await page.addStyleTag({ content: 'body > :not(canvas) { display: none !important; } body { background: none !important; }' });
  await page.evaluate(() => window.__seas.pose());
  await page.waitForFunction(() => document.querySelector('img') === null && performance.getEntriesByType('resource').some((r) => r.name.endsWith('atlas.png')));
  await page.waitForTimeout(400);
  await page.locator('canvas').screenshot({ path: `${root}assets/tiles/high-seas.png`, omitBackground: true });
  console.log('wrote assets/tiles/high-seas.png');
} finally {
  await browser.close();
  server.kill();
}

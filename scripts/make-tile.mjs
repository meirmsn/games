// Renders the landing tile for Googly Faces (assets/tiles/googly-faces.png) with the game's own
// drawing code, so the tile shows the same faces, eyes and mouths as the game.
// Run: node scripts/make-tile.mjs   (needs Playwright's Chromium, like scripts/check-slow.sh)
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const root = new URL('..', import.meta.url).pathname;
const PORT = 8800 + Math.floor(Math.random() * 100);
const server = spawn('python3', ['-m', 'http.server', '--bind', '127.0.0.1', String(PORT)], { cwd: root, stdio: 'ignore' });
for (let i = 0; i < 50; i++) {
  try {
    if ((await fetch(`http://127.0.0.1:${PORT}/`)).ok) break;
  } catch {}
  await new Promise((r) => setTimeout(r, 100));
}

// 320 × 200 CSS pixels at 2x: the tile's 640 × 400. Feet (x, y) and size in CSS pixels; pupils in
// eye radii, screen space (y down), as the game keeps them.
const FACES = [
  { color: 'yellow', shape: 'circle', x: 128, y: 168, size: 128, mouth: 'happy', pupils: [{ x: 0.05, y: 0.39 }, { x: -0.04, y: 0.39 }] },
  {
    color: 'pink', shape: 'squircle', x: 236, y: 144, size: 88, mouth: 'o', hop: 14, tilt: 0.14, brows: 1,
    pupils: [{ x: 0.22, y: -0.3 }, { x: -0.12, y: -0.36 }],
  },
];

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 320, height: 200 }, deviceScaleFactor: 2, colorScheme: 'light' });
  await page.goto(`http://127.0.0.1:${PORT}/googly-faces/`);
  await page.waitForFunction(() => document.documentElement.dataset.ready === 'true');
  await page.addStyleTag({ content: 'body > :not(canvas) { display: none !important; } body { background: none !important; }' });
  await page.evaluate((faces) => window.googly.pose(faces), FACES);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.locator('canvas').screenshot({ path: `${root}assets/tiles/googly-faces.png`, omitBackground: true });
  console.log('wrote assets/tiles/googly-faces.png');
} finally {
  await browser.close();
  server.kill();
}

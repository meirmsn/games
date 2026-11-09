// Draws the landing page's Runes tile (assets/tiles/runes.png, 640 × 400) from the game itself:
// level 10 with the line part way through, the page's buttons and title hidden.
//   node scripts/runes/make-tile.mjs   (serves the site itself on a free port)
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';

const root = new URL('../..', import.meta.url).pathname;
const port = 8900 + Math.floor(Math.random() * 90);
const server = spawn('python3', ['-m', 'http.server', '--bind', '127.0.0.1', String(port)], { cwd: root, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 700));
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 640, height: 400 }, deviceScaleFactor: 1 });
  await page.goto(`http://127.0.0.1:${port}/runes/#10`);
  await page.waitForFunction(() => window.__runes);
  await page.addStyleTag({ content: '.title, .bar, .mute, .shell-back { display: none !important; }' });
  await page.evaluate(() => {
    const r = window.__runes;
    // Use the whole tile for the pool.
    r.box.cell = 60;
    r.box.ox = Math.round((640 - 60 * r.game.level.w) / 2);
    r.box.oy = Math.round((400 - 60 * (r.game.level.h + 0.2)) / 2);
    for (const c of r.game.solutions[0].slice(1, 9)) r.stepTo(c);
  });
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${root}assets/tiles/runes.png` });
} finally {
  await browser.close();
  server.kill();
}

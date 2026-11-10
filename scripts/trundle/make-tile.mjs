// Renders the landing tile for Trundle (assets/tiles/trundle.png) with the game itself: room 4 in
// mid-attempt, Trundle with his red and blue balls, a ball on the green plank, cropped to the tile's
// 640 × 400.
// Run: node scripts/trundle/make-tile.mjs   (needs Playwright's Chromium, like scripts/check-slow.sh)
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
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
  // 10 board units ≈ 320 CSS px, so a 320 × 200 crop at 2x is close to the tile's 640 × 400.
  const page = await browser.newPage({ viewport: { width: 352, height: 720 }, deviceScaleFactor: 2 });
  await page.goto(`http://127.0.0.1:${PORT}/trundle/`);
  await page.waitForFunction(() => window.__trundle);
  await page.waitForTimeout(800);
  const clip = await page.evaluate(([AT, ROOM]) => {
    const T = window.__trundle;
    T.manual = true;
    T.openRoom(ROOM);
    const sol = T.ROOMS[ROOM].solution;
    const att = T.G.att;
    let li = 0;
    const step = att.step;
    att.step = () => {
      while (li < sol.log.length && sol.log[li].s === att.steps) {
        const { s, ...e } = sol.log[li++];
        att.edit(e);
      }
      step();
    };
    // a moment with balls on the way down
    while (att.t < AT) T.frame(1000 / 120);
    const a = T.toScreen(0, 0.4);
    const b = T.toScreen(10, 6.65);
    return { x: a.x, y: a.y, width: b.x - a.x, height: b.y - a.y };
  }, [+(process.env.TILE_AT || 1.25), +(process.env.TILE_ROOM || 3)]);
  await page.waitForTimeout(100);
  const shot = await page.screenshot({ clip });
  // scale the crop to exactly 640 × 400
  const page2 = await browser.newPage({ viewport: { width: 640, height: 400 } });
  await page2.setContent('<canvas id="c" width="640" height="400"></canvas>');
  const png = await page2.evaluate(async (b64) => {
    const im = new Image();
    im.src = 'data:image/png;base64,' + b64;
    await im.decode();
    const c = document.getElementById('c');
    c.getContext('2d').drawImage(im, 0, 0, 640, 400);
    return c.toDataURL('image/png').split(',')[1];
  }, shot.toString('base64'));
  writeFileSync(process.env.TILE_OUT || new URL('../../assets/tiles/trundle.png', import.meta.url), Buffer.from(png, 'base64'));
  console.log('wrote assets/tiles/trundle.png');
} finally {
  await browser.close();
  server.kill();
}

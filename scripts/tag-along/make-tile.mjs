// Draws Tag Along's landing-page tile (assets/tiles/tag-along.png, 640×400) from the game itself:
// Maple Street with a line of people mid-crossing. Serve the site first, then:
//   PORT=8000 scripts/local-run.sh &
//   node scripts/tag-along/make-tile.mjs http://127.0.0.1:8000/
import { chromium } from 'playwright';

const base = process.argv[2] || 'http://127.0.0.1:8000/';
const out = new URL('../../assets/tiles/tag-along.png', import.meta.url).pathname;
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 640, height: 400 }, deviceScaleFactor: 1 })).newPage();
await page.goto(base + 'tag-along/?tile');
await page.waitForFunction(() => window.__tagAlong);
await page.evaluate(() => {
  const t = window.__tagAlong;
  t.seed(4);
  t.startGame(0);
  t.manual = true;
  for (let i = 0; i < 90; i++) t.step(1 / 60);
  const b = t.layout().bottom;
  t.form([[6, b - 3], [6, b - 2], [5, b - 2], [5, b - 1], [4, b - 1]], { dest: 0 });
  t.game.grace = 99;
  t.clearTraffic();
  t.spawnVehicle(1, 'sedan_blue', 120);
  t.spawnVehicle(1, 'taxi', 190);
  t.spawnVehicle(2, 'rounded_red', 118);
  t.spawnVehicle(2, 'van_small', 205);
  t.spawnVehicle(3, 'sports_yellow', 140);
  t.spawnVehicle(3, 'suv_green', 200);
  for (let i = 0; i < 12; i++) t.step(1 / 60);
  t.game.mode = 'title'; // no payout label
  for (const sel of ['[data-hud]', '[data-banner]', '.shell-back', '[data-mute]']) {
    const el = document.querySelector(sel);
    if (el) el.style.display = 'none';
  }
});
await page.waitForTimeout(300);
await page.screenshot({ path: out });
await browser.close();
console.log(`tile: ${out}`);

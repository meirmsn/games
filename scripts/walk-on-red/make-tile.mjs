// Draws Walk on Red's landing-page tile (assets/tiles/walk-on-red.png, 640×400) from the game itself:
// Sunday Morning at a red light: him on the island with the copiers, cars either side of the crossing. Serve the site
// first, then:
//   PORT=8000 scripts/local-run.sh &
//   node scripts/walk-on-red/make-tile.mjs http://127.0.0.1:8000/
import { chromium } from 'playwright';

const base = process.argv[2] || 'http://127.0.0.1:8000/';
const out = new URL('../../assets/tiles/walk-on-red.png', import.meta.url).pathname;
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 640, height: 400 }, deviceScaleFactor: 1 })).newPage();
await page.goto(base + 'walk-on-red/?tile');
await page.waitForFunction(() => window.__walkOnRed);
await page.evaluate(() => {
  const t = window.__walkOnRed;
  t.seed(4);
  t.startGame(4);
  t.manual = true;
  t.game.grace = 99;
  t.clearTraffic();
  const m = t.layout().rows.indexOf('M');
  t.put(t.layout().bottom - 2);
  for (let i = 0; i < 60 * 0.5; i++) t.step(1 / 60);
  t.put(m);
  for (let i = 0; i < 60 * 3; i++) t.step(1 / 60); // the copiers join him on the island
  // Cars on either side of the crossing, none on it.
  t.spawnVehicle(1, 'taxi', 70);
  t.spawnVehicle(1, 'sedan_blue', 230);
  t.spawnVehicle(2, 'bus', 100);
  t.spawnVehicle(4, 'van', 95);
  t.spawnVehicle(5, 'sports_yellow', 60);
  t.spawnVehicle(5, 'rounded_red', 240);
  for (let i = 0; i < 6; i++) t.step(1 / 60);
  t.game.mode = 'title'; // no score label
  for (const sel of ['[data-hud]', '[data-banner]', '.shell-back', '[data-mute]']) {
    const el = document.querySelector(sel);
    if (el) el.style.display = 'none';
  }
});
await page.waitForTimeout(300);
await page.screenshot({ path: out });
await browser.close();
console.log(`tile: ${out}`);

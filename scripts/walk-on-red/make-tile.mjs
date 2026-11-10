// Draws Gotta Go!'s landing-page tile (assets/tiles/walk-on-red.png, 640×400) from the game itself:
// a close-up of the far end of the crossing, the game's own portrait view at exactly 6×, cut to the
// porta-potty, the far sidewalk and the top of the zebra, with him hopping onto the kerb, sweating.
// No cars: the view is only the crossing, and the traffic is cleared. Serve the site first, then:
//   PORT=8000 scripts/local-run.sh &
//   node scripts/walk-on-red/make-tile.mjs http://127.0.0.1:8000/
import { chromium } from 'playwright';

const base = process.argv[2] || 'http://127.0.0.1:8000/';
const out = new URL('../../assets/tiles/walk-on-red.png', import.meta.url).pathname;
const W = 640;
const H = 400;
const K = 6; // CSS px per art px: the crossing is 108 art px wide, so the page is 648 px wide
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 108 * K, height: 1600 }, deviceScaleFactor: 1 })).newPage();
await page.goto(base + 'walk-on-red/?tile');
await page.waitForFunction(() => window.__walkOnRed);
const top = await page.evaluate(() => {
  const t = window.__walkOnRed;
  t.seed(4);
  t.startGame(0); // Quiet Street: just him
  t.manual = true;
  t.game.grace = 99;
  t.clearTraffic();
  t.put(1); // on the zebra, one hop from the far sidewalk and the porta-potty
  // On to a moment his drop of sweat shows, then halfway through his hop onto the far kerb.
  for (let i = 0; i < 60 * 8; i++) {
    t.step(1 / 60);
    const ph = (t.game.time * 1.3) % 1;
    if (t.game.time > 2 && ph > 0.05 && ph < 0.15) break;
  }
  t.game.grace = 0;
  t.move('up');
  t.game.grace = 99;
  for (let i = 0; i < 4; i++) t.step(1 / 60);
  if (t.game.mode !== 'play' || t.player.tw >= 1) throw new Error('he should be mid-hop, still playing');
  for (const sel of ['[data-hud]', '[data-banner]', '.shell-back', '[data-mute]', '[data-screen]']) {
    for (const el of document.querySelectorAll(sel)) el.style.display = 'none';
  }
  if (t.view.scale !== 6) throw new Error(`the view is at ${t.view.scale}×, not 6×`);
  return t.view.top;
});
await page.waitForTimeout(300);
// From just above the porta-potty's vent (the street's top is the far sidewalk's back edge) down into
// the zebra's first row.
const y = Math.round(top - 26 * K);
await page.screenshot({ path: out, clip: { x: (108 * K - W) / 2, y, width: W, height: H } });
await browser.close();
console.log(`tile: ${out}`);

// Draw Orbit's landing tile (assets/tiles/orbit.png, 640 × 400) from the game itself: the probe
// mid-slingshot round System 2's big planet, with its trail.
// Needs the site served locally: PORT=8000 scripts/local-run.sh, then
//   node scripts/orbit/make-tile.mjs http://127.0.0.1:8000/
import { chromium } from 'playwright';

const base = process.argv[2] || 'http://127.0.0.1:8000/';
const out = new URL('../../assets/tiles/orbit.png', import.meta.url).pathname;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 });
await page.goto(base + 'orbit/#s2');
await page.waitForFunction(() => window.__orbit && 'ready' in document.body.dataset);
const box = await page.evaluate(() => {
  const o = window.__orbit;
  o.manual = true;
  document.querySelector('[data-screen="intro"]').hidden = true;
  document.querySelector('[data-hud]').hidden = true;
  document.querySelector('.mute').hidden = true;
  document.querySelector('[data-boost]').hidden = true;
  document.querySelector('.shell-back').hidden = true;
  const g = o.game;
  g.braked = true;
  // a release that whips half way round the big planet (found with the solver's physics)
  g.park.dir = -1;
  o.fire(0, 5.672);
  for (let i = 0; i < 240 * 2.3 && g.mode === 'fly'; i++) o.update(1 / 240);
  o.draw();
  // a 16:10 box round the big planet and the target
  const v = o.view;
  const b = g.level.bodies[1];
  const w = 1130 * v.s;
  const h = (w * 10) / 16;
  const cy = v.y + (b.y + 120) * v.s;
  return { x: v.x - 65 * v.s, y: cy - h / 2, width: w, height: h };
});
await page.screenshot({ path: out, clip: box, scale: 'device' });
await browser.close();

// Scale to the tile's 640 × 400.
const resize = await chromium.launch();
const p2 = await resize.newPage({ viewport: { width: 640, height: 400 } });
const fs = await import('node:fs');
const data = fs.readFileSync(out).toString('base64');
await p2.setContent(`<body style="margin:0;background:#000"><img src="data:image/png;base64,${data}" style="width:640px;height:400px;display:block"></body>`);
await p2.screenshot({ path: out });
await resize.close();
console.log('wrote', out);

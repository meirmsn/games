// Renders the landing tile for Shooting Gallery (assets/tiles/shooting-gallery.png) with the game's
// own drawing code: a posed booth, cropped to the tile's 640 × 400.
// Run: node scripts/shooting-gallery/make-tile.mjs   (needs Playwright's Chromium)
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
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  await page.goto(`http://127.0.0.1:${PORT}/shooting-gallery/`);
  await page.waitForFunction(() => window.__gallery);
  await page.addStyleTag({ content: 'body > :not(canvas) { display: none !important; }' });
  const clip = await page.evaluate(() => {
    const g = window.__gallery;
    g.manual = true;
    g.startRun({ seed: 7 });
    g.startRound(2);
    g.clear();
    g.game.mode = 'play';
    g.game.banner = null;
    g.game.frenzyAt = 0;
    g.game.spawn = { movers: g.L.lanes.map(() => 999), pop: 999, drop: 999, gold: [] };
    const { SW, k, ox, oy } = g.stage();
    const L = g.L;
    const at = (kind, lane, x, face, opts = {}) => g.makeTarget(kind, { lane, x, face, speed: 0, turn: false, ...opts });
    at('target', 0, SW * 0.28, 'target_colored');
    at('target', 0, SW * 0.7, 'target_red1');
    at('duck', 1, SW * 0.18, 'duck_yellow');
    at('duck', 1, SW * 0.52, 'duck_target_brown');
    at('target', 2, SW * 0.36, 'target_red3');
    at('pop', 2, SW * 0.74, 'target_colored', { up: true, upFor: 99 });
    // Paint already on the booth: a few misses, and one shot on its way.
    for (const [fx, lane] of [[0.12, 0], [0.4, 1], [0.66, 0], [0.82, 1], [0.24, 2], [0.55, 2], [0.9, 0], [0.06, 1]]) {
      g.aimAt(SW * fx, L.lanes[lane].line);
      g.game.lastFire = -1;
      g.fire();
      for (let i = 0; i < 30; i++) g.step(1 / 60);
    }
    g.clear();
    at('target', 0, SW * 0.28, 'target_colored');
    at('target', 0, SW * 0.7, 'target_red1');
    at('duck', 1, SW * 0.18, 'duck_yellow');
    at('duck', 1, SW * 0.52, 'duck_target_brown');
    at('target', 2, SW * 0.36, 'target_red3');
    at('pop', 2, SW * 0.74, 'target_colored', { up: true, upFor: 99 });
    g.aimAt(SW * 0.47, L.lanes[1].line);
    g.aim.active = true;
    g.game.lastFire = -1;
    g.fire();
    g.setPull(-18, 40);
    g.step(0.12);
    // No HUD on the tile: just the booth, its paint, the ball in flight and the slingshot.
    g.game.mode = 'start';
    g.game.attract = false;
    // The tile: the booth from the valance down to the slingshot, cropped at the tile's own 16:10
    // (cropping a wider strip and scaling it to 16:10 squeezed the picture).
    const top = oy + (L.top + 4) * k;
    const bottom = oy + (L.C + 64) * k;
    const h = bottom - top;
    const w = h * 1.6;
    return { x: ox + (SW * k - w) / 2, y: top, width: w, height: h };
  });
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const shot = await page.screenshot({ clip });
  // Scale to exactly 640 × 400 in the page itself.
  const png = await page.evaluate(async (b64) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + b64;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = 640;
    c.height = 400;
    const g = c.getContext('2d');
    g.imageSmoothingQuality = 'high';
    g.drawImage(img, 0, 0, 640, 400);
    return c.toDataURL('image/png').split(',')[1];
  }, shot.toString('base64'));
  const { writeFileSync } = await import('node:fs');
  const out = `${root}assets/tiles/shooting-gallery.png`;
  writeFileSync(out, Buffer.from(png, 'base64'));
  // The flat art fits 128 colours with no visible change, at a fifth of the size (needs Pillow).
  const { spawnSync } = await import('node:child_process');
  const q = spawnSync('python3', ['-I', '-c', 'import sys\nfrom PIL import Image\nim = Image.open(sys.argv[1]).convert("RGB")\nim.quantize(colors=128, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).save(sys.argv[1], optimize=True)', out]);
  if (q.status !== 0) console.warn('not quantized (Pillow missing?): the tile is larger but fine');
  console.log('wrote assets/tiles/shooting-gallery.png');
} finally {
  await browser.close();
  server.kill();
}

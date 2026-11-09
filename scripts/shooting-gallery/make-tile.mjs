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
  const page = await browser.newPage({ viewport: { width: 1024, height: 640 }, deviceScaleFactor: 1 });
  await page.goto(`http://127.0.0.1:${PORT}/shooting-gallery/`);
  await page.waitForFunction(() => window.__gallery);
  await page.addStyleTag({ content: 'body > :not(canvas) { display: none !important; }' });
  const clip = await page.evaluate(() => {
    const g = window.__gallery;
    g.manual = true;
    g.startRun({ seed: 7 });
    g.startRound(3);
    g.clear();
    g.game.mode = 'play';
    g.game.banner = null;
    const { SW, k, ox } = g.stage();
    const L = g.L;
    const at = (kind, x, face, opts = {}) => {
      const t = g.makeTarget(kind, { x, face, ...opts });
      t.turn = false;
      return t;
    };
    at('tin', SW * 0.3, 'target_colored');
    at('tin', SW * 0.72, 'target_red1');
    at('duck', SW * 0.2, 'duck_yellow');
    at('duck', SW * 0.5, 'duck_target_brown');
    at('duck', SW * 0.82, 'duck_white', { dir: -1 });
    at('pop', SW * 0.64, 'target_red3', { up: true, upFor: 99 });
    g.step(0.4);
    g.cross.x = SW * 0.5 + 6;
    g.cross.y = L.duckY + 22;
    // The tile: the booth from the valance down to the front water, at the tile's 1.6 aspect.
    const w = SW * k;
    const h = w / 1.6;
    return { x: ox, y: Math.max(0, (L.frontY + 40) * k - h), width: w, height: h };
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

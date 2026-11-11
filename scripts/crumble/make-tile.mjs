// Draws Crumble's landing tile (assets/tiles/crumble.png, 640×400) from the game itself: Morning
// Beach mid-battle, with craters, the tide part-way up, a shell in the air, a supply crate on its
// parachute and a blast by the enemy. Re-run after the game's look changes, then
// `node scripts/make-previews.mjs` (and see the note there on Crumble's preview size).
//   node scripts/crumble/make-tile.mjs   (needs Playwright's Chromium, like scripts/check-slow.sh)
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const root = new URL('../..', import.meta.url).pathname;
const PORT = 9800 + Math.floor(Math.random() * 100);
const server = spawn('python3', ['-m', 'http.server', '--bind', '127.0.0.1', String(PORT)], { cwd: root, stdio: 'ignore' });
for (let i = 0; i < 50; i++) {
  try {
    if ((await fetch(`http://127.0.0.1:${PORT}/`)).ok) break;
  } catch {}
  await new Promise((r) => setTimeout(r, 100));
}
const browser = await chromium.launch();
try {
  // Rendered large, then cropped to the battle: the world is wider than a tile.
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  await page.goto(`http://127.0.0.1:${PORT}/crumble/`);
  await page.waitForFunction(() => window.__crumble);
  await page.addStyleTag({ content: '.shell-back,.mute,.card,.hud-top,.hud-bottom,.banner{display:none!important}' });
  await page.evaluate(() => {
    const c = window.__crumble;
    c.manual = true;
    c.store.taught = true;
    c.setupBattle(0, { seed: 1003 });
    c.game.mode = 'battle';
    c.game.phase = 'idle';
    for (const x of [520, 610, 905, 980]) c.terrain.carve(x, c.terrain.top(x) + 10, 34, { scorch: c.FIELDS[0].scorch });
    c.game.waterY -= c.game.notch * 1.5;
    c.tanks[0].aim = 0.75;
    c.tanks[1].aim = Math.PI - 0.8;
    for (let i = 0; i < 30; i++) c.step(1 / 60);
    const e = c.tanks[1];
    c.fx.burst(e.x - 46, e.y - 20, { radius: 40, debris: '#d9b47a' });
    c.fx.update(0.12);
    c.shoot(640, 230, 300, -60);
    c.dropCrate();
    c.game.crate.x = 760;
    c.game.crate.y = 170;
  });
  await page.waitForTimeout(150);
  await page.screenshot({ path: `${root}assets/tiles/crumble.png`, clip: { x: 150, y: 188, width: 980, height: 612 } });
} finally {
  await browser.close();
  server.kill();
}
// The clip is 980×612; scale it to the tile's 640×400.
const shrink = spawn('python3', ['-c', `from PIL import Image\nim=Image.open('${root}assets/tiles/crumble.png').convert('RGB').resize((640,400),Image.LANCZOS)\nim.save('${root}assets/tiles/crumble.png',optimize=True)`], { stdio: 'inherit' });
await new Promise((r) => shrink.on('exit', r));
console.log('wrote assets/tiles/crumble.png');

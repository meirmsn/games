import { chromium } from 'playwright';
const S = '/tmp/claude-0/-home-user-games/835ffd20-9fa6-510d-a1a6-d9dd5b6b1f0c/scratchpad/';
const b = await chromium.launch();
for (const [w, h, name] of [[390, 844, 'done-phone'], [1280, 800, 'done-desk']]) {
  const p = await b.newPage({ viewport: { width: w, height: h } });
  await p.goto('http://127.0.0.1:8123/orbit/#s1'); await p.waitForFunction(() => window.__orbit && 'ready' in document.body.dataset);
  await p.evaluate(() => {
    const o = window.__orbit; const g = o.game; o.manual = true;
    for (let k = 0; k < 4; k++) {
      const gold = g.level.legs[g.leg].gold; g.clock = g.legStart; o.fire(gold.angle, 0.06 + gold.power * 0.94);
      for (let i = 0; i < 240 * 12 && g.mode === 'fly'; i++) o.update(1 / 240);
      for (let i = 0; i < 60 && g.mode === 'capture'; i++) o.update(1 / 60);
    }
    o.manual = false;
  });
  await p.waitForTimeout(700);
  await p.screenshot({ path: S + name + '.png' });
  await p.close();
}
await b.close();

import { chromium } from 'playwright';
const S = '/tmp/claude-0/-home-user-games/835ffd20-9fa6-510d-a1a6-d9dd5b6b1f0c/scratchpad/';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto('http://127.0.0.1:8123/orbit/'); await p.waitForFunction(() => window.__orbit && 'ready' in document.body.dataset);
await p.waitForTimeout(600);
// aim: drag from mid-screen down-right (launch up-left toward planet 1)
await p.mouse.move(250, 500); await p.mouse.down();
for (let i = 1; i <= 10; i++) { await p.mouse.move(250 + i * 6, 500 + i * 8); await p.waitForTimeout(16); }
await p.screenshot({ path: S + 'p-aim.png' });
await p.mouse.up();
await p.waitForTimeout(450);
await p.screenshot({ path: S + 'p-fly.png' });
await p.waitForTimeout(1500);
await p.screenshot({ path: S + 'p-after.png' });
console.log(await p.evaluate(() => ({ ...window.__orbit.game.lastResult, mode: window.__orbit.game.mode, leg: window.__orbit.game.leg })), errs);
await b.close();

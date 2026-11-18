// Simulated play of Splat Gallery's Sharpshooter (specs/splat-gallery-sharpshooter.md): the round's
// rise statistics with nobody shooting, and how often scripted beginner, average and expert shooters
// (reaction 1.5 / 1.1 / 0.8 s, landing spread 22 / 14 / 8 units) reach a range of quotas, with and
// without the frenzy, in portrait and landscape. Used to tune its quota. Run: node scripts/splat-gallery/sim-sharpshooter.mjs
import { chromium } from 'playwright';
import { serve } from '../../tests/serve.mjs';
const server = await serve();
const browser = await chromium.launch();
for (const vp of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
  const page = await browser.newPage({ viewport: vp });
  await page.goto(server.base + 'splat-gallery/');
  await page.waitForFunction(() => window.__gallery);
  const r = await page.evaluate(() => {
    const g = window.__gallery;
    g.manual = true;
    const dt = 1 / 60;
    // Sequence stats over many rounds, nobody shooting, no frenzy.
    const stats = { singles: 0, flashes: 0, flashNear: 0, lateRises: 0, pairs: 0, maxUp: 0, earlyMaxUp: 0, crossing: 0, firstAt: [], flashRow: 0, earlyFlash: 0 };
    for (let run = 0; run < 60; run++) {
      g.startRun({ seed: 100 + run });
      g.startRound(7);
      g.game.frenzyTimes = [];
      let seen = new Set(), playT = null, rises = 0, lastFlash = false;
      while (g.game.mode === 'intro' || g.game.mode === 'play') {
        g.step(dt);
        if (g.game.mode === 'play' && playT === null) playT = g.game.T;
        const live = g.targets().filter((t) => t.state === 'live');
        if (live.some((t) => t.kind !== 'pop')) stats.crossing++;
        stats.maxUp = Math.max(stats.maxUp, live.length);
        if (g.game.elapsed < 15) stats.earlyMaxUp = Math.max(stats.earlyMaxUp, live.length);
        const fresh = live.filter((t) => !seen.has(t.id));
        if (fresh.length) {
          fresh.forEach((t) => seen.add(t.id));
          rises++;
          if (rises === 1) stats.firstAt.push(+(g.game.T - playT).toFixed(2));
          if (fresh.length === 2) stats.pairs++;
          if (g.game.elapsed >= 15) stats.lateRises++;
          if (fresh.length === 1) {
            stats.singles++;
            const fl = fresh[0].upFor < 1;
            if (fl) { stats.flashes++; if (fresh[0].lane === g.L.n - 1) stats.flashNear++; if (lastFlash) stats.flashRow++; if (rises <= 3) stats.earlyFlash++; }
            lastFlash = fl;
          } else lastFlash = false;
        }
      }
    }
    stats.firstAt = [Math.min(...stats.firstAt), Math.max(...stats.firstAt)];
    stats.flashRate = stats.flashes / stats.singles;
    stats.pairRate = stats.pairs / stats.lateRises;
    stats.risesPerRound = (stats.singles + stats.pairs) / 60;

    // Scripted shooters: react after `react` s from a target fully rising, land with gaussian spread
    // (units), keep shooting at a live target. In the frenzy, they fire as fast as allowed at a live one.
    const gauss = () => { let u = 0, v = 0; while (!u) u = Math.random(); v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
    const skills = { beginner: { react: 1.5, spread: 22, again: 1.0 }, average: { react: 1.1, spread: 14, again: 0.7 }, expert: { react: 0.8, spread: 8, again: 0.45 } };
    const out = {};
    for (const [name, s] of Object.entries(skills)) {
      for (const frz of [true, false]) {
        let cleared = 0, pipsSum = 0; const all = [];
        const N = 40;
        for (let run = 0; run < N; run++) {
          g.startRun({ seed: 1000 + run });
          g.startRound(7);
          if (!frz) g.game.frenzyTimes = [];
          g.game.assist = 0;
          const seenAt = {};
          let nextShot = 0;
          while (g.game.mode === 'intro' || g.game.mode === 'play') {
            g.step(dt);
            if (g.game.mode !== 'play') continue;
            const T = g.game.T;
            const live = g.targets().filter((t) => t.state === 'live' && t.y < g.L.lanes[t.lane].strip);
            for (const t of live) if (!(t.id in seenAt)) seenAt[t.id] = T;
            const fr = g.game.frenzy > 0;
            const ready = live.filter((t) => T - seenAt[t.id] >= (fr ? s.react * 0.5 : s.react));
            if (!ready.length || T < nextShot) continue;
            const t = ready[0];
            g.aimAt(t.x + gauss() * s.spread, t.y + gauss() * s.spread * 0.6);
            if (g.fire()) nextShot = T + (fr ? 0.25 : s.again);
          }
          pipsSum += g.game.pips; all.push(g.game.pips);
          if (g.game.mode === 'won' || g.game.pips >= g.game.cfg.quota) cleared++;
        }
        out[`${name}${frz ? '' : ' (no frenzy)'}`] = { cleared: `${cleared}/${N}`, meanPips: +(pipsSum / N).toFixed(1), clears: Object.fromEntries([18, 20, 22, 24, 26].map((q) => [q, all.filter((p) => p >= q).length])) };
      }
    }
    return { stats, out, quota: g.ROUNDS[7].quota };
  });
  console.log(vp.width > vp.height ? 'LANDSCAPE' : 'PORTRAIT', JSON.stringify(r, null, 1));
  await page.close();
}
await browser.close();
server.close();

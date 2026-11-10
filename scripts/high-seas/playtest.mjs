// A timed playtest of High Seas (specs/high-seas.md AC-22): an autopilot plays whole voyages in
// the real game at 390×844 and prints when it made its first delivery, bought each upgrade and
// finished. It is paced like a person: it spends a few seconds at each quay reading the cards,
// adjusts its steering a few times a second rather than every frame, follows the shortest water
// route, tacks when the route is upwind (changing tack when it meets a shore), bears away from
// heavy heel, takes the best-paying contracts, and heads back to buy each upgrade once it can
// afford it.
// Run: node scripts/high-seas/playtest.mjs [SEED ...]   (needs Playwright's Chromium)
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const seeds = process.argv.slice(2).length ? process.argv.slice(2) : ['KAPOS', 'BELUG', 'MIRAX', 'TOVAR', 'SUNIP'];
const root = new URL('../..', import.meta.url).pathname;
const PORT = 9500 + Math.floor(Math.random() * 100);
const server = spawn('python3', ['-m', 'http.server', '--bind', '127.0.0.1', String(PORT)], { cwd: root, stdio: 'ignore' });
for (let i = 0; i < 50; i++) {
  try {
    if ((await fetch(`http://127.0.0.1:${PORT}/`)).ok) break;
  } catch {}
  await new Promise((r) => setTimeout(r, 100));
}

// Runs in the page: plays one voyage on the game's own clock (30 steps a second), at most `max`
// seconds, and returns its timeline as [seconds, what].
async function autopilot(max) {
  const s = window.__seas;
  const S = s.S;
  s.manual = true;
  document.querySelector('[data-start]').click();
  const N = 44;
  const log = [];
  const mark = (what) => log.push([Math.round(S.clock), what]);
  const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  function path(nav, ax, ay, bx, by) {
    const idx = (i, j) => j * N + i;
    const s0 = idx(Math.floor(ax), Math.floor(ay));
    const t = idx(Math.floor(bx), Math.floor(by));
    const prev = new Int32Array(N * N).fill(-1);
    const q = [s0];
    prev[s0] = s0;
    for (let h = 0; h < q.length; h++) {
      const u = q[h];
      if (u === t) break;
      const ui = u % N;
      const uj = (u - ui) / N;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const a = ui + di;
        const b = uj + dj;
        if (a < 0 || b < 0 || a >= N || b >= N) continue;
        const v = idx(a, b);
        if (prev[v] >= 0 || !nav[v]) continue;
        if (di && dj && (!nav[idx(ui + di, uj)] || !nav[idx(ui, uj + dj)])) continue;
        prev[v] = u;
        q.push(v);
      }
    }
    if (prev[t] < 0) return null;
    const out = [];
    for (let u = t; u !== s0; u = prev[u]) out.push([(u % N) + 0.5, Math.floor(u / N) + 0.5]);
    return out.reverse();
  }
  let tackSide = 1;
  let tackT = 0;
  let delivered = 0;
  let wp = null;
  let clear = null;
  let wide = null;
  let awayT = 0;
  let quayT = null; // seconds left watching the quay
  let steerT = 0; // seconds until the next steering adjustment
  for (let k = 0; k < max * 30; k++) {
    if (S.mode === 'over') {
      mark('voyage done');
      break;
    }
    // At a quay: watch people get off and on for a few seconds, buy if the card is up, then go.
    if (S.mode !== 'docked') quayT = null;
    else if (S.dock === null && quayT === null) quayT = 3;
    if (S.mode === 'docked' && S.dock === null && !S.hops.length && (quayT -= 1 / 30) <= 0) {
      if (S.portAt === 0) for (let w = s.nextBuy(); w && s.buy(w); w = s.nextBuy()) mark('bought the ' + w);
      // Wait for whoever will board here (the keeper boards only an empty boat), a few seconds at most.
      const keeperAboard = S.hold.some((c) => c.kind === 'charter');
      const boarding = !keeperAboard && S.hold.length < s.rig().cargo && S.waiting.some((w) => w.at === S.portAt);
      if (!boarding || quayT < -6) {
        s.castOff();
        wp = null;
      }
    }
    if (S.mode === 'sail') {
      const b = S.boat;
      const r = s.rig();
      let dest = null;
      let best = Infinity;
      for (const c of S.hold) {
        const p = c.to === 'lighthouse' ? S.world.lighthouse : S.world.ports[c.to];
        const d = Math.hypot(p.rx - b.x, p.ry - b.y);
        if (d < best) [best, dest] = [d, p];
      }
      // With the lighthouse keeper aboard, straight to the lighthouse: the voyage's end.
      if (S.hold.some((c) => c.kind === 'charter')) dest = S.world.lighthouse;
      if (S.crates.length && S.hold.length < r.cargo) dest = { rx: S.crates[0].x, ry: S.crates[0].y };
      // Nobody aboard: the shipyard if the next thing is affordable, else the nearest port where
      // someone waits, else the shipyard. With room aboard, a waiting passenger close by is worth it.
      if (!dest) {
        const next = s.nextBuy();
        if (next && S.coins >= s.TUNE.prices[next]) dest = S.world.ports[0];
        else {
          // With the galleon, the keeper at the shipyard: the way to the end.
          if (S.owned.galleon && S.waiting.some((w) => w.c.kind === 'charter')) dest = S.world.ports[0];
          for (const w of dest ? [] : S.waiting) {
            const p = S.world.ports[w.at];
            const d = Math.hypot(p.rx - b.x, p.ry - b.y);
            if (d < best) [best, dest] = [d, p];
          }
          if (!dest) dest = S.world.ports[0];
        }
      }
      if (dest && (k % 6 === 0 || !wp)) {
        // The dinghy keeps a tile clear of rocks, as a person seeing the surf ring would.
        if (!clear) {
          clear = S.world.light.slice();
          for (const q of S.world.rocks) for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) clear[(q.j + dj) * N + q.i + di] = 0;
        }
        // The galleon gives rocks a wider berth still.
        if (!wide) {
          wide = S.world.deep.slice();
          for (const q of S.world.rocks) for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) wide[(q.j + dj) * N + q.i + di] = 0;
        }
        let p = path(S.owned.galleon ? wide : clear, b.x, b.y, dest.rx, dest.ry);
        if (!p && S.owned.galleon) p = path(S.world.deep, b.x, b.y, dest.rx, dest.ry);
        if (!p) p = path(S.world.light, b.x, b.y, dest.rx, dest.ry);
        wp = p ? p[Math.min(p.length - 1, S.owned.galleon ? 4 : 3)] : [dest.rx, dest.ry];
      }
      if (dest) {
        const want = Math.atan2(wp[1] - b.y, wp[0] - b.x);
        const from = S.wind.dir + Math.PI;
        const rel = wrap(want - from);
        tackT -= 1 / 30;
        let tgt = want;
        if (Math.abs(rel) < r.wedge) {
          if (tackT <= 0) {
            tackSide = rel >= 0 ? 1 : -1;
            tackT = S.owned.galleon ? 4 : 6;
          }
          tgt = from + tackSide * (r.wedge + 0.02);
        }
        if (b.heel > 0.9) tgt = S.wind.dir; // bear away from a knockdown
        // Pressed against a shore: change tack and bear away for a moment, as a person would.
        if ((b.grounded || 0) > 1 && awayT <= 0) {
          awayT = 1.5;
          tackSide = -tackSide;
          tackT = 6;
        }
        if (awayT > 0) {
          awayT -= 1 / 30;
          tgt = S.wind.dir;
          wp = null;
        }
        steerT -= 1 / 30;
        if (steerT <= 0) {
          b.target = wrap(tgt);
          steerT = 0.25;
        }
      }
    }
    s.step(1 / 30);
    if (S.deliveries && !delivered) mark('first delivery');
    delivered = S.deliveries;
  }
  return log;
}

const browser = await chromium.launch();
try {
  const fmt = (t) => `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
  for (const seed of seeds) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.goto(`http://127.0.0.1:${PORT}/high-seas/#${seed}`);
    await page.waitForFunction(() => window.__seas);
    const log = await page.evaluate(autopilot, 1500);
    console.log(`${seed}: ${log.map(([t, w]) => `${w} ${fmt(t)}`).join(', ')}`);
    await page.close();
  }
} finally {
  await browser.close();
  server.kill();
}

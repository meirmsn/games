// A timed playtest of High Seas (specs/high-seas.md AC-22): an autopilot plays whole voyages in
// the real game at 390×844 and prints when it made its first delivery, bought each upgrade and
// finished. It sails like a quick, tidy player: it follows the shortest water route, tacks when
// the route is upwind, bears away from heavy heel, takes the best-paying contracts and buys each
// upgrade as soon as it can. A person reading the cards and steering by hand takes longer.
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
  let awayT = 0;
  for (let k = 0; k < max * 30; k++) {
    if (S.mode === 'over') {
      mark('voyage done');
      break;
    }
    if (S.mode === 'docked' && S.dock === null) {
      if (S.portAt === 0) {
        for (const w of ['keel', 'spinnaker', 'galleon']) if (!S.owned[w] && s.buy(w)) mark('bought the ' + w);
        if (S.owned.galleon) s.takeCharter();
      }
      const offers = (S.offers[S.portAt] || []).slice().sort((a, b) => b.pay / b.len - a.pay / a.len);
      for (const c of offers) if (S.hold.length < s.rig().cargo) s.takeOffer(c);
      if (!S.hold.length) {
        // Nothing to carry from here: head back to the shipyard (a contract that pays nothing).
        const c = s.makeContract(S.portAt, 0, 'goods');
        c.pay = c.goods = 0;
        S.hold.push(c);
      }
      s.castOff();
      wp = null;
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
      if (S.crates.length && S.hold.length < r.cargo) dest = { rx: S.crates[0].x, ry: S.crates[0].y };
      if (dest && (k % 6 === 0 || !wp)) {
        const p = path(S.owned.galleon ? S.world.deep : S.world.light, b.x, b.y, dest.rx, dest.ry);
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
            tackT = 6;
          }
          tgt = from + tackSide * (r.wedge + 0.02);
        }
        if (b.heel > 0.9) tgt = S.wind.dir; // bear away from a knockdown
        // Pressed against a shore for 2 s: bear away for 2 s, as a person would.
        if ((b.grounded || 0) > 2) awayT = 2;
        if (awayT > 0) {
          awayT -= 1 / 30;
          tgt = S.wind.dir;
          wp = null;
        }
        b.target = wrap(tgt);
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

// Tests for tests/serve.mjs, the server every browser test file uses (specs/ci-flakes.md).
// Run: scripts/check-slow.sh.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { serve } from './serve.mjs';

const DIR = new URL('./', import.meta.url);
const files = readdirSync(DIR).filter((f) => f.endsWith('.mjs') && f !== 'serve.mjs' && f !== 'serve.test.mjs');
const source = (f) => readFileSync(new URL(f, DIR), 'utf8');

// What makes a test file pick its own port (F-38, specs/slow-tests-harness.md): it reads what a port
// becomes, not what it's called. Returns one line per problem.
export function portProblems(src) {
  const problems = [];
  for (const m of src.matchAll(/\.listen\(\s*([^\n]{0,40})/g))
    if (!/^(0\s*[,)]|\{\s*port:\s*0\s*[,}])/.test(m[1])) problems.push(`listen( on anything but 0: .listen(${m[1]}`);
  for (const m of src.matchAll(/\bport:\s*[1-9]\d*/g)) problems.push(`a fixed port: ${m[0]}`);
  for (const m of src.matchAll(/(127\.0\.0\.1|localhost|0\.0\.0\.0|\[::1\]):\d+/g)) problems.push(`a fixed port in a URL: ${m[0]}`);
  if (/http\.server/.test(src)) problems.push('starts its own http.server');
  return problems;
}

test('ci-flakes AC-1: servers started together get distinct ports from the OS and each serves the site', async () => {
  const servers = await Promise.all(Array.from({ length: 8 }, () => serve()));
  try {
    const ports = servers.map((s) => s.port);
    assert.equal(new Set(ports).size, ports.length, `distinct ports: ${ports}`);
    for (const s of servers) {
      assert.ok(s.port > 0 && s.base === `http://127.0.0.1:${s.port}/`, s.base);
      const res = await fetch(s.base);
      assert.equal(res.status, 200, s.base);
      assert.match(await res.text(), /<html/i);
      // Still python's http.server: a folder without its slash redirects, as before.
      const dir = await fetch(s.base + 'crumble', { redirect: 'manual' });
      assert.equal(dir.status, 301);
      assert.match(res.headers.get('server') ?? '', /SimpleHTTP/);
    }
  } finally {
    for (const s of servers) s.close();
  }
});

test('ci-flakes AC-1, slow-tests-harness AC-5: no test file picks a port; every file that serves the repo uses tests/serve.mjs', () => {
  const serving = [];
  for (const f of files) {
    const s = source(f);
    assert.deepEqual(portProblems(s), [], `${f} picks a port`);
    if (/from '\.\/serve\.mjs'/.test(s)) serving.push(f);
  }
  // The ten files that served the repo on a random port before this change.
  for (const f of ['orbit', 'pixel-leap', 'runes', 'splat-gallery', 'walk-on-red', 'crumble', 'reef', 'site', 'safe-zone', 'googly-faces'])
    assert.ok(serving.includes(`${f}.test.mjs`), `${f}.test.mjs uses serve.mjs`);
  // Any other browser test either uses serve.mjs or, like pwa-updates, listens on port 0 itself.
  for (const f of files.filter((f) => /browser = await launch\(\)/.test(source(f))))
    assert.ok(serving.includes(f) || /\.listen\(0\b/.test(source(f)), `${f} serves without a fixed port`);
});

test("ci-flakes AC-1: serve() rejects, and doesn't hang, when python can't serve", async () => {
  await assert.rejects(serve({ root: '/nonexistent-dir-for-serve-test' }), /tests\/serve\.mjs/);
});

test('slow-tests-harness AC-5: the port check catches a port picked under any name, and passes port 0', () => {
  const bad = {
    'listen on a fixed port': 'server.listen(8080);',
    'listen on a variable': 'server.listen(PORT, host);',
    'listen with no port': 'server.listen();',
    'listen on a fixed port in options': 'server.listen({ port: 9300 });',
    'a fixed port: option': 'const opts = { port: 9100 };',
    'a fixed port in a URL': "const base = 'http://127.0.0.1:9300/';",
    'localhost': "fetch('http://localhost:8000/x');",
    '0.0.0.0': "'http://0.0.0.0:80/'",
    'IPv6 loopback': "'http://[::1]:3000/'",
    'its own http.server': "spawn('python3', ['-m', 'http.server', '0']);",
  };
  for (const [what, src] of Object.entries(bad)) assert.notDeepEqual(portProblems(src), [], what);
  for (const src of [
    "await new Promise((r) => server.listen(0, '127.0.0.1', r));",
    'server.listen({ port: 0 });',
    'const base = `http://127.0.0.1:${server.address().port}/`;',
  ])
    assert.deepEqual(portProblems(src), [], src);
});

test("slow-tests-harness AC-6: a server that exits before close() is reported once, naming the exit and the port; close() reports nothing", async () => {
  const crashes = [];
  const s = await serve({ onCrash: (why) => crashes.push(why) });
  process.kill(s.pid, 'SIGKILL');
  for (let i = 0; i < 100 && !crashes.length; i++) await new Promise((r) => setTimeout(r, 20));
  assert.equal(crashes.length, 1, `reported once (${crashes})`);
  assert.equal(crashes[0], `tests/serve.mjs: python3 exited (SIGKILL) while serving port ${s.port}`);
  s.close();
  const closed = [];
  const t = await serve({ onCrash: (why) => closed.push(why) });
  t.close();
  // A negative bound, in Node: a report would come with the exit, within milliseconds.
  await new Promise((r) => setTimeout(r, 500));
  assert.deepEqual(closed, [], 'no report after close()');
});

// Tests for tests/serve.mjs, the server every browser test file uses (specs/ci-flakes.md).
// Run: scripts/check-slow.sh.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { serve } from './serve.mjs';

const DIR = new URL('./', import.meta.url);
const files = readdirSync(DIR).filter((f) => f.endsWith('.mjs') && f !== 'serve.mjs' && f !== 'serve.test.mjs');
const source = (f) => readFileSync(new URL(f, DIR), 'utf8');

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

test('ci-flakes AC-1: no test file picks a port; every file that serves the repo uses tests/serve.mjs', () => {
  const serving = [];
  for (const f of files) {
    const s = source(f);
    assert.doesNotMatch(s, /Math\.random\(\)[^\n]*PORT|PORT\s*=\s*\d+/, `${f} picks a port`);
    assert.doesNotMatch(s, /http\.server/, `${f} starts its own http.server`);
    if (/from '\.\/serve\.mjs'/.test(s)) serving.push(f);
  }
  // The ten files that served the repo on a random port before this change.
  for (const f of ['orbit', 'pixel-leap', 'runes', 'splat-gallery', 'walk-on-red', 'crumble', 'reef', 'site', 'safe-zone', 'googly-faces'])
    assert.ok(serving.includes(`${f}.test.mjs`), `${f}.test.mjs uses serve.mjs`);
  // Any other browser test either uses serve.mjs or, like pwa-updates, listens on port 0 itself.
  for (const f of files.filter((f) => /chromium\.launch/.test(source(f))))
    assert.ok(serving.includes(f) || /\.listen\(0\b/.test(source(f)), `${f} serves without a fixed port`);
});

test("ci-flakes AC-1: serve() rejects, and doesn't hang, when python can't serve", async () => {
  await assert.rejects(serve({ root: '/nonexistent-dir-for-serve-test' }), /tests\/serve\.mjs/);
});

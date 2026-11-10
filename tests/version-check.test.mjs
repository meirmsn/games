// scripts/version-check.py in a throwaway git repo: a change to a served file needs a VERSION bump.
// Run: node --test tests/version-check.test.mjs (the fast tier runs it; no browser).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SCRIPT = new URL('../scripts/version-check.py', import.meta.url).pathname;

function repo() {
  const dir = mkdtempSync(join(tmpdir(), 'version-check-'));
  const git = (...a) => execFileSync('git', a, { cwd: dir, stdio: 'pipe' });
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 'test@example.com');
  git('config', 'user.name', 'test');
  mkdirSync(join(dir, 'scripts'));
  mkdirSync(join(dir, 'tests'));
  mkdirSync(join(dir, 'reef'));
  copyFileSync(SCRIPT, join(dir, 'scripts/version-check.py'));
  writeFileSync(join(dir, '.assetsignore'), '# not served\ntests\nscripts\nspecs\nREADME.md\n');
  writeFileSync(join(dir, 'sw.js'), "const VERSION = 'v6';\n");
  writeFileSync(join(dir, 'reef/game.js'), '1\n');
  writeFileSync(join(dir, 'tests/a.test.mjs'), '1\n');
  writeFileSync(join(dir, 'README.md'), '1\n');
  git('add', '-A');
  git('commit', '-qm', 'base');
  const base = git('rev-parse', 'HEAD').toString().trim();
  const change = (files) => {
    for (const [f, text] of Object.entries(files)) writeFileSync(join(dir, f), text);
    git('add', '-A');
    git('commit', '-qm', 'change');
  };
  const check = () =>
    spawnSync('python3', ['scripts/version-check.py', base], { cwd: dir, encoding: 'utf8' });
  return { change, check };
}

test('pwa-updates AC-11: a change to a served file without a VERSION bump fails the check', () => {
  const r = repo();
  r.change({ 'reef/game.js': '2\n' });
  const out = r.check();
  assert.equal(out.status, 1, out.stdout);
  assert.match(out.stdout, /reef\/game\.js/);
  assert.match(out.stdout, /bump it/);
});

test('pwa-updates AC-11: the same change with VERSION bumped passes', () => {
  const r = repo();
  r.change({ 'reef/game.js': '2\n', 'sw.js': "const VERSION = 'v7';\n" });
  const out = r.check();
  assert.equal(out.status, 0, out.stdout);
});

test('pwa-updates AC-11: a change only to tests, scripts or docs needs no bump', () => {
  const r = repo();
  r.change({ 'tests/a.test.mjs': '2\n', 'README.md': '2\n', 'reef/README.md': '1\n' });
  const out = r.check();
  assert.equal(out.status, 0, out.stdout);
  assert.match(out.stdout, /no file the site serves changed/);
});

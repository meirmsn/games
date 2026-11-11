// The `// clock-checked` check (specs/slow-tests-harness.md), in the fast tier, no browser. A test
// file whose causes of flakiness were checked test by test is marked `// clock-checked` in its first
// 10 lines; from then on, every `waitForTimeout(` in it needs a reason on its line or the line
// above, `// safe: <reason>`, so a new fixed wait can't slip back in unexplained. An unmarked file
// that calls `waitForTimeout(` (outside a comment) fails too (specs/slow-tests-pixel-leap.md); one
// that calls none needs no mark. Run: node --test tests/clock-check.test.mjs (scripts/check-fast.sh
// runs it).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

const MARK = /^\s*\/\/\s*clock-checked\b/;
const SAFE = /\/\/\s*safe:\s*\S+/;

export const isMarked = (src) => src.split('\n').slice(0, 10).some((l) => MARK.test(l));

// One line per unexplained `waitForTimeout(` in a marked file ([] for an unmarked one).
export function clockProblems(src, name = 'file') {
  if (!isMarked(src)) return [];
  const lines = src.split('\n');
  const problems = [];
  lines.forEach((line, i) => {
    if (!/waitForTimeout\(/.test(line) || /^\s*\/\//.test(line)) return;
    if (SAFE.test(line) || SAFE.test(lines[i - 1] ?? '')) return;
    problems.push(`${name}:${i + 1}: waitForTimeout with no "// safe: <reason>": ${line.trim()}`);
  });
  return problems;
}

// One line for an unmarked file that calls `waitForTimeout(` outside a comment ([] otherwise).
export function unmarkedWaits(src, name = 'file') {
  if (isMarked(src)) return [];
  const calls = src.split('\n').filter((l) => /waitForTimeout\(/.test(l) && !/^\s*\/\//.test(l)).length;
  if (!calls) return [];
  return [`${name}: ${calls} waitForTimeout call(s) in a file not marked "// clock-checked": check its waits, add the mark in its first 10 lines, and give each wait it keeps a "// safe: <reason>"`];
}

test('slow-tests-pixel-leap AC-10: an unmarked file that calls waitForTimeout fails; a comment or no wait passes', () => {
  assert.equal(unmarkedWaits('// Tests.\nawait page.waitForTimeout(300);\n').length, 1, 'an unmarked file that waits');
  assert.match(unmarkedWaits('await page.waitForTimeout(300);\n', 'tests/x.test.mjs')[0], /^tests\/x\.test\.mjs: 1 waitForTimeout .*clock-checked.*safe: <reason>/);
  assert.deepEqual(unmarkedWaits('// Tests.\n// once used page.waitForTimeout(300) here\n'), [], 'a mention in a comment');
  assert.deepEqual(unmarkedWaits('// Tests.\nawait page.click("x");\n'), [], 'no wait');
  assert.deepEqual(unmarkedWaits('// clock-checked\nawait page.waitForTimeout(300); // safe: a bound\n'), [], 'a marked file is clockProblems\' to check');
});

test('slow-tests-harness AC-11: in a marked file every waitForTimeout needs a "// safe: <reason>"; unmarked files pass', () => {
  const marked = '// Tests for a game.\n// clock-checked\nimport x from "y";\n';
  assert.deepEqual(clockProblems(marked + 'await page.waitForTimeout(300);\n'), ['file:4: waitForTimeout with no "// safe: <reason>": await page.waitForTimeout(300);']);
  assert.deepEqual(clockProblems(marked + 'await page.waitForTimeout(300); // safe:\n').length, 1, 'a reason of at least one word');
  assert.deepEqual(clockProblems(marked + 'await page.waitForTimeout(300); // safe: a negative bound\n'), []);
  assert.deepEqual(clockProblems(marked + '// safe: nothing may happen in this time\nawait page.waitForTimeout(300);\n'), []);
  assert.deepEqual(clockProblems(marked + '// safe: only covers the next line\nawait a.waitForTimeout(1);\nawait b.waitForTimeout(2);\n').length, 1);
  // The mark counts only in the first 10 lines.
  assert.equal(isMarked('\n'.repeat(10) + '// clock-checked\n'), false);
  assert.deepEqual(clockProblems('// Tests.\nawait page.waitForTimeout(300);\n'), [], 'an unmarked file passes');
});

test('slow-tests-harness AC-11: every test file passes the clock-checked check, and an unmarked one that waits fails it (slow-tests-pixel-leap AC-10)', () => {
  const dir = new URL('./', import.meta.url);
  const files = readdirSync(dir).filter((f) => f.endsWith('.test.mjs'));
  const problems = [];
  for (const f of files) {
    const src = readFileSync(new URL(f, dir), 'utf8');
    problems.push(...clockProblems(src, `tests/${f}`));
    // This file is left out by name: its waits are only in the strings it checks, and its mark is
    // in the middle of its first line, not at a line's start.
    if (f !== 'clock-check.test.mjs') problems.push(...unmarkedWaits(src, `tests/${f}`));
  }
  assert.deepEqual(problems, []);
});

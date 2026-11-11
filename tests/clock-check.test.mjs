// The `// clock-checked` check (specs/slow-tests-harness.md), in the fast tier, no browser. A test
// file whose causes of flakiness were checked test by test is marked `// clock-checked` in its first
// 10 lines; from then on, every `waitForTimeout(` in it needs a reason on its line or the line
// above, `// safe: <reason>`, so a new fixed wait can't slip back in unexplained. Unmarked files are
// listed, not failed. Run: node --test tests/clock-check.test.mjs (scripts/check-fast.sh runs it).
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

test('slow-tests-harness AC-11: every test file passes the clock-checked check (unmarked ones listed)', () => {
  const dir = new URL('./', import.meta.url);
  const files = readdirSync(dir).filter((f) => f.endsWith('.test.mjs'));
  const problems = [];
  const unmarked = [];
  for (const f of files) {
    const src = readFileSync(new URL(f, dir), 'utf8');
    problems.push(...clockProblems(src, `tests/${f}`));
    if (!isMarked(src) && /waitForTimeout\(/.test(src) && f !== 'clock-check.test.mjs') unmarked.push(f);
  }
  if (unmarked.length) console.log(`clock-checked: not yet marked (their waits unchecked): ${unmarked.join(', ')}`);
  assert.deepEqual(problems, []);
});

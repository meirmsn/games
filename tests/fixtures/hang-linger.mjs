// Its test passes, but the process never exits (a server or timer left open): scripts/check-slow.sh
// must stop it (specs/slow-tests-harness.md).
import { test } from 'node:test';
test('passes, leaving a timer', () => {
  setInterval(() => {}, 1000);
});

// A test that never finishes: scripts/check-slow.sh must stop it (specs/slow-tests-harness.md).
import { test } from 'node:test';
test('never finishes', () => new Promise(() => setInterval(() => {}, 1000)));

// A hook that never finishes: scripts/check-slow.sh must stop its file (specs/slow-tests-harness.md).
import { test, before } from 'node:test';
before(() => new Promise(() => setInterval(() => {}, 1000)));
test('never runs', () => {});

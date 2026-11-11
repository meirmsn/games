// Preloaded through NODE_OPTIONS by the harness test: makes the `node -e` that scripts/check-slow.sh
// runs before its test runner start SLOW_START_MS late, as a busy machine starts it late. Every other
// node process starts as usual.
if (process.execArgv.includes('-e') || process.execArgv.includes('--eval')) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, Number(process.env.SLOW_START_MS) || 0);
}

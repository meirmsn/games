// Serves the repo for the browser tests (specs/ci-flakes.md). The test files run in parallel, so a
// port picked at random can collide: one server then fails to bind and its file talks to another
// file's server. Instead python's http.server binds port 0, the OS picks a free port, and we read it
// from the line the server prints. Keeping python (not a Node server) keeps its responses as they
// were: content types, the /dir → /dir/ redirect, caching headers.
import { spawn } from 'node:child_process';

const ROOT = new URL('..', import.meta.url).pathname;

// Resolves to { base, port, pid, close } once the server is listening; rejects if it exits or doesn't
// report a port within `timeout` ms. If python exits later, before close(), `onCrash` is told why, so
// the file's connection errors that follow have a named cause (F-39, specs/slow-tests-harness.md).
export function serve({ root = ROOT, timeout = 10000, onCrash = (why) => console.error(why) } = {}) {
  const child = spawn('python3', ['-u', '-m', 'http.server', '--bind', '127.0.0.1', '0'], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  return new Promise((resolve, reject) => {
    let out = '';
    const fail = (why) => {
      clearTimeout(timer);
      child.kill();
      reject(new Error(`tests/serve.mjs: ${why}; it printed: ${JSON.stringify(out)}`));
    };
    const timer = setTimeout(() => fail(`no port after ${timeout} ms`), timeout);
    child.on('error', (e) => fail(`couldn't start python3 (${e.message})`));
    child.on('exit', (code) => fail(`python3 exited (${code}) before it reported a port`));
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', function onData(chunk) {
      out += chunk;
      const m = out.match(/ port (\d+)/);
      if (!m) return;
      clearTimeout(timer);
      child.removeAllListeners('exit');
      child.stdout.off('data', onData);
      child.stdout.resume(); // keep draining, so the server never blocks on a full pipe
      const port = Number(m[1]);
      let closing = false;
      child.on('exit', (code, signal) => {
        if (!closing) onCrash(`tests/serve.mjs: python3 exited (${signal ?? code}) while serving port ${port}`);
      });
      const close = () => {
        closing = true; // before the kill, so its exit isn't reported
        child.kill();
      };
      resolve({ port, pid: child.pid, base: `http://127.0.0.1:${port}/`, close });
    });
  });
}

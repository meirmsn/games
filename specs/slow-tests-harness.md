# The slow tests can't hang, and every test can be run with a slow CPU

**Go:** pending

## Intent

R-1, the first of the seven slices that make the slow tier run once, with no retries (`ROADMAP.md`).
The owner, 2026-11-10: "we shouldn't be running 3 times. We should only run it once, and we should
understand the source of the flakiness and put the test around that. Or change the code so that it
is easier, reliable to test." The split, 2026-11-11: "Do an adversarial review about the split and
pick whatever makes sense."

This slice is the harness on its own. The later slices (R-2 to R-7) fix each game's tests at their
cause; this one gives them what they need to do it and to prove it:

1. **No hang can void a run (F-34).** One of five slow runs started together hung in
   `tests/pwa-updates.test.mjs` for over 10 minutes. `node --test` had no limit, so in CI it would
   have run into the `slow` job's 30-minute limit. Its likely sources: `page.evaluate` calls that
   wait on `caches` or a service-worker promise with no timeout, and `server.close()`, which waits
   for every keep-alive socket to close.
2. **The shared server names its crash and its port check holds (F-38, F-39).**
3. **One way to wait on frames and state, and one way to run any test with a slow CPU**, in
   `tests/clock.mjs`. A busy CI runner runs fewer frames in a given time: running the suite with
   the CPU 10× slower reproduces that on demand, for every page any test opens.
4. **A fast check that keeps a fixed file fixed:** once a file is marked `// clock-checked`, a new
   `waitForTimeout` in it needs a reason.
5. **One spec per later slice**, so slices built in parallel don't collide (see Decisions).

## Decisions

- **The file limit is `--test-timeout`, set in `scripts/check-slow.sh`.** Under `node --test`
  each file runs in its own process, and Node 22 applies `--test-timeout` to the whole file: a file
  that hangs in a test or a hook, or whose tests pass but whose process stays open, is failed and
  stopped when it runs out (tried in this session on Node 22.23.4). The limit is
  `SLOW_TEST_TIMEOUT_MS`, default 600000 ms (10 minutes: the whole suite took 124 s in one run on
  this machine, so no file took longer; it leaves room for five runs at once, under the `slow`
  job's 30 minutes), multiplied by the CPU throttle rate when one is set. Rejected: a `timeout` around the
  whole suite, which names no file. (Claude, 2026-11-11)
- **`scripts/check-slow.sh` takes optional test files** (default `tests/*.test.mjs`), so its limit
  can be proved on a fixture that hangs. CI still runs it with no arguments. (Claude, 2026-11-11)
- **The CPU throttle is applied by `launch()` in `tests/clock.mjs`, not by each file's `open()`.**
  The split named a `newContext()` wrapper and a one-line `open()` change per file, but 13 contexts
  in 8 files are made with `browser.newContext()` outside `open()` (Runes, Splat Gallery, the
  landing page, Crumble, Googly Faces, Safe zone, PWA updates). `launch()` starts Chromium and
  wraps the browser's `newContext()`, so every context any test makes throttles each of its pages
  (through `newPage()`, which waits for the throttle before it returns, and `context.on('page')`
  for pages a page opens). It is still a one-line change per file: `chromium.launch()` becomes
  `launch()`. Rejected: changing `open()` only, which would leave those 13 contexts at full speed.
  (Claude, 2026-11-11)
- **The throttle is set with `TEST_CPU_THROTTLE=<rate>`** (for example 10); unset or 1 means full
  speed. Waits from `tests/clock.mjs` scale their timeouts by the same rate. (Claude, 2026-11-11)
- **`tests/clock.mjs` holds:** `launch()`, `realFrames(page, n)` (from `tests/crumble.test.mjs`),
  and `waitFor(page, fn, arg, { what, timeout })`: waits until `fn` is true in the page, checked on
  each frame, and on time-out fails naming `what`. Crumble's own `realFrames` moves to the import
  in R-4, its slice; this slice changes only its `launch` line. (Claude, 2026-11-11)
- **pwa-updates' promises are bounded:** every `page.evaluate` in `tests/pwa-updates.test.mjs`
  that waits on `caches` or `navigator.serviceWorker` goes through one helper that fails, naming
  what it waited for, after a time-out; and its server's `close()` drops open connections
  (`closeAllConnections()`) and resolves when the server has closed. Other waits in that file are
  R-5's. (Claude, 2026-11-11)
- **F-38:** the "no test file picks a port" check stops matching names. It reads what a port
  becomes: every `.listen(` in a test file takes `0` or no port, every `127.0.0.1:` or
  `localhost:` in a URL is followed by `${`, and only `tests/serve.mjs` starts `http.server`.
  (Claude, 2026-11-11)
- **F-39:** `tests/serve.mjs` keeps watching the server after it reports its port. If python exits
  before `close()`, it reports `tests/serve.mjs: python3 exited (<code or signal>) while serving
  port <n>` through an `onCrash` callback, by default `console.error`. (Claude, 2026-11-11)
- **The `// clock-checked` marker is checked in the fast tier** by `tests/clock-check.test.mjs`
  (no browser), run from `scripts/check-fast.sh`. In a file whose first 10 lines hold
  `// clock-checked`, every line that calls `waitForTimeout(` carries `// safe: <reason>` on that
  line or the line above, with a reason of at least one word. Unmarked files are listed, not
  failed: each later slice marks its own files when it has checked every test in them. No file is
  marked in this slice. (Split, 2026-11-11)
- **One spec file per later slice, not sections of `specs/ci-flakes.md`.** The split asked for a
  reserved section and AC-number range in `specs/ci-flakes.md` for each slice. `scripts/spec-check.py`,
  a devshop copy this repo can't edit, allows no sub-headings among the acceptance items, wants
  them numbered 1, 2, 3 … with no gap (a reserved range is a gap), and reads one **Go:** line per
  spec; and two slices adding items to one list in parallel would collide on the numbers and the
  Go line. So each slice has its own spec, numbered from AC-1, with its own go:
  `slow-tests-walk-on-red` (R-2), `slow-tests-splat-gallery` (R-3), `slow-tests-crumble-googly`
  (R-4, with Googly Faces' guard tests, which has no spec of its own), `slow-tests-pwa-site` (R-5,
  with the landing page's guard tests), `slow-tests-orbit-reef-runes` (R-6) and
  `slow-tests-pixel-leap` (R-7). Each records the cause per test in its Decisions. `specs/ci-flakes.md`
  stays the record of the first change. (Claude, 2026-11-11; for the owner to confirm at the go)
- **Each later slice's proof:** its guard test fails on the old code; its files pass 5 times in
  parallel and once with `TEST_CPU_THROTTLE=10`; the rest of the suite passes once. (Split,
  2026-11-11)

## Acceptance items

- **AC-1** `scripts/check-slow.sh` stops any test file that runs past its limit and fails the run:
  a file that never finishes a test, one whose hook never finishes, and one whose tests pass but
  whose process stays open, each end with exit 1 within the limit plus 10 s, and the output names
  the file. Run with no arguments, it runs `tests/*.test.mjs` as before.
- **AC-2** The limit is `SLOW_TEST_TIMEOUT_MS` (default 600000 ms) times `TEST_CPU_THROTTLE` when
  that is above 1.
- **AC-3** In `tests/pwa-updates.test.mjs`, no `evaluate` waits on `caches` or
  `navigator.serviceWorker` without a time-out: each goes through one helper, which fails naming
  what it waited for when the page's promise never settles.
- **AC-4** pwa-updates' server closes, and its `close()` resolves, within 2 s while a browser still
  holds a keep-alive connection to it.
- **AC-5** The port check fails a test file that calls `listen(<non-zero digits>)`, puts digits
  after `127.0.0.1:` or `localhost:` in a URL, or starts `http.server`; it passes every test file
  in the repo.
- **AC-6** When the server `tests/serve.mjs` started exits before `close()`, its `onCrash` is called
  once with a message naming the exit and the port; after `close()`, it isn't called.
- **AC-7** With `TEST_CPU_THROTTLE=10`, a page from a context made by `browser.newContext()` on a
  browser from `launch()`, and a page that page opens, both run a fixed piece of script at least 4
  times slower than the same page on a browser from plain `chromium.launch()`. Without the
  throttle, or with `launch()` replaced by `chromium.launch()`, that check fails.
- **AC-8** Every browser test file starts Chromium with `launch()` from `tests/clock.mjs`.
- **AC-9** `realFrames(page, n)` resolves after `n` of the page's animation frames; `waitFor` resolves
  once its condition holds and, when it never does, fails within its time-out (times the throttle
  rate) with a message naming `what`.
- **AC-10** The `// clock-checked` check fails a marked file with a `waitForTimeout(` that has no
  `// safe: <reason>` on its line or the line above, passes a marked file where each has one,
  doesn't fail unmarked files, and runs in `scripts/check-fast.sh`.
- **AC-11** With this change, `scripts/check-slow.sh` passes once, and once with
  `TEST_CPU_THROTTLE=10` apart from failures in tests that later slices own, which are listed in
  the PR. — verified by review: the PR shows both runs' summaries and lists each throttled
  failure with its slice.
- **AC-12** Outside `tests/`, the only files that change are `scripts/check-slow.sh`,
  `scripts/check-fast.sh`, `specs/slow-tests-harness.md`, `ROADMAP.md` (R-1's entry, Done; the
  slices' spec names) and `FINDINGS.md` (F-34, F-38 and F-39 removed; anything new added). No game
  code changes. — verified by review: the PR's diff.

## Out of scope

- Converting any game's waits, or marking any file `// clock-checked`: R-2 to R-7.
- Crumble's own `realFrames` moving to the shared one: R-4.
- pwa-updates' and the landing page's other waits: R-5.
- Requiring every file to be marked: the whole-suite proof in R-7 can decide that.
- Changing `specs/ci-flakes.md`, or any game's spec.

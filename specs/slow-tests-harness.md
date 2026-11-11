# The slow tests can't hang, and every test can be run with a slow CPU

**Go:** "go" (owner, 2026-11-11)

## Intent

R-1, the first of the seven slices that make the slow tier run once, with no retries (`ROADMAP.md`).
The owner, 2026-11-10: "we shouldn't be running 3 times. We should only run it once, and we should
understand the source of the flakiness and put the test around that. Or change the code so that it
is easier, reliable to test." The split, 2026-11-11: "Do an adversarial review about the split and
pick whatever makes sense."

This slice is the harness on its own. The later slices (R-2 to R-7) fix each game's tests at their
cause; this one gives them what they need to do it and to prove it:

1. **No hang can void a run (F-34).** One of five slow runs started together hung in
   `tests/pwa-updates.test.mjs` for over 10 minutes; `node --test` had no limit. This slice bounds
   every file, bounds the waits in pwa-updates that can't end on their own, and tries to reproduce
   the hang to find its cause.
2. **The shared server names its crash and its port check holds (F-38, F-39).**
3. **One way to wait on frames and state, and one way to run any test with a slow CPU**, in
   `tests/clock.mjs`. A busy CI runner runs fewer frames in a given time; running the suite with
   the CPU 10× slower reproduces that on demand, for every page any test opens.
4. **A fast check that keeps a fixed file fixed:** once a file is marked `// clock-checked`, a new
   `waitForTimeout` in it needs a reason.
5. **One spec per later slice**, so slices built in parallel don't collide (see Decisions).

## Decisions

- **The file limit is `--test-timeout`, set in `scripts/check-slow.sh`.** Under `node --test`
  each file runs in its own process, and Node 22 applies `--test-timeout` to the whole file: a file
  that hangs in a test or a hook, or whose tests pass but whose process stays open, is stopped when
  it runs out (tried in this session on Node 22.23.4, and again by the spec review with a timer
  left running). The limit is `SLOW_TEST_TIMEOUT_MS`, default 300000 (5 minutes: the whole suite
  took 124 s in one run here, so no file took longer). With a throttle it is multiplied by the
  rate, capped at 20 minutes. Node's summary counts a stopped file as "cancelled", not "fail", so
  the script prints the name of each file it stopped. Rejected: a `timeout` around the whole suite,
  which names no file. (Claude, 2026-11-11)
- **`scripts/check-slow.sh` takes optional test files** (default `tests/*.test.mjs`), so its limit
  can be proved on fixtures in `tests/fixtures/`, outside the suite's glob. CI still runs it with no
  arguments. (Claude, 2026-11-11)
- **F-34's cause is looked for, not assumed.** The waits in pwa-updates that can't end on their own
  are bounded: `until()` (~135), which awaits each in-page check with no limit, and every
  `evaluate` that waits on `caches` or `navigator.serviceWorker` (~217 `caches.keys()`, ~233
  `r.update()`, and the others) go through one helper that fails, naming what it waited for. The
  server's `close()` also drops open connections and is awaited, as hardening, not as the found
  cause. Then pwa-updates runs 5 times in parallel, and 5 times in parallel at throttle 10, on the
  old code and on the new. If the hang shows up, its cause is recorded here and F-34 is removed
  from `FINDINGS.md`; if not, F-34 stays, updated, and goes to R-5. Other waits in that file are
  R-5's. (Claude, 2026-11-11, from the spec review)
- **F-34 wasn't reproduced (2026-11-11).** pwa-updates ran 5 times in parallel on `main`'s code
  (all passed, about 31 s each), 5 times on this branch (all passed, about 32 s), 5 times on this
  branch at throttle 10 (all passed, about 91 s), and 5 times at throttle 10 on `main`'s file with
  only its `launch()` line changed (all passed, about 87 s): 20 runs, none hung. Its cause is still
  unknown; the hang was seen in a whole-suite run, not pwa-updates alone. Every wait in it that
  couldn't end on its own is now bounded, and any file that hangs is stopped and named, so if it
  comes back it names itself. F-34 stays in `FINDINGS.md`, updated, for R-5. (Claude, 2026-11-11)
- **F-34, a candidate cause (2026-11-11).** With pwa-updates' old `close()`, a connection to its
  server still mid-request when the test ends is never dropped, and the file's process stays open
  after its tests pass, until the new per-file limit stops it. Seen with a half-sent request made by
  the `slow-tests-harness AC-4` test, not with the browser; so it is a way the old file could hang,
  not proof of what hung. The new `close()` drops such connections. (Claude, 2026-11-11)
- **AC-10 names a page that runs no frames and a page whose script is paused, not "a hidden page"
  (changed after the go, 2026-11-11).** Headless Chromium keeps every page visible. All of these
  were tried with Playwright 1.63, and every page stayed visible and kept running frames: a page
  behind another tab, a background target made through CDP, a minimised window, launching without
  Playwright's backgrounding flags, and CDP's freeze. So the test covers both things a hidden or
  frozen page does to a wait:
  - a page whose `requestAnimationFrame` never calls back stands in for a hidden page;
  - a page paused in the debugger stands in for a frozen page. Its timers and `evaluate` never run,
    so only a bound kept in Node ends the wait. A `realFrames` whose time-out moved into the page
    fails this case (tried in this change).
  An adversarial review the owner asked for chose these words: "You should do an adversarial
  review to get the answer to your questions." (2026-11-11). A second one, asked for on the
  wording itself, proposed the paused-page case: "Make an adversarial review of this proposal. And
  if it sounds good, then I give you an okay." (2026-11-11). Shown the reviewed wording and the
  paused-page test, the owner said: "ok" (2026-11-11). This settles what F-42 recorded, and F-42 is
  removed.
- **The CPU throttle is applied by `launch()` in `tests/clock.mjs`, not by each file's `open()`.**
  The split named a `newContext()` wrapper and a one-line `open()` change per file, but 11 contexts
  in 7 files are made with `browser.newContext()` outside `open()` (Crumble, Googly Faces, PWA
  updates, Runes, Safe zone, the landing page, Splat Gallery). `launch()` starts Chromium and wraps
  the browser's `newContext()` and `newPage()`. Each page of such a context is throttled through
  its own CDP session, kept open for the page's life: `newPage()` waits for the throttle before it
  returns, and `context.on('page')` catches pages a page opens. It is still a one-line change per
  file: `chromium.launch()` becomes `launch()`. Service workers aren't throttled (CDP throttles a
  page's renderer); the PWA tests' timings live in pages. Rejected: changing `open()` only, which
  would leave those 11 contexts at full speed. (Claude, 2026-11-11)
- **The throttle is set with `TEST_CPU_THROTTLE=<rate>`** (for example 10). Unset, or 1 or less,
  means `launch()` is `chromium.launch()`: no CDP session and no wrapped methods. With a rate above
  1, each wrapped context's default Playwright timeout is multiplied by the rate, and so are the
  timeouts of the waits in `tests/clock.mjs`. (Claude, 2026-11-11)
- **A test opts out with `browser.newContext({ throttle: false })`,** for the tests that measure CPU
  time or set their own throttle: Crumble's frame budget (item 12 of `specs/crumble.md`, CPU time from a trace), Pixel Leap's
  frame-work average (`tests/pixel-leap.test.mjs` ~1494, until R-7) and Crumble's slow-CPU guard
  (`tests/crumble.test.mjs` ~827, which sets 10× itself and then 1×, undoing the harness's rate). The opt-out is that one option, added on those
  tests' `newContext` calls; the tests themselves don't change. (Claude, 2026-11-11, from the spec
  review)
- **`tests/clock.mjs` holds:** `launch()`, `realFrames(page, n, { timeout })` (from
  `tests/crumble.test.mjs`, now with a time-out, since a hidden page runs no frames), and
  `waitFor(page, fn, arg, { what, timeout })`: waits until `fn` is true in the page, checked on
  each frame, and on time-out fails naming `what`. Crumble's own `realFrames` moves to the import
  in R-4, its slice. (Claude, 2026-11-11)
- **F-38:** the "no test file picks a port" check stops matching names and reads what a port becomes,
  in every test file but `serve.test.mjs` itself: each `.listen(` takes a literal `0` as its first
  argument (or `{ port: 0 }`), no `port:` is followed by non-zero digits, no URL host
  (`127.0.0.1`, `localhost`, `0.0.0.0`, `[::1]`) is followed by `:` and digits, and only
  `tests/serve.mjs` starts `http.server`. (Claude, 2026-11-11)
- **F-39:** `tests/serve.mjs` keeps watching the server after it reports its port. If python exits
  before `close()`, it reports `tests/serve.mjs: python3 exited (<code or signal>) while serving
  port <n>` through an `onCrash` callback, by default `console.error`; `close()` marks the server
  closing before it stops python, so a normal close reports nothing. The tests still fail where
  they fail (on the next request); the message says why. Rejected: failing the current test from
  the helper, which can't know which test is running. (Claude, 2026-11-11)
- **The `// clock-checked` marker is checked in the fast tier** by `tests/clock-check.test.mjs`
  (no browser), run from `scripts/check-fast.sh`. In a file whose first 10 lines hold
  `// clock-checked`, every line that calls `waitForTimeout(` carries `// safe: <reason>` on that
  line or the line above, with a reason of at least one word. Unmarked files are listed, not
  failed: each later slice marks its own files once it has checked every test in them. No file is
  marked in this slice. (Split, 2026-11-11)
- **One spec file per later slice, not sections of `specs/ci-flakes.md`.** The split asked for a
  reserved section and AC-number range in `specs/ci-flakes.md` per slice. `scripts/spec-check.py`,
  a devshop copy this repo can't edit, allows no sub-headings among the acceptance items, wants
  them numbered 1, 2, 3 … with no gap (a reserved range is a gap) and reads one **Go:** line per
  spec, and two slices adding items to one list in parallel would collide on the numbers and the Go
  line. So each slice has its own spec, numbered from AC-1, with its own go:
  `slow-tests-walk-on-red` (R-2), `slow-tests-splat-gallery` (R-3), `slow-tests-crumble-googly`
  (R-4, with Googly Faces' guard tests), `slow-tests-pwa-site` (R-5, with the landing page's),
  `slow-tests-orbit-reef-runes` (R-6) and `slow-tests-pixel-leap` (R-7). Each records the cause per
  test in its Decisions, naming tests by title or `file:line`, never as "<spec> AC-<n>" (spec-check
  reads any AC number in a spec as one of its own items). Slices edit only their own rows of
  `ROADMAP.md` and `FINDINGS.md`. `specs/ci-flakes.md` stays the record of the first change.
  (Claude, 2026-11-11; in the spec the owner's go of 2026-11-11 approved)
- **Each later slice's proof:** its guard test fails on the old code; its files pass 5 times in
  parallel and once with `TEST_CPU_THROTTLE=10`; the rest of the suite passes once. (Split,
  2026-11-11)

## Acceptance items

- **AC-1** `scripts/check-slow.sh` stops any test file that runs past its limit and fails the run:
  a fixture that never finishes a test, one whose hook never finishes, and one whose tests pass but
  whose process stays open, each end with exit 1 within the limit plus 10 s, and the output names
  the stopped file. Run with no arguments, it runs `tests/*.test.mjs` as before.
- **AC-2** The limit is `SLOW_TEST_TIMEOUT_MS` (default 300000) times `TEST_CPU_THROTTLE` when that
  is above 1, and never more than 1200000.
- **AC-3** In `tests/pwa-updates.test.mjs`, no in-page wait on `caches` or `navigator.serviceWorker`,
  and no check inside `until()`, waits without a limit: each goes through one helper, which fails,
  naming what it waited for, when the page's promise never settles.
- **AC-4** pwa-updates' server closes, and its `close()` resolves, within 2 s while a browser still
  holds a keep-alive connection to it.
- **AC-5** The port check fails a test file that calls `.listen(` with anything but `0` (or
  `{ port: 0 }`) first, has `port:` followed by non-zero digits, has `127.0.0.1`, `localhost`,
  `0.0.0.0` or `[::1]` followed by `:` and digits, or starts `http.server`; it passes every test
  file in the repo.
- **AC-6** When the server `tests/serve.mjs` started exits before `close()`, its `onCrash` is called
  once with a message naming the exit and the port; after `close()`, it isn't called.
- **AC-7** With `TEST_CPU_THROTTLE=10`, a page from `browser.newContext()` on a browser from
  `launch()`, a page from that browser's `newPage()`, and a page opened from it with `noopener`
  each run a fixed piece of script at least 4 times slower than the same page on a browser from
  plain `chromium.launch()`, and still after a reload. A context made with `{ throttle: false }`
  isn't slowed.
- **AC-8** With `TEST_CPU_THROTTLE` unset or 1, `launch()` opens no CDP session and leaves
  `newContext` and `newPage` as Playwright's own.
- **AC-9** No test file calls `chromium.launch(`, `browser.newPage(`, or `launchPersistentContext`
  outside `tests/clock.mjs`: every browser test file starts Chromium with `launch()`.
- **AC-10** `realFrames(page, n)` resolves after `n` of the page's animation frames and fails within
  its time-out, a bound kept in Node, on a page that runs no frames (as a hidden page doesn't) and
  on one whose script is paused (as a frozen page's is); `waitFor` resolves once its condition
  holds and, when it never does, fails within its time-out (times the throttle rate) with a message
  naming `what`.
- **AC-11** The `// clock-checked` check fails a marked file with a `waitForTimeout(` that has no
  `// safe: <reason>` on its line or the line above, passes a marked file where each has one,
  doesn't fail unmarked files, and runs in `scripts/check-fast.sh`.
- **AC-12** With this change, `scripts/check-slow.sh` passes once; once with `TEST_CPU_THROTTLE=10`
  it stops no file at its limit and has no failure in a hook or in a harness test, and each test
  that fails is listed in the PR with the slice that owns it. — verified by review: the PR shows
  both runs' summaries and the list.
- **AC-13** pwa-updates was run 5 times in parallel, and 5 times in parallel at throttle 10, on the
  old code and on the new, and the PR records each run's result; a hang that showed up has its cause
  recorded in Decisions. — verified by review: the PR's record of the 20 runs.
- **AC-14** Outside `tests/`, the only files that change are `scripts/check-slow.sh`,
  `scripts/check-fast.sh`, `specs/slow-tests-harness.md`, `ROADMAP.md` (R-1's row and section) and
  `FINDINGS.md` (F-38 and F-39 removed, F-34 removed or updated, anything new added). No game code
  changes. — verified by review: the PR's diff.

## Out of scope

- Converting any game's waits, or marking any file `// clock-checked`: R-2 to R-7.
- Crumble's own `realFrames` moving to the shared one: R-4.
- pwa-updates' and the landing page's other waits: R-5.
- Throttling service workers.
- Requiring every file to be marked: the whole-suite proof in R-7 can decide that.
- Changing `specs/ci-flakes.md`, or any game's spec.

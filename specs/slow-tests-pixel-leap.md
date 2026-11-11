# Slow tests run once: Pixel Leap's tests, and the whole suite's proof

**Go:** pending

## Intent

R-7, slice 7 of the seven that make the slow tier run once, with no retries (`ROADMAP.md`), and the
last. The owner, 2026-11-10: "we shouldn't be running 3 times. We should only run it once, and we
should understand the source of the flakiness and put the test around that. Or change the code so
that it is easier, reliable to test." The split, 2026-11-11: "Do an adversarial review about the
split and pick whatever makes sense."

This slice checks every test in `tests/pixel-leap.test.mjs` for the causes the harness slice
(`specs/slow-tests-harness.md`) named: fixed waits, `manual` set late, state read before a frame has
run, one pixel or one instant sampled, wall-clock asserts, float boundaries in step arithmetic, and
game timers that `manual` doesn't stop. Each test that waits on the clock is changed to wait on the
thing it means. Its frame-budget test ("frames are cheap at 390×844…", ~1481)
moves to CPU time from a Chromium trace, the way Crumble's did (meirmsn/games#34, F-32), and runs
under the harness's throttle like every other test. The file is then marked `// clock-checked`.

As the last slice it also carries the whole suite's proof: five `scripts/check-slow.sh` runs at
once, and one at `TEST_CPU_THROTTLE=10`, with no failure; and it closes F-33.

No game code changes. What `specs/pixel-leap.md` promises doesn't change.

## Decisions

### On `main`, before the change

- **The file passes under the harness's loads** (2026-11-11, `main` at acd5a2d): five copies at
  once on 4 CPUs, 47 of 47 each time; alone with `TEST_CPU_THROTTLE=10`, 47 of 47 (325 s). The frame
  budget test runs with `throttle: false`, so the 10× run doesn't reach it. These runs can't tell
  the old waits from the new ones, so the guards below make the cause happen on demand. (Claude,
  2026-11-11)
- **The frame guards hold the page's frames back while it is idle.** An init script wraps the
  page's `requestAnimationFrame(cb)` so that it calls the real `requestAnimationFrame(cb)` from a
  `setTimeout` of 2 s; the callback still gets its frame's time stamp. Frames then come at least
  2 s apart, longer than any old wait here (200, 300, 600 ms), and in between the page is idle, so
  a test's reads run at once. That is a machine too busy to draw. A busy `requestAnimationFrame`
  callback, as R-4's guards used, doesn't do it: it also holds back the test's reads until the frame
  has run (F-2026-11-11-tap-guard-cant-fail). The guards don't rest on how Playwright's
  `waitForFunction` polls: a poll on held-back frames only waits longer, inside its bound. Tried on
  `main`'s code (2026-11-11), with 700 ms: 200 ms after `window.__leap` appears, the builder's
  preview had 0 pixels drawn; after `realFrames(page, 1)`, 12,464. (Claude, 2026-11-11, from the
  spec review)

### The frame budget ("frames are cheap at 390×844…", ~1481; its wait at ~1491)

- **Cause: a wall-clock measure.** The game times each frame's update and draw with
  `performance.now()` (`frameWork`, `pixel-leap/game.js` ~4052, the last 600 frames). A busy machine
  pauses the browser now and then, and a pause inside a frame counts as frame work. The test also
  waited a fixed `waitForTimeout(20000)` for its run. (F-32)
- **It now measures CPU time from a trace**, as Crumble's frame-budget test does: it traces the run
  (Chromium's `devtools.timeline`), takes the animation-frame callbacks that ran the game's
  `frameLoop`, and averages their CPU time (`tdur`). The game's `frameWork` is no longer read
  (F-2026-11-11-pixel-leap-framework-unread). (Claude, 2026-11-11)
- **The run is 20 s of game time, waited on in the page.** Instead of 20 s of wall clock, the test
  waits, frame by frame inside the page and bounded by `within`, until `game.t` has moved 20 s with
  the player running right. `game.t` is what every simulation step adds to (`update`, ~507);
  `game.time`, the level's clock, goes back to 0 on a lost life or a new world (~1060, ~1331), so it
  isn't used. The player is given lives enough not to reach game over, and the test checks the game
  is still in play at the end, so the frames measured are play frames. The game steps each frame by
  its interval, capped at 0.1 s (~4054), so at full speed that is the same 20 s; on a slow machine
  it is the same stretch of play. The promise's "a 20 s run" (`specs/pixel-leap.md` ~641) holds
  either way. (Claude, 2026-11-11, from the spec review)
- **The throttle now applies, and the budget scales with it: 8 ms × the throttle rate.** The
  `throttle: false` goes. Chromium counts its CPU throttle in the thread's CPU time: on this machine
  (2026-11-11) a 5 s run's frames averaged 0.77 ms of CPU at full speed and 9.87 ms at 10×, and the
  old measure (`frameWork`) 0.74 ms and 9.17 ms. So an unscaled 8 ms fails at 10× on the game as it
  is. Scaled by the rate (`scaled(8)` from `tests/clock.mjs`), the budget stays the promise's 8 ms
  at full speed, which is what CI runs, and holds up at 10× even where the throttle reaches 15×
  (F-41). Rejected: keeping `throttle: false` (the brief asks for it to go); an unscaled 8 ms (fails
  at 10×). Scaled, the 10× run checks the same ratio as the full-speed one (the game uses about a
  tenth of its budget at both), not a tighter one. Unlike Crumble's, which kept `throttle: false`.
  CI runs at full speed, so the promise keeps its meaning there: 8 ms in the test browser; its text
  doesn't change. What the 10× run adds is proof that the test's own waiting, tracing and in-play
  checks hold when frames come slowly. A code comment says so: at 10× the budget checks the test,
  not the game. Rejected, besides the above: dividing the CPU time by the rate (the same check, and
  it presents a nominal rate as a measurement), measuring the throttle and dividing by it (F-41: a
  short run's throttle varies 0.8× to 15×), checking the budget only at full speed (hides that the
  10× run checks no budget). The owner asked for an adversarial review to answer this ("do
  adversarial review about the questions", 2026-11-11); its verdict, 2026-11-11: "A, using
  scaled(8)." Crumble's frame budget keeping `throttle: false` is a finding, not changed here.
- **Its guard stalls each frame without using the CPU.** With `throttle: false`, an init script
  makes the first canvas `fillRect` of each frame send a synchronous `XMLHttpRequest` that a
  `context.route` answers 20 ms later: the main thread waits, as a paused browser does, but spends
  no CPU. Tried on `main`'s code (2026-11-11): over 3 s of play, `frameWork` averaged 27.03 ms
  (fails 8 ms) and the frames' CPU time from the trace 1.78 ms (passes). The guard runs the new
  measure on that page and passes, and fails with the old one; the PR records both. (Claude,
  2026-11-11, from the spec review)
- **The 60 and 120 fps check** in the same test is stepped by hand in one `evaluate`, and the same
  leftover step time carries into both runs; its 0.05-tile slack is far above float error.
  Checked, unchanged.

### The cause, test by test

Line numbers are `main`'s at acd5a2d. Tests are named by their titles' first words, after the
spec item each one carries.

- **"opens on the builder with a whole pixel monster…" (~123):** `waitForTimeout(200)` before reading the
  builder's preview, which only a frame draws (`drawPreview`, from the frame loop); `window.__leap`
  appears before the first frame. Then a 600 ms wait to see the world move behind the builder,
  which the real loop does. Now: `realFrames(page, 1)` before the preview read, and `waitFor` until
  the game's time and the camera have both moved. Its guard is below.
- **"the touch deck runs and jumps…" (~798, its keyboard half at ~829):** `waitForTimeout(200)`
  after Escape, before checking the game paused and the page didn't leave. Pausing happens in the
  `keydown` handler (`pixel-leap/game.js` ~3951), which Playwright's key press has run when it
  returns; and the shell can only leave through its Leave dialog, opened in its own `keydown`
  handler, which skips an event the game has already handled (`shared/game-shell.js` ~104). So the
  wait waited for nothing. Now: no wait; the test also checks that no dialog is open. No guard: no
  frame or timer decides it.
- **"twelve levels, twelve worlds, in order…" (~932):** reads one pixel of each level's end (~952) to
  check it shows the next world's sky. It renders by hand in the same `evaluate`, so no frame can
  change it, but a single pixel at a fixed spot is one sample: anything drawn there (a cloud, a
  star, the glimpse's edge) fails it. Now: the median colour of an 8 × 8 patch there. No guard:
  it depends on what is drawn, not on time.
- **"plays offline once played, every world included" (~1028):** raced the service worker's `ready` against a
  10 s in-page timer and went on silently if it lost; took `networkidle` to mean the worker had
  cached the game, but the worker stores what it serves after responding (`sw.js` ~148); and
  waited for the game offline with its own unscaled `timeout: 10000`. Now, as Crumble's offline
  test: `within` for `register` and `ready`; before going offline, waits (`within`, 20 s scaled)
  until the cache holds the page and every same-origin entry of the page's
  `performance.getEntriesByType('resource')` except sounds (the bed is streamed) and `blob:`, a list
  that must include `game.js`; and the offline wait uses the scaled default. No guard: holding back
  the worker's own requests isn't something the tests can do reliably, and the cause is the one
  fixed in Crumble's offline test (meirmsn/games#43). The shell's 90 ms timer before it leaves
  (`shared/game-shell.js` ~81) runs only after Leave is tapped, which no test here does.
- **"each state shows only what the state table says…" (~1525) and "the map shows the start, the
  cells reached…" (~1687):** `manual` is set in an `evaluate` after the click on
  Go, so real frames run the map in between. The map lasts at least 28 frames, so neither has
  failed, but how far it got is the machine's choice; the map test then reads it (`look(0.2)`,
  ~1693, steps only up to 0.2 s of the map). Now `manual` is set before the click (`go()`, ~3657,
  leaves it alone). Its guard: after the click, 200 frames before the first `look`, which fails
  the old test (the map has moved past 0.2 s or ended) and not the new one. The other tests that
  click Go and set `manual` later (`goPlay`, ~72, and ~717, ~1038, ~1377, ~1818, ~1896, ~3079,
  ~3399, ~3465) don't depend on how far the map got: `untilPlay` steps it through to play, or the
  test then starts its own world or stage (`startWorld`, `loadStage`). The state-table test's tap on the gallery was checked: its click lands on the canvas, not on
  the tally card that the tap opens.
- **"a world with the owner’s music plays its bed…" (~2230):** an in-page 300 ms wait before
  reading which bed plays. The bed is fetched at startup and set on the audio element when that
  fetch resolves (`pixel-leap/game.js` ~1532, ~1543); 300 ms is a guess at how long that takes. Now:
  `waitFor` until the bed is the Meadow's, then the rest. Its guard is below. (The loops of
  `shared/sound.js` retry every 250 ms until their sound is decoded, ~117; no test here reads
  whether a loop started, only the game's `heard` list, which is written at once.)
- **Every other test** (the 39 others): `manual` is set in the same `evaluate` as the set-up (via
  `play()`, `goPlay(page, true)` or directly), every step loop runs inside one `evaluate`, and every
  render read back is drawn in that `evaluate`. Touches go through `touch()`, an in-page
  `dispatchEvent`, so the game has handled them when it returns; clicks and key presses are handled
  when Playwright returns. Their waits on the page use the scaled default time-out. The HUD read
  after two frames (~2329) comes after the game's frame in each. The banner's `setTimeout`
  (`pixel-leap/game.js` ~3792) only hides the banner, which no test reads. The exact `===` checks
  (~2699, ~2740) are on stepped, deterministic state. Checked, unchanged. (From a read-only audit
  of all 47 tests, 2026-11-11, checked against the code.)

### The proof

- **The guard tests,** titled with this spec's AC numbers, run with `throttle: false` (their cause
  is made on demand): the builder's opening (the preview and the world moving, as ~123 checks) and
  the music bed's start, on pages whose frames are held 2 s apart, the bed's fetch also held by a
  `context.route` until the test lets it go, after the old 300 ms would have read; the frame
  budget on the stalled page; and the map read after 200 real frames. Each fails with its test's
  old wait or measure in place of the new one, and the PR records those runs. The test file imports
  `realFrames`, `waitFor`, `within` and `scaled` from `tests/clock.mjs`. (Claude, 2026-11-11, from
  the spec review)
- **The file passes 5 times in parallel and once with `TEST_CPU_THROTTLE=10`;** the PR records
  each. Per F-41, the 10× run is run alone on the machine.
- **The whole suite's proof, run last:** on `main` with this change and with R-2 (Walk on Red,
  meirmsn/games#46) merged, five `scripts/check-slow.sh` started together and then one with
  `TEST_CPU_THROTTLE=10` alone, each run's summary in the PR, with no `not ok`. #46 merged on
  2026-11-11 (fce0da0); this branch starts from it. The PR isn't ready to merge until the proof is
  recorded, and if `main` moves before then, the proof is run again on it. (Brief, 2026-11-11)
- **F-41 under the suite's load:** the five runs share the machine, so their throttle isn't run;
  the 10× run is alone. The PR says how long each took, as a check that the 10× run was slowed.
- **`FINDINGS.md`:** F-33 is closed (its row removed, as fixed rows have been) once no
  test file calls `waitForTimeout` without a `// safe:` reason. Anything new this slice notices and
  doesn't fix is a row of its own: the game's `frameWork` that nothing reads after this
  change, and Crumble's frame budget, which the 10× run doesn't reach.
- **The `// clock-checked` check fails an unmarked file that waits.**
  `tests/clock-check.test.mjs` now only lists an unmarked file that calls `waitForTimeout`. Once
  R-2 and this slice are in, no such file is left, so the check can fail one instead: a new fixed
  wait can then only come with the file's mark and a `// safe:` reason. Files that call no
  `waitForTimeout` stay as they are. R-2 is on `main` (`tests/walk-on-red.test.mjs` is marked), so
  this turns nothing red. The harness spec left it to this slice ("the whole-suite proof in R-7
  can decide that"). The owner asked for an adversarial review to answer this (2026-11-11); its
  verdict: "P", failing an unmarked file that calls `waitForTimeout(`, not every unmarked browser
  file (that would claim an audit no slice did). Its conditions, for the build: the new check skips
  `//` comment lines; `tests/clock-check.test.mjs` stays excluded by name, with a comment why (its
  waits are in strings and its mark isn't at a line's start); the new check is its own function and
  test, titled with this spec's AC-10, beside the harness's AC-11 test, which still holds; its cases
  cover an unmarked file that waits (fails), one that only mentions the call in a comment (passes)
  and one with no wait (passes); its message names the fix (the mark in the first 10 lines, and a
  `// safe: <reason>` on each wait); and the file's header comment says unmarked files that wait now
  fail.

## Acceptance items

- **AC-1** `tests/pixel-leap.test.mjs` has `// clock-checked` in its first 10 lines and calls no
  `waitForTimeout(`, and its music test waits for the bed with no in-page timer.
- **AC-2** A guard test, on a page whose frames come at least 2 s apart while it is idle, opens
  Pixel Leap and sees the builder's preview drawn and the world moving behind it, waiting as the
  test at ~123 now does.
- **AC-3** A guard test, on such a page with the music bed's fetch held until the test lets it go,
  sees the Meadow's bed playing, waiting as the music test at ~2230 now does.
- **AC-4** The frame-budget test runs with the harness's throttle (no `throttle: false`), measures
  the CPU time of the game's frames from a Chromium trace over 20 s of `game.t` with the game still
  in play at the end, and fails when their average is 8 ms × the throttle rate or more.
- **AC-5** A guard test, on a page where each frame waits 20 ms on a synchronous request, measures
  as AC-4 does and passes.
- **AC-6** The offline test waits for the service worker's `ready` and for the cache to hold what
  the page loaded through `within`, and passes no unscaled `timeout` of its own.
- **AC-7** In the state-table and map tests, `manual` is set before the click on Go; a guard test
  lets 200 real frames run after the click and then reads the map as the map test does, and gets
  the same start.
- **AC-8** The guards of AC-2, AC-3, AC-5 and AC-7 each fail with their test's old wait, measure
  or `manual` in place of the new one. — verified by review: the PR records each run.
- **AC-9** With this change, `tests/pixel-leap.test.mjs` passes 5 times in parallel and once with
  `TEST_CPU_THROTTLE=10`; and, on `main` with R-2 (meirmsn/games#46) merged, five
  `scripts/check-slow.sh` runs started together and one with `TEST_CPU_THROTTLE=10` alone have no
  `not ok`. — verified by review: the PR records each run's summary.
- **AC-10** `tests/clock-check.test.mjs` fails a test file that calls `waitForTimeout(` and isn't
  marked `// clock-checked`, and every test file passes it.
- **AC-11** Outside `tests/pixel-leap.test.mjs` and `tests/clock-check.test.mjs`, the only files
  that change are `specs/slow-tests-pixel-leap.md`, `ROADMAP.md` (R-7's row and section) and
  `FINDINGS.md` (F-33, and rows this slice adds). No game code changes. — verified by review: the
  PR's diff.

## Out of scope

- Changing game code (removing `frameWork`, the banner's timer), or what `specs/pixel-leap.md`
  promises.
- Other test files' tests, and `tests/clock.mjs`: their slices own them. Marking files that call no
  `waitForTimeout`.

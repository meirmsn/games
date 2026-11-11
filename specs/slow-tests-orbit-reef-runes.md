# Orbit's, Reef's and Runes' slow tests run once

**Go:** pending

## Intent

R-6 of the seven slices that make the slow tier run once, with no retries (`ROADMAP.md`). The
owner, 2026-11-10: "we shouldn't be running 3 times. We should only run it once, and we should
understand the source of the flakiness and put the test around that. Or change the code so that it
is easier, reliable to test." The split, 2026-11-11: "Do an adversarial review about the split and
pick whatever makes sense."

This slice covers `tests/orbit.test.mjs`, `tests/reef.test.mjs` and `tests/runes.test.mjs`. Every
test in them was read for the seven cause patterns R-1 names: fixed waits, the clock taken after
real frames, frame state read before a frame, one pixel or instant sampled, wall-clock asserts,
float boundaries, and real-time game timers. Each test at risk is fixed at its cause, using the
helpers in `tests/clock.mjs` (`specs/slow-tests-harness.md`). One cause is in Reef's game code
(F-8). Its fix has the go of the review the owner delegated these calls to.

## Decisions

Tests are named by title words and by their line on `main` before this change.

- **Game-code verdicts.** The owner delegated these calls to an adversarial review: "You should do
  an adversarial review to get the answer to your questions." (2026-11-11). The coordinator relayed
  that review's verdicts on 2026-11-11, and they stand as the owner's:
  - "Reef F-8: APPROVED, as a fix at the cause, not the suggested clamp of the radius."
  - "Reef F-37 (vent bubbles :1007, toast :919): NOT APPROVED. … Moving them to game time would
    change what a player sees under slow-mo (dt × 0.3, :2102). Leave F-37 open."
  - "Runes ghost (AC-15, runes/game.js:988–1003): NOT APPROVED, test-only."
  - "Runes AC-1 (two screenshots 300 ms apart): test-only, as briefed."

  The AC numbers in these quotes are Runes' own spec's, not this spec's. (Review via coordinator,
  2026-11-11)

- **Orbit: most tests take the clock after the page has already run (cause 2).** `open()` loads the
  page, and only then do the tests set `manual`. Until then the page's own frames move the game for
  however long the load took: the probe's angle, the moons' clock, the leg's idle time. On a busy
  runner that time is longer, so the state a test starts from changes from run to run. A test that
  launches without placing the probe itself starts from that drifted state. Two do, and assert how
  the flight ends: the sound test (`tests/orbit.test.mjs:708`) launches with `fire(0.5)` and no
  angle, and expects a crash or a loss, so a capture fails it; and the "R in flight" part of the
  failed-flight test (`:242`). So `open()` sets `window.__orbitManual` before the first frame by
  default, the flag `specs/ci-flakes.md` added. Every test then starts from the state the system
  starts in. Only the "alive before any touch" test (`:96`) runs the page's own frames, with
  `{ live: true }`, since it checks exactly that. No Orbit test needs the page's frames to have run
  `update()` (checked by the spec review). The `manual(page)` calls stay, and no longer change
  anything. No game code changes. (Claude, 2026-11-11)
- **Orbit's "alive before any touch" test (`:96`) waits 500 ms for the probe to move more than 5
  units (cause 1).** A busy runner runs fewer frames in 500 ms. It now waits on frames, with
  `waitFor`, until the probe is more than 5 units from where it was. (Claude, 2026-11-11)
- **Orbit's offline test (`:686`) checks that all 11 sounds were decoded as soon as the page is
  `ready` (cause 3).** `ready` waits only for the images. The sounds decode on their own, and the
  sound test (`:714`) waits for them for exactly that reason. It now waits, with `waitFor`, until 11
  sounds have decoded, then checks there are exactly 11. (Claude, 2026-11-11, from the spec review)
- **The three offline tests go offline after `waitForLoadState('networkidle')`** (orbit `:692`, reef
  `tests/reef.test.mjs:423`, runes `tests/runes.test.mjs:620`) **(cause 1).** That state is a fixed
  heuristic, 500 ms with no requests, not a condition. A file fetched after a longer gap, likelier on
  a slow CPU, may not be cached yet. Each now waits, bounded by `within()`, until every same-origin
  file the controlled page loaded is in the site's caches. Their waits for the service worker to be
  ready, which today give up silently after 10 s, also go through `within()`, which fails naming
  the wait. (Claude, 2026-11-11, from the spec review)
- **Reef's start-card test (`tests/reef.test.mjs:90`) waits 300 ms after the first move and then
  checks for no errors (cause 1).** The wait gives the awake player some frames to draw. It now
  waits for a set number of drawn frames (`realFrames`), so the check always covers them. The error
  it once caught is F-8, below. (Claude, 2026-11-11)
- **F-8, the negative radius: time runs backwards on Reef's first frame (Reef's game code).**
  - `frameLoop` (`reef/game.js` ~2099) caps each frame's step at 0.05 s, but has no lower bound.
    `last` is read with `performance.now()` at the end of the start-up callback, after it has built
    the scenery, spawned the reef and shown the start card. A frame can already be pending by then:
    Playwright's `waitForFunction` polls on `requestAnimationFrame`. That frame is stamped before
    the stall, so its step is minus the setup time.
  - The 0.05 s cap means the next frames make it back only slowly, so `time` (changed only in
    `update()`, ~925) stays negative for a while.
  - The waiting pulse's radius is `player.size * (0.6 + t * 0.9)` with `t = (time % 1.6) / 1.6`. It
    is negative whenever `time % 1.6` falls in (−1.6, about −1.07]. `ctx.arc` then throws before
    `requestAnimationFrame(frameLoop)`, so the game stops drawing for good.
  - The fix: Reef clamps the step to 0 or more, as Orbit, Crumble and Pixel Leap already do. Time
    never runs backwards, which fixes the cause and not only the radius. Rejected: clamping the
    radius (F-8's suggestion), which leaves time running backwards for everything else that reads
    it.
  - Not proved to be what happened in CI. The guard builds the condition: a first frame stamped 20 s
    early, which on the old code leaves `time` negative however many frames follow.

  (Claude, 2026-11-11; approved by the review, see the first Decision)

- **F-37 stays as it is** (not approved, see the first Decision). Vent bubbles and the level toast
  stay on `setTimeout`. No test reads the toast. Vent bubbles rise through the whole sea and can
  cross the patches of The Deep's darkness test (`:432`); only that test's 40 × 40 medians protect
  it. Pixel reads keep away from relying on single points. F-37's row in `FINDINGS.md` says so.
  (Claude, 2026-11-11)
- **Reef's bite-sound test (`:713`) waits 250 ms and 700 ms for sounds that the game plays on
  real-time timers (causes 1 and 7).** Those timers are 90 ms (the falling phrase, only while lives
  are left) and 500 ms (the game-over jingle). A busy runner can run them late. The test now waits
  until the phrase is heard. On the last life it waits until the jingle is heard, then checks the
  phrase never played. Had the phrase been scheduled in the same call, its 90 ms timer would have
  fired before the jingle's 500 ms one. The sounds stay on real time. (Claude, 2026-11-11)
- **Reef's currents test (`:635`) reads the L6 rip at whatever `time` the page has reached (cause
  6).** The rip's strength is `120 × (1 + 0.25 · sin(time · 0.6))`, which ranges over [90, 150].
  Rounded, it is exactly 90 for about 6 % of each 10.5 s period, and the test asserts `> 90`. Its
  value then depends on how long the page ran before the read. The assert becomes `>= 90`, the
  rip's floor. That still separates it from no current (0) and from L4's drift (under 50). Rejected:
  a test hook for `time` in the game. (Claude, 2026-11-11, from the spec review)
- **Reef's other tests are safe as they are.**
  - `startEmpty` takes the clock in the same call that empties the reef and resets the score, the
    bar and the spawn timers. It doesn't reset `time`, but no other test asserts anything that
    depends on its value: fish wobble isn't read, and combos are reset with `lastEat`.
  - The Deep's darkness test (`:432`), the state-card test (`:498`), the marks test (`:538`) and the
    HUD test (`:600`) read state after two drawn frames.
  - The frame loop counts `slowmo` down on real frames even with the clock taken, but it only scales
    the frame's own step, which `manual` discards.
  - The tests that sample `Math.random` (`:339`, 400 draws from at most six species; the flee test,
    `:198`) can't miss in practice.

  (Claude, 2026-11-11)

- **Runes' taps depend on how long the test takes to send them (cause 5).** The game counts a
  pointer as a tap only if it lifts within 300 ms (`KNOBS.tapMs`, `performance.now()`). The test's
  `tapCell` sends pointerdown and pointerup in two round trips to the page, and on a busy runner
  the gap between them can pass 300 ms. Then the tap does nothing. That affects the taps test
  (`tests/runes.test.mjs:168`) and the tap in the edge-strip test (`:94`). `tapCell` now sends both
  events in one call, so no task runs between them. The game's rule is unchanged. (Claude,
  2026-11-11)
- **Runes' pool-moving test (`:79`) compares two screenshots taken 300 ms apart (causes 1 and 4).**
  A busy runner may draw no frame between them, and then the two match. It keeps Runes' spec's
  "two frames 300 ms apart". After the first screenshot it waits on the page's clock until 300 ms
  have passed, then for real frames, then takes the second. Level 1's ghost light, which shows after
  4 s idle, is turned off for this test, so only the pool can make the frames differ. (Claude,
  2026-11-11)
- **Runes' Guidance test (`:301`) waits 300 ms and then checks that nothing was marked (cause 1).**
  With Guidance on, the dead-line check runs on the next frame and then in a task
  (`requestAnimationFrame`, then `setTimeout(…, 0)`). The test now waits for exactly that, a frame
  and then a task, before it checks that nothing ran. (Claude, 2026-11-11)
- **In Runes' ghost test (`:564`), the ghost runs on `performance.now()` and the test checks it on
  real time (cause 5).** No game change, per the review. The two waits for a show use `waitFor`,
  scaled by the throttle, instead of unscaled 3 s and 5 s. After the line moves, the test no longer
  waits 2600 ms. It waits on the page's clock until the key press is more than `ghostRepeat` +
  1600 ms + 1 s in the past, then for 30 real frames. A ghost that was still due would have shown
  by then. (Review via coordinator, 2026-11-11)
- **Two Runes tests measure a card during its 260 ms slide-in (cause 4).** The level-select test
  (`:773`) waits 400 ms for it. The failed-panel test (`:629`) measures the panel's top with no wait
  at all (from the spec review). Both now measure once the card's own animations have finished
  (`getAnimations()`). (Claude, 2026-11-11)
- **Runes' refresh-warning test (`:825`) waits 400 ms in Node for a dialog that may come (cause
  1).** It now waits, bounded by `within()`, for whichever comes first: the `beforeunload` dialog,
  or the page closing. After a dialog it awaits the dismissal and checks that the page still
  answers. (Claude, 2026-11-11)
- **The other tests in the three files were checked and need no change.** They step the game
  themselves, read state the call just set, or wait on a condition (`waitFor`, a locator's state)
  with Playwright's time-out, which the harness scales. Their float arithmetic runs the same steps
  from the same state every run, which the Orbit decision above ensures. (Claude, 2026-11-11)
- **"The old code" for each guard is the old test helper for Orbit and Runes** (`open()`,
  `tapCell`), and the old `reef/game.js` for Reef. (Claude, 2026-11-11)
- **Proof, as R-1 set it for every slice:** each guard test fails on the old code; the three files
  pass 5 times in parallel, and once with `TEST_CPU_THROTTLE=10` run alone (F-41); the rest of the
  suite passes once. (Split, 2026-11-11)

## Acceptance items

- **AC-1** Orbit's `open()` sets `window.__orbitManual` before the page's first frame, unless the
  test asks for `{ live: true }`. A guard test opens Orbit, lets 90 of the page's own frames run,
  and finds the game as the system starts: idle time 0, and the leg's clock at its start.
- **AC-2** Orbit's "alive before any touch" test waits on frames until the probe is more than 5
  units from where it was, failing within its time-out if it never is; it has no fixed wait.
- **AC-3** Orbit's offline test waits until 11 sounds have decoded, and then checks there are
  exactly 11.
- **AC-4** The three offline tests go offline only once every same-origin file the controlled page
  loaded is in the site's caches. Each wait, and the wait for the worker to be ready, goes through
  `within()`, and none uses `networkidle`.
- **AC-5** Reef's start-card test checks for errors after a set number of drawn frames following
  the first move, with no fixed wait.
- **AC-6** Reef's frame loop never steps the game by a negative time. A guard test hands
  `frameLoop`'s first frame, and only that one, a timestamp 20 s early. It takes the clock, starts a
  run, and has the player eat a fish. The game's time at that meal (`game.lastEat`) is 0 or more, and
  the page logs no error while frames draw the waiting player.
- **AC-7** Reef's bite-sound test waits until the falling phrase is heard after a bite. On the last
  life, it waits until the game-over jingle is heard and finds no falling phrase. It has no fixed
  wait.
- **AC-8** Reef's currents test accepts the L6 rip's floor (90) at the top of the sea.
- **AC-9** Runes' `tapCell` sends pointerdown and pointerup in one call to the page. A guard test
  queues a 400 ms busy task, as a separate task, from each pointerdown, and a tap still steps the
  line.
- **AC-10** Runes' pool-moving test turns the ghost light off, takes a screenshot, waits until
  300 ms have passed on the page's clock and then for real frames, and finds the second screenshot
  differs. It has no fixed wait.
- **AC-11** Runes' Guidance test, with Guidance off, checks for no dead-line marks only after a
  frame and then a task have run, the path the check would take with Guidance on.
- **AC-12** Runes' ghost test waits for the first and second ghost with `waitFor`. Once the line has
  moved, it waits until the key press is more than `ghostRepeat` + 1600 ms + 1 s in the past on the
  page's clock, then for 30 real frames, and finds no new ghost. It has no fixed wait.
- **AC-13** Runes' level-select and failed-panel tests measure their card once the card's
  animations have finished, with no fixed wait.
- **AC-14** Runes' refresh-warning test decides whether the page warned by whichever comes first,
  the dialog or the page closing, bounded by `within()`. After a dialog it awaits the dismissal and
  checks the page still answers. It has no fixed wait.
- **AC-15** `tests/orbit.test.mjs`, `tests/reef.test.mjs` and `tests/runes.test.mjs` are each
  marked `// clock-checked`, and `scripts/check-fast.sh` passes.
- **AC-16** Each guard test (AC-1, AC-6, AC-9) fails on the old code; the three files pass 5 times
  in parallel, and once with `TEST_CPU_THROTTLE=10`; the rest of the suite passes once. — verified
  by review: the PR records each run's result.
- **AC-17** Outside `tests/`, the only files that change are `specs/slow-tests-orbit-reef-runes.md`,
  `ROADMAP.md` (R-6's row and section), `FINDINGS.md` (F-8 removed, F-37 updated) and, for AC-6
  only, `reef/game.js` (its step's lower bound). — verified by review: the PR's diff.

## Out of scope

- F-37: Reef's vent bubbles and level toast stay on real time (not approved).
- Changing Runes' ghost or tap rules, or any game's spec.
- Moving Reef's sounds (the falling phrase, the jingle) off real time.
- Orbit's own real-time timers (focus after a card, the intro's fade): the tests wait on them by
  condition.
- The other slices' files.

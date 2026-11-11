# Orbit's, Reef's and Runes' slow tests run once

**Go:** pending

## Intent

R-6 of the seven slices that make the slow tier run once, with no retries (`ROADMAP.md`). The
owner, 2026-11-10: "we shouldn't be running 3 times. We should only run it once, and we should
understand the source of the flakiness and put the test around that. Or change the code so that it
is easier, reliable to test." The split, 2026-11-11: "Do an adversarial review about the split and
pick whatever makes sense."

This slice covers `tests/orbit.test.mjs`, `tests/reef.test.mjs` and `tests/runes.test.mjs`. Every
test in them was read for the seven cause patterns R-1 names (fixed waits, the clock taken after
real frames, frame state read before a frame, one pixel or instant sampled, wall-clock asserts,
float boundaries, real-time game timers). Each test at risk is fixed at its cause, using the helpers
in `tests/clock.mjs` (`specs/slow-tests-harness.md`). Two causes are in Reef's game code (F-8,
F-37), and those changes wait for the owner's OK.

## Decisions

Tests are named by title words and their line on `main` before this change.

- **Orbit: most tests take the clock after the page has already run (cause 2).** `open()` loads the
  page, and only then do the tests set `manual`. Until then the page's own frames move the game for
  however long the load took: the probe's angle, the moons' clock, the leg's idle time (the hint
  shows after 4 s). On a busy runner that time is longer, so the state a test starts from changes
  from run to run. Tests that fire without placing the probe themselves start from that drifted
  state: the "R in flight" part of the failed-flight test (`tests/orbit.test.mjs:242`, `fire(0.5)`),
  the tap in the bar-and-tap test (`:128`), and the tap in the state-table test (`:491`). A load over 4 s also shows the
  hint during a test. So `open()` sets `window.__orbitManual` before the first frame by default, the
  flag `specs/ci-flakes.md` added for the hint test, and every test starts from the state the
  system starts in. Only the "alive before any touch" test (`:96`) runs the page's own frames, with
  `{ live: true }`: it checks exactly that. The `manual(page)` calls stay; they no longer
  change anything. No game code changes. (Claude, 2026-11-11)
- **Orbit's "alive before any touch" test (`tests/orbit.test.mjs:96`) waits 500 ms for the probe to move more than 5 units (cause 1).**
  A busy runner runs fewer frames in 500 ms. It now waits on frames, with `waitFor`, until the probe
  is more than 5 units from where it was. (Claude, 2026-11-11)
- **Reef's start-card test (`tests/reef.test.mjs:90`) waits 300 ms after the first move and then
  checks for no errors (cause 1).** The wait gives the awake player some frames to draw. It now
  waits for a set number of drawn frames (`realFrames`), so the check always covers them. The error
  it once caught is F-8, below. (Claude, 2026-11-11)
- **F-8, the negative radius, comes from a step that runs time backwards (Reef's game code).** Reef's
  frame loop clamps each frame's step to at most 0.05 s, but not to 0 or more
  (`reef/game.js`, `frameLoop`). A frame whose timestamp is earlier than the last one runs `time`
  backwards. The loop's first frame can get such a timestamp: `last` is read with
  `performance.now()` just before the first `requestAnimationFrame`, and a frame's timestamp is when
  that frame began. The waiting pulse's radius, `player.size * (0.6 + t * 0.9)` with
  `t = (time % 1.6) / 1.6`, is negative when `time` is between −1.6 s and about −1.07 s, which
  matches the "radius is negative" seen once in that test. Orbit's loop already clamps its step to
  `Math.max(0, …)`. Proposed: Reef does the same, so time never runs backwards. That fixes the cause
  and not only the radius. Rejected: clamping the radius, as F-8 suggested, which leaves time
  running backwards for everything else that reads it. Not proved to be what happened in CI: the
  guard builds the condition (a first frame stamped 1.3 s before `last`) and shows that it throws.
  Waits for the owner's OK, through the coordinator's review. (Claude, 2026-11-11)
- **F-37: two Reef timers run on real time, so `manual` doesn't stop them (Reef's game code).**
  When a vent's timer runs out, `update()` queues 3 to 7 bubbles with `setTimeout`, 110 ms apart
  (`reef/game.js` ~1007). After a dive, the level toast shows 300 ms later through another
  `setTimeout` (~919). So bubbles appear after a test's `step()` loop has ended, and sit frozen at
  the vent until the next step. No test breaks on it today: the vents sit on the floor, away from
  every pixel a test reads, and no test reads the toast. But any later test that reads the reef's
  pixels, or the toast, after a stepped dive would depend on wall-clock time. Proposed: both wait in
  game time, counted down in `update()`. Bubbles then come out 0.11 s of game time apart, and the
  toast shows 0.3 s of game time into the new level. Players see the same thing. Waits for the
  owner's OK, through the coordinator's review; refused, this item is dropped and F-37 stays in
  `FINDINGS.md`. (Claude, 2026-11-11)
- **Reef's bite-sound test (`tests/reef.test.mjs:713`) waits 250 ms and 700 ms for sounds that the game plays on
  real-time timers (causes 1 and 7).** Those timers are 90 ms (the falling phrase) and 500 ms (the
  game-over jingle). A busy runner can run them late. The test now waits until the sound is heard.
  On the last life it waits for the jingle, then checks that the phrase never played: both timers
  start in the same call, and the phrase's 90 ms one would have fired before the jingle's 500 ms
  one. These sounds stay on real time: they're sounds, and the test waits on them. (Claude,
  2026-11-11)
- **Reef's other tests are safe as they are.** `startEmpty` takes the clock in the same call that
  empties the reef and resets the score, the bar and the timers, so frames run before it leave
  nothing a test reads. The Deep's darkness test (`:432`), the state-card test (`:498`), the
  marks test (`:538`) and the HUD test (`:600`) read state after two drawn frames. (Claude, 2026-11-11)
- **Runes' taps depend on how long the test takes to send them (cause 5).** The game counts a
  pointer as a tap only if it lifts within 300 ms (`KNOBS.tapMs`, `performance.now()`). The test's
  `tapCell` sends pointerdown and pointerup in two round trips to the page, and on a busy runner
  the gap between them can pass 300 ms. Then the tap does nothing. That affects the taps test
  (`tests/runes.test.mjs:168`) and the tap in the edge-strip test (`:94`). `tapCell` now sends both events in one
  call, so nothing can run between them. The game's rule is unchanged. (Claude, 2026-11-11)
- **Runes' pool-moving test (`tests/runes.test.mjs:79`) compares two screenshots taken 300 ms apart
  (causes 1 and 4).** A busy runner may draw no frame between them, and then the two match. It now
  takes a screenshot, then waits for real frames and takes another, until one differs, within a
  time-out. (Claude, 2026-11-11)
- **Runes' Guidance test (`tests/runes.test.mjs:301`) waits 300 ms and then checks that nothing was marked
  (cause 1).** With Guidance on, the dead-line check runs on the next frame and then in a task
  (`requestAnimationFrame` then `setTimeout(…, 0)`). The test now waits for exactly that, a frame
  and then a task, before it checks that nothing ran. (Claude, 2026-11-11)
- **In Runes' ghost test (`tests/runes.test.mjs:564`), the ghost runs on `performance.now()`, and the test checks it on real time
  (cause 5).** The test shortens the delays to 400 ms and 800 ms and waits up to 3 s and 5 s
  (unscaled) for the first and second shows. To check that no more ghosts come once the line moves,
  it then waits 2600 ms. No game change is needed for that check: the test moves the game's
  `lastInput` back by more than both delays, so a ghost would be due at once, and then waits for
  real frames. No ghost shows, because the line has moved. The two waits for a show use `waitFor`,
  scaled by the throttle. Rejected: a test clock for the ghost in `runes/game.js`, which would need
  the owner's OK and isn't needed. (Claude, 2026-11-11)
- **Runes' level-select test (`tests/runes.test.mjs:773`) waits 400 ms for the card's 260 ms slide-in before measuring
  it (cause 1).** It now waits until the card's own animations have finished
  (`getAnimations()`). (Claude, 2026-11-11)
- **Runes' refresh-warning test (`tests/runes.test.mjs:825`) waits 400 ms in Node for a dialog that may
  come (cause 1).** It now waits for whichever comes first: the `beforeunload` dialog, or the page
  closing. (Claude, 2026-11-11)
- **The service-worker waits in the three offline tests (`tests/orbit.test.mjs:686`,
  `tests/reef.test.mjs:415`, `tests/runes.test.mjs:614`) give up silently after
  10 s (cause 5).** On a slow runner the test then goes on with no worker, and fails later on
  something else. Each now goes through `within()` from `tests/clock.mjs`, scaled by the throttle,
  which fails naming the wait. (Claude, 2026-11-11)
- **The other tests in the three files were checked and need no change.** They step the game
  themselves, read state the call just set, or wait on a condition (`waitFor`, a locator's state)
  with Playwright's time-out, which the harness scales. Their float arithmetic runs the same steps
  from the same state every run, which the Orbit decision above guarantees. (Claude, 2026-11-11)
- **Proof, as R-1 set it for every slice:** each guard test fails on the old code; the three files
  pass 5 times in parallel, and once with `TEST_CPU_THROTTLE=10` run alone (F-41); the rest of the
  suite passes once. (Split, 2026-11-11)

## Acceptance items

- **AC-1** Orbit's `open()` sets `window.__orbitManual` before the page's first frame, unless the
  test asks for `{ live: true }`. A guard test opens Orbit, lets 90 of the page's own frames run,
  and finds the game exactly as the system starts: idle time 0, the leg's clock at its start, the
  probe where it was after load, the hint hidden.
- **AC-2** Orbit's "alive before any touch" test waits on frames until the probe is more than 5 units from where it was,
  failing within its time-out if it never is; it has no fixed wait.
- **AC-3** Reef's start-card test checks for errors after a set number of drawn frames following the first
  move, with no fixed wait.
- **AC-4** Reef's bite-sound test waits until the falling phrase is heard after a bite. On the last life, it
  waits until the game-over jingle is heard and finds no falling phrase. It has no fixed wait.
- **AC-5** Reef's frame loop never steps the game by a negative time. A guard test hands Reef's
  first frame a timestamp 1.3 s before the loop's start and takes the clock. It then starts a run
  with the player waiting and draws frames. It finds no page error, and the game's time is not
  negative.
- **AC-6** Reef's vent bubbles and its level toast wait in game time. In a guard test with the clock
  taken, steps that set off a vent are followed by 30 real frames without steps, and no bubble
  appears in those frames. After a stepped dive, the toast is still hidden after 30 real frames
  without steps, and shows once 0.3 s of steps have run.
- **AC-7** Runes' `tapCell` sends pointerdown and pointerup in one call to the page. A guard test
  keeps the page's main thread busy for 400 ms right after each pointerdown, and a tap still steps
  the line.
- **AC-8** Runes' pool-moving test finds the pool moving by comparing screenshots taken between real frames,
  until two differ or a time-out runs out. It has no fixed wait.
- **AC-9** Runes' Guidance test, with Guidance off, checks for no dead-line marks only after a frame and
  then a task have run, the path the check would take with Guidance on.
- **AC-10** Runes' ghost test waits for the first and second ghost with `waitFor`. Once the line has
  moved, it moves the game's last input back by more than both delays, waits for real frames, and
  finds no new ghost. It has no fixed wait.
- **AC-11** Runes' level-select test measures the level card once the card's animations have finished, with no
  fixed wait.
- **AC-12** Runes' refresh-warning test decides whether the page warned by whichever comes first, the dialog or
  the page closing, with no fixed wait.
- **AC-13** In the three files, each wait for the service worker to be ready goes through `within()`
  and fails, naming the wait, when the worker never gets ready.
- **AC-14** `tests/orbit.test.mjs`, `tests/reef.test.mjs` and `tests/runes.test.mjs` are each
  marked `// clock-checked`, and `scripts/check-fast.sh` passes.
- **AC-15** Each guard test (AC-1, AC-5, AC-6, AC-7) fails on the code before this change; the three
  files pass 5 times in parallel, and once with `TEST_CPU_THROTTLE=10`; the rest of the suite passes
  once. — verified by review: the PR records each run's result.
- **AC-16** Outside `tests/`, the only files that change are `specs/slow-tests-orbit-reef-runes.md`,
  `ROADMAP.md` (R-6's row and section), `FINDINGS.md` (this slice's rows) and, for AC-5 and AC-6
  only, `reef/game.js`. — verified by review: the PR's diff.

## Out of scope

- Changing Runes' ghost or tap rules, or any game's spec.
- Moving Reef's sounds (the falling phrase, the jingle) off real time.
- Orbit's own real-time timers (focus after a card, the intro's fade): the tests wait on them by
  condition.
- The other slices' files.

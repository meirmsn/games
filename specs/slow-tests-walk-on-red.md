# Slow tests run once: Walk on Red's tests wait on frames and state, not time

**Go:** pending

## Intent

R-2, slice 2 of the seven that make the slow tier run once, with no retries (`ROADMAP.md`). The
owner, 2026-11-10: "we shouldn't be running 3 times. We should only run it once, and we should
understand the source of the flakiness and put the test around that. Or change the code so that it
is easier, reliable to test." The split, 2026-11-11: "Do an adversarial review about the split and
pick whatever makes sense."

This slice is `tests/walk-on-red.test.mjs` (Gotta Go!): its 21 `page.waitForTimeout` calls bet that
the game has moved on after a fixed time (F-33). A busy runner runs fewer frames in that time, so
each bet can lose. Each test's cause is found, below, and the test is put around it: it waits on
the game's frames or state (`tests/clock.mjs`), or steps the game itself. No game code changes.

## Decisions

- **The cause, per test** (each named by a phrase of its title and its line in
  `tests/walk-on-red.test.mjs` on `main` at 3647401). (Claude, 2026-11-11)
  - "a swipe that starts in an edge strip hops nowhere" (~145, the edge-strip test) and "a tap
    hops forward, swipes hop back and sideways" (~178, the tap-and-swipe test), 17 waits of 200 ms: a hop from input
    moves the player's row at once, but lands only when its 0.12 s tween has run on real frames
    (`manual` is off on purpose: these tests drive the real loop). A frame's step is at most 0.05 s
    (`walk-on-red/game.js` `frame`), so a hop needs 3 or more frames; an input sent before the last
    hop has landed is queued and lands a hop later, so the next position check is off by one.
    The CDP touch, mouse and key calls also return before the game has necessarily handled the
    event. Patterns 1 and 7 (a real-time tween). The fix keeps the real loop: each input is counted
    by a listener in the page, and the test waits (`waitFor`) until that many inputs were handled
    and the player has landed (`player.tw >= 1`; the game takes a queued hop in the same update
    that lands the last one, so a landed player has none queued).
  - "traffic drives behind the start card" (~115, the start-card test), 500 ms and 300 ms: the first wait is for traffic and people that
    `showStart()` already placed, and the second for vehicles to have moved, which needs at least
    one real frame (pattern 1). They become a `waitFor` on the state and `realFrames`. After
    Start is clicked, the test reads the level's state in a later round-trip while the real loop
    runs: on a starved Node process, a second of frames could tick the walk light from 30 to 29
    (pattern 5). The state is read in a click listener the test adds after the game's own, so it is
    the state Start left.
  - "hiding the page pauses" (~730), 400 ms: checks that real frames don't advance a paused game; a
    fixed wait can hold no frame at all, so the check could pass with nothing checked. It becomes
    `realFrames` (pattern 1).
  - "each state shows only its own card" (~820, the cards test), 1800 ms: the level's name banner is hidden by a 1.6 s real-time
    `setTimeout` (`walk-on-red/game.js` ~987, `showBanner`), so the test bets 200 ms on a timer
    that a busy page runs late (patterns 1 and 7). It becomes a `waitFor` on the banner being
    hidden. The 100 ms after the green light (~862) waits for a drawn frame: `realFrames`. The
    banner "just after Start" check is read in the same evaluate as the start, before the timer can
    run.
  - "the view is the crossing edge to edge" (~894), 300 ms after Start (desktop pixels) and 100 ms after each turn:
    both wait for a drawn frame, and after a turn for the `resize` event, which a browser runs
    before the next frame's callbacks. They become `realFrames`, after the window has its new
    width (`waitFor`). The pixels it samples are the plain background, which `draw()` fills
    whole, and one pixel of street checked only for not being the background: no single-instant
    sample to fix (pattern 4).
  - "what the level is worth while playing" (~1005), 200 ms: waits for a drawn frame with the real loop on (the walk
    light counting down); `realFrames`. The label and the light are read in one evaluate, after
    the frame that drew them, so they agree.
  - "the game works offline" (~879, the offline test): no `waitForTimeout`, but its wait for the service worker ends
    silently after 10 s and the test carries on to fail later, offline, for another reason. It
    becomes `within(...)` from `tests/clock.mjs`, which fails naming what it waited for.
  - "a run has 3 lives in the HUD" (~1211): after `setViewportSize(360, 640)` it waits for the window to have
    that width before measuring the HUD.
  - The other 19 (at ~253, ~291, ~337, ~441, ~462, ~529, ~558, ~583, ~602, ~646, ~668, ~795,
    ~962, ~1032, ~1063, ~1108, ~1157, ~1201 and ~1253): with `manual` on,
    the game moves only when the test calls `step()`, and each check runs in the same
    `page.evaluate` as the steps it checks, so real frames, which only draw, can't change what they
    read. Their HUD reads wait for drawn frames in the page (`requestAnimationFrame`). The step
    arithmetic (`i < 60 * 1.4` and the like) is the same in every run (pattern 6 isn't flaky
    here). No cause; they are checked and left as they are.
- **`startEmpty` turns `manual` on before `startGame`,** not after (pattern 2). In the old order
  both ran in one evaluate, so no frame could run between them and no test failed from it; the new
  order says what the helper means without relying on that. (Claude, 2026-11-11)
- **The two game timers stay as they are; no game-code change is needed.** `showBanner`'s 1.6 s
  (~987): the test waits on the banner instead (above). `arrive`'s 250 ms (~482), which walks a
  copier who is across to the porta-potty queue: every test that steps a copier across does so
  inside one evaluate, where no timer can run, and none reads where the copier stands afterwards,
  so it changes no result. That the tests never see that walk is recorded in `FINDINGS.md`.
  (Claude, 2026-11-11)
- **The guard reproduces fewer frames, not a slower CPU.** On `main`, the file passes with
  `TEST_CPU_THROTTLE=10` (28 of 28, tried in this session): the game's frames are cheap, so a 10×
  slower CPU still runs them at full rate. What a busy runner does to these tests is run fewer
  frames, so the guard makes each frame slow: an init script makes every animation frame of the
  page take at least 150 ms (about 6 frames a second), which also delays the page's timers and
  input as a busy main thread does. Rejected: a higher CPU throttle, which slows frames only by
  chance. (Claude, 2026-11-11)
- **The guard test runs the edge-strip and tap-and-swipe checks themselves** on a
  starved page: each test's body is a function the test and the guard both call, so the guard
  can't drift from the tests it guards. (Claude, 2026-11-11)

## Acceptance items

- **AC-1** `tests/walk-on-red.test.mjs` is marked `// clock-checked`, and every `waitForTimeout(`
  left in it carries `// safe: <reason>`.
- **AC-2** In the edge-strip and tap-and-swipe tests, each position check comes
  after the page has handled every input sent so far and the player's hop has landed, with the
  game's own frame loop running the hops (`manual` off).
- **AC-3** A guard test runs the edge-strip and tap-and-swipe checks on a page whose
  every animation frame takes at least 150 ms, and passes. The same checks with `main`'s 200 ms
  waits fail on that page. — verified by review: the PR shows the guard run on `main`'s checks
  failing.
- **AC-4** The start-card test reads the mode, level, walk light, followers and row in a
  listener on the Start button that runs after the game's own, so time passing between the click
  and the test's next step can't change them.
- **AC-5** The cards test waits until the level's name banner is hidden, failing with
  a message naming it if it isn't within its time-out; it doesn't wait a fixed time for it.
- **AC-6** `startEmpty` turns `manual` on before it starts the level.
- **AC-7** In the offline test, the wait for the service worker to be ready fails,
  naming it, if it isn't ready within its time-out.
- **AC-8** `tests/walk-on-red.test.mjs` passes 5 times in parallel, and once with
  `TEST_CPU_THROTTLE=10`, and the rest of the slow suite passes once. — verified by review: the
  PR shows the runs' summaries.
- **AC-9** No game code changes: outside `tests/walk-on-red.test.mjs`, the change touches only this
  spec, `ROADMAP.md` (R-2's row and section) and `FINDINGS.md` (rows this slice adds). —
  verified by review: the PR's diff.

## Out of scope

- Changing `walk-on-red/game.js`, including its two real-time timers.
- Changing what `specs/walk-on-red.md` or `specs/edge-gestures.md` promises.
- Other games' tests, `tests/clock.mjs` and `tests/insets.mjs`.
- Running the whole file on a starved page: the guard covers the two tests whose cause is frames.

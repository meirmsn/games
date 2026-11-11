# Slow tests run once: Walk on Red's tests wait on frames and state, not time

**Go:** pending

## Intent

R-2, slice 2 of the seven that make the slow tier run once, with no retries (`ROADMAP.md`). The
owner, 2026-11-10: "we shouldn't be running 3 times. We should only run it once, and we should
understand the source of the flakiness and put the test around that. Or change the code so that it
is easier, reliable to test." The split, 2026-11-11: "Do an adversarial review about the split and
pick whatever makes sense."

This slice is `tests/walk-on-red.test.mjs` (Gotta Go!): 21 `page.waitForTimeout` calls bet that
the game has moved on after a fixed time (F-33), and one more bet hides in its offline test. A busy
runner runs fewer frames, and runs timers later, so each bet can lose. Each test's cause is found,
below, and the test is put around it: it waits on the game's frames or state (`tests/clock.mjs`),
or reads the state where it can't change. No game code changes.

The causes looked for in each test, from the coordinator's brief for the slices: (1) fixed waits;
(2) `manual` turned on after real frames have run; (3) frame-loop state read before a frame has
run; (4) one pixel or one instant sampled; (5) wall-clock timing asserts; (6) float boundaries in
step arithmetic; (7) real-time `setTimeout`s in game code that `manual` doesn't stop.

## Decisions

- **The cause, per test** (each named by a phrase of its title and its line in
  `tests/walk-on-red.test.mjs` on `main` at 3647401). (Claude, 2026-11-11, from the spec review)
  - "a swipe that starts in an edge strip hops nowhere" (~145, the edge-strip test: `settle()` at
    ~151, run 8 times) and "a tap hops forward, swipes hop back and sideways" (~178, the
    tap-and-swipe test: 12 waits, run 14 times), each 200 ms (causes 1 and 7). With `manual` off,
    the real loop moves the game. A hop from input moves the player's row at once but lands only
    when its 0.12 s tween has run on real frames, and a frame's step is at most 0.05 s
    (`walk-on-red/game.js` `frame`, ~2007), so a hop needs 3 or more frames. An input sent before
    the last hop has landed is queued, and a second one overwrites the first (`doHop`, ~1065), so
    the next check is off by a row. Playwright's key, mouse and touch calls wait for frames
    themselves (a key press returned with its hop 0.83 landed), so the 200 ms wait only has to hold
    the hop's last frame: it loses when a frame takes longer than 200 ms. In the edge-strip test the
    five "hops nowhere" checks pass whether or not the swipe was handled at all, so for them a
    fixed wait proves nothing; only the last check (~172) depends on a hop landing.
  - "traffic drives behind the start card" (~115, the start-card test), 500 ms and 300 ms (cause
    1): the street is full before `window.__walkOnRed` exists (`showStart()` runs `setupLevel`,
    which simulates the traffic, in the same callback that sets it, ~2053), so the first wait waits
    for nothing; the second waits for vehicles to have moved, which needs real frames. After Start
    is clicked, the test reads the level's state in a later round-trip while the real loop runs: a
    second of frames in between could tick the walk light from 30 to 29 (cause 5).
  - "hiding the page pauses" (~730), 400 ms: checks that real frames don't advance a paused game;
    a fixed wait can hold no frame at all, so the check could pass with nothing checked (cause 1).
  - "each state shows only its own card" (~820, the cards test), 1800 ms: the level's name banner
    is hidden by a 1.6 s real-time `setTimeout` (`walk-on-red/game.js` ~987, `showBanner`), so the
    test bets 200 ms on a timer a busy page runs late (causes 1 and 7); and the banner "just after
    Start" is read in a separate evaluate from the start, so a stall of 1.6 s between them fails it.
    The 100 ms after the green light (~862) waits for nothing: `beginGreen` sets the banner, its
    text and the HUD in the same update (`showResult`, ~888).
  - "the view is the crossing edge to edge" (~894), 300 ms after Start (desktop pixels) and 100 ms
    after each turn (cause 1): the first waits for a frame drawn after Start (a `resize()` clears
    the canvas); the second for the `resize` event, which a browser runs at the next rendering
    update, before that frame's animation callbacks. The pixels sampled are the plain background,
    which `draw()` fills whole, and one pixel of street checked only for not being the background:
    no single-instant sample to fix (cause 4).
  - "what the level is worth while playing" (~1005), 200 ms: waits for a frame drawn with the real
    loop on (the walk light counting down). The label and the light are read in one evaluate,
    after the frame that drew them, so they agree.
  - "the game works offline" (~879, the offline test): no `waitForTimeout`, but two bets. Its wait
    for the service worker ends silently after 10 s and the test carries on. And
    `waitForLoadState('networkidle')` (~885) bets that the game's files are cached by then: the
    service worker answers each request and writes it into the cache afterwards
    (`event.waitUntil(keep(req, res))`, `sw.js` ~150 to ~165), which `networkidle` can't see. A
    file not yet written when the test goes offline leaves the offline reload without it.
  - "a run has 3 lives in the HUD" (~1211): after `setViewportSize(360, 640)` it measures the HUD,
    whose width the game's `resize()` handler sets (~1424), with no frame in between; the
    `run(page, 0.1)` before it steps the game but draws nothing (cause 3).
  - The other 19 (at ~253, ~291, ~337, ~441, ~462, ~529, ~558, ~583, ~602, ~646, ~668, ~795,
    ~962, ~1032, ~1063, ~1108, ~1157, ~1201 and ~1253): each reads what it checks in the same
    `page.evaluate` as the steps or starts it checks, or reads DOM that no frame changes, so real
    frames, which only draw, can't change what they read; their HUD reads wait for drawn frames in
    the page (`requestAnimationFrame`). The step arithmetic (`i < 60 * 1.4` and the like) is the
    same in every run (cause 6 isn't flaky here). No cause; they are checked and left as they are.
- **The fixes.** (Claude, 2026-11-11, from the spec review)
  - The edge-strip and tap-and-swipe tests keep the real loop and wait (`waitFor`) until the page
    has handled every input sent so far and the player has landed (`player.tw >= 1`; the game
    takes a queued hop in the same update that lands the last one, ~1046, so a landed player has
    none queued). Inputs are counted by listeners the test adds once the page has loaded (after
    `simulateInsets`' reload): `pointerup` and `pointercancel` on the canvas, and `keydown` on
    the window, in the bubble phase, so each runs after the game's own handler. Both bodies first
    set the walk light high, so a slow run can't end the level under them. Rejected: turning
    `manual` on and stepping 0.15 s after each input, fully deterministic but leaving no test where
    the game's own loop takes a hop, a queued one included, from real input.
  - The start-card test reads the street at once, then waits 2 real frames (`realFrames`) for the
    vehicles to move; it reads the level's state in a click listener on Start that it adds after
    the game's own, so it is the state Start left.
  - "hiding the page pauses" waits 10 real frames (`realFrames`) instead of 400 ms.
  - The cards test reads the banner in the same evaluate as the start, then waits (`waitFor`) for
    the banner to be hidden; the 100 ms after the green light goes.
  - The view test waits 2 real frames after Start; after each turn it waits until the window has
    its new width, then 2 real frames.
  - "what the level is worth" waits 2 real frames instead of 200 ms.
  - The offline test's wait for the service worker goes through `within` (`tests/clock.mjs`), which
    fails naming it; before going offline it waits until the cache holds the page, `game.js` and
    the sprite sheet (`img/vehicles.png`).
  - "a run has 3 lives" waits until the window is 360 px wide, then 2 real frames, before measuring.
- **`startEmpty` stays as it is (cause 2 isn't one here).** The split's note said `manual` is set
  late in `startEmpty`; it sets `startGame` and `manual = true` in one synchronous `page.evaluate`
  (~37 to ~45), so no frame can run between them. The coordinator's verdict below says the same.
  (Claude, 2026-11-11)
- **The two game timers stay as they are: the fixes are test-only.** The owner gave game-code OKs
  over to an adversarial review run by the coordinator session ("You should do an adversarial
  review to get the answer to your questions.", 2026-11-11, as relayed in its verdict). Its
  verdict for this slice, 2026-11-11, stands as the owner's decision: "Timers at
  walk-on-red/game.js:482 (250 ms queue walk) and :987 (1600 ms banner): NOT APPROVED, test-only.
  Moving the queue walk to game time would make followers queue 20× sooner during fast-forward
  (`t.FF`), which a player would see. The banner's risk is the test, not the game: [the cards
  test]'s `waitForTimeout(1800)` leaves only a 200 ms margin (tests/walk-on-red.test.mjs:842). Use
  `waitFor(banner hidden)`, and read "just after Start" in the same `evaluate` as `startEmpty`."
  It also said the tests at ~148 and ~181 "should wait on the player's col/row, not `settle()` 200
  ms"; they wait on every input having been handled and the hop having landed, which includes his
  col and row and also covers the checks where he must not move, where no change could be waited
  for. `arrive`'s 250 ms timer changes no result: every test that steps a copier across does it
  inside one evaluate, where no timer can run, and none reads where the copier stands afterwards.
  That the tests never see that walk is recorded in `FINDINGS.md`. (Coordinator's verdict as the
  owner's, 2026-11-11; Claude, 2026-11-11)
- **The guard reproduces fewer frames, not a slower CPU.** On `main`, the file passes with
  `TEST_CPU_THROTTLE=10` (28 of 28, tried in this session): the game's frames are cheap, so a 10×
  slower CPU still runs them at full rate. What a busy runner does to these tests is run fewer
  frames. So the guard's pages get an init script, added to the context before `open()`'s first
  navigation (an option of `open()`), that makes every animation frame take at least 300 ms,
  which also delays the page's timers and input as a busy main thread does; the guard checks that
  the frames it measured were that far apart. Tried on `main`'s file: at 150 ms a frame the
  tap-and-swipe test passes; at 300 ms it fails (a key sent mid-hop is queued, the next overwrites
  it, and he ends a row off). The edge-strip test passed at 300 ms, since its 4-step drags span
  several frames; the guard runs it too, as the same bet. Rejected: a higher CPU throttle, which
  slows frames only by chance. (Claude, 2026-11-11)
- **The guard test runs the edge-strip and tap-and-swipe checks themselves:** each test's body is a
  function the test and the guard both call, so the guard can't drift from the tests it guards.
  The frame-starving script stays in this file, not `tests/clock.mjs`, so slices built in parallel
  don't collide there; a `FINDINGS.md` row says so, for R-7 to share it. (Claude, 2026-11-11)

## Acceptance items

- **AC-1** `tests/walk-on-red.test.mjs` is marked `// clock-checked` and has no `waitForTimeout(`
  left.
- **AC-2** In the edge-strip and tap-and-swipe tests, each position check comes after the page has
  handled every input sent so far and the player's hop has landed, with the game's own frame loop
  running the hops (`manual` off).
- **AC-3** A guard test runs the edge-strip and tap-and-swipe checks on pages whose animation
  frames it measured at least 300 ms apart, and passes. — verified by review: the PR shows the
  tap-and-swipe checks with `main`'s 200 ms waits failing on such a page.
- **AC-4** The start-card test reads the mode, level, walk light, followers and row in a listener
  on the Start button that runs after the game's own.
- **AC-5** The cards test reads the banner "just after Start" in the same evaluate that starts the
  level, and then waits until the banner is hidden, failing with a message naming it if it isn't
  within its time-out.
- **AC-6** The offline test fails, naming what it waited for, if the service worker isn't ready
  within its time-out, and goes offline only once the cache holds the page, `game.js` and
  `img/vehicles.png`.
- **AC-7** The view test and the lives test measure the page only after it has its new size and has
  drawn a frame since.
- **AC-8** `tests/walk-on-red.test.mjs` passes 5 times in parallel, and once with
  `TEST_CPU_THROTTLE=10`, and the rest of the slow suite passes once. — verified by review: the PR
  shows the runs' summaries.
- **AC-9** No game code changes: outside `tests/walk-on-red.test.mjs`, the change touches only this
  spec, `ROADMAP.md` (R-2's row and section) and `FINDINGS.md` (rows this slice adds). — verified
  by review: the PR's diff.

## Out of scope

- Changing `walk-on-red/game.js`, including its two real-time timers and its frame step's missing
  lower bound on `dt` (the coordinator logs that one).
- Changing what `specs/walk-on-red.md` or `specs/edge-gestures.md` promises.
- Other games' tests, `tests/clock.mjs` and `tests/insets.mjs`.
- Running the whole file on a starved page: the guard covers the two tests whose cause is frames.

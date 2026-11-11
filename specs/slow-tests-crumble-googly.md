# Slow tests run once: Crumble's and Googly Faces' tests

**Go:** pending

## Intent

R-4, slice 4 of the seven that make the slow tier run once, with no retries (`ROADMAP.md`). The
owner, 2026-11-10: "we shouldn't be running 3 times. We should only run it once, and we should
understand the source of the flakiness and put the test around that. Or change the code so that it
is easier, reliable to test." The split, 2026-11-11: "Do an adversarial review about the split and
pick whatever makes sense."

This slice checks every test in `tests/crumble.test.mjs` and `tests/googly-faces.test.mjs` for the
causes the harness slice (`specs/slow-tests-harness.md`) named: fixed waits, `manual` set late,
state read before a frame has run, one instant sampled, wall-clock asserts, float boundaries in step
arithmetic, and game timers that `manual` doesn't stop. Each test that waits on the clock is changed
to wait on the thing it means: an animation frame, an input event the page has seen, the game's
state, or the page's own timer queue. Both files are then marked `// clock-checked`. Googly Faces
has no spec of its own, so its guard test is this spec's.

No game code changes: every cause found can be waited on from the test (see Decisions). No game's
spec changes.

## Decisions

### How the tests wait now

- **Input moves are waited on as events the page has seen.** After the first `touchmove`, Chromium
  sends touch moves to the page without waiting for it and delivers them with the next animation
  frame (rAF-aligned input); mouse moves too. So a fixed 60 ms after a drag's moves covers that
  frame only while frames come faster than 60 ms. The tests now wait until the page has seen a
  `pointermove` at the drag's last point (a listener on `window`, in the capture phase, so the
  game's own handlers can't hide it). A `touchend` and a `touchstart` are blocking: CDP's
  `Input.dispatchTouchEvent` returns once the page has handled them, after any moves still queued,
  so nothing waits after them. (Claude, 2026-11-11)
- **A step the game takes on its next frame is waited on with `realFrames(page, 1)`** from
  `tests/clock.mjs`: a `requestAnimationFrame` the test requests after the game's runs after it in
  the same frame, and a frame's resize steps run before its animation-frame callbacks. (Claude,
  2026-11-11)
- **A check on the real game loop waits on the game's state** with `waitFor` from
  `tests/clock.mjs`, whose time-out is scaled by the throttle rate, or reads the state on each of a
  number of frames inside the page, instead of a few reads some milliseconds apart. A time-out is
  only a bound on failure; it never decides a pass. (Claude, 2026-11-11)
- **A wait for a game's own `setTimeout` is an in-page timer queued after it.** Googly Faces plays
  a giggle 120 ms, or a flourish 140 ms, after a tap (`googly-faces/game.js` ~389, ~390). A page
  runs a timer with a shorter delay that was queued earlier before one queued later with a longer
  delay, so the mute test waits on an in-page `setTimeout` of 200 ms queued after the tap, not
  300 ms in Node. (Claude, 2026-11-11)
- **Crumble's own `realFrames` is gone;** the file imports the one in `tests/clock.mjs`, which has
  a time-out. (Claude, 2026-11-11; from `specs/slow-tests-harness.md`)

### Game code

- **No game code changes.** Googly Faces' `setTimeout`s at `googly-faces/game.js` ~389, ~390 (the
  giggle and flourish after a tap), ~688 (the party faces) and ~698 (their happy wave) run on real
  time, and the game has no `manual` clock. None of them decides a test: the mute test waits for
  ~389 and ~390 as above; the party faces and their wave come after the round's twelfth tap, and
  the round test waits on the play-again button and the game's state, not on them; the wave skips a
  face that has ducked away (`phase === 'out'`), which every face has done once Play again starts a
  new round. Crumble's `setTimeout`s (the whoosh after a shot, `crumble/game.js` ~518, and the
  banner, ~1682) decide no test either: no test checks the whoosh or the banner. (Claude,
  2026-11-11)
- **The game-code verdict: no game change.** The owner delegated game-code OKs to an adversarial
  review run by the coordinator session ("You should do an adversarial review to get the answer to
  your questions.", owner, 2026-11-11), so its verdict stands as the owner's. Its verdict for R-4,
  2026-11-11, in its words:

  > **Googly's `setTimeout`s at googly-faces/game.js:389 and 390 (delayed giggle and flourish) and
  > :688 and :698 (the party row and its waves): NOT APPROVED, test-only.** The sound tests check
  > `>= 1` and `> count` (tests/googly-faces.test.mjs:97, 116), which late sounds can't break. The
  > muted check (:133) holds as long as `play()` checks mute when it runs. The only party test
  > checks `state === 'party'` and the Play again button (:225). Googly has no `manual` mode, so
  > route its waits through `waitFor` on state. If party faces need a check, `waitFor` a count of
  > `f.party` faces. **Crumble:** no game change was asked for. Its tight `waitForFunction`
  > time-outs (~147, ~1018) and its own `realFrames` move to the shared helpers, as briefed.

### The cause, test by test: `tests/crumble.test.mjs`

- **The `touch()` helper's `drag` (~89):** waited 60 ms after the moves and 30 ms after the end.
  Cause: rAF-aligned moves (above). Now waits for the last move to be seen, and nothing after the
  end.
- **"with iPhone insets in landscape, a pull that starts in an edge strip…" (~106):** the same 60 ms and 30 ms
  around its pulls, and it reads `aim.active` between the moves and the end. Same cause and fix.
- **"the shore moves behind the start card…" (~139):** the demo tanks trade shots on
  the real loop, and the first carve was awaited with a fixed 15 s time-out, not scaled by the
  throttle. Game time runs slower than the wall clock when frames are slow (each frame's step is
  capped at 50 ms), so a busy machine needs more wall time for the same shots. Now `waitFor`, 15 s
  scaled.
- **"pull back and let go aims and fires…" (~163):** 60 ms after the moves before
  reading the aim. Same cause and fix as `drag`.
- **"winning gives stars and the next battlefield…" (~554):** 100 ms before counting the result's stars,
  which `showResult()` sets in a `requestAnimationFrame` (`crumble/game.js` ~1661). Now
  `realFrames(page, 1)`.
- **"the portrait hold and the landscape resume hold with frames coming slowly" (~828):** sets 10× itself on
  a context with `throttle: false`, so the harness's scaling doesn't apply to it, and the shared
  `realFrames`' 10 s default is short for 60 frames at 10×. It passes its own 30 s time-out.
- **"portrait shows the turn card and pauses a battle…" (~857):** the CPU's shot after
  the landscape resume was awaited with a fixed 10 s time-out (now `waitFor`, scaled); and 200 ms
  after the 640×360 resize and `startBattle(1)` before reading the tank positions, which `view`
  holds and the game's `resize` handler sets. Chromium fires `resize` in the next frame. Now: wait
  until `innerWidth` is 640, then `realFrames(page, 1)`.
- **"a hidden page stops a shell in flight; a tap resumes" (~934):** on the real
  loop. 150 ms for the shell to fly, 400 ms to see that it holds, 200 ms to see it move again. Now
  `waitFor` the shell to have moved, `realFrames(page, 30)` to see it hold (as ~857 does), and
  `realFrames(page, 5)` after the tap before checking it moved.
- **"Crumble plays offline once it has been played…" (~960):** raced the service worker's `ready` against a
  10 s in-page timer and went on silently if it lost, so a slow worker failed a later step with an
  unrelated message. Now `within(…, 10000)` from `tests/clock.mjs`, which fails naming the wait.
- **"firing, an explosion and a tide rise each play their sound" (~1017):** waited
  for the 14 sounds to decode with a fixed 5 s time-out. Decoding is CPU work; now `waitFor`, 10 s
  scaled.
- **"the frame holds in CPU time…" (~741):** measures CPU time from a trace with
  `throttle: false`, so neither the throttle nor the wall clock enters it; its frame count is the
  test's own 300 frames. Checked, unchanged.
- **The tests driven by `step()`** (~203, ~273, ~310, ~356, ~434, ~465, ~611, ~659, ~698, ~996,
  ~1048, ~1122, ~1146, ~1206): `battle()` sets `manual` in the same `evaluate` as
  `startBattle`, so no real frame runs the battle first; every step loop runs inside one `evaluate`,
  so no frame can interleave; the asserts on step counts (~203's 8 s flight, `long.t > 7.5 && long.t < 8.6`) have slack of many steps around the float sum. ~465
  reloads and starts a battle without `manual` set again, but steps it inside the same `evaluate`.
  ~1206 reads the sky after two frames it waits for itself, and counts 300 or more lighter
  pixels, not one. Checked, unchanged.

### The cause, test by test: `tests/googly-faces.test.mjs`

Googly Faces runs on the real loop only (no `manual`, no `step()`), and its step per frame is the
frame's time capped at 1/20 s, so its game time runs slower than the wall clock when frames are
slow.

- **`pupilsRestAtBottom` (~68):** read the state up to 80 times, 50 ms apart (4 s of wall clock),
  for a moment when every face on the ground has its pupils down, checking at each read that no
  pupil leaves its eye. Cause: one instant per read, and a wall-clock budget. Now reads it on every
  frame inside the page, checks every frame that no pupil leaves its eye, and passes on the first
  frame where all rest at the bottom, after at least `after` frames; it fails if none comes within
  its time-out, scaled.
- **"the pupils fall to the bottom of the eyes and stay inside them" (~84):** 1500 ms before
  `pupilsRestAtBottom`, so the "inside the eye" check covered that stretch. Now
  `pupilsRestAtBottom(page, { after: 90 })`: the check covers at least 90 frames.
- **"tapping a face plays a sound and makes it react" (~91):** 120 ms after the tap before checking
  that the face reacts, opens its mouth and jumps more than 10 px. On slow frames 120 ms can be one
  frame, before the jump. Now waits until that face is more than 10 px up, then checks the rest. Its
  5 s time-out for the face to duck away is now `waitFor`, 10 s scaled.
- **"mute is respected…" (~125):** 300 ms in Node for the delayed giggle or flourish. Now the
  in-page timer queued after the tap (above).
- **`eyesLookAt` (~144):** six reads 30 ms apart; on slow frames several reads land on the same
  frame. Now reads six consecutive frames inside the page and takes each eye's median, as before.
- **"tapping empty space is answered too…" (~159):** 300 ms after the tap and after the pointer
  move before `eyesLookAt`, and 1200 ms before `pupilsRestAtBottom`. The look holds 2 s of game
  time (`LOOK_HOLD`), which is at least 2 s of wall clock. Now: after the tap, waits until every eye
  looks at the spot (the median over the last six frames), checked on every frame; after the move,
  waits until the page has seen the `pointermove` and then for every eye to look at the pointer; and
  then `pupilsRestAtBottom`, which waits for the hold to end.
- **"the dot a tap fills swells, pushing the others aside, then settles" (~178):** 20 reads 25 ms
  apart for the biggest swell and push, then 1200 ms before checking that the row settled. Now reads
  the pips on every frame inside the page until 60 frames have passed, and then `waitFor` the dot
  back to size and the row closed up.
- **"a round ends after twelve faces…" (~195):** the play-again button awaited with a fixed 5 s
  time-out; it shows 2.4 s of game time after the twelfth tap, and with frames 100 ms apart that is
  about 4.8 s of wall clock (each frame steps at most 50 ms). It failed so in the experiment below.
  Now `waitFor` the button and the `party` state, 20 s scaled: a bound on failure, not the pass. Its
  entrance is awaited as an animation, as before. The round's play is a helper, so the guard test
  plays the same round.
- **"it works offline after one visit straight from a link" (~260):** `cached()` polled the cache
  for 10 s of wall clock inside the page, and the controller wait had a fixed 10 s time-out. Both
  are now scaled.
- **"the game loads with no errors…", "the game's back button…", "the landing tile…":** wait on
  `ready`, on the state or on navigation, with Playwright's scaled default time-out. Checked,
  unchanged.

### The proof

- **The guards slow the frames themselves, not the CPU.** On `main`'s code both files passed with
  `TEST_CPU_THROTTLE=10` (Crumble 24 of 24, Googly Faces 10 of 10, run alone, 2026-11-11): at 10×
  their frames still came faster than the fixed waits. So the guards make every frame slow on
  purpose: an init script whose `requestAnimationFrame` callback stays busy for 100 ms on every
  frame, so frames come at least 100 ms apart however fast the machine is, which is the cause
  itself and doesn't depend on Chromium's throttle (F-41). Run on `main`'s code with that script
  added to every page (2026-11-11), Crumble failed "pull back and let go aims and fires…" (the aim
  read 60 ms after the moves: "capped at full power") and Googly Faces failed "a round ends after
  twelve faces…" (the 5 s play-again time-out); every other test passed. (Claude, 2026-11-11)
- **The guard tests fail on the old code.** Crumble's guard pulls and drags as ~163 does on a page
  with 100 ms frames; Googly Faces' plays a round and taps a face as its round and tap tests do, on a
  page with 100 ms frames. Each goes through the same helpers as the tests it guards. Run with the
  old waits in those helpers, each fails; the PR records both runs. (Claude, 2026-11-11)
- **The slice's two files pass 5 times in parallel and once with `TEST_CPU_THROTTLE=10`, and the
  rest of the suite passes once;** the PR records each run. Per F-41, the throttle run is run alone
  on the machine. (Split, 2026-11-11)

## Acceptance items

- **AC-1** `tests/crumble.test.mjs` and `tests/googly-faces.test.mjs` each have `// clock-checked`
  in their first 10 lines, and neither calls `waitForTimeout(`.
- **AC-2** `tests/crumble.test.mjs` defines no `realFrames` of its own: it imports the one in
  `tests/clock.mjs`.
- **AC-3** In both files, every `waitForFunction` or locator wait that passes its own `timeout`
  scales it by the throttle rate (through `waitFor`, `scaled` or `within` from `tests/clock.mjs`),
  except where its test sets its own throttle on a `throttle: false` context.
- **AC-4** Crumble's drags and pulls (the `touch()` helper's `drag`, and the tests at ~106 and
  ~163) read the game's aim only once the page has seen a `pointermove` at the drag's last
  point.
- **AC-5** A guard test in `tests/crumble.test.mjs`, on a page whose every animation frame takes at
  least 100 ms, pulls and drags as the test at ~163 does and gets the same aim, power, arc and shots.
- **AC-6** A guard test in `tests/googly-faces.test.mjs`, on a page whose every animation frame takes
  at least 100 ms, checks that a tapped face reacts and jumps, and plays a round of twelve faces to
  its play-again button, through the same helpers the other tests use.
- **AC-7** Each guard test fails with the old fixed waits in its helpers in place of the new ones.
  — verified by review: the PR records both guards' runs on the old waits.
- **AC-8** Googly's mute test waits for the game's delayed tap sounds with an in-page timer queued
  after the tap, longer than the longest of them (140 ms).
- **AC-9** With this change, the two files pass 5 times in parallel, and once with
  `TEST_CPU_THROTTLE=10`, and the rest of the slow suite passes once. — verified by review: the PR
  records each run's summary.
- **AC-10** Outside `tests/crumble.test.mjs` and `tests/googly-faces.test.mjs`, the only files that
  change are `specs/slow-tests-crumble-googly.md`, `ROADMAP.md` (R-4's row and section) and
  `FINDINGS.md` (this slice's own rows). No game code changes. — verified by review: the PR's diff.

## Out of scope

- Any other test file, and `tests/clock.mjs`: other slices own them.
- Changing game code, or what `specs/crumble.md` promises.
- Requiring every test file to be marked `// clock-checked`: R-7.

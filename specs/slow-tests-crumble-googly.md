# Slow tests run once: Crumble's and Googly Faces' tests

**Go:** "go" (owner, 2026-11-11, relayed word for word by the parent session, on its summary of R-4 and R-6)

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
has no spec of its own, so its guard tests are this spec's.

No game code changes (the verdict below). No game's spec changes.

## Decisions

### How the tests wait now

- **Input is waited on as events the page has seen.** Chromium delivers touch and mouse moves
  with the next animation frame (rAF-aligned input), so a fixed 60 ms after a drag's moves covers
  that frame only while frames come faster than 60 ms. And whether CDP's `Input.dispatchTouchEvent`
  returns only once the page has handled a `touchstart` or `touchend` isn't something to rest on:
  Crumble's canvas has `touch-action: none` and no touch listeners, so Chromium may acknowledge them
  without the page. So each file's pages get an init script with capture-phase listeners on
  `window` (so no game handler can hide an event, and they survive a reload) that record what the
  page has seen: the count of `pointerdown`s, the count of ends (`pointerup` or `pointercancel`),
  and the last `pointermove`'s point. A test waits (`waitFor`) for the `pointerdown` after a press,
  for the end after a release, and for a `pointermove` within 0.5 px of a drag's last point before
  it reads state mid-drag (only Crumble's pull does). A drag whose moves may be held back or end in
  a `pointercancel` (the short pull inside the touch slop, the drag from a HUD button, whose
  `touch-action: manipulation` allows a pan) waits for its end only. (Claude, 2026-11-11, from the
  spec review)
- **A step the game takes on its next frame is waited on with `realFrames(page, 1)`** from
  `tests/clock.mjs`: a `requestAnimationFrame` the test requests after the game's runs after it in
  the same frame, and a frame's resize steps run before its animation-frame callbacks. (Claude,
  2026-11-11)
- **A check on the real game loop waits on the game's state** with `waitFor` from
  `tests/clock.mjs`, or reads the state on every frame inside the page, instead of a few reads some
  milliseconds apart. A time-out is only a bound on failure; it never decides a pass, so each is
  sized for frames far slower than CI's (the per-test entries say how). Every in-page wait on
  frames, the cache or the service worker goes through `within` or `realFrames`, so none waits
  without a bound. (Claude, 2026-11-11, from the spec review)
- **A wait of the game's own time is counted the way the game counts it.** Googly Faces steps each
  frame by the frame's interval capped at 1/20 s (`googly-faces/game.js` ~986) and exposes no clock.
  A test helper, `gameSeconds(page, s)`, sums the same capped intervals of the page's animation
  frames until they reach `s`, so it waits at least `s` of the game's time on any machine. (Claude,
  2026-11-11, from the spec review)
- **A wait for a game's own `setTimeout` is an in-page timer queued after it.** Googly Faces plays
  a giggle 120 ms, or a flourish 140 ms, after a tap (`googly-faces/game.js` ~389, ~390), queued in
  its `pointerdown` handler. A page runs a timer with a shorter delay queued earlier before one with
  a longer delay queued later. So the mute test waits until the page has seen the tap's
  `pointerdown`, then for an in-page `setTimeout` of 200 ms, not 300 ms in Node. (Claude,
  2026-11-11, from the spec review)
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
  banner, ~1682) decide no test either: no test checks the whoosh or the banner. Crumble's CPU
  plans in 4 ms of `performance.now()` a frame unless `manual` is set (~970); changing that would
  be game code, so the one test that waits on it on the real loop sizes its bound for it (~857
  below). (Claude, 2026-11-11)
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

Line numbers are `main`'s at 3647401.

- **The `touch()` helper's `drag` (~89):** waited 60 ms after the moves and 30 ms after the end.
  Cause: rAF-aligned moves, and an end not known to be handled. Nothing reads state between its
  moves and its end, so it now waits for the end to be seen, and nothing else.
- **"with iPhone insets in landscape, a pull that starts in an edge strip…" (~106):** the same
  60 ms and 30 ms around its pulls; it read `aim.active` between them and never asserted it. Same
  fix as `drag`; the unused read goes.
- **"the shore moves behind the start card…" (~139):** the demo tanks trade shots on the real loop,
  and the first carve (about 3 s of game time in) was awaited with a fixed 15 s time-out. Each
  frame steps at most 50 ms, so 15 s covers frames up to about 250 ms apart, and the demo CPU plans
  in 4 ms a frame too. Now `waitFor`, 30 s scaled. Its tap (`touchStart`, `touchEnd`) waits for the
  end to be seen before reading `store.taught`.
- **"pull back and let go aims and fires…" (~163):** 60 ms after the moves before reading the aim.
  Now a `pull()` helper, also used by the guard: it sends the moves, waits for the `pointermove` at
  the last point, reads the aim, sends the end and waits for it to be seen. Its other drags use
  `drag`; its second-finger sequence waits for both ends.
- **"winning gives stars and the next battlefield…" (~554):** 100 ms before counting the result's
  stars, which `showResult()` sets in a `requestAnimationFrame` (`crumble/game.js` ~1661). Now
  `realFrames(page, 1)`.
- **"the portrait hold and the landscape resume hold with frames coming slowly" (~828):** sets 10×
  itself on a context with `throttle: false`, so the harness's scaling doesn't apply to it, and the
  shared `realFrames`' 10 s default is short for 60 frames at 10×. It passes its own 30 s.
- **"portrait shows the turn card and pauses a battle…" (~857):** after the landscape resume, the
  CPU plans on the real loop in 4 ms a frame and then fires; that was awaited with a fixed 10 s
  time-out. ~828 waits on the same plan with 20 s at 10× and has passed; now `waitFor`, 20 s scaled.
  And 200 ms after the 640×360 resize and `startBattle(1)` before reading the tank positions, which
  `view` holds and the game's `resize` handler sets; Chromium fires `resize` in the next frame. Now:
  wait until `innerWidth` is 640, then `realFrames(page, 1)`.
- **"a hidden page stops a shell in flight; a tap resumes" (~934):** on the real loop. 150 ms for
  the shell to fly, 400 ms to see that it holds, 200 ms to see it move again. Now `waitFor` the shell
  to have moved, `realFrames(page, 30)` to see it hold (as ~857 does), and, after the click,
  `realFrames(page, 5)` before checking it moved.
- **"Crumble plays offline once it has been played…" (~960):** raced the service worker's `ready`
  against a 10 s in-page timer and went on silently if it lost; then took `networkidle` (500 ms
  with no page traffic) to mean the worker had cached the game, but the worker stores files after
  it responds and fetches the `keep` list itself (`sw.js` ~127, ~153), which isn't page traffic.
  Now `within(…, 10000)` for `ready`, and, before going offline, waits (`within`) until the cache
  holds the page, `crumble/game.js` and the four explosion images.
- **"firing, an explosion and a tide rise each play their sound" (~1017):** waited for the 14 sounds
  to decode with a fixed 5 s time-out. Decoding is CPU work; now `waitFor`, 20 s scaled.
- **"the frame holds in CPU time…" (~741):** measures CPU time from a trace with `throttle: false`,
  so neither the throttle nor the wall clock enters it; its frame count is the test's own 300
  frames. Checked, unchanged.
- **The tests driven by `step()`** (~203, ~273, ~310, ~356, ~434, ~465, ~611, ~659, ~698, ~996,
  ~1048, ~1122, ~1146, ~1206): `battle()` sets `manual` in the same `evaluate` as `startBattle`, so
  no real frame runs the battle first; ~465 sets `manual` again after its reload, in the same
  `evaluate` as its battle; every step loop runs inside one `evaluate`, so no frame can interleave;
  the asserts on step counts (~203's 8 s flight, `long.t > 7.5 && long.t < 8.6`) have slack of many
  steps around the float sum. ~1048's resume click waits for its end to be seen. ~1206 reads the
  sky after two frames it waits for itself (now through `within`) and counts 300 or more lighter
  pixels, not one. Checked, otherwise unchanged.

### The cause, test by test: `tests/googly-faces.test.mjs`

Googly Faces runs on the real loop only (no `manual`, no `step()`), and its game time runs slower
than the wall clock when frames come more than 50 ms apart.

- **`pupilsRestAtBottom` (~70):** read the state up to 80 times, 50 ms apart (4 s of wall clock),
  for a moment when every face on the ground has its pupils down, checking at each read that no
  pupil leaves its eye. Cause: one instant per read, and a wall-clock budget. Now reads it on every
  frame inside the page, checks every frame that no pupil leaves its eye, and passes on the first
  frame where all rest at the bottom, after at least `after` seconds of game time
  (`gameSeconds`'s count); bounded by `within`, 20 s scaled.
- **"the pupils fall to the bottom of the eyes and stay inside them" (~84):** 1500 ms before
  `pupilsRestAtBottom`, so the "inside the eye" check covered that stretch. Now
  `pupilsRestAtBottom(page, { after: 1.5 })`: the check covers at least 1.5 s of game time.
- **"tapping a face plays a sound and makes it react" (~92):** 120 ms after the tap before checking
  that the face reacts, opens its mouth and jumps more than 10 px. One frame after the tap already
  lifts it past 10 px (a 50 ms step at its take-off speed of about 350 to 590 px/s), so it fails
  when no frame runs within 120 ms. Now a `tapAndJump()` helper, also used by the guard: it taps,
  waits for the `pointerdown` to be seen, then waits until that face is more than 10 px up. Its
  second tap read the face's position earlier and passed whether it hit the face or not (an empty
  tap plays a sound too and doesn't count): it now reads the position just before the tap and
  checks that a `boing` played, the sound only a face plays. Its 5 s time-out for the face to duck
  away is now `waitFor`, 20 s scaled.
- **"mute is respected…" (~127):** 300 ms in Node for the delayed giggle or flourish. Now the
  in-page timer queued after the page has seen the tap (above).
- **`eyesLookAt` (~145):** six reads 30 ms apart; on slow frames several reads land on the same
  frame. Now `eyesLookAt(page, x, y, what)` waits, on every frame inside the page, until each eye's
  median along the line to the point, over the last six frames, is above 0.25 eye radii; bounded by
  `within`, 10 s scaled, and on time-out fails naming the eye and its median.
- **"tapping empty space is answered too…" (~160):** 300 ms after the tap and after the pointer
  move before `eyesLookAt`, and 1200 ms before `pupilsRestAtBottom`. The look holds 2 s of game
  time (`LOOK_HOLD`), then fades over 0.35 s (`LOOK_FADE`). Now: after the tap, waits for its
  `pointerdown`, then `eyesLookAt` the spot; after the mouse move, waits for the `pointermove` at
  the point, then `eyesLookAt` the pointer; then `gameSeconds(page, 2.35)` from the tap, so the
  look has ended, then `pupilsRestAtBottom`. (Before, the rest check passed during the hold only
  because a pointer level with the face's centre keeps its pupils low.)
- **"the dot a tap fills swells, pushing the others aside, then settles" (~186):** 20 reads 25 ms
  apart for the biggest swell and push, then 1200 ms before checking that the row settled. Now reads
  the pips on every frame inside the page for 0.6 s of game time and keeps the largest; then waits
  until the dot is back to size and the row closed up on 10 frames in a row, bounded by `within`.
- **"a round ends after twelve faces…" (~212):** the play-again button awaited with a fixed 5 s
  time-out; it shows 2.4 s of game time after the twelfth tap, about 4.8 s of wall clock with
  frames 100 ms apart. It failed so in the experiment below. Now a `playRound()` helper, also used
  by the guard, that `waitFor`s the button and the `party` state, 20 s scaled. Its entrance is
  awaited as an animation, as before, now through `within`.
- **"it works offline after one visit straight from a link" (~270):** `cached()` polled the cache
  for 10 s of wall clock inside the page, and the controller wait had a fixed 10 s time-out. Now
  `cached()` polls until found, bounded by `within`, 20 s scaled, and the controller wait is
  `waitFor`, 20 s scaled.
- **"the game loads with no errors…", "the game's back button…", "the landing tile…":** wait on
  `ready`, on the state or on navigation, with Playwright's scaled default time-out. Checked,
  unchanged.

### The proof

- **Changed after the go: AC-7 covers the pull and round guards only.** In the build, the tap
  guard passed with `tapAndJump()`'s old 120 ms wait: a busy frame also holds back the test's read,
  so a frame has always run by the time the read does. The old wait fails only when frames come late
  while the page is idle, which no setup here makes happen on demand. Asked, the owner chose
  Proposal A, "AC-7 covers only the pull and round guards; the tap guard stays as a check that the
  new wait holds at 250 ms frames": "A" (owner, 2026-11-11, relayed word for word by the parent
  session). The tap fix rests on its cause: it waits for the frame that lifts the face.

- **On `main`'s code, the old tests pass under both of the harness's loads** (2026-11-11): both
  files 5 times in parallel on 4 CPUs (34 of 34 each time), and each file alone with
  `TEST_CPU_THROTTLE=10` (Crumble 24 of 24, Googly Faces 10 of 10). At 10×, the frames still came
  faster than the fixed waits. So these runs can't tell old waits from new.
- **The guards slow the frames themselves.** An init script whose `requestAnimationFrame` callback
  stays busy for a set time on every frame makes frames come at least that far apart on any
  machine. That is the cause itself, and doesn't depend on Chromium's throttle (F-41). With 100 ms
  frames on every page of `main`'s code (2026-11-11), Crumble failed "pull back and let go aims and
  fires…" (the aim read 60 ms after the moves: "capped at full power") and Googly Faces failed "a
  round ends after twelve faces…" (the 5 s play-again time-out); every other test passed. Googly's
  tap test passes at 100 ms (one frame within 120 ms is enough), so its guard uses 250 ms frames.
- **The guard tests,** titled with this spec's AC numbers, run on a `throttle: false` context (their
  frames are already slow; the throttle would only lengthen the run): Crumble's pulls with
  `pull()` at 100 ms frames; Googly's taps with `tapAndJump()` at 250 ms frames; Googly's plays a
  round with `playRound()` at 100 ms frames. The pull and round guards fail with their helper's old
  wait (`pull()`'s 60 ms, `playRound()`'s fixed 5 s), and the PR records those runs; the tap guard
  doesn't (changed after the go, below). The
  round guard is the longest: about 12 taps of up to 1.4 s of game time each, at half speed, about
  35 s, well inside the 5-minute file limit. (Claude, 2026-11-11, from the spec review)
- **The whole of both files is also run with 100 ms frames on every page**, by a temporary local
  copy that adds the init script (not committed: `tests/clock.mjs` is out of scope). "the frame
  holds in CPU time…" (~741), which measures CPU time, is left out of that run. The PR records it
  next to the run on `main`'s code. (Claude, 2026-11-11, from the spec review)
- **The slice's two files pass 5 times in parallel and once with `TEST_CPU_THROTTLE=10`, and the
  rest of the suite passes once;** the PR records each run. Per F-41, the throttle run is run alone
  on the machine. (Split, 2026-11-11)
- **Which tests name the items.** A new no-browser test in `tests/crumble.test.mjs` reads both
  files' source for AC-1; the guards carry AC-4, AC-5 and AC-6 in their titles; the mute test's and
  the empty-tap test's titles gain AC-8 and AC-9, after their own words. (Claude, 2026-11-11)
- **`FINDINGS.md`:** F-33 (fixed waits across the suite, citing Crumble's `realFrames`) is updated
  to drop these two files' count and the reference to Crumble's own `realFrames`; anything new this
  slice notices and doesn't fix is added as its own row. (Claude, 2026-11-11)

## Acceptance items

- **AC-1** `tests/crumble.test.mjs` and `tests/googly-faces.test.mjs` each have `// clock-checked`
  in their first 10 lines and call no `waitForTimeout(`, and `tests/crumble.test.mjs` defines no
  `realFrames` of its own but imports the one in `tests/clock.mjs`.
- **AC-2** In both files, every `waitForFunction` or locator wait that passes its own `timeout`
  scales it by the throttle rate (through `waitFor` or `scaled` from `tests/clock.mjs`), except in a
  test that sets its own throttle on a `throttle: false` context; and every in-page wait on frames,
  the cache or the service worker is bounded through `within` or `realFrames`. — verified by
  review: the diff of both files.
- **AC-3** In both files, a test reads state after a touch, tap, click or drag only once the page
  has seen that input: its `pointerdown` after a press, its `pointerup` or `pointercancel` after a
  release, and, for a read mid-drag, a `pointermove` within 0.5 px of the drag's last point. —
  verified by review: the diff of both files.
- **AC-4** A guard test in `tests/crumble.test.mjs`, on a page whose every animation frame takes at
  least 100 ms, pulls with `pull()` as the test at ~163 does and gets the same aim, power, arc and
  shot.
- **AC-5** A guard test in `tests/googly-faces.test.mjs`, on a page whose every animation frame takes
  at least 250 ms, taps a face with `tapAndJump()` and sees it react, open its mouth and jump.
- **AC-6** A guard test in `tests/googly-faces.test.mjs`, on a page whose every animation frame takes
  at least 100 ms, plays a round of twelve faces with `playRound()` to its play-again button and the
  `party` state.
- **AC-7** The pull guard (AC-4) and the round guard (AC-6) each fail with their helper's old fixed
  wait in place of the new one. — verified by review: the PR records both runs.
- **AC-8** Googly's mute test waits for the game's delayed tap sounds with an in-page timer longer
  than the longest of them (140 ms), queued once the page has seen the tap's `pointerdown`.
- **AC-9** Googly's empty-tap test checks that the pupils rest at the bottom only after at least
  2.35 s of game time since the tap (`LOOK_HOLD` plus `LOOK_FADE`), counted by `gameSeconds` from the
  page's frames.
- **AC-10** With this change, the two files pass 5 times in parallel, once with
  `TEST_CPU_THROTTLE=10`, and once with every frame of every page taking at least 100 ms (the frame
  budget test left out), and the rest of the slow suite passes once. — verified by review: the PR
  records each run's summary.
- **AC-11** Outside `tests/crumble.test.mjs` and `tests/googly-faces.test.mjs`, the only files that
  change are `specs/slow-tests-crumble-googly.md`, `ROADMAP.md` (R-4's row and section) and
  `FINDINGS.md` (F-33, and rows this slice adds). No game code changes. — verified by review: the
  PR's diff.

## Out of scope

- Any other test file, and `tests/clock.mjs`: other slices own them.
- Changing game code, or what `specs/crumble.md` promises.
- Requiring every test file to be marked `// clock-checked`: R-7.

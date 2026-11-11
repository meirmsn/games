# Splat Gallery's tests wait on frames and state, not time

**Go:** pending

## Intent

R-3, slice 3 of the seven that make the slow tier run once, with no retries (`ROADMAP.md`). The
owner, 2026-11-10: "we shouldn't be running 3 times. We should only run it once, and we should
understand the source of the flakiness and put the test around that. Or change the code so that it
is easier, reliable to test." The split, 2026-11-11: "Do an adversarial review about the split and
pick whatever makes sense."

This slice is `tests/splat-gallery.test.mjs`: its 21 `waitForTimeout` calls, and the tests that
failed at `TEST_CPU_THROTTLE=10` on the R-1 branch (the touch-pull test, the inset-pull test "with
iPhone insets, portrait and landscape …", the turning test and the pause test). Each test that
waits gets its cause found, and the wait is replaced by a wait on what the test needs: the input
arriving, the game's state, or a count of the page's own frames.

## Decisions

- **Reproduced on `main` (2026-11-11).** Alone at `TEST_CPU_THROTTLE=10` the file passes (41 of
  41). Four copies at once at 10× on 4 CPUs all failed: 5, 3, 3 and 2 failures. The pause test and
  the music test ("the waltz speeds up at 10, 5 and 3 s left …") failed in all four runs, the
  turning test in two, and the inset-pull, states and offline tests in one each. Each failure's
  message is below with its cause. (Claude, 2026-11-11)
- **What a busy runner does to these tests: fewer, longer frames.** Under that load Splat Gallery's
  frames came 50 to 350 ms apart, against 16.7 ms at full speed. Three causes follow from it.
  (Claude, 2026-11-11)
  1. **A pointer move arrives with the page's next frame.** Chromium holds `pointermove` (touch and
     mouse) until the next frame and delivers the newest one then. A 30 or 50 ms wait after the
     last move can be shorter than one frame. In 10 tries at 10× under that load, the last touch
     move hadn't reached the page after 50 ms once; at full speed it always had.
  2. **The game's clock runs on frames.** The frame loop (`splat-gallery/game.js` ~2426) takes at
     most 0.05 s of game time a frame, so the 1 s count-in after a resume needs at least 20 frames,
     whatever the wall clock says. It took 1.03 s at full speed and 7.8 s at 10× under that load.
     The intro, the booth's movers and the count-in all advance only as frames run.
  3. **The time between two test steps has no bound.** With four browsers and four test processes
     on four CPUs, many frames can run between a click and the test's next read.
- **The cause, per test** (titles shortened; lines are `main`'s):
  - *"the booth moves behind the start card; Start begins round 1 …"*: `waitForTimeout(1000)`
    (~111) then expects a target to have moved 10 units, but with fewer frames a second holds less
    game time (cause 2). After Start it reads the run's time and hopper (~115), which frames
    between the click and the read can change (cause 3). Now: it waits until a target has moved
    more than 10 units, and reads the run's state in a listener on the Start button that runs right
    after the game's own.
  - *"on touch, a pull from the counter stretches the slingshot …"* (~185), *"with iPhone insets,
    portrait and landscape, a touch starting in the bottom or left strip …"* (~244, ~259), *"the
    mouse pulls and releases the slingshot …"* (~286) and *"the slingshot answers only while the
    clock runs …"* (~1570, ~1588, ~1608): each waits 30 or 50 ms after the last move, then reads
    the pull (cause 1). Seen: "390x844: the pull is the full far pull ({"active":true,"py":125.99…})",
    where 140 was due. The touch-pull test also reads "no pull" right after a move from the lanes
    (~202), with no wait at all. Now: each waits until the page has received the last move sent. A
    capture-phase `pointermove` listener on `window`, added by the test's init script, only records
    the move's position; it runs before the canvas's own listener, so the check is made later, by
    `waitFor`'s poll on a frame or a later `evaluate`, once that dispatch has ended and the game has
    handled the move. A move matches within 0.5 px (Chromium carries touch points as floats, so a
    fractional point may not come back exactly), and the record is cleared before each gesture, so
    a move from an earlier gesture to the same point can't satisfy the wait. For the checks that
    expect no pull, this is what makes them mean something: before, a move still on its way also
    read as "no pull".
  - *"the layout follows the screen; turning mid-run freezes play …"* (~619 to ~643): seven fixed
    waits around `resize`, the game's 400 ms turn debounce and the count-in. Seen: "play goes on"
    false (cause 2: 1300 ms is shorter than 20 frames under load). Now: it waits for each state in
    turn (laid out for portrait, in play, under the veil, the veil gone, play going on). It checks
    "frozen under the veil" across 20 of the page's frames, not 400 ms, and reads "veil hidden,
    count-in running" in the frame the veil goes.
  - *"hiding the page pauses a round …"* (~667 to ~679): fixed waits for play, for "nothing moves
    while paused", and 500 + 800 ms across the count-in. Seen: "and then it goes on" false (cause 2).
    It also checks the pause card is hidden right after `tap()` (~675), but the click a tap makes
    can arrive after `tap()` returns. Now: it waits until play, checks "nothing moves while
    paused" across 20 frames, and waits until the pause card is hidden after the tap. From the tap
    until play goes on it records, on every frame, the game time, the count-in and whether the game
    is paused; a frame "in the count-in" is one not paused with the count-in above 0. The time must
    not move on any such frame, and must move on a frame after the last of them. That checks the
    promise on every frame, where the old test sampled two instants. The recorder stops itself once
    the time moves, or after 600 frames, and the wait for it is bounded in Node. It doesn't check
    that the count-in never rises: `resume()` resets the frame clock to `performance.now()`, which
    can be later than the next frame's time stamp, so that frame's step can be below 0 (the
    coordinator's finding below).
  - *"each state shows only its own card, banner and HUD"*: `manual` is set after Start is clicked
    (~739), so real frames run the intro in between; the veil part waits 300 + 600 ms (~791, ~793).
    Seen: the veil not yet shown and the "Round 1" banner still up after 600 ms (the 400 ms debounce
    starts only once the `resize` event arrives, with a frame). Now: `manual` is on before the
    click, and the veil part waits until the veil shows.
  - *"the gallery plays offline once it has been played"*: seen: "'play' !== 'intro'", read right
    after the click (~866): the intro had ended in between (cause 3). Also, its service-worker wait
    (~858) races a 10 s in-page timer and carries on silently if the worker isn't ready, so it fails
    later for another reason. Now: it reads the mode in the Start button's listener as above, and
    the worker wait goes through `within()` and fails naming the worker.
  - *"the waltz speeds up at 10, 5 and 3 s left …"*: its last part waits a fixed 600 ms inside the
    page (`setTimeout(res, 600)`, ~1662) for a new loop to start at its set rate. A loop starts only
    once its file is fetched and decoded, checked every 250 ms (`shared/sound.js` ~114). Seen: "a
    loop set faster starts at that rate: 1.427…,1.214…": only the waltz's earlier rates were
    recorded, and the new loop hadn't started (cause 3). Its first part has the same race: `ready()`
    starts the waltz, which gets a source only once `music.mp3` is decoded, and `__gallery` is set
    once the images are decoded, not the sounds, so the waltz's source can still be missing when the
    test reads its rate (~1624). The sounds test ("a shot, a splat, a hit … have their sounds")
    reads `__played` the same way (~849): `play()` plays nothing before its file is decoded. Now:
    `open()`, with the fake audio, waits until every sound file the game names (counted from
    `splat-gallery/game.js`) is decoded, failing with a message naming it. The music test notes how
    many sources exist before its own `loop()`, and waits until a looping source made after that
    starts at 1.3, so neither the waltz's own 1.3 nor an earlier source can satisfy it; the wait is
    bounded with `within()`. It reads "a playing loop changes speed" on that same source.
  - The other tests were read and need no change. They set `manual` (through `ready()` or at the top
    of one `evaluate`) and step the game themselves, or they read layout that `open()` has already
    done. The tests that read what `draw()` drew, or a canvas pixel, first wait two of the page's
    frames inside the page. `draw()` reads no clock, only the game's state, which `manual` holds
    still, so one pixel is the same on every run. The step loops use fixed counts or
    `t < s - 1e-9`, so they run the same steps on every machine. (Claude, 2026-11-11)
- **The 400 ms `setTimeout(checkTurn)` stays; test-only fixes.** The owner delegated the
  game-code OKs to an adversarial review: "You should do an adversarial review to get the answer to
  your questions." (owner, 2026-11-11). Its verdict, relayed by the coordinator session on
  2026-11-11, stands as the owner's decision:
  > `setTimeout(checkTurn, 400)` (splat-gallery/game.js:2358): NOT APPROVED, test-only. Its 400 ms
  > is the spec's "held for 0.4 s" (specs/splat-gallery.md:377), so it's real time by design. The
  > flakes are the test's fixed waits in tests/splat-gallery.test.mjs: 619, 627, 635, 643 and 793:
  > `waitFor` the turned-screen state. 624 and 638: wait until `game.T` passes the value needed.
  > 631: `realFrames(page, 20)`, then check `T` is unchanged. If the 0.4 s hold itself needs a
  > test, use one test with `page.clock` […]. Never use it file-wide: it fakes rAF, so `realFrames`
  > hangs while it's paused.

  The fixes above follow it. Where it says "wait until `game.T` passes the value needed" (624, 638),
  624 departs from its words: it waits until the round is in play, which is what its 1400 ms was
  for (the intro is 1.2 s of game time, `splat-gallery/game.js` ~1340), not for a value of `T`. 638
  waits until `T` passes `t0`, as it says. No test of the 0.4 s hold itself is added: no test asks for one. (Claude, 2026-11-11)
- **The frame step's missing lower bound is the coordinator's finding, not this slice's fix.** The
  verdict also noted that `Math.min(0.05, (now - last) / 1000)` (~2427) has no lower bound, the same
  cause as Reef's F-8, and logs it as a finding: "fix it only if one of your tests proves it does
  harm, and then it needs an OK." No test here shows harm from it. (Coordinator, 2026-11-11)
- **The guard reproduces fewer frames, not a slower CPU, as R-2's does.** Alone at 10× the file
  passes; it fails only when other work shares the machine (F-41). So the guard makes every
  animation frame of the page take at least 150 ms (about 6 frames a second). An init script
  registers its own animation-frame callback before any page script runs, and re-registers it
  first thing each frame, so it stays first; it spins until 150 ms have passed, once a frame, not
  once a callback. A busy main thread also delays the page's timers and input. The guard sets no
  `manual` of its own; each check does what its test does. The guard runs the checks of the tests
  whose cause is frames: each test's body is a function that the test and the guard both call, so
  the guard can't drift from what it guards. Rejected: a higher CPU throttle, which slows frames
  only by chance. (Claude, 2026-11-11)
- **What the guard reproduces on `main` (tried 2026-11-11, with `main`'s file and the spin added).**
  On 150 ms frames, `main` fails the touch-pull, inset-pull, turning, pause and music checks. It
  passes the start-card, mouse-pull, states, time-up and offline checks: their waits are long
  enough at 6 frames a second, or their flake was cause 3, which spinning frames doesn't
  reproduce. So the guard proves the fix for those five, and covers the other frame-caused checks
  only as a run on a starved page. The offline test's fix (reading in the click listener) isn't a
  wait, so it is checked by review. (Claude, 2026-11-11)
- **The helpers stay in the test file.** `tests/clock.mjs` is shared by the slices running in
  parallel, so this slice adds nothing to it. (Claude, 2026-11-11)

## Acceptance items

- **AC-1** `tests/splat-gallery.test.mjs` is marked `// clock-checked`, and every `waitForTimeout(`
  left in it carries `// safe: <reason>`.
- **AC-2** In the touch-pull, inset-pull, mouse-pull and time-up tests, every read of the slingshot
  after a pointer move comes after the page has received the last move sent (within 0.5 px, and
  not a move from an earlier gesture). A move that doesn't arrive fails the test within its
  time-out, naming the move.
- **AC-3** The turning test waits for each state it checks (laid out for portrait, in play, the
  veil shown, the veil gone, play going on), each failing within its time-out with a message naming
  it. "Frozen under the veil" holds across 20 of the page's frames, and the veil is hidden with the
  count-in running in the frame the veil goes.
- **AC-4** The pause test waits until play before it hides the page, checks "nothing moves while
  paused" across 20 of the page's frames, and waits until the pause card is hidden after the
  resuming tap. From the tap until play goes on, it records the game time on each frame: the time
  doesn't move on any frame that isn't paused and has the count-in above 0, there is at least one
  such frame, and the time moves on a frame after the last of them. The recording stops on its
  own, and a time that never moves fails the test within its time-out.
- **AC-5** The start-card test waits until a target has moved more than 10 units, failing within its
  time-out if none does. It and the offline test read the run's state after Start in a listener on
  the Start button that runs right after the game's own.
- **AC-6** The states test turns `manual` on before it clicks Start, and its veil check waits until
  the veil shows.
- **AC-7** The offline test's wait for the service worker fails, naming it, when the worker isn't
  ready within its time-out.
- **AC-8** With the fake audio, `open()` waits until every sound file the game names is decoded,
  failing with a message naming it within its time-out. The music test waits until the loop it
  made and set faster has started at that rate, matched to a source made after its own `loop()`
  call, failing with a message naming it within its time-out; it waits no fixed time in the page.
- **AC-9** A guard test runs the checks of the start-card, touch-pull, inset-pull, mouse-pull,
  turning, pause, states, time-up and music tests on a page whose every animation frame takes at
  least 150 ms, and passes. On that page, `main`'s touch-pull, inset-pull, turning, pause and music
  checks fail. — verified by review: the PR shows `main`'s checks run on that page.
- **AC-10** `tests/splat-gallery.test.mjs` passes 5 times in parallel, and once with
  `TEST_CPU_THROTTLE=10`, and the rest of the slow suite passes once. — verified by review: the PR
  shows the runs' summaries.
- **AC-11** No game code changes: outside `tests/splat-gallery.test.mjs`, the change touches only
  this spec, `ROADMAP.md` (R-3's row and section) and `FINDINGS.md` (rows this slice adds). —
  verified by review: the PR's diff.

## Out of scope

- Changing `splat-gallery/game.js`, including its 400 ms turn debounce and its frame step.
- A test of the 0.4 s turn hold itself.
- Changing what `specs/splat-gallery.md` or `specs/edge-gestures.md` promises.
- Other games' tests, `shared/sound.js`, `tests/clock.mjs`, `tests/fake-audio.mjs` and
  `tests/insets.mjs`.
- The tests that start a run from the Start button with the game's own random seed
  (`startRun()` seeds from `Date.now()`); none asserts anything a seed changes.

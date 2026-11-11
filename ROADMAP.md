# Roadmap

What the owner decided will happen, in their words. The table's order is the priority: the top
`Open` entry is next. What Claude noticed but nobody decided is in `FINDINGS.md`.

| ID  | Added      | What                                                                        | Status                               |
| --- | ---------- | --------------------------------------------------------------------------- | ------------------------------------ |
| R-1 | 2026-11-11 | Slow tests run once: the harness (hang timeout, serve fixes, clock helpers) | Done (`specs/slow-tests-harness.md`) |
| R-2 | 2026-11-11 | Slow tests run once: Walk on Red's tests wait on frames and state, not time | Open                                 |
| R-3 | 2026-11-11 | Slow tests run once: Splat Gallery's tests wait on frames and state         | Done                                 |
| R-4 | 2026-11-11 | Slow tests run once: Crumble's and Googly Faces' tests                      | Done (`slow-tests-crumble-googly`)   |
| R-5 | 2026-11-11 | Slow tests run once: the PWA-update and landing-page tests                  | Done                                 |
| R-6 | 2026-11-11 | Slow tests run once: Orbit's, Reef's and Runes' tests                       | Done (`specs/slow-tests-orbit-reef-runes.md`) |
| R-7 | 2026-11-11 | Slow tests run once: Pixel Leap's tests, and the whole suite's proof        | Open                                 |

R-1 merges before R-2 to R-6 start; R-2 to R-6 run in parallel, each in its own session; R-7 is
last.

## R-2: Slow tests run once: Walk on Red's tests

The whole, asked 2026-11-10, in chat (after the go on `specs/ci-flakes.md`):

```text
we shouldn't be running 3 times. We should only run it once, and we should understand the source of the flakiness and put the test around that. Or change the code so that it is easier, reliable to test.
```

The split, which the owner delegated on 2026-11-11, in chat:

```text
Do an adversarial review about the split and pick whatever makes sense.
```

Slice 2 of 7, after R-1, in parallel with R-3, R-4, R-5 and R-6; R-7 follows.

### Claude's notes

Its spec: `specs/slow-tests-walk-on-red.md`, numbered from AC-1.

`tests/walk-on-red.test.mjs`: 21 `waitForTimeout` calls; `manual` is set late in `startEmpty`; game
timers at `walk-on-red/game.js` ~482 and ~987 (a game-code change needs the owner's OK).

## R-3: Slow tests run once: Splat Gallery's tests

The whole, asked 2026-11-10, in chat (after the go on `specs/ci-flakes.md`):

```text
we shouldn't be running 3 times. We should only run it once, and we should understand the source of the flakiness and put the test around that. Or change the code so that it is easier, reliable to test.
```

The split, which the owner delegated on 2026-11-11, in chat:

```text
Do an adversarial review about the split and pick whatever makes sense.
```

Slice 3 of 7, after R-1, in parallel with R-2, R-4, R-5 and R-6; R-7 follows.

### Claude's notes

Its spec: `specs/slow-tests-splat-gallery.md`, numbered from AC-1.

`tests/splat-gallery.test.mjs`: 21 waits; the 400 ms `setTimeout(checkTurn)` at
`splat-gallery/game.js` ~2358 (a game-code change needs the owner's OK).

Done 2026-11-11: every wait now waits on the input, the game's state or frames, and the file is
marked `// clock-checked`; no game code changed (the review kept the 400 ms turn hold, test-only).
The causes per test are in the spec's Decisions.

## R-4: Slow tests run once: Crumble's and Googly Faces' tests

The whole, asked 2026-11-10, in chat (after the go on `specs/ci-flakes.md`):

```text
we shouldn't be running 3 times. We should only run it once, and we should understand the source of the flakiness and put the test around that. Or change the code so that it is easier, reliable to test.
```

The split, which the owner delegated on 2026-11-11, in chat:

```text
Do an adversarial review about the split and pick whatever makes sense.
```

Slice 4 of 7, after R-1, in parallel with R-2, R-3, R-5 and R-6; R-7 follows.

### Claude's notes

Its spec: `specs/slow-tests-crumble-googly.md`, numbered from AC-1.

20 waits across both files; Googly's `setTimeout`s at `googly-faces/game.js` ~389, 390, 688 and
698 (a game-code change needs the owner's OK); tight `waitForFunction` timeouts at
`tests/crumble.test.mjs` ~147 and ~1018, and `tests/googly-faces.test.mjs` ~122.

## R-5: Slow tests run once: the PWA-update and landing-page tests

The whole, asked 2026-11-10, in chat (after the go on `specs/ci-flakes.md`):

```text
we shouldn't be running 3 times. We should only run it once, and we should understand the source of the flakiness and put the test around that. Or change the code so that it is easier, reliable to test.
```

The split, which the owner delegated on 2026-11-11, in chat:

```text
Do an adversarial review about the split and pick whatever makes sense.
```

Slice 5 of 7, after R-1, in parallel with R-2, R-3, R-4 and R-6; R-7 follows.

### Claude's notes

Its spec: `specs/slow-tests-pwa-site.md`, numbered from AC-1.

`tests/pwa-updates.test.mjs` and `tests/site.test.mjs`: 12 waits. The "nothing happened" waits
either wait for the version check's response or keep a `// safe: negative bound` comment.

Done (`specs/slow-tests-pwa-site.md`): F-34's cause was a failed pwa-updates test leaving its
server listening, so the file never exited; each test's site now closes when the test ends. Both
files are `// clock-checked`.

## R-6: Slow tests run once: Orbit's, Reef's and Runes' tests

The whole, asked 2026-11-10, in chat (after the go on `specs/ci-flakes.md`):

```text
we shouldn't be running 3 times. We should only run it once, and we should understand the source of the flakiness and put the test around that. Or change the code so that it is easier, reliable to test.
```

The split, which the owner delegated on 2026-11-11, in chat:

```text
Do an adversarial review about the split and pick whatever makes sense.
```

Slice 6 of 7, after R-1, in parallel with R-2, R-3, R-4 and R-5; R-7 follows.

### Claude's notes

Its spec: `specs/slow-tests-orbit-reef-runes.md`, numbered from AC-1.

Reef's F-37 and F-8 (game-code changes need the owner's OK); Runes AC-15's ghost runs on
`performance.now()` (likewise), and runes AC-1 compares two screenshots 300 ms apart.

Done: each test's cause is in the spec's Decisions. F-8 is fixed in Reef's frame loop (approved); F-37
is kept (not approved); Runes' ghost is fixed in its test only.

## R-7: Slow tests run once: Pixel Leap's tests, and the whole suite's proof

The whole, asked 2026-11-10, in chat (after the go on `specs/ci-flakes.md`):

```text
we shouldn't be running 3 times. We should only run it once, and we should understand the source of the flakiness and put the test around that. Or change the code so that it is easier, reliable to test.
```

The split, which the owner delegated on 2026-11-11, in chat:

```text
Do an adversarial review about the split and pick whatever makes sense.
```

Slice 7 of 7, last: after R-1 to R-6 and Pixel Leap's AC-40 fix (meirmsn/games#36, merged).

### Claude's notes

Its spec: `specs/slow-tests-pixel-leap.md`, numbered from AC-1.

`pixel-leap AC-22` moves to CPU time from a trace (F-32), checked to hold up under throttle; the
single-pixel read at `tests/pixel-leap.test.mjs` ~951; 4 waits. This slice, or whichever merges
last, carries the whole-suite proof (five `scripts/check-slow.sh` runs started together, plus one
at 10× CPU throttle, with zero failures) and closes F-33.

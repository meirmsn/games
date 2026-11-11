# Roadmap

What the owner decided will happen, in their words. The table's order is the priority: the top
`Open` entry is next. What Claude noticed but nobody decided is in `FINDINGS.md`.

| ID  | Added      | What                                                                        | Status                               |
| --- | ---------- | --------------------------------------------------------------------------- | ------------------------------------ |
| R-1 | 2026-11-11 | Slow tests run once: the harness (hang timeout, serve fixes, clock helpers) | Done (`specs/slow-tests-harness.md`) |
| R-2 | 2026-11-11 | Slow tests run once: Walk on Red's tests wait on frames and state, not time | Done                                 |
| R-3 | 2026-11-11 | Slow tests run once: Splat Gallery's tests wait on frames and state         | Done                                 |
| R-4 | 2026-11-11 | Slow tests run once: Crumble's and Googly Faces' tests                      | Done (`slow-tests-crumble-googly`)   |
| R-5 | 2026-11-11 | Slow tests run once: the PWA-update and landing-page tests                  | Done                                 |
| R-6 | 2026-11-11 | Slow tests run once: Orbit's, Reef's and Runes' tests                       | Done (`specs/slow-tests-orbit-reef-runes.md`) |
| R-7 | 2026-11-11 | Slow tests run once: Pixel Leap's tests, and the whole suite's proof        | Done (`specs/slow-tests-pixel-leap.md`) |
| R-8 | 2026-11-11 | Tests check what a player sees, and a red slow run is explained, not re-run | Open |
| R-9 | 2026-11-11 | Splat Gallery's main spec describes the count board and the tiny target | Open |

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

Done 2026-11-11: every fixed wait now waits on the input being handled, the game's state or frames,
and the file is marked `// clock-checked`; no game code changed (the review kept both timers,
test-only). `manual` wasn't set late after all. The causes per test are in the spec's Decisions.

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

Done 2026-11-11: every wait now waits on frames, the game's state or a signal, and the file is
marked `// clock-checked`; the frame budget is CPU time from a trace, under the throttle, its budget
scaled by the rate (the owner's adversarial review). Guards that hold frames back while the page is
idle, or stall frames without CPU, fail the old waits. No game code changed. An unmarked test file
that calls `waitForTimeout` now fails the fast tier. The whole suite's proof is in the PR; F-33 is
closed. The causes per test are in the spec's Decisions.

## R-8: Tests check what a player sees, and a red slow run is explained, not re-run

Asked 2026-11-11, in chat, after R-7's whole-suite proof:

```text
I wonder if we need to have those tests so specific and so reliable. And if yes, if we're missing the bigger picture on what actually is a good test. Or are we testing the 1 in 10 million type of thing?
```

Then, on the adversarial review's answer and Claude's recommendation:

```text
Let's not do the nightly stress. The rest go with your recommendation.
```

### Claude's notes

The recommendation, from the review recorded in `specs/slow-tests-pixel-leap.md`, without the
nightly stress run:

- One CI run of the slow tier, no retries (as since `specs/ci-flakes.md`).
- A red slow run on `main` gets a `FINDINGS.md` row with its cause before anyone re-runs it.
- One guard test per kind of wait (frames held back, frames stalled, a request held), not one per
  fixed test; trim the per-test guards the seven slices added.
- Tests check each game's promises, what a player sees, rather than tuning numbers (Googly Faces'
  1.8× dot swell, its 0.05 eye-radii pupil move); start with a short `specs/googly-faces.md`, since
  Googly Faces has none.

## R-9: Splat Gallery's main spec describes the count board and the tiny target

Asked 2026-11-11, in chat, when the reviewer wouldn't review a PR touching two spec files
(`specs/splat-gallery-goal-and-tiny-target.md` and `specs/splat-gallery.md`):

```text
Main spec in a follow-up (Recommended)
```

The option it picked read: "Take the specs/splat-gallery.md edits out of this PR and drop AC-12 from
it; right after this merges, a small docs-only PR brings the game's main spec up to date."

### Claude's notes

The edits are those taken out of the count-board PR: a decisions section on the count board and the
gauge's removal, the tiny target under the rounds table and in scoring, the banner's goal line, and
its AC-22's 44 px far-target floor exempting the tiny target (at least 30 px); and since then the banner's tip line and no "+N" (the owner's change of 2026-11-11 in that spec). The test AC-12 had
(`splat-gallery-goal-and-tiny-target AC-12`) comes back with them.

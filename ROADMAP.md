# Roadmap

What the owner decided will happen, in their words. The table's order is the priority: the top
`Open` entry is next. What Claude noticed but nobody decided is in `FINDINGS.md`.

| ID  | Added      | What                                                                        | Status |
| --- | ---------- | --------------------------------------------------------------------------- | ------ |
| R-1 | 2026-11-11 | Slow tests run once: the harness (hang timeout, serve fixes, clock helpers) | Open   |
| R-2 | 2026-11-11 | Slow tests run once: Walk on Red's tests wait on frames and state, not time | Open   |
| R-3 | 2026-11-11 | Slow tests run once: Splat Gallery's tests wait on frames and state         | Open   |
| R-4 | 2026-11-11 | Slow tests run once: Crumble's and Googly Faces' tests                      | Open   |
| R-5 | 2026-11-11 | Slow tests run once: the PWA-update and landing-page tests                  | Open   |
| R-6 | 2026-11-11 | Slow tests run once: Orbit's, Reef's and Runes' tests                       | Open   |
| R-7 | 2026-11-11 | Slow tests run once: Pixel Leap's tests, and the whole suite's proof        | Open   |

R-1 merges before R-2 to R-6 start; R-2 to R-6 run in parallel, each in its own session; R-7 is
last.

## R-1: Slow tests run once: the harness

The whole, asked 2026-11-10, in chat (after the go on `specs/ci-flakes.md`):

```text
we shouldn't be running 3 times. We should only run it once, and we should understand the source of the flakiness and put the test around that. Or change the code so that it is easier, reliable to test.
```

The split, approved 2026-11-11, in chat:

```text
Do an adversarial review about the split and pick whatever makes sense.
```

Slice 1 of 7. The others: R-2, R-3, R-4, R-5, R-6 (in parallel, after this one merges), then R-7.

### Claude's notes

The split is the one the adversarial review produced. This slice is the harness, on its own:

- F-34 first, since one hang voids every proof: a per-file `--test-timeout` in
  `scripts/check-slow.sh` (Node 22), and pwa-updates' hang sources (`page.evaluate` on `caches` and
  service-worker promises with no timeout; `server.close()` not dropping keep-alive sockets).
- F-38 and F-39 in `tests/serve.mjs` and `tests/serve.test.mjs`.
- `tests/clock.mjs`: `realFrames`, a wait-until-state helper, and a `newContext()` wrapper that
  throttles every page's CPU when an env var is set (the pattern of `ci-flakes AC-5` in
  `tests/crumble.test.mjs`); a one-line `open()` change in every test file.
- A fast check driven by a per-file `// clock-checked` marker: in a marked file, every
  `waitForTimeout` needs a one-line `// safe: …` comment.
- Each later slice gets its own spec (`specs/slow-tests-<slice>.md`, numbered from AC-1), in
  place of the split's reserved section and AC range in `specs/ci-flakes.md`: `spec-check.py` allows
  no gaps or sub-headings in a spec's items and one Go line, so parallel slices would collide there
  (`specs/slow-tests-harness.md` says why; for the owner to confirm). Googly Faces' guard tests go
  in R-4's spec and the landing page's in R-5's.
- Proof: a hanging file gets killed, and a throttled guard fails on the old code.

Each later slice records the cause per test in its spec, not just which calls changed, proves its
guard test fails on the old code, passes its files 5× in parallel and once at 10× CPU throttle,
and passes the rest of the suite once. Cause patterns to look for, per test: fixed
`waitForTimeout` waits; `manual` set after real frames ran; frame-loop state read before a frame
ran; one pixel or one instant sampled; wall-clock timing asserts (F-32); float boundaries in step
arithmetic; real-time `setTimeout`s in game code that `manual` doesn't stop (F-37).

## R-2: Slow tests run once: Walk on Red's tests

The whole, asked 2026-11-10, in chat (after the go on `specs/ci-flakes.md`):

```text
we shouldn't be running 3 times. We should only run it once, and we should understand the source of the flakiness and put the test around that. Or change the code so that it is easier, reliable to test.
```

The split, approved 2026-11-11, in chat:

```text
Do an adversarial review about the split and pick whatever makes sense.
```

Slice 2(a) of 7, after R-1, in parallel with R-3, R-4, R-5 and R-6; R-7 follows.

### Claude's notes

`tests/walk-on-red.test.mjs`: 21 `waitForTimeout` calls; `manual` is set late in `startEmpty`; game
timers at `walk-on-red/game.js` ~482 and ~987 (a game-code change needs the owner's OK).

## R-3: Slow tests run once: Splat Gallery's tests

The whole, asked 2026-11-10, in chat (after the go on `specs/ci-flakes.md`):

```text
we shouldn't be running 3 times. We should only run it once, and we should understand the source of the flakiness and put the test around that. Or change the code so that it is easier, reliable to test.
```

The split, approved 2026-11-11, in chat:

```text
Do an adversarial review about the split and pick whatever makes sense.
```

Slice 2(b) of 7, after R-1, in parallel with R-2, R-4, R-5 and R-6; R-7 follows.

### Claude's notes

`tests/splat-gallery.test.mjs`: 21 waits; the 400 ms `setTimeout(checkTurn)` at
`splat-gallery/game.js` ~2358 (a game-code change needs the owner's OK).

## R-4: Slow tests run once: Crumble's and Googly Faces' tests

The whole, asked 2026-11-10, in chat (after the go on `specs/ci-flakes.md`):

```text
we shouldn't be running 3 times. We should only run it once, and we should understand the source of the flakiness and put the test around that. Or change the code so that it is easier, reliable to test.
```

The split, approved 2026-11-11, in chat:

```text
Do an adversarial review about the split and pick whatever makes sense.
```

Slice 2(c) of 7, after R-1, in parallel with R-2, R-3, R-5 and R-6; R-7 follows.

### Claude's notes

20 waits across both files; Googly's `setTimeout`s at `googly-faces/game.js` ~389, 390, 688 and
698 (a game-code change needs the owner's OK); tight `waitForFunction` timeouts at
`tests/crumble.test.mjs` ~147 and ~1018, and `tests/googly-faces.test.mjs` ~122.

## R-5: Slow tests run once: the PWA-update and landing-page tests

The whole, asked 2026-11-10, in chat (after the go on `specs/ci-flakes.md`):

```text
we shouldn't be running 3 times. We should only run it once, and we should understand the source of the flakiness and put the test around that. Or change the code so that it is easier, reliable to test.
```

The split, approved 2026-11-11, in chat:

```text
Do an adversarial review about the split and pick whatever makes sense.
```

Slice 2(d) of 7, after R-1, in parallel with R-2, R-3, R-4 and R-6; R-7 follows.

### Claude's notes

`tests/pwa-updates.test.mjs` and `tests/site.test.mjs`: 12 waits. The "nothing happened" waits
either wait for the version check's response or keep a `// safe: negative bound` comment.

## R-6: Slow tests run once: Orbit's, Reef's and Runes' tests

The whole, asked 2026-11-10, in chat (after the go on `specs/ci-flakes.md`):

```text
we shouldn't be running 3 times. We should only run it once, and we should understand the source of the flakiness and put the test around that. Or change the code so that it is easier, reliable to test.
```

The split, approved 2026-11-11, in chat:

```text
Do an adversarial review about the split and pick whatever makes sense.
```

Slice 2(e) of 7, after R-1, in parallel with R-2, R-3, R-4 and R-5; R-7 follows.

### Claude's notes

Reef's F-37 and F-8 (game-code changes need the owner's OK); Runes AC-15's ghost runs on
`performance.now()` (likewise), and runes AC-1 compares two screenshots 300 ms apart.

## R-7: Slow tests run once: Pixel Leap's tests, and the whole suite's proof

The whole, asked 2026-11-10, in chat (after the go on `specs/ci-flakes.md`):

```text
we shouldn't be running 3 times. We should only run it once, and we should understand the source of the flakiness and put the test around that. Or change the code so that it is easier, reliable to test.
```

The split, approved 2026-11-11, in chat:

```text
Do an adversarial review about the split and pick whatever makes sense.
```

Slice 3 of 7, last: after R-1 to R-6 and Pixel Leap's AC-40 fix (meirmsn/games#36, merged).

### Claude's notes

`pixel-leap AC-22` moves to CPU time from a trace (F-32), checked to hold up under throttle; the
single-pixel read at `tests/pixel-leap.test.mjs` ~951; 4 waits. This slice, or whichever merges
last, carries the whole-suite proof (five `scripts/check-slow.sh` runs started together, plus one
at 10× CPU throttle, with zero failures) and closes F-33.

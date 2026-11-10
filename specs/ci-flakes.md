# The slow tests stop colliding on ports and stop waiting on the clock

**Go:** "go, option A, and install gitleaks" (owner, 2026-11-10)

## Intent

Two flaky tests in CI's `slow` tier keep failing runs on `main`. A deploy needs `fast` and `slow`
green, so each flake blocks one. The queue manager proposed fixing both in one small PR, and relayed
that the owner said "yes to both" in chat on 2026-11-10.

1. **The test-port race.** Seven browser test files (`tests/orbit`, `pixel-leap`, `runes`,
   `splat-gallery`, `walk-on-red`, `crumble` and `reef`) serve the site on a random port: `9300` for
   all except Reef (`9100`), plus `random(100)`. `site`, `safe-zone` and `googly-faces` do the same
   in their own ranges. `node --test` runs the files in parallel, so two of them can draw the same
   port. One server then fails to bind, and that file talks to the other file's server, which is
   gone once that file finishes. The result is `net::ERR_CONNECTION_REFUSED` or `open()` timeouts in
   an unrelated file. It failed main's run for meirmsn/games#27 (run 42849503212) and several PR
   runs.
2. **Crumble's frame-timing test.** Crumble's frame-timing test (item 12 of `specs/crumble.md`) failed main's run for meirmsn/games#28 (run
   42862006439) with "p95 carve + settle 4.00 ms". That is a hard millisecond limit on a shared CI
   runner.

## Decisions

- Each browser test file serves the site from one shared helper, `tests/serve.mjs`. The helper binds
  port 0 and reads back the port the OS gave it, so two servers can't collide. Rejected: separate
  fixed ranges per file. They still collide with other processes, and every new file has to pick a
  range. (Queue manager's proposal, 2026-11-10)
- The helper still runs `python3 -m http.server` from the repo root, as every file does today, but
  passes port `0` and reads the bound port from the line the server prints ("Serving HTTP on
  127.0.0.1 port N"). Python's responses (content types, the `/dir` → `/dir/` redirect, caching
  headers, no Range support) stay exactly as they are. Rejected: a Node static server, which would
  change those responses. Each file builds its base URL once `before()` has the port.
- `tests/pwa-updates.test.mjs` keeps its own server: it already listens on port 0 and serves a temp
  folder.
- No test is retried. Each flaky test is fixed at its cause, so the suite runs once. (Owner,
  2026-11-10, after the go: "we shouldn't be running 3 times. We should only run it once, and we
  should understand the source of the flakiness and put the test around that. Or change the code so
  that it is easier, reliable to test.") This replaces option A, the three-sample retry, which the
  owner chose at the go.
- Orbit's first-fire hint test (item 22 of `specs/orbit.md`) failed under load because the game's own frames run while the page loads, before the
  test takes the clock; their idle time reached the hint's 4 s early. The game now reads
  `window.__orbitManual` at start, and the test sets it before the first frame. This is one line of
  Orbit's game code. (Owner, in this session, 2026-11-10: "yes to both", answering two questions: whether to allow this
  one-line Orbit change, which the brief ruled out, and whether to reword Crumble's item 12 (below).
  That is not the "yes to both" the Intent quotes, which the queue manager relayed for the original
  two-flake scope. An adversarial review picked this fix over resetting the idle timer in the test.)
- Crumble's portrait-pause test (item 13 of `specs/crumble.md`) failed under load because it waited 1.3 s of real time for the CPU's 0.7 s turn,
  while a busy machine runs fewer frames in that time. It now waits on the page's frames and on the
  game's state, not on milliseconds.
- Crumble's frame-timing test (item 12 of `specs/crumble.md`) gets its own change, with its own
  spec: a CPU-time budget read from a Chromium trace. The owner approved rewording item 12 that
  way, in this session's "yes to both" (2026-11-10, see above). Splitting it into its own PR was
  Claude's decision, not the owner's: the reviewer takes one spec per change, and that change edits
  `specs/crumble.md`. Here the test stays as it is on `main`.
- Reef's darkness test (F-8) failed in this change's one local full run, from a cause not yet found. Finding
  it is a separate change, which the owner asked for in this session (2026-11-10: "do one and start a
  new session ... so that two starts happening in parallel"). It isn't retried here.
- The PR's own `slow` run is checked once the PR is open. The PR is sent as ready to the merge queue
  only when it is green.

## Acceptance items

- **AC-1** No browser test file picks its server's port at random or from a fixed range. Every file
  that serves the repo gets its server from `tests/serve.mjs`, which starts it on port 0 and returns
  the port the server reports. (`tests/pwa-updates.test.mjs` already binds port 0 and serves its own
  folder.)
- **AC-2** On the old code, five runs of `scripts/check-slow.sh` started together on one machine show
  at least one `ERR_CONNECTION_REFUSED`, failed bind or `open()` timeout. On the new code, five such
  runs show none. A frame-timing failure under that load is reported separately and doesn't count.
  — verified by review: the PR shows the command and each run's result, before and after.
- **AC-3** Orbit's first-fire hint test owns the game's clock from the first frame: it opens the page
  with `window.__orbitManual` set by an init script, so no real frame adds to the hint's 4 s, on the
  first visit or after the reload. The rest of what Orbit's item 22 checks is unchanged.
- **AC-4** Crumble's portrait-pause test waits on the page's animation frames and the game's state,
  never on a fixed time:
  - in portrait, after 30 and then 60 real frames, the shell holds and the CPU's timer hasn't moved;
  - in landscape, it waits (up to 10 s) for the CPU to leave its turn.
- **AC-5** The fixes hold under the conditions that broke them, and still catch what they protect.
  — verified by review: the PR shows each run, made with local, uncommitted probes:
  - Orbit's test with 1.5 s between load and taking the clock fails on `main` and passes here.
  - Crumble's pause test at a 10× CPU slowdown fails on `main` ("play goes on") and passes here.
  - With the portrait hold removed from the game, it fails here.
- **AC-6** Outside `tests/`, the only files that change are `specs/ci-flakes.md`, `FINDINGS.md` and
  one line of `orbit/game.js` (it reads `window.__orbitManual`). — verified by review: the PR's diff.

## Out of scope

- Crumble's frame-timing test, and the Reef darkness test (F-8): each is its own change (see
  Decisions). So the slow tier can still fail from those two until they land.
- Other tests that wait on real time and haven't failed: logged in `FINDINGS.md`.

# Two flaky slow-tier tests stop blocking deploys

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
- How Crumble's frame-timing test measures carving: option A. It takes up to three samples and
  passes when one of them meets item 12's numbers unchanged; item 12's wording stays as it is.
  Rejected: option B, a CI-only margin, which would change what item 12 promises. (Owner,
  2026-11-10: "go, option A")

## Acceptance items

- **AC-1** No browser test file picks its server's port at random or from a fixed range. Every file
  that serves the repo gets its server from `tests/serve.mjs`, which starts it on port 0 and returns
  the port the server reports. (`tests/pwa-updates.test.mjs` already binds port 0 and serves its own
  folder.)
- **AC-2** On the old code, five runs of `scripts/check-slow.sh` started together on one machine show
  at least one `ERR_CONNECTION_REFUSED`, failed bind or `open()` timeout. On the new code, five such
  runs show none. A frame-timing failure under that load is reported separately and doesn't count.
  — verified by review: the PR shows the command and each run's result, before and after.
- **AC-3** Crumble's frame-timing test takes up to three samples of the blast run and passes when one
  of them meets item 12's numbers unchanged: frame p95 under 16.7 ms, carve + settle p95 under 4 ms,
  and a transparent crater pixel. It logs each sample.
- **AC-4** That test still catches carving that gets expensive. With a busy loop of 3 ms added to
  every carve (a local, uncommitted change), it fails all three samples. — verified by review: the
  PR shows the failing output.
- **AC-5** The PR's `slow` runs pass, and the slow suite passes 5 times in a row run alone locally.
  — verified by review: the PR's runs and the local log.
- **AC-6** Outside `tests/`, the only files that change are `specs/ci-flakes.md` and `FINDINGS.md`. No game code changes. — verified by review:
  the PR's diff.

## Out of scope

- Making other timing-based tests robust (each is logged in `FINDINGS.md` if found).
- Changing Crumble's carving code, or what Crumble's item 12 promises, beyond what the owner decides here.

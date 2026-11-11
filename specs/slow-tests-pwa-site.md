# The PWA-update and landing-page tests run once, and can't hang

**Go:** pending

## Intent

R-5, slice 5 of the seven that make the slow tier run once, with no retries (`ROADMAP.md`). The
owner, 2026-11-10: "we shouldn't be running 3 times. We should only run it once, and we should
understand the source of the flakiness and put the test around that. Or change the code so that it
is easier, reliable to test." The split, 2026-11-11: "Do an adversarial review about the split and
pick whatever makes sense."

This slice covers `tests/pwa-updates.test.mjs` and `tests/site.test.mjs` (the landing page, the PWA
and the shared game shell). It finds F-34's cause, fixes each risky test at its cause, gives every
fixed wait that stays a reason, and marks both files `// clock-checked`
(`specs/slow-tests-harness.md`). It is test-only: no game code, `sw.js` or `assets/site.js` changes.

## Decisions

- **F-34's cause: a failed pwa-updates test leaves its server listening, so the file never exits.**
  Each test starts its own `http.Server` in `site()` and closes it on its last line. A test that
  fails before that line never closes it. The listening server keeps the file's process alive after
  its tests end, and `node --test` waits for that process. Before R-1 there was no per-file limit,
  so the run hung for good. Reproduced on `main`'s code (2026-11-11): a copy of the file whose first
  test fails right after `controlled()` reported its failure, then ran until a 60 s
  `--test-timeout` stopped it. The same copy without the failure exited in 4 s. Any failure is
  enough to set it off, including a timing flake under the load of five suites started together,
  which is when F-34 was seen. R-1's 20 runs passed every test, so it never showed. R-1's
  keep-alive candidate is a second, smaller way to hang; R-1's `close()` already fixed that one.
  (Claude, 2026-11-11)
- **The fix: `site(t)` closes itself when its test ends.** `site()` takes the test's context and
  registers `close()` with `t.after()`, which `node:test` runs whether the test passed or failed.
  `close()` becomes idempotent, so the tests' own last-line `s.close()` stays harmless. Rejected:
  `--test-force-exit` in `scripts/check-slow.sh`. It would hide the leak for every file, and a
  closed server per test is what the test means. (Claude, 2026-11-11)
- **The guard test** runs `site()` in a subtest that never calls `close()`, then checks that the
  server has stopped listening once the subtest ends. On the old `site()` the server is still
  listening, so the guard fails. A subtest that fails on purpose would fail its parent, so the guard
  uses one that just skips `close()`: `t.after()` runs on both paths. The reproduction above shows
  the failing path. (Claude, 2026-11-11)
- **How each "nothing happened" check waits.** Per test, by title, with `tests/pwa-updates.test.mjs`
  line numbers as on `main` at 3647401:
  - *"no notice on a first visit or without a newer version"* (~177), two 500 ms waits (~181,
    ~184). Only a waiting worker can show the notice here: `check()` runs only on
    `visibilitychange`. So the test waits for the version check's outcome. It calls the page's
    `registration.update()`, which settles once the browser has compared the server's `sw.js`, then
    waits until no worker is installing or waiting. Neither wait stays.
  - *"the upgrade from the old worker is silent"* (~403), 500 ms after the reload (~426): the same
    as above, and the wait goes.
  - *"Update reloads the landing page once into the new version"* (~211), 1000 ms (~225). This one
    was not a negative bound. Its `waitForFunction` (`readyState` complete and a controller) is
    already true on the page from before the reload, so the 1000 ms was what waited for the reload.
    On a slow machine the reload can take longer, and "reloaded exactly once" then sees 0. The test
    now waits for the counted main-frame navigation and the new page's load, then for the new worker
    to be active with none waiting. A 500 ms `// safe: negative bound` stays for a second reload.
  - *"with two landing tabs … only the one that taps Update reloads"* (~267), 1000 ms (~286). The
    tab that tapped had the same old-page race: its "notice gone" was read with no wait for its
    reload. It now waits for that reload. The other tab's notice hides on `controllerchange`, the
    same handler that would reload it, so the 1000 ms after that stays as a `// safe: negative
    bound`.
  - *"a game open in another tab never reloads"* (~235), 500 ms (~247) and 1000 ms (~255). Both
    come after the signal they bound: the new worker found waiting in the game's own registration,
    and then (added) the game's controller is the new active worker, so its `controllerchange` has
    run. Both stay as `// safe: negative bound`.
  - *"with sw.js unchanged, a change to the landing page's own files"* (~292), 300 ms (~298): stays
    as `// safe: negative bound`. No check runs without `visibilitychange`, and the page's
    load-time fetches are done (`networkidle` above). The 1000 ms after the reload (~310) also stays
    as `// safe: negative bound`, for a second reload: that reload is already waited for by its new
    script mark.
  - The landing page's *"before leaving any game, the shell always asks"*
    (`tests/site.test.mjs` ~212), 200 ms (~225): stays as `// safe: negative bound`. A wrong leave
    navigates 90 ms after the key (`leave()` in `shared/game-shell.js`).
  - *"a game can keep Escape for itself"* (~338) and *"Escape in a text field does not leave the
    game"* (~352), 300 ms each (~347, ~361). Leaving always opens the "Leave this level?" dialog
    first, inside the shell's `keydown` handler, which has run by the time `keyboard.press`
    resolves. So both tests now check that no dialog opened, as well as the URL, and the waits go.
    Checking only the URL let them pass even with the bug, since the dialog asks before anything
    navigates.

  A `site.js` signal was considered and isn't needed: each check above has a signal outside game
  code. (Claude, 2026-11-11)
- **Other causes, per test.**
  - *Offline after `networkidle` (pattern 5).* The worker stores what a page loads in
    `event.waitUntil`, after the response has gone to the page. `networkidle` (500 ms with no page
    requests) says nothing about those writes, and a slow machine can go offline before they land.
    Each of these tests now waits until the cache holds what its offline step loads:
    - pwa-updates' *"a version bump that changes one game keeps the other playable offline"* (~367):
      alpha's files, and beta's new version;
    - *"the upgrade from the old worker"* (~403): alpha in the old worker's cache before the upgrade;
    - the landing page's *"a game works offline once it has been played"* (~325): the fixture game's
      page.
  - *Fixed ms that a slower CPU doesn't stretch (pattern 5).* Explicit `timeout: 10000`s replace
    the context's scaled default, and `until()` stopped after 100 checks 100 ms apart. `controlled()`
    and the landing page's `swReady` race `ready` against an in-page 10 s `setTimeout`. All now
    scale with `TEST_CPU_THROTTLE`: `scaled()`, a deadline for `until()`, and `within()` for
    `ready`.
  - *`networkidle` before an "no errors" check* (the landing page's tile tests, ~44, ~70, ~165, and
    the Install test, ~273) stays. It only gives a late error time to show, and can't fail a correct
    page.
  - The rest were checked and have no risky wait: the visible-again check (~195), the network- and
    cache-first check (~317), the theme-tokens check (~435), the link-opened game's cache (~470),
    and the landing page's other tests. (Claude, 2026-11-11)
- **Proof as R-1 set it:** the guard test fails on the old code. The two files pass 5 times in
  parallel and once with `TEST_CPU_THROTTLE=10`, run alone (F-41). The rest of the suite passes
  once. (Split, 2026-11-11)

## Acceptance items

- **AC-1** Every server and browser context that pwa-updates' `site()` starts is closed when its test
  ends, whether the test passed, failed or never reached its own `close()`. A test that exercises
  this fails on `main`'s `site()`.
- **AC-2** A pwa-updates test that fails no longer keeps the file running: with one test made to
  fail, the file exits by itself, well inside its limit. — verified by review: the PR shows the
  probe's result on `main`'s code (stopped at its limit) and on this branch (exits).
- **AC-3** Both files are marked `// clock-checked`. Every `waitForTimeout` left in them is a
  negative bound, marked `// safe: negative bound …` with what it bounds, and comes after the
  signal it bounds. None of them waits for something to happen.
- **AC-4** pwa-updates' "no notice" checks (first visit, no newer version, after the old-worker
  upgrade) run only once the version check has finished: the page's registration has been updated
  against the server's `sw.js`, and no worker is installing or waiting.
- **AC-5** Each "reloaded exactly once" and "did not reload" check in pwa-updates waits for the
  reload it counts (the main-frame navigation and the new page's load) before it asserts. No check
  of the reloaded page can pass on the page from before the reload.
- **AC-6** Before a test in either file goes offline, the files its offline step loads are in the
  worker's caches, read from the cache, not inferred from `networkidle`.
- **AC-7** No wait in either file has a fixed limit in ms that `TEST_CPU_THROTTLE` doesn't scale:
  no explicit Playwright time-out, in-page timer or poll count.
- **AC-8** The landing page's two "Escape does not leave" tests fail if Escape opened the leave
  dialog, and have no fixed wait.
- **AC-9** The two files pass 5 times in parallel and once with `TEST_CPU_THROTTLE=10`, and the rest
  of the suite passes once. — verified by review: the PR shows each run's summary.
- **AC-10** Outside `tests/`, the only files that change are `specs/slow-tests-pwa-site.md`,
  `ROADMAP.md` (R-5's row and section) and `FINDINGS.md` (F-34 removed, anything new added). No game
  code, `sw.js` or `assets/` file changes. — verified by review: the PR's diff.

## Out of scope

- Other files' waits: R-2 to R-4, R-6 and R-7.
- `--test-force-exit`, or any change to `scripts/check-slow.sh`.
- Changing `specs/pwa-updates.md` or any game's spec.

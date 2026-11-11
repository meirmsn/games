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
(`specs/slow-tests-harness.md`). It is test-only. The coordinator's game-code verdict for this slice
(2026-11-11) approved no game change, and none is needed.

## Decisions

- **F-34's cause, as found: a failed pwa-updates test leaves its server listening, so the file never
  exits.**
  - Each test starts its own `http.Server` in `site()` and closes it on its last line. A test that
    fails before that line never closes it. The listening server keeps the file's process alive
    after its tests end, and `node --test` waits for that process. Before R-1 there was no per-file
    limit, so the run hung for good.
  - Reproduced on `main`'s code (2026-11-11), with a copy of the file that isn't committed: its
    first test fails right after `controlled()`. The copy reported the failure, then ran until a
    60 s `--test-timeout` stopped it. The same copy without the failure exited in 4 s.
  - Any failure sets it off, including a timing flake under the load of five suites started
    together, which is when F-34 was seen. R-1's 20 runs passed every test, so the leak never
    showed.
  - The log of the run where F-34 was seen wasn't kept. So it can't be confirmed that a test failed
    in that run, and this is the most likely cause, not a proven one. The other known ways to hang
    were R-1's:
    - in-page waits with no limit, now bounded;
    - a connection held mid-request, now dropped by `close()`.
  - With all three fixed, and any file that runs past its limit stopped and named, F-34 leaves
    `FINDINGS.md`. (Claude, 2026-11-11, from the spec review)
- **The fix: `site(t)` closes itself when its test ends.**
  - `site()` takes the test's context. It registers its cleanup with `t.after()` right after the
    server listens, before it makes the browser context, so a `site()` that fails partway still
    closes its server. `node:test` runs `t.after()` whether the test passed or failed (tried on
    Node 22.23.4, also for a subtest, whose after-hook has finished when `await t.test()`
    resolves).
  - `close()` keeps its first call's promise, so a second call shares it. It bounds
    `context.close()` with `within()`, and closes the server in a `finally`, so a crashed or hung
    context can't keep the server open.
  - Rejected: `--test-force-exit` in `scripts/check-slow.sh`. It would hide such leaks in every
    file, and a server closed at the end of each test is what the tests mean. (Claude, 2026-11-11,
    from the spec review)
- **The guard test** runs `site()` in a subtest that never calls `close()`. Once the subtest ends,
  it checks that the server has stopped listening and the context is gone from
  `browser.contexts()`. Then it closes whatever it found still open, so on the old `site()` it fails
  quickly and leaves nothing running. A subtest that fails on purpose would fail its parent, so the
  guard uses one that just skips `close()`. `t.after()` runs on both paths, and the reproduction
  above shows the failing one. (Claude, 2026-11-11)
- **Negative bounds.** A `waitForTimeout` that stays only gives a wrong outcome time to show. It
  comes after the signal that would set that outcome off, and is marked `// safe: negative bound:
  <what>`. It is `scaled(ms)`, so it keeps its reach at a throttled CPU. It can't fail a correct
  page, so it can't flake. (Claude, 2026-11-11, from the spec review)
- **How each check of something that happened, or didn't, waits.** Per test, by title, with line
  numbers as on `main` at 3647401. Lines are in `tests/pwa-updates.test.mjs` unless named.
  - **"no notice on a first visit or without a newer version"** (~177), 500 ms twice (~181, ~184),
    and **"the upgrade from the old worker is silent"** (~403), 500 ms after the reload (~426).
    - Here only a waiting worker can show the notice: `check()` runs only on `visibilitychange`.
    - Each check first waits for the version check's outcome. It calls the page's
      `registration.update()`, which settles once the browser has fetched and compared the server's
      `sw.js`, then waits until no worker is installing or waiting.
    - A newer `sw.js` at that point would leave a worker installing or waiting, and the wait then
      fails, naming it. That is the right failure for these tests.
    - That proves no new worker exists, but not that the page's own handlers (`register().then`,
      `statechange`) have run. So a 300 ms negative bound stays after it.
  - **"Update reloads the landing page once into the new version"** (~211), 1000 ms (~225).
    - It wasn't a negative bound. Its `waitForFunction` (`readyState` complete and a controller) is
      already true on the page from before the reload, so the 1000 ms was what waited for the
      reload. On a slow machine the reload takes longer, and "reloaded exactly once" sees 0.
    - The navigation counter is set up before the click. The test now waits for the count to reach
      1 and the new page to load, then for the new worker to be active with none waiting.
    - A 500 ms negative bound stays, for a second reload.
  - **"with two landing tabs … only the one that taps Update reloads"** (~267), 1000 ms (~286).
    - The tab that taps (`one`) had the same old-page race: its "notice gone" (~288) was read with
      no wait for its reload. Its navigations are now counted from before the click, and the test
      waits for its reload.
    - The other tab hides its notice on `controllerchange`, the same handler that would reload it.
      So the 1000 ms after that stays, as a negative bound.
  - **"a game open in another tab never reloads"** (~235), 500 ms (~247) and 1000 ms (~255).
    - Both come after the signal they bound. The 500 ms follows the new worker found waiting in the
      game's own registration. The 1000 ms now follows the game's controller being its
      registration's active worker. That is checked by identity
      (`navigator.serviceWorker.controller === r.active`, with `r.active.state === 'activated'`),
      since both workers have the same `scriptURL`.
    - Both stay, as negative bounds.
    - The landing page's `waitForFunction(readyState complete)` (~253) had the old-page race too.
      It now waits for the landing page's counted reload.
  - **"with sw.js unchanged, a change to the landing page's own files"** (~292), 300 ms (~298) and
    1000 ms (~310). Both stay, as negative bounds:
    - the 300 ms because no check runs without `visibilitychange`, and the page's load-time fetches
      have finished (`networkidle` above);
    - the 1000 ms for a second reload, once the first is waited for by the new script mark.
  - The landing page's **"before leaving any game, the shell always asks"** (`tests/site.test.mjs`
    ~212), 200 ms (~225).
    - The second Escape's target is the open dialog, so the shell's handler returns and the dialog
      closes itself. No leave is pending.
    - The test now checks, once the dialog has hidden, that no dialog is open and the URL hasn't
      changed. The wait goes.
  - **"a game can keep Escape for itself"** (site ~338) and **"Escape in a text field does not
    leave the game"** (site ~352), 300 ms each (~347, ~361).
    - Leaving always opens the "Leave this level?" dialog first, inside the shell's `keydown`
      handler, which has run by the time `keyboard.press` resolves. So both tests now check that no
      dialog opened, as well as the URL, and the waits go.
    - Checking only the URL let them pass even with the bug, since the dialog asks before anything
      navigates.
    - The dialog check carries these two tests. Escape calling `leave()` with no dialog is a
      different bug, and "the shell always asks" catches it, since its Escape must open the dialog.

  A signal from `site.js` was considered and isn't needed: each check above has one outside game
  code. (Claude, 2026-11-11, from the spec review)
- **Going offline before the worker's cache writes land.**
  - The worker stores what a page loads in `event.waitUntil`, after the response has gone to the
    page. A link-opened game is stored by the shell's `keep` message once `ready` resolves.
    `networkidle` (500 ms with no page requests) says nothing about either.
  - Each test that goes offline now first waits, with `until()`, for the cache keys its offline
    step loads. Each key is matched in the cache it lives in, by content where an older copy
    exists:
    - **"a version bump that changes one game keeps the other playable offline"** (~367): in
      `games-game-alpha`, `alpha/`, `alpha/game.js`, `alpha/game.css`, `alpha/art.png` and
      `alpha/sounds/hit.mp3`, after both games are first played. In `games-game-beta`, `beta/` and
      `beta/game.js` holding mark `2`, after beta is played on the new version.
    - **"the upgrade from the old worker is silent"** (~403): the same five alpha keys in
      `games-v5` before the upgrade, since `moveLegacy` copies only what is there.
    - **"a game opened straight from a link is cached"** (~470): its check gains `game.css` and
      `sounds/hit.mp3`, which its offline load needs.
    - The landing page's **"a game works offline once it has been played"** (site ~325): the
      fixture game's page, `tests/fixtures/game/`, in `games-game-tests`.
  - If the link-opened game's sound is never stored, because it wasn't in `performance`'s entries
    when `ready` resolved (`keepForOffline` in `shared/game-shell.js`), the wait fails, naming it.
    That would be a real race in the shell, logged in `FINDINGS.md`, not hidden.
- **Limits a slower CPU doesn't stretch.**
  - These all replace the context's scaled default with fixed ms:
    - the explicit `timeout: 10000`s;
    - the landing page's `waitFor({ timeout: 5000 })` (site ~333);
    - `until()`'s 100 checks 100 ms apart;
    - `controlled()`'s and the landing page's `swReady`'s race of `ready` against an in-page 10 s
      `setTimeout`.
  - Each now scales with `TEST_CPU_THROTTLE`:
    - time-outs are `scaled(ms)`;
    - `until()` checks every 100 ms until a deadline of `scaled(10000)` ms;
    - `ready` is awaited through `within()`. (Claude, 2026-11-11)
- **Waits that stay as they are.**
  - `networkidle` before the "no errors" checks of the landing page's tile tests (site ~44, ~70,
    ~165) only gives a late error time to show, and can't fail a correct page.
  - In the Install test (site ~273), `networkidle` comes before "the Install button is hidden".
    That check is safe: the test's capturing listener stops any trusted `beforeinstallprompt`.
  - The rest were checked and have no risky wait: the visible-again check (~195), the network- and
    cache-first check (~317), the theme-tokens check (~435), and the landing page's other tests.
    (Claude, 2026-11-11)
- **Proof as R-1 set it:**
  - the guard test fails on the old code;
  - the two files pass 5 times in parallel, and once with `TEST_CPU_THROTTLE=10`, run alone (F-41);
  - the rest of the suite passes once. (Split, 2026-11-11)

## Acceptance items

- **AC-1** Every server and browser context that pwa-updates' `site()` starts is closed when its test
  ends, whether the test passed, failed, never reached its own `close()`, or `site()` itself failed
  after the server started listening. A test checks the server and the context of a test that
  skipped `close()`, and fails on `main`'s `site()`.
- **AC-2** A pwa-updates test that fails no longer keeps the file running. A copy of the file, not
  committed, with its first test made to fail right after `controlled()`, exits by itself within
  30 s on this branch; on `main`'s code it is stopped by a 60 s `--test-timeout`. — verified by
  review: the PR shows both results.
- **AC-3** Both files are marked `// clock-checked`. Every `waitForTimeout` left in them is a
  `scaled()` negative bound, marked `// safe: negative bound: <what>`, after the signal it bounds;
  none of them waits for something to happen. — verified by review: the diff, against the list in
  Decisions.
- **AC-4** pwa-updates' "no notice" checks (first visit, no newer version, after the old-worker
  upgrade) assert only after the version check has finished. The page's registration has been
  updated against the server's `sw.js`, and no worker is installing or waiting.
- **AC-5** Each "reloaded exactly once" check in pwa-updates counts the page's main-frame
  navigations from before the action that reloads it, and waits for that count and the new page's
  load before it asserts. No check of a reloaded page can pass on the page from before the reload.
- **AC-6** Each "did not reload" check in pwa-updates asserts only after the signal that would have
  set the reload off (the `controllerchange` it would come from), then a negative bound.
- **AC-7** Before a test in either file goes offline, each cache key its offline step loads is in
  the worker's caches, read from the cache, and is the expected version where an older one exists.
- **AC-8** No wait in either file has a limit in ms that `TEST_CPU_THROTTLE` doesn't scale: no
  explicit Playwright time-out, in-page timer, poll count or `waitForTimeout`.
- **AC-9** The landing page's three Escape tests that expect to stay in the game fail if Escape
  left the leave dialog open, or opened it, and have no fixed wait.
- **AC-10** The two files pass 5 times in parallel, and once alone with `TEST_CPU_THROTTLE=10`, and
  the rest of the suite passes once. — verified by review: the PR shows each run's summary.
- **AC-11** Outside `tests/`, the only files that change are `specs/slow-tests-pwa-site.md`,
  `ROADMAP.md` (R-5's row and section) and `FINDINGS.md` (F-34 removed, anything new added). No game
  code, `sw.js`, `index.html`, `manifest.webmanifest`, `assets/` or `shared/` file changes.
  — verified by review: the PR's diff.

## Out of scope

- Other files' waits: R-2 to R-4, R-6 and R-7.
- `--test-force-exit`, or any change to `scripts/check-slow.sh`.
- Changing `specs/pwa-updates.md` or any game's spec.

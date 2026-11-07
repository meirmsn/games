# Findings

What Claude noticed while working on this repo and didn't fix, kept so the owner can watch what
comes back. A finding is not a task.

| ID  | Severity | What was noticed | Seen |
| --- | -------- | ---------------- | ---- |
| F-1 | low | No test that bumping `VERSION` in `sw.js` clears the old cache. It matters only when the precache list (`SHELL`) changes, and `sw.js` and the README say when to bump it. | 2026-11-06 · meirmsn/games#3 review |
| F-2 | low | Scripts and styles are served cache-first and refresh in the background, so for one load after an update a returning visitor can run an older script with the newer page. Harmless today; it would matter if a page and its script had to change together (`sw.js`). | 2026-11-06 · meirmsn/games#3 review |
| F-3 | low | Reef: no test that a run's starting assist is capped at 0.7 (`reef/game.js`, in `startGame`); the AC-13 test's cases give 0.55 and 0.65. | 2026-11-07 · meirmsn/games#7 review |
| F-4 | low | Reef: no test that a dive's extra life stops at 3 (AC-5); the test only goes from 2 lives to 3. | 2026-11-07 · meirmsn/games#7 review |

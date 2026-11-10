# Findings

What Claude noticed while working on this repo and didn't fix, kept so the owner can watch what
comes back. A finding is not a task.

| ID  | Severity | What was noticed | Seen |
| --- | -------- | ---------------- | ---- |
| F-1 | low | No test that bumping `VERSION` in `sw.js` clears the old cache. It matters only when the precache list (`SHELL`) changes, and `sw.js` and the README say when to bump it. | 2026-11-06 · meirmsn/games#3 review |
| F-2 | low | Scripts and styles are served cache-first and refresh in the background, so for one load after an update a returning visitor can run an older script with the newer page. Harmless today; it would matter if a page and its script had to change together (`sw.js`). | 2026-11-06 · meirmsn/games#3 review |
| F-3 | low | Googly Faces keeps its own colours in `googly-faces/game.css` (sky, dots, buttons), with light and dark values, instead of deriving them from the site's theme tokens in `assets/base.css`, so a later token change won't reach the game. | 2026-11-06 · meirmsn/games#6 review |
| F-4 | low | After a newer merge goes live first, `scripts/deploy.sh` writes `version` as `<sha> (live: <sha>, a newer merge)`, not the bare short SHA the spec names; the deploy comment shows that text in its "New version" line. | 2026-11-08 · meirmsn/games#9 review |
| F-5 | low | The `all-cloudflare-deploys AC-9` test checks `SITE_URL` and `PREVIOUS_SHA` are on the deploy step's "---" env line, but not that they appear nowhere else in `ci.yml`. | 2026-11-08 · meirmsn/games#9 review |
| F-6 | low | `specs/walk-on-red.md` keeps a note that the landing page's tile count (8 on today's `main`) is set when the branch rebases, because games are built in parallel; once the batch has landed the note can go. | 2026-11-09 · meirmsn/games#11 review |
| F-8 | low | Two Reef tests flake under load: "reef AC-12: The Deep is dark, with a glow around the player" compares pixel brightness at a moment that drifts when the machine is busy (failed in CI and locally, then passed on a rerun), and "reef AC-1" once threw "radius is negative" from the waiting pulse round the player when its clock started below zero (`reef/game.js`, `player.size * (0.6 + t * 0.9)`). Neither is Orbit code; a clamp of that radius to 0 and a settled frame before the pixel check would fix them. | 2026-11-09 · meirmsn/games#13 CI |
| F-9 | low | The test of Pixel Leap's state table (`tests/pixel-leap.test.mjs`) is titled `pixel-leap AC-12`, the same id as the door-and-map test, though it checks the States table; a failure there points at AC-12. | 2026-11-09 · meirmsn/games#14 review |
| F-18 | low | Orbit, Pixel Leap, Runes and Walk on Red's browser tests (`tests/*.test.mjs`) all start their server on a random port in 9300–9399; when two files pick the same port, one file's tests can't connect (seen as 23 `ERR_CONNECTION_REFUSED` failures in meirmsn/games#17's CI). This PR's game (High Seas, then Beacon, now Island Hop) moved to its own range; the four still share one. | 2026-11-09 · meirmsn/games#17 CI |
| F-19 | low | `specs/game-guidelines.md` still says "Little Town waits for High Seas's isometric engine"; High Seas is gone, and the engine is `shared/iso.js`, which meirmsn/games#17 (Island Hop) adds. One change carries one spec, so this PR leaves the guidelines alone. | 2026-11-10 · meirmsn/games#17 |

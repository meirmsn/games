# Findings

What Claude noticed while working on this repo and didn't fix, kept so the owner can watch what
comes back. A finding is not a task.

| ID  | Severity | What was noticed | Seen |
| --- | -------- | ---------------- | ---- |
| F-3 | low | Googly Faces keeps its own colours in `googly-faces/game.css` (sky, dots, buttons), with light and dark values, instead of deriving them from the site's theme tokens in `assets/base.css`, so a later token change won't reach the game. | 2026-11-06 · meirmsn/games#6 review |
| F-4 | low | After a newer merge goes live first, `scripts/deploy.sh` writes `version` as `<sha> (live: <sha>, a newer merge)`, not the bare short SHA the spec names; the deploy comment shows that text in its "New version" line. | 2026-11-08 · meirmsn/games#9 review |
| F-5 | low | The `all-cloudflare-deploys AC-9` test checks `SITE_URL` and `PREVIOUS_SHA` are on the deploy step's "---" env line, but not that they appear nowhere else in `ci.yml`. | 2026-11-08 · meirmsn/games#9 review |
| F-8 | low | Two Reef tests flake under load: "reef AC-12: The Deep is dark, with a glow around the player" compares pixel brightness at a moment that drifts when the machine is busy (failed in CI and locally, then passed on a rerun), and "reef AC-1" once threw "radius is negative" from the waiting pulse round the player when its clock started below zero (`reef/game.js`, `player.size * (0.6 + t * 0.9)`). Neither is Orbit code; a clamp of that radius to 0 and a settled frame before the pixel check would fix them. | 2026-11-09 · meirmsn/games#13 CI; 2026-11-10 · Pixel Leap batch 2 slow run (AC-12 failed, passed alone) |
| F-9 | low | The test of Pixel Leap's state table (`tests/pixel-leap.test.mjs`) is titled `pixel-leap AC-12`, the same id as the door-and-map test, though it checks the States table; a failure there points at AC-12. | 2026-11-09 · meirmsn/games#14 review |
| F-11 | low | Gotta Go!'s tile checks live only in `scripts/walk-on-red/make-tile.mjs` (6× view, mid-hop, sweat showing, no vehicle); no test loads `walk-on-red/?tile`, so a break in that page or a stale PNG would pass CI. A test at a 648 px viewport checking the cards are hidden and the view is 6× would cover it. | 2026-11-10 · meirmsn/games#20 review |
| F-12 | low | Pixel Leap's AC-31 (`specs/pixel-leap.md`) says which new world has the owner's music bed "so far" (only the Farm's); it goes stale as the other beds arrive, and should then name each world's music by rule instead. | 2026-11-10 · meirmsn/games#21 review |
| F-16 | low | If moving the old `games-v<N>` cache into the per-game caches fails (`sw.js`, `moveLegacy`), the old cache stays and each later install skips waiting, so updates apply silently, without the Update button, until a move succeeds. | 2026-11-10 · pwa-updates review |
| F-17 | low | The pwa-updates "first visit: no notice" check (`tests/pwa-updates.test.mjs`, AC-1) looks only once the worker controls the page and none waits, so it would still pass if the landing page dropped its "only with a controller" guard. | 2026-11-10 · pwa-updates review |
| F-18 | low | The update notice's text uses a literal `font-weight: 550` (`assets/site.css`, `.update p`), like `.btn` in `assets/base.css`; the theme has no font-weight token. | 2026-11-10 · pwa-updates review |

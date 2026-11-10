# games

Play at **https://games.meirmsn.dev**

**Games:** [Reef](reef/), eat the golden, green and pink fish, dodge the marked ones and dive deeper; [Runes](runes/), draw one line of light through every stone while runes raise and sink stones around it; [Googly Faces](googly-faces/), tap the silly faces and watch their eyes wobble; [Orbit](orbit/), fling a probe round the planets and catch the next one's orbit ring; [Walk on Red](walk-on-red/), he needs the loo across the street, so cross before the light turns green; from level 8, people follow in your footsteps; [Pixel Leap](pixel-leap/), build a monster, then run and jump through worlds that each redraw it in their own art style; [Beacon](beacon/), swing the lighthouse beam through a storm night, and every ship in the light turns for home.

Small browser games, built one at a time. They're touch-first (phone, then tablet, then desktop), and the site installs as a PWA that works offline.

- **[Discussion](discussion/README.md):** the direction, game ideas, asset galleries and decisions log behind the games.

## How the site is put together

| Path | What it is |
|---|---|
| `index.html`, `assets/` | The landing page: a tile per game, with sound, light and dark themes, and an install button |
| `manifest.webmanifest`, `sw.js` | The PWA: home-screen install, and offline play once a page has loaded |
| `shared/` | Shared by every game: `sound.js` (sound that works on phones, and looping music) and `game-shell.js`/`.css` (the back button, the full-screen frame, and offline play for a game opened straight from a link). For isometric games, `iso.js`: the tile grid, depth sorting, screen↔tile picking, and a camera that pans and zooms by touch, mouse and wheel |
| `<slug>/` | One folder per game, holding its `index.html`, code and only the assets it uses |
| `reef/` | **Reef**, the fish game. Its sprite atlas is built from the Fish Pack SVGs by `scripts/reef/build-atlas.mjs` |
| `runes/` | **Runes**, the puzzle (`specs/runes.md`). `rules.js` holds the rules and the solver; `levels.js` the levels, picked from `scripts/runes/generate.mjs` and checked with `scripts/runes/lab.mjs`; `scripts/runes/make-tile.mjs` draws its landing tile |
| `orbit/` | **Orbit**, the gravity game. `orbit/physics.js` is shared with `scripts/orbit/solve.mjs`, which measures every leg headless while tuning; `scripts/orbit/make-tile.mjs` draws its tile from the game |
| `walk-on-red/` | **Walk on Red**, the lane-crossing game on the Pixel Vehicle Pack. Its frame list comes from the pack's spritesheet (`scripts/walk-on-red/build-atlas.mjs`), its tile is drawn from the game (`scripts/walk-on-red/make-tile.mjs`); its page text is in Kenney Mini Square (`walk-on-red/fonts/`, from the Kenney Fonts pack) and its street text in the 3×5 alphabet of `walk-on-red/pixel-font.js` |
| `pixel-leap/` | **Pixel Leap**, the platformer. `worlds.js` holds the worlds and their stages (as segment lists), `monster.js` the monster builder and the bake that redraws it at a pixel world's resolution, and `candy-atlas.js` and `monster-atlas.js` the Kenney spritesheets' frames (`specs/pixel-leap.md`) |
| `beacon/` | **Beacon**, the lighthouse game on an isometric night sea (`specs/beacon.md`). `sim.js` holds the rules and the coasts, with no DOM, so the tests and the timed playtest (`scripts/beacon/playtest.mjs`) run it headless; its atlas and sounds are built from the Kenney packs by `scripts/beacon/build-assets.py`, its tile by `scripts/beacon/make-tile.mjs` |

Run it locally with `PORT=8000 scripts/local-run.sh`, then open http://127.0.0.1:8000/.

It's hosted on Cloudflare (Workers static assets, connected through the Cloudflare GitHub app). `main` deploys to the live site at https://games.meirmsn.dev, and every pull request gets its own preview link at `<branch>.games.meirmsn.dev`, posted as a comment on the PR. `wrangler.jsonc` holds the config, and `.assetsignore` lists the repo files that aren't part of the site. After a merge, CI's `scripts/deploy.sh` waits until the live site serves the merged files and updates the merged PR's deploy comment; it deploys nothing itself (`specs/all-cloudflare-deploys.md`).

## Adding a game

1. Make its folder, e.g. `googly-faces/index.html`. Load `../shared/game-shell.css` and call `mountShell()` from `../shared/game-shell.js`, which adds the back button and sets up sound.
2. On the landing page, turn its tile from `<article class="tile is-soon">` into `<a class="tile" href="googly-faces/">` and remove its "Coming soon" badge. Draw its tile picture from the game itself where you can, so they look alike: `node scripts/make-tile.mjs` does this for Googly Faces.
3. Nothing to do in `sw.js`: a game's files are cached the first time it's played. Bump `VERSION` there only when you add, remove or rename a file in its `SHELL` list.
4. Run `scripts/check-fast.sh` and `scripts/check-slow.sh`.

## Checks

CI is `.github/workflows/ci.yml`, with two required jobs, `fast` and `slow`.

- `scripts/check-fast.sh origin/main`: the secret scan, the spec and project contract checks, then links, the lockfile (npmjs only), the offline file list and page references, the theme tokens, that previews never bind production data (`scripts/preview-bindings-check.mjs`), and the deploy step's tests. In CI, `fast` also checks the PR title: it starts with a Conventional Commit type (`feat:`, `fix:`, `chore:`, …).
- `scripts/check-slow.sh`: browser tests in `tests/`. Needs `scripts/setup.sh` (`npm ci`), then `npx playwright install chromium`.

Art and sound by [Kenney](https://www.kenney.nl) (CC0). Code is under the [MIT License](LICENSE).

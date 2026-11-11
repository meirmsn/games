# games

Play at **https://games.meirmsn.dev**

**Games:** [Reef](reef/), eat the golden, green and pink fish, dodge the marked ones and dive deeper; [Runes](runes/), draw one line of light through every stone while runes raise and sink stones around it; [Googly Faces](googly-faces/), tap the silly faces and watch their eyes wobble; [Orbit](orbit/), fling a probe round the planets and catch the next one's orbit ring; [Gotta Go!](walk-on-red/), he needs the loo across the street, so cross before the light turns green; from level 8, people follow in your footsteps; [Pixel Leap](pixel-leap/), build a monster, then run and jump through worlds that each redraw it in their own art style; [Splat Gallery](splat-gallery/), pull the slingshot and lead the shot in a fairground paintball booth, with no crosshair, until the whole booth is painted; [Crumble](crumble/), blast the sand from under the other tank before the tide comes in.

Small browser games, built one at a time. They're touch-first (phone, then tablet, then desktop), and the site installs as a PWA that works offline.

- **[Discussion](discussion/README.md):** the direction, game ideas, asset galleries and decisions log behind the games.

## How the site is put together

| Path | What it is |
|---|---|
| `index.html`, `assets/` | The landing page: a tile per game, with sound, light and dark themes, an install button, a Home button to https://meirmsn.dev/, and the add-to-home-screen ribbon (`specs/landing-home-and-ribbon.md`) |
| `assets/previews/` | The pictures a shared link shows (Open Graph and Twitter cards, 1200×630): each game's tile on its card's tone, and `site.jpg`, the landing page's collage of six tiles. `scripts/make-previews.mjs` draws them all from the tiles (`specs/social-previews.md`) |
| `manifest.webmanifest`, `sw.js` | The PWA: home-screen install, offline play once a page has loaded, and the Update button (below) |
| `shared/` | Shared by every game: `sound.js` (sound that works on phones, and looping music) and `game-shell.js`/`.css` (the back button, the full-screen frame, and offline play for a game opened straight from a link) and `explosion.js` (one explosion effect for every game, with its art in `explosion/`) |
| `<slug>/` | One folder per game, holding its `index.html`, code and only the assets it uses |
| `reef/` | **Reef**, the fish game. Its sprite atlas is built from the Fish Pack SVGs by `scripts/reef/build-atlas.mjs` |
| `runes/` | **Runes**, the puzzle (`specs/runes.md`). `rules.js` holds the rules and the solver; `levels.js` the levels, picked from `scripts/runes/generate.mjs` and checked with `scripts/runes/lab.mjs`; `scripts/runes/make-tile.mjs` draws its landing tile |
| `orbit/` | **Orbit**, the gravity game. `orbit/physics.js` is shared with `scripts/orbit/solve.mjs`, which measures every leg headless while tuning; `scripts/orbit/make-tile.mjs` draws its tile from the game |
| `walk-on-red/` | **Gotta Go!**, the lane-crossing game on the Pixel Vehicle Pack. Its frame list comes from the pack's spritesheet (`scripts/walk-on-red/build-atlas.mjs`), its tile is drawn from the game (`scripts/walk-on-red/make-tile.mjs`); its page text is in Kenney Mini Square (`walk-on-red/fonts/`, from the Kenney Fonts pack) and its street text in the 3×5 alphabet of `walk-on-red/pixel-font.js` |
| `pixel-leap/` | **Pixel Leap**, the platformer. `worlds.js` holds the worlds and their stages (as segment lists), `monster.js` the monster builder and the bake that redraws it at a pixel world's resolution, and `candy-atlas.js`, `mushroom-atlas.js`, `castle-atlas.js`, `ice-atlas.js`, `sea-atlas.js` and `monster-atlas.js` the Kenney sheets' frames (`img/critters.png` holds the New Platformer Pack's mice, snails, fish, key and spikes) (`specs/pixel-leap.md`) |
| `splat-gallery/` | **Splat Gallery**, the paintball booth. Its sprite atlas is rasterised at 2× from the pack's vector file by `scripts/splat-gallery/build-atlas.mjs`, its splats by `build-splats.py`, its carnival waltz and frenzy galop synthesised by `make-music.py`, and its tile drawn by `make-tile.mjs` (all in `scripts/splat-gallery/`) |
| `crumble/` | **Crumble**, the artillery game on a shore that blows apart (`specs/crumble.md`). `terrain.js` is the destructible ground |

Run it locally with `PORT=8000 scripts/local-run.sh`, then open http://127.0.0.1:8000/.

It's hosted on Cloudflare (Workers static assets, connected through the Cloudflare GitHub app). `main` deploys to the live site at https://games.meirmsn.dev, and every pull request gets its own preview link at `<branch>.games.meirmsn.dev`, posted as a comment on the PR. `wrangler.jsonc` holds the config, and `.assetsignore` lists the repo files that aren't part of the site. After a merge, CI's `scripts/deploy.sh` waits until the live site serves the merged files and updates the merged PR's deploy comment; it deploys nothing itself (`specs/all-cloudflare-deploys.md`).

## Adding a game

1. Make its folder, e.g. `googly-faces/index.html`. Load `../shared/game-shell.css` and call `mountShell()` from `../shared/game-shell.js`, which adds the back button and sets up sound.
2. On the landing page, turn its tile from `<article class="tile is-soon">` into `<a class="tile" href="googly-faces/">` and remove its "Coming soon" badge. Draw its tile picture from the game itself where you can, so they look alike: `node scripts/make-tile.mjs` does this for Googly Faces.
3. Give it a share picture: run `node scripts/make-previews.mjs`, which draws `assets/previews/<slug>.png` from its tile, and copy the `og:` and `twitter:` tags from another game's `<head>`, with its own title, description, URL and image alt. The fast tier fails without them.
4. Nothing to do in `sw.js`: a game's files are cached in its own cache the first time it's played. Bump `VERSION` there only when you add, remove or rename a file in its `SHELL` list, such as the new tile picture.
5. Run `scripts/check-fast.sh` and `scripts/check-slow.sh`.

## The add-to-home-screen ribbon

A quiet band across the landing page's bottom-right corner invites returning visitors to add the site
(`specs/landing-home-and-ribbon.md`). It shows from a person's second visit, or once they've tapped a
game, and never in the installed app, while the Update notice shows, or if this browser's storage
can't be used. Tapping it opens a dialog with the steps for the device, or an Install button where the
browser offers one. "Not now" puts it away for 7 days; "Don't show again" or installing, for good. Its
state is one `localStorage` key, `ribbon`; deleting it starts over as a first visit.

## Updates

How a new version reaches players (`specs/pwa-updates.md`):

- **The landing page shows "New version available" with an Update button** when it's out of date: its own files on the server changed (a new game's tile, say) or a new `sw.js` is waiting. It checks each time it comes back on screen, so an installed app that resumes finds updates too. Tapping Update switches to the new version and reloads the landing page. Nothing to bump for it.
- **A game is never reloaded or interrupted.** Game pages never show the notice; a game picks up the new version the next time it's opened.
- **Pages, scripts and styles are fetched fresh when online** (the cache is the offline fallback), so a page and its scripts always match. Pictures, sounds and fonts come from the cache and refresh in the background, so a changed picture shows one load later.
- **Each game has its own offline cache** (`games-game-<folder>`), refreshed in place; a `VERSION` bump replaces only the landing page's (`games-shell-<VERSION>`), so updating never empties another game's offline copy.

## Checks

CI is `.github/workflows/ci.yml`, with two required jobs, `fast` and `slow`.

- `scripts/check-fast.sh origin/main`: the secret scan, the spec and project contract checks, then links, the share tags and pictures (`tests/social-previews.test.mjs`), the lockfile (npmjs only), the offline file list and page references, the theme tokens, that previews never bind production data (`scripts/preview-bindings-check.mjs`), and the deploy step's tests. In CI, `fast` also checks the PR title: it starts with a Conventional Commit type (`feat:`, `fix:`, `chore:`, …).
- `scripts/check-slow.sh`: browser tests in `tests/`. Needs `scripts/setup.sh` (`npm ci`), then `npx playwright install chromium`.

Art and sound by [Kenney](https://www.kenney.nl) (CC0). Splat Gallery's lettering is Rye by Sorkin Type, under the [SIL Open Font License](splat-gallery/fonts/OFL.txt). Code is under the [MIT License](LICENSE).

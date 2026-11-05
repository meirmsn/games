# games

Small browser games, built one at a time. They're touch-first (phone, then tablet, then desktop), and the site installs as a PWA that works offline.

- **[Discussion](discussion/README.md):** the direction, game ideas, asset galleries and decisions log behind the games.

## How the site is put together

| Path | What it is |
|---|---|
| `index.html`, `assets/` | The landing page: a tile per game, with sound, light and dark themes, and an install button |
| `manifest.webmanifest`, `sw.js` | The PWA: home-screen install, and offline play once a page has loaded |
| `shared/` | Shared by every game: `sound.js` (sound that works on phones) and `game-shell.js`/`.css` (the back button and full-screen frame) |
| `<slug>/` | One folder per game, holding its `index.html`, code and only the assets it uses |

Run it locally with `PORT=8000 scripts/local-run.sh`, then open http://127.0.0.1:8000/.

## Adding a game

1. Make its folder, e.g. `googly-faces/index.html`. Load `../shared/game-shell.css` and call `mountShell()` from `../shared/game-shell.js`, which adds the back button and sets up sound.
2. On the landing page, turn its tile from `<article class="tile is-soon">` into `<a class="tile" href="googly-faces/">` and remove its "Coming soon" badge.
3. Bump `VERSION` in `sw.js` so returning visitors get the updated landing page.
4. Run `scripts/check-fast.sh` and `scripts/check-slow.sh`.

## Checks

- `scripts/check-fast.sh`: links, offline file list and page references, and the theme tokens.
- `scripts/check-slow.sh`: browser tests in `tests/`. Needs `npm ci && npx playwright install chromium`.

Art and sound by [Kenney](https://www.kenney.nl) (CC0). Code is under the [MIT License](LICENSE).

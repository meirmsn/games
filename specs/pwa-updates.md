# PWA updates: an Update button on the landing page, never in the middle of a game

**Go:** "Go!" 2026-11-10 (to the queue manager's plan); and "CI requires a bump" 2026-11-10 (the version rule, asked during the spec review)

## Intent

The owner, on 2026-11-10: "The games is a pwa? And is it setup thay if new version exists it shows me
button tonupdate? Need to be careful if game is midway". The queue manager proposed the plan this spec
follows, and the owner answered "Go!" (2026-11-10).

Today (`sw.js` v5) updates apply silently: pages are network-first, every other file is cache-first
and refreshes in the background, and a new service worker takes over at once without reloading any
page. That leaves three problems: a returning visitor can run an older script with a newer page for
one load (F-2); an installed PWA that resumes without reloading can stay on old code for days; and
bumping `VERSION` deletes the one cache that also holds every game played, so each game's offline
copy is lost (F-10).

The surface is the landing page (customer-facing): a small notice built from the site's theme tokens
in `assets/base.css` (`--card`, `--card-foreground`, `--border`, `--shadow`, `--radius`, `--space-*`,
`--tap`) and its `.btn .btn-primary`. There is no `DESIGN.md`, so the baseline is the design. The
shared files change (`sw.js`, `assets/site.js`, `assets/site.css`, `index.html`,
`shared/game-shell.js`); no single game's own files do.

## Decisions

- The notice lives on the landing page only. A game page never shows it, never listens for a
  change of service worker, and never reloads for an update; it picks up the new version the next
  time it's opened. Rejected: a notice inside games (it would invite a reload mid-run) (owner,
  2026-11-10, "Need to be careful if game is midway").
- A new version is a new `sw.js`: browsers find an update only when its bytes change, and deploys
  copy the repo as it is (the deploy check compares the live site byte for byte, so nothing can stamp
  it on the way). So the fast check fails when a change touches any file the site serves (anything
  `.assetsignore` doesn't exclude) without changing `VERSION` in `sw.js`
  (`scripts/version-check.py`). Every site change then shows the Update button; the cost is a
  one-line rebase conflict on `VERSION` when changes queue. Rejected: bumping by hand only when it
  matters (owner, 2026-11-10, chose "CI requires a bump").
- A new service worker waits instead of taking over on its own (no `skipWaiting()` at install). The
  landing page's Update button posts it a message to take over; the tab that tapped reloads once,
  on `controllerchange`, guarded by a flag. Other landing tabs hide the notice and don't reload. A
  waiting worker also takes over by itself when every page of the site is closed, as browsers do.
  Rejected: keep silent take-over (no notice, and the installed app lags).
- Detection, on the landing page only, and only when the page already has a controlling worker
  (never on a first visit): `registration.waiting` at load; `updatefound`, then the new worker
  reaching `installed`; and `registration.update()` each time the page becomes visible again
  (`visibilitychange`), its failure offline ignored, so an installed PWA that resumes finds updates.
- No mixed versions (F-2): everything except big media (scripts, styles, JSON, the manifest, pages)
  is fetched network-first, with the cache as the offline fallback. Images, sounds and fonts stay
  cache-first and refresh in the background, so games stay light and play offline. Rejected:
  versioned URLs (`game.js?v=…` or hashed names): the site has no build step and its modules import
  each other by plain relative paths, so every import and every page reference would need rewriting
  on each change, by hand or by a new build; network-first needs no change to any game. The cost is
  one small request per file per load online (a 304 when unchanged); non-page files are fetched with
  `cache: 'no-cache'`, so no stale HTTP-cache copy slips in. Only full `200` responses are cached
  (never `206` range responses). No network timeout: a hung network falls back as today's pages do.
- The cache is split (F-10). `games-shell-<VERSION>` holds the files in `SHELL`, and is the only
  cache a `VERSION` bump replaces. A file under a top-level folder other than `assets/` and
  `shared/` belongs to that game: `games-game-<folder>`, refreshed in place. Anything else not in
  `SHELL` (e.g. `assets/previews/`) goes in `games-site`, refreshed in place. Every fresh copy is
  written to its file's own cache, `SHELL` files to the current shell cache. Activation deletes only
  older `games-shell-*` caches and the old `games-v<N>` cache, never a game's or the site's.
  Rejected: one versioned cache (today's F-10), or one versioned cache per game (a bump would still
  need to name every game).
- The first upgrade from the old worker (whose cache is `games-v<N>`): at install, the new worker
  skips waiting only when a `games-v<N>` cache exists, so this one upgrade is silent like the old
  worker's (the old landing page has no notice to show). At activation it copies every file in the
  old cache that isn't in `SHELL` into its new cache, and deletes the old cache only once every copy
  has succeeded; if a copy fails, the old cache stays and the next activation tries again. Accepted:
  an old `game-shell.js` still running in an open tab may store into any `games-*` cache; lookups
  search every cache, so this is harmless.
- A game opened straight from a link still registers the service worker and caches what it has
  loaded, now by posting the worker the list of URLs to store, each into its own cache.
- The notice is one line of text, "New version available", and an Update button, in a small card
  fixed to the bottom of the screen above the safe area (`env(safe-area-inset-bottom)`), announced
  politely to screen readers (`role="status"`). It appears without animation. While it shows, the
  page gets bottom padding so the last tiles can scroll clear of it. No dismiss button: it's small,
  out of the way, and goes when the update is applied.
- Accepted platform limits: iOS may clear a site's caches after weeks unused, and installed iOS
  apps check for updates unevenly; navigation preload isn't used.

## Acceptance items

- **AC-1** With the landing page open, controlled by a service worker, and a newer `sw.js` deployed,
  the landing page shows a notice reading "New version available" with an Update button at least
  44 px tall and wide, both on the next page load and when the page becomes visible again without a
  reload; with no newer version, and on a first visit, it shows nothing.
- **AC-2** Tapping Update makes the new service worker take over and reloads that landing page
  exactly once, into the new version; the notice is gone afterwards.
- **AC-3** An open game page, in a tab of the same browser as the landing page, never reloads and
  never shows the notice when a newer service worker arrives, including when the landing page in the
  other tab taps Update.
- **AC-4** After a new version is deployed, a page and the script it loads come from the same
  version (each carries a version mark, and they match) on the first online load, both before and
  after tapping Update.
- **AC-5** Online, with everything cached, a page, a script and a stylesheet are requested from the
  network on each load, and an image and a sound are not.
- **AC-6** Bumping `VERSION` and changing one game's script, then updating, leaves another game,
  played before, playable offline without having been opened online again.
- **AC-7** Upgrading from the old worker, with a `games-v<N>` cache holding a played game, takes
  over without the Update button, keeps that game playable offline, and deletes the old cache.
- **AC-8** Offline play still works after an update: the landing page and a game played before both
  open offline.
- **AC-9** The notice's styles use only the site's theme tokens, so it follows light and dark.
- **AC-10** A game page opened straight from a link is cached for offline into its own
  `games-game-<folder>` cache.
- **AC-11** The fast check fails when a change touches a file the site serves without changing
  `VERSION` in `sw.js`, and passes when `VERSION` changed or only unserved files (tests, specs,
  scripts, docs) changed.
- **AC-12** The README's "Adding a game" steps stay as many or fewer, step 4 says to bump `VERSION`,
  and an "Updates" section says how updates reach players — verified by review: read the README's
  "Adding a game" and "Updates" sections.

## Core flow

1. A new version is deployed; the player opens or returns to the landing page.
2. A notice appears at the bottom: "New version available" · Update.
3. They tap Update; the landing page reloads into the new version. Games open in other tabs carry
   on; they get the new version the next time they're opened.

## States

| State                                 | Update notice     |
| ------------------------------------- | ----------------- |
| Landing page, no newer version        | hidden            |
| Landing page, newer version waiting   | shown             |
| Landing page, after tapping Update    | hidden (reloaded) |
| Landing page, another tab tapped it   | hidden            |
| Landing page, first visit (no worker) | hidden            |
| Any game page                         | never shown       |

## Out of scope

- Changes to any single game's own files. A running page that fetches a file after a deploy gets
  the newer file from the network, as any website does; today every game loads its code at
  start-up (Pixel Leap's `import('./monster-atlas.js')` included), so none is affected.
- Removing caches of games that no longer exist (e.g. after a rename); they're small and harmless.
- A "what's new" message or a version number in the notice.

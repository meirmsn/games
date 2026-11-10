# PWA updates: an Update button on the landing page, never in the middle of a game

**Go:** pending

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
`--tap`) and its `.btn .btn-primary`. There is no `DESIGN.md`, so the baseline is the design. No
game page changes.

## Decisions

- The notice lives on the landing page only. A game page never shows it and never reloads for an
  update; it picks up the new version the next time it's opened. Rejected: a notice inside games
  (it would invite a reload mid-run) (owner, 2026-11-10, "Need to be careful if game is midway").
- A new service worker waits instead of taking over on its own (no `skipWaiting()` at install). The
  landing page's Update button tells it to take over, then reloads the landing page. A waiting worker
  also takes over by itself when every page of the site is closed, as browsers do. Rejected: keep
  silent take-over (no notice, and the installed app lags).
- The landing page checks for a new version when it loads and each time it becomes visible again
  (`visibilitychange`), so an installed PWA that resumes finds updates too.
- No mixed versions (F-2): scripts, styles, JSON and the manifest are fetched network-first, with
  the cache as the offline fallback, the same as pages. Images, sounds, fonts and video stay
  cache-first and refresh in the background, so games stay light and play offline. Rejected:
  versioned URLs (`game.js?v=…` or hashed names): the site has no build step and its modules import
  each other by plain relative paths, so every import and every page reference would need rewriting
  on each change, by hand or by a new build; network-first needs no change to any game. The cost is
  one small request per script per load online (a 304 when unchanged); they're fetched with
  `cache: 'no-cache'` so no stale HTTP-cache copy slips in.
- The cache is split (F-10): `games-shell-<VERSION>` holds the precached landing files (`SHELL`) and
  is the only cache a `VERSION` bump replaces; each game's files go in its own `games-game-<folder>`
  cache (the URL's first folder), refreshed in place; anything else (e.g. `assets/previews/`) in
  `games-site`, refreshed in place. Rejected: one versioned cache (today's F-10), or one versioned
  cache per game (a bump would still need to name every game).
- The first upgrade from the old worker (whose cache is `games-v<N>`) moves the played games' files
  out of the old cache into their new per-game caches before deleting it, and takes over silently
  as the old worker did, since the old landing page has no notice to show. From then on, updates use
  the notice.
- A game opened straight from a link still registers the service worker and caches what it has
  loaded, now by asking the worker to store those files in their own caches.
- The notice is one line of text, "New version available", and an Update button, in a small card
  fixed to the bottom of the screen above the safe area, announced politely to screen readers
  (`role="status"`). No dismiss button: it's small, out of the way, and goes when the update is
  applied.

## Acceptance items

- **AC-1** With the landing page open and a newer service worker deployed, the landing page shows a
  notice reading "New version available" with an Update button at least 44 px tall and wide, both on
  page load and when the page becomes visible again without a reload; with no newer version, it
  shows nothing.
- **AC-2** Tapping Update makes the new service worker take over and reloads the landing page once,
  into the new version; the notice is gone afterwards.
- **AC-3** An open game page never reloads and never shows the notice when a newer service worker
  arrives, including when the landing page in another tab taps Update.
- **AC-4** After an update, a page and the scripts and styles it loads come from the same version:
  the first online load after the new version is deployed already runs the new script with the new
  page.
- **AC-5** Images, sounds and fonts are served from the cache when cached (cache-first), and pages,
  scripts and styles from the network when online (network-first).
- **AC-6** Bumping `VERSION` and changing one game leaves another game, played before, playable
  offline without having been opened online again.
- **AC-7** The first upgrade from the old `games-v<N>` cache keeps every game played before playable
  offline, and deletes the old cache.
- **AC-8** Offline play still works after an update: the landing page and a game played before both
  open offline.
- **AC-9** The notice uses only the site's theme tokens, reads in light and dark, and a game page
  opened straight from a link is still cached for offline into its own game cache.
- **AC-10** The README's "Adding a game" steps stay as short or shorter, and the README says how
  updates reach players — verified by review: read the README's "Adding a game" and "Updates"
  sections.

## Core flow

1. A new version is deployed; the player opens or returns to the landing page.
2. A notice slides in at the bottom: "New version available" · Update.
3. They tap Update; the landing page reloads into the new version. Games open in other tabs carry
   on; they get the new version the next time they're opened.

## States

| State                                   | Update notice |
| --------------------------------------- | ------------- |
| Landing page, no newer version          | hidden        |
| Landing page, newer version waiting     | shown         |
| Landing page, after tapping Update      | hidden (reloaded) |
| Landing page, first visit (no worker)   | hidden        |
| Any game page                           | never shown   |

## Out of scope

- Any change to a game. A running page that fetches a file after a deploy gets the newer file from
  the network, as any website does; no game here loads code after start-up in a way that's affected.
- Removing caches of games that no longer exist (e.g. after a rename); they're small and harmless.
- A "what's new" message or a version number in the notice.

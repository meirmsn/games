# Landing page: a home button, and a corner ribbon inviting people to add the site

**Go:** pending

## Intent

The owner, on 2026-11-10: "We should have a nice, maybe subtle way to tell people that they can add it
as a bookmark if they visit on mobile. Well, maybe even on desktop. I don't know if there's like
standard way of doing this. I could imagine a fob or one of those diagonal banners saying to add as a
bookmark or something." And: "Also, on the top left, we should have a button to go back to the home
page, which is the Apex domain, like with no game subdomain. Maybe call it home, or just put a home
icon. We might change it to something cute later."

Asked during the conversation (2026-11-10), the owner chose: a diagonal corner ribbon; in the
bottom-right corner, clear of the header's buttons and gone whenever the Update notice shows; the
home button on the landing page only; both in one PR, right after the PWA-updates PR
(`specs/pwa-updates.md`).

The surface is the landing page (customer-facing): the header and the bottom-right corner, using the
theme tokens in `assets/base.css` (`--primary`, `--primary-foreground`, `--card`, `--border`,
`--shadow`, `--radius`, `--space-*`, `--tap`) and its `.btn` styles. There is no `DESIGN.md`, so the
baseline is the design. No game page changes.

## Decisions

- **Home button:** a house icon, an `icon-btn` like the sound and theme buttons, first in the header
  before "Games", linking to `https://meirmsn.dev/` in the same tab, labelled "Home" for screen
  readers and as its tooltip. Landing page only: inside a game, top left stays the back button to
  the games list (owner, 2026-11-10). Its icon is one inline SVG, so a cuter one later is a one-line
  swap.
- **The ribbon:** a diagonal band across the bottom-right corner reading "Add to home screen": a
  `--primary` band with `--primary-foreground` text. It's fixed to the screen's corner, above the safe area,
  and its band is at least 44 px tall. Rejected: a bottom card like the Update notice, and a line
  under the intro (owner chose the ribbon, 2026-11-10).
- **When it shows:** on the landing page only, from a person's second visit to it or once they've
  opened a game, whichever comes first, counted in `localStorage`. Never when the site is already
  installed (it runs as an installed app, detected by `display-mode: standalone` or iOS's
  `navigator.standalone`), never after "Don't show again", and never while the Update notice shows.
  A first look at the site stays clean.
- **What tapping it does:** it opens a small dialog that fits the device:
  - When the browser can install the site (Chrome, Edge, Android: `beforeinstallprompt` fired), the
    dialog's "Install" button opens the browser's own install prompt.
  - On iPhone and iPad, the dialog says "Tap Share, then Add to Home Screen", with the Share icon
    drawn in.
  - Anywhere else (Firefox, desktop Safari), it says "Press ⌘D (Ctrl+D on Windows) to bookmark this
    page".
  The dialog has "Not now" (closes; the ribbon comes back next visit) and "Don't show again".
  Installing hides the ribbon for good (`appinstalled`).
- The header's Install button stays as it is.

## Acceptance items

- **AC-1** The landing page's header starts with a Home button, at least 44 × 44 px, named "Home",
  linking to `https://meirmsn.dev/`; no game page has one.
- **AC-2** On a first visit to the landing page there is no ribbon; on the second visit, or back on
  the landing page after opening a game, the ribbon reads "Add to home screen" in the bottom-right
  corner, at least 44 px tall, with nothing in the header covered.
- **AC-3** The ribbon never shows when the site runs as an installed app, after "Don't show again"
  (on any later visit), or while the Update notice shows.
- **AC-4** Tapping the ribbon opens a dialog: where the browser offered to install, its Install
  button opens the browser's install prompt; on iPhone and iPad it shows the Share, then Add to Home
  Screen steps; elsewhere it shows the bookmark shortcut.
- **AC-5** "Not now" closes the dialog and the ribbon returns on the next visit; "Don't show again"
  removes it for good; installing the site removes it for good.
- **AC-6** The Home button, ribbon and dialog use only the site's theme tokens and read in light and
  dark.

## Core flow

1. A returning visitor opens the landing page; the ribbon sits across the bottom-right corner.
2. They tap it; a small dialog explains how to add the site on their device, or offers Install.
3. They install, or choose "Not now" or "Don't show again".

## States

| State                                   | Ribbon       |
| --------------------------------------- | ------------ |
| First visit                             | hidden       |
| Second visit, or after opening a game   | shown        |
| Installed app                           | hidden       |
| After "Don't show again" or installing  | hidden       |
| Update notice showing                   | hidden       |
| Any game page                           | never shown  |

## Out of scope

- A home button inside games, and a cuter icon (later, the owner's).
- Changing the header's Install button.
- Counting or reporting how many people install.

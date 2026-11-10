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
(`specs/pwa-updates.md`), whose Update notice this builds on.

The surface is the landing page (customer-facing): the header and the bottom-right corner, using the
theme tokens in `assets/base.css` (`--card`, `--card-foreground`, `--primary`, `--border`, `--shadow`,
`--radius`, `--space-*`, `--tap`) and its `.btn` styles. There is no `DESIGN.md`, so the baseline is
the design. No game page changes.

## Decisions

- **Home button:** a house icon, an `icon-btn` like the sound and theme buttons, first in the header
  before "Games", linking to `https://meirmsn.dev/` in the same tab, named "Home" for screen readers
  and as its tooltip. Landing page only: inside a game, top left stays the back button to the games
  list (owner, 2026-11-10). Its icon is one inline SVG, so a cuter one later is a one-line swap. In the
  installed app, the link leaves the app's scope, so the system opens it in a browser view; accepted.
- **The ribbon:** a diagonal band at 45° across the bottom-right corner, fixed to the screen above the
  safe area (`env(safe-area-inset-bottom)` and `-right`), 44 px tall, about 13rem long, its text
  0.875rem; the band itself is the tap target. Quiet colours: `--card` with `--card-foreground` text,
  a `--border` edge and the `--shadow`, no animation. While it shows, the page gets bottom padding so
  the last tile and the footer can scroll clear of it. Rejected: a bottom card like the Update notice,
  and a line under the intro (owner chose the ribbon, 2026-11-10).
- **Its words:** "Add to home screen" on a touch device (`pointer: coarse`); "Bookmark this site" on
  desktop.
- **When it shows:** on the landing page only, from a person's second visit to it, or after they've
  tapped a game tile, whichever comes first. Visits and tile taps are counted on the landing page in
  `localStorage`; if storage can't be read or written, the ribbon never shows. Never when the site
  runs as an installed app (`display-mode: standalone`, or iOS's `navigator.standalone`), never after
  "Don't show again" or installing, and never while the Update notice shows: the notice hides it, and
  it comes back when the notice goes. An open dialog stays open if the notice appears. A first look at
  the site stays clean.
- **What tapping it does:** it opens a small dialog (`<dialog>`, opened with `showModal()`, Escape
  closes it, focus returns to the ribbon) whose advice fits the device, worked out by one small
  function from the browser's signals:
  - The browser offered to install (`beforeinstallprompt` fired, Chrome, Edge, Android): an Install
    button opening the browser's own prompt. It shares one install function with the header's Install
    button; once the prompt is used, both go.
  - iPhone or iPad (including iPadOS, which reports as a Mac with touch): "Tap Share, then Add to Home
    Screen", with the Share icon drawn in.
  - Another touch device: "Open your browser's menu, then Add to Home screen or Install".
  - Desktop Safari: "Choose File, then Add to Dock".
  - Any other desktop: "Press ⌘D to bookmark this site" on a Mac, "Press Ctrl+D" elsewhere.
  The dialog has "Not now" (closes; the ribbon comes back on a later visit) and "Don't show again".
- **How the device cases are tested:** in Playwright's Chromium, by the signals the function reads:
  a synthetic `beforeinstallprompt` with a stub `prompt()`; an iPhone or iPad user agent with
  `maxTouchPoints`; `pointer: coarse` through touch emulation; `display-mode: standalone` emulated;
  a dispatched `appinstalled`. The real prompts and Share sheets on real devices are checked by hand.
- Accepted: in-app browsers (inside Instagram, Gmail…) may not offer Add to Home Screen; the dialog's
  advice can be wrong there.

## Acceptance items

- **AC-1** The landing page's header starts with a Home button, at least 44 × 44 px, named "Home",
  linking to `https://meirmsn.dev/`; no game page has one; at 320 px wide the header's items stay on
  one line without overflowing.
- **AC-2** On a first visit to the landing page there is no ribbon; on the second visit, or back on
  the landing page after tapping a game tile, the ribbon shows across the bottom-right corner, 44 px
  tall, reading "Add to home screen" on a touch device and "Bookmark this site" on desktop.
- **AC-3** The ribbon covers nothing in the header, and with it showing the last tile and the footer
  can be scrolled clear of it, at 320 × 568, at 390 × 844 and in landscape at 844 × 390.
- **AC-4** The ribbon never shows when the site runs as an installed app, when storage is
  unavailable, after "Don't show again" (on any later visit), after installing, or while the Update
  notice shows, and comes back when the notice goes.
- **AC-5** Tapping the ribbon opens a dialog with the advice for the device: an Install button that
  opens the browser's install prompt where it offered one; the Share, then Add to Home Screen steps
  on iPhone and iPad (an iPad reporting as a Mac included); the browser-menu steps on other touch
  devices; File, then Add to Dock in desktop Safari; ⌘D on a Mac and Ctrl+D elsewhere.
- **AC-6** "Not now" closes the dialog and the ribbon returns on a later visit; "Don't show again"
  removes it for good; installing from the dialog or the header removes the ribbon and both Install
  buttons.
- **AC-7** The dialog closes on Escape and returns focus to the ribbon.
- **AC-8** The Home button, ribbon and dialog use only the site's theme tokens and read in light and
  dark.

## Core flow

1. A returning visitor opens the landing page; the ribbon sits across the bottom-right corner.
2. They tap it; a small dialog explains how to add the site on their device, or offers Install.
3. They install, or choose "Not now" or "Don't show again".

## States

| State                                  | Ribbon      |
| -------------------------------------- | ----------- |
| First visit                            | hidden      |
| Second visit, or after tapping a game  | shown       |
| Installed app                          | hidden      |
| Storage unavailable                    | hidden      |
| After "Don't show again" or installing | hidden      |
| Update notice showing                  | hidden      |
| Any game page                          | never shown |

## Out of scope

- A home button inside games, and a cuter icon (later, the owner's).
- Changing the header's Install button beyond sharing the install function.
- Advice tailored to each in-app browser.
- Counting or reporting how many people install.

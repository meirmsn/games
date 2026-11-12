# Landing page: a home button, and a corner ribbon inviting people to add the site

**Go:** "Go" 2026-11-10 (to build after the PWA-updates PR merges), with "Quiet card colours" and "After a week" 2026-11-10; "go" 2026-11-12 to the changes after the merge (#49)

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
- **Decided after the merge (#49), by the owner (2026-11-11):** a ctrl-, cmd- or shift-click on a
  tile, which opens the game in a new tab, counts as tapping a game: "I think it's good that if they
  control click, it still counts as if they open the game to play." As built.
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
  The dialog has "Not now" (closes; the ribbon stays away for 7 days) and, once "Not now" has been
  chosen before, "Don't show again".
- **Changed after the go, by the owner (2026-11-11), on the PR's screenshots:** "Maybe make the first
  button that don't show again, and then on the not now, the one on the right, to make it easier to
  tap for a right-handed, and also that install button, maybe make it larger and center so that you
  don't hit the not now or don't show again by mistake." Then, the same day, on seeing it: "Actually,
  the note now should be first because it's the first one that you read." So "Not now" sits first
  (left) and "Don't show again" second (right), as before, and Install spans the dialog's width,
  taller than the two below it. The first message also showed the ribbon sliding out of its corner
  while the dialog was open; that was a bug (its corner box could scroll), fixed, not a spec change.
- **Changed after the go, by the owner (2026-11-11), on the PR:** "Can we make it that if you tap the
  not now, like we don't show you the don't show again unless you tap not now, and then whenever we
  show you again this dialogue, which I guess is like 7 days later or something, then we show you the
  don't show again." So the dialog offers "Don't show again" only once the person has chosen "Not
  now" before: the first time, "Not now" alone (and Install where offered); when the ribbon comes
  back after the 7 days, both. AC-6 says so.
- **Changed after the merge (#49), by the owner (2026-11-12):** "on desktop, the alert when you
  tap to bookmark is weird that it only shows not now. Because what if you just want to close it?
  … I think we should change the functionality so that regardless of desktop or mobile or whatever,
  when you tap on the banner, You should get always a close button, which is with the font as now,
  which is like nothing special. You might have the install button depending on certain conditions.
  And that's it. We can show the banner all the time." Then: "I think we can on the first visit not
  show it unless you tap on a game, and we can keep the condition also. If you command click on a
  game as well, we show it. And if it's on command click, we should introduce it with a animation,
  nothing fancy, but just so it doesn't. I mean, maybe just sliding from the side at an angle or
  something, just so it's not abrupt showing up." Asked when it should still hide, the owner chose
  "Installed app + update" (2026-11-12), and said "go" to the summary the same day. So:
  - The dialog has one **Close** button, an outline button like the old "Not now", and the Install
    button where the browser offers one. "Not now", "Don't show again" and the 7-day pause are gone;
    anything they stored is ignored, so the ribbon comes back for people who used them.
  - The ribbon shows from the second visit, or once a game is tapped (a new-tab click too), every
    time after. It stays hidden in the installed app, while the Update notice shows, when storage
    can't be used, and, after installing from a browser tab, for the rest of that visit only.
  - When it appears on a page that's already showing (a ctrl- or cmd-click on a tile, the Update
    notice going), the band slides in diagonally out of its corner, in 0.3 s, easing out. At page
    load it is simply there. The site's reduced-motion rule (`assets/base.css`) cuts the slide to
    nothing.
  AC-4, AC-6 and AC-9 say so; the decisions above about "Not now", "Don't show again" and the
  pause stand as the record of what #49 built (Claude, 2026-11-12).
- The ribbon's quiet card colours and the 7-day pause after "Not now" are the owner's (2026-11-10,
  "Quiet card colours", "After a week"); rejected: the bold accent band, and returning on the next visit.
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
  unavailable, or while the Update notice shows, and comes back when the notice goes. After
  installing from a browser tab it is gone for the rest of that visit, and back on the next one.
- **AC-5** Tapping the ribbon opens a dialog with the advice for the device: an Install button that
  opens the browser's install prompt where it offered one; the Share, then Add to Home Screen steps
  on iPhone and iPad (an iPad reporting as a Mac included); the browser-menu steps on other touch
  devices; File, then Add to Dock in desktop Safari; ⌘D on a Mac and Ctrl+D elsewhere.
- **AC-6** The dialog's only buttons are Close, an outline button that closes it and leaves the
  ribbon showing, and Install where the browser offers one; on every later visit the ribbon shows
  again, whatever was chosen before; installing from the dialog or the header removes the ribbon and
  both Install buttons.
- **AC-7** The dialog closes on Escape and returns focus to the ribbon.
- **AC-8** The Home button, ribbon and dialog use only the site's theme tokens and read in light and
  dark.
- **AC-9** When the ribbon appears on a page that's already showing (after a ctrl- or cmd-click on
  a tile, or when the Update notice goes), its band slides in diagonally from outside its corner, in
  0.3 s; when it shows at page load, it doesn't slide.

## Core flow

1. A returning visitor opens the landing page; the ribbon sits across the bottom-right corner.
2. They tap it; a small dialog explains how to add the site on their device, or offers Install.
3. They install, or close the dialog; the ribbon stays.

## States

| State                                  | Ribbon      |
| -------------------------------------- | ----------- |
| First visit                            | hidden      |
| Second visit, or after tapping a game  | shown       |
| Installed app                          | hidden      |
| Storage unavailable                    | hidden      |
| Installed, rest of that visit          | hidden      |
| Update notice showing                  | hidden      |
| Any game page                          | never shown |

## Out of scope

- A home button inside games, and a cuter icon (later, the owner's).
- Changing the header's Install button beyond sharing the install function.
- Advice tailored to each in-app browser.
- Counting or reporting how many people install.

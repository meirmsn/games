# Social previews: each game shares with its own picture, the landing page with a collage

**Go:** "each game should have its own social media preview, and the game's landing probably should have like maybe a composition, a collage of like a grid of, you know, 2 rows, 3 columns" 2026-11-10; and "I wonder if you can reuse the same tiles that we have on the game selection screen" 2026-11-10

## Intent

The owner, on 2026-11-10: "The social media previews of each of the games is not showing the image
of each of the games, it's just showing some generic, I think it's like a googly eye or something,
but each game should have its own social media preview, and the game's landing probably should have
like maybe a composition, a collage of like a grid of, you know, 2 rows, 3 columns, I guess, with 6
of the games previews in them or something like that." While this was being specced the owner added:
"I wonder if you can reuse the same tiles that we have on the game selection screen."

Why it happens: no page has Open Graph or Twitter card tags (only `description` and `theme-color`),
so link previews fall back to the site icon.

The surface is each page's `<head>` (nothing a visitor sees on the site) and the new share images
in `assets/previews/`. The images use the landing page's tile tones (`--tile-*` in
`assets/base.css`, light theme) and its `--background`, `--card` and `--foreground`. There is no
`DESIGN.md`, so the baseline is the design.

## Decisions

- Every preview is drawn from the game's landing tile (`assets/tiles/<game>.png`, 640×400) by one
  script, `scripts/make-previews.mjs`, in Playwright's Chromium (a canvas, like the tile scripts; no
  new dependency): the tile on its card's tone, centred and scaled to fit 1200×630 the way the
  card shows it (`object-fit: contain`), so nothing in the tile is cut; opaque tiles get bands of
  their tone at the sides, like the card. Re-running it after a tile changes refreshes the preview.
  The owner asked to reuse the tiles (2026-11-10); rejected: a per-game render from each game's own
  code at 1200×630 (more code per game, a second picture to keep in step), and scaling to cover
  (cuts Gotta Go!'s runner and Shooting Gallery's slingshot).
- A tile is pixel art when its landing `<img>` has `class="pixel"` (Gotta Go! today); those are
  scaled without smoothing, the rest smoothed, as the landing page draws them.
- The landing collage is 2 rows × 3 columns of tiles, each scaled to cover its cell, on the page
  background with a thin gutter, and the site name "Game explorations" on a small card centred over
  the gap between the rows. The six, proposed for the owner to swap (one list at the top of the
  script): top row Reef, Googly Faces, Orbit; bottom row Runes, Shooting Gallery, Gotta Go!. Left
  out: Pixel Leap, whose monsters are the smallest thing in any tile and get lost at a third of the
  width.
- Game previews are PNG; the collage is a JPEG, because as a PNG it is 342 KB, and WhatsApp, among
  others, is widely reported to drop link images over about 300 KB. Every image stays under 300 KB.
- Tag text: `og:title` and `twitter:title` are the page's `<title>`; the descriptions are its meta
  description; `og:image:alt` and `twitter:image:alt` describe the picture; `og:type` is `website`
  and `og:site_name` "Game explorations" on every page.
- "Playable game" means a game the landing page links (`<a class="tile" href="…">`); a "coming
  soon" card (High Seas today) isn't one. Crumble (#16), High Seas (#17) and Trundle (#19), in open
  PRs, add their own tags and preview when they merge, because the test then requires them.
- Tags carry absolute URLs on `https://games.meirmsn.dev`: crawlers don't resolve relative image
  URLs. Preview deploys keep pointing at production images, so a new image shows in shares only once
  it is live (a post-merge check). Apps cache a link's image for days; after a picture changes,
  the Facebook Sharing Debugger and LinkedIn Post Inspector re-fetch it. No version query on the
  image URL: rejected as more to keep in step for a rare change.
- `sw.js` `VERSION` is not bumped: the previews aren't precached, crawlers don't use the service
  worker, and a bump empties every visitor's offline copy (F-10).

## Acceptance items

- **AC-1** The landing page and every playable game's `index.html` have, once each and non-empty,
  `og:type`, `og:site_name`, `og:title`, `og:description`, `og:url` (the page's absolute production
  URL, trailing slash included), `og:image`, `og:image:type`, `og:image:width` (1200),
  `og:image:height` (630), `og:image:alt`, `twitter:card` (`summary_large_image`), `twitter:title`,
  `twitter:description`, `twitter:image` (the same as `og:image`) and `twitter:image:alt`. Tested
  by `tests/social-previews.test.mjs`, which the fast tier runs.
- **AC-2** Every `og:image` is an absolute URL on `https://games.meirmsn.dev/` whose path is a file
  in the repo, 1200×630, of the type `og:image:type` says, at most 300 KB; no two pages share one.
  Tested by `tests/social-previews.test.mjs`.
- **AC-3** `scripts/make-previews.mjs` writes each playable game's preview from its landing tile on
  its tone, uncut, and the collage of the six above with the site name; pixel tiles are drawn
  without smoothing — verified by review: run the script, and the PR shows every image.
- **AC-4** `sw.js` is unchanged — verified by review: the diff.

## Out of scope

- Games in open PRs (Crumble, High Seas, Trundle): each adds its own on its merge turn.
- New art: every preview reuses the tile; a better tile is a change to that game's tile script.
- Validating with Facebook's or X's debuggers before the images are live.

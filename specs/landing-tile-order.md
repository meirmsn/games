# Landing page: the games in the owner's order, best first and a strong one last

**Go:** "go" 2026-11-12

## Intent

The owner asked, on 2026-11-12, in chat: "We need to change the order of the games, assuming that
people who visit here might scroll just a little bit or very quickly to the bottom. So we should put
the better games accordingly in that order. So I'm guessing the first position is probably the most
important one Then the second, I don't even know if the third one or the last one. So the ones I
like the least will be Crumble, Googly Faces, which I love how they look, but it's less of a game in
terms of challenge. Then High Seas, because it's probably the most incomplete. Then Orbit, then
Pixel Leap, then Runes, then Reef, then Gotta Go, and then Splat Gallery."

Their ranking, best to worst: Splat Gallery, Gotta Go!, Reef, Runes, Pixel Leap, Orbit, High Seas,
Googly Faces, Crumble. The surface is the landing page's tile list (`index.html`), which is
customer-facing. Only the order of the existing `<li>` items changes. No tile, token or style
changes (there is no `DESIGN.md`).

## Decisions

- The order, top to bottom: Splat Gallery, Gotta Go!, Runes, Pixel Leap, Orbit, Googly Faces,
  Crumble, High Seas, Reef. The reason: the top two spots go to the owner's top two, and the owner's
  #3 (Reef) is the last tile, so someone who flicks straight to the bottom on a phone (one column)
  also lands on a good game. Rejected: strict best-to-worst (Crumble last), and the unplayable High
  Seas last (owner, 2026-11-12, choosing "Strong game last"). On tablets (two columns) the last
  row is High Seas and Reef, and on desktop (three columns) it is Crumble, High Seas and Reef. Reef
  is still the last tile in every layout (Claude, 2026-11-12).
- This supersedes the old order rules: Reef first (`specs/reef.md`), Gotta Go! right after Googly
  Faces (`specs/walk-on-red.md`), and Crumble right after Splat Gallery (`specs/crumble.md`). Those
  three tests in `tests/site.test.mjs` drop their order checks but still check that their tile is a
  playable link. One new test, titled `landing-tile-order AC-1`, checks the full order. The three
  old specs are left as the record of their own changes, and this spec is where the order now lives
  (Claude, 2026-11-12).

- **Changed after the merge (#55), by the owner (2026-11-12):** "Swap Google Faces with Orbit in
  the order." So Googly Faces is fifth and Orbit sixth; AC-1 says so.

## Acceptance items

- **AC-1** The landing page's tiles, read top to bottom in document order, are named Splat Gallery,
  Gotta Go!, Runes, Pixel Leap, Googly Faces, Orbit, Crumble, High Seas, Reef.
- **AC-2** High Seas stays a coming-soon tile, and every other tile is a playable link.
- **AC-3** Each tile keeps its link, art, text and tone — verified by review: the diff to
  `index.html` only moves whole `<li>` items.

## Out of scope

- The social-preview image and its alt text, which show six tiles in a fixed picture.
- Any change to the grid's columns or the tile design.

# Windsock: an airport seen from above, landing into the wind

**Go:** "don't consult with me, just start building after following this process" 2026-11-09

## Intent

The owner's seed (`discussion/direction.md`): "Airport seen from above. A top-down view of an
airport", with Kenney's **Pixel Shmup** pack. Their words for this batch (2026-11-09): "review the
game concept against the guidelines and propose something that works, and then do adversarial
review … so that you have solid concepts of the game and then build them … don't consult with me,
just start building after following this process."

The concept was checked against the game guidelines (`discussion/game-guidelines.md`, on branch
`claude/tender-knuth-m0cjxj` until its PR merges), then attacked twice by a fresh
reviewer; the decisions below are what survived. The surface is a new game page, `windsock/`, and a
new playable tile on the landing page (customer-facing). The game has its own look, the pack's
pixel palette on a grass field, the same in light and dark, like the other game pages; the landing
page keeps the site's tokens.

**Hook:** every plane must land into the wind, and when the windsock swings, the runway ends flip
and the planes in the sky have to turn around.

## Decisions

- Name and slug: **Windsock**, `windsock/`. Rejected: "Crosswind", which names the wrong idea (the
  game is about landing into the wind) (Claude, 2026-11-09).
- Verb: drag from a plane to draw its path; it follows the line exactly and lands when the line
  reaches a live runway end's ring. Line-drawing landing is a genre; the hook is the wind. The path
  is drawn as a pixel contrail, and planes and runways are not colour-matched. Rejected: plain
  "draw a line to the runway", which reads as an existing game with new art (concept attack 1,
  2026-11-09).
- Wind: from one of the four diagonals, so each of the two runways (the long runway up the screen,
  the short dirt strip across it) has exactly one into-wind end. Live ends are marked on the runway
  itself (green rabbit-light chevrons and a lit ring); dead ends are grey and show a cross while a
  line nears them. The windsock is big, beside the runway, and points downwind; clouds, chimney
  smoke and tyre puffs drift with it. Rejected: reading the live end off the sock alone (attack 2).
- Landing page: the Windsock tile is a playable link, placed after Googly Faces and before the
  coming-soon tiles (8 tiles). Its picture, `assets/tiles/windsock.png`, is a capture of the game's
  own field; it joins `SHELL` in `sw.js`, whose `VERSION` is bumped (Claude, 2026-11-09).
- A downwind end refuses on both runways. "Refuses" means the line doesn't snap to its ring and the
  ring shows a grey cross while the line's head is near; the strip refuses the same way before 08:00
  and for heavies. Rejected: tailwind landings at half points, which made
  amber mean two things and needed ground rules no one could read (attack 2).
- Drift: only planes without a line (and circling ones) are pushed downwind; a plane on a line
  follows it within 2 art px, its nose crabbed into the wind as a look. Rejected: drift on drawn
  lines, which punishes input, not skill (attack 2).
- Collisions: two airborne planes that touch collide; two planes rolling on the ground collide (the
  two runways cross); a plane in the air and one on the ground never do (the shadow shows height).
  A collision stops play: about 1 s of slow motion with no input, the two planes ringed, then a
  card naming the hour on the clock, "Retry <that hour>" or "New shift". The snapshot taken as each
  hour begins holds the score, landed and diverted counts, the wind, and every plane with its
  position, fuel and line; Retry restores it, resets the streak to ×1 and rebuilds that hour's
  arrivals from the seed with the assist's stretch. A swing in progress is restored to the wind of
  the hour's start. Conflict warning: two planes in the same layer (both in the air, or both on the
  ground) whose positions, extrapolated along their current velocity, would come within separation
  (the sum of their hit radii) in the next 2 s get red rings and a red line between them. Red means conflict only; amber means the wind is
  about to change, only (attack 1).
- Structure: a morning shift of five hours of 45 s, 06:00–11:00, about 4 minutes, short-form. One
  new thing per hour, shown not told: 06:00 small props and the long runway (the strip is closed,
  marked with yellow crosses); 07:00 the first wind swing; 08:00 the strip opens; 09:00 heavies
  (four-engine, slower, worth 3×, long runway only); 10:00 rush hour (shorter gaps, more planes).
  One swing per hour from 07:00, 20 s into the hour, 90° (one runway flips) or 180° (both), picked
  by the seed (the 07:00 swing always flips the long runway, as the strip is still closed), with a
  5 s warning (the sock
  shivers, a gust, the soon-live ends blink amber) and a 5 s lull in arrivals after it. Lines to an
  end that just died are dropped and those planes circle until redrawn; planes past the ring are
  committed and land. Rejected: a run that ends on the first crash with nothing to retry, which
  costs up to four minutes (guidelines: a loss costs at most the last minute or so).
- Portrait, one thumb. Touch draws with the line's head 44 CSS px above the finger (blended in
  over the first 24 px of drag), so the finger never hides it; a mouse has no offset. Grabbing picks
  the nearest plane within 22 CSS px (a 44 px hit area). One drawing finger at a time; a second
  finger is ignored. Drawing has no keyboard path; the buttons take the keyboard.
- Fuel: an arc around each plane drains and blinks when low; an empty plane diverts (flies off,
  fading, collides with nothing, no points). Points: prop 10, heavy 30; landings within 6 s of the
  previous one build a streak that multiplies them, ×2 up to ×5.
- Arrivals: each shows an arrow at the edge 3 s ahead; an entry that would come within separation
  of another plane in its first 4 s is moved along the edge. The day's seed sets the traffic and the
  wind: `#day=N` (default: the local date's day count from 2026-01-01 as day 1; a
  `#day` outside 1–9999 falls back to it), shown on the start card as "Day N"; "Another day" picks a
  random one.
- Hidden assist: each retry of an hour stretches that hour's arrival gaps by 8%, up to 25%, and
  resets when the hour is passed. Nothing shows it.
- Small memory, in localStorage `windsock`: the best score per day (only shifts started at 06:00
  count) and the 09:00 start, unlocked by finishing a shift started at 06:00. Losing it costs nothing you'd miss. No save game.
- Edge rules: a plane past its ring, rolling or diverting can't be grabbed; a line being drawn when
  the swing lands keeps going, but one already snapped to a now-dead end is dropped and the plane
  circles; during the warning a line may snap to a soon-live end, and a plane that reaches it before
  the swing circles there instead; a line's points are clamped to the field; a plane that reaches
  the end of a line that doesn't end in a ring flies straight on and turns back at the field's edge
  margin; a diverting plane's line is removed; hiding the page cancels a drag; a resize rescales the
  view while the field keeps its own coordinates (art px), so lines and planes stay put.
- Simulation: a fixed step of 1/120 s, run as many times as the frame's time needs (capped), so 60
  and 120 Hz screens play the same game; the pixel ratio is capped at 2.
- Interruptible: the page hidden pauses play and sound; coming back shows a Resume card, and nothing
  moves until it's tapped.
- Sound (MP3, from Kenney's audio packs): grab, snap, touchdown thud and tyre squeak, streak, gust
  warning, the swing, conflict alarm, crash, divert, the hour bong, the end jingle and a music loop,
  under the site-wide mute, with a mute button as in Reef (`createSound`'s `muted`, `aria-pressed`).
- Targets to tune by playing: the first landing within 10 s of Start; the first new element (the
  first swing) at about 07:00; the first failure, for most players, at 08:00 or later. Knobs at the
  top of `game.js`: hour length, gaps and caps per hour, speeds, turn rates, fuel, warning and lull
  lengths, separation, drift, the finger offset.
- Not a copy: no other game's names, levels, characters or look; the art is Kenney's CC0 pack and
  the runways are drawn in its palette (Claude, 2026-11-09).

## Acceptance items

- **AC-1** The landing page shows 8 tiles, with a playable Windsock tile linking to `windsock/` —
  `tests/site.test.mjs`.
- **AC-2** Behind the start card the field is alive before any touch: planes and clouds move, and
  the HUD is hidden; the start card shows "Day N" — `tests/windsock.test.mjs`.
- **AC-3** A touch drag from near a plane draws its line, with the line's head 44 ± 2 CSS px above
  the finger once the drag passes 24 px; a mouse drag draws under the pointer; a touch within 22 CSS
  px picks the nearest plane — `tests/windsock.test.mjs`.
- **AC-4** A line that reaches a live end's ring snaps to it, and the plane lines up, touches down,
  rolls out and is counted: the score and the landed count go up — `tests/windsock.test.mjs`.
- **AC-5** For each of the four wind directions, the live ends are the into-wind ends (wind from
  the north side: the long runway's south end; from the east side: the strip's west end, and the
  mirror cases); a line taken to a dead end does not snap — `tests/windsock.test.mjs`.
- **AC-6** The strip refuses every plane before 08:00 and refuses heavies always; heavies first
  arrive at 09:00 — `tests/windsock.test.mjs`.
- **AC-7** A wind swing, 20 s into each hour from 07:00: 5 s before, the warning starts (amber on the soon-live ends, the gust);
  then the wind turns by 90° or 180°, lines to now-dead ends are dropped and those planes circle,
  a plane past its ring still lands, and no plane arrives for 5 s after — `tests/windsock.test.mjs`.
- **AC-8** A plane without a line drifts downwind; a plane on a line stays within 2 art px of it —
  `tests/windsock.test.mjs`.
- **AC-9** Two airborne planes that touch end play with the collision card naming the hour; Retry
  restores the planes, score and wind as they were at that hour's start; New shift starts at 06:00;
  a plane in the air over one on the ground does not collide; two on the ground do —
  `tests/windsock.test.mjs`.
- **AC-10** Two airborne planes whose extrapolated positions would touch within 2 s are both marked
  as in conflict; a plane in the air and one on the ground never are —
  `tests/windsock.test.mjs`.
- **AC-11** Fuel drains; a plane that runs out diverts: no points, the diverted count goes up, and
  it collides with nothing — `tests/windsock.test.mjs`.
- **AC-12** Landings within 6 s of each other multiply: the second lands ×2, the third ×3, capped at
  ×5; a gap over 6 s resets it — `tests/windsock.test.mjs`.
- **AC-13** The shift runs 06:00 to 11:00 in five hours with their new elements (no swing in the
  06:00 hour, one in each later hour), then shows the done card with score, landed, diverted and the
  day's best — `tests/windsock.test.mjs`.
- **AC-14** The same `#day` gives the same arrivals and starting wind; a different day gives
  different ones; "Another day" changes the day — `tests/windsock.test.mjs`.
- **AC-15** The day's best from shifts started at 06:00 is kept and shown; finishing a shift unlocks "Start at 09:00", which
  starts the shift at 09:00; with storage blocked the game still plays — `tests/windsock.test.mjs`.
- **AC-16** Every arrival shows its arrow at least 3 s before the plane appears, and no plane enters
  on a course that comes within separation of another in its first 4 s — `tests/windsock.test.mjs`.
- **AC-17** Each retry of an hour stretches that hour's arrival gaps by 8%, up to 25% —
  `tests/windsock.test.mjs`.
- **AC-18** Hiding the page pauses play; on return the Resume card shows and nothing moves until it
  is tapped — `tests/windsock.test.mjs`.
- **AC-19** At 360×640 and 390×844 the whole field, all four rings included, sits inside the screen
  below the HUD, with no scrolling; the same 20 s of play run at 60 Hz and at 120 Hz
  frames ends with the same landed count and score, and every plane within 0.5 art px — `tests/windsock.test.mjs`.
- **AC-20** A landing plays the touchdown sound, and the mute button mutes the site-wide sound —
  `tests/windsock.test.mjs`.
- **AC-21** While one finger draws, a second finger draws nothing and changes no line —
  `tests/windsock.test.mjs`.
- **AC-22** Each state shows only its own card and HUD, as in the state table —
  `tests/windsock.test.mjs`.

## Core flow

1. Tap the Windsock tile: planes circle over the airfield behind a small start card.
2. Tap Start.
3. Drag from each plane to a runway end lit green; when the windsock swings, redraw for the new ends.
4. Finish the shift at 11:00 (or retry the hour after a collision) and see the score.

## States

| State | Start card | Collision card | Done card | Resume card | HUD (clock, score) |
| ----- | ---------- | -------------- | --------- | ----------- | ------------------ |
| Start (the field moves behind) | shown | hidden | hidden | hidden | hidden |
| Playing | hidden | hidden | hidden | hidden | shown |
| Crashing (about 1 s of slow motion, no input) | hidden | hidden | hidden | hidden | shown |
| Collision | hidden | shown, naming the hour | hidden | hidden | shown |
| Done | hidden | hidden | shown, with score, landed, diverted and best | hidden | shown |
| Paused (page came back) | hidden | hidden | hidden | shown | shown |

## Out of scope

- Later slices (the first slice is this spec): storms that drift through; departures and taxiing to
  gates; an afternoon and night shift with runway lights; daily weather (calm, breezy, gusty); more
  airport layouts; sky light moving through the day; a close-call bonus; drawing with two fingers
  at once.
- Leaderboards, accounts, a pause menu, settings beyond the site-wide mute.

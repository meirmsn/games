# Shoo!: an airfield seen from above, where you shoo the birds off the runways

**Go:** "come up with 20 different concepts, different directions, then do an adversarial review to pick one that goes along with our guidelines for a game, and do that" 2026-11-09

## Intent

The owner's seed (`discussion/direction.md`): "Airport seen from above. A top-down view of an
airport", with Kenney's **Pixel Shmup** pack. A first concept (Windsock, an air-traffic game of drawn
landing lines) was built, then replaced at the owner's word (2026-11-09): "This game concept, it's
from a while ago. Maybe we can do something else a little bit more, a little bit different. So come
up with 20 different concepts, different directions, then do an adversarial review to pick one that
goes along with our guidelines for a game, and do that." Earlier the same day, on the look: "All the
UI elements should not be smooth. They should also be 8-bit to go with the art of the game."

Twenty directions were screened against the game guidelines (`discussion/game-guidelines.md`); four
were shortlisted (Pushback, Bird Strike, Skywriter, Air Show) and a fresh reviewer attacked them. Bird
Strike won: the only one alive before the first touch and new to the site in verb (herding),
structure (a timed shift of landings) and failure (a holding stack that fills). The decisions below
are its fixes. The surface is a new game page, `shoo/`, and its tile on the landing page
(customer-facing). Windsock was built earlier on this change's branch and never merged; Shoo! takes
its place, so against `main` the change adds one game and one tile. The game has its own 8-bit look, the same in light and dark.

**Hook:** shoo the birds off the runways before each plane lands.

## Decisions

- Name and slug: **Shoo!**, `shoo/`; nothing of Windsock (built on this branch, never merged) stays. Rejected:
  "Bird Strike", which promises a crash the game never shows (Claude, 2026-11-09).
- Verb: herding with a scarer, the pack's reticle. On touch it sits 64 CSS px above the finger and
  moves with it, so the finger never covers the birds; with a mouse it sits at the pointer; the arrow
  keys or WASD move it (Shift: fast). It scares only while a finger, the mouse button or a move key is
  down. One finger at a time; a second is ignored.
- The scarer's speed is measured over the last 100 ms of its movement, and counts as slow for the
  first 100 ms of each press (so the jump to the finger never scares); keys move it at 50 art px/s, or
  140 with Shift. It stays inside the field, and the resume tap never scares. Planes ignore it; it is
  drawn on top of everything.
- Speed is the skill: a slow scarer (under 70 art px/s) makes ground birds within its radius walk
  away from it, staying on the ground and together; a fast one makes gulls and starlings panic and fly
  off, landing 2–4 s later at a spot shown by a shadow for the whole flight. Geese never fly: they walk
  away from a slow scarer and ignore a fast one. A gull's landing spot is picked within its flight
  range and biased toward the bins; a starling's is farther, away from the scarer; then the runway
  rule below applies. Birds slide along the field's edges and never leave it. Rejected: one fear response, which is whack-a-mole
  with no mastery (concept attack, 2026-11-09).
- Birds can be got rid of: a bird chased in flight toward the field's edge (its flight would end
  within 6 art px of the left, right or top edge) flies off and is gone, with no landing shadow.
  So each moment offers a choice: walk a flock slowly just off the runway (quick, but it drifts back)
  or flush it toward the edge (more work, but it stays gone). Each hour caps the birds on the field
  (14, 18, 22, 28): a flock arrives only while there's room. Found by playing: without a way out,
  birds piled up on the runways and the pressure only climbed (Claude, 2026-11-09).
- The shift's first landing comes 5 s later than the others would, to learn the reticle.
- Birds drift back: an idle ground bird walks slowly toward the nearest open runway ("warm tarmac"),
  so they come back steadily, never suddenly. Gulls that panic fly toward the bins by the terminal.
  Birds are drawn as pixel art in the pack's palette (the pack has none): gull (white, grey back),
  goose (bigger, brown, black neck), starling (dark, with a light outline so it reads on asphalt);
  the runways are pale asphalt so birds on them stand out.
- "On a runway" means a bird's centre pixel is inside the runway's asphalt rectangle (drawn with a
  dark edge): within half its width of the centreline, from its top end to its bottom end. It is
  checked once, at the decision instant. A flying bird counts by its landing spot, never by where it
  is flying over.
- Fairness: no bird the player didn't move may come onto a runway whose decision is within 3 s: an
  idle bird's drift stops at the runway's edge, arriving flocks land off the runways, and a bird
  fleeing a plane lands off any such runway. Decisions on the two runways are always at least 4 s
  apart. After a green decision that runway is closed to drift until its plane turns off.
- Planes: each comes down its runway's approach from the top edge with a shadow and a pixel countdown
  to its decision point, 3 s before touchdown, while the runway's threshold lights blink amber. At the
  decision point, a runway with a bird on it (on the ground, or a flying bird whose landing spot is on
  it) sends the plane round: red lights, the plane climbs away and joins the hold. Otherwise green
  lights and the points (scored at the decision), then it touches down, rolls out and turns off to
  the terminal. Any bird within 30 art px ahead of a rolling plane, or beside its path, gets out of
  its way (gulls and starlings fly, geese hurry off sideways), so no bird is ever hit. A heavy's
  approach is shorter, but its countdown is still 3 s. A flying bird never picks a landing spot on a runway whose next decision falls
  within its flight time plus 1.5 s.
- The hold: a plane that went round circles in the hold at the top and comes back 15 s later on the
  same runway (keeping the 4 s spacing). The hold takes three; a fourth ends the hour: a card names
  the hour, "Retry <hour>" restores the whole game as it was when that hour began (birds with their
  flights and landing spots, planes, the hold and its timers, score, streak, the random state), or
  "New shift". A loss costs at most one hour (75 s).
- The hour's end: no approach starts so late that its decision would fall after the hour; planes in
  flight finish; the hold carries over. At 10:00 the shift ends once no plane is left, held ones
  included. Rejected: ending the whole shift on one go-around.
- Points: a clean landing is 10 × the streak (consecutive clean landings), capped at ×5; a go-around
  resets the streak.
- Structure: a morning shift of four hours of 75 s, 06:00–10:00, about 5 minutes, short-form,
  portrait. Each hour opens with a few quiet seconds and adds one thing: 06:00 one runway and gulls;
  07:00 the second runway; 08:00 geese; 09:00 starlings and heavy jets, which come in faster. Rejected:
  daily seeds, wind, more airfields, a splitting murmuration (later slices).
- Small memory, in localStorage `shoo`: the best score, the best streak and the furthest hour
  reached, which unlocks "From <hour>" on the start card; `#hour=N` (1–4) in the URL starts there.
  Losing it costs nothing you'd miss. With storage blocked the game still plays.
- Hidden assist: an hour's gaps between landings are multiplied by 1 + min(0.08 × n, 0.25), where n
  counts that hour's retries in this shift; passing the hour or a New shift resets it.
- Interruptions never drop you into danger: on Resume, any decision less than 3 s away moves back
  to 3 s.
- Interruptible: the page hidden pauses play and sound; coming back shows a Resume card, and nothing
  moves until it's tapped.
- 8-bit throughout (the owner's words above): the scene is drawn at the art's own resolution and
  enlarged with no smoothing; every mark (reticle ring, shadows, lights, digits) is plotted pixel by
  pixel; the HUD, cards and buttons use Kenney Mini Square, square panels with stepped corners and
  hard bevels, at least 44 px.
- Sound (MP3, from Kenney's audio packs): a flutter when birds lift, a chirp when they walk off, the
  approach chime, a clean-landing thud, the go-around engine, the hour bong, the hold-full alarm, the
  end jingle and a music loop, under the site-wide mute.
- Targets to tune by playing: the first clean landing within 15 s of Start; a newcomer's first
  go-around around 60–90 s; the first new element (the second runway) at 75 s. Knobs at the top of
  `game.js`: hour length, landing gaps, approach times, fear radius, the walk/panic speed, walk and
  pull speeds, flight times, flock arrivals, hold size.
- Landing page: the Shoo! tile is added after Googly Faces, making 8 tiles; its picture,
  `assets/tiles/shoo.png`, is a capture of the game and joins `sw.js` `SHELL` (`VERSION` bumped).
- Not a copy: herding is a genre; the names, airfield and birds are our own, in Kenney's CC0 art.

## Acceptance items

- **AC-1** The landing page shows 8 tiles, with a playable Shoo! tile linking to `shoo/` after Googly
  Faces — `tests/site.test.mjs`.
- **AC-2** Behind the start card the field is alive before any touch: birds move and a plane comes in
  to land; the HUD is hidden — `tests/shoo.test.mjs`.
- **AC-3** On touch the reticle sits 64 ± 2 CSS px above the finger and follows it; with a mouse it
  sits at the pointer; the arrow keys move it at 50 art px/s (140 with Shift); it scares only while
  held, never in the first 100 ms of a press as a fast scarer, and stays inside the field; a second
  finger moves nothing — `tests/shoo.test.mjs`.
- **AC-4** A slow scarer makes ground birds within its radius walk away from it and stay on the
  ground — `tests/shoo.test.mjs`.
- **AC-5** A fast scarer makes gulls and starlings in its radius fly off, each with a landing spot,
  landing 2–4 s later; one chased toward the field's edge flies off and is gone; geese never fly,
  and ignore a fast scarer; a flock arrives only while the hour's bird cap has room — `tests/shoo.test.mjs`.
- **AC-6** A flying bird never picks a landing spot on a runway whose next decision is within its
  flight time plus 1.5 s; an idle bird's drift, an arriving flock and a bird fleeing a plane never
  bring a bird onto a runway whose decision is within 3 s; decisions on the two runways are at least
  4 s apart — `tests/shoo.test.mjs`.
- **AC-7** At a plane's decision point, 3 s before touchdown: with a bird on its runway (or landing
  there) it goes round and joins the hold; with none it lands, scores and adds to the streak; a
  countdown shows before the decision — `tests/shoo.test.mjs`.
- **AC-8** A plane in the hold comes back to the same runway 15 s after going round; a fourth plane
  in the hold ends the hour with a card naming it; Retry restores the hour's start (birds, planes,
  score); New shift starts at 06:00 — `tests/shoo.test.mjs`.
- **AC-9** Clean landings score 10 × the streak, capped at ×5; a go-around resets the streak —
  `tests/shoo.test.mjs`.
- **AC-10** The shift runs four hours of 75 s: the second runway opens at 07:00, geese from 08:00,
  starlings and heavies from 09:00; after 10:00 the done card shows the score, clean landings,
  go-arounds and the best streak — `tests/shoo.test.mjs`.
- **AC-11** An idle ground bird off the runways drifts toward the nearest open runway, no faster than
  the pull speed — `tests/shoo.test.mjs`.
- **AC-12** Birds ahead of or beside a rolling plane get out of its way, and no bird's centre is
  ever inside a moving plane's footprint — `tests/shoo.test.mjs`.
- **AC-13** The best score, best streak and furthest hour are kept; "From <hour>" starts there, as does
  `#hour=N`; with storage blocked the game still plays — `tests/shoo.test.mjs`.
- **AC-14** Each retry of an hour multiplies its landing gaps by 1 + min(0.08 × retries, 0.25) —
  `tests/shoo.test.mjs`.
- **AC-15** Hiding the page pauses play; on return the Resume card shows and nothing moves until it
  is tapped; after Resume no decision is less than 3 s away — `tests/shoo.test.mjs`.
- **AC-16** At 360×640 and 390×844 the whole field, both runways included, fits below the HUD with no
  scrolling; the same 20 s of play run at 60 Hz and at 120 Hz frames ends with the same score and every
  bird and plane within 0.5 art px — `tests/shoo.test.mjs`.
- **AC-17** A clean landing plays the landing sound, and the mute button mutes the site-wide sound —
  `tests/shoo.test.mjs`.
- **AC-18** Each state shows only its own card and HUD, as in the state table —
  `tests/shoo.test.mjs`.
- **AC-19** The UI is 8-bit: the HUD, cards and buttons use the pixel font with no rounded corners,
  blur or soft shadows; the canvas is enlarged with no smoothing; the marks drawn over the field in a
  live scene (birds, shadows, reticle, lights, countdown, points) use only the flat alpha values the
  code declares, so nothing has an anti-aliased edge — `tests/shoo.test.mjs`.
- **AC-20** With 150 birds on the field, the median time of 100 frames (each a frame's simulation
  steps and its drawing) is under 8 ms in the test browser — `tests/shoo.test.mjs`.

## Core flow

1. Tap the Shoo! tile: birds peck about the airfield and a plane lands, behind a small start card.
2. Tap Start.
3. Sweep the reticle slowly to walk the birds off a runway before its plane's countdown ends.
4. Finish the shift at 10:00 (or retry the hour if the hold fills) and see the score.

## States

| State | Start card | Hold-full card | Done card | Resume card | HUD (clock, score, hold) |
| ----- | ---------- | -------------- | --------- | ----------- | ------------------------ |
| Start (the airfield moves behind) | shown | hidden | hidden | hidden | hidden |
| Playing | hidden | hidden | hidden | hidden | shown: the clock, score, streak (from ×2) and three hold slots |
| Hold full | hidden | shown, naming the hour | hidden | hidden | shown |
| Done | hidden | hidden | shown, with score, clean landings, go-arounds and best streak | hidden | shown |
| Paused (page came back) | hidden | hidden | hidden | shown | shown |

## Out of scope

- Later slices: a daily seed; wind and reversing the approach; more airfields; a murmuration that
  splits; endless mode; movable bins.
- Any bird strike, crash or explosion: birds are never hit.
- Leaderboards, accounts, settings beyond the site-wide mute.

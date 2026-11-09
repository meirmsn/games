# Tag Along: a lane-crossing game on the Pixel Vehicle Pack

**Go:** "don't consult with me, just start building after following this process" 2026-11-09

## Intent

The owner asked, on 2026-11-09, for a batch of games built in parallel: "review the game concept
against the guidelines and propose something that works, and then do adversarial review … so that
you have solid concepts of the game and then build them … don't consult with me, just start building
after following this process." This game's seed was "a lane-crossing arcade game using **Pixel
Vehicle Pack**", which the owner described as "Frogger style": the genre is fine, that game's name,
frog, levels and look are not, the hook has to be our own, it is short-form, and it must not be pure
timing: the player chooses the risk. The assets come from the private asset repo
(`meirmsn/games-private`), CC0.

The surface is a new game page, `tag-along/`, and a new playable tile on the landing page. The game
has its own look (pixel streets, one palette per street, the same in light and dark), like Reef; the
landing page keeps the site's tokens. There is no `DESIGN.md`, so the baseline is the design.

**Hook:** lead a line of pedestrians across rush hour; they follow your exact path, a step behind.

### Concept check

- **Verb:** step one cell (tap, swipe or hold); the leader hops and the line patters along the same
  path behind.
- **A typical 5-second choice:** three followers are still crossing behind you and a van comes in
  their lane: wait on the median so they close up behind you, or go on and hope they clear the lane
  first; or pick up one more person on the kerb before stepping in, for a bigger payout and a longer
  line in the road.
- **How it teaches:** street 1 has three slow lanes, one person waiting next to the leader and
  others along the kerb; the first arrival pops "+1" and time; the line's payout shows over the
  kerb before it is earned. Each street brings one new thing.
- **Three clocks:** every step and every passing car (seconds); a new street with a new rule every
  minute or so (minutes); the best score and the streets reached, which a run can start from
  (return).
- **Expert vs beginner:** a beginner ferries one or two people; an expert threads a line of eight
  through staggered gaps, zig-zagging and pausing on the median. The payout of 1 + 2 + … + n shows
  it (36 against 3).
- **Tenth play vs first:** a later start, reading the lane lights and the tail's lag, and longer
  lines.
- **Form:** short-form, runs of 1–5 minutes on a clock, because it is an arcade crossing game you
  play in a spare minute.
- **Orientation:** portrait: the lanes stack up the screen and the thumb taps and swipes. Desktop
  shows the same portrait street in the middle of the screen.
- **What a failure costs:** a hit sends that crossing's people back to their kerb (still waiting,
  not lost) and costs a few seconds; a whole run is at most about five minutes.
- **Save-game stand-in:** the best score, the hidden assist and the furthest street reached, in
  localStorage; a run can start at any street reached.
- **Riskiest technical part:** readable, fair pixel sprites at phone size; proved first with one
  street at 390×844 and screenshots.

## Decisions

- **Name and hook:** "Tag Along", slug `tag-along`. The leader is a crossing guard in hi-vis holding
  a round lollipop sign; the line follows. Rejected: anything with a frog, logs, turtles, homes on
  the far bank or a hopping animal, and Crossy Road's endless forward scroll and look (Claude,
  2026-11-09, after the adversarial review).
- **View:** side-on at a slight angle: kerbs at the top and bottom, lanes stacked between them,
  the pack's side-view vehicles driving left and right, drawn row by row from the top so nobody is
  hidden behind a vehicle in a nearer lane. The play area is 12 columns of 12 art pixels, scaled to
  the screen (a fractional scale, smoothing off, so pixels stay sharp). Rows are 22 art pixels tall,
  so a person (15) or a bus (21) stands inside its own row; rows are drawn from the top, vehicles
  then people in each row. The street is simulated in fixed world coordinates: vehicles enter 80 art
  pixels beyond the play area's edge whatever the screen, and a resize changes nothing in the game.
  Only the 12 columns are drawn, on every screen: on a wide one the street sits in the middle with
  plain background either side, so cars enter at the street's own edges (Claude, 2026-11-09, from
  the spec review; changed after the go by the owner, 2026-11-09: "when I play on desktop, there
  are like two gray zones on the left and the right, and you can see the cars showing up randomly
  in them … those should be hidden. If this game is supposed to be portrait").
- **The line follows on its own:** the leader's path is a trail, and each follower walks it on their
  own, one cell every 0.18 s, stopping one cell behind the person ahead (so a stopped leader's line
  closes up behind it instead of freezing across the lanes). Before stepping from a kerb or the
  median into a lane, a follower looks: they wait while a vehicle would reach that cell within 1 s.
  In the road they wait only when a vehicle would reach the next cell within 0.5 s and none would
  reach the one they stand on; otherwise they keep walking. Measured with a scripted player after
  this change: runs of 1.5–3.5 minutes, 5–24 followers knocked down a run (from 10–38 before the
  road look), and bold leading reaching street 4. The leader is never blocked by its own line: it can walk back
  through its followers; only the street's edges stop it. When someone leaves the line (arriving or
  knocked down) the people behind keep walking. Hits count at the cell a person steps into from the
  moment of the step, not after the tween. Changed after the go by the owner, 2026-11-09, replacing
  the snake rule (followers moved only when the leader stepped, and the leader couldn't step onto
  its line): "if I move to the left or the right and I get to the edge of the screen, I cannot
  return. Like, why am I blocked? … you collect a bunch of people in the line with you and then you
  have to move really, really, really fast, and it's impossible. They always hit them. And on top of
  it, when you get to the other side, you also need to move to the side so that it keeps bringing
  the people"; the owner chose this fix ("All of it").
- **Pickups never put anyone in the road:** people wait on both kerbs, each wanting the other side,
  shown by a small arrow over their head. Walking into the cell next to one (left or right on the
  kerb, or the leader's cell) asks them to join: they join at the end of the line only when nobody in
  the line is in a lane, stepping from where they wait into the kerb (or median) cell in front of
  them, which becomes the start of their path; until then they wave and wait. People wait on the sidewalk's back edge, not in the walking cells, so they never
  block a step. At most six wait on each kerb and a new one comes every 3 s while there's room. On the
  streets with a median, up to two people wait on it, each with a random destination kerb shown by
  their arrow (Claude, 2026-11-09, from the reviews).
- **Arrival and scoring:** a follower who reaches their destination kerb arrives there on their own,
  leaves the line and walks off; the leader doesn't have to walk along the kerb to bring them in
  (changed after the go by the owner, 2026-11-09, as above). Arrivals are counted per crossing (the count resets when the leader steps off a kerb
  into a lane; the median never resets it, and neither does a hit): the 1st arrival of a crossing scores 1, the 2nd 2, the nth n, so a line of n pays
  n(n+1)/2. While the line is in the road its payout ("×4 · +10") shows at the leader's destination
  kerb (Claude, 2026-11-09, from the review).
- **The clock:** a run starts with 45 s. It runs down in real time from the first step; the nth
  arrival of a crossing adds 0.5 + 0.5 × n s, and each new street adds 10 s (the release after a
  street's push). One person at a time loses time; four or five about hold steady; longer lines gain.
  A close call (a vehicle passing within half a cell of a follower or the leader without hitting: the
  horizontal gap between them in the same lane, once per vehicle and person, at most 1 s per crossing)
  adds 0.3 s. The run ends at zero. Tuning targets: a beginner's run lasts 1–3 minutes and reaches
  street 2; a good run reaches street 4 in about 4 minutes; gathering more people before a crossing
  scores more than ferrying them one by one. Measured before the PR with a scripted player that reacts
  every 0.25–0.4 s and doesn't plan its tail: runs of 70–110 s reaching street 2, and 10 points
  ferrying one at a time against 78 gathering eight. The knobs are `START_CLOCK`, `STREET_BONUS`, the
  arrival formula, and each lane's speed, gaps, platoon and lull lengths. Changed after the go under
  the owner's own instruction in the batch brief, 2026-11-09: "Tune it until it meets the targets
  your concept set." The spec at the go had a 40 s start, 0.5 × n s per arrival and no street bonus;
  playing showed runs ending inside a minute, so AC-1 (45 s), AC-5 (0.5 + 0.5 × n s) and AC-10
  (+10 s per street) changed with these numbers.
- **Hits:** a vehicle overlapping a person's cell (vehicle boxes 20% narrower than their art, people
  5 art pixels wide) hits them. A hit follower tumbles (the pack's fall and down frames), then walks
  back to the kerb they came from and waits again; the line closes up. A hit leader tumbles and the
  whole line scatters back to where they waited (kerb or median); the leader returns to the kerb it
  last left, 1.5 s later. People knocked down or scattered can't be hit or picked up until they are
  back where they wait (they may go over the six-person limit). Stepping into a vehicle, moving or
  stopped, counts as a hit. No gore: a bump sound and a horn (Claude, 2026-11-09).
- **Traffic:** each lane has a direction, a speed, a vehicle set and its own platoon cycle: a run of
  vehicles, then a lull. A small traffic light at each lane's entry edge shows it: green while the
  platoon comes, red during the lull. The lanes' cycles are staggered so no two neighbouring lanes start in the same phase and a long straight line rarely
  fits; reading the lights is the skill (Claude, 2026-11-09, from the review: "a visible light plus
  staggered lane platoons").
- **Streets:** a street needs a quota of arrivals (8, 10, 12, 14, then 16 for each round of the last
  street). When the quota is met the street changes as soon as nobody in the line is in a lane or on
  the median: a 2 s cut with the clock stopped; the score is kept, the line and the waiting people
  are replaced by the new street's, and its road starts with traffic already in it. Streets are not
  Frogger's levels: there are no homes to fill and no repeated board; each street is a new place with
  a new rule (Claude, 2026-11-09, from the reviews). Each street brings one new thing:
  1. **Maple Street** (morning, green verges): three slow lanes of cars.
  2. **Market Avenue** (midday, shops): five lanes with a median island; people stranded on the
     median also wait to cross, to either kerb; vans, taxis and buses.
  3. **School Run** (afternoon, school): four lanes and a crosswalk column with a walk light: every
     12 s it shows walk for 4 s (once the crosswalk is clear of cars), cars stop before the crosswalk
     and the signal chirps. When walk ends, a car waits up to 2 s for a person still on the crosswalk
     in its lane, then goes. Safe but slow, against jaywalking anywhere.
  4. **Siren Boulevard** (evening): five lanes, and now and then an ambulance, police car or fire
     engine, every 9–14 s: its lane's edge flashes red and blue and a siren sounds 2.5 s before it
     comes, at 2.5 times the lane's speed. It obeys the walk light; the risk of a tail in its lane is
     the player's.
  5. **Downtown** (night, lit windows, people stay fully lit): the median, the crosswalk and the
     sirens together, six lanes; each round of it needs 16 arrivals and is 4% faster than the last.
- **Controls:** a tap anywhere steps forward, toward the kerb the leader is heading for (from a
  kerb, into the road toward the other kerb); holding repeats a step every 160 ms; a swipe steps in
  its direction (up, down, left, right). One step can be queued during a step's 90 ms tween. Keys:
  arrows and WASD step, Space steps forward. A second finger is ignored. No on-screen arrows (Claude,
  2026-11-09; the tap along the kerb that pulled the tail in went with the snake rule, by the owner's
  change of 2026-11-09).
- **Readability:** the leader is the pack's man recoloured to hi-vis orange, with a round red
  lollipop sign drawn above its head (the pack has no crossing guard);
  followers wear varied colours and are joined by a thin rope; waiting people have their arrow;
  knocked-down people are greyed until back on their kerb (Claude, 2026-11-09, from the review).
- **Hidden assist (0–1):** a hit raises it by 0.25; each arrival lowers it by 0.03. It slows traffic
  by up to 25% and lengthens the lulls by up to 40%. A new run keeps 60% of the last run's assist, and
  a new player's first run starts at 0.4. It is never shown (Claude, 2026-11-09).
- **Interruptible:** when the page is hidden the game pauses; on return, the street is frozen and
  dimmed with "Tap to go on", the tap that resumes doesn't step, and the traffic runs for 0.5 s
  before input counts again, with nobody hittable during it (Claude, 2026-11-09, from the review).
- **Kept in localStorage:** the best score, the assist and the furthest street reached. The start
  card has Start and, once reached, a chip for each later street to start there (Claude, 2026-11-09).
- **Sound:** footsteps, a pluck when someone joins, a rising chime for each arrival (higher for each
  in the crossing), a soft bump and a horn for a hit, a crosswalk chirp, a siren, a tick each second
  for the last 5 s of the clock, jingles for start, new street and the end, and a light music loop,
  all under the site-wide mute. Horn, siren and chirp are made for the game (synthesised); the rest
  are Kenney's CC0 sounds as MP3 (Claude, 2026-11-09).
- **Tile:** a new playable tile on the landing page, after Reef and Googly Faces, drawn from the
  game itself, which makes 8 tiles on today's `main`; games built in parallel add theirs, so the count
  is set when this rebases; the picture is made by `scripts/tag-along/make-tile.mjs` (Claude,
  2026-11-09). The atlas is the pack's own spritesheet, its frame
  list made by `scripts/tag-along/build-atlas.mjs`.
- **Tests** drive the game through `window.__tagAlong` (its state, a seeded random source and a
  `step(dt)` that advances the simulation), as Reef's tests do (Claude, 2026-11-09).

## Acceptance items

- **AC-1** The page opens with traffic driving and people waiting behind the start card, with no
  errors; Start begins street 1 with the clock at 45 s — `tests/tag-along.test.mjs`.
- **AC-2** A step moves the leader one cell; the followers then walk the leader's path on their own,
  one cell at a time, and close up one cell behind the person ahead when the leader stops —
  `tests/tag-along.test.mjs`.
- **AC-3** Only the street's edges stop the leader: it can walk back through its own line —
  `tests/tag-along.test.mjs`.
- **AC-4** A waiting person next to the leader joins the end of the line only while nobody in it is in
  a lane, and never starts out in a lane; a person knocked down or walking back can't be picked up —
  `tests/tag-along.test.mjs`.
- **AC-5** A follower reaching their destination kerb arrives there on their own, even with the leader
  standing still on it, and leaves the line; the nth
  arrival of a crossing scores n and adds 0.5 + 0.5 × n s to the clock; the count resets when the leader
  steps from a kerb into a lane, not on the median or after a hit — `tests/tag-along.test.mjs`.
- **AC-6** A vehicle hitting a follower sends that follower back to where they waited while the
  others keep walking; a vehicle hitting the leader scatters the whole line and returns the leader
  to the kerb it last left; people walking back can't be hit — `tests/tag-along.test.mjs`.
- **AC-7** A vehicle passing within half a cell of a person without hitting adds 0.3 s, once per
  vehicle and person and at most 1 s per crossing — `tests/tag-along.test.mjs`.
- **AC-8** The clock runs down in real time and the run ends at zero with the game-over card showing
  the score and the street reached; Play again leads back to the start card —
  `tests/tag-along.test.mjs`.
- **AC-9** Each lane's traffic comes in platoons and lulls, its entry light shows green during a
  platoon and red during a lull, and no two neighbouring lanes start in the same phase —
  `tests/tag-along.test.mjs`.
- **AC-10** Meeting a street's quota (8, 10, 12, 14, then 16) moves to the next street once nobody in
  the line is in a lane or on the median, with the clock stopped during the change, the score kept
  and 10 s added; each round of Downtown is 4% faster — `tests/tag-along.test.mjs`.
- **AC-11** Each street brings its rule: Market Avenue and Downtown have a median; School Run and
  Downtown a crosswalk whose walk light stops the cars before it (and a car waits for a person on it
  when walk ends, for at most 2 s); Siren Boulevard and Downtown sirens that warn at least 2.5 s
  before they enter — `tests/tag-along.test.mjs`.
- **AC-12** A tap steps forward (into the road from a kerb, on toward the kerb the leader is heading
  for), holding repeats steps, a swipe steps in its direction, and the arrow keys, WASD and Space
  step; a second finger does nothing — `tests/tag-along.test.mjs`.
- **AC-13** A hit raises the hidden assist and an arrival lowers it; a higher assist slows traffic;
  a new player's first run starts at 0.4 and a later run at 60% of the last run's —
  `tests/tag-along.test.mjs`.
- **AC-14** Hiding the page pauses the game; on return it stays frozen until a tap, that tap doesn't
  step, and for the next 0.5 s nobody can be hit — `tests/tag-along.test.mjs`.
- **AC-15** The best score and the furthest street are kept; the start card offers a chip for each
  street reached, which starts the run there — `tests/tag-along.test.mjs`.
- **AC-16** Each state shows only its own card and HUD, as in the state table —
  `tests/tag-along.test.mjs`.
- **AC-17** The game plays offline once it has been played — `tests/tag-along.test.mjs`.
- **AC-18** At 390×844 and at 360×640 the whole street (both kerbs and every lane) fits on screen
  with no scrolling and a person is drawn at least 36 CSS px tall; in landscape (844×390) the whole
  street still fits; on a wide screen only the 12 columns are drawn, centred, with plain background
  either side; resizing mid-run changes no game state — `tests/tag-along.test.mjs`.
- **AC-19** The landing page shows 8 tiles, Tag Along's playable after Googly Faces —
  `tests/site.test.mjs`.
- **AC-20** A step plays a footstep, a join the pluck, an arrival the chime (higher for each arrival
  in the crossing), a hit the bump and the horn, and the end of the run the closing jingle —
  `tests/tag-along.test.mjs`.
- **AC-21** A follower about to step from a kerb or the median into a lane waits while a vehicle
  would reach that cell within 1 s, then goes; in a lane, a follower waits for a vehicle about to
  reach the next cell only while their own cell is clear, and goes on when it isn't —
  `tests/tag-along.test.mjs`.

## Core flow

1. Tap the Tag Along tile: traffic is driving behind a small start card.
2. Tap Start (or a street chip).
3. Walk along the kerb to gather people, then step across; they follow your path on their own.
4. Bring them across to score and add time; meet the quota for a new street.
5. When the clock runs out, see the score and the street reached, and play again.

## States

| State | Start card | Paused card | Game-over card | HUD (clock, score, street, quota) |
| ----- | ---------- | ----------- | -------------- | --------------------------------- |
| Start (traffic drives behind) | shown | hidden | hidden | hidden |
| Playing | hidden | hidden | hidden | shown |
| Changing street | hidden | hidden | hidden | shown, with the new street's name |
| Paused (returned from hidden) | hidden | shown | hidden | shown |
| Game over | hidden | hidden | shown, with the score, the best and the street reached | hidden |

## Out of scope

- Later slices, not built here: Freight Highway (long trucks, guaranteed gaps per lane) and a Night
  Loop of karts and race cars; rain; per-street stars; patience rings on waiting people; on-screen
  arrow buttons.
- Leaderboards, accounts, choosing your character.
- Music settings beyond the site-wide mute.

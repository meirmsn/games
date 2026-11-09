# Walk on Red: a lane-crossing game on the Pixel Vehicle Pack

**Go:** "don't consult with me, just start building after following this process" 2026-11-09; for this concept, the owner chose "Build Red Man (Recommended)" 2026-11-09

## Intent

The owner asked, on 2026-11-09, for a batch of games built in parallel: "review the game concept
against the guidelines and propose something that works, and then do adversarial review … so that
you have solid concepts of the game and then build them … don't consult with me, just start building
after following this process." This game's seed was "a lane-crossing arcade game using **Pixel
Vehicle Pack**", which the owner described as "Frogger style": the genre is fine, that game's name,
frog, levels and look are not, the hook has to be our own, it is short-form, and it must not be pure
timing: the player chooses the risk. The assets come from the private asset repo
(`meirmsn/games-private`), CC0.

A first concept, Tag Along (a crossing guard leading a line of followers along their exact path),
was built and played by the owner, who found it "weird … they always hit them … too complex or
confusing … non-intuitive", and asked "why would you need a person with a stop sign if it's not a
child or an elderly person?" Then, in their words: "Everyone is waiting for the red light to change to
green. But this person is busy, maybe on a phone call, and then he wants to go in while it's still
[red]. And then on the first level, it's just you, and it's much less traffic. And maybe as long as
the levels go up, people start seeing you, and one person comes behind you because they're copying
you … And at the end of every level, the light changes to green, and everyone goes … do an
adversarial review looking for 20 alternative options to the game, and then do an adversarial review
of that to pick something that seems exciting, potentially fun game, but also easy, that progressively
gets harder, and that it fulfills all the guidelines." Two separate reviews did that: the first wrote
and attacked 20 concepts; the second attacked those and picked this one, a hybrid of the owner's idea
with a fix for what failed in Tag Along (followers must never depend on how fast the player moves).
The owner chose it ("Build Red Man (Recommended)", 2026-11-09).

The surface is a new game page, `walk-on-red/`, and a new playable tile on the landing page. The game
has its own look (pixel streets, one palette per level, the same in light and dark), like Reef; the
landing page keeps the site's tokens. There is no `DESIGN.md`, so the baseline is the design.

**Hook:** you're late and on the phone, so you cross on red; make it to safe ground and the crowd
starts to follow you.

### Concept check

- **Verb:** hop one lane forward (a tap anywhere) or back (a swipe down), always in your own column;
  a hop is instant, with a footstep.
- **A typical 5-second choice:** you're on the median with two copiers still on the kerb and a bus
  coming: stand there so they see it's safe and follow (costing seconds of red), or push on alone
  while the lane ahead is clear.
- **How it teaches:** level 1 is just you and two slow lanes; level 2 adds traffic both ways; level 3
  brings the median and one copier, whose eye above their head turns gold when they've seen you make
  it. The score shows at the far kerb before it's earned.
- **Three clocks:** each hop and each passing car (seconds); a new level with one new thing every
  half minute, the green light and the tally between them (minutes); the best total and three stars
  a level to win (return).
- **Expert vs beginner:** a beginner either rushes alone or waits for everyone and runs out of red;
  an expert reads the lane lights, waits on the median just long enough, and brings the crowd across
  in a lull. A scripted player that waits briefly outscores both on levels 5–8.
- **Tenth play vs first:** the stars you're missing, reading the lights and the gaps, and knowing
  when the crowd is worth waiting for.
- **Form:** short-form: a run is eight levels, about 5 minutes, because it's an arcade crossing game.
- **Orientation:** portrait: the lanes stack up the screen and the thumb taps. Desktop shows the same
  portrait street in the middle of the screen.
- **What a failure costs:** a hit costs a few seconds and one copier's trust; there are no lives, and
  every level ends in green.
- **Save-game stand-in:** the best total, the best stars per level and the hidden assist, in
  localStorage.
- **Riskiest technical part:** copiers who are never hit yet look fair; proved by tests that cars
  always brake for them and by a scripted player over many seeds.

## Decisions

- **Name and hook:** "Walk on Red", slug `walk-on-red`. The second review called it "Red Man"; Claude
  renamed it because "Red Man" can read as a slur. The player is the pack's man recoloured into a
  navy jacket, with a phone at his ear and lines he says into it ("Yes, yes, two minutes!", "I'm
  fine, I'm fine!"). Rejected: anything with a frog, logs, turtles or homes, and Crossy Road's
  endless forward scroll and look; a texting walker with eyes down (it praises texting while
  walking) (Claude, 2026-11-09, from the reviews).
- **View:** side-on at a slight angle: the far kerb at the top, the near kerb at the bottom, lanes
  and medians between, the pack's side-view vehicles driving left and right. The play area is 12
  columns of 12 art pixels, scaled to the screen with sharp pixels; rows are 22 art pixels tall;
  rows are drawn from the top, vehicles then people in each row. The street is simulated in fixed
  world coordinates (vehicles enter 80 art pixels beyond the play area), so a resize changes nothing
  in the game. Only the 12 columns are drawn, on every screen; on a wide one the street sits in the
  middle with plain background either side (owner, 2026-11-09, on Tag Along: "those [grey zones]
  should be hidden").
- **The player:** stands in one column and hops one row at a time: a tap anywhere (or Up, W or
  Space) hops forward, a swipe down (or Down or S) hops back; sideways swipes do nothing. One hop can
  be queued during a hop. A second finger is ignored. No lateral movement, so there is never a
  "move to the side" (owner, 2026-11-09, on Tag Along).
- **Copiers move only between safe strips:** copiers wait on the near kerb, each in their own column,
  with an eye above their head. They move from one safe strip (a kerb or a median) to the next only
  after the player has stood on that next strip for 0.6 s (the eye turns gold), then glance for
  0.45 s, then set off once every lane on their way is clear at their column for the time they take
  to cross, with a margin. If no such gap comes within 6 s, those lanes' entry lights turn red and
  hold the cars at their column until they're through. Cars always brake before a copier in their
  lane, so copiers are never hit, and the player's hop speed changes only when they set off. Nobody
  sets off while a siren is coming. This is what fixes Tag Along's "they always hit them" (second
  review, 2026-11-09).
- **Hits:** a vehicle overlapping the player's cell (vehicle boxes 20% narrower than their art, the
  player 5 art pixels wide) knocks him down for 1.2 s (the pack's fall and lying frames, a bump and a
  horn, a line into the phone), then he's back on the last safe strip he stood on. One copier still
  waiting shakes their head ("nope") and goes back to the crowd for this level. Stepping into a
  vehicle counts. There are no lives (Claude, 2026-11-09, from the second review).
- **A level is one red light:** it closes when the player has stood on the far kerb for 0.6 s and no
  copier is on the way or about to set off. Its score is (1 + copiers across) × the whole seconds of
  red left; the grandpa counts 2. If the red runs out first, the level scores 0. Either way the light
  turns green: the cars stop before the street, and everyone still on this side crosses together
  (the player too), then a tally shows the sum and the stars, and the next level starts. While
  playing, the level's score so far ("×3 · 18 s = 54") shows at the far kerb (second review,
  2026-11-09).
- **Stars:** a level's score against its best possible (all its red × everyone across): 12% for one
  star, 28% for two, 45% for three. The best stars per level and the best total are kept.
- **The eight levels**, each adding one thing; red light lengths and traffic tuned by playing
  (Claude, 2026-11-09, from the second review's table):
  1. **Quiet Street:** just you, two slow lanes one way, 30 s of red.
  2. **Both Ways:** four lanes, both directions, 30 s.
  3. **Market Avenue:** a median and the first copier; calm traffic so bringing them pays, 28 s.
  4. **Bus Lane:** buses and trucks (long vehicles, long gaps), two copiers, 28 s.
  5. **Sunday Morning:** a breather: calmer, older cars and three copiers, 28 s.
  6. **Siren Boulevard:** sirens (an ambulance, police car or fire engine, its lane's edge flashing and
     a siren 2.5 s before it comes, at 2.5 times the lane's speed), three copiers, 30 s.
  7. **Old Town:** two copiers and a grandpa (slow, worth 2, a cane and grey hair), 32 s.
  8. **Downtown:** night, two medians, four copiers and sirens, 34 s.
  After level 8 the run ends with its total, the stars and the best.
- **Traffic:** each lane has a direction, a speed, a vehicle set and its own cycle of a platoon and a
  lull, shown by a light at the lane's entry (green: cars coming; red: a lull or a hold). Neighbouring
  lanes start out of step. Knobs: each lane's speed, gaps, platoon and lull lengths, and each level's
  red light (Claude, 2026-11-09).
- **Tuning, measured with a scripted player** (reacting every 0.25 s, reading traffic perfectly,
  over 6 seeds a level): going alone, always waiting for the crowd, and waiting at most 3 s each win
  on some levels and seeds; from level 5 the brief wait scores best (52–82 average against 26–32
  alone), and always waiting sometimes runs out the red (0). Levels 1–2 give every careful player
  three stars.
- **Hidden assist (0–1):** a hit raises it by 0.25; each copier across lowers it by 0.03. It slows
  traffic by up to 25% and lengthens the lulls by up to 40%. A new run keeps 60% of the last run's
  assist (at most 0.7), and a new player's first run starts at 0.4. It is never shown.
- **Interruptible:** when the page is hidden the game pauses; on return the street is frozen and
  dimmed with "Tap to go on", the tap that resumes doesn't hop, and for 0.5 s after it nothing can hit
  the player.
- **Sound:** footsteps, a pluck when a copier sets off, a rising chime for each copier across, a soft
  bump and a horn for a hit, a tick each second for the last 5 s of red, the crossing chirp and a
  jingle on green, a jingle at each level's start and at the end of the run, a siren, and a light
  music loop, all under the site-wide mute. The horn, siren and chirp are made for the game
  (synthesised); the rest are Kenney's CC0 sounds as MP3.
- **Tile:** a new playable tile on the landing page, after Reef and Googly Faces, drawn from the game
  itself (`scripts/walk-on-red/make-tile.mjs`), which makes 8 tiles on today's `main`; games built in
  parallel add theirs, so the count is set when this rebases. The atlas is the pack's own
  spritesheet, its frame list made by `scripts/walk-on-red/build-atlas.mjs`.
- **Tests** drive the game through `window.__walkOnRed` (its state, a seeded random source and a
  `step(dt)` that advances the simulation), as Reef's tests do.
- **Replaces Tag Along** on this PR: its page, spec and tests are gone; the street, the traffic, the
  lights, the sirens, the hit animation, the sounds and the layout carry over (owner, 2026-11-09).

## Acceptance items

- **AC-1** The page opens with traffic driving and people waiting behind the start card, with no
  errors; Start begins level 1, Quiet Street, with only the player and 30 s of red —
  `tests/walk-on-red.test.mjs`.
- **AC-2** A tap hops the player one row forward, a swipe down one row back, a sideways swipe does
  nothing, the keys do the same, and a second finger does nothing; the player never leaves their
  column or the street — `tests/walk-on-red.test.mjs`.
- **AC-3** A copier moves to the next safe strip only after the player has stood on it for 0.6 s,
  never to a strip the player only passed through — `tests/walk-on-red.test.mjs`.
- **AC-4** A copier sets off only when the lanes on their way are clear; after 6 s without a gap
  those lanes' lights turn red and hold the cars at their column; and cars brake for a copier in
  their lane, so copiers are never hit — `tests/walk-on-red.test.mjs`.
- **AC-5** A vehicle hitting the player knocks him down, puts him back on the last safe strip he
  stood on, and sends one waiting copier back to the crowd; the level carries on —
  `tests/walk-on-red.test.mjs`.
- **AC-6** The level closes once the player has stood on the far kerb and no copier is on the way,
  scoring (1 + copiers across) × the whole seconds of red left, with the grandpa counting 2 —
  `tests/walk-on-red.test.mjs`.
- **AC-7** When the red runs out first the level scores 0; either way the light turns green, the cars
  stop before the street, everyone left crosses, the tally shows, and the next level starts —
  `tests/walk-on-red.test.mjs`.
- **AC-8** The eight levels are as in the decisions: copiers 0, 0, 1, 2, 3, 3, 2 + the grandpa, 4; a
  median from level 3, two in level 8; heavy vehicles in level 4; sirens in levels 6 and 8 —
  `tests/walk-on-red.test.mjs`.
- **AC-9** A siren warns 2.5 s before it comes, and no copier sets off while it is coming —
  `tests/walk-on-red.test.mjs`.
- **AC-10** After level 8 the run ends with the game-over card showing the total, the stars and the
  best; Play again leads back to the start card — `tests/walk-on-red.test.mjs`.
- **AC-11** Each lane's traffic comes in platoons and lulls, its entry light shows green during a
  platoon and red during a lull, and no two neighbouring lanes start in the same phase —
  `tests/walk-on-red.test.mjs`.
- **AC-12** A hit raises the hidden assist and a copier across lowers it; a higher assist slows
  traffic; a new player's first run starts at 0.4 and a later run at 60% of the last run's —
  `tests/walk-on-red.test.mjs`.
- **AC-13** Hiding the page pauses the game; on return it stays frozen until a tap, that tap doesn't
  hop, and for the next 0.5 s nothing can hit the player — `tests/walk-on-red.test.mjs`.
- **AC-14** The best total and the best stars per level are kept, and the start card shows them —
  `tests/walk-on-red.test.mjs`.
- **AC-15** Each state shows only its own card and HUD, as in the state table —
  `tests/walk-on-red.test.mjs`.
- **AC-16** The game plays offline once it has been played — `tests/walk-on-red.test.mjs`.
- **AC-17** At 390×844 and at 360×640 the whole street fits on screen with no scrolling and a person
  is drawn at least 36 CSS px tall; in landscape (844×390) it still fits; on a wide screen only the
  12 columns are drawn, centred, with plain background either side; resizing mid-level changes no
  game state — `tests/walk-on-red.test.mjs`.
- **AC-18** A hop plays a footstep, a copier setting off the pluck, a copier across the chime (higher
  for each), a hit the bump and the horn, the green light its jingle, and the end of the run the
  closing jingle — `tests/walk-on-red.test.mjs`.
- **AC-19** While a level with copiers is played, its score so far shows at the far kerb as
  "×m · s s = score" — `tests/walk-on-red.test.mjs`.
- **AC-20** The landing page shows 8 tiles, Walk on Red's playable after Googly Faces —
  `tests/site.test.mjs`.

## Core flow

1. Tap the Walk on Red tile: traffic is driving behind a small start card.
2. Tap Start: you're on the near kerb, on the phone, and the light is red.
3. Hop across through the gaps; stop on a median and the copiers follow.
4. Reach the far kerb: the light turns green, everyone crosses, the tally shows, the next level starts.
5. After level 8, see the total and the stars, and play again.

## States

| State | Start card | Paused card | Game-over card | HUD (red clock, level, total) | Banner |
| ----- | ---------- | ----------- | -------------- | ----------------------------- | ------ |
| Start (traffic drives behind) | shown | hidden | hidden | hidden | hidden |
| Playing (red) | hidden | hidden | hidden | shown | the level's name, for a moment |
| Green and tally | hidden | hidden | hidden | shown, the clock reading GO | the tally, during the tally |
| Paused (returned from hidden) | hidden | shown | hidden | shown | as before |
| Game over | hidden | hidden | shown, with the total, the stars and the best | hidden | hidden |

## Out of scope

- A daily traffic seed ("Today's street"), a level select, and more than eight levels.
- Leaderboards, accounts, choosing your character.
- Music settings beyond the site-wide mute.

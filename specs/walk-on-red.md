# Walk on Red: a lane-crossing game on the Pixel Vehicle Pack

**Go:** "don't consult with me, just start building after following this process" 2026-11-09; for this concept, the owner chose "Build Red Man (Recommended)" 2026-11-09; after playing it, the owner chose "Walk on their own" and "Their points" 2026-11-09

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

The owner then played the first build and said, on 2026-11-09: "at least the first level I can win
and understand that I need to cross … But it's not clear what those red lights on the street are for
the cars … the cars don't seem to be respecting them … whenever the pedestrian switches to green, it
must be because the cars switched to red, went through yellow and switched to red just a little bit
before … maybe there has to be something negative about just waiting … the points that you get are …
the remaining time times some multiplier … once the pedestrian goes to 0 and it changes to green,
well, you get 0 points for that level. And maybe you need to get at least 1 point to proceed to the
next level … some of the pedestrian lights, cross lights, they have like a timer … it doesn't make
sense currently that once you cross, all the other ones cross, and they cross on top of the cars …
[copiers] actually NPCs, like they move on their own, and they tend to be smart. But if there are a
lot of cars, then they might not make it. So I have an incentive as a player to do it as fast as
possible … it's not clear that he's on the phone … the text … was like confusing … Maybe he needs to
poop." Asked how copiers should move and what a copier hit should cost, the owner chose "Walk on
their own" and "Their points" (2026-11-09). This spec is the game after those changes.

**Hook:** he really needs the loo, and the toilet is across the street; the walk light is red, so he
goes now, and the people waiting start copying him.

### Concept check

- **Verb:** hop one lane forward (a tap anywhere) or back (a swipe down), always in your own column;
  a hop is instant, with a footstep.
- **A typical 5-second choice:** a bus is coming in the next lane and the countdown says 14: hop now
  through the gap (more seconds, and the copiers behind you follow into calmer traffic) or wait for it
  to pass (safer for you, fewer seconds, and your copiers bunch up behind you in the road).
- **How it teaches:** level 1 is just you, two slow lanes and the countdown; level 2 adds traffic
  both ways; level 3 brings the island and the first copier, who sets off once you're two lanes out.
  What the level is worth right now shows at the top before it's earned.
- **Three clocks:** each hop and each passing car (seconds); a new level with one new thing every
  half minute, the lights changing and everyone crossing between them (minutes); the best total and
  three stars a level to win (return).
- **Expert vs beginner:** a beginner waits for gaps and gets few seconds, or dashes and gets hit; an
  expert reads the traffic, crosses fast in a lull and brings the copiers through it too. A scripted
  player that takes gaps quickly outscores a careful one on most levels.
- **Tenth play vs first:** the stars you're missing, and crossing fast enough that your copiers make
  it.
- **Form:** short-form: a run is eight levels, about 5 minutes, because it's an arcade crossing game.
- **Orientation:** portrait: the lanes stack up the screen and the thumb taps. Desktop shows the same
  portrait street in the middle of the screen.
- **What a failure costs:** a hit costs a few seconds; a copier hit costs their share of the points;
  too slow costs the level's points and a replay of that level (about 30 s). No lives.
- **Save-game stand-in:** the best total, the best stars per level and the hidden assist, in
  localStorage.
- **Riskiest technical part:** lights that the cars visibly obey, and a crossing that is really clear
  before anyone walks on green; proved by tests on the car lights, the stop line and the crossing.

## Decisions

- **Name and hook:** "Walk on Red", slug `walk-on-red`. The second concept review called it "Red
  Man"; Claude renamed it because "Red Man" can read as a slur. He really needs the loo: a café's
  toilet door with a blue WC sign stands across the street above his column; while he waits he hops
  from foot to foot with a drop of sweat, and when he gets across he goes in through the door. No
  phone and no speech bubbles (owner, 2026-11-09: "it's not clear that he's on the phone … the text …
  was like confusing … Maybe he needs to poop"). Rejected: anything with a frog, logs, turtles or
  homes, and Crossy Road's endless forward scroll and look.
- **View:** side-on at a slight angle: the far kerb at the top, the near kerb at the bottom, lanes
  and medians between, the pack's side-view vehicles driving left and right. A zebra crossing runs
  up the middle six columns, with a stop line on each lane before it. The play area is 12 columns of
  12 art pixels, scaled to the screen with sharp pixels; rows are 22 art pixels tall; rows are drawn
  from the top, vehicles then people in each row. The street is simulated in fixed world coordinates
  (vehicles enter 80 art pixels beyond the play area), so a resize changes nothing in the game. Only
  the 12 columns are drawn, on every screen; on a wide one the street sits in the middle with plain
  background either side.
- **The player:** stands in one column on the crossing and hops one row at a time: a tap anywhere (or
  Up, W or Space) hops forward, a swipe down (or Down or S) hops back; sideways swipes do nothing.
  One hop can be queued during a hop. A second finger is ignored.
- **The lights, which the cars obey:** the walk light on each kerb shows a red man with the seconds
  left in a pixel countdown (the same number as the clock at the top). Each lane has a car light at
  its stop line. It's green while the walk light counts down, turns yellow at 4.5 s and red at 2 s.
  On red a car stops at its stop line; on yellow it stops if it is still well short of the line; a
  car already past its line when the light changes hurries across. When the walk light reaches 0 and
  no vehicle is on the crossing (at most 6 s later), it turns green and everyone still waiting walks
  across on the zebra; nobody walks while a car is on it. Within a lane, traffic still comes in
  platoons and lulls, now without lights of its own (owner, 2026-11-09, as quoted in the intent).
- **Score:** reaching the far kerb before the walk light turns green fixes the seconds left (at least
  1); the level scores those seconds × (1 + copiers across by the time the light turns green). If the
  light turns green first, the level scores 0 and starts again; you need at least 1 point to go on.
  While playing, what the level is worth right now ("14 s × 3 = 42") shows above the far kerb (owner,
  2026-11-09).
- **Copiers walk on their own:** from level 3, people at the kerb beside his column copy him. Each sets
  off once he is two rows out, one after another 0.9 s apart, and hops up their own column on the
  crossing, a row every 0.42 s. They never go past him (they may share the island or the far kerb
  with him). From a kerb or the island they wait while a car would reach the next lane's cell within
  0.9 s; in the road they wait at most 1.2 s for the next lane, and only while their own spot is
  clear, so in heavy traffic, or if he dawdles and they bunch up behind him in the lanes, they can be
  hit. A copier hit tumbles, then walks back to the crowd: out for this level, and their share of the
  points with them. Copiers across queue at the toilet door (owner, 2026-11-09: "Walk on their own",
  "Their points").
- **Hits:** a vehicle overlapping the player's cell (vehicle boxes 20% narrower than their art, people
  5 art pixels wide) knocks him down for 1.2 s (the pack's fall and lying frames with stars, a bump
  and a horn), then he's back on the last safe strip he stood on. Stepping into a vehicle counts.
  There are no lives.
- **Stars:** a level's score against its best possible (all its seconds × everyone across): 12% for
  one star, 28% for two, 45% for three. The best stars per level and the best total are kept.
- **The eight levels**, each adding one thing; tuned by playing (Claude, 2026-11-09):
  1. **Quiet Street:** just you, two slow lanes one way, 30 s.
  2. **Both Ways:** four lanes, both directions, 30 s.
  3. **Market Avenue:** an island in the middle and the first copier; calm traffic, 28 s.
  4. **Bus Lane:** buses and trucks (long vehicles, long gaps), one copier, 28 s.
  5. **Sunday Morning:** a breather: calmer, older cars and two copiers, 28 s.
  6. **Siren Boulevard:** sirens (an ambulance, police car or fire engine, its lane's edge flashing
     and a siren 2.5 s before it comes, at 2.5 times the lane's speed), two copiers, 30 s.
  7. **Old Town:** three lanes on the near side, three copiers, 32 s.
  8. **Downtown:** night, two islands, three copiers and sirens, 34 s.
  After level 8 the run ends with its total, the stars and the best.
- **Tuning, measured with a scripted player** (reacting every 0.25 s, reading traffic perfectly, over
  6 seeds a level, fast or careful): it never fails a level and is never hit, so the levels are
  within reach; the fast way scores more on most levels; 25–50% of copiers are hit on levels 3–7,
  and almost none in Downtown, where the islands give them rest. Knobs: each lane's speed, gaps,
  platoon and lull lengths, each level's seconds, and the copiers' start, pace, look and wait.
- **Hidden assist (0–1):** a hit raises it by 0.25 (0.1 for a copier hit); each copier across lowers
  it by 0.03. It slows traffic by up to 25% and lengthens the lulls by up to 40%. A new run keeps 60%
  of the last run's assist (at most 0.7), and a new player's first run starts at 0.4. It is never
  shown.
- **Interruptible:** when the page is hidden the game pauses, during any part of a level; on return
  the street is frozen and dimmed with "Tap to go on", the tap that resumes doesn't hop, and for
  0.5 s after it nothing can hit anyone.
- **Sound:** footsteps, a pluck when a copier sets off, a rising chime for each copier across, a soft
  bump and a horn for a hit, a tick each second for the last 5 s, the crossing chirp and a jingle on
  green, a jingle at each level's start and at the end of the run, a siren, and a light music loop,
  all under the site-wide mute. The horn, siren and chirp are made for the game (synthesised); the
  rest are Kenney's CC0 sounds as MP3.
- **Tile:** a new playable tile on the landing page, after Reef and Googly Faces, drawn from the game
  itself (`scripts/walk-on-red/make-tile.mjs`), which makes 8 tiles on today's `main`; games built in
  parallel add theirs, so the count is set when this rebases. The atlas is the pack's own
  spritesheet, its frame list made by `scripts/walk-on-red/build-atlas.mjs`.
- **Tests** drive the game through `window.__walkOnRed` (its state, a seeded random source and a
  `step(dt)` that advances the simulation), as Reef's tests do.
- **Replaces Tag Along**, which never reached `main`: the street, the traffic, the sirens, the hit
  animation, the sounds and the layout carry over (owner, 2026-11-09).

## Acceptance items

- **AC-1** The page opens with traffic driving and people waiting behind the start card, with no
  errors; Start begins level 1, Quiet Street, with only the player and 30 s on the walk light —
  `tests/walk-on-red.test.mjs`.
- **AC-2** A tap hops the player one row forward, a swipe down one row back, a sideways swipe does
  nothing, the keys do the same, and a second finger does nothing; the player never leaves their
  column or the street — `tests/walk-on-red.test.mjs`.
- **AC-3** The car lights are green while the walk light counts down, yellow from 4.5 s and red from
  2 s; on red, cars short of their stop line stop at it, and none crosses it —
  `tests/walk-on-red.test.mjs`.
- **AC-4** When the walk light reaches 0 it turns green only once no vehicle is on the crossing; then
  everyone still waiting crosses, no vehicle enters the crossing, and the next level (or the same
  one) starts after the tally — `tests/walk-on-red.test.mjs`.
- **AC-5** Reaching the far kerb fixes the seconds left; the level scores them × (1 + copiers across
  by the green light) — `tests/walk-on-red.test.mjs`.
- **AC-6** If the walk light turns green before the player is across, the level scores 0 and starts
  again — `tests/walk-on-red.test.mjs`.
- **AC-7** Copiers set off once the player is two rows out, one after another, hop up their own
  column, never go past the player, and wait on safe ground while the next lane is about to be hit —
  `tests/walk-on-red.test.mjs`.
- **AC-8** A copier hit by a vehicle tumbles, goes back to the crowd and no longer counts; the level
  carries on — `tests/walk-on-red.test.mjs`.
- **AC-9** A vehicle hitting the player knocks him down and puts him back on the last safe strip he
  stood on — `tests/walk-on-red.test.mjs`.
- **AC-10** The eight levels are as in the decisions: copiers 0, 0, 1, 1, 2, 2, 3, 3; an island from
  level 3, two in level 8; heavy vehicles in level 4; sirens in levels 6 and 8 —
  `tests/walk-on-red.test.mjs`.
- **AC-11** A siren warns 2.5 s before it comes — `tests/walk-on-red.test.mjs`.
- **AC-12** After level 8 the run ends with the game-over card showing the total, the stars and the
  best; Play again leads back to the start card — `tests/walk-on-red.test.mjs`.
- **AC-13** A hit raises the hidden assist and a copier across lowers it; a higher assist slows
  traffic; a new player's first run starts at 0.4 and a later run at 60% of the last run's —
  `tests/walk-on-red.test.mjs`.
- **AC-14** Hiding the page pauses the game, also during the green light; on return it stays frozen
  until a tap, that tap doesn't hop, and for the next 0.5 s nothing can hit the player —
  `tests/walk-on-red.test.mjs`.
- **AC-15** The best total and the best stars per level are kept, and the start card shows them —
  `tests/walk-on-red.test.mjs`.
- **AC-16** Each state shows only its own card, HUD and banner, as in the state table —
  `tests/walk-on-red.test.mjs`.
- **AC-17** The game plays offline once it has been played — `tests/walk-on-red.test.mjs`.
- **AC-18** At 390×844 and at 360×640 the whole street fits on screen with no scrolling and a person
  is drawn at least 36 CSS px tall; in landscape (844×390) it still fits; on a wide screen only the
  12 columns are drawn, centred, with plain background either side; resizing mid-level changes no
  game state — `tests/walk-on-red.test.mjs`.
- **AC-19** A hop plays a footstep, a copier setting off the pluck, a copier across the chime (higher
  for each), a hit the bump and the horn, the green light its jingle, and the end of the run the
  closing jingle — `tests/walk-on-red.test.mjs`.
- **AC-20** While a level with copiers is played, what it is worth right now shows above the far
  kerb as "s s × m = score"; the walk light shows the seconds left in its pixel countdown —
  `tests/walk-on-red.test.mjs`.
- **AC-21** The landing page shows 8 tiles, Walk on Red's playable after Googly Faces —
  `tests/site.test.mjs`.

## Core flow

1. Tap the Walk on Red tile: traffic is driving behind a small start card.
2. Tap Start: he's on the near kerb, hopping from foot to foot, and the walk light is counting down.
3. Hop across through the gaps; from level 3, the people waiting start copying you.
4. Reach the toilet: the lights change, everyone crosses, the tally shows, the next level starts.
5. After level 8, see the total and the stars, and play again.

## States

| State | Start card | Paused card | Game-over card | HUD (clock, level, total) | Banner |
| ----- | ---------- | ----------- | -------------- | ------------------------- | ------ |
| Start (traffic drives behind) | shown | hidden | hidden | hidden | hidden |
| Playing (walk light red) | hidden | hidden | hidden | shown | the level's name, for a moment |
| Across, lights changing, green | hidden | hidden | hidden | shown, the clock reading GO on green | hidden |
| Tally | hidden | hidden | hidden | shown | the tally, or "Try again" |
| Paused (returned from hidden) | hidden | shown | hidden | shown | as before |
| Game over | hidden | hidden | shown, with the total, the stars and the best | hidden | hidden |

## Out of scope

- A daily traffic seed ("Today's street"), a level select, and more than eight levels.
- Leaderboards, accounts, choosing your character.
- Music settings beyond the site-wide mute.

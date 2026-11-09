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
their own" and "Their points" (2026-11-09). After playing that, the owner said (2026-11-09): "this is
much better … when you first load the game on desktop, it shows certain width, and when you hit
start, the game becomes much wider. That shouldn't happen … if you load it on a desktop or landscape,
the game will play on that mode. And if you load it on a vertical phone, it will load on that mode.
But if you switch orientations, it will ask you to either restart the game or to return back to the
other orientation … Once you cross over, you shouldn't be waiting for all the seconds in real time
… accelerate the time, and as the time is being accelerated, you see the points going up … we should
allow to move left and right. And you should calibrate the levels … the first level is very, very
easy to win. The second one is just a little bit harder … The third one is already getting more like
a regular level, and they get progressively harder … the music is not great … more of like sounds of
being on a street … he shouldn't be wiggling all the time … at the top, you should show like a
public bathroom … Maybe it can be even a porta potty … on a near miss of a car or incoming car to
you, you can even sound like a horn, different types of horn depending on the car." After playing that, the owner said (2026-11-09):
"this is feeling much better … when you get to the toilet, it closes the [door] … it should make a
sound of a flushing, so that it's clear what happened. Then you do the sound, the chime of
celebrating. Also, when you fast forward the time of the counter, it should also fast forward all
the time … the cars and also for the NPCs crossing … maybe some of the NPCs will have, if this was in
regular time, they would have get run over, and that happens … it should run the actual rules of the
game, and you earn points or not according to that. Lastly, I don't think we should see on the left
and the right of the crosswalk … The game should be only on the crosswalk. So maybe to keep it
simple, we can do it portrait, and if it's on desktop, you only see the portrait … Maybe you can
show just a tiny sliver of regular street on both sides so that it makes sense that the light is the
light of those cars coming in." After playing that, the owner said (2026-11-09): "don't show the
little slivers of street on the left and the right. I think you can show only … the sidewalk and the
lights. It's clear that those are the cars['] lights … we need a better sound for the flushing. It
should [sound] like actual flushing … the fast forward looks great. But once you're done with the
fast forward, you don't have to make all of them cross when it gets green … Or you can, but that
should also be part of the fast forward, and that should give you 0 points, like the ones that pass
while it's green should give you [0]." After playing that, the owner said (2026-11-09): "The first
levels are way too easy … the second one should be already harder. The flush sound is not good. It
sounds like a space laser, so maybe go back to what you had before … The fast forward should be much
faster. I'm waiting too long there. And also the NPCs [crossing] on green … it feels like it did the
fast forward and then they cross … they should be part of that fast forward everything." Then: "it's
very easy to win if you just … go up very fast because there's no cars on the road. So I think the
cars need to start on the road already when the level starts. All of them … Perhaps only on the
first level … there is like only one car on the road … it shouldn't be the case that as soon as you
start the level, just tap up, and you win every single level." After playing that, the owner said
(2026-11-09): "on the first level you show cars as well, crossing the road … they should start with
cars in front of you. It shouldn't be open the road … I don't think you need to show the time at the
top left because it's already being shown on the pedestrian light … only keep the point … make it
clear that you're getting a multiplier … you get the points of the time that is left, and then you
get a multiplier for all the other people who crossed … It should be simple." This spec is the game
after those changes.

**Hook:** he really needs the loo, and the toilet is across the street; the walk light is red, so he
goes now, and the people waiting start copying him.

### Concept check

- **Verb:** hop one cell: forward (a tap anywhere), back or sideways (a swipe); a hop is instant,
  with a footstep.
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
- **Orientation:** portrait, everywhere: the view is the zebra crossing, edge to edge, the same
  shape on a phone, a phone held sideways and a desktop.
- **What a failure costs:** a hit costs a few seconds; a copier hit costs their share of the points;
  too slow costs the level's points and a replay of that level (about 30 s). No lives.
- **Save-game stand-in:** the best total, the best stars per level and the hidden assist, in
  localStorage.
- **Riskiest technical part:** lights that the cars visibly obey, and a crossing that is really clear
  before anyone walks on green; proved by tests on the car lights, the stop line and the crossing.

## Decisions

- **Name and hook:** "Walk on Red", slug `walk-on-red`. The second concept review called it "Red
  Man"; Claude renamed it because "Red Man" can read as a slur. He really needs the loo: a blue
  porta-potty (roof, vent, a WC sign on its door, and a red or green busy dot) stands on the left of
  the far sidewalk (leaving its right side to the score label); across, he walks along the sidewalk
  to its door; now and then, standing still, he hops from foot to foot for a
  moment (0.7 s every 3.6 s), with a drop of sweat; when he gets across he goes in. No phone and no
  speech bubbles (owner, 2026-11-09: "Maybe he needs to poop"; then "he shouldn't be wiggling all
  the time … Maybe it can be even a porta potty"). Rejected: anything with a frog, logs, turtles or
  homes, and Crossy Road's endless forward scroll and look.
- **View:** side-on at a slight angle: the far kerb at the top, the near kerb at the bottom, lanes
  and medians between, the pack's side-view vehicles driving left and right. A zebra crossing nine
  columns wide runs up the middle, with a stop line on each lane just before it. Columns are 12 art pixels
  and rows 22; rows are drawn from the top, vehicles then people in each row, with a strip of sky
  above for the porta-potty. Only the crossing is shown, edge to edge, with the sidewalks above and
  below it: no road either side; each lane's car light stands on the crossing's edge the cars come
  from, so it reads as theirs, and the walk lights stand on the sidewalks inside the view. The same
  view on every screen: on a wide one it stands centred with plain background either side; it
  doesn't change with the device turned, only rescales. Every street and every state uses one scale
  (as if each street had 8 rows), so the width never changes, Start included. The street is
  simulated in fixed world coordinates, 12 columns wide (vehicles enter 80 art pixels beyond them),
  and the view is cut from its middle; the landing page's tile picture shows it wider (owner,
  2026-11-09: "The game should be only on the crosswalk … if it's on desktop, you only see the
  portrait"; then "don't show the little slivers of street on the left and the right"; this replaces
  the earlier screen-shaped street and its turn-back card).
- **The player:** hops one cell at a time: a tap anywhere (or Up, W or Space) hops forward, a swipe
  down (or Down or S) back, a swipe left or right (or Left/A, Right/D) sideways; the street's sides
  and kerbs stop him. One hop can be queued during a hop. A second finger is ignored (owner,
  2026-11-09: "we should allow to move left and right"). He stays on the zebra: its edges stop him.
- **The lights, which the cars obey:** the walk light on each kerb shows a red man with the seconds
  left in a pixel countdown; it is the only clock (the HUD shows the level and the points, not the
  time: owner, 2026-11-09, "it's already being shown on the pedestrian light"). Each lane has a car light on
  the crossing's edge, by its stop line. It's green while the walk light counts down, turns yellow at 4.5 s and red at 2 s.
  On red a car stops at its stop line; on yellow it stops if it is still well short of the line; a
  car already past its line when the light changes hurries across. When the walk light reaches 0 and
  no vehicle is on the crossing (at most 10 s later, run fast), it turns green and everyone still
  waiting walks across on the zebra; nobody walks while a car is on it. Within a lane, traffic still comes in
  platoons and lulls, now without lights of its own (owner, 2026-11-09, as quoted in the intent).
- **Score:** reaching the far kerb before the walk light turns green fixes the seconds left (at least
  1); the level scores those seconds × (1 + copiers across by the time the light turns green). If
  the light turns green first, the level scores 0 and starts again; you need at least 1 point to go
  on. The multiplier is said in plain words: the start card reads "Points: seconds left × people who
  make it across"; while a level with copiers is played, what it is worth right now ("14 s × 3 people
  = 42") shows at the right of the sky; each copier who arrives shows the new multiplier ("×2",
  "×3") over their head; the count-up says "× 3 people"; and the tally reads "14 s × 3 people"
  (owner, 2026-11-09: "make it clear that you're getting a multiplier … It should be simple").
  Once he's across he goes into the porta-potty: the door closes (its dot turns red), a flush, then
  the celebrating chime as the flush ends, about 1.8 s in all, while the walk light holds its seconds and the street
  goes on at normal speed. Then nobody waits in real time: the whole game fast-forwards at 20 times
  speed under its own rules, in one go, through to the tally: the walk light's seconds drain, the car
  lights go yellow and red as usual and the cars stop at their lines, and the copiers still on the
  way carry on as they would, so they can make it, or be hit. The points count up big over the far
  sidewalk as the seconds drain ("+42", "× 3 people", the multiplier growing as copiers arrive),
  with a rising tick and a "▶▶" mark. At 0 the level is scored, copiers still in the road stop, and
  once the crossing is clear the walk light turns green and everyone left sets off at once, still in
  the fast-forward (the count and the "▶▶" mark stay up), and earns nothing: each copier who crosses on green shows "+0". Then the tally
  (owner, 2026-11-09: "it should run the actual rules of the game, and you earn points or not
  according to that"; then "that should also be part of the fast forward, and that should give you 0
  points"; then "much faster … they should be part of that fast forward everything"). When he was
  too slow, the wait for the crossing to clear and the green light's crossing
  run fast in the same way.
- **Copiers walk on their own:** from level 3, people at the kerb beside his column copy him. Each sets
  off once he is two rows out, one after another 0.9 s apart, and hops up their own column on the
  crossing, a row every 0.42 s. They never go past him (they may share the island or the far kerb
  with him). From a kerb or the island they wait while a car would reach the next lane's cell within
  1.1 s; in the road they wait at most 2.2 s for the next lane, and only while their own spot is
  clear, so in heavy traffic, or if he dawdles and they bunch up behind him in the lanes, they can be
  hit. A copier hit tumbles, then walks back to the crowd: out for this level, and their share of the
  points with them. Copiers across queue at the porta-potty (owner, 2026-11-09: "Walk on their own",
  "Their points").
- **Hits:** a vehicle overlapping the player's cell (vehicle boxes 20% narrower than their art, people
  5 art pixels wide) knocks him down for 1.2 s (the pack's fall and lying frames with stars, a bump
  and a horn), then he's back on the last safe strip he stood on. Stepping into a vehicle counts.
  There are no lives.
- **Stars:** a level's score against its best possible (all its seconds × everyone across): 12% for
  one star, 28% for two, 45% for three. The best stars per level and the best total are kept.
- **Traffic from the first second:** every level starts with every lane already full of traffic,
  driving (filled by running 16 s of traffic on green before the level starts, every lane in a
  platoon; then the lanes take up their staggered platoons and lulls), so tapping straight up gets
  you hit; level 1 too, with its own sparse traffic. And on every level a car is passing right in
  front of him, in the first lane, as the level starts (owner, 2026-11-09: "they should start with
  cars in front of you. It shouldn't be open the road").
- **The eight levels**, getting harder one after another; tuned by playing (owner, 2026-11-09:
  "the first level is very, very easy to win. The second one is just a little bit harder … The
  third one is already getting more like a regular level, and they get progressively harder"):
  1. **Quiet Street:** just you, two slow lanes one way, sparse traffic, 30 s.
  2. **Both Ways:** two lanes, one each way, nearly twice level 1's speed and much busier (short
     lulls), 26 s: already a real crossing (owner, 2026-11-09: "the second one should be already
     harder").
  3. **Market Avenue:** four lanes, an island in the middle and the first copier, 28 s.
  4. **Bus Lane:** buses and trucks (long vehicles), faster, one copier, 28 s.
  5. **Rush Hour:** five lanes, denser, two copiers, 30 s.
  6. **Siren Boulevard:** sirens (an ambulance, police car or fire engine, its lane's edge flashing
     and a siren 2.5 s before it comes, at 2.5 times the lane's speed), two copiers, 30 s.
  7. **Old Town:** five fast lanes, three copiers, 32 s.
  8. **Downtown:** night, two islands, the fastest and densest traffic, three copiers and sirens,
     32 s.
  After level 8 the run ends with its total, the stars and the best.
- **Tuning, measured with a scripted player** (reacting every 0.25 s, reading traffic perfectly,
  sidestepping, over 6 seeds a level, fast or careful): it never fails a level and is almost never
  hit, so every level is within reach; the seconds it has to spend waiting go from none on level 1
  to up to 8 on level 2, and up to about 20 on levels 3–7. A player tapping straight up without
  looking is hit 3 to 10 times a level from level 2 on; the fast way scores more on most levels; about a third to half of copiers are hit on
  levels 3–7 (more when the player rushes ahead), and a quarter in Downtown, where the islands give them rest. Knobs: each
  lane's speed, gaps, platoon and lull lengths, each level's seconds, and the copiers' start, pace,
  look and wait.
- **Hidden assist (0–1):** a hit raises it by 0.25 (0.1 for a copier hit); each copier across lowers
  it by 0.03. It slows traffic by up to 25% and lengthens the lulls by up to 40%. A new run keeps 60%
  of the last run's assist (at most 0.7), and a new player's first run starts at 0.4. It is never
  shown.
- **Interruptible:** when the page is hidden the game pauses, during any part of a level; on return
  the street is frozen and dimmed with "Tap to go on", the tap that resumes doesn't hop, and for
  0.5 s after it nothing can hit anyone.
- **Sound:** a quiet street ambience in place of music (a low city hum with cars swelling past every
  few seconds, made for the game), footsteps, horns (a car coming within 10 art pixels of him, or just
  missing him, honks once: deep for buses, trucks and vans, high for small and sports cars), a
  pluck when a copier sets off, a rising chime for each copier across, a rising tick as the seconds
  count into points, a soft bump and a horn for a hit, a tick each second for the last 5 s, the
  crossing chirp and a jingle on green, a flush and a chime when he gets into the porta-potty, a jingle at each level's start and at the end of the run,
  and a siren, all under the site-wide mute. The flush is the owner's own recording (made with ElevenLabs, 2026-11-09), trimmed and levelled; the ambience, horn, siren and chirp are synthesised for
  the game; the rest are Kenney's CC0 sounds as MP3 (owner, 2026-11-09: "more of like sounds of being
  on a street … but it shouldn't be annoying … different types of horn depending on the car").
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
- **AC-2** A tap hops the player one row forward, a swipe down one row back, a swipe left or right
  one column sideways, the keys do the same, and a second finger does nothing; the zebra's edges and
  the kerbs stop him — `tests/walk-on-red.test.mjs`.
- **AC-3** The car lights are green while the walk light counts down, yellow from 4.5 s and red from
  2 s; on red, cars short of their stop line stop at it, and none crosses it —
  `tests/walk-on-red.test.mjs`.
- **AC-4** When the walk light reaches 0 it turns green only once no vehicle is on the crossing; then
  everyone still waiting crosses at once, at 20 times speed, no vehicle enters the crossing, a copier crossing
  on green shows "+0" and adds nothing, and the next level (or the same one) starts after the tally — `tests/walk-on-red.test.mjs`.
- **AC-5** Reaching the far kerb fixes the seconds left; he goes in, the door closes and the flush
  plays, then the chime; then the game runs at 20 times speed with its own rules, through to the tally (the car lights
  change, cars stop at their lines, copiers on the way carry on and can be hit) while the points
  count up as the seconds drain; the level scores the seconds × (1 + copiers across by the green
  light); from across to the tally takes under 8 s — `tests/walk-on-red.test.mjs`.
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
- **AC-18** The view is the zebra crossing edge to edge, with no road either side, on every screen;
  on a wide screen it is centred with plain background either side; its width doesn't change on Start
  or between levels; at 390×844 and 360×640 it fits with no scrolling and a person is at least 36 CSS
  px tall, and in landscape (844×390, 1280×720) it fits; turning the device mid-level only rescales
  it and changes no game state — `tests/walk-on-red.test.mjs`.
- **AC-19** A hop plays a footstep, a copier setting off the pluck, a copier across the chime (higher
  for each), a hit the bump and the horn, getting into the porta-potty the flush and then the chime,
  the green light its jingle, and the end of the run the closing jingle — `tests/walk-on-red.test.mjs`.
- **AC-20** The start card says "Points: seconds left × people who make it across"; while a level
  with copiers is played, what it is worth right now shows as "s s × m people = score"; a copier
  arriving shows the new multiplier ("×2"); the HUD shows no clock; the walk light shows the seconds left in its pixel countdown —
  `tests/walk-on-red.test.mjs`.
- **AC-21** The landing page shows 8 tiles, Walk on Red's playable after Googly Faces —
  `tests/site.test.mjs`.
- **AC-22** A car coming within 10 art px of him honks once, deep for big vehicles and high for
  small ones — `tests/walk-on-red.test.mjs`.
- **AC-23** Every level starts with traffic in its lanes and a car passing right in front of him;
  from level 2, every lane has traffic and tapping straight up from the start gets him hit — `tests/walk-on-red.test.mjs`.

## Core flow

1. Tap the Walk on Red tile: traffic is driving behind a small start card.
2. Tap Start: he's on the near kerb, hopping from foot to foot, and the walk light is counting down.
3. Hop across through the gaps; from level 3, the people waiting start copying you.
4. Reach the porta-potty: the door closes, a flush, a chime; the street fast-forwards as the seconds
   count into points and the lights change; everyone crosses on green, the tally shows, the next
   level starts.
5. After level 8, see the total and the stars, and play again.

## States

| State | Start card | Paused card | Game-over card | HUD (level, total) | Banner |
| ----- | ---------- | ----------- | -------------- | ------------------------- | ------ |
| Start (traffic drives behind) | shown | hidden | hidden | hidden | hidden |
| Playing (walk light red) | hidden | hidden | hidden | shown | the level's name, for a moment |
| Across: in the loo, fast-forward, green | hidden | hidden | hidden | shown | hidden |
| Tally | hidden | hidden | hidden | shown | the tally, or "Try again" |
| Paused (returned from hidden) | hidden | shown | hidden | shown | as before |
| Game over | hidden | hidden | shown, with the total, the stars and the best | hidden | hidden |

## Out of scope

- A daily traffic seed ("Today's street"), a level select, and more than eight levels.
- Leaderboards, accounts, choosing your character.
- Music settings beyond the site-wide mute.

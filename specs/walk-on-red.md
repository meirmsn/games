# Gotta Go! (walk-on-red): a lane-crossing game on the Pixel Vehicle Pack

**Go:** "don't consult with me, just start building after following this process" 2026-11-09; for this concept, the owner chose "Build Red Man (Recommended)" 2026-11-09; after playing it, the owner chose "Walk on their own" and "Their points" 2026-11-09; for the close-up tile and a new name, the owner's request "can you make a zoom … towards the top where the WCs and … a little bit of walkway" 2026-11-09, and the name: the owner chose "Gotta Go!" 2026-11-10; for lives, pending

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
get a multiplier for all the other people who crossed … It should be simple." After playing that,
the owner said (2026-11-09): "Remove that message … on the beginning … It should be intuitive from
you finishing … the first level, and seeing how the points are being computed. When there's an
emergency vehicle, it goes over the other vehicles … the other vehicles at least move out of the way
a little bit … bring the WC back to the center … the NPC should not wiggle because you're the one
who needs to go to the restroom … maybe 5 and upwards, where they, after you're done with the
restroom, you get out and they go [in] and you get … extra bonus points … show like a little table
that says like, uh, 24 seconds left. So that becomes, 24 points. And then … inspired passerbys … and
it shows is that a multiplier or adding … extra person relieved … there's still something odd about
when the NPCs cross when it comes to zero. They seem to be flying … Maybe you can actually slow down
the time for them to cross. And as they are crossing, you put the overlay of the bonus points
because they give you zero regardless." Then, while that was being built (2026-11-09): "given you
cannot control who follows you … it feels random that you're gonna gain points or not … if they make
good or bad choices, you earn points or not. So I think what we should do is go back to the idea that
randomly they stick to you. But once they do, they follow your footsteps … maybe the first 7 levels
nobody follows you, and then it gets progressively more harder, and then complexity goes a little bit
down so that one person follows you and you understand this new mechanic, and again you are starting
to ramp up … then you can add a second person following you. You don't need to go down on the
complexity of the level at that point … 20 levels total … maybe 21 … the last 5 levels or so are
gonna be very hard because a bunch of people are following you. Plus, are the most complex in terms
of the traffic." After playing that, the owner said (2026-11-09): "It's feeling great … the end …
the amount of people that follow you and all those points, that should also look 8-bit … if they
hit you in the middle … You should start from the beginning … if they hit an NPC, that NPC should
disappear. It shouldn't go back. If the game restarts because they hit you, then okay, they all
start from the bottom." Then (2026-11-09): "The UI showing you on the beginning of the game and also
showing you the level names, those should also be 8-bit … if we have anything else that is not
8-bit, we should also make it." Then: "the one with the siren should show up earlier … fix the bug …
at the top where the bar, depending on the number of points, the bar is changing width … there
should be fixed space for the number of points in there so that the bar never changes the width."
Then, after it was on the site, the owner said (2026-11-09): "the tile for the walk on red looks
incorrect because it's showing the cars on the left and the right. So can you make a zoom, I guess?
I guess I will do it towards the top where the WCs and the maybe a little bit of walkway as well,
kind of like that area. And I wonder if we should come up with a funnier name. Maybe we call it
Can't Hold It, or some variation riff around that notion, and also the walking on red or something
like that. I don't know. Keep it child friendly, cute, but funny." Offered Cross Your Legs!, Can't
Hold It!, Gotta Go! and Potty Dash, the owner chose "Gotta Go!" (2026-11-10). This change makes the
landing-page tile a close-up of the far end of the crossing and renames the game Gotta Go! wherever
its name shows: the tile's title, the game page's title, description and start card, the README,
and the code's header comments.
Then the owner asked, on 2026-11-10: "On the Gotta Go game, it should have 3 lives, and then when you
get run over, you lose 1, and then when you lose the 3, you're done. It's game over." This change
gives a run 3 lives, shown in the HUD; being run over costs one, and losing the third ends the run on
a Game Over card that leads to a new run.
This spec is the game after those changes.

**Hook:** he really needs the loo, and the toilet is across the street; the walk light is red, so he
goes now, and the people waiting start copying him.

### Concept check

- **Verb:** hop one cell: forward (a tap anywhere), back or sideways (a swipe); a hop is instant,
  with a footstep.
- **A typical 5-second choice:** you're on the island with two followers behind you, a bus is
  coming in the next lane and the countdown says 14: run the two lanes now (more seconds, but the
  last of your followers steps where you were 0.8 s ago, right as the bus arrives) or wait for a
  gap wide enough for all three of you (safe, fewer seconds).
- **How it teaches:** level 1 is just you, two slow lanes and the countdown; the traffic builds for
  seven levels with nobody following; level 8 eases off and brings one follower, who walks in your
  footsteps; level 11 a second, level 15 a third. The first level's score table shows how points
  add up.
- **Three clocks:** each hop and each passing car (seconds); a new level with one new thing every
  half minute, the lights changing and everyone crossing between them (minutes); the best total and
  three stars a level to win (return).
- **Expert vs beginner:** a beginner waits for gaps and gets few seconds, or dashes and gets hit; an
  expert reads the traffic, waits on the kerb or the island for a gap the whole line fits through,
  then runs the lanes in one go.
- **Tenth play vs first:** the stars you're missing, and judging gaps long enough for your followers.
- **Form:** an arcade run of 21 levels, about 12 to 15 minutes (owner, 2026-11-09: "maybe 21");
  each level is half a minute, so it stops cleanly between any two.
- **Orientation:** portrait, everywhere: the view is the zebra crossing, edge to edge, the same
  shape on a phone, a phone held sideways and a desktop.
- **What a failure costs:** a hit costs a life and sends him back to the start (several seconds);
  the third ends the run; a follower hit costs their share of the points; too slow costs the
  level's points and a replay of that level (about 30 s), but no life.
- **Save-game stand-in:** the best total, the best stars per level and the hidden assist, in
  localStorage.
- **Riskiest technical part:** lights that the cars visibly obey, and a crossing that is really clear
  before anyone walks on green; proved by tests on the car lights, the stop line and the crossing.

## Decisions

- **Name and hook:** "Gotta Go!", slug `walk-on-red` (owner, 2026-11-10, choosing from Cross Your Legs!,
  Can't Hold It!, Gotta Go! and Potty Dash, after asking for "a funnier name … Can't Hold It, or some
  variation … Keep it child friendly, cute, but funny"). It was first "Walk on Red": the second concept
  review called it "Red Man"; Claude renamed it because "Red Man" can read as a slur. He really needs the loo: a blue
  porta-potty (roof, vent, a WC sign on its door, and a red or green busy dot) stands in the middle
  of the far sidewalk, above his starting column; across, he walks along the sidewalk to its door;
  now and then, standing still, he hops from foot to foot for a
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
  and the view is cut from its middle (owner,
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
  1); the level scores those seconds × (1 + followers across by the time the light turns green). If
  the light turns green first, the level scores 0 and starts again; you need at least 1 point to go
  on. The start card says nothing about points: the first level's score table teaches it (owner,
  2026-11-09: "It should be intuitive from you finishing … the first level, and seeing how the points
  are being computed"). While a level with followers is played, what it is worth right now ("14 s × 3
  people = 42") shows at the top right of the sky, above the walk light, in three pixel lines
  ("14 S", "X 3 PEOPLE", "= 42"); each follower who arrives shows the new multiplier ("×2", "×3") over their head; the
  count-up says "× 3 people". When the walk light turns green, the level's **score table** shows over
  the crossing, plain lines that add up: "24 SECONDS 24", "2 FOLLOWED YOU +48" (each worth the
  seconds again), "1 RELIEVED TOO +24" (below), then the total "+96" and the level's stars (owner,
  2026-11-09: "show like a little table"). The table, the count-up, the "▶▶ 20×" mark and the
  pop-ups ("!", "×2", "+24") are drawn on the street in its own pixels, in a 3×5 pixel font with a
  square box and a one-pixel border, not in smooth type; the table's words stay in the page for
  screen readers (owner, 2026-11-09: "that should also look 8-bit").
- **The 8-bit look, everywhere:** the page's own text and boxes (the start card, the level's
  banner, the HUD, the paused and game-over cards, the mute button, and, for this game, the shared
  back button and "Leave this level?" question) use Kenney Mini Square, the pixel font of Kenney's
  CC0 Fonts pack (the same blocky capitals as the street's 3×5 alphabet, and the font the airport
  tower game uses), at whole-pixel sizes, in square boxes with a solid border
  and a hard shadow, with no blur or rounding; animations step rather than glide; the mute and
  back icons are pixel art. They stay page text and buttons, so taps, keys and screen readers work
  as before (owner, 2026-11-09: "those should also be 8-bit … if we have anything else that is not
  8-bit, we should also make it"). The HUD keeps a fixed space for the points, room for five
  digits, so its bar never changes width as they come in (owner, 2026-11-09).
  Once he's across he goes into the porta-potty: the door closes (its dot turns red), a flush, then
  the celebrating chime as the flush ends, about 1.8 s in all, while the walk light holds its seconds and the street
  goes on at normal speed. Then nobody waits in real time: the whole game fast-forwards at 20 times
  speed under its own rules, in one go, through to the tally: the walk light's seconds drain, the car
  lights go yellow and red as usual and the cars stop at their lines, and the followers still on the
  way carry on as they would, so they can make it, or be hit. The walk to green is then not fast: The points count up big over the far
  sidewalk as the seconds drain ("+42", "× 3 people", the multiplier growing as followers arrive),
  with a rising tick and a "▶▶" mark. At 0 the level is scored, followers still in the road stop, and
  once the crossing is clear (and after anyone relieved too, below) the walk light turns green; then,
  at normal speed so they can be seen walking, everyone left crosses on the zebra under the score
  table, and earns nothing; the table stays 1.4 s more, then the next level
  (owner, 2026-11-09: "it should run the actual rules of the game, and you earn points or not
  according to that"; then "that should also be part of the fast forward, and that should give you 0
  points"; then "much faster"; then "slow down the time for them to cross. And as they are crossing,
  you put the overlay"). When he was too slow, the wait for the crossing to clear runs fast in the
  same way, and the green light's crossing shows "Try again".
- **Relieved too:** from level 10, the last of the followers needs the loo as well: of the crowd, only they
  (and he) hop from foot to foot, with a drop of sweat. If they make it across, then once the
  fast-forward ends he steps out of the porta-potty, they go in, the door shuts, a flush, and the
  level gets the seconds once more as a bonus ("+24", and "1 person relieved too" in the table),
  about 2.4 s at normal speed. A relieved follower still counts as a follower (owner, 2026-11-09: "the
  NPC should not wiggle … maybe 5 and upwards … you get … extra bonus points"; with nobody following
  before level 8, it comes in two levels after the first follower).
- **Followers walk in his footsteps:** from level 8, some of the people waiting beside him (who
  they are is down to chance) stick to him as he steps off the kerb, a "!" over each, and from then
  on walk exactly where he walked: the first is where he was 0.4 s ago, the next 0.4 s after that,
  and so on, catching up a cell every 0.15 s. They don't look at the traffic, they trust him, so
  whether they make it is down to his timing alone: a gap only he fits through gets the last of them
  hit. When he stands still they catch up to his cell (a little to the side). While he is down they
  wait; when he is sent back to the start, they go back to their places on the near kerb with him,
  and stick to him again as he sets off. A follower hit tumbles and is gone: out for this level, and
  their share of the points with them (owner, 2026-11-09: "that pedestrian should disappear"). Followers across queue beside the
  porta-potty, to its right. Nobody in the crowd hops from foot to foot but a follower who needs the
  loo too (above) (owner, 2026-11-09: "randomly they stick to you. But once they do, they follow your
  footsteps"; this replaces copiers who chose their own moment, which made the points feel random).
- **Hits:** a vehicle overlapping the player's cell (vehicle boxes 20% narrower than their art, people
  5 art pixels wide) knocks him down for 1.2 s (the pack's fall and lying frames with stars, a bump
  and a horn), then he starts again from the beginning, at his place on the near kerb, wherever he
  was hit (owner, 2026-11-09: "it doesn't matter when they hit you. You should start from the
  beginning"). Stepping into a vehicle counts.
- **Lives:** a run starts with 3 lives, shown in the HUD as three pixel hearts in the walk light's
  red, beside the level's progress bar; a lost life is an empty heart. Being hit by a vehicle costs
  one: with lives left, the hit goes on as above (down 1.2 s, then back to the start, the walk
  light still counting down). The hit that takes the last one knocks him down just the same, and
  after the 1.2 s the run ends on the Game Over card. Only he has lives: a follower hit, and the
  walk light turning green before he's across, cost none. Lives don't come back during a run, and
  every new run starts with 3 (owner, 2026-11-10: "it should have 3 lives … when you get run over,
  you lose 1 … when you lose the 3, you're done. It's game over"; this replaces "There are no
  lives"). Rejected: the level starting again after a hit (the walk light's clock running on is
  the hit's cost already, as before), and lives refilled each level (a lost life would mean little).
- **Stars:** a level's score against its best possible (all its seconds × everyone across): 12% for
  one star, 28% for two, 45% for three. The best stars per level and the best total are kept.
- **Traffic from the first second:** every level starts with every lane already full of traffic,
  driving (filled by running 16 s of traffic on green before the level starts, every lane in a
  platoon; then the lanes take up their staggered platoons and lulls), so tapping straight up gets
  you hit; level 1 too, with its own sparse traffic. And on every level a car is passing right in
  front of him, in the first lane, as the level starts (owner, 2026-11-09: "they should start with
  cars in front of you. It shouldn't be open the road").
- **The 21 levels**, in three acts (owner, 2026-11-09: "the first 7 levels nobody follows you …
  complexity goes a little bit down so that one person follows you … then you can add a second … the
  last 5 levels or so are gonna be very hard"). Each is half a minute of red (26 to 34 s):
  1. **Quiet Street:** just him, two slow lanes one way, sparse traffic.
  2. **Both Ways:** two lanes, one each way, nearly twice level 1's speed, short lulls.
  3. **Market Avenue:** four lanes with an island.
  4. **Siren Boulevard:** sirens (an ambulance, police car or fire engine, driving over the cars in
     its way, which pull a little aside as it comes up behind them and passes; its lane's edge
     flashing and a siren 2.5 s before it comes, at 2.5 times the lane's speed), on four lanes with
     an island (owner, 2026-11-09: "the one with the siren should show up earlier").
  5. **Bus Lane:** buses and trucks (long vehicles).
  6. **Rush Hour:** five lanes, denser.
  7. **Old Town:** five fast lanes.
  8. **Corner Shop:** the first follower, on four calm lanes.
  9. **School Run:** one follower, school traffic.
  10. **Lunch Hour:** one follower, five lanes; the follower needs the loo too.
  11. **Delivery Day:** two followers, heavy vehicles.
  12. **Evening Commute:** two followers, five lanes.
  13. **Sunday Drivers:** two followers, sirens.
  14. **Town Hall:** two followers, faster.
  15. **Three in Tow:** three followers, four lanes.
  16. **Stadium Night:** three followers, night, sirens.
  17. **Downtown:** three followers, night, two islands, fast.
  18. **Ring Road:** three followers, five fast lanes.
  19. **Freight Route:** three followers, trucks and buses, sirens.
  20. **Late Shift:** three followers, night, three lanes in a row, the fastest.
  21. **Grand Avenue:** three followers, the densest, sirens, 34 s.
  After level 21 the run ends with its total, the stars and the best, on the card headed
  "Across!"; out of lives, the same card is headed "Game over" and shows the total so far, the stars
  won so far and the best, which counts that run. Either way, Play again leads to the start card,
  whose Start begins a new run on level 1 with 3 lives.
- **Tuning, measured with a scripted player** (reading traffic perfectly, waiting on a kerb or
  island until the whole block of lanes ahead stays clear for him and the time his followers need,
  then running it a lane every 0.2 s, sidestepping to find a gap; over 6 seeds a level): levels 1–7
  it never fails, with the seconds it waits growing to up to about 15; levels 8–15 it never fails
  and almost no follower is hit when it waits for a gap they fit; from level 16, short of time it has
  to run gaps only it fits, and finishes with a few seconds left while a third to all of its
  followers are hit, so the last levels are hard. A player tapping straight up without looking is
  hit 3 to 10 times a level from level 2 on. Knobs: each lane's speed, gaps, platoon and lull
  lengths, each level's seconds, and the followers' lag.
- **Hidden assist (0–1):** a hit raises it by 0.25 (0.1 for a follower hit); each follower across lowers
  it by 0.03. It slows traffic by up to 25% and lengthens the lulls by up to 40%. A new run keeps 60%
  of the last run's assist (at most 0.7), and a new player's first run starts at 0.4. It is never
  shown.
- **Interruptible:** when the page is hidden the game pauses, during any part of a level; on return
  the street is frozen and dimmed with "Tap to go on", the tap that resumes doesn't hop, and for
  0.5 s after it nothing can hit anyone.
- **Sound:** a quiet street ambience in place of music (a low city hum with cars swelling past every
  few seconds, made for the game), footsteps, horns (a car coming within 10 art pixels of him, or just
  missing him, honks once: deep for buses, trucks and vans, high for small and sports cars), a
  pluck as followers stick to him, a rising chime for each follower across, a rising tick as the seconds
  count into points, a soft bump and a horn for a hit, a tick each second for the last 5 s, the
  crossing chirp and a jingle on green, a flush and a chime when he gets into the porta-potty, a jingle at each level's start and at the end of the run,
  and a siren, all under the site-wide mute. The flush is the owner's own recording (made with ElevenLabs, 2026-11-09), trimmed and levelled; the ambience, horn, siren and chirp are synthesised for
  the game; the rest are Kenney's CC0 sounds as MP3 (owner, 2026-11-09: "more of like sounds of being
  on a street … but it shouldn't be annoying … different types of horn depending on the car").
- **Folder and URL stay `walk-on-red/`:** the rename changes only the name people see. Renaming the
  folder would break links people have saved or shared and the copy their browser keeps to play
  offline, and lose their best scores, kept under the `walk-on-red` key (Claude, 2026-11-10);
  rejected: a `gotta-go/` folder with a redirect.
- **Tile:** a playable tile on the landing page, right after Googly Faces, titled "Gotta Go!", drawn
  from the game itself (`scripts/walk-on-red/make-tile.mjs`). It is a close-up of the far end of the
  crossing: the game's own portrait view at exactly 6×, cut to the porta-potty, the far sidewalk and
  the top of the zebra, with him halfway through his hop onto the far kerb, his drop of sweat
  showing, on level 1 with the traffic cleared, so there are no cars in it (owner, 2026-11-09: "it's
  showing the cars on the left and the right. So can you make a zoom … towards the top where the
  WCs and … a little bit of walkway"; this replaces the wide street, with cars either side of the
  crossing, that the tile showed before). Its `?tile` page is the game's own view with no cards or
  buttons. The service worker's cache version stays: raising it would empty each visitor's offline
  copy of every game, and the new picture reaches returning visitors on its own, one visit later
  (owner, 2026-11-10, unsure; Claude chose to keep it). The landing page shows 8 tiles. The atlas is the pack's own
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
  everyone still waiting crosses at once, at normal speed, no vehicle enters the crossing, crossing on
  green adds nothing, and the next level (or the same one) starts after the tally — `tests/walk-on-red.test.mjs`.
- **AC-5** Reaching the far kerb fixes the seconds left; he goes in, the door closes and the flush
  plays, then the chime; then the game runs at 20 times speed with its own rules (the car lights
  change, cars stop at their lines, followers on the way carry on and can be hit) while the points
  count up as the seconds drain; the level scores the seconds × (1 + followers across by the green
  light), plus the seconds once more for a follower relieved too; on green a score table shows the
  seconds, the followers and anyone relieved, line by line, and the total; from across to the end of
  the fast-forward takes under 6 s — `tests/walk-on-red.test.mjs`.
- **AC-6** If the walk light turns green before the player is across, the level scores 0 and starts
  again — `tests/walk-on-red.test.mjs`.
- **AC-7** Followers stick to him as he steps off the kerb (a "!" over each) and walk his exact
  path, each where he was 0.4 s before the one ahead; when he stands still they catch up to his
  cell; while he is down they wait, and when he is sent back to the start they are too, and stick
  to him again as he sets off —
  `tests/walk-on-red.test.mjs`.
- **AC-8** A follower hit by a vehicle tumbles and is gone, and no longer counts; the level
  carries on — `tests/walk-on-red.test.mjs`.
- **AC-9** A vehicle hitting the player while he has a life to spare knocks him down and sends him
  back to the start, on the near kerb at his starting column, with one life fewer — `tests/walk-on-red.test.mjs`.
- **AC-10** The 21 levels are as in the decisions: nobody follows on levels 1–7, one follower on
  8–10, two on 11–14, three from 15; an island from level 3; sirens from level 4; heavy vehicles from
  level 5 —
  `tests/walk-on-red.test.mjs`.
- **AC-11** A siren warns 2.5 s before it comes; a car it comes up behind pulls a little aside,
  and back once it has passed — `tests/walk-on-red.test.mjs`.
- **AC-12** After level 21 the run ends with the game-over card showing the total, the stars and the
  best; Play again leads back to the start card — `tests/walk-on-red.test.mjs`.
- **AC-13** A hit raises the hidden assist and a follower across lowers it; a higher assist slows
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
- **AC-19** A hop plays a footstep, followers sticking to him the pluck, a follower across the chime (higher
  for each), a hit the bump and the horn, getting into the porta-potty the flush and then the chime,
  the green light its jingle, and the end of the run the closing jingle — `tests/walk-on-red.test.mjs`.
- **AC-20** The start card says nothing about points; while a level with followers is played, what it
  is worth right now shows as "s s × m people = score", clear of the porta-potty; a follower arriving shows the new
  multiplier ("×2"); the HUD shows no clock; the walk light shows the seconds left in its pixel countdown —
  `tests/walk-on-red.test.mjs`.
- **AC-21** The landing page shows 8 tiles, Gotta Go!'s playable after Googly Faces, linking to
  `walk-on-red/` — `tests/site.test.mjs`.
- **AC-22** A car coming within 10 art px of him honks once, deep for big vehicles and high for
  small ones — `tests/walk-on-red.test.mjs`.
- **AC-23** Every level starts with traffic in its lanes and a car passing right in front of him;
  from level 2, every lane has traffic and tapping straight up from the start gets him hit — `tests/walk-on-red.test.mjs`.
- **AC-24** From level 10 the last follower needs the loo too: of the crowd only they hop from foot to foot;
  across, once the fast-forward ends, he steps out, they go in, a flush, and the seconds count once
  more — `tests/walk-on-red.test.mjs`.
- **AC-25** The page's text and boxes are 8-bit like the street: the pixel font loads, and the start
  and paused cards, the banner, the HUD, the Start, mute and back buttons use it, square, with no
  blur; the HUD's bar keeps one width whatever the points — `tests/walk-on-red.test.mjs`.
- **AC-26** The game page's title and start card say "Gotta Go!", and neither its title, its
  description nor its visible page text says "Walk on Red" — `tests/walk-on-red.test.mjs`.
- **AC-27** The tile picture is the close-up made by `scripts/walk-on-red/make-tile.mjs` from the
  game: the porta-potty, the far sidewalk, the top of the zebra and him with his drop of sweat, with
  no vehicle in it — verified by review: serve the site and run the script, which stops if the view
  isn't at 6×, he isn't mid-hop, his drop of sweat isn't showing or a vehicle is on the street; the
  committed `assets/tiles/walk-on-red.png` looks the same as what it makes.
- **AC-28** A run starts with 3 lives, shown in the HUD as 3 hearts, and a hit empties one; a
  follower hit and the walk light turning green before he's across cost none; the next level keeps
  the lives left; a new run has 3 again — `tests/walk-on-red.test.mjs`.
- **AC-29** The hit that takes the third life knocks him down, then ends the run: the game-over card,
  headed "Game over", shows the total so far, the stars and the best (which counts it), with the
  closing jingle; Play again leads to the start card, and Start begins level 1 with 3 lives —
  `tests/walk-on-red.test.mjs`.

## Core flow

1. Tap the Gotta Go! tile: traffic is driving behind a small start card.
2. Tap Start: he's on the near kerb, hopping from foot to foot, and the walk light is counting down.
3. Hop across through the gaps; from level 8, people stick to you and follow your footsteps.
4. Reach the porta-potty: the door closes, a flush, a chime; the street fast-forwards as the seconds
   count into points and the lights change; everyone crosses on green, the tally shows, the next
   level starts.
5. Hit three times, or after level 21, see the total and the stars, and play again.

## States

| State | Start card | Paused card | Game-over card | HUD (level, lives, total) | Banner |
| ----- | ---------- | ----------- | -------------- | ------------------------- | ------ |
| Start (traffic drives behind) | shown | hidden | hidden | hidden | hidden |
| Playing (walk light red) | hidden | hidden | hidden | shown | the level's name, for a moment |
| Across: in the loo, fast-forward, relieved too | hidden | hidden | hidden | shown | hidden |
| Green: everyone crosses | hidden | hidden | hidden | shown | the score table, or "Try again" |
| Tally | hidden | hidden | hidden | shown | the score table, or "Try again" |
| Paused (returned from hidden) | hidden | shown | hidden | shown | as before |
| Game over (after level 21, or out of lives) | hidden | hidden | shown, "Across!" or "Game over", with the total, the stars and the best | hidden | hidden |

## Out of scope

- A daily traffic seed ("Today's street"), a level select or continuing a run, and more than 21
  levels.
- Leaderboards, accounts, choosing your character.
- Winning lives back, or lives carried from one run to the next.
- Music settings beyond the site-wide mute.

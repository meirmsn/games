# Pixel Leap: build a monster, leap through worlds drawn in different art styles

**Go:** "don't consult with me, just start building after following this process" 2026-11-09; batch 2: "Go" 2026-11-10; batch 3: "Go" 2026-11-10; batch 4: pending

## Intent

The owner's seed, in `discussion/direction.md`: "The platformer has a reason to keep going: **each
world looks completely different**, because each one is drawn from a different asset pack … The
game evolves as you go. **The player builds their character** with the Monster Builder Pack." Their
words for this batch (2026-11-09): "review the game concept against the guidelines and propose
something that works, and then do adversarial review … so that you have solid concepts of the game
and then build them … don't consult with me, just start building after following this process."
The hard part named in the brief: the packs differ in art style and tile size (pixel vs vector), so
a scale-and-style rule must make the change of worlds feel deliberate, and the touch controls must
be excellent.

**Hook:** build a goofy monster, then run and jump through worlds drawn in completely different art
styles, and each world redraws your monster in its own style: chunky pixels in the Meadow and
Frost, smooth and glossy in Candy, two-colour ink in Ink. (Frost, here and in the first slice's
decisions below, was replaced by Ice in batch 3; the batch decisions after them are the current
ones.)

This change is the first slice (see Out of scope): the builder, the style rule and four levels,
each its own world: the Meadow and Frost (two parts of the Pixel Platformer pack), Candy (Platformer
Assets Candy, smooth) and Ink (the 1-Bit Platformer pack). The surface is a new game page,
`pixel-leap/`, and its landing-page tile becomes playable. The game has its own look per world, like
any game page; the landing page keeps the site's tokens. There is no `DESIGN.md`, so the baseline is
the design.

### Batch 2: Farm, Industrial, Mushroom and Pico

The owner's words for this batch (2026-11-09): "Add **Farm** (Pixel Platformer Farm Expansion),
**Industrial** (Pixel Platformer Industrial Expansion), **Mushroom** (Platformer Assets Mushroom) and
**Pico** (Pico-8 Platformer). Place them between the existing worlds so pixel and smooth keep
alternating: Meadow, Farm, Frost, Candy, Industrial, Mushroom, Pico, Ink, or better if play shows a
better order. Each world needs its own mechanic and its own kind of challenge, not just a new skin
… **Farm:** platform-heavy: many platforms, big and small, at very different heights; haybales that
bounce; hidden pockets of coins. **Industrial:** moving platforms and lifts, and conveyor belts; a
timing-and-riding challenge. **Mushroom:** mushroom caps that launch you higher with each bounce; a
vertical, tall climb. **Pico** (8 px per tile, 16 colours; the monster baked to that palette):
crowded with bad guys, including flying ones that swoop; stomp chains pay extra." Every rule above
stays: an easy opening then the real threat, the same physics, bad guys 1.5 tiles, hearts and three
lives, the glimpse before each door, the map showing every world, and the layout checks of AC-21,
extended to each new mechanic. The journey grows from four levels to eight, about 12–16 minutes.

### Batch 3: Castle, Ice, Sea and Ink's darkness

The owner's words for this batch (2026-11-10): "Add **Castle** (Platformer Pack Medieval: a key opens
the gate, crushers drop on a rhythm), **Ice** (Platformer Assets Ice: slippery ice, snowballs
rolling down slopes), **Sea** (Platformer Pack Nautical: swimming, each tap a stroke, currents), and
**Ink's darkness** (only a circle of light around the monster). Place them so pixel and smooth keep
alternating where they can, or better if play shows a better order; Ice may replace today's pixel
Frost (the lineup says so; ask the owner). Each world needs its own mechanic and its own kind of
challenge, not just a new skin … **Castle:** puzzle-like situations: a key opens the gate; crushers
drop on a rhythm. **Ice:** precision on small ledges: slippery ice; snowballs rolling down slopes.
**Sea:** a different control: swimming, you float and each tap is a stroke; currents. **Ink's
darkness:** the unknown: only a circle of light around the monster, with its ghosts and drips."
Every rule above stays: an easy opening then the real threat, the same physics (Sea's swimming is
the one new control, its numbers in tiles), bad guys 1.5 tiles, hearts and three lives with game
over back to level 1, the glimpse before each door, the map showing every world, and the layout
checks of AC-21, extended to each new mechanic. The journey grows to ten levels, about 16–20
minutes.

### Batch 4: Scribble, Sky and the journey's end

The owner's words for this batch (2026-11-10): "Add **Scribble** (Scribble Platformer: platforms
that draw themselves as you get near) and **Sky** (Jumper Pack: the finale, an automatic bouncing
climb), and **the journey's end**. Place them so pixel and smooth keep alternating where they can,
or better if play shows a better order (the run ends on Castle today). Each world needs its own
mechanic and its own kind of challenge, not just a new skin … **Scribble:** trust: platforms draw
themselves in as you near; jump before the ground is there. **Sky:** the finale: an automatic
bouncing climb upward, a sprint to the top. **The journey's end:** what the player sees past the
last door (today a stats card that says 'more worlds are on their way')." Every rule above stays:
an easy opening then the real threat, the same physics (Sea's swimming is the one other control;
any new numbers in tiles), bad guys 1.5 tiles, hearts and three lives with game over back to level
1, the glimpse before each door, the map showing every world (checked with twelve cells), and the
layout checks of AC-21/AC-38, extended to each new mechanic. With these two worlds every world in
the lineup (Out of scope) is built: the journey is twelve levels, about 20–24 minutes, and ends.
Riding along: FINDINGS F-13 and F-14 (stale mentions of Frost).

### Concept check (the guidelines' questions)

- **Verb:** run and jump, with a variable-height jump, coyote time and jump buffering, a floppy
  monster with squash and stretch, and stomps that bounce you (higher if you hold jump).
- **A typical 5-second choice:** in the Meadow, stomp the walker to bounce up to the coin ledge, or
  wait for it to pass and take the low road; in Candy, ride the crumbling cookie bridge for the coin
  line before it drops, or take the slower floor past the slimes; spend a heart on a risky coin
  line, or keep it for the spikes ahead.
- **How it teaches:** each level opens gently and brings its new thing where it can't hurt yet,
  then ramps up to the level's full threat. The Meadow opens with run, jump and coins and no
  hazards, then one walker on flat ground, one spike, a small pit, then walkers in pairs and wider
  pits. Frost brings ice and spiky walkers you can't stomp, and the ears. Candy brings jelly,
  crumbling cookies and slimes. Ink brings ghosts and drips that fall as you pass. No text: the deck
  lights the button you press.
- **Three clocks:** seconds: coins, landings, stomps; minutes: a new level about every 1–2 minutes,
  each a new world with its own look, sound and rule; return: best time per level, the run's
  furthest level, your monster.
- **What an expert does differently:** keeps top speed through stomp-bounces, takes the high coin
  routes, holds two hearts into the hard parts, grabs the ears in Frost and uses the float for
  Frost's shortcut and Candy's float-only coin line.
- **Why the tenth play differs:** a different monster each time you build one; the ears change
  which routes you can take; three lives make a run a real attempt; a best time and all-coins to
  beat.
- **Form:** long-form, a journey of worlds (finally ~6–8 worlds, 15–25 min); this slice is four
  levels, about 6–8 minutes. **Orientation:** portrait, laid out like a handheld: the view on top and
  a control deck below, so thumbs never cover the game. Landscape and desktop work too.
- **What a failure costs:** a hit with a heart held costs the heart; without one it costs a life and
  restarts the level (about a minute of play). Three lives; game over starts the run again from the
  first level, with the same monster.
- **Instead of save games:** your monster as a short code in the URL and in localStorage; best time
  per level.
- **Riskiest technical part, proved first:** the style rule (a vector monster baked to a pixel
  world's grid, crisp integer scaling at any device pixel ratio) and the touch deck. The prototype
  composite (a Monster Builder monster baked to 27 px tall with a 1-px outline beside the pack's own
  characters) read clearly before the build started.

### The adversarial reviews, and what changed

A fresh reviewer attacked concept v1. What it found and the fix taken: too little look-ahead on a
phone (fixed: ~13 tiles across, a camera lead, a top speed of 6.5 tiles/s); a pixelated monster with
smudged face and shimmering rotated limbs (fixed: the monster is baked once per world into a few
pose frames, face parts enlarged, binary alpha and a clean outline; no rotation in pixel worlds);
cosmetic-only parts (fixed: the prize gives an ability); a hidden prize (fixed: always in view from
the main path); a too-big slice (fixed: later worlds are later slices); touch edge cases (fixed:
deck inset from the edges, no long-press or selection, two fingers); hitbox rules, interruptibility
and the assist (fixed below); a flag at the end (fixed: a door). A second reviewer then attacked this
spec. Fixed from it: the tile rule at pixel ratio 1, the leap defined frame by frame, the tally and
pause rules, bad codes and blocked storage, turning the phone mid-run, which half owns a touch,
every world loaded for offline play, Escape pausing, best times kept by version, and a performance
item.

## Decisions

- **The scale-and-style rule, "the world redraws you":** one tile is one world unit. Every world
  draws its tiles at the same size on screen, and all physics is in tiles, so the monster runs and
  jumps exactly the same everywhere (only the ground's grip differs, on Frost's ice). A world sets
  only its resolution in pixels per tile and its palette: the Meadow and Frost are 18 px per tile and
  Ink 16, each drawn into a back buffer and scaled to the screen with no smoothing; Candy is 70 px per
  tile, drawn smooth. The monster is drawn by the world's rule too: in a pixel world it is baked to
  that world's grid (about 27 px tall) with binary alpha, a short palette of its own (a few flat
  colours, none near another: the body's main colour and its face's) and the pack's dark 1-px
  outline, with its eyes and mouth enlarged so the face reads, and animated by a few pose frames
  instead of rotation; in Ink it is baked in the world's two colours, a solid ink body with its dark
  features cut out, like the pack's own characters; in Candy it is the vector parts, drawn smooth
  with swinging limbs. Rejected: drawing every pack at its native size, and one style for the monster
  everywhere, which looks pasted on in one of the worlds.
- **The HUD is big and chunky:** lives (your own monster, small), hearts and coins in thick-bordered
  pixel boxes at the top, about 46 px tall on a wide screen and 40 on a phone, where the level's name
  leaves the HUD for the banner as each level opens.
- **Bad guys are bigger, and Candy's are clearly bad guys:** walkers, ghosts and slimes are drawn
  half again as big as a tile, with hitboxes to match. Candy's are the New Platformer Pack's slimes,
  vector like Candy: purple ones you can stomp, and green ones with a spike you can't (like Frost's
  spiky walkers); Candy has more of them than before.
- **The UI follows the rule too** (owner, 2026-11-09: "on the monster maker it should be pixelated
  already … make those buttons of body, color, eyes, and everything look 8-bit … Same goes for the
  … HUD … And then you change all the HUD as well to be smooth"): the builder shows the monster
  already baked in the Meadow's pixels, scaled up by a whole number; the cards, buttons and HUD are
  drawn in pixels (the Kenney Pixel font, square corners, hard borders, stepped shadows) in pixel
  worlds, in ink on dark in Ink, and smooth in Candy.
- **Changed after the go, by the owner (2026-11-09), on seeing the first baked monsters:** "the
  pixelated looks better BUT don't have those transition pixels … just commit to a short list of
  colors per character". So a baked monster has no in-between shades: every pixel is one of its
  short palette's colours or the outline. Then (2026-11-09): "That white monster still looks odd
  because there's like two shades of black and two shades of gray … not allow near colors." So no
  two colours of a baked monster may be near each other: a colour close to one already in (the
  outline first, then the body's main colour, then the face's) merges into it.
- **Changed after the go, by the owner (2026-11-09), after playing the preview:** "each level is
  visually different. So you're done with level 1, and once you see level 2, you already are in a
  different world … level 3, it should look actually from a different asset pack … level 4 and yet
  another different"; "level 1 … the initial piece … is easy … then you start seeing the bad guys,
  maybe one or two, and then towards the end … more like the regular level"; "at the end of every
  level … a little sliver of the new level, and that's where the door is"; "there should be a lives
  counter. You start with 3 lives … if you lose, it should start from the beginning of the level …
  when you're done with the 3 lives, you start from the beginning of the game"; the heart "should …
  help you be more resilient to touching one of the bad guys or one of the spikes … you can only
  accumulate two of them … if we show you another heart later … It should show you coin"; and the
  spring "under the four blocks … I would have expected this jumping thing to be just before or just
  after … some sort of heuristics or logical testing for the layout of the levels". These replace the
  earlier three-stage worlds, checkpoints and no-lives rule, and are the decisions below.
- **Four levels, each its own world:** 1 Meadow (Pixel Platformer, grass: an easy opening, then
  walkers, spikes, a spring and pits ramping to the level's full threat); 2 Frost (the same pack's
  snow and icy sky: ice that keeps you sliding, spiky walkers you can't stomp, and the ears); 3 Candy
  (a different pack, smooth: jelly that bounces you high, cookies that crumble half a second after
  you land and come back after 3 s, slimes, the spiked ones unstompable); 4 Ink (the 1-Bit pack, two colours: ghosts, and
  drips that fall as you come near, landing just ahead of a monster at full speed). Each level is
  about a minute for a first-timer.
- **A glimpse of the next world:** each level's last stretch, its door included, is drawn by the next
  world's own rule (its art at its own resolution: smooth before Candy, two-colour pixels before Ink),
  a mini preview of where the door leads. Stepping into it redraws the monster in that world's style:
  it steps through the resolutions between the two over half a second, with a rising sound into a
  smooth world and a falling one out of it; the music stays one track per level (owner, 2026-11-09:
  "when you get to the door, that it's already a mini preview of the next level … when you go
  through the door, then there's some sound effect … to get the feeling that you're transitioning
  from smooth to 8-bit or from 8-bit to smooth. And visually … the monster transitions at the same
  time").
- **Changed after the go, by the owner (2026-11-09), after playing the second preview:** "the HUD at
  the top … should be much larger and clearly 8-bit … it shouldn't be huge on mobile either"; "I see
  like a weird vertical line when the transition to the new world"; "once you get through the door,
  I don't think you need to show those numbers. You just transition automatically to the next world
  … at the end when you die, you can show the statistics"; "in the candy world, I don't know why the
  bad guy is some candy … need something else to be a bad guy … That level felt a little bit empty of
  bad guys … I think we need larger bad guys"; and a world map: "when you transition world or when
  you start, we show you like a little map … the first cell where you are … then a line, and then a
  cell … Once you go through the door, you go back to this view … the path ahead, now you can walk
  through it … Don't show a lock … the rest is … carved out into the wall". These are the decisions
  below on the map, the HUD, the bad guys and the statistics.
- **Changed after the go, by the owner (2026-11-09), after playing the third preview:** "We need to
  improve the bit rate on the 8-bit monsters. They look very creepy and uncanny … they should be more
  cute … uniform shapes … We need to fix the eyes and the mouth." So in a pixel world the monster's
  face is no longer the vector face shrunk down: its eyes (one, two or three round eyes with a 2×2
  pupil, in the eye part's own colour; happy arches; angry brows) and its mouth (open with a tongue
  or a tooth, a smile, fangs, teeth) are drawn as pixel art, and lone specks and slits in the body
  are smoothed away, so its shapes stay whole. Then: "It's okay that the game ships" with these four
  worlds, and the rest of the worlds follow in batches of four (see Out of scope).
- **The world map, between levels:** Go, and every level's door, lead to the world map: the levels
  as cells on a zig-zag path carved into a dark stone wall (up the screen in portrait, across it in
  landscape), with the start as a small pad. The cells you've reached and the one you're heading for
  are lit, each showing a little scene of its world drawn by that world's own rule; the rest are dark
  hollows in the wall, with no lock. The path's leg to the next cell paints in (gold dots), the
  monster walks along it, steps into the cell, and the leap opens the world (about 3 s; a tap or a
  key skips to the step in). No numbers between levels.
- **The leap into a world:** from the map, 1.6 s: a soft white flash (0.3 s), then the world drawn
  through the resolutions between the map's pixels and its own: into a smooth world at 18, then 35
  px per tile, then smooth; into a pixel world straight at its own. The level's name then shows big
  for a moment. Rejected: a fade to black, which hides the rule. Time on the map, paused or hidden
  never counts toward a level's time.
- **Statistics only at the end:** the run's coins, time, the prize and the best run show on the card
  after game over or past the last level's door, with Play again and New monster; a level's best time
  is kept as you pass its door.
- **Lives and hearts:** three lives. A hit (spikes, a walker's, slime's or ghost's side, a drip)
  takes a heart if you hold one: you're knocked back and safe for a moment. Without one, it costs a
  life, and the level starts again from its beginning (its coins and things back as they were).
  Falling off always costs a life. With no lives left it's game over: the card shows how far you got,
  and Play again starts a new run from level 1 (through the map) with the same monster, or New monster
  goes to the builder. A heart is a pickup that counts as a coin; you can hold at most two, and while you hold
  two, the hearts ahead show as coins. Rejected: checkpoints with no lives, which the owner found
  gave no reason to care.
- **Screen size of a tile:** the canvas is drawn at the device's pixel ratio, at least 2 and at
  most 3 (a ratio-1 screen gets a 2× canvas that the browser scales). The tile is a whole multiple of
  18 canvas pixels, chosen so the view is about 13 tiles across in portrait (at least 12) and about
  10 tall in landscape, so the 18-px worlds stay crisp (Ink's 16 px are scaled to the same tile). The
  camera leads in the direction you run, so you see at least 7 tiles ahead, and it follows a spring's
  launch up so the landing is in view. Turning the phone or resizing recomputes all this, keeps the
  monster where it is in the world, releases every held control and pauses play.
- **Movement:** top speed 6.5 tiles/s; a held jump reaches about 3.3 tiles, a tap about 1.5;
  coyote time 0.1 s, jump buffer 0.12 s. The monster's hurtbox is about 70% of its drawing. A stomp
  counts when you're falling and your feet are above the walker's middle; spikes have a small grace
  margin. Every hazard is in view at least a second before you must commit to it.
- **Level layout rules, checked by a test:** a spring or jelly has open air above it (no solid tile
  within six tiles above it or its neighbours), so its launch is never wasted on a ceiling; no
  hazard is within 7 tiles of a level's start; a simple player that only runs and jumps finishes
  every level.
- **Builder:** the game opens on the builder over the live Meadow, with your last monster or a
  random one. Big buttons cycle body shape (6), colour (6), eyes (12), mouth (13), arms (5) and legs
  (5); Shuffle; Go. Each change makes the monster hop and plays a sound. A first-timer can press Go
  at once. Play again, at the end of the last level, goes back to the builder.
- **The prize gives an ability:** Frost has one Monster Builder part in plain view from the main
  path, behind a route you choose to risk: a pair of big ears. Once you have them, holding jump while
  falling floats you down slowly. They join your monster, drawn in each world's style, for the rest
  of the run (a life lost in Frost loses them with the level).
- **Rewards:** coins (hearts count as coins too), time, the prize, shown for the whole run at its end; best
  time per level in localStorage, kept under this version of the levels.
- **Hidden assist:** after two lives lost since the last level cleared (game overs included), coyote
  time, jump buffer and landing grace grow (up to double); clearing a level resets it. It never
  changes enemies or hazards, so the top stays hard.
- **Touch deck (portrait):** below the view, at most 180 px tall plus the safe area, inset 24 px
  from the side edges. The left half is the run pad: the finger's side of its centre runs that way,
  slide across without lifting to turn, the middle notch stops. The right half is one big jump button
  (hold for higher). A touch belongs to the half it began in until it lifts, whatever it slides
  over; one touch per half counts and any more are ignored. Two fingers work at once. No long-press
  menu, selection or scrolling. In landscape on touch the two halves sit in the bottom corners over
  the view. Keyboard: arrows or A/D to run, Space, Up, W or Z to jump, P or Escape to pause (Escape
  leaves the game only from the builder). Mouse: the deck's buttons are clickable. The lives, hearts,
  coins and level sit at the top, clear of the back button; a mute button sits top-right, as in Reef.
- **Interruptible:** play pauses when the page is hidden or loses focus and shows a small Paused
  card; a tap resumes (that tap doesn't also jump), held keys are released, and the monster is safe
  for half a second.
- **Memory:** your monster's code (a version digit then six letters, never the ears) goes in the URL
  (`#m=…`) and, on Go, in localStorage; opening a link with a code shows that monster. A code that
  doesn't parse gives a random monster, with no error. Storage that is blocked or throws changes
  nothing but what's remembered. Every world's art and sound loads with the page, so a game played
  once has every world offline.
- **Sound:** each world has its own sound set, as it has its own art: the Meadow and Frost use
  Kenney's Retro Sounds and a chiptune loop, Candy soft plucks, glass and a gentle loop, Ink the retro
  set and its own darker loop: jump, coin, stomp, hurt, heart, landing, spring, bounce, crumble,
  prize; the builder's clicks; the leap and the end card's jingle. All under the site-wide mute, unlocked
  by the first touch. The owner will generate music for each world from prompts once the levels are
  settled (owner, 2026-11-09: "For the music, you can give me prompts, but let's first do the
  levels").
- **Not a copy:** an original monster you build, Kenney's CC0 packs, levels made for this game; no
  question-mark blocks, pipes or flagpoles.
- **Different in kind** from Reef (drag to steer, spawned levels with lives) and Googly Faces (tap):
  the verb is run and jump, the structure is hand-made levels that each change the world, and a
  failure replays a hand-made level rather than respawning a moment ago.
- **Targets and knobs:** first coin within 5 s of Go; the first walker about 20 s in; a new world
  about every 1–2 minutes. The knobs are the movement constants above, the assist and the level
  layouts, all data. Performance: a frame's update and draw stay well inside a 60 Hz frame on a
  phone; physics runs on delta time in fixed steps, so it is the same at 60 and 120 Hz.
- **Batch 2: eight levels, in this order** (owner, 2026-11-09, quoted in Intent): 1 Meadow (pixel,
  18), 2 Farm (pixel, 18), 3 Frost (pixel, 18), 4 Candy (smooth, 70), 5 Industrial (pixel, 18), 6
  Mushroom (smooth, 70), 7 Pico (pixel, 8 px per tile, 16 colours), 8 Ink (two colours, 16). From
  Candy on, pixel and smooth alternate; Meadow, Farm and Frost are all pixel because the owner's
  order puts them first. Each new world's level opens with an easy stretch (no hazard within 7
  tiles of its start), brings its mechanic in where it can't hurt yet, then ramps up to its own kind
  of challenge. Physics, bad guys' size, hearts, lives, the assist and the glimpse are as above.
  Farm and Industrial use the Pixel Platformer's characters (they are its expansions, with tiles
  only); Mushroom uses the New Platformer Pack's slimes, as Candy does (the Mushroom pack has no
  characters); Pico uses its own pack's bad guys (walkers, and the winged ones as flyers). Farm,
  Industrial and Pico use the retro sound set and its loop, Mushroom Candy's soft set and loop, until
  the owner's own music (owner, 2026-11-10, at the go: kept Pico at 8 px, accepted the snaking map,
  no crushers and slimes in Mushroom, and did not take new Kenney loops for the new worlds). The hidden assist never changes moving platforms,
  belts, caps, haybales or flyers. Best times move to a new version of the levels (3), so an old
  four-level run is no best to beat. A crossing between two pixel worlds of different resolutions
  (Pico's 8 into Ink's 16) redraws the monster straight in the new style, with no sound, as between
  any two pixel worlds.
- **Farm: platforms, haybales, hidden pockets.** Most of the level is platforms (the pack's wooden
  planks and crates): at least 14 separate platforms, from 1 to at least 6 tiles long, at at least 5
  different heights from 1 to 8 tiles above the ground, over pits and over walkers, so the route
  is chosen up and down. A haybale is a solid tile that bounces you when you land on it: about 2.5
  tiles high on its own, about 5 with jump held. Hidden pockets: at least 3 nooks off the main
  route (up high or under a platform), each with at least 3 coins that aren't drawn until the
  monster is within 3 tiles; a faint glint every 2 s marks each pocket, so an attentive player can
  find them. Rejected: a secret wall you walk through, which the pack has no art for.
- **Industrial: riding and timing.** Moving platforms (3 tiles wide, sliding back and forth along a
  track of 4–7 tiles at 2 tiles/s), lifts (3 wide, rising and sinking along up to 6 tiles at 2
  tiles/s) and conveyor belts (ground that carries the monster standing on it at 2.5 tiles/s, left
  or right; bad guys walk on belts unmoved). A platform or lift carries the monster standing on it
  exactly with it, and a jump off it keeps its sideways motion; you land on it from above and jump
  through it from below, like a one-way ledge, and it never crushes. Movers start over with the
  level when a life is lost; no track reaches below the level's ground line or crosses into the
  glimpse. At least two gaps are 10 tiles or wider, more than a running held jump can clear even
  with the ears' float (about 9.4 tiles), so they are crossed only by riding; at least one ledge is
  reached only by a lift; past the opening, belts carry you toward spikes or pits, so you run
  against them or time a jump. Rejected: platforms that crush, which punish a ride you can't see
  coming on a phone.
- **Mushroom: a tall climb on bouncing caps.** The level is a climb: its door is at least 30 tiles
  above its start, more than a phone's view is tall, so the climb scrolls. A mushroom cap (3 tiles
  wide on a stem) launches you as you land on it, measured from the cap's top to the monster's
  feet at the top of the arc: 4 tiles the first time, then 6, then 8 for every landing on a cap
  after that (the same cap again counts) while you touch nothing else; landing on anything else
  (ground, a ledge, a haybale or platform) sets it back to 4, and a stomp or a hit doesn't. No jump
  is needed and holding jump changes nothing. Flat stem-top ledges, which don't bounce, rest you
  between the bouncing runs. A level has its own height in rows (Mushroom's about 48, the others 15)
  with its ground line near its bottom; the camera follows up and down, so after an 8-tile launch
  the landing is in view; falling off its bottom still costs a life. The climb ends on a plateau at
  the top, and the glimpse and the door are on that plateau.
- **Pico: crowded, flyers, stomp chains.** Pico is drawn at 8 px per tile, every pixel of the world
  one of PICO-8's 16 colours, and the monster is baked to those colours too (its own short palette
  is mapped to their nearest, with the outline the palette's darkest). A Pico pixel is 2.25 or 4.5
  screen pixels at most tile sizes, so its blocks are not all equal, as with Ink's 16. It has more
  bad guys than any other level, at least one for every 8 tiles after its opening: the pack's
  walkers, and flyers that hover about 4 tiles up and, when the monster comes within 5 tiles ahead
  while on the ground, swoop down at 6 tiles/s toward where it stood, then climb back (changed
  after the go, by the owner, 2026-11-10, on a flyer diving into the monster mid-jump: "Keep it",
  so a flyer dives only at a monster on the ground; keep moving and it misses). A flyer can be stomped. Stomp chains
  pay extra: in Pico, each stomp after the first before you land again pays coins (the second +1,
  the third +2, up to +4 each), shown by a "+n" over the stomp; they count in the run's coins. A
  chain ends when you land on anything (ground, ledge, platform) or take a hit.
- **Music prompts for all eight worlds, and layered music** (owner, 2026-11-09: "give me the
  prompts for the music for all the levels … 8 prompts. It's gonna go to 11 labs music generator.
  Hopefully they're not like 15-second loop … maybe 1 minute long or 3 minutes long is actually not
  that big of a deal … something like the parallax effect, but for sound, where you actually
  generate … one track and another one that you can lay out on top at random intervals"). Each
  world gets a prompt for a bed (about 2 minutes, instrumental, made to loop) and for three short
  accents (4–8 s, free-time, no drums, so they sit on any bar) that play over the bed at random
  every 15–40 s, never twice in a row. The prompts are given in the chat; the files are the owner's
  to generate. Until a world's arrive, it keeps its Kenney loop.
- **The owner's music is in for four worlds** (owner, 2026-11-10, sending the Meadow's bed and
  accents: "maybe you can use them", then the Farm's, Frost's and Candy's). Each bed is levelled and
  kept at 64 kbps (about 1 MB); each accents file is cut into its three phrases. A bed is streamed
  by an audio element from a copy fetched as the page loads, so it is cached for offline play like
  everything else but never decoded whole: eight two-minute tracks decoded would take hundreds of
  megabytes on a phone. The accents count only while playing; pausing stops the bed, and the
  site-wide mute mutes it. The other worlds' files are wired in the same way as they arrive.
- **The world map grows to eight cells:** the cells follow a snaking path in rows (three across in
  portrait, going up the screen; four across in landscape), so all eight and the start fit on any
  screen the game supports, each cell's name at least 12 CSS px tall. The zig-zag of four cells
  can't hold eight. With ten (batch 3, found in the build, Claude, 2026-11-10), landscape takes five
  across in two rows: four across would need three rows, too tight on a short landscape screen.
- **Batch 3: ten levels, in this order** (owner, 2026-11-10, at the go: "Ice replaces Frost" and
  "Perfect alternation"): 1 Meadow (pixel, 18), 2 Ice (smooth, 70; it replaces Frost, and takes
  Frost's ears), 3 Farm (pixel, 18), 4 Candy (smooth), 5 Industrial (pixel), 6 Mushroom (smooth), 7
  Pico (pixel, 8), 8 Sea (smooth, 70), 9 Ink (two colours, 16, now dark), 10 Castle (smooth, 70).
  Pixel and smooth alternate at every door. Ice opens gently, as level 2 must: its first stretch
  is snow, its ice ledges come later and its ears sit on a route you choose to risk. Ice replaces Frost
  because two ice worlds would be the same mechanic twice, the owner's "different skin" note; it
  keeps Frost's slot, its prize and the owner's Frost music (a cold, glassy bed fits Ice). Proposed
  first was keeping every shipped world's place (Meadow, Farm, Ice, Candy, …), which breaks the
  alternation twice; the owner chose perfect alternation. Sea, a new
  control, comes at 8 rather than last, so a game over there costs less replay; Ink's darkness is
  late; Castle's puzzles, at the end of a castle's road, close the journey for now. Frost, the Pixel
  Platformer's snow, leaves the game; its level and art go. The three new worlds are vector packs with no characters
  of their own, so their bad guys come from the New Platformer Pack (as Candy's and Mushroom's
  slimes do): Castle's mice, Ice's snails, Sea's fish; Castle's key and Sea's urchins (its spikes) come
  from it too, as the world's own pack has none. Added beyond the request, for the go: lamps in
  Ink, the mice, snails, fish and urchins, a key count in the HUD, and two kinds of ground in Ice. All three use Candy's soft sound set and loop
  until the owner's music (Ice: the Frost bed and accents). Best times move to version 4. The hidden
  assist never changes crushers, snowballs, currents, fish or the swim. Bad guys stay 1.5 tiles,
  including fish; a snowball is 1.2 tiles across (a rolling hazard, not a bad guy).
- **Castle: keys, gates and crushers, in puzzle-like situations.** A gate is the pack's portcullis,
  3 tiles tall with wall above it to the top of the level, so it can't be jumped. It is solid until
  the monster touches it while holding a key; then it rises and stays open, and the key is used.
  Any key opens any gate; keys held show in the HUD; a life lost resets them with the level. Each
  gate's key is in the stretch before it, never on the straight run to it: up a climb of ledges,
  back behind you, or at the end of a side passage, so reaching a gate without its key means going
  back to find it. There are at least three gates. Keys still held at the door are dropped (none carry
  into the next level); a hit taken with a heart keeps the keys; mice turn back at a shut gate. A
  crusher is a 2-tile-wide stone block hung on a chain, its bottom at most 4 tiles above the
  floor: it waits up (1.4 s, shaking for its last 0.4 s), drops to the floor in 0.2 s, stays down
  0.6 s and rises in 1.0 s, a 3.2 s rhythm; crushers in a row are offset so a gap opens and runs
  along them. Its steady rhythm is its warning (as the spec's one-second rule asks): the next drop
  is always readable from the last. Touching a crusher while it falls or is down (or rising, its
  bottom under 1.4 tiles off the floor) is a hit; a heart knocks you out away from its middle, and
  the 1.2 s of safety after it outlasts the 0.6 s it stays down. A crusher is never a surface or a
  wall: up, it is harmless stone overhead. Rejected: crushers that pin you against the floor (a death with no way to read it on a
  phone) and switches far from their doors (too slow to read without text).
- **Ice: precision on small ledges, slippery ice, snowballs down slopes.** Two grounds, per tile (new: Frost's
  ice was the whole world): snow (tundra) grips like grass; ice (the pack's ice blocks) keeps you
  sliding with Frost's numbers (from top speed you slide about 2.3 tiles to a stop; steering back
  stops you in about 1). At least 10 ledges 1–3 tiles long over pits, so a landing must be placed;
  at least 5 of them are ice, each at least 2 tiles long, so a landing at a walk holds. Slopes: the
  pack's 45° snow hills, snow only; they count as ground (for jumps, coyote time and landings) and
  you run them at your flat speed; the monster runs up and down them without jumping, its feet on
  the slope; snails turn back at a slope. A snow pile at a slope's top, always in view from the
  slope's foot, sends a snowball every 2.5 s (each pile its own phase): it rolls down at up to 4
  tiles/s, carries on along the flat at 3 tiles/s and shatters at a wall or the edge of a pit. Its
  pile's steady rhythm is the warning, and it shakes a moment before it sends one. Found in the
  build (Claude, 2026-11-10): each snow slope has a ditch at its foot that catches its snowballs, so
  they never roll on across the level, and its pile sits a tile back from the top; a snowball sets
  off slowly and gathers speed. Then the way up is readable: wait for a snowball to drop into the
  ditch, run up, and jump the next one on the flat top. A snowball, 1.2 tiles across, hurts; it can't be stomped,
  only jumped. Ice's bad guys are snails (stompable, slow). The ears are on a high ice ledge in plain
  view from the main path.
- **Sea: swimming.** The level starts on a beach and goes under the water in basins. The monster is in the
  water when its middle is below the surface. There it floats: water gravity 4 tiles/s² and it
  sinks at most 1.5 tiles/s; each jump press is a stroke, an upward speed of 4 tiles/s (about 2
  tiles of lift), at most one stroke every 0.25 s, and holding jump does nothing more; it swims
  sideways at up to 4 tiles/s. A press on the water's floor, or one buffered just before entering
  the water, is a stroke; there is no coyote time in the water and the ears don't float you there.
  A stroke with its head within half a tile of the surface is a leap out: the land jump, so its feet
  reach about 3.3 tiles up, enough for a ledge 2 tiles above the water. Out of the water it runs
  and jumps as everywhere. Currents are bands of water at least 3 tiles wide that carry the
  monster at 3 tiles/s their way (left, right, up or down), drawn as streaming bubbles; at least
  three places use them, with you or against you. Its bad guys are fish swimming back and forth at
  2 tiles/s along 3–6 tiles (hurt at a touch, from any side: you can't stomp in water), and urchins
  (spikes) on the water's floor. The water's floor is solid. Rejected: an air meter (a second
  thing to watch on a phone, and the owner asked for a different control, not a timer).
- **Ink's darkness: the unknown.** Ink is dark outside a circle of light around the monster:
  lit within 4.5 tiles, a dithered ring in Ink's two colours (no third colour) out to 5.5, dark
  beyond. Lamps along the way light a pool 2.5 tiles round them, more often in the opening. What
  would be unseen gives itself away in the dark, so every hazard is still seen a second before you
  must commit: ghosts' eyes, a drip's glint, spikes' tips, a pit's edges and the ends of ledges
  glimmer at any distance. The glimpse of the next world and the door are lit: the way out of the
  dark. Ink's glimpse at the end of Sea and its map cell are drawn lit (a peek, not the level).
  Ink's sky is now flat and its far pillars dotted, so not even the light shows a third colour.
  Rejected: a light that shrinks over time (a timer
  again).
- **Batch 4: twelve levels, in this order** (proposed, for the go): 1 Meadow (pixel, 18), 2 Ice
  (smooth), 3 Farm (pixel), 4 Candy (smooth), 5 Industrial (pixel), 6 Mushroom (smooth), 7 Pico
  (pixel, 8), 8 Sea (smooth), 9 Ink (two colours, 16), 10 Castle (smooth), 11 Scribble (line art),
  12 Sky (smooth). Both new packs are vector, so no order of them after Castle alternates pixel and
  smooth; Scribble is drawn as a third style, **line art** (the lineup's word for it), so every
  door still changes the style: smooth into line art into smooth. Sky is the finale, as the lineup
  says. Rejected: Scribble baked to a pixel grid to keep the strict alternation (its pen lines turn
  to mush at any pixel size a tile can hold) and Scribble before Castle (Castle and Sky, both
  smooth, would then meet at a door). Best times move to version 5.
- **Line art, Scribble's rule: "the world redraws you" as a pen drawing.** Scribble is a page of
  paper (warm white, with faint ruled lines) and everything on it is the pack's black pen lines on
  white, drawn smooth at 70 px per tile. The monster is redrawn by that rule: its shape filled with
  the paper's white and traced with a black pen line about a fourteenth of a tile thick, its eyes
  and mouth in the same line, no colour; the line boils, redrawn with a slightly different wobble
  eight times a second (three wobbles in turn), as a hand-drawn cartoon does. Scribble's bad guys
  (the New Platformer Pack's slimes, as in Candy and Mushroom, since the Scribble pack has no
  characters) are redrawn the same way, so nothing on the page is in colour but the coins' and
  hearts' fill (the pack's own). Crossing into line art, the monster's colour drains out and its
  line draws itself on over half a second, with a pen-scratch sound; out of it into Sky, colour
  floods back in, with the rising sound.
- **Scribble: trust, platforms that draw themselves.** Scribble's ledges and bridges over pits are
  sketch tiles. A sketch tile isn't there (not drawn, not solid) until the monster's middle comes
  within 3 tiles of it across and 5 up or down; then a pen draws it in 0.3 s and it is solid from
  the moment it is whole, and it stays for the rest of that life (a life lost undraws it, with the
  level). A monster at top speed covers 3 tiles in about 0.46 s, so a sketch tile on its way is
  always whole before its feet arrive; a pit with sketch tiles across it looks like a pit until
  you're nearly there, and a ledge out over a wide pit is drawn only once you're in the air toward
  it: that is the trust. Before a sketch run is drawn, two faint pencil ticks mark its ends (and,
  in the opening, a dotted pencil guide its whole length), so where the ground will be is always
  in view a second before you commit, as the spec's one-second rule asks; the pit is the hazard,
  and it's in view as ever. Past the opening: pits too wide for a running held jump (over 9.4
  tiles) bridged only by sketch ledges, sketch stairs up to high coins, sketch bridges with spikes
  or a pit under them, and line-art slimes on solid ground between. Bad guys never walk on sketch
  tiles. Rejected: platforms that rub themselves out after you've used them (Candy's cookies
  already crumble) and decoy marks that never draw (a trick that punishes trust, the very thing
  the world teaches).
- **Sky: the finale, an automatic bouncing climb.** Sky is a column 12 tiles wide between two cloud
  walls and at least 90 tiles tall, of the Jumper Pack's floating ledges, which you jump up through
  from below and land on from above. In Sky the monster bounces whenever it lands on a ledge,
  without a press: its feet rise about 3.3 tiles above the ledge (the held jump's height, the same
  physics); a jump pressed within 0.12 s before landing (the jump buffer) bounces it to about 5
  tiles, so the expert climbs faster; holding jump without a fresh press doesn't. You steer left and
  right at the usual top speed; the run pad and keys are as everywhere, and nothing else is new.
  The camera follows the monster up and never goes back down, and falling below the view's bottom
  costs a life (with or without a heart, as any fall). The sprint: the level is short in time
  (about 40–60 s for a first-timer) and its best time is the run's last to beat. Its things, from
  the pack: grass ledges (2–4 tiles), ledges that slide side to side (2 tiles/s along 3–6 tiles),
  cracked ledges that bounce you once and then break and fall, springs that launch you about 10
  tiles, and wings that carry you straight up 15 tiles over 2 s while you steer; coins and hearts.
  Its bad guys: the pack's flyers, hovering side to side along 3–6 tiles, stomped from above (a
  stomp bounces you as a ledge does) and hurting from the side or below, and the pack's spiky ones
  on ledges, which can't be stomped. The opening (its first 15 tiles up) is wide grass ledges 2–3
  tiles apart, coins and nothing that hurts; then sliding and cracked ledges; then flyers and
  spikies; the top is a cloud plateau with the glimpse and the door. Rejected: wrapping round from
  one side of the screen to the other (a known game's signature), a storm rising from below (a
  timer, rejected for Ink), and the sky climb as a free jump (no new mechanic: the owner asked for
  an automatic bounce).
- **The journey's end.** Sky's door leads to the world map, where for the first time every cell is
  lit and the path paints on past Sky to a summit, a gold star at the path's end; the monster walks
  up to it. Then the gallery: your monster twelve times in a row (two rows of six in portrait), each
  drawn by its world's own rule over a little scene of its world (the Meadow's 18-px pixels, Ice
  smooth, Pico's 16 colours, Ink's two, Scribble's pen line, Sky smooth…), hopping in turn from the
  first world to the last while the end jingle plays: the hook ("each world redraws your monster")
  shown all at once. Then the card, titled "The journey's end", with the run's coins, time, lives
  left, the prize and the best run, and Play again and New monster. Nothing says more worlds are
  coming. Rejected: a cutscene with text (the game has none) and an endless mode after Sky (scope;
  the owner asked for an end).
- **The map holds twelve cells and the summit.** Portrait keeps three across, now in four rows;
  landscape goes to six across in two rows (five across would need a third row, the reason it went
  to five for ten). The summit is a small pad past the last cell, as the start is before the first.
- **Sound and music for batch 4:** Scribble and Sky use Candy's soft sound set and loop until the
  owner's music; the owner's beds and accents for Industrial, Mushroom, Pico, Sea, Ink and Castle
  are wired as batch 2 did (`bed: true`, `sounds/<id>-bed.mp3`, `<id>-a1..3.mp3`) as they arrive.
  ElevenLabs prompts for Scribble's and Sky's bed (2:00) and accents (0:30, three phrases) go to
  the owner in the chat. The hidden assist never changes sketch tiles' drawing, Sky's bounce, its
  sliding or cracked ledges, springs, wings or flyers.

## Acceptance items

- **AC-1** The page opens on the builder over the moving Meadow with a random monster, shown baked
  in pixels and whole (its head inside the preview); Go shows the map, then level 1, the Meadow,
  with the monster on the ground; there are no errors — `tests/pixel-leap.test.mjs`.
- **AC-2** Each builder button changes its part of the monster, Shuffle changes it, and the monster
  code round-trips: a page opened with that `#m=` code shows the same monster; a page opened with a
  garbage code, or with localStorage that throws, shows a random monster with no error —
  `tests/pixel-leap.test.mjs`.
- **AC-3** The monster runs at the same top speed and a held jump reaches the same height, in tiles,
  in the Meadow and in Candy; a held jump goes at least 1.6 times as high as a tap — `tests/pixel-leap.test.mjs`.
- **AC-4** In the Meadow the screen is drawn at 18 px per tile scaled by a whole number without
  smoothing (the screen is made of uniform blocks of that size), and in Candy at 70 px per tile
  drawn smooth; the screen size of a tile is the same in both — `tests/pixel-leap.test.mjs`.
- **AC-5** The Meadow monster is baked with binary alpha and a dark outline around it, uses at most
  8 colours plus the outline across all its frames, no two of them near each other, and has pose
  frames for standing, running and jumping; the Ink monster uses only Ink's two colours —
  `tests/pixel-leap.test.mjs`.
- **AC-6** Coyote time and the jump buffer work: a jump pressed just after running off a ledge, or
  just before landing, jumps — `tests/pixel-leap.test.mjs`.
- **AC-7** With no heart held, spikes, a walker's side and falling off each cost a life and restart
  the level from its beginning, with its coins and things back; a hit with a heart held costs the
  heart and no life, but falling off still costs a life; losing the third life shows the game-over
  card, whose Play again starts level 1 with 3 lives — `tests/pixel-leap.test.mjs`.
- **AC-8** Landing on a walker from above defeats it and bounces the monster up, higher with jump
  held; landing on a spiky walker hurts instead — `tests/pixel-leap.test.mjs`.
- **AC-9** A heart picked up adds a heart (at most two) and a coin; with two held, a heart shows as a
  coin and adds only a coin; the HUD shows the lives and hearts held — `tests/pixel-leap.test.mjs`.
- **AC-10** Taking Ice's ears adds them to the monster and lets it float: falling with jump
  held is at most 40% as fast as without — `tests/pixel-leap.test.mjs`.
- **AC-11** In Candy a jelly gumdrop bounces the monster higher than a full jump, a cookie crumbles
  about 0.5 s after it's landed on and comes back after 3 s, a spring in the Meadow launches, Ice's
  ice keeps the monster sliding further than the Meadow's grass, and an Ink drip falls as the
  monster comes near and hurts — `tests/pixel-leap.test.mjs`.
- **AC-12** Reaching a level's door shows the world map, with no numbers card, heading from that
  level's cell to the next; the map then leaps into the next level's world, which from the Meadow to
  Ice goes through 18-px-per-tile blocks, then 35, then smooth, and the next level is playing with
  the monster's ears kept and its time at 0 — `tests/pixel-leap.test.mjs`.
- **AC-13** At 360×640 and 390×844 in portrait, at pixel ratios 1, 2 and 3, the view shows at least
  12 tiles across and the tile is a whole multiple of 18 canvas pixels, the deck doesn't overlap the
  view, and while running the camera shows at least 7 tiles ahead; turning to landscape mid-run
  keeps the monster's place in the world, releases held controls and pauses —
  `tests/pixel-leap.test.mjs`.
- **AC-14** On a touch screen, holding the run pad right of centre runs right, sliding left of centre
  without lifting runs left, a run touch that slides into the jump half still only runs, the right
  half jumps, and a second finger can jump while the first runs; every control is at least 44 px;
  the keyboard's keys do the same, and Escape in play pauses rather than leaving —
  `tests/pixel-leap.test.mjs`.
- **AC-15** Hiding the page pauses play and shows the Paused card; a tap resumes without jumping, and
  the monster can't be hurt for the first 0.5 s; time while paused doesn't count —
  `tests/pixel-leap.test.mjs`.
- **AC-16** After two lives lost the coyote time and buffer grow (to at most double), enemies keep
  their speed, the assist survives a game over, and clearing a level resets it —
  `tests/pixel-leap.test.mjs`.
- **AC-17** Each level is its own world, in this order: Meadow, Ice, Farm, Candy, Industrial,
  Mushroom, Pico, Sea, Ink, Castle, Scribble, Sky; best times are kept under version 5 of the
  levels; each level's last stretch, from its `next` column, is drawn in the next world's style; the
  UI is pixel-styled in pixel worlds, line art in Scribble and smooth in Ice, Candy, Mushroom,
  Castle, Sea and Sky; the best time per level is kept — `tests/pixel-leap.test.mjs`.
- **AC-18** Jumping in the Meadow plays the Meadow's jump sound and in Candy Candy's, and each world
  starts its own music — `tests/pixel-leap.test.mjs`.
- **AC-19** Pixel Leap plays offline once it has been played, every world included, though only
  the Meadow was played — `tests/pixel-leap.test.mjs`.
- **AC-20** The landing page's Pixel Leap tile is playable and links to `pixel-leap/` —
  `tests/site.test.mjs`.
- **AC-21** Every level can be finished: a scripted run through each level (it only runs, jumps and
  steers left or right) reaches its door, taking the first coin within 5 s of Go; in the level data
  no hazard (pit, spikes, bad guy, drip, belt) is within 7 tiles of a level's start, a flyer counted
  from 5 tiles before it; above every spring, jelly and haybale no solid tile is within 6 tiles, and
  above every mushroom cap none within 9, in its columns and its neighbours'; every moving
  platform's and lift's whole track, and two tiles above it, is clear of solid tiles, above the
  ground line and short of the glimpse; and no setting of the hidden assist changes a mover's,
  belt's, cap's, haybale's or flyer's speed —
  `tests/pixel-leap.test.mjs`.
- **AC-22** At 390×844, a 20 s run's update and draw take under 8 ms per frame on average in the test
  browser, and the simulation moves the same at 60 and 120 frames per second —
  `tests/pixel-leap.test.mjs`.
- **AC-23** The glimpse before Farm's door is drawn smooth, the one before Candy's door in
  Industrial's 18-px pixels and the one before Sea's door in Ink's; stepping into a glimpse that
  changes the style plays the rising (into smooth) or falling (out of smooth) sound and draws the
  monster at in-between resolutions, then in the new style; in this order every door changes the
  style (owner, 2026-11-10, at the go: "Perfect alternation"), Castle's into line art and
  Scribble's into smooth included — `tests/pixel-leap.test.mjs`.
- **AC-24** The map at the start lights only the first world's cell and carves the others dark, and
  heads from the start to level 1; through the Meadow's door it heads from the Meadow to Ice with
  both lit; a tap skips ahead to the step into the world; at 360×640 and 390×844 in portrait and
  1024×700 in landscape, all twelve cells, the start and the summit are on screen, no two cells overlap and each
  name is at least 12 CSS px tall — `tests/pixel-leap.test.mjs`.

- **AC-25** Farm has at least 14 separate platforms (a platform: a run of ledge or block tiles side
  by side in one row, not ground), from 1 to at least 6 tiles long, at at least 5 different heights
  between 1 and 8 tiles above the ground under them; landing on a haybale bounces the monster's
  feet 2–3 tiles above its top, and 4.5–5.5 with jump held — `tests/pixel-leap.test.mjs`.
- **AC-26** Farm has at least 3 hidden pockets of at least 3 coins each, off the scripted run's
  route; a pocket's coins aren't drawn while the monster is more than 3 tiles away and are once it
  comes within 3; a glint shows at each hidden pocket at least once every 2 s — `tests/pixel-leap.test.mjs`.
- **AC-27** In Industrial, a monster standing still on a moving platform or a lift for 1 s ends within
  0.1 tile of where the platform carried that spot, and can jump up through one and land on it;
  standing still on a belt for 1 s carries the monster 2.5 tiles (±0.3) its way; the level has at
  least two gaps of 10 tiles or more with a moving platform in each, at least one lift, and a
  scripted run with the ears that never rides falls into each of those gaps —
  `tests/pixel-leap.test.mjs`.
- **AC-28** In Mushroom, the door is at least 30 tiles above the start; landing on a cap launches the
  monster's feet 4 tiles above the cap's top, the next cap landing without touching anything else
  6, the one after 8 and the one after that 8 again, and after touching the ground the next cap 4
  again (each within half a tile); after an 8-tile launch the landing spot is in view; falling below
  the level's bottom costs a life — `tests/pixel-leap.test.mjs`.
- **AC-29** Pico is drawn at 8 px per tile and every pixel of its world layer on screen (the HUD,
  particles and the glimpse aside) is one of PICO-8's 16 colours; its monster's frames use only
  those colours — `tests/pixel-leap.test.mjs`.
- **AC-30** Pico has more bad guys than any other level, at least one per 8 tiles after its first 15;
  a flyer swoops down toward the monster when it comes within 5 tiles ahead on the ground and climbs
  back, hurts
  from the side and can be stomped; in Pico a second stomp before landing pays one extra coin, a
  third two more and a sixth only four more; landing or a hit ends the chain; in the Meadow a chain
  pays nothing extra — `tests/pixel-leap.test.mjs`.
- **AC-31** Each new world plays its music (the owner's bed where it has arrived, which among the
  four new worlds is so far only Farm's, else its sound set's loop) and draws from its own pack: Farm's and
  Industrial's ground are their expansion's tiles, Mushroom's ground its caps and stems, Pico's its
  pack's — `tests/pixel-leap.test.mjs`.
- **AC-32** A world with the owner's music plays its bed and, over it, one of its three accents
  after every 15–40 s of play, all three in turn but never the same twice running; paused, the bed
  stops and no accent comes; muting mutes the bed — `tests/pixel-leap.test.mjs`.
- **AC-33** In Castle, a gate stops the monster until it touches the gate holding a key; then the
  gate opens and stays open, the key is used and the HUD's key count drops by one; a key picked up
  shows in the HUD; a life lost brings back the level's keys and shuts its gates. Keys held at the
  door don't carry into the next level. The level has at least three gates, each with a key before
  it and after the gate before it, and the door is past the last gate; a scripted run that only runs
  right, jumping gaps, walls and hazards, touches no key and stops at the first gate —
  `tests/pixel-leap.test.mjs`.
- **AC-34** A Castle crusher waits up 1.4 s (shaking for the last 0.4), drops to the floor in 0.2 s,
  stays 0.6 s and rises in 1.0 s, again every 3.2 s (each within 0.05 s); touching it while it falls,
  is down, or is rising with its bottom under 1.4 tiles above the floor costs a heart or a life, and
  standing under it while it waits up costs nothing; a crusher's bottom is at most 4 tiles above
  the floor; crushers next to each other start at different points of the rhythm; the level has at
  least five — `tests/pixel-leap.test.mjs`.
- **AC-35** In Ice, letting go at top speed on ice slides the monster at least 2 tiles before it
  stops, and on snow less than 1; the monster runs up a slope to its top and down it at its flat
  speed (±10%) without jumping, its feet within 0.1 tile of the slope, and can jump from it; a snow
  pile sends a snowball every 2.5 s (±0.1) that rolls down its slope no faster than 4 tiles/s, along
  the flat at no more than 3, and is gone at a wall or a pit's edge; a snowball hurts and can't be
  stomped; the level has at least 10 ledges 1–3 tiles long over pits, at least 5 of them ice and at
  least 2 tiles long, and at least 3 snow piles — `tests/pixel-leap.test.mjs`.
- **AC-36** In Sea, in the water and pressing nothing, the monster sinks no faster than 1.5 tiles/s;
  one tap lifts it 1.5–2.5 tiles, holding jump lifts it no further than a tap, and taps closer than
  0.25 s apart count once; a tap on the water's floor strokes; it swims sideways at no more than 4
  tiles/s; a stroke with its head within half a tile of the surface by a ledge 2 tiles above the
  water lands it on the ledge; in a current, pressing nothing, it is carried 3 tiles/s
  (±0.3) the current's way; a fish hurts at a touch, also from above; the level has at least three
  currents and starts on dry land — `tests/pixel-leap.test.mjs`.
- **AC-37** In Ink, on the world layer (the HUD, particles and the glimpse aside), screen pixels
  more than 5.5 tiles from the monster and from every lamp are Ink's dark colour except for
  glimmers (each within half a tile of a ghost, a drip, a spike, a pit's edge, a ledge's end or the
  door), the level shows within 4.5 tiles of the monster, and every pixel is one of Ink's two
  colours; each ghost, drip, spike run, pit edge and ledge end draws a glimmer in the dark; the
  glimpse of Castle and the door are drawn lit — `tests/pixel-leap.test.mjs`.
- **AC-38** AC-21's scripted player also fetches a key when a gate stops it (steering to the nearest
  key not yet taken, then back), waits out a crusher's drop, jumps snowballs, runs slopes, and in
  the water strokes to keep its depth and leaps out at a ledge; with these it finishes Ice, Sea,
  Ink and Castle. In AC-21's layout checks, also: no crusher, snow pile, current, fish or urchin within 7
  tiles of a level's start (a snow pile counted at the foot of its slope); each crusher's drop, from
  its top to the floor, is clear of solid tiles; no snowball's path from its pile to where it
  shatters crosses the start; each Castle key is reachable before its gate and the door is behind
  the last gate; and no setting of the hidden assist changes a crusher's, snowball's, current's,
  fish's or the swim's speed — `tests/pixel-leap.test.mjs`.
- **AC-39** Each batch-3 world draws from its own pack and plays its music: Castle's ground and
  gates are the Medieval pack's tiles, Ice's its snow and ice, Sea's its sand, water and wood; Ice
  plays the owner's Frost bed, Castle and Sea Candy's soft loop until their own arrive; the world
  map shows all ten — `tests/pixel-leap.test.mjs`.
- **AC-40** Scribble is drawn smooth at 70 px per tile in line art: every pixel of the monster's
  frames there is the paper's white, the pen's black or a grey between them, its outline differs
  between two moments 1/8 s apart, and Scribble's slimes are drawn the same way; crossing from
  Castle into Scribble plays the pen-scratch sound and draws the monster part-traced before it is
  whole — `tests/pixel-leap.test.mjs`.
- **AC-41** A Scribble sketch tile is not drawn and not solid while the monster's middle is more
  than 3 tiles across or 5 up or down from it; once within, it is whole and solid 0.3 s (±0.05)
  later and stays drawn, and a life lost undraws it; a monster running at top speed along a row of
  sketch tiles over a pit never falls into the pit; before a run is drawn its two ends show pencil
  ticks — `tests/pixel-leap.test.mjs`.
- **AC-42** Scribble has at least 30 sketch tiles in at least 8 runs, at least 3 of them over pits
  more than 9.4 tiles wide, and no sketch tile, pit or bad guy within 7 tiles of its start; no bad
  guy stands on a sketch tile; the scripted player finishes Scribble, and at least 5 of its jumps
  leave the ground while the tile it lands on isn't drawn yet — `tests/pixel-leap.test.mjs`.
- **AC-43** In Sky, landing on a ledge with nothing pressed bounces the monster's feet 3.3 tiles
  (±0.3) above it, and a jump pressed within 0.12 s before landing 5 (±0.3); holding jump through a
  landing without a fresh press bounces it 3.3; it passes up through a ledge from below and lands on
  it from above; its top speed sideways is the usual 6.5 tiles/s — `tests/pixel-leap.test.mjs`.
- **AC-44** In Sky, a cracked ledge bounces the monster once and is gone; a spring launches its
  feet at least 9.5 tiles up; wings carry it 15 tiles (±1) up over 2 s (±0.1); a flyer landed on
  from above is stomped and bounces the monster, and touched from the side hurts; a spiky one hurts
  from above; the camera never moves down; dropping below the view's bottom costs a life, a heart
  held or not; the door is at least 90 tiles above the start; the level has at least 3 sliding
  ledges, 3 cracked ones, 2 springs, 1 pair of wings, 4 flyers and 2 spikies —
  `tests/pixel-leap.test.mjs`.
- **AC-45** In Sky's layout, every ledge above the start's has a ledge (or the start) at most 3
  tiles below it and at most 8 across, so a plain bounce reaches every step of the climb; no bad
  guy, cracked ledge or spring is within 7 tiles of the start; each sliding ledge's and flyer's
  track is clear of other ledges and inside the walls; no setting of the hidden assist changes a
  sketch tile's drawing, Sky's bounce or any of Sky's things' speeds; the scripted player, steering
  and pressing jump only, finishes Sky — `tests/pixel-leap.test.mjs`.
- **AC-46** Past Sky's door the map lights all twelve cells and heads from Sky's cell to the
  summit; then the gallery shows the run's monster twelve times, each drawn by its world's rule (the
  Meadow's in 18-px blocks, Ink's in Ink's two colours, Pico's in PICO-8's, Scribble's in line art,
  Sky's smooth), and the card titled "The journey's end" shows the run's coins, time, lives left
  and best run with Play again and New monster; no text on the page says more worlds are coming;
  Play again starts level 1 with 3 lives — `tests/pixel-leap.test.mjs`.
- **AC-47** Scribble's ground, sketch tiles and ticks are the Scribble pack's tiles and Sky's
  ledges, springs, wings, flyers and spikies the Jumper Pack's; both play Candy's soft loop until
  the owner's own music arrives; each world whose bed is in `pixel-leap/sounds/` is marked `bed:
  true` and plays it — `tests/pixel-leap.test.mjs`.

## Core flow

1. Tap the Pixel Leap tile: the builder, over the moving Meadow, with a pixel monster.
2. Change parts or Shuffle, then Go.
3. Watch the map paint the way to the Meadow; run and jump to its door, which already shows Ice.
4. Back on the map, walk on through Ice (redrawn smooth), Farm, Candy, Industrial, Mushroom
   (smooth), Pico (16 colours), Sea (swimming), Ink (two colours, in the dark), Castle, Scribble
   (line art, ground that draws itself) and Sky (bouncing up), with three lives and up to two
   hearts.
5. Past Sky's door: the map's summit, the gallery of your monster in all twelve styles, and the
   journey's end card with the run's statistics.

## States

| State | Builder | View and deck | Paused card | Tally card |
| ----- | ------- | ------------- | ----------- | ---------- |
| Building (the Meadow moves behind) | shown | view shown, deck hidden | hidden | hidden |
| The map (after Go, and after each door but the last) | hidden | view shows the map, deck shown | hidden | hidden |
| Playing | hidden | shown | hidden | hidden |
| Paused (page hidden or blurred, a resize, P or Escape) | hidden | shown, still | shown | hidden |
| Leaping to the next world | hidden | view shown, changing resolution | hidden | hidden |
| Game over (the third life lost) | hidden | shown, still | hidden | shown: the run's statistics, Play again and New monster |
| The journey's end (after Sky) | hidden | view shows the map's summit, then the gallery | hidden | shown after the gallery: "The journey's end", the run's statistics, Play again and New monster |

## Out of scope

- **The rest of the worlds, in batches of four, each batch its own spec and PR** (owner, 2026-11-09,
  on seeing all of Kenney's platformer packs: "we need to do more … we should also introduce
  different mechanics because they feel like I'm just playing a different skin … one is platform
  heavy … big, small, different heights, and another one has a bunch of bad guys. Another one has
  like a bunch of tricky situations … different challenges and distribution of them"; and: "we
  merge this PR … continue in another session building 4 … when we're done with those 4, we will
  create again, ship it, and then create a task suggestion to do with the next 4, and so on"). Every
  world brings its own mechanic and its own kind of challenge, keeps an easy first stretch, and
  alternates pixel and smooth where it can. The lineup, as proposed to the owner (the order of the
  batches can change):

  | # | World (Kenney pack) | Style | Its own mechanic | Its kind of challenge |
  | --- | --- | --- | --- | --- |
  | 1 | Meadow (Pixel Platformer) | pixel | stomping walkers, springs | a gentle mix, to learn (built) |
  | 2 | Farm (Pixel Platformer Farm Expansion) | pixel | haybales that bounce; hidden pockets of coins | platforms: many, big and small, at very different heights (built) |
  | 3 | Candy (Platformer Assets Candy) | smooth | jelly bounces, crumbling cookies, slimes | tricky timing (built) |
  | 4 | Industrial (Pixel Platformer Industrial Expansion) | pixel | moving platforms and lifts, conveyor belts | timing and riding (built) |
  | 5 | Mushroom (Platformer Assets Mushroom) | smooth | mushroom caps that launch you higher each bounce | vertical: a tall climb (built) |
  | 6 | Pico (Pico-8 Platformer) | pixel, 16 colours | flying bad guys that swoop; stomp chains pay extra | bad guys: crowded (built) |
  | 7 | Castle (Platformer Pack Medieval) | smooth | a key opens the gate; crushers drop on a rhythm | puzzle-like situations |
  | 8 | Ice (Platformer Assets Ice; may replace today's pixel Frost) | smooth | slippery ice, snowballs rolling down slopes | precision on small ledges |
  | 9 | Sea (Platformer Pack Nautical) | smooth | swimming: you float, each tap a stroke; currents | a different control |
  | 10 | Ink (1-Bit Platformer Pack) | 1-bit | darkness: only a circle of light around the monster; ghosts, drips | the unknown (built, darkness to add) |
  | 11 | Scribble (Scribble Platformer) | line art | platforms that draw themselves as you near | trust: jump before the ground is there (batch 4) |
  | 12 | Sky (Jumper Pack) | smooth | the finale: an automatic bouncing climb upward | a sprint to the top (batch 4) |

  Today's Frost (Pixel Platformer snow: ice and spiky walkers) stayed as a world through batch 2; batch
  3 replaced it with Ice (owner, 2026-11-10). **Batch 2:** Farm, Industrial, Mushroom and Pico, the four most different challenges. **Batch 3:** Castle,
  Ice, Sea, and Ink's darkness. **Batch 4:** Scribble and Sky, then the journey's end. After each
  batch ships, the next batch's session is suggested; batch 4 is the last, so none follows it.
- Music: the owner will generate music for each world (and the two crossing sounds) from prompts
  given in the chat; until then the worlds use Kenney loops.
- Leaderboards, accounts, saved runs beyond the monster code and best times.
- Builder details (horns, antennae, ears as decoration) beyond the prize; the ears are the prize.

# Pixel Leap: build a monster, leap through worlds drawn in different art styles

**Go:** "don't consult with me, just start building after following this process" 2026-11-09

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
Frost, smooth and glossy in Candy, two-colour ink in Ink.

This change is the first slice (see Out of scope): the builder, the style rule and four levels,
each its own world: the Meadow and Frost (two parts of the Pixel Platformer pack), Candy (Platformer
Assets Candy, smooth) and Ink (the 1-Bit Platformer pack). The surface is a new game page,
`pixel-leap/`, and its landing-page tile becomes playable. The game has its own look per world, like
any game page; the landing page keeps the site's tokens. There is no `DESIGN.md`, so the baseline is
the design.

### Concept check (the guidelines' questions)

- **Verb:** run and jump, with a variable-height jump, coyote time and jump buffering, a floppy
  monster with squash and stretch, and stomps that bounce you (higher if you hold jump).
- **A typical 5-second choice:** in the Meadow, stomp the walker to bounce up to the coin ledge, or
  wait for it to pass and take the low road; in Candy, ride the crumbling cookie bridge for the coin
  line before it drops, or take the slower floor past the gummy worms; spend a heart on a risky coin
  line, or keep it for the spikes ahead.
- **How it teaches:** each level opens gently and brings its new thing where it can't hurt yet,
  then ramps up to the level's full threat. The Meadow opens with run, jump and coins and no
  hazards, then one walker on flat ground, one spike, a small pit, then walkers in pairs and wider
  pits. Frost brings ice and spiky walkers you can't stomp, and the ears. Candy brings jelly,
  crumbling cookies and worms. Ink brings ghosts and drips that fall as you pass. No text: the deck
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
  you land and come back after 3 s, gummy worms); 4 Ink (the 1-Bit pack, two colours: ghosts, and
  drips that fall as you come near, landing just ahead of a monster at full speed). Each level is
  about a minute for a first-timer.
- **A glimpse of the next world:** each level's last stretch, its door included, is drawn in the next
  world's style (its ground, sky and door) by the next world's own art at the current resolution, so
  you see where the door leads before you go through.
- **The leap between levels is the event:** the door ends each level. Entering it takes the monster
  out of physics and freezes the world, and the tally card shows. Its Leap button starts the leap,
  1.6 s in all: a soft white flash (0.3 s), then the next world drawn through the resolutions
  between the two: into a smooth world at 18, then 35 px per tile, then smooth; out of a smooth world
  at 35, then 18, then the new world's own; between pixel worlds straight at the new world's own.
  Rejected: a fade to black, which hides the rule. Time on the tally card, paused or hidden never
  counts toward a level's time.
- **Lives and hearts:** three lives. A hit (spikes, a walker's or worm's or ghost's side, a drip)
  takes a heart if you hold one: you're knocked back and safe for a moment. Without one, it costs a
  life, and the level starts again from its beginning (its coins and things back as they were).
  Falling off always costs a life. With no lives left it's game over: the card shows how far you got,
  and Play again starts a new run from level 1 with the same monster (or New monster goes to the
  builder). A heart is a pickup that counts as a coin; you can hold at most two, and while you hold
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
- **Rewards:** coins (all coins and hearts of a level counted on the tally), time, the prize; best
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
  prize; the builder's clicks; the leap and the tally's jingle. All under the site-wide mute, unlocked
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

## Acceptance items

- **AC-1** The page opens on the builder over the moving Meadow with a random monster, shown baked
  in pixels and whole (its head inside the preview); Go starts level 1, the Meadow, with the monster
  on the ground; there are no errors — `tests/pixel-leap.test.mjs`.
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
- **AC-10** Taking Frost's ears adds them to the monster and lets it float: falling with jump
  held is at most 40% as fast as without — `tests/pixel-leap.test.mjs`.
- **AC-11** In Candy a jelly gumdrop bounces the monster higher than a full jump, a cookie crumbles
  about 0.5 s after it's landed on and comes back after 3 s, a spring in the Meadow launches, Frost's
  ice keeps the monster sliding further than the Meadow's grass, and an Ink drip falls as the
  monster comes near and hurts — `tests/pixel-leap.test.mjs`.
- **AC-12** Reaching a level's door freezes the world and shows the tally (coins, time, prize,
  best); its Leap button starts the leap into the next level's world, which from Frost to Candy goes
  through 18-px-per-tile blocks, then 35, then smooth; within 2 s the next level is playing with the
  monster's ears kept. Time on the tally doesn't count toward the level's time —
  `tests/pixel-leap.test.mjs`.
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
- **AC-17** Each level is its own world, in this order: Meadow, Frost, Candy, Ink; each level's last
  stretch, from its `next` column, is drawn in the next world's style; the UI is pixel-styled in
  pixel worlds and smooth in Candy; the best time per level is kept — `tests/pixel-leap.test.mjs`.
- **AC-18** Jumping in the Meadow plays the Meadow's jump sound and in Candy Candy's, and each world
  starts its own music — `tests/pixel-leap.test.mjs`.
- **AC-19** Pixel Leap plays offline once it has been played, Candy and Ink included, though only
  the Meadow was played — `tests/pixel-leap.test.mjs`.
- **AC-20** The landing page's Pixel Leap tile is playable and links to `pixel-leap/` —
  `tests/site.test.mjs`.
- **AC-21** Every level can be finished: a scripted run through each level reaches its door, taking
  the first coin within 5 s of Go; in the level data no hazard is within 7 tiles of a level's start,
  and every spring and jelly has no solid tile within six tiles above it or its neighbours —
  `tests/pixel-leap.test.mjs`.
- **AC-22** At 390×844, a 20 s run's update and draw take under 8 ms per frame on average in the test
  browser, and the simulation moves the same at 60 and 120 frames per second —
  `tests/pixel-leap.test.mjs`.

## Core flow

1. Tap the Pixel Leap tile: the builder, over the moving Meadow, with a pixel monster.
2. Change parts or Shuffle, then Go.
3. Run and jump through the Meadow to its door, which already shows Frost; see the tally and leap.
4. Play Frost, Candy (redrawn smooth) and Ink (two colours), with three lives and up to two hearts.

## States

| State | Builder | View and deck | Paused card | Tally card |
| ----- | ------- | ------------- | ----------- | ---------- |
| Building (the Meadow moves behind) | shown | view shown, deck hidden | hidden | hidden |
| Playing | hidden | shown | hidden | hidden |
| Paused (page hidden or blurred, a resize, P or Escape) | hidden | shown, still | shown | hidden |
| Tally at a level's end | hidden | shown, still | hidden | shown |
| Leaping to the next world | hidden | view shown, changing resolution | hidden | hidden |
| Game over (the third life lost) | hidden | shown, still | hidden | shown, with Play again and New monster |
| End of the slice (after Ink) | hidden | shown, still | hidden | shown, with Play again and New monster |

## Out of scope

- The later slices, in order (the split of the whole game; each gets its own spec): **slice 2**,
  music generated by the owner from prompts for each world, Candy's own prize, and coins unlocking
  builder colours and parts; **slice 3**, a Scribble world (line art on paper, the monster outlined
  in a sketch); **slice 4**, a Pico-8 or Medieval world and the journey's end. Each new world brings
  one rule from its material.
- Leaderboards, accounts, saved runs beyond the monster code and best times.
- Builder details (horns, antennae, ears as decoration) beyond the prize; the ears are the prize.

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
styles, and each world redraws your monster in its own style: chunky pixels in the pixel meadow,
smooth and glossy in the candy world.

This change is the first slice (see Out of scope): the builder, the style rule, the Meadow world
(Pixel Platformer, 3 stages) and the start of the Candy world (Platformer Assets Candy, 2 stages).
The surface is a new game page, `pixel-leap/`, and its landing-page tile becomes playable. The game
has its own look per world, like any game page; the landing page keeps the site's tokens. There is
no `DESIGN.md`, so the baseline is the design.

### Concept check (the guidelines' questions)

- **Verb:** run and jump, with a variable-height jump, coyote time and jump buffering, a floppy
  monster with squash and stretch, and stomps that bounce you (higher if you hold jump).
- **A typical 5-second choice:** in Meadow, stomp the walker to bounce up to the coin ledge, or
  wait for it to pass and take the low road; in Candy, ride the crumbling cookie bridge for the coin
  line before it drops, or take the slower floor past the gummy worms.
- **How it teaches:** each stage brings one new thing, first where it can't hurt: Meadow 1 run,
  jump and coins with no hazards; Meadow 2 spikes (first in a shallow dip you can hop out of) and a
  walker on flat ground; Meadow 3 springs and the prize; Candy 1 jelly bouncers and gummy worms;
  Candy 2 crumbling cookies. No text: the deck lights the button you press.
- **Three clocks:** seconds: coins, landings, stomps; minutes: a new stage with one new thing about
  every minute, a new world, its look, music, sounds and rule, every 3–4 minutes; return: best time
  and coins per world, the prize, your monster.
- **What an expert does differently:** keeps top speed through stomp-bounces, takes the high coin
  routes, grabs the Meadow prize (big ears that let you float), and uses the float for Candy's
  float-only coin line and Meadow's float shortcut on a replay.
- **Why the tenth play differs:** a different monster each time you build one; the ears change
  which routes you can take; a best time and all-coins to beat.
- **Form:** long-form, a journey of worlds (finally ~6 worlds, 20–30 min); this slice is about
  6–8 minutes. **Orientation:** portrait, laid out like a handheld: the view on top and a control
  deck below, so thumbs never cover the game. Landscape and desktop work too.
- **What a failure costs:** a poof and back to the last checkpoint in under a second, at most ~20 s
  of play; coins stay collected. No lives, no game over.
- **Instead of save games:** your monster as a short code in the URL and in localStorage; the
  worlds you've reached as starts; best time per world.
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
the main path); failure that doesn't pay (fixed: coins stay through a poof); a too-big slice
(fixed: Candy has 2 stages here; its prize, music for the builder and more worlds come later);
touch edge cases (fixed: deck inset from the edges, no long-press or selection, two fingers);
hitbox rules, interruptibility and the assist (fixed below); a flag at the end (fixed: a portal).
A second reviewer then attacked this spec. Fixed from it: the tile rule at pixel ratio 1, the leap
defined frame by frame, the tally, pause and respawn rules (cookies, enemies, checkpoints), bad codes
and blocked storage, turning the phone mid-run, which half owns a touch, every world loaded for
offline play, Escape pausing, the ears kept once found, best times kept by version, and a
performance item.

## Decisions

- **The scale-and-style rule, "the world redraws you":** one tile is one world unit. Every world
  draws its tiles at the same size on screen, and all physics is in tiles, so the monster runs and
  jumps exactly the same everywhere. A world sets only its resolution in pixels per tile and its
  palette: the Meadow is 18 px per tile, drawn into a back buffer and scaled to the screen by a whole
  number with no smoothing; Candy is 70 px per tile, drawn smooth. The monster is drawn by the
  world's rule too: in the Meadow it is baked to 18 px per tile (about 27 px tall) with binary alpha
  and the pack's dark 1-px outline, with its eyes and mouth enlarged so the face reads, and animated
  by a few pose frames instead of rotation; in Candy it is the vector parts, drawn smooth with
  swinging limbs. Rejected: drawing every pack at its native size (a 70 px tile beside an 18 px
  one), and one style for the monster everywhere, which looks pasted on in one of the two worlds.
- **The leap between worlds is the event:** a portal ends each world. Entering it takes the
  monster out of physics and freezes the world, and the tally card shows. Its Leap button starts the
  leap, 1.6 s in all: a soft white flash (0.3 s), then the next world drawn blocky at 18 px per tile
  (0.45 s), then at 35 px per tile (0.45 s), both scaled up without smoothing, then at its own
  resolution, smooth (a 0.4 s settle), the monster changing with it. Rejected: a fade to black, which
  hides the rule. Time on the tally card, paused or hidden never counts toward a world's time; a hide
  during the leap holds it and resumes it.
- **Screen size of a tile:** the canvas is drawn at the device's pixel ratio, at least 2 and at
  most 3 (a ratio-1 screen gets a 2× canvas that the browser scales). The tile is a whole multiple of
  18 canvas pixels, chosen so the view is about 13 tiles across in portrait (at least 12) and about
  10 tall in landscape, so pixel worlds stay crisp. The camera leads in the direction you run, so you
  see at least 7 tiles ahead, and it follows a spring's launch up so the landing is in view.
  Turning the phone or resizing recomputes all this, keeps the monster where it is in the world,
  releases every held control and pauses play.
- **Movement:** top speed 6.5 tiles/s; a held jump reaches about 3.3 tiles, a tap about 1.5;
  coyote time 0.1 s, jump buffer 0.12 s. The monster's hurtbox is about 70% of its drawing. A stomp
  counts when you're falling and your feet are above the walker's middle; spikes have a small grace
  margin. Every hazard is in view at least a second before you must commit to it.
- **Builder:** the game opens on the builder over the live Meadow, with your last monster or a
  random one. Big buttons cycle body shape (6), colour (6), eyes (12), mouth (13), arms (5) and legs
  (5); Shuffle; Go. Each change wiggles the monster and plays a sound. A first-timer can press Go at
  once. Play again, at the end, goes back to the builder.
- **The prize gives an ability:** each world has one Monster Builder part in plain view from the
  main path, behind a route you choose to risk. The Meadow's is a pair of big ears: once you have it,
  holding jump while falling floats you down slowly. It joins your monster, drawn in each world's
  style. Once found it is kept (in localStorage), so a run started at Candy has the ears too. Candy
  has a float-only coin line, and the Meadow a float shortcut. Candy's own prize comes in slice 2.
- **Each world has its own rule from its material:** Meadow: springs, spikes and walkers; Candy:
  jelly gumdrops that bounce you high, cookie platforms that crumble half a second after you land and
  come back after 3 s, and gummy worms that crawl.
- **Failure is cheap:** spikes, a walker's or worm's side, or falling off: a poof, then back at the
  last checkpoint (a heart that fills when you touch it) in under a second, with coins kept. No
  lives, no game over. On a poof every cookie is whole again and living enemies go back to where
  they started; stomped ones stay gone. A checkpoint is never on a cookie and never within 2 tiles
  of a hazard. Meadow 1 has no hazards: its gaps are steps between ground you can't fall through.
- **Rewards:** coins (all coins of a stage are counted on the tally), time, the prize; best time per
  world in localStorage, kept under this slice's version so a longer Candy later starts a new best. Rejected for this slice: coins unlocking builder parts.
- **Hidden assist:** after 3 poofs since the last checkpoint, coyote time, jump buffer and landing
  grace grow (up to double); it resets at the next checkpoint. It never changes enemies or the
  prize routes, so the top stays hard.
- **Touch deck (portrait):** below the view, at most 180 px tall plus the safe area, inset 24 px
  from the side edges. The left half is the run pad: the finger's side of its centre runs that way,
  slide across without lifting to turn, the middle notch stops. The right half is one big jump button
  (hold for higher). A touch belongs to the half it began in until it lifts, whatever it slides
  over; one touch per half counts and any more are ignored. Two fingers work at once. No long-press
  menu, selection or scrolling. In landscape on touch the two halves sit in the bottom corners over
  the view. Keyboard: arrows or A/D to run, Space, Up, W or Z to jump, P or Escape to pause (Escape
  leaves the game only from the builder). Mouse: the deck's buttons are clickable. The coins and
  stage sit at the top, clear of the back button; a mute button sits top-right, as in Reef.
- **Interruptible:** play pauses when the page is hidden or loses focus and shows a small Paused
  card; a tap resumes (that tap doesn't also jump), held keys are released, and the monster is safe
  for half a second.
- **Memory:** your monster's code (a version digit then six letters, never the ears) goes in the URL
  (`#m=…`) and, on Go, in localStorage; opening a link with a code shows that monster. A code that
  doesn't parse gives a random monster, with no error. Once Candy is reached, the builder offers it
  as a start. Storage that is blocked or throws changes nothing but what's remembered. Losing these
  costs a rebuild and a replay of the Meadow. Every world's art and sound loads with the page, so a
  game played once has every world offline.
- **Sound:** each world has its own sound set, as it has its own art: Meadow uses Kenney's Retro
  Sounds and a chiptune loop, Candy soft plucks, glass and a gentle loop: jump, coin, stomp, poof,
  checkpoint, landing, and the Meadow's spring and prize, Candy's bounce and crumble; the builder's
  clicks; the leap and the tally's jingle.
  All under the site-wide mute, unlocked by the first touch.
- **Not a copy:** an original monster you build, Kenney's CC0 packs, levels made for this game; no
  question-mark blocks, pipes or flagpoles.
- **Different in kind** from Reef (drag to steer, spawned levels with lives) and Googly Faces (tap):
  the verb is run and jump, the structure is hand-made stages with checkpoints, and failure is an
  instant respawn with no lives.
- **Targets and knobs:** first coin within 5 s of Go; first gap within 10 s; first hazard about a
  minute in; a new thing about every minute; Candy at about 3–4 minutes for a first-timer. The knobs
  are the movement constants above, the assist and the stage layouts, all data. Performance: a
  frame's update and draw stay well inside a 60 Hz frame on a phone; physics runs on delta time in
  fixed steps, so it is the same at 60 and 120 Hz.

## Acceptance items

- **AC-1** The page opens on the builder over the moving Meadow with a random monster; Go starts
  Meadow stage 1 with the monster on the ground; there are no errors — `tests/pixel-leap.test.mjs`.
- **AC-2** Each builder button changes its part of the monster, Shuffle changes it, and the monster
  code round-trips: a page opened with that `#m=` code shows the same monster; a page opened with a
  garbage code, or with localStorage that throws, shows a random monster with no error —
  `tests/pixel-leap.test.mjs`.
- **AC-3** The monster runs at the same top speed and a held jump reaches the same height, in tiles,
  in the Meadow and in Candy; a held jump goes at least 1.6 times as high as a tap — `tests/pixel-leap.test.mjs`.
- **AC-4** In the Meadow the screen is drawn at 18 px per tile scaled by a whole number without
  smoothing (the screen is made of uniform blocks of that size), and in Candy at 70 px per tile
  drawn smooth; the screen size of a tile is the same in both — `tests/pixel-leap.test.mjs`.
- **AC-5** The Meadow monster is baked with binary alpha and a dark outline around it, and has pose
  frames for standing, running and jumping — `tests/pixel-leap.test.mjs`.
- **AC-6** Coyote time and the jump buffer work: a jump pressed just after running off a ledge, or
  just before landing, jumps — `tests/pixel-leap.test.mjs`.
- **AC-7** Spikes, a walker's side and falling off each poof the monster back to the last checkpoint
  within 1 s, coins already taken stay taken, and play goes on (no lives); after a poof, a crumbled
  cookie is whole and a living walker is back where it started — `tests/pixel-leap.test.mjs`.
- **AC-8** Landing on a walker from above defeats it and bounces the monster up, higher with jump
  held — `tests/pixel-leap.test.mjs`.
- **AC-9** Touching a checkpoint heart moves the respawn point there — `tests/pixel-leap.test.mjs`.
- **AC-10** Taking the Meadow's ears adds them to the monster and lets it float: falling with jump
  held is at most 40% as fast as without — `tests/pixel-leap.test.mjs`.
- **AC-11** In Candy a jelly gumdrop bounces the monster higher than a full jump, a cookie crumbles
  about 0.5 s after it's landed on and comes back after 3 s, and a spring in the Meadow launches —
  `tests/pixel-leap.test.mjs`.
- **AC-12** Reaching the Meadow's portal freezes the world and shows the tally (coins, time, prize,
  best); its Leap button starts the leap, during which the screen is made of 18-px-per-tile blocks,
  then 35-px-per-tile ones, then is smooth; within 2 s Candy stage 1 is playing with the monster's
  ears kept. Time on the tally doesn't count toward the world's time — `tests/pixel-leap.test.mjs`.
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
- **AC-16** After 3 poofs since the last checkpoint the coyote time and buffer grow (to at most
  double), enemies keep their speed, and the next checkpoint resets the assist — `tests/pixel-leap.test.mjs`.
- **AC-17** After Candy has been reached, a fresh visit's builder offers Candy as a start, and a run
  started there has the ears if they were found; the best time per world is kept —
  `tests/pixel-leap.test.mjs`.
- **AC-18** Jumping in the Meadow plays the Meadow's jump sound and in Candy Candy's, and each world
  starts its own music — `tests/pixel-leap.test.mjs`.
- **AC-19** Pixel Leap plays offline once it has been played, Candy included, though only the Meadow
  was played — `tests/pixel-leap.test.mjs`.
- **AC-20** The landing page's Pixel Leap tile is playable and links to `pixel-leap/` —
  `tests/site.test.mjs`.
- **AC-21** Every stage can be finished: a scripted run through each stage's route reaches its
  portal or end, taking the first coin within 5 s of Go; in the level data no checkpoint is on a
  cookie or within 2 tiles of a hazard, and no hazard is within 7 tiles of a stage's start —
  `tests/pixel-leap.test.mjs`.
- **AC-22** At 390×844, a 20 s run's update and draw take under 8 ms per frame on average in the test
  browser, and the simulation moves the same at 60 and 120 frames per second —
  `tests/pixel-leap.test.mjs`.

## Core flow

1. Tap the Pixel Leap tile: the builder, over the moving Meadow, with a random monster.
2. Change parts or Shuffle, then Go.
3. Run and jump through the Meadow's three stages, past spikes and walkers, to its portal.
4. See the tally, leap into Candy, redrawn smooth, and play its two stages.

## States

| State | Builder | View and deck | Paused card | Tally card |
| ----- | ------- | ------------- | ----------- | ---------- |
| Building (the Meadow moves behind) | shown | view shown, deck hidden | hidden | hidden |
| Playing | hidden | shown | hidden | hidden |
| Paused (page hidden or blurred, a resize, P or Escape) | hidden | shown, still | shown | hidden |
| Tally at a world's end | hidden | shown, still | hidden | shown |
| Leaping to the next world | hidden | view shown, changing resolution | hidden | hidden |
| End of the slice (after Candy 2) | hidden | shown, still | hidden | shown, with Play again |

## Out of scope

- The later slices, in order (the split of the whole game; each gets its own spec): **slice 2**,
  Candy's third stage and its prize ability, music in the builder, and coins unlocking builder
  colours and parts; **slice 3**, a 1-Bit world (16 px per tile, two colours, the monster
  thresholded to them); **slice 4**, a Scribble world (line art on paper, the monster outlined in a
  sketch); **slice 5**, a Pico-8 or Medieval world and the journey's end. Each new world brings one
  rule from its material.
- Leaderboards, accounts, saved runs beyond the starts and the monster code.
- Builder details (horns, antennae, ears as decoration) beyond the prize; the ears are the prize.

# Shooting Gallery: a fairground paintball booth

**Go:** "don't consult with me, just start building after following this process" 2026-11-09

## Intent

The owner, on 2026-11-09, for a batch of games built in parallel: "review the game concept against
the guidelines and propose something that works, and then do adversarial review … so that you have
solid concepts of the game and then build them … don't consult with me, just start building after
following this process." The seed is an arcade game on Kenney's **Shooting Gallery** pack, which
the owner "thinks it looks amazing to build: a different, arcade-style game" (`discussion/direction.md`),
short-form, whose "Coming soon" tile is already on the landing page. Precision is the challenge, but
the finger must not hide the target at the moment of the shot; the choices are which target, now or
later (`discussion/game-guidelines.md`, on branch `claude/tender-knuth-m0cjxj` until its PR merges). It must differ in kind from Reef and Googly Faces.

The surface is a new game page, `shooting-gallery/`, and its landing tile, which becomes playable.
The game has its own palette (the pack's wood, orange curtains and blue water); the landing page
keeps the site's tokens.

## Decisions

### The owner's seventh playtest (owner, 2026-11-09)

Where they differ from the playtests below, these win.

- **No pink on the timer.** "during the frenzy mode, the pink on the light bulb should go out …
  keep it with the other colors … maybe … alternate between … black and yellow." In a frenzy the
  stopped timer's bulbs flash yellow and dark, three times a second.
- **Alarms you can't miss.** "when there's 10 seconds left, the chime doesn't sound particularly
  different than the rest, so make something that is like … hey, alert, it's happening. And then on
  the last five, do another chime. And then on the last 3, 2, 1 … sound already like an alarm."
  At 10 s an electric alarm bell rattles for a second; at 5 s a big bell strikes three falling
  notes; at 3, 2 and 1 a klaxon blares. The board swells with each. All three are synthesised
  (`scripts/shooting-gallery/make-alarms.py`) and sound nothing like the half-time chime; they
  replace the triple ring and the ticks.
- **Analog lettering.** "if by any chance you have a font that looks more analog … on the points at
  the top and then the dialogue that you get at the end … nice texture." The score, every painted
  sign, the floating points and the cards are lettered in Rye, a fairground woodtype (Sorkin Type,
  SIL Open Font License, kept in the game's folder), its paint chipped in specks so the wood shows
  through.

### The owner's sixth playtest (owner, 2026-11-09)

Where they differ from the fifth playtest below, these win.

- **Sticks in the background.** "The stick below the targets, it calls too much the attention now
  … it has to be … more in the background … lighter colors, softer texture or softer edges … The
  main thing you see should … [be] the targets as they are now." Every stick is narrower and drawn
  in soft, muted browns close to the booth's own, with a faint edge and grain: its tones span far
  less than a target's.
- **Paint stays on the water and grass.** "if the splash is hitting on the edge of the level … the
  water edge or the foliage edge … the paint is like floating … just leave the paint on the bottom
  side, the actual physical part, as if the paint had gone to the back side and fell off." Paint on
  a strip is clipped to the strip's own crest; the part of a splat that would hang in the air is
  not drawn.
- **A hit is pulled straight down.** "it starts going down, but then it stops and then it
  disappears … imagine you had a mechanism there that you hit them and it will lower them … Don't
  try to fold them to the back … just lower them … whoop, it goes down. It cannot be super fast,
  but it also shouldn't be … too slow." A hit target is pulled straight down along its stick, the
  stick with it, starting at once and gathering speed with no pause, out of sight behind its strip
  in 0.38 s; a drop-down is hauled straight up. The fifth playtest's tip back is gone.

### The owner's fifth playtest (owner, 2026-11-09)

- **A hit tips the whole thing back, stick and all** (replaced by the sixth playtest: a hit is now
  pulled straight down, with no tip back). "When you hit one of them, it doesn't look
  realistic because the stick disappears … do not disappear the stick and actually move everything
  down … the whole dog or target together with the stick bent backward as if mechanically you hit
  them." A hit target and its stick tip back together about the stick's foot (seen foreshortened,
  falling away), in about 0.2 s, then the mechanism lowers them out of sight behind the strip over
  0.5 s; a drop-down swings back and is pulled up behind the valance. Nothing fades, and the stick
  never disappears.
- **Sticks you can see** (toned down by the sixth playtest: soft, muted browns). "for the stick, you need to use also some texture … currently it's only
  one color, which mixes with the backgrounds … a border or … a shadow or two tones." Every stick is
  outlined, lit on one side and shaded on the other, with a faint grain.
- **A longer frenzy.** "the frenzy should last … like 1 more second." 7 s instead of 6.

### The owner's fourth playtest (owner, 2026-11-09)

The owner played the bulb-timer version and asked, in the session's chat on 2026-11-09, for more of
the analog look and a few details. Where they differ from the decisions further down, these win.

- **Everything analog.** "the frame around it to not look stylized … what it says round one, warm
  up, and that bar, everything should look analog … the message at the end, out of time, all of that
  should look analog. So see if you can reuse textures." Every sign is the pack's wood
  (`bg_wood`, and `img/wood.png` for the page's cards), square-cut with bevelled edges, nail heads
  and a drop shadow, its lettering painted on: the timer's board (a black panel behind the bulbs),
  the score, the round's name, the quota (a brass bar sliding in a wooden groove, a notch for every
  pip), the hopper (a carved tray with a cup for each ball), the round banners and the "Bonus!" and
  "Frenzy!" signs, and the start, over, pause and turn cards, whose buttons are painted red boards.
- **A better slingshot.** "the lines are too straight and you can see like weird edges." Its limbs
  curve and taper along their length; all their outlines are drawn before the wood, so the joins
  show no seams; the shading and grain follow the curves, with a knot or two.
- **Sticks you can see.** "the sticks below the dogs, they don't show up for the lane at the back,
  and they also don't show up for the circles … make sure there are sticks below each of the
  targets that are moving from sideways." Each lane's targets now stand higher above their strip,
  so a length of stick (about a quarter of the target's size) always shows between a target's
  bottom and the water or grass, in every lane.
- **The 10 s chime, unmistakable.** "we're missing like a chime when 10 seconds are left." It was
  playing, but sounded like the half-time chime; now it's a louder triple ring.
- **A marquee for the frenzy.** "when it's the frenzy mode … larger light bulbs … 3 times the
  diameter, maybe 5 times … along the whole border of the top border and maybe side of the game, as
  if they're coming from just behind the edges on the right, left, and top side, kind of like a
  carnival, and they are alternating the lights … like a marquee." During a frenzy, big bulbs
  (about 3.3 times the timer's) line the valance's edge and peek in from behind the left and right
  edges, two in three lit and the pattern chasing along, in warm white, yellow and pink; they fade in
  and out with the frenzy.

### The owner's third playtest (owner, 2026-11-09)

The owner played the slingshot version ("this is getting much better") and asked, in the session's
chat on 2026-11-09, for these details. Where they differ from the decisions further down, these win.

- **A light-bulb timer.** "it looks too smooth and vectorized … these assets … they're built out of
  wood … maybe that timer can look … more like made out of those light bulbs … more analog
  looking." The timer is a small wooden marquee board, framed and screwed, with two seven-segment
  digits of light bulbs (three to a segment) that glow and flicker a little; unlit bulbs stay dark.
  The warning colours of the second playtest are now the bulbs' colour: warm white, then yellow from
  10 s, orange from 5 s, red from 3 s, pink in a frenzy.
- **Rougher chimes.** "they could be more noisy … analog feeling." The half-time and 10 s chimes
  layer the bell with metal clatter and a little grit (Kenney's impact sounds, bit-crushed); the
  last seconds' tick is a wooden knock.
- **Sticks under everything.** "add … vertical sticks, also of wood, on each of the targets or
  things that are moving … Currently, they're floating." Every target, ducks included, stands on a
  wooden stick that runs down behind its lane's strip; drop-downs hang on their rope.
- **Rocking, as on a machine.** "they can also oscillate rotating just a little bit around the axis
  coming out of the screen, as if they were on a mechanical machine … belts and pulleys and gears,
  or like levers." Every target rocks a few degrees (ducks 5°, targets 4°) about its stick's foot,
  each at its own pace; drop-downs swing 3° about the rope's top. A shot is judged in the target's
  rocked frame, and paint on it rocks with it.
- **Both bands in front.** "the elastic band on the left … should also be closer to me … both
  elastic bands should be on the side closer to me." Both bands are drawn in front of the wood.
- **A wooden slingshot.** "if the slingshot could also look more realistic, some texture, some
  shadow … to make it look out of wood." A carved fork: tapered limbs shaded across their width,
  outlined, with grain, the band's wrapping at the tips, a leather pouch, and a shadow on the counter.
- **Easier to control, still no crosshair.** "it definitely feels it's really hard to use … there's
  no visual feedback of how much … it just feels really hard to control." Claude's answer:
  - a wooden ruler beside the slingshot with a notch at each lane's height and a brass slider
    showing how far the pull will send the ball;
  - a short dotted arc from the pouch along the first fifth of the flight, showing which way it
    will go but never where it lands;
  - a longer pull for the full reach (140 units down instead of 110; 80 in landscape instead of 64),
    so each bit of finger movement matters less.

### The owner's second playtest (owner, 2026-11-09)

The owner played the paintball version's preview and asked, in the session's chat on 2026-11-09,
for these changes. Where they differ from the decisions further down, these win.

- **A slingshot, aimed continuously.** "the vertical movement is not clear how it works … it's
  only 3 levels … it should be not discrete. You should be able to point in any vertical direction,
  and if you miss, you miss … you should see that it's changing … the actual gun moving up and down
  … I wonder if there are any assets for a slingshot instead of the gun … I think the slingshot will
  be actually great … the point is we need to make it intuitive to use." The gun and its lane gauge
  are gone. A slingshot stands on the counter at the bottom centre, drawn in the booth's style from
  the pack's wooden sticks (Kenney's only slingshot is a voxel icon that clashes with the pack).
  Claude's mapping:
  - **Pull and release.** Touch anywhere on the counter and pull: the pouch, holding the next
    paintball, follows the finger and the band stretches; let go and it flies. The pull is measured
    from where the finger first touched, so there's no small pouch to find. A pull under 10 units is
    no shot (let go to cancel).
  - **Where it lands**, separable and the same everywhere: pulling sideways moves the landing point
    the other way along the lanes, x = the centre − (pull x / 80) × 0.47 × the stage width; pulling
    down sends it farther, y = the counter's top − (pull y / 110) × the booth's height (90 and 64 in
    landscape; the third playtest lengthened the pull to 140 and 80). Any height, not lane steps: between lanes it lands on whatever is there.
  - Mouse: press anywhere, pull and release. Keyboard: the arrows set the pull (it's kept between
    shots), Space lets go.
  - Until the run's first shot, a soft arrow under the pouch shows the pull.
- **A timer you can't miss.** "it should be more … like digits … even larger than the points …
  hanging on the top left … when you get to half the time, it makes some sort of chime and visually
  calls your attention. And then when there's like 10 seconds left, it makes another chime and it
  changes color to … yellow and then orange and then red on the last … 2 or 3 seconds … the color
  is not on the digits but on the background of the timer." The seconds left, in large digits on a
  badge at the top left beside the back button, larger than the score. At half time a chime and the
  badge swells; at 10 s a double chime (a triple ring since the fourth playtest) and the badge turns yellow, at 5 s orange, at 3 s red, with a
  tick each of the last 3 seconds. During a frenzy the badge is pink and stopped. The counter's
  timer bar is gone.
- **A frenzy you earn.** "it's not clear when you're gonna get the frenzy, so maybe you earn it by
  hitting one of the special target … you show them from time to time … on the first level they're
  easy to hit, but on the second level they're harder, and then from level 3 onwards they're hard to
  hit." A frenzy target (a target with a pink glow and sparkles) appears from time to time, every
  round from round 1; hitting it starts the frenzy, at most one a round. Round 1: a big one rises in
  the nearest lane and stays 3.5 s. Round 2: it crosses a middle lane at the lane's speed. Round 3
  on: it crosses the farthest lane at 1.8× the speed. It comes about 5–9 s into a round and, if
  missed, again at 17–22 s.
- **Fixes:** the tile was squeezed (its picture is now cropped at the tile's own 16:10 before
  scaling); the gun's sprite carried a speck of its neighbour (the gun is gone); the trees floated
  (their trunks now go down behind the far lane's water).

### The owner's changes after playing v2 (owner, 2026-11-09)

The owner played the first version's preview and asked, in the session's chat on 2026-11-09, for a
harder, paintball version. These decisions replace the first version's controls, economy, rounds
and music; the first version's decisions they replace are kept, struck, in "Replaced" below. The owner's
second playtest, above, then replaced the gun with a slingshot and changed the timer and frenzy.

- **Aim the gun, with no crosshair.** "The game has no challenge because you just have to tap on
  the animal and then it hits perfectly … you only control near the gun … 2 degrees of freedom …
  the pitch and the jaw angle … it should be on the center, the gun … don't put the crosshair so
  that you don't know exactly where you're aiming." The gun stands at the bottom centre; there is
  no crosshair. Two controls (Claude's mapping, after an adversarial review found that a ray from
  the gun makes the same drag land differently in every lane):
  - **Turn (yaw, ±55°)** moves the landing point along the lanes: x = the centre + (yaw / 55°) ×
    0.47 × the stage width, the same in every lane. The barrel points at the landing point.
  - **Raise (pitch)** picks the lane, one step per lane; a gauge beside the gun has one notch per
    lane and lights the one aimed at. The shot lands on that lane's line, where its targets' centres
    run. Which lane is readable; where along it is the skill.
  - **Controls** live on the counter, near the gun ("you only control near the gun"): a drag there
    turns the gun (3 px of horizontal movement per degree) and raises or lowers it (a step per 44 px
    of vertical movement); a tap there fires (down and up within 250 ms, moving under 8 px); while a
    finger drags, a second finger's tap fires. Touches on the lanes do nothing. Mouse: dragging with
    the button down turns and raises the gun, and a click without a drag fires. Keyboard: Left and
    Right turn (faster the longer they're held, Shift for fine), Up and Down raise and lower, Space
    or Enter fires.
- **Paintball.** "instead of having shooting … we're shooting paintball … splashes with many
  different shapes … every time you throw it's like a different color … paint sound, liquid sound
  when they hit, and then the paint stays … The whole thing is becoming colorful because the paint
  is accumulating." Each shot is a paintball of the next colour in a palette of 8 (blues, purples,
  pinks, greens; never the gold or red that mark bullseyes and the gold duck). It flies for
  0.18 s to the nearest lane and up to 0.45 s to the top of the booth (0.42 s in the gun version), so a moving target must be led; it's
  judged where it lands, when it lands. It splats with one of the Kenney Splat Pack's 36 shapes,
  tinted, and a wet splat sound. A splat on a target goes down with it. A splat on the scenery (the
  lane strips, the wall) stays for the run, keeping its colour: fresh for 1 s, then it settles to
  80% opacity. It is always drawn behind every target in front of it, so it never hides one; at
  most 70 stay, the oldest dissolving (Claude, 2026-11-09: the review proposed fading old paint to
  55% and greying it, which made the booth dull rather than colourful).
- **Lanes, from the sides, from below and from above.** "targets that come from below, not only
  from side to side. Also multiple lanes, so you have some coming from the left, some coming from
  the right … some coming from the top, some definitely coming from the bottom at any of the lanes
  … If the game is gonna be portrait, you definitely need to have multiple, many lanes … If it's
  horizontal, then do three lanes." Portrait has 5 lanes, landscape 3, stacked in depth (far lanes
  smaller). Lanes run alternately left-to-right and right-to-left. Pop-ups rise from behind any
  lane's strip, stay 1.8 s and sink. Drop-downs are lowered on a rope from the valance into a lane,
  hang 1.8 s and are pulled up; in portrait only into the front three lanes, so ropes don't cross
  the far lanes' targets.
- **Orientation follows the screen.** "if the aspect ratio of where you load it is landscape, then
  the game loads landscape … portrait … if you switch from one aspect ratio to another, it shows
  some dialogue, like the game pauses, grayed out … restart game if you want to play in this other
  orientation. But if you return to the previous orientation, the game continues." The layout is
  chosen when a run starts (landscape when width / height > 1). If the screen turns during a run
  (past 1.15 or below 0.87, held for 0.4 s), play and music freeze under a grey veil with
  "Restart in landscape?" (or portrait) and a Restart button; turning back hides it and play goes
  on after a 1 s count-in. On the start or over card the booth simply lays itself out again. A
  restart from the veil doesn't count as a lost run for the assist. Each layout keeps its own best.
- **A timer.** "there should be like a timer as well." Each round lasts 30 s, shown as a draining
  bar on the counter. The timer is the only way to lose: a round whose quota isn't met when its
  time runs out ends the run (Claude, from the review: a second way to lose, running out of paint,
  punished the learning that no-crosshair aim needs).
- **Paint, not shells.** The hopper holds 6 balls and refills one every 0.6 s; a bullseye puts one
  back at once; an empty hopper just clicks. It paces the shooting rather than ending the run
  (Claude, from the review).
- **Frenzy.** "some frenzy mode where many targets show up suddenly … being raised and shot up on
  your face … a different song, things move faster, and then you can go crazy, and then it returns
  to the normal. Maybe that's just for bonus points." From round 2, once a round, at a random
  moment 8–18 s in: 6 s of "Frenzy!" (7 s since the fifth playtest), the galop instead of the waltz, pop-ups and drop-downs
  springing up across every lane, targets 1.6× as fast (the paintball's flight unchanged), shots
  free, points ×2 and no pips. The round's timer stops during it; frenzy shots don't move the
  assist (Claude's rules, from the review: a frenzy late in a round must not lose the run).
- **Carnival music.** "the music should sound more like carnival." An original calliope waltz
  (oom-pah-pah, steam-whistle pipes with a flutter) plays under the booth, and an original fast
  galop under a frenzy, both synthesised by `scripts/shooting-gallery/make-music.py` into MP3.

### The game as it now stands (Claude, 2026-11-09, unless marked)

- **Hook:** a fairground paintball booth: pull a slingshot, no crosshair, and paint everything
  you miss. **Differs in kind** from Reef in its verb (pull and release a slingshot and lead a
  flying ball, not steer a body) and in what failure means (a round's clock runs out before you've
  scored enough; nothing attacks you, there are no lives), and from Googly Faces in its structure
  (timed rounds with a quota) and in having failure at all.
- **Short-form**: 6 rounds of 30 s plus frenzies, about 3.5 minutes for a full run.
- **Rounds**, each adding one thing; starting values, the knobs to tune by playing:

  | Round | Name | What's new | Quota (pips) | Lane speeds (units/s, near → far) |
  | ----- | ---- | ---------- | ------------ | --------------------------------- |
  | 1 | Warm-up | ducks and targets crossing every lane | 7 | 30 → 55 |
  | 2 | Pop-ups | pop-ups from behind any lane; the first frenzy | 13 | 34 → 62 |
  | 3 | Drop-downs | drop-downs on ropes | 18 | 38 → 68 |
  | 4 | Turnabouts | targets and ducks turn on their sticks (face 2.2 s, back 1.2 s, a 0.25 s turn that counts as back); a back scores nothing and blocks what's behind it | 24 | 40 → 72 |
  | 5 | Gold rush | two gold ducks, everything a quarter faster | 30 | 50 → 90 |
  | 6 | Closing time | everything at once, all points ×2, the lamps lit | 34 | 50 → 90 |

  The first target of round 1 is a big one crossing the middle of the nearest lane slowly, where a
  short, straight pull lands, so a first-timer hits within seconds.
- **Scoring.** A hit is worth pips by depth: the nearest lane 1, the middle lanes 2, the farthest
  3 (in landscape: 1, 2, 3); points are 10 per pip. A bullseye (a target's painted centre and the
  ring around it, or the painted target on a target-duck; plain ducks have none) scores ×2 and puts
  a ball back. The gold duck is worth 100 points and 2 pips and refills the hopper. Meeting the
  quota before the timer ends starts the **Bonus**: the rest of the round scores ×1 in the nearest
  lane, ×2 in the middle lanes and ×3 in the farthest and on the gold duck, so the choice is the safe
  near target or the far one. Frenzy scores ×2 and doesn't stack with the bonus (the higher counts).
  Closing time doubles everything. No hit scores more than ×8.
- **Occlusion.** Front to back, lane by lane from the nearest: its strip (water or grass), then its
  targets; the wall behind everything. A pop-up still behind its strip can't be hit, and a back
  blocks what's behind it.
- **Sizes.** Portrait: one unit is min(width / 400, height / 720) CSS px, the stage 400 units wide
  (up to 520). Landscape: min(width / 800, height / 450), up to 1000 wide. Targets are drawn at
  0.36 → 0.6 of the pack's size from the far lane to the near one in portrait (the far ones about 51
  units), 0.38 → 0.52 in landscape. The stage keeps its size for the whole run and is letterboxed
  when the screen changes. The pixel ratio is capped at 2. The pack's sprites are rasterised at 2×
  by `scripts/shooting-gallery/build-atlas.mjs`; the splats by `scripts/shooting-gallery/build-splats.py`.
- **Hidden assist** (0 to 1): grows the body hit area of every target by up to 15% (never the
  bullseye). It rises 0.2 after two misses in a row and 0.3 after a run lost in round 1 or 2, falls
  0.05 with each hit, ignores frenzy shots, starts at 0.3 for a new player, is kept in localStorage,
  and is off in round 6.
- **No written tips.** The start card shows Start and the best; each round opens with its name on a
  banner; mid-play banners ("Bonus!", "Frenzy!") are slim pills on the counter, where nothing can
  be hit.
- **Interruptible.** Hiding the page during a round (its intro, play, a frenzy or the moment between
  rounds) pauses play and music under a "Tap to go on" card; the tap that resumes counts in 1 s,
  with play frozen, and never fires. On the start or over card it only pauses the sound.
- **Sound**, all under the site-wide mute: the waltz and the galop (synthesised), and Kenney sounds
  as MP3: the band's twang on each shot, a wet splat on landing (two variants, varied pitch), a wood
  knock on a hit, a tin clank on a far lane's hit, a bright ding for a bullseye, a dry click from an
  empty hopper, a splash as a pop-up rises, the pizzicato rise at a round's start, a pizzicato run
  at the quota, a falling pizzicato when the time runs out, a finale at closing time, a chime (a struck bell) at half time, an alarm bell at 10 s, a big bell's three falling notes at 5 s, a klaxon at each of the last 3 seconds, and a pizzicato flourish when the frenzy target is hit.
- **Art** is the Kenney Shooting Gallery pack's (wall, curtains, water, grass, trees, clouds, ducks,
  targets, sticks, from which the slingshot is built) and its Splat Pack's; the slingshot's band and pouch, the timer badge, the ropes
  and the paintballs are drawn by the game. No "Time up", "Ready" or "Go" lettering from the pack.
- **Tuning targets:** a first hit within 5 s of Start; a first-timer ends in round 2–3 (about
  1.5–2 minutes); an expert reaches closing time.
- **Tuned by simulated play** (Claude, 2026-11-09): scripted shooters that aim along a lane with a
  beginner's, an average and an expert's spread and lead, six runs each, in both layouts. With the
  first quotas (4 to 12) everyone reached closing time, so they became 7, 13, 18, 24, 30 and 34.
  Measured after: the first hit about 2 s after Start; a beginner's run ends in rounds 2–4, mostly
  3–4, after about 2–2.5 minutes (a real first-timer, still learning aim without a crosshair, does
  worse than the script, which knows where its shots land); an average player reaches rounds 4–6;
  an expert reaches closing time, with 4 to 15 times a beginner's score.
- **Re-measured with the slingshot** (Claude, 2026-11-09), the same scripts erring now in both
  directions, as a pull does: a beginner's run ends in rounds 2–3, mostly 2, after about 1.3–1.8
  minutes (one run in six ended in round 1); an average player reaches rounds 4–5; an expert reaches
  closing time, in portrait and landscape alike. The quotas stay as they are.
- **The landing tile** links to `shooting-gallery/`, its line "Pull the slingshot, lead the shot and paint
  the booth", its picture drawn from the game. The game exposes `window.__gallery` for the tests.
- The owner's whole round of changes goes in this PR, as asked; the adversarial review suggested
  three PRs (Claude, 2026-11-09).

### Replaced

The first version's decisions that the owner's changes replaced, kept as a record: a relative
crosshair with tap-to-fire judged at touch-down; shells in a tray of 10 with an overflow payout and
a 6-shell floor; stick shots; 8 rounds with free rounds 4 and 7 and a Crosswind card; losing when
the tray emptied or the parade passed; the "Polka Train" loop; a full run of 2.5–3 minutes. From the
paintball version, replaced by the owner's second playtest: the gun turned and raised a lane at a
time with its lane gauge, a tap to fire, the timer as a bar on the counter, and a frenzy at a random
moment 8–18 s into rounds 2 to 6.

## Acceptance items

- **AC-1** The booth is alive behind the start card (targets change position over 1 s); Start
  begins round 1 with a 30 s timer, a quota of 7 and a full hopper of 6, the slingshot on the
  counter; there is no crosshair and no gun; no errors — `tests/shooting-gallery.test.mjs`.
- **AC-2** A pull lands the ball at x = the centre − (pull x / 80) × 0.47 × the stage width and
  y = the counter's top − (pull y / 140) × the booth's height (90 and 80 in landscape), at any
  height, the pull clamped to those ranges; the pouch follows the pull — `tests/shooting-gallery.test.mjs`.
- **AC-3** On a touch screen, touching the counter and pulling stretches the slingshot and letting
  go fires; a pull under 10 units fires nothing; touches on the lanes neither aim nor fire —
  `tests/shooting-gallery.test.mjs`.
- **AC-4** The mouse pulls and releases the slingshot the same way; the arrow keys set the pull,
  which stays between shots, and Space lets go — `tests/shooting-gallery.test.mjs`.
- **AC-5** A paintball takes 0.18 s to land just above the counter and longer the farther it goes,
  up to 0.45 s at the top of the booth; it is judged where it lands when it lands, so a target that
  moved away in the meantime is missed — `tests/shooting-gallery.test.mjs`.
- **AC-6** A hit scores 10 points a pip with pips 1 near to 3 far; a bullseye scores double and
  puts a ball back in the hopper; the gold duck scores 100 and 2 pips and refills the hopper; a miss
  scores nothing — `tests/shooting-gallery.test.mjs`.
- **AC-7** Each shot is the next colour of the palette; it leaves a splat where it lands, on the
  target (going down with it) or on the scenery; scenery splats keep their colour, settle to 80% after 1 s, and at
  most 70 stay — `tests/shooting-gallery.test.mjs`.
- **AC-8** The frontmost thing takes the shot: a lane's strip in front of a target behind it, a
  pop-up not yet risen above its strip can't be hit, and a target's back blocks what's behind it —
  `tests/shooting-gallery.test.mjs`.
- **AC-9** The hopper holds 6, spends one a shot, refills one every 0.6 s, and an empty hopper fires
  nothing — `tests/shooting-gallery.test.mjs`.
- **AC-10** When a round's time runs out, a met quota leads to the next round and an unmet one ends
  the run with the over card (score, round reached, best), whose Play again starts a new run —
  `tests/shooting-gallery.test.mjs`.
- **AC-11** Meeting the quota starts the bonus: ×1 near, ×2 middle, ×3 far and on the gold duck;
  closing time doubles everything; no hit scores more than ×8 — `tests/shooting-gallery.test.mjs`.
- **AC-12** Hitting the frenzy target starts a frenzy for 7 s: the galop plays, targets spring up
  across every lane and move 1.6× as fast, shots are free, points ×2 (the higher of it and the
  bonus), no pips, the round's timer stops and the assist doesn't move; then the waltz returns; no
  frenzy comes without the target — `tests/shooting-gallery.test.mjs`.
- **AC-13** Rounds bring in their elements as in the table: movers in every lane in round 1,
  pop-ups from 2, drop-downs from 3 (only into the front three lanes in portrait), turnabouts from
  4, gold ducks in 5, everything in 6 with points doubled — `tests/shooting-gallery.test.mjs`.
- **AC-14** A screen wider than tall starts a 3-lane landscape booth, a taller one a 5-lane portrait
  booth; turning the screen mid-run freezes play under a grey veil offering a restart in the new
  orientation, turning back resumes after a 1 s count-in, and Restart starts a new run in the new
  layout without moving the assist; on the start card the booth just lays itself out again; each
  layout keeps its own best — `tests/shooting-gallery.test.mjs`.
- **AC-15** Hiding the page during a round pauses it under the pause card; the tap that resumes it
  doesn't fire and play stays frozen for the 1 s count-in; on the start card no pause card shows —
  `tests/shooting-gallery.test.mjs`.
- **AC-16** The assist grows a target's body hit area but never its bullseye; a new player starts at
  0.3; it rises 0.2 after two misses in a row and 0.3 after a run lost in round 1 or 2, falls 0.05
  with a hit, and is off in round 6 — `tests/shooting-gallery.test.mjs`.
- **AC-17** The best score is kept across reloads — `tests/shooting-gallery.test.mjs`.
- **AC-18** Each state shows only its own card, banner and HUD, as in the state table —
  `tests/shooting-gallery.test.mjs`.
- **AC-19** A shot (the band's twang), a splat, a hit, a bullseye, an empty hopper, a round's start,
  the quota, the frenzy target and the time running out each play their sound —
  `tests/shooting-gallery.test.mjs`.
- **AC-20** The landing page's Shooting Gallery tile is a link to `shooting-gallery/` with no
  coming-soon badge, and it opens the game — `tests/site.test.mjs`.
- **AC-21** The game plays offline once it has been played — `tests/shooting-gallery.test.mjs`.
- **AC-22** At 390×844 and 360×640 (5 lanes) and 844×390 (3 lanes) the booth, the slingshot, the
  hopper, the pips and the timer fit without scrolling, the timer's digits are larger than the
  score's, the far targets are at least 44 px wide, and the counter, where the thumb works, holds no
  target — `tests/shooting-gallery.test.mjs`.
- **AC-23** The timer shows the whole seconds left in light bulbs on a board at the top left; at
  half time it chimes and swells; at 10 s an alarm bell rattles and its bulbs turn yellow; at 5 s a
  bell strikes and they turn orange; at 3 s they turn red and a klaxon blares at 3, 2 and 1, each a
  different sound from the half-time chime; in a frenzy it stops and its bulbs flash yellow and
  dark, never pink — `tests/shooting-gallery.test.mjs`.
- **AC-24** A frenzy target comes 5–9 s into every round and again at 17–22 s if no frenzy has come:
  in round 1 a big one rising in the nearest lane for 3.5 s, in round 2 one crossing a middle lane,
  from round 3 one crossing the farthest lane at 1.8× its speed — `tests/shooting-gallery.test.mjs`.

- **AC-25** Every target stands on a stick down behind its strip (a drop-down hangs on its rope)
  and rocks a few degrees about the stick's foot, each at its own pace; a shot is judged in the
  rocked frame, so it hits where the target is drawn — `tests/shooting-gallery.test.mjs`.
- **AC-26** While the slingshot is pulled, the ruler's slider shows how far the ball will go (0 at
  the counter, 1 at the top of the booth, the lanes' notches between) and a dotted arc covers the
  first fifth of its flight, never reaching where it lands — `tests/shooting-gallery.test.mjs`.
- **AC-27** In every lane a length of stick, at least a fifth of the target's size, shows between
  a target's bottom and its strip's crest — `tests/shooting-gallery.test.mjs`.
- **AC-28** During a frenzy big bulbs, at least three times the timer's, line the top and both
  sides, their lit pattern chasing along; there are none outside a frenzy —
  `tests/shooting-gallery.test.mjs`.
- **AC-29** The start, over, pause and turn cards are wooden signs from the pack's wood, and the
  10 s chime is louder than the others — `tests/shooting-gallery.test.mjs`.
- **AC-30** A hit target is pulled straight down with its stick, which stays drawn, starting at
  once and gathering speed, out of sight behind its strip (a drop-down pulled up) within 0.45 s,
  still partly in view at 0.2 s — `tests/shooting-gallery.test.mjs`.
- **AC-31** Paint on a lane's water or grass shows only below the strip's crest, never above its
  edge — `tests/shooting-gallery.test.mjs`.
- **AC-32** A target's stick is drawn in soft tones: across its width they span less than 70 levels
  of luminance and less than 0.4 of what the target's face spans — `tests/shooting-gallery.test.mjs`.
- **AC-33** The score, the painted signs and the cards are lettered in Rye, a fairground woodtype
  served from the game's folder, its paint chipped in specks — `tests/shooting-gallery.test.mjs`.

## Core flow

1. Tap the Shooting Gallery tile: the booth is alive behind a small start card.
2. Tap Start: round 1's targets cross every lane.
3. On the counter, pull the slingshot back and let go; lead the moving targets, hit the frenzy
   target when it shows, and meet the quota before the timer runs out.
4. Reach closing time, or run out of time: see the score, the round and the best, then play again.

## States

| State | Start card | Banner | Pause card | Orientation veil | Over card | Slingshot's ball, hopper, pips, timer, score |
| ----- | ---------- | ------ | ---------- | ---------------- | --------- | -------------------------------------- |
| Start (the booth moves behind) | shown | hidden | hidden | hidden | hidden | hidden |
| Round intro (about 1.2 s) | hidden | the round's number and name | hidden | hidden | hidden | shown |
| Playing | hidden | hidden | hidden | hidden | hidden | shown |
| Bonus (quota met) | hidden | "Bonus!" briefly, a pill on the counter | hidden | hidden | hidden | shown, the pips lit gold |
| Frenzy (7 s) | hidden | "Frenzy!" while it lasts, a pill on the counter | hidden | hidden | hidden | shown, the timer stopped, its bulbs flashing yellow and dark |
| Round won (about 1.5 s) | hidden | "Round cleared" and the round's score | hidden | hidden | hidden | shown |
| Paused (page was hidden) | hidden | hidden | shown | hidden | hidden | shown |
| Turned (the screen's orientation changed) | hidden | hidden | hidden | shown, offering a restart | hidden | shown, greyed |
| Resuming (1 s count-in) | hidden | "Ready…" | hidden | hidden | hidden | shown |
| Over (time ran out, or closing time) | hidden | hidden | hidden | hidden | shown | shown |

## Out of scope

- Leaderboards, accounts, round codes or choosing a starting round.
- Rounds beyond 6, a pause button, and a choice of paint colours; they'd be later changes.
- Music settings beyond the site-wide mute.

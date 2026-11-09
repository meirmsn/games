# Orbit: fling a probe from planet to planet on gravity

**Go:** "don't consult with me, just start building after following this process" 2026-11-09

## Intent

The owner's notes on the Planets pack: "A pitch-black space background, perhaps a subtle star
texture, with the planets on it. It feels different … Maybe it's about physics, using gravity to
achieve something. 'Create your own planet' sounds boring." For this batch the owner asked, on
2026-11-09: "review the game concept against the guidelines and propose something that works, and
then do adversarial review … so that you have solid concepts of the game and then build them …
don't consult with me, just start building after following this process." The guidelines are
`discussion/game-guidelines.md` (on branch `claude/tender-knuth-m0cjxj` until it merges).

The surface is a new game page, `orbit/`, and the landing page's Orbit tile, which turns from
"Coming soon" into a link. The game has its own look (pitch-black space, the same in light and
dark), like the other game pages; the landing page keeps the site's tokens. There is no
`DESIGN.md`.

**Hook:** fling a glowing probe off one planet, let gravity bend it around the others, and catch the
next planet's orbit ring: a grand tour hopping world to world across pitch-black space.

**Concept check** (the guidelines' questions, answered after two rounds of adversarial review):

- Verb: set the boosters, and fire as the circling probe comes round to the right point; watch a
  readable arc bend around a planet, and the settle: the probe eases into the ring's orbit with a
  chord.
- A typical 5-second choice: chase the leg's line of motes, a close pass by a planet (risking a crash)
  or a wide arc (risking drifting away), or take the plain capture; or go bold and swing round
  another planet on the way, for a slingshot.
- How it teaches: no path preview, and one line of text only on the first level, until the first
  firing. The probe is a small ship pointing the way it would leave; a release toward a
  planet hits it, and the ghost of that flight, with its release point and power, shows why; a
  release past it swings round into the ring. A ring that doesn't catch the probe says why ("Too
  fast", "Too steep"). A swing round another planet draws itself as it happens and says
  "Slingshot!". Moons first appear where waiting for one is plainly right.
- Three clocks: a flight resolves every 3–8 s; a new system with a new element and new look every
  2–3 minutes; you come back for gold medals, the "one shot" badge and the par.
- What an expert does differently: times the release and sets the power to the degree, threads
  each leg's line of motes in one flight, slingshots round other planets, waits for the moon,
  finishes within par.
- Why the tenth play differs from the first: going for gold means finding each leg's mote route (a
  close pass or a wide arc, a slingshot, the moon's timing) within a par of launches.
- Form: short-to-long. This slice is a 6–9 minute tour (3 systems of 4 legs), interruptible at any
  leg. Later slices lengthen it.
- Orientation: portrait. One thumb: the booster bar sits at the bottom, and a tap anywhere fires,
  so the hand stays below the action; a tall field gives long arcs. Desktop shows the same field centred, with stars filling the sides.
- What a failure costs: a few seconds and one of the system's 10 probes. The probe rewinds to the
  leg's start; motes already caught stay caught; spending all 10 restarts the system.
- What stands in for save games: the URL (`#s2`, `#s3`) starts at a system; medals and bests sit in
  localStorage, and losing them costs at most a few minutes of replay.
- Riskiest technical part: tuning gravity so arcs are expressive yet controllable. It is proven
  with a headless solver (`scripts/orbit/solve.mjs`) that runs the game's own physics module over
  every release point and power of each leg; `tests/orbit-levels.test.mjs` pins the targets.

**Different in kind:** against Reef (continuous steering; levels with lives and a game over;
eat or avoid) the verb is set, time the release and watch, the structure is hand-built legs with an instant
rewind, and failure is a few-second rewind with nothing lost. Against Googly Faces (a tap toy) all
three differ.

## Decisions

- Slingshot between planets, caught by the next planet's orbit ring; rejected: "create your own
  planet" (owner: "sounds boring"). A release-from-orbit hopper was first rejected as having no aim
  to master (session, 2026-11-09); the owner then chose it, with the booster power to set, and the
  timing and power are what you master (owner, 2026-11-09, below).
- The release is from the orbit. The probe never stops circling its planet; firing the boosters
  sends it off along its orbit, the way it is moving, from wherever it is at that moment, at the
  planet's escape speed plus the booster power (0 to 100% of 420 units a second), plus the planet's
  own motion. So where it is when you fire aims it, and even the lowest power leaves the planet.
  It circles once every 7 s, slow enough to time a release, whatever the planet's pull. After a
  catch it circles the way it arrived; a system starts it one way. The same release at the same
  moment gives the same flight. Physics runs at a fixed 1/240 s step, accumulated from frame time,
  so 60 and 120 Hz screens agree. Rejected: pulling back to aim anywhere (owner, 2026-11-09: "when
  you tap the space bar, it goes away. I don't think we should have that weird launching thing
  where you use the arrows ... When you hit the space bar, it lives in the whatever tangential
  velocity it has on the planet"); a release at plain orbit speed or a weak boost that only
  stretches the orbit, which can't leave or drifts into the next ring from almost anywhere
  (tuning, 2026-11-09).
- Gravity is shown by its effect alone, never ahead of the throw. The probe is a small ship pointing
  the way it is moving; nothing previews where it will go, and the power shows only on the bar.
  Rejected: a line ahead of the circling probe showing the power (owner, 2026-11-09: "Don't show
  the line of the booster on the rotating thing, just on the bottom booster thing"). Rejected: a preview thread of the path, which made it too easy (owner,
  2026-11-09: "It even tells you, the controls are showing you if it's gonna bend or not bend.
  It's very easy to play the game"); and gravity-reach rings, which mislead and look like an
  existing well-known game (first concept review, 2026-11-09).
- Capture is an orbit, not a net. Inside the ring's band (its radius plus 26 units, inside the ring
  too), the probe is caught only if it moves along the ring, its path within 30° of the ring's
  direction, and slower than the ring's limit relative to the target: 1.75 × the escape speed at
  the ring by default, with a per-system and per-planet value tuned in `orbit/levels.js`. A throw
  straight at a planet comes in head-on and hits it; you throw past the planet so the probe swings
  round into its orbit. A caught probe is steered into the ring: each moment it aims for the ring's
  lap speed along the ring plus a gentle pull toward the ring's radius, braking at up to 1,400 units
  a second² and turning at most 3 radians a second, so however fast it arrives it slows and curves
  in without a lurch, carrying on the way it was flying; it settles within 3 s and then circles.
  A catch only counts if that whole path stays clear of the planet by the probe's size: touching a
  planet is always a crash (owner, 2026-11-09: "when the planet catches the player in orbit, it
  actually doesn't crash into the planet, even though visually I see it being on top of the planet
  ... make sure that whenever the player touches the planet, it is a crash always"); rejected: an
  eased curve that could dip into the planet, and a blend that still lurched (tuning, 2026-11-09).
  Rejected: catching any probe in the band and snapping it onto
  the ring in 0.4 s (owner, 2026-11-09: "if you pointed towards the planets and it's not going
  straight into it, it seems like it always catches it. It doesn't feel natural. It just goes
  almost at a right angle and then ploop, it clacks. It latches into the orbit").
- There is no brake: the power and the moment you fire are the whole control, and a touch in
  flight does nothing (owner, 2026-11-09: "I don't think we should have the brake mechanic. I think
  it should be just the power and the timing to fire. So remove that"). Rejected: a brake that cut
  the speed by 35% once per flight from System 2, and a +30% burn before it (second concept
  review, 2026-11-09). Without it, System 2's first target catches at up to 1.4 × its escape speed
  (it was 1.15), so its timing window is 48° rather than 22° (tuning, 2026-11-09).
- A slingshot is a bonus for a bold route: swinging at least 120° round a planet that is neither
  the leg's start nor its target, while within 3 × that planet's radius of its centre, and then
  being caught. As it happens, from 40° of the swing, a gold arc round the planet traces the angle
  swept, brightening once it counts; at 120° "Slingshot!" shows by the planet with a rising whoosh.
  It is banked only when that flight is caught: "+1 slingshot" shows by the ring, and the top bar's
  slingshot count (hidden until the first) goes up; a failed flight banks none. The end card counts
  slingshots, and each counts as 3 motes toward the medal (its share of the motes, at most all of
  them), so a bold route can make up for motes missed. Each system stores one caught release that
  slingshots (`bold` in `orbit/levels.js`), which the tests fly (owner, 2026-11-09: "if you are um,
  bold and you go around another planet before getting into the one that you're supposed to go,
  you can get like a bonus, like an extra amazing bonus ... I don't know how you would detect it,
  and I think you could show the bonus while you go around it"; the 120°, the zone and the medal
  worth: session, 2026-11-09).
- The top bar says what each thing is: "System 2 · Slingshot" (number and name), "Jump 1 of 4"
  with a dot per leg, "Stardust 0/22", and "Slingshots 1" once one is earned. The probes left sit
  just above the booster bar (owner, 2026-11-09: "it's not clear what the things at the top are ... the number that you are
  throwing should be next to the booster at the bottom so that it's clear ... it should show how
  many of them you have left ... maybe it should say level or L1 out of 22"). "1/22" was the
  stardust, not a level: it is labelled "Stardust", and the leg is "Jump 1 of 4" (session,
  2026-11-09). The probes left are a plain number counting down, "Probes 7", like the countdown
  before a launch; rejected: a small ship per probe (owner, 2026-11-09: "The probes left can be a
  number. It doesn't have to be that counter that takes a lot of space, and I don't think it looks
  great, so just do counter. Kind of cool because it's a nod to the reverse countdown before blast
  off").
- A flight fails when the probe's body (8 units across its middle) touches a planet, swings more than 200 units past the field's edge, loops
  once around a body other than the target or the target's parent while bound to it, or lasts
  8 s. The probe dims over the
  last 2 s before the time runs out. On a failure it rewinds to the leg's start within 1 s, and moons
  rewind with it. A system has 10 probes, one per launch, counted just above the booster bar
  (amber when 3 or fewer are left); when the last is spent without finishing the system, whether that flight failed
  or was caught with jumps still to go, an "Out of probes" card offers "Try again", which restarts the system; medals and reached systems are kept. Rejected: unlimited
  tries (owner, 2026-11-09: "I was able to do like infinity tries ... maybe we should limit it ...
  so that you really need to try, but you can leave it at 10 or something"). The failed flight
  stays as a faint ghost
  trail, with a mark at its release point on the orbit and at its power on the bar, until the next
  launch. R rewinds by hand; in flight it counts as a launch
  and a failed flight (first concept review and spec review, 2026-11-09).
- The leg clock (where the moons are) starts at the moment the previous leg's probe was caught (0
  for a system's first leg) and runs on, so nothing jumps when a leg begins. A rewind runs the
  clock visibly back to the leg's start. No body's surface or the target's band ever meets the
  parking ring, at any leg time (spec review, 2026-11-09).
- Motes: each leg has one line, laid along a captured route the solver found. Some legs' line is a
  close pass by a planet, others' a wide arc; each leg 4 has a shower of 7. A plain capture takes
  few of them. Each leg keeps its gold route (release point, power and direction) in `orbit/levels.js`,
  which the test flies. Motes caught on any flight count, so failure pays. Rejected: two lines per
  leg, which one flight can't both take, so gold would be out of reach (tuning, 2026-11-09). Skims (passing inside 1.35 × a body's radius, drawn
  as its atmosphere glow) flare, roar and are counted on the end card. The end card shows motes x
  of y, launches against the par (legs + 2) and skims, and a medal: bronze for finishing, silver
  for 70% of the motes within 2 × par launches, gold for 90% within par. A "one shot" badge is for
  a system with no failed flight. The system's best medal shows on its intro card. Rejected: gold
  for every mote, which no par-length route could reach, and silver by crashing (second concept
  review and spec review, 2026-11-09).
- Waves, not a ramp: in each system, leg 3 is the hardest and leg 4 is a breather, a wide easy
  whip through a shower of motes (first concept review, 2026-11-09).
- A hidden assist: assist = min(1, (failed flights on this leg − 2) / 3), from 0. The capture
  band widens, inside the ring's glow, by 15% × assist of the ring's radius, and the speed limit
  rises by 25% × assist: after 3 misses 5% and 8.3%, after 5 the full 15% and 25%. The drawn ring
  never changes, and a capture resets it (both reviews and spec review, 2026-11-09).
- Why a ring didn't catch the probe is said, by the ring: crossing its band uncaught shows "Too
  fast", "Too steep" or "Too close" there for a moment, once per pass. Rejected: a glowing light
  on the probe's nose, and a slow-motion moment, for the brake (owner, 2026-11-09: "I
  don't know why ... on its way, it will slow down and accelerate ... I also don't understand why it
  shows some glowing at the tip on the front ... I was on the orbit, but it seemed like it will never
  pick it up").
- Controls: the booster bar at the bottom sets the power: tap a point on it, or drag along it. It
  is a tall strip, like a spacecraft's control strip in the game's plain style: a label, a fill in
  zone colours (slate up to 30%, green to 70%, orange to 90% and red for the last tenth), the zones
  showing faintly along the empty strip, ticks every 10%, a bright line at the fill's edge, the
  percentage in its zone's colour, and a faint mark at the last failed flight's power; no knob
  (owner, 2026-11-09: "red is the last subdivision there, and then some orange before that, and
  green before, and maybe blue or grayish on the bottom ... instead of making it like a slider that
  looks too like a web form, like that circle, just make the fill it in the colors, and actually
  make it taller"); it dims while the probe is away from its orbit, and the power is kept
  between visits. A tap anywhere else fires the boosters, the moment it lands; in flight it does
  nothing. There is no fire button. Touches that start
  in the bottom 24 px (plus the safe area), where the phone swipes, are ignored, and so is a second
  finger. Keyboard: Space fires; left and right, or down and up, set the
  power: a tap nudges it by 2%, and a held key slides it smoothly, easing in over a third of a
  second to 90% a second (Shift: a quarter of that); R rewinds. The mouse clicks like a finger. On
  the first level, if the probe has circled 4 s untouched, one line above the bar says "Tap to fire
  the boosters" ("Click or press Space to fire the boosters" with a mouse); it goes for good once the
  boosters have fired. In landscape the field letterboxes and stays playable. A flight carries on
  through a resize in world units (first concept review and spec review, 2026-11-09; the bar, a tap
  to fire, no button and the hint: owner, 2026-11-09: "at the bottom there is a horizontal bar ...
  it should look and be clear that that's about the ... power of the motors. And you can drag it or
  just tap where you want to set the speed of the boosters ... draw inspiration from how it
  actually looks on actual space craft controls, well make it match ... the visual style of what we
  have so far", "the drag should control the ... booster power ... on the horizontal bar at the
  bottom. And the tap ... anywhere is the same as pushing the button", "don't show any button there,
  only the power bar. And then if on the first level you're doing nothing, then we kind of like show
  you a hint like hey tap to turn on the boosters").
- Look: pitch black, two layers of slowly twinkling stars, and a very faint, darkened nebula from
  Skyboxes Space that differs per system. Planets are the pack's whole planets with a slowly
  turning cloud layer from its parts and a soft shadow on the side away from one sun direction;
  a skim makes the planet's air glow for a moment. The target's ring is one thin plain circle,
  brighter while it catches; stardust is small plain dots; the probe is a tiny dart-shaped
  spacecraft, white with a cyan cockpit, pointing the way it moves, with a flame behind it for a
  moment when its boosters fire, and a thin trail in one soft colour
  (owner, 2026-11-09: "I don't know if we should make it a circle ... or something that looks like
  a spacecraft. It's gonna be tiny, but maybe there's something you can do there"). Rejected: glow bands, dashed turning rings, a parking
  circle, sparkle-shaped motes and a trail coloured by speed (owner, 2026-11-09: "we need to make it
  much more visually simpler. It looks ugly, the controls, and also clunky").
- Sound: a slow pad of low sines for the drone; a tiny soft blip as drag power rises; an airy swell
  on launch; a glassy ping per mote, climbing in pitch within a flight; a breath of air on a skim; a
  whoosh sweeping up with two bright notes on a slingshot; a warm open chord on capture; a far-off muffled thud on a crash; a tone
  falling away when lost; slow rising bells at a system's end. Each has a little echo so it hangs in
  the dark. They are synthesised by `scripts/orbit/make-sounds.py` into MP3s, and all play under the
  site-wide mute, unlocked by the first touch. Rejected: Kenney's clips (owner, 2026-11-09: "we need
  better sounds. They don't sound like the space. They sound weird").
- Leaving asks first: Orbit uses the site shell's "Leave this level? Your progress on this level
  will be lost." on Back and Escape, which came to `main` with Runes (owner, 2026-11-09: "When I hit
  back, I didn't see the message to, you're gonna lose your progress, which we just merged with
  the runes game ... bring latest main").
- Interruptible: when the page is hidden, play pauses. A flight in progress is undone: its launch
  isn't counted, its motes stay caught, and on return the probe is back at the leg's start and
  waits for a touch. A capture in progress completes instead, and an end card stays as it was
  (first concept review and spec review, 2026-11-09).
- The URL resumes: `#s1`, `#s2` and `#s3` start at that system, anything else starts System 1, a
  changed hash loads its system, and reaching a system writes its hash. The tour's end card's "Play
  again" starts System 1. Bests live in localStorage, read and written in try/catch, so blocked
  storage costs only the bests. Every image and sound loads when the page opens, so the whole tour
  plays offline after one visit (spec review, 2026-11-09).
- The name stays "Orbit", the landing tile's working title; other games share the word.
  Recorded for the owner to rename if they want (session, 2026-11-09).
- Tuning targets, pinned by `tests/orbit-levels.test.mjs`. A leg's timing window is how many
  degrees of the orbit release into a catch, at the leg's best booster power (in
  5% steps) and circling direction; where moons move it is measured at the leg's start. System 1's
  first leg has a window of at least 40°, and every leg at least 10°. In each system leg 3's window
  is narrower than leg 2's, and leg 4's the widest of legs 2–4: leg 1 brings the system's new
  thing, so it is tuned by its own target. Each leg's stored gold route captures and takes every mote of its leg,
  and arrives circling the way the next leg's starts, so a par-length gold run exists. On every leg
  the median captured flight, over 1,200 blind releases, takes at least 0.7 s, so a leg is an arc,
  not a hop. On System 3's
  first moon leg, on a plain throw, the best start time captures at least twice as often as the
  worst (session and spec review, 2026-11-09; the waves rule on legs 2–4: tuning, 2026-11-09;
  harder throughout: owner, 2026-11-09: "it's too easy"; timing windows replace aimed flicks with
  the release from the orbit: owner, 2026-11-09, above).

## Acceptance items

- **AC-1** Opening `orbit/` shows System 1 with its planets turning and the probe circling its first
  planet before any touch, the target's ring drawn, and no errors.
- **AC-2** A tap on the booster bar sets the power at that point and a drag along it moves it; a
  second finger on the bar doesn't move it, and the bar fires nothing. A tap anywhere else fires: the
  probe leaves from where it is on its orbit, along its orbit the way it was moving, at the escape
  speed at its ring plus the bar's share of 420. A touch that starts in the bottom edge strip is
  ignored.
- **AC-3** Driven through the game's own frame loop with frames of 1/60 s and of 1/120 s, the same
  release at the same leg time ends the same way at the same place.
- **AC-4** A probe in the target's band (inside the ring too), moving within 30° of along the ring
  and under the speed limit, with the steered path into the ring clear of the planet, is caught and
  steered onto the ring, turning no more than 3 radians a second; that planet
  becomes the next leg's start and the next ring appears. One over the limit, or heading in
  steeper than 30°, is not caught.
- **AC-5** Hitting a body, swinging out of the field, looping around a non-target body or flying 8 s
  is a failed flight: within 1 s the probe is back at the leg's start with the moons rewound, a ghost
  trail of the failed flight shows, and play goes on while the system has probes left. R in
  flight counts as a launch and a failed flight. A body's surface, or the target's band, never
  meets the parking ring at any leg time.
- **AC-6** Motes caught on a failed flight stay caught; a skim is counted apart from motes.
- **AC-7** There is no brake: in every system a touch or Space during flight leaves the probe's
  speed as it was, launches nothing, and the bar's label stays "Boost".
- **AC-8** The probe is drawn as a small ship pointing the way it moves (along its orbit when
  parked, along its velocity in flight), with no line ahead of it; nothing previews its path.
- **AC-9** With 0, 2, 3, 4 and 5 failed flights on a leg, the capture band grows by 0, 0, 5, 10
  and 15% of the ring's radius and the speed limit by 0, 0, 8.3, 16.7 and 25%; the drawn ring
  stays the same size; a capture resets them.
- **AC-10** The end of a system shows motes x of y, launches against the par, slingshots, skims,
  the medal by
  the rules in Decisions, and the "one shot" badge when earned; its best medal is kept in
  localStorage and shown on the system's intro card next time. With localStorage throwing, the
  game still plays and shows its cards.
- **AC-11** Systems 1–3 each bring one new thing: System 1 planets only, System 2 a big planet to
  swing around, System 3 moons; no system has a brake. Each has its own nebula and planets.
- **AC-12** The tuning targets in Decisions hold, measured with the game's own physics.
- **AC-13** Hiding the page in flight pauses play; on return the probe is at the leg's start,
  neither the launch nor a failed flight is counted, the flight's motes stay, and it waits for a touch.
  Hiding it during a capture completes the capture.
- **AC-14** Arrow keys set the power: a tap nudges it by 2%, and a one-second hold slides it more
  than 35%. Space fires, and R rewinds. A cancelled drag on the bar stops it, and nothing
  launches.
- **AC-15** `#s2` and `#s3` start at System 2 and System 3 on a fresh browser; `#s9` and `#x`
  start System 1; changing the hash loads its system.
- **AC-16** The landing page's Orbit tile is a link to `orbit/`, no longer "Coming soon", and the
  page still shows 7 tiles.
- **AC-17** After one visit that plays only System 1, Orbit opens offline at `#s3` with System 3's
  planets, nebula and sounds.
- **AC-18** Launch, capture, mote, crash, lost and slingshot each play their sound, and nothing plays
  while the site is muted.
- **AC-19** A slingshot is a swing of at least 120° round a planet other than the leg's two, within
  3 × its radius: 110°, or 130° just outside that zone, is none. Each system's stored `bold`
  release is caught with a slingshot. In the game, the swing shows as a gold arc round the planet
  as it happens, "Slingshot!" and its sound when it counts; it is banked (the top bar's count,
  shown from the first) only when the flight is caught, never on a failed one.
- **AC-20** The probe dims over the last 2 s before its time runs out.
- **AC-21** The field, back button, mute button and booster bar fit a 360×640 and a 390×844 screen
  without scrolling; the field keeps clear of the back and mute buttons and sits above the bar, and
  the bar is at least 44 px tall, above the bottom edge strip.
- **AC-22** On the first level, after the probe has circled 4 s untouched, the hint to fire shows
  above the bar; firing hides it, and it never shows again in that browser.
- **AC-23** The booster bar is at least 16 px tall, filled in zone colours (slate below 30%, green
  to 70%, orange to 90%, red for the last tenth), its percentage in its zone's colour, with no knob.
- **AC-24** Touching a planet is always a crash: the probe's body reaching a planet's surface in
  flight crashes it, and no catch steers it within its size of a surface; every catch settles
  within 3 s.
- **AC-25** A system has 10 probes, one per launch, shown just above the booster bar (not in the
  top bar) as a number counting down; after the 10th fails, or is caught with jumps still to go, an
  "Out of probes" card shows, no further launch is possible, and "Try again" restarts the system
  with 10.
- **AC-26** Crossing a ring's band uncaught shows "Too fast", "Too steep" or "Too close" by the
  ring, and no hint line.
- **AC-27** The top bar labels what it shows: the system's number and name ("System 2 ·
  Slingshot"), "Jump n of 4" for the leg, and "Stardust" with its count of the system's motes; it
  fits a 360 px wide screen.
- **AC-28** Back (and Escape) ask "Leave this level?" before leaving, as in every game; while the
  question shows, Space launches nothing (it presses Stay), and Stay keeps the game.

## Core flow

1. Tap the Orbit tile: the probe circles a planet under a pitch-black sky; the next planet's ring
   glows.
2. Set the boosters on the bar, and tap as the probe comes round: it arcs around the planets and is
   caught by the ring, or rewinds to try again.
3. Four legs make a system: a card shows the motes, launches against par and a medal; Next.
4. System 2 brings a big planet to slingshot round, System 3 moons; after System 3 the tour's end card offers to play it
   again.

## States

| State | Intro card (system name, par) | End card (motes, par, medal) | Probe |
| ----- | ----------------------------- | ---------------------------- | ----- |
| System intro | shown, fades on first touch | hidden | circling its planet |
| Setting the power (on the bar) | hidden | hidden | still circling |
| Flying | hidden | hidden | flying with its trail |
| Rewinding (after a failed flight) | hidden | hidden | back at the leg's start, ghost trail shown |
| Captured (steered in) | hidden | hidden | steered into the ring |
| System done | hidden | shown, with Next | parked on the last planet |
| Paused (page hidden, then back) | hidden | hidden | at the leg's start, waiting for a touch |
| Out of probes | hidden | hidden; the "Out of probes" card shows, with Try again | at the leg's start |

## Out of scope

- Later slices, each its own PR: System 4 Rubble (drifting rocks that break the probe), System 5
  The Heavy (a dark dense giant's long whip), then procedurally laid-out "deep tour" systems for
  replay.
- Leaderboards, accounts, level editors and a pause menu.
- Music beyond the drone, and sound settings beyond the site-wide mute.

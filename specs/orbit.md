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
  or a wide arc (risking drifting away), or take the plain capture; brake early (fall inward) or
  late (slow enough to be caught).
- How it teaches: no path preview, and one line of text only on the first level, until the first
  firing. The probe circles with a short line showing which way it would leave; a release toward a
  planet hits it, and the ghost of that flight, with its release point and power, shows why; a
  release past it swings round into the ring. The brake arrives with a
  slow-motion moment and a pulsing flame on the probe. Moons first appear where waiting for one is
  plainly right.
- Three clocks: a flight resolves every 3–8 s; a new system with a new element and new look every
  2–3 minutes; you come back for gold medals, the "one shot" badge and the par.
- What an expert does differently: brakes at the right moment, threads each leg's line of motes in
  one flight, waits for the moon, finishes within par.
- Why the tenth play differs from the first: going for gold means finding each leg's mote route (a
  close pass or a wide arc, the brake's moment, the moon's timing) within a par of launches.
- Form: short-to-long. This slice is a 6–9 minute tour (3 systems of 4 legs), interruptible at any
  leg. Later slices lengthen it.
- Orientation: portrait. One thumb: the booster bar sits at the bottom, and a tap anywhere fires,
  so the hand stays below the action; a tall field gives long arcs. Desktop shows the same field centred, with stars filling the sides.
- What a failure costs: a few seconds. The probe rewinds to the leg's start; motes already caught
  stay caught; only the par counts the extra launch.
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
- Gravity is shown by its effect alone, never ahead of the throw. The circling probe shows one thin
  line out of it along the way it is moving, its length the booster power, with a small dot at its
  end; nothing previews where the probe will go. Rejected: a preview thread of the path, which made it too easy (owner,
  2026-11-09: "It even tells you, the controls are showing you if it's gonna bend or not bend.
  It's very easy to play the game"); and gravity-reach rings, which mislead and look like an
  existing well-known game (first concept review, 2026-11-09).
- Capture is an orbit, not a net. Inside the ring's band (its radius plus 26 units, inside the ring
  too), the probe is caught only if it moves along the ring, its path within 30° of the ring's
  direction, and slower than the ring's limit relative to the target: 1.75 × the escape speed at
  the ring by default, with a per-system and per-planet value tuned in `orbit/levels.js`. A throw
  straight at a planet comes in head-on and hits it; you throw past the planet so the probe swings
  round into its orbit. A caught probe eases into the ring over 1 s, or up to 2.2 s when it arrives
  much faster than the ring's lap, so it slows in rather than swerving: its distance follows a
  smooth curve from its own speed in or out and settles in the first 70% of that time, and its
  speed round the planet blends to the ring's, carrying on the way it was flying. Rejected: catching any probe in the band and snapping it onto
  the ring in 0.4 s (owner, 2026-11-09: "if you pointed towards the planets and it's not going
  straight into it, it seems like it always catches it. It doesn't feel natural. It just goes
  almost at a right angle and then ploop, it clacks. It latches into the orbit").
- The tool is a brake, not a thrust. From System 2, one tap per flight cuts the probe's speed
  relative to the target by 35%. A late brake gets under the ring's limit; an early one drops the
  probe inward. Rejected: a +30% burn, which fought the speed limit (second concept review,
  2026-11-09).
- A flight fails when the probe hits a body, swings more than 200 units past the field's edge, loops
  once around a body other than the target or the target's parent while bound to it, or lasts
  8 s. The probe dims over the
  last 2 s before the time runs out. On a failure it rewinds to the leg's start within 1 s, and moons
  rewind with it. There are no lives and no game over. The failed flight stays as a faint ghost
  trail with its aim arrow until the next launch. R rewinds by hand; in flight it counts as a launch
  and a failed flight (first concept review and spec review, 2026-11-09).
- The leg clock (where the moons are) starts at the moment the previous leg's probe was caught (0
  for a system's first leg) and runs on, so nothing jumps when a leg begins. A rewind runs the
  clock visibly back to the leg's start. No body's surface or the target's band ever meets the
  parking ring, at any leg time (spec review, 2026-11-09).
- Motes: each leg has one line, laid along a captured route the solver found. Some legs' line is a
  close pass by a planet, others' a wide arc; each leg 4 has a shower of 7. A plain capture takes
  few of them. Each leg keeps its gold route (aim, power and brake moment) in `orbit/levels.js`,
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
- The brake is taught without text. On System 2's first leg, until the player first brakes, time
  slows to 0.4× for 0.6 s when the probe is near the ring too fast with its brake unused, and the
  probe's flame pulses (second concept review, 2026-11-09).
- Controls: the booster bar at the bottom sets the power: tap a point on it, or drag along it. It
  is a slim throttle, like a spacecraft's control strip in the game's plain style: a label, a cyan
  fill over a rail ticked every 10%, a glowing knob, the percentage, and a faint mark at the last
  failed flight's power; it dims while the probe is away from its orbit, and the power is kept
  between visits. A tap anywhere else fires the boosters, the moment it lands; in flight it brakes
  instead (from System 2; in System 1 it does nothing). There is no fire button. Touches that start
  in the bottom 24 px (plus the safe area), where the phone swipes, are ignored, and so is a second
  finger. Keyboard: Space fires (and brakes in flight); left and right, or down and up, set the
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
  brighter while it catches; stardust is small plain dots; the probe is a small white-cyan light
  with a thin trail in one soft colour. Rejected: glow bands, dashed turning rings, a parking
  circle, sparkle-shaped motes and a trail coloured by speed (owner, 2026-11-09: "we need to make it
  much more visually simpler. It looks ugly, the controls, and also clunky").
- Sound: a slow pad of low sines for the drone; a tiny soft blip as drag power rises; an airy swell
  on launch; a glassy ping per mote, climbing in pitch within a flight; a breath of air on a skim; a
  soft low pulse on a brake; a warm open chord on capture; a far-off muffled thud on a crash; a tone
  falling away when lost; slow rising bells at a system's end. Each has a little echo so it hangs in
  the dark. They are synthesised by `scripts/orbit/make-sounds.py` into MP3s, and all play under the
  site-wide mute, unlocked by the first touch. Rejected: Kenney's clips (owner, 2026-11-09: "we need
  better sounds. They don't sound like the space. They sound weird").
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
  degrees of the orbit release into a catch without the brake, at the leg's best booster power (in
  5% steps) and circling direction; where moons move it is measured at the leg's start. System 1's
  first leg has a window of at least 40°, and every leg at least 10°. In each system leg 3's window
  is narrower than leg 2's, and leg 4's the widest of legs 2–4: leg 1 brings the system's new
  thing, so it is tuned by its own target. On System 2's first leg the brake, at its best moment, at
  least doubles the window. Each leg's stored gold route captures and takes every mote of its leg,
  and arrives circling the way the next leg's starts, so a par-length gold run exists. On every leg
  the median captured flight takes at least 0.7 s, so a leg is an arc, not a hop. On System 3's
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
  release at the same leg time, with a brake tap at the same moment, ends the same way at the same
  place.
- **AC-4** A probe in the target's band (inside the ring too), moving within 30° of along the ring
  and under the speed limit, is caught and eases onto the ring with no sudden turn; that planet
  becomes the next leg's start and the next ring appears. One over the limit, or heading in
  steeper than 30°, is not caught.
- **AC-5** Hitting a body, swinging out of the field, looping around a non-target body or flying 8 s
  is a failed flight: within 1 s the probe is back at the leg's start with the moons rewound, a ghost
  trail of the failed flight shows, and play goes on with no lives lost and no game over. R in
  flight counts as a launch and a failed flight. A body's surface, or the target's band, never
  meets the parking ring at any leg time.
- **AC-6** Motes caught on a failed flight stay caught; a skim is counted apart from motes.
- **AC-7** From System 2, one tap during flight cuts the probe's speed relative to the target by
  35%, once per flight; System 1 has no brake.
- **AC-8** The circling probe shows only a short line the way it would leave, longer with more
  power; nothing previews the probe's path beyond it.
- **AC-9** With 0, 2, 3, 4 and 5 failed flights on a leg, the capture band grows by 0, 0, 5, 10
  and 15% of the ring's radius and the speed limit by 0, 0, 8.3, 16.7 and 25%; the drawn ring
  stays the same size; a capture resets them.
- **AC-10** The end of a system shows motes x of y, launches against the par, skims, the medal by
  the rules in Decisions, and the "one shot" badge when earned; its best medal is kept in
  localStorage and shown on the system's intro card next time. With localStorage throwing, the
  game still plays and shows its cards.
- **AC-11** Systems 1–3 each bring one new thing: System 1 planets only, System 2 the brake and a
  big planet to swing around, System 3 moons. Each has its own nebula and planets.
- **AC-12** The tuning targets in Decisions hold, measured with the game's own physics.
- **AC-13** Hiding the page in flight pauses play; on return the probe is at the leg's start,
  neither the launch nor a failed flight is counted, the flight's motes stay, and it waits for a touch.
  Hiding it during a capture completes the capture.
- **AC-14** Arrow keys set the power: a tap nudges it by 2%, and a one-second hold slides it more
  than 35%. Space fires and brakes, and R rewinds. A cancelled drag on the bar stops it, and nothing
  launches.
- **AC-15** `#s2` and `#s3` start at System 2 and System 3 on a fresh browser; `#s9` and `#x`
  start System 1; changing the hash loads its system.
- **AC-16** The landing page's Orbit tile is a link to `orbit/`, no longer "Coming soon", and the
  page still shows 7 tiles.
- **AC-17** After one visit that plays only System 1, Orbit opens offline at `#s3` with System 3's
  planets, nebula and sounds.
- **AC-18** Launch, capture, mote, crash, lost and brake each play their sound, and nothing plays
  while the site is muted.
- **AC-19** On System 2's first leg, until the first brake, a probe near the ring over the limit
  with its brake unused slows time to 0.4× for 0.6 s.
- **AC-20** The probe dims over the last 2 s before its time runs out.
- **AC-21** The field, back button, mute button and booster bar fit a 360×640 and a 390×844 screen
  without scrolling; the field keeps clear of the back and mute buttons and sits above the bar, and
  the bar is at least 44 px tall, above the bottom edge strip.
- **AC-22** On the first level, after the probe has circled 4 s untouched, the hint to fire shows
  above the bar; firing hides it, and it never shows again in that browser.

## Core flow

1. Tap the Orbit tile: the probe circles a planet under a pitch-black sky; the next planet's ring
   glows.
2. Set the boosters on the bar, and tap as the probe comes round: it arcs around the planets and is
   caught by the ring, or rewinds to try again.
3. Four legs make a system: a card shows the motes, launches against par and a medal; Next.
4. System 2 brings the brake, System 3 moons; after System 3 the tour's end card offers to play it
   again.

## States

| State | Intro card (system name, par) | End card (motes, par, medal) | Probe |
| ----- | ----------------------------- | ---------------------------- | ----- |
| System intro | shown, fades on first touch | hidden | circling its planet |
| Setting the power (on the bar) | hidden | hidden | still circling, its heading line growing with the power |
| Flying | hidden | hidden | flying with its trail |
| Rewinding (after a failed flight) | hidden | hidden | back at the leg's start, ghost trail shown |
| Captured (easing in) | hidden | hidden | easing into the ring |
| System done | hidden | shown, with Next | parked on the last planet |
| Paused (page hidden, then back) | hidden | hidden | at the leg's start, waiting for a touch |

## Out of scope

- Later slices, each its own PR: System 4 Rubble (drifting rocks that break the probe), System 5
  The Heavy (a dark dense giant's long whip), then procedurally laid-out "deep tour" systems for
  replay.
- Leaderboards, accounts, level editors and a pause menu.
- Music beyond the drone, and sound settings beyond the site-wide mute.

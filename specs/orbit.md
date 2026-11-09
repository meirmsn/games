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

- Verb: pull back and release, watch a readable arc bend around a planet, and the settle: the probe
  spirals into the ring with a chord.
- A typical 5-second choice: chase the leg's line of motes, a close pass by a planet (risking a crash)
  or a wide arc (risking drifting away), or take the plain capture; brake early (fall inward) or
  late (slow enough to be caught).
- How it teaches: no text. System 1's first ring is caught by any roughly aimed flick. The preview
  thread shows the first bend and is amber while the probe is too fast to be caught. The brake
  arrives with a slow-motion moment and a pulsing flame on the probe. Moons first appear where
  waiting for one is plainly right.
- Three clocks: a flight resolves every 3–8 s; a new system with a new element and new look every
  2–3 minutes; you come back for gold medals, the "one shot" badge and the par.
- What an expert does differently: brakes at the right moment, threads each leg's line of motes in
  one flight, waits for the moon, finishes within par.
- Why the tenth play differs from the first: going for gold means finding each leg's mote route (a
  close pass or a wide arc, the brake's moment, the moon's timing) within a par of launches.
- Form: short-to-long. This slice is a 6–9 minute tour (3 systems of 4 legs), interruptible at any
  leg. Later slices lengthen it.
- Orientation: portrait. One thumb; launches mostly upward, so the hand stays below the action; a
  tall field gives long arcs. Desktop shows the same field centred, with stars filling the sides.
- What a failure costs: a few seconds. The probe rewinds to the leg's start; motes already caught
  stay caught; only the par counts the extra launch.
- What stands in for save games: the URL (`#s2`, `#s3`) starts at a system; medals and bests sit in
  localStorage, and losing them costs at most a few minutes of replay.
- Riskiest technical part: tuning gravity so arcs are expressive yet controllable. It is proven
  with a headless solver (`scripts/orbit/solve.mjs`) that runs the game's own physics module over
  thousands of flicks per leg; `tests/orbit-levels.test.mjs` pins the targets.

**Different in kind:** against Reef (continuous steering; levels with lives and a game over;
eat or avoid) the verb is aim, release and watch, the structure is hand-built legs with an instant
rewind, and failure is a few-second rewind with nothing lost. Against Googly Faces (a tap toy) all
three differ.

## Decisions

- Slingshot between planets, caught by the next planet's orbit ring; rejected: "create your own
  planet" (owner: "sounds boring") and a one-tap release-from-orbit hopper, which has no aim to
  master (session, 2026-11-09).
- The launch point depends on the aim alone. The probe leaves its parking orbit at the point that
  faces the aim, with the aim's speed plus its planet's own motion. The same aim at the same moment
  gives the same flight. Physics runs at a fixed 1/240 s step, accumulated from frame time, so 60
  and 120 Hz screens agree. Rejected: launching from wherever the circling probe happens to be,
  which made retries unrepeatable (first concept review, 2026-11-09).
- Gravity is shown by its effect, not by rings. A comet-coloured thread previews the real path up
  to the first close pass of another body (at most 1.3 s), fading out. There are no gravity-reach
  rings and no dotted arc; rejected: reach rings, which mislead (inverse-square gravity reaches
  everywhere) and look like an existing well-known game (first concept review, 2026-11-09).
- Capture has a speed limit. Entering the ring's band (its radius plus 26 units) slower than the
  limit, relative to the target, catches the probe, which spirals into the ring over 0.4 s.
  Otherwise it flies through. The limit is 1.75 × the escape speed at the ring (2.4 × in System 1).
  The preview thread and the flight trail are drawn, point by point, cool while the probe's speed
  relative to the target is under the target's current limit (the assist included) and amber while
  it's over. Capture is a disk test: anywhere inside the band counts, inside the ring too (second
  concept review and spec review, 2026-11-09).
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
- Controls: drag anywhere, except touches that start in the bottom 24 px (plus the safe area),
  where the phone swipes. A drag may end there. Full power is a drag of 35% of the field's on-screen
  width, so it matches on every screen. A small dead zone applies, dragging back to the start
  cancels, and a second finger is ignored. A cancelled pointer, or a resize or rotation, cancels a
  drag without launching; a flight carries on through a resize in world units. The leg's clock
  (moons) pauses while a drag is held. A touch during flight brakes the moment it lands (from
  System 2; in System 1 it does nothing), and dragging it aims nothing. Keyboard: left and right turn the aim, up and
  down set the power (the preview shows and the clock pauses, as in a drag), Space launches and
  brakes in flight, R rewinds. The mouse drags like a finger. In landscape the field letterboxes
  and stays playable (first concept review and spec review, 2026-11-09).
- Look: pitch black, two layers of slowly twinkling stars, and a very faint, darkened nebula from
  Skyboxes Space that differs per system. Planets are the pack's whole planets with a slowly
  turning cloud layer from its parts, a soft shadow on the side away from one sun direction, and a
  thin atmosphere glow. The probe is a small white-cyan light with a fading trail (session,
  2026-11-09).
- Sound: a quiet low drone; a stepped tick as drag power rises; a whoosh on launch; a chime per mote,
  climbing in pitch within a flight; a roar on a skim; a thump on a brake; a chord on capture; a
  muffled thud on a crash; a falling blip when lost; a jingle at a system's end. All play under the
  site-wide mute and are unlocked by the first touch. They are MP3 files from Kenney's audio packs
  (session, 2026-11-09).
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
- Tuning targets, pinned by `tests/orbit-levels.test.mjs`, measured over roughly aimed flicks
  (within 35° of the straight line to the target, any power above a quarter) and, where moons
  move, over leg start times across a full moon period; where there's a brake, a flick counts if
  braking at some moment catches it. System 1's first leg captures at least 60% at leg time 0. Every
  leg can be captured. In each system leg 3 captures less often than leg 2, and leg 4 most often of
  legs 2–4: leg 1 brings the system's new thing, so it is tuned by its own target. Each leg's
  stored gold route captures and takes every mote of its leg, so a par-length gold run exists.
  On every leg the median captured flight takes 0.7–2.5 s, so a leg is an arc, not a hop. System 2's first leg captures under 20%
  without the brake and at least 40% with it. On System 3's first moon leg the best start time
  captures at least twice as often as the worst (session and spec review, 2026-11-09).

## Acceptance items

- **AC-1** Opening `orbit/` shows System 1 with its planets turning and the probe circling its first
  planet before any touch, the target's ring drawn, and no errors.
- **AC-2** Dragging back and releasing launches the probe opposite the drag, from the point on its
  parking orbit that faces the aim, at a speed set by the drag's length as a share of the field's
  on-screen width. A drag inside the dead zone, or dragged back to its start, launches nothing; a
  touch that starts in the bottom edge strip is ignored; a second finger doesn't change the aim.
- **AC-3** Driven through the game's own frame loop with frames of 1/60 s and of 1/120 s, the same
  aim at the same leg time, with a brake tap at the same moment, ends the same way at the same
  place.
- **AC-4** A probe entering the target's band (inside the ring too) under the speed limit is caught
  and parks on the ring;
  that planet becomes the next leg's start and the next ring appears. One entering over the limit
  flies through.
- **AC-5** Hitting a body, swinging out of the field, looping around a non-target body or flying 8 s
  is a failed flight: within 1 s the probe is back at the leg's start with the moons rewound, a ghost
  trail of the failed flight shows, and play goes on with no lives lost and no game over. R in
  flight counts as a launch and a failed flight. A body's surface, or the target's band, never
  meets the parking ring at any leg time.
- **AC-6** Motes caught on a failed flight stay caught; a skim is counted apart from motes.
- **AC-7** From System 2, one tap during flight cuts the probe's speed relative to the target by
  35%, once per flight; System 1 has no brake.
- **AC-8** The preview thread follows the real path (its points lie on the flight that launch
  makes), stops by 1.3 s, and each point is amber when the probe's speed relative to the target is
  over the current limit and cool when under.
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
- **AC-14** Arrow keys aim and set power, Space launches and brakes, and R rewinds. A cancelled
  pointer or a resize during a drag launches nothing.
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
- **AC-21** The field, back button and mute button fit a 360×640 and a 390×844 screen without
  scrolling, and the field keeps clear of the back and mute buttons.

## Core flow

1. Tap the Orbit tile: the probe circles a planet under a pitch-black sky; the next planet's ring
   glows.
2. Drag back and release: the probe arcs around the planets and is caught by the ring, or rewinds
   to try again.
3. Four legs make a system: a card shows the motes, launches against par and a medal; Next.
4. System 2 brings the brake, System 3 moons; after System 3 the tour's end card offers to play it
   again.

## States

| State | Intro card (system name, par) | End card (motes, par, medal) | Probe |
| ----- | ----------------------------- | ---------------------------- | ----- |
| System intro | shown, fades on first touch | hidden | circling its planet |
| Aiming (a drag held) | hidden | hidden | at the aim's launch point, clock paused |
| Flying | hidden | hidden | flying with its trail |
| Rewinding (after a failed flight) | hidden | hidden | back at the leg's start, ghost trail shown |
| Captured (spiral in) | hidden | hidden | spiralling into the ring |
| System done | hidden | shown, with Next | parked on the last planet |
| Paused (page hidden, then back) | hidden | hidden | at the leg's start, waiting for a touch |

## Out of scope

- Later slices, each its own PR: System 4 Rubble (drifting rocks that break the probe), System 5
  The Heavy (a dark dense giant's long whip), then procedurally laid-out "deep tour" systems for
  replay.
- Leaderboards, accounts, level editors and a pause menu.
- Music beyond the drone, and sound settings beyond the site-wide mute.

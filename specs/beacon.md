# Beacon: swing the lighthouse beam and bring the ships home through the storm

**Go:** "Given the assets we have … come up with 20 different directions of games that follow the guidelines … Then use an adversarial review to find which one could be made so that it follows our game guidelines and it's fun. Then pick that one and do it" 2026-11-10

## Intent

PR #17 began as High Seas, an isometric sailing game: sail a dinghy by the wind between islands,
ferry passengers and earn the galleon (the owner's seed: "an isometric game with ships and boats on
the sea", 2026-11-09). The owner played its preview twice and turned it down:

- 2026-11-09: "I have no idea what I'm supposed to do on this game … it feels rather empty. I don't
  know why. Feels like a lonely place."
- After a rework (people waiting on jetties, other boats, a progress icon): "Okay, I still don't
  understand what the point of the game is. It feels simpler than before, but also feels
  pointless."
- 2026-11-10: "Given the assets we have … analyze the assets, see everything there is, and … come
  up with 20 different directions of games that follow the guidelines … 20 different directions,
  period, as different as possible. Then use an adversarial review to find which one could be made
  so that it follows our game guidelines and it's fun. Then pick that one and do it … be aware of
  PR17 to see if it's reset to 0 or if something on it can be leveraged."

Twenty directions were written from the whole Kenney catalogue (every 2D, UI, icon and audio pack's
preview, on contact sheets) and attacked by two independent read-only reviews against
`discussion/game-guidelines.md`. The pick is **Beacon**, below; the Decisions say why and what the
reviews changed.

The surface is customer-facing: a new game page, `beacon/`, which replaces `high-seas/` on this
branch (High Seas never merged), and the landing page's High Seas tile becoming the playable Beacon
tile. The game has its own night-sea palette, as Reef has its own; the landing page keeps the
site's tokens. The isometric module, `shared/iso.js`, stays: Little Town, the city builder, is
waiting for it, and Beacon draws through it.

**Hook:** a storm night, ships coming in from the dark: swing the lighthouse beam, and every ship in
the light turns for home; let go too soon and the current takes it onto the rocks.

### Concept check (the guidelines' questions)

- **Verb:** hold and swing a beam. The lamp sweeps the bay on its own, like a lighthouse; drag
  anywhere, sideways, and you hold the beam and swing it; every ship in the beam turns towards the
  lamp, which is the way home. Let go and the lamp sweeps on. Ships out of the beam are slowly turned
  and carried by the current, drawn as streaks on the water.
- **A typical 5-second choice:** hold the beam on the slow freighter until it's lined up with the
  mouth, or flick across to the cutter that's about to run onto the reef? Light the lifeboat whose
  lantern is dimming, or the ship that's just come in?
- **How it teaches:** the night opens with the beam already on the first freighter; it steams into
  the harbour and a window in the town lights. A second ship is already drifting towards the rocks
  in the dark; a ghost finger shows the sideways drag once, until the first touch. Each new ship
  type or set piece arrives alone, with nothing else new on the sea. No written tips.
- **Three clocks:** seconds: a ship turns, comes home, scrapes past a rock or wrecks. Minutes: a new
  element on a rhythm, not a bigger number: the fast cutter, fog that shortens the beam, a gale that
  shoves everything sideways, a crowded wave before dawn. Back: five coasts, each with its own rocks
  and current, a best per coast in stars and sailors home, and the next coast opening with a star.
- **What an expert does differently:** lets go early, so the ship coasts in on its own while the
  beam works another; lines two ships up in one beam; steers round a rock by lighting late instead
  of straight through it; keeps lifeboats lit only in bursts. It shows in the result: every window
  lit, no ship lost, three stars.
- **Why the tenth play differs:** each coast has its own rocks, bay and current, and each night's
  arrival order is seeded, so the same coast plays differently; a better player chases the third
  star.
- **Form:** short-form. A night is 3½ minutes to dawn: a whole run in a phone session, with a clear
  end and release (dawn), and the next coast after it.
- **Orientation:** portrait. The lighthouse and the harbour are at the bottom, the ships come in at
  the top, so the long axis is the time a ship takes to come in. On a landscape screen the same
  field is shown at its full height with sea on both sides.
- **What a failure costs:** a wreck is never the end: its crew take to a lifeboat that rows only
  while lit, and its lantern dims while it's in the dark; if the lantern goes out, those sailors'
  windows stay dark. A bad night still reaches dawn and still shows the sailors who came home. The
  worst a loss costs is a 3½ minute night.
- **Save games:** none needed. The best per coast (stars and sailors home) and the coasts you've
  opened are kept in localStorage; the address holds the coast (`#coast=3`), so a link opens it.
- **Riskiest technical part:** that lighting then letting go against the current feels good and
  controllable on a phone. Proved first: a greybox of the beam, the current and two ships, played
  for a minute before any art. Second: the night drawn at 60 fps with an additive beam over a dark
  sea, on a phone-sized canvas at a capped pixel ratio.

## Decisions

- Beacon replaces High Seas on this PR, from the owner's process of 2026-11-10 (quoted on the Go
  line). Of the twenty directions, the first review shortlisted Beacon, High Tide (sea walls against
  a rising flood) and Smugglers' Fog (stealth past searchlights) and picked Beacon: cheapest to
  build, its point readable in seconds. High Tide was too big and too fiddly on a phone; Smugglers'
  Fog was lane timing in the dark, too close to Gotta Go!. Rejected as written: Harbour Lines (too
  close to a well-known line-drawing traffic game), Ferry Riddles (Runes' structure), Deep Line
  (Reef again), Floating Greens (a third slingshot), and others near Little Town, Crumble or Trundle
  (Claude, two independent reviews, 2026-11-10).
- Different in kind from every game on the site and in flight. Its verb is aiming a ray that
  attracts, and letting go: no object on the sea is ever dragged. Its structure is one continuous
  night to dawn on a coast, with no levels to retry. Failure is a lifeboat to save and sailors who
  don't come home, never a life lost or a run ended. Shoo! (moving a scarer that repels birds,
  75 s hours ended by a full hold) is the nearest; it differs in verb, structure and failure.
  Rejected: three wrecks ending the night, which copied Shoo!'s strikes (second review,
  2026-11-10).
- The point is on screen from the first second, with no text: the lighthouse, the harbour and the
  town at the bottom, with one dark window for every sailor out tonight; ships with lanterns coming
  in at the top; a beam already on the first ship. A ship home lights its crew's windows. Rejected:
  a score counter as the goal (it's a small figure beside the windows, not the point).
- The lamp stands on the lighthouse pier just inside the harbour mouth, in line with it, so a ship
  that steers for the light goes through the mouth. Rejected: the lamp on a headland beside the
  harbour, where steering for the light runs onto the headland (second review, 2026-11-10).
- The current makes letting go a timing skill: a ship out of the beam keeps its engine speed, but
  its heading is turned towards the current's direction at the coast's bend rate (4.5° to 7° a
  second) and it's carried by the current (1 to 1.8 sea units a second, against a freighter's 12),
  so a ship let go early drifts off, and one let go well lined up coasts in. A current always runs
  across the bay, never out through the top. Without it, one touch would bring every ship home
  (second review, 2026-11-10).
- The lamp turns on its own: while nobody holds it, the beam sweeps back and forth across the bay at
  45° a second, starting 0.6 s after it's let go; a ship it passes turns only a little, so a beam
  left alone saves few ships. Found by playing the greybox: a beam that stayed where it was left
  brought 70–85% of the sailors home on the first two coasts with no input at all, because the cone
  is wide at the top of the bay. With the sweep, no input brings home 20–40% (Claude, 2026-11-10).
  At the start of a night it holds on the first freighter until that one is home.
- The beam is narrow (an 8° half-angle) and swings no faster than 120° a second; a sideways drag of
  1 CSS px (finger or mouse) turns the beam's target by 0.4°, and the beam follows the target at
  that cap. The arrow keys swing it at 90° a second. The finger never covers the beam: the drag is
  relative and works anywhere on the screen. A second finger is ignored. Angles are measured on the
  sea's own plane, not on the squashed screen.
- The beam only reaches as low as the harbour mouth lets a ship through: its centre stays at least
  its half-angle inside the angles from which a ship steering for the lamp clears the breakwater
  (about 30° to 150° above the breakwater's line, a little narrower on coasts with a narrower mouth).
  The lamp stands on the lighthouse pier just inside the mouth, so those angles are wide. So any ship
  in the beam, heading roughly for the lamp, with no rock on its line, comes home; a rock on the line
  is the player's to steer round (lighting late, or letting the current carry the ship past it
  first), and it always shows its surf. Rejected: steering lit ships round rocks for the player
  (spec review, 2026-11-10).
- Ships, each with its own silhouette and lantern colour: the freighter (Kenney's container ship),
  slow, turning 25° a second, crew 3; the cutter (the red motorboat), fast, turning 90° a second,
  crew 2; and the lifeboat (the rowboat), which rows towards the lamp only while lit and otherwise
  drifts with the current, and slides along rocks instead of wrecking. A ship in the beam is drawn
  with a white outline.
- Wrecks: a ship that touches a rock's surf ring, the bay's cliffs or the breakwater outside the
  mouth wrecks. It lists and its lantern goes out, a crash and a splash sound, and its crew put off
  in a lifeboat beside it, clear of the rock. A lifeboat's lantern dims while it's out of the beam
  and is out after 12 s of dark in all (lit time doesn't count); then it's lost, a low bell tolls,
  and its crew's windows stay dark for the night.
- A ship (or lifeboat) is home when it crosses the harbour mouth; it glides to a mooring inside, a
  bell rings and its crew's windows light one by one.
- Ships never wreck each other: two that touch are eased apart, lifeboats too. Nothing leaves the
  screen: cliffs bound both sides of every bay (a ship wrecks on them, a lifeboat slides along
  them), and the top edge holds a lifeboat back.
- Fairness: everything happens on one fixed screen, with no scrolling, so nothing wrecks out of
  sight. Each arrival shows its lantern at the top edge, with a horn, 2 s before it comes in. No ship
  comes in on a heading that, left alone, reaches a rock or the cliffs within 4 s (8 s in fog, when the
  beam can't reach the top of the bay). Left alone from the start, no ship wrecks before 25 s. Rocks always show
  their white surf, with or without the beam. Shake and the gale's flash last no more than 150 ms
  and never dim the ships.
- A night: 210 s to dawn, the sky at the top brightening as it goes, and 25 ships coming in (68
  sailors). The sea is never empty: the
  first freighter starts in the beam close to the mouth (about 64 sea units out, so home in about
  6 s), and there are always one to four ships on the sea, counting lifeboats and lanterns about to
  come in (five during the last wave).
  Set pieces come on a rhythm, each after a quieter spell: the first cutter at about 45 s; fog at
  about 90 s, which shortens the beam's reach to half the field for 30 s (lanterns stay visible);
  the gale at about 150 s, telegraphed by a line of whitecaps sweeping in from one side for 2 s, then
  a sideways shove for 6 s on every ship, lit or not; a crowded last wave at 172–188 s, five ships
  coming in 3 s apart against about 7 s the rest of the night. Rain falls through the night (drawn
  only). Ships stop coming 20 s before dawn
  (190 s). Dawn comes at 210 s if the sea is empty by then, or as soon as the last ship is home or
  lost, and at 240 s at the latest: anyone still at sea then hasn't come home, and their windows stay
  dark.
- Dawn: a card with the night's stars and sailors home (31 of 40), any close calls as a separate
  line (+4), the best for that coast, and "Next coast" (hidden on the fifth) and "Again". Stars: one for 60% of the sailors home, two for 85%, three for all of
  them home with no ship wrecked. A bad night still shows its sailors home and any star it earned.
- Five coasts, hand-made, not generated: each a bay with its own cliffs, rocks and current (its
  direction and strength). The first coast has the gentlest current and the widest mouth. Coasts are
  data in `sim.js`, tuned without touching code. A coast opens once the one before it earns a star;
  the first is always open. Each coast's arrival order comes from a seed (the coast and the night's
  number, which counts that coast's plays in localStorage), so the same coast differs night to night;
  tests drive an autopilot that brings home at least 80% on average on every coast, against under
  45% with no input. Rejected: a generated
  archipelago (High Seas' `world.js`), which can't promise a fair bay as a hand-made one can (second
  review, 2026-11-10).
- Optional risk: each coast names one gap, between two rocks, on the short way home; a ship that
  threads it and comes home scores a close-call chime and its crew again as close calls, a separate
  figure on the dawn card (not in the windows, the "N of M" or the stars). Rejected: bonuses that change the stars, which would make
  the gap a must (Claude, 2026-11-10).
- A hidden assist: after a night on a coast that ends with no star, that coast's beam is 1° wider
  and its current 10% slower, however the coast is next opened (Again, Next, the address or a
  reload), until it earns a star. Kept per coast in localStorage; never shown; it never earns three
  stars by itself (three stars need every sailor home).
- What PR #17 keeps: `shared/iso.js` unchanged (Little Town needs it, and Beacon draws through it:
  `createIso`'s projection and `iso.facing` pick each ship's sprite heading, as `(facing + 3) % 8`
  for Kenney's frames, and `sortByDepth` orders the drawing); `tests/iso.test.mjs` with its titles
  renamed from "high-seas AC-1/2/3" to "beacon AC-1/2/3"; the Kenney sprite atlas and sounds that
  `scripts/high-seas/build-assets.py` made (the container ship, motorboat and rowboat at eight
  headings, rocks, trees, moored boats at two), moved to `beacon/` with the script as
  `scripts/beacon/build-assets.py`, which adds a ship's horn and a low bell synthesised with ffmpeg;
  the tile script's approach and the timed-playtest autopilot's approach. It drops the sailing game:
  `high-seas/` (`world.js`, `boat.js`, `people.js`, `game.js` and the rest), `tests/high-seas.test.mjs`,
  `scripts/high-seas/`, and `specs/high-seas.md`, replaced by this spec; `tests/site.test.mjs`'s
  High Seas tile test becomes Beacon's (Claude, 2026-11-10).
- The name and folder become Beacon and `beacon/`: the game is still at sea, but "High Seas" names
  a voyage and Beacon names the point. The landing tile's image becomes `assets/tiles/beacon.png`,
  so `sw.js`'s SHELL list and VERSION change by that one file (Claude, 2026-11-10).
- The simulation is a pure module (`beacon/sim.js`: `createNight`, `step(state, dt, input)`) with
  no DOM, run on delta time in fixed 1/120 s steps, so it is tested through
  `window.__beacon` and plays the same at 60 and 120 Hz.
- Sound, through the shared sound module and the site-wide mute: the sea's ambience (High Seas'
  synthesised brown-noise waves), a horn when a ship is about to come in (new, synthesised), a bell
  when one is home (High Seas' bell), a crash on a wreck (its bump and splash), a low bell when a
  lifeboat is lost (new, synthesised), a whoosh for the gale (its gust) and a jingle at dawn (its
  fanfare). Sounds are MP3, for Safari.
- Tuning targets, each a knob in one table in `sim.js`: the first ship home (the demo freighter) in
  about 6 s and a ship the player brought home by about 35 s (a freighter takes about 25 s to cross
  the bay; the timed playtest measured 33 s); no wreck possible before 25 s; the first
  cutter by 45 s; a beginner's first night on the first coast around 60% (one star) and an
  autopilot's 80% or more on average on every coast (it played 82–96% while tuning), while no input
  brings home under 45%. Measured by `scripts/beacon/playtest.mjs`, an autopilot playing whole
  nights at 390×844 on every coast.
- Interruptible: hiding the page pauses the night, the current included; it resumes only on a tap,
  and that tap doesn't swing the beam, so play never resumes into a sudden change.
- The address: `#coast=N` (1 to 5) opens coast N if it's open; anything else (0, 6, a word, a
  locked coast) opens coast 1, without an error. The address is rewritten to the coast actually
  opened; a change to it during a night waits for the start card.
- The game exposes `window.__beacon` (its state, a `start({ coast, night })`, and a `step(dt)` that
  advances the simulation without drawing), as High Seas exposed `window.__seas`, so tests can set up a moment and check
  the rules.
- Built in one PR, with the later ideas in Out of scope (owner's batch process, 2026-11-09).
- An independent adversarial review of this spec (2026-11-10) found the last wave overlapping the
  stop time, lit ships that could run onto the breakwater, undefined night ends, edges, URL cases
  and assist, and a gap bonus that broke "N of M"; the decisions above are its fixes.

## Acceptance items

- **AC-1** `shared/iso.js` projects tiles to a 2:1 diamond and back, and a point anywhere in a
  tile picks that tile — `tests/iso.test.mjs`.
- **AC-2** `shared/iso.js` sorts drawables back to front, so a boat behind an island tile draws
  before it and in front draws after it — `tests/iso.test.mjs`.
- **AC-3** `shared/iso.js`'s camera maps view to world and back, zooms about a point, pans, clamps
  and lists the tiles in view; its gestures give one finger to the game, a short press as a tap, two
  fingers to pinch-zoom (cancelling the first finger's gesture) and the wheel to zoom —
  `tests/iso.test.mjs`.
- **AC-4** The page opens on a moving night sea behind a start card (two frames differ, the
  simulation's clock advances), with no errors; Start begins the first coast's night with the beam
  on a freighter, which comes home within 8 s with no input and lights its crew's windows; left
  alone, no ship on any coast wrecks before 25 s —
  `tests/beacon.test.mjs`.
- **AC-5** While nobody holds it, the beam sweeps the bay on its own at 45° a second. A sideways
  drag, by finger or mouse, swings the beam by 0.4° a CSS px, no faster than
  120° a second, and only as low as the mouth lets a ship through; the arrow keys swing it; a second
  finger is ignored —
  `tests/beacon.test.mjs`.
- **AC-6** A ship in the beam turns towards the lamp at its own turn rate (freighter 25° a second,
  cutter 90°); out of the beam the current turns it and carries it; a ship anywhere in the beam's
  range, heading within 30° of the lamp, with no rock on its line, comes home through the mouth;
  ships that touch are eased apart and neither wrecks — `tests/beacon.test.mjs`.
- **AC-7** A ship that touches a rock's surf ring, the cliffs or the breakwater wrecks and puts off
  a lifeboat clear of the rock with its crew; the lifeboat rows only while lit, slides along rocks,
  and is lost after 12 s of dark in all, its crew's windows staying dark; a lifeboat never leaves the
  screen — `tests/beacon.test.mjs`.
- **AC-8** A ship or lifeboat crossing the mouth is home and lights as many windows as its crew;
  the town shows one window for every sailor of the night from the start —
  `tests/beacon.test.mjs`.
- **AC-9** Each arrival's lantern shows at the top edge 2 s before it comes in; no ship comes in on
  a heading that, left alone, reaches a rock or the cliffs within 4 s (8 s in fog); until 190 s the
  sea holds one to four ships, counting lifeboats and lanterns about to come in (five in the last
  wave) — `tests/beacon.test.mjs`.
- **AC-10** The set pieces come in order: a cutter by 45 s, fog that halves the beam's reach for
  30 s, a gale whose whitecaps show 2 s before its 6 s shove of every ship, and a last wave of five ships
  between 172 and 190 s; no ship comes in after 190 s —
  `tests/beacon.test.mjs`.
- **AC-11** Dawn comes at 210 s if the sea is empty, otherwise once the last ship is home or lost,
  and at 240 s at the latest, with anyone still at sea not home; its card shows the stars (60%, 85%,
  all home with no wreck), sailors home and the coast's best, with Again, and Next coast unless it's
  the fifth; a star opens the next coast; the best and the opened coasts persist across a reload — `tests/beacon.test.mjs`.
- **AC-12** The five coasts each give the same night for the same seed; an autopilot brings home at
  least 80% of the sailors on average over two nights on every coast, and no input under 45% — `tests/beacon.test.mjs`.
- **AC-13** A ship home through its coast's gap adds its crew to the close calls, not to the
  windows, the sailors home or the stars; after a night on a coast with no star, that coast's beam is
  1° wider and its current 10% slower on any next opening, a reload included, until it earns a star
  — `tests/beacon.test.mjs`.
- **AC-14** `#coast=N` opens coast N if it's open, and coast 1 for anything else (0, 6, a word, a
  locked coast), without an error, and the address is rewritten to the coast opened —
  `tests/beacon.test.mjs`.
- **AC-15** Hiding the page pauses the night; it resumes only after a tap, which doesn't move the
  beam, and nothing moves until then — `tests/beacon.test.mjs`.
- **AC-16** Until the first touch, a ghost finger shows the sideways drag; after the first touch it
  doesn't show again, after a reload too — `tests/beacon.test.mjs`.
- **AC-17** A horn, a ship home, a wreck and a lost lifeboat each play their sound, and none plays
  while the site is muted — `tests/beacon.test.mjs`.
- **AC-18** On a 390×844 phone the page doesn't scroll, every button is at least 44 px, the canvas
  is drawn at no more than 2× its CSS size, the whole field (the top edge to the harbour) is in view
  in portrait and at 844×390, and a ship covers the same distance at 60 and 120 frames a second —
  `tests/beacon.test.mjs`.
- **AC-19** Beacon plays offline once it has been played — `tests/beacon.test.mjs`.
- **AC-20** The landing page's Beacon tile is playable at `beacon/` and the page keeps the tiles
  `main` has — `tests/site.test.mjs`.
- **AC-21** The tuning targets hold in a timed playtest at 390×844: the first ship home in about
  6 s, a player-made rescue by about 35 s, the first cutter by 45 s, and the autopilot at 80%
  or more on average on every coast — verified by review: `scripts/beacon/playtest.mjs`'s
  times and figures in the PR.

## Core flow

1. Tap the Beacon tile: the storm sea moves behind a small start card. Tap Light the lamp.
2. The beam is on the first freighter; it comes home and windows light in the town. The lamp starts
   to sweep; drag sideways to hold it on the next ship, and let go when it's lined up.
3. Juggle the ships, the cutters and the lifeboats through fog, a gale and the last wave.
4. At dawn, see the stars and the sailors home; go on to the next coast or try again.

## States

| State                         | Start card | Dawn card | Pause card | Ghost finger         |
| ----------------------------- | ---------- | --------- | ---------- | -------------------- |
| Start (the sea moves behind)  | shown      | hidden    | hidden     | hidden               |
| Night                         | hidden     | hidden    | hidden     | shown until 1st touch |
| Paused (the page was hidden)  | hidden     | hidden    | shown      | hidden               |
| Dawn                          | hidden     | shown     | hidden     | hidden               |

## Out of scope

- More ship types (the tug that tows, the galleon that needs the beam held twice as long), the tide
  baring a sandbar, a second harbour mouth: later, each its own change.
- A generated coast, an endless mode, leaderboards, music beyond the ambience, and settings beyond
  the site-wide mute.
- Any change to `shared/iso.js`: Little Town takes it as it is.

# Island Hop: errands across an isometric archipelago, by boat, on foot and by car

**Go:** the owner, in the session's chat on 2026-11-10: "go"

## Intent

The owner, in the session's chat on 2026-11-10, after Beacon (a lighthouse game) was built on this
PR: "We have to go back to isometric. We have to use all the, or most of the, I would say all the
boats in the isometric water graph. And you should use the nature, buildings, and roads for the
islands. There is also isometric Buildings and roads. I think the game concept should involve
sailing from island to island, and then you can walk. Also, on the little guy will come out when
you dock, and then you can walk him to a car, and then you can also drive a car in the island. And
then on the beginning, you're given a mission that will span, you figure out to which islands you
have to go, in which order, and which buildings within them. And using the car, move faster than
walking, so maybe make some of the islands a little bit larger. And with multiple, maybe 2 or 3
ports, so you have to be strategic on which port to park. And perhaps you have to do all the
mission in the least amount of time, or you're against a timer."

Their answers to the questions that followed (2026-11-10): attach the private asset repo ("Yes,
attach it"); the clock "Count up, beat par"; "All in one PR"; and Beacon: "Replace it".

The surface is customer-facing: a new game page, `island-hop/`, replacing `beacon/` on this branch
(neither Beacon nor High Seas reached `main`), and the landing page's tile becoming Island Hop. The
game has its own palette, from the Kenney art; the landing page keeps the site's tokens.
`shared/iso.js` stays, unchanged, and the game draws through it (Little Town is waiting for it).

**Hook:** a short list of errands across a small archipelago, against the clock: sail, step ashore,
grab a car, drive to the door, and back to the boat. The route is yours.

### Concept check (the guidelines' questions)

- **Verb:** one thumb drives whatever you are: a boat with momentum, a little person, a car on the
  roads. Drag anywhere and a stick appears under the thumb (relative drag); the arrow keys and WASD
  do the same.
- **A typical 5-second choice:** dock at the berth nearest the door, or the one by a parked car 8
  tiles further? Walk 4 tiles to the car or straight to the door? Which stop next?
- **How it teaches:** the mission card is icons, not words (a cake, then a party hat over the town
  hall). Each open stop has a tall coloured beam of light over its building, visible from anywhere,
  and an arrow at the screen's edge when it's off screen. A 3-second fly-over shows every stop before
  the clock starts. Mission 1 is one island and one door: sail, dock, walk in. Each next mission
  adds one thing. No written tips.
- **Three clocks:** seconds: a dock, a car door, a stop ticked with a chime. Minutes: each mission adds
  a car, a second island, a pickup in order, a second boat, then traffic. Back: a best time and a
  medal per mission, splits against the best, and a ghost of your best run.
- **What an expert does differently:** plans the order before moving, docks where the car is, leaves
  cars where the next leg needs them, takes the rowboat through the lagoon, finishes under gold. After
  each run the gold route is drawn over theirs, so the next run is a better plan, not faster thumbs.
- **Why the tenth play differs:** six missions over one map with many routes; the ghost and splits
  push toward gold.
- **Form:** short-form, missions of about half a minute to 3½ minutes. **Orientation:** portrait (the archipelago
  runs top to bottom on screen); landscape on desktop works the same.
- **What a failure costs:** nothing but time. Rocks and traffic bump you and cost about a second. A
  mission can be restarted any time.
- **Save games:** none: the best time, medal and ghost per mission in localStorage, the mission in
  the address (`#m=3`).
- **Riskiest technical part:** the island art from Kenney's tiles (terrain, roads, buildings) with a
  person and a car moving among tall buildings, depth-sorted and readable at 60 fps on a phone. Proved
  first: one island with roads and buildings, the person walking behind a building, before the rest.

## Decisions

- Island Hop replaces Beacon on this PR (owner, 2026-11-10: "Replace it"). Everything of Beacon goes:
  `beacon/`, `tests/beacon.test.mjs`, `scripts/beacon/` (build-assets, make-tile, playtest),
  `assets/tiles/beacon.png`, and its lines in `index.html`, `sw.js`, `README.md` and
  `tests/site.test.mjs` ("beacon AC-20" becomes "island-hop AC-18"). Beacon's findings in
  `FINDINGS.md` (F-19 to F-21) are deleted: the files they name are gone. `shared/iso.js` stays
  unchanged; `tests/iso.test.mjs` changes only its titles, to "island-hop AC-1/2/3", and its header
  comment, which named Beacon (owner, 2026-11-10: "and yes remove the old versions fo the game").
- Assets, all Kenney CC0 from `meirmsn/games-private`, built by `scripts/island-hop/build-assets.py`
  into one atlas and MP3 sounds, each pack with its own scale factor so they share one grid:
  - Isometric Tiles Base: water, grass and sand blocks, roads (straight, corner, T, crossroads, dead
    end) and bridges, at their own size (132 px tiles, 2:1). Isometric Tiles Buildings: the
    buildings. Isometric Tiles City: a few plaza and car-park pieces. Isometric Tiles Vehicles: the
    cars, at their 8 flat headings (the ramp frames are unused), scaled to about half a tile long.
  - Isometric Watercraft: all 29 (28 boats and the buoy) at 8 headings, scaled so the motorboat spans
    about 1.5 tiles: three you sail, and every other one drawn in the world, moored in a harbour or
    sailing as traffic, the buoys marking channels (owner: "I would say all the boats").
  - Isometric Nature: trees and rocks, scaled from its 180 px tile to 132. Jetties are drawn in code
    from planks (no pack has one); the person is drawn in code, about a third of a tile tall.
  - Rejected: Isometric Modular Roads and Buildings (plain cream blocks to assemble, no cars), and the
    Vector Roads and Buildings (flat art that clashes with the rendered boats) (Claude, 2026-11-10).
- The projection is `createIso({ tileW: 132, tileH: 66 })`, matching the tiles' art; land blocks stand
  16 px above the water. The game has its own pointer handler: one finger is the stick, a second
  finger is ignored, and there is no pinch or wheel zoom (`attachGestures` is not used).
- A drag that starts in the phone's edge strips doesn't steer: the stick ignores it through
  `shared/safe-zone.js`. This isn't a new choice for Island Hop: `main`'s game guidelines
  (`discussion/game-guidelines.md`, Phone hygiene) require it of every game: "No drag or swipe
  starts in the left-edge or top strip. Games use `shared/safe-zone.js` to ignore such starts", and a
  control that takes "any swipe down sits clear of the bottom strip". The stick takes a swipe in any
  direction, so it ignores starts in the bottom strip too. Recorded when `main` came in, so the owner
  can check it (Claude, 2026-11-11). The owner agreed for Island Hop (2026-11-11: "ok", to "OK the
  edge-strip rule for Island Hop").
- The map is hand-made, not generated: a 60 × 60 grid as text rows in `island-hop/map.js`, the
  islands staggered down the grid's diagonal so the archipelago runs top to bottom on a portrait
  screen. Five islands: two large (about 16 × 12, with a road loop, 3 berths and 2–3 parked cars
  each), three small (about 6 × 6, one berth each, footpaths only); sea gaps of 8–14 tiles; a shallow
  lagoon only the rowboat can cross, and a low footbridge only it passes under. On the large islands
  the berth nearest a door has no car and the berth by a car is 6–10 tiles further. Most missions put
  stops on the large islands, so where to dock is a real choice. Rejected: a generated archipelago,
  which can't promise those trade-offs (adversarial review, 2026-11-10).
- Land is drawn as the pack's raised grass and sand blocks over its water, so the coast shows as low
  cliffs with no edge pieces; roads, buildings and car parks sit on land tiles. Water and cliffs are
  walls to the person, who slides along them; a jetty's end is a wall too.
- Movement, one config object (`island-hop/rules.js`), speeds in tiles a second: walking 1.6; car 5,
  on the road network only, following its centre line and taking the branch the stick points at
  junctions, passing through parked cars; rowboat 2.2 (turning 150° a second), motorboat 3.5 (120°),
  speedboat 5.5 (72°). Boats turn toward the stick at their rate and the stick's length is the
  throttle; with the stick pointing more than 120° away from the bow, a boat turns on the spot, so it
  never wedges against a coast. The person moves in 8 directions. Rejected: free driving off the
  roads, fiddly on a phone (adversarial review, 2026-11-10).
- Transitions are automatic and take about 0.3 s, with no buttons:
  - A boat heading toward a free berth, within 1.5 tiles and under half its top speed, is pulled in and
    docks; the person steps onto the jetty. Sailing past at speed doesn't dock. Moored decoration boats
    never sit on berths; a berth holds one of your boats, and one holding a boat can't be docked at
    (marinas have two berths).
  - Walking onto a berth holding one of your boats boards it. Your boats each stay where you left them,
    so leaving the rowboat in the lagoon leaves the motorboat at its berth, ready to board.
  - Walking into a parked car gets in. Letting go of the stick with the car within 1 tile of a car
    park, a jetty or a stop's door gets out; anywhere else, the car just stops. A car stays where you
    leave it.
  - Walking onto a stop's doormat ticks it.
- The boats you sail: the motorboat (the start, all-round), the speedboat (at the marina on the second
  large island: fast in open water, too deep for the lagoon), and the rowboat (at a small island:
  slow, but it fits the lagoon and passes under the footbridge). Switching boats is docking yours at a
  marina and walking onto the other's berth. Traffic (a ferry and tugs on fixed loops, a container
  ship crossing a lane) and rocks bump you: your speed drops to nothing and you're held for 0.6 s
  (about a second lost), never a failure.
- Missions, six, hand-made in `island-hop/missions.js`. Each lists its stops (2–6, most in any order,
  some ordered: a pickup, then its delivery), where each boat and car starts, and its gold route as
  hand-written waypoints (the order of stops, the berths and the vehicles). Starting or restarting a
  mission resets the clock, the stops, any pickup, and every boat and car; nothing carries over from
  another mission. Target lengths, as bands for the autopilot's gold route: 1, one island on foot
  (25–50 s); 2, a car (40–75 s); 3, two islands (60–110 s); 4, a pickup in order (65–120 s); 5, a
  second boat (75–130 s); 6, everything, with traffic (80–140 s), so a player's run (about 1.2–2× the
  autopilot) stays within about 3½ minutes. Each mission's other order of its stops is slower than its
  gold time (par × 1.1), so planning pays. Any finish opens the next mission. Changed after the go
  (owner, 2026-11-10: "go", in reply to the recommendation "Lower the bands for 4–6 … 4 = 65–120 s,
  5 = 75–130 s, 6 = 80–140 s" and "Tighten the planning check: the other order must be slower than
  the gold medal time (par × 1.1)"): with the spec's speeds on the 60 × 60 map, the gold routes take
  75, 83 and 91 s; the old bands (80–140, 100–170, 130–220 s) could be reached only by padding (an
  adversarial review measured far starts, nine stops and forced relay chains), and would have put a
  player's run on mission 6 past 3½ minutes. Confirmed in the owner's own words (2026-11-11: "sounds
  good", to "confirm the mission 4–6 bands and the stricter planning check").
- Pickups: you can carry any number; each rides above the person's head (and in the boat or car) until
  delivered, and can't be lost. Walking onto an ordered stop before its pickup doesn't tick it: its
  beam pulses and the pickup's icon flashes on the HUD.
- The clock counts up from the first move (owner, 2026-11-10: "Count up, beat par"). Par per mission:
  gold is the autopilot's gold-route time × 1.1, silver gold × 1.35, bronze gold × 1.8. The HUD shows
  the clock (0:00 until the first move), the stops left as icons, a restart button, and at each stop a
  split against the best (green ahead, red behind). The best run is a ghost (its position every
  0.2 s, at most 1,200 points, in localStorage) that moves beside you. Bests, medals and ghosts are
  saved with the map's version, and thrown away when it changes. At the finish, your route and the
  gold route are drawn over the map, with the medal and best.
- The camera follows, leading 25% of the view in the direction of travel and sitting 15% above centre
  (the thumb is low), zoomed per mode by tiles shown across the screen's width (boat 14, car 11,
  walking 7), easing over 0.5 s. A 48 px map button shows the whole archipelago with the open stops
  while held; the clock keeps running. Rejected: pinch zoom, which fights the stick's finger
  (adversarial review, 2026-11-10).
- Readability: the person has a bright ring under them; a building drawn after the person whose
  bounds cover them fades to 35%. Stops are tall beams in their own colour with their icon on top;
  off-screen ones get an edge arrow with the icon and the distance.
- Sound, through the shared sound module and the site-wide mute, MP3: the sea's ambience, a boat
  engine hum by speed, footsteps, a car door and engine, a rope creak at the berth, a bump, a chime at
  each stop, a medal jingle at the finish.
- Interruptible: hiding the page pauses the mission, the clock and a fly-over in progress; it resumes
  on a tap.
- The game exposes `window.__hop` (its state, `start(mission)`, and a `step(dt)` that advances
  without drawing) for tests, and the rules run without the DOM in Node.
- The landing tile and its image become Island Hop (`assets/tiles/island-hop.png`), so `sw.js`'s
  SHELL list swaps Beacon's image for it and its VERSION goes up.
- One PR, as the owner chose, built in this order so the riskiest part lands first: the depth-sort
  proof on one island, then the map and movement, missions 1–3, the boats, missions 4–6. If time runs
  short, these go first (each the owner's to approve): the container ship and tugs (the ferry stays),
  the gold-route overlay (the medal and best stay), the ghost (the splits stay).

## Acceptance items

- **AC-1** `shared/iso.js` projects tiles to a 2:1 diamond and back, and a point anywhere in a tile
  picks that tile — `tests/iso.test.mjs`.
- **AC-2** `shared/iso.js` sorts drawables back to front — `tests/iso.test.mjs`.
- **AC-3** `shared/iso.js`'s camera and gestures work as its tests specify — `tests/iso.test.mjs`.
- **AC-4** The page opens on the archipelago moving (traffic sailing, water animating) behind the
  mission card, with no errors; the card shows the mission's stops as icons; Start flies over the
  stops in about 3 s with the clock at 0:00, then hands control to the boat, and the clock starts on
  the first move — `tests/island-hop.test.mjs`.
- **AC-5** The map: from each mission's start, every stop can be reached with the boats and cars that
  mission provides; every berth touches water its boats can reach; the lagoon is open only to the
  rowboat and the footbridge only passable by it; the two large islands have three berths and at least
  two cars each, with the berth nearest a door 6–10 tiles from the berth by a car —
  `tests/island-hop.test.mjs`.
- **AC-6** A drag (or the keys) moves the boat, the person or the car in the direction it points on
  screen, at that mode's speed (walk 1.6, car 5, rowboat 2.2, motorboat 3.5, speedboat 5.5 tiles a
  second); a second finger is ignored, and so is a drag that starts in the phone's edge strips; the
  person slides along walls and can't walk into the sea from a jetty; the car stays on the roads and
  takes the branch the stick points at; a boat nosed into a cliff gets free in under 2 s —
  `tests/island-hop.test.mjs`.
- **AC-7** A boat heading slowly toward a free berth within 1.5 tiles docks and the person steps
  ashore; sailing past at speed doesn't; a berth holding a boat can't be docked at; walking onto a
  berth holding one of your boats boards it; after leaving the rowboat in the lagoon the motorboat is
  still at its berth and boards; walking into a parked car gets in; letting go with the car within
  1 tile of a car park, jetty or door gets out and the car stays there — `tests/island-hop.test.mjs`.
- **AC-8** Walking onto a stop's doormat ticks it with a chime and a split; an ordered stop isn't
  ticked before its pickup, and its beam pulses and the pickup's icon flashes; pickups ride with you
  until delivered; the last stop finishes the mission — `tests/island-hop.test.mjs`.
- **AC-9** Docking at a marina and walking onto its other berth swaps boats; the speedboat can't enter
  the lagoon and the rowboat can; bumping a rock or traffic stops the boat for 0.6 s and never fails
  the mission — `tests/island-hop.test.mjs`.
- **AC-10** The finish shows the time, the medal against gold, silver and bronze, the best, and the
  run's route beside the gold route; any finish opens the next mission; the best, medal and ghost
  persist over a reload and the ghost moves on the next run; saved runs from another map version are
  thrown away — `tests/island-hop.test.mjs`.
- **AC-11** For each of the six missions the autopilot following its gold route finishes it in a time
  inside the mission's band, and at least one other ordering of its stops is slower than its gold time
  (par × 1.1) —
  `tests/island-hop.test.mjs`.
- **AC-12** Off-screen stops show an edge arrow with their icon; holding the map button shows the
  whole archipelago and the open stops, and the clock keeps running; the camera shows 14, 11 and 7
  tiles across in the boat, the car and on foot — `tests/island-hop.test.mjs`.
- **AC-13** `#m=N` opens mission N if it's open, and mission 1 otherwise, without an error —
  `tests/island-hop.test.mjs`.
- **AC-14** Hiding the page pauses the mission, the clock and a fly-over; it resumes only on a tap;
  restart, from the HUD or the pause card, resets the clock, the stops, any pickup and every vehicle —
  `tests/island-hop.test.mjs`.
- **AC-15** Docking, a car door, a stop and the finish each play their sound, and none plays while
  muted — `tests/island-hop.test.mjs`.
- **AC-16** On a 390×844 phone the page doesn't scroll, every button is at least 44 px, the canvas is
  at most 2× its CSS size, a building covering the person fades, and movement covers the same distance
  at 60 and 120 frames a second — `tests/island-hop.test.mjs`.
- **AC-17** It plays offline once played — `tests/island-hop.test.mjs`.
- **AC-18** The landing page's Island Hop tile is playable and the page keeps its nine tiles (eight
  before `main` added Crumble; owner, 2026-11-11: "Can you bring the latest main?") —
  `tests/site.test.mjs`.
- **AC-19** The art is Kenney's: all 29 Watercraft sprites are drawn in the world (sailed, moored,
  traffic or buoys), and the Tiles Base, Tiles Buildings, Tiles City, Tiles Vehicles and Nature pieces
  the map uses come from the atlas that `scripts/island-hop/build-assets.py` builds —
  `tests/island-hop.test.mjs`.
- **AC-20** A timed playtest at 390×844: each mission's autopilot time is inside its band, and Port
  Town draws at 50 frames a second or more while the autopilot drives there; `node
  scripts/island-hop/playtest.mjs` prints the same figures — `tests/island-hop.test.mjs`. (Was
  "verified by review: the playtest's figures in the PR", which no one but the builder could check;
  owner, 2026-11-11: "yes", to "turn the timed playtest into a real test".)

## Core flow

1. Tap the Island Hop tile: the archipelago moves behind the mission card, its stops as icons. Tap
   Go.
2. The camera flies over the stops, then you're in your boat. Sail to an island and dock.
3. Walk (or drive a car) to each stop's door; back to the boat and on to the next island.
4. The last stop finishes: your time, medal and route against gold; next mission or try again.

## States

| State                     | Mission card | HUD (clock, stops, map, restart) | Finish card | Pause card |
| ------------------------- | ------------ | ------------------------------ | ----------- | ---------- |
| Start (the world moves)   | shown        | hidden                         | hidden      | hidden     |
| Fly-over                  | hidden       | shown                          | hidden      | hidden     |
| Playing                   | hidden       | shown                          | hidden      | hidden     |
| Paused (page was hidden)  | hidden       | shown                          | hidden      | shown      |
| Finished                  | hidden       | hidden                         | shown       | hidden     |

## Out of scope

- More missions or maps, a mission editor, a generated archipelago, weather, day and night, walking
  people and road traffic on the islands, buying boats, and leaderboards.

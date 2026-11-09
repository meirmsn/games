# High Seas: a sailing game on an isometric sea

**Go:** "don't consult with me, just start building after following this process" 2026-11-09

## Intent

The owner asked on 2026-11-09 for a batch of games built in parallel: "review the game concept
against the guidelines and propose something that works, and then do adversarial review … so that
you have solid concepts of the game and then build them … don't consult with me, just start
building after following this process." The seed for this one is an isometric game with ships and
boats at sea: the owner "has never seen an isometric game with ships and boats on the sea, which
makes it stand out". Its assets are Kenney's Isometric Watercraft, Isometric Vector Roads (the
water and coast tiles) and Isometric Nature, from the private asset repo (`meirmsn/games-private`).

This game also unblocks Little Town, the city builder: the isometric rendering (tile grid, depth
sorting, screen↔tile picking, camera pan and zoom by touch) is a small reusable module,
`shared/iso.js`, with its own tests.

The surface is a new game page, `high-seas/`, and its tile on the landing page turning from "Coming
soon" to playable. The game has its own sea palette, like Reef; the landing page keeps the site's
tokens.

**Hook:** the wind is the puzzle. Sail a little dinghy across an isometric archipelago, catch the
gusts you can see darkening the water, tack your way upwind to the ports, and earn the galleon that
has been waiting in the shipyard since the first minute.

### Concept check (the guidelines' questions)

- **Verb:** sail by the wind. Drag anywhere and the boat turns to the direction of the drag, at its
  own turn rate; let go and it holds its course. Speed depends on the angle to the wind, and gusts
  are dark patches drifting across the water that make the sail fill and the boat surge.
- **A typical 5-second choice:** the port is upwind. Long tacks through open water, or short tacks
  up the channel past the rocks? Bend off to ride that gust, or hold the line?
- **How it teaches:** the first contract is a short reach. Steering towards the wind shows the
  no-go wedge around the boat, the sail flaps, and the boat slides off on the nearer close-hauled
  edge instead of stopping. The second contract is upwind. While you steer, a ring around the boat
  shows the best headings. No written tips.
- **Three clocks:** seconds: a gust caught, a crate delivered, a rock just missed. Minutes: a new
  rule, not a bigger number: the keel opens upwind routes, the spinnaker makes running downwind the
  fastest, the galleon can't cross shallows, the wind shifts. Back: a best time for each sea, a new
  sea each voyage, and a link to share a sea.
- **What an expert does differently:** plans tacks so the last one lays the port, rides gusts,
  cuts across the shoals in the dinghy, reads the coming wind shift and takes the mail that suits
  it, and so ends the voyage in about half a beginner's time.
- **Why the tenth play differs:** each voyage is a new seeded archipelago (island shapes, ports,
  channels, rocks, the wind's direction), and a best time to beat on a sea you know.
- **Form:** long-form, one 8–12 minute voyage with an end. The mastery is planning routes across a
  changing wind, which needs a world big enough to plan in.
- **Orientation:** portrait: one thumb drags anywhere. It also plays in landscape on a desktop.
- **What a failure costs:** never the game. A rock or a knockdown spins the boat, costs a couple of
  seconds and drops the cargo in the water, where it floats and can be picked up again. Late mail
  pays the ordinary rate.
- **Save games:** the URL. The sea's seed and your progress (coins, boat, upgrades) are kept in the
  page's address after each port, so a reload, or the link, resumes at the last port. The best time
  for each sea is kept in localStorage.
- **Riskiest technical part:** reading the heading against the wind on a phone, with sprites at
  eight headings. So the dinghy is drawn in code, as a low-poly 3D hull projected through the iso
  transform, turning smoothly; and the depth sorting around islands, palms and the galleon, proven
  by `shared/iso.js`'s tests and a 60 fps playtest.

## Decisions

- One voyage with an end, not levels with lives: it differs from Reef in its verb (sailing by wind,
  with momentum, not steering a position), its structure (one open world with purchases and a
  finale) and what failure means (a few seconds and a floating crate, never a life). Rejected: a
  trade loop with no end, which the adversarial review found a fetch grind (Claude, 2026-11-09).
- Wind, heading and the polar are measured on the grid (the sea's own plane), not on the screen,
  because the 2:1 projection squashes angles: a drag maps to a grid heading through
  `iso.screenDirToGrid`, so a drag straight down-right on screen heads along grid (1, 0), and the
  wedge and the speed ring are drawn by projecting grid angles, so they look right on the water.
- Never stall: dragging into the no-go wedge sails the nearer close-hauled edge at reduced speed,
  with the sail flapping and the wedge drawn, and dragging across the wedge tacks. Rejected: a dead
  stop head to wind, which non-sailors would read as broken (adversarial review, 2026-11-09).
- The polar, per boat (fraction of the boat's top speed, by angle off the wind): the dinghy is
  fastest on a beam reach (100%), 70% close-hauled at its wedge edge (50° off the wind), 65% dead
  downwind. The keel narrows the wedge to 38°. The spinnaker makes dead downwind 115%. The galleon is
  square-rigged: a 65° wedge, fastest on a broad reach and downwind, and 3 cargo spaces.
- The dinghy carries 1 cargo, the galleon 3. Docking unloads and pays for everything bound for
  that port; cargo for other ports stays aboard. A contract can be loaded only if there is room;
  when there isn't, the cards show it and do nothing. The keel and spinnaker are the dinghy's;
  buying the galleon replaces the dinghy (its cargo moves aboard) and there is no going back.
- Purchases change the verb, not a number: keel (60 coins), spinnaker (120), galleon (260). Each is
  shown on the shipyard's quay, with its price, from the start (owner's guidelines: show the reward
  before it's earned). The galleon (Kenney's white-sailed ship) is moored at the shipyard from the
  first minute.
- The start port is the shipyard. Three other ports, and a lighthouse island far off for the
  finale. Each port offers two contracts: goods (pay by distance) or mail (a departure window shown
  as a draining ring; delivered on time pays ×1.6, late pays the goods rate). The window is for
  arriving, and it drains while sailing and while docked, and freezes while paused. Rejected: fish that spoil, too
  close to another game's hook (adversarial review, 2026-11-09).
- Docking is automatic: entering a port's ring (armed again only once the boat has left it, so
  casting off never re-docks) drops the sail and the boat glides to the quay,
  where a card shows the port's contracts (and the shipyard's purchases). Tapping a contract loads
  it; the next drag casts off.
- Knockdowns are earned, not random: in a strong gust, sailing across the wind builds heel that the
  boat shows (leaning, spray, creaking); held too long, the boat knocks down and the cargo floats
  off. Bearing away or heading up sheds it. The keel halves heel; the galleon never knocks down.
- Nothing gets stuck: a spilled crate doesn't drift, and lands on the nearest water the current
  boat can reach; running into land or (for the galleon) shallows slides the boat along the edge
  and never stops it dead; deep channels between islands are at least 3 tiles wide.
- Strong gusts are those at 1.4× the wind or more; heel is the gust's push across the boat (0 to
  over 1), and a knockdown comes after heel stays at 1 or more for 1.5 s. A gust multiplies the
  wind, and the boat's speed with it.
- Turn rates: the dinghy 150° a second, the galleon 55°. A second finger on the glass cancels the
  steer, and the boat holds its course.
- Rocks show a white surf ring at their footprint, which is what the boat hits, not the tall sprite.
- The wind shifts by about 90°, announced at least 30 s ahead by a ghost arrow on the wind vane and
  clouds turning: 45 s after the fourth delivery, again 45 s after buying the galleon, then every
  3 minutes.
- A hidden assist: when the boat has been slow (under 30% of its top speed) for 4 s, a gust forms
  upwind of it within the next few seconds. Never shown, and nothing else eases.
- The Grand Charter is free, takes one cargo space, and goes to the lighthouse island, which is
  in deep water. The voyage clock runs while sailing and docked, and stops while paused or on the
  start card.
- The archipelago is generated from a seed and checked: every port and the lighthouse are reachable
  in deep water (the galleon's draft), and the start port has a contract on a reach short enough to
  finish in under 40 s (its route length over the dinghy's speed at the starting wind). A seed
  that fails is retried as seed:1, seed:2 … up to 50 times, so a shared link always gives the same
  sea.
- Terrain tiles are drawn in code in the Vector Roads pack's flat palette, so they stay crisp at any
  zoom and the download stays small; the boats, rocks, palms and other props are Kenney's PNGs,
  scaled down. The dinghy is drawn in code (no small sailboat in the pack).
- Tuning targets, each a knob in one table in the code: the first delivery in under 40 s; the
  first upwind contract by about 2 minutes; the keel by about 3 minutes; the galleon by about 7; the
  voyage's end at 8–12 minutes.
- The address keeps a version, the seed, the progress, the voyage clock and a short checksum. An
  address that doesn't check out (edited, garbled or from another version) starts a fresh voyage on
  its seed, without an error.
- The game exposes `window.__seas` (its state, and a `step(dt)` that advances the simulation without
  drawing), like Reef's `window.__reef`, so tests can set up a moment and check the rules.
- `sw.js` is untouched: a game's files are cached the first time it's played. The Kenney PNGs and
  sounds are copied from `meirmsn/games-private` into `high-seas/img/` and `high-seas/sounds/` by
  `scripts/high-seas/build-assets.py`; the sea's ambience is synthesised by it with ffmpeg.
- The camera follows the boat, a little ahead of it, zoomed so the dinghy is about 48 px long on a
  phone; a pinch (or the wheel) zooms between a close view and the whole chart. A chevron at the
  screen's edge points to the destination.
- Sound: wind and water ambience, the sail luffing, a whoosh on a gust, the creak of heel, a splash
  on a knockdown, a bell at the quay, coins on payment, a horn for the galleon and a fanfare at the
  end, all through the shared sound module and its site-wide mute.
- The isometric module is general (no High Seas code in it), so Little Town can reuse it.
- Built in one PR as the first slice, with the later slices in Out of scope (owner's batch process,
  2026-11-09).

## Acceptance items

- **AC-1** `shared/iso.js` projects tiles to a 2:1 diamond and back, and a point anywhere in a
  tile picks that tile — `tests/iso.test.mjs`.
- **AC-2** `shared/iso.js` sorts drawables back to front, so a boat behind an island tile draws
  before it and in front draws after it — `tests/iso.test.mjs`.
- **AC-3** `shared/iso.js`'s camera maps view to world and back, zooms about a point, pans, clamps
  and lists the tiles in view; its gestures give one finger to the game, a short press as a tap, two
  fingers to pinch-zoom (cancelling the first finger's gesture) and the wheel to zoom —
  `tests/iso.test.mjs`.
- **AC-4** The page opens on a moving sea behind a start card (the sea's clock advances and two
  frames differ), with no errors; Start begins the
  voyage docked at the shipyard with its contracts shown — `tests/high-seas.test.mjs`.
- **AC-5** A drag longer than 20 px turns the boat towards the grid heading that the drag's
  direction on screen shows (a drag straight down-right heads along grid (1, 0)), at no more than
  the boat's turn rate (150° a second for the dinghy); a shorter one does nothing; letting go, or a
  second finger, holds the course; the arrow keys turn it — `tests/high-seas.test.mjs`.
- **AC-6** Speed follows the boat's polar: a beam reach is the dinghy's fastest; a drag into the
  no-go wedge sails the nearer close-hauled edge at no less than 40% of top speed; a drag to the
  other side of the wedge tacks — `tests/high-seas.test.mjs`.
- **AC-7** Inside a gust of strength g, the boat's speed settles at g times its speed outside it,
  on the same heading — `tests/high-seas.test.mjs`.
- **AC-8** Entering a port's ring docks the boat, and casting off from it doesn't dock it again
  until it has left the ring; a delivery pays and cargo for other ports stays aboard; a contract
  can't be loaded when the hold is full; mail delivered within its window
  pays more than the same mail late — `tests/high-seas.test.mjs`.
- **AC-9** The keel narrows the wedge to 38°, the spinnaker makes dead downwind faster than a beam
  reach, and the galleon has 3 cargo spaces, a 65° wedge and can't enter shallow water; each costs
  its price and is shown on the shipyard quay before it can be afforded, and tapping one you can't
  afford changes neither the coins nor the boat —
  `tests/high-seas.test.mjs`.
- **AC-10** Across the wind in a strong gust the dinghy heels; held at full heel for 1.5 s, it
  knocks down and its cargo floats on water the boat can reach, and sailing over the crate picks it
  up; bearing away sheds the heel with no knockdown; the
  galleon never knocks down — `tests/high-seas.test.mjs`.
- **AC-11** Hitting a rock bumps the boat and spills its cargo, which can be picked up; sailing
  into land, or the galleon into shallows, slides along the edge and never stops the boat dead —
  `tests/high-seas.test.mjs`.
- **AC-12** A wind shift is announced at least 30 s before it happens, and then the wind turns —
  `tests/high-seas.test.mjs`.
- **AC-13** The same seed gives the same archipelago; for 100 seeds, every port and the lighthouse
  are reachable in deep water through channels at least 3 tiles wide, and the start port offers a
  goods contract whose route length over the dinghy's speed at the starting wind is under 40 s — `tests/high-seas.test.mjs`.
- **AC-14** With the galleon bought, the shipyard offers the Grand Charter; arriving at the
  lighthouse ends the voyage on a card with the time and the best for that sea, and it can start a
  new sea or the same one — `tests/high-seas.test.mjs`.
- **AC-15** After a port, the address holds the seed and progress, and reloading it resumes at that
  port with the same coins, boat, upgrades and voyage clock; an edited or garbled address starts a
  fresh voyage on its seed with no error — `tests/high-seas.test.mjs`.
- **AC-16** Hiding the page pauses the voyage; it resumes only after a tap, and nothing moves
  until then — `tests/high-seas.test.mjs`.
- **AC-17** A boat slow for 4 s gets a gust forming upwind of it within 6 s —
  `tests/high-seas.test.mjs`.
- **AC-18** The landing page's High Seas tile is playable and the page still shows 7 tiles —
  `tests/site.test.mjs`.
- **AC-19** High Seas plays offline once it has been played — `tests/high-seas.test.mjs`.
- **AC-20** On a 390×844 phone the page doesn't scroll, every button is at least 44 px, the canvas
  is drawn at no more than 2× the CSS size, turning the phone to 844×390 keeps the page unscrolled
  and the boat in view, and the boat covers the same distance at 60 and 120 frames a second — `tests/high-seas.test.mjs`.
- **AC-21** A delivery, a gust and a knockdown each play their sound, and none plays while the
  site is muted — `tests/high-seas.test.mjs`.
- **AC-22** The tuning targets hold in a playtest at 390×844: the first delivery in under 40 s, the
  galleon by about 7 minutes, the voyage's end at 8–12 minutes — verified by review: a timed
  playtest, its times in the PR.

## Core flow

1. Tap the High Seas tile: the sea is moving behind a small start card. Tap Start.
2. At the shipyard's quay, tap a contract; drag to sail off.
3. Sail by the wind to the flagged port; the boat docks itself and you're paid.
4. Buy the keel, the spinnaker, then the galleon; carry the Grand Charter to the lighthouse.
5. See the voyage's time and the sea's best; sail a new sea or the same one again.

## States

| State | Start card | Port card | HUD (coins, cargo, wind) | End card | Pause card |
| ----- | ---------- | --------- | ------------------------ | -------- | ---------- |
| Start (the sea moves behind) | shown | hidden | hidden | hidden | hidden |
| Docked | hidden | shown | shown | hidden | hidden |
| Sailing | hidden | hidden | shown | hidden | hidden |
| Paused (page was hidden) | hidden | hidden | shown | hidden | shown |
| Voyage over | hidden | hidden | hidden | shown | hidden |

## Out of scope

This is the first slice of High Seas. Later slices, each its own spec and PR, in this order:

1. Squalls: dark moving cells with strong, shifting wind: fast, risky, and a reason to reef or wait.
2. Sailing traffic: motorboats, tugs and cargo ships on lanes between the ports, to dodge.
3. Rivals: the dark-sailed ship racing you for the same mail.
4. Night and lighthouses: a voyage that runs into dusk, steering by the lights.

Also out: a typed voyage code (the address does that), leaderboards, choosing your boat's colours,
music beyond the ambience, and a settings menu beyond the site-wide mute.

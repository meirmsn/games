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

**Hook:** the wind is the puzzle. Sail a little dinghy across an isometric archipelago, ferrying
the people waiting on its jetties home, catch the gusts you can see ruffling the water, tack your
way upwind to the ports, and earn the galleon that has been waiting in the shipyard since the first
minute.

### Concept check (the guidelines' questions)

- **Verb:** sail by the wind. Drag anywhere and the boat turns to the direction of the drag, at its
  own turn rate; let go and it holds its course. Speed depends on the angle to the wind, and gusts
  are patches of ruffled water drifting across the sea that make the sail fill and the boat surge.
- **A typical 5-second choice:** the port is upwind. Long tacks through open water, or short tacks
  up the channel past the rocks? Bend off to ride that gust, or hold the line?
- **How it teaches:** someone hops into your boat at the shipyard and a flag of their colour rises
  over the port they're going to, a short reach away; a ghost finger shows the drag once. Steering
  towards the wind shows the no-go wedge around the boat, the sail flaps, and the boat slides off on
  the nearer close-hauled edge instead of stopping. Later passengers go upwind. While you steer, a
  ring around the boat shows the best headings. The HUD shows what the coins are for. No written
  tips.
- **Three clocks:** seconds: a gust caught, a passenger home, a rock just missed. Minutes: a new
  rule, not a bigger number: the keel opens upwind routes, the spinnaker makes running downwind the
  fastest, the galleon can't cross shallows, the wind shifts. Back: a best time for each sea, a new
  sea each voyage, and a link to share a sea.
- **What an expert does differently:** plans tacks so the last one lays the port, rides gusts,
  cuts across the shoals in the dinghy, reads the coming wind shift and picks the passengers whose
  trips suit it, and so ends the voyage well ahead of a beginner.
- **Why the tenth play differs:** each voyage is a new seeded archipelago (island shapes, ports,
  channels, rocks, the wind's direction), and a best time to beat on a sea you know.
- **Form:** long-form, one 8–12 minute voyage with an end. The mastery is planning routes across a
  changing wind, which needs a world big enough to plan in.
- **Orientation:** portrait: one thumb drags anywhere. It also plays in landscape on a desktop.
- **What a failure costs:** never the game. A rock or a knockdown spins the boat, costs a couple of
  seconds and pitches the dinghy's passenger into the water, where they wave until you pick them
  up again.
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
  finale) and what failure means (a few seconds and a passenger to fish out of the water, never a life). Rejected: a
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
- Passengers, not cargo menus: people wait on the jetties, each holding a little flag in their
  destination's colour and shape, with one to three coin bags at their feet for what the fare is
  worth. When the boat docks where someone waits and has a seat, they hop aboard and sit in the
  boat; their destination's flag rises tall, its ring fills, and the arrow at the screen's edge
  turns its colour. Docking there, they hop ashore, wave, and stay on that quay; the fare flies into
  the coins. The dinghy seats 1, the galleon 3. The keel and spinnaker are the dinghy's; buying the
  galleon replaces the dinghy (its passengers move aboard) and there is no going back.
- Purchases change the verb, not a number: keel (60 coins), spinnaker (130), galleon (360), sold in
  that order. The HUD always shows the next one as a picture with a ring that fills as coins come
  in; when it's full the shipyard is marked (its flag raised gold, an arrow at the screen's edge),
  and docking there shows one button: the picture and the price. The galleon (Kenney's
  white-sailed ship) is moored at the shipyard from the first minute, with its price. The prices
  were first 60, 120 and 260 and a fare paid 6 coins plus 0.8 a tile; timed playtests set them to
  60, 130 and 360 and a fare to 7 plus 0.85 a tile (Claude, 2026-11-09).
- The start port is the shipyard. Three other ports, and a lighthouse island far off for the
  finale. The first three trips are guided: one passenger at a time, waiting at the port you're at,
  the first going to the port a short reach away. After that every port has someone waiting (two,
  once you sail the galleon), coming back a few seconds after they board, and you choose where to
  sail. Once you can afford the next part, the people waiting where you dock, and those who come
  to wait, are bound for the shipyard, so the next passenger takes you where you want to go
  (Claude, 2026-11-10, from the timed playtest: boarding is automatic, and passengers bound
  elsewhere kept carrying the boat away from the shipyard). Rejected: cargo with mail windows chosen
  from a menu, which the owner found unreadable (owner, 2026-11-09).
- Docking is automatic, and only for a reason: entering a port's ring (armed again only once the
  boat has left it, so casting off never re-docks) docks if there's someone aboard for that port,
  someone waiting with a seat for them, or (at the shipyard) something you can afford; otherwise the
  boat sails through. Docked, the sail drops and the boat glides to the quay; a drag casts off.
- Until you first steer, a ghost finger drags across the screen towards your passenger's
  destination while you're docked with them aboard; once you have steered, it never shows again in
  that browser. It's a gesture, not a written tip.
- Other boats share the sea: a tug, a motorboat, a fishing rowboat and a container ship sail
  between the ports along deep water on engines or oars, stop at quays and go on. Meeting one is a
  gentle shove that slides you past, never damage.
- Knockdowns are earned, not random: in a strong gust, sailing across the wind builds heel that the
  boat shows (leaning, spray, creaking); held too long, the boat knocks down and its passengers
  go into the water, where they tread water and wave until the boat comes back for them. Bearing away or heading up sheds it. The keel halves heel; the galleon never knocks down.
- Nothing gets stuck: someone in the water doesn't drift, and lands on the nearest water the current
  boat can reach; running into land or (for the galleon) shallows slides the boat along the edge
  and never stops it dead; deep channels between islands are at least 3 tiles wide.
- Strong gusts are those at 1.4× the wind or more; heel is the gust's push across the boat (0 to
  over 1), and a knockdown comes after heel stays at 1 or more for 1.5 s. A gust multiplies the
  wind, and the boat's speed with it.
- Turn rates: the dinghy 150° a second, the galleon 55°. A second finger on the glass cancels the
  steer, and the boat holds its course.
- Rocks stand in open water, at least 3 tiles from any land and 4 from the chart's edge, so there is
  room to pass on either side; a boat that hits one is thrown clear onto open water and turns away
  from it; the dinghy's passengers are pitched into the water at least 2 tiles clear of every rock,
  and the galleon, big enough, keeps them. While the lighthouse keeper is aboard, the boat docks
  only to drop off and at the lighthouse, and nobody else boards. The last passage sails on a fair
  wind: as the keeper boards, the wind swings round so the galleon's way out lies on a broad reach,
  and from then on it follows the galleon home, keeping the next stretch of the route on a broad
  reach and turning no faster than 15° a second; no other shift comes, so the finale is a release
  after the build-up rather than a beat upwind. Changed after the go, found by the timed playtest
  and approved by the owner in the chat on 2026-11-10, after asking what the following wind is and
  why: "I approve the following win for the high seas finale."
- Rocks show a white surf ring at their footprint, which is what the boat hits, not the tall sprite.
- The wind shifts by about 90°, announced at least 30 s ahead by a ghost arrow on the wind vane and
  clouds turning: 45 s after the fourth delivery, again 45 s after buying the galleon, then every
  3 minutes.
- A hidden assist: when the boat has been slow (under 30% of its top speed) for 4 s, a gust forms
  upwind of it within the next few seconds. Never shown, and nothing else eases in secret; the last
  passage's following wind is the one other easing, and it's in plain sight (the vane shows it
  turning) and the same for everyone (owner, 2026-11-10: "I approve the following win for the high
  seas finale.").
- The Grand Charter: once you own the galleon, the lighthouse keeper (a white coat, a gold flag with
  a star) waits at the shipyard and boards first when there's a seat; taking them to the lighthouse
  island, in deep water, ends the voyage. They ride free. The voyage clock runs while sailing and docked, and stops while paused or on the
  start card.
- The archipelago is generated from a seed and checked: every port and the lighthouse are reachable
  in deep water (the galleon's draft), and the first passenger's port is on a reach short enough to
  finish in under 40 s (its route length over the dinghy's speed at the starting wind). A seed
  that fails is retried as seed:1, seed:2 … up to 50 times, so a shared link always gives the same
  sea.
- Terrain tiles are drawn in code in the Vector Roads pack's flat palette, so they stay crisp at any
  zoom and the download stays small; the boats, rocks, palms and other props are Kenney's PNGs,
  scaled down. The dinghy is drawn in code (no small sailboat in the pack).
- Tuning targets, each a knob in one table in the code: the first delivery in under 40 s; the
  first upwind trip by about 2 minutes; the keel by about 3 minutes; the galleon by about 7–9;
  most voyages ending at 8–12 minutes and none outside 7–13, because seas differ in how long and
  upwind their routes are. `scripts/high-seas/playtest.mjs` times an autopilot playing whole
  voyages at 390×844, for AC-22's playtest.
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
- Changed after the go, by the owner in the chat on 2026-11-09 ("yeah your rec sounds good"): AC-22
  and the tuning targets loosened from "the galleon by about 7, the end at 8–12 minutes" to "the
  galleon by about 7–9, most voyages ending at 8–12 minutes and none outside 7–13", after the timed
  playtest showed sea-to-sea spread (owner, 2026-11-09).
- Changed after the go, when `main` came in on 2026-11-09: AC-18's tile count follows `main`'s (7
  when this was specced, 8 once Walk on Red merged), as the owner's batch brief asks: "Expect
  conflicts in `index.html` … keep both sides, and make sure the tile count matches" (owner,
  2026-11-09).
- Changed after the go, by the owner after playing the preview (2026-11-09): "I have no idea what
  I'm supposed to do on this game … it feels rather empty … Feels like a lonely place", then
  (2026-11-10): "just think about why it is not intuitive in the game, what the game is about, and
  figure out one way that through play you learn what the objective of the game is." So: people
  waiting on jetties replace the contract menu and mail; the HUD shows the next purchase filling;
  the shipyard is marked when you can buy; other boats sail the sea; gusts are drawn as ruffled
  water, not dark discs; and a ghost finger shows the first drag. Twenty directions were weighed
  and attacked by an independent review before this one was picked (owner, 2026-11-09 and
  2026-11-10).
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
  frames differ), with no errors; Start docks the boat at the shipyard with no card or menu, where
  one passenger waits on the jetty and hops aboard, bound for the first port —
  `tests/high-seas.test.mjs`.
- **AC-5** A drag longer than 20 px turns the boat towards the grid heading that the drag's
  direction on screen shows (a drag straight down-right heads along grid (1, 0)), at no more than
  the boat's turn rate (150° a second for the dinghy); a shorter one does nothing; letting go, or a
  second finger, holds the course; the arrow keys turn it — `tests/high-seas.test.mjs`.
- **AC-6** Speed follows the boat's polar: a beam reach is the dinghy's fastest; a drag into the
  no-go wedge sails the nearer close-hauled edge at no less than 40% of top speed; a drag to the
  other side of the wedge tacks — `tests/high-seas.test.mjs`.
- **AC-7** Inside a gust of strength g, the boat's speed settles at g times its speed outside it,
  on the same heading — `tests/high-seas.test.mjs`.
- **AC-8** Entering the ring of a passenger's destination docks the boat; they hop ashore and stay
  on the quay, and their fare is paid, while passengers for other ports stay aboard; casting off
  doesn't dock again until the boat has left the ring; a port with nobody to drop off, nobody
  waiting and nothing to buy is sailed through — `tests/high-seas.test.mjs`.
- **AC-9** The keel narrows the wedge to 38°, the spinnaker makes dead downwind faster than a beam
  reach, and the galleon seats 3, has a 65° wedge and can't enter shallow water; the HUD shows the
  next purchase from the start, filling as coins come in; once it's affordable the shipyard is
  marked and docking there shows one button (at least 44 px) that buys it; trying to buy what you
  can't afford changes neither the coins nor the boat — `tests/high-seas.test.mjs`.
- **AC-10** Across the wind in a strong gust the dinghy heels; held at full heel for 1.5 s, it
  knocks down and its passenger goes into the water where the boat can reach them, and sailing over
  them picks them up; bearing away sheds the heel with no knockdown; the galleon never knocks down
  — `tests/high-seas.test.mjs`.
- **AC-11** Hitting a rock bumps the dinghy and pitches its passenger into the water, from where
  they can be picked up; sailing into land, or the galleon into shallows, slides along the edge and
  never stops the boat dead — `tests/high-seas.test.mjs`.
- **AC-12** A wind shift is announced at least 30 s before it happens, and then the wind turns —
  `tests/high-seas.test.mjs`.
- **AC-13** The same seed gives the same archipelago; for 100 seeds, every port and the lighthouse
  are reachable in deep water through channels at least 3 tiles wide, and the first passenger's trip
  from the shipyard has a route length over the dinghy's speed at the starting wind under 40 s —
  `tests/high-seas.test.mjs`.
- **AC-14** With the galleon bought, the lighthouse keeper waits at the shipyard and boards; the
  wind swings so the galleon's way out lies on a broad reach and no other shift is announced; with
  the keeper aboard the boat sails through other ports' rings; arriving at the lighthouse ends the
  voyage on a card with the time and the best for that sea, and it can start a new sea or the same
  one — `tests/high-seas.test.mjs`.
- **AC-15** After a port, the address holds the seed and progress, and reloading it resumes at that
  port with the same coins, boat, upgrades and voyage clock; an edited or garbled address starts a
  fresh voyage on its seed with no error — `tests/high-seas.test.mjs`.
- **AC-16** Hiding the page pauses the voyage; it resumes only after a tap, and nothing moves
  until then — `tests/high-seas.test.mjs`.
- **AC-17** A boat slow for 4 s gets a gust forming upwind of it within 6 s —
  `tests/high-seas.test.mjs`.
- **AC-18** The landing page's High Seas tile is playable and the page keeps the tiles `main` has
  (8 when `main` came in, after Walk on Red) — `tests/site.test.mjs`.
- **AC-19** High Seas plays offline once it has been played — `tests/high-seas.test.mjs`.
- **AC-20** On a 390×844 phone the page doesn't scroll, every button is at least 44 px, the canvas
  is drawn at no more than 2× the CSS size, turning the phone to 844×390 keeps the page unscrolled
  and the boat in view, and the boat covers the same distance at 60 and 120 frames a second — `tests/high-seas.test.mjs`.
- **AC-21** A delivery, a gust and a knockdown each play their sound, and none plays while the
  site is muted — `tests/high-seas.test.mjs`.
- **AC-22** The tuning targets hold in a playtest at 390×844 on several seas: the first delivery in
  under 40 s, the galleon by about 7–9 minutes, most voyages ending at 8–12 minutes and none outside
  7–13 — verified by review: a timed playtest, its times in the PR.
- **AC-23** For the first three trips one passenger waits at a time; after them people wait at
  three ports or more, each holding a flag in their destination's colour and shape, with one to
  three coin bags; every port's flag has its own shape; boarding marks the destination —
  `tests/high-seas.test.mjs`.
- **AC-24** Four other boats sail between the ports, and each stops at a quay within two minutes;
  meeting one shoves the boat aside without a bump or knockdown, and it keeps moving —
  `tests/high-seas.test.mjs`.
- **AC-25** While docked with a passenger aboard, until the player first steers, a ghost finger
  shows the drag; after the first steer it doesn't show again, after a reload too —
  `tests/high-seas.test.mjs`.

## Core flow

1. Tap the High Seas tile: the sea is moving behind a small start card. Tap Set sail.
2. At the shipyard someone hops into the boat; a flag rises over the port they're going to. Drag
   to sail there by the wind; they hop ashore and you're paid.
3. Pick up people waiting at the ports; when the next purchase is full in the HUD, sail to the
   shipyard and buy it: the keel, the spinnaker, then the galleon.
4. With the galleon, take the lighthouse keeper home on a fair wind.
5. See the voyage's time and the sea's best; sail a new sea or the same one again.

## States

| State | Start card | Buy button | HUD (coins, seats, next purchase) | End card | Pause card |
| ----- | ---------- | ---------- | --------------------------------- | -------- | ---------- |
| Start (the sea moves behind) | shown | hidden | hidden | hidden | hidden |
| Docked | hidden | hidden | shown | hidden | hidden |
| Docked at the shipyard, able to buy | hidden | shown | shown | hidden | hidden |
| Sailing | hidden | hidden | shown | hidden | hidden |
| Paused (page was hidden) | hidden | hidden | shown | hidden | shown |
| Voyage over | hidden | hidden | hidden | shown | hidden |

## Out of scope

This is the first slice of High Seas. Later slices, each its own spec and PR, in this order:

1. Squalls: dark moving cells with strong, shifting wind: fast, risky, and a reason to reef or wait.
2. Rivals: the dark-sailed ship racing you for the same passengers.
3. Night and lighthouses: a voyage that runs into dusk, steering by the lights.

Also later, from the twenty directions weighed after the owner's playtest: sea life (gulls,
dolphins), day and night, ports that grow as you deliver, regattas, and rescues.

Also out: a typed voyage code (the address does that), leaderboards, choosing your boat's colours,
music beyond the ambience, and a settings menu beyond the site-wide mute.

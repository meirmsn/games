# Crumble: a turn-based artillery game on a shore that blows apart

**Go:** "don't consult with me, just start building after following this process" 2026-11-09

## Intent

The owner "loves Worms Armageddon" and wants a turn-based artillery battle with cannons in that
genre, made our own: not its name, characters, weapons' identities, levels or look (direction notes,
`discussion/direction.md`). On 2026-11-09 the owner asked: "review the game concept against the
guidelines and propose something that works, and then do adversarial review … so that you have
solid concepts of the game and then build them … don't consult with me, just start building after
following this process." The special part, and the main technical risk, is terrain that blows apart
at 60 fps on a phone. The owner also wants "one good shared explosion effect for every game", as a
small module in `shared/` with its own tests.

The assets are Kenney CC0 packs from the private repo `meirmsn/games-private`: the Tank Pack (tank
bodies, tracks, turrets, shells), Platformer Assets Requests (steel girders) and the Explosion Pack
(the explosion's puffs), plus sounds from the Audio packs, as MP3. The surface is a new game page,
`crumble/`, a new tile on the landing page, and `shared/explosion.js`. The game has its own palette
per battlefield, like Reef; the landing page keeps the site's tokens.

**The hook:** the tide is coming in. Two toy tanks on a crumbling shore blast the sand out from
under each other, and whoever sits lowest when the sea arrives goes under first.

The concept check, as the guidelines ask:

- Verb: pull back and let go. A slingshot drag that starts anywhere off the HUD aims the cannon (the
  shot goes opposite the drag, power is the drag's length), and the release fires. The shell flies
  on an arc, the ground bursts, and sand and smoke settle as a tank slides into its new hole.
- A typical 5-second choice (from Battlefield 2): Shell or Auger. The Shell does damage but has to
  land near the tank. The Auger is as easy to aim and does no damage, but drops the tank toward the
  tide. A second choice: lob high over cover, where wind matters more, or shoot flat.
- Teaching: no text tips. A ghost hand loops a pull-back beside your tank until your first drag.
  Battlefield 1 has the Shell only, no wind and a tide that visibly rises. Battlefield 2 opens with
  the enemy low by the water and the new Auger button pulsing once. Battlefield 3 adds girders.
- Three clocks: every few seconds a shell lands; every 1–2 minutes a new battlefield with a new rule
  or tool and its own look; and to bring you back, stars per battlefield and the furthest reached.
- The expert: reads the wind, corrects from the trace of their last shot, spends Augers to put the
  enemy under the tide line before it rises, and wins with armour to spare for 3 stars.
- The tenth play: wind changes each round, the CPU's misses differ, the shore's shape changes with
  every shot, "New hill" deals a fresh hill, and the stars still to earn.
- Form and orientation: short-form, landscape (see Decisions).
- A failure costs one battle of about 60–100 s; "Again" replays the same hill at once.
- Save games: the furthest battlefield and the stars, in localStorage; `#2` in the URL opens a
  battlefield already reached.
- The riskiest part, proved first: the destructible ground at 60 fps on a phone (AC-12).

Two adversarial rounds shaped it (2026-11-09, recorded in the Decisions): the first found no real
choice, slow CPU turns, an expensive failure, a look too close to existing artillery games, a
cramped HUD and a performance proof that tested the wrong thing. The second found that an instant
tide death made armour irrelevant, that the Auger was unreadable, and that the CPU's fairness and
the stars were undefined.

## Decisions

- The name is **Crumble**, and the slug is `crumble`. It is our own world: toy tanks on a shore with a rising tide, and the weapons are a Shell and an Auger that drills. It has no worms, no team of characters, none of Worms' weapons or levels, and no angle or power numbers (Scorched Earth's look); rejected: a generic hills-and-wind duel, which the first attack showed was Pocket Tanks with Kenney art (session concept, attack round 1, 2026-11-09).
- The tide is the battle's clock, and digging is the plan. The sea rises one notch every 3 shots, and pips next to the wind count down to the next rise. Notches are sized so that a tank that is never dug goes under after about 6 rises (18 shots, about 100 s), and the tide stops one notch above the higher starting hull, so it always ends a battle and never rises forever. Every shot counts toward a rise, an Auger and a shot that leaves the world included. A tank whose hull is under water when the tide rises loses 30 armour; it is not knocked out at once. A tank that the next notch would cover shows a red ripple and bobs. Each hull carries a waterline mark. A tank that reaches 0 armour sinks over about a second. Tide damage hits both tanks together; if both reach 0 at once, the battle is a draw and replays at once on the same hill with the other side starting and no stars. Rejected: an instant knock-out by water, which made armour pointless and played as a coin flip on a waterline nobody saw coming (attack round 2, 2026-11-09).
- Armour is 100. A Shell's blast has a radius of 36 and does up to 30 damage at its centre, falling off to 0 at the blast's edge plus the tank's size. A direct hit (the shell touching the tank) adds 15, so two direct hits and some tide can win. A tank that falls more than 30 units takes 0.5 damage for each unit beyond that. A tank's own blast hurts it too, and nothing stops you drilling under your own tank (session tuning, attack round 2 and the spec review, 2026-11-09).
- The Auger has 2 charges a battle, from Battlefield 2. It drills straight down from where it first touches the ground: a shaft 1.3 times a tank's width and about 2.5 notches deep, doing no damage. A centre Shell drops a tank about 1 notch, so the trade is easy to read: damage plus 1 notch, or no damage and 2.5 notches. Rejected: an Auger that bores along its flight path, which was harder to aim than a Shell, and narrower than a tank, which the tank's tracks would bridge (attack round 2, 2026-11-09).
- A tank stands on the ground under its two track ends, and its tilt follows those two points. When neither end has ground under it, the tank falls. Tanks never move sideways, and they start well inside the world; below the world's bottom is seabed. There is no driving: it was a fake choice, and it would have added a fuel bar and two buttons to a cramped HUD (attack round 1, 2026-11-09).
- The opponent is a CPU tank. It fires within about 0.7 s of its turn, with a barrel swing and no fake thinking. It scores its candidate shots as expected damage plus k times the expected drop, then misses by a spread that is the same for every shot: wide on Battlefield 1 and tighter on each battlefield after. It has the same 2 Augers as the player and uses one when the player's hull is within 1 notch of the water. When no candidate scores above 0 (girders in the way, its own pit), it fires its best lob anyway: it never stalls. Its random numbers come from a seeded generator, so tests can repeat its shots. On Battlefield 1 it scores damage only and never uses the Auger. Pass-and-play is a later slice; rejected for this one: it doubles the testing and the attack found it bypasses the assist (attack rounds 1 and 2, 2026-11-09).
- A hidden assist (0 to 1) widens the CPU's spread: it rises by 0.35 when you lose and falls by 0.2 when you win, is kept in localStorage, and is never shown. At 0 the CPU is at its sharpest; rejected: difficulty settings (the guidelines; Reef's approach).
- The player and the CPU alternate shots, and who starts alternates by attempt. Wind holds for a round (both shots) and is shown at the top centre as an arrow and its strength; Battlefield 1 has none. A shell that flies more than 80 units past either side of the world, or that has flown for 8 s, ends the shot; while a shell is above the top of the screen, a small marker at the top edge shows where it is.
- Fairness: the hill's broad shape is mirrored around the centre (`makeHeights({ mirror: true })`) before small noise is added, except on Battlefield 2, which is deliberately lopsided as a teaching set piece (the enemy starts low by the water, so the first Auger can show what it does) (attack round 2, 2026-11-09).
- Three battlefields, each a new look and one new thing. 1 **Morning Beach**: pale sand and soft dunes under a morning sky, no wind, the Shell only, and a tide that stops 2 notches below both starting hulls, so a first battle rarely ends in a first failure. 2 **Windy Point**: orange rock at sunset, with wind and the Auger. 3 **Breakwater**: a dusk harbour where steel girders give cover, with stronger wind. The girders are never carved, and a shell bursts on contact with one. After Battlefield 3, a win card says the shore is cleared and offers any battlefield again.
- Stars: winning with 60 or more armour left earns 3 stars, 30 or more earns 2, and any other win earns 1. The start card shows each battlefield's empty stars before they are earned.
- Failure is cheap: "Again" replays the same hill (the same seed); "New hill" deals a fresh one. Rejected: fresh terrain on every retry, which stops you retrying the shot you just learned (attack round 1, 2026-11-09).
- Aiming: the first pointer owns the aim and other fingers are ignored. A drag that starts on the HUD never aims, and a drag shorter than the dead zone cancels. Power is the drag's length, capped at 120 CSS px, and is drawn as a stretched band from the tank, not a number. The arc preview shows the first part of the flight, without the wind, and gets shorter by battlefield (45%, 35%, 30% of the flight's time). The last shot's trace stays faint. Keyboard: ←/→ angle, ↑/↓ power, Space fires, Q switches weapon (Tab is left to the browser's focus order, and the HUD's buttons can be focused). The aim holds pointer capture, so a drag may cross the HUD or leave the canvas. A first aiming touch hides the ghost hand for good (kept in localStorage). The mouse uses the same drag as touch.
- The HUD is one row along the bottom, clear of the edges: the weapon buttons (at least 44 px, the Auger's with its charges). The wind and the tide's pips are at the top centre. Armour is a bar over each tank, and a big "−30" rises over a tank that is hit.
- Landscape: artillery is a horizontal duel with both tanks on screen at once, and in portrait at 390 px a tank would be about 18 px wide. Portrait shows a "turn your phone" card over the live shore and pauses a battle exactly like a hidden page: a shell in flight and the CPU's timer both stop. A resize keeps world units, refits the view and cancels a drag in progress. The world is 1400 × 620 units, fitted whole into the screen inside the safe-area insets and aligned to the bottom; the sky and sea extend into any space left over. The animated tipping tank is a later slice (attack rounds 1 and 2, 2026-11-09).
- Short-form: a battle takes 60–100 s and the three battlefields take about 5 minutes.
- Targets, tuned by playing: the first hit within 30 s of the first touch; no first failure on Battlefield 1 for most first-timers; the tide's first rise within 20 s; wind and the Auger about 2 minutes in. The knobs are in one `TUNING` object: gravity, power scale, damage, direct-hit bonus, fall damage, crater radius, the CPU's spread per battlefield, k, the assist, wind range, notch and rhythm, preview fraction and Auger charges.
- The ground is an offscreen canvas carved with `destination-out` circles and drawn with one `drawImage` a frame, plus a `Uint8Array` mask at world resolution for collision and settling, carved in the same call. A carve paints the scorched rim once, so no edge is rebuilt each frame. Rejected: reading pixels back from the canvas (`getImageData`) for collision (attack round 2, 2026-11-09).
- `shared/explosion.js` is the site's shared explosion: a flash, a shock ring, fire puffs from the Explosion Pack's clouds, smoke that drifts with the wind, sparks and debris, pooled and driven by delta time. Crumble is its first user, and Reef and Googly Faces are not changed. Its art is in `shared/explosion/` (owner's request; kept against attack round 1's advice to keep it inside the game).
- Sound: a cannon thump, explosions sized to the blast, the tide's wash, a splash when a tank sinks, jingles for winning and losing, a click for the weapon buttons, and a quiet music loop, all under the site-wide mute.
- The landing page gets a new asset, `assets/tiles/crumble.png`, drawn from the game, so `sw.js`'s SHELL list gains it and its VERSION goes from v3 to v4; the landing page then shows 8 tiles.
- The acceptance items were sharpened, and AC-20 added, by the adversarial spec review and the build that the owner's process includes, before any code was merged: numbers for the CPU's spread test and the sky colours, the tide's cap and the draw, shots that leave the world, fall damage, portrait pausing, the 640×360 HUD, Q instead of Tab, the offline shot and the state table. They come under the owner's standing go for this process ("don't consult with me, just start building after following this process", owner, 2026-11-09). The owner then approved these acceptance-item changes explicitly in the session's chat ("Approve them", owner, 2026-11-09).

## Acceptance items

- **AC-1** The page opens with the shore alive behind the start card (the water moves); Start begins Battlefield 1 on the player's turn with the ghost hand showing; the first aiming touch hides the ghost hand, and it stays hidden after a reload; there are no errors — `tests/crumble.test.mjs`.
- **AC-2** A touch drag that starts off the HUD aims opposite the drag, with power from its length up to the cap, and shows the arc preview and the power band; the release fires; a drag that starts on the HUD, a second finger, and a drag shorter than the dead zone fire nothing; a drag that ends over the HUD still fires — `tests/crumble.test.mjs`.
- **AC-3** A Shell that hits the ground removes a round crater from the collision mask and from the drawn ground, and sets off the shared explosion; a shell that leaves the world past the side margin, or flies for 8 s, ends the shot and the turn passes; a tank whose ground is blown away settles onto the ground under its track ends, tilted to match — `tests/crumble.test.mjs`.
- **AC-4** A Shell damages a tank inside its blast by distance, up to 30, and a direct hit adds 15; the hit tank shows the armour it lost; a tank inside its own blast is hurt too; a fall of more than 30 units costs 0.5 a unit beyond that — `tests/crumble.test.mjs`.
- **AC-5** The Auger drills a shaft straight down from where it touches the ground, at least 1.3 times a tank's width; it does no damage and drops a tank standing over it by at least 2 notches; it has 2 charges a battle, its button shows what's left and does nothing at 0, and it is not offered on Battlefield 1 — `tests/crumble.test.mjs`.
- **AC-6** The tide rises one notch every 3 shots, with pips counting down; a tank whose hull is under water at a rise loses 30 armour, and a tank the next notch would cover is marked; on Battlefield 1 the tide stops at least 2 notches below both starting hulls, and elsewhere it stops one notch above the higher starting hull; when both tanks reach 0 together, the battle replays on the same hill with the other side starting — `tests/crumble.test.mjs`.
- **AC-7** On Breakwater the girders are never carved, and a shell bursts on touching one — `tests/crumble.test.mjs`.
- **AC-8** The CPU fires within 1 s of its turn starting; over 40 seeded shots on Battlefield 3, its shells land within 60 units of the player at least 15 percentage points more often at assist 0 than at assist 1; with every candidate blocked it still fires within 1 s; the assist rises after a loss and falls after a win, and is kept across reloads; on Battlefield 1 the CPU never uses the Auger — `tests/crumble.test.mjs`.
- **AC-9** A tank at 0 armour ends the battle: a win shows the stars earned (3 at 60 or more armour left, 2 at 30 or more, else 1) and offers the next battlefield; a loss offers "Again", which replays the same hill, and "New hill", which deals a different one; the furthest battlefield and the best stars are kept in localStorage, and `#2` opens Battlefield 2 once it has been reached — `tests/crumble.test.mjs`.
- **AC-10** Battlefield 1 has no wind; on Battlefields 2 and 3 the wind changes between rounds, holds within a round, is shown at the top, and pushes a shell downwind — `tests/crumble.test.mjs`.
- **AC-11** Each battlefield's sky's colour at the top differs from each other battlefield's by at least 60 in RGB distance; only Breakwater has girders; before any shot, the hill is mirrored on Battlefields 1 and 3 (the ground's height at mirrored columns differs by at most 10 units), and Battlefield 2 starts the CPU lower than the player — `tests/crumble.test.mjs`.
- **AC-12** At 844×390 with a device pixel ratio of 2 and Chromium's CPU throttled 4×, while a Shell explodes and carves every few frames, with the explosion pool at least half full, the p95 of the whole animation-frame callback (update and draw, timed with `performance.now`) stays under 16.7 ms, a carve plus the tanks' settling stays under 4 ms, and a pixel inside a fresh crater is transparent in the drawn ground — `tests/crumble.test.mjs`.
- **AC-13** In portrait the "turn your phone" card shows over the live shore and a battle pauses (a shell in flight and the CPU's timer stop); in landscape it is hidden and play goes on; at 640×360 the HUD's boxes don't overlap, its buttons are at least 44 px, and both tanks are on screen — `tests/crumble.test.mjs`.
- **AC-14** The shared explosion makes a flash, a ring, fire, smoke, sparks and debris that die away within about three seconds; it gives the same result at 60 and 120 Hz; its pool is capped; its smoke drifts downwind; and its shake decays on its own — `tests/explosion.test.mjs`.
- **AC-15** When the page is hidden, a shell in flight stops and nothing moves; a tap resumes it — `tests/crumble.test.mjs`.
- **AC-16** The landing page shows 8 tiles, with Crumble playable after Googly Faces — `tests/site.test.mjs`.
- **AC-17** Crumble plays offline once it has been played, a shot and its explosion included — `tests/crumble.test.mjs`.
- **AC-18** The keyboard alone plays a turn: ←/→ and ↑/↓ change the aim, Q switches weapon (from Battlefield 2), and Space fires — `tests/crumble.test.mjs`.
- **AC-19** Firing, an explosion and a tide rise each play their sound — `tests/crumble.test.mjs`.
- **AC-20** Each state shows only its own cards and HUD, as in the state table: the start card only at the start, the result card only when a battle is won or lost (with the HUD hidden), the pause card only while paused, and the weapon buttons enabled only on the player's turn — `tests/crumble.test.mjs`.

## Core flow

1. Tap the Crumble tile: the shore is moving behind a small start card. Tap Start.
2. Pull back anywhere and let go: the shell flies, the ground bursts, and the CPU answers.
3. Dig and hit until one tank is out, while the tide comes in.
4. Win: see the stars, then Next. Lose: Again (the same hill) or New hill.

## States

| State | Start card | Result card | Turn-your-phone card | HUD (weapons, wind, tide) |
| ----- | ---------- | ----------- | -------------------- | ------------------------- |
| Start (the shore moves behind) | shown | hidden | hidden | hidden |
| Player's turn (aiming) | hidden | hidden | hidden | shown, weapons enabled |
| Shell in flight, the CPU's turn | hidden | hidden | hidden | shown, weapons disabled |
| Paused (page hidden, then shown) | hidden | hidden | hidden | shown, with "tap to resume" |
| Won / lost | hidden | shown, with stars or Again and New hill | hidden | hidden |
| Portrait, any state | as above | as above | shown on top | as above |

## Out of scope

The game is split into slices, and this change is slice 1. The later slices are recorded here, not
in `ROADMAP.md`, because the games built in parallel would conflict over it:

- Slice 2: endless numbered "Tides" after Battlefield 3, seeded mixes of the three rules, with `#tide-<n>` links; the animated tipping tank on the turn-your-phone card.
- Slice 3: pass-and-play for two people on one phone, with its own handling of the assist.
- Slice 4: more battlefields and tools (driving with fuel, a bouncing shot), each one only once it is a real choice.
- Reef and Googly Faces using `shared/explosion.js`.
- Music settings beyond the site-wide mute.

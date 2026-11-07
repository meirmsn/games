# Reef: a fish game on the Fish Pack

**Go:** "Approve, open the PR" 2026-11-07; the changes after it approved in the chat the same day ("Approve as it stands", then the owner's two rounds of playtest requests) 2026-11-07

## Intent

The owner asked, in the session's chat on 2026-11-07: "get the fish pack and create a game … create
the whole setting, and it … looks very alive, and things are happening, are moving … then we need to
come up with a challenge … balance the challenge or difficulty … so that is not impossible but also
not easy, and the reward that you get so that you keep playing." The Fish Pack comes from the
private asset repo (`meirmsn/games-private`).

The game was built first and the decisions below were then put to the owner, who approved all of
them in the chat on 2026-11-07 ("Approve, open the PR"). This spec records that approval after the
fact. The surface is a new game page, `reef/`, plus a new tile on the landing page. The game has its
own look (a sea palette that is the same in light and dark), like any game page; the landing page
keeps the site's tokens.

## Decisions

- Core loop: eat the food fish, avoid the predators, fill the bar, then dive deeper. Rejected: a score-attack with a timer, which has no growth to reward you (owner, 2026-11-07).
- Food is told by colour, not by size: only orange, green and pink fish are food, and they are always smaller than you; everything else bites. Each predator has its own mark so the bad ones stand out: the blue one has a shark's jaws, the red one an anglerfish's glowing lure and long, narrow needle teeth, the grey one yellow lightning crackling through its body every second or so, and the pufferfish puffs up. Food fish have no mark. Rejected: food by relative size, which the owner found unclear in play (owner, 2026-11-07: "only the colorful ones … the bad ones should have something special each").
- Depths get longer as you go: 4 fish to clear the first, then 7, 11, 15, 20, and 5 more at each depth after that. The bar has a notch per fish. Rejected: a fixed amount of growth per depth, which made the first depth too long (owner, 2026-11-07: "the first level should be relatively quick … then the second one a little bit longer").
- Points per fish go with (its size / yours)², so bigger food is worth chasing (owner, 2026-11-07).
- Five depths, each looking very different from the one before, and bringing new fish: L1 Sunlit Shallows (bright turquoise, flat sand, light plants; pink and green food, blue predators), L2 Coral Garden (warm coral-pink water, packed with coral; orange food, pufferfish), L3 Kelp Forest (green water, towering kelp; red predators, eels that warn with bubbles first), L4 Twilight Slope (purple, a steep bare slope with rocks and no plants; grey predators), L5 The Deep (near black, the floor strewn with bones, lit only by your fish's glow). After that it carries on, slightly faster each time (owner, 2026-11-07: "make them very different … the terrain can be inclined … in another one you put like nothing … a lot of bones at the bottom").
- No written tips: you learn by doing (owner, 2026-11-07: "remove that initial box … Nobody reads"). The only card before play is a small start card at the bottom, over the live reef: a Start button, or a level code to type. After Start, the player's fish pulses softly until it is first moved, and nothing hunts it until then (owner, 2026-11-07: "before you hit start, it says, enter a level code or hit start").
- Level codes, as on old arcade machines: each depth from L2 has a code (L2 PEARL, L3 SQUID, L4 MANTA, L5 ABYSS, then DEEP6, DEEP7 …). The game-over card shows the code for the level you reached; typing it on the start card starts a fresh run (3 lives, no points) at that level. The start card also reminds you of your last code. Rejected: continuing automatically from the furthest level, which loses the arcade feel the owner asked for (owner, 2026-11-07).
- A bite is an event: the predator lunges and snaps, the screen shakes, the player loses a life and a notch, tumbles and swims to the safest spot on its own, then gets control back; the predator swims away off the screen (owner, 2026-11-07: "he bites you and then you swim automatically to safety"). The lost life makes a show of it in the HUD: the icon pops out about three times its size with a red glow, shakes as it turns to bones, and settles back, while the edges of the screen flash red (owner, 2026-11-07: "a bigger animation on the three lives so that it calls your attention").
- A big HUD: lives as large fish icons (skeletons for lost ones), a large score, a thick progress bar, and the level in large type with its number, as "L3 Kelp Forest" with the number in a small badge (owner, 2026-11-07: "the level name should be bigger … L1 and the name").
- A hidden assist (0 to 1) eases the game off when you struggle. Rejected: difficulty settings, which ask the player to judge themselves (owner, 2026-11-07). In full, as built and approved:
  - It rises by 0.3 when you're bitten, and falls a little with each fish eaten and with every second without danger.
  - Each new run keeps 60% of the last run's assist, plus a bonus: 0.25 for a new player's first two runs, 0.05 after that. A run never starts above 0.7. A first run starts at about 0.43.
  - It makes predators slower, gives them shorter sight and spawns fewer of them. It also slows the eels, lengthens their warning, spaces them further apart, and lengthens the calm before a hunter comes in.
- Pacing comes in waves: a hunter swims in after a long calm, and a school of small food fish passes by as a feast about every half minute. Combos (up to ×4), close-call bonuses, a life back at each depth and a saved best score are the rewards (owner, 2026-11-07).
- Touch steers by dragging anywhere (relative), so your finger never covers the fish; mouse follows the pointer; arrow keys and WASD also work (owner, 2026-11-07).
- Three lives. A pufferfish bump costs a notch, not a life (owner, 2026-11-07).
- Reef's tile goes first on the landing page, ahead of Googly Faces, which makes 7 tiles. This supersedes the six-tile layout in the decisions log (owner, 2026-11-07).
- Changed after the go, approved by the owner in the chat on 2026-11-07 ("Approve as it stands"): the assist decision spelled out in full, AC-12 changed from a screenshot review to a test, and AC-13 and AC-14 added (owner, 2026-11-07).
- Changed after the go, from the owner's playtest of the preview on 2026-11-07, in their words in the chat: food by colour with a mark for each predator, short first depths that grow longer, more distinct depths that keep bringing new fish, no title card, the bite and swim to safety, and a bigger HUD. These replace the earlier size-based eating, growth-based depth length and title card (owner, 2026-11-07).
- Changed after the go, from the owner's second playtest on 2026-11-07: the life-loss show in the HUD, worlds that differ more from their neighbours (the warm coral water, the bare slope, the bones), level codes with a small start card (which brings back a card before play, but only Start and the code, no tips), the level number and a bigger name, lightning through the grey fish instead of sparks around it, and needle teeth on the anglerfish (owner, 2026-11-07).
- The game's palette is its own: sea gradients per depth and the pack's yellow (#ffd23f) for buttons and highlights. The game has no dark theme, because the sea is its background (owner, 2026-11-07).

## Acceptance items

- **AC-1** The reef opens swimming behind the start card; Start begins L1; the player's fish waits for its first move and nothing bites it until then; no errors — `tests/reef.test.mjs`.
- **AC-2** Touching a food fish eats it: the score rises by (its size / yours)² and the bar moves one notch — `tests/reef.test.mjs`.
- **AC-3** A predator's bite costs a life; the third ends the run with the game-over card, whose Play again leads back to the start card, from which a run starts with 3 lives — `tests/reef.test.mjs`.
- **AC-4** Getting bitten raises the assist, and 10 s without danger lowers it — `tests/reef.test.mjs`.
- **AC-5** The last fish of a depth dives to the next, gives a life back (at most 3) and resets the bar — `tests/reef.test.mjs`.
- **AC-6** An eel warns for at least 1.3 s before it strikes, does no harm while warning, and catches a fish in its path — `tests/reef.test.mjs`.
- **AC-7** A pufferfish puffs up when you come close; bumping a puffed one stuns you and costs a notch, not a life — `tests/reef.test.mjs`.
- **AC-8** A long calm brings in a hunter; a feast is a school of at least 8 fish, all food — `tests/reef.test.mjs`.
- **AC-9** Dragging on a touch screen steers the fish — `tests/reef.test.mjs`.
- **AC-10** The reef plays offline once it has been played — `tests/reef.test.mjs`.
- **AC-11** The landing page shows 7 tiles, Reef first and playable — `tests/site.test.mjs`.
- **AC-12** The Deep is dark, with a glow around the player: the water near the player is clearly lighter than the water far from it at the same height — `tests/reef.test.mjs`.
- **AC-13** A new player's first run starts with the assist at 0.4–0.5, and a run after a hard one (assist 1) starts with 60% of it plus the bonus, capped at 0.7 — `tests/reef.test.mjs`.
- **AC-14** Each state shows only its own card and HUD, as in the state table — `tests/reef.test.mjs`.
- **AC-15** Orange, green and pink fish are food whatever their size; a predator bites whatever its size — `tests/reef.test.mjs`.
- **AC-16** Depths take 4, 7, 11, 15 and 20 fish, then 5 more each — `tests/reef.test.mjs`.
- **AC-17** After a bite the player swims to the safe spot on its own and then gets control back, and the predator swims away — `tests/reef.test.mjs`.
- **AC-18** Each depth brings its fish as listed in the decisions: blue, pink and green first; orange next; red at the Kelp Forest; grey at the Twilight Slope — `tests/reef.test.mjs`.
- **AC-19** The blue predator has jaws, the red one a lure (with needle teeth), the grey one lightning; they are drawn, and food fish draw no mark — `tests/reef.test.mjs`.
- **AC-20** Each level from L2 has its code (PEARL, SQUID, MANTA, ABYSS, then DEEP6 …); the game-over card shows the code for the level reached; typing a code on the start card, in any case, starts a run at that level, and a wrong code is refused with a message — `tests/reef.test.mjs`.
- **AC-21** Losing a life sets off the HUD's show for that life, which settles within 1.5 s — `tests/reef.test.mjs`.
- **AC-22** Each world's water colour differs clearly from its neighbours'; the Twilight Slope's floor rises across the screen and has no plants; the Coral Garden and Kelp Forest are overgrown; only The Deep has bones — `tests/reef.test.mjs`.

## Core flow

1. Tap the Reef tile: the reef is swimming behind a small start card.
2. Tap Start (or type a level code and Go).
3. Move your fish: eat the orange, green and pink fish, dodge the ones with marks.
4. Fill the bar: dive to the next level.
5. Lose the last life: see the score and your level code, then play again.

## States

| State | Start card | Game-over card | Lives, score, bar and level |
| ----- | ---------- | -------------- | --------------------------- |
| Start (the reef swims behind) | shown | hidden | hidden |
| Waiting for the first move (fish pulsing) | hidden | hidden | shown |
| Playing | hidden | hidden | shown |
| Diving to the next level | hidden | hidden | shown, under a wash of the deeper colour |
| Game over (a moment after the last life) | hidden | shown, with the score, the level reached and its code | shown |

## Out of scope

- Choosing your own fish, leaderboards, or a pause menu.
- Music settings beyond the site-wide mute.

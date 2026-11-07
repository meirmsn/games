# Reef: a fish game on the Fish Pack

**Go:** "Approve, open the PR" 2026-11-07; the changes after it approved in the chat the same day ("Approve as it stands", then the owner's playtest requests) 2026-11-07

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
- Food is told by colour, not by size: only orange, green and pink fish are food, and they are always smaller than you; everything else bites. Each predator has its own mark so the bad ones stand out: the blue one has jaws, the red one a glowing anglerfish lure, the grey one green electric sparks, and the pufferfish puffs up. Food fish have no mark. Rejected: food by relative size, which the owner found unclear in play (owner, 2026-11-07: "only the colorful ones … the bad ones should have something special each").
- Depths get longer as you go: 4 fish to clear the first, then 7, 11, 15, 20, and 5 more at each depth after that. The bar has a notch per fish. Rejected: a fixed amount of growth per depth, which made the first depth too long (owner, 2026-11-07: "the first level should be relatively quick … then the second one a little bit longer").
- Points per fish go with (its size / yours)², so bigger food is worth chasing (owner, 2026-11-07).
- Five depths, each looking clearly different and bringing new fish: Sunlit Shallows (bright, sand; pink and green food, blue predators), Coral Garden (turquoise, dense coral; orange food, pufferfish), Kelp Forest (green water, towering kelp; red predators, eels that warn with bubbles first), Twilight Reef (purple, rocky; grey predators), The Deep (dark except for your glow). After that it carries on, slightly faster each time (owner, 2026-11-07).
- No title card and no written tips: the game starts as the page opens, the player's fish pulses softly until it is first moved, and nothing hunts it until then. You learn by doing. The game-over card stays, with the score and a button to swim again (owner, 2026-11-07: "remove that initial box … Nobody reads").
- A bite is an event: the predator lunges and snaps, the screen shakes, the player loses a life and a notch, tumbles and swims to the safest spot on its own, then gets control back; the predator swims away off the screen (owner, 2026-11-07: "he bites you and then you swim automatically to safety").
- A big HUD: lives as large fish icons (skeletons for lost ones), a large score, and a thick progress bar (owner, 2026-11-07).
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
- The game's palette is its own: sea gradients per depth and the pack's yellow (#ffd23f) for buttons and highlights. The game has no dark theme, because the sea is its background (owner, 2026-11-07).

## Acceptance items

- **AC-1** The reef starts as the page opens, with no card; the player's fish waits for its first move and nothing bites it until then; no errors — `tests/reef.test.mjs`.
- **AC-2** Touching a food fish eats it: the score rises by (its size / yours)² and the bar moves one notch — `tests/reef.test.mjs`.
- **AC-3** A predator's bite costs a life; the third ends the run with a card offering to swim again, which restarts with 3 lives — `tests/reef.test.mjs`.
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
- **AC-18** Each depth brings its fish as listed in the decisions: blue, pink and green first; orange next; red at the Kelp Forest; grey at the Twilight Reef — `tests/reef.test.mjs`.
- **AC-19** The blue predator has jaws, the red one a lure, the grey one sparks; food fish have no mark — `tests/reef.test.mjs`.

## Core flow

1. Tap the Reef tile: the reef is already swimming.
2. Move your fish: eat the orange, green and pink fish, dodge the ones with marks.
3. Fill the bar: dive to the next depth.
4. Lose the last life: see the score and swim again.

## States

| State | Game-over card | Lives, score and progress bar |
| ----- | -------------- | ----------------------------- |
| Waiting for the first move (fish pulsing) | hidden | shown |
| Playing | hidden | shown |
| Diving to the next depth | hidden | shown, under a wash of the deeper colour |
| Game over (a moment after the last life) | shown, with the score and depth reached | shown |

## Out of scope

- Choosing your own fish, leaderboards, or a pause menu.
- Music settings beyond the site-wide mute.

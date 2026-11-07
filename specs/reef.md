# Reef: a fish game on the Fish Pack

**Go:** "Approve, open the PR" 2026-11-07

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

- Core loop: eat fish smaller than you, avoid bigger ones, grow, then dive deeper. It reads at a glance, and its risk grows on its own as you grow. Rejected: a score-attack with a timer, which has no growth to reward you (owner, 2026-11-07).
- A fish is worth (its size / yours)², in growth and in points. Small fish stop paying as you grow, so you have to take on fish near your own size (owner, 2026-11-07).
- Five depths, each one darker and adding one thing: Sunlit Shallows, Coral Garden (pufferfish), Kelp Forest (eels, which warn with bubbles first), Twilight Reef (dimmer), The Deep (dark except for your glow). After that it carries on, slightly faster each time (owner, 2026-11-07).
- A hidden assist (0 to 1) eases the game off when you struggle. Rejected: difficulty settings, which ask the player to judge themselves (owner, 2026-11-07). In full, as built and approved:
  - It rises by 0.3 when you're caught, and falls a little with each fish eaten and with every second without danger.
  - New players (the first two runs) start at about 0.3. Each new run keeps 60% of the last run's assist, plus a small bonus.
  - It makes predators slower, gives them shorter sight and spawns fewer of them. It also slows the eels, lengthens their warning, spaces them further apart, and lengthens the calm before a hunter comes in.
- Pacing comes in waves: a hunter swims in after a long calm, and a school of small fish passes by as a feast about every half minute. Combos (up to ×4), close-call bonuses, a life back at each depth and a saved best score are the rewards (owner, 2026-11-07).
- Touch steers by dragging anywhere (relative), so your finger never covers the fish; mouse follows the pointer; arrow keys and WASD also work (owner, 2026-11-07).
- Three lives. A pufferfish bump costs some growth, not a life (owner, 2026-11-07).
- Reef's tile goes first on the landing page, which now shows 7 tiles. This supersedes the six-tile layout in the decisions log (owner, 2026-11-07).
- The game's palette is its own: sea gradients per depth and the pack's yellow (#ffd23f) for buttons and highlights. The game has no dark theme, because the sea is its background (owner, 2026-11-07).

## Acceptance items

- **AC-1** The reef page opens on a title card over a live scene (fish swimming), and Play starts a game with no errors — `tests/reef.test.mjs`.
- **AC-2** Touching a smaller fish eats it: the score rises, and you grow by (its size / yours)² — `tests/reef.test.mjs`.
- **AC-3** Touching a bigger fish costs a life; the third ends the run with a card offering to swim again, which restarts with 3 lives — `tests/reef.test.mjs`.
- **AC-4** Getting caught raises the assist, and 10 s without danger lowers it — `tests/reef.test.mjs`.
- **AC-5** Growing all the way dives to the next depth, gives a life back (at most 3) and resets growth — `tests/reef.test.mjs`.
- **AC-6** An eel warns for at least 1.3 s before it strikes, does no harm while warning, and catches a fish in its path — `tests/reef.test.mjs`.
- **AC-7** A pufferfish puffs up when you come close; bumping a puffed one stuns you and costs growth, not a life — `tests/reef.test.mjs`.
- **AC-8** A long calm brings in a hunter; a feast is a school of at least 8 fish, all edible — `tests/reef.test.mjs`.
- **AC-9** Dragging on a touch screen steers the fish — `tests/reef.test.mjs`.
- **AC-10** The reef plays offline once it has been played — `tests/reef.test.mjs`.
- **AC-11** The landing page shows 7 tiles, Reef first and playable — `tests/site.test.mjs`.
- **AC-12** The darkness of The Deep, with a glow around the player — verified by review: the screenshot "The Deep" on the PR.

## Core flow

1. Tap the Reef tile, then Play.
2. Swim: eat smaller fish, dodge bigger ones, grow.
3. Grow full: dive to the next depth.
4. Lose the last life: see the score and swim again.

## Out of scope

- Choosing your own fish, leaderboards, or a pause menu.
- Music settings beyond the site-wide mute.

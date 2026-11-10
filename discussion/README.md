# Game ideas — discussion

The working notes for choosing which games to build for this site. The games use art and sound from [Kenney](https://www.kenney.nl)'s CC0 asset packs. The preview images here are Kenney's pack previews (CC0), shown as thumbnails.

**Start here:** [Direction: the owner's notes](direction.md), the guiding principles and the ideas on the owner's radar. Then [Game guidelines](game-guidelines.md), what makes a game amazing here, and the check every concept passes before it's built.

## Asset galleries

- [2D asset packs](gallery-2d.md): 160 packs of sprites, tilesets and characters
- [3D asset kits](gallery-3d.md): 56 kits, almost all with web-ready GLB models
- [UI, icons, audio and other](gallery-ui-icons-audio.md): UI kits, input prompts, 16 sound packs and fonts

## What we have, at a glance

| Category | Packs | Notes for browser games |
|---|---|---|
| 2D | 160 | PNG sprites; many include spritesheets. Covers platformer, top-down, isometric, pixel art, cards, board games and puzzles. |
| 3D | 54 + 2 early access | GLB models that load straight into three.js. The animated character packs are FBX only and would need converting. |
| UI | 10 | Buttons, panels and on-screen mobile controls; one sci-fi UI pack includes fonts. |
| Icons | 8 | Game icons and keyboard/gamepad/touch input prompts. |
| Audio | 16 | About 1,400 OGG files: UI clicks, impacts, retro sounds, sci-fi, jingles, music loops and voiceovers. |

**License:** everything is CC0, so each game can include the files it uses. We'll credit Kenney on the site anyway.

## Game ideas

Ratings: **Difficulty** is how much work it is to build well. **Phone** is how well it plays on a touchscreen.

### 1. Sky Hopper (One-tap flyer)

<img src="previews/2d--tappy-plane.png" width="240">

Tap to flap, slip through gaps, beat your best distance.

- **Assets:** Tappy Plane
- **Difficulty:** Easy · **Phone:** Great

### 2. Star Patrol (Vertical space shooter)

<img src="previews/2d--space-shooter-remastered.png" width="240"> <img src="previews/2d--space-shooter-extension.png" width="240">

Drag to steer the ship and auto-fire; waves of enemies, power-ups and a boss.

- **Assets:** Space Shooter Remastered, Space Shooter Extension
- **Difficulty:** Easy–Medium · **Phone:** Great

### 3. Box Pusher (Sokoban-style puzzle)

<img src="previews/2d--sokoban-pack.png" width="240">

Swipe to push crates onto targets; 20–30 hand-tuned levels with undo.

- **Assets:** Sokoban Pack
- **Difficulty:** Easy · **Phone:** Great

### 4. Solitaire Table (Card game)

<img src="previews/2d--playing-cards-pack.png" width="240">

Klondike first, with FreeCell or Spider later on the same card engine.

- **Assets:** Playing Cards Pack
- **Difficulty:** Easy–Medium · **Phone:** Good

### 5. Word Tiles (Word puzzle)

<img src="previews/2d--letter-tiles-redux.png" width="240">

Build words from a rack of letter tiles against the clock (needs a word list).

- **Assets:** Letter Tiles Redux
- **Difficulty:** Medium · **Phone:** Great

### 6. Gem Swap (Match-3)

<img src="previews/2d--puzzle-pack-2.png" width="240">

Swap neighbouring pieces to make rows of three, with cascades and combos.

- **Assets:** Puzzle Pack 2
- **Difficulty:** Medium · **Phone:** Great

### 7. Pixel Leap (Side-scrolling platformer)

<img src="previews/2d--pixel-platformer.png" width="240"> <img src="previews/2d--pixel-platformer-farm-expansion.png" width="240">

Run, jump and collect across several short levels; on-screen buttons on phones.

- **Assets:** Pixel Platformer, Pixel Platformer Farm Expansion
- **Difficulty:** Medium · **Phone:** OK (needs touch controls)

### 8. Tank Arena (Top-down arena shooter)

<img src="previews/2d--topdown-tanks-remastered.png" width="240">

Twin-stick tank battles against AI waves.

- **Assets:** Topdown Tanks Remastered
- **Difficulty:** Medium · **Phone:** OK (twin-stick)

### 9. Knock 'Em Down (Physics launcher)

<img src="previews/2d--physics-assets.png" width="240">

Pull back and fling projectiles to topple block towers.

- **Assets:** Physics Assets
- **Difficulty:** Medium · **Phone:** Great

### 10. Tiny Delve (Turn-based roguelike)

<img src="previews/2d--tiny-dungeon.png" width="240">

Explore generated dungeon floors one step at a time: loot, monsters, permadeath.

- **Assets:** Tiny Dungeon
- **Difficulty:** Medium–Hard · **Phone:** Great (turn-based)

### 11. Path Defense (Tower defense)

<img src="previews/2d--tower-defense.png" width="240"> <img src="previews/3d--tower-defense-kit.png" width="240">

Place and upgrade towers along a path to stop enemy waves. Comes in 2D or 3D.

- **Assets:** Tower Defense, Tower Defense Kit
- **Difficulty:** Medium · **Phone:** Good

### 12. Putt Putt 3D (3D minigolf)

<img src="previews/3d--minigolf-kit.png" width="240">

Drag back to aim and set power; nine holes built from the kit's modular track pieces.

- **Assets:** Minigolf Kit
- **Difficulty:** Medium · **Phone:** Great

### 13. Marble Run (3D tilt maze)

<img src="previews/3d--marble-kit.png" width="240">

Tilt the phone, or use the arrow keys, to roll a marble along tracks without falling off.

- **Assets:** Marble Kit
- **Difficulty:** Medium · **Phone:** Great (tilt)

### 14. Toy Racer (3D arcade racer)

<img src="previews/3d--toy-car-kit.png" width="240">

Toy cars on desk-top tracks, against the clock or AI.

- **Assets:** Toy Car Kit
- **Difficulty:** Hard · **Phone:** OK

### 15. Little Town (Cozy builder)

<img src="previews/2d--tiny-town.png" width="240">

Place houses, roads and trees on a grid to grow a small town with simple goals.

- **Assets:** Tiny Town
- **Difficulty:** Hard · **Phone:** Good

## My suggestion for the first round

Superseded by [the owner's direction](direction.md): start with 2D games, isometric included, and aim for variety. We'll choose the first pair from those ideas.

## How each game will be built

- Each game is a self-contained folder in the `games` repo, e.g. `googly-faces/`, with only the assets it uses copied in.
- Plain HTML/JS, with a small library only where a game needs one (e.g. Phaser for 2D, three.js for 3D). There's no build step: Cloudflare serves the repo's files as they are.
- The landing page is a grid of game tiles. Each game has a back button to the landing page.
- Touch first: phone, then tablet, then desktop with mouse and keyboard.
- The site is a PWA with a manifest and a service worker, so it installs to the home screen and works offline once loaded.

## Decisions log

- **2026-11-05:** variety across game types is the main driver; mix short-form and long-form games; every game needs sound, good performance, a special hook and an elegant feel.
- **2026-11-05:** touch first (phone, then tablet, then desktop); every game runs in the browser and the site installs as a PWA.
- **2026-11-05:** the landing page shows 6 tiles (two rows of three on wide screens): Googly Faces, Pixel Leap, Shooting Gallery, High Seas, Runes and Orbit (Runes, a puzzle with the Rune Pack, replaced Marble Machine). Upcoming games are dimmed "Coming soon" tiles. The names are working titles. *(Superseded on 2026-11-07: Reef's tile went first, so the page shows 7 tiles.)*
- **2026-11-05:** the first game is **Googly Faces**: tap-only and sound-led, to play with a child. The Shooting Gallery comes later.
- **2026-11-05:** start with 2D games. Isometric games use the same 2D engine for now; 3D comes later.
- **2026-11-06:** hosting is Cloudflare (Workers static assets, connected through the Cloudflare GitHub app), which the owner chose for its preview link on every PR. The site stays plain HTML, CSS and JS with no build step, and sounds are MP3 because Safari doesn't play OGG.
- **2026-11-06:** the site lives only at **https://games.meirmsn.dev**, a Cloudflare custom domain set for production and previews. Each PR's preview is at `<branch>.games.meirmsn.dev`. The workers.dev addresses are off, in the dashboard and in `wrangler.jsonc`, so there's one address and nobody installs a duplicate app.
- **2026-11-06:** **Googly Faces** is the first playable game. It's drawn on one canvas with no library: the pupils are hand-rolled physics (gravity, the eye's own movement, bouncing off the rim and rolling to rest), and they follow the device's tilt where motion sensors are available. A round is twelve faces, counted by coloured dots rather than numbers, and ends with a small party and a play-again button. Its 22 short sounds are pops, boings, giggly squiggles, squeaks and a closing jingle, each played at a slightly varied pitch. The bodies use the pack's double-size PNGs, because the default ones look blurry on phone screens.
- **2026-11-07:** after playing it, the owner asked for three changes to **Googly Faces**: the landing tile now shows faces drawn by the game itself (`scripts/make-tile.mjs`), so it looks like the game; a dot that fills swells and pushes the row aside before settling, so each tap visibly changes the counter without any explaining; and a tap on the background makes every eye look at it. Then, on the owner's next ask, the eyes keep following the pointer (a mouse as it moves, a finger as it slides) for about two seconds after that tap, before rolling loose again.
- **2026-11-07:** the second playable game is **Reef** (`reef/`), built on the **Fish Pack** at the owner's request. After playing the first version, the owner shaped it into: food told by colour (golden, green and pink fish are food), a mark for each predator (blue jaws, a red anglerfish lure, grey lightning crackling through its body, the pufferfish puffing up), depths of 4, 7, 11, 15 and 20 fish and then 5 more each, five depths that each look clearly different and bring new fish, no title card or tips (you learn by doing), and a bite that sends the player fleeing to safety on its own. After a second playtest: level codes shown on the game-over card and typed on a small start card (arcade style), worlds that differ more from their neighbours (warm coral water, a bare inclined slope, a floor of bones), a big show in the HUD when a life is lost, and the level's number next to its name. After a third: no pufferfish at L1, level codes without the W, A, S and D steering keys and no reminder of the last one, golden food fish so they can't be mistaken for the player, and currents. After a fourth: level codes that stay stable across versions (old codes kept), a clearer bite sound, and a slower progression over eight levels. Its tile goes first on the landing page, ahead of Googly Faces, which makes 7 tiles. The decisions and the owner's go are in [specs/reef.md](../specs/reef.md).
- **2026-11-09:** [game guidelines](game-guidelines.md) written and adversarially reviewed. The next games are built in parallel, one session each. Each session checks its concept against the guidelines, attacks it, and then builds without asking the owner. They merge one at a time: a branch takes in the latest `main` and opens its PR only when its turn in the queue comes, so CI isn't rerun on every branch after each merge. The decisions are in [specs/game-guidelines.md](../specs/game-guidelines.md).
- **2026-11-09:** **Walk on Red** is playable (`walk-on-red/`), on the **Pixel Vehicle Pack**, from the owner's lane-crossing seed ("Frogger style": the genre, not that game). A first concept, Tag Along (a crossing guard leading a line of followers), was built and played; the owner found it weird and too hard and proposed a man who crosses on red. Two adversarial reviews attacked 20 alternatives and picked a version of it, which the owner chose and then shaped over many playtests into the game as it is: he needs the loo, the porta-potty is across the street, and the walk light is red. You hop on a nine-column zebra crossing (the only part of the street shown, the same upright view on every screen) through traffic that obeys its own lights, which turn yellow and red as the walk light counts down. Reaching the far kerb fixes the seconds left; in he goes, the door shuts, the owner's own flush recording plays, and the rest of the light runs at 20 times speed under the game's rules, the seconds counting into points. On green, everyone left crosses at normal speed under a small score table: the seconds, the people who followed you on red (each worth the seconds again), anyone relieved too, and the total. There are 21 levels: on levels 1–7 nobody follows while the traffic builds (every level starts with its traffic already driving and a car passing in front of him); from level 8, on calmer traffic, people chosen by chance stick to him and walk exactly in his footsteps, so whether they make it is down to his timing; two follow from level 11, three from 15, and the last five are the hardest; from level 10 the last follower needs the loo too and goes in after him for a bonus. A car hitting him sends him back to the start, his followers with him; a follower hit is gone. Everything is 8-bit: the score table, the count-up and the pop-ups are drawn in the street's own pixels, and the page's cards, banner and HUD use Kenney's pixel font Kenney Mini Square. Too slow scores 0 and replays the level. Its tile goes after Googly Faces, which makes 8 tiles. The decisions, and each playtest's words, are in [specs/walk-on-red.md](../specs/walk-on-red.md).
- **2026-11-10:** **Walk on Red** is renamed **Gotta Go!**, the owner's pick from four child-friendly names, after they asked for "a funnier name … Keep it child friendly, cute, but funny". Its landing tile is now a close-up of the porta-potty and a little walkway, drawn by the game, with no cars (owner: "it's showing the cars on the left and the right. So can you make a zoom"). The folder and URL stay `walk-on-red/`, so links, offline copies and best scores keep working.
- **2026-11-09:** **Orbit** (`orbit/`) is playable, built on the **Planets** pack with a faint **Skyboxes Space** nebula over pitch black. A tiny spaceship circles a planet; you set the boosters on a coloured bar and tap as it comes round, and it leaves along its orbit, so the timing aims it. Gravity bends it round the other planets, and the next planet's ring catches it only if it arrives moving along the ring, slowly enough, without touching a planet. Three systems of four jumps bring planets alone, then a big planet to swing round, then moons. Swinging round another planet on the way earns a slingshot bonus. A miss rewinds the jump in under a second; each system has 10 probes, counting down above the bar. Stardust lies on the routes that take skill, and each system ends with a medal against a par of launches. The concept went through two adversarial reviews and the spec through one, under the owner's go to build without consulting; five playtests by the owner then shaped the controls, the look and the catch (no brake, no aiming line, touching a planet always crashes). The decisions are in [specs/orbit.md](../specs/orbit.md).

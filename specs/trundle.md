# Trundle: a contraption puzzle with a robot

**Go:** "don't consult with me, just start building after following this process" 2026-11-09

## Intent

The owner asked, on 2026-11-09, for the batch of games: "review the game concept against the
guidelines and propose something that works, and then do adversarial review … so that you have
solid concepts of the game and then build them … don't consult with me, just start building after
following this process." Their seed for this one: a physics-driven game, "**Rolling Ball Assets** is
a favourite for this. Possible directions: **pinball**, or a **Rube Goldberg / Incredible
Machine-style** contraption puzzle"; Physics Assets adds blocks and other parts; the owner wants the
**Robot Pack** robot as a character, and this game is its home. It must feel different from Orbit,
the batch's other physics game (gravity in space). The assets come from the private asset repo
(`meirmsn/games-private`).

The owner has played it twice since:

- After the first build (place parts, then watch one ball), on 2026-11-09: "you should also lock the
  levels and only allow you to proceed to the next one … something feels bland about the game …
  think about 10 different directions … and then use adversarial review to pick the one that
  follows the guidelines the best, and it's fun." The review picked a live machine (rebuild the
  machine while the balls fall), and the owner chose it on 2026-11-10 ("Reviewer's pick").
- After playing the live machine, on 2026-11-10: "Think about 10 alternatives that will make this
  game fun. Currently, it's actually very non-intuitive, very complex. It's not clear what you're
  supposed to do. But there's something special about the physics. Then use an adversarial review
  to pick out of the 10 and build that." A fresh adversarial review of ten alternatives picked
  flip switches with colour cups, and this spec builds that.

The surface is a game page, `trundle/`, plus a playable tile on the landing page. The game has its
own look (the Rolling Ball pack's colours on a workshop wall), the same in light and dark, like any
game page; the landing page keeps the site's tokens. This is the first slice of the game (see Out of
scope).

**Hook:** tap the green planks to roll Trundle's balls into the cup of their colour.

**Concept check** (the game guidelines, `discussion/game-guidelines.md` on branch
`claude/tender-knuth-m0cjxj` until it merges):

- Verb: tap a plank and it snaps to its other angle, with a clack; a ball on it is flicked.
- A typical 5-second choice: flip the plank now, so the falling ball rolls the other way, or wait
  until the ball is on it and flip it under the ball, to throw it over a gap.
- How it teaches: the room opens already running, so the first ball rolls off the wrong way; each
  plank shows a faint ghost of its other position and a bolt, and pulses at first; one tap and the
  next ball rolls into the cup. Each room adds one thing. No written tips.
- Three clocks: a ball drops every 2.5 s; a new rule every room; the floor run after eight rooms,
  the stars per room and the next floor bring you back.
- What an expert does: sets the planks for the next ball while this one is still falling, flicks
  balls across gaps, loses none and takes the star.
- The tenth play differs: the star and "no balls wasted" need a different, sharper line through the
  same room.
- Short-form: an attempt is 10–20 s, a room under a minute, a floor about 10 minutes.
- Portrait: balls fall down the long side; one thumb taps.
- A failure costs one attempt, under 20 s, and you watched why.
- Save games: rooms open one by one, as each is solved; the browser keeps each room's best stars and
  attempt; `#1-4` in the URL opens a room you've reached.
- Riskiest part: the flick (a ball thrown by a turning plank) staying deterministic. Proved first: a
  flipped plank gives a touching ball its surface speed, and a test replays every room's recorded
  taps at 60 Hz, 120 Hz and uneven frames, step for step the same.

**Targets:** first ball in a cup within 10 s of opening room 1; first ball lost before any touch (the
room opens with its plank the wrong way); first new element by about 1 minute (room 2's cascade).

## Decisions

- Flip switches with colour cups, from ten alternatives and an adversarial review, on the owner's
  instruction to build the pick (owner, 2026-11-10: "use an adversarial review to pick out of the 10
  and build that"). It scored highest on being clear at first sight, on the verb, on keeping the
  physics central and on being buildable. Rejected: drawing planks (a blank screen says nothing, and
  it's close to drawing games), tilting one shelf (too thin for eight rooms; its colour cups were
  kept), a catcher, plinko, pulling pins, gravity flips, a bulldozer, a bounce pad and a sorter
  conveyor.
- One gesture: tap a plank. It snaps between its two angles over about 67 ms, and a tap goes to the
  nearest plank within 40 px. Nothing else on the board takes a tap: no tray, no buttons, and
  Trundle isn't tappable. Desktop: a click, or the keys 1–3 for the planks; R retries.
- The flick: a ball touching a plank as it flips takes the plank's surface speed where it touches.
  Rejected: turning a static plank alone, which teleports it and throws nothing (proved with a test
  before building).
- A room: Trundle stands on, or drives along, his yellow girder and drops the room's balls one every
  2.5 s, red and blue in a set order; the balls still to drop wait in a row beside him, so the next
  colour shows. Each cup has a colour and a number of slots, drawn under it. A ball in its own cup
  fills a slot; a ball in the wrong cup, out of the room, or resting for 1.2 s (3 s on a plank,
  waiting for a flick) is lost. The room is done when every slot is full; the attempt ends as soon
  as a cup can no longer be filled, and Retry starts again.
- Stars, shown before they're earned: one for clearing the room, one for losing at most one ball,
  one for a ball touching the room's star. The room card says which were earned and why.
- Colour is the rule book, from the Rolling Ball pack: green planks are yours to flip, yellow blocks
  are fixed, the blue flap swings when hit, wood is loose, the cups and balls are red or blue, and a
  gold key opens a locked cup.
- Floor 1, "The Workshop", is eight rooms, each adding one thing: 1 one plank; 2 two planks in a
  cascade; 3 Trundle patrols, so balls land on different planks; 4 red and blue balls and two cups;
  5 the flick, over a gap; 6 a blue flap that only a fast ball opens; 7 a crate on a plank, tipped
  into a gap so the balls can jump it; 8 a locked cup, opened by the first ball past the key, with
  colours, a patrol and two planks.
- Physics: Matter.js 0.20.0, vendored (MIT). An attempt rebuilds the world from scratch and resets
  Matter's id counter, then steps at a fixed 1/120 s whatever the display rate, at most 8 steps a
  frame. Balls slide without friction (the drawing spins them); their speed is capped. Every tap is
  applied at the next step and logged, so an attempt replays exactly.
- The floor run: solving room 8 replays each room's best attempt in order, twice as fast as life,
  the camera moving down from room to room, and ends on floor 2's locked door. It re-runs the logged
  taps, which is exact on the same browser.
- Rooms open one by one, each once the room before it is solved; the rooms list shows a padlock on
  the others. The URL hash `#1-1` to `#1-8` opens that room once reached; a locked room, anything
  else or no hash opens the furthest room reached (owner, 2026-11-09: "you should also lock the
  levels and only allow you to proceed to the next one").
- Storage: each room's best stars and attempt in localStorage under a versioned key, one key per
  room; every access guarded, so with storage blocked progress lasts until the page reloads, and an
  unreadable room starts fresh without touching the others.
- Hidden assist: from the 4th failed attempt in a room, its cups are 5% wider per failed attempt, up
  to 20%; it resets when the room is done or the page reloads. The recorded solutions pass without
  it.
- The rooms' solutions were found with a solver (`scripts/trundle/design.mjs`) that plays a ball at
  a time, trying every combination of plank states before each drop and a flick while it falls.
- Sound: Kenney's impact, interface, digital and jingle sounds, converted to MP3 (Safari plays no
  OGG), under the site-wide mute: a flip's clack, a flick, a ball's drop, hits, a ball in a cup, a
  lost ball's pop, the star, the room's jingle.
- The tile goes after Googly Faces, before the coming-soon tiles, making 8 tiles. This supersedes
  the 7 tiles of Reef's AC-11: the site tests count 8, and `sw.js` caches the new tile picture, with
  its VERSION bumped (Claude, 2026-11-09).
- Changed after the go, by the owner: flip switches replace the live machine, from the owner's
  playtest and instruction (owner, 2026-11-10); the live machine had replaced the first build (owner,
  2026-11-09 and 2026-11-10); rooms lock and open one by one (owner, 2026-11-09). Every acceptance
  item below is rewritten for flip switches under that instruction (owner, 2026-11-10). AC-1's test
  is in `tests/trundle.test.mjs` (owner, "Approve both", 2026-11-09).

## Acceptance items

- **AC-1** The landing page shows 8 tiles, Trundle's playable and linking to `trundle/` — `tests/trundle.test.mjs`.
- **AC-2** A room opens running before any touch: Trundle drops a ball within 1 s and another every 2.5 s, and in room 1 the first ball, untouched, is lost; no errors — `tests/trundle.test.mjs`.
- **AC-3** A tap on or within 40 px of a plank flips it to its other angle, and a tap elsewhere flips nothing; keys 1–3 flip the planks too — `tests/trundle.test.mjs`.
- **AC-4** A ball resting on a plank is thrown when the plank flips under it, and lands in the same place every time — `tests/trundle.test.mjs`.
- **AC-5** A ball in a cup of its colour fills one of its slots; a ball in a cup of the other colour is lost — `tests/trundle.test.mjs`.
- **AC-6** Every room's recorded taps fill every cup and take all three stars, with no assist, and every ball's pose at every step is the same when the page's frame loop is driven at 60 Hz, at 120 Hz and with uneven frames of 7–40 ms; with no taps every room's attempt fails — `tests/trundle.test.mjs`.
- **AC-7** When every slot is full the room is done, Trundle cheers, and the card shows the stars and which were earned; when a cup can no longer be filled the attempt ends with Retry — `tests/trundle.test.mjs`.
- **AC-8** Each room brings its new thing: room 2 two planks, room 3 a patrol, room 4 two colours, room 5 a flick that lands a ball in the cup, room 6 a flap that only the steep route opens, room 7 a crate that drops into the gap, and room 8 a cup that stays locked until a ball touches the key — `tests/trundle.test.mjs`.
- **AC-9** Solving room 8 plays the floor run: each room's best attempt replayed in order, faster than life, with the camera moving down from room to room, then the floor's star total; after a reload the rooms list plays it again — `tests/trundle.test.mjs`.
- **AC-10** On a fresh browser only room 1 is open, and solving a room opens the next; the browser keeps each room's best stars and attempt, and a win with fewer stars keeps the best; with storage blocked or a room's saved data unreadable the game still plays; a hash opens a room reached, and one for a locked room, `#1-9` or `#x` opens the furthest room reached — `tests/trundle.test.mjs`.
- **AC-11** Hiding the page pauses an attempt or the floor run; it stays paused when the page comes back and resumes on a tap — `tests/trundle.test.mjs`.
- **AC-12** From the 4th failed attempt in a room its cups are 5% wider per failed attempt, up to 20%, and back to normal once the room is done — `tests/trundle.test.mjs`.
- **AC-13** At 360×640, 390×844 and 1280×720 the board fits under the top bar with no scrolling and keeps its portrait shape, and every button is at least 44 px — `tests/trundle.test.mjs`.
- **AC-14** A ball at its top speed dropped onto a plank lands on it and doesn't pass through — `tests/trundle.test.mjs`.
- **AC-15** Once the game has been opened at room 1, room 8 plays offline — `tests/trundle.test.mjs`.
- **AC-16** A flip, a ball's drop, a hit, a ball in a cup, a lost ball and the star each play a sound; a resting contact doesn't repeat its sound within 100 ms; nothing plays while muted — `tests/trundle.test.mjs`.

## Core flow

1. Tap the Trundle tile: room 1 opens running, and the first ball rolls off the plank the wrong way.
2. Tap the plank: it flips, and the next balls roll into the red cup.
3. Every slot full: Trundle cheers, the card shows the stars, Next opens room 2.
4. After room 8, watch the floor run through every room you solved.

## States

| State | Board | Room card (stars, Retry, Next) | Retry card | Floor run card | Rooms list |
| ----- | ----- | ------------------------------ | ---------- | -------------- | ---------- |
| Running (a room just opened, or retried) | balls falling, planks flip on a tap | hidden | hidden | hidden | hidden |
| Out of balls (a cup can't be filled) | the balls' trails | hidden | shown | hidden | hidden |
| Room done | Trundle cheering | shown | hidden | hidden | hidden |
| Floor run | the camera moves down the rooms, replaying each | hidden | hidden | shown at the end, with the floor's stars | hidden |
| Rooms list (the rooms button) | dimmed behind, the attempt waiting | hidden | hidden | hidden | shown: the eight rooms with their stars (a padlock on the ones not reached), and the floor run button once earned |

## Out of scope

- This is slice 1 of 3. Slice 2: floor 2, "The Boiler Room": bumpers, springs, buttons that open
  gates, a second hopper. Slice 3: floor 3, "The Lab": lasers that pop balls, glass that breaks,
  TNT, and sharing an attempt as a link.
- A level editor, leaderboards, accounts, or music.

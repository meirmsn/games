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

After playing the first build (place parts, then watch one ball), the owner said on 2026-11-09: "you
should also lock the levels and only allow you to proceed to the next one … something feels bland
about the game … I wonder if we could make it so that what you actually get is the robot to walk and
collect the stars … Maybe the robot will always release the ball … After 3 seconds, so that now
you're dealing with two physics … think about 10 different directions … and then use adversarial
review to pick the one that follows the guidelines the best, and it's fun." Ten directions went to
an adversarial review, which picked a live machine, and the owner chose it on 2026-11-10
("Reviewer's pick").

The surface is a game page, `trundle/`, plus a playable tile on the landing page. The game has its
own look (the Rolling Ball pack's colours on a workshop wall), the same in light and dark, like any
game page; the landing page keeps the site's tokens. This is the first slice of the game (see Out of
scope).

**Hook:** Trundle, a little robot, patrols the top of each room dropping a ball every three seconds,
and you rebuild the machine under the falling balls with your thumb, to get them into the exit.

**Concept check** (the game guidelines, `discussion/game-guidelines.md` on branch
`claude/tender-knuth-m0cjxj` until it merges):

- Verb: drag a plank into the stream of balls and watch them bounce off it at once; turn it; turn
  Trundle around.
- A typical 5-second choice: Trundle is heading for the far end, where the drop misses everything:
  turn him back, or move the plank under where he's going. Either works; the plank also costs you
  the ball it was catching.
- How it teaches: a room opens already running, so the first balls fall into the void until you
  act; room 1 has one plank and a parked Trundle; each room after adds one thing; no written tips.
- Three clocks: a ball lands every 3 s; a new part or rule every room; the floor run after eight
  rooms, the stars per room and the next floor bring you back.
- What an expert does: saves more balls than the quota, takes all three stars, and moves less.
- The tenth play differs: the patrol and the room state (a crate knocked off, a key touched) change
  between balls, so a layout that worked for ball 1 can fail ball 4.
- Short-form: an attempt is about 30 s, a room 1–3 min, a floor about 15 min.
- Portrait: balls fall down the long side; one thumb.
- A failure costs one attempt, about 30 s; the parts stay put, and the balls' trails show where they
  went.
- Save games: rooms open one by one, as each is solved; the browser keeps stars, the last layout and
  the best attempt per room; `#1-4` in the URL opens a room you've reached.
- Riskiest part: live edits inside a deterministic replay. Every edit is applied at a fixed-step
  tick and logged, and a test replays every room's recorded solution at 60 Hz, 120 Hz and uneven
  frames, step for step the same.

**Targets:** first ball in the exit within 15 s of opening room 1; first failed attempt within the
first minute (the room opens running, with nothing placed); first new element by about 2 minutes
(room 2's patrol).

## Decisions

- The live machine, from ten directions and an adversarial review (owner's choice, 2026-11-10,
  "Reviewer's pick"). It beat the owner's own two-body idea (Trundle driving over your planks
  collecting stars, one ball after 3 s), which keeps the place-and-watch verb the owner found bland,
  and a robot climbing loose planks is the least readable physics of the ten. What survives of that
  idea: Trundle moves on his own, the ball drops every 3 s, and there are two paths to manage (his
  patrol and the balls). Rejected also: drawing the track (close to other drawing games), tilting
  the room (Reef's steering verb), pinball flippers (the build stops mattering).
- A room: Trundle drives back and forth along a yellow girder at the top and drops a ball from his
  hopper every 3 s, 8 balls in all. A room needs a quota of them in the exit (5 of 8; room 1, 3 of
  6). Balls collect the stars, and a star stays taken for the rest of the attempt. A ball is lost
  when it leaves the room, or rests or rocks in one place for 1.2 s, when it pops. The attempt ends
  once every ball is in the exit or lost: at or above the quota the room is done; it also ends as
  soon as the quota can no longer be reached. A failed attempt shows Try again; the parts stay.
- A room opens running: Trundle starts patrolling and the first ball drops after 1 s, before any
  touch. Restart (the Go button's place) starts a new attempt with the parts where they are.
- Live editing: you drag parts from the tray, move them and turn them while balls fall. A part being
  dragged is a ghost the balls pass through. Let go (or turned) on top of a ball, it stays a ghost,
  flashing, until no ball overlaps it, then turns solid; so a part never launches a ball. A drop that
  overlaps a fixed part, Trundle's girder, the exit, a star or the key is refused.
- Tapping Trundle (a hit area of at least 64 px) turns him around. Every edit and turn is applied at
  the next physics step and logged with its step number, so an attempt replays exactly.
- Colour is the rule book, from the Rolling Ball pack: green parts are yours, yellow parts are fixed,
  blue parts swing when hit, wood is loose (it falls and can be knocked away), balls are red, stars
  are optional and a gold key opens a locked exit.
- Physics: Matter.js 0.20.0, vendored (MIT). An attempt rebuilds the world from scratch and resets
  Matter's id counter, then steps at a fixed 1/120 s whatever the display rate, at most 8 steps a
  frame. Balls slide without friction (the drawing spins them), as Matter's friction stopped a
  rolling ball within a unit or two; their speed is capped; parts are at least 0.6 units thick.
- Floor 1, "The Workshop", is eight rooms, each adding one thing: 1 Trundle parked, one plank; 2 he
  patrols, so the drop point moves; 3 tap to turn him; 4 the wedge and a gap; 5 the blue flap that
  only a fast ball opens; 6 a wooden crate on the exit, knocked off by early balls; 7 a locked exit
  and a gold key a ball must touch; 8 two exits and everything together.
- The floor run: solving room 8 replays each room's best attempt in order, three times faster than
  life, the camera moving down from room to room, and ends on floor 2's locked door. It re-runs the
  logged attempt (the room, the starting layout and the timed edits), which is exact on the same
  browser. Each room keeps its best attempt (most stars, then most balls in; a tie goes to the
  latest).
- Rooms open one by one, each once the room before it is solved; the rooms list shows a padlock on
  the others. The URL hash `#1-1` to `#1-8` opens that room once reached; a locked room, anything
  else or no hash opens the furthest room reached (owner, 2026-11-09: "you should also lock the
  levels and only allow you to proceed to the next one").
- Storage: stars, the layout and the best attempt per room in localStorage under a versioned key,
  one key per room; every access guarded, so with storage blocked progress lasts until the page
  reloads, and an unreadable room starts fresh without touching the others.
- Hidden assist: from the 4th failed attempt in a room, each exit takes a ball from 5% further away
  per failed attempt, up to 20%; it resets when the room is done or the page reloads. No pull force,
  so nothing visibly steers a ball. The recorded solutions pass without it.
- The stars and solutions were found with a solver (`scripts/trundle/design.mjs`) that searches
  layouts and timed turns of Trundle, and places stars off the easy line, where few winning
  attempts pass.
- Desktop: mouse drag, wheel or Q/E to turn the selected part, arrow keys to nudge it, Delete to
  send it back, T to turn Trundle, Space to restart, N for the next part, Escape to let go of the
  selected part (it leaves the game only when nothing is selected). A second finger is ignored.
- Sound: Kenney's impact, interface, digital and jingle sounds, converted to MP3 (Safari plays no
  OGG), under the site-wide mute: the hopper's drop, hits (at most once per pair every 100 ms), a
  star, a ball in the exit, a lost ball's pop, the room's jingle.
- The tile goes after Googly Faces, before the coming-soon tiles, making 8 tiles. This supersedes
  the 7 tiles of Reef's AC-11: the site tests count 8, and `sw.js` caches the new tile picture, with
  its VERSION bumped (Claude, 2026-11-09).
- Changed after the go, by the owner: the live machine replaces the first build's place-then-watch
  rooms (6 rooms, one ball, a soft or hard kick, a demo kick, the floor run as a single ball's
  journey), from the owner's playtest and their choice of the reviewer's pick (owner, 2026-11-09 and
  2026-11-10); and rooms lock and open one by one (owner, 2026-11-09). Earlier, the owner approved
  room 4's flap in place of a spinner and AC-1's test in `tests/trundle.test.mjs` ("Approve both",
  2026-11-09); the flap is now room 5's, and AC-1 stands. Every acceptance item below is rewritten
  for the live machine under that choice (owner, 2026-11-10).

## Acceptance items

- **AC-1** The landing page shows 8 tiles, Trundle's playable and linking to `trundle/` — `tests/trundle.test.mjs`.
- **AC-2** A room opens running before any touch: Trundle drives along his girder and drops a ball within 1.5 s, and another every 3 s; no errors — `tests/trundle.test.mjs`.
- **AC-3** Dragging a part from the tray puts it on the board, snapped to 0.25 units; dragging a placed part moves it by the finger's movement; ⟲ and ⟳ turn the selected part by 15°; dragging it back onto the tray returns it; a drop or turn that overlaps a fixed part, the exit or another part is refused; a drag stays inside the board; a second finger moves nothing and the first finger's drag carries on; all of it works while balls fall — `tests/trundle.test.mjs`.
- **AC-4** A part being dragged doesn't touch the balls; a part let go or turned on top of a ball stays a ghost until no ball overlaps it, then turns solid; no ball ever goes faster than its cap — `tests/trundle.test.mjs`.
- **AC-5** Tapping Trundle turns him around, and the next ball drops where he now is — `tests/trundle.test.mjs`.
- **AC-6** Every room's recorded solution (a layout and its timed edits) gets at least the quota into the exit and takes all three stars, with no assist, and each ball's pose at every step is the same when the page's frame loop is driven at 60 Hz, at 120 Hz and with uneven frames of 7–40 ms; with no parts placed and no edits, every room's attempt fails — `tests/trundle.test.mjs`.
- **AC-7** An attempt drops 8 balls (room 1, 6), and the HUD shows each one waiting, in the exit or lost; once every ball is done at or above the quota the room is done, Trundle cheers and the stars taken are kept as the room's best; once the quota can't be reached the attempt ends with Try again, and the parts stay — `tests/trundle.test.mjs`.
- **AC-8** Each room brings its new thing: room 2's Trundle patrols, room 4's tray has a wedge, room 5's blue flap swings when a ball hits it, room 6's crate can be knocked off the exit, room 7's exit stays locked until a ball touches the key, and room 8 has two exits that both count — `tests/trundle.test.mjs`.
- **AC-9** Solving room 8 plays the floor run: each room's best attempt replayed in order, faster than life, with the camera moving down from room to room, then the floor's star total; after a reload the rooms list plays it again — `tests/trundle.test.mjs`.
- **AC-10** On a fresh browser only room 1 is open, and solving a room opens the next; the browser keeps each room's best stars, last layout and best attempt, and solving again with fewer stars keeps the best; with storage blocked or a room's saved data unreadable the game still plays; a hash opens a room reached, and one for a locked room, `#1-9` or `#x` opens the furthest room reached — `tests/trundle.test.mjs`.
- **AC-11** Hiding the page pauses an attempt or the floor run; it stays paused when the page comes back and resumes on a tap — `tests/trundle.test.mjs`.
- **AC-12** From the 4th failed attempt in a room the exit takes a ball from 5% further away per failed attempt, up to 20%, and is back to normal once the room is done — `tests/trundle.test.mjs`.
- **AC-13** At 360×640, 390×844 and 1280×720 the board and the bottom bar fit with no scrolling and the board keeps its portrait shape, and every button is at least 44 px — `tests/trundle.test.mjs`.
- **AC-14** A ball at its top speed dropped onto a plank lands on it and doesn't pass through — `tests/trundle.test.mjs`.
- **AC-15** Once the game has been opened at room 1, room 8 plays offline — `tests/trundle.test.mjs`.
- **AC-16** A ball's drop, a hit on a part, a star, a ball in the exit and a lost ball's pop each play a sound; a resting contact doesn't repeat its sound within 100 ms; nothing plays while muted — `tests/trundle.test.mjs`.

## Core flow

1. Tap the Trundle tile: room 1 opens running, and the first balls fall past the exit.
2. Drag the green plank into the stream: the next balls bounce off it toward the exit.
3. Five balls in: Trundle cheers, the room's stars show, Next opens room 2.
4. After room 8, watch the floor run through every room you solved.

## States

| State | Board | Bottom bar (tray, ⟲ ⟳, Restart) | Ball counter | Room card (stars, Retry, Next) | Try-again card | Floor run card |
| ----- | ----- | ------------------------------- | ------------ | ------------------------------ | -------------- | -------------- |
| Running (a room just opened, or restarted) | balls falling, parts movable | shown | shown | hidden | hidden | hidden |
| Failed (the quota can't be reached) | the last balls' trails | shown | shown | hidden | shown | hidden |
| Room done | Trundle cheering | hidden | shown | shown | hidden | hidden |
| Floor run | the camera moves down the rooms, replaying each | hidden | hidden | hidden | hidden | shown at the end, with the floor's stars |
| Rooms list (the rooms button) | dimmed behind | hidden | hidden | hidden | hidden | hidden; the eight rooms with their stars (a padlock on the ones not reached), and the floor run button once earned |

## Out of scope

- This is slice 1 of 3. Slice 2: floor 2, "The Boiler Room": bumpers, springs, buttons that open
  gates, a second hopper. Slice 3: floor 3, "The Lab": lasers that pop balls, glass that breaks,
  TNT, and sharing an attempt as a link.
- A level editor, leaderboards, accounts, or music.

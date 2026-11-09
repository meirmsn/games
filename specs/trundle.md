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

The surface is a new game page, `trundle/`, plus a new playable tile on the landing page. The game
has its own look (the Rolling Ball pack's colours on a workshop wall), the same in light and dark,
like any game page; the landing page keeps the site's tokens. This is the first slice of the game
(see Out of scope).

**Hook:** Trundle, a little robot, is building a giant ball machine one room at a time: you place
green planks and wedges so the ball Trundle kicks off rolls into the exit, and when a floor is done
the ball runs through every room you built in one long take.

**Concept check** (the game guidelines, `discussion/game-guidelines.md` on branch
`claude/tender-knuth-m0cjxj` until it merges):

- Verb: drop a part in, turn it, tap Go and watch the ball answer it: a clack, a roll, a settle.
- A typical 5-second choice: lay the plank flat under the ledge so the ball lands safely, or tilt it
  steep so the ball jumps the gap past a star; the first wins the room, the second the star (or
  misses). And: Trundle's soft nudge or hard kick.
- How it teaches: a room you haven't played opens with Trundle's demo kick, which fails and leaves its trail; room
  1 has one part and one gap; each room adds one new thing, told by colour; no written tips.
- Three clocks: a run lands every few seconds; a new part or rule every room or two, and the floor
  run after six rooms; brought back by stars per room and the floor-2 door the floor run ends on.
- What an expert does: takes all three stars per room, with fewer parts and the hard kick.
- The tenth play differs: new rooms with new rules, and star routes need a different idea than the
  first solution.
- Short-form: a room is 30 s–3 min, a floor about 10 min; stop any time.
- Portrait: gravity runs down the long side, so a tall phone shows more machine, one-handed.
- A failure costs one run of 3–8 s; the parts stay put, and the trail and near-miss mark show why.
- Save games: every room is open from the start; the browser keeps stars and the last layout per
  room; `#1-4` in the URL opens a room.
- Riskiest part: deterministic, stable physics at 60 and 120 Hz without tunnelling, proved first by
  a test that replays every room's recorded solution at both rates.

**Targets:** first success under 30 s (room 1); first failure within the first minute (the demo
kick, and room 1 without its plank); first new element by about 2 minutes (room 3's wedge).

## Decisions

- Contraption puzzle over pinball: pinball's verb is a real-time reflex like Reef's, needs a lot of
  table to be good, and is the hardest case for a small engine. This game differs from Reef in verb
  (place and turn), structure (hand-made puzzle rooms) and failure (none), and from an
  aim-and-launch gravity game in verb (Claude, 2026-11-09, under the owner's go).
- Colour is the rule book, from the Rolling Ball pack: green parts are yours to move and turn,
  yellow parts with a keyhole are fixed, blue parts turn when hit, wood is loose (it falls and can be
  knocked away), the ball is red, stars are optional and a gold key opens a locked exit (Claude,
  2026-11-09, after the adversarial spec review).
- Trundle is a character with a job and a choice: tapping Trundle switches between a soft nudge and
  a hard kick (two launch speeds); its eyes and body turn toward the ball; it cheers at the exit and
  winces at a miss; after a miss it leaves a marker where the ball came closest to the exit, so a
  miss still pays with information. Rejected: a robot that only starts the run, which is decoration
  (adversarial review, 2026-11-09).
- A room with no saved layout opens with Trundle's demo kick, before any touch: the ball runs with
  no parts placed, past the stars and short of the exit, and its trail stays. Stop or any touch on
  the board ends it. A room with a saved layout opens with it, still. The world moves before the first touch
  and shows the reward before it's earned (adversarial review, 2026-11-09).
- Physics: Matter.js 0.20.0, vendored (MIT). The world is rebuilt from scratch for each run and
  stepped at a fixed 1/120 s whatever the display rate, with the ball's speed capped, sleeping off,
  and parts at least 0.4 units thick, so a layout plays the same run at 60 and 120 Hz without
  tunnelling. A run ends 0.75 s after the ball comes to rest or leaves the room, or after 12 s. A frame
  takes at most 8 steps, so after a long stall the run slows down rather than jumps.
  Rejected: a hand-rolled engine, which can't topple a crate or spin a free spinner well (Claude,
  2026-11-09).
- The floor run plays back the recorded winning run of each room (the poses of the ball and the
  moving parts, kept at 30 Hz), with the camera following the ball down through all six rooms, and
  ends on floor 2's locked door. It never re-simulates, so it can't fail, whatever engine a browser
  has. Each room keeps the recording of its best run (most stars; a tie goes to the latest). The
  floor run plays by itself when the floor's last unsolved room is solved, in whatever order the
  rooms were done, and again from the rooms list. Rejected: re-simulating the saved
  layouts, which can miss after an edit or on another JS engine (adversarial review, 2026-11-09).
- Placement: a part dragged from the tray lands where it's dropped; a placed part moves by the
  finger's movement (relative drag), so the finger never hides it; positions snap to 0.25 units and
  angles to 15°. Turning uses two fixed buttons in the bottom bar (⟲ and ⟳), beside Go, not
  buttons floating next to the part. Desktop: mouse drag, wheel or Q/E to turn, arrow keys to
  nudge, Delete to send a part back, Space for Go, N for the next part, Escape to let go of the
  selected part (it leaves the game only when nothing is selected). A second finger is ignored and
  the first finger's drag carries on (adversarial review, 2026-11-09).
- A drop or a turn that would overlap a fixed part, Trundle, the ball's start, the exit, a star, the
  key or another part is refused: the part shakes and goes back to where it was (a new one goes back
  to the tray). A drag stays inside the board. Parts can't be moved while a run plays; touching the
  board then stops the run (adversarial spec review, 2026-11-09).
- Storage: stars, the layout and the best run per room are kept in localStorage under a versioned
  key; every read and write is guarded, so with storage blocked progress lasts until the page
  reloads, and a room whose saved data is unreadable starts fresh without touching the others
  (adversarial spec review, 2026-11-09).
- The URL hash `#1-1` to `#1-6` opens that room, and opening a room sets it; anything else opens
  room 1. A rooms button at the top right opens the rooms list: the six rooms with their stars, and
  the floor run once it has been earned (adversarial spec review, 2026-11-09).
- Hidden assist: from the 4th run in a room that misses the exit, its capture area grows by 5% per
  miss (5, 10, 15, 20%), to at most 20%, and resets when the room is done or the page reloads. The
  demo kick and a stopped run aren't misses. The recorded solutions pass without it. No pull force, so nothing visibly steers the
  ball; stars never get it (adversarial review, 2026-11-09).
- Floor 1, "The Workshop", is six rooms, each adding one thing: 1 a gap and one plank; 2 two planks,
  a zig-zag; 3 the wedge; 4 a blue spinner (push); 5 a wooden crate on the exit (a breather); 6 a
  locked exit and a gold key (push) (Claude, 2026-11-09).
- Sound: Kenney's impact, interface, digital and jingle sounds, converted to MP3 (Safari plays no
  OGG), under the site-wide mute; an impact sounds at most once per pair of bodies every 100 ms
  (Claude, 2026-11-09).
- Portrait: on a landscape screen the board stays a portrait column in the middle, with the bottom
  bar under it (Claude, 2026-11-09).
- All of floor 1's images and sounds load when the game opens, so every room plays offline once
  the game has been opened (adversarial spec review, 2026-11-09).
- The tile goes after Googly Faces, before the coming-soon tiles (Orbit's stays last), making 8
  tiles. This supersedes the 7 tiles of Reef's AC-11: the site tests count 8, and `sw.js` caches the
  new tile picture, with its VERSION bumped (Claude, 2026-11-09).

## Acceptance items

- **AC-1** The landing page shows 8 tiles, Trundle's playable and linking to `trundle/` — `tests/site.test.mjs`.
- **AC-2** On a fresh browser a room opens with Trundle's demo kick before any touch: the ball runs with no parts placed, misses the exit, and leaves its trail; a room with a saved layout opens still, with that layout; no errors — `tests/trundle.test.mjs`.
- **AC-3** Dragging a part from the tray puts it on the board, snapped to 0.25 units; dragging a placed part moves it by the finger's movement; ⟲ and ⟳ turn the selected part by 15°; dragging it back onto the tray returns it; a drop or turn that overlaps a fixed part, the exit or another part is refused; a drag stays inside the board; a second finger moves nothing and the first finger's drag carries on — `tests/trundle.test.mjs`.
- **AC-4** Go runs the room; a ball that reaches the exit completes the room, Trundle cheers, and the stars it touched are counted and kept as the room's best — `tests/trundle.test.mjs`.
- **AC-5** A missed run ends on its own within 1 s of the ball resting or leaving the room (12 s at most); the trail and the near-miss marker stay; Go or any edit after it clears the marker — `tests/trundle.test.mjs`.
- **AC-6** Every room's recorded solution reaches the exit with all three stars, with no assist, and the ball's pose at every step is the same when the page's frame loop is driven at 60 Hz, at 120 Hz and with uneven frames of 7–40 ms; with no parts placed, every room's ball misses the exit — `tests/trundle.test.mjs`.
- **AC-7** Tapping Trundle switches between the soft nudge and the hard kick, and the hard kick launches the ball faster — `tests/trundle.test.mjs`.
- **AC-8** Each room brings its new thing: room 3's tray has a wedge, room 4 a spinner that turns when the ball hits it, room 5 a crate that the ball can knock off the exit, and room 6 an exit that stays locked until the ball touches the key — `tests/trundle.test.mjs`.
- **AC-9** Solving the floor's last unsolved room, in any order (room 6 first included), plays the floor run: it plays back each room's best run in order with the camera following the ball, without stepping the physics, then shows the floor's star total; after a reload the rooms list plays it again — `tests/trundle.test.mjs`.
- **AC-10** Every room is open on a fresh browser; the browser keeps each room's best stars, last layout and best run, and solving again with fewer stars keeps the best; with storage blocked or a room's saved data unreadable the game still plays; `#1-4` opens room 4 and `#1-9` or `#x` opens room 1 — `tests/trundle.test.mjs`.
- **AC-11** Hiding the page pauses a run, the demo kick or the floor run; it stays paused when the page comes back and resumes on a tap — `tests/trundle.test.mjs`.
- **AC-12** After 3 missed runs in a room the exit's capture area grows 5% a miss up to 20%, and is back to normal once the room is done — `tests/trundle.test.mjs`.
- **AC-13** At 360×640, 390×844 and 1280×720 the board and the bottom bar fit with no scrolling and the board keeps its portrait shape, and every button is at least 44 px — `tests/trundle.test.mjs`.
- **AC-14** A ball dropped from the top of the room at its top speed onto a plank lands on it and doesn't pass through — `tests/trundle.test.mjs`.
- **AC-15** Once the game has been opened at room 1, room 6 plays offline — `tests/trundle.test.mjs`.
- **AC-16** The ball hitting a part, a star, the exit and Trundle's kick each play a sound, a resting contact doesn't repeat its sound within 100 ms, and nothing plays while muted — `tests/trundle.test.mjs`.

## Core flow

1. Tap the Trundle tile: room 1 opens and Trundle kicks the ball, which falls through the gap.
2. Drag a green plank from the tray onto the board, turn it, tap Go.
3. The ball rolls into the exit: Trundle cheers, the room's stars show, Next opens the next room.
4. After room 6, watch the floor run through every room you built.

## States

| State | Board | Bottom bar (tray, ⟲ Go ⟳) | Room card (stars, Next, Retry) | Floor run card |
| ----- | ----- | ------------------------- | ------------------------------ | -------------- |
| Demo kick (an unplayed room just opened) | ball running, no parts | shown, Go shows Stop | hidden | hidden |
| Editing | parts movable, last trail shown | shown | hidden | hidden |
| Running | parts locked, ball running | shown, Go shows Stop | hidden | hidden |
| Room done | ball in the exit, Trundle cheering | hidden | shown | hidden |
| Floor run | camera follows the ball through all six rooms | hidden | hidden | shown at the end, with the floor's stars |
| Rooms list (the rooms button) | dimmed behind | hidden | hidden | hidden; the six rooms with their stars, and the floor run button once earned |

## Out of scope

- This is slice 1 of 3. Slice 2: floor 2, "The Boiler Room": bumpers and springs, buttons that
  open gates, two balls at once. Slice 3: floor 3, "The Lab": lasers that pop the ball, glass that
  breaks, TNT, and sharing a solution as a link.
- A level editor, leaderboards, accounts, or music.

# Runes: a calm puzzle of stones that rise and sink

**Go:** "don't consult with me, just start building after following this process" 2026-11-09

## Intent

The owner, on 2026-11-09: "review the game concept against the guidelines and propose something
that works, and then do adversarial review … so that you have solid concepts of the game and then
build them … don't consult with me, just start building after following this process." The seed is
theirs: a puzzle on Kenney's Rune Pack ("the Rune Pack looks great for a puzzle game; the idea is
still open"), long-form, levels with depth, undo instead of lives, and different in kind from Reef
(a real-time chase) and Googly Faces (a tap toy). The Rune Pack and the sounds come from the private
asset repo (`meirmsn/games-private`); sounds are converted to MP3. The guidelines are
`discussion/game-guidelines.md` (on branch `claude/tender-knuth-m0cjxj` until it merges). The lines
this design leans on: "a verb that's fun on its own"; "real choices … two options, and each wins
sometimes"; "failure is cheap … you see why it happened"; "a puzzle wants undo"; "at the moment of
decision the finger never hides what it acts on"; "a hidden assist may ease it, but never visibly";
"no save games … to resume, use something the player carries: … the URL"; "each concept states its
own targets … and builds in the knobs to tune them".

The surface is a new game page, `runes/`, and the landing page's Runes tile, which turns from
"Coming soon" into a link. The game has its own look (a pool of dark water under a sky, the same in
light and dark, like Reef's sea); the landing page keeps the site's tokens.

**Hook:** draw one line of light through every stone in a pool of old rune stones; each rune the
light passes wakes its neighbours, raising stones out of the water or sinking them, so the board
changes under the line you draw.

## Decisions

- The rules. A portrait board of up to 6 × 8 cells: stones and water, one source, one gate. The line
  of light starts on the source and steps to an orthogonal neighbour stone; each stone holds the light
  once. **The goal is every stone lit, with the line ending on the gate**; the gate takes the light
  only as the last stone, counted after that step's own effects (so a Sink beside the gate that
  sinks the last dark stones as the light leaves it lets the gate take the light); an early step onto
  the gate is refused and changes nothing. Runes fire once, only on cells the light doesn't hold: a **Rise** (the ↑
  glyph, gold), as the light enters it, raises its water neighbours into stones, which then have to
  be lit too: a bridge and a burden; a **Sink** (the ᛦ glyph, violet), as the light leaves it, sinks
  its plain-stone neighbours except the one the light goes on to: fewer stones to light, but it can
  drown your only way back. Neither ever changes a rune, the source or the gate. Rejected: "reach the
  gate" as the goal, under which a Rise is always good and a Sink always bad, so there is no choice
  (concept attack, round 1); a Sink that fires as the light enters it, which drowns the stone you'd
  step to next (found by the level search) (session proposal, 2026-11-09).
- Every step can be taken back exactly, in the reverse order, undoing what it raised or sank. There
  are no lives and no fail screen. When the line can no longer finish, the gate's glow dims at once,
  and stones the rules can show are cut off crack and dim, so you see that, and often why, you went
  wrong. A search from the current state decides it, with a budget of 200,000 nodes, run after the
  frame that drew the step; if the budget runs out, the gate stays lit (session proposal, from
  concept attack round 2 and the spec review, 2026-11-09).
- Levels are hand-picked from a generator and frozen in `runes/levels.js`; level 1, a three-by-three
  bend, is too small for the generator and is hand-made, under the same checks. The generator
  (`scripts/runes/generate.mjs`) builds a board around a random line and keeps it only if it has 1–3
  solutions, a greedy line ("fire every Rise, avoid every Sink, take the first open stone") fails,
  each Rise constrains (with its effect already applied, the board has more solutions), each Sink is
  needed (as a plain stone, the board has none), and each rune is two-sided (some line that could
  still finish dies by entering it at the wrong moment or from the wrong side). Rejected: random
  boards (4 of 6,000 had any solution) and a filter that only asked that runes be needed, which let
  through boards where the rune only fixed checkerboard parity (concept attack, round 2) (session
  proposal, 2026-11-09).
- Structure, slice 1: two chapters, **Dawn** (plain stones, then the Rise; no Sink) and **Tide** (the
  Sink alone first, then both), each with five core levels and two optional **deep** levels, harder,
  drawn with a gold rim. One flat order, levels 1–14: Dawn's core 1–5, its deep 6–7, Tide's core
  8–12, its deep 13–14. Tide opens once Dawn's core levels are solved; deep levels never block
  anything. Next goes to the next core level (from 5 to 8); the deep ones are chosen on the level
  select; after a chapter's last level, the level select opens. The level select shows each level as
  a stone: dark when open, lit when solved, faded and locked when locked, deep ones in their own
  pair. Rejected: two goals per level (the gate, and every rune), which with free undo is an easy
  and a hard mode rather than a choice (concept attack, round 1) (session proposal, 2026-11-09).
- Long-form and portrait: a puzzle wants sessions of 10–30 minutes, not runs; one hand holds a phone
  and a tall board. The board fits 360 × 640 CSS px with cells of at least 44 px, 16 px clear of the
  side edges where the phone swipes back (session proposal, 2026-11-09).
- Input. **Drag anywhere (relative):** each 0.6 cell (at least 28 px) of movement along the leading
  axis steps the line one stone that way; an axis leads once it is 1.5 times the other; both axes
  reset after each step; movement into water, a lit stone or off the board is clamped to 0.3 cell
  so pushing against a wall stores nothing, except toward the previous stone, where 0.8 cell takes
  one step back. The finger never has to sit on the line's head, so it never covers what it acts on. A
  **tap** (under 10 px and 300 ms) on a neighbour stone of the head steps there; on a lit stone, cuts
  the line back to it. **Restart** clears the line. Every step, step back, cut, Hint and Restart is
  one action, and **Undo** reverses the last action exactly (Undo after a cut or a Restart brings the
  whole line back). Keyboard: arrow keys and WASD step or step back, Backspace or Z undo, R restart.
  A second finger is ignored. Input never freezes: a rune's animation takes 150 ms and its state
  changes at once. Rejected: dragging the head under the finger, which hides the head and the
  stones around it (concept attack, rounds 1 and 2) (session proposal, 2026-11-09).
- Teaching, with no text. Level 1 is a three-by-three bend. The source pulses, and if nothing
  happens for 4 s a ghost light glides the first two steps, and again every 8 s until the first
  step. Each rune arrives alone in its first level. While the head is next to a Rise, the water it
  would raise shows faint ghost stones; while the head stands on a Sink, the stones it would sink
  tremble. Idle runes breathe their effect: bubbles over the water beside a Rise, slow rings around a
  Sink (session proposal, 2026-11-09).
- A quiet Hint button, always there, which the player chooses to press: it cuts the line back to the
  longest start it shares with a stored solution and makes the next stone glimmer. Nothing pops up
  on its own. Rejected: a hint that appears after a while, a visible assist (concept attack, round 1)
  (session proposal, 2026-11-09).
- The look: the Rune Pack's vector tiles rendered at 3× and cropped into one atlas, grey blank tiles
  for plain stones, blue tiles for runes, the source (ᚠ) and the gate (◇); lit stones glow from
  within in the light's warm colour, with a short seam of light across each shared edge of the line.
  There is no tube of light from cell centre to cell centre (too close to another line-puzzle look,
  concept attack, round 2). Water is dark and moving, with drifting motes. Each chapter has its own
  sky and water: Dawn rose and teal, Tide deep blue and silver (session proposal, 2026-11-09).
- Sound, Kenney's, as MP3 under the site-wide mute: each step chimes one glass note whose pitch
  climbs a pentatonic scale with the line's length (retracting plays it falling); a Rise grinds
  stone up with a splash, a Sink gulps; the gate opens with a short jingle; one calm music loop. The
  sound adds to the picture and never replaces it (session proposal, 2026-11-09).
- Memory: localStorage keeps which levels are solved (losing it re-locks Tide, nothing more); when
  storage is blocked the game plays as on a fresh browser. The URL carries the level (`runes/#7`),
  so a bookmark or a shared link opens it, and opens any level, locked or not; solving a level opened
  that way counts. A hash that names no level opens level 1 and rewrites the hash; changing the hash
  mid-level opens that level (session proposal, 2026-11-09).
- Interruptible: when the page is hidden, the gesture ends, the line stays, and sound pauses until
  the next touch (session proposal, 2026-11-09).
- Targets, tuned by playing (play-testing targets, not acceptance items): the first level solved in under 20 s; the first dead end around level 3
  (minute 2); the Rise by minute 2–3 and the Sink about 8 minutes later; a level takes 20 s to 3
  minutes. Knobs in `runes/game.js`: the drag step, axis lead, clamp and back thresholds, the ghost
  delay, the preview strength, the level order and which levels are deep (session proposal,
  2026-11-09).
- Tests reach the game through `window.__runes` (the state, a step function, the preview cells,
  whether the gate is dim, the stranded cells, the ghost's state), as Reef's tests use
  `window.__reef` (session proposal, 2026-11-09).
- The concept check, answered in writing, and both rounds of the concept attack are in this
  change's PR description (session proposal, 2026-11-09).

## Acceptance items

- **AC-1** Opening `runes/` shows level 1's board already moving (two frames 300 ms apart differ
  before any input), with Undo, Restart, Hint and the level button, and no errors — `tests/runes.test.mjs`.
- **AC-2** A relative drag of 0.6 cell steps the line one stone in the drag's leading direction, from
  anywhere on the screen, also from below the board; 0.8 cell back toward the previous stone takes
  the step back; pushing into water or a lit stone steps nothing and stores nothing; a second finger
  moves nothing — `tests/runes.test.mjs`.
- **AC-3** A tap (under 10 px of movement) on a neighbour stone of the head steps there; on a lit
  stone, cuts the line back to it; Undo after a cut restores the whole cut line, and after a Restart
  the whole line; Undo after a step takes it back — `tests/runes.test.mjs`.
- **AC-4** Arrow keys step and step back, Backspace and Z undo, R restarts — `tests/runes.test.mjs`.
- **AC-5** Entering a Rise raises its water neighbours into stones (never a cell the light holds);
  taking that step back lowers them again — `tests/runes.test.mjs`.
- **AC-6** Leaving a Sink sinks its unlit plain-stone neighbours except the one the light goes to,
  and never a rune, the source or the gate; taking that step back raises them again — `tests/runes.test.mjs`.
- **AC-7** A step onto the gate while another stone is dark is refused and changes nothing; a step
  onto it that leaves no stone dark (counting what that step sinks) solves the level: the solved card
  shows, the level's stone on the level select is lit, the mark survives a reload, and Next opens the
  next core level — `tests/runes.test.mjs`.
- **AC-8** A line that can no longer finish dims the gate, and a stone it cut off for good is marked
  stranded; taking back the step that lost it restores the gate's glow — `tests/runes.test.mjs`.
- **AC-9** Every level in `runes/levels.js` uses only stones, water, the source, the gate, Rise and
  Sink; has 1 to 3 solutions; fails the greedy line when it has a rune; and each of its runes passes
  the generator's checks (a Rise constrains, a Sink is needed, every rune is two-sided), with no
  search cut short. Dawn has no Sink, and the first level with each rune has only that rune — `tests/runes.test.mjs`.
- **AC-10** There are 14 levels in two chapters, Dawn (core 1–5, deep 6–7) and Tide (core 8–12, deep
  13–14). Tide is locked until levels 1–5 are solved; deep levels lock nothing; after level 5, Next
  opens level 8; the URL `runes/#<n>` opens level n even when it is locked; `#0`, `#99` and `#abc`
  open level 1 and rewrite the hash — `tests/runes.test.mjs`.
- **AC-11** Hint cuts the line back to the longest start it shares with one of the stored solutions
  (the one sharing most, the first listed on a tie) and marks that solution's next stone; Undo
  brings the cut line back — `tests/runes.test.mjs`.
- **AC-12** Each step plays the chime at a rate that rises with the line's length and a step back at
  a falling one; a Rise and a Sink play their own sounds; solving plays the jingle; with the site
  muted, nothing plays — `tests/runes.test.mjs`.
- **AC-13** Hiding the page ends a drag in progress, keeps the line and suspends the sound — `tests/runes.test.mjs`.
- **AC-14** At 360 × 640 and at 390 × 844, a 6 × 8 board fits on screen with cells of at least 44 px,
  buttons of at least 44 px, at least 16 px clear of the side edges, and the page doesn't scroll — `tests/runes.test.mjs`.
- **AC-15** On level 1 with no input for 4 s, a ghost light shows the first steps, and again 8 s
  later; it stops once the line moves — `tests/runes.test.mjs`.
- **AC-16** With the head next to a Rise, the preview is exactly the water it would raise; with the
  head on a Sink, exactly its unlit plain-stone neighbours — `tests/runes.test.mjs`.
- **AC-17** The landing page's Runes tile is a link to `runes/`, without the coming-soon badge or
  label, and the page still lists seven tiles — `tests/site.test.mjs`.
- **AC-18** With localStorage throwing, the game plays and solves a level without errors — `tests/runes.test.mjs`.
- **AC-19** Runes plays offline once it has been played — `tests/runes.test.mjs`.

## Core flow

1. Tap the Runes tile: level 1's pool is moving, the source pulsing.
2. Drag: the line of light steps from stone to stone; runes raise and sink stones as it passes.
3. Light every stone and end on the gate: the gate opens and the next level follows.
4. Stuck: the gate dims; drag back, tap a lit stone, Undo, or ask for a Hint.

## States

| State | Board | Solved card | Level select |
| ----- | ----- | ----------- | ------------ |
| Playing | shown, takes input | hidden | hidden |
| Solved (a moment after the gate opens) | shown, no input | shown, with Next | hidden |
| Choosing a level | shown behind, no input | hidden | shown |

## Out of scope

- Slice 2: the Spark rune (raises the water straight on in the direction the light entered it) and a
  third chapter, Storm. Slice 3: a Twin rune (carries the light to its pair) and later chapters
  built with the generator. Recorded here rather than in `ROADMAP.md`, because the games are built on
  parallel branches.
- Timers, scores, move counts or leaderboards.
- Music settings beyond the site-wide mute.

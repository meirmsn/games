# Splat Gallery: a win you can read and hear, a BONUS bar, and the red lights back outside

**Go:** "and go" 2026-11-18 (to the summary with the three calls, right after "I think the gold wing should be outside as well"; calls 1 and 2 stand as proposed)

## Intent

The owner, on 2026-11-18: "on the Splat Gallery game, when you win, it shows for too short the
message that you won. It's not, you don't even have time to read it. And when you lose, I think we
should go back to putting those alternating red lights outside the frame of the score. It looked
better. And also, I think we need a sound effect for when we win and for when you lose, so that you
hear it when you're seeing that, when we show you that dialogue that you won or that you lost.
Think about, see if you have something on the Kenny games, on the Kenny repo, on the private games
repo, and if not, let me know."

Then: "I think there is a sound effect when you lose, but we need one for when you win. And also, if
you achieve the goal and the timer has not run off, we should also have a sound effect for that.
And visually, we should probably already start [...] doing something on the counter so that you
know that you won. [...] something to that is clear that you're now on bonus. Maybe the word bonus
should show up on that bar. [...] maybe the bonus indicator that you show at the bottom, you
actually show in there on top of the yellow bar, because it doesn't matter anymore, the yellow bar."

And, choosing from Claude's listening page and mockups: "W2 for when you win, and then G1 when you
win in the middle of the game, but probably repeat it like 3 times so that you know that something
is going on. And then the indicator should be the C. And I wonder if you can take that shiny thing
and move it from left to right or something. You know, not super fast, not super slow, but maybe
with some easing."

Today: "Round cleared" shows for 1.5 s (its fade in and out included) and the next round's sign
replaces it. Clearing a round plays no sound of its own. Reaching the quota plays a 1 s pizzicato
run (`quota`, Kenney's `jingles-pizzicato_00`) and shows a small "Bonus!" sign on the counter for
1.4 s. The lose sound (`lost`, `jingles-pizzicato_16`) plays when the time runs out. The count
board's ring of bulbs sits on its wooden frame (`specs/splat-gallery-board-lights.md`).

The surface is Splat Gallery's booth (customer-facing), drawn on its canvas: the count board at the
top right (`drawGoalBoard`, `goalRing`) and the banner (`drawBanner`). There is no `DESIGN.md`; the
baseline is the booth's own pieces (`brass`, `marqueeBulb`, `BULB.red`, `SIGN_FONT`).

## Decisions

- **The sounds come from the Kenney All-in-1 bundle in the private repo** (`meirmsn/games-private`,
  `Audio/Music Jingles`, CC0), converted to MP3 like the game's other sounds. The owner chose them
  by ear from Claude's listening page, 2026-11-18. The goal sound is the exception since
  2026-11-19: the owner's own jingle (below).
- **Round won (rounds 1 to 5): W2**, Kenney's `jingles-steel_00` (a cheerful rising steel-drum
  tune, 1.4 s), as `sounds/cleared.mp3`. It plays once, when "Round cleared" appears (owner,
  2026-11-18). Rejected: W1, W3 to W6.
- **"Round cleared" stays up for 3 s** instead of 1.5 s, and the next round's intro starts 3.1 s
  after the round ends (today 1.6 s), so the message can be read (Claude's proposal; confirmed by
  the owner at the go).
- **"Closing time!" (round 6 won) keeps its 2 s and its `finale` sound**; W2 is for rounds 1 to 5
  (Claude; confirmed by the owner at the go).
- **Quota reached while time is left: the owner's "win jingle 2", once** (changed by the owner
  after the go, 2026-11-19: "We need a sound for when you get to the bonus. It's not clear that it's
  celebrating"; then, given the owner's own three jingles, "For when achieving the goal, I think
  Jingle 2 sounds good"). The owner made it (ElevenLabs) and uploaded it as `win-jingle-2.mp3` (1.5
  s); it is converted to mono MP3 like the game's other sounds, as `sounds/bonus.mp3`, in place of
  today's `quota` sound. It plays once, when the quota is reached: at 1.5 s it says "celebration"
  on its own, so the repeats (G1, Kenney's `jingles-steel_14`, three times, 0.9 s apart, the
  owner's choice of 2026-11-18) go. Rejected: Kenney's C1 to C8 from Claude's second listening
  page; the owner's jingles 1 and 3, kept with jingle 2 in the private repo for later.
  It starts only in play: a ball still in the air that crosses the quota after the time has run
  out starts no bonus (no sound, no BONUS), since the round is already decided. A `bonus` still
  sounding when `cleared` starts plays out under it: changed by the owner after the go,
  2026-11-18, choosing "Let them overlap" over stopping it (the shared sound code can't stop a
  sound, and changing it would need its own PR first) or delaying `cleared`.
- **The bar says BONUS: option C** (owner, 2026-11-18). From the moment the quota is reached until
  the round ends, and through the round-won moment, "BONUS" is stamped into the gold bar in dark
  letters in the booth's lettering (`SIGN_FONT`), sized to the bar (its height less 2.5 units: 8.5 units in landscape,
  11.5 in portrait). The small "Bonus!" sign on the
  counter is gone, including the one that waited for a frenzy to end; `game.bonusLater`, which only held that sign, goes. Rejected: A (engraved, no
  glint), B (dark bar, glowing letters).
- **The BONUS bar flashes, F3** (changed by the owner after the go, 2026-11-19: "I think we need
  to start flashing the bonus bar [...] the bonus word itself has to be uh, also flashing on the
  opposite so that you can still read it. Like when the gold bar is gold and the bonus is black.
  When the gold bar is black or missing, then the bonus word is yellow"; then "F3 i think, for the
  rest of the match"). Wherever the bar shows BONUS it swaps every 0.6 s, counted from the moment
  the quota is reached: 0.6 s gold bar with the dark stamped BONUS, then 0.6 s dark bar (the
  panel's `#17100a`) with BONUS in glowing yellow (`#ffd23f`, the booth's sign yellow), and so on.
  It runs on `game.T`, so it freezes with pause and turn. It replaces the glint (the owner's
  2026-11-18 choice: a 20-unit band sweeping every 2 s), which goes. Rejected: F1 (0.25 s), F2
  (0.4 s); flashing only for the first 3 s.
- **No gold rim on the board at the quota** (owner, 2026-11-18, during the build, looking at the
  board past the quota: "Not sure what the yellow border around the of that frame is. Can you
  remove it?"): the brass rim `drawGoalBoard` adds around the plank once the count reaches the
  quota goes; BONUS on the bar marks the bonus instead. Rejected: keeping it.
- **The lose sound stays as it is** (owner, 2026-11-18: "I think there is a sound effect when you
  lose").
- **The red ring goes back outside the frame** (owner, 2026-11-18): when time runs out short, and
  beside the "Out of time" card, the red bulbs' centres run 3 units
  outside the board's plank on all four sides, each a little larger than the board's digit bulbs
  (radius 1.15 times the digit bulbs'). As today, the centres are placed without the board's
  hit swell, and the ring is drawn inside it. Where the board sits against the screen's top (in
  landscape), the top row comes down just enough to show whole, as it does today (Claude, during
  the build, 2026-11-18: the owner, asked, answered "You can keep the frame or remove that yellow
  thing around it", so the recommended option stands, flagged in the PR for the owner). This is the placement the owner saw first in
  `specs/splat-gallery-board-lights.md`. Its blinking, timing and grow-in are unchanged.
- **The gold win ring goes outside the frame too** (owner, 2026-11-18: "I think the gold wing should
  be outside as well"): when a round is won and beside the "Closing time!" card, the gold chase sits
  on the same line as the red ring, with the same bulb size. Rejected: keeping it on the frame
  (Claude's first proposal).

## Acceptance items

- **AC-1** When a round from 1 to 5 is won, `cleared` plays once, at that moment, and no `quota` or
  `bonus` sound starts with it.
- **AC-2** "Round cleared" is on screen, fully visible apart from its fade in and out, for at least
  2.5 s, and the next round's intro starts 3.1 s after the round ends.
- **AC-3** When round 6 is won, `finale` plays as before, not `cleared`, and the "Closing time!"
  card shows 2 s after the round ends, as before.
- **AC-4** When the quota is reached in play (`mode` `play`, time left), `bonus` plays once, then.
  `quota` never plays. Reaching the quota again in the same round (more hits), or any time after,
  plays no more `bonus`.
- **AC-5** No `bonus` starts at or after the round's end, nor after Restart, Play again or a new
  round. A `bonus` that started before the round's end may still be sounding when `cleared`
  starts (owner, 2026-11-18).
- **AC-6** A ball that lands after the time has run out (`mode` `lost`) and crosses the quota starts
  no bonus: no `bonus` sound, `game.bonus` stays false, and the bar keeps flashing red with no
  BONUS.
- **AC-7** From the moment the quota is reached until the next round's intro or a new game (so
  also beside the "Closing time!" card), the bar shows "BONUS" in `SIGN_FONT` at the size in
  Decisions, inside the bar's bounds, in portrait and in landscape. Under the quota, and whenever
  the groove flashes red, it shows no text. Whether it reads is judged on the PR's screenshots —
  verified by review: phone-size screenshots of the bar in both layouts.
- **AC-8** No "Bonus!" banner shows at any point, with or without a frenzy.
- **AC-9** While the bar shows BONUS it flashes: with `t` the `game.T` since the quota was
  reached, for `floor(t / 0.6)` even the bar is gold with BONUS in dark letters, and for it odd the
  bar is dark (`#17100a`) with BONUS in glowing yellow (`#ffd23f`), the same size and place. It
  keeps flashing for as long as BONUS shows, and holds while the game is paused. No glint is drawn.
- **AC-10** When time runs out short, and on the "Out of time" card, every red ring bulb's centre is
  3 units outside the board's plank, on one of its four sides (the top row lowered only where the
  screen's top would cut a bulb, as in Decisions), and its radius is 1.15 times the
  digit bulbs' (positions without the swell, as today). Every centre is at or below `L.top` and left of the sound button's left edge, in
  portrait and in landscape. The swap every 0.5 s and the grow-in are as before.
- **AC-11** The gold ring, when a round is won and on the "Closing time!" card, is laid out as in
  AC-10 (centres 3 units outside the plank, radius 1.15 times the digit bulbs', the same bounds);
  its grow-in and chase are as before.
- **AC-12** The count board never has a brass rim around its plank: past the quota it draws the
  same number of brass pieces as under it (the bar alone).
- **AC-13** `sounds/cleared.mp3` is the Kenney file named in Decisions and `sounds/bonus.mp3` the
  owner's jingle 2, each a mono MP3 at 44.1 kHz; the README's credits line still covers the Kenney
  sounds. `sounds/quota.mp3` is removed, as
  nothing plays it.
- **AC-14** Nothing else changes: the lose sound and its timing, the timer, the frenzy, the hit
  swell and the board's digits. The existing Splat Gallery tests pass, apart from those whose
  literal behaviour this replaces, which are updated to this spec: the 1.6 s round-won wait, the
  `quota` sound, the "Bonus!" sign and `bonusLater` (the frenzy-counts tests that wait for it), and
  the ring on the frame (board-lights AC-4 to AC-8), and the gold rim (board-lights AC-2).

## States

| State                         | Bar                                | Ring             | Sound                    |
| ----------------------------- | ---------------------------------- | ---------------- | ------------------------ |
| Playing, under the quota      | brass, filling                     | none             |                          |
| Quota reached, time left      | gold/dark, BONUS, flashing 0.6 s, no rim | none         | `bonus` once             |
| Round won, rounds 1–5 (3.1 s) | BONUS, flashing                    | gold, outside    | `cleared`                |
| Round 6 won (2 s)             | BONUS, flashing                    | gold, outside    | `finale` (as today)      |
| Round lost (1.5 s)            | groove flashes red                 | red, outside     | `lost` (as today)        |
| "Out of time" card            | groove, no flash                   | red, outside     |                          |
| "Closing time!" card          | BONUS, flashing                    | gold, outside    |                          |

## Out of scope

- The lose sound, the timer's alarms and the music.
- `specs/splat-gallery.md`'s sound and HUD sections are brought up to date in their follow-up docs
  PR, as for the count board itself.

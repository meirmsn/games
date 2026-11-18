# Splat Gallery: a win you can read and hear, a BONUS bar, and the red lights back outside

**Go:** pending

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
  by ear from Claude's listening page, 2026-11-18.
- **Round won (rounds 1 to 5): W2**, Kenney's `jingles-steel_00` (a cheerful rising steel-drum
  tune, 1.4 s), as `sounds/cleared.mp3`. It plays once, when "Round cleared" appears (owner,
  2026-11-18). Rejected: W1, W3 to W6.
- **"Round cleared" stays up for 3 s** instead of 1.5 s, and the next round's intro starts 3.1 s
  after the round ends (today 1.6 s), so the message can be read (Claude's proposal; confirmed by
  the owner at the go).
- **"Closing time!" (round 6 won) keeps its 2 s and its `finale` sound**; W2 is for rounds 1 to 5
  (Claude; confirmed by the owner at the go).
- **Quota reached while time is left: G1, three times**, Kenney's `jingles-steel_14` (a quick
  rising steel-drum flourish, 0.9 s), as `sounds/bonus.mp3`, in place of today's `quota` sound. It
  plays when the quota is reached, then again 0.9 s and 1.8 s later on `game.T` (one after the
  other, not overlapping), "so that you know that something is going on" (owner, 2026-11-18).
  Repeats that haven't played when the round ends are dropped, so they never play over W2 or the
  lose sound; a pause holds them. Rejected: keeping today's pizzicato run; G2 to G4.
- **The bar says BONUS: option C** (owner, 2026-11-18). From the moment the quota is reached until
  the round ends, and through the round-won moment, "BONUS" is stamped into the gold bar in dark
  letters in the booth's lettering (`SIGN_FONT`), sized to the bar. The small "Bonus!" sign on the
  counter is gone, including the one that waited for a frenzy to end. Rejected: A (engraved, no
  glint), B (dark bar, glowing letters).
- **The glint sweeps left to right with easing** (owner, 2026-11-18, "not super fast, not super
  slow, but maybe with some easing"; the timing is Claude's): a soft bright band crosses the bar
  from its left edge to its right in 0.9 s, easing in and out (slow start, fast middle, slow
  finish), then the bar rests for 1.1 s, so a glint every 2 s. It runs on `game.T`, so it freezes
  with pause and turn. Rejected: the mockup's even 1.4 s sweep with no rest.
- **The lose sound stays as it is** (owner, 2026-11-18: "I think there is a sound effect when you
  lose").
- **The red ring goes back outside the frame** (owner, 2026-11-18): when time runs out short, and
  beside the "Out of time" card, the red bulbs' centres run along the gold rim's line, 3 units
  outside the board's plank on all four sides, each a little larger than the board's digit bulbs
  (radius 1.15 times the digit bulbs'). This is the placement the owner saw first in
  `specs/splat-gallery-board-lights.md`. Its blinking, timing and grow-in are unchanged.
- **The gold win ring stays on the frame** (Claude: the owner named only the red lights; confirmed
  at the go).

## Acceptance items

- **AC-1** When a round from 1 to 5 is won, `cleared` plays once, at that moment, and no `quota` or
  `bonus` sound plays with it.
- **AC-2** "Round cleared" is on screen, fully visible apart from its fade in and out, for at least
  2.5 s, and the next round's intro starts 3.1 s after the round ends.
- **AC-3** When round 6 is won, `finale` plays as before, not `cleared`, and the "Closing time!"
  card shows 2 s after the round ends, as before.
- **AC-4** When the quota is reached with time left, `bonus` plays then, again 0.9 s later and again
  1.8 s later (on `game.T`), three times in all. `quota` never plays. Reaching the quota again in
  the same round (more hits) plays nothing more.
- **AC-5** If the round ends before the third `bonus` has played, no `bonus` plays after the round
  ends. While the game is paused, no `bonus` plays, and the remaining ones play once it resumes.
- **AC-6** From the moment the quota is reached until the next round's intro or a new game (so also beside
  the "Closing time!" card), the bar shows "BONUS"
  in `SIGN_FONT`, inside the bar's bounds, in portrait and in landscape. Under the quota it shows no
  text.
- **AC-7** No "Bonus!" banner shows at any point, with or without a frenzy.
- **AC-8** While the bar shows BONUS, a glint crosses it left to right: at phase `p = (game.T mod 2)
  / 0.9`, for `p` under 1 the glint's centre is at `ease(p)` of the way across (plus its half-width
  either side), where `ease` is an ease-in-out curve (`ease(0)=0`, `ease(0.5)=0.5`, `ease(1)=1`,
  slower at both ends than in the middle). For the rest of each 2 s there is no glint. It stays
  inside the bar.
- **AC-9** When time runs out short, and on the "Out of time" card, every red ring bulb's centre is
  3 units outside the board's plank, on one of its four sides, and its radius is 1.15 times the
  digit bulbs'. Every centre is at or below `L.top` and left of the sound button's left edge, in
  portrait and in landscape. The swap every 0.5 s and the grow-in are as before.
- **AC-10** The gold ring, when a round is won and on the "Closing time!" card, is where it is today:
  on the frame.
- **AC-11** `sounds/cleared.mp3` and `sounds/bonus.mp3` are the Kenney files named in Decisions,
  converted to MP3; the README's credits line still covers them. `sounds/quota.mp3` is removed, as
  nothing plays it.
- **AC-12** Nothing else changes: the lose sound and its timing, the timer, the frenzy, the hit
  swell and the board's digits. The existing Splat Gallery tests pass, apart from those whose
  literal behaviour this replaces (the 1.6 s round-won wait, the `quota` sound, the "Bonus!" sign,
  the red ring on the frame), which are updated to this spec.

## States

| State                         | Bar                                | Ring             | Sound                    |
| ----------------------------- | ---------------------------------- | ---------------- | ------------------------ |
| Playing, under the quota      | brass, filling                     | none             |                          |
| Quota reached, time left      | gold, BONUS, glint every 2 s       | none             | `bonus` ×3, 0.9 s apart  |
| Round won, rounds 1–5 (3.1 s) | gold, BONUS, glint                 | gold, on frame   | `cleared`                |
| Round 6 won (2 s)             | gold, BONUS, glint                 | gold, on frame   | `finale` (as today)      |
| Round lost (1.5 s)            | groove flashes red                 | red, outside     | `lost` (as today)        |
| "Out of time" card            | groove, no flash                   | red, outside     |                          |
| "Closing time!" card          | gold, BONUS, glint                 | gold, on frame   |                          |

## Out of scope

- The lose sound, the timer's alarms and the music.
- The gold ring's placement.
- `specs/splat-gallery.md`'s sound and HUD sections are brought up to date in their follow-up docs
  PR, as for the count board itself.

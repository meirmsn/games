# Splat Gallery: a "to go" board that makes the round's goal clear, and a tiny high-value target

**Go:** "go" 2026-11-11 (to the summary that asked them to confirm the two calls marked "to confirm at the go")

## Intent

The owner, on 2026-11-11, looking at round 3 on a phone: "the counter of the how many targets you
have hit so far is not clear that that's your goal to finish, you know, the to be able to pass the
round. So I don't know if we need to make the bar like with larger numbers on the bottom left and or
at the top right to also have some sort of counter, analog counter, kind of like the timer, but with
different color or some other way, analog, to kind of like show you how many you have done. There is
not a lot of space on mobile [...] And then it would be repetitive if we had at the top and the bar at
the bottom." And: "we had an idea of adding a target that is very small and it gives you way more
points than the rest."

Claude proposed a "to go" bulb board at the top right counting down to the quota, the "0 / 18" text
taken off the bottom bar, a "+N" flying from each hit to the board, and a goal line under the round
banner. The owner: "I love what you, the idea that you proposed above regarding the counter. So go
with that." On the tiny target: "from round two and once or twice per round [...] a brief pop up in
the far lane [...] it should count towards the quota. And actually, the most because it's smaller.
And yeah, probably get the bullseye and frenzy multipliers. Maybe it shouldn't show up during
frenzy".

A finding behind the first part: the quota counts **pips** (far lane 3, middle 2, near 1, gold duck
2), not hits, so "0 / 18" never meant 18 targets. The board and the flying "+N" show that.

The surface is Splat Gallery's booth (customer-facing), drawn on its canvas: the HUD under the
valance, the counter's gauge, the round banner and the targets. There is no `DESIGN.md`, so the
baseline is the design: the booth's own pieces (`plank`, `painted`, `bulbDigit`, `brass`) and its
bulb colours. `specs/splat-gallery.md`'s rules and HUD sections are updated to match.

## Decisions

- **The "to go" board:** a second bulb board built like the timer (`drawTimerBoard`: a nailed plank,
  a black panel, two seven-segment digits of bulbs), at the top right, left of the sound button
  (`[data-mute]`), the score sign between the two boards. Its bulbs are **green** (`#7dff8a`, added to
  `BULB` as `green`), never the timer's cream, yellow, orange or red, so the two never read as one. It
  shows the pips still needed, `max(0, quota − pips)`, and counts **down**, so the two boards race to
  zero. A small painted caption "TO GO" sits on the plank under the panel (the plank grows by the
  caption's height; the timer doesn't change). Its right edge is the sound button's left edge less 8
  CSS px, converted to stage units; it may be narrower than the timer where the width needs it, never
  narrower than its two digits. (Claude, proposed 2026-11-11; owner "go with that" 2026-11-11.)
- **At the quota:** the digits read `0`, still green, the caption turns to "BONUS" painted in gold and
  the board's plank gets a brass rim (`brass`, gold), for the rest of the round; the "Bonus!" pill
  shows as today. Not gold bulbs: the timer's yellow is that same gold (`#ffd23f`), and the boards must
  never read as one. (Claude, after the spec review, 2026-11-11.)
- **What the board shows lags the pips:** it keeps its own shown count, which drops when each "+N"
  arrives; the quota itself (the bonus, the "Bonus!" pill, the gauge) moves the moment the ball lands,
  as today. The caption and rim turn when the shown count reaches 0. A new round, a restart and a
  game over clear any "+N" still flying and set the shown count to the new quota.
- **Quota above 99:** never; the largest quota is 34. The board shows two digits, a dark tens bulb
  under 10, like the timer.
- **The bottom gauge:** the brass bar, its notches, its gold at the bonus and its red flash when the
  time runs out stay; the "N / quota" text on it goes, so the count isn't shown twice. The round's
  sign ("Round 3 · Drop-downs") stays. (Owner, "go with that", 2026-11-11.)
- **The "+N" to the board:** each hit that adds pips sends a small painted "+N" (N the pips it added)
  from where the ball landed to the board, over about 0.45 s; on arrival the board swells briefly, like
  the timer's pulse. The points popup ("+60") stays where it is. A free ball (fired during a frenzy)
  adds no pips, as today, so it sends nothing; a paid ball still in flight when a frenzy starts adds
  its pips and sends its "+N", as today. The "+N" freezes under the pause and the orientation veil,
  greyed with the rest of the HUD.
- **The banner's goal line:** the round's opening banner gets a third line, "**N to clear**" (N the
  quota), under the round's name; `banner()` gains a third field and its sign grows to hold it. Not
  "hit N": a hit can be worth 1, 2, 3 or 5.
- **The tiny target: where and when.** A new target kind, `tiny`. From round 2 on: **once** in rounds
  2 and 3, **twice** in rounds 4, 5 and 6 (the owner said "once or twice per round"; Claude chose that
  it grows with the rounds; confirmed by the go, 2026-11-11). Each is due at a random `game.elapsed` between
  6 and 24 s, at least 6 s apart. It pops up in the **farthest lane** (lane 0), never turns, stays up
  **1.4 s** at full speed whatever happens (a pop-up stays 1.8), and goes down unhit. It comes only at
  a spot no live target in lane 0 is within its width plus a target's width of; if there's none, it
  tries again every 0.25 s while the round runs. Rejected: a fast crosser (owner chose the pop-up,
  2026-11-11).
- **Not during a frenzy:** `game.elapsed` stops during a frenzy, so a tiny target is never launched
  while one runs; one due during it comes when it ends. None comes once less than 2 s of the round are
  left (`game.time < 2`). One already up when a frenzy starts stays up its full 1.4 s (it isn't
  sped up with the rest). The owner leaned to "shouldn't show up during frenzy" but hedged ("I don't
  know"); Claude picked holding it back because frenzy balls are free and add no pips, so a tiny hit
  there would miss the quota, the point of it; confirmed by the go, 2026-11-11.
- **The tiny target: how it looks.** Smaller than a far-lane target: 0.6 of its size, and never under
  30 CSS px wide (the far lane's other targets keep the 44 px floor of `specs/splat-gallery.md`, which this
  change amends for the tiny one). A red-and-white target face (`target_red1`) with a gold rim drawn
  around it and a small sparkle, so it reads as special and isn't mistaken for the frenzy target
  (`target_colored`) or a gold duck. It rings a bright "ting" as it rises (the existing `ding` at rate
  1.6 or more; a bullseye's is rate 1), in place of the pop-up's usual sound.
- **The tiny target: what it's worth.** **5 pips** toward the quota ("the most because it's
  smaller"; the far lane is 3). **250 points** base (a gold duck is 100, a far bullseye 60). Through the
  same `multiplier` as every target: the bullseye's ×2 (its bullseye is the face's ring at its size),
  the bonus's ×3 (the far lane's), the frenzy's ×2 (only reachable when it was up as a frenzy began),
  closing time's ×2, and the ×8 cap. A bullseye gives a ball back like any bullseye. Its "+N" reads
  "+5".
- **The hidden assist** widens it like every target (`1 + 0.15 × assist`), and is off in round 6 as
  today.
- **Round 1 has none:** the warm-up stays as it is.
- **Test hooks:** `ui()` gains `goalText` (the number shown; `''` when hidden), `goalColour`
  (`green`, or `hidden`), `goalCaption` (`TO GO`, `BONUS` or `''`) and `bannerGoal`; `hudBounds()`
  gains `goal`, the board's rectangle in CSS px; `game.spawn.tiny` holds the round's due times;
  `lastLand.kind` reads `tiny` for a hit on one.

## Acceptance items

- **AC-1** During play the HUD has a "to go" board at the top right, left of the sound button: its
  two bulb digits show the pips still to go, its lit bulbs are green and its caption reads "TO GO"; on
  the start screen and before a round's config exists it is hidden (`goalText` `''`, `goalColour`
  `hidden`).
- **AC-2** Hitting targets makes the board count down by each hit's pips (1, 2 or 3 by lane, 2 for a
  gold duck, 5 for a tiny target), each step when that hit's "+N" arrives; at 0 its caption reads
  "BONUS" with a gold brass rim and its bulbs stay green, until the round ends; the next round starts
  it at that round's quota with "TO GO".
- **AC-3** In portrait 390×844, 360×640 and 320×568 and in landscape 844×390, with each existing inset
  test's safe-area insets (none at 360×640 and 320×568), the board's rectangle overlaps neither the
  timer board, nor the sound button, nor the score sign with a score of 99,999, and lies wholly above
  the far lane's targets.
- **AC-4** The bottom gauge keeps its brass fill, notches, gold bonus and red flash, and paints no
  "N / quota" text.
- **AC-5** Each paid hit that adds pips starts a "+N" that reaches the board in 0.4–0.5 s; a free
  (frenzy) ball sends none; a new round or restart leaves none flying.
- **AC-6** Each round's opening banner reads "Round N", then its name, then "Q to clear" with Q its
  quota.
- **AC-7** Round 1 schedules no tiny target; rounds 2 and 3 schedule one each; rounds 4, 5 and 6
  schedule two each, between 6 and 24 s of `game.elapsed`, at least 6 s apart.
- **AC-8** A tiny target pops up in the farthest lane, never turns, at 0.6 of a far target's size and
  at least 30 CSS px wide, stays up 1.4 s (also when a frenzy starts while it's up) and goes down
  unhit; it never rises while a frenzy runs, nor with under 2 s of the round left, nor where a live
  lane-0 target is within its width plus a target's width.
- **AC-9** A tiny target is drawn with the `target_red1` face, a gold rim and a sparkle, and its rising
  plays `ding` at rate 1.6 or more.
- **AC-10** A paid body hit on a tiny target outside the bonus scores 250 and adds 5 pips; a bullseye
  scores 500 and gives a ball back; in the bonus a body hit scores 750; a bullseye in round 6's bonus
  scores 2,000 (the ×8 cap).
- **AC-11** A free (frenzy) ball hitting a tiny target scores 250 × 2 for a body hit and adds no pips.
- **AC-12** `specs/splat-gallery.md` describes the board, the gauge without its text, the banner's goal
  line and the tiny target in its rules, scoring and HUD sections, and its 44 px far-target floor exempts the tiny
  target from the 44 px floor.

## Core flow

1. A round opens: the banner reads "Round 3 / Drop-downs / 18 to clear"; the board at the top right
   lights "18" in green, "TO GO" under it.
2. A far-lane hit sends "+3" flying to the board, which swells and drops to 15.
3. A tiny target pops up in the far lane with a ting; hitting it sends "+5".
4. The board reaches 0: "BONUS" with a gold rim, and the round plays on for points.

## States

| State                     | The board                         | Tiny targets                |
| ------------------------- | --------------------------------- | --------------------------- |
| Start screen              | hidden                            | none                        |
| Round intro               | quota, "TO GO"                    | none yet                    |
| Play, under the quota     | pips to go, "TO GO"               | as scheduled                |
| Play, quota met           | 0, "BONUS", gold rim              | as scheduled                |
| Frenzy                    | unchanged by free balls           | held until it ends          |
| Round won, between rounds | 0, "BONUS", gold rim              | none                        |
| Time up, quota missed     | what was left, "TO GO"            | none                        |
| Game over card            | as it ended, under the card       | none                        |
| Paused or turned (veil)   | as it was, greyed; "+N" frozen    | frozen                      |

## Out of scope

- Changing quotas, round lengths, lane speeds or the pip values of the existing targets.
- A tiny target in round 1, or more than two in a round.
- Landscape-only or portrait-only layouts beyond fitting the board in both.
- New sounds or new art from outside the current packs (the rim and sparkle are drawn).

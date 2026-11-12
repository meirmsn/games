# Splat Gallery: a count board that makes the round's goal clear, and a tiny high-value target

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
taken off the bottom bar, a "+N" flying from each hit to the board (later dropped by the owner), and a goal line under the round
banner. The owner: "I love what you, the idea that you proposed above regarding the counter. So go
with that." On the tiny target: "from round two and once or twice per round [...] a brief pop up in
the far lane [...] it should count towards the quota. And actually, the most because it's smaller.
And yeah, probably get the bullseye and frenzy multipliers. Maybe it shouldn't show up during
frenzy".

A finding behind the first part: the quota counts **pips** (far lane 3, middle 2, near 1, gold duck
2), not hits, so "0 / 18" never meant 18 targets. The banner's tip says so (the owner's change below).

The surface is Splat Gallery's booth (customer-facing), drawn on its canvas: the HUD under the
valance, the counter's gauge, the round banner and the targets. There is no `DESIGN.md`, so the
baseline is the design: the booth's own pieces (`plank`, `painted`, `bulbDigit`, `brass`) and its
bulb colours. `specs/splat-gallery.md`'s rules and HUD sections are brought up to date in a
follow-up docs PR (R-9), not here: see AC-12.

## Decisions

- **The count board** (as built, after the owner's two changes below): a second bulb board built like
  the timer (`drawTimerBoard`: a nailed plank, a black panel, two seven-segment digits of bulbs), at
  the top right, left of the sound button (`[data-mute]`), the score sign between the two boards. Its
  bulbs are a bottle **green** (`#8fbf6a`, added to `BULB` as `green`), never the timer's cream,
  yellow, orange or red, so the two never read as one. It counts **up** the pips scored this round,
  and under its panel the quota's brass bar fills toward the quota (the plank is a little taller than
  the timer for it; the timer doesn't change). Its right edge is the sound button's left edge less 8
  CSS px, converted to stage units; it may be narrower than the timer where the width needs it, never
  narrower than its two digits. Claude first proposed a board counting **down** the pips still to go
  with a "TO GO" caption, in a bright green (owner "go with that", 2026-11-11); the owner changed
  both during the build.
- **Changed by the owner, 2026-11-11, during the build:** "I don't like the green. It looks too not
  analog. So we need another color in there. Or if you do green, make it like the green that is
  analog, which is not that bright." The bright `#7dff8a` became a bottle green, `#8fbf6a`, like
  tinted glass, picked by Claude from five rendered options (bright, sage, bottle, jade, amber;
  amber read as the timer's warning colours) and shown to the owner; the banner's goal
  line are painted a paler green, `#b4d89a`, to read on the wood.
- **Changed by the owner, 2026-11-11, during the build: the board counts up, with the quota's bar
  under its digits, and the bottom gauge goes.** Their words, in chat: "instead of saying to go, I
  wonder if this counter should go off [up]. I think this one should go off. So that you're adding.
  And then maybe the bar could be filling below it. I think the middle row of the green works." (the
  middle row of the five options was the bottle green). Asked what then of the bottom gauge, they chose
  "Remove it", and at the quota "Keeps counting, bar gold". So: the board's digits show the pips
  scored so far this round (shown up to 99), climbing as each "+N" arrives; the "TO GO" caption is
  gone, and in its place under the panel a brass bar slides along a groove, filling toward the quota
  (the shown count over the quota); it turns gold in the bonus and its groove flashes red when the
  time runs out short, as the bottom gauge did. Once the shown count reaches the quota the board gets
  its gold brass rim; the digits keep counting past it. The bottom gauge is removed and the hopper
  moves up under the round's sign. This replaces the counting-down, the caption and the gauge
  decisions below, which are kept struck for the record.
- ~~**At the quota:** the digits read `0`, still green, the caption turns to "BONUS" painted in gold and
  the board's plank gets a brass rim (`brass`, gold), for the rest of the round; the "Bonus!" pill
  shows as today. Not gold bulbs: the timer's yellow is that same gold (`#ffd23f`), and the boards must
  never read as one. (Claude, after the spec review, 2026-11-11.)~~ The gold rim and the reason for no
  gold bulbs stand.
- **Changed by the owner, 2026-11-11, during the review: no "+N", and a tip on the banner.** Their
  words, in chat: "I like the fact that the harder targets count more, but it's confusing that they do
  like plus 30, plus 40, plus 50. There's like two separate counts going on". Asked which number a hit
  should show, they answered: "I actually think that it's great that it shows you the points that
  you're getting for each and then but don't show the plus one, plus two, plus three, plus four, plus
  five. Maybe on the initial screen where you show eighteen to clear, you can put like a pro tip there
  about like you know further target count more." So a hit shows only its points where it lands, as
  before this change; the board counts `game.pips` itself, the moment the ball lands, with a short
  swell (`goalPulse`); and each round's banner gets a fourth line, "Tip: far targets count more", in
  small cream lettering. This replaces the "+N" decision and the board's lagging count below, kept
  struck for the record.
- ~~**What the board shows lags the pips:** it keeps its own shown count, which climbs when each "+N"
  arrives (it dropped, before the owner's change); the quota itself (the bonus, the "Bonus!" pill)
  moves the moment the ball lands, as today. The bar fills and the rim turns with the shown count. A
  new round and a restart drop any "+N" still flying and set the shown count to 0; a game over lands
  them at once, so the board under the card reads as the round ended.~~
- **Two digits:** the board shows the count up to 99, a dark tens bulb under 10, like the timer. The
  largest quota is 34; a round's pips past 99 would show 99.
- ~~**The bottom gauge:** the brass bar, its notches, its gold at the bonus and its red flash when the
  time runs out stay; the "N / quota" text on it goes, so the count isn't shown twice. The round's
  sign ("Round 3 · Drop-downs") stays. (Owner, "go with that", 2026-11-11.)~~ Removed by the owner's
  change above; the round's sign stays.
- ~~**The "+N" to the board:** each hit that adds pips sends a small painted "+N" (N the pips it added)
  from where the ball landed to the board, over about 0.45 s; on arrival the board swells briefly, like
  the timer's pulse. The points popup ("+60") stays where it is. A free ball (fired during a frenzy)
  adds no pips, as today, so it sends nothing; a paid ball still in flight when a frenzy starts adds
  its pips and sends its "+N", as today. The "+N" freezes under the pause and the orientation veil,
  greyed with the rest of the HUD.~~ Dropped by the owner's change above.
- **Changed by the owner, 2026-11-11, after the PR opened: time to read the sign.** Their words:
  "There's not enough time to read the pro tips, but I think, but I'm concerned that if we leave more
  time, well, maybe it's just a little more time, just give enough time to read it." The round's
  intro (the sign up, the booth still, the clock stopped) goes from 1.2 s to 2.2 s (`ROUND_INTRO`),
  the sign fading 0.1 s after: about a second more, for its four lines, without touching the round's
  30 s.
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
  30 CSS px wide (the far lane's other targets keep the 44 px floor of `specs/splat-gallery.md`, which R-9's follow-up
  change amends for the tiny one). A red-and-white target face (`target_red1`) with a gold rim drawn
  around it and a small sparkle, so it reads as special and isn't mistaken for the frenzy target
  (`target_colored`) or a gold duck. It rings a bright "ting" as it rises (the existing `ding` at rate
  1.6 or more; a bullseye's is rate 1), in place of the pop-up's usual sound.
- **The tiny target: what it's worth.** **5 pips** toward the quota ("the most because it's
  smaller"; the far lane is 3). **250 points** base (a gold duck is 100, a far bullseye 60). Through the
  same `multiplier` as every target: the bullseye's ×2 (its bullseye is the face's ring at its size),
  the bonus's ×3 (the far lane's), the frenzy's ×2 (only reachable when it was up as a frenzy began),
  closing time's ×2, and the ×8 cap. A bullseye gives a ball back like any bullseye.
- **The hidden assist** widens it like every target (`1 + 0.15 × assist`), and is off in round 6 as
  today.
- **Round 1 has none:** the warm-up stays as it is.
- **Test hooks:** `ui()` gains `goalText` (the number shown; `''` when hidden), `goalColour`
  (`green`, or `hidden`), `goalFill` (the bar's share, 0 to 1), `goalRim` (the gold rim shows) and
  `bannerGoal`; its `pips` (`shown`, `gold`, `flash`, `hidden`) now tells the board's bar; `hudBounds()`
  gains `goal`, the board's rectangle in CSS px; `game.spawn.tiny` holds the round's due times;
  `lastLand.kind` reads `tiny` for a hit on one.

## Acceptance items

- **AC-1** (changed by the owner, 2026-11-11: "this counter should go [up] ... So that you're adding.
  And then maybe the bar could be filling below it.") During play the HUD has a count board at the top
  right, left of the sound button: its two bulb digits show the pips scored this round, its lit bulbs
  are a bottle green, and under them a brass bar fills toward the quota; on the start screen and
  before a round's config exists it is hidden (`goalText` `''`, `goalColour` `hidden`).
- **AC-2** (changed by the owner, 2026-11-11, as AC-1, and "Keeps counting, bar gold"; then "don't
  show the plus one, plus two, plus three", so the board counts as the ball lands) Hitting targets
  makes the board count up by each hit's pips (1, 2 or 3 by lane, 2 for a gold duck, 5 for a tiny
  target), and its bar fill by them over the quota, each step as that hit's ball lands; at the
  quota the bar is full and gold, the board has a gold brass rim and its bulbs stay green, and the
  digits keep counting; the time running out short flashes the bar red; the next round starts it at
  0, the bar empty, no rim.
- **AC-3** In portrait 390×844, 360×640 and 320×568 and in landscape 844×390, with each existing inset
  test's safe-area insets (none at 360×640 and 320×568), the board's rectangle overlaps neither the
  timer board, nor the sound button, nor the score sign with a score of 99,999, and lies wholly above
  the far lane's targets.
- **AC-4** (changed by the owner, 2026-11-11: "Remove it", of the bottom gauge) The counter has no
  quota gauge and no "N / quota" text: only the round's sign, the hopper and the slingshot.
- **AC-5** (changed by the owner, 2026-11-11: "it's great that it shows you the points that you're
  getting for each and then but don't show the plus one, plus two, plus three, plus four, plus five")
  A paid hit shows only its points where it lands and swells the board; no "+N" is shown anywhere; a
  free (frenzy) ball neither counts nor swells the board.
- **AC-6** (changed by the owner, 2026-11-11: "put like a pro tip there about like you know further
  target count more") Each round's opening banner reads "Round N", then its name, then "Q to clear"
  with Q its quota, then "Tip: far targets count more"; (changed by the owner, 2026-11-11: "There's
  not enough time to read the pro tips ... just give enough time to read it") the sign holds the booth
  still, the round's clock stopped, for 2.2 s (it was 1.2 s), and is gone 0.1 s into play.
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
- **AC-12** Dropped from this change by the owner, 2026-11-11: the reviewer reviews one spec file per
  change, so asked how to unblock this PR, they chose "Main spec in a follow-up" (take the
  `specs/splat-gallery.md` edits out and drop AC-12; a docs-only PR brings it up to date after this
  merges, R-9 on the roadmap). This change leaves `specs/splat-gallery.md` as it is on `main` —
  verified by review: the PR's diff doesn't touch `specs/splat-gallery.md`.

## Core flow

1. A round opens: the banner reads "Round 3 / Drop-downs / 18 to clear / Tip: far targets count
   more"; the board at the top right lights "0" in green, its bar empty.
2. A far-lane hit shows "+30" where it lands; the board swells, climbs to 3 and fills a sixth of its
   bar.
3. A tiny target pops up in the far lane with a ting; hitting it shows "+250" (or "+500" on its
   bullseye) and the board climbs by 5.
4. The board reaches 18: the bar full and gold, a gold rim, and it keeps counting bonus hits.

## States

| State                     | The board                                   | Tiny targets       |
| ------------------------- | ------------------------------------------- | ------------------ |
| Start screen              | hidden                                      | none               |
| Round intro               | 0, bar empty                                | none yet           |
| Play, under the quota     | pips scored, bar filling                    | as scheduled       |
| Play, quota met           | pips scored, bar full and gold, gold rim    | as scheduled       |
| Frenzy                    | unchanged by free balls                     | held until it ends |
| Round won, between rounds | as it ended, bar gold, gold rim             | none               |
| Time up, quota missed     | as it ended, bar flashing red               | none               |
| Game over card            | as it ended, under the card                 | none               |
| Paused                    | as it was, dimmed under the pause card      | frozen             |
| Turned (the veil)         | as it was, greyed under the veil            | frozen             |

## Out of scope

- Changing quotas, round lengths, lane speeds or the pip values of the existing targets.
- A tiny target in round 1, or more than two in a round.
- Landscape-only or portrait-only layouts beyond fitting the board in both.
- New sounds or new art from outside the current packs (the rim and sparkle are drawn).

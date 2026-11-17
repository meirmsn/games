# Splat Gallery: a clean gold bar, and the count board lights up when a round is won or lost

**Go:** "all good, go!" 2026-11-17 (to the summary with the three calls, after Claude explained calls 1 and 2)

## Intent

The owner, on 2026-11-17, looking at the count board's gold bar on a phone: "the golden bar has like
a weird yellow, like in the like smudge or something on the center. That looks very odd. [...] It
doesn't look natural. The bar should look like it shouldn't have that. Maybe show me some
alternative here before you implement them."

And on the end of a round: "I wonder if we also need that when you finish the game, it also kind of
like, lights up or something, if you won, if you made it, so that it's kind of like calling your
attention [...] maybe a good idea is to do like the marquee light bulbs of the frenzy mode, something
like that around it of the frame that it already has, maybe some light bulbs, just grow out of
nowhere and start doing that marquee like celebration". And: "if you don't hit it, we currently
flash the red, but that red is only, it's actually it's not that clear, and it's very not clear if
you were missing like only one, because it's very, very tiny slice. So I wonder if those same marquee
lights could be like red in the case where you are like, you failed, and they might be, flashing
much on a slower frequency [...] alternate first between red and black in space, but at the same
time alternate between red and black each over time [...] And also you can keep what you show
currently of the bar in red."

The smudge comes from `brass()`'s brushed texture (`brushedPattern` in `splat-gallery/game.js`):
random bright and dark streaks plus five dark "worn" blotches on a 128 px tile, which bunch into
uneven light and dark patches across the bar.

Claude rendered a mockup (bars A today, B fine brush, C polished, D gold rod; win lights: chase,
chase + bounce, all flash; fail lights: swapping every 0.5 s or 0.25 s). The owner chose, on
2026-11-17: **B. Fine brush**, **Chase**, **swap every 0.5 s**, and on how long the fail shows: "I
think you should keep it in 1.5 seconds, but then keep the red marquee animation around this core to
keep going similar to how the targets keep going when you are showing the out of time screen cover".

The surface is Splat Gallery's booth (customer-facing), drawn on its canvas: the count board at the
top right (`drawGoalBoard`). There is no `DESIGN.md`; the baseline is the booth's own pieces
(`brass`, `marqueeBulb`, `MARQUEE_COLOURS`, `BULB.red`).

## Decisions

- **The bar is fine-brushed gold** (owner, 2026-11-17, option B): the same three-stop gradient as
  today (gold in the bonus, brass before it), the same bevel lines and rivet, with the texture
  replaced by hair-thin, faint lines running the bar's full length, evenly spread over its height,
  and no blotches or streaks that start or stop inside the bar. It applies to every `brass()` piece:
  the bar and the gold rim the board gets at the quota. Rejected: C polished, D gold rod, keeping
  the current texture.
- **Round won: a ring of bulbs grows in around the board's frame and chases** (owner, 2026-11-17,
  "Chase"): when a round is cleared (`mode` `won`), bulbs set around the board's frame (where: the owner's change below) grow from
  nothing, one after another around the ring, in about half a second, then chase in the frenzy
  marquee's colours and rhythm (`MARQUEE_COLOURS`, two lit and one dark, stepping 9 times a second)
  until the next round starts. Rejected: chase plus bounce; all bulbs flashing together.
- **Round lost: the same ring, in red, blinking slowly** (owner, 2026-11-17, "Swap every 0.5 s"):
  when time runs out short (`mode` `lost`) the ring grows in, every other bulb red (`BULB.red`) and the
  rest dark, and every 0.5 s they swap, so each bulb is red for 0.5 s and dark for 0.5 s. The bar's
  red groove flash stays as it is today. Rejected: swapping every 0.25 s.
- **The fail still lasts 1.5 s, and the red ring keeps blinking behind the "Out of time" card** (owner,
  2026-11-17): after the 1.5 s the "Out of time" card shows as today, and the count board, still
  drawn beside it, keeps its red ring blinking until a new game starts (the card has no veil, so the board stays in
  full colour beside it). Rejected: holding the fail
  for 2 s or 3 s before the card.
- **After "Closing time!" (round 6 won), the gold chase keeps going beside its card the same way**
  (Claude, to match the fail; confirmed by the owner at the go, 2026-11-17).
- **Where the ring sits** (Claude; the full ring, bottom row included, confirmed by the owner at the go,
  2026-11-17; its placement superseded by the owner's change below, which puts it on the frame): its bulbs' centres run along the gold rim's line, 3 units
  outside the board's plank, evenly spaced all the way round, each a little larger than the board's
  digit bulbs. It is drawn with the board, inside its swell. Its bottom row overlaps the top few
  units of the back lane: the ring only shows when the slingshot can't fire (`won`, `lost`, `over`),
  so it never hides a target that can be hit. Its bulb centres stay at or below the safe-area top
  (`L.top`) and left of the sound button's left edge. Their glow may spill past.
- **Changed by the owner, 2026-11-17, during the build: the ring sits on the frame.** Looking at the
  ring on the rim's line, the owner said: "the left right bottom should be on top of the frame similar to the top row
  of leds. And perhaps they could be even closer to the inner edge of the frame so that the top does
  not touch the top edge of the viewport? it is tight already so not sure possible". So the bulbs'
  centres run along the middle of the plank's 6-unit border on all four sides. They are 2.6 units
  across in radius, to fit it. Where the board sits against the screen's top, the top row comes
  down just enough to show whole.
- **How the ring knows what to show:** `won` and `lost` set it while they last. Once the card shows,
  the mode is `over`, and the ring follows `game.ended`: `'time'` red, `'closing'` gold. In `over` the
  bar's groove stays as `lost` left it today (no flash; it shows the shortfall). It is worked out from
  `hudLayout()` on every frame, so turning the phone on the card moves it with the board. The grow-in
  runs on `game.modeT`; the chase and the red swap run on `game.T`. Both freeze while the game is
  paused or turned, as the rest of the booth does. `showStart`, a new round's `intro`, Play again and
  Restart all clear it.
- **A frenzy and the ring never show together:** the timer stops during a frenzy, and `roundOver`
  ends the frenzy first.

## Acceptance items

- **AC-1** The brass texture has no blotches. Every pixel in a row of the pattern `brass()` lays over
  its gradient has the same colour and alpha. Every row's alpha is at most 0.15. Light and dark rows
  both appear in every 4 px of its height.
- **AC-2** The bar and the gold rim are still textured brass. `brass()` still draws both, with the
  same brass-piece count as before. The bar keeps its bevel and its rivet.
- **AC-3** In play, in a round's intro and on the start screen, the count board has no ring of
  bulbs.
- **AC-4** When a round is won, a ring of bulbs appears around the count board's frame. Its bulbs grow
  in one after another, clockwise from the top left, and all are full size by 0.6 s. From then on the
  ring chases in the frenzy marquee's colours, with bulb `i` lit when `(i + step) % 3 !== 0`, where
  `step = floor(game.T * 9)`. When the next round's intro starts, the ring is gone.
- **AC-5** When time runs out short, the ring appears, all of it full size by 0.6 s. Neighbouring bulbs
  are out of step: one red (`BULB.red`), the next dark. Every 0.5 s of `game.T` each bulb swaps between
  red and dark. The bar's groove still flashes red as before (the `pips` state is `flash`).
- **AC-6** 1.5 s after time runs out short, the "Out of time" card shows as before. The red ring keeps
  blinking (AC-5) while it shows, in portrait and in landscape, and after the phone is turned. Play
  again starts round 1 with no ring.
- **AC-7** After round 6 is won, the gold chase keeps going while the "Closing time!" card shows.
- **AC-8** Every ring bulb's centre is at or below `L.top`, inside the stage's width and left of the
  sound button's left edge, in portrait and in landscape.
- **AC-9** Nothing else changes: the timer, the frenzy marquee, the board's digits and its swell when a
  hit lands. The existing Splat Gallery tests pass unchanged, apart from any whose literal brass
  texture this replaces. The only new test hooks are the ring's bulbs and the brass pattern.

## States

| State                     | Bar                     | Ring around the board            |
| ------------------------- | ----------------------- | -------------------------------- |
| Playing, under the quota  | brass, filling          | none                             |
| Playing, quota met        | gold, full; gold rim    | none                             |
| Round won (1.6 s / 2 s)   | gold, full; gold rim    | grows in, gold chase             |
| Round lost (1.5 s)        | groove flashes red      | grows in, red, swapping each 0.5 s |
| "Out of time" card        | groove, no flash        | red, swapping each 0.5 s         |
| "Closing time!" card      | gold, full; gold rim    | gold chase                       |
| Start screen              | hidden                  | none                             |

## Out of scope

- The timer board, the frenzy marquee and the hit swell.
- Sounds: no new sound for the ring.
- `specs/splat-gallery.md`'s HUD section is brought up to date in its follow-up docs PR, as for the
  count board itself.

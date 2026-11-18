# Splat Gallery: a bouncing ball you paint, which knocks targets down for you

**Go:** "Do an adversarial review to get the sensible answers and proceed." 2026-11-18 (the four open answers delegated to the review)

## Intent

The owner, on 2026-11-18: "Level 9. We are thinking of adding a new level where a ball appears and
it's jumping or bouncing from side to side, from one side of the screen to the other side of the
screen. On top of the targets? Yeah, the targets. And then if you hit it with the paintball, then
every time it hits another target, it gives you the points since you hit the ball. So now do an
adversarial review of this proposal to find some game level that will be appropriate and fun and
challenging in the game."

Claude's review found that a run has 6 rounds, the last, Closing time, ending it; that a ball "on top
of the targets" in front of every lane would block every shot and be the easiest thing to hit; that
a ball scoring "every time it hits another target" with no end plays the game for you; and that its
knocks counting to the goal without a cap could clear a round with no aiming. It proposed a round
"Bouncer" before Closing time. Asked four questions (where, whether knocks count, which lane, whether
Closing time gets it), the owner answered: "Do an adversarial review to get the sensible answers and
proceed." The answers below are Claude's, settled by that review.

The surface is Splat Gallery's booth (customer-facing), drawn on its canvas. There is no `DESIGN.md`,
so the baseline is the design: the booth's own pieces and the pack's palette. The ball is drawn by
the game, like the paintballs (the pack has no ball).

## Decisions

The owner delegated the four open questions to an adversarial review ("Do an adversarial review to
get the sensible answers and proceed.", 2026-11-18). A fresh reviewer, given only this spec and the
owner's words, agreed with all four answers and found the gaps fixed below (Claude, 2026-11-18).

- **Read deliberately.** "On top of the targets" is read as over them in depth (in front of its
  lane's targets, its hop rising over them), not rolling along their heads; "every time it hits
  another target" is bounded (a charge lasts 6 s and 5 knocks), so it never plays the game for you
  (Claude, 2026-11-18).
- **Where: a new round 6, "Bouncer", before Closing time, which becomes round 7.** Each round adds
  one thing; this one adds the ball. Closing time stays the last round ("everything at once") and
  gets the ball too, once. There is no round 9 to add: "level 9" is read as "the next new level". The
  run grows by about 34 s (the round, its intro and its won card), to about 4 minutes. A best round
  of 6 kept from before now reads as Bouncer, not Closing time; accepted. Rejected: rounds 7–9 after
  Closing time (it would no longer close, and the run would pass 5 minutes); the ball inside an
  existing round (each round's one new thing is what makes the next one readable) (Claude,
  2026-11-18).
- **Bouncer's other values** are Gold rush's (lane speeds 50 → 90, pop-ups, drop-downs, turnabouts,
  a frenzy, two tiny targets) with one gold duck, not two, and a quota of 34. Closing time's quota
  rises from 34 to 36, for its ball's up to 7 pips. Bouncer's two balls can bring up to 14 pips, so
  34 keeps it harder than Gold rush's 30 for a good shot. Starting values, tuned by playing (Claude,
  2026-11-18).
- **The lane: always the middle lane** (portrait lane 2 of 0–4, a water lane, so it carries ducks and
  can carry the gold duck; landscape lane 1 of 0–2, grass; both worth 2 pips), so the ball is in one
  depth, drawn and judged like a target in that lane, in front of its lane's other targets. Rejected:
  in front of every lane (it would block every shot and be the nearest, easiest thing); a lane drawn
  each time (in the far lane it would sit under the tiny target; in the near lane it would be easy)
  (Claude, 2026-11-18).
- **The ball**: a red-and-white striped fairground ball, its diameter 0.8 of its lane's target size
  (at least 44 CSS px at 390×844, 360×640 and 844×390, the main spec's 44 px floor for far targets), the only thing in the booth on
  no stick, with a soft shadow under it on its lane that shrinks as it rises, so its bounce can be
  read and led. It hops along its lane: its lowest point (the bounce) on the lane's line, its highest
  a third of a target above it, a hop every 0.8 s. It moves at 105 units a second in either layout
  (1.5× its lane's 70, close to the gold duck's 112), unchanged by a frenzy or the last seconds'
  rush. It comes in from one side (drawn each time, or set by the tests), turns back at the curtains'
  inner edge on each side (outside the "a lane keeps one way" rule, which is for targets on sticks)
  and, uncharged, rolls out past the next curtain it reaches once it has been 8 s on the stage. It
  doesn't rock or turn. Uncharged, it passes in front of its lane's targets without touching them.
  Rejected: a speed of a quarter of the stage width a second (3.5× the lane in landscape), 0.7 of a
  target (under 44 px in two layouts), a hop of half a target (too hard to lead in a 0.3 s flight)
  (Claude, 2026-11-18).
- **When**: twice in Bouncer, due at 5–9 s and 17–21 s on the round's clock (`game.elapsed`, which
  stops in a frenzy); once in Closing time, due at 5–21 s. One at a time: one due while another is on
  the stage, or in a frenzy, waits; one not yet in with under 6 s left never comes; one on the stage
  when the round ends goes with it, as targets do (Claude, 2026-11-18).
- **Hitting it** (paid or free) charges it: it takes the hitting ball's paint colour on its white
  stripes and scores as a hit on a middle-lane target with no bullseye: 2 pips and 20 points times
  `multiplier()` (a free frenzy ball counts 1 pip, as every frenzy hit does). A paid hit moves the
  assist as any hit; the assist grows its area as it does a target's body. A charged ball takes no
  shots: they pass through it to what is behind (Claude, 2026-11-18).
- **Charged**, for 6 s on its own clock (then it rolls out past the next curtain it reaches), it
  knocks down every live target in its lane whose hit shape its circle overlaps, where both are
  drawn, if that target stands clear of the curtains: movers, backs (it beats a turnabout), drop-downs
  and pop-ups once fully risen; never the tiny target or the frenzy target (a guard: neither comes
  into the middle lane in rounds 6 and 7). A knocked target takes a splat in the ball's colour and
  goes down as a hit one does. Each knock is the next link of a chain: knock n scores 10 × the lane's
  pips × n points (20, 40, 60, 80, 100) times `multiplier()` as it is at that moment (at most ×4 for
  a knock: the bonus's ×2 and closing time's ×2; the ×8 cap stands), and counts **1 pip**. A knocked
  gold duck refills the hopper, as a hit one does. At most 5 knocks a charge: after the 5th it rolls
  out. One charge adds at most 2 + 5 = 7 pips. The choice it makes: shoot it now, or wait for its
  lane to fill and risk it rolling out. Rejected: knocks worth their lane's pips (up to 12 pips a
  charge, 24 a round, most of the quota); points only (it would never help clear a round, so shooting
  it would be a side bet) (Claude, 2026-11-18).
- **Sounds**, from the game's own: a soft `plip` each time it turns at a curtain, the `hit` knock
  (higher, `rate` 1.3) when charged, and a `hit` per knock climbing in pitch with the chain. No new
  sound file (Claude, 2026-11-18).
- **Paused, turned or counting back in**, it holds still with the rest of the booth, its clocks
  stopped (Claude, 2026-11-18).
- **Round 6 becomes round 7 wherever the rules say "round 6"**: the assist is off in the last round
  (now 7), two tiny targets in rounds 4 to 7, the Closing time card and its gold chase after the last
  round. `LAST_ROUND` is 7. The tests that start round 6 to mean Closing time start round 7. The
  older specs that say "round 6" for Closing time (`specs/splat-gallery.md`'s rounds table and its assist item,
  `specs/splat-gallery-board-lights.md`, `specs/splat-gallery-goal-and-tiny-target.md`) are brought
  up to date in a later docs change, as R-10 does for the frenzy: a change touches one spec file
  (Claude, 2026-11-18).

## Acceptance items

- **AC-1** The rounds are, in order, Warm-up, Pop-ups, Drop-downs, Turnabouts, Gold rush, Bouncer and
  Closing time; Bouncer has Gold rush's lane speeds, pop-ups, drop-downs, turnabouts, frenzy and two
  tiny targets, one gold duck and a quota of 34; Closing time's quota is 36; Closing time is the last
  round and its won card is "Closing time!".
- **AC-2** No ball comes in rounds 1 to 5; Bouncer schedules two, one due 5–9 s and one 17–21 s into
  `game.elapsed`; Closing time schedules one, due 5–21 s in; at most one is on the stage at a time,
  and one due while another is on the stage comes after it has gone.
- **AC-3** A ball due in a frenzy comes when the frenzy ends; none comes with under 6 s left; a ball on
  the stage when the round ends is gone in the next round.
- **AC-4** The ball moves in the middle lane (portrait lane 2, landscape lane 1): its lowest point on
  the lane's line, its highest a third of a target above it, a hop every 0.8 s, at 105 units a second
  in both layouts, in a frenzy and in the last 3 s too; it can come in from either side, turns back
  at the curtains' inner edge without passing behind them, and uncharged rolls out past a curtain
  once it has been 8 s on the stage.
- **AC-5** The ball is drawn as a red-and-white striped ball, 0.8 of its lane's target size, with no
  stick and a shadow on its lane, in front of its lane's targets; it is at least 44 CSS px across at
  390×844, 360×640 and 844×390.
- **AC-6** A shot lands on the ball where it is drawn, mid-hop: it is charged, takes the shot's
  colour, scores 2 pips and 20 points times `multiplier()` (no bullseye), and a paid hit moves the
  assist; a free frenzy ball on it counts 1 pip.
- **AC-7** Uncharged, the ball knocks nothing it passes.
- **AC-8** Charged, it knocks every live target in its lane it overlaps clear of the curtains, a back,
  a drop-down and a risen pop-up too; never a pop-up still rising from behind its strip, the tiny
  target, the frenzy target, a target behind a curtain, nor a target in another lane; a knocked
  target goes down as a hit one does, splatted in the ball's colour; a knocked gold duck refills the
  hopper.
- **AC-9** Knock n of a charge scores 10 × the lane's pips × n points times `multiplier()` and counts
  1 pip; a charge knocks at most 5, then the ball rolls out; otherwise it rolls out once 6 s charged.
- **AC-10** A shot at a charged ball passes through it to what is behind.
- **AC-11** Its sounds: `plip` as it turns at a curtain, `hit` at `rate` 1.3 when it is charged, and a
  `hit` for each knock, each knock's rate higher than the one before.
- **AC-12** The assist is off in round 7, not round 6; rounds 4 to 7 schedule two tiny targets; the
  Closing time card and its gold chase come after round 7 is won, and winning round 6 goes on to
  round 7.
- **AC-13** Paused or turned, the ball holds still.

## Out of scope

- New sound files or sprites; the ball is drawn and its sounds are the game's own.
- Rounds after Closing time.
- Updating `specs/splat-gallery.md`'s rounds table (a later docs change, as for R-10).
- Re-tuning rounds 1 to 5's quotas.

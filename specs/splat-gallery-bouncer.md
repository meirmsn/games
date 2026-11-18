# Splat Gallery: a bouncing ball you paint, which knocks targets down for you

**Go:** pending

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
proceed." The answers below are Claude's, from that review.

The surface is Splat Gallery's booth (customer-facing), drawn on its canvas. There is no `DESIGN.md`,
so the baseline is the design: the booth's own pieces and the pack's palette. The ball is drawn by
the game, like the paintballs (the pack has no ball).

## Decisions

- **Where: a new round 6, "Bouncer", before Closing time, which becomes round 7.** Each round adds
  one thing; this one adds the ball. Closing time stays the last round ("everything at once") and
  gets the ball too. There is no round 9 to add: "level 9" is read as "the next new level". The run
  grows by one 30 s round, to about 4 minutes. Rejected: rounds 7–9 after Closing time (it would no
  longer close, and the run would pass 5 minutes); the ball inside an existing round (each round's
  one new thing is what makes the next one readable) (Claude, 2026-11-18).
- **Bouncer's other values** are Gold rush's (lane speeds 50 → 90, pop-ups, drop-downs, turnabouts,
  a frenzy, two tiny targets) with one gold duck, not two, and a quota of 32 (Gold rush 30, Closing
  time 34). Starting values, tuned by playing (Claude, 2026-11-18).
- **The lane: always the middle lane** (portrait lane 2 of 0–4, landscape lane 1 of 0–2, both worth
  2 pips), so the ball is in one depth, judged and occluded like any target in that lane. Rejected: in
  front of every lane (it would block every shot and be the nearest, easiest thing); a lane drawn
  each time (in the far lane it would sit under the tiny target; in the near lane it would be easy)
  (Claude, 2026-11-18).
- **The ball**: a red-and-white striped fairground ball, its diameter 0.7 of its lane's target size,
  the only thing in the booth on no stick. It hops along its lane's line in arcs (the lowest point on
  the line, the highest half a target above it, 0.8 s a hop) and crosses at a quarter of the stage
  width a second, about 4 s a crossing in either layout. It comes in from one side (drawn each time),
  turns back at each side of the stage and, uncharged, rolls out after 2 crossings (about 8 s). It
  doesn't rock, turn or spin a stick. Uncharged, it passes in front of its lane's targets without
  touching them (Claude, 2026-11-18).
- **When**: twice in Bouncer, due at 5–9 s and 17–21 s on the round's clock; once in Closing time, due
  at 5–21 s. One at a time. Never during a frenzy (one due then comes when it ends), nor with under
  6 s left; one on the stage when the round ends goes with it (Claude, 2026-11-18).
- **Hitting it** (paid or free) charges it: it takes the hitting ball's paint colour on its white
  stripes and scores as a hit on a middle-lane target with no bullseye (2 pips, 20 points times the
  round's multipliers; a free frenzy ball counts 1 pip, as every frenzy hit does). A paid hit moves the
  assist as any hit; the assist grows its area as it does a target's body. A charged ball can't be
  charged again; a shot on it splats it and scores nothing (Claude, 2026-11-18).
- **Charged**: for its next 2 crossings it knocks down every live target in its lane it touches,
  backs included (it beats a turnabout), never a pop-up still behind the strip, the tiny target or
  the frenzy target. Each knock is the next link of a chain: knock n scores 10 × n points (20, then
  40, 60 … for a 2-pip lane, so 10 × lane pips × n) times the round's multipliers, never past ×8 in
  all, and counts **1 pip**. At most 5 knocks a charge; after the 5th, or the 2 crossings, it rolls
  out. So one charge can add at most 2 + 5 = 7 pips, a fifth of Bouncer's quota: worth chasing, never
  a round won by itself. The choice it makes: shoot it now, or wait for its lane to fill and risk it
  rolling out. Rejected: knocks worth their lane's pips (up to 12 pips a charge, 24 a round, most of
  the quota); points only (it would never help clear a round, so shooting it would be a side bet)
  (Claude, 2026-11-18).
- **Sounds**, from the game's own: a soft `plip` each time it turns at a side, the `hit` knock
  (higher, `rate` 1.3) when charged, and a `hit` per knock climbing in pitch with the chain. No new
  sound file (Claude, 2026-11-18).
- **Round 6 becomes round 7 wherever the rules say "round 6"**: the assist is off in the last round
  (now 7), two tiny targets in rounds 4 to 7, the Closing time card and its gold chase after the last
  round. `LAST_ROUND` is 7 (Claude, 2026-11-18).
- `specs/splat-gallery.md`'s rounds table is brought up to date with the rest of that spec's rounds
  text in a later docs change, as R-10 does for the frenzy (one spec file per change; Claude,
  2026-11-18).

## Acceptance items

- **AC-1** The rounds are, in order, Warm-up, Pop-ups, Drop-downs, Turnabouts, Gold rush, Bouncer and
  Closing time; Bouncer has Gold rush's lane speeds, pop-ups, drop-downs, turnabouts, frenzy and two
  tiny targets, one gold duck and a quota of 32; Closing time is the last round and its won card is
  "Closing time!".
- **AC-2** No ball comes in rounds 1 to 5; Bouncer schedules two, one due 5–9 s and one 17–21 s in;
  Closing time schedules one, due 5–21 s in; at most one is on the stage at a time.
- **AC-3** A ball due in a frenzy comes when the frenzy ends; none comes with under 6 s left; a ball on
  the stage when the round ends is gone in the next round.
- **AC-4** The ball moves in the middle lane (portrait lane 2, landscape lane 1): its lowest point on
  the lane's line, its highest half a target above it, a hop every 0.8 s, crossing at a quarter of
  the stage width a second; it comes in from either side (both seen over several balls), turns back
  at each side of the stage without leaving it, and uncharged rolls out after 2 crossings.
- **AC-5** The ball is drawn as a red-and-white striped ball, 0.7 of its lane's target size, with no
  stick, in front of its lane's targets; it is at least 30 CSS px across at 390×844, 360×640 and
  844×390.
- **AC-6** A shot lands on the ball where it is drawn, mid-hop: it is charged, takes the shot's
  colour, scores 2 pips and 20 points times the round's multipliers (no bullseye), and a paid hit
  moves the assist; a free frenzy ball on it counts 1 pip.
- **AC-7** Uncharged, the ball knocks nothing it passes.
- **AC-8** Charged, it knocks every live target in its lane it touches, a back too; never a pop-up
  behind its strip, the tiny target or the frenzy target, nor a target in another lane.
- **AC-9** Knock n of a charge scores 10 × the lane's pips × n points, times the round's multipliers,
  at most ×8 in all, and counts 1 pip; a charge knocks at most 5, then the ball rolls out; otherwise
  it rolls out after 2 more crossings.
- **AC-10** A shot on a charged ball scores nothing and leaves it charged.
- **AC-11** Its sounds: `plip` as it turns at a side, `hit` at `rate` 1.3 when it is charged, and a
  `hit` for each knock, each knock's rate higher than the one before.
- **AC-12** The assist is off in round 7, not round 6; rounds 4 to 7 schedule two tiny targets; the
  Closing time card and its gold chase come after round 7 is won, and winning round 6 goes on to
  round 7.
- **AC-13** Paused or turned, the ball holds still and the resuming tap doesn't hit it.

## Out of scope

- New sound files or sprites; the ball is drawn and its sounds are the game's own.
- Rounds after Closing time.
- Updating `specs/splat-gallery.md`'s rounds table (a later docs change, as for R-10).
- Re-tuning other rounds' quotas.

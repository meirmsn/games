# Splat Gallery: the frenzy target and frenzy hits count toward the round's goal

**Go:** pending

## Intent

The owner asked, on 2026-11-17, in chat: "On the Splat Gallery game, when you hit the target that
will start the frenzy mode, it doesn't count towards the total number of targets that you hit, and
it should. And actually, if it's on the fifth row or whatever row, you know, on the rows behind, it
should also count +2 or +3 or whatever is appropriate for that row. Furthermore, when you are in
the frenzy mode, the target that you hit should also count. I think they should count as one, all
of them. It doesn't matter if they're behind or not behind. […] maybe we can start with each one
counting as one. Maybe it's gonna alter the balance of the game. Maybe it's gonna make simpler the
initial levels. So do some adversarial review of this proposal to see what makes sense to keep the
fun on this. I'm looking for some simple tweaks, not a full revamp."

Today (`splat-gallery/game.js` `landOn`) the frenzy target scores a flat +50 points and no pips, and
every ball fired during a frenzy is free and scores points ×2 but no pips (a rule Claude chose in
the first build: `specs/splat-gallery.md`, "Frenzy"). The count board shows the round's pips
against its quota. A lane's pips are 3 for the farthest lane, 1 for the nearest and 2 for every lane
between (in landscape and portrait alike).

The surface is the game's booth canvas, customer-facing. The game has its own look (no
`DESIGN.md`); this change adds nothing to draw, only changes what the count board counts.

## Decisions

- The frenzy target adds its lane's pips to the count (1, 2 or 3), like any other target in that
  lane, a bullseye no more than its body; it keeps its +50 points; rejected: a flat 1 pip (the owner
  asked for the row's value) (owner, 2026-11-17).
- A frenzy shot is a ball fired while the frenzy is on (it is free). Every target or duck it hits
  adds 1 pip, whatever its lane, a gold duck or tiny
  target included (none rise in a frenzy today, but a gold duck can be on the water when it
  starts), even if it lands just after the frenzy ends; a paid ball fired just before the frenzy that
  lands in it counts as a normal shot (its lane's pips, and it moves the assist). Points still follow
  the frenzy at the moment the ball lands, as now; rejected: the lane's pips (the owner: "they should count as one, all of them") and half
  a pip (the owner: "we don't have a way to count 0.5") (owner, 2026-11-17).
- Frenzy shots still don't move the assist and frenzy misses still don't count against it: a
  frenzy late in a round must not lose the run (Claude, 2026-11-17, keeping the first build's rule).
- A frenzy hit that reaches the quota starts the bonus there and then, with its sound; the
  "Bonus!" sign stays hidden during the frenzy, as now. Points are unchanged: a hit in the bonus
  during a frenzy takes the higher of the two multipliers, as now (Claude, 2026-11-17).
- The frenzy target's pips are added after the frenzy starts, so when they reach the quota the
  bonus starts with its sound and the "Frenzy!" sign shows, not "Bonus!". Hitting the frenzy target
  still leaves the assist alone, as now (Claude, 2026-11-17).
- No quota changes with this change. The balance review (below) expects rounds 1 and 2 to get
  easier; the owner plays it on the preview and the quotas are the knob if they do (Claude's
  proposal, 2026-11-17; **open for the owner**).
- The main spec (`specs/splat-gallery.md`), in its "Frenzy" paragraph and its acceptance item on the frenzy, and the test of
  that item in `tests/splat-gallery.test.mjs`, stop saying "no pips" (Claude, 2026-11-17).

### Balance review (Claude, 2026-11-17)

- **The frenzy is extra time.** The round's 30 s clock stops for the frenzy's 7 s, and every shot in
  it is free, so its pips come on top of a normal round. Misses cost nothing, the only limit
  is a 0.12 s gap between shots, and a target springs up every 0.22–0.4 s (about 22 a frenzy, on
  top of the crossing ones at 1.6×). A guess: a careful player hits 8, a fast spammer 20, so a
  frenzy adds 8–20 pips, plus 1–3 for the frenzy target.
- **Round 1 (quota 7) will nearly always clear in the frenzy.** Its frenzy target is big, rises
  for 3.5 s in one of the two nearest lanes and comes again if missed. It's the warm-up, so this
  is acceptable, and it teaches that the frenzy pays.
- **Round 2 (quota 13) gets much easier**: the frenzy target crosses a middle lane at normal speed,
  so most players catch it, and a frenzy may give most of the quota.
- **Round 3 (quota 18) gets easier too**: 9–21 pips is half the quota or all of it.
- **Rounds 4–6 (24–34) shift less**: the frenzy target crosses the farthest lane (or, in portrait,
  the two farthest) at 1.8× speed, so it is earned even with its second chance, and its pips are
  about a quarter to two thirds of the quota. Hitting it
  becomes the round's big moment, which is the fun the owner is after.
- **Not stacking**: frenzy pips are flat 1s, so the far lanes' 3 stays worth aiming for outside the
  frenzy, and the tip "far targets count more" stays true.
- **If rounds 1–2 feel too easy**, the one simple knob is their quota of rounds 1–3 (for example 7 → 10, 13 → 16, 18 → 21); a cap on frenzy pips was rejected, because a count that stops climbing mid-frenzy
  looks like a bug.

## Acceptance items

- **AC-1** Hitting the frenzy target adds its lane's pips to the count: 3 in the farthest lane, 2 in
  a middle lane, 1 in the nearest, bullseye or not; its points stay +50 whatever the bonus, the
  frenzy starts, and the assist is unchanged.
- **AC-2** Every hit by a frenzy shot (a ball fired while the frenzy is on) on a target or duck,
  bullseye or not, in any lane, adds exactly 1 pip to the count, also when it lands just after the
  frenzy ends; points are as before (×2 while the frenzy is on, or the bonus's multiplier if
  higher).
- **AC-3** A paid ball fired just before a frenzy that hits during it adds its lane's pips and moves
  the assist, as a normal hit does.
- **AC-4** A hit on a target's back, and a miss, during a frenzy add no pips, and frenzy shots still
  leave the assist unchanged.
- **AC-5** A frenzy hit (or the frenzy target) that brings the count to the quota starts the bonus
  and plays the quota sound; during the frenzy the sign shows "Frenzy!", not "Bonus!".
- **AC-6** `specs/splat-gallery.md`'s "Frenzy" paragraph and its acceptance item on the frenzy say frenzy hits count 1 pip
  and the frenzy target its lane's pips.

## Out of scope

- Changing any quota (if the owner wants one, it is a follow-up after playing this), the frenzy's length, its speed or how often its targets spring up.
- Changing points for any hit.
- Showing "Bonus!" after a frenzy in which the quota was reached.

# Splat Gallery: a last round, the Sharpshooter, where targets rise one at a time from below

**Go:** "Go" 2026-11-18

## Intent

The owner asked, on 2026-11-18, in chat: "Do we have a level? And if not, can you make it the last
level that is more like sniper, where, you know, it shows nothing, and then they, one at a time,
they come from below, and you have to aim and shoot it. You should give enough time so that, you
know, it is possible to hit them. And in some of them, especially, and in some of them, you should
also make them with no possible, you know, time. So just in case, luckily, you were aiming in that
direction, you hit them. But this, you know, not all of them should be like this. And I wonder if
you should show, definitely don't move them from left to right. This is more like coming from
below. Maybe sometimes you can show two at a time, later in the timer. But on the beginning, just
do one by one. And then if you hit frenzy, then, you know, the frenzy, it's all of them coming from
below. Does that make sense?"

Today (`splat-gallery/game.js` `ROUNDS`) the run has 6 rounds, Warm-up to Closing time; every one
has targets and ducks crossing every lane, and from round 2 pop-ups, drop-downs and the rest on
top. No round has an empty booth. Closing time is the last round: winning it shows "Closing time!",
plays the finale and ends the run (`specs/splat-gallery.md`, "Rounds").

The surface is the game's booth canvas, customer-facing. The game has its own look (no
`DESIGN.md`); this round draws nothing new: its targets are the pack's pop-up targets, rising from
behind the lanes' strips as pop-ups already do.

## Decisions

- A seventh round, the last, named "Sharpshooter" (a fairground word for the owner's "sniper"),
  after Closing time; rejected: replacing a round (the owner: "make it the last level") (Claude's
  proposal, 2026-11-18).
- Closing time stays as it is (its ×2, lamps, gold duck, everything at once, the assist off) but is
  no longer the last: winning it shows "Round cleared" like any other round. The "Closing time!"
  sign and card, the finale, the 2 s hold and the gold chase move to winning the Sharpshooter, still
  lettered "Closing time!" because the booth closes then (Claude, 2026-11-18).
- **Nothing crosses.** No targets or ducks run along the lanes, no drop-downs (they come from
  above, on ropes), no gold ducks, no turnabouts, no tiny target, none of the other rounds' pop-up
  spawning: the booth is empty between targets. Every target is a pop-up rising from behind a
  lane's strip, anywhere along it, in any lane (the owner: "definitely don't move them from left to
  right … coming from below"). In the code a round flag (`sharp: true`) turns the other spawners off
  and runs this round's sequence instead (Claude, 2026-11-18).
- **One at a time.** A target rises 0.6–1.4 s after the booth is empty again (the last target has
  dropped out of sight, or been hit: the wait counts from the hit), so the booth shows nothing in
  between (the owner: "it shows nothing, and then they, one at a time"). The first rises 0.8 s
  after play starts (the round's sign has faded by then) (Claude's starting values, 2026-11-18).
- **Fair and flash.** A fair target rises and drops in 0.35 s, as pop-ups do, and stays fully up
  2.2 s: time to see it, pull for about 1.2 s and land in the farthest lane (a flight is 0.45 s
  there) with about 0.5 s to spare. About one in four is a **flash**, only in the middle and farthest
  lanes: it rises and drops in 0.2 s and stays up 0.15 s, too quick to aim at, hittable by a ball
  already on its way or a pull already aimed there (the owner: "no possible time … luckily, you were
  aiming in that direction"). The round's first three rises are never flashes, and two flashes
  never come in a row (the owner: "not all of them should be like this") (Claude's starting values,
  2026-11-18).
- **Two at a time, later.** From 15 s into the round (its own clock, which stops in a frenzy),
  about one rise in three is a pair: two fair targets rise together in different lanes, their
  centres at least twice the wider one's width apart across the booth; the next rise waits until
  both are gone. A pair is never a flash (the owner: "Maybe sometimes you can show two at a time,
  later in the timer. But on the beginning, just do one by one") (Claude, 2026-11-18).
- **The last seconds.** The other rounds' targets cross faster from 10 s left; here nothing crosses,
  so instead the waits between rises halve from 10 s left (0.3–0.7 s), and the music speeds up as in
  every round. No rise starts in the last 1.5 s (Claude, 2026-11-18).
- **Scoring is the other rounds'.** Lane pips 1 / 2 / 3, bullseye ×2 and a ball back, the bonus
  after the quota, frenzy ×2 and frenzy shots 1 pip; no closing-time ×2. A ball that lands after
  the time runs out is handled as in every other round (Claude, 2026-11-18).
- **The quota is 12, a starting value, tuned by simulated play** as the other rounds were (the
  scripted beginner, average and expert shooters, both layouts, with and without the frenzy hit):
  the expert clears the Sharpshooter in most runs, the average player in some, the beginner rarely.
  If the measurement says otherwise the quota moves, and the PR says to what and why. The
  arithmetic: an unhit fair rise takes about 3.9 s with its wait and a flash about 1.5 s, so about
  9–11 rises in 30 s with the pairs, worth about 2 pips each, so about 20 pips if every one is hit;
  a frenzy (about 22 pop-ups, 1 pip a hit) can fill much of the quota on its own, as in other rounds
  (Claude, 2026-11-18).
- **Its frenzy.** The frenzy target is one of the sequence's rises: when it is due (4–10 s in, again
  16–22 s if missed, as in every round) it takes the next rise, alone, in one of the two farthest
  lanes (the farthest in a booth of 3 or fewer), rising from below and staying up 1.6 s; it never
  crosses. In the frenzy every target that springs up is a pop-up, rising from behind any lane's
  strip, as often as in other frenzies (every 0.22–0.4 s), with no drop-downs (the owner: "the
  frenzy, it's all of them coming from below"). The sequence waits during the frenzy and goes on
  0.8 s after the frenzy has ended and the booth is empty (Claude, 2026-11-18).
- The hidden assist is off in the Sharpshooter as in Closing time (rounds 6 and 7); a run lost in
  it doesn't raise the assist (that is only rounds 1 and 2) (Claude, 2026-11-18).
- The round's look: round 2's red booth (`bg: 'red'`, without its `shade`) under the dusk of rounds
  5 and 6, without the lamps, so it reads as later and quieter; its sign gives its quota and the
  usual tip (Claude, 2026-11-18).
- Pausing (and the 1 s count back in) freezes the round as everywhere: a target that is up stays up
  (Claude, 2026-11-18).
- The run's length grows by one 30 s round, to about 4 minutes for a full run (Claude, 2026-11-18).
- The main spec, `specs/splat-gallery.md`, still says 6 rounds and that Closing time is last; this
  spec supersedes those lines. Its text is amended in a follow-up docs PR, as R-10 does for the
  frenzy-counts change, because the reviewer takes one spec file per change (Claude, 2026-11-18).
  The tests of the main spec and of `specs/splat-gallery-board-lights.md` that treat round 6 as the
  last expect the Sharpshooter instead.

## Acceptance items

- **AC-1** The run has seven rounds; the seventh's sign reads "Round 7", "Sharpshooter", its quota
  "to clear" and the tip.
- **AC-2** Winning Closing time (round 6) shows "Round cleared" and goes on to round 7; it plays no
  finale and doesn't end the run.
- **AC-3** Winning the Sharpshooter shows the "Closing time!" sign with the score, plays the finale,
  keeps the gold chase and ends the run on the "Closing time!" card, as winning round 6 did.
- **AC-4** In the Sharpshooter, outside a frenzy, every target is a pop-up that rises from behind a
  lane's strip and never moves along the lane; no crossing target or duck, drop-down, gold duck,
  turnabout or tiny target appears at any point of the round.
- **AC-5** Until 15 s into the round, at most one target is up at a time (the frenzy target
  included); each rises 0.6–1.4 s after the booth is empty again (from the hit, for a hit target),
  and the first 0.8 s after play starts.
- **AC-6** From 15 s into the round, over a seeded sample of at least 300 rises, 20–45% are pairs:
  two fair targets in different lanes, their centres at least twice the wider one's width apart; at
  most two targets are ever up at once, and the next rise waits until both are gone.
- **AC-7** A fair target rises in 0.35 s, stays up 2.2 s and drops in 0.35 s; a flash rises in
  0.2 s, stays up 0.15 s, drops in 0.2 s and is never in the nearest lane. Over a seeded sample of
  at least 300 single rises 15–35% are flashes; the first three rises of a round never are, and two
  flashes never come in a row.
- **AC-8** A fair target in the farthest lane can be hit by a ball released 1.2 s after it is fully
  up, aimed at it: it lands before the target starts to drop, in portrait and landscape.
- **AC-9** From 10 s left the waits between rises are 0.3–0.7 s; no rise starts with under 1.5 s
  left.
- **AC-10** The Sharpshooter's frenzy target rises alone, as one of the sequence's rises, from
  behind one of the two farthest lanes' strips (the farthest in a booth of 3 or fewer) and stays up
  1.6 s; it never crosses.
- **AC-11** During the Sharpshooter's frenzy every target that springs up is a pop-up from behind
  some lane's strip, and no drop-down appears; the sequence goes on 0.8 s after the frenzy has ended
  and the booth is empty.
- **AC-12** Hits in the Sharpshooter score as in other rounds (lane pips, bullseye, bonus, frenzy),
  with no closing-time ×2, and the assist is 0 for every shot in it.
- **AC-13** Rounds 1–6 play as before: their targets, timings, quotas, scoring and the assist being
  off in round 6 are unchanged, apart from round 6 no longer being the last (AC-2).
- **AC-14** The PR states the simulated-play measurement for the Sharpshooter (how often the
  beginner, average and expert scripts clear it, in both layouts, with and without the frenzy hit)
  and the quota it chose — verified by review: the PR body.

## Out of scope

- Changing any other round, its quota, or the frenzy's length or speed.
- New art, sounds or music: the round uses the pack's pop-ups and the existing sounds.
- Amending `specs/splat-gallery.md`'s text (a follow-up docs PR).
- The landing tile's picture and line.

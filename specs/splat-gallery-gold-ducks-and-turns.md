# Splat Gallery: more gold ducks you can't miss, and gentler turnabouts in round 4

**Go:** "go with a, do it on a child session" 2026-11-18

## Intent

The owner asked, on 2026-11-18, in chat, after watching recordings of rounds 5 to 7: "It was not
clear that it had the golden dogs. I didn't even see them on the video. I didn't notice. Um, I
wonder if we should add more of them. Play a special sound when they show up. And also on round 4,
perhaps the targets turn. Not all of them turn. Um, Or perhaps they all turn, but not as frequent,
like half as frequent as now. And then on round 5, they do turn around. They flip as frequent as
it is now."

Asked to choose, the owner picked: gold ducks "5 → 5, 6 → 3"; their look "Solid gold + sparkles";
their sound "Coin jingle"; round 4 "All turn, half as often" (2026-11-18).

Today (`splat-gallery/game.js`) a gold duck wears the same sprite as an ordinary yellow
target-duck (`duck_target_yellow`), with only a faint pulsing glow on top and 1.6× its lane's
speed, so it reads as any other duck. Round 5 (Gold rush) sends 2 and round 6 (Closing time) 1,
each due at a random moment 5–24 s into the round, independently, and nothing sounds as one
appears. From round 4 every target and duck turns on its stick: 2.2 s facing, a 0.25 s turn, 1.2 s
showing its back, a 0.25 s turn (`TURN`), about once every 3.9 s.

The surface is the game's booth canvas, customer-facing. The game has its own look (no
`DESIGN.md`); the gold tint and sparkle reuse the game's own gold (`#ffd23f`, the tiny target's
rim) and its `sparkle` drawing.

## Decisions

- **More gold ducks:** round 5 sends 5, round 6 sends 3 (the owner, 2026-11-18). Each round draws
  their times between 4 s and 24 s into the round on its own clock (which stops in a frenzy, so one
  due then comes when it ends), re-drawn until every two are at least 3 s apart, so they don't bunch
  up and each gets noticed; rejected: today's independent draws, which with 5 could send two at
  once, and a window up to 26 s, whose last duck would cross in the end-of-round rush (Claude,
  2026-11-18). Each swims a random water lane (lanes 0, 2 and 4 in portrait, 0 and 2 in landscape),
  as today. Their worth is unchanged (100 points, 2 pips, a full hopper), as is their speed (1.6×
  their lane's), so a gold duck may overtake a slower duck in its lane, passing in front of it, as
  it can today. The quotas stay; with more gold ducks the rounds get easier, and the owner judges
  that on the preview (Claude, 2026-11-18).
- **A gold duck you can't miss:** face on, the whole duck is drawn in the game's gold (`#ffd23f`):
  its sprite tinted gold so that its own light and dark parts, the painted target's rings included,
  show as lighter and darker gold, so the bullseye is still visible and still scores. It wears the
  tiny target's turning sparkle and leaves a short trail of sparkles behind it as it swims. While it
  turns or shows its back it is drawn as any duck's back, with no tint or sparkles. Rejected: a bulb
  ring like the frenzy target's, and keeping today's look (the owner, 2026-11-18, "Solid gold +
  sparkles"); its faint pulsing glow goes, replaced by the gold.
- **A coin jingle as it comes:** a short (under 1 s), bright jingle of coins and a little bell, like
  a payout, plays the moment each gold duck is sent (it enters from just off the booth's edge, in
  view within about a second), under the site-wide mute like every sound (the owner, 2026-11-18,
  "Coin jingle"). `scripts/splat-gallery/make-coins.py` synthesises it into
  `splat-gallery/sounds/coins.mp3`; it is no louder (RMS) than the frenzy target's flourish
  (`frenzyhit.mp3`) and plays at gain 1, so the 10 s bell stays the loudest cue (Claude, 2026-11-18).
- **Round 4 turns half as often:** in round 4 every target and duck still turns, but faces 6.1 s
  before each turn, so its cycle is 7.8 s, twice today's 3.9 s; its back (1.2 s) and turns (0.25 s
  each) are unchanged. Each target starts at a random point of its round's whole cycle, as today
  (the owner, 2026-11-18, "All turn, half as often"). Rounds 5 and 6 turn as today (the owner: "on
  round 5 … They flip as frequent as it is now"). A hit on a back scores nothing, gold duck or not.
- The tests that put a round-4 target on its back with today's timing (`tests/splat-gallery.test.mjs`)
  move to round 5 or to a back in the new cycle; they test the same thing (Claude, 2026-11-18).
- The main spec, `specs/splat-gallery.md`, says "two gold ducks" for round 5 and gives one turn
  timing for every round; this spec supersedes those lines, and the main spec's text is amended in
  a follow-up docs PR, as R-10 does (Claude, 2026-11-18).

## Acceptance items

- **AC-1** In round 5 exactly 5 gold ducks come, and in round 6 exactly 3; no other round has one.
- **AC-2** Over at least 200 seeded rounds 5 and 6, every gold duck is due between 4 s and 24 s
  into its round, on the round's own clock, each at least 3 s after the one before; one due in a
  frenzy comes after it ends.
- **AC-3** Face on, with the clock held still and drawn alone on a cleared canvas, at least 70% of
  a gold duck's opaque pixels are gold (R ≥ 200, G ≥ 150, B ≤ 0.6 × G), against at most 30% for an
  ordinary yellow target-duck drawn the same way; the drawing has sparkles. Turning or showing its
  back, it is drawn with no gold tint and no sparkles.
- **AC-4** The coin jingle plays in the same step a gold duck is sent, once per gold duck, and in
  no round without one.
- **AC-5** A gold duck still scores 100 points and 2 pips (a bullseye doubles the points), refills
  the hopper, and crosses at 1.6× its lane's speed.
- **AC-6** In round 4 a turning target faces 6.1 s, turns 0.25 s, shows its back 1.2 s and turns
  0.25 s, a 7.8 s cycle, starting anywhere in it; in rounds 5 and 6 the cycle is 2.2, 0.25, 1.2,
  0.25 s, as before.
- **AC-7** `coins.mp3` is no louder (RMS, measured as the game's other loudness checks are) than
  `frenzyhit.mp3`, plays at gain 1, and under the mute is silent like every other sound.

## Out of scope

- Any quota, speed or score change.
- The Sharpshooter round proposed in meirmsn/games#62, which has no gold ducks or turnabouts.
- Amending `specs/splat-gallery.md`'s text (a follow-up docs PR).

# Splat Gallery: the near water always shows, and the water sways like a machine

**Go:** "go" 2026-11-12

## Intent

The owner asked, on 2026-11-11, in chat, with a desktop screenshot of Splat Gallery
(`splat-gallery/`): "It happened that the first row of the water, I only see the tips of the
waves. Do you see that? I don't know if it happens because of the aspect ratio or the size of the
viewport But this should never happen. Also, I think we should make the water ones move also in a
mechanical, like if there was a mechanical machine moving them right and left, like oscillating,
like waves. It can be subtle."

The cause: the near lane's crest sits at `line + 0.74 × target size`, with the line 0.36 of the
way down an even share of the space between the valance and the counter. In landscape that puts
the near crest 7 units above the counter at every window size (it is the layout, not the
viewport); at 360×640 it is 1 unit below the counter, so the whole near lane is hidden; at
390×844, 17 units. A water crest's waves are about 24 units deep there, so only their tips show.

The surface is the game's booth canvas, customer-facing. The game has its own look (no
`DESIGN.md`; `specs/splat-gallery.md`); this change adds no colour or sprite, only moves existing
strips.

## Decisions

- The near lane's strip shows at least twice its waves' depth above the counter (the whole wave
  and as much water again under it), in every layout. A strip's waves' depth is the spread of its
  tile's top contour (highest to lowest crest), at the strip's scale. When the even spacing gives
  less, the lanes' spacing (`L.band`) shrinks just enough, from the same top: in landscape 16:9 it
  goes from 96 to about 78 units, so every lane moves up, the nearer ones most; rejected: a shorter counter (it is the thumb's pad, sized for the pull) and shrinking
  the targets (the far ones are at their 44 px floor) (Claude, 2026-11-11).
- Which lane a height belongs to follows the new spacing (`laneAt` uses `L.band`); heights below
  the near lane's band, down to the counter, stay the near lane's, as now (Claude, 2026-11-11).
- The aim rule doesn't change: a pull still maps linearly from the counter to the booth's top
  (`specs/splat-gallery.md`), so the same pull lands at the same height. The strip of space this
  frees at the bottom is the near lane's water, which takes a shot as water does now; rejected:
  re-mapping the pull to the lanes' new span, which would change every lane's feel for a layout fix
  (Claude, 2026-11-11).
- Only the water sways, as asked; the grass stays still (Claude, 2026-11-11).
- The sway: each water strip slides left and right on a sine, as if on a crank, 6 units each way,
  consecutive water lanes (lanes 0 and 2, 2 and 4) in opposite directions. Changed after the go
  (below): a cycle takes 8 s, or 6 s in a frenzy and in a round's last 3 s; the change of pace
  never jumps the strip, which carries on from where it is. The water's
  solid fill under the waves is wide enough that its ends never show. It runs on the game's own clock, so
  it moves on the start card and stops while the game is paused, like the targets (Claude,
  2026-11-11).
- What sits on the water moves with it: paint that lands on a water strip rides with the strip, a
  shot is judged against the crest where it is drawn at that moment, and paint stays clipped to
  the moving crest. Targets keep their own motion (Claude, 2026-11-11).
- Changed after the go, on the owner's words of 2026-11-12, in chat: "I think the current speed is
  good for the frenzy, and it should be a little bit slower for the normal. And I think there should
  also be vertical movement, and it probably be on phase with the horizontal one. Like, well, I
  don't know, but there should be also a vertical movement. Definitely smaller in amplitude. Also,
  when the time is running out and the targets start moving faster, you can also move faster and
  faster the water. Maybe in the last 3 seconds, maybe the simplest is in the last 3 seconds you
  move it again to the speed of the frenzy." So: the 3 s cycle is kept for a frenzy and for a
  round's last 3 s, and the normal cycle is 4 s; each water strip also rises and falls 2 units each
  way, in phase with its own slide (it is highest at its farthest one way, lowest at its farthest
  the other), so it moves on a slant. The layout leaves room for the 2 units, so the near water
  still shows twice its waves' depth at its lowest (owner, 2026-11-12; the 4 s and the 2 units are
  Claude's reading of "a little bit slower" and "definitely smaller").
- Changed again, on the owner's words of 2026-11-12, in chat, after the slant: "Because the
  frequency is the same for the horizontal and vertical movement of the water, then the movement is
  diagonal, so it looks bad." They asked for local videos to choose from before anything went on the
  PR. From three rounds of recordings (an oval as from a crank, an arc as from a pendulum and a
  figure-eight; then different sizes; then different offsets between the rows), the owner chose
  "A3": each water strip moves in an oval, 6 units each way sideways and 1.5 up and down, the rise
  and fall a quarter cycle behind the slide, so it is highest and lowest in the middle of its slide
  and level at its ends. Consecutive water lanes still slide in opposite directions, and they rise
  and fall together. This replaces the slant and the 2 units; the paces stay (owner, 2026-11-12).
- Changed again, on the owner's words of 2026-11-12, in chat, with a screenshot of the grass: "There
  is a lot of movement. I think the water speed movement should be at least half. Let's try with
  that. And also the tidying of the grass has an issue. There's like jagged edges multiple times.
  And on top of that, sometimes where the paint goes, it leaves like a weird vertical line." So:
  the sway runs at half its speed, 8 s a cycle and 6 s in a frenzy and the last 3 s (Claude's
  reading of "at least half" as all paces halved). The jagged edges and the line are one fault, on
  `main` before this change: the grass tile's first column in the atlas is nearly transparent
  (alpha 26) and its outline doesn't quite meet its other edge, so each join between tiles shows a
  see-through line and a step in the crest, and the line shows through the paint drawn over it
  (paint is at 80%). A strip tile is now drawn without its transparent edge columns, and its crest
  for hits and the paint's clip uses the same columns (owner, 2026-11-12).
- Then, on the owner's words of 2026-11-12, in chat, with close-ups of a grass join and a water
  join: "the vertical line you remove, that's great. And the speed is now great. I still see some.
  Non-smooth transition in the grass and the water. Is that because the asset is incorrectly drawn?
  Or we're just missing some 1 or 2 pixel vertical offset there?" Both, in part. Each atlas strip
  tile carries its seam column on both edges (the water tiles' first and last columns are
  near-copies, a little off-colour), so tiled whole every join drew a doubled column; and the grass
  tile's outline climbs about three-quarters of a row a column but ends about one and a half rows
  off where its start would continue it. Each tile is now built once at load from its inner columns
  plus a seam column one step further along its outline, with its last columns eased by the
  remaining offset, measured to a fraction of a row; and the strips are filled with the tile as a
  repeating pattern, since drawing tiles half a unit wide each to hide hairline gaps also hid their
  last columns. The water's pointed troughs at its joins are the art's own: every trough is drawn
  that way (Claude, 2026-11-12).
- AC-5 reworded after the go, on the owner's words of 2026-11-12, in chat: "reword + checks". Its
  old words said nothing else in the paint-clip test changed, while the test also aims at the
  landing-time crest; an adversarial review found no check loosened and each change needed, and
  the owner chose to reword it and add two checks: the shot landed on the strip it aimed at, and
  the splat taken out for the "before" reading is that strip's (owner, 2026-11-12).
- "The water ones" read as the water strips, not the ducks on them (the ducks already bob); the owner
  gave a plain "go" on this reading (Claude, 2026-11-11; go 2026-11-12).

## Acceptance items

- **AC-1** At 1920×1080, 2000×800, 1440×900, 1280×1000, 844×390, 390×844 and 360×640, and at
  390×844 and 844×390 with a phone's home-screen insets, the near lane's highest wave tip (the
  least `stripY` across the stage) is above the counter's top by at least twice its waves' depth,
  and the top of a target or a duck standing on the far lane's line is at or below the booth's top
  (`L.T`).
- **AC-2** On the game's clock (manual stepping), a water strip's sideways offset reaches between 5
  and 7 units each way; a cycle takes 8 s in normal play and on the start card, and 6 s in a frenzy
  and when 3 s or less are left in a round; a change of pace moves the strip by less than half a
  unit in a frame; consecutive water lanes are offset sideways in opposite directions at the same
  moment; each also rises and falls between 1.2 and 1.8 units each way on an oval: it is at its
  highest or lowest as it passes the middle of its slide and level (within a tenth of a unit) at
  its ends; consecutive water lanes rise and fall together; grass strips never move; and the offset
  doesn't change while the game is paused or turned.
- **AC-3** The strip as hit-tested is the strip as drawn: with the water swayed away from its rest
  position, a shot just below the crest `stripY` reports lands on the strip and one just above it
  doesn't, and on the drawn canvas pixels 3 units above that crest are not water and 3 units below
  are.
- **AC-4** Paint that lands on a water strip moves with it: half a cycle later its drawn position
  has shifted by the strip's change in offset, sideways and up or down, and it still shows only below the crest.
- **AC-5** The other Splat Gallery tests still pass. The paint-clip test (the one titled "paint on
  the water or grass shows only below its crest") aims its shot where the crest will be when it
  lands, and takes its crest spots and both pixel readings at that landing sway, the "before"
  reading being the same frame with the new splat taken out; it checks the shot landed on the strip
  it aimed at and the splat taken out is that strip's; its spots, checks and tolerances are
  otherwise unchanged. (Reworded after the go; see Decisions.)
- **AC-6** No strip shows a seam where its tiles join (added after the go; see Decisions): along
  every strip the crest `stripY` never jumps by more than one unit between points a tenth of a
  unit apart; across each tile join the crest rises or falls over one unit by no more than it does
  within 8 units either side of the join, give or take 0.15 units; and on the drawn canvas each tile
  join's column of pixels just under the crest matches its neighbours on both sides.

## Out of scope

- Moving the grass, the targets' own speed or the wall's decor.
- Any change to the counter, the slingshot or the pull.

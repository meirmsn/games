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
- The sway: each water strip slides left and right on a sine, as if on a crank, 6 units each way
  every 3 s, consecutive water lanes (lanes 0 and 2, 2 and 4) in opposite directions. The water's
  solid fill under the waves is wide enough that its ends never show. It runs on the game's own clock, so
  it moves on the start card and stops while the game is paused, like the targets (Claude,
  2026-11-11).
- What sits on the water moves with it: paint that lands on a water strip rides with the strip, a
  shot is judged against the crest where it is drawn at that moment, and paint stays clipped to
  the moving crest. Targets keep their own motion (Claude, 2026-11-11).
- "The water ones" read as the water strips, not the ducks on them (the ducks already bob) — to be
  confirmed by the owner at the go (Claude, 2026-11-11).

## Acceptance items

- **AC-1** At 1920×1080, 2000×800, 1440×900, 1280×1000, 844×390, 390×844 and 360×640, and at
  390×844 and 844×390 with a phone's home-screen insets, the near lane's highest wave tip (the
  least `stripY` across the stage) is above the counter's top by at least twice its waves' depth,
  and the top of a target or a duck standing on the far lane's line is at or below the booth's top
  (`L.T`).
- **AC-2** On the game's clock (manual stepping), a water strip's offset reaches between 5 and 7
  units each way over a 3 s cycle; consecutive water lanes are offset in opposite directions at the
  same moment; grass strips never move; and the offset doesn't change while the game is paused or
  turned.
- **AC-3** The strip as hit-tested is the strip as drawn: with the water swayed away from its rest
  position, a shot just below the crest `stripY` reports lands on the strip and one just above it
  doesn't, and on the drawn canvas pixels 3 units above that crest are not water and 3 units below
  are.
- **AC-4** Paint that lands on a water strip moves with it: half a cycle later its drawn position
  has shifted by the strip's change in offset, and it still shows only below the crest.
- **AC-5** The other Splat Gallery tests still pass. The paint-clip test (the one titled "paint on the water or grass shows only below its crest")
  reads its pixels at the same sway it took its crest spots at; nothing else in it changes.

## Out of scope

- Moving the grass, the targets' own speed or the wall's decor.
- Any change to the counter, the slingshot or the pull.

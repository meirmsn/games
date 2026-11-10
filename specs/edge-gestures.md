# Edge gestures: no drag or swipe starts where the iPhone takes it

**Go:** "Yes" 2026-11-10

## Intent

The owner, in chat on 2026-11-10: "In the iphone when adding the games as a home screen book ark,
when playing the splat gallery, its really easy to trigger the ios swipe down to bring down all of
the OS UI down to reach with thumb … which is really annoying. Is there a way to block it / prevent
it? Or games just avoid that area?"

The gesture is iOS **Reachability**: a short downward swipe on the bottom edge, around the home
indicator. Web pages and home-screen web apps can't block it, or any other system edge gesture:
`touch-action`, `preventDefault()` and `standalone` mode don't help, and the web has no equivalent
of native `preferredScreenEdgesDeferringSystemGestures`. The other edge gestures are the swipe up
from the home indicator (home), the sideways swipe along it (switch apps), the swipe from the left
edge (back, in some contexts) and the swipe down from the top edges (Notification Center, Control
Center). So games must not *start* a gesture in those zones. The queue manager proposed the plan
this spec records; the owner answered "Yes" (2026-11-10).

Surfaces: every game's play screen (customer-facing). No `DESIGN.md` exists, so the baseline is the
design; this change moves two control bars up and adds no colours, type or components.

## Decisions

- **One shared helper, `shared/safe-zone.js`:** the gesture-safe rectangle is the viewport minus
  `env(safe-area-inset-*)`, minus a margin on three sides; a pointer that starts outside it is an
  *edge start*. Mouse pointers are never edge starts (a desktop has no system edge gestures). The
  rectangle is read at each start, so a turned phone needs no resize hook. It offers two uses, and
  each game takes the one its gestures need: **ignore the start** (`ignoreEdgeStarts(el)`, or
  `if (isEdgeStart(e)) return;` after the game's own pause and resume handling) where a touch only
  ever drags, and **tap only** (remember `isEdgeStart(e)` at the start; a tap acts, a drag or swipe
  does nothing) where the same touch can be a tap. Rejected: per-game constants. (Claude,
  2026-11-10, from the owner's plan)
- **The helper is precached and `VERSION` goes to v8.** A returning visitor's next offline load must
  find `shared/safe-zone.js` with the new game scripts that import it. Precaching it with the shell
  makes that certain. Since #25 (`specs/pwa-updates.md`) a bump replaces only the shell's cache,
  never a played game's, so it costs nothing offline; #25 itself took v7. Rejected: leaving it out
  of `SHELL`. (Claude, 2026-11-10, from the spec review; v8 when bringing in #25)
- **The margins and where they come from.** Apple publishes the safe-area insets but no width for
  any system gesture zone (HIG, *Layout* and *Touchscreen gestures*: keep controls out of the safe
  area's edges and "avoid interfering with system screen-edge gestures"), so the margins are the
  plan's numbers, checked against measured insets:
  - **Bottom: inset + 40 px.** The inset is 34 pt in portrait and 21 pt in landscape on every
    Face ID iPhone; the home indicator (134 × 5 pt) sits inside it, 8 pt above the bottom. 40 px
    more is the plan's margin, close to one finger's width (the HIG's 44 pt minimum hit target): a
    thumb aiming for the indicator lands around it, not only on it. In portrait the strip's top is
    then 74 px above the bottom. On a
    phone with no inset (a Home-button iPhone, Android) the 40 px alone keeps clear of the
    browser's and the OS's bottom bars.
  - **Left: inset + 20 px.** Apple publishes no width for the back swipe's edge zone; 20 px is the
    plan's figure, the width commonly measured for UIKit's screen-edge pan. The left inset is 0 in
    portrait and 47–62 pt in landscape (iOS reports the same inset on both sides, whichever side
    the notch is on), and the margin adds to it.
  - **Top: inset + 24 px.** The top inset (47 pt on notched iPhones, 59–62 pt with the Dynamic
    Island, 20 pt on Home-button ones) covers the status bar, where Notification and Control Center
    start; 24 px more covers a swipe that begins a little below it.
  - **Right: inset only.** iOS has no right-edge system gesture in a home-screen web app.
  (Claude, 2026-11-10, margins from the owner's plan; insets as UIKit reports them per model, not
  re-measured on a device here)
- **The rule is about starts, not taps.** A tap that starts in an edge strip still works; only a
  drag or swipe that starts there is ignored. A drag that starts in the safe area may still move
  into a strip (iOS only claims gestures that *begin* at its edges). (Owner's plan, 2026-11-10)
- **Splat Gallery accepts pulls only from the safe area,** rather than raising the counter: the
  counter keeps its look, the pouch rests above the strip already (portrait: 70 units below the
  counter's top, the strip starting about 124 px below it), and a pull is still measured from where
  the finger lands, so pulling down still aims far. Rejected: raising the counter, which takes
  lanes' height in a booth tuned over thirteen playtests. (Claude, 2026-11-10; on the home screen,
  replaced by the owner's change below)
- **Changed after the go: Splat Gallery's counter grows on the home screen.** The owner,
  2026-11-10: "When i play in safari i dont run into the issue i think because the safari bars (url
  and actions) are down so they push the game up. So wondering when in home screen bookmark if there
  is a way to make the sling shot taller just to push up the are when thumb drags". When the page
  reaches the screen's bottom edge (its bottom safe-area inset is set, as on the home screen; in
  Safari the toolbar sits below the page and the inset is 0), the counter is taller by the 40 px
  strip: its top, the pouch and the thumb's pull area rise by the strip, and its foot fills the
  strip. The booth above gives up those 40 px; in Safari nothing changes. Pulls still never start in
  the strip. (Owner, 2026-11-10)
- **Orbit's booster bar and Pixel Leap's deck move up** so their keys start above the bottom strip
  (a drag on them is the control), and the helper guards them too. Orbit's bar, the probes row
  above it and the first level's hint each rise 14 px, and the field gives up 16 px. Pixel Leap's
  deck grows by 26 px in both orientations so its keys keep their size (in portrait the view gives
  up 26 px; in landscape the deck already floats over the view), and its pad starts 20 px past the
  left inset, clear of the left strip. Orbit's canvas keeps ignoring a fire tap in its own 24 px
  bottom strip, as it did before. (Claude, 2026-11-10)
- **Changed after the merge (#27): the bottom strip's rule is about quick swipes, not every
  drag.** The owner, 2026-11-10: "I don't think the pixel monster platformer needs the safe space
  because you're not swiping those controls. And the space exploration, you could move it down to,
  I don't know, maybe half the space distance there is now to use even more space for the game."
  Then: "What I don't know is how to make it generic. I think if you need to do a quick swipe, if
  you need to do quick swipe horizontally or any swipe down near the bottom edge, then it has to be
  pushed." So a control must clear the bottom strip when using it takes a quick sideways swipe (app
  switching) or any swipe down (Reachability); presses, holds and slow adjusting slides may sit in
  it. The left-edge and top strips keep the rule as it was. Pixel Leap's deck goes back to how it
  was before #27 (keys 14 px above the inset, no guard: they are pressed and held). The owner's
  "doesn't need the safe space" covers every strip, so in landscape the pad again starts at the
  left inset, in the left strip: a press there, and the short slide within the pad, are not a back
  swipe from the edge. Orbit's bar, a
  slow slide, sits at half the gap #27 gave it: its foot (inset + 40 px) / 2 above the screen's
  edge (37 px on a home-screen iPhone, 20 px with no inset; the owner chose "Half the whole gap"
  over 20 px above the safe area or the pre-#27 26 px), with no guard; the probes row and the hint
  keep their distance above it and the field takes the room. This replaces the decision above for
  those two games, and in `specs/orbit.md` the field-and-bar fit item's "above the bottom edge
  strip". (Owner,
  2026-11-10)
- **Splat Gallery in landscape** keeps the same rule: at 844×390 the pouch rests just above the
  strip and the counter's top half is safe, enough for the 80-unit full pull. (Claude, 2026-11-10)
- **A second finger** is unchanged: where a game gives one finger the gesture (Runes, Gotta Go!), a
  tap-only edge start still holds that slot until it lifts, as any first touch did. (Claude,
  2026-11-10)
- **The audit** (every game on `main`, its gestures and where they start):

  | Game | Gestures | Where they start | Before | Change |
  | ---- | -------- | ---------------- | ------ | ------ |
  | Reef | relative drag to steer (touch); mouse follow; taps wake | anywhere on the screen | drags from every edge | ignore: touch drags start only in the safe area (a tap still wakes) |
  | Googly Faces | taps on faces; a finger sliding only moves the eyes' gaze | anywhere | taps only | none |
  | Runes | drag the line; tap a stone | anywhere on the board's screen | drags from every edge | tap only: an edge start can tap, never drag |
  | Orbit | tap the space to fire; tap or drag along the booster bar | space; the bar, 26–70 px above the inset | the bar's bottom 14 px in the strip | bar raised to 40 px above the inset in #27; after the merge, by the owner's rule, its foot at (inset + 40 px) / 2 above the edge, unguarded (a slow slide) |
  | Gotta Go! | swipe to hop four ways; tap to hop up | anywhere | swipes from every edge | tap only: an edge start can tap (hop up), never swipe, not even up |
  | Pixel Leap | press and slide on the pad; hold the jump key | the bottom deck, keys 14 px above the inset | keys' bottom 26 px in the strip; in landscape the pad's first 20 px in the left strip | raised and guarded in #27; after the merge, by the owner's rule, back as before (presses and holds) |
  | Splat Gallery | pull the slingshot (touch, from the counter); mouse press anywhere | the counter, down to the inset | pulls from the bottom strip and the left edge | ignore: pulls start only in the safe area; on the home screen the counter grows by the strip |
  | Crumble | pull back and let go to aim (landscape); tap to resume | anywhere | aims from every edge | ignore: aims start only in the safe area (a tap still resumes) |

## Acceptance items

- **AC-1** `shared/safe-zone.js` gives the gesture-safe rectangle (the viewport minus the
  safe-area insets, minus 40 px at the bottom, 20 px at the left and 24 px at the top) and tells
  whether a pointer event is an edge start; a mouse pointer never is — `tests/safe-zone.test.mjs`.
- **AC-2** The helper reads the real `env(safe-area-inset-*)` values, and its function that ignores
  starts stops a touch or pen `pointerdown` (and a `touchstart`) that begins outside the rectangle
  from reaching the element's handlers, while one inside, or a mouse press, goes through —
  `tests/safe-zone.test.mjs`.
- **AC-3** In Splat Gallery at 390×844 and 430×932 with iPhone insets simulated (top 47 or 59,
  bottom 34), and at 844×390 (left and right 47, bottom 21), the counter is 40 px taller than in
  Safari, its whole face above the bottom strip (with no bottom inset it keeps its height); a touch
  that starts on the counter in the bottom strip, or in the left strip, starts no pull and fires
  nothing; the pouch rests above the strip, and a pull that starts at the top of the counter reaches
  the full far pull straight down with the finger still on screen — `tests/splat-gallery.test.mjs`.
- **AC-4** In Orbit at 390×844 with iPhone insets simulated (top 47, bottom 34), the booster bar's
  foot sits (34 + 40) / 2 = 37 px above the screen's edge (20 px with no inset), the probes and the
  hint above it, and a slide that starts low on the bar, in the bottom strip, sets the power —
  `tests/orbit.test.mjs`.
- **AC-5** In Pixel Leap with iPhone insets simulated, at 390×844 and 844×390, the pad and the jump
  key stand 14 px above the safe area as before #27, and a press that starts low on them, in the
  bottom strip, runs and jumps — `tests/pixel-leap.test.mjs`.
- **AC-6** In Reef at 390×844 with iPhone insets simulated (top 47, bottom 34), a touch drag that
  starts in an edge strip doesn't steer the fish; one that starts in the safe area does —
  `tests/reef.test.mjs`.
- **AC-7** In Runes at 390×844 with iPhone insets simulated (top 47, bottom 34), a drag that starts
  in an edge strip moves no line; a tap there still acts — `tests/runes.test.mjs`.
- **AC-8** In Gotta Go! at 390×844 with iPhone insets simulated (top 47, bottom 34), a swipe that
  starts in an edge strip doesn't hop sideways or down; a tap there still hops up —
  `tests/walk-on-red.test.mjs`.
- **AC-9** In Crumble at 844×390 with iPhone insets simulated (left and right 47, bottom 21), a pull
  that starts in an edge strip doesn't aim or fire; one that starts in the safe area does —
  `tests/crumble.test.mjs`.
- **AC-10** `sw.js` precaches `shared/safe-zone.js`, with `VERSION` bumped past main's v7 —
  `tests/safe-zone.test.mjs`.
- **AC-11** `discussion/game-guidelines.md`'s "Phone hygiene" says a control clears the bottom strip
  when it takes a quick sideways swipe or any swipe down there (presses, holds and slow slides may
  sit in it), that no drag or swipe starts in the left-edge or top strip, and that games use
  `shared/safe-zone.js`; its concept check asks where each gesture starts — verified by review:
  read both passages.

## Out of scope

- Blocking the system gestures themselves (the web can't).
- Any other gameplay change: no new controls, tuning or art; taps near the edges keep working.
- Googly Faces, which has only taps.
- The service worker's caching strategy (#25's).

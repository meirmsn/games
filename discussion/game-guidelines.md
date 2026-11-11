# Game guidelines

[← Back to the discussion](README.md)

What every game concept and build is held to, under the owner's [direction](direction.md).

## What makes a game amazing

1. **A verb that's fun on its own.** With goals and score taken away, you'd keep doing it for 30
   seconds: instant response, a clear impact, a settle.
2. **Alive and readable.** The world moves before your first touch. Goals and threats read at a
   glance by colour, shape or motion, even through the effects; shake and flashes are brief and
   never hide what matters. The screen teaches, one new thing at a time; nobody reads tips.
3. **Real choices.** In a typical moment there are two options, and each wins sometimes.
4. **Room to master.** A first-timer succeeds early; an expert does something a beginner doesn't, and
   it shows in the result.
5. **Something new on a rhythm:** a new rule, world, tool or set piece every few minutes, with
   tension and then release.
6. **Different in kind.** A new game differs from every game on the site in at least two of these:
   the core verb, the structure (runs, levels, turns, sandbox), and what failure means. Its hook is
   one sentence a stranger can picture, not "X with new art".
7. **Well made, never tacky:** art, sound and motion feel like one world.

## Challenge and reward

- **Failure is cheap; risk is a choice.** A loss costs at most the last minute or so, and you see
  why it happened. The bigger rewards sit behind risks you choose to take.
- **Intrinsic first.** The deepest reward is getting better, finding a clever solution, or seeing
  something new. Points and unlocks confirm it; they don't replace it.
- **Three clocks:** something lands every few seconds, something changes every few minutes (a new
  world, rule or tool beats a bigger number), and something brings you back (a best, a harder start,
  a new solution).
- **Waves, not a ramp:** a push, then a breather, following the player's skill. A hidden assist may
  ease it, but never visibly, and the top stays hard. Later levels get deeper, not only faster.
- **Show the reward before it's earned,** and make failure still pay: near-misses, partial progress.
- **Tune by playing.** Each concept states its own targets (time to first success, to first failure
  or "none", to the first new element) and builds in the knobs to tune them.

## Our constraints: touch, phone, no save games

- **Controls fit the genre and the thumb.** Few gestures, each learned in one try. At the moment of
  decision the finger never hides what it acts on (relative drag, an offset, a reticle, a
  slingshot). Precision can be the challenge; the interface never needs it: buttons are at least 44
  px, hit areas larger than sprites. Mouse and keyboard reach every action; no hover-only cues.
- **Orientation and form are decisions.** Each game chooses portrait or landscape (the site's
  manifest can't lock it per game) and short-form (30 s–5 min runs) or long-form (10–30 min
  sessions), and says why.
- **Interruptible.** Play pauses when the page is hidden and resumes on a tap, never into danger.
- **No save games, small memory allowed.** It's whole on a fresh browser, with no account and nothing
  to load. It may keep small things in localStorage (a best, the assist, unlocked starts), and losing
  them costs nothing you'd miss. To resume, use something the player carries: a code, a seed, the
  URL.
- **Phone hygiene.** Lay out for 360 × 640 CSS px up to tall phones, with `dvh` and safe-area
  insets. Mind the phone's edge strips, where it takes a gesture for itself and a page can't stop
  it: the bottom strip (40 px above the safe area: Reachability, home, app switching), the
  left-edge strip (20 px: back) and the top strip (24 px below the safe area: Notification and
  Control Center). A control that takes a quick sideways swipe or any swipe down sits clear of the
  bottom strip; presses, holds and slow slides may sit in it. No drag or swipe starts in the
  left-edge or top strip. Games use `shared/safe-zone.js` to ignore such starts and to lay out
  swiped controls; plain taps near the edges are fine. Allow no scrolling, zooming,
  pull-to-refresh, long-press menus or text selection. Handle a second finger. Run physics on delta
  time so it's right at 60 and 120 Hz, and cap the pixel ratio at 2. Hold 60 fps on a mid-range
  phone, keep the download small, and play offline.
- **Sound in every game,** unlocked and resumed by a touch, under the site-wide mute. It adds to the
  picture but never replaces it, because a phone's silent switch can mute it.

## Reef, distilled

What transfers: the world is alive before you act; each level looks clearly new; every threat
has its own readable mark; optional risk pays more (big food near hunters, close calls); a hidden
assist instead of difficulty settings. What doesn't transfer: lives, the bar, eat-or-avoid and level
codes. A puzzle wants undo, a toy wants no failure, a builder wants no game over. Its weakness: the
challenge is mostly speed and spawn count, so later levels get harder rather than deeper.

## Checking a concept, then attacking it

Answer each in a line: hook; verb; a typical 5-second choice; how it teaches; the three clocks; what
an expert does differently; why the tenth play differs from the first; short- or long-form;
orientation; where each gesture starts, and that none starts where the edge-strip rule forbids; what a
failure costs; what stands in for save games; the riskiest technical part and
how to prove it first. An answer that could describe any game fails. Then attack it: the strongest
case that it's dull after five minutes, unfair, unreadable on a phone, too big for one change, or
too close to an existing game (a genre is fine, another game's names, characters, levels or look are
not). Fix what that finds, then build.

## The adversarial review these guidelines passed

- *Reef in disguise:* one verb, relative drag, portrait, lives and codes would force half our list
  into the wrong shape. Fixed: controls, orientation and form are per-game decisions.
- *Lines that can't fail a concept:* "rhythm" or "room to master" pass anything. Fixed: the concept
  check asks for concrete answers, and a generic answer fails.
- *Invented numbers:* they came from one game. Fixed: each concept sets its own targets.
- *"No saves" misread:* the owner ruled out save games, not a local best; Reef keeps one. Fixed.
- *Variety unenforced:* ten games could share lives, levels and combos with different art. Fixed:
  "different in kind".

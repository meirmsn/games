# Shooting Gallery: a fairground booth where every shell counts

**Go:** "don't consult with me, just start building after following this process" 2026-11-09

## Intent

The owner, on 2026-11-09, for a batch of games built in parallel: "review the game concept against
the guidelines and propose something that works, and then do adversarial review … so that you have
solid concepts of the game and then build them … don't consult with me, just start building after
following this process." The seed is an arcade game on Kenney's **Shooting Gallery** pack, which
the owner "thinks it looks amazing to build: a different, arcade-style game" (`discussion/direction.md`),
short-form, whose "Coming soon" tile is already on the landing page. Precision is the challenge, but
the finger must not hide the target at the moment of the shot; the choices are which target, now or
later (`discussion/game-guidelines.md`, on branch `claude/tender-knuth-m0cjxj` until its PR merges). It must differ in kind from Reef and Googly Faces.

The surface is a new game page, `shooting-gallery/`, and its landing tile, which becomes playable.
The game has its own palette (the pack's wood, orange curtains and blue water); the landing page
keeps the site's tokens.

## Decisions

- **Hook:** a fairground shooting booth where every shell counts, and a bullseye gives your shell
  back. Rejected: a timed booth with a "Time up" sign, which is the pack's own sample picture and
  has no choices beyond "shoot everything" (Claude, from the concept check, 2026-11-09).
- **Differs in kind** from Reef in its verb (aim a crosshair and fire, not steer a body) and in what
  failure means (you run out of shells by missing; nothing attacks you, there are no lives), and
  from Googly Faces in its structure (rounds with a quota) and in having failure at all (Claude,
  2026-11-09).
- **Portrait, short-form.** The targets fill the upper part of the booth and the thumb works on the
  counter at the bottom; a full run is 8 rounds, about 2.5–3 minutes (measured, below), and a
  first-timer's run usually ends in round 2 or 3. Wider screens show the same booth, wider (up to
  640 logical units), centred between curtains (Claude, 2026-11-09).
- **Controls**, after the concept attack found that lift-to-fire misfires every time the thumb
  re-grips (Claude, 2026-11-09):
  - Touch: dragging anywhere moves the crosshair by the finger's movement times 1.5 (relative, like
    a trackpad), from wherever it was; lifting after a drag never fires. A tap (one finger, down and
    up within 250 ms, moving less than 6 px) fires, and the shot is tested against the crosshair and
    the targets as they were at touch-down, so the tap's own latency doesn't cost the shot. While one
    finger is down (dragging or not), a second finger's touch fires at once, and the first finger's
    lift then never fires. A still hold longer than 250 ms fires nothing. Further touches are
    ignored.
  - The crosshair is a thin ring with an open centre and a 2 px dot: the shot lands exactly on the
    dot.
  - Mouse: the crosshair follows the pointer and a click fires. Keyboard: arrow keys move it,
    speeding up the longer they're held, Shift for fine aim, Space or Enter fires.
- **The economy** (Claude, after two attack rounds, 2026-11-09):
  - **Shells.** A run starts with 8 in the tray. Every shot spends one. Shells left over carry
    on. Entering a quota round other than round 1, the tray becomes the carried shells + 4, and never
    fewer than 6; the tray holds 10, and each shell that would go past 10 is paid out at once for 50 points. Free rounds
    leave the tray untouched on the way in, during and on the way out.
  - **Pips.** Each round has a quota of pips, shown as a row on the counter. A near target is worth
    1 pip, a duck 2, a far tin target 3, the gold duck 2.
  - **Bullseye.** A target's painted centre with the first ring around it, or the whole painted
    target on a target-duck (plain ducks have none): ×2 points, and the shell flies back into the
    tray. It is exactly what's painted, never smaller: an earlier draft shrank it 6% a round, which
    would have made the hit zone smaller than the paint with nothing on screen to show it.
  - **Stick shot.** Hitting the wooden stick under a far or near target (ducks' sticks are hidden
    by the water) snaps it and the target falls: the target's pips + 1, ×3 points, no shell back.
  - A hit is one of: stick, bullseye or body, decided in that order. Multipliers multiply: a tin
    stick shot in round 8's bonus scores 30 × 3 × 2 × 2 = 360.
  - **Points:** near 10, duck 20, tin 30, gold duck 100. The gold duck is the pack's yellow
    target-duck drawn with a gold sheen; in quota play before the bonus it also gives 2 shells
    (up to the tray's 10). It never appears in free rounds and isn't counted in a parade's pips.
  - **Bonus.** Once the quota is met, "Bonus!": the rest of the parade runs 1.5× faster and scores
    ×2, but bullseyes no longer return shells. Each shot is then a choice: points now, or the shell
    kept for the next round. The gold duck in the bonus scores ×2 and gives no shells.
  - **A won round:** the quota is met and then the parade has passed or the tray is empty. Meeting
    the quota with the last shell (tray at 0) wins at once, with no bonus.
  - **A lost round** is the end of the run: when the tray is empty and the quota is unmet, or when
    the parade has gone by with the quota unmet. Both are checked only after a shot has fully
    resolved, so a last-shell bullseye refills the tray first. The missing pips flash and a falling
    jingle plays.
  - **The end of a full run:** after round 8, every shell left pays 60 points.
- **Occlusion.** The shot hits the frontmost thing at the dot: front water, then near targets, the
  middle water, ducks, then far targets, and the backdrop. Water or backdrop is a miss (a splash or
  a shot hole). A pop-up target hidden behind the front water can't be hit (Claude, 2026-11-09).
- **Rounds, in waves**: three pushes, a breather, two pushes, a breather, the finale. Starting
  values, the knobs to tune by playing:

  | Round | Name | What's new | Parade | Quota | Rail speeds (units/s) |
  | ----- | ---- | ---------- | ------ | ----- | --------------------- |
  | 1 | Ducks | ducks on one rail | 9 ducks (3 target-ducks) | 6 | ducks 60 |
  | 2 | Tin row | far tin targets on sticks; the first tins' bullseyes pulse gold with a small shell above them, and one stick is drawn cracked | 6 ducks, 5 tins | 8 | ducks 65, tins 110 |
  | 3 | Pop-ups | near targets rise from behind the front water, stay up 1.8 s and sink; the gold duck crosses once | 5 ducks, 4 tins, 6 pop-ups | 11 | ducks 70, tins 115 |
  | 4 | Free round | a 12 s flock of ducks; shots cost nothing and return nothing; points only | flock | none | ducks 100 |
  | 5, 6 | Turnabouts / Crosswind, in a random order each run | Turnabouts: targets and ducks turn on their sticks (face 2.2 s, back 1.2 s, a 0.25 s turn); a hit on a back scores nothing and spends the shell; the 0.25 s turn counts as back; a back blocks shots at what's behind it; sticks always snap. Crosswind: the duck and tin rails run against each other and the water rolls twice as high | 5 ducks, 5 tins, 6 pop-ups | 14, then 15 | ducks 75, tins 120 |
  | 7 | Free round | a faster flock | flock | none | ducks 130 |
  | 8 | Closing time | both Turnabouts and Crosswind; all points ×2 | 6 ducks, 6 tins, 6 pop-ups | 16 | ducks 80, tins 125 |

  Every quota round's parade is worth at least twice its quota in pips, with the easy targets
  first. A gold duck also crosses once in each quota round from round 3. The order of rounds 5
  and 6 comes from the run's seed, which the test hook can set. Rejected: 6+ endless rounds
  that only get faster, the weakness the guidelines name in Reef (Claude, 2026-11-09).
- **Sizes.** One logical unit is min(width / 400, height / 700) CSS px; the stage is 400 units wide,
  and up to 640 on wider screens, centred between curtains. Far tins are drawn at 0.4 of the pack's
  size (51 units), ducks 0.75 (74), near targets 0.9 (115). The pixel ratio is capped at 2. The sprites are rasterised at 2× from the pack's vector
  file into an atlas by `scripts/shooting-gallery/build-atlas.mjs` (Claude, 2026-11-09).
- **Hidden assist** (0 to 1): grows the body hit area of every target (never the bullseye or the
  stick) by up to 15%. It rises 0.2 after two misses in a row and 0.3 after a run lost in round 1 or
  2, and falls 0.05 with each hit; shots in free rounds don't count. It is kept with the best score in localStorage, starts at 0.3 for
  a new player, and never applies in round 8 (Claude, 2026-11-09).
- **No written tips.** A small start card shows Start and the best score; each round opens with its
  name on a banner; the screen teaches the rest (the gold pulse, the cracked stick, the grey back of
  a turned target) (Claude, 2026-11-09, following Reef's owner decision).
- **Interruptible.** When the page is hidden during play, a round intro or the moment between
  rounds (a round won or lost), play and sound pause
  and a "Tap to go on" card shows; a pending tap is cancelled. The tap that resumes counts in for
  1 s, with play frozen, and never fires; a round intro's banner then carries on where it was. On
  the start or over card, hiding the page only pauses the sound (Claude, 2026-11-09).
- **Sound**, all Kenney, as MP3: a cork-gun pop on every shot (two impacts layered), a wood knock on
  a hit, a tin clank on a far target, a bright ding then a shell clink for a bullseye, a snap for a
  stick shot, a soft plip on a miss, a splash as a pop-up rises or sinks, a pizzicato rise at each
  round's start, a pizzicato run at the quota, a falling pizzicato on a lost round, a closing-time
  finale (Music Jingles' pizzicato set), and the "Polka Train" loop (Music Loops) underneath, quiet, all under the site-wide mute
  (Claude, 2026-11-09).
- **Art** is the pack's own: the wood, red, blue and green backdrops, curtains, water, grass, trees,
  clouds, ducks, targets, sticks, shell icons, shot holes and the rifle, which follows the
  crosshair from the counter and kicks on each shot. The cracked stick is the pack's taped stick
  (`stick_woodFixed`); the crosshair (ring and dot) and the gold sheen are drawn by the game. No "Time up", "Ready" or "Go" lettering from
  the pack (Claude, 2026-11-09).
- **Tuning targets:** the first hit within 5 s of Start; a first-timer's first run ends in round 2–3
  (about 1.5–2 minutes); the first new element (round 2) at about 30 s (Claude, 2026-11-09).
- **Tuned by simulated play** (scripted shooters with a beginner's, an average and an expert's aim
  and pace, eight runs each), Claude, 2026-11-09:
  - The first version doomed a first-timer: spending the bonus down to nothing left 4 shells for
    round 2's quota of 10, so every beginner run ended in round 2 within 30 s. Now a quota round
    never starts with fewer than 6 shells, round 2's quota is 8 and round 3's 11.
  - Measured after: the first hit at 1.5 s; round 2 at about 21 s; a beginner's run ends in rounds
    2–5, mostly 3, after 36–100 s (a person, slower than the script, takes longer); an average
    player reaches rounds 5–8; an expert usually reaches closing time, in about 2.7 minutes, at
    about 5 times a beginner's score. A full run is about 2.5–3 minutes, not the 4–5 first guessed,
    because the bonus speeds the parade up.
- The game is one slice, one PR: the concept fits the size of Reef's first PR. If it outgrows that,
  the keyboard speed-up, the rifle's kick and the overflow payout are the first to cut (Claude,
  2026-11-09).
- **The landing tile** becomes `<a class="tile tone-rose" href="shooting-gallery/">`, without the
  coming-soon label and badge, and its line reads "Drag to aim, tap to fire: hit the bullseye and
  the shell comes back." Its picture is drawn from the game. `sw.js` needs no change: a game's
  files are cached when it first loads. The game exposes `window.__gallery` for the tests, like
  Reef's `window.__reef` (Claude, 2026-11-09).

## Acceptance items

- **AC-1** The booth is alive behind the start card (ducks change position over 1 s); Start begins
  round 1 with 8 shells, a quota of 6 and the crosshair in the booth; no errors —
  `tests/shooting-gallery.test.mjs`.
- **AC-2** A shot spends a shell; a body hit scores the target's points and pips (near 10/1, duck
  20/2, tin 30/3); a miss scores nothing — `tests/shooting-gallery.test.mjs`.
- **AC-3** A bullseye scores double and returns the shell; a stick shot snaps the stick, drops the
  target and scores triple with one more pip and no shell back; a stick hit counts as a stick even
  inside the bullseye's reach — `tests/shooting-gallery.test.mjs`.
- **AC-4** The frontmost thing takes the shot: a pop-up hidden behind the front water can't be hit,
  and a shot on the water is a miss — `tests/shooting-gallery.test.mjs`.
- **AC-5** Meeting the quota starts the bonus: the parade moves 1.5× as fast, points are doubled,
  a bullseye returns no shell and the gold duck gives none; meeting it with the last shell wins the
  round at once — `tests/shooting-gallery.test.mjs`.
- **AC-6** A round is lost, and the run ends with the over card, when the tray is empty or the
  parade has gone by with the quota unmet, but a last-shell bullseye refills the tray and play goes
  on; the over card shows the score, the round reached and the
  best, and Play again starts a new run with 8 shells — `tests/shooting-gallery.test.mjs`.
- **AC-7** A won round leads to the next; entering a quota round the tray is the carried shells
  plus 4, at least 6 and capped at 10, each shell past 10 paying 50 points; a free round leaves the tray as it was
  — `tests/shooting-gallery.test.mjs`.
- **AC-8** Rounds bring in their elements as in the table: ducks only in round 1, tins from 2,
  pop-ups and a gold duck from 3, free rounds at 4 and 7 that don't touch the tray, Turnabouts and
  Crosswind at 5 and 6 in either order, both in round 8 with points doubled — `tests/shooting-gallery.test.mjs`.
- **AC-9** In Turnabouts a hit on a target's back (or mid-turn) scores nothing and spends the
  shell, and its stick still snaps —
  `tests/shooting-gallery.test.mjs`.
- **AC-10** Finishing round 8 ends the run as closing time, paying 60 points for each shell left —
  `tests/shooting-gallery.test.mjs`.
- **AC-11** On a touch screen, a drag moves the crosshair by 1.5× the finger's movement and lifting
  after it doesn't fire; a tap fires at the crosshair; a still hold over 250 ms doesn't fire; a
  second finger fires at once while the first is down, and the first's lift then doesn't fire —
  `tests/shooting-gallery.test.mjs`.
- **AC-12** A tap's shot is tested where the targets were at touch-down, not where they are when the
  finger lifts — `tests/shooting-gallery.test.mjs`.
- **AC-13** The mouse aims and clicks to fire; the arrow keys move the crosshair and Space fires —
  `tests/shooting-gallery.test.mjs`.
- **AC-14** Hiding the page in play, or between rounds, pauses it and shows the pause card; the tap that resumes it
  doesn't fire and play stays frozen for the 1 s count-in; a round intro resumes where it was; on
  the start card no pause card shows — `tests/shooting-gallery.test.mjs`.
- **AC-15** The assist grows a target's body hit area but never its bullseye or stick; a new player
  starts at 0.3; it rises 0.2 after two misses in a row and 0.3 after a run lost in round 1 or 2,
  falls 0.05 with a hit, ignores free-round shots, and is 0 in round 8 — `tests/shooting-gallery.test.mjs`.
- **AC-16** The best score is kept across reloads — `tests/shooting-gallery.test.mjs`.
- **AC-17** Each state shows only its own card and HUD, as in the state table — `tests/shooting-gallery.test.mjs`.
- **AC-18** A shot, a hit, a bullseye, a stick, a round start, the quota and a lost round each play
  their sound — `tests/shooting-gallery.test.mjs`.
- **AC-19** The game plays offline once it has been played — `tests/shooting-gallery.test.mjs`.
- **AC-20** The landing page's Shooting Gallery tile is a link to `shooting-gallery/` with no
  coming-soon badge, and it opens the game —
  `tests/site.test.mjs`.
- **AC-21** At 390×844 and 360×640 the whole booth, the tray and the pips fit on screen without
  scrolling, and the far tins are drawn at least 44 px wide — `tests/shooting-gallery.test.mjs`.

## Core flow

1. Tap the Shooting Gallery tile: the booth is alive behind a small start card.
2. Tap Start: round 1's ducks start to cross.
3. Drag to aim, tap to fire; meet each round's quota before the shells run out.
4. Reach closing time, or run dry: see the score, the round and the best, then play again.

## States

| State | Start card | Round banner | Pause card | Over card | Tray, pips, score |
| ----- | ---------- | ------------ | ---------- | --------- | ----------------- |
| Start (the booth moves behind) | shown | hidden | hidden | hidden | hidden |
| Round intro (about 1.2 s) | hidden | shown | hidden | hidden | shown |
| Playing | hidden | hidden | hidden | hidden | shown |
| Bonus (quota met) | hidden | "Bonus! ×2 points" briefly, a slim pill above the counter where nothing can be hit | hidden | hidden | shown, the pips lit gold |
| Free round | hidden | shown at its start | hidden | hidden | shown, the pips hidden and the tray dimmed |
| Round won (about 1.5 s) | hidden | the round's tally | hidden | hidden | shown |
| Paused (page was hidden) | hidden | hidden | shown | hidden | shown |
| Resuming (1 s count-in) | hidden | "Ready…", drawn by the game | hidden | hidden | shown |
| Over (lost, or closing time with its shell payout) | hidden | hidden | hidden | shown | shown |

## Out of scope

- Leaderboards, accounts, round codes or choosing a starting round.
- A pause button: the game pauses only when the page is hidden.
- Music settings beyond the site-wide mute.
- Rounds beyond 8, and more rule cards for rounds 5 and 6; they'd be a later change.

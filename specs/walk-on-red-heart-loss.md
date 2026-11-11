# Gotta Go!: a hit shows the heart you just lost, over his head

**Go:** pending

## Intent

The owner asked, on 2026-11-11, in chat, about Gotta Go! (`walk-on-red/`): "when you hit a car, I
think we should show somehow, like, you know, like an animation … Or maybe it could be as simple,
actually simpler, than when you hit the car, you will see a heart pop up, and an X, and then show the
empty container. I think that this is better, so that you don't have like an interstitial. It's just
like, you know, you hit the car, and on top of the guy, you see a heart, then an X, and then the
empty container. And the empty container is the same that you see at the top." The problem, in
their words: "that way you know what just happened, and then it's connected to … when you see it at
the top, you know what it is, because otherwise you don't know that this is happening."

The surface is the game's street canvas, customer-facing. The game has its own look (no
`DESIGN.md`; `specs/walk-on-red.md`): the pop-up uses the HUD heart's own shape and colours
(`walk-on-red/style.css`: `--heart` #ff4b4b full; lost: `--ink` #1b1e29 fill, `--dim` #c9ccd6
outline) and the game's existing white pop-up colour for the X.

## Decisions

- Over his head, not an interstitial: the owner chose the simpler of their two ideas; rejected: a
  front-and-center card with all three hearts (owner, 2026-11-11).
- Three beats in the 1.2 s he lies down (`DOWN_T`), timed from the hit on the game's own clock
  (the one pop-ups age on, so a pause stops it and fast-forward doesn't speed it): full heart
  0–0.3 s, X 0.3–0.6 s, empty container 0.6–1.1 s, fully visible to 0.9 s then fading to gone at
  1.1 s; reason: the whole story fits in the moment he's down and never delays play (Claude,
  2026-11-11, for the owner to confirm).
- The HUD's heart empties when the one over his head turns empty (0.6 s), not at the hit, so the
  two change together; rejected: the HUD emptying at once, as now. This changes the existing
  lives test (the walk-on-red spec's twenty-eighth item), which checks the HUD 0.1 s after a hit. `game.lives` itself still drops
  at the hit, so the last life still stops the level at once (Claude, 2026-11-11, for the owner to
  confirm).
- Look: the HUD's 7×6 pixel heart, each art pixel 2×2 street pixels, with a one-pixel `#14161f`
  outline like the other pop-ups. Full: `#ff4b4b`. X: a white (`#ffffff`) diagonal cross over the
  heart's bounding box with the same dark outline, appearing at once. Empty: fill `#1b1e29` inside
  a one-street-pixel `#c9ccd6` edge, at 0.8 opacity, matching the HUD's lost heart. It is drawn in
  street pixels, so on screen it is the street's scale, not the HUD's 14×12 CSS px (Claude,
  2026-11-11).
- Placement: centred on him where the game's "!" pop-up goes (22 street px above his feet),
  rising like the other pop-ups, kept inside the view (Claude, 2026-11-11).
- The last hit plays it too, before Game over shows (Claude, 2026-11-11).

## Acceptance items

- **AC-1** When a car hits him, a heart is drawn over him in three beats, in order: full
  (`#ff4b4b`) from the hit, with a white X from 0.3 s, empty (fill `#1b1e29`, edge `#c9ccd6`) from
  0.6 s, and gone by 1.1 s; the test hook `window.__walkOnRed` reports the beat it is on.
- **AC-2** The heart's pixels are the HUD heart's shape (`walk-on-red/index.html`'s 7×6 path), each
  art pixel 2×2 street pixels, and the whole heart is inside the view wherever he is hit.
- **AC-3** After a hit the HUD still shows the lost life full (and its label the old count) until
  the heart over him turns empty; from then it shows it in the `lost` style with a label one life
  fewer. The lives test (the walk-on-red spec's twenty-eighth item) checks both moments.
- **AC-4** While the game is paused, the heart's clock and beat don't change; on resume they carry
  on from where they were.
- **AC-5** On the last hit, the empty beat is shown before the Game over card appears.
- **AC-6** Whatever happens mid-heart (time runs out, the level ends, a new run starts), the HUD
  ends showing `game.lives`; a new level or run removes any heart; only one heart shows at a time.
- **AC-7** A follower being hit, or running out of time, shows no heart; the landing page's tile
  picture (`?tile`) never shows one.
- **AC-8** A hit shows no screen, card or banner it didn't before, and 1.2 s after a hit (not the
  last) the mode is `play` and he can hop, as today.

## Out of scope

- A sound for the heart (the hit and horn already play).
- Any change to the HUD hearts' look, or to what a hit costs.
- Other games.

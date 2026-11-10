# Game guidelines, and building the next games in parallel

**Go:** "you should also create a PR on this session so that they make it to the repo … So don't consult with me, just start building after following this process, okay?" 2026-11-09

## Intent

The owner asked, in the session's chat on 2026-11-09: "do some analysis, where you have some guiding
principles in short form of what makes amazing games in general, and perhaps some section for what
makes amazing games for these constraints we have of touch, smaller screen, without game saves,
compare that to the fish game … but do not overfit to the fish game … the balance between the
challenge and the reward … Then do adversarial review of this and keep it to one page." The page is
`discussion/game-guidelines.md`, an internal document with no page rendered on the site. The owner
also set how the next games get built, recorded below.

## Decisions

- The guidelines are one page in `discussion/`, beside the owner's direction, linked from the discussion's README. They are not a spec. Rejected: folding them into `direction.md`, which holds the owner's own notes (Claude, 2026-11-09).
- The draft was attacked by an independent read-only reviewer before the owner saw it. Its main findings were that the draft was Reef in disguise, made every game short-form, misread "no saves", and had a strawman review section. They were fixed, and the page's last section records them (Claude, 2026-11-09).
- "Without game saves" means no save games, not no memory: a game is whole on a fresh browser and may keep small things such as a best score in localStorage, as Reef does (Claude's reading of the owner's words, 2026-11-09).
- The next games are built in parallel, one session each. Each session checks its concept against the guidelines, has it attacked adversarially, fixes it, then specs and builds it, without consulting the owner first (owner, 2026-11-09: "don't consult with me, just start building after following this process").
- Merges go one at a time through a queue that this session manages. A game's branch doesn't take in the latest `main` and doesn't open its PR, which is what starts CI, until its turn comes. Rejected: a PR per game from the start, which reruns CI on every open branch after each merge (owner, 2026-11-09: "you should not be running CI in parallel for them … do not bring the latest main until you're ready to merge each and one of them"). Approval and the merge stay the owner's, as `CLAUDE.md` requires.
- A game that needs another's groundwork starts after that one merges. Little Town waits for High Seas's isometric engine (Claude, 2026-11-09).

## Acceptance items

- **AC-1** `discussion/game-guidelines.md` has sections on what makes any game amazing, challenge and reward, the touch, phone and no-save-games constraints, Reef distilled without copying its shape, a concept check, and the adversarial review it passed — verified by review: read the page's headings and sections.
- **AC-2** The guidelines fit on one page: under 1,100 words — verified by review: count the page's words.
- **AC-3** The discussion README links the guidelines under "Start here" and logs the 2026-11-09 decisions — verified by review: open `discussion/README.md`.

## Out of scope

- Building any game; each game is its own change, in its own session and PR.
- A `ROADMAP.md`; the games and their order stay in the chat and the sessions until the owner wants them recorded.

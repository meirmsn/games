// Floor 1, "The Workshop": eight rooms, each adding one thing.
//
// Units: the board is 10 × 16, y grows downward. girder: Trundle's track {x1, x2, y} (its top; he
// drives on it). trundle: where he starts, his facing (dir 1 = right) and speed (0 = parked).
// balls: the colours he drops, in order ('r' red, 'b' blue). cups: {x, y, color, need, locked}.
// planks: the green switches {x, y, a0, a1, up, w}: they pivot on their bolt between a0 and a1
// (degrees), starting at a1 when up. fixed: yellow blocks {x, y, w, h, a}. star: the room's star.
// solution: a tap log that wins with all three stars, replayed by the tests (and by nothing in the
// game).

export const FLOOR = { n: 1, name: 'The Workshop' };

export const ROOMS = [
  {
    name: 'One flip',
    girder: { x1: 3, x2: 3, y: 1.6 },
    trundle: { x: 3, dir: 1, speed: 0 },
    balls: 'rrrrr',
    cups: [{ x: 7.6, y: 13.2, color: 'r', need: 3 }],
    planks: [{ x: 3.4, y: 5, a0: -30, a1: 30 }],
    fixed: [{ x: 6.4, y: 9.4, w: 4.4, h: 0.5, a: 14 }],
    star: { x: 6, y: 7.2 },
    solution: { log: [{ s: 42, op: 'flip', i: 0 }, { s: 160, op: 'flip', i: 0 }, { s: 430, op: 'flip', i: 0 }] },
  },
  {
    name: 'Cascade',
    girder: { x1: 2.2, x2: 2.2, y: 1.6 },
    trundle: { x: 2.2, dir: 1, speed: 0 },
    balls: 'rrrrrr',
    cups: [{ x: 2.9, y: 13.6, color: 'r', need: 4 }],
    planks: [
      { x: 2.6, y: 4.6, a0: -28, a1: 28 },
      { x: 6.4, y: 8.4, a0: 28, a1: -28 },
    ],
    fixed: [],
    star: { x: 4.5, y: 5.2 },
    solution: { log: [{ s: 42, op: 'flip', i: 1 }, { s: 130, op: 'flip', i: 0 }, { s: 342, op: 'flip', i: 0 }, { s: 430, op: 'flip', i: 0 }, { s: 642, op: 'flip', i: 0 }, { s: 730, op: 'flip', i: 0 }, { s: 942, op: 'flip', i: 0 }, { s: 1030, op: 'flip', i: 0 }] },
  },
  {
    name: 'On patrol',
    girder: { x1: 1.6, x2: 6.4, y: 1.6 },
    trundle: { x: 1.6, dir: 1, speed: 1.2 },
    balls: 'rrrrrrr',
    cups: [{ x: 9.2, y: 13, color: 'r', need: 4 }],
    planks: [
      { x: 2.4, y: 5.4, a0: -28, a1: 28 },
      { x: 5.6, y: 5.4, a0: -28, a1: 28 },
    ],
    fixed: [{ x: 6.8, y: 10, w: 4.4, h: 0.5, a: 16 }],
    star: { x: 1, y: 9 },
    solution: { log: [{ s: 430, op: 'flip', i: 1 }, { s: 642, op: 'flip', i: 1 }, { s: 760, op: 'flip', i: 1 }, { s: 1030, op: 'flip', i: 0 }] },
  },
  {
    name: 'Red and blue',
    girder: { x1: 5, x2: 5, y: 1.6 },
    trundle: { x: 5, dir: 1, speed: 0 },
    balls: 'rbrrbbrb',
    cups: [
      { x: 1.6, y: 12.5, color: 'r', need: 3 },
      { x: 8.4, y: 12.5, color: 'b', need: 3 },
    ],
    planks: [{ x: 5, y: 5.5, a0: -30, a1: 30 }],
    fixed: [
      { x: 2.9, y: 9.4, w: 3.4, h: 0.5, a: -18 },
      { x: 7.1, y: 9.4, w: 3.4, h: 0.5, a: 18 },
    ],
    star: { x: 6.9, y: 5.9 },
    solution: { log: [{ s: 190, op: 'flip', i: 0 }, { s: 490, op: 'flip', i: 0 }, { s: 1090, op: 'flip', i: 0 }] },
  },
  {
    name: 'The flick',
    girder: { x1: 1.9, x2: 1.9, y: 1.6 },
    trundle: { x: 1.9, dir: 1, speed: 0 },
    balls: 'rrrrr',
    cups: [{ x: 8.6, y: 8.5, color: 'r', need: 3 }],
    planks: [{ x: 3, y: 7, a0: 0, a1: 35 }],
    fixed: [{ x: 8.6, y: 9.4, w: 2.6, h: 0.5 }],
    star: { x: 5.5, y: 3.5 },
    solution: { log: [{ s: 250, op: 'flip', i: 0 }, { s: 342, op: 'flip', i: 0 }, { s: 550, op: 'flip', i: 0 }, { s: 642, op: 'flip', i: 0 }, { s: 850, op: 'flip', i: 0 }] },
  },
  {
    name: 'The flap',
    girder: { x1: 2, x2: 2, y: 1.6 },
    trundle: { x: 2, dir: 1, speed: 0 },
    balls: 'rrrrrr',
    cups: [{ x: 9.3, y: 12.3, color: 'r', need: 3 }],
    planks: [{ x: 2.5, y: 5, a0: 12, a1: 45 }],
    fixed: [
      { x: 5.75, y: 11.1, w: 5.9, h: 0.5, a: 6 },
      { x: 9, y: 9, w: 2.2, h: 0.5 },
    ],
    flap: { x: 8.2, y: 9.25, len: 1.6, density: 0.01 },
    star: { x: 5.4, y: 7.2 },
    solution: { log: [{ s: 430, op: 'flip', i: 0 }, { s: 942, op: 'flip', i: 0 }, { s: 1090, op: 'flip', i: 0 }] },
  },
  {
    name: 'The crate',
    girder: { x1: 3.6, x2: 3.6, y: 1.6 },
    trundle: { x: 3.6, dir: 1, speed: 0 },
    balls: 'rrrrrr',
    cups: [{ x: 9.2, y: 12.4, color: 'r', need: 3 }],
    planks: [{ x: 4.4, y: 8, a0: 0, a1: 30 }],
    fixed: [{ x: 8, y: 10.2, w: 2.2, h: 0.5, a: 14 }],
    crate: { x: 4.6, y: 7.35, w: 1.3, h: 0.8 },
    star: { x: 6.6, y: 6.4 },
    solution: { log: [{ s: 250, op: 'flip', i: 0 }, { s: 342, op: 'flip', i: 0 }, { s: 550, op: 'flip', i: 0 }] },
  },
  {
    name: 'The key',
    girder: { x1: 3.2, x2: 6.8, y: 1.6 },
    trundle: { x: 5, dir: 1, speed: 0.8 },
    balls: 'rbrbrbrb',
    cups: [
      { x: 1.6, y: 13, color: 'r', need: 3 },
      { x: 8.4, y: 13, color: 'b', need: 3, locked: true },
    ],
    planks: [
      { x: 3.7, y: 6, a0: -28, a1: 28 },
      { x: 6.3, y: 6, a0: -28, a1: 28 },
    ],
    fixed: [
      { x: 2.8, y: 10.2, w: 3.2, h: 0.5, a: -16 },
      { x: 7.2, y: 10.2, w: 3.2, h: 0.5, a: 16 },
    ],
    key: { x: 1.35, y: 11.7 },
    star: { x: 8.8, y: 9.7 },
    solution: { log: [{ s: 342, op: 'flip', i: 0 }, { s: 430, op: 'flip', i: 1 }, { s: 642, op: 'flip', i: 0 }, { s: 760, op: 'flip', i: 0 }, { s: 1090, op: 'flip', i: 1 }, { s: 1242, op: 'flip', i: 0 }, { s: 1420, op: 'flip', i: 0 }, { s: 1630, op: 'flip', i: 1 }] },
  },
];

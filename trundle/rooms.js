// Floor 1, "The Workshop": eight rooms, each adding one thing.
//
// Units: the board is 10 × 16, y grows downward. girder: Trundle's track {x1, x2, y} (its top; he
// drives on it). trundle: where he starts, his facing (dir 1 = right) and speed (0 = parked).
// balls and quota: how many drop, and how many must reach an exit. fixed: yellow blocks
// {x, y, w, h, a} (centre, size, degrees). exits: the holes. tray: the parts you get. solution: a
// starting layout and its timed edit log that takes all three stars, replayed by the tests (and by
// nothing in the game).

export const FLOOR = { n: 1, name: 'The Workshop' };

export const ROOMS = [
  {
    name: 'First plank',
    girder: { x1: 2, x2: 2, y: 1.6 },
    trundle: { x: 2, dir: 1, speed: 0 },
    balls: 6,
    quota: 3,
    fixed: [{ x: 7.25, y: 9.3, w: 5.5, h: 0.6 }],
    exits: [{ x: 9, y: 8.5 }],
    stars: [{ x: 3, y: 3.5 }, { x: 5.5, y: 5 }, { x: 6.5, y: 7.5 }],
    tray: ['plank'],
    solution: { layout: [{ id: 1, type: 'plank', x: 2.75, y: 3.5, a: 195 }], log: [] },
  },
  {
    name: 'On patrol',
    girder: { x1: 1.5, x2: 5.5, y: 1.6 },
    trundle: { x: 1.5, dir: 1, speed: 1.2 },
    balls: 8,
    quota: 5,
    fixed: [{ x: 8.25, y: 12.3, w: 3.5, h: 0.6 }],
    exits: [{ x: 9.2, y: 11.5 }],
    stars: [{ x: 1, y: 5 }, { x: 8.5, y: 9.5 }, { x: 1, y: 13.5 }],
    tray: ['plank', 'plank'],
    solution: { layout: [{ id: 1, type: 'plank', x: 6.75, y: 14.5, a: 315 }, { id: 2, type: 'plank', x: 4.5, y: 7, a: 30 }], log: [{ s: 577, op: 'turn' }, { s: 930, op: 'turn' }, { s: 1283, op: 'turn' }] },
  },
  {
    name: 'About turn',
    girder: { x1: 1.2, x2: 8.8, y: 1.6 },
    trundle: { x: 2, dir: 1, speed: 1.6 },
    balls: 8,
    quota: 5,
    fixed: [
      { x: 1.75, y: 13.3, w: 3.5, h: 0.6 },
      { x: 5, y: 8.5, w: 0.6, h: 5 },
    ],
    exits: [{ x: 0.9, y: 12.5 }],
    stars: [{ x: 7, y: 3.5 }, { x: 1, y: 8 }, { x: 8, y: 12.5 }],
    tray: ['plank'],
    solution: { layout: [{ id: 1, type: 'plank', x: 3.75, y: 4.75, a: 330 }], log: [{ s: 319, op: 'turn' }, { s: 1077, op: 'turn' }, { s: 1835, op: 'turn' }] },
  },
  {
    name: 'The wedge',
    girder: { x1: 2, x2: 6, y: 1.6 },
    trundle: { x: 4, dir: 1, speed: 1.2 },
    balls: 8,
    quota: 5,
    fixed: [
      { x: 2.6, y: 8, w: 0.6, h: 7 },
      { x: 5.4, y: 8, w: 0.6, h: 7 },
      { x: 7.75, y: 14.3, w: 4.5, h: 0.6 },
    ],
    exits: [{ x: 9.2, y: 13.5 }],
    stars: [{ x: 2, y: 3.5 }, { x: 9, y: 8.5 }, { x: 1.5, y: 12.5 }],
    tray: ['wedge', 'plank'],
    solution: { layout: [{ id: 1, type: 'wedge', x: 4, y: 13.5, a: 210 }, { id: 2, type: 'plank', x: 3.75, y: 11, a: 270 }], log: [{ s: 552, op: 'turn' }, { s: 1255, op: 'turn' }, { s: 1958, op: 'turn' }] },
  },
  {
    name: 'The flap',
    girder: { x1: 1.5, x2: 4.5, y: 1.6 },
    trundle: { x: 3, dir: 1, speed: 1.2 },
    balls: 8,
    quota: 5,
    fixed: [
      { x: 6.8, y: 11.3, w: 6.4, h: 0.6 },
      { x: 8.2, y: 9, w: 3.6, h: 0.6 },
    ],
    flap: { x: 7.6, y: 9.3, len: 1.5 },
    exits: [{ x: 9.3, y: 10.5 }],
    stars: [{ x: 5.5, y: 6 }, { x: 9, y: 8 }, { x: 1, y: 9 }],
    tray: ['plank', 'plank'],
    solution: { layout: [{ id: 1, type: 'plank', x: 2, y: 10.5, a: 210 }, { id: 2, type: 'plank', x: 4.25, y: 6.25, a: 225 }], log: [{ s: 0, op: 'turn' }, { s: 302, op: 'turn' }, { s: 605, op: 'turn' }] },
  },
  {
    name: 'The crate',
    girder: { x1: 4, x2: 6.5, y: 1.6 },
    trundle: { x: 5, dir: -1, speed: 1.2 },
    balls: 8,
    quota: 5,
    fixed: [
      { x: 1.9, y: 8.1, w: 3.8, h: 0.6, a: 30 },
      { x: 5.9, y: 12.3, w: 4.6, h: 0.6 },
    ],
    crate: { x: 7.35, y: 11.65, w: 1.3, h: 0.7 },
    exits: [{ x: 7.45, y: 11.5 }],
    stars: [{ x: 7.5, y: 6 }, { x: 1, y: 6.5 }, { x: 9, y: 12.5 }],
    tray: ['plank'],
    solution: { layout: [{ id: 1, type: 'plank', x: 4.5, y: 4.5, a: 150 }], log: [] },
  },
  {
    name: 'The key',
    girder: { x1: 5, x2: 8.5, y: 1.6 },
    trundle: { x: 7, dir: -1, speed: 1.2 },
    balls: 8,
    quota: 5,
    fixed: [
      { x: 1.5, y: 8.3, w: 3, h: 0.6 },
      { x: 8.5, y: 14.3, w: 3, h: 0.6 },
    ],
    key: { x: 0.8, y: 7.5 },
    exits: [{ x: 9.2, y: 13.5 }],
    stars: [{ x: 9, y: 3.5 }, { x: 2.5, y: 6.5 }, { x: 6.5, y: 12.5 }],
    tray: ['plank', 'plank', 'wedge'],
    solution: { layout: [{ id: 1, type: 'plank', x: 4.75, y: 11, a: 0 }, { id: 2, type: 'plank', x: 5.75, y: 5.75, a: 225 }, { id: 3, type: 'wedge', x: 6.25, y: 9.25, a: 195 }], log: [{ s: 252, op: 'turn' }, { s: 355, op: 'turn' }, { s: 458, op: 'turn' }] },
  },
  {
    name: 'Two exits',
    girder: { x1: 1.5, x2: 8.5, y: 1.6 },
    trundle: { x: 5, dir: 1, speed: 1.5 },
    balls: 8,
    quota: 5,
    fixed: [
      { x: 1.5, y: 12.3, w: 3, h: 0.6 },
      { x: 8.5, y: 12.3, w: 3, h: 0.6 },
      { x: 5, y: 9, w: 0.6, h: 4 },
    ],
    flap: { x: 7.6, y: 10.3, len: 1.5 },
    exits: [
      { x: 0.8, y: 11.5 },
      { x: 9.2, y: 11.5 },
    ],
    stars: [{ x: 8.5, y: 6.5 }, { x: 1, y: 7 }, { x: 4.5, y: 13.5 }],
    tray: ['plank', 'plank', 'wedge'],
    solution: { layout: [{ id: 1, type: 'plank', x: 4.75, y: 4, a: 90 }, { id: 2, type: 'plank', x: 7.25, y: 7, a: 210 }, { id: 3, type: 'wedge', x: 4, y: 14.75, a: 195 }], log: [] },
  },
];

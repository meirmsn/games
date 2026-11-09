// Floor 1, "The Workshop": six rooms, each adding one thing.
//
// Units: the board is 10 × 16, y grows downward. fixed: yellow blocks {x, y, w, h, a} (centre,
// size, degrees). robot: Trundle's feet and facing (dir 1 = right). ball: its start, in front of
// Trundle. exit: the hole. tray: the parts you get. solution: a layout and kick that takes all
// three stars, replayed by the tests (and by nothing in the game).

export const FLOOR = { n: 1, name: 'The Workshop' };

export const ROOMS = [
  {
    name: 'Mind the gap',
    robot: { x: 0.9, y: 5, dir: 1 },
    ball: { x: 2.1, y: 4.7 },
    fixed: [
      { x: 2, y: 5.3, w: 4, h: 0.6 },
      { x: 8.5, y: 6.9, w: 3, h: 0.6 },
    ],
    exit: { x: 9.1, y: 6.1 },
    stars: [{ x: 4.5, y: 4.4 }, { x: 6, y: 4.6 }, { x: 7.75, y: 6.3 }],
    tray: ['plank'],
    solution: { kick: 'hard', layout: [{ type: 'plank', x: 5, y: 5.75, a: 165 }] },
  },
  {
    name: 'Zig-zag',
    robot: { x: 9.1, y: 3, dir: -1 },
    ball: { x: 7.9, y: 2.7 },
    fixed: [
      { x: 8.25, y: 3.3, w: 3.5, h: 0.6 },
      { x: 4.4, y: 6.75, w: 0.6, h: 6.5 },
      { x: 2.4, y: 13.8, w: 3.6, h: 0.6 },
    ],
    exit: { x: 1.4, y: 13 },
    stars: [{ x: 6.5, y: 9 }, { x: 4.5, y: 10.5 }, { x: 3, y: 12.5 }],
    tray: ['plank', 'plank'],
    solution: { kick: 'hard', layout: [{ type: 'plank', x: 1.75, y: 6.25, a: 225 }, { type: 'plank', x: 6.75, y: 10.5, a: 345 }] },
  },
  {
    name: 'The wedge',
    robot: { x: 0.9, y: 3, dir: 1 },
    ball: { x: 2.1, y: 2.7 },
    fixed: [
      { x: 1.5, y: 3.3, w: 3, h: 0.6 },
      { x: 3.6, y: 8, w: 0.6, h: 6 },
      { x: 6.2, y: 7.5, w: 0.6, h: 7 },
      { x: 7.75, y: 14.3, w: 4.5, h: 0.6 },
    ],
    exit: { x: 9.2, y: 13.5 },
    stars: [{ x: 6, y: 3.5 }, { x: 8.5, y: 5.5 }, { x: 9.5, y: 10 }],
    tray: ['wedge'],
    solution: { kick: 'hard', layout: [{ type: 'wedge', x: 5, y: 4.5, a: 90 }] },
  },
  {
    name: 'The flap',
    robot: { x: 0.9, y: 3, dir: 1 },
    ball: { x: 2.1, y: 2.7 },
    fixed: [
      { x: 1.5, y: 3.3, w: 3, h: 0.6 },
      { x: 6.25, y: 11.3, w: 7.5, h: 0.6 },
      { x: 8.2, y: 9, w: 3.6, h: 0.6 },
    ],
    flap: { x: 7.6, y: 9.3, len: 1.5 },
    exit: { x: 9.3, y: 10.5 },
    stars: [{ x: 3.5, y: 4.5 }, { x: 1.5, y: 9 }, { x: 6, y: 10.5 }],
    tray: ['plank', 'plank'],
    solution: { kick: 'soft', layout: [{ type: 'plank', x: 4.5, y: 5, a: 120 }, { type: 'plank', x: 1, y: 10, a: 105 }] },
  },
  {
    name: 'The crate',
    robot: { x: 0.9, y: 3, dir: 1 },
    ball: { x: 2.1, y: 2.7 },
    fixed: [
      { x: 2, y: 3.3, w: 4, h: 0.6 },
      { x: 1.9, y: 7.6, w: 3.8, h: 0.6, a: 35 },
      { x: 5.9, y: 12.3, w: 4.6, h: 0.6 },
    ],
    crate: { x: 7.35, y: 11.65, w: 1.3, h: 0.7 },
    exit: { x: 7.45, y: 11.5 },
    stars: [{ x: 3.5, y: 4.5 }, { x: 4.5, y: 7.5 }, { x: 5.5, y: 10.5 }],
    tray: ['plank'],
    solution: { kick: 'soft', layout: [{ type: 'plank', x: 5.25, y: 4, a: 135 }] },
  },
  {
    name: 'The key',
    robot: { x: 9.1, y: 3, dir: -1 },
    ball: { x: 7.9, y: 2.7 },
    fixed: [
      { x: 8, y: 3.3, w: 4, h: 0.6 },
      { x: 1.5, y: 8.3, w: 3, h: 0.6 },
      { x: 8.5, y: 14.3, w: 3, h: 0.6 },
    ],
    key: { x: 0.8, y: 7.5 },
    exit: { x: 9.2, y: 13.5 },
    stars: [{ x: 4.5, y: 8.5 }, { x: 6.5, y: 10 }, { x: 8, y: 12.5 }],
    tray: ['plank', 'plank', 'wedge'],
    solution: { kick: 'hard', layout: [{ type: 'plank', x: 4, y: 9.5, a: 195 }, { type: 'plank', x: 5.5, y: 12.75, a: 30 }, { type: 'wedge', x: 2, y: 3.5, a: 0 }] },
  },
];

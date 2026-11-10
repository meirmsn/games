// The levels. Each level is its own world, drawn from its own asset pack (or its own part of one).
//
// A world sets only its resolution (pixels per tile), its palette, its art, its sound and one rule
// from its material; everything else (the grid, the physics, the monster's size) is the same in
// every world. A level is written as a list of segments, read left to right, which buildStage()
// turns into a tile grid and a list of things (coins, enemies, springs…). Its last stretch, from
// the 'next' segment on, is drawn in the next world's style: a glimpse of where the door leads.

export const ROWS = 15; // the usual grid's height in tiles; falling below it costs a life
const DEPTH = 4; // the usual ground top is this many rows above the grid's bottom (row 11 of 15)

// HAY: a haybale, solid, that bounces you. BELTL / BELTR: a conveyor belt's top, solid, that carries
// you left or right.
export const T = { AIR: 0, GROUND: 1, BLOCK: 2, ONEWAY: 3, SPIKES: 4, HAY: 5, BELTL: 6, BELTR: 7 };
export const SOLID = new Set([T.GROUND, T.BLOCK, T.HAY, T.BELTL, T.BELTR]);

// PICO-8's 16 colours: Pico draws nothing else.
export const PICO8 = [
  '#000000', '#1d2b53', '#7e2553', '#008751', '#ab5236', '#5f574f', '#c2c3c7', '#fff1e8',
  '#ff004d', '#ffa300', '#ffec27', '#00e436', '#29adff', '#83769c', '#ff77a8', '#ffccaa',
];

export const WORLDS = [
  {
    id: 'meadow',
    bed: true, // the owner's music: a long bed, with short accents over it at random
    name: 'Meadow',
    res: 18, // pixels per tile: the Pixel Platformer pack
    pack: 'pp',
    smooth: false,
    outline: '#262338',
    sky: ['#cdeff0', '#e4f6f2'],
    sound: 'm',
    rule: 'walkers to stomp, spikes and springs',
    stages: [
      [
        // The opening: run, jump and coins, with nothing that can hurt you.
        ['flat', 3], ['coins', 4, 1], ['flat', 7], ['step', -1], ['flat', 4], ['arc', 4], ['flat', 1], ['step', -1],
        ['flat', 5], ['arc', 3], ['low', 3], ['flat', 5], ['plat', 1, 3, 4, '-'], ['coins', 4, 4, 1], ['flat', 6],
        ['step', 1], ['flat', 4],
        // The first walker, alone on flat ground; then one spike; then a small pit.
        ['walker', 5], ['flat', 11], ['coins', 3, 1], ['flat', 4], ['spikes', 1], ['flat', 6], ['arc', 3], ['pit', 2],
        ['flat', 5], ['heart', 3, 1], ['flat', 6],
        // A spring by a high ledge of coins.
        ['flat', 2], ['spring', 1], ['plat', 3, 5, 5, '='], ['coins', 5, 6, 3], ['flat', 10],
        // Then the real thing: walkers in pairs, wider pits, more spikes.
        ['spikes', 2], ['flat', 4], ['walker', 2], ['flat', 3], ['walker', 6], ['flat', 9], ['arc', 4], ['pit', 3],
        ['flat', 4], ['step', -1], ['flat', 3], ['spikes', 3], ['flat', 4], ['heart', 2, 1], ['flat', 3],
        ['walker', 3], ['flat', 7], ['arc', 4], ['pit', 4], ['flat', 3], ['step', 1], ['flat', 2], ['spikes', 1],
        ['flat', 3], ['walker', 1], ['flat', 5],
        // A glimpse of Frost, and the door.
        ['next'], ['flat', 4], ['portal'], ['flat', 6],
      ],
    ],
  },
  {
    id: 'farm',
    bed: true, // the owner's music: a long bed, with short accents over it at random
    name: 'Farm',
    res: 18, // the Pixel Platformer Farm Expansion
    pack: 'farm',
    smooth: false,
    outline: '#262338',
    sky: ['#bfe3f2', '#fbefcf'],
    sound: 'm',
    rule: 'platforms big and small at every height, haybales that bounce, hidden pockets of coins',
    stages: [
      [
        // The opening: crops, coins, a low ledge and a first haybale; nothing that hurts.
        ['flat', 5], ['coins', 3, 1, 1], ['flat', 4], ['plat', 0, 2, 3, '-'], ['coins', 3, 3], ['flat', 5],
        ['hay', 1], ['plat', 3, 5, 2, '-'], ['coins', 2, 6, 3], ['pocket', 7, 7, 3], ['plat', 7, 6, 3, '='], ['flat', 9],
        // Platforms over the first pits, a walker below.
        ['plat', 1, 2, 6, '-'], ['coins', 6, 3, 1], ['walker', 4], ['flat', 9],
        ['pit', 4, [[1, -3, 2, '-']]], ['flat', 3], ['plat', 0, 3, 1, '='], ['plat', 2, 5, 1, '='], ['plat', 4, 7, 4, '-'],
        ['coins', 4, 8, 4], ['flat', 7], ['pit', 5, [[0, -2, 1, '-'], [3, -4, 1, '-']]], ['flat', 4],
        ['heart', 2, 3], ['plat', 1, 2, 3, '-'], ['flat', 5],
        // A haybale up to a high shelf; a pocket tucked up above it.
        ['hay', 0], ['plat', 2, 6, 6, '-'], ['coins', 3, 7, 2], ['pocket', 5, 9, 3], ['flat', 10],
        ['walker', 2], ['walker', 7], ['flat', 10], ['spikes', 2], ['flat', 3],
        // Then the real thing: a wide gap of floating platforms, small and big, at every height.
        ['pit', 14, [[3, -1, 3, '-'], [8, -2, 3, '-'], [1, -4, 1, '-'], [5, -6, 2, '-'], [10, -7, 1, '-']]], ['coins', 2, 7, -9],
        ['flat', 4], ['walker', 1], ['flat', 5], ['hay', 0], ['plat', 2, 8, 2, '-'], ['pocket', 2, 9, 3], ['flat', 8],
        ['spikes', 2], ['flat', 4], ['plat', -7, 3, 6, '-'], ['coins', 4, 4, -6],
        ['pit', 6, [[2, -4, 2, '-']]], ['flat', 4], ['heart', 1, 1], ['flat', 3], ['walker', 3], ['flat', 7],
        ['pit', 9, [[4, -1, 2, '-'], [1, -4, 1, '-'], [7, -5, 1, '-']]], ['flat', 3], ['spikes', 2], ['flat', 4],
        ['walker', 2], ['flat', 6],
        ['next'], ['flat', 4], ['portal'], ['flat', 6],
      ],
    ],
  },
  {
    id: 'frost',
    bed: true, // the owner's music: a long bed, with short accents over it at random
    name: 'Frost',
    res: 18, // the same pack's snow
    pack: 'pp',
    smooth: false,
    outline: '#262338',
    sky: ['#c9e3f2', '#eef6fb'],
    sound: 'm',
    ice: true, // ice: you slide further before you stop
    rule: 'ice, and spiky walkers you cannot stomp',
    stages: [
      [
        ['flat', 8], ['coins', 3, 1, 2], ['flat', 4], ['spiky', 5], ['flat', 11], ['arc', 3], ['pit', 2], ['flat', 4],
        ['walker', 3], ['flat', 8], ['heart', 2, 1], ['flat', 5],
        // The ears, high above the spikes, reached by the spring and two ledges.
        ['flat', 2], ['spring', 1], ['plat', 3, 5, 3, '-'], ['plat', 8, 7, 3, '-'], ['ears', 9, 9], ['flat', 4],
        ['spikes', 2], ['flat', 3], ['spikes', 2], ['flat', 4],
        // A float shortcut: a coin line over a wide pit, with a stepping stone for those without ears.
        ['coins', 7, 4, 3], ['pit', 9, [[4, 0, 2, '=']]], ['flat', 4], ['spiky', 3], ['flat', 7], ['spikes', 1],
        ['flat', 3], ['walker', 2], ['flat', 5], ['step', -2], ['flat', 4], ['arc', 4], ['pit', 4], ['flat', 4],
        ['step', 2], ['flat', 3], ['spiky', 2], ['flat', 3], ['spiky', 6], ['flat', 9], ['heart', 2, 1], ['flat', 4],
        ['arc', 3], ['pit', 3], ['flat', 3], ['spikes', 2], ['flat', 4],
        ['next'], ['flat', 4], ['portal'], ['flat', 6],
      ],
    ],
  },
  {
    id: 'candy',
    bed: true, // the owner's music: a long bed, with short accents over it at random
    name: 'Candy',
    res: 70, // the Platformer Assets Candy pack, vector
    pack: 'candy',
    smooth: true,
    outline: null,
    sky: ['#ffd9ec', '#fff3f8'],
    sound: 'c',
    rule: 'jelly that bounces, cookies that crumble, slimes (the spiked ones cannot be stomped)',
    stages: [
      [
        ['flat', 6], ['coins', 4, 1], ['flat', 6], ['jelly', 3], ['plat', 5, 5, 5, '-'], ['coins', 5, 6, 5],
        ['flat', 10], ['walker', 4], ['flat', 4], ['walker', 3], ['flat', 5], ['heart', 2, 1], ['flat', 4], ['cookies', 3, 2, 3], ['coins', 3, 3, 3],
        ['flat', 7], ['pit', 6, [[1, 0, 4, 'c']]], ['coins', 4, 2, -5], ['flat', 5], ['spiky', 3], ['flat', 8],
        ['flat', 3], ['jelly', 1], ['plat', 3, 5, 3, 'c'], ['coins', 3, 6, 3], ['flat', 7], ['coins', 9, 3, 1],
        ['pit', 10, [[4, 0, 2, '=']]], ['flat', 4], ['walker', 2], ['flat', 7], ['pit', 9, [[0, 0, 4, 'c'], [5, 0, 4, 'c']]],
        ['flat', 4], ['heart', 2, 1], ['flat', 4], ['spiky', 2], ['flat', 3], ['walker', 4], ['flat', 4], ['step', -2], ['flat', 4],
        ['pit', 10, [[0, 0, 4, 'c'], [6, -1, 3, 'c']]], ['flat', 4],
        ['next'], ['flat', 4], ['portal'], ['flat', 6],
      ],
    ],
  },
  {
    id: 'industrial',
    name: 'Industrial',
    res: 18, // the Pixel Platformer Industrial Expansion
    pack: 'ind',
    smooth: false,
    outline: '#262338',
    sky: ['#9eb2c4', '#dde3e8'],
    sound: 'm',
    rule: 'moving platforms and lifts to ride, conveyor belts that carry you',
    stages: [
      [
        // The opening: steel floor, coins, and a first ride over a ditch you can't fall far into.
        ['flat', 6], ['coins', 4, 1, 1], ['flat', 6], ['mover', 0, 0, 4, 'x'], ['low', 7], ['coins', 4, 2, -5], ['flat', 6],
        // The first belt carries you on; then one against you.
        ['belt', 7, 1], ['coins', 4, 1, -6], ['flat', 4], ['walker', 2], ['flat', 6], ['belt', 6, -1], ['flat', 3],
        ['pit', 3], ['flat', 4], ['heart', 2, 1], ['flat', 4],
        // A lift up to a shelf; the floor beyond is spikes.
        ['mover', 1, 0, 5, 'y'], ['flat', 4], ['wall', 6, 5], ['coins', 4, 6, -5], ['spikes', 3], ['flat', 2],
        // The first wide gap: ride across.
        ['flat', 3], ['mover', 0, 0, 7, 'x'], ['pit', 10], ['flat', 4], ['walker', 1], ['flat', 6],
        // A belt that carries you toward spikes: run against it, or jump.
        ['spikes', 2], ['belt', 8, -1], ['coins', 3, 2, -5], ['flat', 3], ['pit', 3], ['flat', 3], ['heart', 1, 1], ['flat', 3],
        // A lift in a shaft, up to a shelf too high to jump.
        ['mover', 0, 0, 5, 'y'], ['pit', 3], ['wall', 7, 5], ['coins', 5, 6, -6], ['flat', 4],
        ['walker', 2], ['walker', 6], ['flat', 9], ['belt', 6, 1], ['pit', 4], ['flat', 4],
        // The second wide gap, with a belt into it.
        ['belt', 5, 1], ['flat', 2], ['mover', 0, 0, 8, 'x', 0.5], ['pit', 11], ['flat', 4], ['spikes', 2], ['flat', 4],
        ['walker', 2], ['flat', 6],
        ['next'], ['flat', 4], ['portal'], ['flat', 6],
      ],
    ],
  },
  {
    id: 'mushroom',
    name: 'Mushroom',
    res: 70, // the Platformer Assets Mushroom pack, vector
    pack: 'mush',
    smooth: true,
    outline: null,
    sky: ['#9fd86e', '#e6f6b4'],
    sound: 'c',
    rows: 50,
    rule: 'mushroom caps that launch you higher each bounce: a tall climb',
    stages: [
      [
        // The opening: soft ground, coins, a first cap to try.
        ['flat', 6], ['coins', 4, 1, 1], ['flat', 5], ['cap', 1, 0], ['coins', 3, 5, 1], ['flat', 7], ['step', -2], ['flat', 6],
        ['walker', 3], ['flat', 7],
        // The first run: cap, cap, cap, onto a ledge.
        ['cap', 0, 1], ['cap', 5, 3], ['cap', 11, 7], ['plat', 17, 13, 6, '-'], ['coins', 4, 14, 18], ['flat', 24],
        ['step', -12], ['flat', 8], ['walker', 3], ['heart', 6, 1], ['flat', 4],
        // The second run, longer, over a gulf.
        ['cap', 1, 1], ['cap', 6, 3], ['cap', 12, 7], ['cap', 18, 13], ['coins', 3, 15, 18], ['pit', 24],
        ['step', -16], ['flat', 8], ['walker', 4], ['flat', 6],
        // The last run to the top.
        ['cap', 0, 1], ['cap', 5, 3], ['cap', 11, 7], ['pit', 17], ['step', -10], ['flat', 6], ['heart', 2, 1],
        ['flat', 4], ['walker', 2], ['flat', 6],
        ['next'], ['flat', 4], ['portal'], ['flat', 6],
      ],
    ],
  },
  {
    id: 'pico',
    name: 'Pico',
    res: 8, // the Pico-8 Platformer pack: 16 colours
    pack: 'pico',
    smooth: false,
    outline: '#000000',
    fixed: PICO8,
    sky: ['#ffccaa', '#ffccaa'],
    sound: 'm',
    chain: true, // stomp chains pay extra
    rule: 'crowded with bad guys, flyers that swoop; stomp chains pay extra',
    stages: [
      [
        // The opening: coins and a flyer far up ahead, swooping only once you're past the start.
        ['flat', 8], ['coins', 4, 1, 1], ['flat', 7], ['walker', 2], ['flat', 6], ['flyer', 4, 4], ['flat', 7],
        ['walker', 1], ['walker', 4], ['flat', 7], ['arc', 3], ['pit', 3], ['flat', 3], ['flyer', 3, 4], ['flat', 5],
        ['walker', 2], ['flat', 4], ['heart', 1, 1], ['flat', 3],
        // Then the crowd: walkers in threes, flyers above them, a spring over a pack.
        ['walker', 2], ['walker', 4], ['walker', 6], ['flyer', 5, 5], ['flat', 9], ['spikes', 2], ['flat', 3],
        ['spring', 1], ['flat', 2], ['walker', 3], ['walker', 6], ['flyer', 7, 5], ['flat', 9], ['arc', 3], ['pit', 3],
        ['flat', 3], ['flyer', 2, 4], ['walker', 5], ['flat', 7], ['heart', 1, 1], ['walker', 4], ['flyer', 6, 4],
        ['flat', 8], ['spikes', 1], ['flat', 2], ['walker', 2], ['walker', 5], ['flat', 7], ['flyer', 1, 4],
        ['flyer', 5, 5], ['walker', 4], ['flat', 12], ['arc', 3], ['pit', 3], ['flat', 2], ['walker', 3], ['walker', 6],
        ['flat', 8], ['flyer', 3, 4], ['walker', 5], ['flat', 7],
        ['next'], ['flat', 4], ['portal'], ['flat', 6],
      ],
    ],
  },
  {
    id: 'ink',
    name: 'Ink',
    res: 16, // the 1-Bit Platformer pack: two colours
    pack: 'ink',
    smooth: false,
    outline: '#1d1b22',
    oneBit: { ink: '#f2efe6', dark: '#1d1b22' },
    sky: ['#1d1b22', '#26232c'],
    sound: 'm',
    music: 'i-music',
    rule: 'ghosts, and drips that fall as you pass',
    stages: [
      [
        ['flat', 8], ['coins', 3, 1, 2], ['flat', 4], ['ghost', 5], ['flat', 10], ['drip', 3, 4], ['flat', 8],
        ['spikes', 2], ['flat', 5], ['arc', 3], ['pit', 3], ['flat', 4], ['heart', 2, 1], ['flat', 4],
        ['flat', 2], ['spring', 1], ['plat', 3, 5, 4, '='], ['coins', 4, 6, 3], ['flat', 9], ['drip', 2, 4],
        ['drip', 5, 4], ['flat', 8], ['ghost', 3], ['ghost', 7], ['flat', 10], ['spikes', 3], ['flat', 3], ['step', -1],
        ['flat', 4], ['arc', 3], ['pit', 3], ['flat', 4], ['drip', 3, 4], ['flat', 6], ['spikes', 1], ['flat', 2],
        ['ghost', 3], ['flat', 6], ['step', 1], ['flat', 3], ['heart', 1, 1], ['flat', 3], ['arc', 4], ['pit', 3],
        ['flat', 4], ['portal'], ['flat', 6],
      ],
    ],
  },
];

// Builds a level from its segments. Returns { cols, rows, base, grid, ground, things, start, coins,
// next }. Heights are in tiles above the ground at that point; x offsets are from the segment's start.
// rows: the level's height in tiles (a tall level, like Mushroom's climb, has more); its usual
// ground line is DEPTH rows above its bottom.
export function buildStage(segments, rows = ROWS) {
  const BASE = rows - DEPTH;
  const cols = segments.reduce((n, s) => n + advance(s), 0);
  const grid = new Uint8Array(cols * rows);
  const ground = new Int16Array(cols).fill(BASE); // top row of the ground in each column (rows = none)
  const things = [];
  let x = 0;
  let g = BASE;
  let next = cols; // the column from which the next world shows
  let pockets = 0;
  const put = (cx, cy, t) => {
    if (cx >= 0 && cx < cols && cy >= 0 && cy < rows) grid[cy * cols + cx] = t;
  };
  const fill = (cx, top, t = T.GROUND) => {
    ground[cx] = top;
    for (let y = top; y < rows; y++) put(cx, y, T.GROUND);
    put(cx, top, t);
  };
  const thing = (type, tx, ty, extra = {}) => things.push({ type, x: tx, y: ty, ...extra });
  let start = null;
  for (const seg of segments) {
    const [kind, a, b, c, d, e] = seg;
    switch (kind) {
      case 'flat':
        for (let i = 0; i < a; i++) fill(x + i, g);
        if (!start) start = { x: 1.5, y: g };
        x += a;
        break;
      case 'step':
        g += a; // negative is up
        break;
      case 'spikes':
        for (let i = 0; i < a; i++) {
          fill(x + i, g);
          put(x + i, g - 1, T.SPIKES);
        }
        x += a;
        break;
      case 'wall': // a block a tiles wide, b tall, on the ground
        for (let i = 0; i < a; i++) fill(x + i, g - b);
        x += a;
        break;
      case 'low': // a dip a tiles wide, 3 lower: you can't fall out of it
        for (let i = 0; i < a; i++) fill(x + i, g + 3);
        x += a;
        break;
      case 'belt': // a conveyor belt a tiles long, carrying toward b (1 right, -1 left)
        for (let i = 0; i < a; i++) fill(x + i, g, b > 0 ? T.BELTR : T.BELTL);
        x += a;
        break;
      case 'pit': {
        for (let i = 0; i < a; i++) ground[x + i] = rows;
        // Stepping stones in the pit: [dx, dy (from the ground line), length, kind]
        for (const [dx, dy, len, k] of b || []) platform(x + dx, g + dy, len, k);
        x += a;
        break;
      }
      case 'plat': // [offset, height above ground, length, kind]
        platform(x + a, g - b, c, d);
        break;
      case 'cookies': // a row of cookies: offset, height, length
        platform(x + a, g - b, c, 'c');
        break;
      case 'hay': // a haybale on the ground, at an offset (a stack of b + 1)
        for (let i = 0; i <= (b || 0); i++) put(x + a, g - 1 - i, T.HAY);
        break;
      case 'coins': // n coins at height h, starting at offset dx (may be negative: back over a pit)
        for (let i = 0; i < a; i++) thing('coin', x + (c || 0) + i + 0.5, g - b - 0.5);
        break;
      case 'pocket': // a hidden pocket: offset, height, n coins in a row, drawn once you come near
        for (let i = 0; i < c; i++) thing('coin', x + a + i + 0.5, g - b - 0.5, { hidden: true, pocket: pockets });
        pockets++;
        break;
      case 'arc': // coins in a jump's arc over the next a tiles
        for (let i = 0; i < a; i++) {
          const t = (i + 0.5) / a;
          thing('coin', x + i + 0.5, g - 1 - Math.round(Math.sin(t * Math.PI) * 2.2) - 0.5);
        }
        break;
      case 'walker':
      case 'spiky':
      case 'ghost':
        thing('walker', x + a + 0.5, g, { kind });
        break;
      case 'flyer': // a flyer hovering b tiles up: it swoops at you as you come near
        thing('flyer', x + a + 0.5, g - b, { kind: 'flyer' });
        break;
      case 'worm':
        thing('worm', x + a + 0.5, g, { kind: 'worm' });
        break;
      case 'spring':
        thing('spring', x + a + 0.5, g);
        break;
      case 'jelly':
        thing('jelly', x + a + 0.5, g);
        break;
      case 'cap': // a bouncy mushroom cap, 3 wide, its left edge at offset a, on a stem b tall
        thing('cap', x + a, g - 1 - (b || 0), { w: 3 });
        break;
      case 'mover': // a moving platform, 3 wide: offset, height, track length, axis ('x' or 'y'), phase
        thing('mover', x + a, g - b, { w: 3, range: c, axis: d, phase: e || 0 });
        break;
      case 'heart': // a heart to pick up: offset, height above the ground
        thing('heart', x + a + 0.5, g - b - 0.5);
        break;
      case 'ears':
        thing('ears', x + a + 0.5, g - b);
        break;
      case 'drip': // a block overhead with a drip under it that falls as you pass: offset, height
        put(x + a, g - b, T.BLOCK);
        thing('drip', x + a + 0.5, g - b + 1);
        break;
      case 'next':
        next = x;
        break;
      case 'portal':
        thing('portal', x + 0.5, g);
        break;
      default:
        throw new Error(`unknown segment ${kind}`);
    }
  }

  function platform(px, py, len, k) {
    for (let i = 0; i < len; i++) {
      if (k === 'c') thing('cookie', px + i + 0.5, py);
      else put(px + i, py, k === '-' ? T.ONEWAY : T.BLOCK);
    }
  }

  const coins = things.filter((t) => t.type === 'coin').length;
  return { cols, rows, base: BASE, grid, ground, things, start, coins, next };
}

function advance(seg) {
  const [kind, a] = seg;
  return ['flat', 'spikes', 'wall', 'low', 'pit', 'belt'].includes(kind) ? a : 0;
}

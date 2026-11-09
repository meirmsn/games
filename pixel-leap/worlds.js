// The levels. Each level is its own world, drawn from its own asset pack (or its own part of one).
//
// A world sets only its resolution (pixels per tile), its palette, its art, its sound and one rule
// from its material; everything else (the grid, the physics, the monster's size) is the same in
// every world. A level is written as a list of segments, read left to right, which buildStage()
// turns into a tile grid and a list of things (coins, enemies, springs…). Its last stretch, from
// the 'next' segment on, is drawn in the next world's style: a glimpse of where the door leads.

export const ROWS = 15; // the grid's height in tiles; falling below it costs a life
const BASE = 11; // the usual ground top (row index)

export const T = { AIR: 0, GROUND: 1, BLOCK: 2, ONEWAY: 3, SPIKES: 4 };

export const WORLDS = [
  {
    id: 'meadow',
    name: 'Meadow',
    res: 18, // pixels per tile: the Pixel Platformer pack
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
    id: 'frost',
    name: 'Frost',
    res: 18, // the same pack's snow
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
    name: 'Candy',
    res: 70, // the Platformer Assets Candy pack, vector
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
    id: 'ink',
    name: 'Ink',
    res: 16, // the 1-Bit Platformer pack: two colours
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

// Builds a level from its segments. Returns { cols, rows, grid, ground, things, start, coins, next }.
// Heights are in tiles above the ground at that point; x offsets are from the segment's start.
export function buildStage(segments) {
  const cols = segments.reduce((n, s) => n + advance(s), 0);
  const grid = new Uint8Array(cols * ROWS);
  const ground = new Int16Array(cols).fill(BASE); // top row of the ground in each column (ROWS = none)
  const things = [];
  let x = 0;
  let g = BASE;
  let next = cols; // the column from which the next world shows
  const put = (cx, cy, t) => {
    if (cx >= 0 && cx < cols && cy >= 0 && cy < ROWS) grid[cy * cols + cx] = t;
  };
  const fill = (cx, top) => {
    ground[cx] = top;
    for (let y = top; y < ROWS; y++) put(cx, y, T.GROUND);
  };
  const thing = (type, tx, ty, extra = {}) => things.push({ type, x: tx, y: ty, ...extra });
  let start = null;
  for (const seg of segments) {
    const [kind, a, b, c, d] = seg;
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
      case 'pit': {
        for (let i = 0; i < a; i++) ground[x + i] = ROWS;
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
      case 'coins': // n coins at height h, starting at offset dx (may be negative: back over a pit)
        for (let i = 0; i < a; i++) thing('coin', x + (c || 0) + i + 0.5, g - b - 0.5);
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
      case 'worm':
        thing('worm', x + a + 0.5, g, { kind: 'worm' });
        break;
      case 'spring':
        thing('spring', x + a + 0.5, g);
        break;
      case 'jelly':
        thing('jelly', x + a + 0.5, g);
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
    void d;
  }

  function platform(px, py, len, k) {
    for (let i = 0; i < len; i++) {
      if (k === 'c') thing('cookie', px + i + 0.5, py);
      else put(px + i, py, k === '-' ? T.ONEWAY : T.BLOCK);
    }
  }

  const coins = things.filter((t) => t.type === 'coin').length;
  return { cols, rows: ROWS, grid, ground, things, start, coins, next };
}

function advance(seg) {
  const [kind, a] = seg;
  return ['flat', 'spikes', 'wall', 'low', 'pit'].includes(kind) ? a : 0;
}

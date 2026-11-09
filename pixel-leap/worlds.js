// The worlds and their stages.
//
// A world sets only its resolution (pixels per tile), its palette, its art, its sound and one rule
// from its material; everything else (the grid, the physics, the monster's size) is the same in
// every world. A stage is written as a list of segments, read left to right, which build_stage()
// turns into a tile grid and a list of things (coins, enemies, springs…).

export const ROWS = 15; // the grid's height in tiles; falling below it is a poof
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
    rule: 'springs, spikes and walkers',
    stages: [
      // 1: run, jump and coins. No hazards: every gap is a dip to ground you can't fall out of.
      [
        ['flat', 3], ['coins', 4, 1], ['flat', 7], ['step', -1], ['flat', 4], ['arc', 4], ['flat', 1], ['step', -1],
        ['flat', 5], ['arc', 3], ['low', 3], ['flat', 5], ['plat', 1, 3, 4, '-'], ['coins', 4, 4, 1], ['flat', 8],
        ['step', 1], ['flat', 4], ['arc', 5], ['low', 4], ['flat', 4], ['heart'], ['flat', 5], ['step', -2], ['flat', 5],
        ['coins', 3, 1], ['plat', 3, 3, 3, '='], ['coins', 3, 4, 3], ['flat', 7], ['step', 2], ['flat', 3], ['arc', 4],
        ['low', 4], ['flat', 4], ['step', -1], ['flat', 3], ['step', -1], ['flat', 3], ['step', -1], ['flat', 4],
        ['coins', 5, 1], ['flat', 6], ['step', 3], ['flat', 5], ['heart'], ['flat', 4], ['plat', 2, 3, 2, '-'],
        ['plat', 5, 5, 2, '-'], ['coins', 2, 6, 5], ['flat', 8], ['arc', 5], ['low', 5], ['flat', 4], ['coins', 3, 1],
        ['flat', 5], ['door'], ['flat', 6],
      ],
      // 2: spikes (first a single patch on flat ground), then walkers, then real pits.
      [
        ['flat', 9], ['spikes', 1], ['flat', 6], ['arc', 3], ['spikes', 2], ['flat', 6], ['walker', 4], ['flat', 10],
        ['heart'], ['flat', 5], ['arc', 3], ['pit', 2], ['flat', 5], ['arc', 4], ['pit', 3], ['flat', 4],
        ['plat', 1, 3, 5, '-'], ['coins', 5, 4, 1], ['walker', 3], ['flat', 8], ['spikes', 3], ['flat', 3],
        ['step', -1], ['flat', 4], ['heart'], ['flat', 4], ['walker', 5], ['flat', 8], ['arc', 4], ['pit', 4],
        ['flat', 3], ['step', -1], ['flat', 3], ['plat', 2, 3, 3, '='], ['coins', 3, 4, 2], ['walker', 6], ['flat', 9],
        ['step', 2], ['flat', 3], ['spikes', 2], ['flat', 4], ['heart'], ['flat', 4], ['arc', 3], ['pit', 3],
        ['flat', 3], ['spikes', 1], ['flat', 2], ['walker', 1], ['flat', 6], ['arc', 4], ['pit', 4], ['flat', 4],
        ['door'], ['flat', 6],
      ],
      // 3: springs, the ears (in view above the spikes), a float shortcut, the portal.
      [
        ['flat', 8], ['spring', 4], ['plat', 3, 5, 4, '='], ['coins', 4, 6, 3], ['flat', 10], ['heart'], ['flat', 3],
        ['spring', 2], ['flat', 3], ['wall', 4, 4], ['step', -4], ['flat', 4], ['walker', 3], ['flat', 6], ['step', 4],
        ['flat', 4], ['heart'], ['flat', 4], ['spring', 2], ['plat', 4, 5, 3, '-'], ['plat', 9, 6, 3, '-'],
        ['ears', 10, 8], ['flat', 4], ['spikes', 2], ['flat', 3], ['spikes', 2], ['flat', 4], ['coins', 3, 1], ['flat', 6], ['heart'], ['flat', 4],
        ['coins', 7, 4, 4], ['pit', 9, [[4, 0, 2, '=']]], ['flat', 4], ['walker', 4],
        ['flat', 9], ['spring', 3], ['plat', 5, 6, 6, '-'], ['coins', 6, 7, 5], ['flat', 12], ['heart'], ['flat', 4],
        ['arc', 4], ['pit', 3], ['flat', 3], ['spikes', 2], ['flat', 3], ['walker', 2], ['flat', 7], ['portal'],
        ['flat', 6],
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
    rule: 'jelly that bounces, cookies that crumble',
    stages: [
      // 1: jelly bouncers and gummy worms; a float-only coin line over a pit.
      [
        ['flat', 6], ['coins', 4, 1], ['flat', 6], ['jelly', 3], ['plat', 3, 5, 5, '-'], ['coins', 5, 6, 3],
        ['flat', 10], ['worm', 4], ['flat', 9], ['heart'], ['flat', 4], ['jelly', 2], ['flat', 3], ['wall', 4, 4],
        ['step', -4], ['flat', 3], ['coins', 3, 1], ['flat', 3], ['step', 4], ['flat', 5], ['worm', 3], ['flat', 8],
        ['heart'], ['flat', 4], ['coins', 9, 3, 1], ['pit', 10, [[4, 0, 2, '=']]], ['flat', 4],
        ['jelly', 2], ['plat', 4, 6, 4, '-'], ['coins', 4, 7, 4], ['flat', 9], ['worm', 2], ['flat', 7], ['heart'],
        ['flat', 4], ['arc', 4], ['pit', 3], ['flat', 4], ['worm', 2], ['flat', 6], ['arc', 4], ['pit', 4],
        ['flat', 4], ['door'], ['flat', 6],
      ],
      // 2: cookies that crumble half a second after you land, with worms and jelly.
      [
        ['flat', 8], ['cookies', 3, 2, 3], ['coins', 3, 3, 3], ['flat', 7], ['heart'], ['flat', 4],
        ['pit', 6, [[1, 0, 4, 'c']]], ['coins', 4, 2, -5], ['flat', 5], ['worm', 3], ['flat', 8], ['heart'],
        ['flat', 4], ['jelly', 1], ['flat', 3], ['plat', 0, 5, 3, 'c'], ['coins', 3, 6, 0], ['flat', 6],
        ['pit', 9, [[0, 0, 4, 'c'], [6, -1, 3, 'c']]], ['flat', 4], ['heart'], ['flat', 4], ['worm', 4], ['flat', 7],
        ['step', -2], ['flat', 4], ['pit', 10, [[0, 0, 4, 'c'], [6, -1, 3, 'c']]],
        ['coins', 4, 3, -8], ['flat', 5], ['heart'], ['flat', 4], ['jelly', 2], ['plat', 4, 5, 4, 'c'],
        ['coins', 4, 6, 4], ['flat', 10], ['worm', 3], ['flat', 7], ['step', 2], ['flat', 3],
        ['pit', 8, [[1, 0, 6, 'c']]], ['flat', 5], ['portal'], ['flat', 6],
      ],
    ],
  },
];

// Builds a stage from its segments. Returns { cols, rows, grid, things, start, coins }.
// Heights are in tiles above the ground at that point; x offsets are from the segment's start.
export function buildStage(segments) {
  const cols = segments.reduce((n, s) => n + advance(s), 0);
  const grid = new Uint8Array(cols * ROWS);
  const ground = new Int16Array(cols).fill(BASE); // top row of the ground in each column (ROWS = none)
  const things = [];
  let x = 0;
  let g = BASE;
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
      case 'wall': // a block of a tiles wide, b tall, on the ground
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
        thing('walker', x + a + 0.5, g);
        break;
      case 'worm':
        thing('worm', x + a + 0.5, g);
        break;
      case 'spring':
        thing('spring', x + a + 0.5, g);
        break;
      case 'jelly':
        thing('jelly', x + a + 0.5, g);
        break;
      case 'heart':
        thing('heart', x + 0.5, g);
        break;
      case 'ears':
        thing('ears', x + a + 0.5, g - b);
        break;
      case 'door':
        thing('door', x + 0.5, g);
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

  // A dip ('low') has walls on its sides from the neighbouring ground, so nothing to add. The
  // number of coins is what the tally counts against.
  const coins = things.filter((t) => t.type === 'coin').length;
  return { cols, rows: ROWS, grid, ground, things, start, coins };
}

function advance(seg) {
  const [kind, a] = seg;
  return ['flat', 'spikes', 'wall', 'low', 'pit'].includes(kind) ? a : 0;
}

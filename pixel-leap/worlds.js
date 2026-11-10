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
// you left or right. ICE: solid ground you slide on. GATE: a portcullis, solid until a key opens it.
// SLOPEU / SLOPED: a 45° slope rising or falling to the right; not solid from the side, its surface
// is ground (see slopeY), and the ground under it fills on. SKETCH: Scribble's ground that draws
// itself in as you near: the grid holds AIR there until it is drawn (stage.sketches), then SKETCH.
export const T = { AIR: 0, GROUND: 1, BLOCK: 2, ONEWAY: 3, SPIKES: 4, HAY: 5, BELTL: 6, BELTR: 7, ICE: 8, GATE: 9, SLOPEU: 10, SLOPED: 11, SKETCH: 12 };
export const SOLID = new Set([T.GROUND, T.BLOCK, T.HAY, T.BELTL, T.BELTR, T.ICE, T.GATE, T.SKETCH]);
export const SLOPES = new Set([T.SLOPEU, T.SLOPED]);
// The surface's height in a slope tile at x (tiles): rising to the right, or falling.
export function slopeY(t, tx, ty, x) {
  const f = Math.max(0, Math.min(1, x - tx));
  return t === T.SLOPEU ? ty + 1 - f : ty + f;
}

// PICO-8's 16 colours: Pico draws nothing else.
export const PICO8 = [
  '#000000', '#1d2b53', '#7e2553', '#008751', '#ab5236', '#5f574f', '#c2c3c7', '#fff1e8',
  '#ff004d', '#ffa300', '#ffec27', '#00e436', '#29adff', '#83769c', '#ff77a8', '#ffccaa',
];

// Sky's climb (see buildClimb): an opening of wide grass ledges, then sliding and cracked ledges and a
// spring, then flyers and spikies, wings, and the plateau at the top. Every ledge has one at most 2
// tiles below it and at most 3 across, edge to edge: a plain bounce reaches every step.
const SKY = {
  height: 96,
  ledges: [
    // The opening: wide grass, two tiles apart, nothing that hurts.
    { h: 2, x: 2, len: 4 }, { h: 4, x: 7, len: 4 }, { h: 6, x: 2, len: 4 }, { h: 8, x: 7, len: 4 },
    { h: 10, x: 3, len: 4 }, { h: 12, x: 7, len: 4 }, { h: 14, x: 3, len: 4 },
    // Sliding and cracked ledges; a spring.
    { h: 16, x: 6, len: 3, kind: 's', range: 4 }, { h: 18, x: 3, len: 3 }, { h: 20, x: 5, len: 2 }, { h: 20, x: 8, len: 3, kind: 'c' },
    { h: 22, x: 9, len: 3 }, { h: 24, x: 1, len: 3, kind: 's', range: 5, phase: 0.5 }, { h: 26, x: 5, len: 3 },
    { h: 28, x: 9, len: 2 }, { h: 28, x: 1, len: 3, kind: 'c' }, { h: 30, x: 5, len: 3 }, { h: 32, x: 9, len: 3 },
    { h: 34, x: 2, len: 3, kind: 's', range: 4 }, { h: 36, x: 7, len: 4 }, { h: 38, x: 2, len: 3 },
    { h: 40, x: 7, len: 3 }, { h: 42, x: 3, len: 3 }, { h: 44, x: 8, len: 2 }, { h: 44, x: 1, len: 2, kind: 'c' }, { h: 46, x: 4, len: 3 },
    // Flyers, spikies on wide ledges with a way round them, wings.
    { h: 48, x: 8, len: 3 }, { h: 50, x: 3, len: 3 }, { h: 50, x: 8, len: 4 }, { h: 52, x: 9, len: 3 },
    { h: 54, x: 9, len: 3 }, { h: 56, x: 4, len: 3, kind: 's', range: 4, phase: 0.3 }, { h: 58, x: 9, len: 3 },
    { h: 60, x: 9, len: 3 }, { h: 62, x: 5, len: 3 }, { h: 64, x: 9, len: 2 }, { h: 64, x: 2, len: 2, kind: 'c' }, { h: 66, x: 5, len: 3 },
    { h: 68, x: 1, len: 3 }, { h: 70, x: 5, len: 3 }, { h: 72, x: 1, len: 4 }, { h: 72, x: 8, len: 3 },
    { h: 74, x: 4, len: 3 }, { h: 76, x: 7, len: 3, kind: 's', range: 3 }, { h: 78, x: 4, len: 3 },
    { h: 80, x: 7, len: 2 }, { h: 80, x: 1, len: 2, kind: 'c' }, { h: 82, x: 3, len: 3 }, { h: 84, x: 7, len: 3 }, { h: 86, x: 2, len: 3 },
    { h: 88, x: 6, len: 3 }, { h: 90, x: 10, len: 2 }, { h: 92, x: 6, len: 3 }, { h: 94, x: 2, len: 3 },
  ],
  things: [
    ['coins', 3, 3, 2], ['coins', 8, 5, 2], ['coins', 3, 7, 2], ['coins', 8, 9, 2], ['heart', 5, 13], ['spring', 8, 12],
    ['coins', 9, 21, 3], ['spring', 6, 30], ['coins', 6, 35, 1], ['coins', 6, 37, 1], ['coins', 6, 39, 1],
    ['heart', 8, 41], ['flyer', 2, 51, 4], ['spiky', 9, 50], ['coins', 9, 53, 2], ['flyer', 2, 57, 3],
    ['wings', 10, 60], ['coins', 10, 65, 1], ['coins', 10, 68, 1], ['coins', 10, 71, 1], ['spiky', 2, 72],
    ['heart', 5, 75], ['flyer', 8, 85, 3], ['flyer', 2, 91, 2], ['coins', 7, 89, 2],
  ],
};

const ALL = [
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
        // A glimpse of Ice, and the door.
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
    sky: ['#1d1b22', '#1d1b22'], // flat: Ink draws only its two colours
    sound: 'm',
    music: 'i-music',
    dark: true, // only a circle of light around the monster, and lamps
    rule: 'darkness: only a circle of light around you; ghosts, and drips that fall as you pass',
    stages: [
      [
        // The opening: lamps close together, coins, nothing that can hurt you.
        ['lamp', 2], ['flat', 8], ['coins', 3, 1, 2], ['lamp', 2], ['flat', 6], ['lamp', 3], ['flat', 6],
        ['ghost', 5], ['flat', 10], ['lamp', 1], ['drip', 3, 4], ['flat', 8],
        ['spikes', 2], ['flat', 5], ['lamp', 2], ['arc', 3], ['pit', 3], ['flat', 4], ['heart', 2, 1], ['flat', 4],
        ['flat', 2], ['spring', 1], ['plat', 3, 5, 4, '='], ['coins', 4, 6, 3], ['flat', 9], ['drip', 2, 4],
        // Then the dark, with fewer lamps.
        ['drip', 5, 4], ['flat', 8], ['ghost', 3], ['ghost', 7], ['flat', 10], ['spikes', 3], ['flat', 3], ['step', -1],
        ['flat', 4], ['arc', 3], ['pit', 3], ['flat', 4], ['lamp', 1], ['drip', 3, 4], ['flat', 6], ['spikes', 1], ['flat', 2],
        ['ghost', 3], ['flat', 6], ['step', 1], ['flat', 3], ['heart', 1, 1], ['flat', 3], ['arc', 4], ['pit', 3],
        ['flat', 4], ['ghost', 2], ['flat', 6], ['pit', 4, [[1, -1, 2, '=']]], ['flat', 4], ['spikes', 2], ['flat', 5],
        // A glimpse of Castle, lit, and the door.
        ['next'], ['flat', 4], ['portal'], ['flat', 6],
      ],
    ],
  },
  {
    id: 'ice',
    bed: true, // the owner's music (made for the old Frost world, now Ice's)
    name: 'Ice',
    res: 70, // the Platformer Assets Ice pack, vector
    pack: 'ice',
    smooth: true,
    outline: null,
    sky: ['#9fd3ef', '#e9f6fd'],
    sound: 'c',
    rule: 'slippery ice, small ledges, snowballs rolling down slopes',
    stages: [
      [
        // The opening: snow that grips, a first slope up and down, coins; nothing that hurts.
        ['flat', 8], ['coins', 3, 1, 1], ['flat', 4], ['slope', 3, 1], ['flat', 4], ['coins', 3, 1], ['slope', 3, -1],
        ['flat', 6],
        // A snail, then the first ice: a flat patch to feel it slide, and a ditch with ice stones.
        ['walker', 4], ['flat', 7], ['ice', 7], ['coins', 4, 1, -6], ['flat', 3],
        ['pit', 5, [[2, 0, 2, 'i']]], ['flat', 4], ['heart', 2, 1], ['flat', 3],
        // The first snow pile: snowballs roll down the slope at you and drop into the ditch at its foot.
        // Each pile sits a tile back from the slope's top: wait at the ditch for a snowball to drop in,
        // run up, and jump the next one on the flat top.
        ['pit', 2], ['flat', 1], ['slope', 3, 1], ['flat', 1], ['pile', 0, -1], ['flat', 5], ['coins', 2, 1, -2], ['slope', 3, -1], ['flat', 5],
        // Small ledges over a wide pit, most of them ice.
        ['pit', 12, [[1, 0, 2, 'i'], [5, -1, 2, 'i'], [9, 0, 2, '-']]], ['coins', 3, 2, -7], ['flat', 4],
        ['flat', 6],
        // The ears, up on ice ledges above spikes: a route you choose to risk.
        ['plat', 1, 3, 2, '-'], ['plat', 4, 5, 2, '-'], ['plat', 7, 7, 2, 'i'], ['ears', 8, 8], ['flat', 3],
        ['spikes', 3], ['flat', 6],
        // A long climb: a ditch halfway up, a pile at the top, ice up there, and down again.
        ['pit', 2], ['flat', 1], ['slope', 3, 1], ['flat', 2], ['pit', 2], ['flat', 1], ['slope', 3, 1], ['flat', 1], ['pile', 0, -1], ['flat', 2],
        ['ice', 5], ['coins', 4, 1, -5], ['flat', 2], ['slope', 6, -1], ['flat', 2], ['walker', 4], ['flat', 6], ['heart', 1, 1], ['flat', 3],
        // Then the real thing: a run of small ledges, ice, a pile at the far side.
        ['pit', 12, [[1, -1, 2, 'i'], [5, -2, 3, 'i'], [10, -1, 1, '-']]], ['flat', 3], ['spikes', 2], ['flat', 3],
        ['pit', 11, [[1, 0, 2, 'i'], [5, -1, 2, 'i'], [9, 0, 1, '-']]], ['flat', 3], ['walker', 2], ['flat', 5],
        ['pit', 2], ['flat', 1], ['slope', 3, 1], ['flat', 1], ['pile', 0, -1], ['flat', 4], ['slope', 3, -1], ['flat', 4],
        ['next'], ['flat', 4], ['portal'], ['flat', 6],
      ],
    ],
  },
  {
    id: 'sea',
    name: 'Sea',
    res: 70, // the Platformer Pack Nautical, vector
    pack: 'sea',
    smooth: true,
    outline: null,
    sky: ['#7fd0f0', '#d8f3fb'],
    sound: 'c',
    rows: 24,
    swim: true, // in the water you float, and each tap is a stroke
    rule: 'swimming: each tap a stroke; currents',
    stages: [
      [
        // The opening: a beach, coins, then the first dip into calm water.
        ['step', -9], ['flat', 9], ['coins', 4, 1, 1], ['flat', 4], ['water', 1], ['step', 6], ['flat', 12],
        ['coins', 4, 3, -9], ['coins', 4, 5, -4], ['step', -6], ['dry'], ['flat', 6], ['heart', 2, 1], ['flat', 2],
        // A deeper bay: a fish, urchins on the floor, a current that carries you on.
        ['water', 1], ['step', 7], ['flat', 3], ['fish', 2, 3, 4], ['flat', 4], ['spikes', 3], ['flat', 3],
        ['current', -3, 5, 8, 3, 1, 0], ['flat', 6], ['coins', 4, 4, -5], ['fish', 0, 2, 5], ['flat', 4],
        // A reef wall: an up-current lifts you over it.
        ['current', -2, 5, 3, 5, 0, -1], ['wall', 2, 5], ['flat', 4], ['spikes', 2], ['flat', 4], ['step', -7], ['dry'],
        ['flat', 5], ['walker', 3], ['flat', 6],
        // The last bay: a down-current over urchins, a current against you, fish.
        ['water', 1], ['step', 7], ['flat', 3], ['current', 0, 6, 4, 4, 0, 1], ['spikes', 4], ['flat', 3],
        ['fish', 1, 2, 5], ['flat', 4], ['current', -2, 4, 6, 3, -1, 0], ['coins', 4, 3, -5], ['flat', 5],
        ['heart', 1, 3], ['fish', 2, 4, 4], ['flat', 6], ['spikes', 2], ['flat', 3], ['step', -7], ['dry'], ['flat', 5],
        ['next'], ['flat', 4], ['portal'], ['flat', 6],
      ],
    ],
  },
  {
    id: 'castle',
    name: 'Castle',
    res: 70, // the Platformer Pack Medieval, vector
    pack: 'castle',
    smooth: true,
    outline: null,
    sky: ['#8fc6e8', '#e3f1f7'],
    sound: 'c',
    rule: 'keys open gates; crushers drop on a rhythm',
    stages: [
      [
        // The opening: the courtyard, coins, a key on a ledge you can see, its gate ahead.
        ['flat', 8], ['coins', 3, 1, 1], ['flat', 4], ['plat', 1, 2, 3, '-'], ['key', 2, 2], ['flat', 6], ['gate'],
        ['flat', 6],
        // One crusher, alone, then a mouse.
        ['crusher', 1, 4, 0], ['flat', 6], ['walker', 3], ['flat', 7], ['heart', 2, 1], ['flat', 3],
        // A key back behind you, over a pair of crushers: the gate comes after them.
        ['plat', 0, 2, 3, '-'], ['key', 1, 2], ['flat', 5], ['crusher', 0, 4, 0], ['crusher', 4, 4, 0.33], ['flat', 8],
        ['gate'], ['flat', 5], ['spikes', 2], ['flat', 4],
        // A key up a climb of ledges; three crushers in a row to the gate.
        ['plat', 1, 2, 3, '-'], ['plat', 1, 4, 3, '-'], ['plat', 1, 6, 3, '-'], ['key', 2, 6], ['flat', 7],
        ['walker', 2], ['flat', 3], ['crusher', 0, 4, 0], ['crusher', 4, 4, 0.25], ['crusher', 8, 4, 0.5], ['flat', 12],
        ['gate'], ['flat', 4],
        // Then the keep: crushers over a pit's edge, mice, and a last key.
        ['heart', 1, 1], ['flat', 3], ['arc', 3], ['pit', 3], ['flat', 3], ['crusher', 1, 4, 0.6], ['flat', 5],
        ['walker', 2], ['walker', 5], ['flat', 8], ['plat', 0, 2, 2, '-'], ['plat', 3, 4, 2, '-'], ['key', 4, 4],
        ['flat', 8], ['crusher', 0, 4, 0], ['crusher', 4, 4, 0.3], ['flat', 8], ['gate'], ['flat', 3],
        // A glimpse of Scribble, in line art, and the door.
        ['next'], ['flat', 4], ['portal'], ['flat', 6],
      ],
    ],
  },
  {
    id: 'scribble',
    bed: true, // the owner's music
    name: 'Scribble',
    res: 70, // the Scribble Platformer pack, vector: drawn as line art
    pack: 'scribble',
    smooth: true,
    lineArt: true, // the world's rule: everything, the monster too, is pen line on white paper
    outline: null,
    sky: ['#fbf8ef', '#f6f1e2'],
    sound: 'c',
    rule: 'trust: ground that draws itself as you near; jump before it is there',
    stages: [
      [
        // The opening: paper, coins, and the first sketch tiles with a dotted guide: a bridge over a
        // ditch, then a step up; nothing that hurts.
        ['flat', 10], ['coins', 4, 1, 1], ['flat', 7], ['low', 3], ['sketch', -3, 0, 3, true], ['flat', 6],
        ['sketch', 1, 2, 3, true], ['coins', 3, 3, 1], ['flat', 7],
        // A slime on solid paper; the first sketch bridge over a real pit, guided.
        ['walker', 4], ['flat', 9], ['pit', 4, [[0, 0, 4, 'S']]], ['flat', 5], ['heart', 2, 1], ['flat', 4],
        // Trust: a pit too wide to jump, with ledges that draw in only once you're in the air.
        ['pit', 11, [[4, 0, 3, 's']]], ['coins', 3, 2, -7], ['flat', 5], ['spikes', 2], ['flat', 4],
        // Sketch stairs up to coins, and down the far side.
        ['sketch', 1, 2, 2], ['sketch', 4, 4, 2], ['sketch', 7, 6, 3], ['coins', 3, 7, 7], ['flat', 12],
        ['walker', 3], ['walker', 7], ['flat', 10],
        // A sketch bridge, a slime beyond it, then a wider pit with two ledges.
        ['pit', 6, [[0, 0, 6, 's']]], ['flat', 3], ['walker', 3], ['flat', 6], ['heart', 1, 1], ['flat', 3],
        ['pit', 12, [[3, 0, 2, 's'], [8, -1, 2, 's']]], ['coins', 2, 3, -5], ['flat', 4], ['spikes', 3], ['flat', 4],
        // The real thing: the widest pit, three ledges, a bridge over spikes, slimes.
        ['walker', 2], ['flat', 6], ['pit', 13, [[3, 0, 2, 's'], [7, -1, 2, 's'], [11, 0, 1, 's']]], ['flat', 4],
        ['spikes', 4], ['sketch', -4, 2, 4], ['flat', 3], ['walker', 3], ['walker', 6], ['flat', 9],
        ['pit', 5, [[0, 0, 5, 's']]], ['flat', 3], ['spikes', 1], ['flat', 3],
        ['next'], ['flat', 4], ['portal'], ['flat', 6],
      ],
    ],
  },
  {
    id: 'sky',
    bed: true, // the owner's music
    name: 'Sky',
    res: 70, // the Jumper Pack, vector
    pack: 'sky',
    smooth: true,
    outline: null,
    sky: ['#7cc8f2', '#e9f7ff'],
    sound: 'c',
    bounce: true, // the finale: you bounce on every ledge you land on, and steer
    rule: 'the finale: an automatic bouncing climb to the top',
    stages: [{ climb: SKY }],
  },
];

// The journey's order (owner, 2026-11-10: "Perfect alternation"): pixel and smooth at every door.
// Batch 4 (owner, 2026-11-10): Scribble's line art between the smooth Castle and Sky, the finale.
const ORDER = ['meadow', 'ice', 'farm', 'candy', 'industrial', 'mushroom', 'pico', 'sea', 'ink', 'castle', 'scribble', 'sky'];
export const WORLDS = ORDER.map((id) => ALL.find((w) => w.id === id));

// Builds a level from its segments. Returns { cols, rows, base, grid, ground, things, start, coins,
// next }. Heights are in tiles above the ground at that point; x offsets are from the segment's start.
// rows: the level's height in tiles (a tall level, like Mushroom's climb, has more); its usual
// ground line is DEPTH rows above its bottom.
export function buildStage(segments, rows = ROWS) {
  if (segments.climb) return buildClimb(segments.climb);
  const BASE = rows - DEPTH;
  const cols = segments.reduce((n, s) => n + advance(s), 0);
  const grid = new Uint8Array(cols * rows);
  const ground = new Int16Array(cols).fill(BASE); // top row of the ground in each column (rows = none)
  const water = new Float32Array(cols).fill(Infinity); // the water's surface in each column (none: Infinity)
  let wet = Infinity;
  const things = [];
  let x = 0;
  let g = BASE;
  let next = cols; // the column from which the next world shows
  let pockets = 0;
  const sketches = []; // Scribble's sketch tiles: { x, y, guide }, drawn in as you near
  const put = (cx, cy, t) => {
    if (cx >= 0 && cx < cols && cy >= 0 && cy < rows) grid[cy * cols + cx] = t;
  };
  const fill = (cx, top, t = T.GROUND) => {
    ground[cx] = top;
    water[cx] = wet;
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
      case 'ice': // ground a tiles long topped with ice
        for (let i = 0; i < a; i++) fill(x + i, g, T.ICE);
        x += a;
        break;
      case 'slope': // a 45° slope a tiles long, rising (b = 1) or falling (b = -1) to the right
        for (let i = 0; i < a; i++) {
          if (b > 0) {
            fill(x + i, g);
            put(x + i, g - 1, T.SLOPEU);
            ground[x + i] = g - 1;
            g -= 1;
          } else {
            fill(x + i, g + 1);
            put(x + i, g, T.SLOPED);
            ground[x + i] = g;
            g += 1;
          }
        }
        x += a;
        break;
      case 'pile': // a snow pile on the ground at an offset, sending snowballs rolling toward b (-1 left)
        thing('pile', x + a + 0.5, g, { dir: b || -1 });
        break;
      case 'gate': // a portcullis 3 tall, with wall above it to the level's top: only a key opens it
        fill(x, g);
        for (let y = 0; y < g - 3; y++) put(x, y, T.BLOCK);
        for (let y = g - 3; y < g; y++) put(x, y, T.GATE);
        thing('gate', x + 0.5, g);
        x += 1;
        break;
      case 'key': // a key: offset, height of the surface it rests on
        thing('key', x + a + 0.5, g - b - 0.5);
        break;
      case 'crusher': // a crusher 2 wide: offset, its bottom's height above the floor while up, phase (0..1)
        thing('crusher', x + a, g - b, { w: 2, floor: g, h: b, phase: c || 0 });
        break;
      case 'water': // water from here on, its surface a tiles below the ground line here
        wet = g + a;
        break;
      case 'dry':
        wet = Infinity;
        break;
      case 'current': // a band of current: offset, top (tiles above the ground), width, height, dx, dy
        thing('current', x + a, g - b, { w: c, h: d, cx: e, cy: seg[6] || 0 });
        break;
      case 'fish': // a fish: offset, height above the floor, how far it swims to the right and back
        thing('fish', x + a + 0.5, g - b, { range: c, kind: 'fish' });
        break;
      case 'lamp': // a lamp on the ground at an offset: a pool of light in the dark
        thing('lamp', x + a + 0.5, g);
        break;
      case 'pit': {
        for (let i = 0; i < a; i++) {
          ground[x + i] = rows;
          water[x + i] = wet;
        }
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
      case 'sketch': // a run of sketch tiles: offset, height above the ground, length, dotted guide
        platform(x + a, g - b, c, d ? 'S' : 's');
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
      if (k === 's' || k === 'S') sketches.push({ x: px + i, y: py, guide: k === 'S', run: `${px},${py}` });
      else if (k === 'c') thing('cookie', px + i + 0.5, py);
      else put(px + i, py, k === '-' ? T.ONEWAY : k === 'i' ? T.ICE : T.BLOCK);
    }
  }

  const coins = things.filter((t) => t.type === 'coin').length;
  return { cols, rows, base: BASE, grid, ground, water, things, start, coins, next, sketches };
}

// Sky: a column between two cloud walls, climbed by bouncing. Its ledges are listed by height (tiles
// above the start's ground), left column (1 to 12) and length; kind 'g' grass, 's' sliding (along
// `range` tiles to the right and back), 'c' cracked (one bounce, then it breaks). The top is a
// plateau with the door, which doesn't bounce, nor does the start's ground.
export const SKY_W = 12; // the column's width between its walls
function buildClimb(def) {
  const cols = SKY_W + 2;
  const rows = def.height + 8;
  const gy = rows - 3; // the start's ground
  const grid = new Uint8Array(cols * rows);
  const ground = new Int16Array(cols).fill(gy);
  const water = new Float32Array(cols).fill(Infinity);
  const put = (cx, cy, t) => {
    if (cx >= 0 && cx < cols && cy >= 0 && cy < rows) grid[cy * cols + cx] = t;
  };
  for (let y = 0; y < rows; y++) {
    put(0, y, T.BLOCK);
    put(cols - 1, y, T.BLOCK);
  }
  for (let x = 1; x < cols - 1; x++) for (let y = gy; y < rows; y++) put(x, y, T.GROUND);
  const things = [];
  const thing = (type, tx, ty, extra = {}) => things.push({ type, x: tx, y: ty, ...extra });
  const top = gy - def.height;
  for (let x = 1; x < cols - 1; x++) put(x, top, T.ONEWAY);
  for (const l of def.ledges) {
    const y = gy - l.h;
    if (l.kind === 's') thing('mover', l.x, y, { w: l.len, range: l.range, axis: 'x', phase: l.phase || 0, ledge: true });
    else if (l.kind === 'c') thing('cracked', l.x, y, { w: l.len });
    else for (let i = 0; i < l.len; i++) put(l.x + i, y, T.ONEWAY);
  }
  for (const [kind, x, h, extra] of def.things) {
    const y = gy - h;
    if (kind === 'coins') for (let i = 0; i < extra; i++) thing('coin', x + i + 0.5, y - 0.5);
    else if (kind === 'heart') thing('heart', x + 0.5, y - 0.5);
    else if (kind === 'spring') thing('spring', x + 0.5, y, { power: 'sky' });
    else if (kind === 'wings') thing('wings', x + 0.5, y);
    else if (kind === 'flyer') thing('flyer', x + 0.5, y, { kind: 'patrol', range: extra });
    else if (kind === 'spiky') thing('walker', x + 0.5, y, { kind: 'spiky' });
  }
  thing('portal', cols / 2, top);
  const coins = things.filter((t) => t.type === 'coin').length;
  return { cols, rows, base: gy, grid, ground, water, things, start: { x: cols / 2, y: gy }, coins, next: cols, sketches: [], climb: true, top, height: def.height };
}

function advance(seg) {
  const [kind, a] = seg;
  if (kind === 'gate') return 1;
  return ['flat', 'spikes', 'wall', 'low', 'pit', 'belt', 'ice', 'slope'].includes(kind) ? a : 0;
}

// Island Hop's archipelago, hand-made: a 60 × 60 grid of tiles, one character each. Row j is y = j,
// column i is x = i (shared/iso.js grid terms: +x runs down-right on screen, +y down-left), so the
// islands, staggered down the grid's diagonal, run top to bottom on a portrait screen.
//
//   ~ deep sea      , shallow sea (only the rowboat)     f low footbridge (walk over; only the rowboat under)
//   . grass         : sand        # road                 P car park       c car park with a parked car
//   o plaza         * fountain    T tree                 H a building     m a stop's doormat
//   = jetty         b berth (deep water)                 d berth (shallow: only the rowboat)
//   A–Z (not H, P, R, T): a stop's building; its doormat is the m on its +x or +y side.
//
// Bump MAP_VERSION whenever the map or a mission changes: saved bests and medals from another version are
// thrown away.

export const MAP_VERSION = 3;

export const ROWS = [
  '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
  '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
  '~~~~~~~~T.::..TPc.:::.T.~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
  '~~~~~~~~.##############.~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
  '~~~~~~~~.#HEm.oo.HHBmH#.~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
  '~~~~~~~~.#H..Too..H...#T~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
  '~~~~~~~~C#....T.T....H#.~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
  '~~~~~~~~m#..H.o*o.HHDm#.~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
  '~~~~~~~~.#..H.Too.H...#.~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
  '~~~~~b==.#.HH..T....T.#.~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
  '~~~~~~~~.#H..HA..HH.HH#.~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
  '~~~~~~~~.#..T.m...T...#.==b~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
  '~~~~~~~~.##############.~~~~~~~~~~~~b~~~~~~~~~~~~~~~~~~~~~~~',
  '~~~~~~~~..TPcP..:Fm.:.T.~~~~~~~~~~~~=~~~~~~~~~~~~~~~~~~~~~~~',
  '~,,,,d,,f,,=,~~~~~~~~~~~~~~~~~~~~~T.:..T~~~~~~~~~~~~~~~~~~~~',
  '~,,,,=,,f,,=,~~~~~~~~~~~~~~~~~~~~~.:..:.~~~~~~~~~~~~~~~~~~~~',
  '~~~..:...~~b~~~~~~~~~~~~~~~~~~~~~~:.Wm..~~~~~~~~~~~~~~~~~~~~',
  '~~~T.V.T.~~~~~~~~~~~~~~~~~~~~~~~~~..X.T.~~~~~~~~~~~~~~~~~~~~',
  '~~~.:m.:.~~~~~~~~~~~~~~~~~~~~~~~~~.Tm::.~~~~~~~~~~~~~~~~~~~~',
  '~~~:..T..~~~~~~~~~~~~~~~~~~~~~~~~~::..::~~~~~~~~~~~~~~~~~~~~',
  '~~~.T..:.~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
  '~~~::..::~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
  '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
  '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
  '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
  '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
  '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~b~b~~~~~b~~~~~~~~~~~~~~~~~~~~~',
  '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~=~=~~~~~=~~~~~~~~~~~~~~~~~~~~~',
  '~~~~~~~~~~~~~~~~~~~~~~~~T..::.:.:..:.PcP~~~~~~~~~~~~~~~~~~~~',
  '~~~~~~~~~~~~~~~~~~~~~~~~.##############.~~~~~~~~~~~~~~~~~~~~',
  '~~~~~~~~~~~~~~~~~~~~~~~~.#HHIm.oo.HJm.#.~~~~~~~~~~~~~~~~~~~~',
  '~~~~~~~~~~~~~~~~~~~~~~~~.#H...o*o.H...#.~~~~~~~~~~~~~~~~~~~~',
  '~~~~~~~~~~~~~~~~~~~~~~~~K#.....oo.T...#P~~~~~~~~~~~~~~~~~~~~',
  '~~~~~~~~~~~~~~~~~~~~~~~~m#...T......Lm#c~~~~~~~~~~~~~~~~~~~~',
  '~~~~~~~~~~~~~~~~~~~~~~~~.#HH.HH.HH....#P~~~~~~~~~~~~~~~~~~~~',
  '~~~~~~~~~~~~~~~~~~~~~~~~.#..T.......T.#.~~~~~~~~~~~~~~~~~~~~',
  '~~~~~~~~~~~~~~~~~~~~~~~~.#H.HHN....HH.#.~~~~~~~~~~~~~~~~~~~~',
  '~~~~~~~~~~~~~~~~~~~~~~~~.#....m..T....#.~~~~~~~~~~~~~~~~~~~~',
  '~~~~~~~~~~~~~~~~~~~~~~~~.##############.~~~~~~~~~~~~~~~~~~~~',
  '~~~~~~~~~~~~~~~~~~~~~~~~..T::...GmT::.T.~~~~~~~~~~~~~~~~~~~~',
  '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
  '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
  '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
  '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
  '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
  '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
  '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
  '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~,,,,,,,,,,,,~~~~~~~~~~~',
  '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~,,,,,d,,,,,,~~~~~~~~~~~',
  '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~,,,,,=,,,,,,~~~~~~~~~~~',
  '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~,,,T.::.T,,,~~~~~~~~~~~',
  '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~,,,.:Ym..,,,~~~~~~~~~~~',
  '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~,,,..:.T.,,,~~~~~~~~~~~',
  '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~,,,.T:.Z.,,,~~~~~~~~~~~',
  '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~,,,:..:m:,,,~~~~~~~~~~~',
  '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~,,,::.T::,,,~~~~~~~~~~~',
  '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~,,,,,,,,,,,,~~~~~~~~~~~',
  '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~,,,,,,,,,,,,~~~~~~~~~~~',
  '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~,,,,,,,,,,,,~~~~~~~~~~~',
  '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
];

export const ISLANDS = [
  { id: 'port', name: 'Port Town', size: 'large', x0: 8, y0: 2, x1: 23, y1: 13 },
  { id: 'lagoon', name: 'Lagoon Isle', size: 'small', x0: 3, y0: 16, x1: 8, y1: 21 },
  { id: 'palm', name: 'Palm Key', size: 'small', x0: 34, y0: 14, x1: 39, y1: 19 },
  { id: 'marina', name: 'Marina Bay', size: 'large', x0: 24, y0: 28, x1: 39, y1: 39 },
  { id: 'far', name: 'Far Cay', size: 'small', x0: 40, y0: 50, x1: 45, y1: 55 },
];

// The stops' buildings: a name, an icon (the mission card and the beam show it) and a beam colour.
export const PLACES = {
  A: { name: 'Bakery', icon: '🎂', color: '#ff9f43' },
  B: { name: 'Post office', icon: '✉️', color: '#54a0ff' },
  C: { name: 'Florist', icon: '💐', color: '#ff6b9d' },
  D: { name: 'Town hall', icon: '🎉', color: '#feca57' },
  E: { name: 'School', icon: '🎒', color: '#ee5253' },
  F: { name: 'Ice cream kiosk', icon: '🍦', color: '#f8a5c2' },
  G: { name: 'Garage', icon: '🔧', color: '#8395a7' },
  I: { name: 'Café', icon: '☕', color: '#c8835a' },
  J: { name: 'Bookshop', icon: '📚', color: '#5f27cd' },
  K: { name: 'Pharmacy', icon: '💊', color: '#1dd1a1' },
  L: { name: 'Toy shop', icon: '🧸', color: '#ff9ff3' },
  N: { name: 'Bank', icon: '💰', color: '#10ac84' },
  V: { name: 'Fish shed', icon: '🐟', color: '#48dbfb' },
  W: { name: 'Coconut stall', icon: '🥥', color: '#a0785a' },
  X: { name: 'Surf hut', icon: '🏄', color: '#0abde3' },
  Y: { name: 'Lighthouse keeper', icon: '🔦', color: '#fffa65' },
  Z: { name: 'Turtle rescue', icon: '🐢', color: '#7bed9f' },
};

// Berths by their water tile. The boat moors nose-in to the jetty end beside it.
export const BERTHS = {
  '5,9': 'portW',
  '26,11': 'portE',
  '11,16': 'portS',
  '5,14': 'lagoon',
  '36,12': 'palm',
  '30,26': 'marina1',
  '32,26': 'marina2',
  '38,26': 'marinaN',
  '42,48': 'far',
};

// Parked cars by their car-park tile (Isometric Tiles Vehicles).
export const CARS = {
  '16,2': { id: 'portN', kind: 'police' },
  '12,13': { id: 'portS', kind: 'taxi' },
  '38,28': { id: 'marinaN', kind: 'taxi' },
  '39,33': { id: 'marinaE', kind: 'ambulance' },
};

// Your three boats (Isometric Watercraft numbers) and where each is moored when a mission doesn't
// say otherwise.
export const YOUR_BOATS = {
  motor: { craft: 12, name: 'Motorboat' },
  speed: { craft: 21, name: 'Speedboat' },
  row: { craft: 28, name: 'Rowboat' },
};

// Every other Watercraft sprite, moored in the harbours (they bump you like rocks), and the buoys
// marking the channels. Positions in tiles; frame is the heading (0 = up-left, then clockwise).
export const MOORED = [
  { craft: 1, x: 28, y: 1.2, frame: 3 },
  { craft: 2, x: 30.5, y: 1.2, frame: 3 },
  { craft: 25, x: 33, y: 1.2, frame: 7 },
  { craft: 26, x: 35.5, y: 1.2, frame: 3 },
  { craft: 8, x: 38, y: 1.2, frame: 7 },
  { craft: 3, x: 20, y: 31, frame: 1 },
  { craft: 7, x: 19.5, y: 36, frame: 5 },
  { craft: 14, x: 24.6, y: 25.4, frame: 1 },
  { craft: 16, x: 20.8, y: 27.2, frame: 5 },
  { craft: 18, x: 42, y: 15.5, frame: 7 },
  { craft: 29, x: 1.2, y: 18.5, frame: 1 },
  { craft: 20, x: 1.2, y: 20.8, frame: 5 },
  { craft: 10, x: 51, y: 53.5, frame: 5 },
  { craft: 11, x: 26.2, y: 4, frame: 1 },
  { craft: 4, x: 26.6, y: 7.5, frame: 5 },
];
// Rocks in the sea (Isometric Nature): they bump you.
export const SEA_ROCKS = [
  { x: 21.5, y: 19.5, rock: '007' },
  { x: 25.5, y: 22, rock: '152' },
  { x: 10.5, y: 26.5, rock: '010' },
  { x: 33.5, y: 43.5, rock: '007' },
  { x: 50.5, y: 31.5, rock: '152' },
  { x: 5.5, y: 31, rock: '010' },
  { x: 44.5, y: 34, rock: '007' },
  { x: 17, y: 50, rock: '152' },
];
export const BUOYS = [
  { x: 0.5, y: 13.5 },
  { x: 13.5, y: 14.5 },
  { x: 36.4, y: 46.4 },
  { x: 49.6, y: 46.4 },
  { x: 36.4, y: 59 },
  { x: 49.6, y: 59 },
];

// Small boats out for fun, on slow loops round the open water in every mission, so the sea feels
// alive. You glide round them, as round a moored boat (owner, 2026-11-11: "Some of the smaller boats
// are moving there recreationally and stuff to feel more alive").
export const LEISURE = [
  { craft: 13, speed: 1.1, loop: true, path: [[3, 24], [12, 24], [12, 29.5], [3, 29.5]] },
  { craft: 17, speed: 1.3, loop: true, path: [[25, 14], [29, 14], [29, 19.5], [25, 19.5]] },
  { craft: 15, speed: 1.0, loop: true, path: [[3, 34], [13, 34], [13, 41], [3, 41]] },
  { craft: 22, speed: 1.2, loop: true, path: [[53, 47], [57, 47], [57, 57], [53, 57]] },
  { craft: 9, speed: 1.4, loop: true, path: [[48, 2], [57, 2], [57, 7], [48, 7]] },
  { craft: 19, speed: 0.9, loop: true, path: [[46, 25], [54, 25], [54, 38], [46, 38]] },
];

// Traffic on fixed routes, in tiles and tiles a second: a loop goes round; a lane goes back and forth.
// The ferry sails in every mission; the tugs and the container ship join in the last.
export const TRAFFIC = {
  ferry: { craft: 5, speed: 1.6, loop: true, path: [[31, 5], [31, 21.5], [46, 21.5], [46, 8]] },
  tugA: { craft: 23, speed: 1.8, loop: false, path: [[20, 42.5], [47, 42.5]] },
  tugB: { craft: 24, speed: 1.5, loop: false, path: [[15, 23], [15, 41]] },
  ship: { craft: 6, speed: 2.2, loop: false, path: [[2, 45.2], [58, 45.2]] },
};

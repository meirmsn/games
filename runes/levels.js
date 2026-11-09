// The levels of Runes, in play order. Level 1 is hand-made; the rest were picked from
// scripts/runes/generate.mjs and pass its checks (tests/runes.test.mjs re-solves every one).
//   .  water   o  stone   S  source   G  gate   R  rise   K  sink
// `deep` levels are optional: harder, drawn with a gold rim, and they never lock anything.

export const CHAPTERS = [
  { id: 'dawn', name: 'Dawn', from: 0, to: 7 },
  { id: 'tide', name: 'Tide', from: 7, to: 14 },
];

export const LEVELS = [
  // Dawn: stones, then the Rise.
  { name: 'First Light', rows: ['Soo', '..o', 'Goo'] },
  { name: 'Two Ways', rows: ['Soo.', 'oooo', '..oo', '..oG'] },
  { name: 'The Long Way', rows: ['oo..', 'oo..', 'oS..', 'oooo', '.ooG'] },
  { name: 'Rising Stone', rows: ['oo..', 'Sooo', '.oR.', '.ooG'] },
  { name: 'Causeway', rows: ['Goooo', 'o.RSo', 'ooo..', '.oo..', '.oo..'] },
  { name: 'Old Steps', deep: true, rows: ['oooo.', 'ooG.o', '.SoRo', '.o.oo', '.oRoo', '.oo..'] },
  { name: 'High Water', deep: true, rows: ['.oooo', 'oR.oG', 'ooo.o', 'oooRo', '..ooo', '..ooS'] },
  // Tide: the Sink alone, then both.
  { name: 'Low Tide', rows: ['.oo.', '.oKo', 'ooo.', 'Soo.', 'Go..'] },
  { name: 'Undertow', rows: ['.oooo', '.Sooo', 'ooo..', 'oKo..', 'Go...'] },
  { name: 'Ebb and Flow', rows: ['Sooo.', 'oKoo.', '.oooo', '..oR.', '..ooG'] },
  { name: 'Drowned Steps', rows: ['Gooo.', 'oooo.', '.oKS.', '..oo.', '.oKoo', '..ooo'] },
  { name: 'Turning Tide', rows: ['ooSooG', 'oKoR.o', '.ooo..', '..oKo.', '..oo..'] },
  { name: 'Deep Pool', deep: true, rows: ['.oooo.', '.oo.oo', 'ooG..o', 'ooSooo', 'oKR.Ko', '.oooo.'] },
  { name: 'Moonwater', deep: true, rows: ['Goooo.', 'oKo.oo', '.ooRoo', '..oooo', '..oKSo', '...o..'] },
];

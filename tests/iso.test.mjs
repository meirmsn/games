// Unit tests for shared/iso.js, the isometric helpers Island Hop and later isometric games share.
// Plain Node: the module needs no DOM, and attachGestures() is driven through a fake element.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createIso, createCamera, sortByDepth, attachGestures } from '../shared/iso.js';

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

test('island-hop AC-1: tiles project to a 2:1 diamond and pick back to the same tile', () => {
  const iso = createIso({ tileW: 64, tileH: 32 });
  assert.deepEqual(iso.toScreen(0, 0), { x: 0, y: 0 });
  assert.deepEqual(iso.toScreen(1, 0), { x: 32, y: 16 }); // x runs down-right
  assert.deepEqual(iso.toScreen(0, 1), { x: -32, y: 16 }); // y runs down-left
  assert.deepEqual(iso.toScreen(1, 1, 10), { x: 0, y: 22 }); // z lifts up the screen
  // Round trip, fractional.
  for (const [x, y] of [[3.25, 7.5], [-2.1, 4.9], [0, 0], [40, 12.75]]) {
    const s = iso.toScreen(x, y);
    const t = iso.toTile(s.x, s.y);
    near(t.x, x);
    near(t.y, y);
  }
  // A tile's centre and points just inside each of its four corners pick that tile.
  for (const [i, j] of [[0, 0], [5, 2], [-3, 8]]) {
    for (const [fx, fy] of [[0.5, 0.5], [0.02, 0.02], [0.98, 0.02], [0.02, 0.98], [0.98, 0.98]]) {
      const s = iso.toScreen(i + fx, j + fy);
      assert.deepEqual(iso.pickTile(s.x, s.y), { x: i, y: j });
    }
  }
  // Directions: drawn up-right on screen is grid -y; the round trip keeps the direction.
  const up = iso.screenDirToGrid(32, -16);
  near(up.x, 0);
  near(up.y, -1);
  const back = iso.gridDirToScreen(up.x, up.y);
  near(Math.atan2(back.y, back.x), Math.atan2(-16, 32));
  // facing(): 8 headings counted clockwise from screen-right.
  assert.equal(iso.facing(1, -1), 0); // grid (1,-1) is straight right on screen
  assert.equal(iso.facing(1, 1), 2); // straight down
  assert.equal(iso.facing(-1, 1), 4); // left
  assert.equal(iso.facing(-1, -1), 6); // up
  assert.equal(iso.facing(1, 0), 1); // down-right
});

test('island-hop AC-2: depth sorting draws back to front, and a boat passes behind an island tile in front of it', () => {
  const iso = createIso();
  const island = { name: 'island', depth: iso.depth(10, 10) };
  const boatBehind = { name: 'boat', depth: iso.depth(9.2, 9.6, 1) };
  const ground = { name: 'water', depth: iso.depth(9, 9) };
  const order = sortByDepth([island, boatBehind, ground]).map((d) => d.name);
  assert.deepEqual(order, ['water', 'boat', 'island']);
  // The boat sails past to the front of the island: it now draws after it.
  boatBehind.depth = iso.depth(10.6, 10.4, 1);
  assert.deepEqual(sortByDepth([island, boatBehind, ground]).map((d) => d.name), ['water', 'island', 'boat']);
  // Stable: equal depths keep their order, and layer breaks a tie in favour of things standing up.
  const a = { name: 'a', depth: 5 };
  const b = { name: 'b', depth: 5 };
  assert.deepEqual(sortByDepth([a, b]).map((d) => d.name), ['a', 'b']);
  assert.ok(iso.depth(2, 3, 1) > iso.depth(2, 3, 0));
  assert.ok(iso.depth(2, 3, 1) < iso.depth(2, 3.1, 0));
});

function fakeElement() {
  const handlers = {};
  return {
    handlers,
    addEventListener: (t, f) => (handlers[t] = f),
    removeEventListener: (t) => delete handlers[t],
    getBoundingClientRect: () => ({ left: 0, top: 0 }),
    fire(type, id, x, y, extra = {}) {
      handlers[type]({ type, pointerId: id, clientX: x, clientY: y, preventDefault() {}, ...extra });
    },
  };
}

test('island-hop AC-3: the camera maps view to world, zooms about a point, pans by drag, clamps, and lists the tiles in view', () => {
  const cam = createCamera({ zoom: 1, minZoom: 0.5, maxZoom: 3 });
  cam.resize(400, 800);
  cam.lookAt({ x: 100, y: 50 });
  assert.deepEqual(cam.toWorld(200, 400), { x: 100, y: 50 });
  const w = cam.toWorld(37, 610);
  const v = cam.toView(w.x, w.y);
  near(v.x, 37);
  near(v.y, 610);
  // Zooming keeps the world point under the pinch where it was.
  const under = cam.toWorld(300, 100);
  cam.zoomAt(2, 300, 100);
  assert.equal(cam.zoom, 2);
  const still = cam.toWorld(300, 100);
  near(still.x, under.x);
  near(still.y, under.y);
  cam.zoomAt(100);
  assert.equal(cam.zoom, 3); // capped
  cam.zoomAt(0.001);
  assert.equal(cam.zoom, 0.5);
  // Panning: the world follows the finger.
  const before = cam.toWorld(200, 400);
  cam.panBy(50, -20);
  const after = cam.toWorld(200, 400);
  near(after.x, before.x - 50 / cam.zoom);
  near(after.y, before.y + 20 / cam.zoom);
  // Bounds hold the centre in.
  cam.bounds = { minX: 0, minY: 0, maxX: 10, maxY: 10 };
  cam.lookAt({ x: 99, y: -99 });
  assert.deepEqual([cam.x, cam.y], [10, 0]);
  cam.bounds = null;
  // The transform puts the camera centre in the middle of the canvas, at the device ratio.
  cam.zoom = 1;
  cam.lookAt({ x: 0, y: 0 });
  assert.deepEqual(cam.transform(2), [2, 0, 0, 2, 400, 800]);
  // Every tile whose centre is in view is inside tileRange().
  const iso = createIso({ tileW: 64, tileH: 32 });
  const r = cam.tileRange(iso, 0);
  for (let i = -40; i <= 40; i++)
    for (let j = -40; j <= 40; j++) {
      const s = iso.toScreen(i + 0.5, j + 0.5);
      const vv = cam.toView(s.x, s.y);
      if (vv.x >= 0 && vv.x <= 400 && vv.y >= 0 && vv.y <= 800)
        assert.ok(i >= r.x0 && i <= r.x1 && j >= r.y0 && j <= r.y1, `tile ${i},${j} in range`);
    }
});

test('island-hop AC-3: gestures: one finger is the game\'s, a tap is a tap, two fingers pinch-zoom and cancel the first, the wheel zooms', () => {
  const cam = createCamera({ zoom: 1, minZoom: 0.5, maxZoom: 4 });
  cam.resize(400, 800);
  const el = fakeElement();
  const log = [];
  const detach = attachGestures(el, cam, {
    onDown: (p) => log.push(['down', p.x, p.y]),
    onMove: (p) => log.push(['move', p.dx, p.dy]),
    onUp: () => log.push(['up']),
    onTap: () => log.push(['tap']),
    onCancel: () => log.push(['cancel']),
  });
  // A tap.
  el.fire('pointerdown', 1, 100, 100);
  el.fire('pointerup', 1, 100, 100);
  assert.deepEqual(log, [['down', 100, 100], ['up'], ['tap']]);
  log.length = 0;
  // A drag: moves are measured from the press; no tap.
  el.fire('pointerdown', 1, 100, 100);
  el.fire('pointermove', 1, 160, 70);
  el.fire('pointerup', 1, 160, 70);
  assert.deepEqual(log, [['down', 100, 100], ['move', 60, -30], ['up']]);
  assert.equal(cam.x, 0); // one finger never moved the camera
  log.length = 0;
  // A second finger cancels the first and pinches: spreading the fingers doubles the zoom.
  el.fire('pointerdown', 1, 150, 400);
  el.fire('pointerdown', 2, 250, 400);
  el.fire('pointermove', 2, 350, 400);
  el.fire('pointermove', 1, 50, 400);
  near(cam.zoom, 3, 1e-6);
  el.fire('pointerup', 2, 350, 400);
  el.fire('pointermove', 1, 10, 10); // the leftover finger steers nothing
  el.fire('pointerup', 1, 10, 10);
  assert.deepEqual(log, [['down', 150, 400], ['cancel']]);
  // The wheel zooms out.
  el.fire('wheel', 0, 200, 400, { deltaY: 200 });
  assert.ok(cam.zoom < 3);
  detach();
  assert.deepEqual(Object.keys(el.handlers), []);
  // With onePointerPans, a drag pans.
  const cam2 = createCamera();
  cam2.resize(400, 800);
  const el2 = fakeElement();
  attachGestures(el2, cam2, { onePointerPans: true });
  el2.fire('pointerdown', 1, 100, 100);
  el2.fire('pointermove', 1, 140, 130);
  el2.fire('pointerup', 1, 140, 130);
  assert.deepEqual([cam2.x, cam2.y], [-40, -30]);
});

test('island-hop AC-3: a two-finger drag keeps the world under the fingers; a third finger lifting carries on smoothly; a leftover finger pans', () => {
  const cam = createCamera({ zoom: 1, minZoom: 0.25, maxZoom: 8 });
  cam.resize(400, 800);
  const el = fakeElement();
  attachGestures(el, cam, { onePointerPans: true });
  el.fire('pointerdown', 1, 100, 300);
  el.fire('pointerdown', 2, 200, 300);
  const under = cam.toWorld(150, 300); // the world point under the midpoint
  // Both fingers slide 60 px right and 40 px down, and spread apart 1.5×.
  el.fire('pointermove', 1, 135, 340);
  el.fire('pointermove', 2, 285, 340);
  const mid = cam.toView(under.x, under.y);
  near(mid.x, 210, 1e-6);
  near(mid.y, 340, 1e-6);
  near(cam.zoom, 1.5, 1e-6);
  // A third finger comes and goes: lifting it doesn't jump the view.
  el.fire('pointerdown', 3, 50, 50);
  const before = { x: cam.x, y: cam.y, zoom: cam.zoom };
  el.fire('pointerup', 3, 50, 50);
  el.fire('pointermove', 2, 285, 340); // no actual movement
  assert.deepEqual({ x: cam.x, y: cam.y, zoom: cam.zoom }, before);
  // Lift one: the other pans on.
  el.fire('pointerup', 2, 285, 340);
  const w = cam.toWorld(135, 340);
  el.fire('pointermove', 1, 165, 300);
  const v = cam.toView(w.x, w.y);
  near(v.x, 165, 1e-6);
  near(v.y, 300, 1e-6);
});

test('island-hop AC-3: a slow press is not a tap, a still hold is a long press, the right mouse button is ignored, and a one-finger pan waits for the slop', async () => {
  const cam = createCamera();
  cam.resize(400, 800);
  const el = fakeElement();
  const log = [];
  attachGestures(el, cam, { tapMs: 30, longPressMs: 60, onTap: () => log.push('tap'), onLongPress: () => log.push('long'), onDown: () => log.push('down') });
  el.fire('pointerdown', 1, 10, 10, { pointerType: 'mouse', button: 2 });
  assert.deepEqual(log, []);
  el.fire('pointerdown', 1, 10, 10);
  await new Promise((r) => setTimeout(r, 45));
  el.fire('pointerup', 1, 10, 10);
  assert.deepEqual(log, ['down']); // too slow for a tap, too quick for a long press
  log.length = 0;
  el.fire('pointerdown', 1, 10, 10);
  await new Promise((r) => setTimeout(r, 90));
  el.fire('pointerup', 1, 10, 10);
  assert.deepEqual(log, ['down', 'long']);
  const cam2 = createCamera();
  cam2.resize(400, 800);
  const el2 = fakeElement();
  attachGestures(el2, cam2, { onePointerPans: true, tapSlop: 20 });
  el2.fire('pointerdown', 1, 100, 100);
  el2.fire('pointermove', 1, 108, 106); // within the slop: no jiggle
  assert.deepEqual([cam2.x, cam2.y], [0, 0]);
  el2.fire('pointerup', 1, 108, 106);
});

test('island-hop AC-1: picking with heights finds a raised tile in front before the ground behind it', () => {
  const iso = createIso({ tileW: 64, tileH: 32 });
  // Tile (5,5) is a block 32 px tall; the rest is flat ground.
  const heightAt = (i, j) => (i === 5 && j === 5 ? 32 : 0);
  // A point on the block's top face, which on flat ground would be tile (4,4).
  const top = iso.toScreen(5.5, 5.5, 32);
  assert.deepEqual(iso.pickTile(top.x, top.y), { x: 4, y: 4 });
  assert.deepEqual(iso.pickTileAt(top.x, top.y, heightAt), { x: 5, y: 5 });
  // Away from the block, it is the ground pick.
  const g = iso.toScreen(2.5, 8.5);
  assert.deepEqual(iso.pickTileAt(g.x, g.y, heightAt), { x: 2, y: 8 });
  // Holes pick nothing.
  assert.equal(iso.pickTileAt(g.x, g.y, () => null), null);
});

test('island-hop AC-2: a footprint sorts by its centre, and the camera can keep its edges inside the bounds and fit them', () => {
  const iso = createIso();
  const house = { depth: iso.depthOf({ x: 4, y: 4, w: 2, h: 2 }, 1) }; // centre (5,5)
  const behind = { depth: iso.depthOf({ x: 4, y: 5 }, 1) }; // centre (4.5,5.5): same row, tie → order
  const front = { depth: iso.depthOf({ x: 6, y: 5 }, 1) };
  assert.ok(front.depth > house.depth);
  assert.ok(iso.depthOf({ x: 3, y: 3 }, 1) < house.depth);
  assert.ok(Math.abs(behind.depth - house.depth) < 1e-9);
  const cam = createCamera({ zoom: 1 });
  cam.resize(400, 800);
  cam.bounds = { minX: 0, minY: 0, maxX: 1000, maxY: 2000 };
  cam.clampEdges = true;
  cam.lookAt({ x: 0, y: 0 });
  assert.deepEqual([cam.x, cam.y], [200, 400]);
  assert.equal(cam.fitZoom({ minX: 0, minY: 0, maxX: 800, maxY: 800 }), 0.5);
});

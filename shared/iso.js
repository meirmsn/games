// Isometric rendering helpers for 2D canvas games: the tile grid, depth sorting, screen↔tile
// picking and a camera that pans and zooms by touch, mouse and wheel. No DOM needed except for
// attachGestures(), so the maths runs (and is tested) in Node.
//
//   import { createIso, createCamera, sortByDepth, attachGestures } from '../shared/iso.js';
//   const iso = createIso({ tileW: 64, tileH: 32 });   // a 2:1 diamond, 64 px wide at zoom 1
//   const cam = createCamera({ zoom: 1, minZoom: 0.5, maxZoom: 3 });
//   cam.resize(canvas.clientWidth, canvas.clientHeight);
//   cam.lookAt(iso.toScreen(tx, ty));                    // centre the view on a tile
//   // each frame:
//   ctx.setTransform(dpr * cam.zoom, 0, 0, dpr * cam.zoom, dpr * (cam.w / 2 - cam.x * cam.zoom), dpr * (cam.h / 2 - cam.y * cam.zoom));
//   const r = cam.tileRange(iso, 1);                     // the tiles in view, plus a margin of 1
//   const items = [];                                    // tiles and sprites, each with a depth
//   ... items.push({ depth: iso.depth(tx, ty), draw }) ...
//   for (const it of sortByDepth(items)) it.draw(ctx);
//   const t = iso.pickTile(...Object.values(cam.toWorld(e.offsetX, e.offsetY)));  // the tile under a tap
//
// Coordinates: a tile (or world) point is (x, y) on the grid, x running down-right and y down-left
// on screen; tile (i, j) covers [i, i+1) × [j, j+1) and its top corner sits at toScreen(i, j).
// "Screen" points are in the unzoomed isometric plane; the camera maps them to view pixels (CSS px).

export function createIso({ tileW = 64, tileH = 32 } = {}) {
  const hw = tileW / 2;
  const hh = tileH / 2;
  return {
    tileW,
    tileH,
    // A grid point (and a height z, in screen px, which lifts it up the screen) to the iso plane.
    toScreen(x, y, z = 0) {
      return { x: (x - y) * hw, y: (x + y) * hh - z };
    },
    // An iso-plane point back to the grid (on the ground, z = 0), fractional.
    toTile(sx, sy) {
      const a = sx / hw;
      const b = sy / hh;
      return { x: (b + a) / 2, y: (b - a) / 2 };
    },
    // The whole tile under an iso-plane point.
    pickTile(sx, sy) {
      const t = this.toTile(sx, sy);
      return { x: Math.floor(t.x), y: Math.floor(t.y) };
    },
    // The tile under an iso-plane point when tiles stand at different heights: heightAt(i, j) is a
    // tile's top in screen px (0 for the ground, or undefined/null for nothing there). Tiles are
    // tried front to back, so a raised tile in front wins over the ground tile behind it.
    pickTileAt(sx, sy, heightAt, maxHeight = 256) {
      const reach = Math.ceil(maxHeight / hh / 2) + 1;
      const base = this.pickTile(sx, sy);
      for (let k = 2 * reach; k >= 0; k--) {
        // Candidates on the diagonal below the ground pick, nearest the viewer first.
        for (const [i, j] of [[base.x + Math.ceil(k / 2), base.y + Math.floor(k / 2)], [base.x + Math.floor(k / 2), base.y + Math.ceil(k / 2)]]) {
          const z = heightAt(i, j);
          if (z === undefined || z === null) continue;
          const t = this.toTile(sx, sy + z);
          if (Math.floor(t.x) === i && Math.floor(t.y) === j) return { x: i, y: j };
        }
      }
      return null;
    },
    // A direction drawn on screen (dx, dy) to the grid direction that looks like it, unit length.
    screenDirToGrid(dx, dy) {
      const a = dx / hw;
      const b = dy / hh;
      const x = (b + a) / 2;
      const y = (b - a) / 2;
      const len = Math.hypot(x, y) || 1;
      return { x: x / len, y: y / len };
    },
    // A grid direction to the screen direction it is drawn as, unit length.
    gridDirToScreen(x, y) {
      const sx = (x - y) * hw;
      const sy = (x + y) * hh;
      const len = Math.hypot(sx, sy) || 1;
      return { x: sx / len, y: sy / len };
    },
    // Sort key: further back (smaller) draws first. Points on the same row x + y tie; the
    // optional layer breaks ties (ground 0, then things standing on it).
    depth(x, y, layer = 0) {
      return x + y + layer * 1e-3;
    },
    // Sort key for something covering a footprint of w × h tiles from (x, y): its centre, so a 2×2
    // building or a long hull sorts against 1×1 things beside it. Draw the flat ground in its own
    // pass first; sort only what stands up.
    depthOf({ x, y, w = 1, h = 1 }, layer = 0) {
      return x + w / 2 + y + h / 2 + layer * 1e-3;
    },
    // Which of n sprite headings (0..n-1, counted clockwise on screen from `first`, in radians,
    // where 0 points right and π/2 down) best shows a grid direction.
    facing(x, y, n = 8, first = 0) {
      const s = this.gridDirToScreen(x, y);
      const ang = Math.atan2(s.y, s.x) - first;
      const step = (Math.PI * 2) / n;
      return ((Math.round(ang / step) % n) + n) % n;
    },
  };
}

// Sort drawables by .depth, back to front. Stable, so equal depths keep their insertion order.
export function sortByDepth(items) {
  return items
    .map((it, i) => [it, i])
    .sort((a, b) => a[0].depth - b[0].depth || a[1] - b[1])
    .map((p) => p[0]);
}

// A camera over the iso plane: (x, y) is the iso-plane point at the centre of the view, zoom the
// scale from iso px to view (CSS) px.
export function createCamera({ x = 0, y = 0, zoom = 1, minZoom = 0.25, maxZoom = 4 } = {}) {
  const cam = {
    x,
    y,
    zoom,
    minZoom,
    maxZoom,
    w: 1,
    h: 1,
    bounds: null, // { minX, minY, maxX, maxY } in the iso plane, or null
    clampEdges: false, // false: keep the view's centre in bounds; true: keep its edges in
    resize(w, h) {
      cam.w = Math.max(1, w);
      cam.h = Math.max(1, h);
      cam.clamp();
    },
    // View px to the iso plane, and back.
    toWorld(vx, vy) {
      return { x: cam.x + (vx - cam.w / 2) / cam.zoom, y: cam.y + (vy - cam.h / 2) / cam.zoom };
    },
    toView(sx, sy) {
      return { x: (sx - cam.x) * cam.zoom + cam.w / 2, y: (sy - cam.y) * cam.zoom + cam.h / 2 };
    },
    lookAt(p) {
      cam.x = p.x;
      cam.y = p.y;
      cam.clamp();
    },
    // Ease toward a point: k is the fraction of the way to go this frame (0..1).
    follow(p, k) {
      cam.x += (p.x - cam.x) * k;
      cam.y += (p.y - cam.y) * k;
      cam.clamp();
    },
    // Drag the view by (dx, dy) view px: the world under the finger moves with it.
    panBy(dx, dy) {
      cam.x -= dx / cam.zoom;
      cam.y -= dy / cam.zoom;
      cam.clamp();
    },
    // Zoom by a factor, keeping the world point under view point (vx, vy) where it is.
    zoomAt(factor, vx = cam.w / 2, vy = cam.h / 2) {
      const before = cam.toWorld(vx, vy);
      cam.zoom = Math.min(cam.maxZoom, Math.max(cam.minZoom, cam.zoom * factor));
      const after = cam.toWorld(vx, vy);
      cam.x += before.x - after.x;
      cam.y += before.y - after.y;
      cam.clamp();
    },
    // Keep the view's centre (or, with clampEdges, its edges) inside the bounds. A view wider than
    // the bounds centres on them.
    clamp() {
      const b = cam.bounds;
      if (!b) return;
      const mx = cam.clampEdges ? cam.w / 2 / cam.zoom : 0;
      const my = cam.clampEdges ? cam.h / 2 / cam.zoom : 0;
      const fit = (v, lo, hi) => (lo > hi ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, v)));
      cam.x = fit(cam.x, b.minX + mx, b.maxX - mx);
      cam.y = fit(cam.y, b.minY + my, b.maxY - my);
    },
    // The zoom at which a box in the iso plane fills the view (for a minZoom that shows it all).
    fitZoom(b, pad = 0) {
      return Math.min((cam.w - 2 * pad) / (b.maxX - b.minX), (cam.h - 2 * pad) / (b.maxY - b.minY));
    },
    // The canvas transform for this view, at a device pixel ratio.
    transform(dpr = 1) {
      const s = dpr * cam.zoom;
      return [s, 0, 0, s, dpr * (cam.w / 2 - cam.x * cam.zoom), dpr * (cam.h / 2 - cam.y * cam.zoom)];
    },
    // The tiles in view (inclusive ranges), widened by `margin` tiles and by `lift` iso px at the
    // bottom for things drawn taller than their tile (trees, masts).
    tileRange(iso, margin = 1, lift = 0) {
      const corners = [
        cam.toWorld(0, 0),
        cam.toWorld(cam.w, 0),
        cam.toWorld(0, cam.h),
        cam.toWorld(cam.w, cam.h),
      ];
      corners[2].y += lift;
      corners[3].y += lift;
      let x0 = Infinity;
      let y0 = Infinity;
      let x1 = -Infinity;
      let y1 = -Infinity;
      for (const c of corners) {
        const t = iso.toTile(c.x, c.y);
        x0 = Math.min(x0, t.x);
        y0 = Math.min(y0, t.y);
        x1 = Math.max(x1, t.x);
        y1 = Math.max(y1, t.y);
      }
      return {
        x0: Math.floor(x0) - margin,
        y0: Math.floor(y0) - margin,
        x1: Math.floor(x1) + margin,
        y1: Math.floor(y1) + margin,
      };
    },
  };
  return cam;
}

// Touch, mouse and wheel gestures on an element, for a camera.
//   - Two or more fingers: pinch to zoom and drag to pan, together; the world stays under the
//     fingers. A second finger cancels the first finger's gesture (onCancel), so a pinch never
//     also steers or taps.
//   - One finger or the left mouse button: pans when `onePointerPans` is true (once it has moved
//     past `tapSlop`, so a tap doesn't jiggle the view); otherwise it is the game's own gesture:
//     onDown(p), onMove(p), onUp(p), with p = { x, y, dx, dy } in view px, (dx, dy) measured from
//     where it went down. A press that moves less than `tapSlop` px and lifts within `tapMs` is a
//     tap: onTap(p). One held still for `longPressMs` is a long press: onLongPress(p), and no tap.
//   - Wheel: zoom at the pointer. Other mouse buttons are ignored.
// Returns detach().
export function attachGestures(
  el,
  camera,
  {
    onePointerPans = false,
    tapSlop = 20,
    tapMs = 350,
    longPressMs = 550,
    onDown,
    onMove,
    onUp,
    onTap,
    onLongPress,
    onCancel,
    onZoom,
  } = {}
) {
  const pts = new Map(); // pointerId -> { x, y, x0, y0 }
  let primary = null; // the pointer the one-finger gesture follows
  let moved = false;
  let downAt = 0;
  let pressTimer = null;
  let pinch = null; // { dist, mx, my }
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

  const local = (e) => {
    const r = el.getBoundingClientRect ? el.getBoundingClientRect() : { left: 0, top: 0 };
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const pinchState = () => {
    const [a, b] = [...pts.values()];
    return { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
  };
  const clearPress = () => {
    if (pressTimer) clearTimeout(pressTimer);
    pressTimer = null;
  };

  function down(e) {
    if (e.pointerType === 'mouse' && e.button !== undefined && e.button !== 0) return;
    const p = local(e);
    pts.set(e.pointerId, { x: p.x, y: p.y, x0: p.x, y0: p.y });
    if (el.setPointerCapture) {
      try {
        el.setPointerCapture(e.pointerId);
      } catch {}
    }
    if (pts.size === 1) {
      primary = e.pointerId;
      moved = false;
      downAt = now();
      if (!onePointerPans && onDown) onDown({ x: p.x, y: p.y, dx: 0, dy: 0 });
      if (onLongPress) {
        pressTimer = setTimeout(() => {
          pressTimer = null;
          const q = pts.get(primary);
          if (q && !moved) {
            moved = true; // no tap after a long press
            onLongPress({ x: q.x, y: q.y, dx: q.x - q.x0, dy: q.y - q.y0 });
          }
        }, longPressMs);
      }
    } else {
      clearPress();
      if (primary !== null && !onePointerPans && onCancel) onCancel();
      primary = null;
      pinch = pinchState();
    }
  }

  function move(e) {
    const q = pts.get(e.pointerId);
    if (!q) return;
    const p = local(e);
    const px = q.x;
    const py = q.y;
    q.x = p.x;
    q.y = p.y;
    if (pts.size >= 2 && pinch) {
      const s = pinchState();
      // The world point under the old midpoint ends up under the new one, scaled by the spread.
      camera.zoomAt(s.dist / pinch.dist, pinch.mx, pinch.my);
      camera.panBy(s.mx - pinch.mx, s.my - pinch.my);
      pinch = s;
      if (onZoom) onZoom(camera.zoom);
      return;
    }
    if (e.pointerId !== primary) return;
    const dx = p.x - q.x0;
    const dy = p.y - q.y0;
    if (!moved && Math.hypot(dx, dy) > tapSlop) {
      moved = true;
      clearPress();
      if (onePointerPans) {
        camera.panBy(dx, dy); // catch up the slop, so the world stays under the finger
        return;
      }
    }
    if (onePointerPans) {
      if (moved) camera.panBy(p.x - px, p.y - py);
    } else if (onMove) onMove({ x: p.x, y: p.y, dx, dy });
  }

  function up(e) {
    const q = pts.get(e.pointerId);
    if (!q) return;
    pts.delete(e.pointerId);
    if (e.pointerId === primary) {
      clearPress();
      const p = { x: q.x, y: q.y, dx: q.x - q.x0, dy: q.y - q.y0 };
      primary = null;
      if (e.type === 'pointercancel') {
        if (!onePointerPans && onCancel) onCancel();
      } else {
        if (!onePointerPans && onUp) onUp(p);
        if (!moved && onTap && now() - downAt <= tapMs) onTap(p);
      }
    }
    if (pts.size >= 2) pinch = pinchState(); // a third finger lifted: carry on from the two left
    else pinch = null;
    if (pts.size === 1 && onePointerPans && primary === null) {
      // After a pinch, the finger left on the glass pans on from where it is.
      const [id, r] = [...pts.entries()][0];
      primary = id;
      moved = true;
      r.x0 = r.x;
      r.y0 = r.y;
    }
  }

  function wheel(e) {
    e.preventDefault();
    const p = local(e);
    camera.zoomAt(Math.exp(-e.deltaY * 0.0015), p.x, p.y);
    if (onZoom) onZoom(camera.zoom);
  }

  el.addEventListener('pointerdown', down);
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
  el.addEventListener('wheel', wheel, { passive: false });
  return () => {
    clearPress();
    el.removeEventListener('pointerdown', down);
    el.removeEventListener('pointermove', move);
    el.removeEventListener('pointerup', up);
    el.removeEventListener('pointercancel', up);
    el.removeEventListener('wheel', wheel);
  };
}

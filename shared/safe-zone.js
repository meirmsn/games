// Shared gesture-safe zone for every game (specs/edge-gestures.md).
//
// A phone claims gestures that *start* at its edges: on an iPhone, Reachability (a short swipe down
// on the bottom edge), home and the app switcher (up from, or along, the home indicator), back (from
// the left edge) and Notification and Control Center (down from the top). A web page can't block any
// of them, so a game never lets a drag or swipe begin there. Taps near the edges are fine.
//
// The safe rectangle is the viewport minus env(safe-area-inset-*), minus MARGIN on three sides.
// Apple publishes the insets but no width for any gesture zone; the margins are the owner's plan's
// (2026-11-10), and the spec says where each comes from:
//   bottom 40 px above the inset (34 pt in portrait, 21 in landscape on Face ID iPhones; the home
//     indicator sits inside it), about one finger's width;
//   left 20 px past the inset (0 in portrait, 47-62 pt on the notch side in landscape), the edge
//     pan's commonly measured width;
//   top 24 px below the inset (the status bar: 47 pt notched, 59-62 pt Dynamic Island);
//   right: the inset only, as iOS has no right-edge gesture in a home-screen app.
// A mouse is never an edge start: a desktop has no system edge gestures.
//
//   import { isEdgeStart, ignoreEdgeStarts } from '../shared/safe-zone.js';
//   canvas.addEventListener('pointerdown', (e) => { if (isEdgeStart(e)) return; ... });
//   ignoreEdgeStarts(pad);           // pointerdown and touchstart from the edges never reach pad
//   safeRect();                      // { left, top, right, bottom } in CSS px, for layout
//   isEdgeStart(e, safeRect(window, SIDES_ONLY)); // left and top strips only, for a slow slide

export const MARGIN = Object.freeze({ top: 24, right: 0, bottom: 40, left: 20 });

// The safe-area insets now, in CSS px, read through a probe styled with env().
export function readInsets(doc = globalThis.document) {
  if (!doc || !doc.body) return { top: 0, right: 0, bottom: 0, left: 0 };
  const probe = doc.createElement('div');
  probe.style.cssText =
    'position:fixed;top:env(safe-area-inset-top,0px);right:env(safe-area-inset-right,0px);' +
    'bottom:env(safe-area-inset-bottom,0px);left:env(safe-area-inset-left,0px);' +
    'pointer-events:none;visibility:hidden';
  doc.body.appendChild(probe);
  const r = probe.getBoundingClientRect();
  const win = doc.defaultView;
  const w = win.innerWidth;
  const h = win.innerHeight;
  probe.remove();
  return { top: r.top, right: w - r.right, bottom: h - r.bottom, left: r.left };
}

// The gesture-safe rectangle for a viewport and its insets (pure, for tests and layout).
export function rectFor(width, height, insets = {}, margin = MARGIN) {
  const i = { top: 0, right: 0, bottom: 0, left: 0, ...insets };
  return {
    left: i.left + margin.left,
    top: i.top + margin.top,
    right: width - i.right - margin.right,
    bottom: height - i.bottom - margin.bottom,
  };
}

// The gesture-safe rectangle of this window now. A control that only takes presses, holds or slow
// slides may sit in the bottom strip (the owner's rule, specs/edge-gestures.md): pass SIDES_ONLY.
export function safeRect(win = globalThis.window, margin = MARGIN) {
  return rectFor(win.innerWidth, win.innerHeight, readInsets(win.document), margin);
}
export const SIDES_ONLY = Object.freeze({ ...MARGIN, bottom: -Infinity });

export const inside = (rect, x, y) => x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;

// The point a pointerdown or touchstart begins at, and whether it is a mouse.
function startOf(e) {
  if (e.changedTouches && e.changedTouches.length) {
    const t = e.changedTouches[0];
    return { x: t.clientX, y: t.clientY, mouse: false };
  }
  return { x: e.clientX, y: e.clientY, mouse: e.pointerType === 'mouse' };
}

// Whether an event starts a gesture in a system edge zone: a touch or pen outside the safe rectangle.
export function isEdgeStart(e, rect) {
  const s = startOf(e);
  if (s.mouse) return false;
  return !inside(rect || safeRect(), s.x, s.y);
}

// Ignore pointer and touch starts outside the safe rectangle on `el`: they are stopped on the
// capture phase, before the element's own handlers. Returns a function that removes the guard.
export function ignoreEdgeStarts(el) {
  const guard = (e) => {
    if (!isEdgeStart(e)) return;
    e.stopImmediatePropagation();
    e.stopPropagation();
  };
  el.addEventListener('pointerdown', guard, { capture: true });
  el.addEventListener('touchstart', guard, { capture: true, passive: true });
  return () => {
    el.removeEventListener('pointerdown', guard, { capture: true });
    el.removeEventListener('touchstart', guard, { capture: true });
  };
}

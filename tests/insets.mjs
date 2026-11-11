// Test helpers for specs/edge-gestures.md: simulate an iPhone's safe-area insets over the DevTools
// protocol, and drive real touches (CDP touch events, so the page sees pointerType 'touch').
export const PORTRAIT_INSETS = { top: 47, bottom: 34, left: 0, right: 0 };
export const LANDSCAPE_INSETS = { top: 0, bottom: 21, left: 47, right: 47 };
// The gesture strips' depth past each inset (shared/safe-zone.js's MARGIN).
export const STRIP = { top: 24, bottom: 40, left: 20 };

// Set the insets on an open page, reload it so it lays out with them, and wait for `ready`.
export async function simulateInsets(context, page, insets, ready) {
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets });
  await page.reload();
  if (ready) await page.waitForFunction(ready);
  return cdp;
}

// One finger: down at (x, y), moved by (dx, dy) in `n` steps, then lifted unless `lift` is false.
export async function touchDrag(cdp, x, y, dx, dy, { n = 8, lift = true, id = 1 } = {}) {
  const send = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points });
  await send('touchStart', [{ x, y, id }]);
  for (let i = 1; i <= n; i++) await send('touchMove', [{ x: x + (dx * i) / n, y: y + (dy * i) / n, id }]);
  if (lift) await send('touchEnd', []);
}

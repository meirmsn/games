// The service worker as it shipped before specs/pwa-updates.md (v5), for the upgrade test.
// Service worker: the site works offline once loaded.
//
// The landing page's files are cached on install. Everything else (each game's files) is cached
// the first time it loads, so a game played once keeps working offline. Pages are fetched fresh
// when online, falling back to the cache; other files come from the cache and refresh behind it.
// Changed files reach returning visitors on their own: pages on the next load, other files on the
// load after (they refresh in the background). Bump VERSION when SHELL itself changes (a file added,
// removed or renamed) so the new list is cached and the old cache is cleared.

const VERSION = 'v5';
const CACHE = `games-${VERSION}`;
const SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'assets/base.css',
  'assets/site.css',
  'assets/theme.js',
  'assets/site.js',
  'shared/sound.js',
  'shared/game-shell.js',
  'shared/game-shell.css',
  'assets/sounds/back.mp3',
  'assets/sounds/tap.mp3',
  'assets/sounds/soon.mp3',
  'assets/sounds/toggle.mp3',
  'assets/icons/favicon.png',
  'assets/icons/icon-192.png',
  'assets/tiles/reef.png',
  'assets/tiles/googly-faces.png',
  'assets/tiles/walk-on-red.png',
  'assets/tiles/pixel-leap.png',
  'assets/tiles/splat-gallery.png',
  'assets/tiles/island-hop.png', // high-seas.png when v5 shipped; Island Hop's tile took its place
  'assets/tiles/runes.png',
  'assets/tiles/orbit.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k.startsWith('games-') && k !== CACHE).map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    // Pages: network first, so a new game shows up as soon as it ships.
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.status === 200) {
            const copy = res.clone();
            caches
              .open(CACHE)
              .then((c) => c.put(req, copy))
              .catch(() => {});
          }
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || caches.match('./')))
    );
    return;
  }

  // Files: cache first, refreshed in the background.
  event.respondWith(
    caches.match(req).then((hit) => {
      const fresh = fetch(req)
        .then((res) => {
          if (res.status === 200) {
            const copy = res.clone();
            caches
              .open(CACHE)
              .then((c) => c.put(req, copy))
              .catch(() => {});
          }
          return res;
        })
        .catch(() => hit);
      return hit || fresh;
    })
  );
});

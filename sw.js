// Service worker: the site works offline once loaded.
//
// The landing page's files are cached on install. Everything else (each game's files) is cached
// the first time it loads, so a game played once keeps working offline. Pages are fetched fresh
// when online, falling back to the cache; other files come from the cache and refresh behind it.
// Bump VERSION whenever a file in SHELL changes, so returning visitors pick up the new one.

const VERSION = 'v1';
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
  'assets/tiles/googly-faces.png',
  'assets/tiles/pixel-leap.png',
  'assets/tiles/shooting-gallery.png',
  'assets/tiles/high-seas.png',
  'assets/tiles/marble-machine.png',
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
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
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
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => hit);
      return hit || fresh;
    })
  );
});

// Service worker: the site works offline once loaded, and updates without cutting a game short.
//
// Caches (specs/pwa-updates.md):
//   games-shell-<VERSION>  the landing page's files (SHELL), cached on install; the only cache a
//                          VERSION bump replaces.
//   games-game-<folder>    each game's files (its top-level folder), cached the first time it's
//                          played and refreshed in place, so one game's update never empties another.
//   games-site             anything else (e.g. assets/previews/), refreshed in place.
//
// Pages, scripts, styles and data are network-first (the cache is the offline fallback), so a page
// and the scripts it loads always come from the same version. Images, sounds and fonts are
// cache-first and refresh in the background, so games stay light and play offline.
//
// Updates (specs/pwa-updates.md): a new worker waits; the landing page shows "New version available"
// when its own files changed on the server or a new worker waits, and its Update button tells the
// worker to take over and reloads. Game pages never reload for it; they get the new version the next
// time they're opened. Bump VERSION when SHELL changes (a file added, removed or renamed), so the new
// list is precached; only the shell cache is replaced, never a game's.

const VERSION = 'v8';
const PREFIX = 'games-';
const SHELL_CACHE = `${PREFIX}shell-${VERSION}`;
const SITE_CACHE = `${PREFIX}site`;
const LEGACY = /^games-v\d+$/; // the single cache of the workers before the split (v5, v6)
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
  'shared/safe-zone.js',
  'assets/sounds/back.mp3',
  'assets/sounds/tap.mp3',
  'assets/sounds/soon.mp3',
  'assets/sounds/toggle.mp3',
  'assets/icons/favicon.png',
  'assets/icons/icon-192.png',
  'assets/tiles/reef.png',
  'assets/tiles/googly-faces.png',
  'assets/tiles/walk-on-red.png',
  'assets/tiles/crumble.png',
  'assets/tiles/pixel-leap.png',
  'assets/tiles/splat-gallery.png',
  'assets/tiles/high-seas.png',
  'assets/tiles/runes.png',
  'assets/tiles/orbit.png',
];

const SCOPE = new URL('./', self.location.href);
const SHELL_URLS = new Set(SHELL.map((p) => new URL(p, SCOPE).href));
const MEDIA = /\.(png|jpe?g|gif|webp|avif|svg|ico|mp3|ogg|wav|m4a|aac|woff2?|ttf|otf)$/i;

// The cache a URL belongs in.
function cacheFor(url) {
  const u = new URL(url);
  u.hash = '';
  u.search = '';
  if (SHELL_URLS.has(u.href)) return SHELL_CACHE;
  const rest = u.href.startsWith(SCOPE.href) ? u.href.slice(SCOPE.href.length) : '';
  const slash = rest.indexOf('/');
  const folder = slash > 0 ? rest.slice(0, slash) : '';
  if (folder && folder !== 'assets' && folder !== 'shared') return `${PREFIX}game-${folder}`;
  return SITE_CACHE;
}

// Store a full (200) response in its own cache; never a partial or failed one.
function keep(req, res) {
  if (res.status !== 200 || res.type === 'opaque') return Promise.resolve();
  const copy = res.clone();
  return caches
    .open(cacheFor(req.url))
    .then((c) => c.put(req, copy))
    .catch(() => {});
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      await cache.addAll(SHELL.map((p) => new Request(p, { cache: 'no-cache' })));
      // The first upgrade from a worker before the split is silent, as those workers' updates were: their
      // landing page has no Update button to wait for. Every later update waits for it.
      if ((await caches.keys()).some((k) => LEGACY.test(k))) await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) {
        if (name.startsWith(`${PREFIX}shell-`) && name !== SHELL_CACHE) await caches.delete(name);
        if (LEGACY.test(name) && (await moveLegacy(name))) await caches.delete(name);
      }
      await self.clients.claim();
    })()
  );
});

// Copy a pre-split cache's played games into their own caches. True once every copy succeeded; until
// then the old cache stays, and the next activation tries again.
async function moveLegacy(name) {
  try {
    const old = await caches.open(name);
    for (const req of await old.keys()) {
      const target = cacheFor(req.url);
      if (target === SHELL_CACHE) continue; // precached fresh at install
      const res = await old.match(req);
      if (res) await (await caches.open(target)).put(req, res);
    }
    return true;
  } catch {
    return false;
  }
}

self.addEventListener('message', (event) => {
  const msg = event.data || {};
  // The landing page's Update button.
  if (msg.type === 'update') self.skipWaiting();
  // A game opened straight from a link: store what it has already loaded, each in its own cache.
  if (msg.type === 'keep' && Array.isArray(msg.urls)) {
    event.waitUntil(
      Promise.all(
        msg.urls
          .filter((u) => new URL(u).origin === self.location.origin)
          .map((u) =>
            fetch(u)
              .then((res) => keep(new Request(u), res))
              .catch(() => {})
          )
      )
    );
  }
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || req.headers.has('range')) return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    // Pages: network first, falling back to the cached page, then to the landing page.
    event.respondWith(
      fetch(req)
        .then((res) => {
          event.waitUntil(keep(req, res));
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || caches.match('./')))
    );
    return;
  }

  if (!MEDIA.test(url.pathname)) {
    // Scripts, styles, data: network first (revalidating any HTTP-cached copy), so they always
    // match the page; the cache when offline.
    event.respondWith(
      fetch(req, { cache: 'no-cache' })
        .then((res) => {
          event.waitUntil(keep(req, res));
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || Response.error()))
    );
    return;
  }

  // Images, sounds, fonts: cache first, refreshed in the background.
  event.respondWith(
    caches.match(req).then((hit) => {
      const fresh = fetch(req)
        .then((res) => {
          event.waitUntil(keep(req, res));
          return res;
        })
        .catch(() => hit || Response.error());
      if (hit) event.waitUntil(fresh.catch(() => {}));
      return hit || fresh;
    })
  );
});

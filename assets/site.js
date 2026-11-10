// Landing page behaviour: sounds, the sound toggle, coming-soon feedback, install, offline.
import { createSound } from '../shared/sound.js';

const sound = createSound({
  tap: 'assets/sounds/tap.mp3',
  soon: 'assets/sounds/soon.mp3',
  toggle: 'assets/sounds/toggle.mp3',
});

// ---- Sound toggle ----
const soundBtn = document.querySelector('[data-sound-toggle]');
function showSound(muted) {
  soundBtn.setAttribute('aria-pressed', String(muted));
  const label = muted ? 'Sound off' : 'Sound on';
  soundBtn.setAttribute('aria-label', `${label} (${muted ? 'unmute' : 'mute'})`);
  soundBtn.setAttribute('title', label);
}
showSound(sound.muted);
sound.onchange = showSound;
soundBtn.addEventListener('click', () => {
  sound.muted = !sound.muted;
  sound.play('toggle');
});

document.querySelector('[data-theme-toggle]').addEventListener('click', () => {
  sound.play('toggle');
});

// ---- Tiles ----
// A playable tile plays its sound, then opens the game a moment later so the sound is heard.
for (const tile of document.querySelectorAll('a.tile')) {
  tile.addEventListener('click', (e) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    sound.play('tap');
    setTimeout(() => {
      window.location.href = tile.href;
    }, 90);
  });
}

// A coming-soon tile can't open; it answers with a soft sound and a small nudge.
for (const tile of document.querySelectorAll('.tile.is-soon')) {
  tile.addEventListener('click', () => {
    sound.play('soon', { rate: 0.94 + Math.random() * 0.12 });
    tile.classList.remove('nudge');
    void tile.offsetWidth; // restart the animation
    tile.classList.add('nudge');
  });
}

// ---- Install (Chrome, Edge and Android; Safari installs from the Share menu) ----
const installBtn = document.querySelector('[data-install]');
let deferred = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferred = e;
  installBtn.hidden = false;
});
installBtn.addEventListener('click', async () => {
  if (!deferred) return;
  installBtn.disabled = true;
  deferred.prompt();
  await deferred.userChoice.catch(() => null);
  deferred = null;
  installBtn.hidden = true;
  installBtn.disabled = false;
});
window.addEventListener('appinstalled', () => {
  installBtn.hidden = true;
});

// ---- Offline, and updates (specs/pwa-updates.md) ----
// "New version available" shows when this page is out of date: its own files on the server differ
// from the ones it's showing, or a new service worker is waiting. Checked when the page comes back on
// screen (and at load, for a waiting worker), so an installed app that resumes finds updates too.
// Update reloads only this page, so a game in another tab is never cut short.
const notice = document.querySelector('[data-update]');
const updateBtn = notice.querySelector('button');
const OWN_FILES = ['./', 'assets/site.js', 'assets/site.css', 'assets/base.css'];
let reg = null;
let stale = false;
let updating = false;

const workerWaiting = () => !!reg?.waiting && !!navigator.serviceWorker.controller;
function showUpdate() {
  const show = stale || workerWaiting();
  notice.hidden = !show;
  document.body.classList.toggle('has-update', show);
}

// The page's own files as the server has them now (fetched fresh; the cache when offline).
function ownFiles() {
  return Promise.all(
    OWN_FILES.map((f) =>
      fetch(f, { cache: 'no-cache' }).then((r) => (r.ok ? r.text() : Promise.reject(new Error(f))))
    )
  ).then((texts) => texts.join('\u0000'));
}
// What this page loaded with: fetched right after load, when the page and the server agree.
const loadedWith = ownFiles().catch(() => null);

async function check() {
  reg?.update().catch(() => {});
  const [then, now] = await Promise.all([loadedWith, ownFiles().catch(() => null)]);
  if (then && now && then !== now) stale = true;
  showUpdate();
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') check();
});

updateBtn.addEventListener('click', () => {
  sound.play('tap');
  if (!reg?.waiting) return window.location.reload();
  updating = true;
  updateBtn.disabled = true;
  reg.waiting.postMessage({ type: 'update' });
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (updating) {
      updating = false;
      window.location.reload();
    } else {
      showUpdate(); // another tab applied it
    }
  });
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('sw.js')
      .then((r) => {
        reg = r;
        showUpdate();
        // A first visit has no worker in charge yet: what installs then is no update.
        r.addEventListener('updatefound', () => r.installing?.addEventListener('statechange', showUpdate));
      })
      .catch(() => {});
  });
}

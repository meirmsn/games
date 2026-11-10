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
// A new version waits until the player taps Update here; only this page ever reloads for it, so a
// game in another tab is never cut short. Checked at load and each time the page is shown again,
// so an installed app that resumes finds updates too.
const notice = document.querySelector('[data-update]');
const updateBtn = notice.querySelector('button');
let updating = false;

function showUpdate(show) {
  notice.hidden = !show;
  document.body.classList.toggle('has-update', show);
}

function watch(reg) {
  // A first visit has no worker in charge yet: what installs now is the first version, not an update.
  const isUpdate = () => !!reg.waiting && !!navigator.serviceWorker.controller;
  showUpdate(isUpdate());
  reg.addEventListener('updatefound', () => {
    const next = reg.installing;
    next?.addEventListener('statechange', () => showUpdate(isUpdate()));
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') reg.update().catch(() => {});
  });
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (updating) {
      updating = false;
      window.location.reload();
    } else {
      showUpdate(isUpdate()); // another tab applied it
    }
  });
  updateBtn.addEventListener('click', () => {
    sound.play('tap');
    if (!reg.waiting) return window.location.reload();
    updating = true;
    updateBtn.disabled = true;
    reg.waiting.postMessage({ type: 'update' });
  });
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').then(watch).catch(() => {});
  });
}

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

// ---- Offline ----
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}

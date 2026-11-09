// Shared frame for every game: a back button to the landing page, and the shared sound setup.
//
// A game lives at <site>/<slug>/index.html and loads, from its <head>:
//   <link rel="stylesheet" href="../shared/game-shell.css" />
//   <script type="module">
//     import { mountShell } from '../shared/game-shell.js';
//     const { sound } = mountShell({ sounds: { pop: 'sounds/pop.mp3' } });
//     sound.play('pop');
//   </script>
//
// The back button sits in the top-left corner, clear of the notch, and plays a short sound before
// going back. The game draws everywhere else. Escape also goes back on desktop, except while a text
// field or an open dialog has focus, or when the game calls event.preventDefault() on that keydown.
// Before leaving, the shell asks "Leave the game?" (Stay / Leave), because leaving loses the game's
// progress. A game with nothing to lose at the moment says so with hasProgress: () => false, given
// to mountShell or set on what it returns; without one, the shell always asks.
import { createSound } from './sound.js';

const BACK_SOUND = new URL('../assets/sounds/back.mp3', import.meta.url).href;
const HOME = new URL('../', import.meta.url).href;
const SERVICE_WORKER = new URL('../sw.js', import.meta.url).href;

// A game opened straight from a link, without the landing page, has no service worker yet. It
// registers it, then caches the files this page has already loaded, so the game works offline
// after this one visit. (Opened from the landing page, the service worker caches them as they load.)
function keepForOffline() {
  if (!('serviceWorker' in navigator) || !window.caches || navigator.serviceWorker.controller) return;
  navigator.serviceWorker
    .register(SERVICE_WORKER)
    .then(() => navigator.serviceWorker.ready)
    .then(async () => {
      const name = (await caches.keys()).find((k) => k.startsWith('games-'));
      if (!name) return;
      const cache = await caches.open(name);
      const urls = [location.href.split('#')[0]];
      for (const entry of performance.getEntriesByType('resource')) urls.push(entry.name);
      const mine = new Set(urls.filter((u) => new URL(u).origin === location.origin));
      await Promise.all([...mine].map((u) => cache.add(u).catch(() => {})));
    })
    .catch(() => {});
}

export function mountShell({ sounds = {}, home = HOME, hasProgress = null } = {}) {
  const sound = createSound({ back: BACK_SOUND, ...sounds });
  const shell = { sound, back: null, hasProgress };

  const back = document.createElement('a');
  back.className = 'shell-back';
  back.href = home;
  back.setAttribute('aria-label', 'Back to all games');
  back.innerHTML =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>';

  // "Leave the game?": Stay (the default, and what Escape does) or Leave.
  const ask = document.createElement('dialog');
  ask.className = 'shell-leave';
  ask.setAttribute('aria-labelledby', 'shell-leave-title');
  ask.innerHTML =
    '<p class="shell-leave-title" id="shell-leave-title">Leave the game?</p>' +
    '<p class="shell-leave-text">You’ll lose your progress in this game.</p>' +
    '<div class="shell-leave-actions">' +
    '<button type="button" class="shell-leave-stay" data-shell-stay autofocus>Stay</button>' +
    '<button type="button" class="shell-leave-go" data-shell-leave>Leave</button>' +
    '</div>';
  ask.querySelector('[data-shell-stay]').addEventListener('click', () => ask.close());
  ask.querySelector('[data-shell-leave]').addEventListener('click', () => leave());
  ask.addEventListener('click', (e) => {
    if (e.target === ask) ask.close(); // a tap outside the box stays
  });

  let leaving = false;
  function leave() {
    if (leaving) return; // a held key or a double tap leaves once
    leaving = true;
    sound.play('back');
    setTimeout(() => {
      window.location.href = home;
    }, 90);
  }
  function goBack(e) {
    if (e) e.preventDefault();
    if (leaving || ask.open) return;
    const progress = typeof shell.hasProgress === 'function' ? shell.hasProgress() : true;
    if (!progress) {
      leave();
      return;
    }
    if (typeof ask.showModal === 'function') ask.showModal();
    else if (window.confirm('Leave the game? You’ll lose your progress in this game.')) leave();
  }
  back.addEventListener('click', (e) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    goBack(e);
  });
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || e.repeat || e.defaultPrevented) return;
    // Escape belongs to whatever has focus when that's a text field or an open dialog.
    const t = e.target;
    if (t instanceof Element && t.closest('input, textarea, select, [contenteditable], dialog[open]')) return;
    if (document.querySelector('dialog[open]')) return;
    goBack(e);
  });

  document.body.appendChild(back);
  document.body.appendChild(ask);
  shell.back = back;
  if (document.readyState === 'complete') keepForOffline();
  else window.addEventListener('load', keepForOffline, { once: true });
  return shell;
}

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
import { createSound } from './sound.js';

const BACK_SOUND = new URL('../assets/sounds/back.mp3', import.meta.url).href;
const HOME = new URL('../', import.meta.url).href;

export function mountShell({ sounds = {}, home = HOME } = {}) {
  const sound = createSound({ back: BACK_SOUND, ...sounds });

  const back = document.createElement('a');
  back.className = 'shell-back';
  back.href = home;
  back.setAttribute('aria-label', 'Back to all games');
  back.innerHTML =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>';

  let leaving = false;
  function goBack(e) {
    if (e) e.preventDefault();
    if (leaving) return; // a held key or a double tap leaves once
    leaving = true;
    sound.play('back');
    setTimeout(() => {
      window.location.href = home;
    }, 90);
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
  return { sound, back };
}

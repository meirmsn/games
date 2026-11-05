// Shared sound for the site and every game.
//
// Phone browsers keep audio locked until the first tap, so the context is created and resumed on
// the first pointer or key press; sounds are decoded ahead of time and play with no delay.
// Mute is one setting for the whole site, kept in this browser (localStorage 'sound' = 'off').
//
//   import { createSound } from '../shared/sound.js';
//   const sound = createSound({ tap: 'assets/sounds/tap.mp3' });
//   sound.play('tap');
//   sound.muted = true;              // also saved for the next visit
//   sound.onchange = (muted) => {};  // called when mute changes

const KEY = 'sound';

function readMuted() {
  try {
    return window.localStorage.getItem(KEY) === 'off';
  } catch (e) {
    return false;
  }
}

function saveMuted(muted) {
  try {
    if (muted) window.localStorage.setItem(KEY, 'off');
    else window.localStorage.removeItem(KEY);
  } catch (e) {
    // Blocked storage: the setting lasts until the page reloads.
  }
}

export function createSound(files, { volume = 0.6 } = {}) {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  let ctx = null;
  let gain = null;
  const buffers = new Map();
  const raw = new Map();
  let muted = readMuted();

  // Fetch the files now (cheap, and cached by the service worker); decode once a context exists.
  for (const [name, url] of Object.entries(files)) {
    raw.set(
      name,
      fetch(url)
        .then((r) => (r.ok ? r.arrayBuffer() : null))
        .catch(() => null)
    );
  }

  function decodeAll() {
    for (const [name, pending] of raw) {
      pending.then((data) => {
        if (!data || !ctx) return;
        ctx.decodeAudioData(
          data.slice(0),
          (buf) => buffers.set(name, buf),
          () => {}
        );
      });
    }
  }

  function unlock() {
    if (!Ctx) return;
    if (!ctx) {
      ctx = new Ctx();
      gain = ctx.createGain();
      gain.gain.value = volume;
      gain.connect(ctx.destination);
      decodeAll();
    }
    if (ctx.state === 'suspended') ctx.resume();
  }

  const opts = { capture: true, passive: true };
  window.addEventListener('pointerdown', unlock, opts);
  window.addEventListener('keydown', unlock, opts);

  const api = {
    onchange: null,
    get muted() {
      return muted;
    },
    set muted(value) {
      muted = Boolean(value);
      saveMuted(muted);
      if (typeof api.onchange === 'function') api.onchange(muted);
    },
    // Play a named sound; rate varies the pitch a little so repeats don't sound mechanical.
    play(name, { rate = 1, gain: level = 1 } = {}) {
      if (muted || !ctx) return;
      const buf = buffers.get(name);
      if (!buf) return;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = rate;
      if (level === 1) {
        src.connect(gain);
      } else {
        const g = ctx.createGain();
        g.gain.value = level;
        src.connect(g).connect(gain);
      }
      src.start();
    },
    unlock,
  };
  return api;
}

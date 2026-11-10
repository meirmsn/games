// Shared sound for the site and every game.
//
// Phone browsers keep audio locked until the first tap. Sounds are decoded as soon as the page
// loads, and the first pointer or key press unlocks audio, so even that first tap's sound plays.
// Mute is one setting for the whole site, kept in this browser (localStorage 'sound' = 'off').
//
//   import { createSound } from '../shared/sound.js';
//   const sound = createSound({ tap: 'assets/sounds/tap.mp3' });
//   sound.play('tap');
//   sound.muted = true;              // also saved for the next visit
//   sound.onchange = (muted) => {};  // called when mute changes
//   const stop = sound.loop('music', { gain: 0.4 });  // loops until stop(); mute silences it
//   stop.setRate(1.2);               // the loop plays faster (and higher) from now on

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
  const buffers = new Map();
  let muted = readMuted();

  // The context is made now, while still locked, so every sound is decoded before the first tap;
  // the first tap only has to resume it, and that tap's own sound plays.
  const ctx = Ctx ? new Ctx() : null;
  let gain = null;
  let loopGain = null; // loops (music) go through here, so mute can silence them without stopping
  if (ctx) {
    gain = ctx.createGain();
    gain.gain.value = volume;
    gain.connect(ctx.destination);
    loopGain = ctx.createGain();
    loopGain.gain.value = muted ? 0 : 1;
    loopGain.connect(gain);
    for (const [name, url] of Object.entries(files)) {
      fetch(url)
        .then((r) => (r.ok ? r.arrayBuffer() : null))
        .then((data) => {
          if (!data) return;
          ctx.decodeAudioData(
            data,
            (buf) => buffers.set(name, buf),
            () => {}
          );
        })
        .catch(() => {});
    }
  }

  function unlock() {
    if (ctx && ctx.state === 'suspended') ctx.resume();
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
      if (loopGain) loopGain.gain.value = muted ? 0 : 1;
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
    // Loop a named sound (music, ambience) from when it has loaded until the returned stop() is
    // called. It keeps running while muted, silently, so unmuting picks it up where it is.
    loop(name, { gain: level = 1 } = {}) {
      if (!ctx) {
        const none = () => {};
        none.setRate = () => {};
        return none;
      }
      let src = null;
      let stopped = false;
      let rate = 1;
      const start = () => {
        if (stopped) return;
        const buf = buffers.get(name);
        if (!buf) {
          setTimeout(start, 250);
          return;
        }
        src = ctx.createBufferSource();
        src.buffer = buf;
        src.loop = true;
        src.playbackRate.value = rate;
        const g = ctx.createGain();
        g.gain.value = level;
        src.connect(g).connect(loopGain);
        src.start();
      };
      start();
      const stop = () => {
        stopped = true;
        if (src) src.stop();
      };
      // Speed the loop up or down while it plays: 1 is as recorded.
      stop.setRate = (r) => {
        rate = r;
        if (src) src.playbackRate.value = r;
      };
      return stop;
    },
    // Pause all sound while the page is hidden; the next tap or unlock() resumes it.
    suspend() {
      if (ctx && ctx.state === 'running') ctx.suspend();
    },
    unlock,
  };
  return api;
}

// Landing page behaviour: sounds, the sound toggle, coming-soon feedback, install, the
// add-to-home-screen ribbon, offline and updates.
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
// One install function for the header's Install button and the ribbon dialog's: once the browser's
// prompt is used, both go (specs/landing-home-and-ribbon.md).
const installBtns = document.querySelectorAll('[data-install], [data-install-here]');
let deferred = null;
function showInstall() {
  for (const b of installBtns) b.hidden = !deferred;
}
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferred = e;
  showInstall();
  ribbon.refresh();
});
async function install() {
  if (!deferred) return;
  const prompt = deferred;
  deferred = null; // a prompt can be used once
  for (const b of installBtns) b.disabled = true;
  prompt.prompt();
  const choice = await prompt.userChoice.catch(() => null);
  for (const b of installBtns) b.disabled = false;
  showInstall();
  if (choice?.outcome === 'accepted') ribbon.installed();
  else ribbon.refresh();
}
for (const b of installBtns) b.addEventListener('click', install);
window.addEventListener('appinstalled', () => {
  deferred = null;
  showInstall();
  ribbon.installed();
});

// ---- The add-to-home-screen ribbon (specs/landing-home-and-ribbon.md) ----
// A quiet band across the bottom-right corner, from a person's second visit or after they've tapped a
// game, every time after; never in the installed app or while the Update notice shows, and not for
// the rest of a visit in which the site was installed. Visits and taps are kept in localStorage; if
// that can't be read or written, the ribbon never shows. Appearing on a page that's already showing,
// the band slides in from its corner.

// Which advice fits this device, from the browser's signals.
export function adviceFor({ installable, ua, platform, touchPoints, coarse }) {
  if (installable) return 'install';
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && touchPoints > 1)) return 'ios';
  if (coarse) return 'touch';
  if (/Safari\//.test(ua) && !/Chrome|Chromium|CriOS|Edg|OPR|Firefox|FxiOS/.test(ua)) return 'safari';
  return /Mac/.test(platform || ua) ? 'mac' : 'ctrl';
}

const ribbon = (() => {
  const KEY = 'ribbon'; // { visits, tapped }; older keys (until, paused, off) are ignored
  const el = document.querySelector('[data-ribbon]');
  const band = el.querySelector('button');
  const dialog = document.querySelector('[data-add-dialog]');
  const coarse = matchMedia('(pointer: coarse)');
  const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

  // The stored state, or null when storage can't be used (then nothing is shown, ever).
  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY) || '{}');
      return s && typeof s === 'object' ? s : {};
    } catch {
      return null;
    }
  }
  function save(s) {
    try {
      localStorage.setItem(KEY, JSON.stringify(s));
      return true;
    } catch {
      return false;
    }
  }
  function update(change) {
    const s = load();
    if (s) save({ ...s, ...change });
  }

  // This page load is a visit; counted only if storage takes it.
  let usable = false;
  const s = load();
  if (s) usable = save({ ...s, visits: (Number(s.visits) || 0) + 1 });

  let installedNow = false; // installed during this visit
  let loaded = false; // past the first look at page load: from then on, appearing slides
  const words = () => (coarse.matches ? 'Add to home screen' : 'Bookmark this site');
  function wanted() {
    const s = usable && load();
    if (!s || standalone() || installedNow) return false;
    return s.visits >= 2 || !!s.tapped;
  }
  function refresh() {
    const notice = document.querySelector('[data-update]');
    const show = wanted() && !!notice?.hidden;
    band.textContent = words();
    if (show && el.hidden && loaded) el.classList.add('slide-in');
    if (!show) el.classList.remove('slide-in');
    el.hidden = !show;
    document.body.classList.toggle('has-ribbon', show);
    if (dialog.open) fill();
  }
  band.addEventListener('animationend', () => el.classList.remove('slide-in'));
  function fill() {
    const kind = adviceFor({
      installable: !!deferred,
      ua: navigator.userAgent,
      platform: navigator.userAgentData?.platform || navigator.platform,
      touchPoints: navigator.maxTouchPoints,
      coarse: coarse.matches,
    });
    dialog.querySelector('h2').textContent = words();
    for (const a of dialog.querySelectorAll('[data-advice]')) a.hidden = a.dataset.advice !== kind;
    dialog.dataset.kind = kind;
  }

  band.addEventListener('click', () => {
    sound.play('tap');
    fill();
    dialog.showModal();
  });
  // Focus goes back to the ribbon, also where a tap doesn't focus a button (Safari).
  dialog.addEventListener('close', () => {
    if (!el.hidden) band.focus({ preventScroll: true });
  });
  dialog.querySelector('[data-close]').addEventListener('click', () => dialog.close());
  // A ctrl- or cmd-click opens the game in a new tab and leaves this page showing: the ribbon may
  // appear here now, sliding in.
  for (const tile of document.querySelectorAll('a.tile')) {
    tile.addEventListener('click', (e) => {
      update({ tapped: true });
      if (e.metaKey || e.ctrlKey || e.shiftKey) refresh();
    });
  }
  coarse.addEventListener('change', refresh);
  // Back from a game through the browser's cache: the page didn't reload, so look again.
  // It counts as a page load: the ribbon is simply there, no slide.
  window.addEventListener('pageshow', (e) => {
    if (!e.persisted) return;
    loaded = false;
    refresh();
    loaded = true;
  });
  refresh();
  loaded = true;

  return {
    refresh,
    installed() {
      installedNow = true;
      if (dialog.open) dialog.close();
      refresh();
    },
  };
})();

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
  ribbon.refresh(); // the notice hides the ribbon; it comes back when the notice goes
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

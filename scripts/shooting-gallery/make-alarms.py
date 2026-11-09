#!/usr/bin/env python3
"""Builds Shooting Gallery's three end-of-round alarms into shooting-gallery/sounds/ from real
recordings: Kenney's Impact Sounds (CC0), a heavy bell and heavy metal struck by hand.

  alert10.mp3  at 10 s: a hand bell rung hard and fast for a second, like a fairground barker's
  alert5.mp3   at 5 s: the heavy bell struck three times, each lower than the last
  alarm.mp3    at 3, 2 and 1 s: one low strike of the bell with a metal clang, like a boxing-ring bell

Nothing is synthesised: the recordings are only cut, re-pitched (by playing them slower) and
layered, so they stay analog. Each is mastered quietly, about as loud as the half-time chime.
Run: python3 scripts/shooting-gallery/make-alarms.py <Kenney "Impact Sounds/Audio" folder>
     (needs numpy and ffmpeg)
"""
import os
import subprocess
import sys
import tempfile
import wave

import numpy as np

SR = 44100
OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'shooting-gallery', 'sounds')
rng = np.random.default_rng(11)


def load(folder, name):
    raw = subprocess.run(
        ['ffmpeg', '-v', 'error', '-i', os.path.join(folder, name), '-ac', '1', '-ar', str(SR), '-f', 'f32le', '-'],
        check=True,
        capture_output=True,
    ).stdout
    x = np.frombuffer(raw, dtype=np.float32).astype(np.float64)
    return x / np.max(np.abs(x))


def pitched(x, factor):
    """Plays a recording `factor` times as fast: higher and shorter above 1, lower and longer below."""
    idx = np.arange(0, len(x) - 1, factor)
    return np.interp(idx, np.arange(len(x)), x)


def mix(parts, dur):
    out = np.zeros(int(dur * SR))
    for sig, at, gain in parts:
        a = int(at * SR)
        n = min(len(sig), len(out) - a)
        if n > 0:
            out[a : a + n] += sig[:n] * gain
    return out


def master(x, mean_db):
    """Scales a sound so its average loudness is `mean_db` dBFS, never clipping."""
    rms = np.sqrt(np.mean(x[np.abs(x) > 1e-4] ** 2))
    x = x * (10 ** (mean_db / 20) / rms)
    peak = np.max(np.abs(x))
    return x / peak * 0.89 if peak > 0.89 else x


def alert10(bells):
    # A hand bell rung fast: 11 strikes over a second, alternating two recordings, each a touch
    # different in pitch and force, as a hand would ring it; the last rings out.
    parts = []
    for i in range(11):
        b = bells[2 + i % 2]
        parts.append((pitched(b, 1.5 + rng.uniform(-0.03, 0.03)), i * 0.09, rng.uniform(0.6, 0.9)))
    parts.append((pitched(bells[1], 1.5), 11 * 0.09, 0.8))
    return master(mix(parts, 2.1), -19)


def alert5(bells):
    # The heavy bell struck three times, falling: a fifth, a third, then the root.
    parts = [(pitched(bells[0], f), i * 0.2, 1.0) for i, f in enumerate((1.5, 1.26, 1.0))]
    return master(mix(parts, 1.9), -20)


def alarm(bells, metal):
    # One low, heavy strike with a metal clang under it: the round bell of a boxing ring.
    parts = [(pitched(bells[1], 0.85), 0, 1.0), (pitched(metal, 0.8), 0, 0.45)]
    return master(mix(parts, 0.9), -19)


def write_mp3(name, samples):
    fade = np.minimum(1, (len(samples) - np.arange(len(samples))) / (0.05 * SR))
    samples = samples * fade
    with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as tmp:
        path = tmp.name
    with wave.open(path, 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((samples * 32767).astype(np.int16).tobytes())
    out = os.path.join(OUT, name)
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', path, '-ac', '1', '-b:a', '48k', out], check=True)
    os.unlink(path)
    print('wrote', os.path.relpath(out))


if __name__ == '__main__':
    if len(sys.argv) != 2:
        sys.exit('usage: make-alarms.py <Kenney "Impact Sounds/Audio" folder>')
    folder = sys.argv[1]
    bells = [load(folder, f'impactBell_heavy_00{i}.ogg') for i in range(5)]
    metal = load(folder, 'impactMetal_heavy_002.ogg')
    write_mp3('alert10.mp3', alert10(bells))
    write_mp3('alert5.mp3', alert5(bells))
    write_mp3('alarm.mp3', alarm(bells, metal))

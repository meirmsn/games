#!/usr/bin/env python3
"""Builds Splat Gallery's coin jingle into splat-gallery/sounds/coins.mp3: it plays as each gold duck
is sent (specs/splat-gallery-gold-ducks-and-turns.md).

  coins.mp3  a short, bright payout: a handful of coins tumbling onto each other, chinking, and a
             little bell struck over them; under a second

All synthesised: each coin is a few inharmonic, high partials that die fast, like a struck metal
disc, each a touch different in pitch and force, as coins falling would be; the bell is a small
hand bell's partials ringing out a little longer. It's mastered below the frenzy target's flourish
(frenzyhit.mp3), so the 10 s bell stays the loudest cue.
Run: python3 scripts/splat-gallery/make-coins.py   (needs numpy and ffmpeg)
"""
import os
import subprocess
import tempfile
import wave

import numpy as np

SR = 44100
OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'splat-gallery', 'sounds')
rng = np.random.default_rng(23)


def t_of(dur):
    return np.arange(int(dur * SR)) / SR


def mix(parts, dur):
    out = np.zeros(int(dur * SR))
    for sig, at, gain in parts:
        a = int(at * SR)
        n = min(len(sig), len(out) - a)
        if n > 0:
            out[a : a + n] += sig[:n] * gain
    return out


def master(x, mean_db):
    """Scales a sound so its average loudness is about `mean_db` dBFS; peaks are rounded off softly
    rather than clipped."""
    for _ in range(4):
        rms = np.sqrt(np.mean(x[np.abs(x) > 1e-4] ** 2))
        x = x * (10 ** (mean_db / 20) / rms)
        x = 0.89 * np.tanh(x / 0.89)
    return x


def coin(f0):
    # A struck metal disc: inharmonic partials, the higher ones dying faster, and a click of noise.
    dur = 0.22
    t = t_of(dur)
    x = np.zeros(len(t))
    for ratio, gain, decay in ((1.0, 1.0, 26), (1.59, 0.7, 34), (2.14, 0.5, 44), (2.65, 0.35, 55), (3.9, 0.2, 70)):
        x += gain * np.sin(2 * np.pi * f0 * ratio * t + rng.uniform(0, 2 * np.pi)) * np.exp(-decay * t)
    click = rng.standard_normal(len(t)) * np.exp(-t / 0.002) * 0.6
    return (x + click) * np.minimum(1, t / 0.0008)


def bell(f0):
    # A little hand bell: its hum, prime and the bright partials above, ringing out.
    dur = 0.8
    t = t_of(dur)
    x = np.zeros(len(t))
    for ratio, gain, decay in ((1.0, 1.0, 5), (2.0, 0.6, 7), (2.76, 0.45, 9), (5.4, 0.25, 14), (8.93, 0.12, 20)):
        x += gain * np.sin(2 * np.pi * f0 * ratio * t) * np.exp(-decay * t)
    return x * np.minimum(1, t / 0.002)


def coins():
    # Nine coins tumbling over about half a second, then the little bell struck twice over them.
    parts = []
    at = 0.0
    for i in range(9):
        parts.append((coin(rng.uniform(2300, 3400)), at, rng.uniform(0.55, 1.0)))
        at += rng.uniform(0.035, 0.07)
    parts.append((bell(1568), 0.06, 0.8))  # G6
    parts.append((bell(2093), 0.22, 0.6))  # C7, a fourth above: a little payout chime
    return master(mix(parts, 0.85), -16)


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
    write_mp3('coins.mp3', coins())

#!/usr/bin/env python3
"""Synthesises Shooting Gallery's three end-of-round alarms into shooting-gallery/sounds/:

  alert10.mp3  at 10 s: an electric alarm bell, its hammer rattling on the gong for a second
  alert5.mp3   at 5 s: three quick, falling strikes on a big tubular bell
  alarm.mp3    at 3, 2 and 1 s: a short two-tone klaxon blare

All three are original, built from inharmonic bell partials, a little grit and noise, so they sound
mechanical rather than electronic, and nothing like the half-time chime.
Run: python3 scripts/shooting-gallery/make-alarms.py   (needs numpy and ffmpeg)
"""
import os
import subprocess
import tempfile
import wave

import numpy as np

SR = 44100
OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'shooting-gallery', 'sounds')
rng = np.random.default_rng(11)


def t_of(dur):
    return np.arange(int(dur * SR)) / SR


def bell(f, dur, decay=2.2, partials=((1, 1.0), (2.76, 0.55), (5.40, 0.3), (8.93, 0.15))):
    """A struck metal bell: inharmonic partials, each dying away faster the higher it is."""
    t = t_of(dur)
    out = np.zeros_like(t)
    for ratio, amp in partials:
        out += amp * np.sin(2 * np.pi * f * ratio * t) * np.exp(-t * decay * (0.6 + ratio * 0.4))
    click = rng.standard_normal(len(t)) * np.exp(-t * 300) * 0.4
    return out + click


def grit(x, bits=7):
    """A little bit-crushing, for the rough, analog edge the other chimes have."""
    q = 2 ** (bits - 1)
    return np.round(x * q) / q


def norm(x, peak=0.92):
    return x / np.max(np.abs(x)) * peak


def alert10():
    # An electric bell: the hammer strikes the gong 24 times a second for 1.1 s, then it rings out.
    dur = 1.6
    out = np.zeros(int(dur * SR))
    strike = bell(1180, 0.5, decay=9)
    for i in range(int(1.1 * 24)):
        at = int(i * SR / 24)
        seg = strike * (0.75 + 0.25 * rng.random())
        end = min(len(out), at + len(seg))
        out[at:end] += seg[: end - at]
    ring = bell(1180, dur, decay=3.5)
    out += 0.6 * np.concatenate([np.zeros(int(1.1 * SR)), ring])[: len(out)]
    # The rattle of the hammer itself.
    t = t_of(dur)
    out += 0.25 * rng.standard_normal(len(t)) * (np.sin(2 * np.pi * 24 * t) > 0.6) * (t < 1.1)
    return norm(grit(np.tanh(out * 0.6)))


def alert5():
    # Three falling strikes on a big tubular bell: G5, E5, C5, an eighth of a second apart.
    dur = 1.5
    out = np.zeros(int(dur * SR))
    for i, f in enumerate((784, 659, 523)):
        seg = bell(f, dur - i * 0.14, decay=2.6, partials=((1, 1.0), (2.0, 0.35), (3.0, 0.3), (4.2, 0.2), (5.4, 0.12)))
        at = int(i * 0.14 * SR)
        out[at : at + len(seg)] += seg
    return norm(grit(np.tanh(out * 0.8)))


def alarm():
    # A klaxon: a buzzy, slightly detuned sawtooth leaping from a low to a high pitch, 0.42 s.
    dur = 0.42
    t = t_of(dur)
    f = np.where(t < 0.12, 330, 494) * (1 + 0.004 * np.sin(2 * np.pi * 7 * t))
    phase = np.cumsum(f) / SR
    saw = 2 * (phase % 1) - 1
    saw2 = 2 * ((phase * 1.007) % 1) - 1
    env = np.minimum(1, t / 0.01) * np.minimum(1, (dur - t) / 0.05)
    x = (saw + saw2) * env
    x = np.tanh(x * 2.5)
    x += 0.08 * rng.standard_normal(len(t)) * env
    return norm(grit(x, bits=6), 0.9)


def write_mp3(name, samples):
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
    write_mp3('alert10.mp3', alert10())
    write_mp3('alert5.mp3', alert5())
    write_mp3('alarm.mp3', alarm())

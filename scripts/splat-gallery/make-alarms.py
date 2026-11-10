#!/usr/bin/env python3
"""Builds Splat Gallery's three end-of-round alarms into splat-gallery/sounds/.

  alert10.mp3  at 10 s: a hand bell rung hard and fast for a second and a half, like a barker's
  alert5.mp3   at 5 s: the bell struck in urgent pairs, climbing, ding-ding, ding-ding, ding-ding
  alarm.mp3    at 3, 2 and 1 s: a short two-tone klaxon blare, with a little rattle and grit

The two bells are cut from real recordings, Kenney's Impact Sounds (CC0): a heavy bell struck by
hand, only re-pitched (by playing it faster or slower) and layered. The klaxon is synthesised: a
buzzy, detuned sawtooth leaping a fourth, roughened so it sounds like a horn on a pole.
Each is mastered a few decibels above the half-time chime: clear, but not as loud as the first
alarms the owner found too loud.
Run: python3 scripts/splat-gallery/make-alarms.py <Kenney "Impact Sounds/Audio" folder>
     (needs numpy and ffmpeg)
"""
import os
import subprocess
import sys
import tempfile
import wave

import numpy as np

SR = 44100
OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'splat-gallery', 'sounds')
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
    """Scales a sound so its average loudness is about `mean_db` dBFS; the strikes' peaks are
    rounded off softly (like an overdriven speaker horn) rather than clipped."""
    for _ in range(4):
        rms = np.sqrt(np.mean(x[np.abs(x) > 1e-4] ** 2))
        x = x * (10 ** (mean_db / 20) / rms)
        x = 0.89 * np.tanh(x / 0.89)
    return x


def alert10(bells):
    # A hand bell rung fast: 16 strikes over 1.4 s, alternating two recordings, each a touch
    # different in pitch and force, as a hand would ring it; the last rings out.
    parts = []
    for i in range(16):
        b = bells[2 + i % 2]
        parts.append((pitched(b, 1.7 + rng.uniform(-0.03, 0.03)), i * 0.088, rng.uniform(0.7, 1.0)))
    parts.append((pitched(bells[1], 1.7), 16 * 0.088, 0.9))
    return master(mix(parts, 2.4), -15)


def alert5(bells):
    # The bell struck in pairs, each pair a step higher: urgent, and nothing like the half-time chime.
    parts = []
    for i, f in enumerate((1.5, 1.68, 2.0)):
        for j in range(2):
            parts.append((pitched(bells[2 + j], f), i * 0.32 + j * 0.11, 1.0 if j == 0 else 0.85))
    return master(mix(parts, 1.8), -15)


def t_of(dur):
    return np.arange(int(dur * SR)) / SR


def alarm(_bells=None, _metal=None):
    # A klaxon: a buzzy, slightly detuned sawtooth leaping from a low to a high pitch, 0.42 s, with
    # the rattle of the horn's diaphragm and a little bit-crushed grit.
    dur = 0.42
    t = t_of(dur)
    f = np.where(t < 0.12, 330, 494) * (1 + 0.004 * np.sin(2 * np.pi * 7 * t))
    phase = np.cumsum(f) / SR
    saw = 2 * (phase % 1) - 1
    saw2 = 2 * ((phase * 1.007) % 1) - 1
    env = np.minimum(1, t / 0.01) * np.minimum(1, (dur - t) / 0.05)
    x = np.tanh((saw + saw2) * env * 2.5)
    x *= 1 + 0.15 * np.sin(2 * np.pi * 31 * t)
    x += 0.08 * rng.standard_normal(len(t)) * env
    q = 2 ** 5
    x = np.round(x * q) / q
    return master(x, -18)


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

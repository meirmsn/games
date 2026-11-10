#!/usr/bin/env python3
"""Make Orbit's sounds: soft, spacey tones built from sines, filtered noise and echoes.

The owner found the first set (Kenney clips) didn't sound like space (2026-11-09). These are
synthesised instead: slow swells, glassy pings, a warm chord and a seamless drone, each with a
little echo so it hangs in the dark. Writes orbit/sounds/<name>.mp3 (needs numpy and ffmpeg):

    python3 scripts/orbit/make-sounds.py
"""
import os
import subprocess
import sys
import tempfile
import wave

import numpy as np

SR = 44100
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "orbit", "sounds")
rng = np.random.default_rng(7)


def t_(dur):
    return np.arange(int(SR * dur)) / SR


def env(n, attack, release, curve=2.0):
    """An envelope: a soft rise over `attack` seconds, then an exponential-ish fall to silence."""
    e = np.ones(n)
    a = max(1, int(SR * attack))
    e[:a] = (np.arange(a) / a) ** 1.5
    r = np.linspace(1, 0, n - a) ** curve
    e[a:] = r
    return e


def sine(freq, dur, phase=0.0):
    t = t_(dur)
    if callable(freq):
        f = freq(t)
        return np.sin(2 * np.pi * np.cumsum(f) / SR + phase)
    return np.sin(2 * np.pi * freq * t + phase)


def lowpass(x, cutoff):
    """A gentle one-pole low-pass, run twice."""
    a = np.exp(-2 * np.pi * cutoff / SR)
    for _ in range(2):
        y = np.empty_like(x)
        acc = 0.0
        for i, v in enumerate(x):
            acc = (1 - a) * v + a * acc
            y[i] = acc
        x = y
    return x


def bandnoise(dur, lo, hi):
    n = rng.standard_normal(int(SR * dur))
    return lowpass(n, hi) - lowpass(n, lo)


def echo(x, delays=(0.19, 0.31, 0.47), gains=(0.32, 0.22, 0.14), tail=1.2):
    """A few soft echoes and a short tail: space, not a room."""
    out = np.concatenate([x, np.zeros(int(SR * (tail + max(delays))))])
    for d, g in zip(delays, gains):
        k = int(SR * d)
        out[k:k + len(x)] += g * lowpass(x, 3500)
    return out


def norm(x, peak=0.7):
    m = np.max(np.abs(x)) or 1
    return x / m * peak


def write(name, x, peak=0.7, loop=False):
    x = norm(x, peak)
    with tempfile.TemporaryDirectory() as d:
        wav = os.path.join(d, name + ".wav")
        with wave.open(wav, "w") as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(SR)
            w.writeframes((x * 32767).astype("<i2").tobytes())
        mp3 = os.path.join(OUT, name + ".mp3")
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", wav, "-b:a", "64k" if not loop else "56k", mp3], check=True)
    print(f"{name}: {len(x) / SR:.2f} s")


def launch():
    # an airy swell, a sine gliding up underneath
    d = 0.7
    n = int(SR * d)
    air = bandnoise(d, 300, 2200) * env(n, 0.08, 0.6, 1.6) * 0.6
    glide = sine(lambda t: 180 + 260 * (t / d) ** 0.7, d) * env(n, 0.05, 0.6, 2.2) * 0.5
    return echo(air + glide, tail=0.8)


def sling():
    # a slingshot: a whoosh sweeping past and up, and two bright notes rising over it
    d = 1.0
    n = int(SR * d)
    t = t_(d)
    whoosh = bandnoise(d, 250, 2600) * np.sin(np.pi * np.clip(t / 0.7, 0, 1)) ** 2 * 0.7
    sweep = sine(lambda t: 220 + 520 * (t / d) ** 1.4, d) * env(n, 0.15, 0.8, 1.8) * 0.35
    notes = np.zeros(n)
    for start, f in ((0.32, 1046.5), (0.46, 1568.0)):
        k = int(SR * start)
        m = n - k
        notes[k:] += (sine(f, m / SR) + 0.3 * sine(2 * f, m / SR)) * env(m, 0.004, m / SR, 3.2) * 0.5
    return echo(whoosh + sweep + notes, tail=0.9)


def mote():
    # a glassy ping (the game raises its pitch through a run)
    d = 0.6
    n = int(SR * d)
    ping = (sine(1318.5, d) + 0.35 * sine(2637, d) + 0.15 * sine(3955.5, d)) * env(n, 0.003, 0.6, 3.5)
    return echo(ping, delays=(0.13, 0.26), gains=(0.3, 0.15), tail=0.5)


def capture():
    # a warm, open chord that swells and settles
    d = 2.2
    n = int(SR * d)
    notes = [220.0, 329.63, 440.0, 554.37]
    chord = sum(sine(f, d, i) / (1 + i * 0.4) for i, f in enumerate(notes))
    shimmer = sine(880.0, d) * 0.12 * (0.5 + 0.5 * np.sin(2 * np.pi * 5 * t_(d)))
    return echo((chord + shimmer) * env(n, 0.12, 2.0, 1.8), tail=1.0)


def crash():
    # a muffled thud, far off
    d = 0.7
    n = int(SR * d)
    thud = sine(lambda t: 70 - 35 * (t / d), d) * env(n, 0.004, 0.65, 2.8)
    dust = lowpass(rng.standard_normal(n), 500) * env(n, 0.002, 0.5, 3) * 2.5
    return echo(thud + dust, gains=(0.18, 0.1, 0.05), tail=0.6)


def lost():
    # a soft tone falling away into the dark
    d = 1.0
    n = int(SR * d)
    fall = sine(lambda t: 520 * (180 / 520) ** (t / d), d) * env(n, 0.02, 0.95, 1.5)
    return echo(fall * 0.8, tail=1.0)


def skim():
    # a breath of atmosphere rushing past
    d = 0.55
    n = int(SR * d)
    rush = bandnoise(d, 500, 4000) * np.sin(np.pi * np.linspace(0, 1, n)) ** 2
    return echo(rush, gains=(0.15, 0.08, 0.04), tail=0.3)


def tick():
    # a tiny soft blip as the throw gets stronger
    d = 0.09
    n = int(SR * d)
    return sine(880.0, d) * env(n, 0.004, 0.08, 3)


def done():
    # a slow rising arpeggio of bells
    total = 2.8
    out = np.zeros(int(SR * total))
    for i, f in enumerate([440.0, 554.37, 659.25, 880.0]):
        d = 1.6
        n = int(SR * d)
        bell = (sine(f, d) + 0.3 * sine(f * 2.0, d) + 0.1 * sine(f * 3.01, d)) * env(n, 0.004, 1.6, 2.6)
        k = int(SR * i * 0.22)
        out[k:k + n] += bell
    return echo(out, tail=1.0)


def drone():
    # a slow, seamless pad: every frequency and swell completes whole cycles in the loop, so its end
    # runs straight into its start
    d = 12.0
    t = t_(d)
    pad = np.zeros_like(t)
    for f, g, lfo in [(55.0, 1.0, 1), (82.5, 0.6, 2), (110.0, 0.5, 3), (165.0, 0.25, 1), (220.0, 0.12, 2)]:
        swell = 0.6 + 0.4 * np.sin(2 * np.pi * lfo * t / d)
        pad += g * swell * (np.sin(2 * np.pi * f * t) + 0.5 * np.sin(2 * np.pi * (f + 2 / d) * t))
    # a faint wash of noise, made loopable by crossfading its overhang into its start
    n = len(t)
    x = int(SR * 1.0)
    raw = lowpass(rng.standard_normal(n + x), 400) * 3
    wash = raw[:n].copy()
    fade = np.linspace(0, 1, x)
    wash[:x] = raw[:x] * fade + raw[n:n + x] * (1 - fade)
    wash = wash * (0.5 + 0.5 * np.sin(2 * np.pi * 2 * t / d) ** 2)
    return pad + 0.25 * wash


SOUNDS = {
    "launch": launch,
    "sling": sling,
    "mote": mote,
    "capture": capture,
    "crash": crash,
    "lost": lost,
    "skim": skim,
    "tick": tick,
    "done": done,
}

if __name__ == "__main__":
    only = sys.argv[1:]
    for name, make in SOUNDS.items():
        if not only or name in only:
            write(name, make())
    if not only or "drone" in only:
        write("drone", drone(), peak=0.6, loop=True)

#!/usr/bin/env python3
"""Estimate the musical key of audio files (crumble AC-22's review step).

Usage: python3 scripts/crumble/key-estimate.py crumble/sounds/music.mp3 crumble/sounds/win.mp3 crumble/sounds/lose.mp3
Needs ffmpeg and numpy. For each file it sums a chroma (energy per pitch class, 60 Hz–2 kHz) over the
whole file and correlates it with the Krumhansl–Kessler major and minor key profiles in all twelve
keys; the best match is printed with its correlation.

Recorded on 2026-11-10:
  crumble/sounds/music.mp3 A minor 0.79
  crumble/sounds/win.mp3 A minor 0.74
  crumble/sounds/lose.mp3 D minor 0.84
"""
import subprocess
import sys

import numpy as np

MAJOR = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
MINOR = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])
NAMES = "C C# D D# E F F# G G# A A# B".split()


def key(path, rate=11025, n=2048):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-ac", "1", "-ar", str(rate), "-f", "s16le", "-"], capture_output=True, check=True).stdout
    a = np.frombuffer(raw, np.int16).astype(float)
    freqs = np.fft.rfftfreq(n, 1 / rate)
    ok = (freqs > 60) & (freqs < 2000)
    pc = (np.round(12 * np.log2(freqs[ok] / 261.63)) % 12).astype(int)
    chroma = np.zeros(12)
    for i in range(0, len(a) - n, n // 2):
        spec = np.abs(np.fft.rfft(a[i : i + n] * np.hanning(n)))[ok]
        np.add.at(chroma, pc, spec)
    return max((np.corrcoef(np.roll(p, k), chroma)[0, 1], NAMES[k], m) for k in range(12) for p, m in ((MAJOR, "major"), (MINOR, "minor")))


for f in sys.argv[1:]:
    r, tonic, mode = key(f)
    print(f, tonic, mode, round(r, 2))

#!/usr/bin/env python3
"""Synthesises Shooting Gallery's two carnival tunes into shooting-gallery/sounds/:

  music.mp3   a calliope waltz (3/4, oom-pah-pah), the booth's music
  frenzy.mp3  a fast galop (2/4), for frenzy

Both tunes are original. A calliope is a row of steam whistles: here each note is a few detuned
pipes (a sine with a little second and third harmonic and some breath), with a fast tremolo.
The bass is a soft tuba-like thump; the "pah" chords are short pipe stabs.
Run: python3 scripts/shooting-gallery/make-music.py   (needs numpy and ffmpeg)
"""
import os
import subprocess
import tempfile
import wave

import numpy as np

SR = 44100
OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'shooting-gallery', 'sounds')
NAMES = {'C': 0, 'C#': 1, 'D': 2, 'D#': 3, 'E': 4, 'F': 5, 'F#': 6, 'G': 7, 'G#': 8, 'A': 9, 'A#': 10, 'B': 11}


def freq(note):
    name, octave = note[:-1], int(note[-1])
    midi = 12 * (octave + 1) + NAMES[name]
    return 440.0 * 2 ** ((midi - 69) / 12)


rng = np.random.default_rng(7)


def pipe(f, dur, vol=1.0, trem=6.2):
    """A calliope note: detuned pipes with a tremolo, a quick attack and a short release."""
    n = int(dur * SR)
    t = np.arange(n) / SR
    out = np.zeros(n)
    for detune in (-0.0035, 0.0, 0.004):
        ff = f * (1 + detune)
        ph = 2 * np.pi * ff * t + 0.004 * np.sin(2 * np.pi * 5.5 * t) * 2 * np.pi * ff / 5.5 * 0.02
        out += np.sin(ph) + 0.35 * np.sin(2 * ph) + 0.18 * np.sin(3 * ph) + 0.06 * np.sin(4 * ph)
    out /= 3
    out *= 1 + 0.22 * np.sin(2 * np.pi * trem * t)  # the whistle's flutter
    breath = rng.normal(0, 1, n) * 0.04
    out += np.convolve(breath, np.ones(8) / 8, 'same')
    env = np.minimum(1, t / 0.018) * np.minimum(1, (dur - t) / 0.05).clip(0, 1)
    return out * env * vol


def bass(f, dur, vol=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    out = np.sin(2 * np.pi * f * t) + 0.5 * np.sin(4 * np.pi * f * t) + 0.25 * np.sin(6 * np.pi * f * t)
    env = np.minimum(1, t / 0.01) * np.exp(-t * 5.5)
    return out * env * vol


def drum(dur, vol=1.0, bright=False):
    """A soft bass drum, or a cymbal-ish tick."""
    n = int(dur * SR)
    t = np.arange(n) / SR
    if bright:
        noise = rng.normal(0, 1, n)
        noise = noise - np.convolve(noise, np.ones(4) / 4, 'same')
        return noise * np.exp(-t * 28) * vol
    return np.sin(2 * np.pi * (70 + 60 * np.exp(-t * 30)) * t) * np.exp(-t * 9) * vol


CHORDS = {
    'C': ['C4', 'E4', 'G4'],
    'F': ['C4', 'F4', 'A4'],
    'G7': ['B3', 'F4', 'G4'],
    'C7': ['A#3', 'E4', 'G4'],
    'D7': ['C4', 'F#4', 'A4'],
}
ROOTS = {'C': 'C2', 'F': 'F2', 'G7': 'G2', 'C7': 'C2', 'D7': 'D2'}
FIFTHS = {'C': 'G2', 'F': 'C3', 'G7': 'D2', 'C7': 'G2', 'D7': 'A2'}


def place(buf, sig, at):
    i = int(at * SR)
    j = min(len(buf), i + len(sig))
    buf[i:j] += sig[: j - i]


def render(bars, beat, meter, chord_of):
    """bars: a list of melody bars, each a list of (note or None, beats)."""
    total = len(bars) * meter * beat
    buf = np.zeros(int((total + 1.0) * SR))
    t = 0.0
    for b, bar in enumerate(bars):
        chord = chord_of[b]
        start = b * meter * beat
        # Oom-pah(-pah): the bass on the first beat (alternating root and fifth), chords after.
        root = ROOTS[chord] if b % 2 == 0 else FIFTHS[chord]
        place(buf, bass(freq(root), beat * 0.95, 0.55), start)
        place(buf, drum(0.4, 0.35), start)
        for k in range(1, meter):
            for note in CHORDS[chord]:
                place(buf, pipe(freq(note), beat * 0.42, 0.13), start + k * beat)
            place(buf, drum(0.12, 0.05, True), start + k * beat)
        t = start
        for note, beats in bar:
            if note:
                place(buf, pipe(freq(note), beats * beat * 0.92, 0.42), t)
                # An octave above, quietly, like a second rank of whistles.
                place(buf, pipe(freq(note) * 2, beats * beat * 0.9, 0.07, trem=6.8), t)
            t += beats * beat
    n = int(total * SR)
    out = buf[:n]
    # Make the loop seamless: the tail that rings past the end is folded back onto the start.
    tail = buf[n : n + int(0.8 * SR)]
    out[: len(tail)] += tail
    out = np.tanh(out * 1.1) * 0.9
    return out / np.max(np.abs(out)) * 0.85


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


# The waltz: 16 bars of 3/4 at 152 beats a minute, played twice with the repeat an octave higher
# in its last phrase.
W = [
    [('E5', 1), ('D#5', 1), ('E5', 1)], [('G5', 2), ('E5', 1)],
    [('D5', 1), ('C#5', 1), ('D5', 1)], [('F5', 2), ('D5', 1)],
    [('B4', 1), ('A#4', 1), ('B4', 1)], [('D5', 2), ('B4', 1)],
    [('G4', 1), ('A4', 1), ('B4', 1)], [('C5', 2), (None, 1)],
    [('E5', 1), ('D#5', 1), ('E5', 1)], [('G5', 2), ('E5', 1)],
    [('A5', 1), ('G5', 1), ('F5', 1)], [('A5', 2), ('F5', 1)],
    [('E5', 1), ('G5', 1), ('E5', 1)], [('D5', 2), ('G4', 1)],
    [('C5', 1), ('E5', 1), ('D5', 1)], [('C5', 2), (None, 1)],
]
WC = ['C', 'C', 'G7', 'G7', 'G7', 'G7', 'G7', 'C', 'C', 'C7', 'F', 'F', 'C', 'G7', 'G7', 'C']
waltz = render(W + W, 60 / 152, 3, WC + WC)

# The galop: 8 bars of 2/4 in running eighths at 168 beats a minute, played twice.
E = 0.5
G = [
    [('G4', E), ('A4', E), ('B4', E), ('C5', E)], [('D5', E), ('E5', E), ('F5', E), ('F#5', E)],
    [('G5', E), ('E5', E), ('C5', E), ('E5', E)], [('G5', 1), ('G5', 1)],
    [('F5', E), ('D5', E), ('B4', E), ('D5', E)], [('F5', 1), ('F5', 1)],
    [('E5', E), ('D#5', E), ('E5', E), ('G5', E)], [('C6', 1), (None, 1)],
]
GC = ['C', 'C', 'C', 'C', 'G7', 'G7', 'C', 'C']
galop = render(G + G, 60 / 168, 2, GC + GC)

os.makedirs(OUT, exist_ok=True)
write_mp3('music.mp3', waltz)
write_mp3('frenzy.mp3', galop)

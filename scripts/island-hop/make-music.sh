#!/usr/bin/env bash
# Island Hop's music: the owner's two tracks (made with ElevenLabs Music, 2026-11-11), one played
# afloat and one ashore. Evens their loudness and makes them light enough for a phone: 64 kbps stereo.
# Usage: scripts/island-hop/make-music.sh <music-at-sea.mp3> <music-on-the-island.mp3>
# Writes island-hop/sounds/music-sea.mp3 and island-hop/sounds/music-land.mp3.
set -euo pipefail
[ $# -eq 2 ] || { echo "usage: $0 <music-at-sea.mp3> <music-on-the-island.mp3>"; exit 2; }
cd "$(dirname "$0")/../.."
enc() { ffmpeg -v error -y -i "$1" -af loudnorm=I=-18:TP=-1.5:LRA=11 -ar 44100 -ac 2 -b:a 64k "$2"; }
enc "$1" island-hop/sounds/music-sea.mp3
enc "$2" island-hop/sounds/music-land.mp3
ls -l island-hop/sounds/music-sea.mp3 island-hop/sounds/music-land.mp3

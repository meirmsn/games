#!/usr/bin/env bash
# The repo's fast checks. Run before every push; CI runs the same script.
set -euo pipefail
cd "$(dirname "$0")/.."
python3 scripts/check-links.py

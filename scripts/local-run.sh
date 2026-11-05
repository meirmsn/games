#!/usr/bin/env bash
# Serve the site locally: PORT=8000 scripts/local-run.sh, then open http://127.0.0.1:8000/
set -euo pipefail
cd "$(dirname "$0")/.."
exec python3 -m http.server --bind 127.0.0.1 "${PORT:-8000}"

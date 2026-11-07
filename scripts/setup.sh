#!/usr/bin/env bash
# Installs the project's pinned tools from the committed package-lock.json (npm ci never rewrites it).
set -euo pipefail
cd "$(dirname "$0")/.."
npm ci --no-audit --no-fund

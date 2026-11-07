#!/usr/bin/env bash
# The slow CI tier: end-to-end tests in a real browser (Playwright's Chromium). CI's `slow` job runs
# it after `fast` passes. Needs the pinned Playwright: scripts/setup.sh (npm ci), then
# npx playwright install chromium.
# Exit 0 = clean; 1 = failures; 2 = couldn't run.
set -uo pipefail
cd "$(dirname "$0")/.." || exit 2
node -e "import('playwright')" 2>/dev/null || { echo "check-slow: Playwright isn't installed (scripts/setup.sh)"; exit 2; }
node --test tests/*.test.mjs || exit 1

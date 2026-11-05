#!/usr/bin/env bash
# The slow tier: end-to-end tests in a real browser (Playwright's Chromium).
# Needs the pinned Playwright: npm ci && npx playwright install chromium.
# Exit 0 = clean; 1 = failures; 2 = couldn't run.
set -uo pipefail
cd "$(dirname "$0")/.."
node -e "import('playwright')" 2>/dev/null || { echo "check-slow: Playwright isn't installed (npm ci)"; exit 2; }
node --test tests/*.test.mjs || exit 1

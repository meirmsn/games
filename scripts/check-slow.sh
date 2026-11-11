#!/usr/bin/env bash
# The slow CI tier: end-to-end tests in a real browser (Playwright's Chromium). CI's `slow` job runs
# it after `fast` passes. Needs the pinned Playwright: scripts/setup.sh (npm ci), then
# npx playwright install chromium.
#
# Usage: scripts/check-slow.sh [test file...]   (default: tests/*.test.mjs)
#   TEST_CPU_THROTTLE=10   every page any test opens runs 10× slower (tests/clock.mjs)
#   SLOW_TEST_TIMEOUT_MS   each file's limit, default 300000 (5 min), times the throttle rate, at most
#                          1200000 (20 min). A file that runs past it (a hang in a test or a hook, or a
#                          process that never exits) is stopped and fails the run; Node counts it as
#                          "cancelled", so this script names it (specs/slow-tests-harness.md).
# Exit 0 = clean; 1 = failures; 2 = couldn't run.
set -uo pipefail
cd "$(dirname "$0")/.." || exit 2
node -e "import('playwright')" 2>/dev/null || { echo "check-slow: Playwright isn't installed (scripts/setup.sh)"; exit 2; }
limit=$(node -e '
  const n = Number(process.env.TEST_CPU_THROTTLE);
  const rate = Number.isFinite(n) && n > 1 ? n : 1;
  const base = Number(process.env.SLOW_TEST_TIMEOUT_MS || 300000);
  if (!Number.isFinite(base) || base <= 0) process.exit(1);
  console.log(Math.min(Math.round(base * rate), 1200000));
') || { echo "check-slow: SLOW_TEST_TIMEOUT_MS must be a positive number of ms"; exit 2; }
echo "check-slow: each file's limit is ${limit} ms"
files=("$@")
[ ${#files[@]} -gt 0 ] || files=(tests/*.test.mjs)
log=$(mktemp) || exit 2
trap 'rm -f "$log"' EXIT
# TAP, as CI has always printed (stdout isn't a terminal there), so the stopped files can be read back.
node --test --test-reporter=tap --test-timeout="$limit" "${files[@]}" | tee "$log"
rc=${PIPESTATUS[0]}
# A stopped file is a top-level "not ok … - <file>" whose error is the time-out.
stopped=$(awk '/^not ok [0-9]+ - /{name=$0; sub(/^not ok [0-9]+ - /, "", name); next}
  name != "" && /test timed out after/ {print name; name=""}
  /^(ok|not ok) [0-9]+ - /{name=""}' "$log")
if [ -n "$stopped" ]; then
  while IFS= read -r f; do echo "check-slow: stopped at the ${limit} ms limit: $f"; done <<<"$stopped"
  exit 1
fi
[ "$rc" -eq 0 ] || exit 1

#!/usr/bin/env bash
# The repo's fast checks. Run before every push; CI runs the same script.
# Exit 0 = clean; 1 = failures.
set -uo pipefail
cd "$(dirname "$0")/.."
status=0
python3 scripts/check-links.py || status=1
python3 scripts/check-shell.py || status=1
# The lockfile must resolve from the public npm registry, or CI can't install it.
if grep -o '"resolved": "[^"]*"' package-lock.json | grep -v '"https://registry.npmjs.org/' ; then
  echo "package-lock.json: packages must resolve from https://registry.npmjs.org/"; status=1
fi
node scripts/ui/tokens-check.mjs --theme assets/base.css assets/base.css assets/site.css shared/game-shell.css || status=1
exit $status

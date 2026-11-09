#!/usr/bin/env bash
# Tests of scripts/preview-bindings-check.mjs (specs/all-cloudflare-deploys.md AC-8), on fixture
# configs written here. Exit 0 = all pass; 1 = a failure.
set -uo pipefail
repo_root=$(cd "$(dirname "$0")/.." && pwd)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
check="$repo_root/scripts/preview-bindings-check.mjs"
fails=0
expect() { # expect <exit code> <name> <config text>
  printf '%s\n' "$3" >"$work/c.jsonc"
  node "$check" "$work/c.jsonc" >"$work/log" 2>&1
  local rc=$?
  if [ "$rc" = "$1" ]; then echo "ok - $2"; else echo "FAIL - $2 (exit $rc)"; cat "$work/log"; fails=$((fails + 1)); fi
}

expect 0 "all-cloudflare-deploys AC-8: no bindings passes (comments and trailing commas read)" '{
  // comment, and a "string // not a comment"
  "name": "x", /* block */ "previews": {},
}'
expect 0 "all-cloudflare-deploys AC-8: each binding with its own preview resource passes" '{
  "d1_databases": [{ "binding": "DB", "database_name": "prod", "database_id": "aaa" }],
  "r2_buckets": [{ "binding": "FILES", "bucket_name": "prod-files" }],
  "kv_namespaces": [{ "binding": "KV", "id": "k1" }],
  "services": [{ "binding": "API", "service": "api" }],
  "previews": {
    "d1_databases": [{ "binding": "DB", "database_name": "preview", "database_id": "bbb" }],
    "r2_buckets": [{ "binding": "FILES", "bucket_name": "preview-files" }],
    "kv_namespaces": [{ "binding": "KV", "id": "k2" }],
    "services": [{ "binding": "API", "service": "api-preview" }]
  }
}'
expect 1 "all-cloudflare-deploys AC-8: a preview D1 with the production database_id fails" '{
  "d1_databases": [{ "binding": "DB", "database_name": "prod", "database_id": "aaa" }],
  "previews": { "d1_databases": [{ "binding": "DB", "database_name": "preview", "database_id": "aaa" }] }
}'
expect 1 "all-cloudflare-deploys AC-8: a preview R2 with the production bucket fails" '{
  "r2_buckets": [{ "binding": "FILES", "bucket_name": "prod-files" }],
  "previews": { "r2_buckets": [{ "binding": "FILES", "bucket_name": "prod-files" }] }
}'
expect 1 "all-cloudflare-deploys AC-8: a preview service binding to the production Worker fails" '{
  "services": [{ "binding": "API", "service": "api" }],
  "previews": { "services": [{ "binding": "API", "service": "api" }] }
}'
expect 1 "all-cloudflare-deploys AC-8: a binding with no preview counterpart fails" '{
  "kv_namespaces": [{ "binding": "KV", "id": "k1" }],
  "previews": {}
}'
expect 1 "all-cloudflare-deploys AC-8: a preview KV with the production id fails" '{
  "kv_namespaces": [{ "binding": "KV", "id": "k1" }],
  "previews": { "kv_namespaces": [{ "binding": "KV", "id": "k1" }] }
}'
expect 1 "all-cloudflare-deploys AC-8: a preview D1 that names no database_id fails" '{
  "d1_databases": [{ "binding": "DB", "database_name": "prod", "database_id": "aaa" }],
  "previews": { "d1_databases": [{ "binding": "DB", "database_name": "preview" }] }
}'
expect 2 "all-cloudflare-deploys AC-8: an unreadable config can't run" '{ "name": '

if node "$check" "$repo_root/wrangler.jsonc" >"$work/log" 2>&1; then
  echo "ok - all-cloudflare-deploys AC-8: this repo's wrangler.jsonc passes"
else echo "FAIL - all-cloudflare-deploys AC-8: this repo's wrangler.jsonc"; cat "$work/log"; fails=$((fails + 1)); fi
if grep -qE '^part node scripts/preview-bindings-check\.mjs$' "$repo_root/scripts/check-fast.sh"; then
  echo "ok - all-cloudflare-deploys AC-8: scripts/check-fast.sh runs the check"
else echo "FAIL - all-cloudflare-deploys AC-8: scripts/check-fast.sh doesn't run the check"; fails=$((fails + 1)); fi

[ "$fails" = 0 ] || { echo "preview-bindings-check.test: $fails failed"; exit 1; }
echo "preview-bindings-check.test: all passed"

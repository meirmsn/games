#!/usr/bin/env bash
# Tests of scripts/deploy.sh (specs/all-cloudflare-deploys.md), with no network: a fake `curl`
# serves a directory for SITE_URL, and a fake `sleep` moves the fake site to its next state
# (site.1, site.2, … ; the last one stays). A throwaway git repo holds three commits:
#   c1: index.html v1, a/index.html, a/ui/x.js (excluded by the bare name `ui`), img.bin (NUL bytes),
#       old.txt;  c2: index.html v2, old.txt removed;  c3: index.html v3 (a newer main).
# Exit 0 = all pass; 1 = a failure.
set -uo pipefail
repo_root=$(cd "$(dirname "$0")/.." && pwd)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
fails=0
pass() { echo "ok - $1"; }
fail() { echo "FAIL - $1"; fails=$((fails + 1)); }

# --- fakes
mkdir -p "$work/bin"
cat >"$work/bin/curl" <<'EOF'
#!/usr/bin/env bash
url=${@: -1}; code_only=""
for a in "$@"; do [ "$a" = "%{http_code}" ] && code_only=1; done
path=${url#"$SITE_URL"}; path=${path//%20/ }
echo "$path" >>"$FAKE/requests"
case "$path" in */) path="${path}index.html" ;; esac
n=$(cat "$FAKE/round" 2>/dev/null || echo 1)
while [ "$n" -gt 1 ] && [ ! -d "$FAKE/site.$n" ]; do n=$((n - 1)); done
file="$FAKE/site.$n$path"
if [ -f "$file" ]; then
  if [ -n "$code_only" ]; then printf 200; else cat "$file"; fi
  exit 0
fi
if [ -n "$code_only" ]; then printf 404; exit 0; fi
exit 22
EOF
cat >"$work/bin/sleep" <<'EOF'
#!/usr/bin/env bash
n=$(cat "$FAKE/round" 2>/dev/null || echo 1); echo $((n + 1)) >"$FAKE/round"
EOF
chmod +x "$work/bin/curl" "$work/bin/sleep"

# --- the throwaway repo and its origin
r="$work/repo"
git init -q -b main "$r"
git -C "$r" config user.email t@example.com
git -C "$r" config user.name t
mkdir -p "$r/scripts" "$r/a/ui"
cp "$repo_root/scripts/deploy.sh" "$r/scripts/"
printf 'x\nbuilds_previews_deploys: all-cloudflare\n' >"$r/CLAUDE.md"
printf '{\n  // the Worker\n  "name": "games"\n}\n' >"$r/wrangler.jsonc"
printf '.git\nscripts\nui\nCLAUDE.md\nwrangler.jsonc\n.assetsignore\n' >"$r/.assetsignore"
echo v1 >"$r/index.html"; echo page-a >"$r/a/index.html"; echo js >"$r/a/ui/x.js"
printf 'bin\0ary\0' >"$r/img.bin"; echo old >"$r/old.txt"; : >"$r/empty.txt"; echo spaced >"$r/a file.txt"
git -C "$r" add -A && git -C "$r" commit -qm c1 && c1=$(git -C "$r" rev-parse HEAD)
echo v2 >"$r/index.html"; git -C "$r" rm -q old.txt
git -C "$r" commit -qam c2 && c2=$(git -C "$r" rev-parse HEAD)
echo v3 >"$r/index.html"; git -C "$r" commit -qam c3 && c3=$(git -C "$r" rev-parse HEAD)
git -C "$r" checkout -q "$c2"
git clone -q --bare "$r" "$work/origin.git"
git -C "$r" remote add origin "$work/origin.git"
git -C "$work/origin.git" update-ref refs/heads/main "$c2"

site() { # site <dir> <commit>: what Cloudflare would serve for a commit (all its files is enough)
  mkdir -p "$1"; git -C "$r" archive "$2" | tar -x -C "$1"
}

# run <name>: a fresh fake site from the site.* dirs the case made; output in $work/<name>.{log,out}
run() {
  local name=$1; shift
  : >"$FAKE/requests"; echo 1 >"$FAKE/round"
  (cd "$r" && env PATH="$work/bin:$PATH" GITHUB_OUTPUT="$work/$name.out" SITE_URL=https://site.test \
    BUILD_SHA="$c2" PREVIOUS_SHA="$c1" DEPLOY_TRIES=4 DEPLOY_WAIT=0 DEPLOY_JOBS=2 "$@" \
    scripts/deploy.sh) >"$work/$name.log" 2>&1
  echo $? >"$work/$name.rc"
}
newcase() { export FAKE="$work/fake.$1"; rm -rf "$FAKE"; mkdir -p "$FAKE"; : >"$work/$1.out"; }
rc() { cat "$work/$1.rc"; }
has() { grep -qxF "$2" "$work/$1.out"; }
log() { grep -qF "$2" "$work/$1.log"; }

# AC-1: this commit served, the removed file gone
newcase live; site "$FAKE/site.1" "$c2"; run live
if [ "$(rc live)" = 0 ] && has live "deployed=yes" && has live "site_smoke=passed" \
  && has live "version=${c2:0:12}" && has live "previous_version=${c1:0:12}" \
  && has live "url=https://site.test/" && has live "site_url=https://site.test" \
  && grep -q '^rollback=Cloudflare dashboard: Workers & Pages → games → Deployments' "$work/live.out" \
  && grep -qx '/old.txt' "$FAKE/requests" && grep -qx '/a file.txt' "$FAKE/requests"; then
  pass "all-cloudflare-deploys AC-1: live when every site file matches and the removed file is gone"
else fail "all-cloudflare-deploys AC-1 (rc $(rc live))"; cat "$work/live.log"; fi

# AC-1, the removed file still served: never passes
newcase stale; site "$FAKE/site.1" "$c2"; echo old >"$FAKE/site.1/old.txt"; run stale
if [ "$(rc stale)" = 1 ] && log stale "still served (HTTP 200): old.txt"; then
  pass "all-cloudflare-deploys AC-1: a removed file still served is not live"
else fail "all-cloudflare-deploys AC-1 removed file (rc $(rc stale))"; cat "$work/stale.log"; fi

# AC-1, an empty site file the site doesn't serve: a failed fetch never matches
newcase empty; site "$FAKE/site.1" "$c2"; rm "$FAKE/site.1/empty.txt"; run empty
if [ "$(rc empty)" = 1 ] && log empty "differs: empty.txt"; then
  pass "all-cloudflare-deploys AC-1: a file that fails to fetch never matches, even an empty one"
else fail "all-cloudflare-deploys AC-1 empty file (rc $(rc empty))"; cat "$work/empty.log"; fi

# AC-1, matched once then reverted: two checks in a row are needed
newcase flap; site "$FAKE/site.1" "$c2"; site "$FAKE/site.2" "$c1"; site "$FAKE/site.3" "$c2"; run flap
if [ "$(rc flap)" = 0 ] && log flap "try 1/4: serves ${c2:0:12}, once" && [ "$(cat "$FAKE/round")" -ge 4 ]; then
  pass "all-cloudflare-deploys AC-1: one match isn't enough; it passes on two in a row"
else fail "all-cloudflare-deploys AC-1 two in a row (rc $(rc flap), round $(cat "$FAKE/round"))"; cat "$work/flap.log"; fi

# AC-2: previous commit first, then this one
newcase wait; site "$FAKE/site.1" "$c1"; site "$FAKE/site.2" "$c1"; site "$FAKE/site.3" "$c2"; run wait
if [ "$(rc wait)" = 0 ] && has wait "site_smoke=passed" && [ "$(cat "$FAKE/round")" -ge 4 ]; then
  pass "all-cloudflare-deploys AC-2: keeps checking and passes once the new files are served"
else fail "all-cloudflare-deploys AC-2 (rc $(rc wait))"; cat "$work/wait.log"; fi

# AC-3: changed away from the previous commit, never this one
newcase broken; site "$FAKE/site.1" "$c2"; echo wrong >"$FAKE/site.1/index.html"; run broken
if [ "$(rc broken)" = 1 ] && has broken "deployed=yes" && has broken "site_smoke=failed" \
  && grep -q '^rollback=' "$work/broken.out" && log broken "differs: index.html"; then
  pass "all-cloudflare-deploys AC-3: fails, may be live, and names the file that differs"
else fail "all-cloudflare-deploys AC-3 (rc $(rc broken))"; cat "$work/broken.log"; fi

# AC-3: still the previous commit throughout
newcase unchanged; site "$FAKE/site.1" "$c1"; run unchanged
if [ "$(rc unchanged)" = 1 ] && ! grep -q '^deployed=' "$work/unchanged.out" \
  && has unchanged "site_smoke=failed" && log unchanged "production is unchanged"; then
  pass "all-cloudflare-deploys AC-3: fails without deployed when the previous commit is still served"
else fail "all-cloudflare-deploys AC-3 unchanged (rc $(rc unchanged))"; cat "$work/unchanged.log"; fi

# AC-4: a newer main is live
newcase newer; site "$FAKE/site.1" "$c3"
git -C "$work/origin.git" update-ref refs/heads/main "$c3"
run newer
git -C "$work/origin.git" update-ref refs/heads/main "$c2"
if [ "$(rc newer)" = 0 ] && has newer "version=${c2:0:12} (live: ${c3:0:12}, a newer merge)" \
  && log newer "serves ${c3:0:12}, a newer main"; then
  pass "all-cloudflare-deploys AC-4: a newer main that includes this commit counts as live"
else fail "all-cloudflare-deploys AC-4 (rc $(rc newer))"; cat "$work/newer.log"; fi

# AC-5: excluded files never fetched; index.html at its directory's path (the AC-1 run's requests)
req="$work/fake.live/requests"
if grep -qx '/' "$req" && grep -qx '/a/' "$req" && grep -qx '/img.bin' "$req" \
  && ! grep -qE '^/(scripts/|CLAUDE.md|wrangler.jsonc|\.assetsignore|a/ui/|index.html$)' "$req"; then
  pass "all-cloudflare-deploys AC-5: .assetsignore files (a nested 'ui' too) never fetched; index.html at /"
else fail "all-cloudflare-deploys AC-5"; sort -u "$req"; fi

# AC-6: no previous commit
newcase first; site "$FAKE/site.1" "$c2"; run first PREVIOUS_SHA=0000000000000000000000000000000000000000
if [ "$(rc first)" = 0 ] && has first "previous_version=unknown" && log first "removed-files check is skipped"; then
  pass "all-cloudflare-deploys AC-6: an all-zeros PREVIOUS_SHA gives previous_version=unknown"
else fail "all-cloudflare-deploys AC-6 (rc $(rc first))"; cat "$work/first.log"; fi

# AC-7: can't run, and fetches nothing
newcase http; site "$FAKE/site.1" "$c2"; run http SITE_URL=http://site.test
newcase sha; site "$FAKE/site.1" "$c2"; run sha BUILD_SHA="$c1"
sha_requests=$(wc -l <"$FAKE/requests")
newcase setting; site "$FAKE/site.1" "$c2"
cp "$r/CLAUDE.md" "$work/claude.bak"; echo x >"$r/CLAUDE.md"; run setting; cp "$work/claude.bak" "$r/CLAUDE.md"
if [ "$(rc http)" = 2 ] && [ "$(rc sha)" = 2 ] && [ "$(rc setting)" = 2 ] && [ "$sha_requests" = 0 ] \
  && [ ! -s "$work/fake.http/requests" ] && [ ! -s "$FAKE/requests" ]; then
  pass "all-cloudflare-deploys AC-7: exit 2 and no fetch for a bad SITE_URL, BUILD_SHA or setting"
else fail "all-cloudflare-deploys AC-7 (rc $(rc http) $(rc sha) $(rc setting))"; fi

# AC-9: CI's deploy job sets both values on its "---" env line
ci="$repo_root/.github/workflows/ci.yml"
block=$(sed -n '/- name: Deploy (scripts\/deploy.sh)/,/run: |/p' "$ci")
if grep -qF -- "# --- The project's deploy settings" <<<"$block" \
  && grep -qE '^ +SITE_URL: https://games\.meirmsn\.dev$' <<<"$block" \
  && grep -qE '^ +PREVIOUS_SHA: \$\{\{ github\.event\.before \}\}$' <<<"$block"; then
  pass "all-cloudflare-deploys AC-9: the deploy step sets SITE_URL and PREVIOUS_SHA"
else fail "all-cloudflare-deploys AC-9"; fi

[ "$fails" = 0 ] || { echo "deploy.test: $fails failed"; exit 1; }
echo "deploy.test: all passed"

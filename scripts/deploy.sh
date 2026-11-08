#!/usr/bin/env bash
# The deploy step for builds_previews_deploys: all-cloudflare (specs/all-cloudflare-deploys.md).
# Cloudflare's GitHub app builds and deploys every push to main; this script deploys nothing. It
# waits until SITE_URL serves this commit's site files byte for byte (and no longer serves files the
# commit removed), then writes what the devshop's deploy comment reads to $GITHUB_OUTPUT:
#   url, site_url, version, previous_version, rollback, deployed, site_smoke.
# Run by CI's deploy job on main, from the repo root's checkout of BUILD_SHA.
# Env: SITE_URL (https origin), BUILD_SHA (the checked-out commit), PREVIOUS_SHA (main before the
#   push; all zeros or missing = unknown), DEPLOY_TRIES (default 27), DEPLOY_WAIT (seconds between
#   tries, default 20), DEPLOY_JOBS (parallel fetches, default 8).
# The site files of a commit: its tracked files minus those its .assetsignore excludes (gitignore
# rules, as wrangler reads them). index.html is fetched at its directory's path.
# Exit 0 = live (this commit, or a newer main that includes it); 1 = not live in time; 2 = can't run.
set -uo pipefail
cd "$(dirname "$0")/.." || exit 2

out=${GITHUB_OUTPUT:-/dev/null}
tries=${DEPLOY_TRIES:-27}
wait=${DEPLOY_WAIT:-20}
jobs=${DEPLOY_JOBS:-8}
cant() { echo "deploy: can't run: $*" >&2; exit 2; }

grep -qxF 'builds_previews_deploys: all-cloudflare' CLAUDE.md 2>/dev/null ||
  cant "CLAUDE.md has no 'builds_previews_deploys: all-cloudflare' line; this script is for that setup only"
[[ ${SITE_URL:-} =~ ^https://[A-Za-z0-9.-]+$ ]] || cant "SITE_URL must be an https origin (got '${SITE_URL:-}')"
head=$(git rev-parse HEAD 2>/dev/null) || cant "not a git checkout"
[ "${BUILD_SHA:-}" = "$head" ] || cant "BUILD_SHA (${BUILD_SHA:-unset}) is not the checked-out commit ($head)"
for n in "$tries" "$wait" "$jobs"; do [[ $n =~ ^[0-9]+$ ]] || cant "DEPLOY_TRIES, DEPLOY_WAIT and DEPLOY_JOBS must be numbers"; done
worker=$(sed -nE 's/^[[:space:]]*"name"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/p' wrangler.jsonc | head -n 1)

tmp=$(mktemp -d) || cant "no temp dir"
trap 'rm -rf "$tmp"' EXIT

have() { git cat-file -e "$1^{commit}" 2>/dev/null; }
# The previous commit, fetched if this checkout is shallow; unknown when there is none.
prev=${PREVIOUS_SHA:-}
if [[ ! $prev =~ ^[0-9a-f]{40}$ ]] || [[ $prev =~ ^0+$ ]]; then
  prev=""
elif ! have "$prev"; then
  git fetch -q --depth=1 origin "$prev" 2>/dev/null || true
  have "$prev" || prev=""
fi

# site_files <commit>: one path per line, the files wrangler uploads for that commit.
site_files() {
  local idx="$tmp/index.$1" ign="$tmp/ignore.$1"
  git show "$1:.assetsignore" >"$ign" 2>/dev/null || : >"$ign"
  GIT_INDEX_FILE=$idx git read-tree "$1" || return 2
  comm -23 <(GIT_INDEX_FILE=$idx git -c core.quotePath=false ls-files -c | sort) \
    <(GIT_INDEX_FILE=$idx git -c core.quotePath=false ls-files -ci --exclude-from="$ign" | sort)
}
url_of() {
  case "$1" in
    index.html) echo "$SITE_URL/" ;;
    */index.html) echo "$SITE_URL/${1%index.html}" ;;
    *) echo "$SITE_URL/$1" ;;
  esac
}

# One file: "ok", or what is wrong with it, on stdout. Arg: one line "<commit> <same|gone> <path>"
# (the path may hold spaces).
check_one() {
  local sha mode f u code want got
  read -r sha mode f <<<"$1"
  u=$(url_of "$f"); u=${u// /%20}
  if [ "$mode" = gone ]; then
    code=$(curl -s -o /dev/null -w '%{http_code}' -L --max-time 20 -H 'Cache-Control: no-cache' "$u")
    [ "$code" = 404 ] && echo ok || echo "still served (HTTP $code): $f"
    return
  fi
  want=$(git cat-file blob "$sha:$f" | sha256sum | cut -c1-64)
  # A failed fetch adds a marker, so it never hashes like the file (an empty file included).
  got=$({ curl -fsSL --max-time 20 -H 'Cache-Control: no-cache' "$u" || printf '\nfetch failed: %s' "$f"; } | sha256sum | cut -c1-64)
  [ "$want" = "$got" ] && echo ok || echo "differs: $f"
}
export -f check_one url_of
export SITE_URL

# serves <commit> [<files removed since the previous commit>]: 0 when every site file matches (and
# each removed file is gone); else 1, with the first problem in $tmp/why.
serves() {
  local sha=$1 gone=${2:-}
  { site_files "$sha" | sed "s|^|$sha same |"
    [ -z "$gone" ] || sed "s|^|$sha gone |" "$gone"; } >"$tmp/todo" || return 2
  local rc=0
  xargs -a "$tmp/todo" -d '\n' -n 1 -P "$jobs" bash -c 'check_one "$1"' _ >"$tmp/result" 2>/dev/null || rc=$?
  if grep -v -m 1 -x ok "$tmp/result" >"$tmp/why"; then return 1; fi
  # Every file must have answered "ok": a checker that died without a word is not a match.
  if [ "$rc" != 0 ] || [ "$(grep -c -x ok "$tmp/result")" != "$(wc -l <"$tmp/todo")" ]; then
    echo "not every file was checked (xargs exit $rc)" >"$tmp/why"
    return 1
  fi
  return 0
}

head_list="$tmp/head.list"
site_files "$head" >"$head_list" || cant "can't list the site files of $head"
gone="$tmp/gone.list"
: >"$gone"
if [ -n "$prev" ]; then
  comm -23 <(site_files "$prev" | sort) <(sort "$head_list") >"$gone"
  previous=${prev:0:12}
  echo "deploy: checking $SITE_URL serves ${head:0:12} ($(wc -l <"$head_list") files; $(wc -l <"$gone") removed since ${previous})"
else
  previous=unknown
  echo "deploy: no previous commit (PREVIOUS_SHA '${PREVIOUS_SHA:-}'): the removed-files check is skipped"
  echo "deploy: checking $SITE_URL serves ${head:0:12} ($(wc -l <"$head_list") files)"
fi

rollback="Cloudflare dashboard: Workers & Pages → ${worker:-the Worker} → Deployments → roll back to the deployment before this one"
[ -z "$prev" ] || rollback+=" (commit \`${prev:0:12}\`)"
rollback+=", or revert the PR"
{
  echo "url=$SITE_URL/"
  echo "site_url=$SITE_URL"
  echo "previous_version=$previous"
  echo "rollback=$rollback"
} >>"$out"

left_previous=""   # set once the site stops serving the previous commit
[ -n "$prev" ] || left_previous=unknown
last="" streak=0 why=""
for ((i = 1; i <= tries; i++)); do
  live=""
  if serves "$head" "$gone"; then
    live=$head
  else
    why=$(cat "$tmp/why")
    # A newer main, which includes this commit, may already be live.
    if git fetch -q --depth=50 origin main 2>/dev/null; then
      tip=$(git rev-parse FETCH_HEAD)
      if [ "$tip" != "$head" ] && git merge-base --is-ancestor "$head" "$tip" 2>/dev/null && serves "$tip"; then
        live=$tip
      fi
    fi
  fi
  if [ -z "$left_previous" ]; then
    if [ "$live" = "$head" ] || ! serves "$prev"; then left_previous=yes; fi
  fi
  if [ -n "$live" ] && [ "$live" = "$last" ]; then streak=$((streak + 1)); elif [ -n "$live" ]; then streak=1; else streak=0; fi
  last=$live
  if [ "$streak" -ge 2 ]; then
    if [ "$live" = "$head" ]; then
      echo "deploy: $SITE_URL serves ${head:0:12} (twice in a row)"
      echo "version=${head:0:12}" >>"$out"
    else
      echo "deploy: $SITE_URL serves ${live:0:12}, a newer main that includes ${head:0:12}"
      echo "version=${head:0:12} (live: ${live:0:12}, a newer merge)" >>"$out"
    fi
    { echo "deployed=yes"; echo "site_smoke=passed"; } >>"$out"
    exit 0
  fi
  if [ -n "$live" ]; then echo "deploy: try $i/$tries: serves ${live:0:12}, once"; else echo "deploy: try $i/$tries: $why"; fi
  [ "$i" -lt "$tries" ] && sleep "$wait"
done

echo "version=${head:0:12}" >>"$out"
echo "site_smoke=failed" >>"$out"
if [ -n "$left_previous" ]; then
  echo "deployed=yes" >>"$out"
  echo "deploy: FAIL: $SITE_URL did not serve ${head:0:12} after $tries tries; the new version may be live. Last: $why" >&2
else
  echo "deploy: FAIL: $SITE_URL still serves ${previous} after $tries tries; production is unchanged. Last: $why" >&2
fi
exit 1

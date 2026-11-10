#!/usr/bin/env python3
"""A new version is a new sw.js (specs/pwa-updates.md): fail when the change since <base> touches a
file the site serves (anything .assetsignore doesn't exclude) without changing VERSION in sw.js.

Usage: scripts/version-check.py [base]   No base: nothing to compare, exit 0.
Exit 0 = fine; 1 = VERSION needs a bump; 2 = couldn't run."""
import os, re, subprocess, sys, tempfile

def git(*args, env=None):
    return subprocess.run(["git", *args], capture_output=True, text=True, check=True,
                          env={**os.environ, **(env or {})}).stdout

def ignored(rev):
    """The tracked files of <rev> its .assetsignore excludes, read as git (and wrangler) read it, as
    scripts/deploy.sh does."""
    with tempfile.TemporaryDirectory() as tmp:
        idx, ign = os.path.join(tmp, "index"), os.path.join(tmp, "ignore")
        try:
            text = git("show", f"{rev}:.assetsignore")
        except subprocess.CalledProcessError:
            text = ""
        open(ign, "w", encoding="utf-8").write(text)
        git("read-tree", rev, env={"GIT_INDEX_FILE": idx})
        return set(git("-c", "core.quotePath=false", "ls-files", "-ci", f"--exclude-from={ign}",
                       env={"GIT_INDEX_FILE": idx}).splitlines())

def version(text):
    m = re.search(r"^const VERSION = '([^']+)';", text, re.M)
    return m.group(1) if m else None

base = sys.argv[1] if len(sys.argv) > 1 else ""
if not base:
    print("version-check: no base given, nothing to compare"); sys.exit(0)
try:
    changed = [f for f in git("-c", "core.quotePath=false", "diff", "--name-only", f"{base}...HEAD").splitlines() if f]
    unserved = ignored(base) | ignored("HEAD")
    before = version(git("show", f"{base}:sw.js"))
    now = version(open("sw.js", encoding="utf-8").read())
except (subprocess.CalledProcessError, OSError) as e:
    print(f"version-check: couldn't run: {e}"); sys.exit(2)
if not now:
    print("version-check: no `const VERSION = '…';` line in sw.js"); sys.exit(2)

site = [f for f in changed if f not in unserved]
if not site:
    print("version-check: no file the site serves changed"); sys.exit(0)
if now != before:
    print(f"version-check: VERSION {before} -> {now}, {len(site)} site files changed"); sys.exit(0)
print(f"version-check: {len(site)} files the site serves changed (e.g. {site[0]}) but VERSION in sw.js "
      f"is still {now}: bump it so players get the Update button")
sys.exit(1)

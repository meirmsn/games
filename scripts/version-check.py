#!/usr/bin/env python3
"""A new version is a new sw.js (specs/pwa-updates.md): fail when the change since <base> touches a
file the site serves (anything .assetsignore doesn't exclude) without changing VERSION in sw.js.

Usage: scripts/version-check.py [base]   No base: nothing to compare, exit 0.
Exit 0 = fine; 1 = VERSION needs a bump; 2 = couldn't run."""
import re, subprocess, sys

def git(*args):
    return subprocess.run(["git", *args], capture_output=True, text=True, check=True).stdout

def version(text):
    m = re.search(r"^const VERSION = '([^']+)';", text, re.M)
    return m.group(1) if m else None

base = sys.argv[1] if len(sys.argv) > 1 else ""
if not base:
    print("version-check: no base given, nothing to compare"); sys.exit(0)
try:
    changed = [f for f in git("diff", "--name-only", f"{base}...HEAD").splitlines() if f]
    ignored = [l.strip().rstrip("/") for l in open(".assetsignore", encoding="utf-8")
               if l.strip() and not l.startswith("#")]
    before = version(git("show", f"{base}:sw.js"))
    now = version(open("sw.js", encoding="utf-8").read())
except (subprocess.CalledProcessError, OSError) as e:
    print(f"version-check: couldn't run: {e}"); sys.exit(2)
if not now:
    print("version-check: no `const VERSION = '…';` line in sw.js"); sys.exit(2)

def served(path):
    return not any(path == i or path.startswith(i + "/") for i in ignored)

site = [f for f in changed if served(f)]
if not site:
    print("version-check: no file the site serves changed"); sys.exit(0)
if now != before:
    print(f"version-check: VERSION {before} -> {now}, {len(site)} site files changed"); sys.exit(0)
print(f"version-check: {len(site)} files the site serves changed (e.g. {site[0]}) but VERSION in sw.js "
      f"is still {now}: bump it so players get the Update button")
sys.exit(1)

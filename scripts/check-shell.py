#!/usr/bin/env python3
"""Fail if a file the service worker precaches (SHELL in sw.js) is missing, or if a page's local
script, stylesheet, image or manifest reference points at a missing file."""
import glob, os, re, sys

ok = True
sw = open("sw.js", encoding="utf-8").read()
shell = re.search(r"const SHELL = \[(.*?)\];", sw, re.S)
if not shell:
    print("check-shell: no SHELL list in sw.js"); sys.exit(2)
entries = re.findall(r"'([^']+)'", shell.group(1))
for e in entries:
    path = "index.html" if e == "./" else e
    if not os.path.isfile(path):
        ok = False; print(f"missing precached file: {e}")

ATTR = re.compile(r'(?:src|href)="([^"#?]+)"')
for page in glob.glob("**/index.html", recursive=True):
    if page.startswith("node_modules/"): continue
    for ref in ATTR.findall(open(page, encoding="utf-8").read()):
        if re.match(r"^[a-z]+:", ref) or ref.startswith("//"): continue
        target = os.path.normpath(os.path.join(os.path.dirname(page), ref))
        if not os.path.exists(target):
            ok = False; print(f"broken reference: {page} -> {ref}")
print(f"check-shell: {len(entries)} precached files, {'ok' if ok else 'problems found'}")
sys.exit(0 if ok else 1)

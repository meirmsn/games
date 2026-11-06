#!/usr/bin/env python3
"""Fail if any relative link or image in a markdown file points at a missing file."""
import glob, os, re, sys, urllib.parse

CODE = re.compile(r"```.*?```|`[^`\n]+`", re.S)  # code is quoted, not linked
LINK = re.compile(r'(?:src|href)="([^"]+)"|\]\(([^)\s]+)\)')
broken = checked = 0
for md in glob.glob("**/*.md", recursive=True):
    if md.startswith("node_modules/"):
        continue
    text = CODE.sub("", open(md, encoding="utf-8").read())
    for m in LINK.finditer(text):
        url = (m.group(1) or m.group(2)).split("#")[0]
        if not url or re.match(r"^[a-z]+:", url):
            continue
        checked += 1
        target = os.path.normpath(os.path.join(os.path.dirname(md), urllib.parse.unquote(url)))
        if not os.path.exists(target):
            broken += 1
            print(f"broken: {md} -> {url}")
print(f"{checked} local links checked, {broken} broken")
sys.exit(1 if broken else 0)

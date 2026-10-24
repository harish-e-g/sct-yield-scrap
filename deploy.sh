#!/usr/bin/env bash
# Stamp a new build id into index.html and version.json, commit and push to GitHub Pages.
set -euo pipefail
cd "$(dirname "$0")"
V=$(date -u +%Y%m%d%H%M%S)
OLD=$(grep -o 'name="build" content="[^"]*"' index.html | sed 's/.*content="//;s/"//')
sed -i "s/$OLD/$V/g" index.html
printf '{"v":"%s"}\n' "$V" > version.json
git add -A
git -c user.name="Harish E G" -c user.email="harishesakkiyappan@gmail.com" commit -qm "${1:-Update dashboard} (build $V)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011btDseGnv85wufvUc8bPKd"
git push -q
echo "Deployed build $V"

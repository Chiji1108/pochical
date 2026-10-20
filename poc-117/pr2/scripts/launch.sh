#!/bin/bash
# launch.sh <log name>: installs the built app on sim A and runs it, its prints to <name>.log.
set -u
S=/private/tmp/claude-501/-Users-chiji-js-pochical--claude-worktrees-serene-wing-a4ff85/f7887dad-3eb8-4bb5-a39c-1e843ed85269/scratchpad/p2
SIM=4E8334EF-B5E7-4CB3-9D6B-E04F6B754EFB
xcrun simctl terminate $SIM app.pochical >/dev/null 2>&1
xcrun simctl install $SIM "$S/dd/Build/Products/Debug-iphonesimulator/Pochical.app"
nohup xcrun simctl launch --terminate-running-process --console-pty $SIM app.pochical > "$S/$1.log" 2>&1 &
sleep 3
echo launched

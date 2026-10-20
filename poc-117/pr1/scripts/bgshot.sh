#!/bin/bash
# bgshot.sh <name>: with the chat open, the keyboard up, screenshots before
# the background and after coming back.
set -u
SIM=9B0E841D-9B7B-4719-B62A-EE9794B67A17
D=/private/tmp/claude-501/-Users-chiji-js-pochical--claude-worktrees-serene-wing-a4ff85/f7887dad-3eb8-4bb5-a39c-1e843ed85269/scratchpad/navprobe
agent-device press 200 812 > /dev/null 2>&1
sleep 2
agent-device screenshot "$D/app/$1-bg-before.png" > /dev/null 2>&1
xcrun simctl launch $SIM com.apple.Preferences > /dev/null
sleep 3
xcrun simctl launch $SIM app.pochical > /dev/null
sleep 3
agent-device screenshot "$D/app/$1-bg-after.png" > /dev/null 2>&1
python3 -I "$D/scripts/sheet.py" "$D/app/$1-bg.png" 260 "$D/app/$1-bg-before.png" "$D/app/$1-bg-after.png"

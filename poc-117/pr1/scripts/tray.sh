#!/bin/bash
# tray.sh: with the photo picker open over the chat, picks two photos, and
# the tray comes; then each photo's × takes them off, and the tray goes.
set -u
source /private/tmp/claude-501/-Users-chiji-js-pochical--claude-worktrees-serene-wing-a4ff85/f7887dad-3eb8-4bb5-a39c-1e843ed85269/scratchpad/navprobe/scripts/lib.sh
begin tray
agent-device press 66 397 > /dev/null 2>&1
agent-device press 200 397 > /dev/null 2>&1
step "photos picked, tray comes"
agent-device press 364 134 > /dev/null 2>&1
sleep 3
agent-device screenshot "$D/app/tray-1.png" > /dev/null 2>&1
step "one photo off"
agent-device press label=1枚目の写真を外す > /dev/null 2>&1
sleep 1.5
step "tray goes"
agent-device press label=1枚目の写真を外す > /dev/null 2>&1
sleep 1.5
agent-device screenshot "$D/app/tray-2.png" > /dev/null 2>&1
end
python3 -I "$D/scripts/analyze.py" "$D/app/tray.dbg" "$STEPS"

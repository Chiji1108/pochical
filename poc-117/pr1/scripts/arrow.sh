#!/bin/bash
# arrow.sh <name>: scrolls up, taps ↓, and counts the frames the lines took
# back to the latest (one with motion reduced).
set -u
source /private/tmp/claude-501/-Users-chiji-js-pochical--claude-worktrees-serene-wing-a4ff85/f7887dad-3eb8-4bb5-a39c-1e843ed85269/scratchpad/navprobe/scripts/lib.sh
begin "$1"
step "scroll up"
agent-device gesture pan 200 250 0 450 500 > /dev/null 2>&1
sleep 2
agent-device screenshot "$D/app/$1-arrow.png" > /dev/null 2>&1
step "arrow tapped"
agent-device press label=最新のメッセージへ > /dev/null 2>&1
sleep 2
end
python3 -I "$D/scripts/analyze.py" "$D/app/$1.dbg" "$STEPS"

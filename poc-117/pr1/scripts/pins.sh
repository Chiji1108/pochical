#!/bin/bash
# pins.sh: the pins opened and closed over the lines, which stay where
# they are.
set -u
source /private/tmp/claude-501/-Users-chiji-js-pochical--claude-worktrees-serene-wing-a4ff85/f7887dad-3eb8-4bb5-a39c-1e843ed85269/scratchpad/navprobe/scripts/lib.sh
begin pins
step "pins open"
agent-device press label=ピン留めをすべて表示 > /dev/null 2>&1
sleep 1.5
agent-device screenshot "$D/app/pins-open.png" > /dev/null 2>&1
step "pins closed"
agent-device press label=ピン留めをすべて表示 > /dev/null 2>&1
agent-device press label=閉じる > /dev/null 2>&1
sleep 1.5
agent-device screenshot "$D/app/pins-closed.png" > /dev/null 2>&1
end
python3 -I "$D/scripts/analyze.py" "$D/app/pins.dbg" "$STEPS"
grep "POC117DBG layout" "$D/app/pins.dbg" | sed 's/.*POC117DBG //' | cut -c80-200 | uniq

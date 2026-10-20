#!/bin/bash
# peek.sh: opens the chat, writes a word, and lists the buttons there.
set -u
source /private/tmp/claude-501/-Users-chiji-js-pochical--claude-worktrees-serene-wing-a4ff85/f7887dad-3eb8-4bb5-a39c-1e843ed85269/scratchpad/navprobe/scripts/lib.sh
relaunch
agent-device press label=グループ > /dev/null 2>&1
sleep 1
openchat
field
sleep 1
agent-device type "テスト"
agent-device snapshot -i | grep -E "button|text" | tail -12

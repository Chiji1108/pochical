#!/bin/bash
# openlatest.sh: relaunches the app, opens the group chat, and goes to its
# latest line. Run from the agent-device session's directory.
set -u
bash /private/tmp/claude-501/-Users-chiji-js-pochical--claude-worktrees-serene-wing-a4ff85/f7887dad-3eb8-4bb5-a39c-1e843ed85269/scratchpad/navprobe/scripts/hub.sh
agent-device press 231 404 > /dev/null 2>&1
sleep 2
agent-device press label=最新のメッセージへ > /dev/null 2>&1
sleep 1.5

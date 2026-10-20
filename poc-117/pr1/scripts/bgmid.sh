#!/bin/bash
# bgmid.sh <name>: scrolled up from the latest, the keyboard up, screenshots
# before the background and after coming back.
set -u
D=/private/tmp/claude-501/-Users-chiji-js-pochical--claude-worktrees-serene-wing-a4ff85/f7887dad-3eb8-4bb5-a39c-1e843ed85269/scratchpad/navprobe
agent-device press 385 300 > /dev/null 2>&1
sleep 1
agent-device gesture pan 200 250 0 450 500 > /dev/null 2>&1
sleep 2
bash "$D/scripts/bgshot.sh" "$1-mid"

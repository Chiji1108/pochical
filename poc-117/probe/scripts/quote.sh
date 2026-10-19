#!/bin/bash
# quote.sh <name> <line y>: records, keyboard down at start, replying to a
# line from its menu, taking the quote off with ×, putting the keyboard
# away with a tap beside the lines, replying again with the keyboard down
# by a drag, and taking that quote off too.
set -u
DIR=/private/tmp/claude-501/-Users-chiji-js-pochical--claude-worktrees-serene-wing-a4ff85/f7887dad-3eb8-4bb5-a39c-1e843ed85269/scratchpad/probe
Y=${2:-700}
bash $DIR/rec.sh start "$1"
agent-device longpress 150 "$Y" 700 > /dev/null 2>&1
sleep 1
agent-device press 100 411 > /dev/null 2>&1
sleep 2.5
agent-device press label="返信をやめる" > /dev/null 2>&1
sleep 2.5
agent-device press 392 250 > /dev/null 2>&1
sleep 2.5
bash $DIR/rec.sh stop
echo recorded

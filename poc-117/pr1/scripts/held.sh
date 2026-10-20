#!/bin/bash
# held.sh <name> <x> <y>: records a long press held 3 s at x y, stamping
# before, during and after, and counts the cells (attribute.py).
set -u
P=/private/tmp/claude-501/-Users-chiji-js-pochical--claude-worktrees-serene-wing-a4ff85/f7887dad-3eb8-4bb5-a39c-1e843ed85269/scratchpad/probe
S=$P/steps-$1.log
: > "$S"
bash $P/rec.sh start "$1"
python3 -I $P/stamp.py "$S" before
sleep 1
python3 -I $P/stamp.py "$S" "long press held 3 s"
agent-device longpress "$2" "$3" 3000 > /dev/null 2>&1
python3 -I $P/stamp.py "$S" "after release"
sleep 2
bash $P/rec.sh stop
sleep 1
python3 -I $P/attribute.py $P/dbg.log "$S"

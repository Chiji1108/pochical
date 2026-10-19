#!/bin/bash
# grow.sh <name>: with the keyboard up and the field empty, records the
# field growing as words are pasted from the keyboard's paste bar (which
# leaves the keyboard where it is), five times, then sending them. Counts
# the cells meanwhile.
set -u
P=/private/tmp/claude-501/-Users-chiji-js-pochical--claude-worktrees-serene-wing-a4ff85/f7887dad-3eb8-4bb5-a39c-1e843ed85269/scratchpad/probe
S=$P/steps-$1.log
: > "$S"
bash $P/rec.sh start "$1"
python3 -I $P/stamp.py "$S" "still"
sleep 1
for n in 1 2 3 4 5; do
  python3 -I $P/stamp.py "$S" "paste $n"
  agent-device press 200 555 > /dev/null 2>&1
  sleep 1.5
done
python3 -I $P/stamp.py "$S" "send"
agent-device press label="送る" > /dev/null 2>&1
sleep 2
python3 -I $P/stamp.py "$S" "after"
bash $P/rec.sh stop
sleep 1
python3 -I $P/attribute.py $P/dbg.log "$S"

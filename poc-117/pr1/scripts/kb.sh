#!/bin/bash
# kb.sh <name>: the keyboard up and down twice, measured, then the + menu
# with the keyboard up, screenshot app/<name>-plus.png.
set -u
source /private/tmp/claude-501/-Users-chiji-js-pochical--claude-worktrees-serene-wing-a4ff85/f7887dad-3eb8-4bb5-a39c-1e843ed85269/scratchpad/navprobe/scripts/lib.sh
bash "$D/scripts/openlatest.sh"
begin "$1"
for i in 1 2; do
  step "keyboard up $i"
  field
  sleep 1.5
  step "keyboard down $i"
  agent-device press 385 300 > /dev/null 2>&1
  sleep 1.5
done
step "plus menu"
field
sleep 1.5
agent-device press label=写真や日にちを送る > /dev/null 2>&1
sleep 1.5
agent-device screenshot "$D/app/$1-plus.png" > /dev/null 2>&1
end
python3 -I "$D/scripts/analyze.py" "$D/app/$1.dbg" "$STEPS"

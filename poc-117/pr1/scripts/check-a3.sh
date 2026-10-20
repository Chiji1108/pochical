#!/bin/bash
# check-a3.sh: the notification prompt up over the chat: refused, then the
# keyboard up and down.
set -u
source /private/tmp/claude-501/-Users-chiji-js-pochical--claude-worktrees-serene-wing-a4ff85/f7887dad-3eb8-4bb5-a39c-1e843ed85269/scratchpad/navprobe/scripts/lib.sh
shot() { agent-device screenshot "$D/app/a3-$1.png" > /dev/null 2>&1; }
say() { echo "$1: $(lastlayout)"; }
begin check-a3
step "refuse the prompt"
agent-device press label=許可しない > /dev/null 2>&1
sleep 1.5
step "keyboard up"
field
sleep 1.5
say "keyboard up after the prompt"
shot 1-up
step "keyboard down"
agent-device press 380 250 > /dev/null 2>&1
sleep 1.5
say "keyboard down after the prompt"
step "keyboard up"
field
sleep 1.5
say "keyboard up again"
end

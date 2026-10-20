#!/bin/bash
# check-a2.sh: (a) the tabs switching under an open chat (the instrumented
# build flips the tab 4 s after a page opens over them, -poc117tabflip),
# then the keyboard down and up, and back to the tabs.
set -u
source /private/tmp/claude-501/-Users-chiji-js-pochical--claude-worktrees-serene-wing-a4ff85/f7887dad-3eb8-4bb5-a39c-1e843ed85269/scratchpad/navprobe/scripts/lib.sh
shot() { agent-device screenshot "$D/app/a2-$1.png" > /dev/null 2>&1; }
say() { echo "$1: $(lastlayout)"; }
xcrun simctl terminate $SIM app.pochical > /dev/null 2>&1
begin check-a2
xcrun simctl launch $SIM app.pochical -poc117tabflip > /dev/null
sleep 3
agent-device open app.pochical --platform ios --udid $SIM > /dev/null 2>&1
agent-device press label=グループ > /dev/null 2>&1
sleep 1
step "open chat"
openchat
field
sleep 1.5
say "keyboard up"
step "tab flips under the chat"
sleep 4
say "after the flip"
step "keyboard down"
agent-device press 380 250 > /dev/null 2>&1
sleep 1.5
say "keyboard down"
step "keyboard up"
field
sleep 1.5
say "keyboard up"
shot 1-up-after-flip
step "back to the tabs"
agent-device back > /dev/null 2>&1
sleep 1.5
shot 2-tabs
end
grep -E "POC117DBG (app|tab)" "$D/app/check-a2.dbg" | sed 's/.*POC117DBG //'

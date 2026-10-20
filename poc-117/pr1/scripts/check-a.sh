#!/bin/bash
# check-a.sh: (a) the chat's keyboard guide across the background, the
# notification prompt's alert, and the tabs switching under the chat.
# Each state's last layout as the instrumented build logged it, and a
# screenshot in app/a-*.png.
set -u
source /private/tmp/claude-501/-Users-chiji-js-pochical--claude-worktrees-serene-wing-a4ff85/f7887dad-3eb8-4bb5-a39c-1e843ed85269/scratchpad/navprobe/scripts/lib.sh
shot() { agent-device screenshot "$D/app/a-$1.png" > /dev/null 2>&1; }
say() { echo "$1: $(lastlayout)"; }
xcrun simctl terminate $SIM app.pochical > /dev/null 2>&1
begin check-a
relaunch
agent-device press label=グループ > /dev/null 2>&1
sleep 1
step "open chat"
openchat
step "keyboard up"
field
sleep 1.5
say "keyboard up"
step "background"
xcrun simctl launch $SIM com.apple.Preferences > /dev/null
sleep 3
step "foreground"
xcrun simctl launch $SIM app.pochical > /dev/null
sleep 2.5
say "back from the background"
shot 1-after-background
step "keyboard down"
agent-device press 380 250 > /dev/null 2>&1
sleep 1.5
say "keyboard down"
step "keyboard up again"
field
sleep 1.5
say "keyboard up again"
shot 2-up-again
step "send (asks for notifications the first time)"
agent-device type "通知の確認" > /dev/null 2>&1
agent-device press label=送る > /dev/null 2>&1
sleep 2
shot 3-alert
say "alert over the chat"
agent-device press label=許可しない > /dev/null 2>&1
sleep 1.5
say "alert gone"
step "keyboard down after the alert"
agent-device press 380 250 > /dev/null 2>&1
sleep 1.5
say "keyboard down"
step "keyboard up after the alert"
field
sleep 1.5
say "keyboard up"
shot 4-after-alert
end
grep -E "POC117DBG (app|tab)" "$D/app/check-a.dbg" | sed 's/.*POC117DBG //'

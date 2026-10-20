#!/bin/bash
# support.sh: the chat with Pochical's people: a line sent, the keyboard
# down and up, the composer growing and shrinking, the photo-only +.
set -u
source /private/tmp/claude-501/-Users-chiji-js-pochical--claude-worktrees-serene-wing-a4ff85/f7887dad-3eb8-4bb5-a39c-1e843ed85269/scratchpad/navprobe/scripts/lib.sh
xcrun simctl terminate $SIM app.pochical > /dev/null 2>&1
xcrun simctl launch $SIM app.pochical > /dev/null
sleep 3
agent-device open app.pochical --platform ios --udid $SIM > /dev/null 2>&1
agent-device press 287 820 > /dev/null 2>&1
sleep 1
agent-device scroll down 5 > /dev/null 2>&1
sleep 1
agent-device press 'label="作っている人とチャット、まだメッセージはありません"' > /dev/null 2>&1
agent-device find 作っている人とチャット > /dev/null 2>&1
sleep 2
begin support
step "keyboard up"
field
sleep 1.5
step "a line sent"
agent-device type "チャット画面の確認です" > /dev/null 2>&1
agent-device press label=送る > /dev/null 2>&1
sleep 2
step "keyboard down"
agent-device press 385 300 > /dev/null 2>&1
sleep 1.5
step "keyboard up again"
field
sleep 1.5
step "composer grows"
agent-device type "シフトの交代をお願いできますか。来週の土曜の夜です。代わりに日曜の朝に入れます。店長にはもう話してあります。よろしくお願いします。" > /dev/null 2>&1
sleep 1.5
agent-device screenshot "$D/app/support-grown.png" > /dev/null 2>&1
step "composer shrinks"
agent-device fill "editable=true" "" > /dev/null 2>&1
sleep 1.5
step "keyboard down"
agent-device press 385 300 > /dev/null 2>&1
sleep 1.5
agent-device screenshot "$D/app/support-down.png" > /dev/null 2>&1
end
python3 -I "$D/scripts/analyze.py" "$D/app/support.dbg" "$STEPS"

#!/bin/bash
# pr1.sh <name>: the PR 1 list in the group chat, at its latest line,
# each step stamped, logged by the instrumented build and recorded, with a
# screenshot of each settled state in app/<name>-NN.png. Run from the
# agent-device session's directory, with the chat open at its latest.
set -u
source /private/tmp/claude-501/-Users-chiji-js-pochical--claude-worktrees-serene-wing-a4ff85/f7887dad-3eb8-4bb5-a39c-1e843ed85269/scratchpad/navprobe/scripts/lib.sh
N=0
shot() { N=$((N + 1)); agent-device screenshot "$D/app/$NAME-$(printf %02d $N)-$1.png" > /dev/null 2>&1; }
lines() { agent-device press 385 300 > /dev/null 2>&1; }
own() { agent-device longpress 310 712 700 > /dev/null 2>&1; sleep 1; }
begin "$1"
step "keyboard up (tap the field)"
field
sleep 1.5
shot keyboard-up
step "keyboard down (tap beside the lines)"
lines
sleep 1.5
step "quote on from the menu (keyboard comes up)"
own
agent-device press label=返信 > /dev/null 2>&1
sleep 1.5
shot quote-on
step "quote off, keyboard up"
agent-device press label=返信をやめる > /dev/null 2>&1
sleep 1.5
shot quote-off
step "keyboard down"
lines
sleep 1.5
step "quote on again"
own
agent-device press label=返信 > /dev/null 2>&1
sleep 1.5
step "keyboard down under the quote"
lines
sleep 1.5
step "quote off, keyboard down"
agent-device press label=返信をやめる > /dev/null 2>&1
sleep 1.5
shot quote-off-keyboard-down
step "keyboard up for the words"
field
sleep 1.5
step "composer grows to 5 lines"
agent-device type "シフトの交代をお願いできますか。来週の土曜の夜です。代わりに日曜の朝に入れます。店長にはもう話してあります。よろしくお願いします。返事は今日中だと助かります。" > /dev/null 2>&1
sleep 1.5
shot grown
step "composer shrinks to 1 line"
agent-device fill "editable=true" "" > /dev/null 2>&1
sleep 1.5
step "@ list comes"
agent-device type "@" > /dev/null 2>&1
sleep 1.5
shot mentions
step "@ list goes"
agent-device press label=削除 > /dev/null 2>&1
agent-device fill "editable=true" "" > /dev/null 2>&1
sleep 1.5
step "link preview arrives"
agent-device type "https://pochical.app " > /dev/null 2>&1
sleep 3
shot preview
step "link preview x"
agent-device press label=リンクのプレビューを付けない > /dev/null 2>&1
sleep 1.5
step "words cleared"
agent-device fill "editable=true" "" > /dev/null 2>&1
sleep 1.5
step "keyboard down before 編集"
lines
sleep 1.5
step "edit bar from the menu"
own
agent-device press label=編集 > /dev/null 2>&1
sleep 1.5
shot editing
step "edit stopped"
agent-device press label=編集をやめる > /dev/null 2>&1
sleep 1.5
step "keyboard down after 編集"
lines
sleep 1.5
step "keyboard up before the drag"
field
sleep 1.5
step "drag the keyboard down, let go part way (cancelled)"
agent-device gesture pan 200 300 0 170 900 > /dev/null 2>&1
sleep 1.5
shot drag-cancelled
step "drag the keyboard down all the way (dismissed)"
agent-device gesture pan 200 300 0 520 900 > /dev/null 2>&1
sleep 1.5
shot drag-dismissed
step "scroll up for the arrow"
agent-device gesture pan 200 250 0 450 500 > /dev/null 2>&1
sleep 1.5
shot arrow
step "arrow tapped"
agent-device press label=最新のメッセージへ > /dev/null 2>&1
sleep 2
step "pin from the menu"
own
agent-device press label=ピン留め > /dev/null 2>&1
sleep 2
shot pinned
step "keyboard up under the pin"
field
sleep 1.5
shot pinned-keyboard
step "keyboard down under the pin"
lines
sleep 1.5
end
python3 -I "$D/scripts/analyze.py" "$D/app/$NAME.dbg" "$STEPS"

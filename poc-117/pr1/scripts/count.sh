#!/bin/bash
# count.sh <steps.log>: drives the chat through the moves whose cells are
# counted (attribute.py), stamping each step as it begins.
set -u
DIR=/private/tmp/claude-501/-Users-chiji-js-pochical--claude-worktrees-serene-wing-a4ff85/f7887dad-3eb8-4bb5-a39c-1e843ed85269/scratchpad/probe
S=$1
: > "$S"
step() { python3 -I "$DIR/stamp.py" "$S" "$@"; }
step idle
sleep 2
step "keyboard up (tap the field)"
agent-device press 200 812 > /dev/null 2>&1
sleep 2
step "composer grows (words wrap to 3 lines)"
agent-device type "シフトの交代をお願いできますか。来週の土曜の夜です。代わりに日曜の朝に入れます。" > /dev/null 2>&1
sleep 2
step "composer shrinks (words cleared)"
agent-device fill label="メッセージ" "あ" > /dev/null 2>&1
sleep 2
step "keyboard down (tap beside the lines)"
agent-device press 392 250 > /dev/null 2>&1
sleep 2
step "quote added from the menu (keyboard comes up)"
agent-device longpress 150 680 700 > /dev/null 2>&1
sleep 1
agent-device press 100 411 > /dev/null 2>&1
sleep 2
step "quote removed (keyboard up)"
agent-device press label="返信をやめる" > /dev/null 2>&1
sleep 2
step "interactive dismiss (drag lines down into keyboard)"
agent-device gesture pan 200 300 0 450 900 > /dev/null 2>&1
sleep 2
step "keyboard up again"
agent-device press 200 812 > /dev/null 2>&1
sleep 2
step "long press held while the keyboard goes down"
agent-device longpress 150 300 2500 > /dev/null 2>&1
sleep 2
step "menu closed"
agent-device press 200 120 > /dev/null 2>&1
sleep 2
step done

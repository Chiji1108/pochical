#!/bin/bash
# beforeafter.sh <prefix>: records, on the app installed now, the chat
# pushed from the hub, then a quote put on and taken off with the keyboard
# up, to app/<prefix>-push.mp4 and app/<prefix>-quote.mp4. Run from the
# agent-device session's directory.
set -u
P=/private/tmp/claude-501/-Users-chiji-js-pochical--claude-worktrees-serene-wing-a4ff85/f7887dad-3eb8-4bb5-a39c-1e843ed85269/scratchpad/navprobe
bash $P/scripts/hub.sh
bash $P/scripts/clip.sh "$1-push" agent-device press 231 404
agent-device press label=最新のメッセージへ > /dev/null 2>&1
sleep 1.5
agent-device fill "editable=true" "" > /dev/null 2>&1
agent-device press 385 300 > /dev/null 2>&1
sleep 1.5
agent-device longpress 310 712 700 > /dev/null 2>&1
sleep 1
agent-device press label=返信 > /dev/null 2>&1
sleep 2
bash $P/scripts/clip.sh "$1-quote" agent-device press label=返信をやめる

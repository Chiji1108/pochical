#!/bin/bash
# check-e.sh: what a chat opens is pushed over it, over the tabs: ⋯ 写真,
# ⋯ みんなのシフト, the title's グループの設定; the support row in 設定.
# Screenshots app/e-*.png. Run from the session's directory, on the hub.
set -u
P=/private/tmp/claude-501/-Users-chiji-js-pochical--claude-worktrees-serene-wing-a4ff85/f7887dad-3eb8-4bb5-a39c-1e843ed85269/scratchpad/navprobe
shot() { agent-device screenshot "$P/app/e-$1.png" > /dev/null 2>&1; }
back() { agent-device press 37 84 > /dev/null 2>&1; sleep 1.5; }
agent-device press 231 404 > /dev/null 2>&1
sleep 2
agent-device press 363 84 > /dev/null 2>&1
sleep 1
agent-device press label=写真 > /dev/null 2>&1
sleep 2
shot 1-photos
back
agent-device press 363 84 > /dev/null 2>&1
sleep 1
agent-device press label=みんなのシフト > /dev/null 2>&1
sleep 2
shot 2-shifts
back
agent-device press 201 84 > /dev/null 2>&1
sleep 2
shot 3-group-settings
back
shot 4-chat-again
back
shot 5-hub
agent-device press 287 820 > /dev/null 2>&1
sleep 1
agent-device back > /dev/null 2>&1
sleep 1
agent-device find 作っている人とチャット > /dev/null 2>&1
sleep 2
shot 6-support
back
shot 7-settings

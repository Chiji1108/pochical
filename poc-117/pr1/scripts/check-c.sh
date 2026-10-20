#!/bin/bash
# check-c.sh: (c) the tabs keep their own stacks, titles, toolbars and
# state: 月で見る pushed in グループ, シフトパターン in 設定, back to グループ
# still on its page; then a chat over the グループ tab's pushed page, and
# back to it. Screenshots in app/c-*.png. Run from the session's directory,
# on the hub.
set -u
P=/private/tmp/claude-501/-Users-chiji-js-pochical--claude-worktrees-serene-wing-a4ff85/f7887dad-3eb8-4bb5-a39c-1e843ed85269/scratchpad/navprobe
shot() { agent-device screenshot "$P/app/c-$1.png" > /dev/null 2>&1; }
agent-device press label=月で見る > /dev/null 2>&1
sleep 2
shot 1-group-shifts
agent-device press 287 820 > /dev/null 2>&1
sleep 1.5
agent-device press label=シフトパターン > /dev/null 2>&1
sleep 2
shot 2-settings-patterns
agent-device press 201 820 > /dev/null 2>&1
sleep 1.5
shot 3-group-shifts-kept
agent-device press 287 820 > /dev/null 2>&1
sleep 1.5
shot 4-settings-patterns-kept

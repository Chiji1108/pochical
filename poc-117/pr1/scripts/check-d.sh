#!/bin/bash
# check-d.sh: (d) notification taps (the instrumented build's -poc117open
# sets what a tap sets: the group chat at 8 s, Pochical's people's at 14 s,
# the group chat again at 20 s), from 設定's pushed page; then back. Then
# the widget's group link and the support row. Screenshots app/d-*.png.
set -u
SIM=9B0E841D-9B7B-4719-B62A-EE9794B67A17
P=/private/tmp/claude-501/-Users-chiji-js-pochical--claude-worktrees-serene-wing-a4ff85/f7887dad-3eb8-4bb5-a39c-1e843ed85269/scratchpad/navprobe
shot() { agent-device screenshot "$P/app/d-$1.png" > /dev/null 2>&1; }
xcrun simctl terminate $SIM app.pochical > /dev/null 2>&1
xcrun simctl launch $SIM app.pochical -poc117open 169f82cb-e135-4cd6-989b-74988ff9029d group > /dev/null
START=$(date +%s)
sleep 2.5
agent-device open app.pochical --platform ios --udid $SIM > /dev/null 2>&1
agent-device press 287 820 > /dev/null 2>&1
sleep 1
agent-device press label=シフトパターン > /dev/null 2>&1
shot 0-settings-page
until [ $(( $(date +%s) - START )) -ge 11 ]; do sleep 0.2; done
shot 1-group-chat-tap
until [ $(( $(date +%s) - START )) -ge 17 ]; do sleep 0.2; done
shot 2-support-tap
until [ $(( $(date +%s) - START )) -ge 23 ]; do sleep 0.2; done
shot 3-group-chat-tap-again
agent-device press 37 84 > /dev/null 2>&1
sleep 1.5
shot 4-back
agent-device press 287 820 > /dev/null 2>&1
sleep 1.5
shot 5-settings-tab

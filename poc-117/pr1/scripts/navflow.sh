#!/bin/bash
# navflow.sh <name> <root>: records pushing the chat from tab A, popping by
# the back button, pushing again, an interactive swipe back cancelled
# half way, one completed, then tab A's own push.
set -u
SIM=9B0E841D-9B7B-4719-B62A-EE9794B67A17
D=/private/tmp/claude-501/-Users-chiji-js-pochical--claude-worktrees-serene-wing-a4ff85/f7887dad-3eb8-4bb5-a39c-1e843ed85269/scratchpad/navprobe
NAME=$1; ROOT=$2
S=$D/out/$NAME.steps
: > "$S"
step() { python3 -I "$D/scripts/stamp2.py" "$S" "$@"; }
xcrun simctl install $SIM "$D/dd/Build/Products/Debug-iphonesimulator/Probe.app"
xcrun simctl launch --terminate-running-process $SIM app.pochical.probe -root $ROOT > /dev/null
sleep 1
agent-device open app.pochical.probe --platform ios --udid $SIM
sleep 2
xcrun simctl io $SIM recordVideo --codec=h264 --force "$D/out/$NAME.mp4" >/dev/null 2>&1 &
REC=$!
step rec
sleep 1.5
step "push chat"
agent-device press label="Chat" > /dev/null 2>&1
sleep 2
step "pop by back button"
agent-device back > /dev/null 2>&1
sleep 2
step "push chat again"
agent-device press label="Chat" > /dev/null 2>&1
sleep 2
step "swipe back, cancelled"
agent-device gesture pan 3 450 120 0 1500 > /dev/null 2>&1
sleep 2
step "swipe back, completed"
agent-device gesture pan 3 450 330 0 1500 > /dev/null 2>&1
sleep 2
step "tab A inner push"
agent-device press label="Inner" > /dev/null 2>&1
sleep 2
step "tab B, then back to A"
agent-device press label="B" > /dev/null 2>&1
sleep 1.5
agent-device press label="A" > /dev/null 2>&1
sleep 2
step done
kill -INT $REC
wait $REC
cat "$S"

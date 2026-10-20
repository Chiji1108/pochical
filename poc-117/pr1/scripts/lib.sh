#!/bin/bash
# lib.sh: what the app checks share. Source it.
SIM=9B0E841D-9B7B-4719-B62A-EE9794B67A17
D=/private/tmp/claude-501/-Users-chiji-js-pochical--claude-worktrees-serene-wing-a4ff85/f7887dad-3eb8-4bb5-a39c-1e843ed85269/scratchpad/navprobe
mkdir -p "$D/app"
# step <steps file> <label>: notes a step begins now.
step() { python3 -I "$D/scripts/stamp2.py" "$STEPS" "$@"; }
# begin <name>: starts the log stream and the recording, and the steps file.
begin() {
  NAME=$1
  STEPS=$D/app/$NAME.steps
  : > "$STEPS"
  xcrun simctl spawn $SIM log stream --level debug --style compact \
    --predicate 'eventMessage CONTAINS "POC117DBG"' > "$D/app/$NAME.dbg" 2>&1 &
  LOGP=$!
  xcrun simctl io $SIM recordVideo --codec=h264 --force "$D/app/$NAME.mp4" > /dev/null 2>&1 &
  RECP=$!
  step rec
  sleep 1.5
}
# end: stops both.
end() {
  step end
  sleep 0.5
  kill -INT $RECP
  wait $RECP
  kill $LOGP
  wait $LOGP 2> /dev/null
}
# relaunch: the app anew, on the グループ tab's hub.
relaunch() {
  xcrun simctl terminate $SIM app.pochical > /dev/null 2>&1
  xcrun simctl launch $SIM app.pochical > /dev/null
  sleep 3
  agent-device open app.pochical --platform ios --udid $SIM > /dev/null 2>&1
}
# openchat: 全体チャット from the hub.
openchat() {
  agent-device find 全体チャット > /dev/null 2>&1
  sleep 1.5
}
field() { agent-device press 200 812 > /dev/null 2>&1; }
# guide: the last layout's keyboard guide and composer, as logged.
lastlayout() { grep "POC117DBG layout" "$D/app/$NAME.dbg" | tail -1 | sed 's/.*POC117DBG //'; }

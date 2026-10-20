#!/bin/bash
# run.sh <name> <seconds> <app args...>: launches the probe pushed into its
# chat, records the screen, and keeps its log as out/<name>.log/.mp4.
set -u
SIM=E24D45FF-4C63-4B51-AE21-808A0D99BA1F
DIR=/private/tmp/claude-501/-Users-chiji-js-pochical--claude-worktrees-serene-wing-a4ff85/f7887dad-3eb8-4bb5-a39c-1e843ed85269/scratchpad/probe
NAME=$1; SECS=$2; shift 2
mkdir -p "$DIR/out"
xcrun simctl terminate $SIM app.pochical.probe >/dev/null 2>&1
xcrun simctl install $SIM "$DIR/dd/Build/Products/Debug-iphonesimulator/Probe.app"
xcrun simctl io $SIM recordVideo --codec=h264 --force "$DIR/out/$NAME.mp4" >/dev/null 2>&1 &
REC=$!
sleep 1.5
xcrun simctl launch --terminate-running-process --console-pty $SIM app.pochical.probe -push "$@" > "$DIR/out/$NAME.log" 2>&1 &
APP=$!
sleep "$SECS"
kill -INT $REC
wait $REC
xcrun simctl terminate $SIM app.pochical.probe >/dev/null 2>&1
wait $APP 2>/dev/null
echo "done $NAME"

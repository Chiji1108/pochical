#!/bin/bash
# nrun.sh <name> <seconds> <app args...>: launches the nav probe, records the
# screen, and keeps its log as out/<name>.log/.mp4. NOBG=0 by default; with
# BG=1 the app goes to the background at 7s and comes back at 10s.
set -u
SIM=9B0E841D-9B7B-4719-B62A-EE9794B67A17
D=/private/tmp/claude-501/-Users-chiji-js-pochical--claude-worktrees-serene-wing-a4ff85/f7887dad-3eb8-4bb5-a39c-1e843ed85269/scratchpad/navprobe
NAME=$1; SECS=$2; shift 2
mkdir -p "$D/out"
xcrun simctl terminate $SIM app.pochical.probe >/dev/null 2>&1
xcrun simctl install $SIM "$D/dd/Build/Products/Debug-iphonesimulator/Probe.app"
xcrun simctl io $SIM recordVideo --codec=h264 --force "$D/out/$NAME.mp4" >/dev/null 2>&1 &
REC=$!
sleep 1.5
xcrun simctl launch --terminate-running-process --console-pty $SIM app.pochical.probe "$@" > "$D/out/$NAME.log" 2>&1 &
APP=$!
if [ "${BG:-0}" = 1 ]; then
  sleep 7
  xcrun simctl launch $SIM com.apple.Preferences > /dev/null
  sleep 3
  xcrun simctl launch $SIM app.pochical.probe > /dev/null
  sleep $((SECS - 10))
elif [ "${ALERT:-0}" = 1 ]; then
  sleep 8
  agent-device alert dismiss --udid $SIM > /dev/null 2>&1
  sleep $((SECS - 8))
else
  sleep "$SECS"
fi
kill -INT $REC
wait $REC
xcrun simctl terminate $SIM app.pochical.probe >/dev/null 2>&1
wait $APP 2>/dev/null
tr -d '\r' < "$D/out/$NAME.log" | grep -E "STEP|TICK|OPEN|NAV|KEYBOARD" | cut -c1-260

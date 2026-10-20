#!/bin/bash
# bg.sh: runs the probe with the keyboard up, sends it to the background and
# back, and shows how its keyboard guide reads meanwhile.
set -u
P=/private/tmp/claude-501/-Users-chiji-js-pochical--claude-worktrees-serene-wing-a4ff85/f7887dad-3eb8-4bb5-a39c-1e843ed85269/scratchpad/probe
SIM=E24D45FF-4C63-4B51-AE21-808A0D99BA1F
bash $P/run.sh bg 15 -mode B -script bg -inset delta -width -top -relayout "$@" &
RUN=$!
sleep 6
xcrun simctl launch $SIM com.apple.Preferences > /dev/null
sleep 3
xcrun simctl launch $SIM app.pochical.probe > /dev/null
wait $RUN
tr -d '\r' < $P/out/bg.log | grep -E "STEP|TICK|KEYBOARD" | cut -c1-160

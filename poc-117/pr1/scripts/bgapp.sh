#!/bin/bash
# bgapp.sh: opens the chat, brings the keyboard up, sends the app to the
# background and back, and shows the keyboard guide as the app read it.
set -u
P=/private/tmp/claude-501/-Users-chiji-js-pochical--claude-worktrees-serene-wing-a4ff85/f7887dad-3eb8-4bb5-a39c-1e843ed85269/scratchpad/probe
SIM=E24D45FF-4C63-4B51-AE21-808A0D99BA1F
bash $P/openchat.sh > /dev/null
[ "${KB:-1}" = 1 ] && agent-device press 200 812 > /dev/null 2>&1
sleep 2
python3 -I $P/stamp.py $P/steps-bg.log start
xcrun simctl launch $SIM com.apple.Preferences > /dev/null
sleep 3
xcrun simctl launch $SIM app.pochical > /dev/null
sleep 3
grep "POC117DBG" $P/dbg.log | grep -v "configure\|ended\|prepareFor" | tail -6 | cut -c12-23,75-260
agent-device screenshot $P/s1.png > /dev/null 2>&1

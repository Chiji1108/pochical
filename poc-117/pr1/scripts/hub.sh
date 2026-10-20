#!/bin/bash
# hub.sh: relaunches the app without any debug argument and opens the
# グループ tab's hub. Run from the agent-device session's directory.
set -u
SIM=9B0E841D-9B7B-4719-B62A-EE9794B67A17
xcrun simctl terminate $SIM app.pochical > /dev/null 2>&1
xcrun simctl launch $SIM app.pochical "$@" > /dev/null
sleep 3
agent-device open app.pochical --platform ios --udid $SIM > /dev/null 2>&1
agent-device press 201 820 > /dev/null 2>&1
sleep 1.5

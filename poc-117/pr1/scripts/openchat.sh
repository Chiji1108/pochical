#!/bin/bash
# openchat.sh [app path]: (re)installs the app if given, relaunches it, and
# opens the group's 全体チャット.
set -u
SIM=E24D45FF-4C63-4B51-AE21-808A0D99BA1F
if [ $# -gt 0 ]; then xcrun simctl install $SIM "$1"; fi
agent-device open app.pochical --platform ios --udid $SIM --relaunch > /dev/null 2>&1
sleep 2
agent-device press 201 820 --settle > /dev/null 2>&1
agent-device press label="全体チャット" --settle > /dev/null 2>&1
sleep 1
echo opened

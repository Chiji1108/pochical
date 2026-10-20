#!/bin/bash
# clip.sh <name> <command...>: records the simulator while the command runs,
# with a second before and two after, to app/<name>.mp4.
set -u
SIM=9B0E841D-9B7B-4719-B62A-EE9794B67A17
D=/private/tmp/claude-501/-Users-chiji-js-pochical--claude-worktrees-serene-wing-a4ff85/f7887dad-3eb8-4bb5-a39c-1e843ed85269/scratchpad/navprobe
NAME=$1
shift
xcrun simctl io $SIM recordVideo --codec=h264 --force "$D/app/$NAME.mp4" > /dev/null 2>&1 &
REC=$!
sleep 1.5
"$@" > /dev/null 2>&1
sleep 2.5
kill -INT $REC
wait $REC
ffprobe -v error -show_entries format=duration -of csv=p=0 "$D/app/$NAME.mp4"

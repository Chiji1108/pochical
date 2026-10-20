#!/bin/bash
# rec.sh start <name> | stop: records sim A's screen to rec/<name>.mp4.
set -u
SIM=4E8334EF-B5E7-4CB3-9D6B-E04F6B754EFB
DIR=/private/tmp/claude-501/-Users-chiji-js-pochical--claude-worktrees-serene-wing-a4ff85/f7887dad-3eb8-4bb5-a39c-1e843ed85269/scratchpad/p2
mkdir -p "$DIR/rec"
case $1 in
  start)
    nohup xcrun simctl io $SIM recordVideo --codec=h264 --force "$DIR/rec/$2.mp4" > "$DIR/rec/.rec.log" 2>&1 &
    echo $! > "$DIR/rec/.pid"
    sleep 1.5
    ;;
  stop)
    kill -INT "$(cat "$DIR/rec/.pid")"
    sleep 2
    ;;
esac

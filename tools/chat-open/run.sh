#!/bin/bash
# Runs ChatOpenTests (apps/ios/Pochical/PochicalUITests) in a simulator
# against `mise run server`: a chat opened with more unread lines than
# chatRules.pageSize, a new member's join and photos among them, opens
# with ここから新着 the first thing seen, from the chat list and from a
# tapped notification. It starts the server itself, so nothing else may be
# on POCHICAL_DEV_SERVER (:8787 by default), and erases the simulator it
# is given.
#
#   mise run ios:chat-open -- "<simulator name>" [derived data]
#
# It builds the app and its tests first (build-for-testing) into the
# derived data, `.build/DerivedData` by default, makes a group with a chat
# of thirty lines for the simulator's user to read, and as the tests ask
# sends many more (lines, a new member's photos, lines again), the second
# time pushing a notification of the last, worded as the server's
# (apns.ts payloadOf). It fails when any test does, and leaves the
# results, with their screenshots, in the folder it names last.
set -euo pipefail

device=${1:?simulator name}
root=$(cd "$(dirname "$0")/../.." && pwd)
derived=${2:-$root/.build/DerivedData}
shared=$(mktemp -d)
server_log=$shared/server.log
. "$root/tools/ios-ui/lib.sh"
trap stop_server EXIT

photo() {
  magick -size 900x1200 xc:"$1" -font /System/Library/Fonts/Supplemental/Arial.ttf -gravity center \
    -pointsize 400 -fill white -annotate 0 "$2" "$3"
}

send() {
  pnpm --dir "$root" exec tsx "$root/tools/chat-try/index.ts" "$code" "$@"
}

# More unread lines than a page, a new member's join and photos among
# them.
many() {
  send 40
  send --photos "$shared/photos"
  send 10
}

prepare
mkdir "$shared/photos"
photo "#3a7bd5" 1 "$shared/photos/1.jpg"
photo "#d53a7b" 2 "$shared/photos/2.jpg"
photo "#3ad57b" 3 "$shared/photos/3.jpg"
new_group "$shared/invite"
code=$(cat "$shared/invite")
group=$(jq -r .groupId "$root/tools/api-try/out/state.json")
send 30

TEST_RUNNER_CHAT_OPEN_DIR=$shared xcodebuild_for test-without-building \
  -collect-test-diagnostics never -parallel-testing-enabled NO \
  -resultBundlePath "$shared/results.xcresult" \
  -only-testing:PochicalUITests/ChatOpenTests &
tests=$!

# Waits for the tests to name `step`, false once they have ended without.
step() {
  until [ -e "$shared/$1" ]; do
    kill -0 "$tests" 2>/dev/null || return 1
    sleep 1
  done
}

if step joined; then
  # The simulator's user: the session made last, once it has joined.
  me=$(cd "$root/apps/server" &&
    pnpm exec wrangler d1 execute pochical --local --json \
      --command "select user_id from session order by created_at desc limit 1" |
    jq -r '.[0].results[0].user_id')
  many
  touch "$shared/sent"
  if step left; then
    many
    jq -n --arg group "$group" --arg me "$me" '{
      aps: {
        alert: {
          "title-loc-key": "CHAT_TITLE", "title-loc-args": ["ポチカルのテスト"],
          "loc-key": "CHAT_GROUP_TEXT", "loc-args": ["テスト送信", "テスト 10"]
        },
        badge: 1, "mutable-content": 1, sound: "default", "thread-id": "\($group)/group"
      },
      groupId: $group, recipientId: $me, threadId: "group"
    }' >"$shared/push.apns"
    xcrun simctl push "$device" app.pochical "$shared/push.apns"
    touch "$shared/pushed"
  fi
fi

failed=0
wait "$tests" || failed=1
xcrun simctl shutdown "$device" || true
echo "results and screenshots: $shared"
exit "$failed"

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
trap 'stop_tests; stop_server' EXIT

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

if step joined; then
  me=$(signed_in_user)
  many
  touch "$shared/sent"
  if step left; then
    many
    push_line "$group" "$me" テスト送信 "テスト 10" "$shared/push.apns"
    touch "$shared/pushed"
  fi
fi

failed=0
wait "$tests" || failed=1
tests=""
xcrun simctl shutdown "$device" || true
echo "results and screenshots: $shared"
exit "$failed"

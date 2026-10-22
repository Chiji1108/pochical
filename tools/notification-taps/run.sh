#!/bin/bash
# Runs NotificationTapTests (apps/ios/Pochical/PochicalUITests) in a
# simulator against `mise run server`: a tapped chat notification opens
# its chat over the グループ tab alone, from the background over another
# tab's page and from a cold start (POC-157). It starts the server itself,
# so nothing else may be on :8787, and erases the simulator it is given.
#
#   mise run ios:notification-taps -- "<simulator name>" [derived data]
#
# It builds the app and its tests first (build-for-testing) into the
# derived data, `.build/DerivedData` by default, makes a group with a chat
# of thirty lines, and as each test asks sends one more line and pushes
# its notification to the simulator, worded as the server's (apns.ts
# payloadOf) for the user the simulator signed in as. It fails when any
# test does, and leaves the results, with their screenshots, in the folder
# it names last.
set -euo pipefail

device=${1:?simulator name}
root=$(cd "$(dirname "$0")/../.." && pwd)
derived=${2:-$root/.build/DerivedData}
shared=$(mktemp -d)
server_log=$shared/server.log
. "$root/tools/ios-ui/lib.sh"
trap stop_server EXIT

prepare
new_group "$shared/invite"
code=$(cat "$shared/invite")
group=$(jq -r .groupId "$root/tools/api-try/out/state.json")
bun "$root/tools/chat-try/index.ts" "$code" 30

TEST_RUNNER_NOTIFICATION_TAP_DIR=$shared xcodebuild_for test-without-building \
  -collect-test-diagnostics never -parallel-testing-enabled NO \
  -resultBundlePath "$shared/results.xcresult" \
  -only-testing:PochicalUITests/NotificationTapTests &
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
    bunx wrangler d1 execute pochical --local --json \
      --command "select user_id from session order by created_at desc limit 1" |
    jq -r '.[0].results[0].user_id')
  for each in background cold; do
    step "$each" || break
    bun "$root/tools/chat-try/index.ts" "$code" 1
    jq -n --arg group "$group" --arg me "$me" '{
      aps: {
        alert: {
          "title-loc-key": "CHAT_TITLE", "title-loc-args": ["ポチカルのテスト"],
          "loc-key": "CHAT_GROUP_TEXT", "loc-args": ["テスト送信", "テスト 31"]
        },
        badge: 1, "mutable-content": 1, sound: "default", "thread-id": "\($group)/group"
      },
      groupId: $group, recipientId: $me, threadId: "group"
    }' >"$shared/$each.apns"
    xcrun simctl push "$device" app.pochical "$shared/$each.apns"
  done
fi

failed=0
wait "$tests" || failed=1
xcrun simctl shutdown "$device" || true
echo "results and screenshots: $shared"
exit "$failed"

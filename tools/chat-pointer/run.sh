#!/bin/bash
# Runs ChatPointerTests (apps/ios/Pochical/PochicalUITests) in a simulator
# against `mise run server`: a line's menu opened by a right click
# (spec/chat.md, A keyboard and a mouse), on an iPad, where a pointer is
# used most; the keys are pinned by PochicalTests' ComposerKeysTests. It
# starts the server itself, so nothing else may be on POCHICAL_DEV_SERVER
# (:8787 by default), and erases the simulator it is given.
#
#   mise run ios:chat-pointer -- "<simulator name>" [derived data]
#
# It builds the app and its tests first (build-for-testing) into the
# derived data, `.build/DerivedData` by default, and makes a group with a
# chat of thirty lines for the simulator's user to join. It fails when
# the test does, and leaves the results, with their screenshots, in the
# folder it names last.
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
pnpm --dir "$root" exec tsx "$root/tools/chat-try/index.ts" "$(cat "$shared/invite")" 30

failed=0
TEST_RUNNER_CHAT_POINTER_DIR=$shared xcodebuild_for test-without-building \
  -collect-test-diagnostics never -parallel-testing-enabled NO \
  -resultBundlePath "$shared/results.xcresult" \
  -only-testing:PochicalUITests/ChatPointerTests || failed=1
xcrun simctl shutdown "$device" || true
echo "results and screenshots: $shared"
exit "$failed"

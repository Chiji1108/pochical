#!/bin/bash
# Runs GroupRailTests (apps/ios/Pochical/PochicalUITests) in a simulator
# against `mise run server`: two groups joined, each picked in グループ's
# rail by a tap on its mark's middle, the first one too, and the one
# picked open again once the app is closed and opened (#1281). It starts
# the server itself, so nothing else may be on POCHICAL_DEV_SERVER (:8787
# by default), and erases the simulator it is given.
#
#   mise run ios:group-rail -- "<simulator name>" [derived data]
#
# It builds the app and its tests first (build-for-testing) into the
# derived data, `.build/DerivedData` by default, and makes the two groups,
# ひとつめ and ふたつめ, for the simulator's user to join. It fails when the
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
new_group "$shared/first" ひとつめ
new_group "$shared/second" ふたつめ
failed=0
# xcodebuild passes TEST_RUNNER_-prefixed variables on to the tests.
export TEST_RUNNER_GROUP_RAIL_DIR=$shared
xcodebuild_for test-without-building \
  -collect-test-diagnostics never -parallel-testing-enabled NO \
  -resultBundlePath "$shared/results.xcresult" \
  -only-testing:PochicalUITests/GroupRailTests || failed=1
xcrun simctl shutdown "$device" || true
echo "results and screenshots: $shared"
exit "$failed"

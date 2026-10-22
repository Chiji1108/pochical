#!/bin/bash
# Runs ShiftsRotationTests (apps/ios/Pochical/PochicalUITests) in a
# simulator against `mise run server`: a big group's 一覧 turned to
# landscape and back, at the default text size and the largest (POC-132).
# It starts the server itself, so nothing else may be on :8787, and erases
# the simulator it is given.
#
#   mise run ios:shifts-rotation -- "<simulator name>" [derived data]
#
# It builds the app and its tests first (build-for-testing) into the
# derived data, `.build/DerivedData` by default, and makes a group of
# eleven for the simulator to join as the twelfth, more than 一覧 fits
# across a phone held upright. It fails when any test does, and leaves the
# results, with their screenshots, in the folder it names last.
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
for _ in $(seq 10); do bun "$root/tools/api-try/index.ts" join --local; done

failed=0
TEST_RUNNER_SHIFTS_ROTATION_DIR=$shared xcodebuild_for test-without-building -collect-test-diagnostics never \
  -parallel-testing-enabled NO -resultBundlePath "$shared/results.xcresult" \
  -only-testing:PochicalUITests/ShiftsRotationTests || failed=1
xcrun simctl shutdown "$device" || true
echo "results and screenshots: $shared"
exit "$failed"

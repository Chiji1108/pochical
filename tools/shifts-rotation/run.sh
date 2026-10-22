#!/bin/bash
# Runs ShiftsRotationTests (apps/ios/Pochical/PochicalUITests) in a
# simulator against `mise run server`: a big group's 一覧 turned to
# landscape and back, at the default text size and the largest (POC-132),
# its 今日 after 月を選ぶ and a change of layout (POC-156), and its
# 週ごと opening on today's week however late the members are read (POC-162);
# and in a group of two, 今日's rows, 週ごと after 一覧 and the day's sheet
# following the day tapped (POC-195).
# It starts the server itself, so nothing else may be on :8787, and erases
# the simulator it is given.
#
#   mise run ios:shifts-rotation -- "<simulator name>" [derived data]
#
# It builds the app and its tests first (build-for-testing) into the
# derived data, `.build/DerivedData` by default, and makes a group of
# eleven for the simulator to join as the twelfth, more than 一覧 fits
# across a phone held upright, and 少人数, of one, to join as the second.
# It fails when any test does, and leaves the results, with their
# screenshots, in the folder it names last.
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
new_group "$shared/small-invite" 少人数

failed=0
TEST_RUNNER_SHIFTS_ROTATION_DIR=$shared xcodebuild_for test-without-building -collect-test-diagnostics never \
  -parallel-testing-enabled NO -resultBundlePath "$shared/results.xcresult" \
  -only-testing:PochicalUITests/ShiftsRotationTests || failed=1
xcrun simctl shutdown "$device" || true
echo "results and screenshots: $shared"
exit "$failed"

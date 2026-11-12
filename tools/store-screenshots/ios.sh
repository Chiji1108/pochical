#!/bin/bash
# Photographs the screens the App Store's screenshots are drawn from
# (#806): runs StoreScreenshotTests (apps/ios/Pochical/PochicalUITests) in
# a simulator against `mise run server`, seeded with 職場のみんな and
# 学生時代の友だち by seed.ts, and keeps each screen under `.build/store-screenshots/ios`, by
# the names packages/prototype/src/lib/store-shots.ts gives them.
# `mise run store:images` draws the store's pictures from them.
# It starts the server itself, so nothing else may be on
# POCHICAL_DEV_SERVER (:8787 by default), and erases the simulator
# `pochical-store`, its own and no other: an iPhone 18 Pro Max, of the
# shape the App Store's pictures are drawn from (store-shots.ts), made
# here when no simulator has the name. It fails when one has the name and
# is another device.
#
#   mise run store:shots:ios [-- <derived data>]
#
# It builds the app and its tests first (build-for-testing) into the
# derived data, `.build/DerivedData` by default. It fails when a test
# does, and leaves the results in the folder it names last.
set -euo pipefail

device=pochical-store
type=com.apple.CoreSimulator.SimDeviceType.iPhone-18-Pro-Max
root=$(cd "$(dirname "$0")/../.." && pwd)
derived=${1:-$root/.build/DerivedData}
raw=$root/.build/store-screenshots/ios
shared=$(mktemp -d)
server_log=$shared/server.log
. "$root/tools/store-screenshots/when.sh"
. "$root/tools/store-screenshots/seed.sh"
. "$root/tools/ios-ui/lib.sh"
trap 'stop_seed; stop_server' EXIT

# The devices the simulators of the name are.
case $(xcrun simctl list devices -j |
  jq -r --arg name "$device" '[.devices[][] | select(.name == $name) | .deviceTypeIdentifier] | unique | join(" ")') in
  "") xcrun simctl create "$device" "$type" >/dev/null ;;
  "$type") ;;
  *) echo "the simulator $device is not an iPhone 18 Pro Max: delete it, and the run makes its own" >&2; exit 1 ;;
esac
prepare
# The phone as its owner in Japan has it, for what the system words: the
# Home Screen, the widgets and the calendars' names. Read as it starts.
xcrun simctl bootstatus "$device" >/dev/null
xcrun simctl spawn "$device" defaults write -g AppleLanguages -array ja-JP
xcrun simctl spawn "$device" defaults write -g AppleLocale ja_JP
xcrun simctl shutdown "$device"
xcrun simctl boot "$device"
xcrun simctl bootstatus "$device" >/dev/null
rm -rf "$raw"
mkdir -p "$raw"
start_seed "$raw/invite" "$raw/invite-friends"
# The status bar the stores' pictures have: 9:41 whenever the run is, full
# signal and a full battery off the charger. (simctl takes no H:MM on the
# hour, only a whole ISO date: 9:41 is none.)
xcrun simctl status_bar "$device" override --time 9:41 --batteryState discharging --batteryLevel 100 \
  --wifiBars 3 --cellularBars 4
xcrun simctl ui "$device" appearance light
xcrun simctl privacy "$device" grant calendar app.pochical


failed=0
TEST_RUNNER_STORE_SHOTS_DIR=$raw xcodebuild_for test-without-building -collect-test-diagnostics never \
  -parallel-testing-enabled NO -resultBundlePath "$shared/results.xcresult" \
  -only-testing:PochicalUITests/StoreScreenshotTests || failed=1
xcrun simctl shutdown "$device" || true
# The tests passed: the seed has had the join it waits for.
[ "$failed" != 0 ] || end_seed || failed=1
echo "screens: $raw"
echo "results: $shared"
exit "$failed"

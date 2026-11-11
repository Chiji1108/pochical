#!/bin/bash
# Photographs the screens the App Store's screenshots are drawn from
# (#806): runs StoreScreenshotTests (apps/ios/Pochical/PochicalUITests) in
# a simulator against `mise run server`, seeded with 職場のみんな by
# seed.ts, and keeps each screen under `.build/store-screenshots/ios`, by
# the names packages/prototype/src/lib/store-shots.ts gives them.
# `mise run store:images` draws the store's pictures from them.
# It starts the server itself, so nothing else may be on
# POCHICAL_DEV_SERVER (:8787 by default), and erases the simulator it is
# given, which is to be of the size the App Store's pictures are drawn
# from (store-shots.ts): `pochical-store` unless another is named, made
# here as an iPhone 18 Pro Max when no simulator has the name.
#
#   mise run store:shots:ios [-- "<simulator name>" [derived data]]
#
# It builds the app and its tests first (build-for-testing) into the
# derived data, `.build/DerivedData` by default. It fails when a test
# does, and leaves the results in the folder it names last.
set -euo pipefail

device=${1:-pochical-store}
root=$(cd "$(dirname "$0")/../.." && pwd)
derived=${2:-$root/.build/DerivedData}
raw=$root/.build/store-screenshots/ios
shared=$(mktemp -d)
server_log=$shared/server.log
. "$root/tools/ios-ui/lib.sh"
trap stop_server EXIT

xcrun simctl list devices -j | jq -e --arg name "$device" 'any(.devices[][]; .name == $name)' >/dev/null ||
  xcrun simctl create "$device" "iPhone 18 Pro Max" >/dev/null
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
pnpm --dir "$root" exec tsx "$root/tools/store-screenshots/seed.ts" "$raw/invite" "$raw/invite-friends"
# The status bar the stores' pictures have: full signal and a full battery
# off the charger, and for the whole run the time two minutes after the
# chat's lines, whose times are when the seed sent them.
xcrun simctl status_bar "$device" override --time "$(date -v+2M +%-H:%M)" --batteryState discharging --batteryLevel 100 \
  --wifiBars 3 --cellularBars 4
xcrun simctl ui "$device" appearance light
xcrun simctl privacy "$device" grant calendar app.pochical


failed=0
TEST_RUNNER_STORE_SHOTS_DIR=$raw xcodebuild_for test-without-building -collect-test-diagnostics never \
  -parallel-testing-enabled NO -resultBundlePath "$shared/results.xcresult" \
  -only-testing:PochicalUITests/StoreScreenshotTests || failed=1
xcrun simctl shutdown "$device" || true
echo "screens: $raw"
echo "results: $shared"
exit "$failed"

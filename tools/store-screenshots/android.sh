#!/bin/bash
# Photographs the Android app for the stores' screenshots (#806), raw, as
# the emulator shows it, by the names
# packages/prototype/src/lib/store-shots.ts gives them: the screens into
# .build/store-screenshots/android (01-entry.png, 05-calendar.png, ...),
# and each widget by itself at each size it offers into its 02-widgets/ and
# 02-widgets-sumi/ (<kind>-<size>.png), drawn there from the app's own days
# and group; StoreScreenshots in :app's androidTest walks them all.
# `mise run store:images` draws Google Play's pictures from them.
#
#   ANDROID_SERIAL=emulator-<port> mise run store:shots:android
#
# The emulator, a phone's with Google Play, is running already and is the
# run's to change: the app is taken off it, with its data, and whoever the
# app was signed in as there is signed out. For the run it shows the time
# the group's chat was written at, with full signal and battery (SystemUI's
# demo mode), in light, nothing
# animating, and has a calendar of its own, 仕事, to add shifts to; all put
# back at the end. It starts the server itself, so nothing else may be on
# POCHICAL_DEV_SERVER (:8787 by default), and seeds the group there
# (seed.ts).
set -euo pipefail

root=$(cd "$(dirname "$0")/../.." && pwd)
out=$root/.build/store-screenshots/android
[[ ${ANDROID_SERIAL:-} == emulator-* ]] ||
  { echo "ANDROID_SERIAL must name an emulator (emulator-<port>): the run takes the app off it and changes its settings" >&2; exit 1; }
adb() { command "${ANDROID_HOME:+$ANDROID_HOME/platform-tools/}adb" -s "$ANDROID_SERIAL" "$@"; }
gradle() { (cd "$root/apps/android" && ./gradlew "$@"); }

work=$(mktemp -d)
server_log=$work/server.log
. "$root/tools/ios-ui/lib.sh"

rm -rf "$out"
mkdir -p "$out"

# The emulator's own calendar for the run: it has none that takes events.
calendar="content://com.android.calendar/calendars?caller_is_syncadapter=true&account_name=pochical-store-shots&account_type=LOCAL"
without_calendar() { adb shell "content delete --uri '$calendar' --where \"account_name='pochical-store-shots'\""; }
demo() { adb shell am broadcast -a com.android.systemui.demo -e command "$@" >/dev/null; }
scales="window_animation_scale transition_animation_scale animator_duration_scale"

night=$(adb shell cmd uimode night | sed 's/.*: //')
for scale in $scales; do declare "was_$scale=$(adb shell settings get global "$scale")"; done
restore() {
  stop_server
  demo exit
  adb shell cmd uimode night "$night" >/dev/null
  for scale in $scales; do
    local was=was_$scale
    if [ "${!was}" = null ]; then adb shell settings delete global "$scale" >/dev/null; else adb shell settings put global "$scale" "${!was}"; fi
  done
  without_calendar
}
trap restore EXIT

adb uninstall app.pochical >/dev/null || true
adb shell cmd uimode night no >/dev/null
for scale in $scales; do adb shell settings put global "$scale" 0; done
without_calendar
adb shell "content insert --uri '$calendar' --bind account_name:s:pochical-store-shots --bind account_type:s:LOCAL \
  --bind ownerAccount:s:pochical-store-shots --bind name:s:仕事 --bind calendar_displayName:s:仕事 \
  --bind calendar_color:i:-12409355 --bind calendar_access_level:i:700 --bind visible:i:1 --bind sync_events:i:1"
adb shell settings put global sysui_demo_allowed 1
demo enter
demo battery -e level 100 -e plugged false
demo network -e wifi show -e level 4 -e fully true
# The emulator's mobile network reads 3G whatever the demo is told, so Wi-Fi alone is the signal.
demo network -e mobile hide

start_server
pnpm --dir "$root" exec tsx "$root/tools/store-screenshots/seed.ts" "$work/invite" "$work/invite-friends"
# The status bar's time for the whole run: two minutes after the chat's
# lines, whose times are when the seed sent them, on the emulator's clock.
demo clock -e hhmm "$(adb shell 'date -d @$(($(date +%s) + 120)) +%H%M')"
pulled=$root/apps/android/app/build/outputs/connected_android_test_additional_output
rm -rf "$pulled"
gradle :app:connectedDebugAndroidTest "-PpochicalServer=http://10.0.2.2:$port" \
  -Pandroid.testInstrumentationRunnerArguments.class=app.pochical.StoreScreenshots \
  "-Pandroid.testInstrumentationRunnerArguments.invite=$(cat "$work/invite")" \
  "-Pandroid.testInstrumentationRunnerArguments.friends=$(cat "$work/invite-friends")"
# Where Gradle pulls what a test leaves in additionalTestOutputDir, under the device's name.
cp -R "$pulled"/debugAndroidTest/connected/*/ "$out"
ls -R "$out"

#!/bin/bash
# Photographs the Android app for the stores' screenshots (#806), raw, as
# the emulator shows it, by the names
# packages/prototype/src/lib/store-shots.ts gives them: the screens into
# .build/store-screenshots/<store> (01-entry.png, 05-calendar-sumi.png, ...),
# and each widget by itself at each size it offers into its 02-widgets/ and
# 02-widgets-sumi/ (<kind>-<size>.png), drawn there from the app's own days
# and group; StoreScreenshots in :app's androidTest walks them all.
# `<store>` is the store's device the pictures are for: `android`, a
# phone's, or `android-tablet`, a tablet's (#1226), which the walk
# photographs on its side; or a foldable's (#1285), which the run folds or
# opens for the walk: `android-foldable`, its square inner display, open,
# `android-foldable-wide`, its wide one, open, or `android-foldable-outer`,
# its outer display, folded. The run fails when the emulator is not of that
# kind: a foldable, or not, and by Material's window sizes (a tablet 600dp
# or more at its narrowest), or by how square an inner display is (a
# square one's sides within a tenth of each other, a wide one's further apart).
# `mise run store:images` draws Google Play's pictures from them.
#
#   ANDROID_SERIAL=emulator-<port> mise run store:shots:android
#   ANDROID_SERIAL=emulator-<port> mise run store:shots:android-tablet
#   ANDROID_SERIAL=emulator-<port> mise run store:shots:android-foldable
#
# The emulator, a phone's, a tablet's or a foldable's with Google Play, is running already and is the
# run's to change: the app is taken off it, with its data, and whoever the
# app was signed in as there is signed out. For the run it shows the time
# the group's chat was written at, with full signal and battery (SystemUI's
# demo mode), in light, nothing
# animating, folded or open as the store's display is, awake when folded,
# and has a calendar of its own, 仕事, to add shifts to; all put back at
# the end. It starts the server itself, so nothing else may be on
# POCHICAL_DEV_SERVER (:8787 by default), and seeds the group there
# (seed.ts).
set -euo pipefail

store=${1:?the store: android, android-tablet, android-foldable, android-foldable-wide or android-foldable-outer}
root=$(cd "$(dirname "$0")/../.." && pwd)
out=$root/.build/store-screenshots/$store
[[ ${ANDROID_SERIAL:-} == emulator-* ]] ||
  { echo "ANDROID_SERIAL must name an emulator (emulator-<port>): the run takes the app off it and changes its settings" >&2; exit 1; }
adb() { command "${ANDROID_HOME:+$ANDROID_HOME/platform-tools/}adb" -s "$ANDROID_SERIAL" "$@"; }

# Whether the emulator folds: a foldable's states have one where it is closed.
folds() { adb shell cmd device_state print-states | grep -q "name='CLOSED'"; }
folded() { adb shell cmd device_state state | grep -q "name='CLOSED'"; }
# Folds or opens it, and waits until its display is the one asked for,
# awake and unlocked, as a display it turned to may have locked.
posture() {
  adb emu "$1" >/dev/null
  for _ in $(seq 10); do
    if [ "$(folded && echo fold || echo unfold)" = "$1" ]; then
      adb shell input keyevent KEYCODE_WAKEUP
      adb shell wm dismiss-keyguard
      return
    fi
    sleep 1
  done
  echo "$ANDROID_SERIAL did not $1" >&2
  exit 1
}
case $store in
  android | android-tablet) ! folds || { echo "$ANDROID_SERIAL is a foldable's: name a phone's or a tablet's emulator for $store" >&2; exit 1; } ;;
  android-foldable | android-foldable-wide | android-foldable-outer)
    folds || { echo "$ANDROID_SERIAL does not fold: name a foldable's emulator for $store" >&2; exit 1; } ;;
  *) echo "no store's device is $store: android, android-tablet, android-foldable, android-foldable-wide or android-foldable-outer" >&2; exit 1 ;;
esac
gradle() { (cd "$root/apps/android" && ./gradlew "$@"); }

work=$(mktemp -d)
server_log=$work/server.log
. "$root/tools/store-screenshots/when.sh"
. "$root/tools/store-screenshots/seed.sh"
. "$root/tools/ios-ui/lib.sh"

rm -rf "$out"
mkdir -p "$out"

# The emulator's own calendar for the run: it has none that takes events.
calendar="content://com.android.calendar/calendars?caller_is_syncadapter=true&account_name=pochical-store-shots&account_type=LOCAL"
without_calendar() { adb shell "content delete --uri '$calendar' --where \"account_name='pochical-store-shots'\""; }
demo() { adb shell am broadcast -a com.android.systemui.demo -e command "$@" >/dev/null; }
scales="window_animation_scale transition_animation_scale animator_duration_scale"
# The global settings the run changes: the animations' scales, and that
# SystemUI takes the demo's commands.
settings="$scales sysui_demo_allowed"
# Whether a foldable stays awake folded, which the run asks of it, and
# whether it is folded.
was_fold_lock=$(adb shell settings get system fold_lock_behavior_setting)
was_folded=$(folded && echo fold || echo unfold)

night=$(adb shell cmd uimode night | sed 's/.*: //')
for setting in $settings; do declare "was_$setting=$(adb shell settings get global "$setting")"; done
# Every step whatever became of the one before, and the run fails if one did.
restore() {
  local status=$? left=""
  set +e
  stop_seed
  stop_server || left="$left the server,"
  demo exit || left="$left the status bar,"
  adb shell cmd uimode night "$night" >/dev/null || left="$left night mode,"
  for setting in $settings; do
    local was=was_$setting
    if [ "${!was}" = null ]; then adb shell settings delete global "$setting" >/dev/null; else adb shell settings put global "$setting" "${!was}"; fi ||
      left="$left $setting,"
  done
  without_calendar || left="$left the calendar,"
  if folds; then
    if [ "$was_fold_lock" = null ]; then adb shell settings delete system fold_lock_behavior_setting >/dev/null; else adb shell settings put system fold_lock_behavior_setting "$was_fold_lock"; fi ||
      left="$left fold_lock_behavior_setting,"
    (posture "$was_folded") || left="$left the fold,"
  fi
  [ -z "$left" ] || { echo "not put back:${left%,}" >&2; status=1; }
  exit "$status"
}
trap restore EXIT

# The display it is held at, the inner one open for its square or wide
# pictures, and the outer one folded, kept awake as it folds.
if folds; then
  adb shell settings put system fold_lock_behavior_setting stay_awake_on_fold_key
  posture "$([ "$store" = android-foldable-outer ] && echo fold || echo unfold)"
fi
# The display's sides, and the narrowest in dp, which says whether it is a phone or a tablet.
read -r shortest longest < <(adb shell wm size | awk -F'[ x]' '/size:/ { w = $(NF-1); h = $NF } END { print (w < h ? w " " h : h " " w) }')
density=$(adb shell wm density | awk '/density:/ { d = $NF } END { print d }')
narrowest=$((shortest * 160 / density))
square=$((longest * 10 < shortest * 11))
case $store in
  android | android-foldable-outer) [ "$narrowest" -lt 600 ] || { echo "$ANDROID_SERIAL is a tablet: name a phone's emulator for $store" >&2; exit 1; } ;;
  android-tablet) [ "$narrowest" -ge 600 ] || { echo "$ANDROID_SERIAL is a phone: name a tablet's emulator for $store" >&2; exit 1; } ;;
  android-foldable) [ "$square" = 1 ] || { echo "$ANDROID_SERIAL's inner display is wide: name one whose inner display is square for $store" >&2; exit 1; } ;;
  android-foldable-wide) [ "$square" = 0 ] || { echo "$ANDROID_SERIAL's inner display is square: name one whose inner display is wide for $store" >&2; exit 1; } ;;
esac

adb uninstall app.pochical >/dev/null || true
adb shell cmd uimode night no >/dev/null
for scale in $scales; do adb shell settings put global "$scale" 0; done
without_calendar
adb shell "content insert --uri '$calendar' --bind account_name:s:pochical-store-shots --bind account_type:s:LOCAL \
  --bind ownerAccount:s:pochical-store-shots --bind name:s:仕事 --bind calendar_displayName:s:仕事 \
  --bind calendar_color:i:-12409355 --bind calendar_access_level:i:700 --bind visible:i:1 --bind sync_events:i:1"
# The demo is entered once the emulator's Wi-Fi is the network it uses: in
# the seconds after a boot it is still on its mobile network, and a demo
# entered then shows a second Wi-Fi icon to its end, when the real one comes.
on_wifi() {
  adb shell dumpsys connectivity | awk '
    /^Active default network:/ { id = $NF }
    /NetworkAgentInfo\{network\{/ && index($0, "network{" id "}") && /ni\{WIFI CONNECTED/ { found = 1 }
    END { exit !found }'
}
for _ in $(seq 60); do
  on_wifi && break
  sleep 1
done
on_wifi || { echo "the emulator is not on its Wi-Fi a minute on: the status bar would not be the pictures'" >&2; exit 1; }
adb shell settings put global sysui_demo_allowed 1
demo enter
demo battery -e level 100 -e plugged false
demo network -e wifi show -e level 4 -e fully true
# The emulator's mobile network reads 3G whatever the demo is told, so Wi-Fi alone is the signal.
demo network -e mobile hide

# The status bar's time, whenever the run is.
demo clock -e hhmm 0941

start_server
start_seed "$work/invite" "$work/invite-friends"
pulled=$root/apps/android/app/build/outputs/connected_android_test_additional_output
rm -rf "$pulled"
gradle :app:connectedDebugAndroidTest "-PpochicalServer=http://10.0.2.2:$port" \
  -Pandroid.testInstrumentationRunnerArguments.class=app.pochical.StoreScreenshots \
  "-Pandroid.testInstrumentationRunnerArguments.invite=$(cat "$work/invite")" \
  "-Pandroid.testInstrumentationRunnerArguments.friends=$(cat "$work/invite-friends")"
# The walk passed: the seed has had the join it waits for.
end_seed
# Where Gradle pulls what a test leaves in additionalTestOutputDir, under the device's name.
cp -R "$pulled"/debugAndroidTest/connected/*/ "$out"
ls -R "$out"

# Folds or unfolds an iPhone Duo simulator for the stores' pictures of
# its displays (#1224): `fold <udid> closed` lights the outer display and
# `fold <udid> open` the inner one, and fails unless that display is the
# one lit afterwards.
#
#   . "$root/tools/store-screenshots/fold.sh"
#
# Neither simctl nor XCTest can fold a Duo: Xcode 27's only way is the
# pose buttons under it in DeviceHub's window. devicehubctl (MIT,
# https://github.com/ChrisThoma/devicehubctl) presses them through the
# macOS accessibility API, so the app running this needs Accessibility
# access (System Settings > Privacy & Security), and DeviceHub comes to
# the front for it. This is the one place it is used, at the commit
# pinned below, built into .build from its source; it goes when simctl or
# XCTest can fold a Duo (#1267).

devicehubctl_commit=e40649e135134e346bdc6bc98a6190d8fe3537af
devicehubctl=$root/.build/devicehubctl/.build/release/devicehubctl

build_devicehubctl() {
  local source=$root/.build/devicehubctl
  if [ "$(git -C "$source" rev-parse HEAD 2>/dev/null)" != "$devicehubctl_commit" ]; then
    rm -rf "$source"
    git clone -q https://github.com/ChrisThoma/devicehubctl.git "$source"
    git -C "$source" checkout -q "$devicehubctl_commit"
  fi
  swift build -c release --package-path "$source" >/dev/null
}

# DeviceHub keeps a window on a simulator as it is erased and booted
# again, and that window no longer answers with the pose buttons; one
# DeviceHub opens afresh, on a simulator already booted, does. So the run
# quits DeviceHub before the simulator is erased, and opens it once the
# simulator is booted for the last time (fold). Quitting DeviceHub shuts
# down every simulator, so it fails rather than quit while another than
# the Duo `$1` names is booted.
quit_devicehub() {
  local others
  others=$(xcrun simctl list devices -j |
    jq -r --arg name "$1" '[.devices[][] | select(.state == "Booted" and .name != $name) | .name] | join(", ")')
  if [ -n "$others" ]; then
    echo "quitting DeviceHub would shut down $others: shut them down, then run again" >&2
    return 1
  fi
  osascript -e 'quit app "DeviceHub"' >/dev/null
  local waited=0
  while pgrep -x DeviceHub >/dev/null; do
    waited=$((waited + 1))
    [ "$waited" -lt 30 ] || { echo "DeviceHub did not quit" >&2; return 1; }
    sleep 1
  done
}

# Presses DeviceHub's control "$2..." for the simulator "$1". DeviceHub,
# as it starts, opens its window on the simulator, and a window
# devicehubctl finds then may be replaced a moment later by the one
# DeviceHub restores: the control is asked for again until it is pressed.
hub() {
  local tries=0
  open -a DeviceHub
  until "$devicehubctl" "$@"; do
    tries=$((tries + 1))
    [ "$tries" -lt 10 ] || { echo "DeviceHub did not press ${*:2} for $1" >&2; return 1; }
    sleep 2
  done
}

# The display a pose lights, as simctl numbers them: 1 the outer, 3 the
# inner.
fold() {
  local udid=$1 pose=$2 display shots
  case $pose in
    closed) display=1 ;;
    open) display=3 ;;
    *) echo "no pose is $pose: closed or open" >&2; return 1 ;;
  esac
  hub "$udid" pose "$pose"
  # The display that is not lit is photographed black.
  shots=$(mktemp -d)
  if ! xcrun simctl io "$udid" screenshot --display="$display" "$shots/shot.png" >/dev/null 2>&1 ||
    [ "$(magick "$shots/shot.png" -alpha off -colorspace gray -format '%[fx:maxima>0]' info:)" != 1 ]; then
    rm -rf "$shots"
    echo "the Duo's display $display is not lit after pose $pose" >&2
    return 1
  fi
  rm -rf "$shots"
}

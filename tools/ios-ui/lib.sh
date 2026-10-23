# What the UI test runs (tools/*/run.sh) share: the app and its tests built
# for a simulator to reach POCHICAL_DEV_SERVER (http://localhost:8787 by
# default), the simulator erased, `mise run server` started and stopped
# there, and a group made there by tools/api-try.
#
#   . "$root/tools/ios-ui/lib.sh"
#
# Before sourcing, set `device` (a simulator's name), `root` (the repo),
# `derived` (the derived data) and `server_log` (where the server writes).

export POCHICAL_DEV_SERVER=${POCHICAL_DEV_SERVER:-http://localhost:8787}
[[ $POCHICAL_DEV_SERVER =~ ^http://localhost:([0-9]+)$ ]] ||
  { echo "POCHICAL_DEV_SERVER is not http://localhost:<port>: $POCHICAL_DEV_SERVER" >&2; exit 1; }
port=${BASH_REMATCH[1]}
server=""

start_server() {
  (cd "$root" && exec mise run server -- --port "$port" >>"$server_log" 2>&1) &
  server=$!
  until curl -s -o /dev/null "$POCHICAL_DEV_SERVER"; do
    kill -0 "$server" 2>/dev/null || { echo "the server did not start: $server_log" >&2; exit 1; }
    sleep 1
  done
}

stop_server() {
  [ -n "$server" ] || return 0
  kill "$server" 2>/dev/null || true
  wait "$server" 2>/dev/null || true
  server=""
  while curl -s -o /dev/null "$POCHICAL_DEV_SERVER"; do sleep 1; done
}

xcodebuild_for() {
  xcodebuild "$1" -project "$root/apps/ios/Pochical/Pochical.xcodeproj" -scheme Pochical \
    -destination "platform=iOS Simulator,name=$device" -derivedDataPath "$derived" \
    -skipMacroValidation POCHICAL_DEV_SERVER="$POCHICAL_DEV_SERVER" "${@:2}"
}

# Builds the tests, erases and boots the simulator, and starts the server
# on an up-to-date local database.
prepare() {
  xcodebuild_for build-for-testing -quiet
  xcrun simctl shutdown "$device" 2>/dev/null || true
  xcrun simctl erase "$device"
  xcrun simctl boot "$device"
  (cd "$root/apps/server" && bunx wrangler d1 migrations apply pochical --local >/dev/null)
  start_server
}

# A new group, made by a new user, its invitation code kept in "$1", and
# named "$2" if given.
new_group() {
  rm -f "$root/tools/api-try/out/state.json"
  bun "$root/tools/api-try/index.ts" create ${2:+"$2"} --local
  jq -r .inviteCode "$root/tools/api-try/out/state.json" >"$1"
}

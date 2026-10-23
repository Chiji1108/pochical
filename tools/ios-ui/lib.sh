# What the UI test runs (tools/*/run.sh) share: the app and its tests built
# for a simulator, the simulator erased, `mise run server` started and
# stopped on :8787, and a group made there by tools/api-try.
#
#   . "$root/tools/ios-ui/lib.sh"
#
# Before sourcing, set `device` (a simulator's name), `root` (the repo),
# `derived` (the derived data) and `server_log` (where the server writes).

server=""

start_server() {
  (cd "$root/apps/server" && exec bunx wrangler dev >>"$server_log" 2>&1) &
  server=$!
  until curl -s -o /dev/null http://localhost:8787; do
    kill -0 "$server" 2>/dev/null || { echo "the server did not start: $server_log" >&2; exit 1; }
    sleep 1
  done
}

stop_server() {
  [ -n "$server" ] || return 0
  pkill -P "$server" 2>/dev/null || true
  kill "$server" 2>/dev/null || true
  wait "$server" 2>/dev/null || true
  server=""
  while curl -s -o /dev/null http://localhost:8787; do sleep 1; done
}

xcodebuild_for() {
  xcodebuild "$1" -project "$root/apps/ios/Pochical/Pochical.xcodeproj" -scheme Pochical \
    -destination "platform=iOS Simulator,name=$device" -derivedDataPath "$derived" \
    -skipMacroValidation "${@:2}"
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

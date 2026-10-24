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

# The server runs in a process group of its own, led by mise (`server`),
# which runs the task's shell, pnpm, wrangler and workerd in a group of
# their own; stopping signals both groups.
start_server() {
  (cd "$root" && exec perl -e 'setpgrp; exec @ARGV' mise run server -- --port "$port" >>"$server_log" 2>&1) &
  server=$!
  until curl -s -o /dev/null "$POCHICAL_DEV_SERVER"; do
    kill -0 "$server" 2>/dev/null || { echo "the server did not start: $server_log" >&2; exit 1; }
    sleep 1
  done
}

stop_server() {
  [ -n "$server" ] || return 0
  local group
  for group in "$server" $(ps -A -o ppid=,pgid= | awk -v p="$server" '$1 == p { print $2 }'); do
    kill -- "-$group" 2>/dev/null || true
  done
  wait "$server" 2>/dev/null || true
  server=""
  for _ in $(seq 30); do
    curl -s -o /dev/null "$POCHICAL_DEV_SERVER" || return 0
    sleep 1
  done
  echo "the server still answers at $POCHICAL_DEV_SERVER 30s after it was stopped" >&2
  exit 1
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
  (cd "$root/apps/server" && pnpm exec wrangler d1 migrations apply pochical --local >/dev/null)
  start_server
}

# A new group, made by a new user, its invitation code kept in "$1", and
# named "$2" if given.
new_group() {
  rm -f "$root/tools/api-try/out/state.json"
  pnpm --dir "$root" exec tsx "$root/tools/api-try/index.ts" create ${2:+"$2"} --local
  jq -r .inviteCode "$root/tools/api-try/out/state.json" >"$1"
}

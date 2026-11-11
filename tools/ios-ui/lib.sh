# What the UI test runs (tools/*/run.sh) share: the app and its tests built
# for a simulator to reach POCHICAL_DEV_SERVER (http://localhost:8787 by
# default), the simulator erased, `mise run server` started and stopped
# there, and a group made there by tools/api-try.
#
#   . "$root/tools/ios-ui/lib.sh"
#
# Before sourcing, set `root` (the repo) and `server_log` (where the server
# writes), all the server's functions need (tools/store-screenshots/android.sh),
# and for the simulator's, `device` (its name) and `derived` (the derived
# data).

export POCHICAL_DEV_SERVER=${POCHICAL_DEV_SERVER:-http://localhost:8787}
[[ $POCHICAL_DEV_SERVER =~ ^http://localhost:([0-9]+)$ ]] ||
  { echo "POCHICAL_DEV_SERVER is not http://localhost:<port>: $POCHICAL_DEV_SERVER" >&2; exit 1; }
port=${BASH_REMATCH[1]}
server=""

# The server runs in a process group of its own, led by mise (`server`),
# which runs the task's shell, pnpm, wrangler and workerd in a group of
# their own; stopping signals both groups. It starts on an up-to-date local
# database, and only where nothing answers yet: another server on the port
# would be the one seeded, wrangler's failure to bind going unseen. What
# answers once ours runs is ours.
start_server() {
  if curl -s -o /dev/null "$POCHICAL_DEV_SERVER"; then
    echo "something answers at $POCHICAL_DEV_SERVER already: stop it, or name a free port in POCHICAL_DEV_SERVER" >&2
    exit 1
  fi
  (cd "$root/apps/server" && pnpm exec wrangler d1 migrations apply pochical --local >/dev/null)
  (cd "$root" && exec perl -e 'setpgrp; exec @ARGV' mise run server -- --port "$port" >>"$server_log" 2>&1) &
  server=$!
  until curl -s -o /dev/null "$POCHICAL_DEV_SERVER" && kill -0 "$server" 2>/dev/null; do
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
  return 1
}

# -skipPackagePluginValidation: no one is here to trust the packages' build
# plugins (LicenseList's), as in CI.
xcodebuild_for() {
  xcodebuild "$1" -project "$root/apps/ios/Pochical/Pochical.xcodeproj" -scheme Pochical \
    -destination "platform=iOS Simulator,name=$device" -derivedDataPath "$derived" \
    -skipMacroValidation -skipPackagePluginValidation POCHICAL_DEV_SERVER="$POCHICAL_DEV_SERVER" "${@:2}"
}

# Builds the tests, erases and boots the simulator, and starts the server.
prepare() {
  xcodebuild_for build-for-testing -quiet
  xcrun simctl shutdown "$device" 2>/dev/null || true
  xcrun simctl erase "$device"
  xcrun simctl boot "$device"
  start_server
}

# A new group, made by a new user, its invitation code kept in "$1", and
# named "$2" if given.
new_group() {
  rm -f "$root/tools/api-try/out/state.json"
  pnpm --dir "$root" exec tsx "$root/tools/api-try/index.ts" create ${2:+"$2"} --local
  jq -r .inviteCode "$root/tools/api-try/out/state.json" >"$1"
}

# A 900×1200 JPEG of the color "$1" with "$2" written on it, at "$3".
photo() {
  magick -size 900x1200 xc:"$1" -font /System/Library/Fonts/Supplemental/Arial.ttf -gravity center \
    -pointsize 400 -fill white -annotate 0 "$2" "$3"
}

# The tests, run in the background by a script that talks to them: their
# pid, once started. They tell the script a step is done by a file in
# `shared` named for it.
tests=""

# Waits for the tests to name the step "$1", false once they have ended
# without.
step() {
  until [ -e "$shared/$1" ]; do
    kill -0 "$tests" 2>/dev/null || return 1
    sleep 1
  done
}

# Stops the tests, should the script end before them.
stop_tests() {
  [ -n "$tests" ] || return 0
  kill "$tests" 2>/dev/null || true
  wait "$tests" 2>/dev/null || true
}

# The simulator's user: the session made last, once it has joined.
signed_in_user() {
  (cd "$root/apps/server" &&
    pnpm exec wrangler d1 execute pochical --local --json \
      --command "select user_id from session order by created_at desc limit 1" |
    jq -r '.[0].results[0].user_id')
}

# Pushes to the simulator a notification of a line of the chat of the group
# "$1" for the user "$2", worded as the server's (apns.ts payloadOf): the
# line "$4" from "$3". Its payload is kept at "$5".
push_line() {
  jq -n --arg group "$1" --arg me "$2" --arg from "$3" --arg words "$4" '{
    aps: {
      alert: {
        "title-loc-key": "CHAT_TITLE", "title-loc-args": ["ポチカルのテスト"],
        "loc-key": "CHAT_GROUP_TEXT", "loc-args": [$from, $words]
      },
      badge: 1, "mutable-content": 1, sound: "default", "thread-id": "\($group)/group"
    },
    groupId: $group, recipientId: $me, threadId: "group"
  }' >"$5"
  xcrun simctl push "$device" app.pochical "$5"
}

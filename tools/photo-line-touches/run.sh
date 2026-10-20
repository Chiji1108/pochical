#!/bin/bash
# Runs PhotoLineTouchTests (apps/ios/Pochical/PochicalUITests) in a
# simulator against `mise run server`: who takes which touch on a chat's
# photo line (POC-130). It starts the server itself, so nothing else may be
# on :8787, and erases the simulator it is given.
#
#   tools/photo-line-touches/run.sh "<simulator name>" [derived data]
#
# The app and its tests are built first (build-for-testing) into the
# derived data, `.build/DerivedData` by default. Between the tests it
# stops the server, for a photo to stay going up, and takes a photo out of
# the local bucket, for its fetch to fail, putting it back once ↻ shows.
# It fails when any test does, after running them all, and leaves each
# test's results, with its screenshots, in the folder it names last.
set -euo pipefail

device=${1:?simulator name}
root=$(cd "$(dirname "$0")/../.." && pwd)
derived=${2:-$root/.build/DerivedData}
shared=$(mktemp -d)
server_log=$shared/server.log
server=""

start_server() {
  (cd "$root/apps/server" && exec bunx wrangler dev >>"$server_log" 2>&1) &
  server=$!
  until curl -s -o /dev/null http://localhost:8787; do sleep 1; done
}

stop_server() {
  [ -n "$server" ] || return 0
  pkill -P "$server" 2>/dev/null || true
  kill "$server" 2>/dev/null || true
  wait "$server" 2>/dev/null || true
  server=""
  while curl -s -o /dev/null http://localhost:8787; do sleep 1; done
}
trap stop_server EXIT

failed=0
run_test() {
  TEST_RUNNER_PHOTO_TOUCH_DIR=$shared xcodebuild test-without-building \
    -project "$root/apps/ios/Pochical/Pochical.xcodeproj" -scheme Pochical \
    -destination "platform=iOS Simulator,name=$device" -derivedDataPath "$derived" -parallel-testing-enabled NO \
    -resultBundlePath "$shared/$1.xcresult" \
    -only-testing:"PochicalUITests/PhotoLineTouchTests/$1"
}

photo() {
  magick -size 900x1200 xc:"$1" -font /System/Library/Fonts/Supplemental/Arial.ttf -gravity center -pointsize 400 -fill white \
    -annotate 0 "$2" "$3"
}

xcrun simctl shutdown "$device" 2>/dev/null || true
xcrun simctl erase "$device"
xcrun simctl boot "$device"
photo "#3a7bd5" 1 "$shared/1.jpg"
xcrun simctl addmedia "$device" "$shared/1.jpg"

(cd "$root/apps/server" && bunx wrangler d1 migrations apply pochical --local >/dev/null)
start_server
rm -f "$root/tools/api-try/out/state.json"
bun "$root/tools/api-try/index.ts" create --local
code=$(jq -r .inviteCode "$root/tools/api-try/out/state.json")
group=$(jq -r .groupId "$root/tools/api-try/out/state.json")
echo "$code" >"$shared/invite"
mkdir "$shared/first" "$shared/second"
photo "#d53a7b" 2 "$shared/first/2.jpg"
photo "#3ad57b" 3 "$shared/second/3.jpg"
bun "$root/tools/chat-try/index.ts" "$code" --photos "$shared/first"

run_test test1HoldingOthersPhotoOpensItsMenu || failed=1
run_test test2HoldingOnesOwnPhotoJustSentOpensItsMenu || failed=1

stop_server
run_test test3TappingXStopsAPhotoGoingUp || failed=1
start_server

bun "$root/tools/chat-try/index.ts" "$code" --photos "$shared/second"
bucket=$(ls "$root"/apps/server/.wrangler/state/v3/r2/miniflare-R2BucketObject/*.sqlite |
  grep -v metadata)
key=$(sqlite3 "$bucket" \
  "select key from _mf_objects where key like 'groups/$group/photos/%' and key not like '%/small' order by uploaded desc limit 1")
(cd "$root/apps/server" &&
  bunx wrangler r2 object get "pochical-photos/$key" --local --file "$shared/hidden.jpg" &&
  bunx wrangler r2 object delete "pochical-photos/$key" --local)

run_test test4HoldingAndTappingAPhotoNotFetched &
tests=$!
until [ -e "$shared/retry-shown" ] || ! kill -0 "$tests" 2>/dev/null; do sleep 1; done
(cd "$root/apps/server" &&
  bunx wrangler r2 object put "pochical-photos/$key" --local --file "$shared/hidden.jpg" \
    --content-type image/jpeg)
touch "$shared/photo-back"
wait "$tests" || failed=1
xcrun simctl shutdown "$device"
echo "results and screenshots: $shared"
exit "$failed"

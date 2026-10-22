#!/bin/bash
# Runs PhotoLineTouchTests (apps/ios/Pochical/PochicalUITests) in a
# simulator against `mise run server`: who takes which touch on a chat's
# photo line (POC-130). It starts the server itself, so nothing else may be
# on :8787, and erases the simulator it is given.
#
#   mise run ios:photo-touches -- "<simulator name>" [derived data]
#
# It builds the app and its tests first (build-for-testing) into the
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
. "$root/tools/ios-ui/lib.sh"

# The photo taken out of the bucket, put back however the run ends.
hidden=""
put_back() {
  [ -n "$hidden" ] || return 0
  (cd "$root/apps/server" &&
    bunx wrangler r2 object put "pochical-photos/$hidden" --local --file "$shared/hidden.jpg" \
      --content-type image/jpeg)
  hidden=""
}
trap 'put_back; stop_server' EXIT

failed=0
run_test() {
  TEST_RUNNER_PHOTO_TOUCH_DIR=$shared xcodebuild_for test-without-building \
    -parallel-testing-enabled NO -resultBundlePath "$shared/$1.xcresult" \
    -only-testing:"PochicalUITests/PhotoLineTouchTests/$1"
}

photo() {
  magick -size 900x1200 xc:"$1" -font /System/Library/Fonts/Supplemental/Arial.ttf -gravity center -pointsize 400 -fill white \
    -annotate 0 "$2" "$3"
}

prepare
photo "#3a7bd5" 1 "$shared/1.jpg"
xcrun simctl addmedia "$device" "$shared/1.jpg"

new_group "$shared/invite"
code=$(cat "$shared/invite")
group=$(jq -r .groupId "$root/tools/api-try/out/state.json")
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
hidden=$key

run_test test4HoldingAndTappingAPhotoNotFetched &
tests=$!
until [ -e "$shared/retry-shown" ] || ! kill -0 "$tests" 2>/dev/null; do sleep 1; done
put_back
touch "$shared/photo-back"
wait "$tests" || failed=1
xcrun simctl shutdown "$device" || true
echo "results and screenshots: $shared"
exit "$failed"

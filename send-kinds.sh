#!/bin/bash
# POC-139 simulator run: the app sends each kind and replies from a
# notification against a local server this script starts. Needs the
# server-8787 lock and an iOS slot held by the caller; builds nothing.
set -uo pipefail
root=/Users/chiji/js/pochical/.claude/worktrees/agent-aba6c3aa6a750b57e
pad=/private/tmp/claude-501/-Users-chiji-js-pochical--claude-worktrees-pochical-build-simulator-1dffdb/675d6a46-2457-4b34-8edf-993f4979b0df/scratchpad
out=$pad/POC-139
device=7F530991-5681-496E-B2EA-B1FDB0783C08
derived=$root/.build/DerivedData
rm -rf "$out"; mkdir -p "$out/album"
log=$out/server.log
server=""

stop_server() {
  [ -n "$server" ] || return 0
  pkill -P "$server" 2>/dev/null; kill "$server" 2>/dev/null; wait "$server" 2>/dev/null
  server=""
}
trap 'stop_server; xcrun simctl shutdown "$device" 2>/dev/null' EXIT

lines() {
  for db in "$root"/apps/server/.wrangler/state/v3/do/*/*.sqlite; do
    sqlite3 "$db" "select seq, author_id, content from chat_lines order by seq" 2>/dev/null
  done
}

xcrun simctl shutdown "$device" 2>/dev/null
xcrun simctl erase "$device" || exit 1
xcrun simctl boot "$device" || exit 1
for c in "#3a7bd5:1" "#d53a7b:2" "#3ad57b:3"; do
  magick -size 900x1200 xc:"${c%%:*}" -font /System/Library/Fonts/Supplemental/Arial.ttf -gravity center -pointsize 400 -fill white \
    -annotate 0 "${c##*:}" "$out/${c##*:}.jpg" || exit 1
done
xcrun simctl addmedia "$device" "$out/1.jpg" "$out/2.jpg"
cp "$out/3.jpg" "$out/album/3.jpg"

(cd "$root/apps/server" && bunx wrangler d1 migrations apply pochical --local >/dev/null) || exit 1
(cd "$root/apps/server" && exec bunx wrangler dev >>"$log" 2>&1) &
server=$!
for _ in $(seq 1 120); do curl -s -o /dev/null http://localhost:8787 && break; sleep 1; done
curl -s -o /dev/null http://localhost:8787 || { echo "server did not start"; exit 1; }

rm -f "$root/tools/api-try/out/state.json"
bun "$root/tools/api-try/index.ts" create --local >/dev/null || exit 1
code=$(jq -r .inviteCode "$root/tools/api-try/out/state.json")
echo "$code" >"$out/invite"
bun "$root/tools/chat-try/index.ts" "$code" 1 || exit 1
bun "$root/tools/chat-try/index.ts" "$code" --photos "$out/album" --album || exit 1

SEND_KINDS_DIR=$out TEST_RUNNER_SEND_KINDS_DIR=$out xcodebuild test-without-building \
  -project "$root/apps/ios/Pochical/Pochical.xcodeproj" -scheme Pochical \
  -destination "platform=iOS Simulator,id=$device" -derivedDataPath "$derived" \
  -skipMacroValidation -parallel-testing-enabled NO -resultBundlePath "$out/run.xcresult" \
  -only-testing:PochicalUITests/SendKindsTry >"$out/test.log" 2>&1 &
tests=$!

for _ in $(seq 1 300); do [ -e "$out/sent" ] || ! kill -0 "$tests" 2>/dev/null && break; sleep 1; done
if [ -e "$out/sent" ]; then
  lines >"$out/lines-before-reply.txt"
  me=$(grep 'ことばを送る' "$out/lines-before-reply.txt" | head -1 | cut -d'|' -f2)
  seq=$(grep -v "|$me|" "$out/lines-before-reply.txt" | grep '"kind":"words"' | tail -1 | cut -d'|' -f1)
  group=$(jq -r .groupId "$root/tools/api-try/out/state.json")
  cat >"$out/push.json" <<JSON
{"Simulator Target Bundle":"app.pochical","aps":{"alert":{"title":"全体チャット","body":"まだですか？"},"category":"CHAT_LINE","mutable-content":1,"thread-id":"$group/group"},"groupId":"$group","threadId":"group","seq":$seq,"authorId":"other","recipientId":"$me"}
JSON
  xcrun simctl push "$device" app.pochical "$out/push.json"
  touch "$out/pushed"
  for _ in $(seq 1 90); do lines | grep -q '通知から返信' && break; sleep 1; done
  touch "$out/replied"
fi
wait "$tests"; code=$?
lines >"$out/lines.txt"
echo "test exit $code"
exit $code

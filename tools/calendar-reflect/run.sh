#!/bin/bash
# Runs CalendarReflectTests (apps/ios/Pochical/PochicalUITests) in a
# simulator against `mise run server`: a month added to the device's
# calendar asks これからも自動で反映しますか？, and turned on, a day's shift
# changed changes that day's event alone, with nothing put in twice after
# several changes and a relaunch, the months ahead in too, until it is
# turned off (spec/calendar.md, Reflecting automatically, #1153).
# The tests drive the app and this script reads the simulator's calendars
# after each step, from their database on this Mac, as the tests cannot.
# It starts the server itself, so nothing else may be on
# POCHICAL_DEV_SERVER (:8787 by default), and erases the simulator it is
# given.
#
#   mise run ios:calendar-reflect -- "<simulator name>" [derived data]
#
# It builds the app and its tests first (build-for-testing) into the
# derived data, `.build/DerivedData` by default. It fails when the test
# does, and leaves the results, with their screenshots, in the folder it
# names last.
set -euo pipefail

device=${1:?simulator name}
root=$(cd "$(dirname "$0")/../.." && pwd)
derived=${2:-$root/.build/DerivedData}
shared=$(mktemp -d)
server_log=$shared/server.log
. "$root/tools/ios-ui/lib.sh"
trap 'stop_tests; stop_server' EXIT

prepare
xcrun simctl privacy "$device" grant calendar app.pochical
udid=$(xcrun simctl list devices -j | jq -r --arg name "$device" '[.devices[][] | select(.name == $name)][0].udid')
calendars="$HOME/Library/Developer/CoreSimulator/Devices/$udid/data/Library/Calendar/Calendar.sqlitedb"

# The events carrying Pochical's mark, by the day it names.
marked="select ROWID as id, summary, substr(description, instr(description, 'https://pochical.app/day/') + 25, 10) as day
  from CalendarItem where description like '%https://pochical.app/day/____-__-__#by=%'"

ask() {
  sqlite3 "file:$calendars?mode=ro" "with marked as ($marked) $1"
}

# Every marked event but the day "$1"'s, by its day: its id and title.
others() {
  ask "select day, id, summary from marked where day <> '$1' order by day, id"
}

# Says the step "$1" is as it should be, or why it is not ("$2").
answer() {
  if [ -z "${2:-}" ]; then touch "$shared/$1.checked"; else echo "$2" >"$shared/$1.failed"; fi
  # The test takes its question away once it has the answer.
  while [ -e "$shared/$1" ] && kill -0 "$tests" 2>/dev/null; do sleep 1; done
}

# Waits for the day "$1"'s event to be titled "$2", for a while.
titled() {
  for _ in $(seq 30); do
    [ "$(ask "select group_concat(summary) from marked where day = '$1'")" = "$2" ] && return 0
    sleep 1
  done
  return 1
}

doubled() {
  ask "select group_concat(day) from (select day from marked group by day having count(*) > 1)"
}

TEST_RUNNER_CALENDAR_REFLECT_DIR=$shared xcodebuild_for test-without-building \
  -collect-test-diagnostics never -parallel-testing-enabled NO \
  -resultBundlePath "$shared/results.xcresult" \
  -only-testing:PochicalUITests/CalendarReflectTests &
tests=$!

if step reflecting; then
  this=$(date +%Y-%m)
  # The last month kept: `reflectedMonthsAhead` (design/src/days.ts) on.
  ahead=$(jq -r .days.reflectedMonthsAhead "$root/spec/design-tokens.json")
  last=$(date -v+"${ahead}"m +%Y-%m)
  why=""
  for _ in $(seq 30); do
    why=""
    [ "$(ask "select count(*) from marked where day like '$this-%'")" -gt 0 ] || why="no events in $this"
    [ "$(ask "select count(*) from marked where day like '$last-%'")" -gt 0 ] || why="no events in $last, $ahead months ahead"
    [ -z "$why" ] && break
    sleep 1
  done
  [ -z "$(doubled)" ] || why="put in twice: $(doubled)"
  ask "select substr(day, 1, 7), count(*) from marked group by 1" | sed 's/^/events: /'
  others none >"$shared/events"
  answer reflecting "$why"
fi

for _ in 1 2 3; do
  step changed || break
  read -r day title <"$shared/changed" || true
  why=""
  titled "$day" "$title" || why="$day's event is $(ask "select group_concat(summary) from marked where day = '$day'"), not $title"
  [ -z "$(doubled)" ] || why="put in twice: $(doubled)"
  [ "$(others "$day")" = "$(grep -v "^$day|" "$shared/events")" ] || why="other days' events were written again"
  echo "changed: $day is $title"
  answer changed "$why"
done

if step relaunched; then
  before=$(others none)
  # Nothing is to happen: the app is given a while to do it in.
  sleep 8
  why=""
  [ "$(others none)" = "$before" ] || why="events were written again with nothing changed"
  [ -z "$(doubled)" ] || why="put in twice: $(doubled)"
  echo "relaunched: $(ask "select count(*) from marked") events as they were"
  answer relaunched "$why"
fi

if step off; then
  read -r day title <"$shared/off" || true
  before=$(others none)
  sleep 8
  why=""
  [ "$(others none)" = "$before" ] || why="events changed with 自動で反映 off"
  titled "$day" "$title" || why="$day's event is no longer $title"
  echo "off: $day is still $(ask "select group_concat(summary) from marked where day = '$day'")"
  answer off "$why"
fi

failed=0
wait "$tests" || failed=1
tests=""
xcrun simctl shutdown "$device" || true
echo "results and screenshots: $shared"
exit "$failed"

#!/bin/bash
# Runs NarrowWindowTests (apps/ios/Pochical/PochicalUITests) in an iPad
# simulator against `mise run server`: the window dragged as narrow as
# iPadOS lets it go, upright and on its side, and the calendar, the tray,
# the group's hub, its chat, みんなのシフト and 設定 each checked to fit,
# clear of the window's controls, and photographed (spec/calendar.md, In
# a narrow window). It starts the server itself, so nothing else may be on
# POCHICAL_DEV_SERVER (:8787 by default), and erases the simulator it is
# given.
#
#   mise run ios:narrow-window -- "<iPad simulator name>" [derived data]
#
# It builds the app and its tests first (build-for-testing) into the
# derived data, `.build/DerivedData` by default, and makes a group with a
# chat of thirty lines for the simulator's user to join. It fails when
# the test does, and leaves the results, with their screenshots, in the
# folder it names last.
set -euo pipefail

device=${1:?iPad simulator name}
root=$(cd "$(dirname "$0")/../.." && pwd)
derived=${2:-$root/.build/DerivedData}
shared=$(mktemp -d)
server_log=$shared/server.log
. "$root/tools/ios-ui/lib.sh"
trap stop_server EXIT

run_with_chat NarrowWindowTests NARROW_WINDOW_DIR

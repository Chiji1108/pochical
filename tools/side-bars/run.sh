#!/bin/bash
# Runs SideBarsTests (apps/ios/Pochical/PochicalUITests) in a simulator
# against `mise run server`: the group's hub, its chat, みんなのシフト, the
# calendar entering and 設定, each checked clear of the system's bars and
# photographed. On iPhone Duo's outer display the bars stand down its
# side (#1224); on any other iPhone it checks the same against the bars
# over and under the screen. It starts the server itself, so nothing else
# may be on POCHICAL_DEV_SERVER (:8787 by default), and erases the
# simulator it is given.
#
#   mise run ios:side-bars -- "<simulator name>" [derived data]
#
# It builds the app and its tests first (build-for-testing) into the
# derived data, `.build/DerivedData` by default, and makes a group with a
# chat of thirty lines for the simulator's user to join. It fails when
# the test does, and leaves the results, with their screenshots, in the
# folder it names last.
set -euo pipefail

device=${1:?simulator name}
root=$(cd "$(dirname "$0")/../.." && pwd)
derived=${2:-$root/.build/DerivedData}
shared=$(mktemp -d)
server_log=$shared/server.log
. "$root/tools/ios-ui/lib.sh"
trap stop_server EXIT

run_with_chat SideBarsTests SIDE_BARS_DIR

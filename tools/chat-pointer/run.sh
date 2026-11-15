#!/bin/bash
# Runs ChatPointerTests (apps/ios/Pochical/PochicalUITests) in a simulator
# against `mise run server`: a line's menu opened by a right click
# (spec/chat.md, A keyboard and a mouse), on an iPad, where a pointer is
# used most; the keys are pinned by PochicalTests' ComposerKeysTests. It
# starts the server itself, so nothing else may be on POCHICAL_DEV_SERVER
# (:8787 by default), and erases the simulator it is given.
#
#   mise run ios:chat-pointer -- "<simulator name>" [derived data]
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

run_with_chat ChatPointerTests CHAT_POINTER_DIR

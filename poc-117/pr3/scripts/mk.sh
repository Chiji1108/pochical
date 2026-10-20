#!/bin/bash
# mk.sh <name>: builds the branch as it is with the probes in, into apps/<name>.app,
# the probes then taken out again (the branch's own changes must be committed).
set -u
P="$(dirname "$0")"
. "$P/env.sh"
python3 "$P/probe.py" "$WT" apply branch || exit 1
bash "$P/build.sh" "$1"
python3 "$P/probe.py" "$WT" revert
rm -rf "$P/apps/$1.app"
cp -R "$S/dd/Build/Products/Debug-iphonesimulator/Pochical.app" "$P/apps/$1.app"

#!/bin/bash
# build.sh <log name> [clean]: builds the worktree's app for the sim into dd.
set -u
. "$(dirname "$0")/env.sh"
ACTION=build
[ "${2:-}" = clean ] && ACTION="clean build"
cd "$WT"
xcodebuild -project apps/ios/Pochical/Pochical.xcodeproj -scheme Pochical \
  -destination "id=$SIM" -derivedDataPath "$S/dd" \
  -skipMacroValidation $ACTION > "$S/logs/$1.log" 2>&1
grep -E "error:|BUILD (SUCCEEDED|FAILED)" "$S/logs/$1.log" | sort -u | head -30
grep -E "warning:" "$S/logs/$1.log" | sed -E 's/^[^ ]*\/(apps|SourcePackages)/\1/' | sort -u > "$S/logs/$1.warnings"
wc -l < "$S/logs/$1.warnings"

#!/bin/bash
# ab.sh [log name]: builds this worktree's app for the POC-117 simulator and
# installs it.
set -u
D=/private/tmp/claude-501/-Users-chiji-js-pochical--claude-worktrees-serene-wing-a4ff85/f7887dad-3eb8-4bb5-a39c-1e843ed85269/scratchpad/navprobe
SIM=9B0E841D-9B7B-4719-B62A-EE9794B67A17
LOG=$D/${1:-app-build}.log
cd /Users/chiji/js/pochical/.claude/worktrees/agent-a9f095502e9c7d4a0
xcodebuild -project apps/ios/Pochical/Pochical.xcodeproj -scheme Pochical \
  -destination id=$SIM -derivedDataPath "$D/dd-app" \
  -skipMacroValidation build > "$LOG" 2>&1
grep -E "error:|BUILD" "$LOG" | sort -u | head -30
xcrun simctl install $SIM "$D/dd-app/Build/Products/Debug-iphonesimulator/Pochical.app"

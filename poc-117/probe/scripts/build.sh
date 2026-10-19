#!/bin/bash
# build.sh: builds the worktree's app for the probe simulator, installs it.
set -u
DIR=/private/tmp/claude-501/-Users-chiji-js-pochical--claude-worktrees-serene-wing-a4ff85/f7887dad-3eb8-4bb5-a39c-1e843ed85269/scratchpad/probe
cd /Users/chiji/js/pochical/.claude/worktrees/agent-a01b838978423793e
xcodebuild -project apps/ios/Pochical/Pochical.xcodeproj -scheme Pochical \
  -destination id=E24D45FF-4C63-4B51-AE21-808A0D99BA1F -derivedDataPath "$DIR/dd-poc" \
  -skipMacroValidation build > "$DIR/build-pr.log" 2>&1
grep -E "error:|BUILD" "$DIR/build-pr.log" | sort -u | head -20
xcrun simctl install E24D45FF-4C63-4B51-AE21-808A0D99BA1F "$DIR/dd-poc/Build/Products/Debug-iphonesimulator/Pochical.app"

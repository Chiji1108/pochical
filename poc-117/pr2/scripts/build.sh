#!/bin/bash
# build.sh <log name> [clean]: builds the worktree's app for sim A into p2/dd.
set -u
S=/private/tmp/claude-501/-Users-chiji-js-pochical--claude-worktrees-serene-wing-a4ff85/f7887dad-3eb8-4bb5-a39c-1e843ed85269/scratchpad/p2
cd /Users/chiji/js/pochical/.claude/worktrees/agent-a891e81e362b4f5b9
ACTION=build
[ "${2:-}" = clean ] && ACTION="clean build"
xcodebuild -project apps/ios/Pochical/Pochical.xcodeproj -scheme Pochical \
  -destination "id=$(cat $S/simA)" -derivedDataPath "$S/dd" \
  -skipMacroValidation $ACTION > "$S/$1.log" 2>&1
grep -E "error:|BUILD (SUCCEEDED|FAILED)" "$S/$1.log" | sort -u | head -20
grep -E "warning:" "$S/$1.log" | sed -E 's/^[^ ]*\/(apps|SourcePackages)/\1/' | sort -u > "$S/$1.warnings"
wc -l < "$S/$1.warnings"

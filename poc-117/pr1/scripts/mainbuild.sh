#!/bin/bash
# mainbuild.sh: a clean build of origin/main's iOS app (pointed at 8788),
# kept as main-build.log for its warnings.
set -u
D=/private/tmp/claude-501/-Users-chiji-js-pochical--claude-worktrees-serene-wing-a4ff85/f7887dad-3eb8-4bb5-a39c-1e843ed85269/scratchpad/navprobe
rm -rf "$D/dd-main"
xcodebuild -project "$D/main/apps/ios/Pochical/Pochical.xcodeproj" -scheme Pochical \
  -destination id=9B0E841D-9B7B-4719-B62A-EE9794B67A17 -derivedDataPath "$D/dd-main" \
  -skipMacroValidation build > "$D/main-build.log" 2>&1
grep -E "error:|BUILD" "$D/main-build.log" | sort -u | head

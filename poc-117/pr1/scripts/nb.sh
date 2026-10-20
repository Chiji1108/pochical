#!/bin/bash
# nb.sh: builds the nav probe for the POC-117 root nav simulator.
set -u
D=/private/tmp/claude-501/-Users-chiji-js-pochical--claude-worktrees-serene-wing-a4ff85/f7887dad-3eb8-4bb5-a39c-1e843ed85269/scratchpad/navprobe
cd $D
xcodebuild -project Probe.xcodeproj -scheme Probe -destination id=9B0E841D-9B7B-4719-B62A-EE9794B67A17 -derivedDataPath $D/dd build > $D/build.log 2>&1
grep -E "error:|BUILD" $D/build.log | sort -u | head -20

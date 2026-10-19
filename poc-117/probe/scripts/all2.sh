#!/bin/bash
set -u
cd /private/tmp/claude-501/-Users-chiji-js-pochical--claude-worktrees-serene-wing-a4ff85/f7887dad-3eb8-4bb5-a39c-1e843ed85269/scratchpad/probe
xcodebuild -project Probe.xcodeproj -scheme Probe -destination id=E24D45FF-4C63-4B51-AE21-808A0D99BA1F -derivedDataPath dd build 2>&1 | grep -E "error:|BUILD"
bash run.sh b2 18 -mode B -script q2 -inset delta
bash run.sh a2 18 -mode A -script q2 -inset delta
for f in b2 a2; do tr -d '\r' < out/$f.log > out/$f.txt; grep STEP out/$f.txt; done

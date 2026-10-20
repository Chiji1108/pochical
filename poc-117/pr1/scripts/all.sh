#!/bin/bash
set -u
cd /private/tmp/claude-501/-Users-chiji-js-pochical--claude-worktrees-serene-wing-a4ff85/f7887dad-3eb8-4bb5-a39c-1e843ed85269/scratchpad/probe
xcodebuild -project Probe.xcodeproj -scheme Probe -destination id=E24D45FF-4C63-4B51-AE21-808A0D99BA1F -derivedDataPath dd build 2>&1 | grep -E "error:|BUILD"
bash run.sh b-restore 18 -mode B -script q2
bash run.sh b-delta 18 -mode B -script q2 -inset delta
bash run.sh a-restore 18 -mode A -script q2
bash run.sh a-delta 18 -mode A -script q2 -inset delta
bash run.sh q1-late 10 -mode B -script q1 -lateGuide
bash run.sh q3 17 -mode B -script q3 -inset delta
for f in out/*.log; do echo "== $f"; grep -E "STEP|SAMPLE end|PREFERRED|ANIM" "$f" | cut -c1-200 | head -40; done

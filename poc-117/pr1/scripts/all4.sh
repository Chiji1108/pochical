#!/bin/bash
set -u
cd /private/tmp/claude-501/-Users-chiji-js-pochical--claude-worktrees-serene-wing-a4ff85/f7887dad-3eb8-4bb5-a39c-1e843ed85269/scratchpad/probe
xcodebuild -project Probe.xcodeproj -scheme Probe -destination id=E24D45FF-4C63-4B51-AE21-808A0D99BA1F -derivedDataPath dd build 2>&1 | grep -E "error:|BUILD"
for v in "$@"; do
  case $v in
    b4) bash run.sh b4 18 -mode B -script q2 -inset delta -width ;;
    a4) bash run.sh a4 18 -mode A -script q2 -inset delta -width ;;
    b4s) bash run.sh b4s 18 -mode B -script q2 -inset delta -width -motion smooth ;;
    a4s) bash run.sh a4s 18 -mode A -script q2 -inset delta -width -motion smooth ;;
    b5) bash run.sh b5 18 -mode B -script q2 -inset delta -width -top ;;
    b5s) bash run.sh b5s 18 -mode B -script q2 -inset delta -width -top -motion smooth ;;
    b6) bash run.sh b6 18 -mode B -script q2 -inset delta -width -top -box ;;
    b6s) bash run.sh b6s 18 -mode B -script q2 -inset delta -width -top -box -motion smooth ;;
    b7) bash run.sh b7 18 -mode B -script q2 -inset delta -width -top ;;
    b7s) bash run.sh b7s 18 -mode B -script q2 -inset delta -width -top -motion smooth ;;
    b8) bash run.sh b8 18 -mode B -script q2 -inset delta -width ;;
    b9) bash run.sh b9 18 -mode B -script q2 -inset delta -width -top ;;
    b9s) bash run.sh b9s 18 -mode B -script q2 -inset delta -width -top -motion smooth ;;
    few2) bash run.sh few2 18 -mode B -script q2 -inset delta -width -top -few -relayout ;;
    b10) bash run.sh b10 18 -mode B -script q2 -inset delta -width -top -relayout ;;
    c1) bash run.sh c1 12 -mode B -script both -inset delta -width -top -relayout -motion spring ;;
    c2) bash run.sh c2 12 -mode B -script both -inset delta -width -top -relayout -motion spring -uikitSpring ;;
  esac
  tr -d '\r' < out/$v.log > out/$v.txt
  python3 -I column4.py out/$v.mp4 0 40 > fr/$v-c4.txt
done

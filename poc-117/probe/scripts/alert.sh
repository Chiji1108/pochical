#!/bin/bash
# alert.sh: runs the probe's alert script (keyboard up, then the system's
# notification prompt over it), dismisses the prompt, and shows its log.
set -u
P=/private/tmp/claude-501/-Users-chiji-js-pochical--claude-worktrees-serene-wing-a4ff85/f7887dad-3eb8-4bb5-a39c-1e843ed85269/scratchpad/probe
bash $P/run.sh alert 9 -mode B -script alert -inset delta -width -top -relayout &
RUN=$!
sleep 7.5
agent-device alert dismiss > /dev/null 2>&1
wait $RUN
tr -d '\r' < $P/out/alert.log | grep -E "STEP|LAYOUT|KEYBOARD|SAFEAREA" | cut -c1-200

#!/bin/bash
# guide-evidence.sh: the probe's keyboard guide across the background, in a
# NavigationStack alone and in one inside a TabView, kept as evidence.
set -u
P=/private/tmp/claude-501/-Users-chiji-js-pochical--claude-worktrees-serene-wing-a4ff85/f7887dad-3eb8-4bb5-a39c-1e843ed85269/scratchpad/probe
bash $P/bg.sh > $P/evidence/pr0-q1-guide-navigationstack.txt
bash $P/bg.sh -tabs -hideTabBar > $P/evidence/pr0-q1-guide-tabview.txt
cat $P/evidence/pr0-q1-guide-navigationstack.txt $P/evidence/pr0-q1-guide-tabview.txt | cut -c1-200

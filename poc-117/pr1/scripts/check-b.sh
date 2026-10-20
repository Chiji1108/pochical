#!/bin/bash
# check-b.sh: (b) the chat pushed from the hub and popped by its back
# button, a back swipe let go half way (cancelled) and one carried
# through, each recorded to app/b-*.mp4 and tiled to app/b-*.png. Run from
# the agent-device session's directory, on the グループ tab's hub.
set -u
P=/private/tmp/claude-501/-Users-chiji-js-pochical--claude-worktrees-serene-wing-a4ff85/f7887dad-3eb8-4bb5-a39c-1e843ed85269/scratchpad/navprobe
bash $P/scripts/clip.sh b-push agent-device press 231 404
bash $P/scripts/clip.sh b-pop agent-device press 37 84
agent-device press 231 404 > /dev/null 2>&1
sleep 2
bash $P/scripts/clip.sh b-swipe-cancel agent-device gesture pan 3 450 120 0 1200
bash $P/scripts/clip.sh b-swipe-done agent-device gesture pan 3 450 300 0 1200
for name in b-push b-pop b-swipe-cancel b-swipe-done; do
  python3 -I $P/scripts/tiles.py $P/app/$name.mp4 $P/app/$name.png 1.2 3.2 6
done

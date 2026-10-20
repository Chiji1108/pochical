#!/bin/bash
# collect.sh: gathers the PR 1 evidence into ev/ (poc-117/pr1 on the
# pr-assets branch).
set -u
D=/private/tmp/claude-501/-Users-chiji-js-pochical--claude-worktrees-serene-wing-a4ff85/f7887dad-3eb8-4bb5-a39c-1e843ed85269/scratchpad/navprobe
E=$D/ev
rm -rf "$E"
mkdir -p "$E/nav-probe" "$E/app"
A=$D/app
for f in run2 rm support tray pins; do
  python3 -I "$D/scripts/analyze.py" "$A/$f.dbg" "$A/$f.steps" > "$E/app/counts-$f.txt"
done
grep -E "POC117DBG (layout|app|tab)" "$A/check-a.dbg" | sed 's/.*POC117DBG //' > "$E/app/a-background-alert-layouts.txt"
grep -E "POC117DBG (layout|app|tab)" "$A/check-a2.dbg" | sed 's/.*POC117DBG //' > "$E/app/a-tab-flip-layouts.txt"
grep -E "POC117DBG (layout|app|tab)" "$A/check-a3.dbg" | sed 's/.*POC117DBG //' > "$E/app/a-after-prompt-layouts.txt"
sed 's/.*POC117DBG frame //' "$A/cancel.dbg" | grep composer > "$E/app/drag-cancelled-frames.txt"
cp "$A/a-sheet.png" "$E/app/a-background-prompt-tabflip.png"
cp "$A/a2-2-tabs.png" "$E/app/a-tab-flipped-underneath.png"
cp "$A/b-push.png" "$E/app/b-after-push.png"
cp "$A/b-pop.png" "$E/app/b-after-pop.png"
cp "$A/b-swipe-cancel.png" "$E/app/b-after-swipe-cancelled.png"
cp "$A/b-swipe-done.png" "$E/app/b-after-swipe-done.png"
cp "$A/main-push-dense.png" "$E/app/b-before-push-main.png"
cp "$A/c-sheet.png" "$E/app/c-tabs-keep-their-stacks.png"
cp "$A/d-sheet.png" "$E/app/d-notification-taps.png"
cp "$A/d-6-back.png" "$E/app/d-back-from-notification-chat.png"
cp "$A/e-sheet.png" "$E/app/e-pages-over-the-chat.png"
cp "$A/e-sheet2.png" "$E/app/e-support-chat.png"
cp "$A/main-quote-dense.png" "$E/app/quote-off-before-main.png"
cp "$A/branch-quote-dense.png" "$E/app/quote-off-after.png"
cp "$A/run1-A.png" "$E/app/pr1-list-1.png"
cp "$A/run1-B.png" "$E/app/pr1-list-2.png"
cp "$A/tray-sheet.png" "$E/app/photo-tray-and-mentions.png"
cp "$A/pins-sheet.png" "$E/app/pins.png"
cp "$A/dm-sheet.png" "$E/app/one-to-one.png"
cp "$A/dm3.png" "$E/app/one-to-one-member-left.png"
cp "$A/s-sheet.png" "$E/app/support-send.png"
cp "$A/ax-order.txt" "$E/app/accessibility-order.txt"
cp "$A/main-plus.png" "$E/app/plus-menu-keyboard-up-main.png"
cp "$A/p1.png" "$E/app/plus-menu-keyboard-up-branch.png"
cp "$A/branch-bg.png" "$E/app/background-at-latest.png"
cp "$A/branch-mid-bg.png" "$E/app/background-scrolled-up.png"
for f in uikit-bg control-tabs-bg swiftui-bg swiftui-plain-bg uikit-alert uikit-tabswitch; do
  tr -d '\r' < "$D/out/$f.log" | grep -E "STEP|TICK|OPEN|Fatal|UPDATE" > "$E/nav-probe/$f.txt"
done
cp "$D/out/uikit-alert-7s.png" "$E/nav-probe/uikit-alert.png"
cp "$D/out/push.png" "$E/nav-probe/uikit-push.png"
cp "$D/out/swipe-cancel.png" "$E/nav-probe/uikit-swipe-cancel.png"
cp "$D/out/swipe-done.png" "$E/nav-probe/uikit-swipe-done-then-tab-push.png"
cp "$D/out/tabs.png" "$E/nav-probe/uikit-tabs-keep-state.png"
mkdir -p "$E/nav-probe/source"
cp "$D/Probe/RootProbe.swift" "$D/Probe/ProbeApp.swift" "$D/Probe/ProbeController.swift" "$E/nav-probe/source/"
mkdir -p "$E/scripts"
cp "$D/scripts/"*.sh "$D/scripts/"*.py "$E/scripts/"
cp "$D/edits/instrument.py" "$E/scripts/"
ls -R "$E" | wc -l

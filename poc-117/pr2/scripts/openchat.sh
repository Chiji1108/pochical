#!/bin/bash
# openchat.sh <log name>: installs and launches the built app, opens the group's 全体チャット.
P=/private/tmp/claude-501/-Users-chiji-js-pochical--claude-worktrees-serene-wing-a4ff85/f7887dad-3eb8-4bb5-a39c-1e843ed85269/scratchpad/p2
bash "$P/launch.sh" "$1"
agent-device open app.pochical --platform ios --udid 4E8334EF-B5E7-4CB3-9D6B-E04F6B754EFB >/dev/null 2>&1
sleep 1
agent-device press 201 820 >/dev/null 2>&1
sleep 1.5
agent-device press label="全体チャット" >/dev/null 2>&1
sleep 3
echo opened

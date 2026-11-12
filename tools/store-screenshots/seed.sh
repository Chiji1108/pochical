# The seed beside a capture of the stores' screenshots (android.sh, ios.sh):
# seed.ts makes the groups, writes their invitations, and writes the
# coworkers' chat once the capture has joined it, and ends.
#
#   . "$root/tools/store-screenshots/seed.sh"
#
# Before sourcing, set `root` (the repo).

seed=""

# Starts the seed and waits for the groups: the coworkers' invitation code
# is kept in "$1", the friends' in "$2".
start_seed() {
  pnpm --dir "$root" exec tsx "$root/tools/store-screenshots/seed.ts" "$1" "$2" &
  seed=$!
  until [ -s "$1" ]; do
    kill -0 "$seed" 2>/dev/null || { echo "the seed made no groups" >&2; exit 1; }
    sleep 1
  done
}

# Waits for the seed to end, as it does once the chat is written and the
# group has taken its reaction and votes: false if its last checks failed.
end_seed() {
  local running=$seed
  seed=""
  wait "$running" || { echo "the seed failed" >&2; return 1; }
}

# Stops the seed, should the script end before it.
stop_seed() {
  [ -z "$seed" ] || kill "$seed" 2>/dev/null || true
}

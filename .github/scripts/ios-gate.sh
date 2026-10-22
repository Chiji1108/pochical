#!/usr/bin/env bash
# Whether Xcode Cloud has verified the iOS files a pull request's head has,
# printed as the `ios` commit status: "<state> <description>".
# Usage: ios-gate.sh <head sha> <base branch or commit>, in a clone whose
# origin is the repository; gh reads its statuses, and XCODE_CLOUD names the
# status Xcode Cloud's pull request workflow posts.
set -euo pipefail
sha=$1
base=$2

# What Xcode Cloud's build and its `swift test` read, and what its start
# condition (Files and Folders) watches.
paths=(apps/ios spec/vectors)

git fetch --quiet --no-tags origin "$base"
base=$(git rev-parse FETCH_HEAD)
git fetch --quiet --no-tags origin "$sha"
fork=$(git merge-base "$base" "$sha")

same_ios() {
  git diff-tree --quiet -r "$1" "$2" -- "${paths[@]}"
}

# The state of Xcode Cloud's latest status on a commit, empty when it has
# never started there.
xcode_cloud() {
  gh api "repos/$GITHUB_REPOSITORY/commits/$1/status" \
    --jq '.statuses[] | select(.context == env.XCODE_CLOUD) | .state'
}

if same_ios "$fork" "$sha"; then
  echo "success iOS のファイルは変わっていない"
  exit
fi

head=$(xcode_cloud "$sha")
if [ "$head" = failure ] || [ "$head" = error ]; then
  echo "failure Xcode Cloud が落ちた"
  exit
fi

# Xcode Cloud does not always build a push that leaves the iOS files as they
# were, such as merging main, so any commit of the pull request with the
# head's iOS files stands for it.
for commit in $(git rev-list "$fork..$sha"); do
  if same_ios "$commit" "$sha"; then
    state=$(xcode_cloud "$commit")
    if [ "$state" = success ]; then
      if [ "$commit" = "$sha" ]; then
        echo "success Xcode Cloud が通った"
      else
        echo "success ${commit:0:8} と同じ iOS のファイルで Xcode Cloud が通った"
      fi
      exit
    fi
  fi
done
echo "pending Xcode Cloud を待っている"

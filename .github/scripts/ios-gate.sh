#!/usr/bin/env bash
# Whether Xcode Cloud has verified the iOS files a pull request's head has,
# printed as the `ios` commit status: "<state> <description>".
# Usage: ios-gate.sh <head sha> <base branch or commit>, in a clone whose
# origin is the repository. It runs nothing from the head: it reads the
# head's trees, and through gh the check runs of the GitHub App with id
# XCODE_CLOUD_APP, which only Xcode Cloud can post, for its workflow named
# XCODE_CLOUD_WORKFLOW.
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

# Xcode Cloud's verdict on a commit from its latest check runs there:
# success, failure, cancelled, pending, or empty when it has never started.
xcode_cloud() {
  gh api "repos/$GITHUB_REPOSITORY/commits/$1/check-runs?app_id=$XCODE_CLOUD_APP&per_page=100" \
    --jq '[.check_runs[] | select(.name | startswith(env.XCODE_CLOUD_WORKFLOW))]
      | if length == 0 then ""
        elif any(.[]; .status != "completed") then "pending"
        elif all(.[]; .conclusion == "success") then "success"
        elif any(.[]; .conclusion == "cancelled") then "cancelled"
        else "failure" end'
}

if same_ios "$fork" "$sha"; then
  echo "success iOS のファイルは変わっていない"
  exit
fi

head=$(xcode_cloud "$sha")
case $head in
  success)
    echo "success Xcode Cloud が通った"
    exit
    ;;
  failure | cancelled)
    echo "failure Xcode Cloud が落ちた"
    exit
    ;;
esac

# Xcode Cloud does not always build a push that leaves the iOS files as they
# were, such as merging main, so the newest earlier commit of the pull
# request with the head's iOS files that Xcode Cloud finished stands for it.
# A run cancelled there was most likely cut short by a newer push.
for commit in $(git rev-list "$sha^@" "^$fork"); do
  if same_ios "$commit" "$sha"; then
    state=$(xcode_cloud "$commit")
    case $state in
      success)
        echo "success ${commit:0:8} と同じ iOS のファイルで Xcode Cloud が通った"
        exit
        ;;
      failure)
        echo "failure ${commit:0:8} と同じ iOS のファイルで Xcode Cloud が落ちた"
        exit
        ;;
    esac
  fi
done
echo "pending Xcode Cloud を待っている"

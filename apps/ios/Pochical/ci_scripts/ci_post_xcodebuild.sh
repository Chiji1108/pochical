#!/bin/sh
# Xcode Cloud runs this after each xcodebuild action. After a build, the
# iOS packages' own tests run as `mise run ios:test` runs them on a Mac,
# spec/vectors among them; a failure fails the build, and with it the
# pull request's check.
set -e
if [ "$CI_XCODEBUILD_ACTION" != "build" ]; then
  exit 0
fi
cd "$CI_PRIMARY_REPOSITORY_PATH/apps/ios/Packages"
swift test --package-path PochicalDesign
swift test --package-path PochicalKit

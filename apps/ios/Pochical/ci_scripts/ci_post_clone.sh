#!/bin/sh
# Xcode Cloud runs this after cloning (it looks beside the .xcodeproj).
# SQLiteData's macros and packages ask to be trusted once in Xcode; the
# cloud has no one to press it, so their fingerprint checks are skipped,
# as `xcodebuild -skipMacroValidation` does on a Mac.
set -e
defaults write com.apple.dt.Xcode IDESkipMacroFingerprintValidation -bool YES
defaults write com.apple.dt.Xcode IDESkipPackagePluginFingerprintValidation -bool YES
# Probe for POC-164: not to be merged.

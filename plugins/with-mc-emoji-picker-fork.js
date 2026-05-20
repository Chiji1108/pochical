const { withDangerousMod } = require("expo/config-plugins");
const fs = require("node:fs/promises");
const path = require("node:path");

const podName = "MCEmojiPicker";
const podGitUrl = "https://github.com/Jeanno/MCEmojiPicker.git";
const podComment =
  "  # Override react-native-emoji-popup's transitive MCEmojiPicker pod for iOS 26 support.";
const podLine = `  pod '${podName}', :git => '${podGitUrl}'`;
const podBlock = `${podComment}\n${podLine}`;
const emojiPopupPodspecPath = path.join(
  "node_modules",
  "react-native-emoji-popup",
  "EmojiPopup.podspec"
);
const pinnedDependency = 's.dependency "MCEmojiPicker", "1.2.3"';
const unpinnedDependency = 's.dependency "MCEmojiPicker"';
const targetUseExpoModulesPattern =
  /(target ['"][^'"]+['"] do\n\s+use_expo_modules!\n)/;
const existingPodPattern = new RegExp(
  `^\\s*(?:# .*\\n)?\\s*pod ['"]${podName}['"].*$`,
  "m"
);

const addMCEmojiPickerFork = (podfile) => {
  if (existingPodPattern.test(podfile)) {
    return podfile.replace(existingPodPattern, podBlock);
  }

  if (!targetUseExpoModulesPattern.test(podfile)) {
    throw new Error(
      `Unable to insert ${podName} fork because ios/Podfile target block was not found.`
    );
  }

  return podfile.replace(targetUseExpoModulesPattern, `$1\n${podBlock}\n`);
};

const withMCEmojiPickerFork = (config) =>
  withDangerousMod(config, [
    "ios",
    async (config) => {
      const emojiPopupPodspec = path.join(
        config.modRequest.projectRoot,
        emojiPopupPodspecPath
      );
      const podspec = await fs.readFile(emojiPopupPodspec, "utf8");
      const nextPodspec = podspec.replace(pinnedDependency, unpinnedDependency);

      if (podspec !== nextPodspec) {
        await fs.writeFile(emojiPopupPodspec, nextPodspec);
      }

      const podfilePath = path.join(
        config.modRequest.platformProjectRoot,
        "Podfile"
      );
      const podfile = await fs.readFile(podfilePath, "utf8");
      const nextPodfile = addMCEmojiPickerFork(podfile);

      if (podfile !== nextPodfile) {
        await fs.writeFile(podfilePath, nextPodfile);
      }

      return config;
    },
  ]);

module.exports = withMCEmojiPickerFork;

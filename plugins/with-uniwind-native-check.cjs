"use strict";
const { withPodfile } = require("@expo/config-plugins");

const marker = "# pochical-uniwind-native-check";
const guard = `${marker}
# The npm package initially contains only the installer. Autolinking silently
# omits Uniwind until the authenticated Pro payload has been installed.
unless File.exist?(File.join(__dir__, '..', 'node_modules', 'uniwind', 'Uniwind.podspec'))
  raise 'Uniwind Pro native files are missing. Run bunx uniwind-pro from the project root, then run pod install again before building iOS.'
end
`;

module.exports = (config) =>
  withPodfile(config, (mod) => {
    if (!mod.modResults.contents.includes(marker)) {
      mod.modResults.contents = `${guard}\n${mod.modResults.contents}`;
    }
    return mod;
  });

"use strict";
const { withPodfile } = require("@expo/config-plugins");

const marker = "# pochical-uniwind-native-check";
const guard = `${marker}
# The npm package initially contains only the installer. Autolinking silently
# omits Uniwind until the authenticated Pro payload has been installed.
uniwind_package = Pod::Executable.execute_command('node', ['--print', 'require.resolve("uniwind/package.json", { paths: [process.argv[1]] })', __dir__]).strip
unless File.exist?(File.join(File.dirname(uniwind_package), 'Uniwind.podspec'))
  raise 'Uniwind Pro native files are missing. Run bunx uniwind-pro from apps/mobile, then run pod install again before building iOS.'
end
`;

module.exports = (config) =>
  withPodfile(config, (mod) => {
    if (!mod.modResults.contents.includes(marker)) {
      mod.modResults.contents = `${guard}\n${mod.modResults.contents}`;
    }
    return mod;
  });

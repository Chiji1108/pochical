"use strict";
const { withAppDelegate, withPodfile } = require("@expo/config-plugins");

module.exports = (config, { configurePods = false } = {}) => {
  let configured = config;
  if (configurePods) {
    configured = withPodfile(config, (mod) => {
      const pods = ["AppCheckCore", "GoogleUtilities", "RecaptchaInterop"];
      for (const pod of pods) {
        if (!mod.modResults.contents.includes(`pod '${pod}'`)) {
          mod.modResults.contents = mod.modResults.contents.replace(
            "  use_expo_modules!",
            `  pod '${pod}', :modular_headers => true\n  use_expo_modules!`
          );
        }
      }
      return mod;
    });
  }
  return withAppDelegate(configured, (mod) => {
    if (mod.modResults.language !== "swift") {
      throw new Error("Native auth requires the Swift Expo AppDelegate");
    }
    let source = mod.modResults.contents;
    if (!source.includes("import GoogleSignIn")) {
      source = `import GoogleSignIn\n${source}`;
    }
    if (!source.includes("// pochical-native-auth")) {
      const anchor = "  var window: UIWindow?";
      if (!source.includes(anchor)) {
        throw new Error("Cannot locate Expo AppDelegate for Google callback");
      }
      // ExpoAppSceneDelegate forwards both cold and warm URLs to this override.
      source = source.replace(
        anchor,
        `${anchor}

  // pochical-native-auth
  public override func application(
    _ app: UIApplication,
    open url: URL,
    options: [UIApplication.OpenURLOptionsKey: Any] = [:]
  ) -> Bool {
    if GIDSignIn.sharedInstance.handle(url) {
      return true
    }
    return super.application(app, open: url, options: options)
  }
`
      );
    }
    mod.modResults.contents = source;
    return mod;
  });
};

"use strict";
const { readFile, writeFile } = require("node:fs/promises");
const { join } = require("node:path");
const { withDangerousMod } = require("@expo/config-plugins");

// ML Kit discovers these registrars through reflection. R8 can otherwise remove
// their no-argument constructors, leaving the camera preview without a scanner.
const KEEP_RULES = `# pochical-mlkit-registrars
-keep class com.google.mlkit.** implements com.google.firebase.components.ComponentRegistrar {
    public <init>();
}`;

module.exports = (config) =>
  withDangerousMod(config, [
    "android",
    async (mod) => {
      const rulesPath = join(
        mod.modRequest.platformProjectRoot,
        "app",
        "proguard-rules.pro"
      );
      const contents = await readFile(rulesPath, "utf8");
      if (!contents.includes(KEEP_RULES)) {
        await writeFile(rulesPath, `${contents.trimEnd()}\n\n${KEEP_RULES}\n`);
      }
      return mod;
    },
  ]);

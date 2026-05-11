import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { withJazz } from "jazz-tools/dev/expo";

const require = createRequire(import.meta.url);
// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require("expo/metro-config");
const { withUniwindConfig } = require("uniwind/metro");

/** @type {import('expo/metro-config').MetroConfig} */
const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const config = getDefaultConfig(projectRoot);

// Start the Jazz dev server and inject EXPO_PUBLIC_JAZZ_* env vars for Metro to inline.
await withJazz(config, { schemaDir: projectRoot });

export default withUniwindConfig(config, {
  // relative path to your global.css file (from previous step)
  cssEntryFile: "./src/global.css",
  // (optional) path where we gonna auto-generate typings
  // defaults to project's root
  dtsFile: "./src/uniwind-types.d.ts",
});

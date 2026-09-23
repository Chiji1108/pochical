import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require("expo/metro-config");
const { withUniwindConfig } = require("uniwind/metro");

/** @type {import('expo/metro-config').MetroConfig} */
const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const config = getDefaultConfig(projectRoot);
config.resolver.resolveRequest = (context, moduleName, platform) => {
  // lib0's native entry references a legacy, optional crypto package. Yjs only
  // needs random values; use Expo's native implementation instead.
  if (moduleName === "lib0/webcrypto" && platform !== "web") {
    return {
      type: "sourceFile",
      filePath: path.join(projectRoot, "src/lib/replicate-random.ts"),
    };
  }
  return context.resolveRequest(context, moduleName, platform);
};

export default withUniwindConfig(config, {
  // relative path to your global.css file (from previous step)
  cssEntryFile: "./src/global.css",
  // (optional) path where we gonna auto-generate typings
  // defaults to project's root
  dtsFile: "./src/uniwind-types.d.ts",
});

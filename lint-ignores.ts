import core from "ultracite/oxlint/core";

/** Paths oxlint and oxfmt skip on top of Ultracite's defaults. */
export const ignorePatterns = [
  ...(core.ignorePatterns ?? []),
  // Reference-only Expo app, native apps and generated code.
  "apps/mobile-legacy",
  "apps/ios",
  "apps/android",
  "apps/server/src/gen",
  "**/routeTree.gen.ts",
  "**/worker-configuration.d.ts",
  "**/.tanstack",
  "patches",
];

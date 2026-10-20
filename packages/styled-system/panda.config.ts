import { defineConfig } from "@pandacss/dev";

import { config } from "./config";

// Writes css() and the types the apps and @pochical/prototype import from
// this package, on bun install (prepare); after changing config.ts, run
// bun run --cwd packages/styled-system codegen. Each app makes the CSS
// itself (its own panda.config.ts), from the same config.
export default defineConfig({ ...config, outdir: "dist" });

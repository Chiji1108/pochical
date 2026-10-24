import { defineConfig } from "@pandacss/dev";

import { config } from "./config";

// Writes css() and the types the apps and @pochical/prototype import from
// this package, on pnpm install (prepare); after changing config.ts, run
// pnpm --dir packages/styled-system codegen. Each app makes the CSS
// itself (its own panda.config.ts), from the same config. codegen --clean
// empties dist first: a file an older Panda left there, as helpers.mjs,
// would otherwise win over the current helpers.js when an app imports it.
export default defineConfig({ ...config, outdir: "dist" });

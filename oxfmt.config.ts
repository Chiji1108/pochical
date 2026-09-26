import { defineConfig } from "oxfmt";
import ultracite from "ultracite/oxfmt";

import { ignorePatterns } from "./lint-ignores.ts";

export default defineConfig({
  ...ultracite,
  ignorePatterns,
});

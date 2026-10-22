import { defineConfig } from "@pandacss/dev";
import { appConfig } from "@pochical/styled-system/config";

// Panda's layers named apart from Tailwind CSS's, as in #699.
export default defineConfig({
  ...appConfig,
  layers: {
    base: "panda-base",
    recipes: "panda-recipes",
    reset: "panda-reset",
    tokens: "panda-tokens",
    utilities: "panda-utilities",
  },
});

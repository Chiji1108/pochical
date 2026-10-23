import { appConfig } from "@pochical/styled-system/config";

// Panda CSS for this app, from @pochical/styled-system's config, with its
// layers named apart from Tailwind CSS's (base, utilities), which
// Fumadocs UI brings (src/styles.css).
export default {
  ...appConfig,
  layers: {
    base: "panda-base",
    recipes: "panda-recipes",
    reset: "panda-reset",
    tokens: "panda-tokens",
    utilities: "panda-utilities",
  },
};

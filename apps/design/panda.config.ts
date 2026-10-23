import showcase from "@pochical/showcase/panda";

// Panda CSS for this app, shared with apps/try, with its layers named
// apart from Tailwind CSS's (base, utilities), which Fumadocs UI brings
// (src/styles.css).
export default {
  ...showcase,
  layers: {
    base: "panda-base",
    recipes: "panda-recipes",
    reset: "panda-reset",
    tokens: "panda-tokens",
    utilities: "panda-utilities",
  },
};

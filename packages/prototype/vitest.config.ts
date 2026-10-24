import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    server: {
      deps: {
        // Its ESM imports its own files without .js, which Node cannot
        // resolve, so Vite transforms it instead
        // (material-foundation/material-color-utilities#195). Removed by #879.
        inline: ["@material/material-color-utilities"],
      },
    },
  },
});

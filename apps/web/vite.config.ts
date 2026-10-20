import { fileURLToPath } from "node:url";

import { cloudflare } from "@cloudflare/vite-plugin";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    cloudflare({ viteEnvironment: { name: "ssr" } }),
    tanstackStart(),
    // Japanese broken between phrases on every browser (@pochical/jsx).
    react({ jsxImportSource: "@pochical/jsx" }),
  ],
  resolve: {
    // Also for the JSX that TanStack Start ships as source, which does not
    // depend on @pochical/jsx and so cannot reach it from node_modules.
    alias: {
      "@pochical/jsx": fileURLToPath(
        new URL("../../packages/jsx/src", import.meta.url)
      ),
    },
  },
});

import { fileURLToPath } from "node:url";

import { cloudflare } from "@cloudflare/vite-plugin";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    cloudflare({ viteEnvironment: { name: "ssr" } }),
    tanstackStart(),
    // Japanese broken between phrases on every browser (src/jsx).
    react({ jsxImportSource: "#/jsx" }),
  ],
  resolve: {
    // Also for the JSX that TanStack Start ships as source, which
    // package.json's imports do not reach from node_modules.
    alias: { "#/jsx": fileURLToPath(new URL("src/jsx", import.meta.url)) },
    tsconfigPaths: true,
  },
});

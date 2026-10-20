import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import type { PluginOption } from "vite";

// React with this package's runtime, so Japanese breaks between phrases on
// every browser. The alias reaches it from the JSX that TanStack Start ships
// as source, which does not depend on @pochical/jsx and so cannot resolve it
// from node_modules.
export const pochicalJsx = (): PluginOption => [
  react({ jsxImportSource: "@pochical/jsx" }),
  {
    config: () => ({
      resolve: {
        alias: {
          "@pochical/jsx": fileURLToPath(new URL("src", import.meta.url)),
        },
      },
    }),
    name: "pochical-jsx",
  },
];

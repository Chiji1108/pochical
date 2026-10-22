import { pochicalJsx } from "@pochical/jsx/vite";
import { defineConfig } from "vite";

import { head } from "./head";

// Loaded with --configLoader runner (package.json): head.ts imports the
// workspace's TypeScript, which Node cannot load as it is.
export default defineConfig({
  plugins: [
    pochicalJsx(),
    { name: "pochical-try-head", transformIndexHtml: head },
  ],
});

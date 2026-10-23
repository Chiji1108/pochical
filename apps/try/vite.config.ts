import { pochicalJsx } from "@pochical/jsx/vite";
import { tryDevPort } from "@pochical/prototype/lib/try-port";
import { defineConfig } from "vite";

import { head } from "./head";

// Loaded with --configLoader runner (package.json): head.ts imports the
// workspace's TypeScript, which Node cannot load as it is.
export default defineConfig({
  plugins: [
    pochicalJsx(),
    { name: "pochical-try-head", transformIndexHtml: head },
  ],
  // The port the links to try expect (tryUrl), so another server on it
  // stops this one rather than moving it.
  preview: { port: tryDevPort, strictPort: true },
  server: { port: tryDevPort, strictPort: true },
});

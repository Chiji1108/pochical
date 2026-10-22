import { pochicalJsx } from "@pochical/jsx/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import { defineConfig } from "vite";

export default defineConfig({
  // The routes in src/routes, written to src/routeTree.gen.ts.
  plugins: [tanstackRouter({ target: "react" }), pochicalJsx()],
});

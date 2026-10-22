import { cloudflare } from "@cloudflare/vite-plugin";
import { pochicalJsx } from "@pochical/jsx/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    cloudflare({ viteEnvironment: { name: "ssr" } }),
    tanstackStart(),
    pochicalJsx(),
  ],
});

import { appConfig } from "@pochical/styled-system/config";
import { defineConfig } from "@pandacss/dev";

// apps/web's config, plus this app's .astro pages and apps/web's
// components that the islands render.
export default defineConfig({
  ...appConfig,
  include: [
    "./src/**/*.{ts,tsx,astro}",
    "../web/src/components/**/*.{ts,tsx}",
    "../../packages/prototype/src/**/*.{ts,tsx}",
  ],
});

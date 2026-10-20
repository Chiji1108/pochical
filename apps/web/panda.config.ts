import { defineConfig } from "@pandacss/dev";
import { config } from "@pochical/styled-system/config";

// The CSS for the site's pieces and the prototype's it shows, made from the
// config @pochical/styled-system writes css() from.
export default defineConfig({
  ...config,
  include: [
    "./src/**/*.{ts,tsx}",
    "../../packages/prototype/src/**/*.{ts,tsx}",
  ],
});

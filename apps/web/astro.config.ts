import { appendFile } from "node:fs/promises";

import cloudflare from "@astrojs/cloudflare";
import react from "@astrojs/react";
import type { AstroIntegration } from "astro";
import { defineConfig } from "astro/config";

import { headersFile } from "./src/lib/headers";

// The static files' headers (lib/headers.ts), added to the _headers file
// the adapter writes beside them.
const staticHeaders: AstroIntegration = {
  hooks: {
    "astro:build:done": async ({ dir }) => {
      await appendFile(new URL("_headers", dir), headersFile());
    },
  },
  name: "pochical-static-headers",
};

export default defineConfig({
  adapter: cloudflare({ imageService: "passthrough" }),
  // The pages are files (/privacy, not /privacy/), as the site's links name
  // them.
  build: { format: "file" },
  integrations: [react(), staticHeaders],
  // The site keeps nothing between requests.
  session: false,
  vite: {
    // A port taken fails the dev server rather than moving it to another.
    server: { strictPort: true },
  },
});

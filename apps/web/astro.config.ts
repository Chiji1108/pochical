import { appendFile } from "node:fs/promises";

import cloudflare from "@astrojs/cloudflare";
import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import type { AstroIntegration } from "astro";
import { defineConfig } from "astro/config";
import { loadEnv } from "vite";

import { headersFile, PRIVATE_PATHS } from "./src/lib/headers";

// The site's origin, the one lib/site.ts's siteOrigin reads: the sitemap is
// written only once it is set.
const { VITE_SITE_URL } = loadEnv(
  process.env.NODE_ENV ?? "production",
  process.cwd(),
  "VITE_"
);

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
  // Images are made at build time (astro:assets with Sharp), for the
  // prerendered pages; none is made on request.
  adapter: cloudflare({ imageService: "compile" }),
  // The pages are files (/privacy, not /privacy/), as the site's links name
  // them.
  build: { format: "file" },
  integrations: [
    react(),
    staticHeaders,
    // The pages search may list (sitemap-index.xml, which robots.txt names):
    // every prerendered page but one person's own.
    sitemap({
      filter: (page) =>
        !PRIVATE_PATHS.some((path) => new URL(page).pathname.startsWith(path)),
    }),
  ],
  site: VITE_SITE_URL || undefined,
  // The site keeps nothing between requests.
  session: false,
  vite: {
    // A port taken fails the dev server rather than moving it to another.
    server: { strictPort: true },
  },
});

import { appendFile } from "node:fs/promises";

import cloudflare from "@astrojs/cloudflare";
import react from "@astrojs/react";
import type { AstroIntegration } from "astro";
import { defineConfig } from "astro/config";
import type { Plugin } from "vite";

import { headersFile } from "./src/lib/headers";

const IMAGE = /\.(?:png|jpe?g|webp|svg)$/u;

// An image imported without a query is its URL, as Vite gives it and as
// the prototype's components (@pochical/prototype) expect; Astro would hand
// over its own image object instead. The site's own files ask for ?url.
const imagesAsUrls: Plugin = {
  enforce: "pre",
  name: "pochical-images-as-urls",
  async resolveId(source, importer, options) {
    if (!IMAGE.test(source)) {
      return null;
    }
    const resolved = await this.resolve(source, importer, {
      ...options,
      skipSelf: true,
    });
    return resolved === null ? null : `${resolved.id}?url`;
  },
};

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
    plugins: [imagesAsUrls],
    // A port taken fails the dev server rather than moving it to another.
    server: { strictPort: true },
  },
});

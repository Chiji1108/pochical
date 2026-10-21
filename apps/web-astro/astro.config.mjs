import { fileURLToPath } from "node:url";

import cloudflare from "@astrojs/cloudflare";
import react from "@astrojs/react";
import { defineConfig } from "astro/config";

const here = (path) => fileURLToPath(new URL(path, import.meta.url));

// apps/web's components and lp-screens import images as URLs (Vite's
// default); Astro turns an image import into its metadata object. Reading
// them as ?url keeps apps/web's components unchanged.
const imagesAsUrls = {
  enforce: "pre",
  name: "pochical-images-as-urls",
  async resolveId(source, importer, options) {
    if (!/\.(png|jpe?g|webp|svg)$/.test(source) || importer?.endsWith(".astro")) {
      return null;
    }
    const resolved = await this.resolve(source, importer, {
      ...options,
      skipSelf: true,
    });
    return resolved ? `${resolved.id}?url` : null;
  },
};

export default defineConfig({
  adapter: cloudflare({ imageService: "passthrough" }),
  // /privacy rather than /privacy/, as apps/web serves it.
  build: { format: "file" },
  integrations: [react()],
  output: "static",
  vite: {
    plugins: [imagesAsUrls],
    resolve: {
      alias: {
        "@pochical/jsx": here("../../packages/jsx/src"),
        "@tanstack/react-router": here("src/shims/router.tsx"),
      },
    },
  },
});

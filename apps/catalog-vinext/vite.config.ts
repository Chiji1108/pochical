import { cloudflare } from "@cloudflare/vite-plugin";
import { pochicalJsx } from "@pochical/jsx/vite";
import tailwindcss from "@tailwindcss/vite";
import mdx from "fumadocs-mdx/vite";
import vinext from "vinext";
import { defineConfig } from "vite";

import * as mdxConfig from "./source.config.ts";

export default defineConfig({
  plugins: [
    mdx(mdxConfig),
    tailwindcss(),
    // React comes from pochicalJsx, with the runtime that breaks Japanese
    // between phrases.
    vinext({ react: false }),
    pochicalJsx(),
    cloudflare({
      viteEnvironment: { childEnvironments: ["ssr"], name: "rsc" },
    }),
  ],
});

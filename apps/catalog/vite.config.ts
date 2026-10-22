import { cloudflare } from "@cloudflare/vite-plugin";
import { pochicalJsx } from "@pochical/jsx/vite";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { fumadocsMdx } from "fumadocs-mdx/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    cloudflare({ viteEnvironment: { name: "ssr" } }),
    // The /design documents written in MDX (content/design), read through
    // src/lib/source.ts.
    fumadocsMdx({ macro: { include: ["src/lib/source.ts"] } }),
    // Tailwind CSS for Fumadocs UI only: src/docs.css, which the documents
    // alone load.
    tailwindcss(),
    tanstackStart(),
    pochicalJsx(),
  ],
});

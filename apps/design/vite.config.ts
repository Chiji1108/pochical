import { cloudflare } from "@cloudflare/vite-plugin";
import { pochicalJsx } from "@pochical/jsx/vite";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { fumadocsMdx } from "fumadocs-mdx/vite";
import { defineConfig } from "vite";

// The pieces the pages show are imported by the MDX documents alone,
// which the dev server's dependency scan does not read: it scans the
// pieces' own files too, so their packages are bundled before the first
// page rather than found on it, which reloads the server mid-render. The
// same for the runtime fumadocs-mdx's macro writes into src/lib/source.ts,
// which the scan sees only as the macro's own import.
const optimizeDeps = {
  entries: ["src/**/*.{ts,tsx}"],
  include: ["fumadocs-mdx/runtime/macro"],
};

export default defineConfig({
  environments: { client: { optimizeDeps }, ssr: { optimizeDeps } },
  plugins: [
    cloudflare({ viteEnvironment: { name: "ssr" } }),
    // The documents written in MDX (content/), read through
    // src/lib/source.ts.
    fumadocsMdx({
      // Japanese breaks between phrases in the documents too, as in the
      // pages' own JSX.
      globalOptions: { mdxOptions: { jsxImportSource: "@pochical/jsx" } },
      macro: { include: ["src/lib/source.ts"] },
    }),
    // Tailwind CSS for Fumadocs UI's chrome (src/styles.css).
    tailwindcss(),
    tanstackStart(),
    pochicalJsx(),
  ],
});

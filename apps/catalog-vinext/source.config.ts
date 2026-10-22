import { defineConfig, defineDocs } from "fumadocs-mdx/config";

export const docs = defineDocs({
  dir: "content/design",
});

export default defineConfig({
  mdxOptions: { jsxImportSource: "@pochical/jsx" },
});

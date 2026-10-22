import { loader } from "fumadocs-core/source";
import { defineDocs } from "fumadocs-mdx/macro";

// The /design documents written in MDX, each a page of content/design under
// /design, with its sidebar (meta.json) and search index.
export const docs = defineDocs({
  dir: "content/design",
  docs: { async: true },
});

export const source = loader({
  baseUrl: "/design",
  source: docs.toFumadocsSource(),
});

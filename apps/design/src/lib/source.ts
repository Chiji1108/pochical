import { loader } from "fumadocs-core/source";
import { defineDocs } from "fumadocs-mdx/macro";

// The design documents, each an MDX page of content/ at its path from the
// site's root, with the sidebar's order and groups (content/meta.json)
// and the search index.
export const docs = defineDocs({
  dir: "content",
  docs: { async: true },
});

export const source = loader({
  baseUrl: "/",
  source: docs.toFumadocsSource(),
});

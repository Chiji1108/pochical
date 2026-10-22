import { createFileRoute } from "@tanstack/react-router";
import { createFromSource } from "fumadocs-core/search/server";

import { source } from "../lib/source";

// Fumadocs' built-in search over the MDX documents, which its search
// dialog asks. Its default tokenizer splits Japanese by Unicode word
// segmentation.
const search = createFromSource(source);

export const Route = createFileRoute("/api/search")({
  server: {
    handlers: {
      GET: async ({ request }) => await search.GET(request),
    },
  },
});

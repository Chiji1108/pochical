import type { APIRoute } from "astro";

import { PRIVATE_PATHS } from "../lib/headers";
import { siteOrigin } from "../lib/site";

// The pages search leaves out, and the sitemap of the rest (astro.config.ts)
// once the site has its origin.
export const GET: APIRoute = () => {
  const origin = siteOrigin();
  return new Response(
    [
      "User-agent: *",
      "Allow: /",
      ...PRIVATE_PATHS.map((path) => `Disallow: ${path}`),
      ...(origin ? [`Sitemap: ${origin}/sitemap-index.xml`] : []),
      "",
    ].join("\n")
  );
};

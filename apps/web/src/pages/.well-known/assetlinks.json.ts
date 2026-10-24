import type { APIRoute } from "astro";

import { assetLinks } from "../../lib/app-links";

// Android's Digital Asset Links, which verify that the app may open the
// site's invitation links (lib/app-links.ts).
export const GET: APIRoute = () =>
  new Response(JSON.stringify(assetLinks()), {
    headers: { "Content-Type": "application/json" },
  });

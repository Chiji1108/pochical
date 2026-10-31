import type { APIRoute } from "astro";

import { appleAppSiteAssociation } from "../../lib/app-links";

// Drawn on request, so it goes out as JSON: the file's name has no extension
// for a static file's type to come from.
export const prerender = false;

// iOS's Universal Links, which let the app open the site's invitation and
// day links (lib/app-links.ts).
export const GET: APIRoute = () => Response.json(appleAppSiteAssociation());

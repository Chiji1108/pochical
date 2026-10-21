import type { APIRoute } from "astro";

import { PRIVATE_PATHS } from "../lib/headers";

export const GET: APIRoute = () =>
  new Response(
    [
      "User-agent: *",
      "Allow: /",
      ...PRIVATE_PATHS.map((path) => `Disallow: ${path}`),
      "",
    ].join("\n")
  );

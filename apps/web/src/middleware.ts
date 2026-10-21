import { phraseHtml } from "@pochical/jsx/html";
import { defineMiddleware, sequence } from "astro:middleware";

import { PRIVATE_PATHS, SECURITY_HEADERS } from "./lib/headers";

const isHtml = (response: Response) =>
  response.headers.get("Content-Type")?.startsWith("text/html") ?? false;

// The pages' Japanese broken between phrases, as the islands' JSX already
// is (@pochical/jsx): at build time for the prerendered pages, as each is
// drawn for the others.
const phrased = defineMiddleware(async (_context, render) => {
  const response = await render();
  if (!isHtml(response)) {
    return response;
  }
  return new Response(phraseHtml(await response.text()), response);
});

// The headers a page drawn on request goes out with; the prerendered ones
// have theirs from the _headers file, written from the same list
// (lib/headers.ts). Drawn for whoever asks, no such page is kept.
const headed = defineMiddleware(async ({ isPrerendered, url }, render) => {
  const response = await render();
  if (isPrerendered || !isHtml(response)) {
    return response;
  }
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(name, value);
  }
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Content-Type", "text/html; charset=utf-8");
  if (PRIVATE_PATHS.some((path) => url.pathname.startsWith(path))) {
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
  }
  return response;
});

export const onRequest = sequence(headed, phrased);

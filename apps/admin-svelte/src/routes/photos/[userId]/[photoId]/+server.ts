import { env } from "cloudflare:workers";

import type { RequestHandler } from "./$types";

// A photo in a user's support chat, read from the server's bucket through
// its AdminEntrypoint, for the chat's page to show.
export const GET: RequestHandler = async ({ params }) => {
  const photo = await env.SERVER.supportPhoto(params.userId, params.photoId);
  if (photo === null) {
    return new Response("No such photo", { status: 404 });
  }
  return new Response(photo.bytes, {
    headers: {
      "Cache-Control": "private, max-age=31536000, immutable",
      "Content-Type": photo.type,
    },
  });
};

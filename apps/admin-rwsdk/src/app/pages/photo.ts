import { env } from "cloudflare:workers";
import type { RequestInfo } from "rwsdk/worker";

// A photo in a user's support chat, read from the server's bucket through
// its AdminEntrypoint, for the chat's page to show.
export const photo = async ({
  params,
}: RequestInfo<{ userId: string; photoId: string }>) => {
  const found = await env.SERVER.supportPhoto(params.userId, params.photoId);
  if (found === null) {
    return new Response("No such photo", { status: 404 });
  }
  return new Response(found.bytes, {
    headers: {
      "Cache-Control": "private, max-age=31536000, immutable",
      "Content-Type": found.type,
    },
  });
};

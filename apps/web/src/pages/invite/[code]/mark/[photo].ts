import type { APIRoute } from "astro";

import { fetchInviteMark, IMAGE_CACHE } from "../../../../lib/invite-preview";
import { fromServer } from "../../../../lib/server";

export const prerender = false;

/** A group's photo mark on its invitation's page, for whoever holds it. */
export const GET: APIRoute = async ({ params }) => {
  const photo = await fetchInviteMark(
    params.code ?? "",
    params.photo ?? "",
    fromServer
  );
  if (photo === null) {
    return new Response("No such photo", { status: 404 });
  }
  return new Response(photo.body, {
    headers: { "Cache-Control": IMAGE_CACHE, "Content-Type": "image/jpeg" },
  });
};

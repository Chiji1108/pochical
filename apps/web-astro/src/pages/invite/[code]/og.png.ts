import { drawInviteImage } from "@pochical/web/src/lib/invite-image";
import {
  fetchInvitePreview,
  inviteImageVersion,
} from "@pochical/web/src/lib/invite-preview";
import shareImage from "@pochical/prototype/assets/share.png";
import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";

// apps/web/src/server.ts's inviteImage, minus the photo mark, as an Astro
// endpoint drawn on demand in the Worker.
export const prerender = false;

const IMAGE_CACHE = "public, max-age=3600";

export const GET: APIRoute = async ({ params, request, locals }) => {
  const code = params.code ?? "";
  const fromServer = async (input: RequestInfo | URL, init?: RequestInit) =>
    await env.SERVER.fetch(input, init);
  const invite = await fetchInvitePreview(code, fromServer);
  if (invite.status !== "valid") {
    return Response.redirect(new URL(shareImage, request.url).href, 302);
  }
  const cache = await caches.open("invite-images");
  const { origin, pathname } = new URL(request.url);
  const key = new Request(`${origin}${pathname}?v=${inviteImageVersion(invite)}`);
  const cached = await cache.match(key);
  if (cached) return cached;
  const png = await drawInviteImage({
    mark: invite.groupMark,
    memberCount: invite.memberCount,
    name: invite.groupName,
  });
  const response = new Response(Uint8Array.from(png), {
    headers: { "Cache-Control": IMAGE_CACHE, "Content-Type": "image/png" },
  });
  locals.cfContext.waitUntil(cache.put(key, response.clone()));
  return response;
};

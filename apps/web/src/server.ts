import handler from "@tanstack/react-start/server-entry";
import { env } from "cloudflare:workers";

import { drawInviteImage } from "./lib/invite-image";
import { fetchInvitePreview } from "./lib/invite-preview";

const INVITE_IMAGE = /^\/invite\/(?<code>[^/]+)\/og\.png$/u;
// An image keeps for an hour: a new member or a new name shows by then, and
// a remade link is a new address.
const IMAGE_CACHE = "public, max-age=3600";

// An invitation's share image, drawn for its group; any link that does
// not open a group gets the site's own image.
const inviteImage = async (
  request: Request,
  code: string,
  ctx: ExecutionContext
): Promise<Response> => {
  const cache = await caches.open("invite-images");
  const cached = await cache.match(request);
  if (cached) {
    return cached;
  }
  const invite = await fetchInvitePreview(
    code,
    async (input, init) => await env.SERVER.fetch(input, init)
  );
  if (invite.status !== "valid") {
    return Response.redirect(new URL("/share.png", request.url).href, 302);
  }
  try {
    const png = await drawInviteImage({
      emoji: invite.groupEmoji,
      memberCount: invite.memberCount,
      name: invite.groupName,
    });
    // A copy on an ArrayBuffer of its own, as a response body wants.
    const response = new Response(Uint8Array.from(png), {
      headers: { "Cache-Control": IMAGE_CACHE, "Content-Type": "image/png" },
    });
    ctx.waitUntil(cache.put(request, response.clone()));
    return response;
  } catch {
    return Response.redirect(new URL("/share.png", request.url).href, 302);
  }
};

export default {
  async fetch(request: Request, _env: Env, ctx: ExecutionContext) {
    const imageCode = INVITE_IMAGE.exec(new URL(request.url).pathname)?.groups
      ?.code;
    if (imageCode !== undefined && request.method === "GET") {
      return await inviteImage(request, imageCode, ctx);
    }
    const response = await handler.fetch(request);
    const headers = new Headers(response.headers);
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("Referrer-Policy", "no-referrer");
    headers.set("X-Frame-Options", "DENY");
    headers.set(
      "Permissions-Policy",
      "camera=(), microphone=(), geolocation=()"
    );
    headers.set("Cache-Control", "no-store");
    const { pathname } = new URL(request.url);
    if (pathname.startsWith("/invite/") || pathname.startsWith("/account/")) {
      headers.set("X-Robots-Tag", "noindex, nofollow");
    }
    return new Response(response.body, {
      headers,
      status: response.status,
      statusText: response.statusText,
    });
  },
} satisfies ExportedHandler<Env>;

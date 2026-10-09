import handler from "@tanstack/react-start/server-entry";
import { env } from "cloudflare:workers";

import { drawInviteImage } from "./lib/invite-image";
import { fetchInvitePreview, inviteImageVersion } from "./lib/invite-preview";

const INVITE_IMAGE = /^\/invite\/(?<code>[^/]+)\/og\.png$/u;
// An image keeps for an hour; one whose group changed has a new address
// on the page by then (inviteImageVersion).
const IMAGE_CACHE = "public, max-age=3600";

// An invitation's share image, drawn for its group; any link that does
// not open a group gets the site's own image.
const inviteImage = async (
  request: Request,
  code: string,
  ctx: ExecutionContext
): Promise<Response> => {
  const invite = await fetchInvitePreview(
    code,
    async (input, init) => await env.SERVER.fetch(input, init)
  );
  if (invite.status !== "valid") {
    return Response.redirect(new URL("/share.png", request.url).href, 302);
  }
  // Kept by what it draws, so a group renamed, given a new mark or joined
  // is drawn again; the request's own query, which changes nothing in the
  // image, must not make it be drawn again.
  const cache = await caches.open("invite-images");
  const { origin, pathname } = new URL(request.url);
  const key = new Request(
    `${origin}${pathname}?v=${inviteImageVersion(invite)}`
  );
  const cached = await cache.match(key);
  if (cached) {
    return cached;
  }
  try {
    const png = await drawInviteImage({
      mark: invite.groupMark,
      memberCount: invite.memberCount,
      name: invite.groupName,
    });
    // A copy on an ArrayBuffer of its own, as a response body wants.
    const response = new Response(Uint8Array.from(png), {
      headers: { "Cache-Control": IMAGE_CACHE, "Content-Type": "image/png" },
    });
    ctx.waitUntil(cache.put(key, response.clone()));
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

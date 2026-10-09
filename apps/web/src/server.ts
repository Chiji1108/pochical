import handler from "@tanstack/react-start/server-entry";
import { env } from "cloudflare:workers";

import { drawInviteImage } from "./lib/invite-image";
import {
  fetchInviteMark,
  fetchInvitePreview,
  inviteImageVersion,
} from "./lib/invite-preview";

const INVITE_IMAGE = /^\/invite\/(?<code>[^/]+)\/og\.png$/u;
const INVITE_MARK = /^\/invite\/(?<code>[^/]+)\/mark\/(?<photoId>[^/]+)$/u;
// Bytes turned into base64 this many at a time, as one call can take only
// so many arguments.
const BASE64_CHUNK = 0x80_00;
// An image keeps for an hour; one whose group changed has a new address
// on the page by then (inviteImageVersion).
const IMAGE_CACHE = "public, max-age=3600";

const fromServer = async (input: RequestInfo | URL, init?: RequestInit) =>
  await env.SERVER.fetch(input, init);

/**
 * A group's photo mark as a data URL for satori; none for another mark, or
 * when it cannot be read, the image drawn without it.
 */
const markPhotoData = async (
  code: string,
  photoId: string
): Promise<string | undefined> => {
  const photo =
    photoId === ""
      ? null
      : await fetchInviteMark(code, photoId, fromServer).catch(() => null);
  if (photo === null) {
    return undefined;
  }
  const bytes = new Uint8Array(await photo.arrayBuffer());
  let binary = "";
  for (let start = 0; start < bytes.length; start += BASE64_CHUNK) {
    binary += String.fromCodePoint(
      ...bytes.subarray(start, start + BASE64_CHUNK)
    );
  }
  return `data:image/jpeg;base64,${btoa(binary)}`;
};

/** A group's photo mark on its invitation's page, for whoever holds it. */
const inviteMark = async (code: string, photoId: string): Promise<Response> => {
  const photo = await fetchInviteMark(code, photoId, fromServer);
  if (photo === null) {
    return new Response("No such photo", { status: 404 });
  }
  return new Response(photo.body, {
    headers: { "Cache-Control": IMAGE_CACHE, "Content-Type": "image/jpeg" },
  });
};

// An invitation's share image, drawn for its group; any link that does
// not open a group gets the site's own image.
const inviteImage = async (
  request: Request,
  code: string,
  ctx: ExecutionContext
): Promise<Response> => {
  const invite = await fetchInvitePreview(code, fromServer);
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
      photo: await markPhotoData(code, invite.groupMark.photoId),
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
    const mark = INVITE_MARK.exec(new URL(request.url).pathname)?.groups;
    if (
      mark?.code !== undefined &&
      mark.photoId !== undefined &&
      request.method === "GET"
    ) {
      return await inviteMark(mark.code, mark.photoId);
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

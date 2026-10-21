import shareImage from "@pochical/prototype/assets/share.png?url";
import type { APIRoute } from "astro";

import { drawInviteImage } from "../../../lib/invite-image";
import {
  fetchInviteMark,
  fetchInvitePreview,
  IMAGE_CACHE,
  inviteImageVersion,
} from "../../../lib/invite-preview";
import { fromServer } from "../../../lib/server";

export const prerender = false;

// Bytes turned into base64 this many at a time, as one call can take only
// so many arguments.
const BASE64_CHUNK = 0x80_00;

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

// An invitation's share image, drawn for its group; any link that does
// not open a group gets the site's own image.
export const GET: APIRoute = async ({ locals, params, request }) => {
  const code = params.code ?? "";
  const siteImage = () =>
    Response.redirect(new URL(shareImage, request.url).href, 302);
  const invite = await fetchInvitePreview(code, fromServer);
  if (invite.status !== "valid") {
    return siteImage();
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
    locals.cfContext.waitUntil(cache.put(key, response.clone()));
    return response;
  } catch {
    return siteImage();
  }
};

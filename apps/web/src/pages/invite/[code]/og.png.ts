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

/**
 * A group's photo mark; none for another mark, or when it cannot be read,
 * the image drawn without it.
 */
const markPhoto = async (
  code: string,
  photoId: string
): Promise<ArrayBuffer | undefined> => {
  const photo =
    photoId === ""
      ? null
      : await fetchInviteMark(code, photoId, fromServer).catch(() => null);
  return photo === null ? undefined : await photo.arrayBuffer();
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
    const png = await drawInviteImage(
      {
        mark: invite.groupMark,
        memberCount: invite.memberCount,
        name: invite.groupName,
      },
      await markPhoto(code, invite.groupMark.photoId)
    );
    const response = new Response(png, {
      headers: { "Cache-Control": IMAGE_CACHE, "Content-Type": "image/png" },
    });
    locals.cfContext.waitUntil(cache.put(key, response.clone()));
    return response;
  } catch {
    return siteImage();
  }
};

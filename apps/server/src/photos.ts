import { chatRules } from "@pochical/design/chat";

import { isId } from "./ids";
import { previewImageKey } from "./link-preview";

// Photos sent in a group's chats (spec/chat.md, Photos), kept in R2 under
// the group and passed through the Worker to its members alone: a member
// uploads one before sending its line, and the members read it back.

/** Where a group's photo is kept in the photos bucket. */
export const photoKey = (groupId: string, photoId: string): string =>
  `groups/${groupId}/photos/${photoId}`;

/** A group's photo by its path: /v1/groups/{groupId}/photos/{photoId}. */
export const PHOTO_PATH =
  /^\/v1\/groups\/(?<groupId>[^/]+)\/photos\/(?<photoId>[^/]+)$/u;

// A JPEG starts with its Start of Image marker and another marker.
const JPEG_START = [0xff, 0xd8, 0xff];

const isJpeg = (bytes: Uint8Array): boolean =>
  JPEG_START.every((byte, at) => bytes[at] === byte);

/**
 * A member's photo stored, once the group has noted it as theirs: a JPEG
 * the app shrank to send, at most chatRules.photoMaxBytes. Sending it again
 * (a retry after a lost answer) stores it again.
 */
export const putPhoto = async (
  request: Request,
  env: Env,
  groupId: string,
  photoId: string,
  userId: string
): Promise<Response> => {
  if (!isId(photoId)) {
    return new Response("Not a photo id", { status: 400 });
  }
  const declared = Number(request.headers.get("Content-Length") ?? 0);
  if (declared > chatRules.photoMaxBytes) {
    return new Response("Photo too large", { status: 413 });
  }
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength > chatRules.photoMaxBytes) {
    return new Response("Photo too large", { status: 413 });
  }
  if (!isJpeg(bytes)) {
    return new Response("Not a JPEG", { status: 415 });
  }
  if (!(await env.GROUPS.getByName(groupId).notePhoto(photoId, userId))) {
    return new Response("Not your photo", { status: 409 });
  }
  await env.PHOTOS.put(photoKey(groupId, photoId), bytes, {
    customMetadata: { userId },
    httpMetadata: { contentType: "image/jpeg" },
  });
  return new Response(null, { status: 204 });
};

/**
 * A group's photo for one of its members, kept by the device: a photo
 * never changes, only goes when its line is taken back.
 */
export const getPhoto = async (
  env: Env,
  groupId: string,
  photoId: string
): Promise<Response> => {
  const photo = await env.PHOTOS.get(photoKey(groupId, photoId));
  if (photo === null) {
    return new Response("No such photo", { status: 404 });
  }
  return new Response(photo.body, {
    headers: {
      "Cache-Control": "private, max-age=31536000, immutable",
      "Content-Type": "image/jpeg",
      ETag: photo.httpEtag,
    },
  });
};

/** A link preview's picture by its path: /v1/previews/{imageId}. */
export const PREVIEW_IMAGE_PATH = /^\/v1\/previews\/(?<imageId>[^/]+)$/u;

/** A link preview's picture, kept by the device as a photo is. */
export const getPreviewImage = async (
  env: Env,
  imageId: string
): Promise<Response> => {
  const image = await env.PHOTOS.get(previewImageKey(imageId));
  if (image === null) {
    return new Response("No such picture", { status: 404 });
  }
  return new Response(image.body, {
    headers: {
      "Cache-Control": "private, max-age=31536000, immutable",
      "Content-Type": image.httpMetadata?.contentType ?? "image/jpeg",
    },
  });
};

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
 * An upload's bytes when they are a photo the app shrank to send: a JPEG
 * of at most chatRules.photoMaxBytes under an id of the app's; else the
 * answer refusing it.
 */
const jpegOf = async (
  request: Request,
  photoId: string
): Promise<Uint8Array | Response> => {
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
  return bytes;
};

/**
 * A member's photo stored, once the group has noted it as theirs. Sending
 * it again (a retry after a lost answer) stores it again.
 */
export const putPhoto = async (
  request: Request,
  env: Env,
  groupId: string,
  photoId: string,
  userId: string
): Promise<Response> => {
  const bytes = await jpegOf(request, photoId);
  if (bytes instanceof Response) {
    return bytes;
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
 * A photo kept by the device: a photo never changes, only goes when its
 * line is taken back.
 */
const servePhoto = async (env: Env, key: string): Promise<Response> => {
  const photo = await env.PHOTOS.get(key);
  if (photo === null) {
    return new Response("No such photo", { status: 404 });
  }
  return new Response(photo.body, {
    headers: {
      "Cache-Control": "private, max-age=31536000, immutable",
      "Content-Type": photo.httpMetadata?.contentType ?? "image/jpeg",
      ETag: photo.httpEtag,
    },
  });
};

/** A group's photo for one of its members. */
export const getPhoto = async (
  env: Env,
  groupId: string,
  photoId: string
): Promise<Response> => await servePhoto(env, photoKey(groupId, photoId));

/**
 * Where a photo in a user's chat with Pochical's people is kept: under the
 * user, theirs and Pochical's people's alike, so the user reads only
 * their own.
 */
export const supportPhotoKey = (userId: string, photoId: string): string =>
  `support/${userId}/photos/${photoId}`;

/** A photo in the user's support chat: /v1/support/photos/{photoId}. */
export const SUPPORT_PHOTO_PATH = /^\/v1\/support\/photos\/(?<photoId>[^/]+)$/u;

/** The user's photo to send to Pochical's people, or one in their chat. */
export const supportPhoto = async (
  request: Request,
  env: Env,
  photoId: string,
  userId: string
): Promise<Response> => {
  switch (request.method) {
    case "PUT": {
      const bytes = await jpegOf(request, photoId);
      if (bytes instanceof Response) {
        return bytes;
      }
      await env.PHOTOS.put(supportPhotoKey(userId, photoId), bytes, {
        httpMetadata: { contentType: "image/jpeg" },
      });
      return new Response(null, { status: 204 });
    }
    case "GET": {
      return await servePhoto(env, supportPhotoKey(userId, photoId));
    }
    default: {
      return new Response("Method not allowed", { status: 405 });
    }
  }
};

/**
 * Where a user's own photo is kept: their usual photo (spec/sync-protocol.md,
 * Profile), read by them alone and copied into each group that shows it.
 */
export const personPhotoKey = (userId: string, photoId: string): string =>
  `people/${userId}/photos/${photoId}`;

/** The user's own photo: /v1/me/photos/{photoId}. */
export const PERSON_PHOTO_PATH = /^\/v1\/me\/photos\/(?<photoId>[^/]+)$/u;

/** The user's upload of their own photo, or a read of one. */
export const personPhoto = async (
  request: Request,
  env: Env,
  photoId: string,
  userId: string
): Promise<Response> => {
  switch (request.method) {
    case "PUT": {
      const bytes = await jpegOf(request, photoId);
      if (bytes instanceof Response) {
        return bytes;
      }
      await env.PHOTOS.put(personPhotoKey(userId, photoId), bytes, {
        httpMetadata: { contentType: "image/jpeg" },
      });
      return new Response(null, { status: 204 });
    }
    case "GET": {
      return await servePhoto(env, personPhotoKey(userId, photoId));
    }
    default: {
      return new Response("Method not allowed", { status: 405 });
    }
  }
};

/** Whether the user has uploaded this photo of their own. */
export const hasPersonPhoto = async (
  env: Env,
  userId: string,
  photoId: string
): Promise<boolean> =>
  isId(photoId) &&
  (await env.PHOTOS.head(personPhotoKey(userId, photoId))) !== null;

/**
 * The user's usual photo copied into a group's photos, for its members to
 * read as they read the rest; once, as a photo never changes.
 */
export const sharePersonPhoto = async (
  env: Env,
  userId: string,
  photoId: string,
  groupId: string
): Promise<void> => {
  const key = photoKey(groupId, photoId);
  if ((await env.PHOTOS.head(key)) !== null) {
    return;
  }
  const photo = await env.PHOTOS.get(personPhotoKey(userId, photoId));
  if (photo === null) {
    return;
  }
  await env.PHOTOS.put(key, photo.body, {
    customMetadata: { userId },
    httpMetadata: { contentType: "image/jpeg" },
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

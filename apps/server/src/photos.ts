import { chatRules } from "@pochical/design/chat";

import { isId } from "./ids";
import { groupOfCode } from "./invite-codes";
import { previewImageKey } from "./link-preview";

// Photos sent in a group's chats (spec/chat.md, Photos), kept in R2 under
// the group and passed through the Worker to its members alone: a member
// uploads one before sending its line, and the members read it back.

/** Where a group's photo is kept in the photos bucket. */
export const photoKey = (groupId: string, photoId: string): string =>
  `groups/${groupId}/photos/${photoId}`;

/**
 * Where a chat photo's small version is kept, beside the photo: shrunk by
 * the sender's phone to chatRules.photoSmallEdge for the chat's lines and
 * quotes, and gone with it.
 */
export const smallKey = (key: string): string => `${key}/small`;

/** A chat photo's keys, the photo's and its small version's, to delete both. */
export const withSmall = (key: string): string[] => [key, smallKey(key)];

// The most keys R2 deletes in one call.
const DELETE_BATCH = 1000;

/** A group's photos deleted, each with its small version, in R2's batches. */
export const deleteGroupPhotos = async (
  env: Env,
  groupId: string,
  photoIds: string[]
): Promise<void> => {
  const keys = photoIds.flatMap((id) => withSmall(photoKey(groupId, id)));
  const batches = Array.from(
    { length: Math.ceil(keys.length / DELETE_BATCH) },
    (_, at) => keys.slice(at * DELETE_BATCH, (at + 1) * DELETE_BATCH)
  );
  await Promise.all(
    batches.map(async (batch) => {
      await env.PHOTOS.delete(batch);
    })
  );
};

/**
 * Whether a request is for a photo's small version (`?size=small`): an
 * upload of it, or a read that falls back on the photo while it has none.
 */
const wantsSmall = (request: Request): boolean =>
  new URL(request.url).searchParams.get("size") === "small";

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
  const key = photoKey(groupId, photoId);
  await env.PHOTOS.put(wantsSmall(request) ? smallKey(key) : key, bytes, {
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

/**
 * A chat photo, or its small version when asked for one and it has one
 * (the photo itself otherwise, as for a face, which is sent small already).
 */
const serveChatPhoto = async (
  request: Request,
  env: Env,
  key: string
): Promise<Response> => {
  if (wantsSmall(request)) {
    const small = await servePhoto(env, smallKey(key));
    if (small.ok) {
      return small;
    }
  }
  return await servePhoto(env, key);
};

/** A group's photo for one of its members. */
export const getPhoto = async (
  request: Request,
  env: Env,
  groupId: string,
  photoId: string
): Promise<Response> =>
  await serveChatPhoto(request, env, photoKey(groupId, photoId));

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
      const key = supportPhotoKey(userId, photoId);
      await env.PHOTOS.put(wantsSmall(request) ? smallKey(key) : key, bytes, {
        httpMetadata: { contentType: "image/jpeg" },
      });
      return new Response(null, { status: 204 });
    }
    case "GET": {
      return await serveChatPhoto(
        request,
        env,
        supportPhotoKey(userId, photoId)
      );
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

/**
 * A face on an invitation's join screen, by its path:
 * /v1/invites/{code}/photos/{photoId}.
 */
export const INVITE_PHOTO_PATH =
  /^\/v1\/invites\/(?<code>[^/]+)\/photos\/(?<photoId>[^/]+)$/u;

/**
 * A member's face for whoever holds a live invitation to their group, as
 * its join screen shows them with their names: only photos the group
 * shows of someone in it now.
 */
export const getInvitePhoto = async (
  env: Env,
  code: string,
  photoId: string
): Promise<Response> => {
  const groupId = isId(photoId) ? await groupOfCode(env.DB, code) : null;
  if (
    groupId === null ||
    !(await env.GROUPS.getByName(groupId).showsPhoto(photoId))
  ) {
    return new Response("No such photo", { status: 404 });
  }
  return await servePhoto(env, photoKey(groupId, photoId));
};

/**
 * A group's photo mark, by its path: /v1/invites/{code}/mark/{photoId}.
 */
export const INVITE_MARK_PATH =
  /^\/v1\/invites\/(?<code>[^/]+)\/mark\/(?<photoId>[^/]+)$/u;

/**
 * A group's photo mark for anyone holding a live invitation to it, as the
 * invitation's page and share image show it with the group's name
 * (spec/sync-protocol.md, Groups): only the group's mark now.
 */
export const getInviteMark = async (
  env: Env,
  code: string,
  photoId: string
): Promise<Response> => {
  const groupId = isId(photoId) ? await groupOfCode(env.DB, code) : null;
  const profile =
    groupId === null ? null : await env.GROUPS.getByName(groupId).getProfile();
  if (groupId === null || profile?.mark.photoId !== photoId) {
    return new Response("No such photo", { status: 404 });
  }
  return await servePhoto(env, photoKey(groupId, photoId));
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

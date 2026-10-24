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

/**
 * Stores only where nothing is stored yet: R2 answers null instead when
 * the key holds an object, so a photo, once stored, never changes.
 */
export const CREATE_ONLY = { etagDoesNotMatch: "*" } as const;

/** A chat photo's keys, the photo's and its small version's, to delete both. */
export const withSmall = (key: string): string[] => [key, smallKey(key)];

// The most keys R2 deletes in one call.
const DELETE_BATCH = 1000;

/** `items` in R2's batches of keys to delete at once. */
export const deleteBatchesOf = <T>(items: T[]): T[][] =>
  Array.from({ length: Math.ceil(items.length / DELETE_BATCH) }, (_, at) =>
    items.slice(at * DELETE_BATCH, (at + 1) * DELETE_BATCH)
  );

/**
 * A group's photos deleted, each with its small version, in R2's batches:
 * failing only once every batch has settled, so no delete is still on its
 * way when its caller moves on.
 */
export const deleteGroupPhotos = async (
  env: Env,
  groupId: string,
  photoIds: string[]
): Promise<void> => {
  const keys = photoIds.flatMap((id) => withSmall(photoKey(groupId, id)));
  const batches = await Promise.allSettled(
    deleteBatchesOf(keys).map(async (batch) => {
      await env.PHOTOS.delete(batch);
    })
  );
  const failed = batches.find((batch) => batch.status === "rejected");
  if (failed !== undefined) {
    throw failed.reason;
  }
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
 * A member's photo stored by the group, once it has noted it as theirs
 * (GroupDO.storePhoto). Sending their own again (a retry after a lost
 * answer, or the upload each send of its line makes, sent already or not)
 * stores nothing: the bytes first stored stay.
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
  const note = await env.GROUPS.getByName(groupId).storePhoto(
    photoId,
    userId,
    bytes,
    { contentType: "image/jpeg", small: wantsSmall(request) }
  );
  if (note === "refused") {
    return new Response("Not a photo of yours to upload", { status: 409 });
  }
  if (note === "going") {
    // A moment's wait: once storage has deleted it, the id is free again.
    return new Response("Being deleted, try again", {
      headers: { "Retry-After": "1" },
      status: 503,
    });
  }
  return new Response(null, { status: 204 });
};

/**
 * A photo kept by the device: a photo never changes, only goes when its
 * line is taken back.
 */
const photoResponse = (photo: R2ObjectBody | null): Response => {
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

/** The photo under `key`, as photoResponse answers with it. */
const servePhoto = async (env: Env, key: string): Promise<Response> =>
  photoResponse(await env.PHOTOS.get(key));

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
 * The photos bucket's listing, page by page.
 * @yields {R2Objects} Each page, the next asked for by its cursor.
 */
export async function* bucketPages(
  bucket: R2Bucket,
  options: { prefix?: string; delimiter?: string }
): AsyncGenerator<R2Objects> {
  let cursor: string | undefined;
  do {
    // oxlint-disable-next-line no-await-in-loop -- each page names the next
    const page = await bucket.list({ ...options, cursor });
    yield page;
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor !== undefined);
}

/** Every object under `prefix` in the photos bucket deleted, page by page. */
export const deletePhotosUnder = async (
  env: Env,
  prefix: string
): Promise<void> => {
  for await (const page of bucketPages(env.PHOTOS, { prefix })) {
    if (page.objects.length > 0) {
      await env.PHOTOS.delete(page.objects.map(({ key }) => key));
    }
  }
};

/**
 * A photo in the user's chat with Pochical's people: /v1/support/photos/{photoId},
 * kept with that place's photos (its Group DO, supportPlace) as a group's
 * are, the user's uploads noted by it, read by the user alone.
 */
export const SUPPORT_PHOTO_PATH = /^\/v1\/support\/photos\/(?<photoId>[^/]+)$/u;

/**
 * Where a user's usual photo is kept (spec/sync-protocol.md, Profile),
 * read by them alone and copied into each group that shows it: copied
 * here from their upload as SetProfile names it (UserDO.setProfile).
 */
export const personPhotoKey = (userId: string, photoId: string): string =>
  `people/${userId}/photos/${photoId}`;

/**
 * The bucket's staging prefix: what is uploaded here is kept only until
 * the bucket's lifecycle rule deletes it a day after (spec/admin.md), so
 * nothing uploaded and never taken stays.
 */
export const UPLOADS = "uploads/";

/**
 * Where a user's upload of their own photo is kept until it is taken: as
 * their usual photo (copied to personPhotoKey) or a group's mark (copied
 * into the group's photos).
 */
export const uploadedPhotoKey = (userId: string, photoId: string): string =>
  `${UPLOADS}people/${userId}/${photoId}`;

/** The user's own photo: /v1/me/photos/{photoId}. */
export const PERSON_PHOTO_PATH = /^\/v1\/me\/photos\/(?<photoId>[^/]+)$/u;

/** One of the user's own photos: their usual one, else their upload of it. */
export const personPhotoOf = async (
  env: Env,
  userId: string,
  photoId: string
): Promise<R2ObjectBody | null> =>
  (await env.PHOTOS.get(personPhotoKey(userId, photoId))) ??
  (await env.PHOTOS.get(uploadedPhotoKey(userId, photoId)));

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
      await env.PHOTOS.put(uploadedPhotoKey(userId, photoId), bytes, {
        httpMetadata: { contentType: "image/jpeg" },
      });
      return new Response(null, { status: 204 });
    }
    case "GET": {
      return photoResponse(await personPhotoOf(env, userId, photoId));
    }
    default: {
      return new Response("Method not allowed", { status: 405 });
    }
  }
};

/** Whether the user has this photo of their own, as their usual one or uploaded. */
export const hasPersonPhoto = async (
  env: Env,
  userId: string,
  photoId: string
): Promise<boolean> => {
  if (!isId(photoId)) {
    return false;
  }
  const found = await Promise.all(
    [personPhotoKey, uploadedPhotoKey].map(
      async (key) => await env.PHOTOS.head(key(userId, photoId))
    )
  );
  return found.some((object) => object !== null);
};

/**
 * The user's own photo copied into a group's photos where the group has
 * none under its id: whether the group has it now, false when the user
 * has no photo of that id (gone since it was looked for, as their usual
 * photo replaced, or an upload past its day).
 */
export const copyPersonPhoto = async (
  env: Env,
  userId: string,
  photoId: string,
  groupId: string
): Promise<boolean> => {
  const key = photoKey(groupId, photoId);
  if ((await env.PHOTOS.head(key)) !== null) {
    return true;
  }
  const photo = await personPhotoOf(env, userId, photoId);
  if (photo === null) {
    return false;
  }
  await env.PHOTOS.put(key, photo.body, {
    customMetadata: { userId },
    httpMetadata: { contentType: "image/jpeg" },
    onlyIf: CREATE_ONLY,
  });
  return true;
};

/**
 * The user's own photo (their usual one, or a group mark they picked)
 * copied into a group's photos, for its members to read as they read the
 * rest (GroupDO.sharePhoto).
 */
export const sharePersonPhoto = async (
  env: Env,
  userId: string,
  photoId: string,
  groupId: string
): Promise<boolean> =>
  await env.GROUPS.getByName(groupId).sharePhoto(photoId, userId);

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

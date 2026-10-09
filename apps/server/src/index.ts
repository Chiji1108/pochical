import { createConnectRouter } from "@connectrpc/connect";
import { createFetchHandler } from "@connectrpc/connect/protocol";

import { registerChatService } from "./chat-service";
import { registerGroupService } from "./group-service";
import { registerInviteService } from "./invite-service";
import {
  getPhoto,
  getInviteMark,
  getInvitePhoto,
  getPreviewImage,
  INVITE_MARK_PATH,
  INVITE_PHOTO_PATH,
  PHOTO_PATH,
  PREVIEW_IMAGE_PATH,
  PERSON_PHOTO_PATH,
  personPhoto,
  putPhoto,
  SUPPORT_PHOTO_PATH,
  supportPhoto,
} from "./photos";
import { tooManySignIns } from "./rate-limits";
import { getAuth, sessionUser } from "./session";
import type { SessionUser } from "./session";
import { slackEvents } from "./slack-events";
import { registerSupportService } from "./support-service";
import { SESSION_HEADER, USER_HEADER } from "./sync-socket";
import { registerSystemService } from "./system-service";
import { registerUserService } from "./user-service";

// Workers only binds Durable Object classes and named entrypoints exported
// from the entry module.
export { AdminEntrypoint } from "./admin-entrypoint";
export { GroupDO } from "./group-do";
export { UserDO } from "./user-do";

const router = createConnectRouter({ grpc: false, grpcWeb: false });
registerSystemService(router);
registerInviteService(router);
registerGroupService(router);
registerUserService(router);
registerChatService(router);
registerSupportService(router);

const rpcHandlers = new Map(
  router.handlers.map((handler) => [
    handler.requestPath,
    createFetchHandler(handler),
  ])
);

const AUTH_PATH = "/api/auth/";
const ANONYMOUS_SIGN_IN = "/api/auth/sign-in/anonymous";
const USER_SOCKET_PATH = "/v1/me/socket";
const SLACK_EVENTS_PATH = "/slack/events";
const GROUP_SOCKET_PATH = /^\/v1\/groups\/(?<groupId>[^/]+)\/socket$/u;

// The socket request as a Durable Object receives it: naming the user the
// session belongs to and the session, whatever the client sent under
// those headers.
const forUser = (request: Request, user: SessionUser): Request => {
  const headers = new Headers(request.headers);
  headers.set(USER_HEADER, user.id);
  headers.set(SESSION_HEADER, user.sessionId);
  return new Request(request, { headers });
};

const signInFirst = (): Response =>
  new Response("Sign in first", { status: 401 });

/** A member's upload of one of the group's photos, or a read of one. */
const photoRequest = async (
  request: Request,
  env: Env,
  groupId: string,
  photoId: string
): Promise<Response> => {
  const user = await sessionUser(request.headers);
  if (!user) {
    return signInFirst();
  }
  if (!(await env.USERS.getByName(user.id).isMember(groupId))) {
    return new Response("Not a member of this group", { status: 403 });
  }
  switch (request.method) {
    case "PUT": {
      return await putPhoto(request, env, groupId, photoId, user.id);
    }
    case "GET": {
      return await getPhoto(env, groupId, photoId);
    }
    default: {
      return new Response("Method not allowed", { status: 405 });
    }
  }
};

/**
 * A picture anyone signed in may read by holding its link: a preview's, or
 * a face on a join screen; else none.
 */
const sharedPictureRequest = async (
  request: Request,
  env: Env,
  pathname: string
): Promise<Response | undefined> => {
  // A link preview's picture: its id comes only with a preview.
  const previewImage = PREVIEW_IMAGE_PATH.exec(pathname)?.groups?.imageId;
  // Faces on a join screen, for whoever holds a live invitation.
  const invitePhoto = INVITE_PHOTO_PATH.exec(pathname)?.groups;
  if (previewImage === undefined && invitePhoto === undefined) {
    return undefined;
  }
  if (!(await sessionUser(request.headers))) {
    return signInFirst();
  }
  if (previewImage !== undefined) {
    return await getPreviewImage(env, previewImage);
  }
  return invitePhoto?.code !== undefined && invitePhoto.photoId !== undefined
    ? await getInvitePhoto(env, invitePhoto.code, invitePhoto.photoId)
    : undefined;
};

/**
 * One of the user's own photos: in their chat with Pochical's people, or
 * their usual one, for them alone; else none.
 */
const ownPictureRequest = async (
  request: Request,
  env: Env,
  pathname: string
): Promise<Response | undefined> => {
  const supportPhotoId = SUPPORT_PHOTO_PATH.exec(pathname)?.groups?.photoId;
  const personPhotoId = PERSON_PHOTO_PATH.exec(pathname)?.groups?.photoId;
  if (supportPhotoId === undefined && personPhotoId === undefined) {
    return undefined;
  }
  const user = await sessionUser(request.headers);
  if (!user) {
    return signInFirst();
  }
  return supportPhotoId === undefined
    ? await personPhoto(request, env, personPhotoId ?? "", user.id)
    : await supportPhoto(request, env, supportPhotoId, user.id);
};

/** A picture by its path: a preview's, a face, or a photo in a chat; else none. */
const pictureRequest = async (
  request: Request,
  env: Env,
  pathname: string
): Promise<Response | undefined> => {
  // A group's photo mark, shown with its name to anyone holding its link.
  const mark = INVITE_MARK_PATH.exec(pathname)?.groups;
  if (mark?.code !== undefined && mark.photoId !== undefined) {
    return await getInviteMark(env, mark.code, mark.photoId);
  }
  const shared = await sharedPictureRequest(request, env, pathname);
  if (shared) {
    return shared;
  }
  const own = await ownPictureRequest(request, env, pathname);
  if (own) {
    return own;
  }
  // A group's photos, as its socket: its members alone, by their own DO.
  const photo = PHOTO_PATH.exec(pathname)?.groups;
  if (photo?.groupId !== undefined && photo.photoId !== undefined) {
    return await photoRequest(request, env, photo.groupId, photo.photoId);
  }
  return undefined;
};

/** better-auth's own paths, anonymous sign-ins held back by address. */
const authRequest = async (
  request: Request,
  env: Env,
  pathname: string
): Promise<Response> => {
  if (
    pathname === ANONYMOUS_SIGN_IN &&
    (await tooManySignIns(env.SIGN_IN_LIMIT, request))
  ) {
    return Response.json(
      { code: "TOO_MANY_REQUESTS", message: "Try again in a minute" },
      { status: 429 }
    );
  }
  return await getAuth().handler(request);
};

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);

    if (pathname.startsWith(AUTH_PATH)) {
      return await authRequest(request, env, pathname);
    }

    // Replies from Pochical's people's Slack, signed by Slack.
    if (pathname === SLACK_EVENTS_PATH && request.method === "POST") {
      return await slackEvents(request, env);
    }

    const rpc = rpcHandlers.get(pathname);
    if (rpc) {
      return await rpc(request);
    }

    if (pathname === USER_SOCKET_PATH) {
      const user = await sessionUser(request.headers);
      if (!user) {
        return signInFirst();
      }
      return await env.USERS.getByName(user.id).fetch(forUser(request, user));
    }

    // Only members reach a group, and the check asks the user's own DO, so
    // an id that is not theirs never wakes (or creates) a Group DO.
    const groupId = GROUP_SOCKET_PATH.exec(pathname)?.groups?.groupId;
    if (groupId !== undefined) {
      const user = await sessionUser(request.headers);
      if (!user) {
        return signInFirst();
      }
      if (!(await env.USERS.getByName(user.id).isMember(groupId))) {
        return new Response("Not a member of this group", { status: 403 });
      }
      return await env.GROUPS.getByName(groupId).fetch(forUser(request, user));
    }

    return (
      (await pictureRequest(request, env, pathname)) ??
      new Response("Not found", { status: 404 })
    );
  },
} satisfies ExportedHandler<Env>;

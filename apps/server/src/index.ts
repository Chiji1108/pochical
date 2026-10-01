import { createConnectRouter } from "@connectrpc/connect";
import { createFetchHandler } from "@connectrpc/connect/protocol";

import { registerGroupService } from "./group-service";
import { registerInviteService } from "./invite-service";
import { getAuth, sessionUser } from "./session";
import { USER_HEADER } from "./sync-socket";
import { registerSystemService } from "./system-service";
import { registerUserService } from "./user-service";

// Workers only binds Durable Object classes exported from the entry module.
export { GroupDO } from "./group-do";
export { UserDO } from "./user-do";

const router = createConnectRouter({ grpc: false, grpcWeb: false });
registerSystemService(router);
registerInviteService(router);
registerGroupService(router);
registerUserService(router);

const rpcHandlers = new Map(
  router.handlers.map((handler) => [
    handler.requestPath,
    createFetchHandler(handler),
  ])
);

const AUTH_PATH = "/api/auth/";
const USER_SOCKET_PATH = "/v1/me/socket";
const GROUP_SOCKET_PATH = /^\/v1\/groups\/(?<groupId>[^/]+)\/socket$/u;

// The socket request as a Durable Object receives it: naming the user the
// session belongs to, whatever the client sent under that header.
const forUser = (request: Request, userId: string): Request => {
  const headers = new Headers(request.headers);
  headers.set(USER_HEADER, userId);
  return new Request(request, { headers });
};

const signInFirst = (): Response =>
  new Response("Sign in first", { status: 401 });

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);

    if (pathname.startsWith(AUTH_PATH)) {
      return await getAuth().handler(request);
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
      return await env.USERS.getByName(user.id).fetch(
        forUser(request, user.id)
      );
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
      return await env.GROUPS.getByName(groupId).fetch(
        forUser(request, user.id)
      );
    }

    return new Response("Not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;

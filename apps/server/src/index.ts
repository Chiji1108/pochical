import { createConnectRouter } from "@connectrpc/connect";
import { createFetchHandler } from "@connectrpc/connect/protocol";

import { registerSystemService } from "./system-service";

// Workers only binds Durable Object classes exported from the entry module.
export { GroupRoom } from "./group-room";

const router = createConnectRouter({ grpc: false, grpcWeb: false });
registerSystemService(router);

const rpcHandlers = new Map(
  router.handlers.map((handler) => [
    handler.requestPath,
    createFetchHandler(handler),
  ])
);

const GROUP_SOCKET_PATH = /^\/v1\/groups\/(?<groupId>[^/]+)\/socket$/u;

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);

    const rpc = rpcHandlers.get(pathname);
    if (rpc) {
      return await rpc(request);
    }

    // Not yet authenticated: anyone can join any group (spec/sync-protocol.md).
    const groupId = GROUP_SOCKET_PATH.exec(pathname)?.groups?.groupId;
    if (groupId !== undefined) {
      return await env.GROUP_ROOM.getByName(groupId).fetch(request);
    }

    return new Response("Not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;

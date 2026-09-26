import { createConnectRouter } from "@connectrpc/connect";
import { createFetchHandler } from "@connectrpc/connect/protocol";
import { registerSystemService } from "./system-service";

// Workers only binds Durable Object classes exported from the entry module.
// biome-ignore lint/performance/noBarrelFile: required by the Workers runtime
export { GroupRoom } from "./group-room";

const router = createConnectRouter({ grpc: false, grpcWeb: false });
registerSystemService(router);

const rpcHandlers = new Map(
  router.handlers.map((handler) => [
    handler.requestPath,
    createFetchHandler(handler),
  ])
);

const GROUP_SOCKET_PATH = /^\/v1\/groups\/([^/]+)\/socket$/;

export default {
  fetch(request, env) {
    const { pathname } = new URL(request.url);

    const rpc = rpcHandlers.get(pathname);
    if (rpc) {
      return rpc(request);
    }

    // TODO: authenticate the user and check group membership before forwarding.
    const groupId = GROUP_SOCKET_PATH.exec(pathname)?.[1];
    if (groupId) {
      return env.GROUP_ROOM.getByName(groupId).fetch(request);
    }

    return new Response("Not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;

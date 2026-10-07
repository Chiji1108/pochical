import { create } from "@bufbuild/protobuf";
import { Code, ConnectError } from "@connectrpc/connect";
import type { ConnectRouter } from "@connectrpc/connect";
import { env } from "cloudflare:workers";

import {
  GetMeResponseSchema,
  RegisterPushTokenResponseSchema,
  SetBlockedResponseSchema,
  UserService,
} from "./gen/pochical/v1/user_pb";
import { isId } from "./ids";
import { requireUser } from "./session";

/** An APNs device token, as hex. */
const PUSH_TOKEN = /^[0-9a-f]{32,200}$/u;

export const registerUserService = (router: ConnectRouter): void => {
  router.service(UserService, {
    getMe: async (_request, context) => {
      const { id, anonymous } = await requireUser(context);
      return create(GetMeResponseSchema, { anonymous, userId: id });
    },
    registerPushToken: async ({ token, sandbox }, context) => {
      const user = await requireUser(context);
      if (!PUSH_TOKEN.test(token)) {
        throw new ConnectError("Not a push token", Code.InvalidArgument);
      }
      await env.USERS.getByName(user.id).registerPushToken(token, sandbox);
      return create(RegisterPushTokenResponseSchema, {});
    },
    setBlocked: async ({ userId, blocked }, context) => {
      const user = await requireUser(context);
      if (!isId(userId) || userId === user.id) {
        throw new ConnectError("Not someone to block", Code.InvalidArgument);
      }
      await env.USERS.getByName(user.id).setBlocked(userId, blocked);
      return create(SetBlockedResponseSchema, {});
    },
  });
};

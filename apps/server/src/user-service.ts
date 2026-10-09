import { create } from "@bufbuild/protobuf";
import { Code, ConnectError } from "@connectrpc/connect";
import type { ConnectRouter } from "@connectrpc/connect";
import { env } from "cloudflare:workers";

import { deleteAccount } from "./account-deletion";
import { peekAccount, takeAccount } from "./account-switch";
import {
  DeleteAccountResponseSchema,
  GetMeResponseSchema,
  PeekAccountResponseSchema,
  TakeAccountResponseSchema,
  RegisterPushTokenResponseSchema,
  SetBlockedResponseSchema,
  SetChatMutedResponseSchema,
  SetChatNotificationsResponseSchema,
  UserService,
} from "./gen/pochical/v1/user_pb";
import { GROUP_THREAD, otherIn } from "./group-chat";
import { isId } from "./ids";
import { requireUser } from "./session";

/** An APNs device token, as hex. */
const PUSH_TOKEN = /^[0-9a-f]{32,200}$/u;

export const registerUserService = (router: ConnectRouter): void => {
  router.service(UserService, {
    deleteAccount: async ({ appleAuthorizationCode }, context) => {
      const { id } = await requireUser(context);
      await deleteAccount(env, id, appleAuthorizationCode);
      return create(DeleteAccountResponseSchema, {});
    },
    getMe: async (_request, context) => {
      const { id, anonymous } = await requireUser(context);
      return create(GetMeResponseSchema, { anonymous, userId: id });
    },
    peekAccount: async ({ appleIdToken, nonce }, context) => {
      const { id } = await requireUser(context);
      return create(
        PeekAccountResponseSchema,
        await peekAccount(env, id, appleIdToken, nonce)
      );
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
    setChatMuted: async ({ groupId, threadId, muted }, context) => {
      const user = await requireUser(context);
      const theirs =
        threadId === GROUP_THREAD || otherIn(threadId, user.id) !== undefined;
      const kept =
        theirs &&
        (await env.USERS.getByName(user.id).setChatMuted(
          groupId,
          threadId,
          muted
        ));
      if (!kept) {
        throw new ConnectError("No such chat of yours", Code.NotFound);
      }
      return create(SetChatMutedResponseSchema, {});
    },
    setChatNotifications: async ({ mentionsWhenMuted }, context) => {
      const user = await requireUser(context);
      await env.USERS.getByName(user.id).setChatNotifications(
        mentionsWhenMuted
      );
      return create(SetChatNotificationsResponseSchema, {});
    },
    takeAccount: async ({ appleIdToken, nonce }, context) => {
      const { id } = await requireUser(context);
      await takeAccount(env, id, appleIdToken, nonce);
      return create(TakeAccountResponseSchema, {});
    },
  });
};

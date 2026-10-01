import { create } from "@bufbuild/protobuf";
import { Code, ConnectError } from "@connectrpc/connect";
import type { ConnectRouter, HandlerContext } from "@connectrpc/connect";

import { GetMeResponseSchema, UserService } from "./gen/pochical/v1/user_pb";
import { sessionUser } from "./session";
import type { SessionUser } from "./session";

/** The caller's user, or UNAUTHENTICATED for a missing or stale token. */
export const requireUser = async (
  context: HandlerContext
): Promise<SessionUser> => {
  const user = await sessionUser(context.requestHeader);
  if (!user) {
    throw new ConnectError("Sign in first", Code.Unauthenticated);
  }
  return user;
};

export const registerUserService = (router: ConnectRouter): void => {
  router.service(UserService, {
    getMe: async (_request, context) => {
      const { id, anonymous } = await requireUser(context);
      return create(GetMeResponseSchema, { anonymous, userId: id });
    },
  });
};

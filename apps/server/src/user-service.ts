import { create } from "@bufbuild/protobuf";
import type { ConnectRouter } from "@connectrpc/connect";

import { GetMeResponseSchema, UserService } from "./gen/pochical/v1/user_pb";
import { requireUser } from "./session";

export const registerUserService = (router: ConnectRouter): void => {
  router.service(UserService, {
    getMe: async (_request, context) => {
      const { id, anonymous } = await requireUser(context);
      return create(GetMeResponseSchema, { anonymous, userId: id });
    },
  });
};

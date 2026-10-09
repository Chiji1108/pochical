import { create } from "@bufbuild/protobuf";
import type { ConnectRouter } from "@connectrpc/connect";
import { env } from "cloudflare:workers";

import {
  GetInvitePreviewResponseSchema,
  InviteService,
} from "./gen/pochical/v1/invite_pb";
import { noGroupOfCode, requireGroupOfCode } from "./invite-codes";

export const registerInviteService = (router: ConnectRouter): void => {
  router.service(InviteService, {
    getInvitePreview: async ({ inviteCode }) => {
      const groupId = await requireGroupOfCode(env.DB, inviteCode);
      const group = env.GROUPS.getByName(groupId);
      const profile = await group.getProfile();
      if (profile === null) {
        throw noGroupOfCode();
      }
      return create(GetInvitePreviewResponseSchema, {
        groupMark: profile.mark,
        groupName: profile.name,
        memberCount: await group.memberCount(),
      });
    },
  });
};

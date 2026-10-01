import { create } from "@bufbuild/protobuf";
import { Code, ConnectError } from "@connectrpc/connect";
import type { ConnectRouter } from "@connectrpc/connect";
import { env } from "cloudflare:workers";

import {
  GetInvitePreviewResponseSchema,
  InviteService,
} from "./gen/pochical/v1/invite_pb";
import { groupOfCode, INVITE_CODE } from "./invite-codes";

export const registerInviteService = (router: ConnectRouter): void => {
  router.service(InviteService, {
    getInvitePreview: async ({ inviteCode }) => {
      if (!INVITE_CODE.test(inviteCode)) {
        throw new ConnectError("Malformed invite code", Code.InvalidArgument);
      }
      const groupId = await groupOfCode(env.DB, inviteCode);
      const group = groupId === null ? null : env.GROUPS.getByName(groupId);
      const profile = group === null ? null : await group.getProfile();
      if (group === null || profile === null) {
        throw new ConnectError("No group uses this invite code", Code.NotFound);
      }
      return create(GetInvitePreviewResponseSchema, {
        groupEmoji: profile.emoji ?? "",
        groupName: profile.name,
        memberCount: await group.memberCount(),
      });
    },
  });
};
